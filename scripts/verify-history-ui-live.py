"""Stage 3B acceptance using a copy of an existing real Stage 3A database.

Does not generate fixture history or execute/mutate scheduled tasks. Only dashboard
GET /api/jobs observations may update the isolated copy. Original DB stays untouched.
"""
import argparse
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.request
import importlib.util

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("stage3a", ROOT / "scripts/verify-history-live.py")
stage3a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage3a)


def read_db(path):
    with contextlib.closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as db:
        db.row_factory = sqlite3.Row
        return {table: [dict(row) for row in db.execute(f"SELECT * FROM {table} ORDER BY id")]
                for table in ("job", "job_run")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-db", type=Path, required=True)
    parser.add_argument("--java", required=True)
    parser.add_argument("--node", required=True)
    args = parser.parse_args()
    source = args.source_db.resolve(strict=True)
    original_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    original = read_db(source)
    assert original["job_run"], "Must use existing real persisted executions"
    output_root = ROOT / "target/stage-3b"
    output_root.mkdir(parents=True, exist_ok=True)
    output = Path(tempfile.mkdtemp(prefix="live-", dir=output_root))
    database = output / "observed.db"
    with contextlib.closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as src:
        with contextlib.closing(sqlite3.connect(database)) as dst:
            src.backup(dst)
    before_tasks = stage3a.scheduler_evidence()
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    with (output / "application.log").open("w", encoding="utf-8") as log:
        process = subprocess.Popen([args.java, "-jar", str(ROOT / "target/local-dashboard-0.1.0.jar"),
            f"--server.port={port}", "--server.address=127.0.0.1",
            "--spring.config.location=classpath:/application.yml,file:config/application.example.yml",
            f"--dashboard.history.database-path={database}"], cwd=ROOT,
            stdout=log, stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            deadline = time.monotonic() + 30
            while True:
                assert process.poll() is None, "Dashboard exited during startup"
                try:
                    with urllib.request.urlopen(base, timeout=1):
                        break
                except OSError:
                    assert time.monotonic() < deadline, "Startup timeout"
                    time.sleep(0.2)
            environment = dict(os.environ, DASHBOARD_LIVE_URL=base)
            with (output / "browser.log").open("w", encoding="utf-8") as browser_log:
                subprocess.run([args.node, "--test", "--test-concurrency=1", "tests/live-browser.test.mjs", "tests/live-history-browser.test.mjs"],
                    cwd=ROOT, env=environment, stdout=browser_log, stderr=subprocess.STDOUT, check=True, timeout=120)
            browser = json.loads((output_root / "live-history.json").read_text(encoding="utf-8"))
            actual = read_db(database)
            start, end = stage3a.instant(browser["history"]["from"]), stage3a.instant(browser["history"]["to"])
            expected = [row for row in actual["job_run"] if start <= stage3a.instant(row["observed_run_at"]) < end]
            api_rows = [(job, run) for job in browser["history"]["jobs"] for run in job["runs"]]
            assert len(api_rows) == len(expected) == browser["checkedExecutions"]
            assert {run["id"] for _, run in api_rows} == {row["id"] for row in expected}
            for job, run in api_rows:
                row = next(row for row in expected if row["id"] == run["id"])
                metadata = next(j for j in actual["job"] if j["id"] == row["job_id"])
                assert job["id"] == row["job_id"]
                assert (job["taskName"], job["taskPath"]) == (metadata["task_name"], metadata["task_path"])
                assert job["enabled"] == (None if metadata["enabled"] is None else bool(metadata["enabled"]))
                assert stage3a.instant(run["observedRunAt"]) == stage3a.instant(row["observed_run_at"])
                for dto, sql in (("outcome", "outcome"), ("schedulerResult", "scheduler_result"), ("durationMs", "duration_ms"), ("message", "message")):
                    assert run[dto] == row[sql], dto
            # Ensure the UI really displayed records originating in Stage 3A, not only new observations.
            original_ids = {row["id"] for row in original["job_run"]}
            original_displayed = original_ids & {run["id"] for _, run in api_rows}
            assert original_displayed
            before_bytes = database.read_bytes()
            for _ in range(10):
                assert stage3a.read_json(browser["requests"][1]) == browser["history"]
            assert read_db(database) == actual, "History reads mutated records or observation timestamps"
            assert database.read_bytes() == before_bytes, "History reads changed database bytes"
        finally:
            process.terminate()  # Only the dashboard process created by this script.
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
    after_tasks = stage3a.scheduler_evidence()
    assert {key: value["definitionHash"] for key, value in before_tasks.items()} == {
        key: value["definitionHash"] for key, value in after_tasks.items()}
    assert hashlib.sha256(source.read_bytes()).hexdigest() == original_hash
    receipt = {"gate": "PASSED", "verifiedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "sourceDatabase": str(source), "sourceSha256": original_hash, "sourceUnchanged": True,
        "database": str(database), "originalRunCount": len(original["job_run"]),
        "originalRunsDisplayed": sorted(original_displayed), "range": {"from": browser["history"]["from"], "to": browser["history"]["to"]},
        "queryRunCount": len(expected), "outcomes": {state: sum(row["outcome"] == state for row in expected) for state in ("SUCCESS", "FAILED")},
        "checkedCells": browser["checkedCells"], "checkedExecutions": browser["checkedExecutions"],
        "repeatedReads": 10, "dbBytesUnchangedByReads": True, "taskDefinitionsUnchanged": True,
        "beforeTasks": before_tasks, "afterTasks": after_tasks}
    (output / "receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({**{key: value for key, value in receipt.items() if key not in ("beforeTasks", "afterTasks")}, "receipt": str(output / "receipt.json")}, indent=2))


if __name__ == "__main__":
    main()
