"""Prepare and invoke the one authorized Stage 5B-R diagnostic task.

The PowerShell driver owns scheduler writes; only the fixed diagnostic name is
allowed. Configs and harmless fixtures are private, temporary files. No real
weekly command or stock data is used. Windows argv uses subprocess.list2cmdline.
"""
import argparse
import csv
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import uuid
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
NAME = "LocalDashboard-Stage5B-Diagnostic"
FIXTURE = r'''$ErrorActionPreference='Stop'
$settings=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'fixture-settings.json') -Raw -Encoding utf8 | ConvertFrom-Json
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$sha=[Security.Cryptography.SHA256]::Create()
try { $sidHash=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($identity.User.Value)))).Replace('-','') }
finally { $sha.Dispose() }
$paths=@($env:PATH -split ';' | ForEach-Object {$_.TrimEnd('\')})
$record=@{at=[DateTimeOffset]::Now.ToString('o');processId=$PID;localAppData=$env:LOCALAPPDATA;temp=$env:TEMP;
    cwd=(Get-Location).Path;processCwd=[Environment]::CurrentDirectory;sidHash=$sidHash;
    sameUser=($sidHash -ceq $settings.expectedSidHash);bundledJavaOnPath=($paths -icontains $settings.javaBin.TrimEnd('\'));
    process64Bit=[Environment]::Is64BitProcess;os64Bit=[Environment]::Is64BitOperatingSystem;markerId=[Guid]::NewGuid().ToString()}
$record.fileProbes=@($settings.probes | Where-Object {$_} | ForEach-Object {
    $present=Test-Path -LiteralPath $_.path -PathType Leaf
    $hash=$null
    if ($present) {
        $digest=[Security.Cryptography.SHA256]::Create()
        try {$hash=([BitConverter]::ToString($digest.ComputeHash([IO.File]::ReadAllBytes($_.path)))).Replace('-','')}
        finally {$digest.Dispose()}
    }
    @{label=$_.label;path=$_.path;exists=$present;sha256=$hash}
})
[IO.File]::WriteAllText($settings.marker,($record | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
Start-Sleep -Milliseconds 750
exit 0
'''


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def task(mode, directory, case=None):
    command = ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
               str(ROOT / "scripts/stage-5br-task.ps1"), "-Mode", mode, "-Directory", str(directory)]
    if case:
        command += ["-Case", case]
    subprocess.run(command, check=True)


def prepare(previous):
    previous = previous.resolve(strict=True)
    deployment = load(previous / "deployment.json")
    for entry in deployment["releaseHashes"]:
        assert sha(Path(entry["path"])) == entry["sha256"], "Prior deployed release changed"
    old_command = ET.parse(previous / "applied.xml").find("{*}Actions/{*}Exec/{*}Command").text
    sid = next(csv.reader(subprocess.check_output(["whoami", "/user", "/fo", "csv", "/nh"], text=True).splitlines()))[1]
    sid_hash = hashlib.sha256(sid.encode()).hexdigest().upper()
    root = Path(os.environ["LOCALAPPDATA"]) / "LocalDashboard/diagnostics/stage5br" / (dt.datetime.now().strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:12])
    work = root / "work"
    work.mkdir(parents=True)
    (root / "evidence").mkdir()
    root = root.resolve()
    work = root / "work"
    java, jar = Path(deployment["java"]), Path(deployment["jar"])
    system32 = Path(os.environ["SystemRoot"]) / "System32"
    powershell = system32 / "WindowsPowerShell/v1.0/powershell.exe"
    cases = {}
    for case in ("A", "D", "E", "F", "G"):
        directory = work / ("case-E 中文 空白" if case == "E" else "case-" + case)
        directory.mkdir()
        selected_java, selected_jar = java, jar
        if case == "E":
            release = work / "中文 空白 release"
            shutil.copytree(deployment["release"], release)
            selected_java, selected_jar = release / "runtime/bin/java.exe", release / "runner.jar"
            assert sha(selected_jar) == sha(jar) and sha(selected_java) == sha(java)
        marker = directory / "marker.json"
        fixture = directory / "fixture.ps1"
        fixture.write_text(FIXTURE, encoding="utf-8-sig")
        save(directory / "fixture-settings.json", {"marker": str(marker), "expectedSidHash": sid_hash, "javaBin": str(selected_java.parent)})
        spool = directory / "receipts"
        config = directory / "diagnostic.json"
        save(config, {"schemaVersion": 1, "receiptDirectory": str(spool), "fallbackDirectory": str(directory / "fallback"),
                      "profiles": {"diagnostic": {"jobId": "stage5br-test-only", "executable": str(powershell),
                          "args": ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", str(fixture)],
                          "workingDirectory": str(system32)}}})
        argv = ["-jar", str(selected_jar), "run", str(config), "diagnostic"]
        command = str(selected_java)
        if case == "A":
            command, argv = str(powershell), ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", str(fixture)]
        if case == "G":
            # Test-only trampoline, native invocation with an argument array. No expression evaluation.
            save(directory / "trampoline-args.json", {"java": str(java), "args": argv})
            wrapper = directory / "trampoline.ps1"
            wrapper.write_text("$ErrorActionPreference='Stop'\n$c=Get-Content (Join-Path $PSScriptRoot 'trampoline-args.json') -Raw -Encoding utf8 | ConvertFrom-Json\n& $c.java @($c.args)\nexit $LASTEXITCODE\n", encoding="utf-8-sig")
            command, argv = str(powershell), ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", str(wrapper)]
        item = {"command": command, "arguments": subprocess.list2cmdline(argv), "argv": argv,
                "workingDirectory": None, "marker": str(marker), "receiptDirectory": str(spool)}
        if case == "F":
            cases["F1"] = item
            cases["F2"] = {**item, "workingDirectory": str(system32)}
        else:
            cases[case] = item
    for case, command in (("B", str(java)), ("C", "%LOCALAPPDATA%" + str(java)[len(os.environ["LOCALAPPDATA"]):])):
        cases[case] = {"command": command, "arguments": "-version", "argv": ["-version"], "workingDirectory": None,
                       "marker": str(work / f"unused-{case}.json"), "receiptDirectory": None}
    save(root / "manifest.json", {"taskName": NAME, "root": str(root), "userSid": sid,
         "description": "Test only: Stage 5B-R " + root.name, "java": str(java), "jar": str(jar),
         "javaHash": sha(java), "jarHash": sha(jar), "cases": cases})
    save(root / "evidence/prior-candidate.json", {"priorXmlSha256": sha(previous / "applied.xml"),
         "command": old_command, "commandIsAbsolute": Path(old_command).is_absolute(),
         "commandHasLiteralLocalAppData": "%LOCALAPPDATA%" in old_command,
         "matchesDeployedJava": old_command == str(java), "verifiedReleaseFileCount": len(deployment["releaseHashes"]),
         "javaSha256": sha(java), "jarSha256": sha(jar)})
    (ROOT / ".tools/stage-5br-current.txt").write_text(str(root), encoding="utf-8")
    task("Snapshot", root)
    print("Prepared test-only files and captured baseline; no diagnostic task registered yet.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("prepare", "extend", "shared", "case", "cleanup"))
    parser.add_argument("--previous", type=Path)
    parser.add_argument("--directory", type=Path)
    parser.add_argument("--case", choices=("A", "A2", "B", "B2", "C", "D", "D2", "D3", "E", "F1", "F2", "G"))
    args = parser.parse_args()
    assert os.name == "nt"
    if args.mode == "prepare":
        assert args.previous
        prepare(args.previous)
    elif args.mode == "extend":
        assert args.directory
        extend(args.directory.resolve(strict=True))
    elif args.mode == "shared":
        assert args.directory
        shared(args.directory.resolve(strict=True))
    else:
        assert args.directory
        task("Run" if args.mode == "case" else "Cleanup", args.directory.resolve(strict=True), args.case)


def extend(root):
    """Bounded follow-up to the reproduced launch failure: path visibility and
    the same original release through its resolved physical path, not a rebuild.
    Only adds new named cases; does not re-run or overwrite prior requests.
    """
    manifest = load(root / "manifest.json")
    assert manifest["root"] == str(root) and manifest["taskName"] == NAME
    assert not {"A2", "B2", "D2"} & manifest["cases"].keys()
    java, jar = Path(manifest["java"]), Path(manifest["jar"])
    resolved_java, resolved_jar = java.resolve(strict=True), jar.resolve(strict=True)
    assert sha(java) == sha(resolved_java) == manifest["javaHash"]
    assert sha(jar) == sha(resolved_jar) == manifest["jarHash"]
    probes = [{"label": label, "path": str(path), "agentExists": path.is_file(), "agentSha256": sha(path)}
              for label, path in (("logical-java", java), ("physical-java", resolved_java),
                                  ("logical-jar", jar), ("physical-jar", resolved_jar))]
    save(root / "evidence/path-resolution.json", {"capturedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "probes": probes})
    folder = root / "work/case-A2"
    folder.mkdir()
    marker = folder / "marker.json"
    fixture = folder / "fixture.ps1"
    fixture.write_text(FIXTURE, encoding="utf-8-sig")
    settings = load(root / "work/case-A/fixture-settings.json")
    settings.update(marker=str(marker), probes=probes)
    save(folder / "fixture-settings.json", settings)
    a = manifest["cases"]["A"]
    argv = [*a["argv"][:-1], str(fixture)]
    manifest["cases"]["A2"] = {**a, "argv": argv, "arguments": subprocess.list2cmdline(argv), "marker": str(marker), "receiptDirectory": None}
    manifest["cases"]["B2"] = {**manifest["cases"]["B"], "command": str(resolved_java)}
    d = manifest["cases"]["D"]
    argv = ["-jar", str(resolved_jar), *d["argv"][2:]]
    manifest["cases"]["D2"] = {**d, "command": str(resolved_java), "argv": argv, "arguments": subprocess.list2cmdline(argv)}
    wrapper = root / "work/case-G/trampoline.ps1"
    body = wrapper.read_text(encoding="utf-8-sig")
    # Record that Scheduler reached the wrapper even if Java is not visible.
    marker_line = "[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'wrapper-marker.json'),(@{at=[DateTimeOffset]::Now.ToString('o');javaVisible=(Test-Path -LiteralPath $c.java)}|ConvertTo-Json))\n"
    body = body.replace("& $c.java", marker_line + "& $c.java")
    wrapper.write_text(body, encoding="utf-8-sig")
    manifest["cases"]["G"]["wrapperMarker"] = str(wrapper.parent / "wrapper-marker.json")
    save(root / "manifest.json", manifest)
    print("Added A2/B2/D2 visibility/physical-path controls; existing cases untouched.")


def shared(root):
    """One additional candidate proof outside the creating application's cache.
    It remains test-only and is removed at cleanup, never a production install.
    """
    manifest = load(root / "manifest.json")
    assert manifest["root"] == str(root) and manifest["taskName"] == NAME
    assert "D3" not in manifest["cases"]
    directory = ROOT / ".tools" / ("stage5br-shared-" + root.name)
    assert not directory.exists()
    directory.mkdir()
    assert directory.resolve(strict=True) == directory, "Shared candidate location was redirected"
    old_release = Path(manifest["jar"]).resolve(strict=True).parent
    release = directory / "release"
    shutil.copytree(old_release, release)
    java, jar = release / "runtime/bin/java.exe", release / "runner.jar"
    assert sha(java) == manifest["javaHash"] and sha(jar) == manifest["jarHash"]
    marker = directory / "marker.json"
    fixture = directory / "fixture.ps1"
    fixture.write_text(FIXTURE, encoding="utf-8-sig")
    settings = load(root / "work/case-A/fixture-settings.json")
    settings.update(marker=str(marker), javaBin=str(java.parent), probes=[{"label": "shared-java", "path": str(java)}, {"label": "shared-jar", "path": str(jar)}])
    save(directory / "fixture-settings.json", settings)
    original_config = load(root / "work/case-D/diagnostic.json")
    original_config["receiptDirectory"] = str(directory / "receipts")
    original_config["fallbackDirectory"] = str(directory / "fallback")
    original_config["profiles"]["diagnostic"]["args"][-1] = str(fixture)
    config = directory / "diagnostic.json"
    save(config, original_config)
    argv = ["-jar", str(jar), "run", str(config), "diagnostic"]
    manifest["cases"]["D3"] = {"command": str(java), "arguments": subprocess.list2cmdline(argv), "argv": argv,
          "workingDirectory": None, "marker": str(marker), "receiptDirectory": str(directory / "receipts")}
    manifest["sharedWork"] = str(directory)
    save(root / "manifest.json", manifest)
    save(root / "evidence/shared-deployment.json", {"logicalRootEqualsResolved": True, "testOnly": True,
         "root": str(directory), "javaSha256": sha(java), "jarSha256": sha(jar),
         "releaseFiles": [{"path": str(p.relative_to(release)), "sha256": sha(p)} for p in sorted(release.rglob('*')) if p.is_file()]})
    print("Prepared D3 in an unredirected, test-only shared location.")


if __name__ == "__main__":
    main()
