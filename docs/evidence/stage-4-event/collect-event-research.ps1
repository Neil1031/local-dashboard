# Research only. Windows access is read-only. Writes ONLY sanitized evidence files.
# No subscription, application startup, SQLite access, task execution or log configuration.
param([string]$OutputDirectory = 'docs/evidence/stage-4-event')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Import-Module ScheduledTasks

function Hash-Text([string]$Text) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)))).Replace('-','').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
function Save-Json($Value, [string]$Name) {
    $Value | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath (Join-Path $OutputDirectory $Name) -Encoding UTF8
}
function Error-Receipt($Failure) {
    # Never persist Message/InvocationInfo: these may contain paths or account names.
    [ordered]@{ type=$Failure.Exception.GetType().FullName; id=$Failure.FullyQualifiedErrorId; hresult=$Failure.Exception.HResult }
}
$script:tokens = @{}
function Token([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return '' }
    if (-not $script:tokens.ContainsKey($Value)) { $script:tokens[$Value] = 'REDACTED-' + ($script:tokens.Count + 1) }
    $script:tokens[$Value]
}
function Event-Sample($Event) {
    [xml]$x = $Event.ToXml()
    # Whitelist System values; preserve schema and equality only for correlation IDs.
    foreach ($node in $x.SelectNodes('/*/*[local-name()="System"]/*')) {
        if ($node.LocalName -eq 'Computer') { $node.InnerText = 'REDACTED-HOST' }
        if ($node.LocalName -in @('Security','Execution','Correlation')) {
            foreach ($a in $node.Attributes) { $a.Value = Token $a.Value }
        }
    }
    $fields = @()
    foreach ($node in $x.SelectNodes('/*/*[local-name()="EventData" or local-name()="UserData"]//*[not(*)]')) {
        $name = if ($node.HasAttribute('Name')) { $node.GetAttribute('Name') } else { $node.LocalName }
        $fields += [ordered]@{ name=$name; fieldPresent=$true; nonempty=(-not [string]::IsNullOrEmpty($node.InnerText)) }
        # Do not publish ANY live payload value, including binary or free text.
        $node.InnerText = Token $node.InnerText
        foreach ($a in $node.Attributes) { if ($a.Name -ne 'Name' -and $a.Name -notlike 'xmlns*') { $a.Value = Token $a.Value } }
    }
    [ordered]@{
        provider=$Event.ProviderName; id=$Event.Id; version=$Event.Version; level=$Event.Level
        utc=$Event.TimeCreated.ToUniversalTime().ToString('o'); recordId=$Event.RecordId
        activityIdPresent=($null -ne $Event.ActivityId); relatedActivityIdPresent=($null -ne $Event.RelatedActivityId)
        fields=$fields; sanitizedXml=$x.OuterXml
    }
}
function Query-Receipt([string]$Log, [string]$XPath='*', [int]$Limit=501, [bool]$Oldest=$false) {
    $begin = [DateTimeOffset]::UtcNow.ToString('o')
    try {
        $events = @(Get-WinEvent -LogName $Log -FilterXPath $XPath -MaxEvents $Limit -Oldest:$Oldest -ErrorAction Stop)
        [ordered]@{
            startedAt=$begin; finishedAt=[DateTimeOffset]::UtcNow.ToString('o'); log=$Log; xpath=$XPath
            queryStatus='OK'; returnedCount=$events.Count; limit=$Limit; limitReached=($events.Count -eq $Limit)
            firstReturnedUtc=$events[0].TimeCreated.ToUniversalTime().ToString('o')
            lastReturnedUtc=$events[-1].TimeCreated.ToUniversalTime().ToString('o')
            samples=@($events | Select-Object -First 3 | ForEach-Object { Event-Sample $_ })
            idCounts=@($events | Group-Object ProviderName,Id | ForEach-Object { [ordered]@{key=$_.Name;count=$_.Count} })
        }
    } catch {
        $status = if ($_.FullyQualifiedErrorId -like 'NoMatchingEventsFound*') { 'NO_MATCHING_EVENTS' } else { 'QUERY_FAILED' }
        [ordered]@{ startedAt=$begin; finishedAt=[DateTimeOffset]::UtcNow.ToString('o'); log=$Log; xpath=$XPath
            queryStatus=$status; returnedCount=0; limit=$Limit; limitReached=$false; samples=@(); error=(Error-Receipt $_) }
    }
}
function Log-State([string]$Name) {
    try {
        $v = Get-WinEvent -ListLog $Name -ErrorAction Stop
        $gl = (& wevtutil gl $Name /f:xml 2>$null) -join "`n"
        $glExit = $LASTEXITCODE
        [xml]$cx = $gl
        $acl = [string]$v.SecurityDescriptor
        [ordered]@{
            name=$Name; exists=$true; enabled=$v.IsEnabled; logMode=$v.LogMode.ToString()
            maximumSizeBytes=$v.MaximumSizeInBytes; currentFileSizeBytes=$v.FileSize; recordCount=$v.RecordCount
            oldestRecordNumber=$v.OldestRecordNumber; isLogFull=$v.IsLogFull
            retention=($cx.SelectSingleNode('//*[local-name()="retention"]').InnerText)
            autoBackup=($cx.SelectSingleNode('//*[local-name()="autoBackup"]').InnerText)
            wevtutilGlExit=$glExit; configurationSha256=Hash-Text $gl
            acl=[ordered]@{ rawOmitted=$true; interactiveUsersReadAcePresent=($acl -match '\(A;;0x3;;;IU\)'); eventLogReadersReadAcePresent=($acl -match '\(A;;0x1;;;S-1-5-32-573\)') }
        }
    } catch { [ordered]@{name=$Name; exists=$null; error=(Error-Receipt $_)} }
}

if (-not (Test-Path -LiteralPath $OutputDirectory -PathType Container)) { throw 'Create/review the evidence output directory first.' }
if (Test-Path 'config/application.yml') { throw 'Review local selection override before running this bounded helper.' }
$config = Get-Content 'config/application.example.yml' -Raw
$keys = @([regex]::Matches($config,"(?m)^\s+- '([^']+)'\s*$") | ForEach-Object {$_.Groups[1].Value})
if ($keys.Count -ne 5 -or $config -notmatch 'exclude:\s*\[\]') { throw 'Review changed example selectors first.' }
$begin = [DateTimeOffset]::UtcNow.ToString('o')
$channel = 'Microsoft-Windows-TaskScheduler/Operational'
$before = Log-State $channel
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$newest = Query-Receipt $channel '*' 1
$oldest = Query-Receipt $channel '*' 1 $true
$tasks = @()
foreach ($key in $keys) {
    # Reviewed example keys have no XPath quotes. Refuse unexpected input.
    if ($key -match "['\""<>]") { throw 'Selector requires separate XPath review.' }
    $cut = $key.LastIndexOf('\'); $path=$key.Substring(0,$cut+1); $name=$key.Substring($cut+1)
    $task = Get-ScheduledTask -TaskPath $path -TaskName $name
    $xmlBefore = Export-ScheduledTask -TaskPath $path -TaskName $name
    $info = $task | Get-ScheduledTaskInfo
    $q = Query-Receipt $channel "*[EventData[Data[@Name='TaskName']='$key' or Data[@Name='TaskPath']='$key']]"
    $tasks += [ordered]@{
        taskKey=$key; enabled=[bool]$task.Settings.Enabled; state=$task.State.ToString()
        startWhenAvailable=[bool]$task.Settings.StartWhenAvailable; multipleInstances=$task.Settings.MultipleInstances.ToString()
        logonType=$task.Principal.LogonType.ToString(); lastRunUtc=([DateTimeOffset]$info.LastRunTime).ToUniversalTime().ToString('o')
        lastTaskResult=[long]$info.LastTaskResult; definitionSha256Before=Hash-Text $xmlBefore
        definitionSha256After=Hash-Text (Export-ScheduledTask -TaskPath $path -TaskName $name)
        query=$q; lifecycleVerified=$false; nominalOccurrenceAttribution='NOT_VERIFIED'
    }
}
$provider = Get-WinEvent -ListProvider Microsoft-Windows-TaskScheduler
$metadata = @($provider.Events | ForEach-Object {
    $event = $_; $template = if ($event.Template) { [xml]$event.Template } else { $null }
    [ordered]@{
        provider=$provider.Name; id=$event.Id; version=$event.Version; channel=$event.LogLink.LogName
        level=$event.Level.Value; levelName=$event.Level.Name; opcode=$event.Opcode.Value
        taskSymbol=$event.Task.Name; taskDisplayName=([string]$event.Task.DisplayName).Trim([char]0)
        descriptionTemplate=([string]$event.Description).Trim([char]0)
        payload=@($template.template.data | Where-Object {$null -ne $_} | ForEach-Object {[ordered]@{name=$_.name;inType=$_.inType;outType=$_.outType}})
        templateXml=$event.Template; source='INSTALLED_PROVIDER_METADATA_NOT_LIVE_EVENT'
        liveOperationalSampleAvailable=(@($tasks | ForEach-Object {$_.query.samples} | Where-Object {$_.id -eq $event.Id -and $_.version -eq $event.Version}).Count -gt 0)
    }
})
Save-Json ([ordered]@{capturedAt=[DateTimeOffset]::UtcNow.ToString('o');provider=$provider.Name;providerGuid=$provider.Id;events=$metadata}) 'provider-metadata.json'

$support = @(
    @{name='Microsoft-Windows-Kernel-Power';ids=@(41,42,107,506,507)},
    @{name='Microsoft-Windows-Power-Troubleshooter';ids=@(1)},
    @{name='Microsoft-Windows-Kernel-General';ids=@(1,12,13)},
    @{name='Microsoft-Windows-Eventlog';ids=@(104)},
    @{name='Microsoft-Windows-TerminalServices-LocalSessionManager';ids=@(21,23,24,25)}
)
$supportMetadata = @(foreach ($source in $support) {
    $p = Get-WinEvent -ListProvider $source.name
    foreach ($e in $p.Events | Where-Object {$_.Id -in $source.ids}) {
        [ordered]@{provider=$source.name;id=$e.Id;version=$e.Version;channel=$e.LogLink.LogName;level=$e.Level.Value
            descriptionTemplate=([string]$e.Description).Trim([char]0);templateXml=$e.Template;source='INSTALLED_METADATA_NOT_EVENT'}
    }
})
Save-Json $supportMetadata 'supporting-metadata.json'

# Bounded existing source queries; neither auditing nor any channel is enabled here.
$recent = 'TimeCreated[timediff(@SystemTime) <= 604800000]'
$sources = @(
    (Query-Receipt 'System' "*[System[Provider[@Name='Microsoft-Windows-TaskScheduler']]]"),
    (Query-Receipt 'System' "*[System[Provider[@Name='Microsoft-Windows-Kernel-General'] and (EventID=12 or EventID=13 or EventID=1) and $recent]]"),
    (Query-Receipt 'System' "*[System[Provider[@Name='Microsoft-Windows-Kernel-Power'] and (EventID=41 or EventID=42 or EventID=107 or EventID=506 or EventID=507) and $recent]]"),
    (Query-Receipt 'System' "*[System[Provider[@Name='Microsoft-Windows-Power-Troubleshooter'] and EventID=1 and $recent]]"),
    (Query-Receipt 'System' "*[System[Provider[@Name='EventLog'] and (EventID=6005 or EventID=6006 or EventID=6008) and $recent]]"),
    (Query-Receipt 'System' "*[System[Provider[@Name='Microsoft-Windows-Eventlog'] and EventID=104 and $recent]]"),
    (Query-Receipt 'System' "*[System[Provider[@Name='Service Control Manager'] and (EventID=7036 or EventID=7031 or EventID=7034) and $recent]]"),
    (Query-Receipt 'Security' "*[System[(EventID=4624 or EventID=4634 or EventID=4647 or EventID=1102 or EventID=4616 or EventID=4698 or EventID=4699 or EventID=4700 or EventID=4701 or EventID=4702) and $recent]]"),
    (Query-Receipt 'Microsoft-Windows-TerminalServices-LocalSessionManager/Operational' "*[System[(EventID=21 or EventID=23 or EventID=24 or EventID=25) and $recent]]"),
    (Query-Receipt 'Microsoft-Windows-TaskScheduler/Maintenance' '*' 3)
)
$after = Log-State $channel
Save-Json ([ordered]@{
    purpose='Read-only research, bounded samples; no full-coverage claim'; startedAt=$begin; finishedAt=[DateTimeOffset]::UtcNow.ToString('o')
    osBuild=[Environment]::OSVersion.Version.ToString(); powershellVersion=$PSVersionTable.PSVersion.ToString()
    elevatedAdministrator=$isAdmin; selectionSource='config/application.example.yml (not effective running-service configuration)'
    before=$before;after=$after;newestQuery=$newest;oldestQuery=$oldest
    services=@(Get-Service Schedule,EventLog | ForEach-Object {[ordered]@{name=$_.Name;status=$_.Status.ToString()}})
    relatedLogs=@($provider.LogLinks | ForEach-Object {Log-State $_.LogName})
    supportingBounds=@('System','Microsoft-Windows-TerminalServices-LocalSessionManager/Operational' | ForEach-Object {
        [ordered]@{configuration=(Log-State $_);oldest=(Query-Receipt $_ '*' 1 $true);newest=(Query-Receipt $_ '*' 1)}
    })
    tasks=$tasks; supplementaryQueries=$sources; coverage='UNKNOWN'; negativeInferenceAllowed=$false
    sanitation='Live payloads and System identity/process/correlation values replaced with per-run equality tokens. No raw messages, accounts, SIDs, paths, arguments or evtx files.'
}) 'inspection.json'
Write-Output 'Sanitized provider metadata and inspection receipts written. No Windows state changed by this helper.'
