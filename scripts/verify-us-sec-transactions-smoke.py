"""One real fixed adapter request; local paths/raw payloads never enter evidence.

Starts and stops only its own isolated JAR child, with an empty Scheduler/Runner
configuration and temporary Dashboard history. Never opens SQLite itself.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import urllib.request


def identity(path):
    result = {}
    for suffix in ("", "-wal", "-shm", "-journal"):
        file = Path(str(path) + suffix)
        if file.exists():
            digest = hashlib.sha256()
            with file.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
            result[suffix or "main"] = {"bytes": file.stat().st_size, "sha256": digest.hexdigest(), "mtime_ns": file.stat().st_mtime_ns}
    return result


def main():
    parser = argparse.ArgumentParser()
    for name in ("java", "jar", "cli", "db", "output"):
        parser.add_argument("--" + name, type=Path, required=True)
    args = parser.parse_args()
    before = identity(args.db)
    jar_hash = identity(args.jar)["main"]["sha256"]
    with args.db.open("rb") as stream:
        header = stream.read(100)
    wal = header[:16] == b"SQLite format 3\0" and 2 in header[18:20]
    with tempfile.TemporaryDirectory(prefix="dashboard-r2b-sec-smoke-") as root:
        root = Path(root)
        settings = {"server": {"address": "127.0.0.1", "port": 0}, "dashboard": {
            "scheduler": {"include": [], "exclude": []}, "runner": {"config-path": "", "mappings": []},
            "history": {"database-path": str(root / "isolated.db")},
            "sources": {"insider": {"enabled": True, "cli-path": str(args.cli.resolve()), "database-path": str(args.db.resolve()), "timeout-seconds": 10}}}}
        env = dict(os.environ, SPRING_APPLICATION_JSON=json.dumps(settings))
        log_path = root / "server.log"
        with log_path.open("wb") as log:
            process = subprocess.Popen([str(args.java), "-jar", str(args.jar.resolve())], cwd=root, env=env,
                                       stdout=log, stderr=subprocess.STDOUT, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            try:
                port = None
                for _ in range(150):
                    match = re.search(r"Tomcat started on port (\d+)", log_path.read_text(encoding="utf-8", errors="replace"))
                    if match:
                        port = int(match.group(1)); break
                    if process.poll() is not None:
                        raise RuntimeError("ISOLATED_SERVER_EXITED")
                    time.sleep(.2)
                if not port:
                    raise RuntimeError("ISOLATED_SERVER_TIMEOUT")
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/us/sec-transactions?limit=50&offset=0", timeout=15) as response:
                    data = json.load(response)
                assert data["sources"][0]["sourceId"] == "insider-sec" and data["sources"][0]["sourceVersion"] == 1
                assert data["dataState"] in ("READY", "EMPTY", "UNAVAILABLE")
                assert all(item["signalId"].startswith("sec:") and "scores" not in item for item in data["items"])
                # Strictly sanitized evidence; no record text, stderr, configuration or local paths.
                evidence = {"sourceContractVersion": data["sources"][0]["sourceVersion"], "dataState": data["dataState"],
                            "returnedCount": len(data["items"]), "page": data["page"], "warnings": data["warnings"],
                            "observedAt": data["observedAt"], "sourceLastObservedAt": data["sources"][0]["lastObservedAt"],
                            "formalSourceWalHeader": wal, "cliSha256": identity(args.cli)["main"]["sha256"],
                            "containsNonAsciiRecordText": any(any(ord(c) > 127 for c in json.dumps(item, ensure_ascii=False)) for item in data["items"])}
                evidence.update({"source": "sec", "sourceSchemaHeaderVersion": int.from_bytes(header[60:64],"big"), "jarSha256": jar_hash,
                    "singleRequest": True, "fieldPresence": {key: sum(item.get(key) is not None for item in data["items"]) for key in
                        ("ticker","company","eventDate","filingDate","filingAcceptedAt","discoveredAt","reportingOwners","transactionCode","securityType","shares","insiderExecutionPrice","transactionAmount","ownershipAfter","ownershipIncreasePct","isDirect","is10b51","footnotes","filingDateSource","qualityFlags","provenance")},
                    "naturalCases": {"nonP": sum(item["transactionCode"] is not None and item["transactionCode"] != "P" for item in data["items"]),
                        "candidate": sum(item["candidateOpenMarketPurchase"] for item in data["items"]), "reviewRequired": sum(item["reviewRequired"] for item in data["items"]),
                        "qualityFlags": sum(bool(item["qualityFlags"]) for item in data["items"]), "derivative": sum(item["securityType"] == "derivative" for item in data["items"]),
                        "amendmentFlag": sum("AMENDMENT_REQUIRES_RECONCILIATION" in item["qualityFlags"] for item in data["items"])},
                    "limits": ["Current read path only; source completeness, 20-filing live validation, Form 4/4A reconciliation and investment validity not verified"]})
            finally:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill(); process.wait(timeout=5)
        after = identity(args.db)
        evidence.update({"databaseAndSidecarsUnchanged": before == after, "before": before, "after": after,
                         "isolatedProcessExited": process.poll() is not None})
        args.output.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
        print(json.dumps({k: evidence[k] for k in ("dataState", "returnedCount", "formalSourceWalHeader", "warnings", "databaseAndSidecarsUnchanged", "isolatedProcessExited")}))
        if before != after:
            raise RuntimeError("SOURCE_DRIFT_OBSERVED")


if __name__ == "__main__":
    main()
