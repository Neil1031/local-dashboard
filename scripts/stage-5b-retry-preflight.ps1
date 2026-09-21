[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$BackupDirectory,
    [Parameter(Mandatory=$true)][string]$AttemptDirectory)
# One harmless, triggerless diagnostic. Never registers or runs the weekly task.
$ErrorActionPreference='Stop'
$backup=(Resolve-Path -LiteralPath $BackupDirectory).Path
. "$PSScriptRoot/windows-principal.ps1"
. "$PSScriptRoot/stage-5b-integrity.ps1"
$attempt=[IO.Path]::GetFullPath($AttemptDirectory)
if (!$attempt.StartsWith($backup.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) {throw 'Attempt must be a new child of the private backup'}
$manifest=Get-Content "$backup/deployment.json" -Raw | ConvertFrom-Json
$original=[IO.File]::ReadAllText("$backup/original.xml")
$pilot='AIStockHunter-Accumulation-Weekly-Check'
$name='LocalDashboard-Stage5B-Retry-Preflight'
$utf8=[Text.UTF8Encoding]::new($false)
function Save($path,$value) { Write-NewEvidence $path $value }
function Hash($value) {
    $sha=[Security.Cryptography.SHA256]::Create()
    try { ([BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($value)))).Replace('-','') } finally {$sha.Dispose()}
}
if (Test-Path $attempt) { throw 'Attempt already exists; evidence and run allowance are one-shot' }
if ((Export-ScheduledTask -TaskPath '\' -TaskName $pilot) -cne $original) {throw 'Original weekly definition required'}
if (@(Get-ScheduledTask -TaskPath '\' -TaskName $name -ErrorAction SilentlyContinue).Count) {throw 'Diagnostic name already exists'}
$null=& python -B "$PSScriptRoot/validate-runner-root.py" --root $manifest.runnerRoot --repo (Split-Path $PSScriptRoot -Parent)
if ($LASTEXITCODE -ne 0) {throw 'Invalid durable root'}
$sid=Resolve-CanonicalSid ([string]([xml]$original).Task.Principals.Principal.UserId)
foreach ($file in $manifest.releaseHashes) {if ((Get-FileHash -LiteralPath $file.path).Hash -cne $file.sha256) {throw 'Existing release hash mismatch'}}
if ((Get-FileHash -LiteralPath $manifest.config).Hash -cne $manifest.configHash) {throw 'Existing private configuration changed'}
$references=@(Get-ScheduledTask | Where-Object {
    (Export-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath).Replace('/','\').IndexOf($manifest.runnerRoot.Replace('/','\'),[StringComparison]::OrdinalIgnoreCase) -ge 0
})
if ($references.Count) {throw 'Candidate is already referenced; inspect without overwriting or guessing versions'}
Initialize-ControlledAttempt $backup $attempt
Save "$attempt/deployment-reuse.json" @{at=[DateTimeOffset]::Now.ToString('o');releaseFiles=$manifest.releaseHashes.Count;
    allReleaseHashesMatch=$true;privateConfigHashMatches=$true;rootValidatorPassed=$true;taskReferences=0;
    deploymentManifestHash=(Get-FileHash "$backup/deployment.json").Hash;copiedNewRuntime=$false}
$work=Join-Path $manifest.runnerRoot ('preflight-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
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
$processSidHash=HashBytes ([Text.Encoding]::UTF8.GetBytes([Security.Principal.WindowsIdentity]::GetCurrent().User.Value))
$sameUser=$processSidHash -ceq $settings.expectedSidHash
$ok=$sameUser -and @($checks|Where-Object {!$_.matches}).Count -eq 0
$record=@{at=[DateTimeOffset]::Now.ToString('o');samePrincipal=$sameUser;processCanonicalSidHash=$processSidHash;allHashesMatch=$ok;checks=$checks;processCwd=[Environment]::CurrentDirectory}
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
    baselineXmlHash=(Hash $original);diagnosticDeleted=$false;temporaryFilesDeleted=$false;manualRequests=0;
    attempt=2;authorization='Manager Review principal comparison fix';canonicalSidHash=(Get-CanonicalSidHash $sid)}
$created=$false
$diagnosticXml='';$diagnosticAcl=''
try {
    $null=Assert-ControlledCheckpoint $backup $attempt 'before-registration' $original
    $null=$folder.RegisterTask($name,$definition.XmlText,50,$sid,$null,3,$null)
    $created=$true
    Start-Sleep -Milliseconds 500
    $task=$folder.GetTask($name)
    $actual=$task.Definition
    $diagnosticXml=Export-ScheduledTask -TaskName $name -TaskPath '\'
    $diagnosticAcl=$task.GetSecurityDescriptor(7)
    $readbackSid=Resolve-CanonicalSid $actual.Principal.UserId
    $result.readbackCanonicalSidHash=Get-CanonicalSidHash $readbackSid
    $context=@{samePrincipal=($readbackSid -ceq $sid);interactiveToken=($actual.Principal.LogonType -eq 3);
        leastPrivilege=($actual.Principal.RunLevel -eq 0);sameEngine=($actual.Settings.UseUnifiedSchedulingEngine -eq $folder.GetTask($pilot).Definition.Settings.UseUnifiedSchedulingEngine);
        triggerless=($actual.Triggers.Count -eq 0);noRestart=($actual.Settings.RestartCount -eq 0);
        directJava=($actual.Actions.Item(1).Path -ceq $manifest.java);argumentsExact=($actual.Actions.Item(1).Arguments -ceq $exec.Arguments)}
    $result.context=$context
    Save "$attempt/principal-readback.json" @{canonicalSidHash=$result.canonicalSidHash;readbackCanonicalSidHash=$result.readbackCanonicalSidHash;
        canonicalPrincipalsEqual=$context.samePrincipal;diagnosticXmlHash=(Hash $diagnosticXml);context=$context}
    $null=Assert-ControlledCheckpoint $backup $attempt 'after-registration' $original $diagnosticXml $diagnosticAcl
    if (@($context.Values | Where-Object {!$_}).Count) {throw 'Diagnostic readback/context mismatch'}
    $null=Assert-ControlledCheckpoint $backup $attempt 'after-readback' $original $diagnosticXml $diagnosticAcl
    if ($task.State -ne 3 -or $task.GetInstances(0).Count) {throw 'Diagnostic not Ready/idle'}
    $before=$task.LastRunTime
    $result.requestedAt=[DateTimeOffset]::Now.ToString('o')
    $result.manualRequests=1
    Save "$attempt/preflight-request.json" $result
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
    $null=Assert-ControlledCheckpoint $backup $attempt 'after-diagnostic-run' $original $diagnosticXml $diagnosticAcl
    $result.marker=Get-Content "$work/marker.json" -Raw | ConvertFrom-Json
    $result.receipts=@(Get-ChildItem "$work/receipts" -File -Recurse -Filter *.json | Sort-Object Name | ForEach-Object {
        @{name=$_.Name;sha256=(Get-FileHash $_.FullName).Hash;receipt=(Get-Content $_.FullName -Raw|ConvertFrom-Json)}
    })
    $result.processCanonicalSidHash=$result.marker.processCanonicalSidHash
    $result.allCanonicalSidsEqual=($result.canonicalSidHash -ceq $result.readbackCanonicalSidHash -and $result.canonicalSidHash -ceq $result.processCanonicalSidHash)
    Save "$attempt/preflight-observed.json" $result
    $r=@($result.receipts | ForEach-Object {$_.receipt})
    $terminal=@($r|Where-Object phase -eq 'TERMINAL')
    if ($r.Count -ne 3 -or ($r.phase -join ',') -cne 'STARTED,PROCESS_STARTED,TERMINAL' -or
        @($r.executionId|Select-Object -Unique).Count -ne 1 -or $terminal.Count -ne 1 -or
        $null -eq $terminal[0].exitCode -or $terminal[0].exitCode -ne 0 -or $terminal[0].runnerExitCode -ne 0 -or
        !$terminal[0].startedAt -or !$terminal[0].processStartedAt -or !$terminal[0].finishedAt -or $null -eq $terminal[0].durationMs -or
        $terminal[0].outcome -ne 'SUCCESS' -or $task.LastTaskResult -ne 0 -or !$result.marker.allHashesMatch -or !$result.marker.samePrincipal -or !$result.allCanonicalSidsEqual) {
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
        if ($diagnosticXml -and ((Export-ScheduledTask -TaskName $name -TaskPath '\') -cne $diagnosticXml -or $task.GetSecurityDescriptor(7) -cne $diagnosticAcl)) {throw 'Diagnostic ownership/definition changed; refusing deletion'}
        $folder.DeleteTask($name,0)
    }
    $result.diagnosticDeleted=@(Get-ScheduledTask -TaskName $name -TaskPath '\' -ErrorAction SilentlyContinue).Count -eq 0
    try {
        $checkpoint=Assert-ControlledCheckpoint $backup $attempt 'after-diagnostic-deletion' $original
        $result.controlledOperationIntegrity=$checkpoint.gate
    } catch {$result.controlledOperationIntegrity='HARD FAIL';$result.gate='FAILED';$result.integrityError=$_.Exception.Message}
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
    $result.taskCount=$checkpoint.taskCount
    if (!$result.diagnosticDeleted -or !$result.temporaryFilesDeleted -or !$result.weeklyExactOriginal -or $result.controlledOperationIntegrity -ne 'PASSED') {$result.gate='FAILED'}
    Save "$attempt/preflight-result.json" $result
}
[pscustomobject]$result|Select-Object gate,lastTaskResult,lastRunTimeUpdated,diagnosticDeleted,temporaryFilesDeleted,weeklyExactOriginal,taskCount,error|ConvertTo-Json
if ($result.gate -ne 'PASSED') {exit 1}
