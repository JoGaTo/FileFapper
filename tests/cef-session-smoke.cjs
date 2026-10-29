'use strict';
const {_electron:electron}=require('playwright'),{createCefSession}=require('../app/cef-runtime.cjs');
const path=require('node:path'),os=require('node:os'),fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{let app,session,server;const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'ff-cef-session-'));try{
 const requests=[];server=http.createServer((req,res)=>{requests.push(req.url);res.writeHead(200,{'Content-Type':'text/html'});res.end('<title>CEF session fixture</title><p id="fixture">Ready</p><img src="/blocked.png">');});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/page';
 app=await electron.launch({args:[path.join(__dirname,'cef-parent.cjs')],cwd:root,env:{...process.env},timeout:60000});await app.firstWindow();const handle=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getNativeWindowHandle().toString('hex'));
 session=createCefSession({win:{getNativeWindowHandle:()=>Buffer.from(handle,'hex')},dataDir});session.setInitialCookies([{name:'fixture',value:'cookie',domain:'127.0.0.1',path:'/',hostOnly:true,session:true}]);session.webRequest.onBeforeRequest((request,done)=>done({cancel:request.url.endsWith('/blocked.png')}));
 const ready=await session.prepareForWorker();assert.equal(ready.identity.engine,'Chromium Embedded Framework');assert.match(ready.userAgent,/Chrome\//);assert.equal((await session.cookies.get({url})).find(c=>c.name==='fixture')?.value,'cookie');
 const view=session.createView({id:'test'});await view.webContents.loadURL(url);let body;for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,100));body=await view.webContents.executeJavaScript('document.querySelector("#fixture")?.textContent');if(body==='Ready')break;}assert.equal(body,'Ready');await new Promise(r=>setTimeout(r,300));assert(!requests.includes('/blocked.png'));
 await view.webContents.executeJavaScript('localStorage.setItem("fixture","stored")');await session.clearStorageData({storages:['localstorage']});assert.equal(await view.webContents.executeJavaScript('localStorage.getItem("fixture")'),null);assert.equal((await session.cookies.get({url})).find(c=>c.name==='fixture')?.value,'cookie');
 await session.clearStorageData({storages:['cookies']});assert(!(await session.cookies.get({url})).some(c=>c.name==='fixture'));
 assert(fs.existsSync(path.join(dataDir,'CefBrowser')));assert(!fs.existsSync(path.join(dataDir,'EdgeBrowser')));await view.webContents.close();console.log('PASS isolated FileFapper CEF session, cookie restore, navigation and request filtering');
 }finally{await session?.close();await app?.close();server?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
