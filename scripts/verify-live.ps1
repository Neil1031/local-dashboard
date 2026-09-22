param(
    [string]$BaseUrl = 'http://127.0.0.1:43871',
    [string[]]$ExpectedTaskKeys = @(
        '\InsiderTracker-Market', '\InsiderTracker-SEC', '\InsiderTracker-SyncImport',
        '\AIStockHunter-UnexplainedVolume-Daily', '\AIStockHunter-Accumulation-Weekly-Check'
    ),
    [string]$OutputPath = 'target/live-verification.json'
)
$ErrorActionPreference = 'Stop'

function Assert-Equal($Actual, $Expected, $Label) {
    if ($Actual -cne $Expected) { throw "Mismatch in $Label : actual=[$Actual], expected=[$Expected]" }
}
function Get-DefinitionHash($Task) {
    $xml = $Task | Export-ScheduledTask
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($xml))).Replace('-', '') }
    finally { $sha.Dispose() }
}
function As-Instant($Value) {
    if ($null -eq $Value -or "$Value" -eq '') { return $null }
    $date = if ($Value -is [datetime] -or $Value -is [DateTimeOffset]) {
        [DateTimeOffset]$Value
    } else { [DateTimeOffset]::Parse("$Value", [Globalization.CultureInfo]::InvariantCulture) }
    if ($date.Year -le 1899) { return $null }
    return $date.ToUniversalTime().ToString('o')
}

if (-not $PSBoundParameters.ContainsKey('ExpectedTaskKeys')) {
    $ExpectedTaskKeys += @(Get-ScheduledTask | Where-Object { $_.TaskPath -eq '\' -and $_.TaskName.StartsWith('AIStockHunter-Accumulation-Check-', [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { $_.TaskPath + $_.TaskName })
}
$tasks = @(Get-ScheduledTask | Where-Object { ($_.TaskPath + $_.TaskName) -in $ExpectedTaskKeys })
Assert-Equal $tasks.Count $ExpectedTaskKeys.Count 'configured tasks found'
$before = @{}
foreach ($task in $tasks) { $before[$task.TaskPath + $task.TaskName] = Get-DefinitionHash $task }
# ConvertFrom-Json keeps strings in Windows PowerShell 5.1; As-Instant also handles PowerShell 7 DateTime values.
$response = Invoke-RestMethod "$BaseUrl/api/jobs"
Assert-Equal $response.collectionStatus 'OK' 'collection status'
Assert-Equal $response.jobs.Count $ExpectedTaskKeys.Count 'API task count'
$records = @()
foreach ($task in $tasks) {
    $key = $task.TaskPath + $task.TaskName
    $job = @($response.jobs | Where-Object { ($_.taskPath + $_.name) -eq $key })
    Assert-Equal $job.Count 1 "$key identity"
    $job = $job[0]
    $info = $task | Get-ScheduledTaskInfo
    Assert-Equal $job.raw.TaskName $task.TaskName "$key raw name"
    Assert-Equal $job.raw.TaskPath $task.TaskPath "$key raw path"
    Assert-Equal $job.raw.Description $task.Description "$key description"
    Assert-Equal $job.raw.State $task.State.ToString() "$key raw state"
    Assert-Equal $job.state $task.State.ToString().ToUpperInvariant() "$key normalized state"
    Assert-Equal $job.enabled ([bool]$task.Settings.Enabled) "$key enabled"
    Assert-Equal $job.raw.Enabled ([bool]$task.Settings.Enabled) "$key raw enabled"
    Assert-Equal ([long]$job.lastTaskResult) ([long]$info.LastTaskResult) "$key result"
    Assert-Equal ([long]$job.raw.LastTaskResult) ([long]$info.LastTaskResult) "$key raw result"
    foreach ($pair in @(@('lastRunAt','LastRunTime'), @('nextRunAt','NextRunTime'))) {
        $expected = As-Instant $info.($pair[1])
        Assert-Equal (As-Instant $job.raw.($pair[1])) $expected "$key raw $($pair[1])"
        # SCHED_S_TASK_HAS_NOT_RUN clears normalized lastRunAt even when Windows supplies a date.
        if ($pair[0] -eq 'lastRunAt' -and [long]$info.LastTaskResult -eq 0x41303) { $expected = $null }
        Assert-Equal (As-Instant $job.($pair[0])) $expected "$key $($pair[0])"
    }
    Assert-Equal $job.raw.NumberOfMissedRuns $info.NumberOfMissedRuns "$key missed counter"
    Assert-Equal $job.raw.StartWhenAvailable ([bool]$task.Settings.StartWhenAvailable) "$key StartWhenAvailable"
    Assert-Equal @($job.triggers).Count @($task.Triggers).Count "$key trigger count"
    for ($i=0; $i -lt @($task.Triggers).Count; $i++) {
        $trigger = $task.Triggers[$i]
        Assert-Equal $job.triggers[$i].type $trigger.CimClass.CimClassName "$key trigger type"
        foreach ($property in $trigger.CimInstanceProperties) {
            if ($property.Name -eq 'Repetition') {
                foreach ($entry in $property.Value.CimInstanceProperties) {
                    Assert-Equal $job.triggers[$i].Repetition.($entry.Name) $entry.Value "$key repetition $($entry.Name)"
                }
            } else { Assert-Equal $job.triggers[$i].($property.Name) $property.Value "$key trigger $($property.Name)" }
        }
    }
    $detail = Invoke-RestMethod "$BaseUrl/api/jobs/$($job.id)"
    Assert-Equal $detail.id $job.id "$key detail identity"
    Assert-Equal (Get-DefinitionHash $task) $before[$key] "$key unchanged task definition"
    $records += [ordered]@{
        task = $key; state = $job.state; enabled = $job.enabled; status = $job.status
        lastRunStatus = $job.lastRunStatus; lastTaskResult = $job.lastTaskResult
        lastRunAt = $job.lastRunAt; nextRunAt = $job.nextRunAt
        definitionUnchanged = $true; comparedFields = 'identity, description, state, enabled, result, times, missed counter, StartWhenAvailable, all trigger properties, detail ID'
    }
}
$summary = [ordered]@{ verifiedAt = [DateTimeOffset]::UtcNow.ToString('o'); gate = 'PASSED'; tasks = $records }
$summary | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
$summary | ConvertTo-Json -Depth 10
