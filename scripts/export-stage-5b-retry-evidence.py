"""Export this stopped, failed preflight attempt. Read-only outside the output.

Publishes one baseline and one final scheduler inventory, compact checkpoints,
and details only for the observed drifting task. Never publishes raw task XML,
private config, logs, receipts, account identities or actual local paths.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup-directory", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    private = args.backup_directory.resolve(strict=True)
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    sources = []

    def source(path, handling):
        raw = path.read_bytes()
        sources.append({"source": str(path), "rawSha256": hashlib.sha256(raw).hexdigest().upper(),
                        "bytes": len(raw), "handling": handling})
        return raw

    def load(name):
        return json.loads(source(private / name, "sanitized structured evidence").decode("utf-8-sig"))

    deployment = load("deployment.json")
    replacements = [(str(private), "[PRIVATE_EVIDENCE]"), (deployment["runnerRoot"], "[RUNNER_ROOT]"),
                    (str(ROOT), "[DASHBOARD_REPO]"), (str(ROOT.parent), "[WORKSPACE]"),
                    (os.environ["USERPROFILE"], "[USERPROFILE]"), (os.environ["SystemRoot"], "[WINDOWS]"),
                    (os.environ["COMPUTERNAME"], "[HOST]"), (os.environ["USERNAME"], "[USER]")]

    def clean(value):
        if isinstance(value, str):
            for original, replacement in replacements:
                for spelling in (original, original.replace("\\", "/")):
                    value = re.sub(re.escape(spelling), lambda _: replacement, value, flags=re.I)
            return re.sub(r"S-\d+(?:-\d+)+", "[SID]", value, flags=re.I)
        if isinstance(value, dict):
            return {clean(k): clean(v) for k, v in value.items()}
        if isinstance(value, list):
            return [clean(x) for x in value]
        return value

    def save(name, value):
        data = json.dumps(clean(value), ensure_ascii=False, indent=2) + "\n"
        assert not re.search(r"[A-Za-z]:\\\\|S-\d+(?:-\d+)+", data), "Unredacted local path or SID"
        (output / name).write_text(data, encoding="utf-8", newline="\n")

    baseline, final = load("all-tasks-before.json"), load("all-tasks-latest.json")
    before = {x["key"]: x["sha256"] for x in baseline}
    after = {x["key"]: x["sha256"] for x in final}
    assert len(before) == len(after) == 234
    drift = [k for k in before.keys() | after.keys() if before.get(k) != after.get(k)]
    assert drift == [r"\Microsoft\Windows\Flighting\OneSettings\RefreshCache"]
    save("baseline-inventory.json", baseline)
    save("final-inventory.json", final)

    preflight = load("preflight-result.json")
    audit = load("final-audit.json")
    cleanup = load("cleanup.json")
    missing = load("preflight-guard-test.json")
    failed = load("failed-preflight-guard-test.json")
    assert preflight["gate"] == "FAILED" and preflight["manualRequests"] == 0
    assert preflight["context"]["samePrincipal"] is False
    assert all(v for k, v in preflight["context"].items() if k != "samePrincipal")
    assert preflight["diagnosticDeleted"] and preflight["temporaryFilesDeleted"]
    assert preflight["weeklyExactOriginal"] and not preflight["taskDifferences"]
    assert audit["exactOriginalXml"] and audit["exactOriginalAcl"]
    assert audit["lastRunTimeUnchanged"] and audit["lastTaskResultUnchanged"]
    assert audit["state"] == "Ready" and audit["enabled"] and audit["instances"] == 0
    assert audit["formalManualRequests"] == audit["diagnosticManualRequests"] == 0
    assert not audit["listener8080Count"] and not audit["dashboardProcessCount"]
    assert missing["missingPreflightRejected"] and missing["originalUnchanged"]
    assert failed["failedPreflightRejected"] and failed["originalUnchanged"]
    assert cleanup["candidateUnreferenced"] and cleanup["diagnosticDeleted"] and cleanup["diagnosticFilesDeleted"]
    assert not (private / "preflight-request.json").exists()
    assert not (private / "applied.xml").exists()
    assert not (private / "live-result.json").exists()
    assert len(deployment["releaseHashes"]) == 218
    save("deployment.json", {**deployment, "finalStatus": "UNREFERENCED; retained after deletion approval rejection",
                             "schedulerVisibility": "NOT VERIFIED: diagnostic never started"})
    save("preflight.json", {**preflight, "samePrincipalMeaning": "Literal COM UserId vs baseline XML UserId comparison only; identifiers were not canonicalized to SID",
                            "identityMismatchProven": False, "javaStarted": False, "runnerStarted": False,
                            "receiptCount": 0, "executionEvidence": "NOT RUN",
                            "limitation": "Raw diagnostic UserId readback/XML was not retained before diagnostic deletion; the boolean does not prove a different Windows identity"})
    save("final-audit.json", audit)
    save("cleanup.json", {**cleanup, "candidate": load("candidate-retained.json")})
    save("checkpoint-summary.json", {
        "baselineTaskCount": 234,
        "checkpoints": [
            {"name": "Apply without preflight", **missing},
            {"name": "Diagnostic deleted after failed assertion", "taskCount": 234, "differences": preflight["taskDifferences"], "weeklyExactOriginal": True},
            {"name": "Apply with failed preflight", **failed},
            {"name": "Final integrity", "taskCount": 234, "matchingDefinitions": 233, "differences": audit["taskDifferences"], "baselineReplaced": False}],
        "formalMigration": "NOT RUN", "rehearsal": "NOT RUN", "live": "NOT RUN", "finalRollback": "NOT NEEDED: no formal modification",
        "collectorCorrection": audit["collectorCorrection"]})

    metadata = load("original-metadata.json")
    backup_hashes = load("backup-hashes.json")
    source(private / "original.xml", "private only; XML section hashes and selected task fields")
    source(private / "original.sddl.txt", "private only; ACL digest and equality assertion")
    doc = ET.parse(private / "original.xml")
    ns = "{http://schemas.microsoft.com/windows/2004/02/mit/task}"

    def fields(element):
        grouped = {}
        for child in element:
            grouped.setdefault(child.tag.split("}")[-1], []).append(fields(child) if len(child) else child.text)
        return {key: values[0] if len(values) == 1 else values for key, values in grouped.items()}

    settings = doc.find(ns + "Settings")
    triggers = doc.find(ns + "Triggers")
    save("original-task.json", {"metadata": metadata, "settings": fields(settings), "triggers": fields(triggers),
                                "backupFileHashes": backup_hashes, "fullXmlTextHash": audit["originalXmlHash"],
                                "aclHash": audit["originalAclHash"], "finalExactXml": True, "finalExactAcl": True,
                                "lastTaskResultMeaning": "0x80070002 is unchanged prior-run metadata, not an execution in this attempt"})
    drift_detail = load("drift-refresh-cache.json")
    drift_doc = ET.fromstring(source(private / "drift-refresh-cache.xml", "only selected drift task fields; raw XML excluded"))
    drift_detail["observedDefinitionFields"] = {name: fields(drift_doc.find(ns + name)) for name in ("Triggers", "Principals", "Settings", "Actions")}
    save("drift-refresh-cache.json", drift_detail)

    totals = {k: 0 for k in ("tests", "failures", "errors", "skipped")}
    suites = []
    for path in sorted((ROOT / "target/surefire-reports").glob("TEST-*.xml")):
        suite = ET.fromstring(source(path, "JUnit names/counts only; system properties and output excluded"))
        counts = {k: int(suite.attrib[k]) for k in totals}
        for k in totals:
            totals[k] += counts[k]
        suites.append({"name": suite.attrib["name"], **counts})
    assert totals == {"tests": 133, "failures": 0, "errors": 0, "skipped": 0}
    logs = {}
    for kind in ("package", "frontend", "root-tests"):
        path = ROOT / ".tools" / f"stage-5b-retry-{kind}.log"
        text = source(path, "selected test result lines only; raw log excluded").decode("utf-8-sig")
        logs[kind] = [line for line in text.splitlines() if re.search(r"BUILD SUCCESS|^PASS:|^✔|^ℹ|^test_.*ok$|^Ran \d+ tests|^OK$", line)]
        if kind == "package":
            assert "BUILD SUCCESS" in text and "PASS: packaged --stop entry point" in text
        elif kind == "frontend":
            assert "tests 32" in text and "fail 0" in text and "skipped 0" in text
        else:
            assert "Ran 13 tests" in text and "\nOK" in text
    save("regressions.json", {"maven": totals, "suites": suites, "frontend": {"tests": 32, "failures": 0, "skipped": 0},
                              "rootValidator": {"tests": 13, "failures": 0, "skipped": 0}, "resultLines": logs,
                              "scope": "Application/package regressions and creator-context path guards; do not establish Scheduler preflight or live integration"})
    save("source-manifest.json", {"exportedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "sources": sources,
                                  "note": "Hashes identify private originals, not sanitized exports. No raw config/task XML/log/receipt is published."})
    print("Exported FAILED attempt: zero task run requests, exact original weekly retained, one non-pilot definition drift, sanitized evidence only.")


if __name__ == "__main__":
    main()
