const path = require('node:path');
const crypto = require('node:crypto');
const sites = require('./sites.json');
const themes = require('./theme-data.js');
const cookies = require('./cookies.cjs');
function activeSites(){return sites.filter(s=>s.retired!==true);}
const STATUSES = new Set(['queued','resolving','downloading','paused','stopped','complete','error','waiting']);
function clamp(v, min, max, fallback) { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }
function preferences(p = {}, downloadDir = '') {
  return {theme:themes.list.some(t=>t.id===p.theme)?p.theme:'light', ...themes.artworkPreferences(p), downloadDir:String(p.downloadDir || downloadDir),
    workers:Math.round(clamp(p.workers,1,50,4)), concurrentTasks:Math.round(clamp(p.concurrentTasks,1,5,2)),
    speedLimit:clamp(p.speedLimit,0,102400,0), delay:clamp(p.delay,0.2,30,0.6), quality:p.quality==='original'?'original':'resampled',
    autoStart:p.autoStart!==false, clipboard:!!p.clipboard, alwaysOnTop:!!p.alwaysOnTop, hideThumbnails:!!p.hideThumbnails,
    view:p.view==='icons'?'icons':'list', repair:p.repair!==false, resumeOnLaunch:!!p.resumeOnLaunch,
    compactSidebar:!!p.compactSidebar, queueDetails:!!p.queueDetails, browserFocus:!!p.browserFocus,
    upscaleMethod:p.upscaleMethod==='lanczos'?'lanczos':'waifu2x',upscaleDenoise:p.upscaleDenoise==='gentle'?'gentle':'off',upscaleDevice:p.upscaleDevice==='cpu'?'cpu':'auto',
    kemonoUpscale:[1,1.5,2].includes(Number(p.kemonoUpscale))?Number(p.kemonoUpscale):1,
    maxPosts:Math.round(clamp(p.maxPosts,1,500,50)),fastResolve:p.fastResolve===true,bypassRateLimits:p.bypassRateLimits===true};
}
function validUrl(value, demo = true) {
  try { const u = new URL(String(value)); if(demo && u.protocol==='dfdemo:') return u.href;
    if(!['https:','http:'].includes(u.protocol)||u.username||u.password) return null;
    return u.href; } catch{return null;}
}
function siteFor(url, extra = []) { try {const u=new URL(url);if(u.protocol==='dfdemo:')return {id:'demo',name:'Local sample',language:'English'};
  return [...extra,...sites].find(s=>(s.domains.some(d=>u.hostname===d||u.hostname.endsWith('.'+d))&&(!s.pathPrefix||u.pathname===s.pathPrefix.replace(/\/$/,'')||u.pathname.startsWith(s.pathPrefix))) || (s.id==='toonkor'&&/^toonkor\d+\.(org|com|net)$/.test(u.hostname))) || null;}catch{return null;} }
function parseUrls(text) { return [...new Set((String(text).match(/(?:https?:\/\/|dfdemo:\/\/)[^\s<>"']+/g)||[]).map(x=>x.replace(/[),;]+$/,'')).map(x=>validUrl(x)).filter(Boolean))]; }
function makeTask(url, prefs, extra = []) { const s=siteFor(url,extra);return {id:crypto.randomUUID(),url,site:s?.name||'Custom site',siteId:s?.id||'custom',
  title:url.startsWith('dfdemo:')?({'/afternoon':'A quiet afternoon','/next':'The next chapter'}[new URL(url).pathname]||'A little room for discovery'):new URL(url).pathname.split('/').filter(Boolean).slice(-2).join(' / ')||new URL(url).hostname,
  status:'queued',done:0,total:0,bytes:0,speed:0,folder:'',files:[],metadata:{},error:'',createdAt:new Date().toISOString(),quality:prefs.quality,workers:prefs.workers,upscaleMethod:prefs.upscaleMethod||'waifu2x',upscaleDenoise:prefs.upscaleDenoise||'off',upscaleDevice:prefs.upscaleDevice||'auto',upscale:s?.id==='kemono'?(prefs.kemonoUpscale||1):1}; }
const domainMatches=cookies.domainMatches,parseCookies=cookies.parseCookies;
function restoreTasks(rows) { if(!Array.isArray(rows))throw new Error('Session tasks must be an array.');return rows.slice(0,10000).map(t=>{
  if(!t||!validUrl(t.url)||!STATUSES.has(t.status))throw new Error('This session contains an invalid task.');
  const base=makeTask(t.url,preferences());return {...base,...t,id:/^[a-zA-Z0-9-]{1,80}$/.test(t.id)?t.id:base.id,
    status:['resolving','downloading','queued'].includes(t.status)?'paused':t.status,speed:0,upscale:[1,1.5,2].includes(Number(t.upscale))?Number(t.upscale):1,
    upscaleMethod:t.upscaleMethod==='lanczos'?'lanczos':'waifu2x',upscaleDenoise:t.upscaleDenoise==='gentle'?'gentle':'off',upscaleDevice:t.upscaleDevice==='cpu'?'cpu':'auto',
    files:Array.isArray(t.files)?t.files.filter(f=>f&&typeof f.path==='string'&&typeof f.name==='string'):[],metadata:t.metadata&&typeof t.metadata==='object'?t.metadata:{},
    capture:t.capture&&t.capture.url===t.url&&Array.isArray(t.capture.images)?{url:t.url,title:String(t.capture.title||t.title||'Browser gallery').slice(0,500),createdAt:String(t.capture.createdAt||''),images:t.capture.images.slice(0,2000).filter(i=>i&&(validUrl(i.url,false)||typeof i.localPath==='string')).map(i=>validUrl(i.url,false)?{url:validUrl(i.url,false),extension:typeof i.extension==='string'?i.extension:undefined,mediaKind:i.mediaKind}:{localPath:i.localPath,extension:'png'})}:undefined};
}); }
function isInside(base, target) {const rel=path.relative(path.resolve(base),path.resolve(target));return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);}
module.exports={preferences,validUrl,siteFor,parseUrls,makeTask,parseCookies,restoreTasks,domainMatches,isInside,sites,activeSites,clamp};
