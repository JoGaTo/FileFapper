'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {pageHealth}=require('../app/browser-plugins/infinite-dom.cjs');
const output=process.env.DF_ACCESS_QA&&path.resolve(process.env.DF_ACCESS_QA);
const image='<img id="album_photo_1" data-original="https://fixture.invalid/media/photos/123456/00001.jpg" width="800" height="1200">';
const hiddenWidget='<div hidden><iframe src="https://challenges.cloudflare.com/widget"></iframe></div>';
const widget='<iframe title="Verification" src="https://challenges.cloudflare.com/widget"></iframe>';
const fixtures=[
  {name:'Readable lazy JM chapter ignores a hidden passive verification widget',html:'<title>Chapter fixture</title>'+image+hiddenWidget,kind:'ok',readable:true},
  {name:'A hidden stale challenge form does not hide a readable chapter',html:'<title>Chapter fixture</title>'+image+'<form id="challenge-form" hidden></form>',kind:'ok',readable:true},
  {name:'A real challenge title overrides a cached chapter image',html:'<title>Just a moment...</title>'+image,kind:'access',readable:false,challenge:true},
  {name:'An exact 403 Forbidden title overrides a cached chapter image',html:'<title>403 Forbidden</title>'+image,kind:'access',readable:false,challenge:false,reason:'blocked'},
  {name:'An exact Forbidden title with a Cloudflare suffix remains blocked',html:'<title>Forbidden - Cloudflare</title>'+image,kind:'access',readable:false,challenge:false,reason:'blocked'},
  {name:'An ordinary Forbidden city chapter and hidden error template stay readable',html:'<title>Forbidden city - chapter 4</title>'+image+'<div id="cf-error-details" hidden>Sorry, you have been blocked</div>',kind:'ok',readable:true},
  {name:'A visible challenge form overrides chapter markers',html:'<title>Chapter fixture</title>'+image+'<form id="challenge-form">Verify you are human</form>',kind:'access',readable:false,challenge:true},
  {name:'A visible verification frame without reader content stays blocked',html:'<title>Site fixture</title>'+widget,kind:'access',readable:false,challenge:true},
  {name:'Placeholder reader images do not override visible verification',html:'<title>Site fixture</title><img id="album_photo_1" src="https://fixture.invalid/loading.png" width="800" height="1200">'+widget,kind:'access',readable:false,challenge:true},
  {name:'An explicit one-pixel marker does not establish chapter access',html:'<title>Site fixture</title><img id="album_photo_1" src="https://fixture.invalid/media/photos/123456/00001.jpg" width="1" height="1">'+widget,kind:'access',readable:false,challenge:true},
  {name:'A one-pixel strip cannot count as a readable chapter',html:'<title>Site fixture</title><img id="album_photo_1" src="https://fixture.invalid/media/photos/123456/00001.jpg" width="1" height="800">'+widget,kind:'access',readable:false,challenge:true},
  {name:'A locked sign-in reader stays access restricted',html:'<title>Sign in</title><input type="password"><main data-reader-locked="1">'+image+'</main>',kind:'access',readable:false},
  {name:'A visible locked reader overrides a cached image outside its subtree',html:'<title>Chapter fixture</title><main id="readerApp" data-reader-locked="1">Sign in to read</main>'+image,kind:'access',readable:false,challenge:false,reason:'signin'},
  {name:'A hidden locked template does not block a readable chapter',html:'<title>Chapter fixture</title><main id="readerApp" data-reader-locked="1" hidden>Sign in to read</main>'+image,kind:'ok',readable:true},
  {name:'A real member login title overrides a cached chapter image',html:'<title>Member login</title><input type="password">'+image,kind:'access',readable:false},
  {name:'A login document with placeholders still requires sign-in',html:'<title>Member login</title><input type="password"><img id="album_photo_1" src="https://fixture.invalid/placeholder.png" width="800" height="1200">',kind:'access',readable:false},
  {name:'A visible hard block overrides cached reader markup',html:'<title>Access denied</title>'+image+'<div id="cf-error-details">Sorry, you have been blocked. Error code 1020.</div>',kind:'access',readable:false,reason:'blocked'},
  {name:'Hidden chapter images do not establish readable access',html:'<title>Site fixture</title><div hidden>'+image+'</div>'+widget,kind:'access',readable:false,challenge:true},
  {name:'A disabled or zero-area passive widget is not an interstitial',html:'<title>Site fixture</title><iframe aria-disabled="true" src="https://challenges.cloudflare.com/widget"></iframe><iframe style="width:0;height:0;border:0" src="https://challenges.cloudflare.com/widget"></iframe>',kind:'ok',readable:false},
  {name:'An existing reader selector remains readable',html:'<title>Chapter fixture</title><div class="reading-content"><img src="https://fixture.invalid/media/photos/123456/00001.jpg" width="800" height="1200"></div>'+hiddenWidget,kind:'ok',readable:true},
  {name:'An extensionless decoded chapter image establishes readable access',html:'<title>Chapter fixture</title><img id="album_photo_1" src="https://fixture.invalid/render/real-page" width="800" height="1200">'+hiddenWidget,kind:'ok',readable:true},
  {name:'A blank ready document cannot establish access-error recovery',html:'<title>Ready</title><h1>Ready</h1>',kind:'ok',readable:false}
];
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.DF_CHROME_EXE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const checks=[];
  try{
    const page=await browser.newPage();
    const png=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=240;canvas.height=320;canvas.getContext('2d').fillRect(0,0,240,320);return canvas.toDataURL('image/png').split(',')[1];}),'base64');
    await page.route('**/*',route=>['https://fixture.invalid/loading.png','https://fixture.invalid/render/real-page'].includes(route.request().url())?route.fulfill({status:200,contentType:'image/png',body:png}):route.abort());
    for(const fixture of fixtures){
      await page.setContent(fixture.html,{waitUntil:'load'});
      const health=await page.evaluate(source=>(0,eval)(source),`(${pageHealth.toString()})(document,'https://18comic.vip/photo/123456')`);
      assert.equal(health.kind,fixture.kind,fixture.name);assert.equal(health.readable,fixture.readable,fixture.name);
      if(fixture.challenge!==undefined)assert.equal(health.challenge,fixture.challenge,fixture.name);
      if(fixture.reason)assert.equal(health.reason,fixture.reason,fixture.name);
      checks.push(fixture.name);console.log('PASS '+fixture.name);
    }
    const report={passed:true,checks,externalRequestsMade:false,fixtureImages:'Locally generated solid-color raster; other resource requests aborted.'};
    if(output){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'access-health-report.json'),JSON.stringify(report,null,2));}
    console.log(JSON.stringify({passed:true,checks:checks.length}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
