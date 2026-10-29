'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {BrowserWorkspace}=require('../app/browser.cjs');

function context(previous,health){
  let currentUrl='https://18comic.vip/photo/123456';
  const web={getURL:()=>currentUrl,isLoading:()=>false,isDestroyed:()=>false,executeJavaScript:async()=>health};
  const pageStates=new Map([['tab',previous]]);
  return {web,pageStates,current:()=>web,active:()=>({id:'tab'}),emit:()=>{},snapshot:()=>({page:pageStates.get('tab')}),navigate:url=>{currentUrl=url;}};
}

test('only explicit readable content releases a prior HTTP access status',async()=>{
  for(const httpStatus of [401,403]){
    const previous={kind:'http',httpStatus,message:'Access failed'};
    for(const readable of [undefined,false]){
      const browser=context(previous,{kind:'ok',readable,message:''});
      assert.strictEqual(await BrowserWorkspace.prototype.refreshAccess.call(browser),previous);
    }
    const recovered={kind:'ok',readable:true,message:''},browser=context(previous,recovered);
    assert.strictEqual(await BrowserWorkspace.prototype.refreshAccess.call(browser),recovered);
    assert.strictEqual(browser.pageStates.get('tab'),recovered);
  }
});

test('readable markers do not clear a real missing-page, cooldown or server status',async()=>{
  for(const httpStatus of [404,429,500,503,509]){
    const previous={kind:'http',httpStatus,message:'Server response'};
    const browser=context(previous,{kind:'ok',readable:true,message:''});
    assert.strictEqual(await BrowserWorkspace.prototype.refreshAccess.call(browser),previous);
  }
});

test('an actual challenge or sign-in classification still prevents recovery',async()=>{
  for(const health of [{kind:'access',readable:false,challenge:true},{kind:'access',readable:false,message:'Sign in'}]){
    const browser=context({kind:'http',httpStatus:403},health);
    assert.strictEqual(await BrowserWorkspace.prototype.refreshAccess.call(browser),health);
  }
});

test('access recovery rejects a page that navigates while its DOM is being checked',async()=>{
  const browser=context({kind:'http',httpStatus:403},{kind:'ok',readable:true});
  browser.web.executeJavaScript=async()=>{browser.navigate('https://18comic.vip/login');return {kind:'ok',readable:true};};
  await assert.rejects(()=>BrowserWorkspace.prototype.refreshAccess.call(browser),/navigated while checking/);
  assert.equal(browser.pageStates.get('tab').kind,'http');
});
