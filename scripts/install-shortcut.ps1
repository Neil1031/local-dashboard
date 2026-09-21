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
$shell = New-Object -ComObject WScript.Shell
$links = @()
try {
    # Preflight BOTH shortcuts before saving either; same executable with different
    # arguments is a different user action and also requires explicit -Replace.
    foreach ($spec in @(
        @{ Name='Local Dashboard'; Arguments=''; Description='Open Local Dashboard (local, read-only scheduler dashboard)' },
        @{ Name='Stop Local Dashboard'; Arguments='--stop'; Description='Safely stop the verified Local Dashboard server' }
    )) {
        $shortcutPath = Join-Path $DesktopDirectory ($spec.Name + '.lnk')
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $links += @{ Shortcut=$shortcut; Path=$shortcutPath; Spec=$spec }
        if ((Test-Path -LiteralPath $shortcutPath) -and
            ($shortcut.TargetPath -ne $exe -or $shortcut.Arguments -ne $spec.Arguments) -and !$Replace) {
            throw "A shortcut with a different target or arguments already exists: $shortcutPath. Inspect it, then use -Replace to update it explicitly."
        }
    }
    foreach ($item in $links) {
        $shortcut = $item.Shortcut
        $shortcut.TargetPath = $exe
        $shortcut.Arguments = $item.Spec.Arguments
        $shortcut.WorkingDirectory = Split-Path $exe -Parent
        $shortcut.Description = $item.Spec.Description
        $shortcut.IconLocation = "$exe,0"
        $shortcut.Save()
        Write-Host "Shortcut created/updated: $($item.Path)"
    }
} finally {
    foreach ($item in $links) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($item.Shortcut) }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)
}
