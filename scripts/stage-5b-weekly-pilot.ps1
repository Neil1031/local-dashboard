[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidateSet('Backup','Prepare','Apply','Restore','Inspect')][string]$Mode,
    [Parameter(Mandatory=$true)][string]$BackupDirectory
)
# Deliberately restricted to the single Manager-approved pilot. Never runs a task.
$ErrorActionPreference = 'Stop'
$pilotName = 'AIStockHunter-Accumulation-Weekly-Check'
$pilotPath = '\'
$profileId = 'aistockhunter-accumulation-weekly'
$repo = Split-Path $PSScriptRoot -Parent
if ($Mode -eq 'Backup') {
    if (Test-Path -LiteralPath $BackupDirectory) { throw 'Backup destination must be new; existing evidence is never overwritten' }
    New-Item -ItemType Directory -Path $BackupDirectory | Out-Null
}
$backup = (Resolve-Path -LiteralPath $BackupDirectory).Path
$utf8 = [Text.UTF8Encoding]::new($false)

function Hash-Text([string]$value) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($value)))).Replace('-','') }
    finally { $sha.Dispose() }
}
function Save-Json([string]$path, $value) {
    [IO.File]::WriteAllText($path, (ConvertTo-Json -InputObject $value -Depth 15), $utf8)
}
function Read-Xml([string]$value) {
    $doc = [xml]::new(); $doc.PreserveWhitespace = $true
    $doc.LoadXml($value)
    return ,$doc
}
function Without-Actions([string]$value) {
    $doc = Read-Xml $value
    $node = $doc.DocumentElement.SelectSingleNode('*[local-name()="Actions"]')
    if (!$node) { throw 'Missing Actions' }
    [void]$node.ParentNode.RemoveChild($node)
    return $doc.OuterXml
}
function Get-AllHashes {
    return @(Get-ScheduledTask | ForEach-Object {
        @{key=$_.TaskPath+$_.TaskName;sha256=(Hash-Text (Export-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath))}
    } | Sort-Object {$_.key})
}
function Assert-OtherTasks {
    $before = @(Get-Content -LiteralPath "$backup/all-tasks-before.json" -Raw | ConvertFrom-Json)
    $after = Get-AllHashes
    $old = @($before | Where-Object key -ne ($pilotPath+$pilotName) | ForEach-Object { $_.key+'|'+$_.sha256 })
    $new = @($after | Where-Object key -ne ($pilotPath+$pilotName) | ForEach-Object { $_.key+'|'+$_.sha256 })
    if (@(Compare-Object $old $new).Count) { throw 'Another task definition differs from the saved baseline; no other task will be modified.' }
    Save-Json "$backup/all-tasks-latest.json" $after
    return $after.Count
}
function Assert-Idle {
    $registered = $folder.GetTask($pilotName)
    if ($registered.State -eq 4 -or $registered.GetInstances(0).Count -ne 0) { throw 'Pilot is running; refusing definition update.' }
    $info = Get-ScheduledTaskInfo -TaskPath $pilotPath -TaskName $pilotName
    if ($info.NextRunTime -gt (Get-Date) -and $info.NextRunTime -lt (Get-Date).AddMinutes(15)) {
        throw 'Too close to the natural trigger to rehearse migration safely.'
    }
}
function Register-Exact([string]$xml) {
    $principal = (Read-Xml $original).Task.Principals.Principal
    if ($principal.LogonType -ne 'InteractiveToken') { throw 'This pilot requires its existing InteractiveToken principal; no credential guessing.' }
    # UPDATE only + DONT_ADD_PRINCIPAL_ACE + IGNORE_REGISTRATION_TRIGGERS.
    # No task creation, enable/disable, new trigger, or principal/ACL replacement.
    # Supplying SDDL here adds RegistrationInfo/SecurityDescriptor to the XML.
    # Omit it on UPDATE, suppress automatic ACE insertion and verify the saved ACL.
    [void]$folder.RegisterTask($pilotName, $xml, 52, [string]$principal.UserId, $null, 3, $null)
    # Registration can briefly expose the previous definition. Require two
    # consecutive fresh exports before trusting readback; never rerun registration.
    $stable = 0
    for ($attempt=0; $attempt -lt 25; $attempt++) {
        Start-Sleep -Milliseconds 200
        $observed = Export-ScheduledTask -TaskPath $pilotPath -TaskName $pilotName
        if ((Without-Actions $observed) -ceq (Without-Actions $xml) -and
            (Read-Xml $observed).Task.Actions.OuterXml -ceq (Read-Xml $xml).Task.Actions.OuterXml -and
            $folder.GetTask($pilotName).GetSecurityDescriptor(7) -ceq [IO.File]::ReadAllText("$backup/original.sddl.txt")) {
            $stable++
            if ($stable -eq 2) { return }
        } else { $stable=0 }
    }
    throw 'Registered definition/ACL did not converge to the requested state'
}

if ($Mode -eq 'Backup') {
    $task = Get-ScheduledTask -TaskPath $pilotPath -TaskName $pilotName
    $info = $task | Get-ScheduledTaskInfo
    $service = New-Object -ComObject Schedule.Service
    $service.Connect()
    $folder = $service.GetFolder($pilotPath)
    Assert-Idle
    $original = Export-ScheduledTask -TaskPath $pilotPath -TaskName $pilotName
    if ($original -cne [string]$folder.GetTask($pilotName).Xml) { throw 'Task changed during backup' }
    [IO.File]::WriteAllText("$backup/original.xml",$original,[Text.Encoding]::Unicode)
    [IO.File]::WriteAllText("$backup/original.sddl.txt",$folder.GetTask($pilotName).GetSecurityDescriptor(7),$utf8)
    $doc = Read-Xml $original
    foreach ($section in @('Actions','Triggers','Principals','Settings','RegistrationInfo')) {
        [IO.File]::WriteAllText("$backup/$section.xml",$doc.Task.$section.OuterXml,$utf8)
    }
    Save-Json "$backup/original-metadata.json" ([ordered]@{
        TaskName=$task.TaskName;TaskPath=$task.TaskPath;Enabled=$task.Settings.Enabled;State=[string]$task.State;
        Principal=@{UserId=$task.Principal.UserId;LogonType=[int]$task.Principal.LogonType;RunLevel=[int]$task.Principal.RunLevel};
        Actions=@($task.Actions | Select-Object Execute,Arguments,WorkingDirectory);
        LastRunTime=$info.LastRunTime.ToString('o');LastTaskResult=$info.LastTaskResult;
        NextRunTime=$info.NextRunTime.ToString('o');CapturedAt=[DateTimeOffset]::Now.ToString('o')})
    Save-Json "$backup/all-tasks-before.json" (Get-AllHashes)
    Save-Json "$backup/backup-hashes.json" @(Get-ChildItem -LiteralPath $backup -File | ForEach-Object {
        @{Name=$_.Name;Hash=(Get-FileHash -LiteralPath $_.FullName).Hash}
    })
    Write-Output 'BACKED UP: full pilot XML, ACL, sections, metadata and all readable task hashes.'
    exit 0
}

# Verify original backup bytes before any possible scheduler write.
$hashes = Get-Content -LiteralPath "$backup/backup-hashes.json" -Raw | ConvertFrom-Json
foreach ($item in $hashes) {
    if ($item.Name -ne [IO.Path]::GetFileName($item.Name)) { throw 'Invalid backup entry' }
    if ((Get-FileHash -LiteralPath (Join-Path $backup $item.Name)).Hash -ne $item.Hash) { throw "Backup integrity failure: $($item.Name)" }
}
$original = [IO.File]::ReadAllText("$backup/original.xml")
$metadata = Get-Content -LiteralPath "$backup/original-metadata.json" -Raw | ConvertFrom-Json
if ($metadata.TaskName -ne $pilotName -or $metadata.TaskPath -ne $pilotPath) { throw 'Backup is not the approved pilot' }
$service = New-Object -ComObject Schedule.Service
$service.Connect()
$folder = $service.GetFolder($pilotPath)
$current = Export-ScheduledTask -TaskPath $pilotPath -TaskName $pilotName
$manifestPath = "$backup/deployment.json"

if ($Mode -eq 'Prepare') {
    if ($current -cne $original) { throw 'Pilot changed since backup' }
    if (Test-Path -LiteralPath $manifestPath) { throw 'Deployment already prepared; reuse its manifest or inspect before proceeding.' }
    $doc = Read-Xml $original
    $actions = @($doc.Task.Actions.ChildNodes | Where-Object NodeType -eq Element)
    if ($actions.Count -ne 1 -or $actions[0].LocalName -ne 'Exec') { throw 'Expected exactly one Exec action' }
    $action = $actions[0]
    $expectedExe = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
    if ([IO.Path]::GetFullPath([string]$action.Command) -ine [IO.Path]::GetFullPath($expectedExe)) { throw 'Unexpected original interpreter' }
    $rawArgs = [string]$action.Arguments
    $pattern = '^\-NoProfile \-WindowStyle Hidden \-ExecutionPolicy Bypass \-File "([^"]+\\run_stock_task_hidden\.ps1)" \-Kind weekly-check \-NoNotification$'
    if ($rawArgs -cnotmatch $pattern) { throw 'Original arguments are not the reviewed weekly-check command; refusing generic parsing.' }
    $script = $Matches[1]
    if (![IO.Path]::IsPathRooted($script) -or !(Test-Path -LiteralPath $script -PathType Leaf)) { throw 'Original script missing' }
    $childArgs = @('-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',$script,'-Kind','weekly-check','-NoNotification')
    # Missing Start in means %windir%\System32 per New-ScheduledTaskAction contract.
    $cwd = [string]$action.WorkingDirectory
    if (!$cwd) { $cwd = Join-Path $env:SystemRoot 'System32' }
    if (![IO.Path]::IsPathRooted($cwd)) { throw 'Unreviewed relative working directory' }
    $dashboardHome = Join-Path $env:LOCALAPPDATA 'LocalDashboard'
    $config = Join-Path $dashboardHome 'config/runner.json'
    if (Test-Path -LiteralPath $config) { throw 'Existing private runner.json must not be overwritten' }
    $sourceJar = Join-Path $repo 'target/local-dashboard-0.1.0-runner.jar'
    $runtime = Join-Path $repo 'dist/LocalDashboard/runtime'
    if (!(Test-Path -LiteralPath "$runtime/bin/java.exe")) { throw 'Build the self-contained Windows image first' }
    $jarHash = (Get-FileHash -LiteralPath $sourceJar).Hash
    $release = Join-Path $dashboardHome ('runner/releases/pilot-' + $jarHash.Substring(0,16).ToLowerInvariant())
    if (Test-Path -LiteralPath $release) { throw 'Release already exists; never overwrite a deployed runtime' }
    New-Item -ItemType Directory -Path $release | Out-Null
    Copy-Item -LiteralPath $runtime -Destination "$release/runtime" -Recurse
    Copy-Item -LiteralPath $sourceJar -Destination "$release/runner.jar"
    $configuration = [ordered]@{schemaVersion=1;receiptDirectory=(Join-Path $dashboardHome 'data/runner-receipts');
        fallbackDirectory=(Join-Path $dashboardHome 'runner-fallback');profiles=@{}}
    $configuration.profiles[$profileId] = [ordered]@{jobId=$profileId;executable=[string]$action.Command;args=$childArgs;workingDirectory=$cwd}
    # Create-only private configuration; no shell command construction in the child profile.
    $stream = [IO.File]::Open($config, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $bytes=$utf8.GetBytes((ConvertTo-Json $configuration -Depth 8)); $stream.Write($bytes,0,$bytes.Length); $stream.Flush($true) }
    finally { $stream.Dispose() }
    $java = Join-Path $release 'runtime/bin/java.exe'
    $jar = Join-Path $release 'runner.jar'
    foreach ($path in @($java,$jar,$config)) { if ($path.Contains('"') -or $path.Contains("`n")) { throw 'Unsupported deployment path' } }
    $action.Command = $java
    # These fixed quoted CLI paths select a trusted profile; Task Scheduler invokes Java directly.
    $action.Arguments = '-jar "{0}" run "{1}" {2}' -f $jar,$config,$profileId
    # Keep the original WorkingDirectory XML node (including absence) exactly as it was.
    $desired = $doc.OuterXml
    if ((Without-Actions $desired) -cne (Without-Actions $original)) { throw 'Unexpected non-Action modification' }
    [IO.File]::WriteAllText("$backup/runner-action.xml", $desired, [Text.Encoding]::Unicode)
    $releaseHashes = @(Get-ChildItem -LiteralPath $release -Recurse -File | ForEach-Object {
        @{path=$_.FullName;sha256=(Get-FileHash -LiteralPath $_.FullName).Hash}
    })
    Save-Json $manifestPath ([ordered]@{profileId=$profileId;config=$config;configHash=(Get-FileHash $config).Hash;
        release=$release;java=$java;jar=$jar;releaseHashes=$releaseHashes;
        originalHash=(Hash-Text $original);desiredFileHash=(Get-FileHash "$backup/runner-action.xml").Hash;
        childWorkingDirectory=$cwd;originalWorkingDirectory=[string]$metadata.Actions[0].WorkingDirectory})
    Write-Output 'PREPARED: trusted equivalent profile and immutable local release; task not changed.'
    exit 0
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.originalHash -ne (Hash-Text $original)) { throw 'Manifest/baseline mismatch' }
$desired = [IO.File]::ReadAllText("$backup/runner-action.xml")
if ($manifest.desiredFileHash -ne (Get-FileHash "$backup/runner-action.xml").Hash) { throw 'Desired XML changed' }
if ((Without-Actions $desired) -cne (Without-Actions $original)) { throw 'Non-Action difference in desired XML' }

if ($Mode -eq 'Apply') {
    if (Test-Path -LiteralPath "$backup/live-result.json") {
        $live = Get-Content -LiteralPath "$backup/live-result.json" -Raw | ConvertFrom-Json
        if ($live.newReceiptCount -eq 0 -and $live.lastTaskResult -ne 0) {
            throw 'This candidate failed live launch and was rolled back. Preserve evidence; further attempts need a new reviewed scope.'
        }
    }
    Assert-Idle
    if ($current -cne $original) { throw 'Apply requires exact original definition' }
    if ((Get-FileHash $manifest.config).Hash -ne $manifest.configHash) { throw 'Private profile changed' }
    foreach ($file in $manifest.releaseHashes) { if ((Get-FileHash -LiteralPath $file.path).Hash -ne $file.sha256) { throw 'Deployed runtime/JAR changed' } }
    $null = Assert-OtherTasks
    try {
        Register-Exact $desired
        $actual = Export-ScheduledTask -TaskPath $pilotPath -TaskName $pilotName
        [IO.File]::WriteAllText("$backup/registration-observed.xml",$actual,[Text.Encoding]::Unicode)
        if ((Without-Actions $actual) -cne (Without-Actions $original) -or
            (Read-Xml $actual).Task.Actions.OuterXml -cne (Read-Xml $desired).Task.Actions.OuterXml -or
            $folder.GetTask($pilotName).GetSecurityDescriptor(7) -cne [IO.File]::ReadAllText("$backup/original.sddl.txt")) {
            throw ('Post-registration invariant failed: nonAction={0}; action={1}; ACL={2}' -f
                ((Without-Actions $actual) -ceq (Without-Actions $original)),
                ((Read-Xml $actual).Task.Actions.OuterXml -ceq (Read-Xml $desired).Task.Actions.OuterXml),
                ($folder.GetTask($pilotName).GetSecurityDescriptor(7) -ceq [IO.File]::ReadAllText("$backup/original.sddl.txt")))
        }
        $count = Assert-OtherTasks
        [IO.File]::WriteAllText("$backup/applied.xml",$actual,[Text.Encoding]::Unicode)
        Save-Json "$backup/applied.json" @{xmlHash=(Hash-Text $actual);nonActionHash=(Hash-Text (Without-Actions $actual));otherTasksUnchanged=$count-1;checkedAt=[DateTimeOffset]::Now.ToString('o')}
    } catch {
        $failure = $_
        Register-Exact $original
        if ((Export-ScheduledTask -TaskPath $pilotPath -TaskName $pilotName) -cne $original) { throw 'CRITICAL: restore exact XML after apply failure could not be verified' }
        throw $failure
    }
    Write-Output 'APPLIED: only pilot Action changed; all non-Action XML, ACL and other tasks unchanged.'
} elseif ($Mode -eq 'Restore') {
    Assert-Idle
    $applied = [IO.File]::ReadAllText("$backup/applied.xml")
    if ($current -cne $applied -and $current -cne $original) { throw 'Unexpected task changes; refusing to overwrite them' }
    Register-Exact $original
    $actual = Export-ScheduledTask -TaskPath $pilotPath -TaskName $pilotName
    if ($actual -cne $original) { throw 'Rollback XML differs from original' }
    if ($folder.GetTask($pilotName).GetSecurityDescriptor(7) -cne [IO.File]::ReadAllText("$backup/original.sddl.txt")) { throw 'Rollback ACL differs' }
    $count = Assert-OtherTasks
    Save-Json "$backup/rollback.json" @{originalHash=(Hash-Text $original);restoredHash=(Hash-Text $actual);exactXml=$true;aclUnchanged=$true;allTaskCount=$count;checkedAt=[DateTimeOffset]::Now.ToString('o')}
    Write-Output 'RESTORED: exact original XML and ACL; all task hashes equal baseline.'
} else {
    $count = Assert-OtherTasks
    [pscustomobject]@{TaskName=$pilotName;State=([string]$folder.GetTask($pilotName).State);
        OriginalAction=($current -ceq $original);RunnerAction=((Read-Xml $current).Task.Actions.OuterXml -ceq (Read-Xml $desired).Task.Actions.OuterXml);
        NonActionUnchanged=((Without-Actions $current) -ceq (Without-Actions $original));
        OtherTasksUnchanged=$count-1;CurrentXmlHash=(Hash-Text $current)} | ConvertTo-Json
}
