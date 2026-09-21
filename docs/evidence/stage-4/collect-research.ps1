# Research-only, read-only scheduler inventory. Never exports Actions or account identifiers.
# Run from repository root after reviewing this script. It writes sanitized JSON only.
param([string]$OutputFile = 'docs/evidence/stage-4/task-inventory.json')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Import-Module ScheduledTasks

function Hash-Text([string]$Text) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
function Date-Text($Value) {
    if ($null -eq $Value) { return $null }
    return ([DateTimeOffset]$Value).ToString('o')
}
function Pick($Object, [string[]]$Names) {
    $result = [ordered]@{}
    foreach ($name in $Names) {
        if ($null -eq $Object -or $null -eq $Object.PSObject.Properties[$name]) { $result[$name] = $null }
        else { $result[$name] = $Object.$name }
    }
    return $result
}

# Intentionally narrow parser for the reviewed example, not a general YAML/config resolver.
# Refuse local override rather than silently use the example as effective configuration.
if (Test-Path 'config/application.yml') { throw 'Local configuration exists: review selectors before adapting this research helper.' }
$configText = Get-Content 'config/application.example.yml' -Raw
if ($configText -notmatch 'exclude:\s*\[\]') { throw 'Review nonempty exclusions before research collection.' }
$selectors = @([regex]::Matches($configText, "(?m)^\s+- '([^']+)'\s*$") | ForEach-Object { $_.Groups[1].Value })
if ($selectors.Count -ne 5) { throw 'Example selection changed; review before collection.' }
$all = @(Get-ScheduledTask)
$start = [DateTimeOffset]::Now.ToString('o')
$rows = @()
foreach ($selector in $selectors) {
    $matches = @($all | Where-Object { [string]::Equals(($_.TaskPath + $_.TaskName), $selector, [StringComparison]::OrdinalIgnoreCase) })
    if ($matches.Count -ne 1) { throw 'A configured full task identity is missing or duplicated.' }
    $task = $matches[0]
    $before = Export-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath
    [xml]$xml = $before
    $info = $task | Get-ScheduledTaskInfo
    $triggers = @()
    foreach ($trigger in $task.Triggers) {
        $fields = Pick $trigger @('Enabled','StartBoundary','EndBoundary','DaysInterval','WeeksInterval','DaysOfWeek','MonthsOfYear','DaysOfMonth','WeeksOfMonth','RunOnLastDayOfMonth','RunOnLastWeekOfMonth','RandomDelay','ExecutionTimeLimit','Delay')
        $fields['type'] = $trigger.CimClass.CimClassName
        $fields['Repetition'] = Pick $trigger.Repetition @('Interval','Duration','StopAtDurationEnd')
        $fields['uncollectedPropertyNames'] = @($trigger.CimInstanceProperties.Name | Where-Object { $_ -notin @($fields.Keys) -and $_ -ne 'Id' })
        $fields['triggerIdPresent'] = -not [string]::IsNullOrEmpty($trigger.Id)
        $triggers += $fields
    }
    $settings = Pick $task.Settings @('StartWhenAvailable','RunOnlyIfNetworkAvailable','DisallowStartIfOnBatteries','StopIfGoingOnBatteries','WakeToRun','ExecutionTimeLimit','AllowDemandStart','Enabled','RestartCount','RestartInterval','DeleteExpiredTaskAfter','RunOnlyIfIdle','AllowHardTerminate','Hidden','Priority','DisallowStartOnRemoteAppSession','UseUnifiedSchedulingEngine','Volatile')
    $settings['MultipleInstances'] = $task.Settings.MultipleInstances.ToString()
    $settings['Compatibility'] = $task.Settings.Compatibility.ToString()
    $settings['IdleSettings'] = Pick $task.Settings.IdleSettings @('IdleDuration','WaitTimeout','StopOnIdleEnd','RestartOnIdle')
    $settings['NetworkSettings'] = [ordered]@{
        NamePresent = -not [string]::IsNullOrEmpty($task.Settings.NetworkSettings.Name)
        IdPresent = -not [string]::IsNullOrEmpty($task.Settings.NetworkSettings.Id)
    }
    $settings['MaintenanceSettings'] = Pick $task.Settings.MaintenanceSettings @('Period','Deadline','Exclusive')
    # XML corroboration: whitelist schedule/settings leaves. No RegistrationInfo, Actions,
    # principal names, SIDs, network names/IDs, free text, subscription or trigger IDs.
    $xmlLeaves = @()
    $safeLeafNames = @('Enabled','StartBoundary','EndBoundary','DaysInterval','WeeksInterval','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Interval','Duration','StopAtDurationEnd','RandomDelay','ExecutionTimeLimit','StartWhenAvailable','RunOnlyIfNetworkAvailable','DisallowStartIfOnBatteries','StopIfGoingOnBatteries','WakeToRun','AllowStartOnDemand','Count','DeleteExpiredTaskAfter','RunOnlyIfIdle','AllowHardTerminate','Hidden','Priority','DisallowStartOnRemoteAppSession','UseUnifiedSchedulingEngine','Volatile','StopOnIdleEnd','RestartOnIdle','WaitTimeout','MultipleInstancesPolicy','Period','Deadline','Exclusive')
    foreach ($section in @('Triggers','Settings')) {
        foreach ($leaf in $xml.SelectNodes("/*[local-name()='Task']/*[local-name()='$section']//*[not(*)]")) {
            if ($leaf.LocalName -notin $safeLeafNames) { continue }
            $parts = @($leaf.LocalName)
            $parent = $leaf.ParentNode
            while ($parent.LocalName -ne 'Task') { $parts = @($parent.LocalName) + $parts; $parent = $parent.ParentNode }
            $xmlLeaves += [ordered]@{ path=($parts -join '/'); value=$leaf.InnerText }
        }
    }
    $after = Export-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath
    $rows += [ordered]@{
        TaskName=$task.TaskName; TaskPath=$task.TaskPath; Enabled=[bool]$task.Settings.Enabled; State=$task.State.ToString()
        sampledAt=[DateTimeOffset]::Now.ToString('o')
        LastRunTime=Date-Text $info.LastRunTime; NextRunTime=Date-Text $info.NextRunTime
        LastTaskResult=[long]$info.LastTaskResult; NumberOfMissedRuns=$info.NumberOfMissedRuns
        Triggers=$triggers; Settings=$settings
        Principal=[ordered]@{ LogonType=$task.Principal.LogonType.ToString(); RunLevel=$task.Principal.RunLevel.ToString(); identitiesOmitted=$true }
        xmlTaskVersion=$xml.DocumentElement.GetAttribute('version'); xmlScheduleAndSettingsLeaves=$xmlLeaves
        definitionSha256Before=Hash-Text $before; definitionSha256After=Hash-Text $after
    }
}
$result = [ordered]@{
    evidenceVersion=1; purpose='Stage 4 research only; not an effective running-service configuration assertion'
    startedAt=$start; finishedAt=[DateTimeOffset]::Now.ToString('o')
    timezone=[ordered]@{ windowsId=[TimeZoneInfo]::Local.Id; baseUtcOffset=[TimeZoneInfo]::Local.BaseUtcOffset.ToString(); supportsDaylightSaving=[TimeZoneInfo]::Local.SupportsDaylightSavingTime }
    powershellVersion=$PSVersionTable.PSVersion.ToString()
    selection=[ordered]@{ source='config/application.example.yml'; localOverridePresent=$false; packagedDefaultIncludeCount=0; selectors=$selectors; exclusions=@(); configurationSha256=Hash-Text $configText; matchedCount=$rows.Count }
    sanitation='Actions, registration metadata, account identities, trigger IDs and network profile identities omitted. Full task XML exists in memory only; SHA-256 retained.'
    nullSemantics='null = not exposed/not applicable; empty string = provider returned empty. Neither automatically means false. See research applicability table and XML presence.'
    tasks=$rows
}
$result | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $OutputFile -Encoding UTF8
Write-Output "Sanitized inventory written: $($rows.Count) tasks."
