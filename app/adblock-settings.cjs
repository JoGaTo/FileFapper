'use strict';
function settings(p={}){return {enabled:p.enabled!==false,ads:p.ads!==false,tracking:p.tracking!==false,cosmetic:p.cosmetic!==false,popups:p.popups!==false,
  allowlist:(Array.isArray(p.allowlist)?p.allowlist:[]).map(d=>String(d).trim().toLowerCase()).filter(d=>/^(?:[a-z0-9-]+\.)*[a-z0-9-]+$/.test(d)).slice(0,200),custom:String(p.custom||'').slice(0,100000)};}
module.exports={settings};
