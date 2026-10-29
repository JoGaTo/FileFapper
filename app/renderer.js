'use strict';
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Preserve button, input and row nodes while progress changes. Replacing whole
// lists every tick can swallow clicks and interrupt drag/keyboard interaction.
function patchHtml(target,html){
  const template=document.createElement('template');template.innerHTML=html;
  const key=node=>node.nodeType===1?(node.getAttribute('data-task-row')||node.id||''):'';
  function sync(old,fresh){
    if(old.nodeType!==fresh.nodeType||(old.nodeType===1&&old.tagName!==fresh.tagName)){old.replaceWith(fresh.cloneNode(true));return;}
    if(old.nodeType!==1){if(old.textContent!==fresh.textContent)old.textContent=fresh.textContent;return;}
    for(const attr of [...old.attributes])if(!fresh.hasAttribute(attr.name))old.removeAttribute(attr.name);
    for(const attr of [...fresh.attributes])if(old.getAttribute(attr.name)!==attr.value)old.setAttribute(attr.name,attr.value);
    if(old.tagName==='INPUT'&&old.type==='checkbox')old.checked=fresh.checked;
    children(old,fresh);
  }
  function children(old,fresh){
    const wanted=[...fresh.childNodes];
    for(let i=0;i<wanted.length;i++){
      const next=wanted[i],id=key(next);let existing=id?[...old.childNodes].find(n=>key(n)===id):old.childNodes[i];
      if(!existing){old.insertBefore(next.cloneNode(true),old.childNodes[i]||null);continue;}
      if(existing!==old.childNodes[i])old.insertBefore(existing,old.childNodes[i]||null);
      sync(existing,next);
    }
    while(old.childNodes.length>wanted.length)old.lastChild.remove();
  }
  children(target,template.content);
}
const paths={
 layers:'<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
 search:'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18Z"/>',
 puzzle:'<path d="M9 3H4v5c5-2 5 6 0 4v8h7c-2-5 6-5 4 0h5v-7c-5 2-5-6 0-4V4h-7c2-5-6-5-4-1Z"/>',
 key:'<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-3-3 3-3m-6 0 3-3"/>',
 sliders:'<path d="M4 7h5m5 0h6M4 17h10m5 0h1"/><circle cx="11.5" cy="7" r="2.5"/><circle cx="16.5" cy="17" r="2.5"/>',
 harddrive:'<path d="m5 4-3 11v4a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-4L19 4H5Z"/><path d="M2 15h20m-5 2.5h.01m2.5 0h.01"/>',
 folder:'<path d="M3 7V5h6l2 2h10v13H3V7Z"/><path d="M3 10h18"/>',
 folderplus:'<path d="M3 7V5h6l2 2h10v13H3V7Z"/><path d="M3 10h18m-9 3v5m-2.5-2.5h5"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 1.5-2.5 4m0 3h.01"/>',
 upload:'<path d="M4 15v5h16v-5M12 16V3m-5 5 5-5 5 5"/>',
 save:'<path d="M20 21H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h13l4 4v13a1 1 0 0 1-1 1Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>',
 link:'<path d="m9 15 6-6m-8 4-2 2a4.2 4.2 0 0 0 6 6l4-4a4.2 4.2 0 0 0 0-6m2 0 2-2a4.2 4.2 0 0 0-6-6L9 7a4.2 4.2 0 0 0 0 6"/>',
 image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 16-5-5L5 21"/>',
 zap:'<path d="m13 2-9 12h7l-1 8 10-13h-8l1-7Z"/>',
 plus:'<path d="M12 4v16M4 12h16"/>',
 play:'<path d="m8 5 11 7-11 7V5Z"/>',
 pause:'<path d="M8 5v14M16 5v14"/>',
 stop:'<rect x="6" y="6" width="12" height="12" rx="1"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 list:'<path d="M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 arrowleft:'<path d="m11 5-7 7 7 7M4 12h16"/>',
 arrowright:'<path d="m13 5 7 7-7 7M20 12H4"/>',
 arrowup:'<path d="m5 11 7-7 7 7M12 4v16"/>',
 arrowdown:'<path d="m5 13 7 7 7-7M12 20V4"/>',
 refresh:'<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',
 external:'<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
 code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
 activity:'<path d="M2 12h5l3-8 4 16 3-8h5"/>',
 x:'<path d="m6 6 12 12M6 18 18 6"/>',
 more:'<circle cx="5" cy="12" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="19" cy="12" r=".8"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
 copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
 book:'<path d="M4 3h14a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V3Zm0 14h16M8 3v8l3-2 3 2V3"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 download:'<path d="M4 16v5h16v-5M12 3v13m-5-5 5 5 5-5"/>'
};
const icon=n=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[n]||paths.info}</svg>`;
function hydrate(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{const i=el.dataset.icon;if(el.querySelector('svg'))return;el.insertAdjacentHTML('afterbegin',icon(i));});}
let state,sites=[],page='queue',filterStatus='all',selectedId=null,checked=new Set(),searchResults=[],resultChecked=new Set(),searchBusy=false,searchNotice='',browser={url:''},browserOpened=false,previewId=null,previewIndex=0,previewStamp='',modalType='',prefsStamp='',dragId=null;
const names={queue:'Download queue',search:'Discover & search',browser:'Browser',sites:'Sites & scripts',cookies:'Cookies & accounts',preferences:'Preferences'};
const labels={queued:'Queued',resolving:'Resolving',downloading:'Downloading',paused:'Paused',stopped:'Stopped',complete:'Completed',error:'Failed',waiting:'Cooldown'};
function bytes(n){n=Number(n)||0;if(n<1024)return `${Math.round(n)} B`;const units=['KB','MB','GB','TB'];let i=-1;do{n/=1024;i++;}while(n>=1024&&i<3);return `${n>=100?n.toFixed(0):n.toFixed(1)} ${units[i]}`;}
function pct(t){return t.total?Math.min(100,Math.round(t.done/t.total*100)):0;}
function activeTask(t){return ['resolving','downloading'].includes(t.status);}
function current(){return state.tasks.find(t=>t.id===selectedId);}
function selectTask(id){selectedId=id;$$('[data-task-row]').forEach(el=>el.classList.toggle('selected',el.dataset.taskRow===id));renderInspector();}
let selectionAnchor=null,selectionMode=false;
function mouseSelect(id,event){
 const rows=visibleTasks(),ids=rows.map(t=>t.id);
 if(event.shiftKey&&selectionAnchor&&ids.includes(selectionAnchor)){
   if(!event.ctrlKey&&!event.metaKey)checked.clear();const a=ids.indexOf(selectionAnchor),b=ids.indexOf(id);
   for(const key of ids.slice(Math.min(a,b),Math.max(a,b)+1))checked.add(key);
 }else if(event.ctrlKey||event.metaKey||selectionMode){if(checked.has(id))checked.delete(id);else checked.add(id);selectionAnchor=id;}
 else{checked.clear();checked.add(id);selectionAnchor=id;}
 selectedId=id;renderQueue();
}
function toast(message){if(!message)return;const el=document.createElement('div');el.className='toast';el.textContent=message;$('#toast-stack').appendChild(el);setTimeout(()=>el.remove(),6000);}
async function call(name,...args){try{return await window.df.invoke(name,...args);}catch(e){toast(e.message);throw e;}}
function fire(name,...args){return call(name,...args).catch(()=>{});}
function setPage(next){if(!names[next])return;page=next;$$('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+next));$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===next));$('#breadcrumb-current').textContent=names[next];$('#main').scrollTop=0;if(page==='browser')updateBrowserBounds();else hideBrowserBounds();render();}
function imageUrl(t,index){return `dfmedia://${t.id}/${index}`;}
function fileKind(f){return f?.mediaKind||(/\.(mp4|webm|mov|mkv|m4v|avi)$/i.test(f?.name||'')?'video':/\.(mp3|wav|ogg|opus|m4a|flac|aac)$/i.test(f?.name||'')?'audio':/\.(zip|rar|7z|cbz|cbr|gz|tar)$/i.test(f?.name||'')?'archive':'image');}
function coverFile(t){return t.files?.find(f=>fileKind(f)==='image'||f.previewPath);}
function thumb(t,cls='thumb'){const f=t.files?.find(f=>fileKind(f)==='image'||f.previewPath);return `<div class="${cls} ${f&&!state.prefs.hideThumbnails?'':'placeholder'}">${f&&!state.prefs.hideThumbnails?`<img src="${imageUrl(t,f.index)}${f.previewPath?'?preview=1':''}" alt="Gallery cover" loading="lazy">`:icon('book')}</div>`;}
function progress(t){return `<div class="status-cell ${esc(t.status)}"><span class="status-label ${esc(t.status)}"><i></i>${labels[t.status]||t.status}</span><div class="progress-track"><div class="progress-fill" style="width:${pct(t)}%"></div></div><div class="progress-text">${t.total?`${t.done} / ${t.total} files`:'Waiting for gallery'}${t.total?` · ${pct(t)}%`:''}</div>${t.transferNote&&['resolving','downloading'].includes(t.status)?`<div class="progress-text" role="status">${esc(t.transferNote)}</div>`:''}</div>`;}
function taskControls(t){return `<div class="task-row-actions"><button class="icon-button" data-task="${esc(t.id)}" data-task-action="${activeTask(t)||t.status==='queued'?'pause':'play'}" title="${activeTask(t)||t.status==='queued'?'Pause':'Resume'} task" aria-label="${activeTask(t)||t.status==='queued'?'Pause':'Resume'} task" ${t.status==='complete'?'disabled':''}>${icon(activeTask(t)||t.status==='queued'?'pause':'play')}</button><button class="icon-button" data-task-menu="${esc(t.id)}" title="Task actions" aria-label="Task actions">${icon('more')}</button></div>`;}
function visibleTasks(){const q=$('#task-filter').value.toLowerCase().trim(),site=$('#task-site').value;return state.tasks.filter(t=>{
  if(site!=='all'&&t.siteId!==site)return false;
  if(q&&!`${t.title} ${t.url} ${t.site} ${JSON.stringify(t.metadata||{})}`.toLowerCase().includes(q))return false;
  if(filterStatus==='all')return true;if(filterStatus==='active')return activeTask(t);if(filterStatus==='paused')return ['paused','stopped','waiting'].includes(t.status);return t.status===filterStatus;
});}
function positionSelectionBar(){if(page!=='queue'||!checked.size)return;const bar=$('#selection-bar'),rect=$('#task-list').getBoundingClientRect();bar.style.maxWidth=Math.max(300,rect.width)+'px';bar.style.left=Math.max(12,Math.min(innerWidth-bar.offsetWidth-12,rect.left+(rect.width-bar.offsetWidth)/2))+'px';}
function renderQueue(){
  const ts=state.tasks,run=ts.filter(activeTask),queued=ts.filter(t=>t.status==='queued'),complete=ts.filter(t=>t.status==='complete');
  $('#stats').innerHTML=`<span class="stat-inline">${icon('download')}<strong>${run.length}</strong> active</span><span class="stat-inline">${icon('clock')}<strong>${queued.length}</strong> queued</span><span class="stat-inline">${icon('check')}<strong>${complete.length}</strong> completed</span><span class="summary-speed">${bytes(run.reduce((n,t)=>n+t.speed,0))}/s · ${bytes(complete.reduce((n,t)=>n+t.bytes,0))} collected</span>`;
  const counts={all:ts.length,active:run.length,queued:queued.length,paused:ts.filter(t=>['paused','stopped','waiting'].includes(t.status)).length,complete:complete.length,error:ts.filter(t=>t.status==='error').length};
  $('#status-tabs').innerHTML=Object.entries({all:'All tasks',active:'Active',queued:'Queued',paused:'Paused',complete:'Completed',error:'Failed'}).map(([id,label])=>`<button class="tab ${filterStatus===id?'active':''}" data-status="${id}">${label}<small>${counts[id]}</small></button>`).join('');
  const taskSites=[...new Map(ts.map(t=>[t.siteId,t.site])).entries()];const old=$('#task-site').value;
  $('#task-site').innerHTML='<option value="all">All sites</option>'+taskSites.map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');$('#task-site').value=taskSites.some(x=>x[0]===old)?old:'all';
  const visible=visibleTasks(),icons=state.prefs.view==='icons';
  $('#task-list').classList.toggle('icons',icons&&visible.length>0);
  $('#view-list').classList.toggle('active',!icons);$('#view-icons').classList.toggle('active',icons);
  if(!visible.length){patchHtml($('#task-list'),`<div class="empty-state"><div class="empty-art">${icon(ts.length?'search':'folderplus')}</div><h3>${ts.length?'Nothing matches these filters.':'A new collection starts here.'}</h3><p>${ts.length?'Try a different title, site, or task status.':'Paste a gallery link above and we’ll take care of the pages. Your queue is ready when you are.'}</p><button class="text-button" data-action="${ts.length?'reset-filters':'sample'}">${ts.length?'Reset filters':'Try it with a local sample gallery'} <span>↗</span></button></div>`);}
  else if(icons){patchHtml($('#task-list'),visible.map(t=>`<article class="gallery-card ${t.id===selectedId?'selected':''} ${checked.has(t.id)?'checked-task':''}" aria-selected="${checked.has(t.id)}" data-task-row="${esc(t.id)}" draggable="true"><div class="card-cover">${coverFile(t)&&!state.prefs.hideThumbnails?`<img src="${imageUrl(t,coverFile(t).index)}${coverFile(t).previewPath?'?preview=1':''}" alt="Gallery cover" loading="lazy">`:icon('book')}<input type="checkbox" data-check="${t.id}" ${checked.has(t.id)?'checked':''} aria-label="Select ${esc(t.title)}"><button class="icon-button" data-task-menu="${t.id}" aria-label="Task actions">${icon('more')}</button></div><div class="task-title" title="${esc(t.title)}">${esc(t.title)}</div><div class="task-subtitle">${esc(t.site)} · ${t.quality==='original'?'Original':'Resampled'}${t.upscale>1?' · '+t.upscale+'×':''}</div>${progress(t)}<div class="card-bottom"><span>${bytes(t.bytes)}</span>${taskControls(t)}</div></article>`).join(''));}
  else{patchHtml($('#task-list'),`<div class="task-head"><span>GALLERY</span><span>STATUS</span><span>TRANSFER</span><span></span></div>`+visible.map(t=>`<article class="task-row ${t.id===selectedId?'selected':''} ${checked.has(t.id)?'checked-task':''}" aria-selected="${checked.has(t.id)}" data-task-row="${esc(t.id)}" draggable="true"><div class="task-check"><input type="checkbox" data-check="${t.id}" ${checked.has(t.id)?'checked':''} aria-label="Select ${esc(t.title)}"></div><div class="task-info">${thumb(t)}<div class="task-text"><div class="task-title" title="${esc(t.title)}">${esc(t.title)}</div><div class="task-subtitle"><span class="site-initial">${esc(t.site[0])}</span>${esc(t.site)}<span>·</span>${t.quality==='original'?'Original':'Resampled'}</div></div></div>${progress(t)}<div class="speed-cell">${t.speed?bytes(t.speed)+'/s':'—'}<small>${bytes(t.bytes)}</small></div>${taskControls(t)}</article>`).join(''));}
  $('#queue-count').textContent=`${visible.length} ${visible.length===1?'gallery':'galleries'}${ts.length!==visible.length?' of '+ts.length:''} in your queue`;
  for(const id of checked)if(!ts.some(t=>t.id===id))checked.delete(id);
  $('#selection-bar').classList.toggle('hidden',!checked.size);$('#selection-bar').innerHTML=`<span>${checked.size} selected</span><button data-bulk="play">Resume</button><button data-bulk="pause">Pause</button><button data-bulk="stop">Stop</button><button data-bulk="remove">Remove</button><button data-action="deselect">${icon('x')}</button>`;
  positionSelectionBar();
  renderInspector();
}
function renderInspector(){
  const t=current();
  if(!t){patchHtml($('#inspector'),`<div class="inspector-top">A closer look <span>${icon('info')}</span></div><div class="inspector-content"><div class="detail-art">${icon('book')}</div><h3>Every gallery has a story.</h3><p>Select a task to see its preview, download settings, and gallery details.</p><div class="detail-section"><h4>YOUR DOWNLOAD DEFAULTS</h4><div class="detail-pair"><span>Quality</span><span>${state.prefs.quality==='original'?'Original files':'Resampled files'}</span></div><div class="detail-pair"><span>Image workers</span><span>${state.prefs.workers} per gallery</span></div><div class="detail-pair"><span>Active galleries</span><span>Up to ${state.prefs.concurrentTasks}</span></div><div class="detail-pair"><span>Speed cap</span><span>${state.prefs.speedLimit?bytes(state.prefs.speedLimit*1024)+'/s':'No local cap'}</span></div></div><div class="detail-tip"><strong>A little shortcut</strong>Right-click any task for previews, folder actions, metadata, and more.</div><div class="detail-section"><h4>BUILT TO KEEP UP</h4><div class="detail-pair"><span>Built-in sites</span><span>${sites.length}</span></div><div class="detail-pair"><span>Custom scripts</span><span>${state.plugins.filter(p=>p.enabled!==false).length} enabled</span></div><button class="text-button" data-page="sites">Explore sites & scripts ↗</button></div></div>`);return;}
  const busy=activeTask(t),has=t.files?.length;
  const tags=t.metadata?.tags;const list=Array.isArray(tags)?tags:[];
  patchHtml($('#inspector'),`<div class="inspector-top">Task details <button class="icon-button" data-action="deselect-task" aria-label="Close task details">${icon('x')}</button></div><div class="inspector-content"><div class="detail-art" data-task="${t.id}" data-task-action="preview">${coverFile(t)&&!state.prefs.hideThumbnails?`<img src="${imageUrl(t,coverFile(t).index)}${coverFile(t).previewPath?'?preview=1':''}" alt="Gallery preview">`:icon('book')}<span class="preview-label">${has?'Open preview':'Fetch first-page preview'}</span></div><h3>${esc(t.title)}</h3><p>${esc(t.site)} · ${t.total||'—'} files</p><div class="detail-progress"><div class="status-label ${t.status}"><i></i>${labels[t.status]}</div><div class="progress-track"><div class="progress-fill" style="width:${pct(t)}%"></div></div><div class="progress-text"><span>${t.done} / ${t.total||'—'} files</span><span>${pct(t)}%</span></div></div>${t.error?`<div class="detail-error">${esc(t.error)}${t.errorKind==='access'?`<div class="tool-actions"><button class="button" data-task="${t.id}" data-task-action="open-browser">Open site to sign in / check access</button></div>`:''}${t.retryAt>Date.now()?`<br>Resume after ${new Date(t.retryAt).toLocaleTimeString()}.`:''}</div>`:''}<div class="detail-actions"><button class="button primary" data-task="${t.id}" data-task-action="${busy||t.status==='queued'?'pause':'play'}" ${t.status==='complete'?'disabled':''}>${icon(busy||t.status==='queued'?'pause':'play')}${busy||t.status==='queued'?'Pause':'Resume'}</button><button class="button" data-task="${t.id}" data-task-action="stop" title="Stop task">${icon('stop')}</button><button class="button" data-task-menu="${t.id}" title="More actions">${icon('more')}</button></div><div class="detail-section"><h4>DOWNLOAD OPTIONS</h4><div class="detail-pair"><span>Quality</span><select class="detail-select" data-task-option="quality" data-id="${t.id}" ${busy?'disabled':''}><option value="resampled" ${t.quality==='resampled'?'selected':''}>Resampled</option><option value="original" ${t.quality==='original'?'selected':''}>Original · E/Ex</option></select></div><div class="detail-pair"><span>Workers</span><select class="detail-select" data-task-option="workers" data-id="${t.id}" ${busy?'disabled':''}>${Array.from({length:50},(_,i)=>i+1).map(n=>`<option ${t.workers===n?'selected':''}>${n}</option>`).join('')}</select></div>${t.siteId==='kemono'?`<div class="detail-pair"><span>Image size</span><select class="detail-select" data-task-option="upscale" data-id="${t.id}" ${busy?'disabled':''}>${[1,1.5,2].map(n=>`<option value="${n}" ${(t.upscale||1)===n?'selected':''}>${n===1?'Original size':n+'×'}</option>`).join('')}</select></div><div class="detail-pair"><span>Enlarge with</span><select class="detail-select" data-task-option="upscaleMethod" data-id="${t.id}" ${busy?'disabled':''}><option value="waifu2x" ${t.upscaleMethod!=='lanczos'?'selected':''}>waifu2x CUnet</option><option value="lanczos" ${t.upscaleMethod==='lanczos'?'selected':''}>Lanczos resize</option></select></div>`:''}<div class="detail-pair"><span>Downloaded</span><span>${bytes(t.bytes)}</span></div></div><div class="detail-section"><h4>GALLERY FOLDER</h4><p class="detail-folder">${esc(t.folder||'Created when downloading begins.')}</p><div class="detail-actions"><button class="button" data-task="${t.id}" data-task-action="open-folder" ${!t.folder?'disabled':''}>${icon('folder')}Open folder</button><button class="button" data-metadata="${t.id}">${icon('info')}Info</button></div></div>${list.length?`<div class="detail-section"><h4>TAGS</h4>${list.slice(0,14).map(tag=>`<span class="tag">${esc(tag)}</span>`).join('')}</div>`:''}<div class="detail-section"><button class="text-button" data-task="${t.id}" data-task-action="open-browser">View gallery in Browser ↗</button></div></div>`);
}
function renderCommon(){document.body.dataset.page=page;document.body.classList.toggle('compact-sidebar',state.prefs.compactSidebar);document.body.classList.toggle('queue-details',state.prefs.queueDetails);document.body.classList.toggle('browser-focus',state.prefs.browserFocus);$$('[data-page]').filter(b=>b.classList.contains('nav-item')).forEach(b=>{b.title=names[b.dataset.page];});$('#site-nav-count').textContent=sites.length;$('#site-count').textContent=sites.length;const detailsButton=$('[data-action=queue-details]');detailsButton.classList.toggle('primary',state.prefs.queueDetails);$('[data-action=browser-focus]').textContent=state.prefs.browserFocus?'Restore layout':'Expand';if(document.activeElement!==$('#add-quality'))$('#add-quality').value=state.prefs.quality;if(document.activeElement!==$('#add-workers'))$('#add-workers').value=state.prefs.workers;if(document.activeElement!==$('#add-delay'))$('#add-delay').value=state.prefs.delay;const run=state.tasks.filter(activeTask),speed=run.reduce((n,t)=>n+(t.speed||0),0);$('#nav-count').textContent=state.tasks.length;$('#footer-status').textContent=run.length?`${run.length} ${run.length===1?'gallery':'galleries'} downloading`:'Ready when you are';$('#footer-speed').textContent=bytes(speed)+'/s';$('#footer-folder').textContent=state.prefs.downloadDir;$('#footer-folder').title=state.prefs.downloadDir;document.documentElement.dataset.theme=state.prefs.theme;$$('[data-theme-choice]').forEach(b=>b.classList.toggle('selected',b.dataset.themeChoice===state.prefs.theme));renderThemeWorkspace();}
function renderSearch(){
  const q=$('#result-filter').value.toLowerCase();const filtered=searchResults.filter(r=>`${r.title} ${r.url}`.toLowerCase().includes(q));
  $('#search-results-title').textContent=searchBusy?'Searching this site…':searchResults.length?`${filtered.length} galleries found`:searchNotice||'Ready to explore';
  $('#run-search').disabled=searchBusy;
  $('#search-results').className=filtered.length?'surface':'';
  $('#search-results').innerHTML=filtered.length?filtered.map(r=>`<div class="result-row" data-context-url="${esc(r.url)}"><input type="checkbox" data-result="${esc(r.url)}" ${resultChecked.has(r.url)?'checked':''} aria-label="Select ${esc(r.title)}"><div><strong title="${esc(r.title)}">${esc(r.title)}</strong><p>${esc(r.url)}</p></div><button class="button" data-result-open="${esc(r.url)}">${icon('globe')}Open</button><button class="button" data-result-queue="${esc(r.url)}">${icon('plus')}Queue</button></div>`).join(''):`<div class="empty-state"><div class="empty-art">${icon('search')}</div><h3>${searchBusy?'Looking for galleries…':searchNotice||'Follow your curiosity.'}</h3><p>${searchBusy?'You can keep working with your queue while the site responds.':'Choose a site and search for a title, artist, or tag. A saved result list will appear here.'}</p></div>`;
  $('#saved-searches').innerHTML=state.searches.length?state.searches.map((s,i)=>`<div class="saved-search-row">${icon('clock')}<strong>${esc(s.query)}</strong><small>${esc(sites.find(x=>x.id===s.siteId)?.name||s.siteId)} · ${s.results.length} results</small><button class="button" data-saved-search="${i}">Load results</button></div>`).join(''):'<p class="helper" style="padding-top:18px">No saved searches yet.</p>';
}
function renderSites(){$('#site-profile-description').textContent=sites.length+' active site profiles. Add your own, or update an existing adapter.';const q=$('#site-filter').value.toLowerCase();$('#site-grid').innerHTML=sites.filter(s=>`${s.name} ${s.domains.join(' ')}`.toLowerCase().includes(q)).map(s=>`<div class="site-card" data-context-url="${esc(s.root)}"><span class="site-logo">${esc(s.name[0])}</span><div><h3>${esc(s.name)}</h3><p>${esc(s.domains[0])}<br>${esc(s.language)}${s.supportNote?'<br>'+esc(s.supportNote):''}</p><div class="site-tags"><span>${s.supportNote?.includes('provisional')?'Reader fallback':s.engine==='native'?'Native adapter':'gallery-dl'}</span>${s.original?'<span>Originals</span>':''}${s.cookies?'<span>Cookies</span>':''}${s.repair?'<span>Image repair</span>':''}${s.browserCapture?'<span>Browser capture</span>':''}${s.upscale?'<span>1.5× / 2×</span>':''}</div></div><button class="icon-button site-open" data-site-open="${esc(s.root)}" title="Open site in Browser">${icon('external')}</button></div>`).join('');$('#plugin-list').innerHTML=state.plugins.map(p=>`<div class="surface plugin-row"><div class="panel-icon">${icon('code')}</div><div><h3>${esc(p.name||p.id)} <span class="pill">${p.enabled===false?'Disabled':'Enabled'}</span></h3><p>v${esc(p.version||'1.0')} · ${esc(p.domains.join(', '))}</p></div><button class="button" data-plugin="${p.id}" data-plugin-action="toggle">${p.enabled===false?'Enable':'Disable'}</button><button class="icon-button" data-plugin="${p.id}" data-plugin-action="remove" title="Remove script">${icon('trash')}</button></div>`).join('');}
function renderCookies(){renderAccounts();const rows=state.cookieSummary||[];$('#cookie-list').className=rows.length?'surface':'';$('#cookie-list').innerHTML=rows.length?rows.map(r=>`<div class="domain-row"><span>${icon('lock')}</span><strong>${esc(r.domain)}</strong><small>${r.count} ${r.count===1?'cookie':'cookies'}</small><button class="icon-button" data-cookie-remove="${esc(r.domain)}" aria-label="Remove cookies for ${esc(r.domain)}">${icon('trash')}</button></div>`).join(''):`<div class="surface empty-state"><div class="empty-art">${icon('key')}</div><h3>Your accounts are ready to connect.</h3><p>Import an extension export, or sign in with the built-in browser.</p></div>`;}
function renderCookieStatus(){const target=$('#cookie-import-status'),row=state.cookieStatus;if(!target)return;target.hidden=!row;if(row)target.textContent=`${row.count} cookies stored · ${row.browserAccepted} accepted by the built-in browser${row.browserRejected?` · ${row.browserRejected} browser copies rejected`:''}. ${row.note||''}`.trim();}
function renderPreferences(force=false){const stamp=JSON.stringify(state.prefs);if(!force&&stamp===prefsStamp)return;if($('#page-preferences').contains(document.activeElement)&&['INPUT','SELECT'].includes(document.activeElement.tagName))return;prefsStamp=stamp;const p=state.prefs;
  renderThemeCards();
  $('#download-preferences').innerHTML=`<div class="pref-field full"><label>Download folder</label><div class="folder-input"><input class="input" readonly value="${esc(p.downloadDir)}" aria-label="Download folder"><button class="button" data-action="choose-folder">${icon('folder')}Choose folder</button></div><small>Each gallery gets its own folder, numbered pages, and a gallery.json metadata file.</small></div><div class="pref-field"><label for="pref-workers">Image workers per gallery</label><input class="input" id="pref-workers" type="number" min="1" max="50" value="${p.workers}" data-pref="workers"><small>1–50 workers per gallery. The request interval and site limits still apply.</small></div><div class="pref-field"><label for="pref-concurrent">Simultaneous galleries</label><input class="input" id="pref-concurrent" type="number" min="1" max="5" value="${p.concurrentTasks}" data-pref="concurrentTasks"><small>1–5 galleries. Reorder queued tasks by dragging, or use the task menu.</small></div><div class="pref-field"><label for="pref-quality">Default file quality</label><select class="input" id="pref-quality" data-pref="quality"><option value="resampled" ${p.quality==='resampled'?'selected':''}>Resampled / site default</option><option value="original" ${p.quality==='original'?'selected':''}>Original files · E-Hentai / ExHentai</option></select><small>E/Ex originals use your authorized cookies and may consume account points.</small></div><div class="pref-field"><label for="pref-speed">Speed cap per gallery (KB/s)</label><input class="input" id="pref-speed" type="number" min="0" max="102400" value="${p.speedLimit}" data-pref="speedLimit"><small>0 leaves the local cap off. Server speed and quota limits still apply.</small></div><div class="pref-field"><label for="pref-scale">Kemono image size</label><select class="input" id="pref-scale" data-pref="kemonoUpscale">${[1,1.5,2].map(n=>`<option value="${n}" ${p.kemonoUpscale===n?'selected':''}>${n===1?'Original size':n+'× enlargement'}</option>`).join('')}</select><small>Original size is the default. The local model enlarges line art; results depend on the source. Original bytes are kept in originals/ for comparison.</small></div><div class="pref-field"><label for="pref-upscale-method">Enlargement method</label><select class="input" id="pref-upscale-method" data-pref="upscaleMethod"><option value="waifu2x" ${p.upscaleMethod==='waifu2x'?'selected':''}>waifu2x CUnet · local AI</option><option value="lanczos" ${p.upscaleMethod==='lanczos'?'selected':''}>Lanczos · simple resize</option></select><small>AI runs offline and uses your GPU, with a CPU fallback. A 1.5× result is made from the model’s 2× output.</small></div><div class="pref-field"><label for="pref-upscale-noise">Image cleanup</label><select class="input" id="pref-upscale-noise" data-pref="upscaleDenoise"><option value="off" ${p.upscaleDenoise==='off'?'selected':''}>Off · preserve texture</option><option value="gentle" ${p.upscaleDenoise==='gentle'?'selected':''}>Gentle · reduce compression noise</option></select><small>Cleanup can smooth texture. Leave it off for clean artwork.</small></div><div class="pref-field"><label for="pref-upscale-device">Image processor</label><select class="input" id="pref-upscale-device" data-pref="upscaleDevice"><option value="auto" ${p.upscaleDevice==='auto'?'selected':''}>Automatic · GPU, then CPU</option><option value="cpu" ${p.upscaleDevice==='cpu'?'selected':''}>CPU only · slower</option></select></div><div class="pref-field"><label for="pref-posts">Maximum posts per creator / pool</label><input class="input" id="pref-posts" type="number" min="1" max="500" value="${p.maxPosts}" data-pref="maxPosts"><small>Pawchive, Kemono, Pixiv user pages and Danbooru pools. Use individual posts for a smaller task.</small></div><div class="pref-field"><label for="pref-delay">Minimum request interval (seconds)</label><input class="input" id="pref-delay" type="number" min="0.2" max="30" step="0.1" value="${p.delay}" data-pref="delay"><small>Requests are paced. A server cooldown pauses affected tasks for that site.</small></div></div>`;
  const toggles=[['compactSidebar','Use a compact sidebar','Show navigation icons with tooltips and give the workspace more room.'],['queueDetails','Show the task details panel','Keep previews and task options beside the queue. Turn this off for a wider queue.'],['autoStart','Start new tasks automatically','New URLs begin downloading as soon as a queue slot is available.'],['resumeOnLaunch','Resume the running queue after reopening','Previously running or queued tasks resume when FileFapper starts. Manually paused tasks stay paused.'],['repair','Restore scrambled JMComic pages','Reassemble horizontal strips using gallery metadata before saving. Files are saved as PNG when restored.'],['clipboard','Monitor the clipboard','Offer to add copied URLs from supported sites. You choose when to add them.'],['alwaysOnTop','Keep FileFapper always on top','Keep the application window above your other windows.'],['hideThumbnails','Hide gallery thumbnails','Show a book icon in the queue and task details. Full previews remain available.']];
  $('#download-preferences').insertAdjacentHTML('beforeend',[
    ['fastResolve','Faster E/Ex gallery resolution','Reduce waiting between gallery lookups and image recovery attempts. Applies when an E/Ex task starts or resumes.'],
    ['bypassRateLimits','Skip automatic download cooldowns','Retry HTTP 429/509 briefly instead of placing downloads in Cooldown. A persistent server refusal ends as Failed. Off by default; applies when a task starts or resumes.']
  ].map(([key,title,description])=>`<div class="pref-field full"><div class="toggle-row"><div><strong>${title}</strong><p>${description}</p></div><button class="toggle ${p[key]?'on':''}" data-toggle="${key}" role="switch" aria-checked="${!!p[key]}" aria-label="${title}"></button></div></div>`).join(''));
  $('#behavior-preferences').innerHTML=toggles.map(([key,title,description])=>`<div class="toggle-row"><div><strong>${title}</strong><p>${description}</p></div><button class="toggle ${p[key]?'on':''}" data-toggle="${key}" role="switch" aria-checked="${!!p[key]}" aria-label="${title}"></button></div>`).join('');
}
function render(){if(!state)return;renderCommon();if(page==='queue')renderQueue();if(page==='search')renderSearch();if(page==='sites')renderSites();if(page==='cookies'){renderCookies();renderCookieStatus();}if(page==='preferences')renderPreferences();if(previewId)renderPreview();}
function showModal(title,subtitle,body,type='generic'){modalType=type;$('#modal-title').textContent=title;$('#modal-subtitle').textContent=subtitle||'';$('#modal-body').innerHTML=body;$('#modal').classList.remove('hidden');hideBrowserBounds();hydrate($('#modal'));$('#modal [data-action="close-modal"]').focus();}
function closeModal(){browserToolsRequest++;if(modalType==='galleries')fire('browser-galleries','cancel');previewId=null;modalType='';$('#modal').classList.add('hidden');$('#modal-body').innerHTML='';if(page==='browser')updateBrowserBounds();}
async function showDoc(type){const data=await call('open-doc',type);showModal(type==='audit'?'Public reader audit · October 20, 2026':type==='scripts'?'Writing a FileFapper site script':type==='sites'?'Site support notes':type==='licenses'?'Third-party notices':'FileFapper user guide','Local documentation',`<pre class="doc-text">${esc(data)}</pre>`,'doc');}
function showMetadata(id){const t=state.tasks.find(t=>t.id===id);if(!t)return;showModal('Gallery metadata',t.title,`<pre class="metadata-text">${esc(JSON.stringify({title:t.title,source:t.url,site:t.site,status:t.status,quality:t.quality,pages:t.total,downloaded:t.done,folder:t.folder,bytes:t.bytes,created:t.createdAt,completed:t.completedAt,...t.metadata},null,2))}</pre>`,'metadata');}
let previewOriginal=false,previewActual=false;
function renderPreview(force=false){const t=state.tasks.find(t=>t.id===previewId);if(!t){closeModal();return;}const files=t.files||[];previewIndex=Math.max(0,Math.min(previewIndex,files.length-1));const stamp=JSON.stringify([previewId,previewIndex,files.length,t.status,t.error,previewOriginal,previewActual]);if(stamp===previewStamp&&!force)return;previewStamp=stamp;
  const f=files[previewIndex];$('#modal-title').textContent=t.title;$('#modal-subtitle').textContent=f?`${f.name} · ${bytes(f.bytes)}${f.repaired?' · Restored image':''}`:t.error||'Fetching the first page. You can close this preview and keep working.';
  const kind=fileKind(f),url=f?imageUrl(t,f.index)+(previewOriginal&&f.originalPath?'?original=1':''):'';
  const media=!f?'':f.previewPath?`<img src="${url}?preview=1" alt="Animated Pixiv ugoira">`:kind==='image'?`<img src="${url}" alt="File ${f.index} of ${esc(t.title)}">`:kind==='video'?`<video src="${url}" controls preload="metadata" playsinline aria-label="Video preview"></video>`:kind==='audio'?`<div class="audio-preview">${icon('play')}<h3>${esc(f.name)}</h3><audio src="${url}" controls preload="metadata" aria-label="Audio preview"></audio></div>`:`<div class="attachment-preview">${icon('folder')}<h3>${esc(f.name)}</h3><p>${kind==='animation'?'Original Pixiv ugoira ZIP and frame timing saved.':'This '+kind+' is saved in its original format.'}</p><p>${esc(f.note||'Use Open file to view it in your Windows application.')}</p></div>`;
  $('#modal-body').innerHTML=f?`<div class="preview-canvas ${previewActual?'actual-size':''}">${media}</div>${f.note?`<p class="helper">${esc(f.note)}</p>`:''}${f.originalPath?`<div class="comparison-tools"><button class="button ${!previewOriginal?'active':''}" data-action="preview-enhanced">Enlarged · ${esc(f.enhancement||f.upscale+'×')}</button><button class="button ${previewOriginal?'active':''}" data-action="preview-original">Server original</button><button class="button ${previewActual?'active':''}" data-action="preview-size">${previewActual?'100% · actual pixels':'Fit in window'}</button><span>Compare at 100% to judge detail.</span></div>`:''}<div class="preview-controls"><button class="button" data-action="preview-previous" ${previewIndex===0?'disabled':''}>${icon('arrowleft')}Previous</button><span>File ${f.index} · ${files.length} downloaded${t.total?' / '+t.total+' total':''}</span><button class="button" data-preview-open="${f.index}">Open file</button><button class="button" data-action="preview-next" ${previewIndex===files.length-1?'disabled':''}>Next${icon('arrowright')}</button></div>`:`<div class="empty-state"><div class="empty-art">${icon(t.error?'info':'image')}</div><h3>${t.error?'Preview unavailable':'Preparing your preview…'}</h3><p>${esc(t.error||'A preview downloads the first media file into this gallery’s folder.')}</p></div>`;
}
async function taskAction(id,action){selectedId=id;if(action==='preview'){previewId=id;previewIndex=0;previewStamp='';previewOriginal=false;previewActual=false;showModal('Gallery preview','Preparing preview…','', 'preview');renderPreview(true);}await call('task-action',id,action);if(action==='remove'&&selectedId===id)selectedId=null;render();}
function contextMenu(id,x,y){selectTask(id);const menu=$('#context-menu');const t=current();if(!t)return;
  const groups=[
    [['Preview gallery','eye','preview'],[activeTask(t)?'Pause':'Resume','play',activeTask(t)?'pause':'play'],['Stop','stop','stop'],['Restart download','refresh','restart']],
    [['Move up in queue','arrowup','up'],['Move down in queue','arrowdown','down']],
    [['Copy gallery link','copy','copy-link'],['Show gallery in Browser','globe','open-browser'],['Open in default browser','external','open-external']],
    [['Open first file','image','open-first'],['Open folder','folder','open-folder'],['Move folder…','folderplus','move-folder'],['Gallery metadata','info','metadata']],
    [['Remove from list','x','remove'],['Delete gallery folder…','trash','delete-folder']]
  ];menu.innerHTML=groups.map(g=>g.map(([label,i,action])=>`<button role="menuitem" data-menu-id="${id}" data-menu-action="${action}" class="${action==='delete-folder'?'danger':''}">${icon(i)}${label}</button>`).join('')).join('<div class="menu-divider"></div>');menu.classList.remove('hidden');const r=menu.getBoundingClientRect();menu.style.left=Math.max(5,Math.min(x,innerWidth-r.width-8))+'px';menu.style.top=Math.max(5,Math.min(y,innerHeight-r.height-8))+'px';}
function hideContext(){$('#context-menu').classList.add('hidden');}
let browserBoundsFrame=0;
function hideBrowserBounds(){if(browserBoundsFrame){cancelAnimationFrame(browserBoundsFrame);browserBoundsFrame=0;}fire('browser-bounds',null);}
function updateBrowserBounds(){if(page!=='browser'||!browserOpened||!$('#modal').classList.contains('hidden')||browserBoundsFrame)return;browserBoundsFrame=requestAnimationFrame(()=>{browserBoundsFrame=0;if(page!=='browser'||!$('#modal').classList.contains('hidden'))return;const r=$('#browser-host').getBoundingClientRect();fire('browser-bounds',{x:r.x+1,y:r.y+1,width:r.width-2,height:r.height-2});});}
async function navigate(url){await call('browser-navigate',url);browserOpened=true;$('#browser-url').value=url;setPage('browser');updateBrowserBounds();}
async function addFromBar(){const value=$('#urls').value.trim();if(!value){toast('Paste a gallery URL first.');$('#urls').focus();return;}await call('set-prefs',{quality:$('#add-quality').value,workers:Number($('#add-workers').value)});const r=await call('add-urls',value);$('#urls').value='';if(r.added.length){selectedId=r.added[0];toast(`${r.added.length} ${r.added.length===1?'gallery':'galleries'} added to your queue.`);}else if(r.openedListings)toast('Results page opened. Choose Queue galleries to collect its gallery links.');else toast('Those URLs are already in your queue.');render();}
async function search(){if(searchBusy)return;const query=$('#search-query').value.trim();if(!query){$('#search-query').focus();return;}searchBusy=true;searchNotice='';renderSearch();try{const result=await call('search',$('#search-site').value,query);if(result.browser)toast('This site uses interactive search. Choose a gallery in Browser, then queue it.');else{searchResults=result.results;resultChecked.clear();searchNotice=result.results.length?'':'No results on this page. Try the browser or a different search.';}}catch(e){searchNotice=e.message;}finally{searchBusy=false;renderSearch();}}
async function handleAction(action){
  if(action==='close-modal')closeModal();else if(action==='choose-folder')await call('choose-download-dir');else if(['session-import','session-export'].includes(action)){const r=await call(action);if(r)toast(action==='session-export'?'Session saved. Cookies and saved passwords are excluded.':'Session loaded. Press play to resume tasks.');}
  else if(['pause-all','stop-all','resume-all','clear-completed','clear-all'].includes(action))await call('queue-action',action);
  else if(action==='sample'){const r=await call('add-urls','dfdemo://sample/design');selectedId=r.added[0]||state.tasks.find(t=>t.siteId==='demo')?.id;render();}
  else if(action==='reset-filters'){filterStatus='all';$('#task-filter').value='';$('#task-site').value='all';renderQueue();}
  else if(action==='deselect'){checked.clear();renderQueue();}else if(action==='deselect-task'){await call('set-prefs',{queueDetails:false});}
  else if(action==='guide')await showDoc('guide');else if(action==='script-guide')await showDoc('scripts');else if(action==='site-guide')await showDoc('sites');
  else if(action==='site-audit')await showDoc('audit');
  else if(action==='plugin-import'){const r=await call('plugin-import');if(r)toast(`${r.name||r.id} imported.`);}
  else if(action==='cookies-import-file'||action==='cookies-sync'){const r=await call(action);if(r)toast(`${r.count} cookies imported.${r.note?' '+r.note:''}`);}
  else if(action==='browser-fill-login'){const r=await call('browser-fill-login');toast(r.message);}
  else if(action==='access-resume'){const r=await call('access-resume');toast(`${r.count} cookies synced · ${r.resumed} paused tasks resumed.`);}
  else if(action==='sidebar-toggle'){await call('set-prefs',{compactSidebar:!state.prefs.compactSidebar});updateBrowserBounds();}
  else if(action==='queue-details')await call('set-prefs',{queueDetails:!state.prefs.queueDetails});
  else if(action==='browser-focus'){await call('set-prefs',{browserFocus:!state.prefs.browserFocus});updateBrowserBounds();}
  else if(action==='browser-saved-tags')await showBrowserTools('tags');
  else if(action==='tabs-left-one')scrollTabStrip(-1,1);
  else if(action==='tabs-left-five')scrollTabStrip(-1,5);
  else if(action==='tabs-right-one')scrollTabStrip(1,1);
  else if(action==='tabs-right-five')scrollTabStrip(1,5);
  else if(action==='browser-tabs-menu'){const button=$('#browser-all-tabs'),rect=button.getBoundingClientRect();button.setAttribute('aria-expanded','true');try{await call('browser-tabs-menu',{x:rect.left,y:rect.bottom});}finally{button.setAttribute('aria-expanded','false');}return;}
  else if(action==='browser-tools')await showBrowserTools('plugins');
  else if(action==='browser-adblock')await showBrowserTools('adblock');
  else if(action==='browser-sessions')await showBrowserTools('sessions');
  else if(action==='browser-data')await showBrowserTools('data');
  else if(action==='browser-translate'){await translatePage();}
  else if(action==='browser-ppixiv-bar'){await call('browser-action','ppixiv-bar');}
  else if(action==='browser-infinite'){await call('browser-scroll','toggle');}
  else if(action==='browser-autoscroll'){await call('browser-scroll','auto');}
  else if(action==='browser-capture'){const r=await call('browser-action','capture');toast(`${r.pages} rendered pages added to the queue.`);}
  else if(action==='browser-categories')await showGalleryCategories();
  else if(action==='browser-download'){const r=await call('browser-action','download');if(r?.listing)return showGalleryQueue();if(r?.added?.length)toast('Gallery added to your queue.');}
  else if(action==='preview-original'||action==='preview-enhanced'){previewOriginal=action==='preview-original';renderPreview(true);}else if(action==='preview-size'){previewActual=!previewActual;renderPreview(true);}
  else if(action==='preview-next'){previewIndex++;renderPreview(true);}else if(action==='preview-previous'){previewIndex--;renderPreview(true);}
  else if(action==='diagnostics'){$('#engine-status').textContent='Checking bundled engine…';try{const r=await call('diagnostics');$('#engine-status').textContent=`Engine ready · gallery-dl ${r.engine} · Python ${r.python}`;}catch(e){$('#engine-status').textContent=e.message;}}
}
let lastContentFocusRequest=0;
function returnContentFocus(event){const field=event.target?.closest?.('textarea,input,[contenteditable=true],[contenteditable=""]');if(!event.isTrusted||!field||field.disabled||field.readOnly||field.type==='hidden')return;if(field.tagName==='INPUT'&&!['text','search','url','email','password','tel','number'].includes(field.type))return;const now=Date.now();if(now-lastContentFocusRequest<80)return;lastContentFocusRequest=now;window.df.invoke('window-focus-content',now).catch(()=>{});}
document.addEventListener('pointerdown',returnContentFocus,{capture:true});
document.addEventListener('focusin',returnContentFocus,{capture:true});
document.addEventListener('click',async event=>{
  try{
    const b=event.target.closest('button,[data-task-action]');
    if(!event.target.closest('#context-menu'))hideContext();
    if(b){
      if(b.dataset.page){setPage(b.dataset.page);return;}
      if(b.dataset.window){await call('window-control',b.dataset.window);return;}
      if(b.dataset.themeChoice){await call('set-prefs',{theme:b.dataset.themeChoice});return;}
      if(b.dataset.action){await handleAction(b.dataset.action);return;}
      if(b.dataset.taskAction){await taskAction(b.dataset.task,b.dataset.taskAction);return;}
      if(b.dataset.taskMenu){const r=b.getBoundingClientRect();contextMenu(b.dataset.taskMenu,r.right,r.bottom);return;}
      if(b.dataset.menuAction){hideContext();const id=b.dataset.menuId,action=b.dataset.menuAction;if(['up','down'].includes(action))await call('reorder',id,action);else if(action==='metadata')showMetadata(id);else await taskAction(id,action);return;}
      if(b.dataset.metadata){showMetadata(b.dataset.metadata);return;}
      if(b.dataset.status){filterStatus=b.dataset.status;renderQueue();return;}
      if(b.dataset.bulk){await call('bulk-task-action',[...checked],b.dataset.bulk);if(b.dataset.bulk==='remove')checked.clear();renderQueue();return;}
      if(b.dataset.toggle){await call('set-prefs',{[b.dataset.toggle]:!state.prefs[b.dataset.toggle]});return;}
      if(b.dataset.siteOpen){browserOpened=true;await call('browser-open',b.dataset.siteOpen);setPage('browser');updateBrowserBounds();return;}
      if(b.dataset.browserTab){browserOpened=true;await call('browser-tab',b.dataset.browserTab,b.dataset.tabId);updateBrowserBounds();if(b.dataset.browserTab==='new')$('#browser-url').focus();return;}
      if(b.dataset.browser){await call('browser-action',b.dataset.browser);return;}
      if(b.dataset.resultOpen){await navigate(b.dataset.resultOpen);return;}
      if(b.dataset.resultQueue){await call('add-urls',b.dataset.resultQueue);toast('Gallery sent to your queue.');return;}
      if(b.dataset.savedSearch){const s=state.searches[Number(b.dataset.savedSearch)];searchResults=s.results;$('#search-query').value=s.query;$('#search-site').value=s.siteId;resultChecked.clear();searchNotice='';renderSearch();return;}
      if(b.dataset.plugin){await call('plugin-action',b.dataset.plugin,b.dataset.pluginAction);return;}
      if(b.dataset.cookieRemove){await call('cookies-clear',b.dataset.cookieRemove);return;}
    }
    if(event.target.closest('[data-check]'))return;
    const row=event.target.closest('[data-task-row]');if(row){mouseSelect(row.dataset.taskRow,event);}
  }catch{/* call() already reported the error. */}
});
document.addEventListener('change',async event=>{const e=event.target;try{
  if(e.dataset.check){selectionAnchor=e.dataset.check;e.checked?checked.add(e.dataset.check):checked.delete(e.dataset.check);selectedId=e.dataset.check;renderQueue();}
  if(e.dataset.result){e.checked?resultChecked.add(e.dataset.result):resultChecked.delete(e.dataset.result);}
  if(e.dataset.pref){await call('set-prefs',{[e.dataset.pref]:e.type==='number'?Number(e.value):e.value});}
  if(e.dataset.taskOption){await call('set-task-options',e.dataset.id,{[e.dataset.taskOption]:e.value});}
}catch{}});
document.addEventListener('contextmenu',e=>{const row=e.target.closest('[data-task-row]');if(row){e.preventDefault();contextMenu(row.dataset.taskRow,e.clientX,e.clientY);}});
document.addEventListener('dblclick',e=>{const row=e.target.closest('[data-task-row]');if(row&&!e.target.closest('button,input,select'))taskAction(row.dataset.taskRow,'preview').catch(()=>{});});
document.addEventListener('dragstart',e=>{const row=e.target.closest('[data-task-row]');if(row){dragId=row.dataset.taskRow;e.dataTransfer.setData('text/plain',dragId);e.dataTransfer.effectAllowed='move';}});
document.addEventListener('dragover',e=>{if(dragId&&e.target.closest('[data-task-row]')){e.preventDefault();e.dataTransfer.dropEffect='move';}});
document.addEventListener('drop',e=>{const row=e.target.closest('[data-task-row]');if(dragId&&row){e.preventDefault();fire('reorder',dragId,row.dataset.taskRow);}dragId=null;});
document.addEventListener('dragend',()=>{dragId=null;});
document.addEventListener('keydown',e=>{if(page==='queue'&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'&&!e.target.closest('input,textarea,select,[contenteditable=true]')){e.preventDefault();for(const t of visibleTasks())checked.add(t.id);renderQueue();return;}if(page==='browser'&&e.ctrlKey&&['t','w','l','Tab'].includes(e.key)){e.preventDefault();if(e.key==='t'){browserOpened=true;fire('browser-tab','new');$('#browser-url').focus();}if(e.key==='w')fire('browser-tab','close',browser.activeId);if(e.key==='l'){$('#browser-url').focus();$('#browser-url').select();}if(e.key==='Tab')fire('browser-action',e.shiftKey?'previous-tab':'next-tab');}if(e.key==='Escape'){if(!$('#context-menu').classList.contains('hidden'))hideContext();else closeModal();$('#clipboard-banner').classList.add('hidden');}if(e.ctrlKey&&e.key==='Enter'&&page==='queue'){e.preventDefault();addFromBar().catch(()=>{});}if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&page==='queue'){e.preventDefault();$('#task-filter').focus();}if(previewId&&['ArrowLeft','ArrowRight'].includes(e.key)){const t=state.tasks.find(t=>t.id===previewId);previewIndex=Math.max(0,Math.min((t?.files?.length||1)-1,previewIndex+(e.key==='ArrowRight'?1:-1)));renderPreview(true);}});
$('#add-urls').addEventListener('click',()=>addFromBar().catch(()=>{}));
$('#add-quality').addEventListener('change',e=>fire('set-prefs',{quality:e.target.value}));$('#add-workers').addEventListener('change',e=>fire('set-prefs',{workers:Number(e.target.value)}));
$('#task-filter').addEventListener('input',renderQueue);$('#task-site').addEventListener('change',renderQueue);
$('#view-list').addEventListener('click',()=>fire('set-prefs',{view:'list'}));$('#view-icons').addEventListener('click',()=>fire('set-prefs',{view:'icons'}));
$('#run-search').addEventListener('click',search);$('#search-query').addEventListener('keydown',e=>{if(e.key==='Enter')search();});$('#result-filter').addEventListener('input',renderSearch);$('#site-filter').addEventListener('input',renderSites);
$('#queue-results').addEventListener('click',async()=>{if(!resultChecked.size){toast('Select some results first.');return;}try{const r=await call('add-urls',[...resultChecked].join('\n'));toast(`${r.added.length} galleries sent to your queue.`);}catch{}});
$('#cookies-paste').addEventListener('click',async()=>{try{const r=await call('cookies-import-text',$('#cookie-text').value);$('#cookie-text').value='';toast(`${r.count} cookies imported.${r.note?' '+r.note:''}`);}catch{}});
$('#browser-go').addEventListener('click',()=>navigate($('#browser-url').value).catch(()=>{}));$('#browser-url').addEventListener('keydown',e=>{if(e.key==='Enter')navigate(e.target.value).catch(()=>{});});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))closeModal();});
$('#browser-tabs').addEventListener('scroll',updateTabScrollButtons,{passive:true});new ResizeObserver(updateTabScrollButtons).observe($('#browser-tabs'));
new ResizeObserver(updateBrowserBounds).observe($('#browser-host'));window.addEventListener('resize',updateBrowserBounds);$('#main').addEventListener('scroll',updateBrowserBounds);
window.addEventListener('resize',positionSelectionBar);
window.df.on('state',s=>{state=s;if(selectedId&&!state.tasks.some(t=>t.id===selectedId))selectedId=null;render();});window.df.on('toast',toast);
window.df.on('browser-state',s=>{browser=s;renderBrowser();});
window.df.on('browser-request-translate',()=>translatePage().catch(()=>{}));
window.df.on('browser-focus-address',()=>{$('#browser-url').focus();$('#browser-url').select();});
window.df.on('browser-error',error=>{$('#browser-message').textContent='Could not load this page: '+error;});
window.df.on('show-browser',url=>{browserOpened=true;$('#browser-url').value=url;setPage('browser');});
window.df.on('clipboard-urls',urls=>{const banner=$('#clipboard-banner');banner.innerHTML=`${icon('link')}<span>${urls.length} copied gallery ${urls.length===1?'link':'links'} found</span><button class="button primary" id="clipboard-add">Add to queue</button><button class="icon-button" id="clipboard-dismiss" aria-label="Dismiss">${icon('x')}</button>`;banner.classList.remove('hidden');$('#clipboard-add').onclick=()=>{fire('add-urls',urls.join('\n'));banner.classList.add('hidden');};$('#clipboard-dismiss').onclick=()=>banner.classList.add('hidden');});
(async()=>{hydrate();[state,sites]=await Promise.all([call('get-state'),call('get-sites')]);$('#search-site').innerHTML=sites.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');$('#browser-sites').innerHTML=sites.filter(s=>['ehentai','exhentai','nhentai','hitomi','wnacg','jmcomic','kemono','pixiv','pawchive','rule34','r34app','kurosearch','r34react','rule34ai','rule34us','rule34pw','danbooru','gelbooru','tbib','aibooru','hentaidb'].includes(s.id)).map(s=>`<button type="button" data-site-id="${esc(s.id)}" data-site-open="${s.root}" title="${esc(s.name)}">${esc(s.id==='tbib'?'TBIB':s.name)}</button>`).join('');$('#add-workers').innerHTML=Array.from({length:50},(_,i)=>`<option value="${i+1}">${i+1} ${i?'workers':'worker'}</option>`).join('');$('#add-quality').value=state.prefs.quality;$('#add-workers').value=state.prefs.workers;browser=await call('browser-state');renderBrowser();render();if(state.lastError)toast(state.lastError);})().catch(e=>toast('FileFapper could not load: '+e.message));
