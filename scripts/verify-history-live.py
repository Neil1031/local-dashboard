"""Opt-in, read-only scheduler acceptance. Writes only isolated dashboard artifacts.

Requires Python 3.11+, built JAR, Java 21+, Node 22+, Playwright and Edge.
Uses the existing five monitored tasks from config/application.example.yml.
Never registers, changes, starts or stops a scheduled task.
"""
import argparse
import base64
import contextlib
import datetime as dt
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
TASKS = ["InsiderTracker-Market", "InsiderTracker-SEC", "InsiderTracker-SyncImport",
         "AIStockHunter-UnexplainedVolume-HealthCheck", "AIStockHunter-Accumulation-Weekly-Check"]


def scheduler_evidence():
    # Input contains literal names only; no generated PowerShell command text.
    script = r"""
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$names = [Console]::In.ReadToEnd() | ConvertFrom-Json
$rows = @(Get-ScheduledTask | Where-Object { $_.TaskPath -eq '\' -and $_.TaskName -in $names } | ForEach-Object {
    $task = $_
    $info = $task | Get-ScheduledTaskInfo
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($task | Export-ScheduledTask)))).Replace('-', '') }
    finally { $sha.Dispose() }
    [ordered]@{ name = $task.TaskName; taskPath = $task.TaskPath; definitionHash = $hash;
        state = $task.State.ToString().ToUpperInvariant(); enabled = [bool]$task.Settings.Enabled;
        lastTaskResult = [long]$info.LastTaskResult;
        lastRunAt = ([DateTimeOffset]$info.LastRunTime).ToUniversalTime().ToString('o');
        nextRunAt = ([DateTimeOffset]$info.NextRunTime).ToUniversalTime().ToString('o') }
})
ConvertTo-Json -InputObject $rows -Depth 5 -Compress
"""
    result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand",
                             base64.b64encode(script.encode("utf-16le")).decode()],
                            input=json.dumps(TASKS).encode("utf-8"), capture_output=True, check=True, timeout=45,
                            creationflags=subprocess.CREATE_NO_WINDOW)
    if result.stderr:
        raise RuntimeError(result.stderr.decode("utf-8", errors="replace"))
    rows = json.loads(result.stdout.decode("utf-8-sig"))
    assert len(rows) == len(TASKS), "Configured monitored tasks must all exist"
    return {row["taskPath"] + row["name"]: row for row in rows}


def instant(value):
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(dt.timezone.utc) if value else None


def read_json(url):
    with urllib.request.urlopen(url, timeout=40) as response:
        assert response.headers["Cache-Control"] == "no-store"
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--java", required=True, help="Java executable")
    parser.add_argument("--node", default="node", help="Node 22+ executable; Playwright via NODE_PATH")
    args = parser.parse_args()
    output_root = ROOT / "target/stage-3a"
    output_root.mkdir(parents=True, exist_ok=True)
    output = Path(tempfile.mkdtemp(prefix="live-", dir=output_root))
    database = output / "observed.db"
    before = scheduler_evidence()
    expected, stable_ids, observations, counts = {}, {}, [], []
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    base = f"http://127.0.0.1:{port}"

    def capture(snapshot):
        assert snapshot["collectionStatus"] == "OK", snapshot["errors"]
        assert len(snapshot["jobs"]) == len(TASKS)
        observations.append(snapshot)
        for job in snapshot["jobs"]:
            if job["lastRunAt"] and job["lastRunStatus"] in ("SUCCESS", "FAILED"):
                expected[(job["id"], instant(job["lastRunAt"]))] = job

    def check_database(label):
        with contextlib.closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)) as connection:
            connection.row_factory = sqlite3.Row
            assert connection.execute("PRAGMA user_version").fetchone()[0] == 1
            assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
            rows = connection.execute("SELECT * FROM job_run").fetchall()
            keys = [(row["job_id"], instant(row["observed_run_at"])) for row in rows]
            assert len(keys) == len(set(keys)), "Duplicate execution rows"
            assert set(keys) == set(expected), "DB must contain exactly the observed completed executions"
            for row, key in zip(rows, keys):
                job = expected[key]
                assert row["outcome"] == job["lastRunStatus"]
                assert row["scheduler_result"] == job["lastTaskResult"]
                assert row["duration_ms"] is None
                assert json.loads(row["raw_result"])["TaskName"] == job["name"]
                assert stable_ids.setdefault(key, row["id"]) == row["id"], "Run identity changed"
            counts.append({"phase": label, "jobs": connection.execute("SELECT count(*) FROM job").fetchone()[0],
                           "runs": len(rows), "duplicates": 0})

    for instance in range(2):
        with (output / f"application-{instance}.log").open("w", encoding="utf-8") as log:
            process = subprocess.Popen([args.java, "-jar", str(ROOT / "target/local-dashboard-0.1.0.jar"),
                f"--server.port={port}", "--server.address=127.0.0.1",
                "--spring.config.location=classpath:/application.yml,file:config/application.example.yml",
                f"--dashboard.history.database-path={database}"], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
                creationflags=subprocess.CREATE_NO_WINDOW)
            try:
                deadline = time.monotonic() + 30
                while True:
                    assert process.poll() is None, f"Application exited: {output}"
                    try:
                        with urllib.request.urlopen(base, timeout=1):
                            break
                    except OSError:
                        assert time.monotonic() < deadline, "Application startup timed out"
                        time.sleep(0.2)
                if instance == 0:
                    assert database.exists(), "Fresh startup must create DB before any collection"
                    check_database("fresh-startup")
                else:
                    check_database("restart-before-collection")
                for refresh in range(10 if instance == 0 else 3):
                    capture(read_json(base + "/api/jobs"))
                    check_database(f"instance-{instance}-refresh-{refresh + 1}")
                if instance == 1:
                    environment = dict(os.environ, DASHBOARD_LIVE_URL=base)
                    with (output / "live-browser.log").open("w", encoding="utf-8") as browser_log:
                        subprocess.run([args.node, "--test", "tests/live-browser.test.mjs"], cwd=ROOT,
                                       env=environment, stdout=browser_log, stderr=subprocess.STDOUT, check=True, timeout=90)
                    browser = json.loads((ROOT / "target/stage-2/live-ui.json").read_text(encoding="utf-8"))
                    capture(browser["snapshot"])
                    capture(browser["refreshed"])
                    check_database("after-browser-load-refresh")
                    current = scheduler_evidence()
                    for job in observations[-1]["jobs"]:
                        actual = current[job["taskPath"] + job["name"]]
                        for field in ("state", "enabled", "lastTaskResult"):
                            assert job[field] == actual[field], f"Scheduler changed during comparison: {field}"
                        for field in ("lastRunAt", "nextRunAt"):
                            value = instant(actual[field])
                            assert instant(job[field]) == (value if value.year > 1899 else None), field
            finally:
                process.terminate()  # Stop only the dashboard process this script created.
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=10)
    after = scheduler_evidence()
    assert {key: row["definitionHash"] for key, row in before.items()} == {
        key: row["definitionHash"] for key, row in after.items()}, "Monitored task definitions changed"
    receipt = {"gate": "PASSED", "verifiedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
               "database": str(database), "counts": counts, "observations": observations,
               "before": before, "after": after, "taskDefinitionsUnchanged": True,
               "independentSchedulerComparison": "5/5", "applicationInstances": 2}
    (output / "receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"gate": "PASSED", "receipt": str(output / "receipt.json"),
                      "counts": counts, "taskDefinitionsUnchanged": True}, indent=2))


if __name__ == "__main__":
    main()
