[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidateSet('Snapshot','Run','Collect','Cleanup','CleanupFiles','Audit')][string]$Mode,
    [Parameter(Mandatory=$true)][string]$Directory,
    [ValidatePattern('^[A-Z][0-9]?$')][string]$Case
)
# Only this dedicated, triggerless task may be created, updated, run or deleted.
$ErrorActionPreference='Stop'
$taskName='LocalDashboard-Stage5B-Diagnostic'
$taskPath='\'
$root=(Resolve-Path -LiteralPath $Directory).Path
$manifest=Get-Content -LiteralPath "$root/manifest.json" -Raw -Encoding utf8 | ConvertFrom-Json
if ($manifest.taskName -cne $taskName -or $manifest.root -cne $root) { throw 'Unexpected diagnostic manifest' }
$evidence=Join-Path $root 'evidence'
$utf8=[Text.UTF8Encoding]::new($false)
$service=New-Object -ComObject Schedule.Service
$service.Connect()
$folder=$service.GetFolder($taskPath)

function Save([string]$name,$value) {
    [IO.File]::WriteAllText((Join-Path $evidence $name),(ConvertTo-Json -InputObject $value -Depth 25),$utf8)
}
function Hash([string]$text) {
    $sha=[Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($text)))).Replace('-','') }
    finally { $sha.Dispose() }
}
function File-Hash([string]$path) {
    $sha=[Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($path)))).Replace('-','') }
    finally { $sha.Dispose() }
}
function Inventory([string]$label) {
    $xmlDir=Join-Path $evidence "xml-$label"
    New-Item -ItemType Directory -Path $xmlDir -Force | Out-Null
    $items=@(Get-ScheduledTask | Where-Object { $_.TaskPath+$_.TaskName -cne $taskPath+$taskName } | ForEach-Object {
        $key=$_.TaskPath+$_.TaskName
        $xml=Export-ScheduledTask -TaskPath $_.TaskPath -TaskName $_.TaskName
        [IO.File]::WriteAllText((Join-Path $xmlDir ((Hash $key)+'.xml')),$xml,[Text.Encoding]::Unicode)
        @{key=$key;sha256=(Hash $xml)}
    } | Sort-Object {$_.key})
    Save "tasks-$label.json" $items
    return ,$items
}
function Existing([string]$label) {
    # Windows PowerShell 5.1 emits a JSON array as one pipeline object. Do not
    # wrap ConvertFrom-Json in @(), which would create a nested baseline array.
    $before=Get-Content "$evidence/tasks-before.json" -Raw -Encoding utf8 | ConvertFrom-Json
    $after=Inventory $label
    $diff=@(Compare-Object @($before|ForEach-Object{$_.key+'|'+$_.sha256}) @($after|ForEach-Object{$_.key+'|'+$_.sha256}) |
        Select-Object InputObject,SideIndicator)
    Save "integrity-$label.json" @{baselineCount=$before.Count;afterCount=$after.Count;differences=$diff;checkedAt=[DateTimeOffset]::Now.ToString('o')}
    $weekly='\AIStockHunter-Accumulation-Weekly-Check'
    if (($before|Where-Object key -ceq $weekly).sha256 -cne ($after|Where-Object key -ceq $weekly).sha256) {
        throw 'Formal weekly definition changed externally; diagnostic will not modify it'
    }
    return ,$diff
}
function Environment-State {
    $weekly=Get-ScheduledTask -TaskPath '\' -TaskName 'AIStockHunter-Accumulation-Weekly-Check'
    $info=$weekly|Get-ScheduledTaskInfo
    return @{at=[DateTimeOffset]::Now.ToString('o');listeners8080=@(Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue |
        Select-Object LocalAddress,OwningProcess);operationalLogEnabled=(Get-WinEvent -ListLog 'Microsoft-Windows-TaskScheduler/Operational').IsEnabled;
        weeklyLastRunTime=$info.LastRunTime.ToString('o');weeklyLastTaskResult=$info.LastTaskResult;
        weeklyState=[string]$weekly.State;weeklyAclHash=(Hash $folder.GetTask($weekly.TaskName).GetSecurityDescriptor(7))}
}
function Assert-OwnedIdle {
    $task=$folder.GetTask($taskName)
    if ($task.Definition.RegistrationInfo.Description -cne $manifest.description) { throw 'Diagnostic ownership mismatch' }
    if ($task.Definition.Triggers.Count -ne 0 -or $task.Definition.Principal.LogonType -ne 3 -or $task.Definition.Principal.RunLevel -ne 0) {
        throw 'Unexpected diagnostic context'
    }
    if ($task.State -eq 4 -or $task.GetInstances(0).Count) { throw 'Diagnostic still running' }
}

if ($Mode -eq 'Snapshot') {
    if (Test-Path "$evidence/tasks-before.json") { throw 'Baseline already captured' }
    if (@(Get-ScheduledTask -TaskPath $taskPath -TaskName $taskName -ErrorAction SilentlyContinue).Count) { throw 'Diagnostic name already exists' }
    $null=Inventory 'before'
    Save 'environment-before.json' (Environment-State)
    Write-Output 'BASELINE SAVED; no task written'
    exit 0
}
if ($Mode -eq 'Cleanup') {
    if (@(Get-ScheduledTask -TaskPath $taskPath -TaskName $taskName -ErrorAction SilentlyContinue).Count) {
        Assert-OwnedIdle
        $folder.DeleteTask($taskName,0)
    }
    if (@(Get-ScheduledTask -TaskPath $taskPath -TaskName $taskName -ErrorAction SilentlyContinue).Count) { throw 'Diagnostic was not deleted' }
    $diff=Existing 'after-cleanup'
    Save 'environment-after.json' (Environment-State)
    Save 'task-cleanup.json' @{diagnosticAbsent=$true;otherTaskDifferences=$diff;at=[DateTimeOffset]::Now.ToString('o')}
    Write-Output 'DIAGNOSTIC DELETED; final inventory saved'
    exit 0
}
if ($Mode -eq 'CleanupFiles') {
    if (@(Get-ScheduledTask -TaskPath $taskPath -TaskName $taskName -ErrorAction SilentlyContinue).Count) { throw 'Delete the owned diagnostic task before its files' }
    if (!(Test-Path "$evidence/task-cleanup.json")) { throw 'Task cleanup evidence missing' }
    $work=[IO.Path]::GetFullPath((Join-Path $root 'work'))
    $expectedShared=[IO.Path]::GetFullPath((Join-Path (Split-Path $PSScriptRoot -Parent) ('.tools/stage5br-shared-'+(Split-Path $root -Leaf))))
    if ([IO.Path]::GetFullPath($manifest.sharedWork) -cne $expectedShared) { throw 'Unexpected shared cleanup target' }
    $targets=@($work,$expectedShared)
    $fileHashes=@()
    foreach ($target in $targets) {
        # Check final absolute targets and reject reparse points before recursion.
        if (!(Test-Path -LiteralPath $target -PathType Container)) { throw 'Expected test-only directory missing' }
        if ((Resolve-Path -LiteralPath $target).Path -ine $target) { throw 'Cleanup path resolution differs' }
        if ((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse root refused' }
        $children=@(Get-ChildItem -LiteralPath $target -Force -Recurse)
        if (@($children|Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count) { throw 'Reparse descendant refused' }
        $fileHashes+=@($children|Where-Object {!$_.PSIsContainer}|ForEach-Object {@{path=$_.FullName;sha256=(File-Hash $_.FullName)}})
    }
    $captured=@{}
    $markerHashes=@()
    foreach ($name in @('A','A2','D2','D3','E')) {
        $path=Join-Path $evidence "marker-$name.json"
        $captured[$name]=Get-Content -LiteralPath $path -Raw -Encoding utf8|ConvertFrom-Json
        $markerHashes+=@{name="marker-$name.json";sha256=(File-Hash $path)}
    }
    $captured['wrapperG']=Get-Content "$evidence/wrapper-G.json" -Raw -Encoding utf8|ConvertFrom-Json
    $markerHashes+=@{name='wrapper-G.json';sha256=(File-Hash "$evidence/wrapper-G.json")}
    Save 'captured-environment.json' $captured
    Save 'deleted-test-file-hashes.json' @{testFiles=$fileHashes;markerSnapshots=$markerHashes}
    foreach ($target in $targets) { Remove-Item -LiteralPath $target -Recurse -Force }
    foreach ($item in $markerHashes) { Remove-Item -LiteralPath (Join-Path $evidence $item.name) -Force }
    if (@($targets|Where-Object {Test-Path -LiteralPath $_}).Count) { throw 'Test-only cleanup incomplete' }
    Save 'file-cleanup.json' @{at=[DateTimeOffset]::Now.ToString('o');removedTargets=$targets;testFilesDeleted=$fileHashes.Count;
        markerSnapshotsDeleted=$markerHashes.Count;testWorkAbsent=$true;sharedTestReleaseAbsent=$true;
        diagnosticTaskAbsent=$true;configAndWorkingMarkersDeleted=$true;capturedObservationsRetained=$true;
        priorStage5bUnreferencedReleaseUntouched=$true}
    Write-Output 'TEST FILES REMOVED; captured observations and hashes retained as evidence'
    exit 0
}
if ($Mode -eq 'Audit') {
    $diff=Existing 'final'
    $state=Environment-State
    $absent=@(Get-ScheduledTask -TaskPath $taskPath -TaskName $taskName -ErrorAction SilentlyContinue).Count -eq 0
    Save 'final-audit.json' @{at=[DateTimeOffset]::Now.ToString('o');diagnosticAbsent=$absent;otherTaskDifferences=$diff;environment=$state;
        workAbsent=(!(Test-Path -LiteralPath (Join-Path $root 'work')));sharedWorkAbsent=(!(Test-Path -LiteralPath $manifest.sharedWork))}
    if (!$absent -or $diff.Count) { throw 'Final audit found a task difference; inspect saved evidence' }
    Write-Output 'FINAL AUDIT: diagnostic absent; all existing task definitions unchanged'
    exit 0
}

if (!$Case) { throw 'Case is required' }
$selected=$manifest.cases.$Case
if (!$selected) { throw 'Case is not in trusted diagnostic manifest' }
if ($Case -ne 'A') {
    $baseline=Get-Content "$evidence/case-A.json" -Raw -Encoding utf8 | ConvertFrom-Json
    if ($baseline.lastTaskResult -ne 0 -or !$baseline.markerPresent) { throw 'Case A did not establish scheduler baseline; diagnose context before Runner cases' }
}
if ($Case -eq 'G') {
    $java=Get-Content "$evidence/case-B.json" -Raw -Encoding utf8 | ConvertFrom-Json
    if ($java.lastTaskResult -eq 0) { throw 'Trampoline is unnecessary when direct Java succeeds' }
}
$requestPath=Join-Path $evidence "request-$Case.json"
if ($Mode -eq 'Run') {
if (Test-Path $requestPath) { throw 'Each named case can only be requested once' }
if (Test-Path -LiteralPath $selected.marker) { throw 'Unexpected pre-existing marker' }
$receiptFilesBefore=@()
if ($selected.receiptDirectory -and (Test-Path -LiteralPath $selected.receiptDirectory)) {
    $receiptFilesBefore=@(Get-ChildItem -LiteralPath $selected.receiptDirectory -Recurse -File -Filter *.json | Select-Object -ExpandProperty FullName)
}
$null=Existing "before-$Case"
$definition=$service.NewTask(0)
$definition.RegistrationInfo.Description=$manifest.description
$definition.Principal.UserId=$manifest.userSid
$definition.Principal.LogonType=3
$definition.Principal.RunLevel=0
$definition.Settings.Enabled=$true
$definition.Settings.Hidden=$true
$definition.Settings.AllowDemandStart=$true
$definition.Settings.DisallowStartIfOnBatteries=$false
$definition.Settings.StopIfGoingOnBatteries=$false
$definition.Settings.ExecutionTimeLimit='PT2M'
$definition.Settings.MultipleInstances=2
$definition.Settings.UseUnifiedSchedulingEngine=$true
$exec=$definition.Actions.Create(0)
$exec.Path=$selected.command
$exec.Arguments=$selected.arguments
if ($selected.workingDirectory) { $exec.WorkingDirectory=$selected.workingDirectory }
$exists=@(Get-ScheduledTask -TaskPath $taskPath -TaskName $taskName -ErrorAction SilentlyContinue).Count -ne 0
if ($exists) { Assert-OwnedIdle; $flags=52 } else { $flags=50 }
# Same COM XML registration path as the pilot; CREATE only initially, UPDATE only later.
$null=$folder.RegisterTask($taskName,$definition.XmlText,$flags,$manifest.userSid,$null,3,$null)
Start-Sleep -Milliseconds 500
$task=$folder.GetTask($taskName)
$readback=$task.Definition.Actions.Item(1)
if ($readback.Path -cne $selected.command -or $readback.Arguments -cne $selected.arguments -or
    [string]$readback.WorkingDirectory -cne [string]$selected.workingDirectory) { throw 'Action readback mismatch' }
Assert-OwnedIdle
[IO.File]::WriteAllText("$evidence/action-$Case.xml",(Export-ScheduledTask -TaskPath $taskPath -TaskName $taskName),[Text.Encoding]::Unicode)
$before=Get-ScheduledTaskInfo -TaskPath $taskPath -TaskName $taskName
$request=@{case=$Case;at=[DateTimeOffset]::Now.ToString('o');lastRunTimeBefore=$before.LastRunTime.ToString('o');
    action=$selected;instancesBefore=0;receiptFilesBefore=$receiptFilesBefore}
$stream=[IO.File]::Open($requestPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try { $bytes=$utf8.GetBytes(($request|ConvertTo-Json -Depth 15)); $stream.Write($bytes,0,$bytes.Length);$stream.Flush($true) }
finally { $stream.Dispose() }
$timer=[Diagnostics.Stopwatch]::StartNew()
$running=$task.Run($null)
$polls=@()
do {
    Start-Sleep -Milliseconds 250
    $current=$folder.GetTask($taskName)
    $polls+=@{elapsedMs=$timer.ElapsedMilliseconds;state=$current.State;instances=$current.GetInstances(0).Count;lastTaskResult=$current.LastTaskResult}
    if ($timer.Elapsed.TotalSeconds -gt 140) { throw 'Diagnostic exceeded bounded wait; inspect before cleanup' }
} while ($current.State -eq 4 -or $current.GetInstances(0).Count -ne 0 -or $timer.Elapsed.TotalSeconds -lt 2)
} else {
    # Resume evidence collection after a collector error without registering or
    # starting a second instance. Action and request must still match.
    Assert-OwnedIdle
    $request=Get-Content -LiteralPath $requestPath -Raw -Encoding utf8 | ConvertFrom-Json
    $action=$folder.GetTask($taskName).Definition.Actions.Item(1)
    if ($action.Path -cne $selected.command -or $action.Arguments -cne $selected.arguments) { throw 'Task moved on; cannot recover this case' }
    $receiptFilesBefore=@($request.receiptFilesBefore)
    $timer=[Diagnostics.Stopwatch]::StartNew()
    $polls=@()
}
$info=Get-ScheduledTaskInfo -TaskPath $taskPath -TaskName $taskName
$markerPresent=(Test-Path -LiteralPath $selected.marker) -or (Test-Path -LiteralPath "$evidence/marker-$Case.json")
if (Test-Path -LiteralPath $selected.marker) { Move-Item -LiteralPath $selected.marker -Destination "$evidence/marker-$Case.json" }
$receipts=@()
if ($selected.receiptDirectory -and (Test-Path -LiteralPath $selected.receiptDirectory)) {
    $receipts=@(Get-ChildItem -LiteralPath $selected.receiptDirectory -Recurse -File -Filter *.json | Where-Object FullName -notin $receiptFilesBefore | ForEach-Object {
        @{name=$_.Name;sha256=(File-Hash $_.FullName);receipt=(Get-Content -LiteralPath $_.FullName -Raw -Encoding utf8|ConvertFrom-Json)}
    })
}
$diff=Existing "after-$Case"
$wrapperPresent=$selected.wrapperMarker -and (Test-Path -LiteralPath $selected.wrapperMarker)
if ($wrapperPresent) { Move-Item -LiteralPath $selected.wrapperMarker -Destination "$evidence/wrapper-$Case.json" }
$result=@{case=$Case;lastRunTime=$info.LastRunTime.ToString('o');lastTaskResult=$info.LastTaskResult;
    resultHex=('0x{0:X8}' -f [uint32]$info.LastTaskResult);state=[string](Get-ScheduledTask -TaskPath $taskPath -TaskName $taskName).State;
    collectionRecovered=($Mode -eq 'Collect');elapsedMs=$(if($Mode -eq 'Run'){$timer.ElapsedMilliseconds}else{$null});markerPresent=$markerPresent;receipts=$receipts;polls=$polls;
    wrapperMarkerPresent=[bool]$wrapperPresent;otherTaskDifferences=$diff;readbackMatched=$true;registeredAt=$request.at;action=$selected}
Save "case-$Case.json" $result
[pscustomobject]$result|Select-Object case,lastRunTime,lastTaskResult,resultHex,state,markerPresent,readbackMatched|ConvertTo-Json
