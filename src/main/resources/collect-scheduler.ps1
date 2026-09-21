$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

function Test-Selector($Selector, $Task) {
    # Use invariant lowercase + ordinal comparison, as in Java TaskSelection.
    $Selector = $Selector.ToLowerInvariant()
    $name = $Task.TaskName.ToLowerInvariant()
    $full = ($Task.TaskPath + $Task.TaskName).ToLowerInvariant()
    if ($Selector.Length -gt 1 -and $Selector.IndexOf('*') -eq $Selector.Length - 1) {
        $target = if ($Selector.StartsWith('\')) { $full } else { $name }
        return $target.StartsWith($Selector.Substring(0, $Selector.Length - 1), [StringComparison]::Ordinal)
    }
    if ($Selector.StartsWith('\')) {
        if ($Selector.EndsWith('\')) {
            return $full.StartsWith($Selector, [StringComparison]::Ordinal)
        }
        return [string]::Equals($full, $Selector, [StringComparison]::Ordinal)
    }
    return [string]::Equals($name, $Selector, [StringComparison]::Ordinal)
}

function Convert-Date($Value) {
    if ($null -eq $Value) { return $null }
    # Retain sentinel dates in raw JSON. Java maps them to null in the public model.
    return ([DateTimeOffset]$Value).ToString('o', [Globalization.CultureInfo]::InvariantCulture)
}

function Convert-Trigger($Trigger) {
    $values = [ordered]@{ type = $Trigger.CimClass.CimClassName }
    foreach ($property in $Trigger.CimInstanceProperties) {
        if ($property.Name -eq 'Repetition' -and $null -ne $property.Value) {
            $repeat = [ordered]@{}
            foreach ($entry in $property.Value.CimInstanceProperties) { $repeat[$entry.Name] = $entry.Value }
            $values[$property.Name] = $repeat
        } else { $values[$property.Name] = $property.Value }
    }
    return $values
}

try {
    $config = [Console]::In.ReadToEnd() | ConvertFrom-Json
    Import-Module ScheduledTasks -ErrorAction Stop
    $tasks = @(Get-ScheduledTask -ErrorAction Stop)
    $rows = @()
    $errors = @()
    $matched = @{}
    foreach ($task in $tasks) {
        $included = $false
        foreach ($selector in $config.include) {
            if (Test-Selector $selector $task) { $included = $true; $matched[$selector] = $true }
        }
        if (-not $included) { continue }
        $excluded = $false
        foreach ($selector in $config.exclude) {
            if (Test-Selector $selector $task) { $excluded = $true }
        }
        if ($excluded) { continue }
        $info = $null
        $taskError = $null
        try { $info = $task | Get-ScheduledTaskInfo -ErrorAction Stop }
        catch {
            $code = if ($_.CategoryInfo.Category -eq 'PermissionDenied' -or $_.Exception.HResult -eq -2147024891) { 'PERMISSION_DENIED' } else { 'TASK_INFO_UNAVAILABLE' }
            $taskError = [ordered]@{ code = $code; taskPath = $task.TaskPath; taskName = $task.TaskName; message = $_.Exception.Message }
            $errors += $taskError
        }
        $rows += [ordered]@{
            TaskName = $task.TaskName
            TaskPath = $task.TaskPath
            Description = $task.Description
            State = $task.State.ToString()
            Enabled = [bool]$task.Settings.Enabled
            LastRunTime = if ($null -ne $info) { Convert-Date $info.LastRunTime } else { $null }
            LastTaskResult = if ($null -ne $info) { [long]$info.LastTaskResult } else { $null }
            NextRunTime = if ($null -ne $info) { Convert-Date $info.NextRunTime } else { $null }
            NumberOfMissedRuns = if ($null -ne $info) { $info.NumberOfMissedRuns } else { $null }
            StartWhenAvailable = [bool]$task.Settings.StartWhenAvailable
            Triggers = @($task.Triggers | ForEach-Object { Convert-Trigger $_ })
            CollectionError = $taskError
        }
    }
    $unmatched = @($config.include | Where-Object { -not $matched.ContainsKey($_) })
    [ordered]@{
        schemaVersion = 1
        collectedAt = [DateTimeOffset]::UtcNow.ToString('o')
        tasks = @($rows)
        errors = @($errors)
        unmatchedIncludes = @($unmatched)
    } | ConvertTo-Json -Depth 16 -Compress
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
