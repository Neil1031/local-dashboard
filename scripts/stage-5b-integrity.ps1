# Shared read-only integrity checks. The original full inventory is never replaced.
function Get-InventoryHash([string]$Text) {
    $s=[Security.Cryptography.SHA256]::Create()
    try { ([BitConverter]::ToString($s.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)))).Replace('-','') }
    finally { $s.Dispose() }
}
function Write-NewEvidence([string]$Path,$Value) {
    $bytes=[Text.UTF8Encoding]::new($false).GetBytes((ConvertTo-Json -InputObject $Value -Depth 30))
    $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $stream.Write($bytes,0,$bytes.Length);$stream.Flush($true) } finally {$stream.Dispose()}
}
function Get-SchedulerMap {
    $map=@{}
    foreach ($task in Get-ScheduledTask) {
        $map[$task.TaskPath+$task.TaskName]=Get-InventoryHash (Export-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath)
    }
    return $map
}
function Compare-SchedulerMaps($Before,$After) {
    $keys=@(@($Before.Keys)+@($After.Keys)|Sort-Object -Unique)
    return @($keys|Where-Object {$Before[$_] -cne $After[$_]}|ForEach-Object {
        [pscustomobject]@{key=$_;before=$Before[$_];after=$After[$_]}
    })
}
function Get-OriginalSchedulerMap([string]$BackupDirectory) {
    $map=@{}
    foreach ($item in (Get-Content "$BackupDirectory/all-tasks-before.json" -Raw|ConvertFrom-Json)) {$map[$item.key]=$item.sha256}
    return $map
}
function Initialize-ControlledAttempt([string]$BackupDirectory,[string]$AttemptDirectory) {
    if (Test-Path -LiteralPath $AttemptDirectory) {throw 'Attempt directory must be new; old evidence is immutable'}
    New-Item -ItemType Directory -Path $AttemptDirectory | Out-Null
    New-Item -ItemType Directory -Path "$AttemptDirectory/checkpoints" | Out-Null
    $baseline=Get-OriginalSchedulerMap $BackupDirectory
    $current=Get-SchedulerMap
    $drift=@(Compare-SchedulerMaps $baseline $current)
    # This is the one historical ambient system task explicitly accepted by the
    # Manager. No user/pilot task, new task or other system drift is allowlisted.
    if (@($drift|Where-Object {$_.key -cne '\Microsoft\Windows\Flighting\OneSettings\RefreshCache' -or !$_.before -or !$_.after}).Count) {
        Write-NewEvidence "$AttemptDirectory/initial-hard-fail.json" @{differences=$drift;gate='HARD FAIL'}
        throw 'Unexpected pre-operation drift; no controlled mutation permitted'
    }
    Write-NewEvidence "$AttemptDirectory/integrity-anchor.json" @{at=[DateTimeOffset]::Now.ToString('o');
        originalInventoryFileHash=(Get-FileHash "$BackupDirectory/all-tasks-before.json").Hash;
        ambientDifferences=$drift;actor='UNKNOWN';cause='UNKNOWN';classification='EXTERNAL_DRIFT_OBSERVED';
        meaning='Original baseline retained. These pre-existing differences form a fixed delta for controlled comparisons; no drift during operations is tolerated.'}
}
function Assert-ControlledCheckpoint([string]$BackupDirectory,[string]$AttemptDirectory,[string]$Label,
    [string]$ExpectedPilotXml,[string]$DiagnosticXml='',[string]$DiagnosticAcl='') {
    $anchor=Get-Content "$AttemptDirectory/integrity-anchor.json" -Raw|ConvertFrom-Json
    if ($anchor.originalInventoryFileHash -cne (Get-FileHash "$BackupDirectory/all-tasks-before.json").Hash) {throw 'Original inventory changed'}
    $expected=Get-OriginalSchedulerMap $BackupDirectory
    foreach ($d in $anchor.ambientDifferences) {
        if ($d.key -cne '\Microsoft\Windows\Flighting\OneSettings\RefreshCache' -or $expected[$d.key] -cne $d.before) {throw 'Invalid ambient anchor'}
        $expected[$d.key]=$d.after
    }
    $pilot='\AIStockHunter-Accumulation-Weekly-Check'
    $diagnostic='\LocalDashboard-Stage5B-Retry-Preflight'
    $expected[$pilot]=Get-InventoryHash $ExpectedPilotXml
    if ($DiagnosticXml) {$expected[$diagnostic]=Get-InventoryHash $DiagnosticXml}
    $actual=Get-SchedulerMap
    $differences=@(Compare-SchedulerMaps $expected $actual)
    $service=New-Object -ComObject Schedule.Service
    $service.Connect();$folder=$service.GetFolder('\')
    $aclSame=$folder.GetTask('AIStockHunter-Accumulation-Weekly-Check').GetSecurityDescriptor(7) -ceq [IO.File]::ReadAllText("$BackupDirectory/original.sddl.txt")
    $diagAclSame=(!$DiagnosticXml) -or ($folder.GetTask('LocalDashboard-Stage5B-Retry-Preflight').GetSecurityDescriptor(7) -ceq $DiagnosticAcl)
    $pass=($differences.Count -eq 0) -and $aclSame -and $diagAclSame
    $record=@{label=$Label;at=[DateTimeOffset]::Now.ToString('o');gate=$(if($pass){'PASSED'}else{'HARD FAIL'});
        taskCount=$actual.Count;expectedTaskCount=$expected.Count;differences=$differences;weeklyAclUnchanged=$aclSame;diagnosticAclUnchanged=$diagAclSame}
    $path=Join-Path $AttemptDirectory ('checkpoints/'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fffffff')+'-'+$Label+'.json')
    Write-NewEvidence $path $record
    if (!$pass) {throw 'Controlled-operation integrity HARD FAIL; inspect immutable checkpoint'}
    return $record
}
