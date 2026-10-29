'use strict';
function hosts(values){return [...new Set((Array.isArray(values)?values:[]).map(v=>String(v).trim().toLowerCase()).filter(v=>v.length<=253&&/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(v)))].slice(0,100);}
function hostOf(value){try{const u=new URL(value);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.hostname.toLowerCase():'';}catch{return '';}}
function networkPage(code,description,url){
 const host=hostOf(url),dns=[-105,-137,-800,-802,-803,-804,-805,-806].includes(Number(code))||/ERR_(?:NAME_NOT_RESOLVED|NAME_RESOLUTION_FAILED|DNS_)/.test(description||'');
 const invalid=[-107,-320].includes(Number(code))||/ERR_(?:SSL_PROTOCOL_ERROR|INVALID_HTTP_RESPONSE)|ErrorHttpInvalidServerResponse/i.test(description||'');
 if(!dns&&invalid)return {kind:'network',reason:'invalid-response',code:Number(code)||0,host,message:'The site or a network filter sent a response Edge could not use for '+(host||'this page')+'. Try the address in a regular browser and review any network security alerts.',detail:String(description||'').slice(0,160)};
 return {kind:'network',reason:dns?'dns':'connection',code:Number(code)||0,host,message:dns?`The address for ${host||'this site'} could not be found (DNS). Cookies and CAPTCHA verification cannot repair a missing domain record. Use Check connection to compare the system and browser results.`:`Could not load ${host||'this page'}: ${String(description||'Connection failed').slice(0,160)}.`,detail:String(description||'').slice(0,160)};
}
function verificationCookie(name){return /^(?:cf_clearance|__cf_bm|cf_chl_[a-z0-9_]+|__cf_chl_[a-z0-9_]+)$/i.test(String(name));}
module.exports={hosts,hostOf,networkPage,verificationCookie};
