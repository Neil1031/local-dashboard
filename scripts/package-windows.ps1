[CmdletBinding()]
param([string]$JdkHome)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
if ($env:OS -ne 'Windows_NT') { throw 'Build the Windows app-image on Windows.' }
if (!$JdkHome) {
    $candidates = @($env:JAVA_HOME)
    $javaCommand = Get-Command java.exe -ErrorAction SilentlyContinue
    if ($javaCommand) { $candidates += Split-Path (Split-Path $javaCommand.Source -Parent) -Parent }
    $candidates += @(Get-ChildItem "$env:USERPROFILE/.jdks" -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | ForEach-Object FullName)
    $JdkHome = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'bin/jpackage.exe')) } | Select-Object -First 1
}
if (!$JdkHome -or !(Test-Path -LiteralPath "$JdkHome/bin/jpackage.exe")) { throw 'A JDK 21-25 with jpackage is required to BUILD. Pass -JdkHome C:\path\to\jdk. End users need no JDK.' }
$JdkHome = (Resolve-Path -LiteralPath $JdkHome).Path
$release = Get-Content -LiteralPath "$JdkHome/release" -Raw
if ($release -notmatch 'JAVA_VERSION="(\d+)' -or [int]$Matches[1] -lt 21 -or [int]$Matches[1] -gt 25) { throw 'Use JDK 21-25 to build this application.' }
$previousJavaHome = $env:JAVA_HOME
Push-Location $repo
try {
    $env:JAVA_HOME = $JdkHome
    & ./mvnw.cmd -B clean verify
    if ($LASTEXITCODE -ne 0) { throw 'Maven clean verify failed.' }
    $inputDirectory = Join-Path $repo 'target/windows-input'
    $stage = Join-Path $repo 'target/windows-image'
    New-Item -ItemType Directory -Path $inputDirectory,$stage -Force | Out-Null
    $serverJar = @(Get-ChildItem target/local-dashboard-*.jar | Where-Object Name -Match '^local-dashboard-[0-9.]+\.jar$')
    $launcherJar = @(Get-ChildItem target/local-dashboard-*-launcher.jar)
    if ($serverJar.Count -ne 1 -or $launcherJar.Count -ne 1) { throw 'Expected exactly one dashboard JAR and launcher JAR.' }
    Copy-Item -LiteralPath $serverJar[0].FullName -Destination "$inputDirectory/dashboard.jar"
    Copy-Item -LiteralPath $launcherJar[0].FullName -Destination "$inputDirectory/launcher.jar"
    # Keep java/javaw in the bundled runtime for the server and documented debugging.
    & "$JdkHome/bin/jpackage.exe" --type app-image --name LocalDashboard --app-version 0.1.0 `
        --input $inputDirectory --dest $stage --main-jar launcher.jar `
        --main-class io.github.neil1031.dashboard.launcher.WindowsLauncher `
        --java-options '-Djava.awt.headless=false' `
        --add-modules 'java.se,jdk.unsupported,jdk.crypto.ec,jdk.charsets,jdk.management' `
        --jlink-options '--strip-debug --no-header-files --no-man-pages'
    if ($LASTEXITCODE -ne 0) { throw 'jpackage app-image failed.' }
    $image = Join-Path $stage 'LocalDashboard'
    & "$PSScriptRoot/validate-windows-package.ps1" -ImagePath $image
    Copy-Item -LiteralPath "$PSScriptRoot/install-shortcut.ps1" -Destination $image
    Copy-Item -LiteralPath "$repo/docs/WINDOWS-LAUNCHER.md" -Destination "$image/README.md"
    $dist = Join-Path $repo 'dist'
    New-Item -ItemType Directory -Path $dist -Force | Out-Null
    $destination = Join-Path $dist 'LocalDashboard'
    if (Test-Path -LiteralPath $destination) {
        # Never recursively delete an existing installation or files a user put in it.
        $backup = Join-Path $dist ('LocalDashboard.previous-' + [guid]::NewGuid().ToString('N'))
        Move-Item -LiteralPath $destination -Destination $backup
        Write-Host "Previous image preserved at $backup (may be removed manually when no longer needed)."
    }
    Move-Item -LiteralPath $image -Destination $destination
    Write-Host "Validated app-image: $destination/LocalDashboard.exe"
} finally {
    $env:JAVA_HOME = $previousJavaHome
    Pop-Location
}
