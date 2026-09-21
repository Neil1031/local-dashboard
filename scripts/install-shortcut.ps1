[CmdletBinding()]
param(
    [string]$ExecutablePath,
    [string]$DesktopDirectory = [Environment]::GetFolderPath('Desktop'),
    [switch]$Replace
)
$ErrorActionPreference = 'Stop'
if (!$ExecutablePath) {
    $ExecutablePath = Join-Path $PSScriptRoot 'LocalDashboard.exe'
    if (!(Test-Path -LiteralPath $ExecutablePath)) { $ExecutablePath = Join-Path (Split-Path $PSScriptRoot -Parent) 'dist/LocalDashboard/LocalDashboard.exe' }
}
$exe = (Resolve-Path -LiteralPath $ExecutablePath).Path
if ([IO.Path]::GetFileName($exe) -ne 'LocalDashboard.exe') { throw 'Select the packaged LocalDashboard.exe.' }
if (!(Test-Path -LiteralPath $DesktopDirectory -PathType Container)) { throw 'Desktop directory does not exist.' }
$shortcutPath = Join-Path $DesktopDirectory 'Local Dashboard.lnk'
$shell = New-Object -ComObject WScript.Shell
try {
    $shortcut = $shell.CreateShortcut($shortcutPath)
    if ((Test-Path -LiteralPath $shortcutPath) -and $shortcut.TargetPath -ne $exe -and !$Replace) {
        throw 'A shortcut with a different target already exists. Inspect it, then use -Replace to update it explicitly.'
    }
    $shortcut.TargetPath = $exe
    $shortcut.Arguments = ''
    $shortcut.WorkingDirectory = Split-Path $exe -Parent
    $shortcut.Description = 'Open Local Dashboard (local, read-only scheduler dashboard)'
    $shortcut.IconLocation = "$exe,0"
    $shortcut.Save()
    Write-Host "Shortcut created/updated: $shortcutPath"
} finally {
    if ($shortcut) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shortcut) }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)
}
