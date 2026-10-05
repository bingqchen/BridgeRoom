import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {defensePlan,signalForSuit,signalObservations,signalLogWeight,selectDefensiveOption,publicTricks} from '../dist/defense.js';
import {openingLeadPlan} from '../dist/opening-leads.js';
const card=(suit,rank)=>({suit,rank,id:suit+rank});
const ranks=(text,suit='C')=>[...text].map(r=>card(suit,Number({A:14,K:13,Q:12,J:11,T:10}[r]||r)));
const hand=spec=>Object.entries(spec).flatMap(([s,r])=>ranks(r,s));
const contract={level:4,suit:'S',declarer:2,dummy:0,doubled:1};
const c=(seat,rank,suit='C')=>({seat,card:card(suit,rank)});
const view=(holding,dummy,trick,seat=1,suit='S')=>({hand:ranks(holding),seat,contract:{...contract,suit},knownHands:{[seat]:ranks(holding),0:ranks(dummy)},trick,history:[],auction:[]});
const preferred=v=>[...defensePlan(v).preferences].sort((a,b)=>b[1].priority-a[1].priority)[0];

test('attitude and discard signals use relative spots and preserve honors',()=>{
 assert.equal(signalForSuit(ranks('Q32'),[c(3,14),c(0,6)],1,contract,'C').card.id,'C3');
 assert.equal(signalForSuit(ranks('J97'),[c(3,14),c(0,6)],1,contract,'C').card.id,'C7');
 assert.equal(signalForSuit(ranks('KQ982'),[c(2,14,'H')],3,contract,'C').card.id,'C9');
 assert.equal(signalForSuit(ranks('T873'),[c(2,14,'H')],3,contract,'C').card.id,'C3');
 assert.equal(signalForSuit(ranks('Q2'),[c(3,14)],1,contract,'C'),null);
 assert.equal(signalForSuit(ranks('873','S'),[c(2,14,'S')],3,contract,'S'),null);
 assert.equal(signalForSuit(hand({C:'KQ982',H:'2'}),[c(2,14,'H')],3,contract,'C'),null);
});
test('count signals distinguish odd and even without replacing an honor that may win',()=>{
 assert.equal(signalForSuit(ranks('873'),[c(2,13)],3,contract,'C').card.id,'C3');
 assert.equal(signalForSuit(ranks('8732'),[c(2,13)],3,contract,'C').card.id,'C8');
 assert.equal(signalForSuit(ranks('A73'),[c(2,13)],3,contract,'C'),null);
});
test('third hand forces honors with lowest equals and finesses against dummy',()=>{
 assert.equal(preferred(view('KT85','74',[c(3,3),c(0,2)]))[0],'C13');
 assert.equal(preferred(view('KQ63','94',[c(3,2),c(0,5)]))[0],'C12');
 assert.equal(preferred(view('QJ5','94',[c(3,2),c(0,6)]))[0],'C11');
 assert.equal(preferred(view('KT3','Q7',[c(3,2),c(0,4)]))[0],'C10');
 assert.equal(preferred(view('KT9','Q6',[c(3,2),c(0,4)]))[0],'C9');
 // A queen played to THIS trick cannot make our jack equal to our king.
 assert.equal(preferred(view('KJ3','76',[c(3,2),c(0,12)]))[0],'C13');
});
test('third-hand exceptions protect the king over a jack lead and the jack over dummy’s ten',()=>{
 assert.equal(preferred(view('K862','94',[c(3,11),c(0,3)]))[0],'C8');
 assert.equal(preferred(view('J63','AT',[c(3,2),c(0,7)]))[0],'C3');
 assert.equal(preferred(view('A952','7',[c(3,12),c(0,6)]))[0],'C14');
});
test('second hand plays low but splits honors to protect against a cheap finesse',()=>{
 assert.equal(preferred(view('A86','KT74',[c(2,2)],3))[0],'C6');
 assert.equal(preferred(view('QJ5','AT4',[c(2,2)],3))[0],'C12');
 assert.equal(preferred(view('QJ6','74',[c(0,2)],1))[0],'C6');
 assert.equal(preferred(view('AT84','',[c(0,3)],1))[1].method,'duck-singleton');
});
test('guarded discards do not recommend unprotecting a stopper or dummy’s long suit',()=>{
 const v={...view('','','',3),hand:hand({C:'Q82',D:'986',S:'42'}),knownHands:{0:hand({C:'AKJ4'})},trick:[c(2,14,'H')]};
 const p=defensePlan(v);
 assert(!p.preferences.has('C2'));assert(!p.preferences.has('C8'));
 assert.equal(preferred(v)[0],'D6');assert(!p.preferences.has('S2'));
});
test('signals are soft evidence, reconstruct the hand at play, and do not double-count a trick',()=>{
 const trick=[c(3,14),c(0,6),c(1,3),c(2,4)],v={contract,history:[{cards:trick,winner:3}],trick};
 assert.equal(publicTricks(v).length,1);
 const events=signalObservations(v);assert.equal(events.length,1);assert.equal(events[0].seat,1);
 const encouraged=[[],ranks('Q2'),[],[]],discouraged=[[],ranks('J2'),[],[]];
 assert.equal(signalLogWeight(encouraged,events,[1],contract),0);
 assert(signalLogWeight(discouraged,events,[1],contract)<0);
 assert(Number.isFinite(signalLogWeight(discouraged,events,[1],contract)));
 assert.equal(signalLogWeight([[],ranks('Q'),[],[]],events,[1],contract),0); // only one spot available
 assert.equal(signalLogWeight(discouraged,events,[],contract),0); // known hand is never reweighted
 const next=[c(3,13),c(0,5),c(1,2),c(2,7)];
 const both=signalObservations({contract,history:[{cards:trick,winner:3},{cards:next,winner:3}],trick:next});
 assert.equal(both.filter(e=>e.seat===1&&e.type==='attitude').length,1);
 assert.deepEqual(both[0].after.map(x=>x.id),['C3','C2']);
});
test('tactics cannot trade away the modeled setting chance and never override exact endings',()=>{
 const best={card:card('C',14),expectedScore:50,expectedTricks:8,makeProbability:0};
 const tactic={card:card('C',2),expectedScore:49,expectedTricks:8.05,makeProbability:0};
 const plan={preferences:new Map([['C2',{priority:30}]])};
 assert.equal(selectDefensiveOption([best,tactic],plan),tactic);
 assert.equal(selectDefensiveOption([best,{...tactic,makeProbability:.01}],plan),best);
 assert.equal(selectDefensiveOption([best,{...tactic,expectedScore:40}],plan),best);
 assert.equal(selectDefensiveOption([best,tactic],plan,{exact:true}),best);
});
test('notrump hold-up advice yields to an immediately available setting trick',()=>{
 const v=view('A53','KQJT',[c(2,8)],3,'N');v.contract.level=3;
 assert([...defensePlan(v).preferences.values()].some(p=>p.method==='hold-up'));
 v.history=Array.from({length:4},()=>({winner:1,cards:[]}));
 assert(![...defensePlan(v).preferences.values()].some(p=>p.method==='hold-up'));
});
test('slam leads are passive in NT, attack useful side suits at six of a suit, and cash an ace against 7NT',()=>{
 const base={seat:3,contract:{...contract,level:6,suit:'N'},hand:hand({S:'KJ862',H:'973',D:'Q84',C:'65'}),trick:[],history:[],auction:[]};
 assert.deepEqual(openingLeadPlan(base).candidates.map(x=>x.card.suit),['H']);
 const grand={...base,contract:{...base.contract,level:7},hand:hand({S:'AJ862',H:'973',D:'Q84',C:'65'})};
 assert.equal(openingLeadPlan(grand).candidates[0].card.id,'S14');
 const attacking={...base,contract:{...contract,level:6},hand:hand({S:'T2',H:'QJ7',D:'K9652',C:'J64'})};
 assert(openingLeadPlan(attacking).candidates.every(x=>x.card.suit==='H'));
});

const rngFor=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
function scenario(own,dummy,trick,suit='S'){
 // Full legal deal with South declarer, West leader and East at third hand.
 const state=E.createDeal(3,rngFor(529)),parts=[ranks(dummy),ranks(own),[],[]];
 for(const x of trick)parts[x.seat].push(x.card);
 const used=new Set(parts.flat().map(c=>c.id));assert.equal(used.size,parts.flat().length);
 const rest=state.hands.flat().filter(c=>!used.has(c.id));
 for(let seat=0;seat<4;seat++)while(parts[seat].length<13){const index=seat<2?rest.findIndex(c=>c.suit!=='C'):rest.length-1;parts[seat].push(rest.splice(index,1)[0]);}
 state.hands=parts;state.originalHands=structuredClone(parts);
 for(const b of ['1'+suit,'P','4'+suit,'P','P','P'])E.makeCall(state,b);
 for(const x of trick){assert.equal(state.turn,x.seat);E.playCard(state,x.card.id);}
 return state;
}
test('bot analysis integrates third-hand tactics, remains legal, and never reads actual concealed hands',()=>{
 const s=scenario('KT3','Q74',[c(3,2),c(0,6)]),before=structuredClone(s),analysis=E.botAnalysis(s);
 assert.equal(analysis.card.id,'C10');assert.equal(analysis.defense.method,'finesse-dummy');
 assert.equal(E.botCard(s).id,analysis.card.id);assert.equal(E.chooseCard(E.playView(s)).id,analysis.card.id);
 assert(analysis.options.every(x=>Number.isFinite(x.expectedScore)));
 const other=structuredClone(s);[other.hands[2],other.hands[3]]=[other.hands[3],other.hands[2]];
 Object.defineProperty(other,'originalHands',{get(){throw Error('Hidden deal read');}});
 assert.deepEqual(E.botAnalysis(other),analysis);assert.deepEqual(s,before);
 const declarer={...E.playView(s),seat:2,hand:s.hands[2]};assert.equal(defensePlan(declarer),null);
});
