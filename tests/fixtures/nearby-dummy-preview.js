// Isolated UI scenario; never copied into the native app. The production UI
// receives real NearbyTable projections through its guest message path. Only
// this private fixture owns the authoritative table, validates each action,
// and drives bots. No game state or testing controls are exported on window.
import {NearbyTable} from '/native/shared/nearby-table.js';
import {createDeal,makeCall} from '/dist/engine.js';

const SOUTH='fixture-south',NORTH='fixture-north';
const params=new URLSearchParams(location.search);
const humanDeclarer=params.get('human')==='1',debug=params.get('debug')==='1';
document.querySelector('#test-scenario-diagnostics').hidden=!debug;
let seed=51973,timer=null,closed=false,ready=false;
const diagnostics={clicks:0,sends:0,last:'loading',lifecycle:'initial'};
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const table=new NearbyTable({
 hostId:SOUTH,hostName:'You',rng:random,
 dealFactory:(board,rng)=>{
  const state=createDeal(board,rng);
  state.dealer=0;state.turn=0;
  ['1N','P','P','P'].forEach(bid=>makeCall(state,bid));
  state.startContract=structuredClone(state.contract);
  return state;
 }
});
if(humanDeclarer){
 table.join(NORTH,'Human partner',0);
 document.querySelector('.test-scenario-label').textContent='TEST SCENARIO · human dummy / human declarer · not iOS networking';
}
table.action(SOUTH,{type:'start',revision:table.revision});
table.step(); // The initial snapshot already contains East’s opening lead.

function diagnose(message){
 if(!debug)return;
 if(message)diagnostics.last=message;
 document.querySelector('#test-scenario-diagnostics').textContent=`rev ${table.revision} · clicks ${diagnostics.clicks} · sends ${diagnostics.sends} · ${diagnostics.lifecycle} · ${diagnostics.last}`;
}
function emit(event){window.bridgeNativeEvent(event);}
function publish(){
 if(closed)return;
 emit({type:'message',payload:{kind:'view',view:table.view(SOUTH)}});
 diagnose();
 schedule();
}
function schedule(){
 clearTimeout(timer);
 if(closed||table.paused||table.state.phase==='complete')return;
 const collecting=table.state.trick.length===4;
 if(!collecting&&table.players[table.controller()])return;
 timer=setTimeout(()=>{
  try{if(table.step())publish();}
  catch(error){emit({type:'error',message:'Scenario paused: '+error.message});}
 },collecting?1250:700);
}
function handle(message){
 if(closed){diagnose('request ignored: scenario ended');return;}
 if(message.type==='ready'){
  ready=true;diagnose('UI ready');
  emit({type:'joined',id:SOUTH});publish();
 }else if(message.type==='send'&&message.payload?.kind==='action'){
  try{table.action(SOUTH,message.payload.action);diagnose('accepted '+message.payload.action.type);}
  catch(error){diagnose('rejected: '+error.message);emit({type:'message',payload:{kind:'error',message:error.message}});}
  publish();
 }else if(message.type==='leave'){
  clearTimeout(timer);closed=true;
  emit({type:'ended',message:'Test scenario ended. Reload this page to reset the deterministic deal.'});
 }
}
window.webkit={messageHandlers:{bridgeRoom:{postMessage(message){
 // Native messages are asynchronous; preserve that ordering so the UI first
 // marks its action pending, then receives the authoritative acknowledgement.
 if(message.type==='send')diagnostics.sends++;
 diagnose('bridge '+message.type);queueMicrotask(()=>handle(message));
}}}};
document.addEventListener('click',event=>{
 const card=event.target.closest?.('[data-card]');
 if(card){diagnostics.clicks++;diagnose(`click ${card.dataset.card}; handler ${typeof card.onclick}; disabled ${card.disabled}`);}
},true);
window.addEventListener('pagehide',()=>{clearTimeout(timer);diagnostics.lifecycle='pagehide';diagnose();});
window.addEventListener('pageshow',event=>{
 diagnostics.lifecycle=event.persisted?'restored':'pageshow';diagnose();
 if(ready&&!closed)publish();
});
window.addEventListener('error',event=>diagnose('JS error: '+event.message));
window.addEventListener('unhandledrejection',event=>diagnose('Promise error: '+String(event.reason)));
await import('/native/web/nearby.js');
