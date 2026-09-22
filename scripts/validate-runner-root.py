"""Fail closed on unsafe Windows durable RunnerRoot locations. No scheduler I/O."""
import argparse
import json
import os
from pathlib import Path
import stat


def validate(root, repo, create=False):
    path = Path(root)
    if not path.is_absolute() or path.drive.startswith("\\\\"):
        raise ValueError("Use an absolute local-drive RunnerRoot")
    path = Path(os.path.abspath(path))
    forbidden = {"appdata", "localcache", "target", "dist", ".tools", "temp", "tmp"}
    if any(part.lower() in forbidden for part in path.parts):
        raise ValueError("RunnerRoot must be outside AppData, caches, temporary and build directories")
    repo = Path(repo).resolve(strict=True)
    if path == repo or repo in path.parents:
        raise ValueError("Use a durable directory outside the repository")
    for ancestor in (path, *path.parents):
        if ancestor.exists():
            if ancestor.stat(follow_symlinks=False).st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT:
                raise ValueError("Reparse points are not accepted in RunnerRoot ancestry")
            if str(ancestor.resolve(strict=True)).casefold() != str(ancestor).casefold():
                raise ValueError("RunnerRoot ancestry resolves to a different filesystem location")
    if create:
        path.mkdir(parents=True, exist_ok=True)
    if not path.is_dir():
        raise ValueError("RunnerRoot must exist or be explicitly created")
    if str(path.resolve(strict=True)).casefold() != str(path).casefold():
        raise ValueError("Created RunnerRoot resolves elsewhere")
    return {"root": str(path), "absolute": True, "outsideRepository": True,
            "notAppDataCacheOrBuildOutput": True, "noReparseAncestors": True, "physicalPathMatches": True}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--create", action="store_true")
    args = parser.parse_args()
    try:
        print(json.dumps(validate(args.root, args.repo, args.create)))
    except (ValueError, OSError) as error:
        parser.exit(2, str(error) + "\n")
