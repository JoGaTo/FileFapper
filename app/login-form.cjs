'use strict';
// Executed in an isolated website world. No bridge exposes vault secrets to pages.
function fillLoginForm(account,automatic=false){
 const result=message=>({filled:false,message});
 if(window.top!==window||location.protocol!=='https:'||location.origin!==account.origin)return result('Open the exact HTTPS site saved for this account.');
 const visible=n=>!n.disabled&&!n.readOnly&&n.type!=='hidden'&&n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden'&&getComputedStyle(n).display!=='none';
 const passwords=[...document.querySelectorAll('input[type="password"]')].filter(visible);
 if(passwords.length!==1||passwords[0].autocomplete==='new-password')return result('Open a sign-in form with one password field. Registration and password-change forms are left untouched.');
 const password=passwords[0],form=password.form||password.closest('form'),container=form||document;
 if(/(?:sign.?up|register|registration|reset.?password|change.?password|create.?account)/i.test((form?.getAttribute('action')||'')+' '+document.title))return result('This is an account registration or password-change form.');
 if(form){let action;try{action=new URL(form.getAttribute('action')||location.href,location.href);}catch{return result('This form has no usable sign-in destination.');}
  if(action.origin!==account.origin||action.protocol!=='https:')return result('This form sends its login to another origin. Fill it manually if you trust that destination.');
  if(form.getAttribute('method')?.toLowerCase()==='get')return result('This sign-in form would put its password in the address. Fill it manually if the site requires it.');}
 const candidates=[...container.querySelectorAll('input')].filter(n=>visible(n)&&['text','email','tel'].includes(n.type));
 const username=candidates.find(n=>n.autocomplete==='username')||candidates.find(n=>/user|email|login|account/i.test(n.name+' '+n.id))||(candidates.length===1?candidates[0]:null);
 if(!username)return result('No username field was found. Open the site’s sign-in form first.');
 if(password.value||(automatic&&username.value&&username.value!==account.username))return result('Your existing form entries were preserved.');
 const set=(input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};
 set(username,account.username);set(password,account.password);
 return {filled:true,message:'Saved login filled. Use the site’s Sign in button; complete any CAPTCHA or two-factor check it requests.'};
}
module.exports={fillLoginForm};
