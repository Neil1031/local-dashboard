// Development-only synthetic preview; no installed service or formal source reads.
import {createServer} from 'node:http';
import {serveStaticAsset} from './static-assets.mjs';
import {reportsFixture,reportDetailFixture} from './reports-fixture.mjs';
import {signalsFixture} from './us-signals-fixture.mjs';
import {secFixture} from './us-sec-transactions-fixture.mjs';
import {tickerFixture} from './us-ticker-detail-fixture.mjs';
let state='READY',missing=false;
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://fixture');
  if(url.pathname==='/qa/state'){state=['READY','EMPTY','UNAVAILABLE','ERROR'].includes(url.searchParams.get('state'))?url.searchParams.get('state'):'READY';missing=url.searchParams.get('missing')==='true';res.end('Synthetic fixture state '+state);return;}
  if(!url.pathname.startsWith('/api/')){try{await serveStaticAsset(req,res);}catch{res.writeHead(404);res.end();}return;}
  const data=url.pathname==='/api/reports/us-insider'?reportsFixture(url,state):url.pathname==='/api/reports/us-insider/detail'?reportDetailFixture(url,state,missing):url.pathname==='/api/us/signals'?signalsFixture(url):url.pathname==='/api/us/sec-transactions'?secFixture(url):url.pathname==='/api/us/ticker-detail'?tickerFixture(url):url.pathname==='/api/history'?{from:url.searchParams.get('from'),to:url.searchParams.get('to'),jobs:[]}:url.pathname==='/api/settings/job-metadata'?{version:1,revision:'0',overrides:{},warning:null}:{collectionStatus:'NOT_CONFIGURED',status:'NOT_CONFIGURED',collectedAt:new Date().toISOString(),jobs:[],errors:[],warnings:[],unmatchedIncludes:[]};res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));
});
server.listen(Number(process.env.REPORTS_PREVIEW_PORT||0),'127.0.0.1',()=>console.log(`QA_FIXTURE http://127.0.0.1:${server.address().port}/#reports`));
