"""Real EXE bootstrap cases A/B/C/D, plus the default-home path, all isolated.

Reuses the launcher's existing HTTP/process identity and read-only task helpers.
Requires Python 3.11+, Node 22+/Playwright (same setup as frontend tests), and the
five existing example tasks. Does not alter the real LOCALAPPDATA home or tasks.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
from uuid import uuid4
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('launcher_qa', ROOT / 'scripts/verify-windows-launcher.py')
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)
qa.OUT = ROOT / '.tools/config-bootstrap-acceptance' / uuid4().hex
qa.REPORT = {'result': 'RUNNING', 'evidenceDirectory': str(qa.OUT), 'stages': {}}
qa.OUT.mkdir(parents=True)
template = (ROOT / 'config/application.example.yml').read_bytes()
expected_names = ['InsiderTracker-Market', 'InsiderTracker-SEC', 'InsiderTracker-SyncImport',
                  'AIStockHunter-UnexplainedVolume-HealthCheck', 'AIStockHunter-Accumulation-Weekly-Check']
selected = expected_names


def healthy():
    assert qa.http('/api/launcher/status') == 'local-dashboard:ready:v1'
    assert '<title>Local Dashboard</title>' in qa.http('/')
    payload = json.loads(qa.http('/api/jobs'))
    assert payload['collectionStatus'] in ('OK', 'PARTIAL'), payload['collectionStatus']
    assert sorted(job['name'] for job in payload['jobs']) == sorted(selected)
    assert all(job['taskPath'] == '\\' for job in payload['jobs'])
    return {'http': 200, 'collectionStatus': payload['collectionStatus'], 'names': [job['name'] for job in payload['jobs']]}


qa.healthy = healthy


def home(case, default=False):
    global selected
    selected = expected_names
    # Isolate even the cross-home launcher.lock/server.pid away from the user's home.
    local = qa.OUT / case / 'local appdata 中文'
    qa.ENV['LOCALAPPDATA'] = str(local)
    qa.HOME = local / 'LocalDashboard' if default else qa.OUT / case / 'external home 中文'
    qa.DB = qa.HOME / 'data/local-dashboard.db'
    qa.LOG = qa.HOME / 'logs/launcher.log'
    if default:
        qa.ENV.pop('LOCAL_DASHBOARD_HOME', None)
    else:
        qa.ENV['LOCAL_DASHBOARD_HOME'] = str(qa.HOME)
    assert not qa.HOME.exists()


def config_state(expected):
    config = qa.HOME / 'config/application.yml'
    assert config.read_bytes() == expected
    assert sorted(path.name for path in config.parent.iterdir()) == ['application.yml']
    return {'path': str(config), 'sha256': hashlib.sha256(config.read_bytes()).hexdigest(), 'mtimeNs': config.stat().st_mtime_ns}


def live_ui():
    node = shutil.which('node.exe')
    assert node, 'Node 22+ must be on PATH for live UI verification'
    env = os.environ.copy()
    env['DASHBOARD_BOOTSTRAP_LIVE_URL'] = 'http://127.0.0.1:8080'
    env['DASHBOARD_BOOTSTRAP_EVIDENCE'] = str(qa.OUT / 'case-a')
    with (qa.OUT / 'live-ui.log').open('wb') as log:
        result = subprocess.run([node, '--test', 'tests/bootstrap-live-browser.test.mjs'], cwd=ROOT, env=env,
                                stdout=log, stderr=subprocess.STDOUT, timeout=60)
    assert result.returncode == 0, 'Live alias test failed; inspect live-ui.log'
    return json.loads((qa.OUT / 'case-a/ui.json').read_text(encoding='utf-8'))


def main():
    global selected
    before = qa.task_hashes()
    assert len(before) == 5
    qa.REPORT['taskDefinitionsBefore'] = before
    assert not qa.state()['listeners'], '8080 occupied: do not stop an unrelated service'
    with ZipFile(qa.IMAGE / 'app/launcher.jar') as archive:
        assert archive.read('bootstrap/application.example.yml') == template
    try:
        home('case-a')
        first = qa.wait(qa.start())
        original = config_state(template)
        ui = live_ui()
        initial_db = qa.database()
        qa.stage('A_clean_first_run', {'config': original, 'instance': first, 'ui': ui, 'db': initial_db})
        qa.stop()
        restart = qa.wait(qa.start())
        assert config_state(template) == original
        after_db = qa.database()
        assert set(map(tuple, initial_db['rows'])).issubset(set(map(tuple, after_db['rows'])))
        assert 'CONFIG_CREATED' not in '\n'.join(restart['events'])
        qa.stage('D_restart_preserves_config_and_history', {'config': original, 'db': after_db, 'instance': restart})
        qa.stop()

        home('case-b')
        selected = ['InsiderTracker-SEC']
        custom = b"# User-owned custom configuration\r\ndashboard:\r\n  scheduler:\r\n    include: ['\\InsiderTracker-SEC']\r\n"
        config = qa.HOME / 'config/application.yml'
        config.parent.mkdir(parents=True)
        config.write_bytes(custom)
        os.utime(config, (1600000000, 1600000000))
        original = config_state(custom)
        instance = qa.wait(qa.start())
        assert config_state(custom) == original
        assert 'CONFIG_CREATED' not in '\n'.join(instance['events'])
        qa.stage('B_existing_config_unchanged', {'config': original, 'instance': instance})
        qa.stop()

        home('case-c')
        launchers = [qa.start(), qa.start()]
        results = [qa.wait(launcher) for launcher in launchers]
        assert len({result['server']['ProcessId'] for result in results}) == 1
        assert sum('CONFIG_CREATED' in '\n'.join(result['events']) for result in results) == 1
        qa.stage('C_concurrent_first_run', {'config': config_state(template), 'instances': results})
        qa.stop()

        home('default-home', default=True)
        instance = qa.wait(qa.start())
        qa.stage('default_home_without_override', {'config': config_state(template), 'instance': instance})
    finally:
        qa.stop()
        after = qa.task_hashes()
        qa.REPORT['taskDefinitionsAfter'] = after
        qa.REPORT['safeCleanup'] = not qa.state()['listeners'] and not qa.servers(qa.state())
        qa.save()
    assert before == after
    assert qa.REPORT['safeCleanup']
    qa.stage('scheduled_tasks_unchanged', {'count': len(after)})
    qa.REPORT['result'] = 'PASSED'
    qa.save()
    print('PASSED ' + str(qa.OUT / 'verification.json'), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as failure:
        qa.REPORT['result'] = 'FAILED'
        qa.REPORT['error'] = repr(failure)
        qa.save()
        raise
