'use strict';
function day(value){const match=String(value||'').match(/^(\d{4}-\d{2}-\d{2})(?:$|[ T])/);if(!match)return '';const date=new Date(match[1]+'T00:00:00Z');return Number.isFinite(+date)&&date.toISOString().slice(0,10)===match[1]?match[1]:'';}
function range(p={}){const dateFrom=String(p.dateFrom||''),dateTo=String(p.dateTo||'');if((dateFrom&&day(dateFrom)!==dateFrom)||(dateTo&&day(dateTo)!==dateTo))throw new Error('Use valid dates in YYYY-MM-DD format.');if(dateFrom&&dateTo&&dateFrom>dateTo)throw new Error('The start date must be on or before the end date.');return {dateFrom,dateTo};}
function includes(value,p={}){const d=day(value);return !p.dateFrom&&!p.dateTo||!!d&&(!p.dateFrom||d>=p.dateFrom)&&(!p.dateTo||d<=p.dateTo);}
module.exports={day,range,includes};
