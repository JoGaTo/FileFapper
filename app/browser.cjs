'use strict';
const {WebContentsView,Menu,shell,clipboard}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const core=require('./core.cjs');
const tabPlugin=require('./browser-plugins/tab-sessions.cjs');
const translatorPlugin=require('./browser-plugins/page-translator.cjs');
const scrollPlugin=require('./browser-plugins/infinite-scroll.cjs');
const {pageHealth}=require('./browser-plugins/infinite-dom.cjs');
const galleryLists=require('./gallery-lists.cjs');
const {editItems}=require('./edit-menu.cjs');
const ppixivPlugin=require('./browser-plugins/ppixiv.cjs');
const {settings:adSettings}=require('./adblock-settings.cjs');
const connection=require('./site-connection.cjs');
const tagLibrary=require('./saved-tags.cjs');
function preferences(p={}){return {ppixivPlugin:p.ppixivPlugin!==false,ppixivBarHidden:!!p.ppixivBarHidden,restoreTabs:p.restoreTabs!==false,recordHistory:p.recordHistory!==false,sessionPlugin:p.sessionPlugin!==false,translatorPlugin:p.translatorPlugin!==false,
  compatibilitySites:connection.hosts(p.compatibilitySites),adblock:adSettings(p.adblock),translation:translatorPlugin.settings(p.translation),scrolling:scrollPlugin.settings(p.scrolling),galleryCollection:galleryLists.collectionSettings(p.galleryCollection)};}
class BrowserWorkspace{
  constructor({win,session,state={},dataDir,send,persist,runCollection,fillLogin=async()=>({filled:false})}){
    this.win=win;this.session=session;this.dataDir=dataDir;this.send=send;this.persist=persist;this.runCollection=runCollection;this.fillLogin=fillLogin;this.bounds=null;this.views=new Map();this.pageStates=new Map();this.challengeCounts=new Map();this.prefs=preferences(state.prefs);this.savedSessions=tabPlugin.saved(state.savedSessions);this.savedTags=tagLibrary.saved(state.savedTags);
    this.history=(Array.isArray(state.history)?state.history:[]).filter(h=>core.validUrl(h.url,false)).slice(0,300);
    const original=Array.isArray(state.tabs)?state.tabs:[];
    const selectedPosition=original.slice(0,tabPlugin.MAX_TABS).filter(t=>t&&core.validUrl(t.url,false)).findIndex(t=>t.id===state.activeId);
    this.tabs=this.prefs.restoreTabs?tabPlugin.tabs(original):[];
    if(!this.tabs.length)this.tabs=[this.blank()];
    this.activeId=this.tabs[selectedPosition]?.id||this.tabs[0].id;this.popupCount=0;this.ppixiv=new ppixivPlugin.Ppixiv();this.translator=null;this.scroller=null;this.collector=null;this.adblock=null;this.initialized=false;
    this.commit();
  }
  ensureRuntime(){
    if(this.initialized)return;
    const {Adblock}=require('./adblock.cjs');
    this.initialized=true;
    this.translator=new translatorPlugin.Translator({onChange:()=>this.emit()});
    this.scroller=new scrollPlugin.InfiniteScroll({session:this.session,onChange:()=>this.emit(),isVisible:w=>!!this.bounds&&this.current()?.id===w.id&&!this.collector?.status().running});
    this.collector=new galleryLists.GalleryCollector({worker:this.runCollection,read:(...args)=>this.scroller.read(...args),onChange:()=>this.emit()});
    this.adblock=new Adblock(this.session,this.dataDir,()=>this.emit());
    try{this.adblock.configure(this.prefs.adblock,this.prefs.compatibilitySites);}catch(e){this.adblock.error='Ad blocking could not start: '+e.message;}
    this.commit();
  }
  blank(){return {id:crypto.randomUUID(),url:'',title:'New tab'};}
  active(){return this.tabs.find(t=>t.id===this.activeId)||this.tabs[0];}
  current(){return this.views.get(this.activeId)?.webContents;}
  cleanSite(w=this.current()){return !!w&&this.prefs.compatibilitySites.includes(connection.hostOf(w.getURL()));}
  data(){return {prefs:this.prefs,tabs:this.tabs.map(t=>({...t})),activeId:this.activeId,savedSessions:this.savedSessions,savedTags:this.savedTags,history:this.history};}
  snapshot(){const t=this.active(),w=this.current();const base={...t,browserEngine:this.session.isEdge?(this.session.engine||'Microsoft Edge WebView2'):'Electron Chromium',browserVersion:this.session.runtime?.identity?.version||'',maxTabs:tabPlugin.MAX_TABS,runtimeReady:this.initialized,compatibility:{host:connection.hostOf(w?.getURL()||t?.url),enabled:this.cleanSite(w)},listing:galleryLists.listingKind(w?.getURL()||t?.url||''),ppixiv:{...this.ppixiv.status(w),enabled:this.prefs.ppixivPlugin,version:ppixivPlugin.manifest.version,loaded:!!w&&this.prefs.ppixivPlugin&&ppixivPlugin.matches(w.getURL())&&this.ppixiv.targets.has(w.id),active:!!w&&this.prefs.ppixivPlugin&&ppixivPlugin.matches(w.getURL())&&this.ppixiv.targets.has(w.id)&&!w.getURL().includes('#no-ppixiv')},url:w?.getURL()==='about:blank'?'':w?.getURL()||t?.url||'',loading:w?.isLoading()||false,page:this.pageStates.get(t?.id)||{kind:'ok',message:''},canBack:!!w?.navigationHistory.canGoBack(),canForward:!!w?.navigationHistory.canGoForward(),tabs:this.tabs.map(t=>({...t,loading:this.views.get(t.id)?.webContents.isLoading()||false})),activeId:this.activeId,popups:this.popupCount,prefs:this.prefs};if(!this.initialized){return {...base,adblock:{enabled:this.prefs.adblock.enabled,blocked:0},translation:{enabled:false,provider:this.prefs.translation.provider,target:this.prefs.translation.target},scrolling:{enabled:!!this.prefs.scrolling.enabled,force:!!this.prefs.scrolling.force},collection:{status:'ready',running:false,phase:'idle',rows:[],next:null,error:'',count:0}};}return {...base,adblock:this.adblock?.summary(),translation:this.translator.status(w),scrolling:this.scroller.status(w),collection:this.collector.status()};}
  emit(){this.send('browser-state',this.snapshot());}
  commit(){this.persist(this.data());this.emit();}
  ensure(tab){
    this.ensureRuntime();
    if(this.views.has(tab.id))return this.views.get(tab.id);
    const v=this.session.isEdge?this.session.createView(tab,this.win):new WebContentsView({webPreferences:{session:this.session,preload:path.join(__dirname,'browser-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,allowRunningInsecureContent:false}});const w=v.webContents;this.views.set(tab.id,v);
    w.setWindowOpenHandler(({url,disposition})=>{if(core.validUrl(url,false)){if(!this.prefs.adblock.popups||['foreground-tab','background-tab'].includes(disposition)){try{this.newTab(url,disposition!=='background-tab');}catch(e){this.send('browser-error',e.message);}}else{this.popupCount++;this.emit();}}return {action:'deny'};});
    for(const event of ['will-navigate','will-redirect'])w.on(event,(e,url)=>{if(!core.validUrl(url,false)&&url!=='about:blank')e.preventDefault();});
    w.on('will-navigate',(event,url)=>{if(this.prefs.ppixivPlugin&&ppixivPlugin.matches(url)&&!this.ppixiv.targets.has(w.id)){event.preventDefault();this.load(w,url);}});
    const update=()=>{if(w.isDestroyed())return;const url=w.getURL();if(core.validUrl(url,false)){tab.url=url;tab.title=w.getTitle()||new URL(url).hostname;}this.emit();};
    for(const event of ['did-navigate','did-navigate-in-page','did-start-loading','page-title-updated'])w.on(event,update);
    w.on('did-start-navigation',(_,__,inPlace,main)=>{if(main&&!inPlace){this.pageStates.set(tab.id,{kind:'loading',message:''});this.emit();}});
    w.on('did-navigate',(_,__,status)=>{this.collector.cancel(w);this.translator.stop(w,{restore:false});this.scroller.stop(w);this.pageStates.set(tab.id,{kind:status>=400?'http':'ok',httpStatus:status,message:status>=400?([401,403].includes(status)?`Page access failed (HTTP ${status}). Sign in or complete the site’s access check in this tab.`:[429,509].includes(status)?`The site requested a cooldown (HTTP ${status}).`:`The page returned HTTP ${status}.`):''});this.emit();});
    w.on('dom-ready',()=>{if(!this.cleanSite(w))this.fillLogin(w,{automatic:true}).catch(()=>{});});
    w.on('did-navigate-in-page',()=>{this.scroller.stop(w);if(!this.cleanSite(w)&&this.pageStates.get(tab.id)?.kind!=='access'&&!this.ownsScrolling(w)&&(tab.scrollEnabled??this.prefs.scrolling.enabled))this.scroller.enable(w,true,this.prefs.scrolling).catch(()=>{});});
    w.on('did-stop-loading',async()=>{
      update();await this.ppixiv.inspect(w);if(this.prefs.ppixivPlugin&&this.ppixiv.status(w).ready&&!w.getURL().includes('#no-ppixiv'))try{await this.ppixiv.setToolbar(w,this.prefs.ppixivBarHidden);}catch{}if(this.session.isEdge)try{await this.adblock.applyCosmetics(w);}catch{}if(w.isDestroyed())return;const url=w.getURL();
      if(core.validUrl(url,false))try{
        const health=await w.executeJavaScript(`(${pageHealth.toString()})(document,location.href)`);
        if(w.isDestroyed()||w.getURL()!==url)return;
        if(health.kind!=='ok'){
          if(health.challenge){const previous=this.challengeCounts.get(tab.id),host=new URL(url).hostname,count=previous?.host===host?previous.count+1:1;this.challengeCounts.set(tab.id,{host,count});health.repeats=count;if(count>=3)health.message='The site has repeated its verification. Try Site compatibility to reload this host without ad filters or page helpers. If verification still repeats, use your regular browser. Imported cookies may not transfer the browser’s clearance to a downloader connection.';}
          this.pageStates.set(tab.id,{...this.pageStates.get(tab.id),...health});this.collector.cancel(w);this.translator.stop(w,{restore:false});this.scroller.stop(w);
        }else{this.challengeCounts.delete(tab.id);if(this.pageStates.get(tab.id)?.kind==='access')this.pageStates.set(tab.id,{kind:'ok',message:''});}
      }catch{}
      if(w.isDestroyed()||w.getURL()!==url)return;
      if(!this.cleanSite(w))this.fillLogin(w,{automatic:true}).catch(()=>{});
      const ready=!['access','http','network'].includes(this.pageStates.get(tab.id)?.kind);
      if(ready&&this.prefs.recordHistory&&core.validUrl(tab.url,false)){this.history=this.history.filter(h=>h.url!==tab.url);this.history.unshift({url:tab.url,title:tab.title,visitedAt:new Date().toISOString()});this.history=this.history.slice(0,300);}
      if(ready&&!this.cleanSite(w)&&!this.ownsScrolling(w)&&(tab.scrollEnabled??this.prefs.scrolling.enabled))this.scroller.enable(w,true,this.prefs.scrolling).catch(()=>{});
      this.commit();
    });
    w.on('did-fail-load',(_,code,description,url,main)=>{if(code!==-3&&main){this.pageStates.set(tab.id,connection.networkPage(code,description,url||tab.url));this.emit();}});
    w.on('context-menu',async(_,p)=>{
      // ppixiv owns its artwork menu (bookmark, artist, zoom, ugoira controls).
      if(!p.isEditable&&this.prefs.ppixivPlugin&&ppixivPlugin.matches(w.getURL()))try{if(await w.executeJavaScript("!!window.ppixiv?.app&&!location.hash.includes('no-ppixiv')"))return;}catch{}
      const items=p.isEditable?editItems(p):[{role:'copy',label:'Copy selected text',enabled:!!p.selectionText},{role:'selectAll',label:'Select all'}];
      if(core.validUrl(p.linkURL,false))items.push({type:'separator'},{label:'Open link in new tab',click:()=>this.newTab(p.linkURL,true)},{label:'Open link in background tab',click:()=>this.newTab(p.linkURL,false)},{label:'Copy link address',click:()=>clipboard.writeText(p.linkURL)});
      if(core.validUrl(p.srcURL,false)){
        items.push({type:'separator'},{label:'Copy media address',click:()=>clipboard.writeText(p.srcURL)},{label:'Open media in a new tab',click:()=>this.newTab(p.srcURL,true)},{label:'Save media as…',click:()=>w.downloadURL(p.srcURL)});
        if(p.mediaType==='image')items.push({label:'Copy image',click:()=>w.copyImageAt(p.x,p.y)});
        if(['video','audio'].includes(p.mediaType))for(const [label,command] of [['Play / pause','n.paused?n.play():n.pause()'],['Mute / unmute','n.muted=!n.muted'],['Loop on / off','n.loop=!n.loop']])items.push({label,click:()=>w.executeJavaScript(`(()=>{const n=document.elementFromPoint(${Math.round(p.x)},${Math.round(p.y)})?.closest('video,audio');if(n){${command}}})()`).catch(()=>{})});
      }
      items.push({type:'separator'},{label:'Copy page address',click:()=>clipboard.writeText(w.getURL())},{label:'Translate page',click:()=>this.send('browser-request-translate',true)},{label:'Back',enabled:w.navigationHistory.canGoBack(),click:()=>w.navigationHistory.goBack()},{label:'Forward',enabled:w.navigationHistory.canGoForward(),click:()=>w.navigationHistory.goForward()},{label:'Reload',click:()=>w.reload()});
      items.push({type:'separator'},{label:'Sort tabs',submenu:[{label:'A-Z',click:()=>this.tabCommand('sort-title')},{label:'Domain',click:()=>this.tabCommand('sort-domain')},{label:'Date accessed',click:()=>this.tabCommand('sort-accessed')}]},{label:'Close tabs to the left',click:()=>this.tabCommand('close-left',tab.id)},{label:'Close tabs to the right',click:()=>this.tabCommand('close-right',tab.id)});
      w.focus();Menu.buildFromTemplate(items).popup({window:this.win,...(p.frame?{frame:p.frame}:{})});
    });
    w.on('tab-command',(_,event)=>{if(this.tabs.some(t=>t.id===tab.id))this.tabCommand(event.action,tab.id);});
    w.on('before-input-event',(e,input)=>{if(input.type!=='keyDown'||!input.control)return;const key=input.key.toLowerCase();if(['t','w','l','tab'].includes(key)){e.preventDefault();if(key==='t')this.newTab();if(key==='w')this.closeTab(tab.id);if(key==='l'){this.win.webContents.focus();this.send('browser-focus-address',true);}if(key==='tab')this.cycle(input.shift?-1:1);}});
    w.on('render-process-gone',()=>{this.ppixiv.targets.delete(w.id);this.ppixiv.states.delete(w.id);this.send('browser-error','This tab stopped. Reload the page to reopen it.');});
    w.on('request-translate',()=>this.send('browser-request-translate',true));
    if(tab.url)this.load(w,tab.url);
    return v;
  }
  async load(w,url){try{if(ppixivPlugin.matches(url)||this.ppixiv.targets.has(w.id))await this.ppixiv.configure(w,this.prefs.ppixivPlugin);if(!w.isDestroyed())await w.loadURL(url);}catch(e){if(!w.isDestroyed()&&!/ERR_ABORTED/.test(e.message)){const id=[...this.views].find(([,v])=>v.webContents===w)?.[0],page=connection.networkPage(e.errno,e.message,url);if(id&&!['http','access'].includes(this.pageStates.get(id)?.kind))this.pageStates.set(id,page);this.emit();this.send('browser-error',this.pageStates.get(id)?.message||page.message);}}}
  detach(){for(const v of this.views.values()){if(v.isEdgeView)v.setVisible(false);else if(this.win.contentView.children.includes(v))this.win.contentView.removeChildView(v);}}
  parentMoved(){for(const v of this.views.values())if(v.isEdgeView&&v.visible)v.position(true);}
  position(bounds){this.bounds=bounds;if(!bounds){this.detach();return;}this.ensureRuntime();const v=this.ensure(this.active());if(v.isEdgeView){for(const other of this.views.values())if(other!==v)other.setVisible?.(false);const [width,height]=this.win.getContentSize(),x=Math.max(0,Math.round(bounds.x)),y=Math.max(0,Math.round(bounds.y));v.setBounds({x,y,width:Math.max(0,Math.min(width-x,Math.round(bounds.width))),height:Math.max(0,Math.min(height-y,Math.round(bounds.height)))});v.setVisible(true);return;}for(const other of this.views.values())if(other!==v&&this.win.contentView.children.includes(other))this.win.contentView.removeChildView(other);if(!this.win.contentView.children.includes(v))this.win.contentView.addChildView(v);const [width,height]=this.win.getContentSize(),x=Math.max(0,Math.round(bounds.x)),y=Math.max(0,Math.round(bounds.y));v.setBounds({x,y,width:Math.max(0,Math.min(width-x,Math.round(bounds.width))),height:Math.max(0,Math.min(height-y,Math.round(bounds.height)))});}
  activate(id){if(!this.tabs.some(t=>t.id===id))return;const tab=this.tabs.find(t=>t.id===id);tab.accessedAt=Date.now();if(id===this.activeId&&this.views.has(id)){this.commit();return;}this.activeId=id;this.position(this.bounds);this.commit();}
  open(url){const normalized=core.validUrl(url,false);if(!normalized)throw new Error('Enter an HTTP or HTTPS address.');const existing=this.tabs.find(t=>core.validUrl(this.views.get(t.id)?.webContents.getURL()||t.url,false)===normalized);if(existing){this.activate(existing.id);return {id:existing.id,reused:true};}return {id:this.newTab(normalized),reused:false};}
  tabMenu(position={}){const items=[{label:this.tabs.length+' open '+(this.tabs.length===1?'tab':'tabs'),enabled:false},{type:'separator'},...this.tabs.map((t,index)=>({label:(index+1)+'. '+String((t.title||t.url||'New tab')+(t.url?' — '+new URL(t.url).hostname:'')).replace(/[\r\n\t]+/g,' ').slice(0,120).replace(/&/g,'&&'),type:'radio',checked:t.id===this.activeId,click:()=>this.activate(t.id)}))];const menu=Menu.buildFromTemplate(items),point={};for(const key of ['x','y'])if(Number.isFinite(position[key]))point[key]=Math.max(0,Math.round(position[key]));return new Promise(resolve=>menu.popup({window:this.win,...point,callback:()=>resolve(true)}));}

  navigate(url){if(!core.validUrl(url,false))throw new Error('Enter an HTTP or HTTPS address.');const t=this.active(),v=this.ensure(t);this.collector.cancel(v.webContents);this.translator.stop(v.webContents,{restore:false});this.scroller.stop(v.webContents);t.url=url;this.load(v.webContents,url);this.commit();return url;}
  newTab(url='',active=true){if(this.tabs.length>=tabPlugin.MAX_TABS)throw new Error('The browser supports up to 100 open tabs. Close a tab first.');if(url&&!core.validUrl(url,false))throw new Error('Invalid tab address.');const t={...this.blank(),url,title:url?new URL(url).hostname:'New tab'};this.tabs.push(t);if(active){this.activate(t.id);if(!url){this.win.webContents.focus();this.send('browser-focus-address',true);}}else this.commit();return t.id;}
  closeTab(id){const index=this.tabs.findIndex(t=>t.id===id);if(index<0)return;const v=this.views.get(id);if(v){this.collector.cancel(v.webContents);this.translator.stop(v.webContents,{restore:false});this.scroller.stop(v.webContents);if(this.win.contentView.children.includes(v))this.win.contentView.removeChildView(v);v.webContents.close();this.views.delete(id);}this.tabs.splice(index,1);if(!this.tabs.length)this.tabs.push(this.blank());if(id===this.activeId)this.activeId=this.tabs[Math.min(index,this.tabs.length-1)].id;this.position(this.bounds);this.commit();}
  sortTabs(mode){if(!['title','domain','accessed'].includes(mode))throw new Error('Choose a tab sort order.');const domain=t=>{try{return new URL(t.url).hostname.toLowerCase();}catch{return '\uffff';}};const alpha=(a,b)=>String(a||'').localeCompare(String(b||''),undefined,{numeric:true,sensitivity:'base'});this.tabs=this.tabs.map((tab,index)=>({tab,index})).sort((a,b)=>{const n=mode==='title'?alpha(a.tab.title||a.tab.url,b.tab.title||b.tab.url):mode==='domain'?alpha(domain(a.tab),domain(b.tab)):Number(b.tab.accessedAt||0)-Number(a.tab.accessedAt||0);return n||a.index-b.index;}).map(x=>x.tab);this.commit();return this.snapshot();}
  closeSide(id,side){const at=this.tabs.findIndex(t=>t.id===id);if(at<0||!['left','right','others'].includes(side))return;const targets=this.tabs.filter((t,index)=>side==='left'?index<at:side==='right'?index>at:t.id!==id),ids=new Set(targets.map(t=>t.id));for(const t of targets){const v=this.views.get(t.id);if(v){this.collector.cancel(v.webContents);this.translator.stop(v.webContents,{restore:false});this.scroller.stop(v.webContents);if(this.win.contentView.children.includes(v))this.win.contentView.removeChildView(v);v.webContents.close();this.views.delete(t.id);}}this.tabs=this.tabs.filter(t=>!ids.has(t.id));if(ids.has(this.activeId))this.activeId=id;this.position(this.bounds);this.commit();}
  tabCommand(action,id=this.activeId){if(action==='sort-title')return this.sortTabs('title');if(action==='sort-domain')return this.sortTabs('domain');if(action==='sort-accessed')return this.sortTabs('accessed');if(action==='close-left')return this.closeSide(id,'left');if(action==='close-right')return this.closeSide(id,'right');if(action==='close-others')return this.closeSide(id,'others');}
  cycle(direction){let i=this.tabs.findIndex(t=>t.id===this.activeId);this.activate(this.tabs[(i+direction+this.tabs.length)%this.tabs.length].id);}
  action(action){const w=this.current();if(action==='new-tab')return this.newTab();if(action==='close-tab')return this.closeTab(this.activeId);if(action==='next-tab')return this.cycle(1);if(action==='previous-tab')return this.cycle(-1);if(!w)return;if(action==='back'&&w.navigationHistory.canGoBack())w.navigationHistory.goBack();if(action==='forward'&&w.navigationHistory.canGoForward())w.navigationHistory.goForward();if(action==='ppixiv-bar')return this.togglePpixivBar(w);if(action==='ppixiv-reload'){if(!ppixivPlugin.matches(w.getURL()))throw new Error('Open Pixiv first.');const u=new URL(w.getURL());u.hash='ppixiv';return this.load(w,u.href);}if(action==='ppixiv-original'){if(!ppixivPlugin.matches(w.getURL()))throw new Error('Open Pixiv first.');const u=new URL(w.getURL());u.hash='no-ppixiv';return this.load(w,u.href);}if(action==='reload'){if(this.session.isEdge)this.load(w,w.getURL());else w.reload();}if(action==='stop')w.stop();if(action==='external'&&core.validUrl(w.getURL(),false))return shell.openExternal(this.session.isEdge&&!this.session.isCef?'microsoft-edge:'+w.getURL():w.getURL());}
  async togglePpixivBar(w){if(!w||!this.prefs.ppixivPlugin||!ppixivPlugin.matches(w.getURL())||w.getURL().includes('#no-ppixiv'))throw new Error('Open ppixiv first.');const hidden=!this.prefs.ppixivBarHidden;if(!await this.ppixiv.setToolbar(w,hidden))throw new Error('Wait for ppixiv to finish loading.');this.prefs.ppixivBarHidden=hidden;this.commit();return {hidden};}
  async configure(patch){const before=JSON.stringify(this.prefs.adblock);this.prefs=preferences({...this.prefs,...patch,adblock:{...this.prefs.adblock,...patch.adblock},translation:{...this.prefs.translation,...patch.translation},scrolling:{...this.prefs.scrolling,...patch.scrolling},galleryCollection:{...this.prefs.galleryCollection,...patch.galleryCollection}});if(this.initialized&&(before!==JSON.stringify(this.prefs.adblock)||patch.compatibilitySites))this.adblock.configure(this.prefs.adblock,this.prefs.compatibilitySites);if(this.initialized&&patch.scrolling)for(const [id,j] of this.scroller.jobs){j.prefs=scrollPlugin.settings(this.prefs.scrolling);const view=[...this.views.values()].find(v=>v.webContents.id===id);if(view&&!view.webContents.isDestroyed())await view.webContents.executeJavaScript('('+require('./browser-plugins/infinite-dom.cjs').setColumns.toString()+')('+JSON.stringify(j.token)+','+j.prefs.columns+')').catch(()=>{});}if(this.initialized&&(patch.translation||patch.translatorPlugin===false))for(const v of this.views.values())this.translator.restore(v.webContents);if(patch.ppixivPlugin!==undefined)await Promise.all([...this.views.values()].filter(v=>ppixivPlugin.matches(v.webContents.getURL())||this.ppixiv.targets.has(v.webContents.id)).map(v=>this.ppixiv.configure(v.webContents,this.prefs.ppixivPlugin)));if(patch.ppixivPlugin!==undefined)for(const v of this.views.values())if(ppixivPlugin.matches(v.webContents.getURL()))v.webContents.reload();this.commit();return this.snapshot();}
  tools(){this.ensureRuntime();return {...this.snapshot(),savedSessions:this.savedSessions,savedTags:this.savedTags,tagSite:tagLibrary.siteId(this.current()?.getURL()||this.active()?.url),history:this.history,plugins:[{...ppixivPlugin.manifest,enabled:this.prefs.ppixivPlugin},{...translatorPlugin.manifest,enabled:this.prefs.translatorPlugin},{...tabPlugin.manifest,enabled:this.prefs.sessionPlugin},{...scrollPlugin.manifest,enabled:true}]};}
  async compatibility(enabled){
    this.ensureRuntime();const w=this.current(),url=w?.getURL()||this.active().url,host=connection.hostOf(url);
    if(!host)throw new Error('Open an HTTP or HTTPS site first.');
    this.prefs.compatibilitySites=this.prefs.compatibilitySites.filter(h=>h!==host);
    if(enabled)this.prefs.compatibilitySites.push(host);
    this.adblock.configure(this.prefs.adblock,this.prefs.compatibilitySites);
    for(const view of this.views.values())if(connection.hostOf(view.webContents.getURL())===host){
      this.collector.cancel(view.webContents);this.scroller.stop(view.webContents);
      await this.translator.restore(view.webContents);
      if(!view.webContents.isDestroyed())view.webContents.reload();
    }
    this.commit();return {host,enabled:!!enabled};
  }
  async resetVerification(){
    const url=this.current()?.getURL()||this.active().url,host=connection.hostOf(url);
    if(!host)throw new Error('Open the site first.');
    const rows=(await this.session.cookies.get({url})).filter(c=>connection.verificationCookie(c.name));
    for(const c of rows)await this.session.cookies.remove(`${c.secure?'https':'http'}://${c.domain.replace(/^\./,'')}${c.path}`,c.name);
    await this.session.cookies.flushStore();this.challengeCounts.delete(this.activeId);
    this.current()?.reload();return {host,removed:rows.length};
  }
  sessions(action,payload={}){if(!this.prefs.sessionPlugin)throw new Error('Enable FileFapper Tab Sessions in Browser tools first.');this.ensureRuntime();if(action==='save'){this.savedSessions.unshift(tabPlugin.snapshot(payload.name,this.tabs));this.savedSessions=this.savedSessions.slice(0,50);}if(action==='delete')this.savedSessions=this.savedSessions.filter(s=>s.id!==payload.id);if(action==='rename'){const s=this.savedSessions.find(s=>s.id===payload.id);if(s)s.name=String(payload.name||s.name).slice(0,80);}if(action==='import')this.savedSessions=[...tabPlugin.saved(payload.sessions),...this.savedSessions].slice(0,50);if(action==='restore'){const s=this.savedSessions.find(s=>s.id===payload.id);if(!s)throw new Error('That tab session no longer exists.');const rows=tabPlugin.tabs(s.tabs);if(payload.replace){this.detach();for(const v of this.views.values()){this.collector.cancel(v.webContents);this.translator.stop(v.webContents,{restore:false});this.scroller.stop(v.webContents);v.webContents.close();}this.views.clear();this.tabs=rows;}else{if(this.tabs.length+rows.length>tabPlugin.MAX_TABS)throw new Error('This would exceed 100 open tabs. Choose Replace open tabs.');this.tabs.push(...rows);}if(rows.length)this.activate(rows[0].id);}this.commit();return this.savedSessions;}
  async tags(action,payload={}){
    const w=this.current(),site=tagLibrary.siteId(w?.getURL()||this.active()?.url);
    if(action==='read'){
      if(!site||!w)throw new Error('Open Kurosearch or R34 React first.');
      const result=await w.executeJavaScript(`(${tagLibrary.pageTags.toString()})(${JSON.stringify(site)},'read')`);
      if(!result.found&&!result.records?.length)throw new Error('The tag search box is not visible. Open the site’s search page first.');
      return {site,tags:tagLibrary.tags(result.tags)};
    }
    if(action==='save'){
      if(!tagLibrary.sites[payload.site]||!tagLibrary.tags(payload.tags))throw new Error('Choose a supported site and enter tags to save.');
      const id=this.savedTags.some(r=>r.id===payload.id)?payload.id:crypto.randomUUID();
      if(this.savedTags.length>=200&&!this.savedTags.some(r=>r.id===id||r.site===payload.site&&r.tags===tagLibrary.tags(payload.tags)))throw new Error('The 200 saved-search limit is reached. Remove an unused entry first.');
      const rows=tagLibrary.saved([{...payload,id},...this.savedTags.filter(r=>r.id!==id)]);
      this.savedTags=rows;this.commit();return rows;
    }
    if(action==='delete'){this.savedTags=this.savedTags.filter(r=>r.id!==payload.id);this.commit();return this.savedTags;}
    if(action==='apply'){
      const row=this.savedTags.find(r=>r.id===payload.id);if(!row)throw new Error('This saved search no longer exists.');
      if(site!==row.site||!w)throw new Error('Open '+tagLibrary.sites[row.site].name+' in the current tab first, then apply these tags.');
      const records=tagLibrary.parse(row.tags);
      if(site==='kurosearch'){
        const current=await w.executeJavaScript(`(${tagLibrary.pageTags.toString()})('kurosearch','read')`);
        this.navigate(tagLibrary.kuroUrl(records,current));
        const deadline=Date.now()+18000;
        while(Date.now()<deadline){
          if(w.isDestroyed()||this.current()!==w||tagLibrary.siteId(w.getURL())!=='kurosearch')throw new Error('The browser changed while restoring this search.');
          try{const state=await w.executeJavaScript(`(${tagLibrary.pageTags.toString()})('kurosearch','read')`);if(state.records.length===records.length&&records.every(t=>state.records.some(a=>a.name===t.name&&a.modifier===t.modifier)))return {verified:true,count:records.length,message:records.length+' tags restored in Kurosearch. The site is loading the search.'};}catch{}
          await new Promise(r=>setTimeout(r,150));
        }
        return {verified:false,message:'The saved Kurosearch search is open; the site is still restoring its tag chips. Check its selection before retrying.'};
      }
      const result=await w.executeJavaScript(`(${tagLibrary.pageTags.toString()})('r34react','apply',${JSON.stringify(records)})`);
      return {...result,message:result.count+' selected tags applied to R34 React.'+(result.searched?' Search started.':' Choose Search on the site when ready.')};
    }
    throw new Error('Unknown saved tag action.');
  }
  async translate(action,key){if(!this.prefs.translatorPlugin)throw new Error('Enable FileFapper Page Translator in Browser tools first.');this.ensureRuntime();const w=this.current();if(!w)throw new Error('Open a web page first.');if(action==='restore'){await this.translator.restore(w);return {restored:true};}if(this.prefs.translation.provider==='google-proxy'){this.newTab(translatorPlugin.googleUrl(w.getURL(),this.prefs.translation.target));return {opened:true};}if(this.cleanSite(w))throw new Error('Site compatibility pauses page translation. Turn it off to translate this host.');return this.translator.translate(w,this.prefs.translation,key);}
  ownsScrolling(w){return !!w&&this.prefs.ppixivPlugin&&ppixivPlugin.matches(w.getURL())&&!w.getURL().includes('#no-ppixiv');}
  async scroll(action){if(this.cleanSite()&&action!=='status')throw new Error('Site compatibility pauses scrolling helpers. Turn it off to load more pages automatically.');if(this.ownsScrolling(this.current())&&action!=='auto')return {enabled:true,message:'ppixiv handles infinite scrolling in this tab. Scroll its results normally.'};this.ensureRuntime();const w=this.current();if(!w||!core.validUrl(w.getURL(),false))throw new Error('Open a web page first.');if(action==='toggle'||action==='force'){const enabled=action==='force'||!this.scroller.status(w).enabled;if(action==='force')this.prefs.scrolling.force=true;this.active().scrollEnabled=enabled;const result=await this.scroller.enable(w,enabled,this.prefs.scrolling);this.commit();return result;}if(action==='auto')return this.scroller.auto(w,this.prefs.scrolling);if(action==='next')return this.scroller.next(w,this.prefs.scrolling);return this.scroller.status(w);}
  async galleries(action,payload={}){
    this.ensureRuntime();
    const w=this.current();if(action==='results')return this.collector.results();if(action==='cancel'){this.collector.cancel();return this.collector.results();}
    if(action==='continue'){const url=this.collector.status().next;if(!url||!galleryLists.listingKind(url))throw new Error('No more result pages are available.');this.navigate(url);return url;}
    if(!w)throw new Error('Open a results page first.');const pageState=this.pageStates.get(this.activeId);if(['http','network','access'].includes(pageState?.kind))throw new Error(pageState.message);if(action==='refresh'){this.collector.cancel();this.collector.job=null;}
    const seed=galleryLists.listingKind(w.getURL())==='api'?undefined:await this.scroller.collectionSeed(w);
    if(action==='start'){this.prefs.galleryCollection=galleryLists.collectionSettings(payload);this.commit();return this.collector.start(w,this.prefs.galleryCollection,seed);}
    return this.collector.prepare(w,seed);
  }
  async browsingData(action,options={}){if(action==='size'){let timer;try{return await Promise.race([this.session.getCacheSize().then(cacheBytes=>({cacheBytes,history:this.history.length})),new Promise(resolve=>{timer=setTimeout(()=>resolve({cacheBytes:null,history:this.history.length}),2500);})]);}catch{return {cacheBytes:null,history:this.history.length};}finally{clearTimeout(timer);}}if(action==='delete-history'){this.history=this.history.filter(h=>h.url!==options.url);this.commit();return;}if(action==='clear'){if(options.history)this.history=[];if(options.cache)await this.session.clearCache();if(options.storage)await this.session.clearStorageData({storages:['filesystem','indexdb','localstorage','serviceworkers','cachestorage','shadercache']});if(options.cookies)await this.session.clearStorageData({storages:['cookies']});this.commit();return true;}}
  async refreshAccess(){
    const w=this.current(),tab=this.active(),url=w?.getURL();
    if(!w||w.isLoading()||!core.validUrl(url,false))return this.snapshot().page;
    const health=await w.executeJavaScript(`(${pageHealth.toString()})(document,location.href)`);
    if(w.isDestroyed()||w.getURL()!==url)throw new Error('The site navigated while checking access. Wait for it to finish, then try again.');
    const previous=this.pageStates.get(tab.id);
    // Only actual readable chapter/results content can release an earlier
    // 401/403 after AJAX recovery. A blank page must not erase an HTTP error.
    const recovered=health.kind==='ok'&&health.readable===true&&[401,403].includes(Number(previous?.httpStatus));
    const next=health.kind==='ok'&&previous?.kind==='http'&&!recovered?previous:health;
    this.pageStates.set(tab.id,next);this.emit();return next;
  }
  async capture(id){
    const w=this.current(),url=w?.getURL(),site=core.siteFor(url);
    if(!site?.browserCapture)throw new Error('Rendered-page capture is available for the supported reader and Rule34 frontend profiles.');
    const selector=site.readerSelector;
    const result=await w.executeJavaScript(`(async()=>{const selector=${JSON.stringify(selector)};const start=scrollY;let last=0,stable=0;for(let i=0;i<60;i++){const h=document.documentElement.scrollHeight;scrollTo(0,Math.min(h,scrollY+innerHeight*.9));await new Promise(r=>setTimeout(r,130));if(scrollY===last)stable++;else stable=0;last=scrollY;if(stable>=3)break;}await new Promise(r=>setTimeout(r,350));const pages=[];let bytes=0;for(const n of document.querySelectorAll(selector)){if(pages.length>=2000)break;if(n.tagName==='CANVAS'){if(n.width<180||n.height<180)continue;try{const data=n.toDataURL('image/png');bytes+=data.length;if(bytes>130000000)break;pages.push({data});}catch{}}else{const u=n.getAttribute('data-full-url')||n.getAttribute('data-original')||n.getAttribute('data-lazy-src')||n.getAttribute('data-src')||n.currentSrc||n.src||n.href;if(u&&/^https?:/.test(u)&&(n.naturalWidth>=180||n.getAttribute('data-page')||['VIDEO','AUDIO','SOURCE','A'].includes(n.tagName)))pages.push({url:u});}}scrollTo(0,start);return {title:document.title,images:pages}})()`);
    if(w.getURL()!==url)throw new Error('The reader navigated during capture. Try again.');
    const images=[],seen=new Set(),dir=path.join(this.dataDir,'browser-captures',id);let size=0;
    for(const item of result.images||[]){if(core.validUrl(item.url,false)){if(!seen.has(item.url)){images.push({url:item.url});seen.add(item.url);}}else if(typeof item.data==='string'&&item.data.startsWith('data:image/png;base64,')){const buffer=Buffer.from(item.data.slice(22),'base64');size+=buffer.length;if(size>100000000)throw new Error('The rendered gallery exceeds the 100 MB capture limit. Use a smaller chapter.');if(buffer.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')continue;fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,images.length+'.png');fs.writeFileSync(file,buffer);images.push({localPath:file,extension:'png'});}}
    if(!images.length)throw new Error('No readable pages were found. Open a chapter, choose its long-strip reader if available, and wait for images to load.');
    return {url,title:String(result.title||site.name).slice(0,500),images,createdAt:new Date().toISOString()};
  }
  close(){this.collector?.close();this.translator?.close();this.scroller?.close();this.detach();for(const v of this.views.values())if(!v.webContents.isDestroyed())v.webContents.close();this.views.clear();this.adblock?.close();}
}
module.exports={BrowserWorkspace,preferences};
