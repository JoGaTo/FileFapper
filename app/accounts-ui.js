'use strict';
function renderAccounts(){
 const options=$('#account-site-options');if(!options.children.length)options.innerHTML=sites.map(s=>`<option value="${esc(s.root)}">${esc(s.name)}</option>`).join('');
 $('#account-error').textContent=state.accountError||'';
 patchHtml($('#account-list'),(state.accountSummary||[]).map(a=>`<div class="account-row" data-account-row="${esc(a.id)}"><strong>${esc(a.origin)}</strong><p>${esc(a.username)}</p><label class="account-check"><input type="checkbox" data-account-autofill="${esc(a.id)}" ${a.autoFill?'checked':''}> Fill sign-in form automatically</label><div class="tool-actions"><button class="button" type="button" data-account="${esc(a.id)}" data-account-action="open">Open sign-in page</button><button class="button" type="button" data-account="${esc(a.id)}" data-account-action="fill">Fill current tab</button><button class="icon-button" type="button" data-account="${esc(a.id)}" data-account-action="remove" aria-label="Remove saved login for ${esc(a.origin)}">${icon('trash')}</button></div></div>`).join('')||'<p>No saved logins yet. You can also keep using imported cookies without saving a password.</p>');
}
$('#account-form').addEventListener('submit',async e=>{
 e.preventDefault();const button=e.submitter;button.disabled=true;
 try{await call('accounts-save',{loginUrl:$('#account-url').value,username:$('#account-username').value,password:$('#account-password').value,autoFill:$('#account-autofill').checked});$('#account-password').value='';toast('Site login saved with Windows encryption.');}catch{}finally{button.disabled=false;}
});
document.addEventListener('change',async e=>{if(e.target.dataset.accountAutofill)try{await call('accounts-action','autofill',e.target.dataset.accountAutofill,e.target.checked);}catch{renderAccounts();}});
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-account],[data-account-import]');if(!b)return;
 try{if(b.hasAttribute('data-account-import')){const result=await call('accounts-import');if(result)toast(`${result.count} site logins imported and encrypted.`);return;}
  const result=await call('accounts-action',b.dataset.accountAction,b.dataset.account);
  if(b.dataset.accountAction==='fill'){toast(result.message);if(result.filled)setPage('browser');}
 }catch{}
});
