"""One isolated JAR composite smoke; synthetic fixed-process source, TEMP home/DB.

Never launches or reads the installed app, formal source, config or database.
"""
import argparse, hashlib, json, os, re, subprocess, tempfile, time, urllib.request
from pathlib import Path

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    parser=argparse.ArgumentParser()
    for key in ['java','jar','csc','output']:parser.add_argument('--'+key,type=Path,required=True)
    args=parser.parse_args();repo=Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix='dashboard-r2c-fixture-') as temp:
        root=Path(temp);cli=root/'fixture-source.exe';source=root/'synthetic-source.json'
        build=subprocess.run([str(args.csc),'/nologo','/reference:System.Web.Extensions.dll','/out:'+str(cli),str(repo/'tests/TickerDetailSourceFixture.cs')],capture_output=True)
        if build.returncode:raise RuntimeError('FIXTURE_BUILD_FAILED '+build.stdout.decode(errors='replace'))
        data={key:json.loads((repo/f'src/test/resources/fixtures/{file}').read_text(encoding='utf-8')) for key,file in [('reports','report-signals-v1.json'),('sec','sec-transactions-v1.json')]}
        data.update(reportsMode='READY',secMode='READY');source.write_text(json.dumps(data),encoding='utf-8');source_before=digest(source)
        probe=subprocess.run([str(cli),'--db',str(source),'list-signals','--source','reports','--limit','50','--offset','0','--ticker','QA'],capture_output=True)
        if probe.returncode:raise RuntimeError('FIXTURE_PROCESS_FAILED '+probe.stderr.decode(errors='replace'))
        source.with_name(source.name+'.calls').unlink()
        settings={'server':{'address':'127.0.0.1','port':0},'dashboard':{'scheduler':{'include':[],'exclude':[]},
            'runner':{'config-path':'','mappings':[]},'history':{'database-path':str(root/'isolated.db')},
            'sources':{'insider':{'enabled':True,'cli-path':str(cli),'database-path':str(source),'timeout-seconds':10}}}}
        env=dict(os.environ,SPRING_APPLICATION_JSON=json.dumps(settings));log_path=root/'server.log'
        with log_path.open('wb') as log:
            process=subprocess.Popen([str(args.java),'-jar',str(args.jar.resolve())],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            try:
                port=None
                for _ in range(150):
                    match=re.search(r'Tomcat started on port (\d+)',log_path.read_text(encoding='utf-8',errors='replace'))
                    if match:port=int(match.group(1));break
                    if process.poll() is not None:raise RuntimeError('ISOLATED_JAR_EXITED')
                    time.sleep(.2)
                if not port:raise RuntimeError('ISOLATED_JAR_TIMEOUT')
                def request(query):
                    with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/us/ticker-detail?'+query,timeout=25) as response:
                        assert response.headers['Cache-Control']=='no-store';return json.load(response)
                ready=request('ticker=%20qa%20')
                if ready['dataState']!='READY':
                    print(json.dumps({key:{'state':value['dataState'],'warnings':value['warnings']} for key,value in ready['sections'].items()}))
                    raise RuntimeError('ISOLATED_FIXTURE_NOT_READY')
                assert ready['ticker']=='QA' and ready['dataState']=='READY' and 'items' not in ready
                signals=ready['sections']['signals'];sec=ready['sections']['secTransactions']
                assert signals['dataState']==sec['dataState']=='READY'
                assert all(x['signalId'].startswith('report:') and x['scores']['signal']['origin']=='imported_ai_report' for x in signals['items'])
                assert all(x['signalId'].startswith('sec:') and 'scores' not in x for x in sec['items'])
                assert not any(x in json.dumps(ready) for x in ['location','private','stderr'])
                paging=request('ticker=QA&signalsLimit=1&signalsOffset=1&secLimit=2&secOffset=0')
                assert paging['sections']['signals']['page']['offset']==1 and paging['sections']['secTransactions']['page']['offset']==0
                assert digest(source)==source_before
                data['secMode']='ERROR';source.write_text(json.dumps(data),encoding='utf-8')
                partial=request('ticker=QA')
                assert partial['dataState']=='PARTIAL' and partial['sections']['signals']['dataState']=='READY' and partial['sections']['secTransactions']['dataState']=='ERROR'
                assert 'private' not in json.dumps(partial)
                assets={}
                for name in ['index.html','dashboard.mjs','ui/shell.mjs','ui/overview.mjs','ui/projects.mjs','ui/project-design.mjs','ui/us-signals.mjs','ui/us-sec-transactions.mjs','ui/us-stocks.mjs','ui/us-ticker-detail.mjs']:
                    with urllib.request.urlopen(f'http://127.0.0.1:{port}/'+name,timeout=5) as response:content=response.read()
                    assert content==(repo/name).read_bytes();assets[name]=hashlib.sha256(content).hexdigest()
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/project-design/PROJECT-DESIGN.md',timeout=5) as response:canonical=response.read()
                assert canonical==(repo/'docs/PROJECT-DESIGN.md').read_bytes()
                calls=source.with_name(source.name+'.calls').read_text().splitlines()
                assert calls==['reports:QA:50:0','sec:QA:50:0','reports:QA:1:1','sec:QA:2:0','reports:QA:50:0','sec:QA:50:0']
                receipt={'syntheticFixtureOnly':True,'formalSourceRead':False,'jarSha256':digest(args.jar),'aggregateStates':['READY','READY','PARTIAL'],
                    'independentPaging':True,'reportRows':len(signals['items']),'secRows':len(sec['items']),'fixedSourceOperations':calls,
                    'fixtureFileUnchangedByAdapter':True,'safeMalformedSectionPreservedReports':True,'sourceJarHttpAssetsExact':assets,
                    'canonicalSha256':hashlib.sha256(canonical).hexdigest(),'noStore':True}
            finally:
                process.terminate()
                try:process.wait(timeout=5)
                except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)
        receipt['ownedIsolatedProcessExited']=process.poll() is not None
        args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(receipt))
if __name__=='__main__':main()
