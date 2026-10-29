'use strict';
// Select mode reserves mouse drags for selection; normal mode keeps drag reordering.
let queueBrush=null,queueIgnoreClick=false;
document.addEventListener('click',event=>{
 if(queueIgnoreClick){event.preventDefault();event.stopImmediatePropagation();queueIgnoreClick=false;return;}
 if(!event.target.closest('[data-queue-selection]'))return;
 selectionMode=!selectionMode;$('#task-list').classList.toggle('selection-mode',selectionMode);
 const button=$('[data-queue-selection]');button.classList.toggle('active',selectionMode);button.setAttribute('aria-pressed',String(selectionMode));button.textContent=selectionMode?'Selecting':'Select';
 $('#queue-selection-help').classList.toggle('hidden',!selectionMode);
},true);
document.addEventListener('dragstart',event=>{if(selectionMode&&event.target.closest('[data-task-row]'))event.preventDefault();},true);
document.addEventListener('pointerdown',event=>{
 if(!selectionMode||event.button!==0||page!=='queue'||event.target.closest('button,input,select,a'))return;
 const row=event.target.closest('[data-task-row]');if(!row)return;
 event.preventDefault();queueBrush={x:event.clientX,y:event.clientY,baseline:new Set(event.ctrlKey||event.metaKey?checked:[]),moved:false,box:null};
});
document.addEventListener('pointermove',event=>{
 const b=queueBrush;if(!b)return;
 if(!b.moved&&Math.hypot(event.clientX-b.x,event.clientY-b.y)<6)return;
 b.moved=true;if(!b.box){b.box=document.createElement('div');b.box.className='selection-marquee';document.body.appendChild(b.box);}
 const left=Math.min(b.x,event.clientX),top=Math.min(b.y,event.clientY),right=Math.max(b.x,event.clientX),bottom=Math.max(b.y,event.clientY);
 Object.assign(b.box.style,{left:left+'px',top:top+'px',width:right-left+'px',height:bottom-top+'px'});
 checked=new Set(b.baseline);
 for(const row of $$('[data-task-row]')){const r=row.getBoundingClientRect();if(r.right>=left&&r.left<=right&&r.bottom>=top&&r.top<=bottom)checked.add(row.dataset.taskRow);}
 if(event.clientY>innerHeight-85)$('#main').scrollBy(0,12);else if(event.clientY<120)$('#main').scrollBy(0,-12);
 renderQueue();
});
function finishQueueBrush(){if(!queueBrush)return;queueBrush.box?.remove();if(queueBrush.moved){queueIgnoreClick=true;setTimeout(()=>{queueIgnoreClick=false;},0);}queueBrush=null;}
document.addEventListener('pointerup',finishQueueBrush);document.addEventListener('pointercancel',finishQueueBrush);
