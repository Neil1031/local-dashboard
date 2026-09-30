"""Windows safe-stop acceptance using the real packaged EXE and unrelated owned fixture.

Run --prepare before building; then run without arguments. Only reads Scheduled
Tasks. Runtime evidence stays under .tools; never commits private configuration.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import time
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('launcher_qa', ROOT / 'scripts/verify-windows-launcher.py')
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)
POINTER = ROOT / '.tools/safe-stop-current.txt'


def task_hashes():
    # Every task visible to this non-elevated identity, not only the monitored list.
    return json.loads(qa.ps("$sha=[Security.Cryptography.SHA256]::Create(); try { "
        "$result=@(Get-ScheduledTask | ForEach-Object { "
        "$raw=Export-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath; "
        "@{key=$_.TaskPath+$_.TaskName;sha256=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($raw)))} "
        "} | Sort-Object {$_.key}); ConvertTo-Json -InputObject $result -Depth 3 "
        "} finally {$sha.Dispose()}"))


def files(home):
    return {str(p.relative_to(home)): {'size': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
            for folder in ('config', 'data') for p in sorted((home / folder).rglob('*')) if p.is_file()}


def prepare():
    out = ROOT / '.tools/safe-stop-acceptance' / uuid4().hex
    out.mkdir(parents=True)
    baseline = {'tasks': task_hashes(), 'userFiles': files(Path(os.environ['LOCALAPPDATA']) / 'LocalDashboard'),
                'elevated': qa.ps("([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)")}
    assert baseline['elevated'] == 'False', 'Acceptance must run without Administrator'
    (out / 'baseline.json').write_text(json.dumps(baseline, indent=2), encoding='utf-8')
    POINTER.write_text(str(out), encoding='utf-8')
    print('Prepared read-only baseline: ' + str(out), flush=True)


def stop_async():
    return subprocess.Popen([str(qa.EXE), '--stop', '--quiet'], cwd=os.environ['TEMP'], env=qa.ENV,
                            creationflags=subprocess.CREATE_NO_WINDOW)


def stopped():
    assert not qa.state()['listeners'], '43871 still listening'
    assert not qa.servers(qa.state()), 'Owned Dashboard still alive'
    qa.SERVER = None


def stop(expected=0):
    result = stop_async().wait(timeout=90)
    assert result == expected, f'Stop exit {result}, expected {expected}'
    return result


def wait_start(launcher):
    deadline = time.monotonic() + 100
    while launcher.poll() is None and time.monotonic() < deadline:
        found = qa.servers(qa.state())
        if found:
            assert len(found) == 1
            qa.SERVER = found[0]
        time.sleep(.15)
    assert launcher.poll() == 0, 'Launcher failed or displayed a dialog'
    snapshot = qa.state()
    found = qa.servers(snapshot)
    assert len(found) == 1, 'Expected exactly one server matching isolated config/JAR/executable'
    qa.SERVER = found[0]
    assert snapshot['listeners'] == [{'LocalAddress': '127.0.0.1', 'OwningProcess': qa.SERVER['ProcessId']}]
    events = qa.events(launcher)
    assert any('BROWSER_DISPATCHED' in line for line in events)
    return {'server': qa.SERVER, 'listener': snapshot['listeners'], 'events': events, 'http': qa.healthy()}


def shortcut_checks():
    script = ROOT / 'scripts/install-shortcut.ps1'
    test_desktop = qa.OUT / 'shortcut conflict 中文'
    test_desktop.mkdir()
    start_link = test_desktop / 'Local Dashboard.lnk'
    stop_link = test_desktop / 'Stop Local Dashboard.lnk'
    # An unrelated same-name user shortcut blocks both writes.
    qa.ps(f"$s=New-Object -ComObject WScript.Shell; $l=$s.CreateShortcut({qa.quote(stop_link)}); "
          "$l.TargetPath=Join-Path $env:SystemRoot 'System32/notepad.exe'; $l.Save()")
    original = stop_link.read_bytes()
    try:
        qa.ps(f"& {qa.quote(script)} -DesktopDirectory {qa.quote(test_desktop)}")
        raise AssertionError('Expected target conflict')
    except RuntimeError:
        pass
    assert stop_link.read_bytes() == original and not start_link.exists()
    qa.ps(f"& {qa.quote(script)} -DesktopDirectory {qa.quote(test_desktop)} -Replace; "
          f"& {qa.quote(script)} -DesktopDirectory {qa.quote(test_desktop)}")
    assert len(list(test_desktop.glob('*.lnk'))) == 2
    # Matching executable but unexpected arguments also must not be overwritten.
    qa.ps(f"$s=New-Object -ComObject WScript.Shell; $l=$s.CreateShortcut({qa.quote(stop_link)}); $l.Arguments='--user-option'; $l.Save()")
    original = stop_link.read_bytes()
    start_before = start_link.read_bytes()
    try:
        qa.ps(f"& {qa.quote(script)} -DesktopDirectory {qa.quote(test_desktop)}")
        raise AssertionError('Expected argument conflict')
    except RuntimeError:
        pass
    assert stop_link.read_bytes() == original and start_link.read_bytes() == start_before
    qa.ps(f"& {qa.quote(script)}; & {qa.quote(script)}")
    links = json.loads(qa.ps("$s=New-Object -ComObject WScript.Shell; $d=[Environment]::GetFolderPath('Desktop'); "
        "$result=@('Local Dashboard','Stop Local Dashboard') | ForEach-Object { "
        "$p=Join-Path $d ($_+'.lnk'); $l=$s.CreateShortcut($p); "
        "@{name=$_;path=$p;target=$l.TargetPath;arguments=$l.Arguments;cwd=$l.WorkingDirectory}}; "
        "ConvertTo-Json -InputObject @($result)"))
    assert [v['arguments'] for v in links] == ['', '--stop']
    assert all(v['target'] == str(qa.EXE) and v['cwd'] == str(qa.IMAGE) for v in links)
    return {'links': links, 'differentTargetPreserved': True, 'differentArgumentsPreserved': True,
            'replaceExplicitlyTested': True, 'isolatedShortcutCount': 2}


def main():
    qa.OUT = Path(POINTER.read_text(encoding='utf-8'))
    baseline = json.loads((qa.OUT / 'baseline.json').read_text(encoding='utf-8'))
    qa.HOME = qa.OUT / 'external home 中文'
    qa.DB = qa.HOME / 'data/launcher-history.db'
    qa.LOG = qa.HOME / 'logs/launcher.log'
    local = qa.OUT / 'local appdata 中文'
    coordination = local / 'LocalDashboard'
    coordination.mkdir(parents=True)
    pid_file = coordination / 'server.pid'
    qa.ENV['LOCALAPPDATA'] = str(local)
    qa.ENV['LOCAL_DASHBOARD_HOME'] = str(qa.HOME)
    qa.REPORT = {'result': 'RUNNING', 'evidenceDirectory': str(qa.OUT), 'stages': {}}
    qa.HOME.joinpath('config').mkdir(parents=True)
    qa.HOME.joinpath('data/receipts').mkdir(parents=True)
    config = (ROOT / 'config/application.example.yml').read_text(encoding='utf-8').replace('data/local-dashboard.db', 'data/launcher-history.db')
    qa.HOME.joinpath('config/application.yml').write_text(config, encoding='utf-8')
    qa.HOME.joinpath('data/receipts/acceptance-marker.txt').write_text('Not a runner receipt; preservation fixture.\n', encoding='utf-8')
    fixture = None
    good_record = None
    assert not qa.state()['listeners'], '43871 occupied: will not terminate an unrelated process'
    try:
        assert stop() == 0
        assert not pid_file.exists()
        assert not (coordination / 'config').exists()
        qa.stage('not_running_no_bootstrap', {'exit': 0})

        fixture_record = qa.OUT / 'fixture.pid'
        fixture = subprocess.Popen([str(qa.IMAGE / 'runtime/bin/javaw.exe'), '-cp', str(ROOT / 'target/test-classes'),
            'io.github.neil1031.dashboard.launcher.StopProcessFixture', str(fixture_record)], creationflags=subprocess.CREATE_NO_WINDOW)
        deadline = time.monotonic() + 15
        while not fixture_record.exists() and time.monotonic() < deadline:
            time.sleep(.1)
        fixture_text = fixture_record.read_text(encoding='utf-8')
        fixture_pid = int(fixture_text.splitlines()[0])
        assert fixture_pid == fixture.pid

        # A live unrelated Java process, with the right PID and creation time.
        pid_file.write_text(fixture_text, encoding='utf-8')
        stop(1)
        assert fixture.poll() is None and pid_file.read_text(encoding='utf-8') == fixture_text
        qa.stage('wrong_java_process_refused', {'fixturePid': fixture_pid, 'stillAlive': True, 'exit': 1})

        pid_file.write_text(str(fixture_pid) + '\n2000-01-01T00:00:00Z\n', encoding='utf-8')
        stop(1)
        assert fixture.poll() is None and not pid_file.exists()
        qa.stage('pid_reuse_refused_stale_cleaned', {'fixtureStillAlive': True, 'exit': 1})

        # Use an actually exited owned child PID instead of guessing a free PID.
        child = subprocess.Popen([str(qa.IMAGE / 'runtime/bin/java.exe'), '-version'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        child.wait(timeout=15)
        pid_file.write_text(str(child.pid) + '\n2000-01-01T00:00:00Z\n', encoding='utf-8')
        stop()
        assert not pid_file.exists() and fixture.poll() is None
        qa.stage('absent_pid_cleaned', {'exit': 0, 'pid': child.pid})

        first = wait_start(qa.start())
        good_record = pid_file.read_text(encoding='utf-8')
        pid_file.write_text(fixture_text, encoding='utf-8')
        stop(1)
        assert fixture.poll() is None and qa.http('/api/launcher/status') == 'local-dashboard:ready:v1'
        pid_file.write_text(good_record, encoding='utf-8')
        qa.stage('ready_dashboard_does_not_authorize_wrong_pid', {'fixtureStillAlive': True, 'dashboardStillReady': True})

        db_before = qa.database()
        preserved = files(qa.HOME)
        stop()
        stopped()
        assert files(qa.HOME) == preserved
        assert qa.database() == db_before
        assert fixture.poll() is None
        qa.stage('normal_stop_port_closed_data_exact', {'instance': first, 'db': db_before, 'files': preserved, 'unrelatedJavaAlive': True})

        second = wait_start(qa.start())
        good_record = pid_file.read_text(encoding='utf-8')
        assert second['server']['ProcessId'] != first['server']['ProcessId']
        db_restart = qa.database()
        assert set(map(tuple, db_before['rows'])).issubset(set(map(tuple, db_restart['rows'])))
        preserved = files(qa.HOME)
        stops = [stop_async(), stop_async()]
        codes = [p.wait(timeout=90) for p in stops]
        assert codes == [0, 0]
        stopped()
        assert files(qa.HOME) == preserved and fixture.poll() is None
        qa.stage('restart_then_concurrent_stop', {'instance': second, 'exitCodes': codes, 'db': db_restart})

        # Start/stop contention: hold the start lock while server becomes ready.
        launch = qa.start()
        deadline = time.monotonic() + 20
        while not pid_file.exists() and time.monotonic() < deadline:
            time.sleep(.05)
        assert pid_file.exists()
        good_record = pid_file.read_text(encoding='utf-8')
        pending_stop = stop_async()
        assert launch.wait(timeout=100) == 0 and pending_stop.wait(timeout=100) == 0
        stopped()
        assert fixture.poll() is None
        qa.stage('stop_waits_for_cold_start_lock', {'startExit': 0, 'stopExit': 0})
        qa.stage('desktop_shortcuts', shortcut_checks())
        log = (coordination / 'logs/stop.log').read_text(encoding='utf-8')
        for event in ('STOP_REQUESTED', 'IDENTITY_CONFIRMED', 'GRACEFUL_STOP_REQUESTED', 'EXITED',
                      'FORCED_TERMINATION', 'STALE_PID_CLEANUP', 'REFUSED_IDENTITY_MISMATCH'):
            assert event in log
        qa.stage('stop_logging', {'path': str(coordination / 'logs/stop.log'), 'requiredEvents': True})
    finally:
        # Prefer the actual stop entry point for cleanup; preserve a known record if a
        # negative test temporarily replaced it. Never search for arbitrary Java to kill.
        if qa.servers(qa.state()):
            if good_record:
                pid_file.write_text(good_record, encoding='utf-8')
            # Stop still performs all production identity checks even on cleanup.
            stop()
        if fixture is not None and fixture.poll() is None:
            fixture.terminate()  # retained Popen handle to our finite test fixture only
            fixture.wait(timeout=10)
        after_tasks = task_hashes()
        after_files = files(Path(os.environ['LOCALAPPDATA']) / 'LocalDashboard')
        qa.REPORT['taskDefinitionsBefore'] = baseline['tasks']
        qa.REPORT['taskDefinitionsAfter'] = after_tasks
        qa.REPORT['userFilesBefore'] = baseline['userFiles']
        qa.REPORT['userFilesAfter'] = after_files
        qa.save()
    assert after_tasks == baseline['tasks'], 'Scheduled Task definitions changed'
    assert after_files == baseline['userFiles'], 'Real user config/data changed'
    qa.stage('all_visible_tasks_and_real_user_data_unchanged', {'taskCount': len(after_tasks), 'elevated': baseline['elevated']})
    qa.REPORT['result'] = 'PASSED'
    qa.save()
    print('PASSED ' + str(qa.OUT / 'verification.json'), flush=True)


if __name__ == '__main__':
    if sys.argv[1:] == ['--prepare']:
        prepare()
    else:
        try:
            main()
        except Exception as failure:
            qa.REPORT['result'] = 'FAILED'
            qa.REPORT['error'] = str(failure)
            if qa.OUT.exists():
                qa.save()
            raise
