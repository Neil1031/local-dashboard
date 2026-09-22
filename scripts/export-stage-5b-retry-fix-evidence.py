"""Publish attempt 2 without overwriting any attempt 1 artifact.

Only selected receipt fields, hashes, assertions and sanitized paths are emitted.
The original full inventory remains the baseline; checkpoints and final audit are
diffs, including the accepted pre-existing ambient delta.
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
RECEIPT_FIELDS = ("executionId", "jobId", "commandProfileId", "phase", "outcome", "startedAt",
                  "processStartedAt", "finishedAt", "durationMs", "exitCode", "runnerExitCode")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--backup-directory", type=Path, required=True)
    p.add_argument("--attempt-directory", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    backup = args.backup_directory.resolve(strict=True)
    attempt = args.attempt_directory.resolve(strict=True)
    output = args.output.resolve()
    if output.exists():
        raise ValueError("Evidence destination must be new; prior exports are immutable")
    deployment = json.loads((backup / "deployment.json").read_text(encoding="utf-8-sig"))
    sources = []

    def raw(path, handling):
        data = path.read_bytes()
        sources.append({"source": str(path), "rawSha256": hashlib.sha256(data).hexdigest().upper(), "bytes": len(data), "handling": handling})
        return data

    def load(path):
        return json.loads(raw(path, "sanitized selected fields; raw private artifact excluded").decode("utf-8-sig"))

    replacements = [(str(attempt), "[ATTEMPT_2_PRIVATE]"), (str(backup), "[ORIGINAL_PRIVATE_BACKUP]"),
                    (deployment["runnerRoot"], "[RUNNER_ROOT]"), (str(ROOT), "[DASHBOARD_REPO]"),
                    (str(ROOT.parent), "[WORKSPACE]"), (os.environ["USERPROFILE"], "[USERPROFILE]"),
                    (os.environ["SystemRoot"], "[WINDOWS]"), (os.environ["COMPUTERNAME"], "[HOST]"), (os.environ["USERNAME"], "[USER]")]

    def clean(value):
        if isinstance(value, str):
            for old, new in replacements:
                for spelling in (old, old.replace("\\", "/")):
                    value = re.sub(re.escape(spelling), lambda _: new, value, flags=re.I)
            return re.sub(r"S-\d+(?:-\d+)+", "[SID]", value)
        if isinstance(value, dict):
            return {clean(k): clean(v) for k, v in value.items()}
        if isinstance(value, list):
            return [clean(v) for v in value]
        return value

    exports = {}

    def save(name, value):
        text = json.dumps(clean(value), ensure_ascii=False, indent=2) + "\n"
        assert not re.search(r"[A-Za-z]:[\\/]|S-\d+(?:-\d+)+", text), name
        for private_name in (os.environ["USERNAME"], os.environ["COMPUTERNAME"]):
            assert private_name.casefold() not in text.casefold(), name
        exports[name] = text

    def receipts(value):
        return [{"sourceName": x["name"], "rawSha256": x["sha256"],
                 "selectedFields": {k: x["receipt"].get(k) for k in RECEIPT_FIELDS}} for x in value]

    old = load(backup / "preflight-result.json")
    old_ambient = load(backup / "final-audit.json")
    assert old["gate"] == "FAILED" and old["manualRequests"] == 0 and not old["taskDifferences"]
    assert old["taskCount"] == 234 and old_ambient["taskDifferences"]
    save("historical-interpretation.json", {
        "attempt1ArtifactsChanged": False, "attempt1": {"literalComparison": "FAILED", "manualRequests": 0, "runnerStarted": False},
        "historicalAfterDiagnosticCleanup": {"matchingDefinitions": 234, "totalDefinitions": 234},
        "historicalLaterAmbientAudit": {"differences": old_ambient["taskDifferences"], "originalRecordedGate": old_ambient["otherTasksIntegrity"]},
        "managerReviewInterpretation": "EXTERNAL_DRIFT_OBSERVED; actor/cause UNKNOWN. Does not negate the earlier clean controlled checkpoint.",
        "baselineReplaced": False})
    preflight = load(attempt / "preflight-result.json")
    live = load(attempt / "live-result.json")
    audit = load(attempt / "ambient-audit.json")
    effects = load(attempt / "live-files-after.json")
    before = load(attempt / "live-files-before.json")
    final_deployment = load(attempt / "deployment-final.json")
    rehearsal = load(attempt / "rollback-rehearsal.json")
    rollback = load(attempt / "final-rollback-verification.json")
    anchor = load(attempt / "integrity-anchor.json")
    checkpoints = [load(path) for path in sorted((attempt / "checkpoints").glob("*.json"))]
    operations = [load(path) for path in sorted((attempt / "operations").glob("*.json"))]
    assert preflight["gate"] == "PASSED" and preflight["manualRequests"] == 1
    assert preflight["canonicalSidHash"] == preflight["readbackCanonicalSidHash"] == preflight["processCanonicalSidHash"]
    assert preflight["allCanonicalSidsEqual"] and preflight["diagnosticDeleted"] and preflight["temporaryFilesDeleted"]
    assert preflight["weeklyExactOriginal"] and preflight["marker"]["allHashesMatch"]
    assert len(preflight["marker"]["checks"]) == 219
    assert all(c["exists"] and c["matches"] for c in preflight["marker"]["checks"])
    assert len(preflight["receipts"]) == len(live["receipts"]) == 3
    assert preflight["lastTaskResult"] == preflight["receipts"][-1]["receipt"]["exitCode"] == 0
    assert live["gate"] == "FAILED" and live["formalManualRequests"] == 1
    assert live["threePhases"] and live["receiptFieldsComplete"] and live["schedulerMatchesChild"] and live["lastRunTimeUpdated"]
    assert live["lastTaskResult"] == live["childExitCode"] == 1
    assert all(not x for which in ("offlineBefore", "offlineAfter") for x in live[which].values())
    for value in (rehearsal, rollback):
        assert value["exactXml"] and value["aclUnchanged"] and value["controlledIntegrity"] == "PASSED"
    assert all(c["gate"] == "PASSED" and not c["differences"] for c in checkpoints)
    assert len(checkpoints) == audit["controlledCheckpointCount"] == 18
    assert audit["controlledOperationIntegrity"] == "PASSED" and audit["classification"] == "EXTERNAL_DRIFT_OBSERVED"
    assert audit["weeklyExactOriginalXml"] and audit["weeklyExactOriginalAcl"] and audit["sameSingleRunMetadata"]
    assert audit["state"] == "Ready" and audit["enabled"] and not audit["instances"] and audit["diagnosticAbsent"]
    assert audit["formalManualRequestCount"] == 1 and audit["liveReceiptFileCount"] == 3
    assert effects["expectedEffectsOnly"] and not effects["protectedDifferences"] and effects["protectedFileCount"] == 135
    assert effects["newReportCount"] == 1 and effects["logAppendOnly"] and effects["latestMatchesNewReport"]
    assert effects["weeklyReport"]["status"] == "FAILED" and effects["weeklyReport"]["notifications"] == "NOT_REQUESTED"
    assert final_deployment["allHashesMatch"] and final_deployment["configHashMatches"] and not final_deployment["taskReferences"]
    save("canonical-identity.json", {k: preflight[k] for k in ("canonicalSidHash", "readbackCanonicalSidHash", "processCanonicalSidHash", "allCanonicalSidsEqual")})
    save("preflight-attempt-2.json", {**{k: v for k, v in preflight.items() if k not in {"receipts", "marker"}},
                                      "receipts": receipts(preflight["receipts"]), "schedulerContextProbes": preflight["marker"]})
    save("formal-live.json", {**{k: v for k, v in live.items() if k != "receipts"}, "receipts": receipts(live["receipts"])})
    save("controlled-integrity.json", {"originalBaseline": "../baseline-inventory.json", "fixedPreOperationDelta": anchor,
                                       "checkpoints": checkpoints, "operations": operations, "gate": "PASSED"})
    save("ambient-final-diff.json", audit)
    save("rollback.json", {"rehearsal": rehearsal, "final": rollback})
    save("deployment-reuse-final.json", {"reuse": load(attempt / "deployment-reuse.json"), "final": final_deployment})
    save("protected-baseline.json", before)
    save("file-effects.json", effects)
    drift_raw = raw(attempt / "ambient-refresh-cache.xml", "selected fields of the sole drifting system task; raw XML excluded")
    drift_doc = ET.fromstring(drift_raw)
    save("ambient-drift-detail.json", {"task": r"\Microsoft\Windows\Flighting\OneSettings\RefreshCache",
                                       "observedStartBoundaries": [n.text for n in drift_doc.findall(".//{*}StartBoundary")],
                                       "currentXmlTextSha256": hashlib.sha256(drift_raw.decode("utf-16").encode("utf-8")).hexdigest().upper(),
                                       "actor": "UNKNOWN", "cause": "UNKNOWN", "modifiedByThisWork": False})
    totals = {k: 0 for k in ("tests", "failures", "errors", "skipped")}
    suites = []
    for path in sorted((ROOT / "target/surefire-reports").glob("TEST-*.xml")):
        suite = ET.fromstring(raw(path, "JUnit counts and suite names only"))
        counts = {k: int(suite.attrib[k]) for k in totals}
        for key in totals:
            totals[key] += counts[key]
        suites.append({"name": suite.attrib["name"], **counts})
    assert totals == {"tests": 133, "failures": 0, "errors": 0, "skipped": 0}
    identity = load(ROOT / ".tools/stage-5b-retry-fix-identity.json")
    assert all(identity[k] for k in ("currentAccountNameMatchesToken", "sidInputUnchanged", "invalidAccountFailsClosed", "emptyIdentityFailsClosed"))
    result_lines = {}
    for kind in ("maven", "frontend", "root-tests"):
        text = raw(ROOT / ".tools" / f"stage-5b-retry-fix-{kind}.log", "test result lines only; raw logs excluded").decode("utf-8-sig")
        result_lines[kind] = [line for line in text.splitlines() if re.search(r"BUILD SUCCESS|Tests run:|^✔|^ℹ|^test_.*ok$|^Ran \d+ tests|^OK$", line)]
        if kind == "frontend":
            assert "tests 32" in text and "fail 0" in text
        if kind == "root-tests":
            assert "Ran 13 tests" in text and "\nOK" in text
    save("regressions.json", {"canonicalization": identity, "maven": totals, "suites": suites, "resultLines": result_lines,
                              "package": "Not rerun: application/packaging sources unchanged; attempt-1 package smoke evidence retained separately"})
    save("source-manifest.json", {"exportedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "sources": sources,
                                  "note": "Raw source hashes bind private artifacts. Receipt exports are projections, not raw receipts. Attempt 1 is untouched."})
    # Validate everything before publishing; never truncate a previous export.
    output.mkdir(parents=True)
    for name, text in exports.items():
        with (output / name).open("x", encoding="utf-8", newline="\n") as stream:
            stream.write(text)
    print(f"Exported {len(exports)} sanitized artifacts: attempt 2 preflight PASS, formal child 1, exact rollback, controlled integrity PASS.")


if __name__ == "__main__":
    main()
