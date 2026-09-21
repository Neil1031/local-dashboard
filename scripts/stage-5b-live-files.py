"""Read-only weekly pilot file snapshots. Never imports or executes stock code."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def sha(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest().upper()


def files(paths):
    return {str(p): {"sha256": sha(p), "bytes": p.stat().st_size} for p in sorted(set(paths)) if p.is_file()}


def changed(before, after):
    return [{"path": p, "before": before.get(p), "after": after.get(p)}
            for p in sorted(before.keys() | after.keys()) if before.get(p) != after.get(p)]


def snapshot(manifest):
    config = load(Path(manifest["config"]))
    profile = config["profiles"][manifest["profileId"]]
    stock = Path(profile["args"][profile["args"].index("-File") + 1]).parents[1]
    out = stock / "output/unexplained-volume"
    weekly = out / "weekly-checks"
    log = out / "weekly-check-task.log"
    dashboard = Path(os.environ["LOCALAPPDATA"]) / "LocalDashboard"
    protected = list((stock / "stock_hunter").rglob("*.py"))
    protected += [p for p in (stock / "tools").rglob("*") if p.suffix.lower() in {".py", ".ps1", ".cs"}]
    protected += list((stock / "data").glob("unexplained_volume.sqlite3*"))
    protected += [p for p in out.rglob("*") if weekly not in p.parents and p != log]
    protected += list((dashboard / "config").rglob("*")) + list((dashboard / "data").rglob("*"))
    receipt_paths = [Path(config[k]) for k in ("receiptDirectory", "fallbackDirectory")]
    return {"at": dt.datetime.now(dt.timezone.utc).isoformat(), "stockRoot": str(stock), "weeklyRoot": str(weekly),
            "logPath": str(log), "protected": files(protected), "weekly": files(weekly.rglob("*")),
            "log": files([log]).get(str(log)), "receipts": files(p for root in receipt_paths for p in root.rglob("*")),
            "stockGitStatusHash": hashlib.sha256(subprocess.check_output(["git", "-C", str(stock), "status", "--porcelain=v1", "-uall"])).hexdigest().upper()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("before", "verify-before", "after"))
    parser.add_argument("--backup-directory", type=Path, required=True)
    parser.add_argument("--attempt-directory", type=Path, required=True)
    args = parser.parse_args()
    manifest = load(args.backup_directory / "deployment.json")
    current = snapshot(manifest)
    if args.mode == "before":
        assert not current["receipts"], "Unexpected pre-existing live receipts"
        with (args.attempt_directory / "live-files-before.json").open("x", encoding="utf-8") as stream:
            json.dump(current, stream, indent=2)
        print(f"Protected baseline: {len(current['protected'])} files; {len(current['weekly'])} weekly reports; zero receipts.")
        return
    before = load(args.attempt_directory / "live-files-before.json")
    protected_diff = changed(before["protected"], current["protected"])
    weekly_diff = changed(before["weekly"], current["weekly"])
    if args.mode == "verify-before":
        assert not protected_diff and not weekly_diff and before["log"] == current["log"] and not current["receipts"], "Pre-run file baseline drift"
        assert before["stockGitStatusHash"] == current["stockGitStatusHash"], "Stock source working tree changed"
        print("Pre-run protected/output/receipt/source baseline still exact.")
        return
    new_reports = [p for p in current["weekly"] if p not in before["weekly"]]
    latest = str(Path(current["weeklyRoot"]) / "latest.json")
    old_report_changes = [d for d in weekly_diff if d["path"] in before["weekly"] and d["path"] != latest]
    report = load(Path(new_reports[0])) if len(new_reports) == 1 else {}
    log = Path(current["logPath"])
    prefix_hash = hashlib.sha256(log.read_bytes()[:before["log"]["bytes"]]).hexdigest().upper() if before["log"] else None
    log_append = bool(before["log"] and current["log"] and current["log"]["bytes"] > before["log"]["bytes"] and prefix_hash == before["log"]["sha256"])
    latest_matches = len(new_reports) == 1 and current["weekly"].get(latest) == current["weekly"][new_reports[0]]
    summary = {"at": current["at"], "protectedFileCount": len(before["protected"]), "protectedDifferences": protected_diff,
               "weeklyDifferences": weekly_diff, "newReportCount": len(new_reports), "existingReportsUnchanged": not old_report_changes,
               "latestMatchesNewReport": latest_matches, "logAppendOnly": log_append,
               "logBefore": before["log"], "logAfter": current["log"],
               "stockGitStatusUnchanged": before["stockGitStatusHash"] == current["stockGitStatusHash"],
               "receiptFiles": current["receipts"],
               "weeklyReport": {k: report.get(k) for k in ("status", "checked_at", "finished_at", "week_start", "week_end", "check_run_id", "problems", "notifications", "inspection_mode")}}
    summary["expectedEffectsOnly"] = (not protected_diff and not old_report_changes and latest_matches and log_append
                                       and summary["stockGitStatusUnchanged"] and report.get("notifications") == "NOT_REQUESTED"
                                       and report.get("inspection_mode") == "READ_ONLY_OBSERVATIONS")
    with (args.attempt_directory / "live-files-after.json").open("x", encoding="utf-8") as stream:
        json.dump(summary, stream, indent=2)
    print(json.dumps({k: summary[k] for k in ("expectedEffectsOnly", "protectedFileCount", "newReportCount", "logAppendOnly")}))
    if not summary["expectedEffectsOnly"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
