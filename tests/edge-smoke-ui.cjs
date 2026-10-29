'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),qa=path.resolve(root,'..','qa-edge-source-smoke-v1');fs.mkdirSync(qa,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<100;i++){const r=await fn();if(r)return r;await pause(300);}throw new Error(label);}
(async()=>{let app;const errors=[];const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.setHeader('Set-Cookie','df_edge_fixture=working; HttpOnly; Path=/');res.end('<!doctype html><title>Native Edge fixture</title><h1 id="ok">Native Edge connected</h1><p>Local browser test</p>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
app=await electron.launch({args:[root],cwd:root,env:{...process.env,DF_DATA_DIR:qa,DF_USE_BUNDLED:'1'},timeout:45000});const p=await app.firstWindow();p.on('pageerror',e=>errors.push(e.message));await p.waitForSelector('#urls');
const invoke=(name,...args)=>p.evaluate(({name,args})=>window.df.invoke(name,...args),{name,args});
const before=await invoke('browser-state');assert.equal(before.browserEngine,'Microsoft Edge WebView2');assert.equal(before.browserVersion,'');
const url='http://127.0.0.1:'+server.address().port+'/';
await p.evaluate(()=>setPage('browser'));await invoke('browser-navigate',url);await p.evaluate(()=>{browserOpened=true;updateBrowserBounds();});
const state=await until(async()=>{const s=await invoke('browser-state');return !s.loading&&s.title==='Native Edge fixture'&&s.browserVersion?s:null;},'Native Edge page did not finish');
await invoke('cookies-sync');const saved=await invoke('get-state');assert(saved.cookieSummary.some(c=>c.domain==='127.0.0.1'));
await p.screenshot({path:path.join(qa,'native-edge.png')});
assert.deepEqual(errors,[]);const report={passed:true,engine:state.browserEngine,version:state.browserVersion,title:state.title,cookieSync:true,qa,errors};fs.writeFileSync(path.join(qa,'edge-smoke-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{if(app)await app.close();server.close();}
})().catch(error=>{fs.writeFileSync(path.join(qa,'failure.txt'),error.stack);console.error(error);process.exitCode=1;});

