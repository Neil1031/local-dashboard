"""Export sanitized review evidence from the existing private Stage 5B artifacts.

Reads files only: no scheduler operations, real child execution or DB access.
Raw private configs, logs, receipts and JUnit environment properties are excluded.
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
    backup = args.backup_directory.resolve(strict=True)
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    manifest = []
    replacements = [(str(ROOT.parent / "ai-stock-hunter"), "[STOCK_PROJECT]"),
                    (str(ROOT), "[DASHBOARD_PROJECT]"),
                    (os.environ["LOCALAPPDATA"], "%LOCALAPPDATA%"),
                    (os.environ["USERPROFILE"], "%USERPROFILE%"),
                    (os.environ["COMPUTERNAME"], "[HOST]"),
                    (os.environ["USERNAME"], "[USER]")]

    def sanitize(text):
        for source, replacement in replacements:
            text = re.sub(re.escape(source), lambda _: replacement, text, flags=re.I)
            text = re.sub(re.escape(source.replace("\\", "/")), lambda _: replacement, text, flags=re.I)
        return re.sub(r"S-1-5-21-\d+-\d+-\d+-\d+", "REDACTED_USER_SID", text, flags=re.I)

    def clean(value):
        if isinstance(value, str):
            return sanitize(value)
        if isinstance(value, list):
            return [clean(v) for v in value]
        if isinstance(value, dict):
            result = {sanitize(k): clean(v) for k, v in value.items()}
            assert len(result) == len(value), "Redaction collided with JSON keys"
            return result
        return value

    def save(relative, value):
        path = output / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(clean(value), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def record(path, disposition):
        raw = path.read_bytes()
        manifest.append({"source": sanitize(str(path)), "bytes": len(raw),
                         "rawSha256": hashlib.sha256(raw).hexdigest().upper(), "disposition": disposition})
        return raw

    def load(path):
        return json.loads(path.read_text(encoding="utf-8-sig"))

    previous = Path(load(backup / "baseline-refresh.json")["previousBackup"])
    for label, directory in (("initial", previous), ("pre-migration", backup)):
        for source in sorted(directory.iterdir()):
            if not source.is_file():
                continue
            if source.suffix == ".json":
                record(source, "sanitized structured evidence")
                save(f"{label}/{source.name}", load(source))
            elif source.suffix == ".xml" or source.name == "original.sddl.txt":
                raw = record(source, "sanitized reference only; not restorable")
                encoding = "utf-16" if raw.startswith((b"\xff\xfe", b"\xfe\xff")) else "utf-8-sig"
                text = sanitize(raw.decode(encoding)).replace('encoding="UTF-16"', 'encoding="UTF-8"')
                text = text.replace("\r\n", "\n").replace("\r", "\n")
                target = output / label / (source.stem + ".sanitized" + source.suffix)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(text, encoding="utf-8", newline="\n")

    observations = []
    for source in sorted(previous.glob("fixtures-*/**/*")):
        if not source.is_file():
            continue
        record(source, "derived fixture observation" if source.name in
               {"marker.json", "00-started.json", "01-process-started.json", "02-terminal.json"}
               else "hash only; fixture config/script/storage blocker not published")
        if source.name == "marker.json":
            observations.append({"source": str(source), "kind": "fixture-marker", "observed": load(source)})
        elif re.fullmatch(r"0[012]-(started|process-started|terminal)\.json", source.name):
            receipt = load(source)
            fields = ("schemaVersion", "executionId", "jobId", "phase", "startedAt", "processStartedAt",
                      "finishedAt", "durationMs", "exitCode", "runnerExitCode", "outcome")
            observations.append({"source": str(source), "kind": "fixture-receipt-fields",
                                 "observed": {k: receipt[k] for k in fields if k in receipt}})
    save("fixture-observations.json", observations)

    suites = []
    for source in sorted((ROOT / "target/surefire-reports").glob("TEST-*.xml")):
        record(source, "test outcomes only; environment/system-output excluded")
        suite = ET.parse(source).getroot()
        suites.append({"name": suite.attrib["name"],
                       **{k: int(suite.attrib.get(k, 0)) for k in ("tests", "errors", "failures", "skipped")},
                       "cases": [{"name": c.attrib["name"], "class": c.attrib.get("classname"),
                                  "seconds": c.attrib.get("time"),
                                  "result": next((k for k in ("failure", "error", "skipped") if c.find(k) is not None), "passed")}
                                 for c in suite.findall("testcase")]})
    assert sum(s["tests"] for s in suites) == 133
    assert not sum(s[k] for s in suites for k in ("errors", "failures", "skipped"))
    reports = {"maven": {"totals": {k: sum(s[k] for s in suites) for k in ("tests", "errors", "failures", "skipped")}, "suites": suites}}
    for label, filename in (("package", "stage-5b-package.log"), ("frontend", "stage-5b-frontend.log"),
                            ("weekly-unit-rerun", "stage-5b-weekly-unit-evidence.txt")):
        source = ROOT / ".tools" / filename
        record(source, "derived check results only; raw log excluded")
        lines = source.read_text(encoding="utf-8-sig").splitlines()
        selected = [line for line in lines if re.search(r"PASS:|BUILD SUCCESS|Tests run:|^✔|^ℹ|^Ran 9 tests|^OK$", line)]
        assert selected, f"No results found in {filename}"
        reports[label] = {"sourceModifiedAt": dt.datetime.fromtimestamp(source.stat().st_mtime, dt.timezone.utc).isoformat(),
                          "checks": selected}
    save("regression-results.json", reports)
    save("source-manifest.json", {"exportedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
         "note": "Raw hashes identify private original bytes, not sanitized exported bytes. No independent signature or missing historical evidence is implied.",
         "sources": manifest})
    print(f"Exported {len(manifest)} source records; originals remain private.")


if __name__ == "__main__":
    main()
