# Research artifact QA, PowerShell 7. Reads Windows state only; writes validation.json only.
# Requires the collector's PS7 evidence and a PS5.1 capture in target/stage-4-event-ps51.
$ErrorActionPreference='Stop'
$root='docs/evidence/stage-4-event'
$baseline='b33961338dad2d04e5f2bb5df60955cae2b9b9da'
$checks=[ordered]@{}
function Check([string]$Name, [bool]$Value) { $checks[$Name]=$Value }
function Hash-Text([string]$Text) {
    $s=[Security.Cryptography.SHA256]::Create()
    try { ([BitConverter]::ToString($s.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)))).Replace('-','').ToLowerInvariant() }
    finally { $s.Dispose() }
}
$r=Get-Content "$root/inspection.json" -Raw | ConvertFrom-Json -DateKind String
$m=Get-Content "$root/provider-metadata.json" -Raw | ConvertFrom-Json -DateKind String
$s=Get-Content "$root/supporting-metadata.json" -Raw | ConvertFrom-Json -DateKind String
$other=Get-Content 'target/stage-4-event-ps51/inspection.json' -Raw | ConvertFrom-Json -DateKind String
$otherMeta=Get-Content 'target/stage-4-event-ps51/provider-metadata.json' -Raw | ConvertFrom-Json -DateKind String
$old=Get-Content 'docs/evidence/stage-4/task-inventory.json' -Raw | ConvertFrom-Json -DateKind String
& git merge-base --is-ancestor $baseline HEAD
Check 'baselineIsAncestor' ($LASTEXITCODE -eq 0)
Check 'branchExact' ((& git branch --show-current) -eq 'research/stage-4-event-evidence')
$priorChanges=@(& git diff --name-only $baseline -- PLAN.md README.md src tests config index.html dashboard.mjs docs/STAGE-3A.md docs/STAGE-3B.md docs/STAGE-4-RESEARCH.md docs/evidence/stage-4)
Check 'productionAndPriorResearchUnchanged' ($LASTEXITCODE -eq 0 -and $priorChanges.Count -eq 0)
Check 'channelDisabledBeforeAfter' (-not $r.before.enabled -and -not $r.after.enabled)
Check 'configHashUnchanged' ($r.before.configurationSha256 -eq $r.after.configurationSha256)
Check 'ps51SameConfiguration' ($r.before.configurationSha256 -eq $other.before.configurationSha256)
Check 'ps51TypedMetadataSame' (($m.events | Select-Object * -ExcludeProperty descriptionTemplate | ConvertTo-Json -Depth 20 -Compress) -eq ($otherMeta.events | Select-Object * -ExcludeProperty descriptionTemplate | ConvertTo-Json -Depth 20 -Compress))
Check 'recordMetricsRemainNull' ($null -eq $r.before.recordCount -and $null -eq $r.before.currentFileSizeBytes)
Check 'fiveTasksPresent' ($r.tasks.Count -eq 5 -and $other.tasks.Count -eq 5)
Check 'noOperationalSample' ($r.newestQuery.queryStatus -eq 'NO_MATCHING_EVENTS' -and $r.oldestQuery.queryStatus -eq 'NO_MATCHING_EVENTS')
Check 'negativeInferenceDisabled' ($r.coverage -eq 'UNKNOWN' -and -not $r.negativeInferenceAllowed)
$finalDefinitions=@()
$secrets=@($env:USERNAME,$env:COMPUTERNAME,$env:USERPROFILE)
foreach ($t in $r.tasks) {
    $alt=@($other.tasks | Where-Object {$_.taskKey -eq $t.taskKey})
    $prior=@($old.tasks | Where-Object {($_.TaskPath+$_.TaskName) -eq $t.taskKey})
    Check "$($t.taskKey).emptyQueryExplicit" ($t.query.queryStatus -eq 'NO_MATCHING_EVENTS' -and $t.query.returnedCount -eq 0)
    Check "$($t.taskKey).crossVersion" ($alt.Count -eq 1 -and $t.definitionSha256Before -eq $alt[0].definitionSha256Before -and $alt[0].query.queryStatus -eq $t.query.queryStatus)
    Check "$($t.taskKey).priorDefinition" ($prior.Count -eq 1 -and $prior[0].definitionSha256After -eq $t.definitionSha256Before)
    $cut=$t.taskKey.LastIndexOf('\'); $path=$t.taskKey.Substring(0,$cut+1); $name=$t.taskKey.Substring($cut+1)
    $raw=Export-ScheduledTask -TaskPath $path -TaskName $name
    $hash=Hash-Text $raw
    Check "$($t.taskKey).definitionStable" ($hash -eq $t.definitionSha256Before -and $hash -eq $t.definitionSha256After)
    $finalDefinitions += [ordered]@{taskKey=$t.taskKey;definitionSha256=$hash}
    # Compare against actual private fields without printing or writing their values.
    [xml]$x=$raw
    foreach ($n in $x.SelectNodes('//*[local-name()="UserId" or local-name()="Author" or local-name()="Command" or local-name()="Arguments" or local-name()="WorkingDirectory"]')) {
        if ($n.InnerText.Length -ge 4) { $secrets += $n.InnerText }
    }
}
$gl=(& wevtutil gl Microsoft-Windows-TaskScheduler/Operational /f:xml 2>$null) -join "`n"
Check 'finalLogConfigurationUnchanged' ((Hash-Text $gl) -eq $r.before.configurationSha256)

# Independent schema checks against named fields, not localized message parsing.
function Names([int]$Id,[int]$Version) { (@($m.events | Where-Object {$_.id -eq $Id -and $_.version -eq $Version})[0].payload.name -join ',') }
Check '107TimeSourceGuid' ((Names 107 0) -eq 'TaskName,InstanceId')
Check '110DemandSourceGuid' ((Names 110 0) -eq 'TaskName,InstanceId,UserContext')
Check '114CatchupGuidNoNominal' ((Names 114 0) -eq 'TaskName,InstanceId')
Check '129NoPayloadInstanceGuid' ((Names 129 0) -eq 'TaskName,Path,ProcessID,Priority')
Check '201V0NoResult' ((Names 201 0) -eq 'TaskName,ActionName,TaskInstanceId')
Check '201V1Result' ((Names 201 1) -eq 'TaskName,TaskInstanceId,ActionName,ResultCode')
Check '201V2EnginePid' ((Names 201 2) -eq 'TaskName,TaskInstanceId,ActionName,ResultCode,EnginePID')
Check '322ExistingInstanceOnly' ((Names 322 0) -eq 'TaskName,TaskInstanceId')
Check '153NoOccurrenceIdentity' ((Names 153 0) -eq 'TaskName')
Check 'allProviderTemplateXmlParses' (@($m.events | Where-Object {$_.templateXml} | ForEach-Object {[xml]$_.templateXml}).Count -gt 0)
Check 'supportingTemplateXmlParses' (@($s | Where-Object {$_.templateXml} | ForEach-Object {[xml]$_.templateXml}).Count -gt 0)
$queries=@($r.newestQuery,$r.oldestQuery)+@($r.tasks | ForEach-Object {$_.query})+@($r.supplementaryQueries)+@($r.supportingBounds | ForEach-Object {$_.oldest;$_.newest})
$samples=@($queries | ForEach-Object {$_.samples})
$allRedacted=$true
foreach ($sample in $samples) {
    [xml]$x=$sample.sanitizedXml
    foreach ($n in $x.SelectNodes('/*/*[local-name()="EventData" or local-name()="UserData"]//*[not(*)]')) {
        if ($n.InnerText -and $n.InnerText -notmatch '^REDACTED-\d+$') { $allRedacted=$false }
    }
    foreach ($a in $x.SelectNodes('/*/*[local-name()="System"]/*[local-name()="Execution" or local-name()="Security" or local-name()="Correlation"]/@*')) {
        if ($a.Value -and $a.Value -notmatch '^REDACTED-\d+$') { $allRedacted=$false }
    }
    if ($x.Event.System.Computer -ne 'REDACTED-HOST') { $allRedacted=$false }
}
Check 'everyLiveXmlParsesAndSensitiveValuesRedacted' $allRedacted
Check 'actualMaintenance800ExistsNotOperational' (@($r.supplementaryQueries | Where-Object {$_.log -eq 'Microsoft-Windows-TaskScheduler/Maintenance'} | ForEach-Object {$_.samples} | Where-Object {$_.id -eq 800}).Count -gt 0)
Check 'securityDeniedNotEmptySuccess' (@($r.supplementaryQueries | Where-Object {$_.log -eq 'Security' -and $_.queryStatus -eq 'QUERY_FAILED' -and $_.error.hresult -eq -2147024891}).Count -eq 1)
$files=@(Get-ChildItem $root -File | Where-Object {$_.Name -ne 'validation.json'}) + @(Get-Item docs/STAGE-4-EVENT-RESEARCH.md)
$text=($files | ForEach-Object {Get-Content -LiteralPath $_.FullName -Raw}) -join "`n"
$privateValuesAbsent=$true
foreach ($v in $secrets | Select-Object -Unique) { if ($v.Length -ge 4 -and $text.IndexOf($v,[StringComparison]::OrdinalIgnoreCase) -ge 0) {$privateValuesAbsent=$false} }
Check 'actualAccountHostActionValuesAbsent' $privateValuesAbsent
$dataText=($files | Where-Object {$_.Extension -ne '.ps1'} | ForEach-Object {Get-Content -LiteralPath $_.FullName -Raw}) -join "`n"
Check 'noAccountSidOrAbsolutePrivateWindowsPath' ($dataText -notmatch 'S-1-5-21-\d' -and $dataText -notmatch '(?i)(?<![a-z])[A-Z]:[\\/]')
Check 'noRawEvtxOrDbArtifact' (@(Get-ChildItem $root -File | Where-Object {$_.Extension -in @('.evtx','.db','.sqlite','.etl')}).Count -eq 0)
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PWD "$root/collect-event-research.ps1"),[ref]$tokens,[ref]$errors)
Check 'collectorSyntax' ($errors.Count -eq 0)
$commands=@($ast.FindAll({param($n) $n -is [System.Management.Automation.Language.CommandAst]},$true) | ForEach-Object {$_.GetCommandName()} | Sort-Object -Unique)
$allowed=@('ConvertTo-Json','Error-Receipt','Event-Sample','Export-ScheduledTask','ForEach-Object','Get-Content','Get-ScheduledTask','Get-ScheduledTaskInfo','Get-Service','Get-WinEvent','Group-Object','Hash-Text','Import-Module','Join-Path','Log-State','Query-Receipt','Save-Json','Select-Object','Set-Content','Test-Path','Token','Where-Object','Write-Output','wevtutil')
Check 'collectorCommandAllowlist' (@($commands | Where-Object {$_ -notin $allowed}).Count -eq 0)
$nativeCalls=@($ast.FindAll({param($n) $n -is [System.Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'wevtutil'},$true))
Check 'wevtutilOnlyGl' ($nativeCalls.Count -eq 1 -and $nativeCalls[0].CommandElements[1].Extent.Text -eq 'gl')
$doc=Get-Content docs/STAGE-4-EVENT-RESEARCH.md -Raw
Check 'documentExplicitlyFailsMissingOperationalSampleGate' ($doc -match 'Overall：FAILED' -and $doc -match 'Operational execution XML unavailable')
Check 'reportHas18Sections' ([regex]::Matches($doc,'(?m)^## \d+\.').Count -eq 18)
& git diff --check $baseline
Check 'gitDiffCheck' ($LASTEXITCODE -eq 0)
$failed=@($checks.Keys | Where-Object {-not $checks[$_]})
[ordered]@{
    checkedAt=[DateTimeOffset]::UtcNow.ToString('o');baselineCommit=$baseline;branch='research/stage-4-event-evidence'
    artifactQA= $(if ($failed.Count -eq 0) {'PASSED'} else {'FAILED'})
    researchGate='FAILED'; unmetGate='3: actual Operational execution XML unavailable; metadata/Maintenance XML do not replace lifecycle verification'
    primaryPowerShell=$r.powershellVersion;crossCheckPowerShell=$other.powershellVersion
    localizationNote='PS7 messages are Chinese; PS5.1 messages are English. Typed schemas, IDs, versions and symbols are compared independently of localized description text.'
    checks=$checks; failedChecks=$failed;collectorCommandNames=$commands;finalDefinitions=$finalDefinitions
    sampleCount=$samples.Count;providerDefinitionCount=$m.events.Count
    scope='Documentation and research helpers only; no production tests run, no application/DB access, no task/log mutations or lifecycle experiments'
} | ConvertTo-Json -Depth 12 | Set-Content "$root/validation.json" -Encoding UTF8
Write-Output "Artifact QA: $($checks.Count) checks, $($failed.Count) failed. Research Gate remains FAILED (missing Operational lifecycle XML)."
if ($failed.Count -gt 0) { $failed; exit 1 }
