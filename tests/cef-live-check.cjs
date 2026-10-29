'use strict';
// Read-only public check in a disposable profile; no user cookies or account.
const {_electron:electron}=require('playwright'),{createCefSession}=require('../app/cef-runtime.cjs');
const path=require('node:path'),os=require('node:os'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),url=process.argv[2]||'https://18comic.vip/';
(async()=>{let app,session;const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'ff-cef-live-'));try{
 app=await electron.launch({args:[path.join(__dirname,'cef-parent.cjs')],cwd:root,timeout:60000});await app.firstWindow();const handle=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getNativeWindowHandle().toString('hex'));
 session=createCefSession({win:{getNativeWindowHandle:()=>Buffer.from(handle,'hex')},dataDir});session.webRequest.onBeforeRequest((_,done)=>done({cancel:false}));const view=session.createView({id:'live'});let error='',finished=false,status=0;view.webContents.on('did-fail-load',(_,code,message)=>{error=code+' '+message});view.webContents.on('did-navigate',(_,__,code)=>{status=code});view.webContents.on('did-stop-loading',()=>{finished=true});await view.webContents.loadURL(url);
 for(let i=0;i<300&&!finished;i++)await new Promise(r=>setTimeout(r,100));
 let page={};try{page=await view.webContents.executeJavaScript('({url:location.href,title:document.title,challenge:/just a moment|verify you are human|checking your browser/i.test(document.title+" "+document.body?.innerText?.slice(0,1000))})');}catch(e){error=error||e.message;}
 if(page.url){const parsed=new URL(page.url);page.url=parsed.origin+parsed.pathname;}console.log(JSON.stringify({engine:session.runtime.identity.engine,version:session.runtime.identity.version,page,status,error,finished,profile:'temporary, no user cookies'}));await view.webContents.close();
 }finally{await session?.close();await app?.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
