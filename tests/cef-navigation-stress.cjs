'use strict';
const {_electron:electron}=require('playwright'),{createCefSession}=require('../app/cef-runtime.cjs');
const path=require('node:path'),os=require('node:os'),fs=require('node:fs'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'ff-cef-nav-'));
(async()=>{let app,session;try{
 app=await electron.launch({args:[path.join(__dirname,'cef-parent.cjs')],cwd:root,timeout:60000});await app.firstWindow();const handle=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getNativeWindowHandle().toString('hex'));
 session=createCefSession({win:{getNativeWindowHandle:()=>Buffer.from(handle,'hex')},dataDir,qaMode:true,...(process.env.DF_CEF_HELPER?{helperPath:process.env.DF_CEF_HELPER}:{})});session.webRequest.onBeforeRequest((_,done)=>done({cancel:false}));
 session.runtime.on('ready',()=>{session.runtime.child?.once('exit',(code,signal)=>{if(!session.runtime.closed)console.error('CEF helper exited unexpectedly:',code,signal);});session.runtime.child?.stderr?.on('data',chunk=>console.error('CEF helper:',String(chunk)));});
 await session.setFixtures([{hostname:'fixture.test',path:'/frames',headers:{'Content-Type':'text/html'},body:'<title>Frames</title><iframe src="https://sub.fixture.test/frame"></iframe>'},{hostname:'sub.fixture.test',path:'/frame',headers:{'Content-Type':'text/html'},body:'<p>Frame</p>'},{hostname:'fixture.test',path:'/missing',status:404,headers:{'Content-Type':'text/html'},body:'<title>Missing</title>'},{hostname:'fixture.test',path:'/challenge',headers:{'Content-Type':'text/html'},body:'<title>Just a moment...</title><form id="challenge-form">Verify you are human</form>'}]);
 if(process.env.DF_CEF_DEBUG==='1'){const {spawn}=require('node:child_process');const debuggerProcess=spawn('python',[path.join(__dirname,'cef-debug-watch.py'),String(session.runtime.child.pid)],{stdio:['ignore','pipe','inherit']});await new Promise((resolve,reject)=>{debuggerProcess.stdout.on('data',x=>{process.stdout.write(x);if(String(x).includes('DEBUG-READY'))resolve();});debuggerProcess.once('exit',code=>{if(code)reject(Error('debugger exited '+code));});});}
 const view=session.createView({id:'stress'}),w=view.webContents;let complete=0;w.on('did-stop-loading',()=>complete++);for(let i=0;i<Number(process.env.DF_STRESS_NAV_COUNT||40);i++){
  const part=['frames','missing','challenge'][i%3],before=complete;await w.loadURL('https://fixture.test/'+part);for(let j=0;j<150&&complete===before;j++)await new Promise(r=>setTimeout(r,100));
  const value=await Promise.race([w.executeJavaScript('document.title'),new Promise((_,reject)=>setTimeout(()=>reject(Error('CDP stalled after '+i+' '+part)),8000))]);assert(value);if(i%5===0)console.log('PASS navigation '+i+' '+part);
 }
 console.log('PASS repeated CEF navigation and cross-origin frames');
 const openFresh=[];for(let i=0;i<12;i++){
  console.log('Checking fresh tab '+i);
  const fresh=session.createView({id:'fresh-'+i}),page=fresh.webContents,target='https://fixture.test/challenge?fresh='+i;
  await page.loadURL(target);
  for(let j=0;j<200&&(page.getURL()!==target||page.isLoading());j++)await new Promise(r=>setTimeout(r,50));
  assert.equal(page.getURL(),target,'fresh tab did not navigate');assert.equal(page.isLoading(),false,'fresh tab did not finish');
  assert.equal(await page.executeJavaScript('document.querySelector("#challenge-form")?.textContent'),'Verify you are human','fresh tab reported completion before its page was ready');
  console.log('Closing fresh tab '+i);
  if(process.env.DF_KEEP_FRESH_OPEN==='1')openFresh.push(page);else {await session.runtime.call('close',{tabId:page.tabId});await page.close();assert.equal(await w.executeJavaScript('document.title'),'Frames','closing a tab must leave the existing tab and browser alive');}
 }
 for(const page of openFresh){await session.runtime.call('close',{tabId:page.tabId});await page.close();assert.equal(await w.executeJavaScript('document.title'),'Frames','closing a tab must leave the existing tab and browser alive');}
 await w.close();console.log('PASS fresh tabs report completion only after the requested page loads');
 const closingViews=[];for(let i=0;i<4;i++){const item=session.createView({id:'shutdown-'+i}).webContents;await item.loadURL('https://fixture.test/challenge?shutdown='+i);closingViews.push(item);}
 const helper=session.runtime.child,exited=new Promise(resolve=>helper.once('exit',code=>resolve(code)));
 const pending=closingViews.map(item=>session.runtime.call('close',{tabId:item.tabId}).catch(error=>({error:error.message})));await new Promise(r=>setTimeout(r,30));
 await session.close();const results=await Promise.all(pending);assert(results.every(result=>result===true),JSON.stringify(results));assert.equal(await exited,0,'helper did not exit cleanly while tabs were closing');
 console.log('PASS browser shutdown waits for tabs already closing');
 }finally{await session?.close();await app?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
