// A hold inspects a bid; only a fresh, short click commits it.
export function bindBidPreview(button,{onBid,onPreview,delay=550}){
 let timer=null,press=null,suppressClick=false;
 const listeners=[];
 const listen=(target,type,handler,capture=false)=>{target.addEventListener(type,handler,capture);listeners.push(()=>target.removeEventListener(type,handler,capture));};
 const clear=()=>{clearTimeout(timer);timer=null;press=null;};
 const available=()=>button.isConnected&&!button.disabled;
 const cancel=()=>{if(press)suppressClick=true;clear();};
 const preview=()=>{
  if(!available()){clear();return;}
  suppressClick=true;clear();onPreview();
 };
 listen(button,'pointerdown',event=>{
  if(event.button!==0||event.isPrimary===false||!available())return;
  clear();suppressClick=false;
  press={id:event.pointerId,x:event.clientX,y:event.clientY};
  timer=setTimeout(preview,delay);
 });
 listen(button,'pointermove',event=>{
  if(press&&event.pointerId===press.id&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>10)cancel();
 });
 listen(button,'pointerup',event=>{if(press&&event.pointerId===press.id)clear();});
 listen(button,'pointercancel',cancel);
 listen(button,'pointerleave',cancel);
 listen(button,'blur',cancel);
 listen(button.ownerDocument.defaultView,'blur',cancel);
 listen(button.ownerDocument,'visibilitychange',()=>{if(button.ownerDocument.hidden)cancel();});
 // Opening a modal can retarget the release click to its backdrop. Consume that
 // same gesture there too, but always allow the next fresh pointer/key action.
 listen(button.ownerDocument,'pointerdown',()=>{suppressClick=false;},true);
 listen(button.ownerDocument,'keydown',event=>{if(event.key==='Enter'||event.key===' ')suppressClick=false;},true);
 listen(button.ownerDocument,'click',event=>{
  if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}
 },true);
 listen(button,'click',event=>{
  clear();
  if(suppressClick){event.preventDefault();event.stopPropagation();suppressClick=false;return;}
  if(available())onBid();
 });
 // Suppress mobile text/callout menus; right-click and Shift+F10 also inspect.
 listen(button,'contextmenu',event=>{event.preventDefault();if(!suppressClick)preview();});
 listen(button,'keydown',event=>{
  if(event.key==='F1'||event.key==='F10'&&event.shiftKey){event.preventDefault();preview();}
 });
 return ()=>{clear();listeners.forEach(remove=>remove());};
}
