'use strict';
// Self-contained: supplied to the browser scanner as data-processing code.
function profile(value){
 try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;const host=u.hostname.replace(/^www\./,'');
 const rules={
  'rule34ai.art':[/^\/\d+\/?$/,/^\/(?:$|tag\/|category\/|page\/)/],
  'rule34.pw':[/^\/post\/\d+\/?$/,/^\/(?!post\/|guide|characters)/],
  '177picyy.com':[/^\/html\/\d+\/\d+\/\d+\.html(?:\/\d+\/?)?$/,/^\/(?:$|category\/|page\/)/],
  'cartoon18.com':[/^\/story\/\d+\/full\/?$/,/^\/(?:$|v\/|q(?:\/|$)|list\/|category)/],
  'hentaidb.xyz':[/^\/comics\/[^/]+(?:\/read)?\/?$/,/^\/(?:$|comics\/?$|all\/?$)/],
  'doujiva.com':[/^\/manga\/[^/]+(?:\/read\/[^/]+)?\/?$/,/^\/(?:$|tags\/|artists\/|groups\/|characters\/|parodies\/)/],
  'kasei.cc':[/^\/comic\/(?:t\/)?[^/]+(?:\/read\/\d+)?\/?$/,/^\/(?:$|comic\/?$|search\/?$)/],
  'ho5ho.com':[/^\/[^/]+\/[^/]+(?:\/server-\d+)?\/?$/,/^\/(?:$|page\/|manga-tag\/|manga-genre\/)/]
 };
 if(host==='rule34.us')return {host,detail:u.searchParams.get('r')==='posts/view'&&/^\d+$/.test(u.searchParams.get('id')||''),listing:!u.searchParams.has('r')||['posts/index','posts/search'].includes(u.searchParams.get('r'))};
 const rule=rules[host];return rule?{host,detail:rule[0].test(u.pathname),listing:rule[1].test(u.pathname)}:null;
 }catch{return null;}
}
function scan(doc,url,match){
 const current=match(url);if(!current)return null;const u=new URL(url),rows=[],seen=new Set();let next=null;
 for(const a of doc.querySelectorAll('a[href]')){
  let target;try{target=new URL(a.getAttribute('href'),url);}catch{continue;}
  const info=match(target.href);if(!info||info.host!==current.host||!info.detail)continue;
  target.hash='';if(current.host==='doujiva.com')target.pathname=target.pathname.replace(/\/read\/[^/]+\/?$/,'');
  if(current.host==='rule34.us'){const id=target.searchParams.get('id');target.search='?r=posts/view&id='+id;}else target.search='';
  if(seen.has(target.href))continue;seen.add(target.href);
  const title=(a.getAttribute('title')||a.querySelector('img')?.getAttribute('alt')||a.textContent||target.pathname).trim().replace(/\s+/g,' ').slice(0,500);
  const time=a.closest('article,.post,.thumb')?.querySelector('time[datetime]')?.getAttribute('datetime')?.slice(0,10)||'';
  rows.push({url:target.href,title:title||'Post',date:time});if(rows.length>=5000)break;
 }
 for(const a of doc.querySelectorAll('a[rel~=next],.pagination a,.page-numbers,.pager a,.yiiPager a')){
  if(!a.matches('[rel~=next],.next')&&!/^(next(?:\s+page)?|[>»›→]+)$/i.test(a.textContent.trim()))continue;
  try{const n=new URL(a.getAttribute('href'),url);if(n.origin!==u.origin||n.username||n.password||n.href===u.href)continue;const info=match(n.href);if(!info?.listing||info.detail)continue;for(const [k,v] of u.searchParams)if(!['page','p','pid'].includes(k)&&!n.searchParams.has(k))n.searchParams.set(k,v);next=n.href;break;}catch{}
 }
 return {url,rows,next,truncated:rows.length>=5000,title:doc.title,kind:'extra'};
}
module.exports={profile,scan};
