'use strict';
const {_electron:electron}=require('playwright'),{launchPackaged}=require('./launch_packaged.cjs');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),qa=path.resolve(process.env.DF_ACCESS_QA||path.join(root,'..','qa-site-recovery-'+Date.now()));fs.mkdirSync(qa,{recursive:true});
const checks=[],errors=[],hits=[];let app,base;
const invoke=(p,name,...args)=>p.evaluate(({name,args})=>window.df.invoke(name,...args),{name,args});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await delay(120);}throw new Error(label);}
const record=label=>{checks.push(label);console.log('PASS '+label);};
async function web(code){return app.evaluate(({webContents},code)=>{const w=webContents.getAllWebContents().find(w=>/^https?:/.test(w.getURL()));return w?.executeJavaScript(code);},code);}
async function launch(){
 const options={cwd:root,env:{...process.env,DF_DATA_DIR:qa,DF_PYTHON:process.env.DF_APP_EXE?'C:\\DandF-no-external-runtime\\python.exe':path.resolve(root,'..','build-venv','Scripts','python.exe')}};
 app=process.env.DF_APP_EXE?await launchPackaged(process.env.DF_APP_EXE,options):await electron.launch({args:[root],...options,timeout:30000});
 const p=await app.firstWindow();p.on('pageerror',e=>errors.push(e.message));await p.waitForSelector('#urls');
 await app.evaluate(async({session,net},base)=>{const s=session.fromPartition('persist:dandf-browser');await s.protocol.handle('https',request=>request.url.includes('dns-fixture.invalid')?Promise.reject(new Error('net::ERR_NAME_NOT_RESOLVED')):net.fetch(base+'/web?url='+encodeURIComponent(request.url)));},base);
 return p;
}
async function navigate(p,url){await invoke(p,'browser-navigate',url);await until(async()=>{const s=await invoke(p,'browser-state');return s.url===url&&!s.loading;},'Page did not settle: '+url);await delay(300);}
(async()=>{
 const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://fixture'),target=new URL(u.searchParams.get('url')||'https://fixture.test');hits.push(target.href);
  if(target.pathname==='/needed.js'){res.setHeader('Content-Type','application/javascript');return res.end('window.fixtureResourceLoaded=true;');}
  res.setHeader('Content-Type','text/html');
  if(target.hostname==='ikuhentai.net')return res.end('<title>Attention Required! | Cloudflare</title><main id="cf-error-details"><h1>Sorry, you have been blocked</h1><p>This website is using a security service.</p></main>');
  if(target.hostname==='comix.to')return res.end('<title>Just a moment...</title><main id="challenge-form"><button class="verification-control">Local verification fixture</button></main><script src="https://metrics.example.test/needed.js"></script>');
  return res.end('<title>Readable fixture</title><div data-infinite-content><article>Sample result</article></div><script src="https://metrics.example.test/needed.js"></script><input name="username"><input type="password">');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 try{
  let p=await launch();await p.evaluate(()=>setPage('browser'));
  await invoke(p,'browser-settings',{adblock:{custom:'||metrics.example.test^\ncomix.to##.verification-control'},scrolling:{enabled:true}});
  await navigate(p,'https://ikuhentai.net/');let s=await invoke(p,'browser-state');assert.equal(s.page.reason,'blocked');assert.equal(s.page.challenge,false);assert.match(s.page.message,/server block/);assert.equal(s.scrolling.enabled,false);record('A Cloudflare hard block is distinguished from an unfinished CAPTCHA');
  assert.equal(await p.locator('[data-browser-recovery=reset-verification]').count(),0);await p.waitForSelector('[data-browser-recovery=compatibility-on]');record('Blocked pages expose compatibility recovery without promising CAPTCHA completion');
  await navigate(p,'https://comix.to/');await until(async()=>(await invoke(p,'browser-state')).page.challenge,'Challenge not detected');assert.equal(await web('!!window.fixtureResourceLoaded'),false);record('Default ad filtering still blocks a custom fixture resource');
  await p.locator('[data-browser-recovery=compatibility-on]').click();await until(()=>web('!!window.fixtureResourceLoaded'),'Compatibility did not allow the site resource');s=await invoke(p,'browser-state');assert(s.compatibility.enabled);assert.deepEqual(s.prefs.compatibilitySites,['comix.to']);assert.equal(s.scrolling.enabled,false);assert.notEqual(await web("getComputedStyle(document.querySelector('.verification-control')).display"),'none');record('Compatibility reloads this host with resources and controls visible while scrolling stays paused');
  await assert.rejects(()=>invoke(p,'browser-translate','translate'),/Site compatibility/);await assert.rejects(()=>invoke(p,'browser-scroll','force'),/Site compatibility/);record('Translation and force scrolling cannot alter pages while compatibility is enabled');
  await app.evaluate(async({session})=>{const c=session.fromPartition('persist:dandf-browser').cookies;for(const [url,name] of [['https://comix.to/','cf_clearance'],['https://comix.to/','session'],['https://18comic.vip/','cf_clearance']])await c.set({url,name,value:'fixture',secure:true});});
  await p.locator('[data-browser-recovery=reset-verification]').click();await until(async()=>{const rows=await app.evaluate(async({session})=>session.fromPartition('persist:dandf-browser').cookies.get({url:'https://comix.to/'}));return !rows.some(c=>c.name==='cf_clearance');},'Verification cookie was not removed');const rows=await app.evaluate(async({session})=>session.fromPartition('persist:dandf-browser').cookies.get({}));assert(rows.some(c=>c.name==='session'&&c.domain==='comix.to'));assert(rows.some(c=>c.name==='cf_clearance'&&c.domain==='18comic.vip'));record('Verification reset preserves the site login cookie and other hosts’ clearance');
  await p.screenshot({path:path.join(qa,'site-compatibility.png')});
  await navigate(p,'https://hentaihere.com/');assert.equal((await invoke(p,'browser-state')).compatibility.enabled,false);assert.equal(await web('!!window.fixtureResourceLoaded'),false);record('Protection stays enabled on unrelated sites');
  await navigate(p,'https://comix.to/');await app.close();app=null;p=await launch();await p.evaluate(()=>setPage('browser'));await navigate(p,'https://comix.to/');await until(()=>web('!!window.fixtureResourceLoaded'),'Compatibility preference did not survive restart');assert((await invoke(p,'browser-state')).compatibility.enabled);record('Exact-host compatibility preference survives closing and reopening D&F');
  await p.locator('[data-browser-recovery=compatibility-off]').click();await until(async()=>!(await invoke(p,'browser-state')).compatibility.enabled,'Compatibility did not switch off');await until(async()=>!(await invoke(p,'browser-state')).loading,'Reload did not finish');assert.equal(await web('!!window.fixtureResourceLoaded'),false);record('Restoring site helpers reloads with normal ad filtering again');
  const result=await invoke(p,'browser-connection');assert.equal(result.host,'comix.to');assert(result.system&&result.chromium);record('The connection check returns both Windows and Chromium DNS results');
  // Emit the Chromium failure event deterministically, without DNS interception or external access.
  await app.evaluate(({webContents})=>{const w=webContents.getAllWebContents().find(w=>w.getURL()==='https://comix.to/');w.emit('did-fail-load',{},-105,'ERR_NAME_NOT_RESOLVED','https://comix.to/',true);});
  await p.waitForSelector('[data-browser-recovery=diagnose]');assert.equal((await invoke(p,'browser-state')).page.reason,'dns');await p.locator('[data-browser-recovery=diagnose]').click();await p.waitForSelector('#modal-title:text-is("Site connection check")');await p.screenshot({path:path.join(qa,'connection-check.png')});record('A DNS failure offers a readable connection-check dialog instead of cookie recovery');
  assert.deepEqual(errors,[]);record('No application renderer errors throughout site recovery workflows');
 }finally{if(app)await app.close();server.close();fs.writeFileSync(path.join(qa,'site-recovery-report.json'),JSON.stringify({passed:checks.length===12&&!errors.length,checks,errors},null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
