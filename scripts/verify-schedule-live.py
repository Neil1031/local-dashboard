"""Opt-in packaged-JAR acceptance using five read-only live Scheduler tasks and an isolated DB."""
import argparse
import base64
import contextlib
import hashlib
import json
from pathlib import Path
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
NAMES = ["InsiderTracker-Market", "InsiderTracker-SyncImport", "InsiderTracker-SEC",
         "AIStockHunter-UnexplainedVolume-Daily", "AIStockHunter-Accumulation-Weekly-Check"]


def definitions():
    script = r"""
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$names = [Console]::In.ReadToEnd() | ConvertFrom-Json
$rows = @(Get-ScheduledTask | Where-Object { $_.TaskPath -eq '\' -and $_.TaskName -in $names } | ForEach-Object {
    $xml = $_ | Export-ScheduledTask
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($xml))).Replace('-', '') }
    finally { $sha.Dispose() }
    [ordered]@{ name = $_.TaskName; hash = $hash }
})
ConvertTo-Json -InputObject $rows -Compress
"""
    encoded = base64.b64encode(script.encode("utf-16le")).decode("ascii")
    result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
                            input=json.dumps(NAMES).encode(), capture_output=True, check=True, timeout=45,
                            creationflags=subprocess.CREATE_NO_WINDOW)
    if result.stderr:
        raise RuntimeError(result.stderr.decode(errors="replace"))
    rows = json.loads(result.stdout.decode("utf-8-sig"))
    assert {r["name"] for r in rows} == set(NAMES), "Monitored task inventory changed"
    return {r["name"]: r["hash"] for r in rows}


def get(url):
    with urllib.request.urlopen(url, timeout=40) as response:
        return json.load(response)


def check_db(path):
    with contextlib.closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == 2
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
        versions = db.execute("SELECT job_id, fingerprint, definition_json FROM schedule_version").fetchall()
        observations = db.execute("SELECT job_id, presence_status FROM schedule_observation").fetchall()
        assert len(versions) == len(NAMES)
        assert len(observations) == len(NAMES)
        assert all(presence == "PRESENT" for _, presence in observations)
        definitions = [json.loads(row[2]) for row in versions]
        assert sorted(len(d["triggers"]) for d in definitions) == [1, 1, 1, 1, 2]
        for _, fingerprint, raw in versions:
            assert hashlib.sha256(raw.encode()).hexdigest() == fingerprint
            assert not any(term in raw for term in ("Executable", "ActionArgs", "Account", "SID", "LastRunTime", "NextRunTime"))
        return {"versions": len(versions), "observations": len(observations), "triggerCounts": sorted(len(d["triggers"]) for d in definitions)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--java", required=True)
    args = parser.parse_args()
    before = definitions()
    output = Path(tempfile.mkdtemp(prefix="schedule-live-", dir=ROOT / "target"))
    database = output / "history.db"
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    command = [args.java, "-jar", str(ROOT / "target/local-dashboard-0.1.0.jar"),
               "--spring.config.location=classpath:/application.yml", "--server.address=127.0.0.1",
               f"--server.port={port}", f"--dashboard.history.database-path={database}"]
    command.extend(f"--dashboard.scheduler.include[{i}]=\\{name}" for i, name in enumerate(NAMES))
    with (output / "server.log").open("w", encoding="utf-8") as log:
        process = subprocess.Popen(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
                                   creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            deadline = time.monotonic() + 45
            while True:
                assert process.poll() is None, f"Packaged server exited; inspect {output / 'server.log'}"
                try:
                    with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/launcher/status", timeout=1):
                        break
                except OSError:
                    assert time.monotonic() < deadline, "Packaged server startup timed out"
                    time.sleep(0.2)
            response = get(f"http://127.0.0.1:{port}/api/jobs")
            assert response["collectionStatus"] == "OK", response
            assert {job["name"] for job in response["jobs"]} == set(NAMES)
            result = check_db(database)
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
    assert definitions() == before, "Scheduler definitions changed during packaged acceptance"
    print(json.dumps({"gate": "PASSED", "database": str(database), "tasks": len(NAMES),
                      "schedulerDefinitionsUnchanged": True, **result}, indent=2))


if __name__ == "__main__":
    main()
