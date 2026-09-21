"""Windows packaged acceptance. Real browser dispatch; no browser UI automation.

Requires Python 3.11+, a built image, and the five existing tasks in the public
example config. Only reads Task Scheduler. Uses a fresh ignored external home.
Stops only servers matching the image, isolated config URI, PID and creation time.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import struct
import subprocess
import time
from urllib.request import ProxyHandler, build_opener
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
IMAGE = ROOT / "dist/LocalDashboard"
EXE = IMAGE / "LocalDashboard.exe"
WINDOWS_PS = Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe"
# Use the available PowerShell host without changing its execution policy.
PS = Path(shutil.which("pwsh.exe") or WINDOWS_PS)
OUT = ROOT / ".tools/windows-launcher-acceptance" / uuid4().hex
HOME = OUT / "external home 中文"
DB = HOME / "data/launcher-history.db"
LOG = HOME / "logs/launcher.log"
HTTP = build_opener(ProxyHandler({}))
REPORT = {"result": "RUNNING", "evidenceDirectory": str(OUT), "stages": {}}
SERVER = None
LAUNCHERS = []
ENV = os.environ.copy()
ENV.pop("JAVA_HOME", None)
ENV["PATH"] = str(WINDOWS_PS.parent) + ";" + str(WINDOWS_PS.parent.parent.parent)
ENV["LOCAL_DASHBOARD_HOME"] = str(HOME)


def ps(script):
    result = subprocess.run([str(PS), "-NoProfile", "-NonInteractive", "-EncodedCommand",
                             base64.b64encode(("$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; " + script).encode("utf-16le")).decode()],
                            cwd=ROOT, capture_output=True, timeout=60, creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:
        raise RuntimeError(result.stderr.decode("utf-8", errors="replace"))
    return result.stdout.decode("utf-8-sig").strip()


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def save():
    (OUT / "verification.json").write_text(json.dumps(REPORT, ensure_ascii=False, indent=2), encoding="utf-8")


def stage(name, evidence):
    REPORT["stages"][name] = evidence
    save()
    print("PASS " + name, flush=True)


def state():
    return json.loads(ps("[Console]::OutputEncoding=[Text.Encoding]::UTF8; "
        "$listeners=@(Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | "
        "Select-Object LocalAddress,OwningProcess); "
        "$processes=@(Get-CimInstance Win32_Process -Filter \"Name='javaw.exe' OR Name='LocalDashboard.exe'\" | "
        "Select-Object ProcessId,ExecutablePath,CommandLine,@{n='Created';e={$_.CreationDate.ToUniversalTime().ToString('o')}}); "
        "@{listeners=$listeners;processes=$processes} | ConvertTo-Json -Depth 5"))


def servers(snapshot):
    return [p for p in snapshot["processes"] if p["ExecutablePath"] == str(IMAGE / "runtime/bin/javaw.exe")
            and str(IMAGE / "app/dashboard.jar") in (p["CommandLine"] or "")
            and HOME.as_uri().replace("%E4%B8%AD%E6%96%87", "中文") in (p["CommandLine"] or "")]


def http(path):
    with HTTP.open("http://127.0.0.1:8080" + path, timeout=35) as response:
        assert response.status == 200
        return response.read().decode("utf-8")


def healthy():
    assert http("/api/launcher/status") == "local-dashboard:ready:v1"
    assert "<title>Local Dashboard</title>" in http("/")
    jobs = json.loads(http("/api/jobs"))
    assert jobs["collectionStatus"] in ("OK", "PARTIAL") and len(jobs["jobs"]) == 5, jobs["collectionStatus"]
    assert all(k in jobs for k in ("collectedAt", "errors", "unmatchedIncludes"))
    assert all(k in job for job in jobs["jobs"] for k in ("id", "name", "state", "status", "lastRunStatus"))
    return {"http": 200, "html": "Local Dashboard", "collectionStatus": jobs["collectionStatus"], "jobs": len(jobs["jobs"])}


def events(launcher):
    # jpackage may re-exec a child GUI launcher before starting the JVM.
    return [line for line in LOG.read_text(encoding="utf-8").splitlines()
            if f"launcherPid={launcher.pid} " in line or f"launcherParentPid={launcher.pid} " in line]


def start():
    launcher = subprocess.Popen([str(EXE)], cwd=os.environ["TEMP"], env=ENV, creationflags=subprocess.CREATE_NO_WINDOW)
    LAUNCHERS.append(launcher)
    return launcher


def wait(launcher):
    global SERVER
    deadline = time.monotonic() + 100
    # Discover only this isolated child so finally can safely clean up failed starts too.
    while launcher.poll() is None and time.monotonic() < deadline:
        found = servers(state())
        if found:
            assert len(found) == 1
            SERVER = found[0]
        time.sleep(.15)
    assert launcher.poll() == 0, "Launcher failed or displayed an error dialog; inspect isolated logs"
    snapshot = state()
    found = servers(snapshot)
    assert len(found) == 1, snapshot
    SERVER = found[0]
    assert snapshot["listeners"] == [{"LocalAddress": "127.0.0.1", "OwningProcess": SERVER["ProcessId"]}], snapshot
    assert not [p for p in snapshot["processes"] if p["ExecutablePath"] == str(EXE)]
    lines = events(launcher)
    assert any("BROWSER_OPEN_REQUESTED Desktop.browse" in line for line in lines)
    assert any("BROWSER_DISPATCHED" in line for line in lines)
    count = sum(p["ExecutablePath"] == str(IMAGE / "runtime/bin/javaw.exe") for p in snapshot["processes"])
    assert count == 1
    return {"server": SERVER, "packagedServerCount": count, "listener": snapshot["listeners"], "events": lines, "http": healthy()}


def stop():
    global SERVER
    if SERVER is None:
        return
    snapshot = state()
    current = [p for p in snapshot["processes"] if p["ProcessId"] == SERVER["ProcessId"]]
    if not current:
        SERVER = None
        return
    assert current == [SERVER] and SERVER in servers(snapshot), "Refusing to stop a changed/unrelated process"
    assert all(l["LocalAddress"] == "127.0.0.1" and l["OwningProcess"] == SERVER["ProcessId"] for l in snapshot["listeners"])
    # Repeat identity check immediately before termination, including creation time.
    ps(f"$p=Get-CimInstance Win32_Process -Filter 'ProcessId={SERVER['ProcessId']}'; "
       f"if ($p.ExecutablePath -ne {quote(SERVER['ExecutablePath'])} -or $p.CommandLine -ne {quote(SERVER['CommandLine'])} "
       f"-or $p.CreationDate.ToUniversalTime().ToString('o') -ne {quote(SERVER['Created'])}) {{ throw 'Identity changed' }}; "
       f"$owned=Get-Process -Id {SERVER['ProcessId']}; Stop-Process -InputObject $owned; $owned.WaitForExit(); $owned.Dispose()")
    after = state()
    assert not after["listeners"] and not servers(after)
    SERVER = None


def database():
    with sqlite3.connect(DB.as_uri() + "?mode=ro", uri=True) as connection:
        rows = connection.execute("SELECT id,job_id,observed_run_at,outcome FROM job_run ORDER BY id").fetchall()
        assert rows, "No confirmed observed history; acceptance requires existing completed task history"
        assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    return {"path": str(DB), "size": DB.stat().st_size, "sha256": hashlib.sha256(DB.read_bytes()).hexdigest(), "rows": rows}


def task_hashes():
    return json.loads(ps("function Hash([string]$s) { $sha=[Security.Cryptography.SHA256]::Create(); "
        "try { [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($s))) } finally {$sha.Dispose()} }; "
        "$names=@('InsiderTracker-Market','InsiderTracker-SEC','InsiderTracker-SyncImport',"
        "'AIStockHunter-UnexplainedVolume-HealthCheck','AIStockHunter-Accumulation-Weekly-Check'); "
        "$result=@(Get-ScheduledTask | Where-Object { $_.TaskPath -eq '\\' -and $_.TaskName -in $names } | ForEach-Object { "
        "$raw=Export-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath; [xml]$xml=$raw; "
        "@{key=$_.TaskPath+$_.TaskName;definition=(Hash $raw);actions=(Hash $xml.Task.Actions.OuterXml);triggers=(Hash $xml.Task.Triggers.OuterXml)} "
        "} | Sort-Object {$_.key}); ConvertTo-Json -InputObject $result -Depth 4"))


def shortcut():
    script = ROOT / "scripts/install-shortcut.ps1"
    ps(f"& {quote(script)}; & {quote(script)}")
    details = json.loads(ps("[Console]::OutputEncoding=[Text.Encoding]::UTF8; "
        "$desktop=[Environment]::GetFolderPath('Desktop'); $path=Join-Path $desktop 'Local Dashboard.lnk'; "
        "$shell=New-Object -ComObject WScript.Shell; $link=$shell.CreateShortcut($path); "
        "@{path=$path;target=$link.TargetPath;cwd=$link.WorkingDirectory;arguments=$link.Arguments;"
        "count=@(Get-ChildItem -LiteralPath $desktop -Filter 'Local Dashboard*.lnk').Count} | ConvertTo-Json; "
        "[void][Runtime.InteropServices.Marshal]::ReleaseComObject($link); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)"))
    assert details["target"] == str(EXE) and details["cwd"] == str(IMAGE)
    assert details["arguments"] == "" and details["count"] == 1
    return details


def main():
    OUT.mkdir(parents=True)
    (HOME / "config").mkdir(parents=True)
    (HOME / "data/receipts").mkdir(parents=True)
    config = (ROOT / "config/application.example.yml").read_text(encoding="utf-8").replace("data/local-dashboard.db", "data/launcher-history.db")
    (HOME / "config/application.yml").write_text(config, encoding="utf-8")
    marker = HOME / "data/receipts/packaging-persistence.txt"
    marker.write_text("Isolated packaging test marker; not a Runner receipt.\n", encoding="utf-8")
    before = task_hashes()
    assert len(before) == 5
    REPORT["taskDefinitionsBefore"] = before
    assert not state()["listeners"], "8080 already in use; never stop an unknown process"
    try:
        # PE Windows GUI subsystem (2), not console subsystem (3).
        for path in (EXE, IMAGE / "runtime/bin/javaw.exe"):
            data = path.read_bytes()
            pe = struct.unpack_from("<I", data, 0x3c)[0]
            assert struct.unpack_from("<H", data, pe + 24 + 68)[0] == 2
        launcher = start()
        first = wait(launcher)
        joined = "\n".join(first["events"])
        assert joined.index("READINESS_POLLING") < joined.index("READY_CONFIRMED") < joined.index("BROWSER_OPEN_REQUESTED") < joined.index("BROWSER_DISPATCHED")
        assert not (HOME / "data/local-dashboard.db").exists()
        first["environment"] = {"JAVA_HOME": None, "PATH": ENV["PATH"], "home": str(HOME)}
        first["stateFile"] = (Path(os.environ["LOCALAPPDATA"]) / "LocalDashboard/server.pid").read_text()
        assert first["stateFile"].splitlines()[0] == str(SERVER["ProcessId"])
        first["lockFileExists"] = (Path(os.environ["LOCALAPPDATA"]) / "LocalDashboard/launcher.lock").is_file()
        stage("packaged_exe_external_config_http_browser", first)
        baseline = database()
        old_pid = SERVER["ProcessId"]
        started = time.monotonic()
        second = wait(start())
        second["elapsedSeconds"] = round(time.monotonic() - started, 3)
        assert SERVER["ProcessId"] == old_pid and second["elapsedSeconds"] < 15
        assert any("EXISTING_INSTANCE_READY" in line for line in second["events"])
        assert "Server started" not in "\n".join(second["events"])
        stage("duplicate_launch", second)
        stop()
        stopped = database()
        restarted = wait(start())
        assert SERVER["ProcessId"] != old_pid
        after_restart = database()
        assert set(map(tuple, baseline["rows"])).issubset(set(map(tuple, after_restart["rows"])))
        stage("restart_persistence", {"before": baseline, "stopped": stopped, "after": after_restart, "instance": restarted})
        stop()
        before_build = database()
        marker_hash = hashlib.sha256(marker.read_bytes()).hexdigest()
        print("Rebuilding app-image with clean verify; isolated data retained outside target/dist...", flush=True)
        with (OUT / "rebuild.log").open("wb") as log:
            result = subprocess.run([str(PS), "-NoProfile", "-File", str(ROOT / "scripts/package-windows.ps1")],
                                    cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, timeout=300, creationflags=subprocess.CREATE_NO_WINDOW)
        assert result.returncode == 0, "Rebuild failed; inspect rebuild.log"
        assert database() == before_build and hashlib.sha256(marker.read_bytes()).hexdigest() == marker_hash
        stage("rebuild_persistence", {"database": before_build, "markerSha256": marker_hash})
        stage("desktop_shortcut", shortcut())
        # Exercise cold-start lock contention as well as warm double-click.
        concurrent = [start(), start()]
        results = [wait(p) for p in concurrent]
        assert len({r["server"]["ProcessId"] for r in results}) == 1
        assert sum("Server started" in "\n".join(r["events"]) for r in results) == 1
        assert any("WAIT_EXISTING_INSTANCE lock=held" in "\n".join(r["events"]) for r in results)
        assert set(map(tuple, baseline["rows"])).issubset(set(map(tuple, database()["rows"])))
        stage("rebuilt_image_concurrent_launch", results)
    finally:
        stop()
        for process in LAUNCHERS:
            if process.poll() is None:
                process.terminate()  # only Popen handles created by this verifier
                process.wait(timeout=10)
        after = task_hashes()
        REPORT["taskDefinitionsAfter"] = after
        REPORT["safeCleanup"] = not state()["listeners"] and not servers(state())
        save()
    assert before == after, "Task definition/actions/triggers changed"
    assert REPORT["safeCleanup"]
    stage("task_definitions_actions_triggers_unchanged", {"count": len(after)})
    REPORT["result"] = "PASSED"
    save()
    print("PASSED " + str(OUT / "verification.json"), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as failure:
        REPORT["result"] = "FAILED"
        REPORT["error"] = str(failure)
        if OUT.exists():
            save()
        raise
