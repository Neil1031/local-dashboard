[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ImagePath)
$ErrorActionPreference = 'Stop'
$image = (Resolve-Path -LiteralPath $ImagePath).Path
foreach ($relative in @('LocalDashboard.exe','app/launcher.jar','app/dashboard.jar','runtime/bin/javaw.exe','runtime/bin/java.exe')) {
    if (!(Test-Path -LiteralPath (Join-Path $image $relative))) { throw "Package missing $relative" }
}
# Isolated smoke check: no private config, no task selection, no browser, no production DB.
$probe = Join-Path ([IO.Path]::GetTempPath()) ('dashboard-package-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $probe | Out-Null
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$oldJavaHome = $env:JAVA_HOME
$oldPath = $env:PATH
$oldLocalAppData = $env:LOCALAPPDATA
$process = $null
try {
    $env:JAVA_HOME = $null
    $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot\System32\WindowsPowerShell\v1.0"
    $arguments = @('-jar', ('"' + $image + '\app\dashboard.jar"'), '--server.address=127.0.0.1', "--server.port=$port", '--spring.config.location=classpath:/application.yml')
    $process = Start-Process -FilePath "$image/runtime/bin/javaw.exe" -ArgumentList $arguments `
        -WorkingDirectory $probe -WindowStyle Hidden -PassThru -RedirectStandardOutput "$probe/server.log" -RedirectStandardError "$probe/stderr.log"
    $deadline = [DateTime]::UtcNow.AddSeconds(90)
    $ready = $false
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($process.HasExited) { throw "Packaged server exited; inspect $probe/server.log" }
        try { $ready = (Invoke-WebRequest "http://127.0.0.1:$port/api/launcher/status" -UseBasicParsing -TimeoutSec 2).Content -eq 'local-dashboard:ready:v1' } catch { $ready = $false }
        if ($ready) { break }
        Start-Sleep -Milliseconds 150
    }
    if (!$ready) { throw "Packaged server readiness timed out; inspect $probe/server.log" }
    $jobs = Invoke-RestMethod "http://127.0.0.1:$port/api/jobs"
    if ($jobs.collectionStatus -ne 'NOT_CONFIGURED') { throw 'Safe empty configuration smoke check failed.' }
    if (!(Test-Path -LiteralPath "$probe/data/local-dashboard.db")) { throw 'SQLite initialization failed.' }
    Write-Host "PASS: bundled runtime, no JAVA_HOME/Java PATH, HTTP readiness, safe defaults, writable SQLite. Logs: $probe"
    # Exercise the packaged entry point without creating config or touching the user's PID.
    $env:LOCALAPPDATA = Join-Path $probe 'stop-localappdata'
    $occupied43871 = @(Get-NetTCPConnection -LocalPort 43871 -State Listen -ErrorAction SilentlyContinue).Count -gt 0
    $stop = Start-Process -FilePath "$image/LocalDashboard.exe" -ArgumentList '--stop','--quiet' -WindowStyle Hidden -PassThru
    $null = $stop.Handle
    if (!$stop.WaitForExit(30000)) { $stop.Kill(); throw 'Packaged stop entry point timed out.' }
    $expectedStopExit = if ($occupied43871) { 1 } else { 0 }
    if ($stop.ExitCode -ne $expectedStopExit) { throw "Packaged stop entry point failed: exit $($stop.ExitCode), expected $expectedStopExit." }
    $stopLog = Get-Content -LiteralPath "$env:LOCALAPPDATA/LocalDashboard/logs/stop.log" -Raw
    if ($occupied43871 -and $stopLog -notmatch 'No recorded server; port 43871 is occupied') { throw 'Expected safe refusal of unrecorded listener.' }
    if (Test-Path -LiteralPath "$env:LOCALAPPDATA/LocalDashboard/config/application.yml") { throw 'Stop must not bootstrap configuration.' }
    Write-Host "PASS: packaged --stop entry point (exit $expectedStopExit), no configuration bootstrap, no unrecorded process termination."
} finally {
    if ($process -and !$process.HasExited) { Stop-Process -Id $process.Id; $process.WaitForExit() }
    $env:JAVA_HOME = $oldJavaHome
    $env:PATH = $oldPath
    $env:LOCALAPPDATA = $oldLocalAppData
}
