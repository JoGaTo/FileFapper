'use strict';

// Keep the cookie's scope intact across extension exports, Chromium and workers.
function flag(value, fallback=false){
  if(value===undefined||value===null)return fallback;
  if(value===true||value===false)return value;
  if(value===1||value==='1')return true;
  if(value===0||value==='0')return false;
  if(typeof value==='string'){
    if(value.trim().toLowerCase()==='true')return true;
    if(value.trim().toLowerCase()==='false')return false;
  }
  throw new Error('Cookie flags must be true or false. Export the cookies again.');
}
function host(value){
  const domain=String(value??'').trim().toLowerCase();
  if(!/^\.?[a-z0-9-]+(?:\.[a-z0-9-]+)*$/.test(domain))throw new Error('A cookie is missing a valid domain.');
  return domain.replace(/^\./,'');
}
function cookiePath(value){
  const result=value===undefined||value===null||value===''?'/':String(value);
  if(!result.startsWith('/')||/[\x00-\x1f\x7f]/.test(result))throw new Error('A cookie has an invalid path. Export the cookies again.');
  return result;
}
function cookieName(value){
  if(typeof value!=='string'||!value||/[\x00-\x20\x7f;,=]/.test(value))throw new Error('A cookie is missing a valid name.');
  return value;
}
function sameSite(value){
  const normalized=String(value??'').trim().toLowerCase().replace(/[\s-]+/g,'_');
  if(normalized==='none'||normalized==='no_restriction')return 'no_restriction';
  return ['strict','lax','unspecified'].includes(normalized)?normalized:'unspecified';
}
function normalizeCookie(cookie,{includeExpired=false,now=Date.now()/1000}={}){
  if(!cookie||typeof cookie!=='object'||Array.isArray(cookie))throw new Error('Expected a cookie object.');
  const bare=host(cookie.domain),name=cookieName(cookie.name);
  if(typeof cookie.value!=='string')throw new Error('A cookie is missing a valid value.');
  const hostOnly=flag(cookie.hostOnly,!String(cookie.domain).trim().startsWith('.'));
  const secure=flag(cookie.secure),httpOnly=flag(cookie.httpOnly),path=cookiePath(cookie.path);
  if(name.startsWith('__Host-')&&(!hostOnly||!secure||path!=='/'))throw new Error('A __Host- cookie must be Secure, host-only and use the / path. Export it again with its original attributes.');
  if(name.startsWith('__Secure-')&&!secure)throw new Error('A __Secure- cookie must retain its Secure flag. Export it again with its original attributes.');
  let expirationDate;
  if(!flag(cookie.session)){
    const raw=cookie.expirationDate??cookie.expires;
    if(raw!==undefined&&raw!==null&&raw!==''){
      const number=Number(raw);
      if(!Number.isFinite(number))throw new Error('A cookie has an invalid expiration date. Export it again.');
      if(number>0)expirationDate=number;
    }
  }
  if(!includeExpired&&expirationDate!==undefined&&expirationDate<=now)return null;
  return {domain:hostOnly?bare:'.'+bare,hostOnly,name,value:cookie.value,path,secure,httpOnly,
    session:expirationDate===undefined,...(expirationDate===undefined?{}:{expirationDate}),sameSite:sameSite(cookie.sameSite)};
}
function liveCookies(rows,{skipInvalid=false,onInvalid,...options}={}){
  if(!Array.isArray(rows))throw new Error('Expected a cookie array.');
  const result=[];
  rows.forEach((row,index)=>{
    try{const normalized=normalizeCookie(row,options);if(normalized)result.push(normalized);}
    catch(error){if(!skipInvalid)throw error;if(typeof onInvalid==='function')onInvalid({index,message:error.message});}
  });
  return result;
}
function parseCookies(text){
  const input=String(text).replace(/^\uFEFF/,'');let rows;
  if(input.trimStart().startsWith('[')||input.trimStart().startsWith('{')){
    let parsed;try{parsed=JSON.parse(input);}catch{throw new Error('The cookie JSON could not be read.');}
    rows=Array.isArray(parsed)?parsed:parsed.cookies;
    if(!Array.isArray(rows))throw new Error('Expected a cookie array or an object with a cookies array.');
  }else{
    rows=input.split(/\r?\n/).filter(line=>line.trim()&&(!line.trimStart().startsWith('#')||line.trimStart().startsWith('#HttpOnly_'))).map(line=>{
      const source=line.trimStart(),httpOnly=source.startsWith('#HttpOnly_'),columns=source.replace(/^#HttpOnly_/,'').split('\t');
      if(columns.length<7)throw new Error('Use a Netscape cookies.txt export (seven tab-separated columns).');
      return {domain:columns[0],hostOnly:!flag(columns[1]),path:columns[2],secure:flag(columns[3]),expirationDate:columns[4],name:columns[5],value:columns.slice(6).join('\t'),httpOnly};
    });
  }
  return liveCookies(rows);
}
function toElectronCookie(cookie){
  const row=normalizeCookie(cookie,{includeExpired:true});
  if(row.sameSite==='no_restriction'&&!row.secure)throw new Error('A SameSite=None cookie must retain its Secure flag for the built-in browser. Export it again with its original attributes.');
  const url=new URL((row.secure?'https':'http')+'://'+host(row.domain)+'/');url.pathname=row.path;
  const details={url:url.href,name:row.name,value:row.value,path:row.path,secure:row.secure,httpOnly:row.httpOnly,sameSite:row.sameSite};
  // Supplying any domain makes Chromium create a domain cookie, even without a dot.
  if(!row.hostOnly)details.domain=row.domain;
  if(row.expirationDate!==undefined)details.expirationDate=row.expirationDate;
  return details;
}
function cookieKey(cookie){return JSON.stringify([host(cookie.domain),cookiePath(cookie.path),cookieName(cookie.name)]);}
function domainMatches(hostname,domain){
  const target=String(hostname).toLowerCase(),bare=String(domain).replace(/^\./,'').toLowerCase();
  return target===bare||(String(domain).startsWith('.')&&target.endsWith('.'+bare));
}
module.exports={normalizeCookie,parseCookies,toElectronCookie,cookieKey,liveCookies,domainMatches};
