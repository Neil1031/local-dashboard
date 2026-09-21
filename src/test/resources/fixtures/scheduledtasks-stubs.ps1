# In-memory cmdlet substitutes. Never registers, changes, or starts a Windows task.
function Import-Module { param($Name) }
function Get-ScheduledTask {
    foreach ($folder in @('\Research\', '\Archive\')) {
        [pscustomobject]@{
            TaskName = "報告 [daily] '; Write-Error injected; '"
            TaskPath = $folder
            Description = 'Unicode fixture'
            State = 'Ready'
            Settings = [pscustomobject]@{ Enabled = $true; StartWhenAvailable = $true }
            Triggers = @([pscustomobject]@{
                CimClass = [pscustomobject]@{ CimClassName = 'MSFT_TaskDailyTrigger' }
                CimInstanceProperties = @(
                    [pscustomobject]@{ Name = 'Enabled'; Value = $true },
                    [pscustomobject]@{ Name = 'DaysInterval'; Value = 1 },
                    [pscustomobject]@{ Name = 'StartBoundary'; Value = '2026-09-21T12:00:00+08:00' }
                )
            })
        }
    }
}
function Get-ScheduledTaskInfo {
    [CmdletBinding()]
    param([Parameter(ValueFromPipeline=$true)]$Task)
    process {
        if ($Task.TaskPath -eq '\Archive\') {
            Write-Error -Message 'Fixture access denied' -Category PermissionDenied
        }
        [pscustomobject]@{
            LastRunTime = [datetime]'2026-09-21T01:00:00'
            NextRunTime = [datetime]'2026-09-22T01:00:00'
            LastTaskResult = 1
            NumberOfMissedRuns = 0
        }
    }
}
