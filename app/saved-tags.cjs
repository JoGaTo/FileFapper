'use strict';
const crypto=require('node:crypto');
const sites={kurosearch:{name:'Kurosearch',root:'https://kurosearch.com/'},r34react:{name:'R34 React',root:'https://kurozenzen.github.io/r34-react/'}};
function siteId(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)return null;if(u.hostname==='kurosearch.com')return 'kurosearch';if(u.hostname==='kurozenzen.github.io'&&/^\/r34-react(?:\/|$)/.test(u.pathname))return 'r34react';}catch{}return null;}
function tags(value){return String(value||'').trim().slice(0,4000);}
function saved(rows){const seen=new Set();return (Array.isArray(rows)?rows:[]).filter(r=>r&&sites[r.site]&&tags(r.tags)).slice(0,200).map(r=>({id:/^[\w-]{1,80}$/.test(r.id||'')?r.id:crypto.randomUUID(),site:r.site,name:String(r.name||r.tags).trim().slice(0,100),tags:tags(r.tags)})).filter(r=>{const key=r.site+'\n'+r.tags;if(seen.has(key)||seen.has(r.id))return false;seen.add(key);seen.add(r.id);return true;});}
function parse(value){
 const text=tags(value),tokens=text.match(/[+~-]?(?:"[^"\n]+"|'[^'\n]+')|[^\s;]+/g)||[],byName=new Map();
 for(let token of tokens){if(token==='+')continue;if(['(',')','~','|','OR','AND'].includes(token))throw new Error('Use individual tags with -exclude or ~optional prefixes; grouped boolean expressions are not supported.');
  let modifier=/^[+~-]/.test(token)?token[0]:'+';if(/^[+~-]/.test(token))token=token.slice(1);
  if((token.startsWith('"')&&token.endsWith('"'))||(token.startsWith("'")&&token.endsWith("'")))token=token.slice(1,-1);
  const name=token.trim().toLowerCase().replace(/\s+/g,'_');if(!name||/[;\r\n]/.test(name))throw new Error('Enter one tag per word or separate tags with semicolons.');byName.set(name,{name,modifier});
 }
 if(!byName.size)throw new Error('Enter at least one tag.');if(byName.size>80)throw new Error('Apply up to 80 tags in one saved search.');return [...byName.values()];
}
function kuroUrl(records,prefs={}){
 const u=new URL('https://kurosearch.com/share');u.searchParams.set('tags',records.map(t=>t.modifier+t.name).join(';'));
 const sort=prefs.sort;if(sort&&/^[a-z_]{1,40}$/i.test(sort.property||'')&&['asc','desc'].includes(sort.direction))u.searchParams.set('sort',sort.property+':'+sort.direction);
 const f=prefs.filter;if(f&&typeof f==='object'){const parts=[];if(['safe','questionable','explicit','all'].includes(f.rating)&&f.rating!=='all')parts.push('rating:'+f.rating);if(['>=','<=','==','!='].includes(f.scoreComparator)&&Number.isFinite(Number(f.scoreValue))&&(Number(f.scoreValue)!==0||f.scoreComparator!=='>='))parts.push('score'+f.scoreComparator+Math.round(Math.max(0,Math.min(1000000000,Number(f.scoreValue)))));if(parts.length)u.searchParams.set('filter',parts.join(';'));}return u.href;
}
// Self-contained: runs only on a supported search page, with no app IPC.
async function pageTags(site,operation,items){
 const input=()=>[...document.querySelectorAll('#tag-input,#searchbar,input[name="searchbar"],input[type="search"],input[placeholder*="tag" i],input[placeholder*="search" i]')].find(n=>n.getClientRects().length&&!n.disabled&&!n.readOnly);
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const query=records=>records.map(t=>(t.modifier==='+'?'':t.modifier)+t.name).join(' ');
 const readJson=key=>{try{const raw=sessionStorage.getItem(key)||localStorage.getItem(key);return raw&&raw.length<100000?JSON.parse(raw):null;}catch{return null;}};
 const valid=rows=>Array.isArray(rows)?rows.filter(r=>r&&typeof r.name==='string'&&r.name.length<1000&&['+','-','~'].includes(r.modifier)).map(r=>({name:r.name,modifier:r.modifier})).slice(0,200):[];
 const reactList=()=>{let n=input()?.closest('form');for(let depth=0;n&&depth<5;depth++,n=n.parentElement){const lists=[...n.querySelectorAll('[role="list"]')].filter(l=>!l.closest('form'));if(lists.length)return lists[0];}return null;};
 const reactChips=()=>{const list=reactList();return list?[...list.querySelectorAll('[role="listitem"]')].filter(n=>n.closest('[role="list"]')===list):[];};
 const readReact=()=>reactChips().map(n=>{const span=n.querySelector('span')||n,style=getComputedStyle(span);let name=span.textContent.trim().replace(/\s+\([\d.,]+[KMB]?\)$/i,'');try{name=decodeURIComponent(name);}catch{}return {name:name.replace(/\s+/g,'_'),modifier:style.textDecorationLine.includes('line-through')?'-':style.fontStyle==='italic'?'~':'+'};});
 const read=()=>site==='kurosearch'?valid(readJson('kurosearch:active-tags')):readReact();
 if(operation==='read'){const records=read();return {found:!!input(),records,tags:records.length?query(records):(input()?.value||''),sort:site==='kurosearch'?readJson('kurosearch:sort'):undefined,filter:site==='kurosearch'?readJson('kurosearch:filter'):undefined};}
 if(site!=='r34react'||operation!=='apply')throw Error('Unsupported tag action.');
 const field=input(),form=field?.closest('form'),add=form?.querySelector('[aria-label="Add Tag"]'),modifier=form?.querySelector('[aria-label="Tag Modifier"]');
 if(!field||!add||!modifier)throw Error('Open the R34 React search view so the Add Tag and modifier controls are visible.');
 const deadline=Date.now()+20000;
 const until=async(fn,message)=>{while(Date.now()<deadline){if(fn())return;await pause(35);}throw Error(message);};
 let count=0;
 try{
  for(let i=0;reactChips().length;i++){if(i>=200)throw Error('Too many active tags to replace.');const before=reactChips().length;reactChips()[0].click();await until(()=>reactChips().length<before,'Could not remove an existing selected tag.');}
  for(const tag of items){
   for(let i=0;i<4;i++){const current=modifier.textContent.trim().replace('−','-');if(current===tag.modifier)break;modifier.click();await pause(35);}
   if(modifier.textContent.trim().replace('−','-')!==tag.modifier)throw Error('The site did not select the requested tag modifier.');
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,tag.name);field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));await pause(45);add.click();
   await until(()=>readReact().some(r=>r.name===tag.name&&r.modifier===tag.modifier),'The site did not create the '+tag.name+' tag chip.');count++;
  }
  const actual=readReact();if(actual.length!==items.length||!items.every(t=>actual.some(a=>a.name===t.name&&a.modifier===t.modifier)))throw Error('The selected tags do not match this saved search.');
  const search=form.parentElement?.querySelector('button[aria-label="Search"]');if(search)search.click();return {found:true,verified:true,count,records:actual,searched:!!search};
 }catch(e){throw Error(e.message+' '+count+' of '+items.length+' saved tags were applied; check the current selection before retrying.');}
}
module.exports={sites,siteId,tags,saved,parse,kuroUrl,pageTags};
