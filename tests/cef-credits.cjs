'use strict';
// Capture the CEF build's own Chromium component notices for redistribution.
const {_electron:electron}=require('playwright'),{createCefSession}=require('../app/cef-runtime.cjs');
const path=require('node:path'),os=require('node:os'),fs=require('node:fs'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{let app,session;const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'ff-cef-credits-'));try{
 app=await electron.launch({args:[path.join(__dirname,'cef-parent.cjs')],cwd:root,timeout:60000});await app.firstWindow();const handle=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getNativeWindowHandle().toString('hex'));
 session=createCefSession({win:{getNativeWindowHandle:()=>Buffer.from(handle,'hex')},dataDir,qaMode:true});const view=session.createView({id:'__credits'});await view.webContents.ensure();await session.runtime.call('navigate',{tabId:'__credits',url:'chrome://credits/'});
 let html='';for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,100));const result=await session.runtime.cdp('__credits','Runtime.evaluate',{expression:'document.documentElement?.outerHTML||""',returnByValue:true});html=result.result.value||'';if(html.includes('Chromium')&&html.length>50000)break;}
 assert(html.includes('Chromium')&&html.length>50000,'CEF credits were not available');const dest=path.join(root,'assets','third-party','cef');fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,'CHROMIUM-CREDITS.html'),html);console.log('PASS CEF Chromium notices captured: '+Buffer.byteLength(html)+' bytes');
 }finally{await session?.close();await app?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
