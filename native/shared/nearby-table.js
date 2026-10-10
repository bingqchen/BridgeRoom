import {createDeal,makeCall,playCard,collectTrick,botBid,botCard,legalCalls,legalCards} from '../../dist/engine.js';
import {replayDeal} from '../../dist/session.js';

const copy=value=>structuredClone(value);
const cleanName=value=>String(value||'Player').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,28)||'Player';

// Runs only on the hosting device. Never send this instance or state over the wire.
export class NearbyTable {
 constructor({hostId,hostName='Host',rng=Math.random,dealFactory=createDeal}={}){
  if(typeof hostId!=='string'||!hostId.length)throw Error('A host identity is required.');
  this.hostId=hostId;this.rng=rng;this.dealFactory=dealFactory;
  this.players=[null,null,{id:hostId,name:cleanName(hostName),connected:true},null];
  this.state=null;this.revision=0;this.active=true;this.totals=[0,0];this.scoredState=null;this.score=0;this.replaced=new Set();
 }
 get started(){return this.state!==null;}
 get paused(){return !this.active||this.players.some(p=>p&&!p.connected);}
 seatFor(id){return this.players.findIndex(p=>p?.id===id);}
 requirePlayer(id){const seat=this.seatFor(id);if(seat<0)throw Error('You do not have a seat at this table.');return seat;}
 join(id,name){
  if(typeof id!=='string'||!id.length||id.length>128)throw Error('Invalid player identity.');
  if(this.replaced.has(id))throw Error('Your seat was replaced by a bot. Join a new table to play again.');
  const existing=this.seatFor(id);
  if(existing>=0){this.setConnected(id,true);return existing;}
  if(this.started)throw Error('This table has started. Only returning players can reconnect.');
  const seat=this.players.findIndex(p=>!p);if(seat<0)throw Error('This table is full.');
  this.players[seat]={id,name:cleanName(name),connected:true};this.revision++;return seat;
 }
 setConnected(id,connected){
  const seat=this.requirePlayer(id);if(this.players[seat].connected===Boolean(connected))return;
  this.players[seat].connected=Boolean(connected);this.revision++;
 }
 setActive(active){if(this.active!==Boolean(active)){this.active=Boolean(active);this.revision++;}}
 controller(){
  const s=this.state;if(!s||s.phase==='complete'||s.trick.length===4)return null;
  return s.phase==='play'&&s.turn===s.contract.dummy?s.contract.declarer:s.turn;
 }
 recordScore(){
  if(this.state?.phase!=='complete'||this.scoredState===this.state)return;
  this.score=this.state.result.nsScore??0;this.totals[0]+=this.score;this.totals[1]-=this.score;this.scoredState=this.state;
 }
 action(id,action){
  const seat=this.requirePlayer(id);
  if(!action||typeof action!=='object'||Array.isArray(action))throw Error('Invalid table action.');
  if(action.revision!==this.revision)throw Error('The table changed. Try again with the latest position.');
  const host=id===this.hostId;
  if(['start','next','replay','replace'].includes(action.type)&&!host)throw Error('Only the host can do that.');
  switch(action.type){
   case 'seat': {
    if(this.started)throw Error('Seats cannot change during play.');
    const target=action.seat;if(!Number.isInteger(target)||target<0||target>3)throw Error('Choose a valid seat.');
    if(this.players[target]&&target!==seat)throw Error('That seat is occupied.');
    if(target!==seat){this.players[target]=this.players[seat];this.players[seat]=null;}
    break;
   }
   case 'start':
    if(this.started)throw Error('The table has already started.');
    if(this.paused)throw Error('Wait for all players to reconnect.');
    this.state=this.dealFactory(1,this.rng);break;
   case 'replace': {
    const target=action.seat,p=this.players[target];
    if(!Number.isInteger(target)||target<0||target>3||!p||p.id===this.hostId||p.connected)throw Error('Only a disconnected guest can be replaced.');
    this.replaced.add(p.id);this.players[target]=null;break;
   }
   case 'next':
   case 'replay':
    if(this.state?.phase!=='complete')throw Error('Finish the current board first.');
    if(this.paused)throw Error('Wait for all players to reconnect.');
    if(action.type==='replay'){
     if(this.scoredState===this.state){this.totals[0]-=this.score;this.totals[1]+=this.score;}
     this.state=replayDeal(this.state);
    }else this.state=this.dealFactory(this.state.board+1,this.rng);
    this.scoredState=null;this.score=0;break;
   case 'bid':
   case 'play':
    if(!this.started||this.paused||!this.players[seat].connected)throw Error('The table is paused.');
    if(this.controller()!==seat)throw Error('It is not your turn. Declarer plays dummy.');
    if(action.type==='bid')makeCall(this.state,action.bid);
    else playCard(this.state,action.cardId);
    break;
   default:throw Error('Unknown table action.');
  }
  this.revision++;this.recordScore();return this.view(id);
 }
 step(){
  if(!this.started||this.paused||this.state.phase==='complete')return false;
  if(this.state.trick.length===4)collectTrick(this.state);
  else {
   if(this.players[this.controller()])return false;
   if(this.state.phase==='bidding')makeCall(this.state,botBid(this.state).bid);
   else playCard(this.state,botCard(this.state).id);
  }
  this.revision++;this.recordScore();return true;
 }
 view(id){
  const you=this.requirePlayer(id),s=this.state,controller=this.controller();
  let state=null;
  if(s){
   const complete=s.phase==='complete';
   state={board:s.board,dealer:s.dealer,vulnerable:s.vulnerable,phase:s.phase,turn:s.turn,
    contract:s.contract,trick:s.trick,history:s.history,auction:s.auction,tricks:s.tricks,
    dummyExposed:s.dummyExposed,result:s.result,counts:s.hands.map(h=>h.length),
    hands:s.hands.map((h,seat)=>complete||seat===you||s.dummyExposed&&seat===s.contract?.dummy?h:null),
    ...(complete?{originalHands:s.originalHands}:{})};
  }
  const canAct=s&&!this.paused&&controller===you;
  return copy({protocol:1,revision:this.revision,you,host:id===this.hostId,started:this.started,paused:this.paused,
   players:this.players.map((p,seat)=>({seat,name:p?.name||'Bot',bot:!p,connected:p?.connected??true})),
   state,controller,totals:this.totals,
   legalCalls:canAct&&s.phase==='bidding'?legalCalls(s.auction,s.turn):[],
   legalCards:canAct&&s.phase==='play'?legalCards(s.hands[s.turn],s.trick).map(c=>c.id):[]});
 }
}
