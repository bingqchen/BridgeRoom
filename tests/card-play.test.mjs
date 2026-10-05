import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {sampleDeals} from '../dist/card-play.js';
import {activeSeat} from '../dist/turn-state.js';
const rngFor=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const card=(suit,rank)=>({suit,rank,id:suit+rank});
function position(seed=87){const s=E.createDeal(1,rngFor(seed));['1N','P','3N','P','P','P'].forEach(b=>E.makeCall(s,b));return s;}
function advance(s,n){for(let i=0;i<n;i++){if(s.trick.length===4)E.collectTrick(s);E.playCard(s,E.legalCards(s.hands[s.turn],s.trick)[0].id);}if(s.trick.length===4)E.collectTrick(s);return s;}

test('sampler keeps exact hand sizes, known cards, played cards and all observed voids',()=>{
 const s=advance(position(),31),view=E.playView(s),before=structuredClone(s),worlds=sampleDeals(view,{samples:64});
 const played=[...s.history.flatMap(t=>t.cards),...s.trick],seen=new Set(played.map(x=>x.card.id));
 const voids=[];for(const trick of [...s.history.map(t=>t.cards),s.trick])for(const x of trick)if(x.card.suit!==trick[0].card.suit)voids.push([x.seat,trick[0].card.suit]);
 assert(voids.length>0);
 for(const world of worlds){
  assert.deepEqual(world.map(h=>h.length),s.hands.map(h=>h.length));
  assert.equal(new Set(world.flat().map(c=>c.id)).size,52-seen.size);
  assert(world.flat().every(c=>!seen.has(c.id)));
  for(const [seat,hand] of Object.entries(view.knownHands))assert.deepEqual(world[seat],hand);
  for(const [seat,suit] of voids)assert(world[seat].every(c=>c.suit!==suit));
 }
 assert.deepEqual(s,before);
});

test('auction information weights likely deals without treating artificial suits as natural',()=>{
 const s=position(),view=E.playView(s);view.auction=[];
 const prior=sampleDeals(view,{samples:128,rng:rngFor(712)});
 view.auction=[{seat:0,bid:'1N',kind:'nt-open',min:15,max:17},{seat:2,bid:'2D',artificial:true,lengths:{H:5}}];
 const informed=sampleDeals(view,{samples:128,rng:rngFor(712)});
 const avg=(worlds,fn)=>worlds.reduce((n,w)=>n+fn(w),0)/worlds.length;
 assert(avg(informed,w=>E.hcp(w[0]))>avg(prior,w=>E.hcp(w[0]))+2);
 assert(avg(informed,w=>E.shape(w[2]).H)>avg(prior,w=>E.shape(w[2]).H)+.6);
 assert(avg(informed,w=>E.shape(w[2]).H)>avg(informed,w=>E.shape(w[2]).D));
});

test('bots and advice cannot distinguish actual concealed allocations',()=>{
 const s=advance(position(42),4);s.turn=3;
 const before=E.playView(s),decision=E.botAnalysis(s);
 // West defends: only West and the exposed South dummy are known.
 assert.deepEqual(Object.keys(before.knownHands),['2','3']);
 const swapped=structuredClone(s);[swapped.hands[0],swapped.hands[1]]=[swapped.hands[1],swapped.hands[0]];
 swapped.originalHands=swapped.originalHands.map(h=>h.slice().reverse());
 assert.deepEqual(E.playView(swapped),before);
 assert.deepEqual(E.botAnalysis(swapped),decision);
 assert.deepEqual(E.botAnalysis(s),decision);
});

test('declarer controls dummy with both hands, but opening leader cannot see dummy',()=>{
 const s=position();assert.deepEqual(Object.keys(E.playView(s).knownHands),['1']);
 advance(s,1);assert.equal(s.turn,s.contract.dummy);
 assert.deepEqual(Object.keys(E.playView(s).knownHands),['0','2']);
 s.turn=0;assert.deepEqual(Object.keys(E.playView(s).knownHands),['0','2']);
 s.turn=3;assert.deepEqual(Object.keys(E.playView(s).knownHands),['2','3']);
});

// Synthetic public history supplies the other 44 cards so these two-trick
// endings isolate search decisions; all four remaining hands are known here.
function ending(hands,trick=[],seat=0){
 const used=new Set([...hands.flat(),...trick.map(x=>x.card)].map(c=>c.id));
 const rest=E.createDeal(1,rngFor(1)).hands.flat().filter(c=>!used.has(c.id));
 const historical=[0,1,2,3].map(s=>rest.splice(0,13-hands[s].length-trick.filter(x=>x.seat===s).length));
 const history=Array.from({length:historical[0].length},(_,i)=>({winner:0,cards:historical.map((h,seat)=>({seat,card:h[i]}))}));
 return {hand:hands[seat],knownHands:Object.fromEntries(hands.map((h,s)=>[s,h])),seat,trick,history,auction:[],contract:{level:7,suit:'N',declarer:0,dummy:2,doubled:1},vulnerable:false};
}
test('search selects a finesse entry that makes the contract instead of a losing side-suit lead',()=>{
 const view=ending([[card('S',2),card('H',2)],[card('S',13),card('S',3)],[card('S',14),card('S',12)],[card('S',4),card('H',3)]]);
 const advice=E.analyzePlay(view);assert.equal(advice.card.id,'S2');
 assert.equal(advice.options[0].makeProbability,1);assert.equal(advice.options[1].makeProbability,0);
 assert.equal(advice.options[0].expectedTricks,13);
});
test('third hand protects partner from fourth hand instead of automatically playing low',()=>{
 const view=ending([[card('C',2)],[card('H',2)],[card('S',14),card('S',12)],[card('S',13),card('H',3)]],[{seat:0,card:card('S',9)},{seat:1,card:card('S',2)}],2);
 const advice=E.analyzePlay(view);assert.equal(advice.card.id,'S14');assert.equal(advice.options[0].makeProbability,1);assert.equal(advice.options[1].makeProbability,0);
});
test('analysis stays legal, finite and does not mutate the table',()=>{
 const s=advance(position(17),18),before=structuredClone(s),a=E.botAnalysis(s);
 assert(E.legalCards(s.hands[s.turn],s.trick).some(c=>c.id===a.card.id));
 for(const x of a.options){assert(Number.isFinite(x.expectedScore));assert(x.makeProbability>=0&&x.makeProbability<=1);assert(x.expectedTricks>=0&&x.expectedTricks<=13);}
 assert.deepEqual(s,before);
});
test('turn highlighting follows bidding/play and stops during trick collection and results',()=>{
 const s=E.createDeal();assert.equal(activeSeat(s),0);E.makeCall(s,'1N');assert.equal(activeSeat(s),1);
 s.phase='play';s.trick=[1,2,3];s.turn=3;assert.equal(activeSeat(s),3);
 s.trick.push(4);s.turn=2;assert.equal(activeSeat(s),null);
 s.trick=[];assert.equal(activeSeat(s),2);s.phase='complete';assert.equal(activeSeat(s),null);
});
