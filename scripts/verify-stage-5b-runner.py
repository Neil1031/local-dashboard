"""Verify the deployed pilot runtime with harmless PowerShell fixtures only.

Never registers or runs Scheduled Tasks, and never invokes the real stock script.
Private artifacts are written under the supplied external backup directory.
"""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import xml.etree.ElementTree as ET


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def offline():
    with socket.socket() as connection:
        connection.settimeout(0.5)
        assert connection.connect_ex(("127.0.0.1", 8080)) != 0, "Dashboard must be stopped"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup-directory", required=True)
    args = parser.parse_args()
    assert os.name == "nt", "Windows-only integration acceptance"
    backup = Path(args.backup_directory).resolve(strict=True)
    manifest = read_json(backup / "deployment.json")
    config = read_json(manifest["config"])
    assert hashlib.sha256(Path(manifest["config"]).read_bytes()).hexdigest().upper() == manifest["configHash"]
    for item in manifest["releaseHashes"]:
        assert hashlib.sha256(Path(item["path"]).read_bytes()).hexdigest().upper() == item["sha256"]
    profile = config["profiles"][manifest["profileId"]]
    action = ET.parse(backup / "original.xml").find("{*}Actions/{*}Exec")
    original_script = profile["args"][6]
    assert profile["executable"] == action.find("{*}Command").text
    assert profile["args"] == ["-NoProfile", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass",
                               "-File", original_script, "-Kind", "weekly-check", "-NoNotification"]
    raw_args = action.find("{*}Arguments").text
    expected_raw = ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + original_script
                    + '" -Kind weekly-check -NoNotification')
    assert raw_args == expected_raw
    cwd_node = action.find("{*}WorkingDirectory")
    expected_cwd = cwd_node.text if cwd_node is not None else str(Path(os.environ["SystemRoot"]) / "System32")
    assert os.path.normcase(profile["workingDirectory"]) == os.path.normcase(expected_cwd)
    root = Path(tempfile.mkdtemp(prefix="fixtures-", dir=backup))
    results = []

    def invoke(command, expected):
        offline()
        result = subprocess.run(command, cwd=expected_cwd, capture_output=True, timeout=45,
                                creationflags=subprocess.CREATE_NO_WINDOW)
        assert result.returncode == expected, (result.returncode, expected, result.stderr)
        offline()
        return result

    for code, storage in ((0, "primary"), (7, "primary"), (3010, "primary"), (7, "fallback"), (7, "unavailable")):
        case = root / f"{code}-{storage}-中文 空白"
        case.mkdir()
        fixture = case / "run_stock_task_hidden.ps1"
        fixture.write_text('''param([string]$Kind, [switch]$NoNotification)
$ErrorActionPreference='Stop'
$state=@{Kind=$Kind;NoNotification=[bool]$NoNotification;Cwd=(Get-Location).Path;
    User=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;ExtraArgs=@($args)}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'marker.json'),($state | ConvertTo-Json -Depth 5))
exit ([int][IO.File]::ReadAllText((Join-Path $PSScriptRoot 'exit.txt')))
''', encoding="utf-8-sig")
        (case / "exit.txt").write_text(str(code), encoding="ascii")
        # Exercise the original Task Scheduler command-line shape with only its
        # script path replaced by this harmless fixture; no real child is run.
        direct = '"' + profile["executable"] + '" ' + raw_args.replace(original_script, str(fixture))
        invoke(direct, code)
        marker = case / "marker.json"
        original_observed = read_json(marker)
        marker.unlink()
        local = copy.deepcopy(config)
        local["receiptDirectory"] = str(case / "receipts")
        local["fallbackDirectory"] = str(case / "fallback")
        local["profiles"] = {"fixture": copy.deepcopy(profile)}
        local["profiles"]["fixture"]["jobId"] = "stage-5b-test-only"
        local["profiles"]["fixture"]["args"][6] = str(fixture)
        for blocked in (("receipts",) if storage == "fallback" else ("receipts", "fallback") if storage == "unavailable" else ()):
            (case / blocked).write_text("blocked by a regular file", encoding="ascii")
        local_config = case / "runner.json"
        local_config.write_text(json.dumps(local, ensure_ascii=False), encoding="utf-8")
        outcome = invoke([manifest["java"], "-jar", manifest["jar"], "run", str(local_config), "fixture"], code)
        assert read_json(marker) == original_observed
        assert original_observed["Kind"] == "weekly-check" and original_observed["NoNotification"] is True
        assert original_observed["ExtraArgs"] == []
        assert os.path.normcase(original_observed["Cwd"]) == os.path.normcase(expected_cwd)
        receipt_files = list(case.glob("*/*/*.json"))
        if storage == "unavailable":
            assert b"RUNNER_RECEIPT_UNAVAILABLE" in outcome.stderr and not receipt_files
        else:
            events = [read_json(p) for p in receipt_files]
            assert {r["phase"] for r in events} == {"STARTED", "PROCESS_STARTED", "TERMINAL"}
            assert len({r["executionId"] for r in events}) == 1
            terminal, = [r for r in events if r["phase"] == "TERMINAL"]
            assert terminal["exitCode"] == terminal["runnerExitCode"] == code
            assert terminal["durationMs"] >= 0 and terminal["finishedAt"]
        results.append({"exitCode": code, "storage": storage, "sameArgumentsCwdUser": True, "passed": True})

    absent = root / "missing.json"
    missing = invoke([manifest["java"], "-jar", manifest["jar"], "run", str(absent), "fixture"], 64)
    assert b"RUNNER_CONFIG_INVALID" in missing.stderr
    results.append({"case": "missing-config", "exitCode": 64, "passed": True})
    report = {"profileEquivalent": True, "dashboardOffline": True, "schedulerTouched": False,
              "realChildInvoked": False, "cases": results}
    (backup / "fixture-results.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
