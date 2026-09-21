[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$BackupDirectory)
# One harmless, triggerless diagnostic. Never registers or runs the weekly task.
$ErrorActionPreference='Stop'
$backup=(Resolve-Path -LiteralPath $BackupDirectory).Path
$manifest=Get-Content "$backup/deployment.json" -Raw | ConvertFrom-Json
$original=[IO.File]::ReadAllText("$backup/original.xml")
$pilot='AIStockHunter-Accumulation-Weekly-Check'
$name='LocalDashboard-Stage5B-Retry-Preflight'
$utf8=[Text.UTF8Encoding]::new($false)
function Save($path,$value) { [IO.File]::WriteAllText($path,(ConvertTo-Json -InputObject $value -Depth 25),$utf8) }
function Hash($value) {
    $sha=[Security.Cryptography.SHA256]::Create()
    try { ([BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($value)))).Replace('-','') } finally {$sha.Dispose()}
}
if (Test-Path "$backup/preflight-result.json") { throw 'Preflight is one-shot; preserve its result' }
if ((Export-ScheduledTask -TaskPath '\' -TaskName $pilot) -cne $original) {throw 'Original weekly definition required'}
if (@(Get-ScheduledTask -TaskPath '\' -TaskName $name -ErrorAction SilentlyContinue).Count) {throw 'Diagnostic name already exists'}
$null=& python -B "$PSScriptRoot/validate-runner-root.py" --root $manifest.runnerRoot --repo (Split-Path $PSScriptRoot -Parent)
if ($LASTEXITCODE -ne 0) {throw 'Invalid durable root'}
$work=Join-Path $manifest.runnerRoot ('preflight-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
$sid=[string]([xml]$original).Task.Principals.Principal.UserId
$probes=@($manifest.releaseHashes)+@([pscustomobject]@{path=$manifest.config;sha256=$manifest.configHash})
Save "$work/settings.json" @{expectedSidHash=(Hash $sid);probes=$probes}
$fixture=@'
$ErrorActionPreference='Stop'
$settings=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'settings.json') -Raw -Encoding utf8 | ConvertFrom-Json
function HashBytes($bytes) {
    $sha=[Security.Cryptography.SHA256]::Create()
    try {([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','')} finally {$sha.Dispose()}
}
$checks=@($settings.probes | ForEach-Object {
    $exists=Test-Path -LiteralPath $_.path -PathType Leaf
    $hash=if ($exists) {HashBytes ([IO.File]::ReadAllBytes($_.path))} else {$null}
    @{exists=$exists;path=$_.path;sha256=$hash;matches=($exists -and $hash -ceq $_.sha256)}
})
$sameUser=(HashBytes ([Text.Encoding]::UTF8.GetBytes([Security.Principal.WindowsIdentity]::GetCurrent().User.Value))) -ceq $settings.expectedSidHash
$ok=$sameUser -and @($checks|Where-Object {!$_.matches}).Count -eq 0
$record=@{at=[DateTimeOffset]::Now.ToString('o');samePrincipal=$sameUser;allHashesMatch=$ok;checks=$checks;processCwd=[Environment]::CurrentDirectory}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'marker.json'),($record|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
if (!$ok) {exit 9}
exit 0
'@
[IO.File]::WriteAllText("$work/fixture.ps1",$fixture,[Text.UTF8Encoding]::new($true))
$system32=Join-Path $env:SystemRoot 'System32'
Save "$work/diagnostic.json" @{schemaVersion=1;receiptDirectory="$work/receipts";fallbackDirectory="$work/fallback";profiles=@{
    diagnostic=@{jobId='stage5b-retry-preflight';executable=(Join-Path $system32 'WindowsPowerShell/v1.0/powershell.exe');
        args=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',"$work/fixture.ps1");workingDirectory=$system32}}}
$service=New-Object -ComObject Schedule.Service
$service.Connect(); $folder=$service.GetFolder('\')
$definition=$service.NewTask(0)
$description='Harmless Stage 5B Retry preflight '+[IO.Path]::GetFileName($work)
$definition.RegistrationInfo.Description=$description
$definition.Principal.UserId=$sid
$definition.Principal.LogonType=3
$definition.Principal.RunLevel=0
$definition.Settings.Enabled=$true
$definition.Settings.Hidden=$true
$definition.Settings.AllowDemandStart=$true
$definition.Settings.DisallowStartIfOnBatteries=$false
$definition.Settings.StopIfGoingOnBatteries=$false
$definition.Settings.ExecutionTimeLimit='PT2M'
$definition.Settings.MultipleInstances=2
$definition.Settings.UseUnifiedSchedulingEngine=$folder.GetTask($pilot).Definition.Settings.UseUnifiedSchedulingEngine
$exec=$definition.Actions.Create(0)
$exec.Path=$manifest.java
$exec.Arguments='-jar "{0}" run "{1}" diagnostic' -f $manifest.jar,"$work/diagnostic.json"
$result=[ordered]@{gate='FAILED';deploymentManifestHash=(Get-FileHash "$backup/deployment.json").Hash;
    baselineXmlHash=(Hash $original);diagnosticDeleted=$false;temporaryFilesDeleted=$false;manualRequests=0}
$created=$false
try {
    $null=$folder.RegisterTask($name,$definition.XmlText,50,$sid,$null,3,$null)
    $created=$true
    Start-Sleep -Milliseconds 500
    $task=$folder.GetTask($name)
    $actual=$task.Definition
    $context=@{samePrincipal=($actual.Principal.UserId -ceq $sid);interactiveToken=($actual.Principal.LogonType -eq 3);
        leastPrivilege=($actual.Principal.RunLevel -eq 0);sameEngine=($actual.Settings.UseUnifiedSchedulingEngine -eq $folder.GetTask($pilot).Definition.Settings.UseUnifiedSchedulingEngine);
        triggerless=($actual.Triggers.Count -eq 0);noRestart=($actual.Settings.RestartCount -eq 0);
        directJava=($actual.Actions.Item(1).Path -ceq $manifest.java);argumentsExact=($actual.Actions.Item(1).Arguments -ceq $exec.Arguments)}
    $result.context=$context
    if (@($context.Values | Where-Object {!$_}).Count) {throw 'Diagnostic readback/context mismatch'}
    if ($task.State -ne 3 -or $task.GetInstances(0).Count) {throw 'Diagnostic not Ready/idle'}
    $before=$task.LastRunTime
    $result.requestedAt=[DateTimeOffset]::Now.ToString('o')
    $result.manualRequests=1
    Save "$backup/preflight-request.json" $result
    $null=$task.Run($null)
    $watch=[Diagnostics.Stopwatch]::StartNew()
    do {
        Start-Sleep -Milliseconds 250
        $task=$folder.GetTask($name)
        if ($watch.Elapsed.TotalSeconds -gt 140) {throw 'Diagnostic timeout; do not retry'}
    } while ($task.GetInstances(0).Count -or $task.State -eq 4 -or $task.LastRunTime -eq $before -or $watch.Elapsed.TotalSeconds -lt 2)
    $result.lastTaskResult=$task.LastTaskResult
    $result.lastRunTime=$task.LastRunTime.ToString('o')
    $result.lastRunTimeUpdated=$task.LastRunTime -ne $before
    $result.marker=Get-Content "$work/marker.json" -Raw | ConvertFrom-Json
    $result.receipts=@(Get-ChildItem "$work/receipts" -File -Recurse -Filter *.json | Sort-Object Name | ForEach-Object {
        @{name=$_.Name;sha256=(Get-FileHash $_.FullName).Hash;receipt=(Get-Content $_.FullName -Raw|ConvertFrom-Json)}
    })
    Save "$backup/preflight-observed.json" $result
    $r=@($result.receipts | ForEach-Object {$_.receipt})
    $terminal=@($r|Where-Object phase -eq 'TERMINAL')
    if ($r.Count -ne 3 -or ($r.phase -join ',') -cne 'STARTED,PROCESS_STARTED,TERMINAL' -or
        @($r.executionId|Select-Object -Unique).Count -ne 1 -or $terminal.Count -ne 1 -or
        $null -eq $terminal[0].exitCode -or $terminal[0].exitCode -ne 0 -or $terminal[0].runnerExitCode -ne 0 -or
        !$terminal[0].startedAt -or !$terminal[0].processStartedAt -or !$terminal[0].finishedAt -or $null -eq $terminal[0].durationMs -or
        $terminal[0].outcome -ne 'SUCCESS' -or $task.LastTaskResult -ne 0 -or !$result.marker.allHashesMatch -or !$result.marker.samePrincipal) {
        throw 'Scheduler-context preflight evidence failed'
    }
    $result.gate='PASSED'
} catch {
    $result.error=$_.Exception.Message
    $result.gate='FAILED'
} finally {
    if ($created) {
        $task=$folder.GetTask($name)
        if ($task.Definition.RegistrationInfo.Description -cne $description) {throw 'Diagnostic ownership changed'}
        if ($task.State -eq 4 -or $task.GetInstances(0).Count) {throw 'Diagnostic still running; preserve evidence and investigate cleanup'}
        $folder.DeleteTask($name,0)
    }
    $result.diagnosticDeleted=@(Get-ScheduledTask -TaskName $name -TaskPath '\' -ErrorAction SilentlyContinue).Count -eq 0
    # Validate the final absolute owned subtree and every descendant before deletion.
    $absolute=[IO.Path]::GetFullPath($work)
    $parent=[IO.Path]::GetFullPath($manifest.runnerRoot).TrimEnd('\')+'\'
    if (!$absolute.StartsWith($parent,[StringComparison]::OrdinalIgnoreCase) -or
        (Resolve-Path -LiteralPath $absolute).Path -ine $absolute -or
        @(@(Get-Item -LiteralPath $absolute)+@(Get-ChildItem -LiteralPath $absolute -Recurse -Force)|Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count) {
        throw 'Unsafe preflight cleanup path'
    }
    Remove-Item -LiteralPath $absolute -Recurse -Force
    $result.temporaryFilesDeleted=!(Test-Path -LiteralPath $absolute)
    $result.weeklyExactOriginal=(Export-ScheduledTask -TaskName $pilot -TaskPath '\') -ceq $original
    $before=Get-Content "$backup/all-tasks-before.json" -Raw|ConvertFrom-Json
    $after=@(Get-ScheduledTask | ForEach-Object {@{key=$_.TaskPath+$_.TaskName;sha256=(Hash (Export-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath))}}|Sort-Object {$_.key})
    $result.taskCount=$after.Count
    $result.taskDifferences=@(Compare-Object @($before|ForEach-Object {$_.key+'|'+$_.sha256}) @($after|ForEach-Object {$_.key+'|'+$_.sha256})|Select-Object InputObject,SideIndicator)
    if (!$result.diagnosticDeleted -or !$result.temporaryFilesDeleted -or !$result.weeklyExactOriginal -or $result.taskDifferences.Count) {$result.gate='FAILED'}
    Save "$backup/preflight-result.json" $result
    Save "$backup/all-tasks-latest.json" $after
}
[pscustomobject]$result|Select-Object gate,lastTaskResult,lastRunTimeUpdated,diagnosticDeleted,temporaryFilesDeleted,weeklyExactOriginal,taskCount,error|ConvertTo-Json
if ($result.gate -ne 'PASSED') {exit 1}
