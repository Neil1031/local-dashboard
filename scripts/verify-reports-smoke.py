"""Isolated Dashboard JAR verification. Formal mode reads one list1/get1 pair only.

Formal body stays in memory. No external SQLite access, writes, or journal bypass.
Only owned TEMP processes are terminated. Evidence has no private paths/body.
"""
import argparse,hashlib,json,os,re,subprocess,tempfile,time,urllib.request,zipfile
from pathlib import Path

def sha(path):
 digest=hashlib.sha256()
 with path.open('rb') as f:
  for chunk in iter(lambda:f.read(1048576),b''):digest.update(chunk)
 return digest.hexdigest()
def identity(path):
 result={}
 for suffix in ('','-wal','-shm','-journal'):
  p=Path(str(path)+suffix);key=suffix or 'main'
  result[key]={'exists':p.exists()}
  if p.exists():result[key].update(bytes=p.stat().st_size,sha256=sha(p),mtime_ns=p.stat().st_mtime_ns)
 return result
def main():
 parser=argparse.ArgumentParser()
 for key in ['java','jar','output']:parser.add_argument('--'+key,type=Path,required=True)
 parser.add_argument('--config',type=Path);parser.add_argument('--csc',type=Path)
 args=parser.parse_args();repo=Path(__file__).resolve().parents[1];formal=args.config is not None
 with tempfile.TemporaryDirectory(prefix='dashboard-r2d-smoke-') as temp:
  root=Path(temp)
  if formal:
   import yaml
   config=yaml.safe_load(args.config.read_text(encoding='utf-8'))['dashboard']['sources']['insider'];cli=Path(config['cli-path']);db=Path(config['database-path'])
   assert cli.is_file() and db.is_file();before=identity(db)
   with db.open('rb') as f:header=f.read(100)
   wal=header[:16]==b'SQLite format 3\0' and 2 in header[18:20]
   assert subprocess.check_output(['git','-C',str(repo.parent/'insider-signal-tracker'),'rev-parse','HEAD'],text=True).strip()=='cdacf8653fa4dce2fee857e57ffdf447f3d04efe'
  else:
   cli=root/'fixture-source.exe';db=root/'synthetic.json'
   build=subprocess.run([str(args.csc),'/nologo','/reference:System.Web.Extensions.dll','/out:'+str(cli),str(repo/'tests/ReportsSourceFixture.cs')],capture_output=True)
   if build.returncode:raise RuntimeError('SYNTHETIC_SOURCE_BUILD_FAILED')
   fixture={key:json.loads((repo/f'src/test/resources/fixtures/{file}').read_text(encoding='utf-8')) for key,file in [('list','reports-list-v1.json'),('detail','reports-detail-v1.json')]};db.write_text(json.dumps(fixture),encoding='utf-8');before=identity(db);wal=False
  settings={'server':{'address':'127.0.0.1','port':0},'dashboard':{'scheduler':{'include':['__reports_isolated_no_match__'],'exclude':[]},'runner':{'config-path':'','mappings':[]},'history':{'database-path':str(root/'isolated.db')},'sources':{'insider':{'enabled':True,'cli-path':str(cli),'database-path':str(db),'timeout-seconds':10}}}}
  env=dict(os.environ,SPRING_APPLICATION_JSON=json.dumps(settings));log_path=root/'server.log';receipt={'formalSourceRead':formal,'syntheticFixtureOnly':not formal,'sourceBaseline':'cdacf8653fa4dce2fee857e57ffdf447f3d04efe','jarSha256':sha(args.jar),'formalSourceWalHeader':wal}
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
    def request(path):
     with urllib.request.urlopen(f'http://127.0.0.1:{port}'+path,timeout=25) as response:
      assert response.headers['Cache-Control']=='no-store';return json.load(response)
    listing=request('/api/reports/us-insider?limit=1&offset=0');assert listing['contractVersion']==1 and listing['sources'][0]['sourceVersion']==1
    receipt.update(listState=listing['dataState'],listPage=listing['page'],returnedCount=len(listing['items']),sourceContractVersion=1,sourceId=listing['sources'][0]['sourceId'])
    assert all('rawMarkdown' not in r and 'source_file' not in r for r in listing['items'])
    if listing['dataState']=='READY':
     row=listing['items'][0];date=row['reportDate'];detail=request('/api/reports/us-insider/detail?reportDate='+date+'&revisionLimit=1&revisionOffset=0');assert detail['dataState']=='READY';item=detail['item']
     assert item['reportDate']==date and isinstance(item['rawMarkdown'],str) and 'source_file' not in item
     receipt.update(detailState=detail['dataState'],reportDate=date,parseWarningCount=len(item['parseWarnings']),storedSignalCount=item['storedSignalCount'],activeSignalCount=item['activeSignalCount'],revisionCount=item['revisionCount'],currentRevisionStatus=item['currentRevisionStatus'],revisionPage=detail['revisionPage'],sourceReads={'list':1,'get':1},formalBodyPersisted=False)
     if not formal:
      assert item['rawMarkdown']==fixture['detail']['report']['raw_markdown'];assert item['currentRevisionId']==1 and not item['revisions'][0]['isCurrent']
      later=request('/api/reports/us-insider/detail?reportDate='+date+'&revisionLimit=1&revisionOffset=2');assert later['item']['revisions'][0]['isCurrent']
      missing=request('/api/reports/us-insider/detail?reportDate=2020-01-01&revisionLimit=1');assert missing['dataState']=='EMPTY' and missing['item'] is None
      receipt.update(exactSyntheticBodyRoundTrip=True,currentOutsideFirstPage=True,revisionPaging=True,missingReportBoundedPreflight=True)
    else:
     assert listing['dataState'] in ('EMPTY','UNAVAILABLE');receipt.update(sourceReads={'list':1,'get':0},warnings=listing['warnings'],formalBodyPersisted=False)
    if not formal:
     assets={}
     with zipfile.ZipFile(args.jar) as archive:
      for name in ['index.html','dashboard.mjs']+[f'ui/{p.name}' for p in (repo/'ui').glob('*.mjs')]+['docs/PROJECT-DESIGN.md']:
       route='/project-design/PROJECT-DESIGN.md' if name.startswith('docs/') else '/'+name
       entry='BOOT-INF/classes/static/'+route.lstrip('/')
       source=(repo/name).read_bytes();assert archive.read(entry)==source
       with urllib.request.urlopen(f'http://127.0.0.1:{port}'+route,timeout=5) as response:assert response.read()==source
       assets[name]=hashlib.sha256(source).hexdigest()
     receipt['sourceJarHttpAssetsExact']=assets
     calls=db.with_name(db.name+'.calls').read_text().splitlines();assert calls==['list-reports::1:0','get-report:2026-09-30:1:0','get-report:2026-09-30:1:2','get-report:2020-01-01:1:0','list-reports:2020-01-01:1:0'];receipt['fixedSyntheticSourceCalls']=calls
   finally:
    process.terminate()
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)
  after=identity(db);receipt.update(before=before,after=after,databaseAndSidecarsUnchanged=before==after,ownedIsolatedProcessExited=process.poll() is not None)
  assert before==after
  args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
  print(json.dumps({k:receipt[k] for k in ['formalSourceRead','listState','returnedCount','databaseAndSidecarsUnchanged','ownedIsolatedProcessExited']}))
if __name__=='__main__':main()
