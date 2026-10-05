import test from 'node:test';
import assert from 'node:assert/strict';
import {bindBidPreview} from '../dist/bid-preview.js';

function setup(t){
 t.mock.timers.enable({apis:['setTimeout']});
 const document=new EventTarget();document.defaultView=new EventTarget();document.hidden=false;
 const button=new EventTarget();Object.assign(button,{ownerDocument:document,disabled:false,isConnected:true});
 const calls={bids:0,previews:0};
 const event=(type,props={})=>Object.assign(new Event(type,{cancelable:true}),{pointerId:1,button:0,isPrimary:true,clientX:20,clientY:20,...props});
 const fire=(type,props={})=>{
  const e=event(type,props);document.dispatchEvent(e);
  if(!e.defaultPrevented)button.dispatchEvent(e);
  return e;
 };
 const release=bindBidPreview(button,{onBid:()=>calls.bids++,onPreview:()=>{calls.previews++;fire('blur');}});
 t.after(release);
 return {button,document,calls,fire,event,release,tick:ms=>t.mock.timers.tick(ms)};
}

test('short taps bid once and do not leave an explanation timer',t=>{
 const h=setup(t);h.fire('pointerdown');h.tick(300);h.fire('pointerup');h.fire('click');h.tick(1000);
 assert.deepEqual(h.calls,{bids:1,previews:0});
});
for(const pointerType of ['mouse','touch'])test(`${pointerType} hold previews without bidding on release, and a fresh tap still bids`,t=>{
 const h=setup(t);h.fire('pointerdown',{pointerType});h.tick(550);
 assert.deepEqual(h.calls,{bids:0,previews:1});h.fire('pointerup');assert(h.fire('click').defaultPrevented);
 assert.deepEqual(h.calls,{bids:0,previews:1});
 h.fire('pointerdown',{pointerType});h.fire('pointerup');h.fire('click');
 assert.deepEqual(h.calls,{bids:1,previews:1});
});
test('the release click is swallowed even when the modal retargets it to its backdrop',t=>{
 const h=setup(t);h.fire('pointerdown');h.tick(550);
 const backdropClick=h.event('click');h.document.dispatchEvent(backdropClick);assert(backdropClick.defaultPrevented);
 const nextDown=h.event('pointerdown');h.document.dispatchEvent(nextDown);
 const closeClick=h.event('click');h.document.dispatchEvent(closeClick);assert(!closeClick.defaultPrevented);
 assert.deepEqual(h.calls,{bids:0,previews:1});
});
test('a fresh dialog click is allowed when the browser emits no release click after a hold',t=>{
 const h=setup(t);h.fire('pointerdown');h.tick(550);h.document.dispatchEvent(h.event('pointerdown'));
 const click=h.event('click');h.document.dispatchEvent(click);assert(!click.defaultPrevented);
 assert.equal(h.calls.bids,0);
});
test('scrolling, leaving, cancellation and loss of focus never turn a hold into a bid',t=>{
 const h=setup(t);
 for(const type of ['pointermove','pointerleave','pointercancel','blur']){
  h.fire('pointerdown');h.tick(200);h.fire(type,{clientX:45});h.tick(600);h.fire('pointerup');h.fire('click');
 }
 assert.deepEqual(h.calls,{bids:0,previews:0});
});
test('native long-touch context menus inspect once and never bid',t=>{
 const h=setup(t);h.fire('pointerdown');h.tick(400);assert(h.fire('contextmenu').defaultPrevented);h.tick(500);
 h.fire('contextmenu');h.fire('pointerup');h.fire('click');assert.deepEqual(h.calls,{bids:0,previews:1});
});
test('keyboard inspection preserves ordinary Enter and Space activation',t=>{
 const h=setup(t);
 for(const key of ['F1','F10']){
  assert(h.fire('keydown',{key,shiftKey:true}).defaultPrevented);
  h.fire('keydown',{key:'Enter'});h.fire('click',{detail:0});
 }
 h.fire('keydown',{key:' '});h.fire('click',{detail:0});
 assert.deepEqual(h.calls,{bids:3,previews:2});
});
test('disabled buttons and a replaced control cannot open stale bid explanations',t=>{
 const h=setup(t);h.button.disabled=true;h.fire('pointerdown');h.tick(600);h.fire('click');
 h.button.disabled=false;h.fire('pointerdown');h.button.isConnected=false;h.tick(600);
 h.button.isConnected=true;h.fire('pointerdown');h.release();h.tick(600);h.fire('click');
 assert.deepEqual(h.calls,{bids:0,previews:0});
});
