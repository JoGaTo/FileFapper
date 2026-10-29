'use strict';
const {_electron:electron}=require('playwright'),{launchPackaged}=require('./launch_packaged.cjs');
const path=require('node:path'),os=require('node:os'),fs=require('node:fs'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'ff-clean-release-'));
(async()=>{let app;try{
 const options={cwd:root,env:{...process.env,DF_DATA_DIR:profile,DF_SHOW_UI:'0',DF_BROWSER_ENGINE:'cef'}};
 app=process.env.DF_APP_EXE?await launchPackaged(process.env.DF_APP_EXE,options):await electron.launch({args:[root],...options,timeout:60000});
 const page=await app.firstWindow();await page.waitForSelector('#urls');
 assert.equal((await page.locator('.version span').first().textContent()).trim(),'v1.0');
 assert.equal(await app.evaluate(({app})=>app.getVersion()),'1.0.0');
 const state=await page.evaluate(()=>window.df.invoke('get-state'));
 assert.deepEqual(state.cookieSummary,[]);assert.deepEqual(state.accountSummary,[]);assert.deepEqual(state.tasks,[]);
 assert(!fs.existsSync(path.join(profile,'cookies.bin')));assert(!fs.existsSync(path.join(profile,'accounts.bin')));
 console.log('PASS clean profile starts with no saved cookies, accounts or tasks');
 }finally{await app?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
