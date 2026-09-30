"""Opt-in candidate acceptance. Requires dedicated worktree, never installs shortcuts.

Reuses the existing read-only PowerShell adapter. Every child has isolated
LOCALAPPDATA/HOME, empty monitoring/Runner configuration and retained handles.
Private detail stays ignored; public evidence contains only bounded summaries.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import ProxyHandler, build_opener

ROOT = Path(__file__).resolve().parents[1]
assert ROOT.name == 'local-dashboard-port-43871-current-main', 'Use the dedicated worktree'
spec = importlib.util.spec_from_file_location('existing_launcher_qa', ROOT / 'scripts/verify-windows-launcher.py')
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)
IMAGE = (ROOT / 'dist/LocalDashboard').resolve()
assert IMAGE != Path(r'F:\AI workspace\local-dashboard\dist\LocalDashboard').resolve()
OUT = ROOT / '.tools/port43871/candidate'
assert not OUT.exists(), 'Keep each acceptance run immutable; archive failed run explicitly'
OUT.mkdir(parents=True)
HOME = OUT / 'home 中文'
LOCAL = OUT / 'localappdata'
COORD = LOCAL / 'LocalDashboard'
for p in (HOME / 'config', HOME / 'data', COORD / 'config'):
    p.mkdir(parents=True, exist_ok=True)
ENV = os.environ.copy()
ENV.pop('JAVA_HOME', None)
ENV['PATH'] = str(qa.WINDOWS_PS.parent) + ';' + str(qa.WINDOWS_PS.parent.parent.parent)
ENV['LOCALAPPDATA'] = str(LOCAL)
ENV['LOCAL_DASHBOARD_HOME'] = str(HOME)
for p in (LOCAL, HOME, COORD, HOME / 'data/local-dashboard.db', COORD / 'config/job-metadata.json'):
    assert p.resolve().is_relative_to(OUT.resolve()) and not p.resolve().is_relative_to(IMAGE)
CONFIG = HOME / 'config/application.yml'
CONFIG.write_text('dashboard:\n  scheduler:\n    include: []\n    exclude: []\n  runner:\n    config-path: ""\n    mappings: []\n  history:\n    database-path: data/local-dashboard.db\n', encoding='utf-8')
METADATA = COORD / 'config/job-metadata.json'
METADATA.write_text('{"version":1,"overrides":{}}', encoding='utf-8')
MARKER = HOME / 'data/persistence-marker.txt'
MARKER.write_text('Candidate-only persistence marker\n', encoding='utf-8')
PID = COORD / 'server.pid'
JAVA = IMAGE / 'runtime/bin/java.exe'
JAVAW = IMAGE / 'runtime/bin/javaw.exe'
LAUNCHER = IMAGE / 'app/launcher.jar'
EXE = IMAGE / 'LocalDashboard.exe'
HTTP = build_opener(ProxyHandler({}))
REPORT = {'result': 'RUNNING', 'port': 43871, 'isolatedState': True, 'emptyMonitoringAndRunner': True, 'gates': {}}
OWNED = []
GOOD = None


def gate(name, value=True):
    REPORT['gates'][name] = value
    (OUT / 'verification.json').write_text(json.dumps(REPORT, indent=2), encoding='utf-8')
    print('PASS ' + name, flush=True)


def listeners():
    return json.loads(qa.ps("$rows=@(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object LocalPort -eq 43871 | Select-Object LocalAddress,OwningProcess); ConvertTo-Json -InputObject $rows"))


def run(args, name, expected=0, child_env=None):
    with (OUT / (name + '.log')).open('wb') as log:
        child = subprocess.Popen(list(map(str, args)), cwd=HOME, env=child_env or ENV, stdout=log, stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
        OWNED.append(child)
        code = child.wait(timeout=110)
    assert code == expected, f'{name}: exit {code}, expected {expected}'
    return code


def record(pid):
    return subprocess.check_output([str(JAVA), '-cp', str(OUT / 'classes') + os.pathsep + str(LAUNCHER),
        'io.github.neil1031.dashboard.launcher.Port43871Probe', 'record', str(pid)], env=ENV, cwd=HOME, creationflags=subprocess.CREATE_NO_WINDOW).decode('utf-8')


def confirm(expected, name, home=HOME, image=IMAGE, jar=None):
    probe_env = ENV.copy()
    probe_env['LOCAL_DASHBOARD_HOME'] = str(home)
    run([JAVA, '-cp', str(OUT / 'classes') + os.pathsep + str(LAUNCHER),
         'io.github.neil1031.dashboard.launcher.Port43871Probe', 'confirm', image, home] + ([jar] if jar else []), name, expected, probe_env)


def stop(expected=0, name='stop'):
    run([EXE, '--stop', '--quiet'], name, expected)


def reject_start(name):
    # Exact packaged launcher main; headless only avoids unattended error dialogs.
    log = HOME / 'logs/launcher.log'
    before = log.read_text(encoding='utf-8').count('BROWSER_DISPATCHED') if log.exists() else 0
    run([JAVA, '-Djava.awt.headless=true', '-cp', LAUNCHER,
         'io.github.neil1031.dashboard.launcher.WindowsLauncher'], name, 1)
    assert log.read_text(encoding='utf-8').count('BROWSER_DISPATCHED') == before


def http(path):
    with HTTP.open('http://127.0.0.1:43871' + path, timeout=3) as response:
        assert response.status == 200
        return response.read()


def packaged_start(name):
    run([EXE], name)
    assert http('/api/launcher/status') == b'local-dashboard:ready:v1'
    pid = int(PID.read_text(encoding='utf-8').splitlines()[0])
    assert listeners() == [{'LocalAddress': '127.0.0.1', 'OwningProcess': pid}]
    confirm(0, name + '-identity')
    assert 'BROWSER_DISPATCHED http://127.0.0.1:43871' in (HOME / 'logs/launcher.log').read_text(encoding='utf-8')
    return PID.read_text(encoding='utf-8')


def persisted():
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (CONFIG, METADATA, MARKER)}


class Spoof(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b'local-dashboard:ready:v1'
        self.send_response(200)
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *_):
        pass


def main():
    global GOOD
    assert not listeners(), 'PENDING_PORT_AVAILABLE: no existing process will be stopped'
    run([os.environ['PORT_QA_JDK'] + '/bin/javac.exe', '-cp', LAUNCHER, '-d', OUT / 'classes', ROOT / 'scripts/Port43871Probe.java'], 'compile-probe')
    gate('preflight_paths_and_port_available')
    stop(name='initial-noop')
    assert not PID.exists()
    # A retained, finite unrelated process; exact start time from Java ProcessHandle.
    fixture = subprocess.Popen([JAVA, '-cp', ROOT / 'target/test-classes',
        'io.github.neil1031.dashboard.launcher.StopProcessFixture', OUT / 'fixture.pid'], env=ENV, cwd=HOME, creationflags=subprocess.CREATE_NO_WINDOW)
    OWNED.append(fixture)
    for _ in range(100):
        if (OUT / 'fixture.pid').exists(): break
        time.sleep(.1)
    unrelated = (OUT / 'fixture.pid').read_text(encoding='utf-8')
    try:
        # Old 8080 and readiness-spoof 43871 fixtures are owned by this harness.
        # If old 8080 is already occupied, leave it untouched and omit that fixture.
        old = None
        try:
            old = ThreadingHTTPServer(('127.0.0.1', 8080), Spoof)
            threading.Thread(target=old.serve_forever, daemon=True).start()
        except OSError:
            gate('old8080_preexisting_preserved_fixture_skipped', True)
        spoof = ThreadingHTTPServer(('127.0.0.1', 43871), Spoof)
        threading.Thread(target=spoof.serve_forever, daemon=True).start()
        try:
            reject_start('unrecorded-spoof-start')
            stop(1, 'unrecorded-spoof-stop')
            PID.write_text(record(os.getpid()), encoding='utf-8')
            reject_start('recorded-spoof-start')
            stop(1, 'recorded-spoof-stop')
            assert http('/api/launcher/status') == b'local-dashboard:ready:v1'
            gate('occupied_matching_readiness_unrelated_process_preserved')
        finally:
            spoof.shutdown(); spoof.server_close(); PID.unlink(missing_ok=True)
        GOOD = packaged_start('cold-start')
        assert json.loads(http('/api/jobs'))['collectionStatus'] == 'NOT_CONFIGURED'
        assert json.loads(http('/api/settings/job-metadata'))['overrides'] == {}
        first_pid = int(GOOD.splitlines()[0])
        assert packaged_start('duplicate-start') == GOOD
        gate('actual_exe_browser_uri_readiness_duplicate_same_instance')
        if old:
            assert old.socket.fileno() >= 0
            gate('old8080_never_reused_or_stopped')
            old.shutdown(); old.server_close(); old = None
        # All live mismatches leave Dashboard and the unrelated fixture alive.
        PID.write_text(unrelated, encoding='utf-8')
        reject_start('wrong-pid-start'); stop(1, 'wrong-pid-stop')
        assert fixture.poll() is None and http('/api/launcher/status')
        PID.write_text(str(first_pid) + '\n2000-01-01T00:00:00Z\n', encoding='utf-8')
        reject_start('wrong-start-time-start'); stop(1, 'wrong-start-time-stop')
        assert http('/api/launcher/status')
        PID.write_text(GOOD, encoding='utf-8')
        other = OUT / 'other-home'
        (other / 'config').mkdir(parents=True)
        (other / 'config/application.yml').write_text(CONFIG.read_text(encoding='utf-8'), encoding='utf-8')
        confirm(1, 'wrong-config-home', other)
        wrong_image = OUT / 'other-image'
        (wrong_image / 'app').mkdir(parents=True)
        (wrong_image / 'runtime/bin').mkdir(parents=True)
        (wrong_image / 'app/dashboard.jar').write_bytes((IMAGE / 'app/dashboard.jar').read_bytes())
        (wrong_image / 'runtime/bin/javaw.exe').write_bytes(JAVAW.read_bytes())
        confirm(1, 'wrong-image-jar-executable', image=wrong_image)
        confirm(1, 'wrong-jar-same-executable', jar=wrong_image / 'app/dashboard.jar')
        PID.unlink()
        reject_start('ready-missing-record-start'); stop(1, 'ready-missing-record-stop')
        PID.write_text(GOOD, encoding='utf-8')
        assert fixture.poll() is None
        gate('live_wrong_pid_start_time_config_image_missing_record_refused')
        # QA browser consumes real candidate static bytes, unrelated APIs fixture-routed.
        run([os.environ['PORT_QA_NODE'], ROOT / 'tests/port43871-browser-smoke.mjs'], 'browser-qa')
        gate('real_candidate_projects_browser_33_ids_counts_resource_bytes_screenshot')
        before = persisted()
        stop(name='first-real-stop')
        assert not listeners() and not PID.exists() and persisted() == before
        with sqlite3.connect(HOME / 'data/local-dashboard.db') as db:
            assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
            assert db.execute('SELECT count(*) FROM job_run').fetchone()[0] == 0
        gate('safe_stop_port_release_isolated_config_metadata_marker_history_preserved')
        # Same bundled executable/JAR/config, but an extra command token is not ours.
        bad_command = subprocess.Popen([str(JAVAW), '-jar', str(IMAGE / 'app/dashboard.jar'),
            '--server.address=127.0.0.1', '--server.port=43871',
            '--spring.config.location=classpath:/application.yml,optional:' + CONFIG.as_uri(),
            '--spring.main.banner-mode=off'], cwd=HOME, env=ENV,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
        OWNED.append(bad_command)
        try:
            deadline = time.monotonic() + 90
            while time.monotonic() < deadline:
                assert bad_command.poll() is None
                try:
                    if http('/api/launcher/status') == b'local-dashboard:ready:v1': break
                except Exception: pass
                time.sleep(.15)
            else: raise AssertionError('Owned extra-command fixture never became ready')
            PID.write_text(record(bad_command.pid), encoding='utf-8')
            reject_start('extra-command-start'); stop(1, 'extra-command-stop')
            assert bad_command.poll() is None and http('/api/launcher/status')
            gate('live_exact_executable_jar_but_extra_command_refused')
        finally:
            bad_command.terminate(); bad_command.wait(timeout=15); PID.unlink(missing_ok=True)
        second = packaged_start('restart')
        assert second != GOOD and persisted() == before
        GOOD = second
        stop(name='restart-stop')
        assert not listeners() and not PID.exists() and fixture.poll() is None
        GOOD = None
        gate('restart_safe_stop_unrelated_fixture_preserved')
        REPORT['result'] = 'PASSED'
        gate('final_no_candidate_listener_or_pid')
    finally:
        if GOOD and listeners():
            PID.write_text(GOOD, encoding='utf-8')
            stop(name='verified-failure-cleanup')
        if old:
            old.shutdown(); old.server_close()
        # Only retained child handles created by this harness, never arbitrary PID kills.
        for child in OWNED:
            if child.poll() is None:
                child.terminate(); child.wait(timeout=15)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        REPORT['result'] = 'FAILED'
        REPORT['error'] = str(error)
        gate('failure_recorded', False)
        raise
