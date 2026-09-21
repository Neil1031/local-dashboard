"""Stage 5A Windows test-only packaged runner acceptance. Never uses Task Scheduler.

Run after mvnw verify. Starts only the runner JAR and the compiled RunnerFixture;
no Spring service, HTTP server, SQLite, real scheduled command or credentials.
All generated configs/receipts/markers stay in an ignored, isolated target directory.
"""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import zipfile

ROOT = Path(__file__).resolve().parents[1]
JAR = ROOT / "target/local-dashboard-0.1.0-runner.jar"
FIXTURE = "io.github.neil1031.dashboard.runner.RunnerFixture"


def wait_until(condition, seconds=15):
    deadline = time.monotonic() + seconds
    while not condition():
        assert time.monotonic() < deadline, "Fixture deadline exceeded"
        time.sleep(0.025)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--java", required=True)
    args = parser.parse_args()
    java = str(Path(args.java).resolve(strict=True))
    assert os.name == "nt", "This acceptance is explicitly for Windows"
    output_root = ROOT / "target/stage-5a"
    output_root.mkdir(parents=True, exist_ok=True)
    output = Path(tempfile.mkdtemp(prefix="runner-", dir=output_root)).resolve()
    with zipfile.ZipFile(JAR) as jar:
        assert "Start-Class: io.github.neil1031.dashboard.runner.RunnerMain" in jar.read("META-INF/MANIFEST.MF").decode()
        assert not any("RunnerFixture" in name for name in jar.namelist())
    results = []

    def setup(name, command, primary="receipts", fallback="fallback", executable=java):
        directory = output / name
        directory.mkdir()
        config = directory / "runner.json"
        config.write_text(json.dumps({"schemaVersion": 1, "receiptDirectory": primary,
            "fallbackDirectory": fallback, "profiles": {"fixture": {
                "jobId": "test-only", "executable": executable,
                "args": ["-cp", str(ROOT / "target/test-classes"), FIXTURE, *command],
                "workingDirectory": str(directory)}}}, ensure_ascii=False), encoding="utf-8")
        return directory, config

    def start(config, profile="fixture"):
        return subprocess.Popen([java, "-jar", str(JAR), "run", str(config), profile], cwd=config.parent,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=subprocess.CREATE_NO_WINDOW)

    def finish(process, expected):
        stdout, stderr = process.communicate(timeout=25)
        assert process.returncode == expected, (process.returncode, expected)
        assert stdout == b"", "Child output/Spring logs must not leak to runner stdout"
        assert b"Spring" not in stderr and b"Tomcat" not in stderr
        return stderr.decode("utf-8")

    def receipts(directory, spool="receipts"):
        return [json.loads(path.read_text(encoding="utf-8")) for path in (directory / spool).glob("*/02-terminal.json")]

    def check(receipt, code):
        assert receipt["schemaVersion"] == 1
        assert receipt["phase"] == "TERMINAL"
        assert receipt["outcome"] == ("SUCCESS" if code == 0 else "FAILED")
        assert receipt["exitCode"] == receipt["runnerExitCode"] == code
        assert receipt["durationMs"] >= 0
        assert receipt["processStartFailure"] is None and receipt["terminationReason"] is None
        times = [dt.datetime.fromisoformat(receipt[key].replace("Z", "+00:00"))
                 for key in ("startedAt", "processStartedAt", "finishedAt", "createdAt")]
        assert times == sorted(times)

    # Complete child -> actual OS runner exit; no dashboard ever started by this verifier.
    for code in (0, 1, 7, 3010):
        directory, config = setup(f"exit-{code}", ["exit", str(code)])
        finish(start(config), code)
        receipt, = receipts(directory)
        check(receipt, code)
        results.append({"case": f"exit-{code}", "outcome": receipt["outcome"], "exitCode": code})

    directory, config = setup("start-failed", ["exit", "0"], executable=str(output / "absent.exe"))
    finish(start(config), 127)
    receipt, = receipts(directory)
    assert receipt["outcome"] == "START_FAILED" and receipt["processStartedAt"] is None and receipt["exitCode"] is None
    results.append({"case": "start-failed", "outcome": "START_FAILED", "runnerExitCode": 127})

    directory, config = setup("中文 空白", ["unicode", '參數 空白 & ; $(test) "literal"'])
    finish(start(config), 0)
    receipt, = receipts(directory)
    check(receipt, 0)
    assert (directory / "輸出 文件.txt").read_text(encoding="utf-8") == "中文 😀"
    assert receipt["stdout"]["observedBytes"] == len("中文 😀".encode())
    assert receipt["stderr"]["observedBytes"] == len("錯誤 測試".encode())
    results.append({"case": "unicode-path-argv-output", "passed": True})

    directory, config = setup("large", ["flood", str(16 * 1024 * 1024)])
    finish(start(config), 0)
    receipt, = receipts(directory)
    for stream in ("stdout", "stderr"):
        assert receipt[stream] == {"observedBytes": 16 * 1024 * 1024, "sampleLimitBytes": 65536,
                                   "sampledBytes": 65536, "truncated": True, "complete": True,
                                   "readFailed": False, "contentStored": False}
    results.append({"case": "simultaneous-large-streams", "bytesPerStream": 16777216, "sampleLimitBytes": 65536})

    for all_failed in (False, True):
        directory, config = setup("all-stores-failed" if all_failed else "fallback",
                                  ["marker", "marker.txt", "0"], "blocked/receipts",
                                  "blocked/fallback" if all_failed else "fallback")
        (directory / "blocked").write_text("test-only file blocks directory creation")
        diagnostic = finish(start(config), 0)
        assert (directory / "marker.txt").read_text() == "child-executed"
        assert ("RUNNER_RECEIPT_UNAVAILABLE" if all_failed else "RUNNER_FALLBACK_ACTIVE") in diagnostic
        assert str(directory) not in diagnostic
        if not all_failed:
            receipt, = receipts(directory, "fallback")
            check(receipt, 0)
        results.append({"case": directory.name, "childExecuted": True, "runnerExitCode": 0})

    directory, config = setup("concurrent", ["exit", "7"])
    processes = [start(config) for _ in range(4)]
    for process in processes:
        finish(process, 7)
    before = {p: p.read_bytes() for p in (directory / "receipts").rglob("*.json")}
    finish(start(config), 7)
    rows = receipts(directory)
    assert len({row["executionId"] for row in rows}) == 5
    assert all(p.read_bytes() == value for p, value in before.items()), "Restart overwrote earlier receipts"
    results.append({"case": "concurrent-and-repeated", "distinctExecutions": 5, "existingBytesUnchanged": True})

    # Force a failure only AFTER start evidence exists. Preserve the original evidence by renaming within this isolated case.
    directory, config = setup("late-persistence-failure", ["wait-marker", "started", "finished", "1800"])
    process = start(config)
    wait_until(lambda: (directory / "started").exists() and list((directory / "receipts").glob("*/01-process-started.json")))
    source, archive = directory / "receipts", directory / "archived"
    assert source.resolve().is_relative_to(output) and archive.resolve().is_relative_to(output)
    source.rename(archive)
    source.write_text("block subsequent writes")
    finish(process, 0)
    receipt, = receipts(directory, "fallback")
    old, = archive.glob("*/01-process-started.json")
    assert json.loads(old.read_text())["executionId"] == receipt["executionId"]
    assert (directory / "finished").exists()
    results.append({"case": "terminal-fallback", "sameExecutionId": True, "childExecuted": True})

    # Kill only our runner process, while a finite test child is alive. Never kill its descendants.
    directory, config = setup("crash", ["wait-marker", "started", "finished", "2000"])
    process = start(config)
    wait_until(lambda: (directory / "started").exists() and list((directory / "receipts").glob("*/01-process-started.json")))
    process.kill()
    process.communicate(timeout=10)
    wait_until(lambda: (directory / "finished").exists())
    assert not receipts(directory)
    incomplete, = (directory / "receipts").glob("*/01-process-started.json")
    row = json.loads(incomplete.read_text())
    assert row["outcome"] == "UNKNOWN" and row["finishedAt"] is None and row["exitCode"] is None
    frozen = incomplete.read_bytes()
    finish(start(config), 0)
    assert incomplete.read_bytes() == frozen and len(receipts(directory)) == 1
    results.append({"case": "runner-crash-and-restart", "incompleteOutcome": "UNKNOWN", "childSurvived": True,
                    "oldReceiptPreserved": True, "newExecutionTerminal": True})

    directory, config = setup("descendant", ["descendant", "desc-started", "desc-finished", "9000"])
    began = time.monotonic()
    finish(start(config), 7)
    elapsed = time.monotonic() - began
    assert elapsed < 8, "Inherited pipes prevented runner exit after direct child ended"
    assert (directory / "desc-started").exists()
    assert not (directory / "desc-finished").exists(), "Fixture should still be alive when runner exits"
    receipt, = receipts(directory)
    check(receipt, 7)
    assert not receipt["stdout"]["complete"] and not receipt["stderr"]["complete"]
    wait_until(lambda: (directory / "desc-finished").exists())
    results.append({"case": "descendant-survives", "runnerExitCode": 7, "outputComplete": False,
                    "runnerElapsedSeconds": round(elapsed, 3), "descendantFinished": True})

    directory, config = setup("untrusted-id", ["marker", "must-not-exist", "0"])
    finish(start(config, "fixture & whoami"), 64)
    assert not (directory / "must-not-exist").exists() and not (directory / "receipts").exists()
    results.append({"case": "untrusted-profile-id", "runnerExitCode": 64, "noChild": True})

    report = {"gate": "PASSED", "verifiedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
              "packagedRunner": True, "dashboardStarted": False, "schedulerCommandsUsed": False, "cases": results}
    (output / "verification.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"gate": report["gate"], "cases": len(results), "receipt": str(output / "verification.json")}, indent=2))


if __name__ == "__main__":
    main()
