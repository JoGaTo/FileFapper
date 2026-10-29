'use strict';
const {_electron:electron}=require('playwright'),{createCefSession}=require('../app/cef-runtime.cjs');
const path=require('node:path'),os=require('node:os'),fs=require('node:fs'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{let app,session;const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'ff-cef-pixiv-'));try{
 app=await electron.launch({args:[path.join(__dirname,'cef-parent.cjs')],cwd:root,timeout:60000});await app.firstWindow();const handle=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getNativeWindowHandle().toString('hex'));
 session=createCefSession({win:{getNativeWindowHandle:()=>Buffer.from(handle,'hex')},dataDir,qaMode:true});session.webRequest.onBeforeRequest((request,done)=>done({cancel:false}));
 const attack='<script>__filefapperNativeSend(JSON.stringify({kind:"df-pixiv-fetch",id:"subframe",url:"https://i.pximg.net/test.jpg",method:"GET"}))</script>';
 await session.setFixtures([{hostname:'www.pixiv.net',path:'/',status:200,headers:{'Content-Type':'text/html'},body:'<title>Pixiv fixture</title><p id="ready">Ready</p><iframe src="https://evil.test/evil"></iframe><iframe src="/iframe"></iframe>'},{hostname:'evil.test',path:'/evil',status:200,headers:{'Content-Type':'text/html'},body:attack},{hostname:'www.pixiv.net',path:'/iframe',status:200,headers:{'Content-Type':'text/html'},body:attack}]);
 const events=[];session.runtime.on('web-message',e=>events.push({source:e.source,kind:e.message?.kind,id:e.message?.id}));session.setPixivHandler(async()=>({bytes:Buffer.from([7,8,9])}));const view=session.createView({id:'pixiv'});await view.webContents.loadURL('https://www.pixiv.net/');let ready=false;
 for(let i=0;i<150;i++){await new Promise(r=>setTimeout(r,100));try{ready=await view.webContents.executeJavaScript('!!document.querySelector("#ready")&&!!window.__dfPixivNetwork');}catch{}if(ready)break;}assert(ready,'The Pixiv bridge did not initialize');
 await view.webContents.executeJavaScript('window.__bridgeResult=null;window.__dfPixivNetwork.request({url:"https://i.pximg.net/test.jpg",method:"GET"}).then(r=>window.__bridgeResult=r.error?{error:r.error}:Array.from(r.bytes));true');let result;for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,100));result=await view.webContents.executeJavaScript('window.__bridgeResult');if(result)break;}assert.deepEqual(result,[7,8,9],'Bridge events: '+JSON.stringify(events));await new Promise(r=>setTimeout(r,500));assert(!events.some(e=>e.id==='subframe'),'An iframe reached the Pixiv media bridge');
 await view.webContents.close();console.log('PASS isolated CEF Pixiv media request and reply through the FileFapper bridge');
 }finally{await session?.close();await app?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
