'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {BrowserWorkspace}=require('../app/browser.cjs');
const sessions=require('../app/browser-plugins/tab-sessions.cjs');
const pages=count=>Array.from({length:count},(_,index)=>({id:'tab-'+index,url:'https://fixture.test/page/'+(index+1),title:'Page '+(index+1),scrollEnabled:index%2===0}));
function workspace(count=0){let sequence=count;return {tabs:pages(count),prefs:{sessionPlugin:true},savedSessions:[],views:new Map(),ensureRuntime(){},detach(){},blank:()=>({id:'new-'+(++sequence),url:'',title:'New tab'}),commit(){},activate(id){this.activeId=id;},send(){},win:{webContents:{focus(){}}},collector:{cancel(){}},translator:{stop(){}},scroller:{stop(){}}};}
test('all one hundred tab addresses survive named-session export and import in order',()=>{
 const original=pages(100),saved=sessions.snapshot('Full workspace',original);assert.equal(sessions.MAX_TABS,100);assert.equal(saved.tabs.length,100);
 const imported=sessions.saved(JSON.parse(JSON.stringify([saved])));assert.equal(imported.length,1);
 assert.deepEqual(imported[0].tabs.map(tab=>[tab.url,tab.title,tab.scrollEnabled]),original.map(tab=>[tab.url,tab.title,tab.scrollEnabled]));
 assert.equal(new Set(imported[0].tabs.map(tab=>tab.id)).size,100);assert.equal(sessions.tabs(pages(101)).length,100);assert.equal(sessions.saved([{tabs:pages(120)}])[0].tabs.length,100);
});
test('the hundredth open tab succeeds and the one hundred and first leaves the workspace unchanged',()=>{
 const browser=workspace(99),id=BrowserWorkspace.prototype.newTab.call(browser,'https://fixture.test/page/100',false);assert.equal(browser.tabs.length,100);assert.equal(browser.tabs.at(-1).id,id);
 const before=JSON.stringify(browser.tabs);assert.throws(()=>BrowserWorkspace.prototype.newTab.call(browser,'https://fixture.test/page/101',false),/100 open tabs/);assert.equal(JSON.stringify(browser.tabs),before);
});
test('appending a saved session respects one hundred tabs without partially restoring overflow',()=>{
 const browser=workspace(1);browser.savedSessions=[{id:'saved',tabs:pages(99)}];BrowserWorkspace.prototype.sessions.call(browser,'restore',{id:'saved'});assert.equal(browser.tabs.length,100);
 const full=workspace(2);full.savedSessions=browser.savedSessions;const before=JSON.stringify(full.tabs);assert.throws(()=>BrowserWorkspace.prototype.sessions.call(full,'restore',{id:'saved'}),/100 open tabs/);assert.equal(JSON.stringify(full.tabs),before);
});
test('replacing open tabs restores all one hundred saved pages and selects the first',()=>{
 const browser=workspace(4);browser.savedSessions=[{id:'saved',tabs:pages(100)}];BrowserWorkspace.prototype.sessions.call(browser,'restore',{id:'saved',replace:true});assert.equal(browser.tabs.length,100);assert.equal(browser.activeId,browser.tabs[0].id);assert.deepEqual(browser.tabs.map(tab=>tab.url),pages(100).map(tab=>tab.url));
});

test('site shortcuts reuse a matching tab even when one hundred tabs are open',()=>{
 const browser=workspace(100);let selected;browser.activate=id=>selected=id;browser.newTab=()=>{throw Error('No new slot should be needed');};const before=JSON.stringify(browser.tabs);const result=BrowserWorkspace.prototype.open.call(browser,'https://fixture.test/page/1');assert.equal(result.reused,true);assert.equal(selected,browser.tabs[0].id);assert.equal(JSON.stringify(browser.tabs),before);
});
test('different search addresses remain separate and unsafe shortcut URLs are rejected',()=>{
 const browser=workspace(1);let opened;browser.newTab=url=>(opened=url,'created');const before=JSON.stringify(browser.tabs);assert.deepEqual(BrowserWorkspace.prototype.open.call(browser,'https://fixture.test/page/1?tags=sky'),{id:'created',reused:false});assert.equal(opened,'https://fixture.test/page/1?tags=sky');assert.equal(JSON.stringify(browser.tabs),before);assert.throws(()=>BrowserWorkspace.prototype.open.call(browser,'javascript:alert(1)'),/HTTPS/);assert.throws(()=>BrowserWorkspace.prototype.open.call(browser,'https://user:secret@fixture.test/'),/HTTPS/);
});

test('sorting tabs retains the selected view, orders domain/title/date and preserves access dates',()=>{
 const browser=workspace(3);browser.activeId='tab-1';browser.snapshot=()=>({tabs:browser.tabs,activeId:browser.activeId});browser.tabs[0].title='Zulu';browser.tabs[0].url='https://z.example/x';browser.tabs[0].accessedAt=20;browser.tabs[1].title='Alpha';browser.tabs[1].url='https://a.example/x';browser.tabs[1].accessedAt=10;browser.tabs[2].title='Bravo';browser.tabs[2].url='https://b.example/x';browser.tabs[2].accessedAt=30;
 BrowserWorkspace.prototype.sortTabs.call(browser,'title');assert.deepEqual(browser.tabs.map(t=>t.title),['Alpha','Bravo','Zulu']);assert.equal(browser.activeId,'tab-1');
 BrowserWorkspace.prototype.sortTabs.call(browser,'domain');assert.deepEqual(browser.tabs.map(t=>new URL(t.url).hostname),['a.example','b.example','z.example']);
 BrowserWorkspace.prototype.sortTabs.call(browser,'accessed');assert.deepEqual(browser.tabs.map(t=>t.accessedAt),[30,20,10]);assert.equal(browser.activeId,'tab-1');
 const restored=sessions.tabs(browser.tabs);assert.deepEqual(restored.map(t=>t.accessedAt),[30,20,10]);
});
test('closing a side preserves its anchor, other side and remaining active tab',()=>{
 const browser=workspace(5);browser.activeId='tab-0';browser.win.contentView={children:[],removeChildView(){}};browser.position=()=>{};
 BrowserWorkspace.prototype.closeSide.call(browser,'tab-2','left');assert.deepEqual(browser.tabs.map(t=>t.id),['tab-2','tab-3','tab-4']);assert.equal(browser.activeId,'tab-2');
 BrowserWorkspace.prototype.closeSide.call(browser,'tab-2','right');assert.deepEqual(browser.tabs.map(t=>t.id),['tab-2']);assert.equal(browser.activeId,'tab-2');
 const before=JSON.stringify(browser.tabs);BrowserWorkspace.prototype.closeSide.call(browser,'missing','right');assert.equal(JSON.stringify(browser.tabs),before);
});
