'use strict';
function challengeResource(value){try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='challenges.cloudflare.com'||u.pathname.startsWith('/cdn-cgi/challenge-platform/'));}catch{return false;}}
module.exports={challengeResource};
