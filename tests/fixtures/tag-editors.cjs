'use strict';
// Small independent fixtures with the real controls' one-chip-at-a-time behavior.
function kuro(){return `<!doctype html><title>Kurosearch tag fixture</title><input id="searchbar" name="searchbar" placeholder="Search for tags"><div id="selected"></div><script>
const u=new URL(location.href);if(u.pathname==='/share'){window.__restoredShare=u.href;sessionStorage.setItem('kurosearch:active-tags',JSON.stringify((u.searchParams.get('tags')||'').split(';').filter(Boolean).map(s=>({modifier:s[0],name:s.slice(1),count:0,type:'tag'}))));history.replaceState({},'','/');}
if(!sessionStorage.getItem('kurosearch:active-tags'))sessionStorage.setItem('kurosearch:active-tags',JSON.stringify([{name:'landscape',modifier:'+'},{name:'water',modifier:'-'}]));
if(!sessionStorage.getItem('kurosearch:sort'))sessionStorage.setItem('kurosearch:sort',JSON.stringify({property:'score',direction:'desc'}));
if(!sessionStorage.getItem('kurosearch:filter'))sessionStorage.setItem('kurosearch:filter',JSON.stringify({rating:'safe',scoreComparator:'>=',scoreValue:15}));
document.querySelector('#selected').textContent=JSON.parse(sessionStorage.getItem('kurosearch:active-tags')).map(t=>t.modifier+t.name).join(' ');
</script>`;}
function react(){return `<!doctype html><title>R34 React tag fixture</title><div id="query"><form><button aria-label="Tag Modifier" title="Cycle tag modifier">+</button><input id="tag-input" placeholder="Search for tags"><button aria-label="Add Tag">Add tag</button></form><div role="list"></div><button aria-label="Search">Search</button></div><script>
let pending='',modifier='+',selected=[{name:'old_tag',modifier:'+'}];const input=document.querySelector('#tag-input'),form=document.querySelector('form'),mod=document.querySelector('[aria-label="Tag Modifier"]'),list=document.querySelector('[role="list"]');
form.onsubmit=e=>e.preventDefault();input.oninput=()=>pending=input.value;mod.onclick=()=>{modifier=['+','-','~'][(['+','-','~'].indexOf(modifier)+1)%3];mod.textContent=modifier;};
function draw(){list.replaceChildren();for(const t of selected){const c=document.createElement('div');c.setAttribute('role','listitem');c.tabIndex=0;const s=document.createElement('span');s.textContent=t.name.replaceAll('_',' ')+' (123)';if(t.modifier==='-')s.style.textDecoration='line-through';if(t.modifier==='~')s.style.fontStyle='italic';c.append(s);c.onclick=()=>{selected=selected.filter(x=>x!==t);draw();};list.append(c);}window.__selectedTags=selected;}
document.querySelector('[aria-label="Add Tag"]').onclick=()=>{if(!pending.trim())return;const name=encodeURIComponent(pending.trim().toLowerCase().replaceAll(' ','_'));selected=selected.filter(x=>x.name!==name);selected.push({name,modifier});pending='';input.value='';draw();};
document.querySelector('button[aria-label="Search"]').onclick=()=>window.__searchStarted=true;draw();
</script>`;}
function routes(){return [{hostname:'kurosearch.com',status:200,headers:{'Content-Type':'text/html'},body:kuro()},{hostname:'kurozenzen.github.io',status:200,headers:{'Content-Type':'text/html'},body:react()}];}
module.exports={kuro,react,routes};
