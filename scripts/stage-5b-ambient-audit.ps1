[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$BackupDirectory,
    [Parameter(Mandatory=$true)][string]$AttemptDirectory)
# Read-only, after controlled cleanup. Never replaces the original inventory.
$ErrorActionPreference='Stop'
. "$PSScriptRoot/stage-5b-integrity.ps1"
$backup=(Resolve-Path -LiteralPath $BackupDirectory).Path
$attempt=(Resolve-Path -LiteralPath $AttemptDirectory).Path
$baseline=Get-OriginalSchedulerMap $backup
$anchor=Get-Content "$attempt/integrity-anchor.json" -Raw|ConvertFrom-Json
$controlMap=$baseline.Clone()
foreach ($d in $anchor.ambientDifferences) {$controlMap[$d.key]=$d.after}
$current=Get-SchedulerMap
$fromOriginal=@(Compare-SchedulerMaps $baseline $current)
$sinceControlled=@(Compare-SchedulerMaps $controlMap $current)
$checks=@(Get-ChildItem "$attempt/checkpoints" -File|Sort-Object Name|ForEach-Object {Get-Content $_.FullName -Raw|ConvertFrom-Json})
$controlledPass=(@($checks|Where-Object gate -ne 'PASSED').Count -eq 0) -and ($checks[-1].label -eq 'Restore-after')
$unexpected=@($fromOriginal|Where-Object {$_.key -cne '\Microsoft\Windows\Flighting\OneSettings\RefreshCache' -or !$_.before -or !$_.after})
$classification=if (!$controlledPass -or $unexpected.Count) {'FAILED'} elseif ($fromOriginal.Count) {'EXTERNAL_DRIFT_OBSERVED'} else {'NO_DRIFT'}
$service=New-Object -ComObject Schedule.Service
$service.Connect();$task=$service.GetFolder('\').GetTask('AIStockHunter-Accumulation-Weekly-Check')
$xml=Export-ScheduledTask -TaskName $task.Name -TaskPath '\'
$original=[IO.File]::ReadAllText("$backup/original.xml")
$info=Get-ScheduledTaskInfo -TaskName $task.Name -TaskPath '\'
$live=Get-Content "$attempt/live-result.json" -Raw|ConvertFrom-Json
$manifest=Get-Content "$backup/deployment.json" -Raw|ConvertFrom-Json
$config=Get-Content $manifest.config -Raw|ConvertFrom-Json
$receiptCount=0
foreach ($root in @($config.receiptDirectory,$config.fallbackDirectory)) {if(Test-Path $root){$receiptCount+=@(Get-ChildItem $root -File -Recurse -Filter *.json).Count}}
$record=@{at=[DateTimeOffset]::Now.ToString('o');classification=$classification;actor='UNKNOWN';cause='UNKNOWN';
    originalInventoryFileHash=(Get-FileHash "$backup/all-tasks-before.json").Hash;baselineReplaced=$false;
    originalTaskCount=$baseline.Count;finalTaskCount=$current.Count;differencesFromOriginal=$fromOriginal;
    differencesSinceControlledAnchor=$sinceControlled;controlledOperationIntegrity=$(if($controlledPass){'PASSED'}else{'HARD FAIL'});
    controlledCheckpointCount=$checks.Count;lastControlledCheckpointAt=$checks[-1].at;unexpectedUserOrPilotDrift=$unexpected;
    weeklyExactOriginalXml=($xml -ceq $original);weeklyExactOriginalAcl=($task.GetSecurityDescriptor(7) -ceq [IO.File]::ReadAllText("$backup/original.sddl.txt"));
    weeklyXmlHash=(Get-InventoryHash $xml);weeklyAclHash=(Get-InventoryHash $task.GetSecurityDescriptor(7));
    finalAction='ORIGINAL';enabled=$task.Enabled;state=[string](Get-ScheduledTask -TaskName $task.Name -TaskPath '\').State;instances=$task.GetInstances(0).Count;
    lastRunTime=$info.LastRunTime.ToString('o');lastTaskResult=$info.LastTaskResult;nextRunTime=$info.NextRunTime.ToString('o');
    sameSingleRunMetadata=(([DateTimeOffset]$info.LastRunTime).UtcTicks -eq ([DateTimeOffset]$live.lastRunTime).UtcTicks -and $info.LastTaskResult -eq $live.lastTaskResult);
    liveReceiptFileCount=$receiptCount;formalManualRequestCount=@(Get-ChildItem $attempt -File -Filter manual-run-request.json).Count;
    diagnosticAbsent=(@(Get-ScheduledTask -TaskName 'LocalDashboard-Stage5B-Retry-Preflight' -TaskPath '\' -ErrorAction SilentlyContinue).Count -eq 0);
    listener8080Count=@(Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue).Count}
if (!$record.weeklyExactOriginalXml -or !$record.weeklyExactOriginalAcl -or !$record.sameSingleRunMetadata -or !$record.diagnosticAbsent -or $receiptCount -ne 3) {$record.classification='FAILED'}
Write-NewEvidence "$attempt/ambient-audit.json" $record
if ($fromOriginal.Count) {
    $driftXml=Export-ScheduledTask -TaskPath '\Microsoft\Windows\Flighting\OneSettings\' -TaskName 'RefreshCache'
    $stream=[IO.File]::Open("$attempt/ambient-refresh-cache.xml",[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {$bytes=[Text.Encoding]::Unicode.GetBytes($driftXml);$stream.Write($bytes,0,$bytes.Length)} finally {$stream.Dispose()}
}
[pscustomobject]$record|Select-Object classification,controlledOperationIntegrity,controlledCheckpointCount,weeklyExactOriginalXml,weeklyExactOriginalAcl,sameSingleRunMetadata,finalAction,state,enabled,instances,lastRunTime,lastTaskResult,liveReceiptFileCount|ConvertTo-Json
if ($record.classification -eq 'FAILED') {exit 1}
