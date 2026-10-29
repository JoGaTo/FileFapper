'use strict';
// Artwork lives outside the scrolling pages, so resizing and page changes keep
// it attached to the entire workspace rather than the width of the queue.
let artworkOnly=false,artworkThemeId='';
function renderThemeWorkspace(){
  const p=state.prefs,theme=DFThemes.artworkThemes.find(t=>t.id===p.theme);
  const layer=$('#workspace-artwork'),image=$('#workspace-artwork-image'),tools=$('#artwork-tools');
  if(!theme||page!=='queue'||artworkThemeId!==p.theme)artworkOnly=false;
  artworkThemeId=p.theme;
  $$('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===p.theme)));
  document.body.classList.toggle('artwork-theme',!!theme);
  document.body.classList.toggle('artwork-only',!!theme&&artworkOnly);
  $('#page-queue').inert=!!theme&&artworkOnly;
  layer.hidden=!theme;tools.hidden=!theme||page!=='queue';
  if(theme){
    if(image.getAttribute('src')!==theme.artwork){image.src=theme.artwork;layer.style.setProperty('--art-image',`url("${theme.artwork}")`);}
    const fit=DFThemes.validFit(theme,p.artworkFits?.[theme.id]);
    document.body.dataset.artworkFit=fit;
    document.body.dataset.artworkEffect=theme.textEffect||'glow';
    document.body.dataset.artworkWidth=p.artworkQueueWidth;
    document.body.style.setProperty('--artwork-opacity',p.artworkOpacity+'%');
    const brightness=p.artworkBrightness?.[theme.id]??100;document.body.style.setProperty('--artwork-brightness',String(brightness/100));
    if(document.activeElement!==$('#artwork-brightness'))$('#artwork-brightness').value=brightness;$('#artwork-brightness-value').value=brightness+'%';
    $('#artwork-title').textContent=theme.name;
    $('#artwork-fit-medium').hidden=theme.id!=='suketto';
    $('#artwork-fit').value=fit;
    $('#artwork-fit').title=fit==='medium'?'Both characters from head to around the knees':fit==='full'?'The entire image, with margins when needed':'Fill the workspace, cropping the edges when needed';
    if(document.activeElement!==$('#artwork-opacity'))$('#artwork-opacity').value=p.artworkOpacity;
    $('#artwork-opacity-value').value=p.artworkOpacity+'%';
    $$('button[data-artwork-width]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.artworkWidth===p.artworkQueueWidth)));
    $('#artwork-only').setAttribute('aria-pressed',String(artworkOnly));
    $('#artwork-only').textContent=artworkOnly?'Show queue':'Artwork only';
  }else{
    image.removeAttribute('src');layer.style.removeProperty('--art-image');
    delete document.body.dataset.artworkEffect;delete document.body.dataset.artworkFit;delete document.body.dataset.artworkWidth;
  }
}
function renderThemeCards(){
  const p=state.prefs;
  $('#theme-cards').innerHTML=DFThemes.list.map(t=>`<button class="theme-card ${p.theme===t.id?'selected':''} ${t.artwork?'artwork-card':''}" data-theme-choice="${t.id}" aria-label="${esc(t.name)} theme" aria-pressed="${p.theme===t.id}"><div class="theme-preview" style="--preview-bg:${t.colors[0]};--preview-side:${t.colors[1]};--preview-line:${t.colors[2]}">${t.artwork?`<img src="${t.artwork}" alt="" loading="lazy" decoding="async">`:'<div class="preview-side"><i></i><i></i><i></i></div><div class="preview-main"><i></i><div></div></div>'}</div><div class="theme-name">${t.symbol||''}${esc(t.name)} ${p.theme===t.id?icon('check'):''}</div>${t.artwork?`<span class="theme-description">${esc(t.description)}</span>`:''}</button>`).join('');
}
document.addEventListener('click',async event=>{
  const width=event.target.closest('button[data-artwork-width]');
  try{
    if(width){await call('set-prefs',{artworkQueueWidth:width.dataset.artworkWidth});positionSelectionBar();}
    if(event.target.closest('#artwork-only')){
      artworkOnly=!artworkOnly;hideContext();renderThemeWorkspace();positionSelectionBar();
    }
  }catch{/* call() displays any persistence error. */}
});
document.addEventListener('input',event=>{
  if(event.target.id==='artwork-brightness'){const value=Number(event.target.value);document.body.style.setProperty('--artwork-brightness',String(value/100));$('#artwork-brightness-value').value=value+'%';return;}
  if(event.target.id!=='artwork-opacity')return;
  const value=Number(event.target.value);
  document.body.style.setProperty('--artwork-opacity',value+'%');
  $('#artwork-opacity-value').value=value+'%';
});
document.addEventListener('change',async event=>{
  try{
    if(event.target.id==='artwork-brightness')await call('set-prefs',{artworkBrightness:{...state.prefs.artworkBrightness,[state.prefs.theme]:Number(event.target.value)}});
    if(event.target.id==='artwork-opacity')await call('set-prefs',{artworkOpacity:Number(event.target.value)});
    if(event.target.id==='artwork-fit')await call('set-prefs',{artworkFits:{...state.prefs.artworkFits,[state.prefs.theme]:event.target.value}});
  }catch{/* call() displays any persistence error. */}
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&artworkOnly&&$('#modal').classList.contains('hidden')&&$('#context-menu').classList.contains('hidden')){
    event.preventDefault();artworkOnly=false;renderThemeWorkspace();$('#artwork-only').focus();
  }
});
