'use strict';
const crypto=require('node:crypto');
const {validUrl}=require('../core.cjs');
const MAX_TABS=100;
const manifest={id:'tab-sessions',name:'FileFapper Tab Sessions',version:'1.0.0',author:'FileFapper',description:'Save, restore, import and export named groups of tabs.'};
function tabs(rows){return (Array.isArray(rows)?rows:[]).slice(0,MAX_TABS).filter(x=>x&&validUrl(x.url,false)).map(x=>({id:crypto.randomUUID(),url:validUrl(x.url,false),title:String(x.title||new URL(x.url).hostname).slice(0,240),...(typeof x.scrollEnabled==='boolean'?{scrollEnabled:x.scrollEnabled}:{}),...(Number.isFinite(Number(x.accessedAt))&&Number(x.accessedAt)>0?{accessedAt:Number(x.accessedAt)}:{})}));}
function saved(rows){return (Array.isArray(rows)?rows:[]).slice(0,50).map(s=>({id:crypto.randomUUID(),name:String(s.name||'Saved tabs').slice(0,80),createdAt:String(s.createdAt||new Date().toISOString()),tabs:tabs(s.tabs)})).filter(s=>s.tabs.length);}
function snapshot(name,rows){const list=tabs(rows);if(!list.length)throw new Error('Open at least one web page before saving a tab session.');return {id:crypto.randomUUID(),name:String(name||'My tabs').trim().slice(0,80)||'My tabs',createdAt:new Date().toISOString(),tabs:list};}
module.exports={manifest,MAX_TABS,tabs,saved,snapshot};
