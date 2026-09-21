[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$BackupDirectory,
    [Parameter(Mandatory=$true)][string]$AttemptDirectory)
# Exactly one formal request. Any failure restores the known applied task; no retry.
$ErrorActionPreference='Stop'
. "$PSScriptRoot/stage-5b-integrity.ps1"
$backup=(Resolve-Path -LiteralPath $BackupDirectory).Path
$attempt=(Resolve-Path -LiteralPath $AttemptDirectory).Path
$name='AIStockHunter-Accumulation-Weekly-Check'
$original=[IO.File]::ReadAllText("$backup/original.xml")
$applied=[IO.File]::ReadAllText("$attempt/applied.xml")
$manifest=Get-Content "$backup/deployment.json" -Raw|ConvertFrom-Json
$preflight=Get-Content "$attempt/preflight-result.json" -Raw|ConvertFrom-Json
$rehearsal=Get-Content "$attempt/rollback-rehearsal.json" -Raw|ConvertFrom-Json
if ($preflight.gate -ne 'PASSED' -or !$preflight.allCanonicalSidsEqual -or !$rehearsal.exactXml -or !$rehearsal.aclUnchanged -or $rehearsal.controlledIntegrity -ne 'PASSED') {throw 'Passed preflight and exact rehearsal required'}
if ((Test-Path "$attempt/manual-run-request.json") -or (Test-Path "$attempt/live-result.json")) {throw 'Formal request already consumed; never retry'}
$service=New-Object -ComObject Schedule.Service
$service.Connect();$folder=$service.GetFolder('\')
function Offline-State {
    return @{listener8080Count=@(Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue).Count;
        dashboardProcessCount=@(Get-CimInstance Win32_Process|Where-Object {$_.Name -eq 'LocalDashboard.exe' -or
            ($_.Name -in @('java.exe','javaw.exe') -and $_.CommandLine -match 'local-dashboard' -and $_.CommandLine -notmatch 'runner')}).Count}
}
$result=[ordered]@{gate='FAILED';formalManualRequests=0;requestedAt=$null;lastTaskResult=$null;receipts=@()}
$requestIssued=$false
try {
    $null=Assert-ControlledCheckpoint $backup $attempt 'live-before' $applied
    $offline=Offline-State
    if ($offline.listener8080Count -or $offline.dashboardProcessCount) {throw 'Dashboard must be offline'}
    $result.offlineBefore=$offline
    $task=$folder.GetTask($name)
    if ($task.State -ne 3 -or !$task.Enabled -or $task.GetInstances(0).Count) {throw 'Weekly is not Ready/Enabled/idle'}
    $before=Get-ScheduledTaskInfo -TaskName $name -TaskPath '\'
    if ($before.NextRunTime -gt (Get-Date) -and $before.NextRunTime -lt (Get-Date).AddMinutes(15)) {throw 'Natural trigger too close'}
    foreach ($file in $manifest.releaseHashes) {if ((Get-FileHash -LiteralPath $file.path).Hash -cne $file.sha256) {throw 'Deployed file changed'}}
    if ((Get-FileHash -LiteralPath $manifest.config).Hash -cne $manifest.configHash) {throw 'Private config changed'}
    & python -B "$PSScriptRoot/stage-5b-live-files.py" verify-before --backup-directory $backup --attempt-directory $attempt
    if ($LASTEXITCODE -ne 0) {throw 'Protected/output/receipt baseline changed'}
    $result.requestedAt=[DateTimeOffset]::Now.ToString('o')
    $result.lastRunTimeBefore=$before.LastRunTime.ToString('o')
    $result.formalManualRequests=1
    Write-NewEvidence "$attempt/manual-run-request.json" $result
    $requestIssued=$true
    Start-ScheduledTask -TaskName $name -TaskPath '\'
    $timer=[Diagnostics.Stopwatch]::StartNew()
    $stable=0
    do {
        Start-Sleep -Milliseconds 250
        $task=$folder.GetTask($name)
        $info=Get-ScheduledTaskInfo -TaskName $name -TaskPath '\'
        if ($task.State -ne 4 -and $task.GetInstances(0).Count -eq 0 -and $info.LastRunTime -ne $before.LastRunTime -and $info.LastTaskResult -ne 267009) {$stable++} else {$stable=0}
        if ($timer.Elapsed.TotalSeconds -gt 660) {throw 'Formal completion timeout; no second request'}
    } while ($stable -lt 3 -or $timer.Elapsed.TotalSeconds -lt 2)
    $result.lastRunTime=$info.LastRunTime.ToString('o')
    $result.lastRunTimeUpdated=$info.LastRunTime -ne $before.LastRunTime
    $result.lastTaskResult=$info.LastTaskResult
    $config=Get-Content -LiteralPath $manifest.config -Raw|ConvertFrom-Json
    $receiptFiles=@(foreach ($root in @($config.receiptDirectory,$config.fallbackDirectory)) {
        if (Test-Path -LiteralPath $root) {Get-ChildItem -LiteralPath $root -File -Recurse -Filter *.json}
    })
    $result.receipts=@($receiptFiles|Sort-Object Name|ForEach-Object {@{name=$_.Name;sha256=(Get-FileHash $_.FullName).Hash;receipt=(Get-Content $_.FullName -Raw|ConvertFrom-Json)}})
    $r=@($result.receipts|ForEach-Object {$_.receipt})
    $terminal=@($r|Where-Object phase -eq 'TERMINAL')
    $result.threePhases=($r.Count -eq 3 -and ($r.phase -join ',') -ceq 'STARTED,PROCESS_STARTED,TERMINAL' -and @($r.executionId|Select-Object -Unique).Count -eq 1)
    $result.receiptFieldsComplete=($terminal.Count -eq 1 -and $terminal[0].startedAt -and $terminal[0].processStartedAt -and $terminal[0].finishedAt -and
        $null -ne $terminal[0].durationMs -and $null -ne $terminal[0].exitCode -and $null -ne $terminal[0].runnerExitCode -and $terminal[0].outcome)
    $result.schedulerMatchesChild=($result.receiptFieldsComplete -and $terminal[0].exitCode -eq $terminal[0].runnerExitCode -and $terminal[0].runnerExitCode -eq $info.LastTaskResult)
    $result.childExitCode=if ($terminal.Count -eq 1) {$terminal[0].exitCode} else {$null}
    Write-NewEvidence "$attempt/live-observed.json" $result
    $null=Assert-ControlledCheckpoint $backup $attempt 'live-after' $applied
    $result.offlineAfter=Offline-State
    if (!$result.threePhases -or !$result.receiptFieldsComplete -or !$result.schedulerMatchesChild -or !$result.lastRunTimeUpdated -or
        $result.childExitCode -ne 0 -or $result.offlineAfter.listener8080Count -or $result.offlineAfter.dashboardProcessCount) {throw 'Formal pilot acceptance failed; nonzero/missing/mismatched evidence is a failure, never retried'}
    & python -B "$PSScriptRoot/stage-5b-live-files.py" after --backup-directory $backup --attempt-directory $attempt
    if ($LASTEXITCODE -ne 0) {throw 'Unexpected output or protected-file side effect'}
    $result.gate='PASSED'
} catch {
    $result.error=$_.Exception.Message
    $result.gate='FAILED'
} finally {
    # Save the result before definition rollback. A failed result blocks Apply.
    Write-NewEvidence "$attempt/live-result.json" $result
    $task=$folder.GetTask($name)
    if ($task.State -eq 4 -or $task.GetInstances(0).Count) {throw 'Task still running; no retry or unsafe definition overwrite. Inspect the bounded task before restoring.'}
    & "$PSScriptRoot/stage-5b-weekly-pilot.ps1" -Mode Restore -BackupDirectory $backup -AttemptDirectory $attempt
    $restored=Get-Content "$attempt/rollback.json" -Raw|ConvertFrom-Json
    Write-NewEvidence "$attempt/final-rollback-verification.json" $restored
    if (!(Test-Path "$attempt/live-files-after.json") -and $requestIssued) {
        & python -B "$PSScriptRoot/stage-5b-live-files.py" after --backup-directory $backup --attempt-directory $attempt
        # A failed run remains failed regardless of whether the file audit passes.
        if ($LASTEXITCODE -ne 0) {Write-Output 'File-effects audit failed; original task is already restored.'}
    }
}
if ($result.gate -eq 'PASSED') {
    & "$PSScriptRoot/stage-5b-weekly-pilot.ps1" -Mode Apply -BackupDirectory $backup -AttemptDirectory $attempt
    Write-NewEvidence "$attempt/final-runner-retained.json" @{gate='PASSED';at=[DateTimeOffset]::Now.ToString('o');exactRollbackVerified=$true;finalAction='RUNNER'}
}
[pscustomobject]$result|Select-Object gate,formalManualRequests,lastTaskResult,childExitCode,threePhases,schedulerMatchesChild,error|ConvertTo-Json
if ($result.gate -ne 'PASSED') {exit 1}
