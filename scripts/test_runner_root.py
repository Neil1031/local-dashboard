"""Read-only safety checks for the Windows deployment location validator."""
import importlib.util
import os
from pathlib import Path
import unittest
import uuid

SPEC = importlib.util.spec_from_file_location("runner_root", Path(__file__).with_name("validate-runner-root.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
REPO = Path(__file__).resolve().parents[1]


@unittest.skipUnless(os.name == "nt", "Windows deployment validator")
class RunnerRootTests(unittest.TestCase):
    def reject(self, path):
        with self.assertRaises(ValueError):
            MODULE.validate(path, REPO)

    def test_relative_path(self):
        self.reject("runner-release")

    def test_drive_relative_path(self):
        self.reject(REPO.drive + "runner-release")

    def test_unc(self):
        self.reject(r"\\server\share\runner")

    def test_device_path(self):
        self.reject("\\\\?\\" + str(REPO.parent / "runner"))

    def test_appdata(self):
        self.reject(REPO.parent / "AppData" / "Local" / "runner")

    def test_package_cache(self):
        self.reject(REPO.parent / "Packages" / "example" / "LocalCache" / "runner")

    def test_build_and_temporary_paths(self):
        for name in ("target", "DIST", ".tools", "Temp", "tmp"):
            with self.subTest(name=name):
                self.reject(REPO.parent / name / "runner")

    def test_repository(self):
        self.reject(REPO)

    def test_repository_descendant(self):
        self.reject(REPO / "permanent-looking-release")

    def test_normalized_repository_descendant(self):
        self.reject(REPO.parent / "sibling" / ".." / REPO.name / "release")

    def test_missing_without_create(self):
        candidate = REPO.parent / ("runner-root-absent-" + uuid.uuid4().hex)
        self.reject(candidate)
        self.assertFalse(candidate.exists())

    def test_existing_file(self):
        self.reject(REPO.parent / "AGENTS.md")

    def test_existing_physical_directory_outside_repo(self):
        result = MODULE.validate(REPO.parent, REPO)
        self.assertTrue(result["outsideRepository"])
        self.assertTrue(result["noReparseAncestors"])
        self.assertEqual(Path(result["root"]), REPO.parent)


if __name__ == "__main__":
    unittest.main(verbosity=2)
