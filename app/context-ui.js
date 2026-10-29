'use strict';
// Semantic app menus. Editable fields keep Chromium's native editing menu.
let contextCallbacks=[];
const previousHideContext=hideContext;
hideContext=function(){previousHideContext();if(page==='browser')updateBrowserBounds();};
function appMenu(items,x,y){
 const menu=$('#context-menu');contextCallbacks=[];
 menu.innerHTML=items.map(item=>{if(!item)return '<div class="menu-divider"></div>';const index=contextCallbacks.push(item.run)-1;return `<button role="menuitem" data-context-action="${index}" ${item.disabled?'disabled':''}>${icon(item.icon||'info')}${esc(item.label)}</button>`;}).join('');
 menu.classList.remove('hidden');const rect=menu.getBoundingClientRect();menu.style.left=Math.max(5,Math.min(x,innerWidth-rect.width-8))+'px';menu.style.top=Math.max(5,Math.min(y,innerHeight-rect.height-8))+'px';
 if(page==='browser')fire('browser-bounds',null);
 menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
}
const contextItem=(label,iconName,run,disabled=false)=>({label,icon:iconName,run,disabled});
function workspaceMenu(){return [
 contextItem('Add gallery URLs','plus',()=>{setPage('queue');$('#urls').focus();}),
 contextItem('Resume all tasks','play',()=>call('queue-action','resume-all')),
 contextItem('Pause all tasks','pause',()=>call('queue-action','pause-all')),
 contextItem('Clear all tasks…','x',()=>call('queue-action','clear-all'),!state.tasks.length),
 contextItem('Select visible tasks','check',()=>{checked=new Set(visibleTasks().map(t=>t.id));renderQueue();},page!=='queue'),
 null,
 contextItem('List view','list',()=>call('set-prefs',{view:'list'})),
 contextItem('Icon view','grid',()=>call('set-prefs',{view:'icons'})),
 contextItem(state.prefs.hideThumbnails?'Show thumbnails':'Hide thumbnails','image',()=>call('set-prefs',{hideThumbnails:!state.prefs.hideThumbnails})),
 contextItem(state.prefs.alwaysOnTop?'Turn off always on top':'Always on top','layers',()=>call('set-prefs',{alwaysOnTop:!state.prefs.alwaysOnTop})),
 contextItem(state.prefs.clipboard?'Stop clipboard monitoring':'Monitor clipboard','copy',()=>call('set-prefs',{clipboard:!state.prefs.clipboard})),
 null,contextItem('Preferences and themes','sliders',()=>setPage('preferences')),contextItem('User guide','help',()=>showDoc('guide'))];}
function browserTabMenu(id){const t=browser.tabs.find(t=>t.id===id),index=browser.tabs.findIndex(t=>t.id===id);return [
 contextItem('New tab','plus',()=>call('browser-tab','new')),
 contextItem('Duplicate tab','copy',()=>call('browser-tab','duplicate',id),!t),
 contextItem('Copy page address','link',()=>call('copy-text',t?.url||''),!t?.url),
 null,contextItem('Sort tabs A-Z','arrowdown',()=>call('browser-tab','sort-title')),
 contextItem('Sort tabs by domain','globe',()=>call('browser-tab','sort-domain')),
 contextItem('Sort tabs by date accessed','clock',()=>call('browser-tab','sort-accessed')),
 null,contextItem('Close tab','x',()=>call('browser-tab','close',id),!t),
 contextItem('Close other tabs','x',()=>call('browser-tab','close-others',id),browser.tabs.length<2),
 contextItem('Close tabs to the left','arrowleft',()=>call('browser-tab','close-left',id),index<=0),
 contextItem('Close tabs to the right','arrowright',()=>call('browser-tab','close-right',id),index<0||index===browser.tabs.length-1)
];}
document.addEventListener('contextmenu',event=>{
 const target=event.target;
 if(target.closest('input,textarea,[contenteditable=true]')||window.getSelection()?.toString())return;
 const row=target.closest('[data-task-row]');
 if(row){if(checked.size>1&&checked.has(row.dataset.taskRow))$('#context-menu').insertAdjacentHTML('afterbegin',`<button role="menuitem" data-bulk="play">${icon('play')}Resume ${checked.size} selected</button><button role="menuitem" data-bulk="pause">${icon('pause')}Pause selected</button><button role="menuitem" data-bulk="stop">${icon('stop')}Stop selected</button><button role="menuitem" data-bulk="remove">${icon('x')}Remove selected from list</button><div class="menu-divider"></div>`);const menu=$('#context-menu'),rect=menu.getBoundingClientRect();menu.style.top=Math.max(5,Math.min(event.clientY,innerHeight-rect.height-8))+'px';return;}
 if(event.defaultPrevented)return;
 let items;
 const tab=target.closest('.browser-tab')?.querySelector('[data-tab-id]');
 const url=target.closest('[data-context-url]')?.dataset.contextUrl;
 const plugin=target.closest('.plugin-row')?.querySelector('[data-plugin]');
 const session=target.closest('.session-row')?.querySelector('[data-session-name]');
 const link=target.closest('a[href]');
 if(tab){items=browserTabMenu(tab.dataset.tabId);}
 else if(url){const check=target.closest('[data-context-url]').querySelector('input[type=checkbox]');items=[contextItem('Open in Browser','globe',()=>{closeModal();return navigate(url);}),contextItem('Open in a new tab','plus',async()=>{await call('browser-tab','new');closeModal();return navigate(url);}),contextItem('Copy link','copy',()=>call('copy-text',url)),contextItem('Add download','download',()=>call('add-urls',url))];if(check)items.push(null,contextItem(check.checked?'Deselect result':'Select result','check',()=>{if(!check.disabled){check.checked=!check.checked;check.dispatchEvent(new Event('change',{bubbles:true}));}},check.disabled));}
 else if(previewId&&target.closest('#modal-body')){const t=state.tasks.find(t=>t.id===previewId),file=t?.files?.[previewIndex];items=[contextItem('Open this file','external',()=>call('task-action',t.id,'open-file',file.index),!file),contextItem('Open gallery folder','folder',()=>call('task-action',t.id,'open-folder'),!t?.folder),contextItem('Copy gallery link','copy',()=>call('copy-text',t.url)),contextItem('Gallery metadata','info',()=>showMetadata(t.id))];}
 else if(plugin){const id=plugin.dataset.plugin,p=state.plugins.find(p=>p.id===id);items=[contextItem(p?.enabled===false?'Enable script':'Disable script','code',()=>call('plugin-action',id,'toggle')),contextItem('Remove imported script','x',()=>call('plugin-action',id,'remove')),contextItem('Writing a site script','help',()=>showDoc('scripts'))];}
 else if(session){const id=session.dataset.sessionName;items=[contextItem('Restore saved tabs','globe',async()=>{await call('browser-sessions','restore',{id,replace:false});closeModal();setPage('browser');}),contextItem('Save session name','save',()=>call('browser-sessions','rename',{id,name:session.value})),contextItem('Delete saved session','trash',async()=>{await call('browser-sessions','delete',{id});return showBrowserTools('sessions');})];}
 else if(link&&/^https?:/.test(link.href))items=[contextItem('Open link in Browser','globe',()=>navigate(link.href)),contextItem('Copy link','copy',()=>call('copy-text',link.href))];
 else if(page==='browser')items=browserTabMenu(browser.activeId);
 else items=workspaceMenu();
 event.preventDefault();appMenu(items,event.clientX,event.clientY);
});
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-context-action]');
 if(button){const action=contextCallbacks[Number(button.dataset.contextAction)];hideContext();try{await action?.();}catch{}return;}
 const open=event.target.closest('[data-preview-open]');if(open)fire('task-action',previewId,'open-file',Number(open.dataset.previewOpen));
});
document.addEventListener('keydown',event=>{
 const menu=$('#context-menu');
 if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){if(event.target.closest('input,textarea,[contenteditable=true]'))return;event.preventDefault();const target=document.activeElement,row=target?.closest('[data-task-row]'),rect=target?.getBoundingClientRect();if(row||page==='queue'&&selectedId)contextMenu(row?.dataset.taskRow||selectedId,rect?.left||200,rect?.bottom||100);else{const tabId=target?.closest('.browser-tab')?.querySelector('[data-tab-id]')?.dataset.tabId;appMenu(page==='browser'?browserTabMenu(tabId||browser.activeId):workspaceMenu(),rect?.left||200,rect?.bottom||100);}return;}
 if(menu.classList.contains('hidden')||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
 event.preventDefault();const buttons=[...menu.querySelectorAll('button:not(:disabled)')],at=buttons.indexOf(document.activeElement);const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();
});
