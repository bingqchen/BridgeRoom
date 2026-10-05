import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {leadFromHolding,isOpeningLead,shownSuits,openingLeadPlan,ruleOfEleven,openingLeadLogWeight} from '../dist/opening-leads.js';
const card=(suit,rank)=>({suit,rank,id:suit+rank});
const holding=(ranks,suit='S')=>ranks.split('').map(r=>card(suit,Number({A:14,K:13,Q:12,J:11,T:10}[r]||r)));
const hand=spec=>Object.entries(spec).flatMap(([s,r])=>holding(r,s));
const view=(spec,trump='N',auction=[])=>({hand:hand(spec),seat:1,contract:{level:3,suit:trump,declarer:0,dummy:2,doubled:1},history:[],trick:[],auction});
const ids=plan=>plan.candidates.map(o=>o.card.id).sort();

test('honor runs, partial runs and ace-king follow the guide in NT and suit contracts',()=>{
 for(const [ranks,nt,suit] of [['AKQ2',14,14],['KQJ3',13,13],['QJT4',12,12],['JT93',11,11],['AK32',13,14],['AK3',13,14],['KQ83',13,13],['QJ82',12,12],['AK',14,14]]){
  assert.equal(leadFromHolding(holding(ranks),'N').card.rank,nt,ranks+' NT');
  assert.equal(leadFromHolding(holding(ranks),'H').card.rank,suit,ranks+' suit');
 }
});
test('fourth-best, doubletons, singletons and three small cards choose the agreed spot',()=>{
 for(const [ranks,rank,method] of [['AJ862',6,'fourth-best'],['K862',2,'fourth-best'],['Q9742',4,'fourth-best'],['98642',4,'fourth-best'],['963',6,'mud'],['K73',3,'low-from-honor'],['J4',11,'doubleton'],['82',8,'doubleton'],['7',7,'singleton']]){
  const h=holding(ranks),before=structuredClone(h),lead=leadFromHolding(h);
  assert.equal(lead.card.rank,rank,ranks);assert.equal(lead.method,method);assert.deepEqual(h,before);
 }
 assert.equal(leadFromHolding([]),null);
 for(const ranks of ['AJ862','A842','A2']){const lead=leadFromHolding(holding(ranks),'H');assert.equal(lead.card.rank,14);assert.equal(lead.riskyAce,true);}
 assert.equal(leadFromHolding(holding('A842'),'S').riskyAce,undefined);
});
test('opening-lead policy only applies before the first card, for the opening defender',()=>{
 const v=view({S:'KJ864',H:'Q73',D:'952',C:'84'});assert(isOpeningLead(v));
 assert.equal(openingLeadPlan({...v,seat:0}),null);
 assert.equal(openingLeadPlan({...v,trick:[{seat:1,card:card('S',6)}]}),null);
 assert.equal(openingLeadPlan({...v,history:[{cards:[],winner:1}]}),null);
 assert.equal(openingLeadPlan({...v,hand:v.hand.slice(1)}),null);
});
test('notrump develops the longest unbid suit, leading fourth best or a sequence',()=>{
 const spec={S:'KJ864',H:'Q73',D:'952',C:'84'};
 assert.deepEqual(ids(openingLeadPlan(view(spec))),['S6']);
 assert.deepEqual(ids(openingLeadPlan(view({...spec,S:'KQJ64'}))),['S13']);
 const p=openingLeadPlan(view(spec,'N',[{seat:0,bid:'1S',lengths:{S:5}}]));
 assert(!p.candidates.some(o=>o.card.suit==='S'));assert.deepEqual(ids(p),['D5','H3']);
});
test('natural partner overcalls and takeout doubles guide the actual supported suits',()=>{
 const spec={S:'KJ864',H:'Q73',D:'952',C:'84'};
 assert.deepEqual(ids(openingLeadPlan(view(spec,'N',[{seat:3,bid:'2D',kind:'overcall',lengths:{D:5}}]))),['D5']);
 const p=openingLeadPlan(view(spec,'N',[{seat:0,bid:'1H',lengths:{H:5}},{seat:3,bid:'X',kind:'takeout'}]));
 assert.deepEqual(new Set(p.candidates.map(o=>o.card.suit)),new Set(['C','D','S']));
});
test('auction interpretation excludes artificial denominations, forced responses and control bids',()=>{
 assert.deepEqual([...shownSuits({bid:'2D',kind:'transfer',artificial:true,target:'H',lengths:{H:5}})],['H']);
 assert.deepEqual([...shownSuits({bid:'3S',kind:'smolen',artificial:true,target:'H',lengths:{S:4,H:5}})],['S','H']);
 for(const call of [
  {bid:'2D',kind:'waiting',artificial:true},{bid:'2C',kind:'strong-open',artificial:true},
  {bid:'2D',kind:'stayman-answer',lengths:{}},{bid:'2H',kind:'transfer-accept',target:'H'},
  {bid:'XX',kind:'nt-runout',artificial:true,target:'C'},{bid:'2N',kind:'weak-two-ask',artificial:true,target:'H'},
  {bid:'4C',kind:'control-bid',controlSuit:'C'},{bid:'3D',kind:'weak-two-answer',target:'H',featureSuit:'D'}
 ])assert.deepEqual([...shownSuits(call)],[],call.kind);
 assert.deepEqual([...shownSuits({bid:'4D',kind:'splinter',artificial:true,shortSuit:'D',lengths:{S:4}})],['S']);
 const p=openingLeadPlan(view({S:'KJ864',H:'Q73',D:'952',C:'84'},'N',[{seat:3,bid:'2D',kind:'transfer',artificial:true,target:'H',lengths:{H:5}}]));
 assert.deepEqual(ids(p),['H3']);
 // Use actual engine meanings as well as isolated metadata.
 const s=E.createDeal();for(const b of ['1N','P','2C','P','2D'])E.makeCall(s,b);
 assert.deepEqual([...shownSuits(s.auction.at(-1))],[]);
});
test('against trumps, prefer sequences and ruffing prospects over an unsupported ace',()=>{
 const p=openingLeadPlan(view({S:'KJ86',H:'742',D:'KQ32',C:'A8'},'H'));
 assert.deepEqual(ids(p),['D13']);assert(p.options.find(o=>o.card.suit==='C').riskyAce);
 const spec={S:'AJ86',H:'742',D:'3',C:'K9852'};
 assert.deepEqual(ids(openingLeadPlan(view(spec,'H'))),['D3']);
 const noEntry=openingLeadPlan(view({...spec,S:'QJ86'},'H'));
 assert.equal(noEntry.options.find(o=>o.card.suit==='D').priority,1);
 const noTrumps=openingLeadPlan(view({S:'AJ864',D:'3',C:'K985432'},'H'));
 assert.equal(noTrumps.options.find(o=>o.card.suit==='D').priority,1);
 const partner=openingLeadPlan(view(spec,'H',[{seat:3,bid:'1S',lengths:{S:5}}]));
 assert(partner.candidates.some(o=>o.card.id==='S14'));
});
test('dummy shortness encourages a trump lead unless it jeopardizes an unsupported honor',()=>{
 const auction=[{seat:2,bid:'4D',kind:'splinter',artificial:true,shortSuit:'D',lengths:{H:4}}];
 const spec={S:'K864',H:'742',D:'Q83',C:'952'};
 assert.deepEqual(ids(openingLeadPlan(view(spec,'H',auction))),['H2']);
 const guarded=openingLeadPlan(view({...spec,H:'K42'},'H',auction));
 assert(guarded.candidates.every(o=>o.card.suit!=='H'));
});
test('Rule of 11 is conditional, and lead inference remains soft for nonstandard human leads',()=>{
 assert.deepEqual(ruleOfEleven(card('S',7),holding('AQJ8')), {outsideLeader:4,unseenHigher:0});
 assert.equal(ruleOfEleven(card('S',13)),null);
 assert.equal(ruleOfEleven(card('S',7),holding('AKQJ8')),null);
 const first={seat:1,card:card('S',6)};
 assert.equal(openingLeadLogWeight(first,holding('KJ864'),'N'),0);
 const different=openingLeadLogWeight(first,holding('KJ986'),'N');
 assert(different<0&&Number.isFinite(different));assert(Math.exp(different)>0);
});

function openingPosition(){
 const s=E.createDeal(1),leader=hand({S:'KJ864',H:'Q73',D:'952',C:'84'}),ids=new Set(leader.map(c=>c.id));
 const rest=s.hands.flat().filter(c=>!ids.has(c.id));s.hands=[rest.slice(0,13),leader,rest.slice(13,26),rest.slice(26)];
 s.originalHands=structuredClone(s.hands);for(const b of ['1N','P','3N','P','P','P'])E.makeCall(s,b);return s;
}
test('bots and hints use the same conventional lead and cannot see the actual hidden allocation',()=>{
 const s=openingPosition(),before=structuredClone(s),v=E.playView(s),advice=E.botAnalysis(s);
 assert.deepEqual(Object.keys(v.knownHands),['1']);assert.equal(advice.card.id,'S6');
 assert.equal(E.botCard(s).id,advice.card.id);assert.equal(E.chooseCard(v).id,advice.card.id);
 assert.equal(advice.openingLead.method,'fourth-best');assert.equal(advice.openingLead.ruleOfEleven.outsideLeader,5);
 assert(advice.samples>0);assert(advice.options.every(o=>Number.isFinite(o.expectedScore)));
 const swapped=structuredClone(s);[swapped.hands[0],swapped.hands[2]]=[swapped.hands[2],swapped.hands[0]];
 Object.defineProperty(swapped,'originalHands',{get(){throw Error('Hidden original deal was accessed');}});
 assert.deepEqual(E.botAnalysis(swapped),advice);assert.deepEqual(s,before);
 s.hands[1]=hand({S:'KQJ64',H:'Q73',D:'952',C:'84'});
 // These views do not expose other seats, so only known hand validity matters.
 const sequence=E.botAnalysis(s);assert.equal(sequence.card.id,'S13');assert.equal(sequence.openingLead.ruleOfEleven,null);
 s.contract.suit='H';assert.equal(E.botAnalysis(s).openingLead.ruleOfEleven,null);
});
