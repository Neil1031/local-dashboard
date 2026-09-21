"""Derive, assert and publish sanitized Stage 5B-R evidence. No scheduler writes.

Raw task snapshots, configs and logs stay private. Redacted absolute paths use
bracket labels, so they cannot be confused with literal %ENVIRONMENT% Commands.
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


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    directory = args.directory.resolve(strict=True)
    source = directory / "evidence"
    output = args.output
    output.mkdir(parents=True, exist_ok=True)
    sources = []
    replacements = [(str(directory), "[DIAGNOSTIC_ROOT]"), (str(ROOT), "[DASHBOARD_REPO]"),
                    (os.environ["LOCALAPPDATA"], "[LOCALAPPDATA]"), (os.environ["USERPROFILE"], "[USERPROFILE]"),
                    (os.environ["COMPUTERNAME"], "[HOST]"), (os.environ["USERNAME"], "[USER]")]

    def text(value):
        for original, replacement in replacements:
            for spelling in (original, original.replace("\\", "/")):
                value = re.sub(re.escape(spelling), lambda _: replacement, value, flags=re.I)
        return re.sub(r"S-1-5-21-\d+-\d+-\d+-\d+", "REDACTED_USER_SID", value, flags=re.I)

    def clean(value):
        if isinstance(value, str):
            return text(value)
        if isinstance(value, list):
            return [clean(x) for x in value]
        if isinstance(value, dict):
            return {text(k): clean(v) for k, v in value.items()}
        return value

    def save(name, value):
        (output / name).write_text(json.dumps(clean(value), ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")

    def provenance(path, handling):
        raw = path.read_bytes()
        sources.append({"source": text(str(path)), "bytes": len(raw), "rawSha256": hashlib.sha256(raw).hexdigest().upper(), "handling": handling})
        return raw

    names = ("A", "A2", "B", "B2", "C", "D", "D2", "D3", "E", "F1", "F2", "G")
    cases = {name: load(source / f"case-{name}.json") for name in names}
    assert len(list(source.glob("request-*.json"))) == len(names) == 12
    expected = {"A": 0, "A2": 0, "B": 0x80070002, "B2": 0, "C": 0x80070002,
                "D": 0x80070002, "D2": 0, "D3": 0, "E": 0, "F1": 0x80070002, "F2": 0x80070002, "G": 1}
    for name, case in cases.items():
        assert case["lastTaskResult"] == expected[name]
        assert case["readbackMatched"] and not case["otherTaskDifferences"]
        assert case["state"] == "Ready"
        if name in {"D2", "D3", "E"}:
            assert case["markerPresent"] and len(case["receipts"]) == 3
            phases = [x["receipt"] for x in case["receipts"]]
            assert {r["phase"] for r in phases} == {"STARTED", "PROCESS_STARTED", "TERMINAL"}
            assert len({r["executionId"] for r in phases}) == 1
            terminal, = [r for r in phases if r["phase"] == "TERMINAL"]
            assert terminal["exitCode"] == terminal["runnerExitCode"] == 0
            assert terminal["outcome"] == "SUCCESS" and terminal["durationMs"] >= 0
        else:
            assert not case["receipts"]
    for key in ("command", "arguments", "argv"):
        assert cases["F1"]["action"][key] == cases["F2"]["action"][key]
    assert cases["F1"]["action"]["workingDirectory"] is None
    assert cases["F2"]["action"]["workingDirectory"]
    assert cases["B"]["action"]["arguments"] == cases["C"]["action"]["arguments"] == "-version"
    assert not "%LOCALAPPDATA%" in cases["B"]["action"]["command"]
    assert cases["C"]["action"]["command"].startswith("%LOCALAPPDATA%")
    assert any(ord(c) > 127 for c in cases["E"]["action"]["command"])
    agent = {p["label"]: p for p in load(source / "path-resolution.json")["probes"]}
    captured = load(source / "captured-environment.json") if (source / "captured-environment.json").exists() else None
    marker_a2 = captured["A2"] if captured else load(source / "marker-A2.json")
    scheduled = {p["label"]: p for p in marker_a2["fileProbes"]}
    for kind in ("java", "jar"):
        assert agent[f"logical-{kind}"]["agentExists"] and agent[f"physical-{kind}"]["agentExists"]
        assert not scheduled[f"logical-{kind}"]["exists"] and scheduled[f"physical-{kind}"]["exists"]
        assert agent[f"logical-{kind}"]["agentSha256"] == agent[f"physical-{kind}"]["agentSha256"] == scheduled[f"physical-{kind}"]["sha256"]
    assert (captured["wrapperG"] if captured else load(source / "wrapper-G.json"))["javaVisible"] is False
    prior = load(source / "prior-candidate.json")
    assert prior["commandIsAbsolute"] and not prior["commandHasLiteralLocalAppData"]
    assert prior["matchesDeployedJava"]
    before, after = (load(source / f"environment-{x}.json") for x in ("before", "after"))
    for key in ("listeners8080", "operationalLogEnabled", "weeklyLastRunTime", "weeklyLastTaskResult", "weeklyAclHash"):
        assert before[key] == after[key], key
    assert before["listeners8080"] == [] and before["operationalLogEnabled"] is False
    inventory = lambda name: {x["key"]: x["sha256"] for x in load(source / name)}
    assert inventory("tasks-before.json") == inventory("tasks-after-cleanup.json")
    assert len(inventory("tasks-before.json")) == 234
    assert load(source / "task-cleanup.json")["diagnosticAbsent"]
    markers = {k: v for k, v in captured.items() if k != "wrapperG"} if captured else {p.stem: load(p) for p in source.glob("marker-*.json")}
    assert len(markers) == 5 and all(m["sameUser"] and m["process64Bit"] for m in markers.values())
    if captured:
        # Recreate sanitized references from captured observations after the
        # original temporary marker files have been removed at cleanup.
        for name, value in markers.items():
            save(f"marker-{name}.json", value)
        save("wrapper-G.json", captured["wrapperG"])
    file_cleanup = load(source / "file-cleanup.json") if (source / "file-cleanup.json").exists() else None
    if file_cleanup:
        assert file_cleanup["configAndWorkingMarkersDeleted"] and file_cleanup["sharedTestReleaseAbsent"]
        assert all(not Path(p).exists() for p in file_cleanup["removedTargets"])
    for path in sorted(source.iterdir()):
        if not path.is_file():
            continue
        if path.suffix == ".json":
            provenance(path, "sanitized evidence")
            save(path.name, load(path))
        elif path.name.startswith("action-") and path.suffix == ".xml":
            raw = provenance(path, "sanitized diagnostic Action/context; not a restorable backup")
            xml = text(raw.decode("utf-16")).replace('encoding="UTF-16"', 'encoding="UTF-8"').replace("\r\n", "\n")
            (output / (path.stem + ".sanitized.xml")).write_text(xml, encoding="utf-8", newline="\n")
    totals = {key: 0 for key in ("tests", "errors", "failures", "skipped")}
    suites = []
    for path in sorted((ROOT / "target/surefire-reports").glob("TEST-*.xml")):
        provenance(path, "JUnit result fields only; no properties/environment/output")
        suite = ET.parse(path).getroot()
        result = {key: int(suite.attrib.get(key, 0)) for key in totals}
        for key in totals:
            totals[key] += result[key]
        suites.append({"name": suite.attrib["name"], **result,
            "cases": [{"name": c.attrib["name"], "seconds": c.attrib.get("time"),
                "result": next((k for k in ("failure", "error", "skipped") if c.find(k) is not None), "passed")} for c in suite.findall("testcase")]})
    assert totals == {"tests": 133, "errors": 0, "failures": 0, "skipped": 0}
    checks = {}
    for name in ("maven", "frontend"):
        path = ROOT / ".tools" / f"stage-5br-{name}.log"
        provenance(path, "structured result lines only; raw log excluded")
        checks[name] = [line for line in path.read_text(encoding="utf-8-sig").splitlines()
                       if re.search(r"BUILD SUCCESS|Tests run:|^✔|^ℹ", line)]
    save("regressions.json", {"mavenTotals": totals, "suites": suites, "checks": checks})
    save("analysis.json", {"manualRequests": 12, "cases": [{"case": name, "result": cases[name]["resultHex"],
        "marker": cases[name]["markerPresent"], "receiptCount": len(cases[name]["receipts"])} for name in names],
        "rootCause": "Creating process sees a redirected AppData view; Scheduler cannot see the logical Java/JAR paths. Resolved physical paths and an unredirected shared deployment succeed with the same binary hashes.",
        "literalEnvironmentVariableIsNotCauseOfPriorFailure": True, "sameCwdDidNotFixMissingFiles": True,
        "wrapperNotRequired": True, "existingTaskDefinitionsUnchanged": 234, "formalWeeklyRunMetadataAndAclUnchanged": True,
        "service8080RemainedOffline": True, "operationalLogRemainedDisabled": True, "diagnosticTaskDeleted": True,
        "testConfigMarkersAndCopiedReleasesDeleted": bool(file_cleanup)})
    save("source-manifest.json", {"exportedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "note": "Raw hashes refer to private originals, not sanitized files. Existing-task XML stays private; all exported XML hashes are retained in each inventory.", "sources": sources})
    print(f"PASS: 12 cases, same-binary visibility control, 234 task hashes, offline/log/weekly invariants; {len(sources)} source records exported.")


if __name__ == "__main__":
    main()
