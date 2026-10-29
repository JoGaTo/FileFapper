'use strict';
function editItems(params={}){const f=params.editFlags||{};return [
 {role:'undo',label:'Undo',enabled:!!f.canUndo},{role:'redo',label:'Redo',enabled:!!f.canRedo},{type:'separator'},
 {role:'cut',label:'Cut',enabled:!!f.canCut},{role:'copy',label:'Copy',enabled:!!f.canCopy},
 {role:'paste',label:'Paste',enabled:!!f.canPaste},{role:'delete',label:'Delete',enabled:!!f.canDelete},
 {type:'separator'},{role:'selectAll',label:'Select all',enabled:f.canSelectAll!==false}];}
function addressUrl(value){const text=String(value||'').trim();if(!text)throw new Error('Enter an address or search words.');
 const core=require('./core.cjs');if(/^https?:\/\//i.test(text)){const url=core.validUrl(text,false);if(!url)throw new Error('Invalid address.');return url;}
 if(/^[a-z][a-z0-9+.-]*:/i.test(text)&&!/^localhost:\d+/i.test(text))throw new Error('Use an HTTP or HTTPS address.');
 if(!/\s/.test(text)&&(/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(text)||/^(?:localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?:[/?#]|$)/i.test(text))){const url=core.validUrl((/^localhost(?::|\/|$)/i.test(text)?'http://':'https://')+text,false);if(url)return url;}
 return 'https://duckduckgo.com/?q='+encodeURIComponent(text);
}
module.exports={editItems,addressUrl};
