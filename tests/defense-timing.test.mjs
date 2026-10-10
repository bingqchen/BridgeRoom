import test from 'node:test';
import assert from 'node:assert/strict';
import {SUITS} from '../dist/bridge-cards.js';
import {defensiveTiming} from '../dist/defense-timing.js';
import {defensePlan,selectDefensiveOption} from '../dist/defense.js';
import {createDeal,analyzePlay} from '../dist/engine.js';
const cards=spec=>Object.entries(spec).flatMap(([s,text])=>[...text].map(r=>({suit:s,rank:Number({A:14,K:13,Q:12,J:11,T:10}[r]||r),id:s+Number({A:14,K:13,Q:12,J:11,T:10}[r]||r)})));
const encode=c=>SUITS.indexOf(c.suit)*13+c.rank-2;
const play=(seat,s,r)=>({seat,card:encode(cards({[s]:r})[0])});
const contract={level:4,suit:'S',trump:3,declarer:2,dummy:0};
const worlds=specs=>specs.map(cards);
const timing=(w,t,seat=3,c=contract,taken=0)=>defensiveTiming(w.map(h=>h.map(encode)),t,seat,c,taken);

test('cash a side-suit winner before a singleton becomes a ruff on lead or in second seat',()=>{
 const w=worlds([{C:'8',S:'7'},{C:'QJ'},{C:'K9',S:'Q'},{C:'A6'}]);
 assert.equal(timing(w,[play(2,'C','2')]).method,'cash-before-ruff');
 assert.equal(timing(w,[play(2,'C','2')]).card,encode(cards({C:'A'})[0]));
 assert.equal(timing(w,[]).method,'cash-before-ruff');
 // The opponent has already followed with the last club: the danger is NEXT round.
 const fourth=worlds([{S:'7'},{C:'QJ'},{C:'K9',S:'Q'},{C:'A6'}]);
 assert.equal(timing(fourth,[play(0,'C','8'),play(1,'C','3'),play(2,'C','2')]).method,'cash-before-ruff');
});
test('do not cash a winner into an immediate ruff or invent urgency without trumps',()=>{
 const w=worlds([{S:'7'},{C:'QJ'},{C:'K9',S:'Q'},{C:'A6'}]);
 assert.equal(timing(w,[play(2,'C','2')]),null);
 assert.equal(timing(w,[]),null);
 w[0]=cards({C:'8',H:'7'});w[2]=cards({C:'K9',H:'Q'});
 assert.equal(timing(w,[play(2,'C','2')]),null);
});
test('a promoted king can be cashed, but a missing ace is not assumed gone',()=>{
 const w=worlds([{C:'8',S:'7'},{C:'J9'},{C:'Q2',S:'Q'},{C:'K6'}]);
 assert.equal(timing(w,[]).method,'cash-before-ruff');
 w[2].push(...cards({C:'A'}));
 assert.equal(timing(w,[]),null);
});
test('do not overtake partner’s safe winner just to cash an honor',()=>{
 const w=worlds([{S:'7'},{C:'J9'},{C:'82',S:'Q'},{C:'K6'}]);
 assert.equal(timing(w,[play(1,'C','A'),play(2,'C','3')]),null);
});
test('duck once, then win declarer’s last card to strand dummy’s long suit',()=>{
 const nt={...contract,level:3,suit:'N',trump:4};
 const w=worlds([{C:'QJT9'},{C:'84'},{C:'2',D:'K'},{C:'A76'}]);
 const before=structuredClone(w);
 assert.equal(timing(w,[play(2,'C','K')],3,nt).method,'hold-up');
 assert.equal(timing(w,[play(2,'C','K')],3,nt).card,encode(cards({C:'6'})[0]));
 assert.deepEqual(w,before);
 w[0]=cards({C:'QJT'});w[2]=cards({D:'K'});w[3]=cards({C:'A7'});
 const t=timing(w,[play(2,'C','2')],3,nt);
 assert.equal(t.method,'cut-dummy-entry');assert.equal(t.card,encode(cards({C:'A'})[0]));
});
test('take the stopper in fourth seat too, and include non-ace masters',()=>{
 const nt={...contract,level:3,suit:'N',trump:4};
 const w=worlds([{C:'JT9'},{C:'84'},{D:'K'},{C:'K76'}]);
 const t=timing(w,[play(0,'C','Q'),play(1,'C','3'),play(2,'C','2')],3,nt);
 assert.equal(t.method,'cut-dummy-entry');assert.equal(t.card,encode(cards({C:'K'})[0]));
});
test('outside entries, remaining dummy trumps, and a setting trick stop a hold-up',()=>{
 const nt={...contract,level:3,suit:'N',trump:4};
 const w=worlds([{C:'QJT9',H:'A'},{C:'84',H:'2'},{C:'2',H:'3'},{C:'A76',H:'4'}]);
 assert.equal(timing(w,[play(2,'C','K')],3,nt),null);
 w[0]=cards({C:'QJT9',H:'K5'});w[2].push(...cards({H:'6'}));w[3].push(...cards({H:'A'}));
 assert.equal(timing(w,[play(2,'C','K')],3,nt),null); // Kx is a promotable entry.
 w[0]=cards({C:'QJT9',S:'7'});
 assert.equal(timing(w,[play(2,'C','K')]),null); // Do not call a ruffing entry stranded.
 w[0]=cards({C:'QJT9'});
 assert.equal(timing(w,[play(2,'C','K')],3,nt,4).method,'take-setting-trick');
 assert.equal(timing(w,[play(2,'C','K')],3,nt,5),null); // Already beaten: do not donate tricks.
});
test('sample consensus informs the real decision without overriding worse score or setting chance',()=>{
 const w=worlds([{C:'8',S:'7'},{C:'QJ'},{C:'K9',S:'Q'},{C:'A6'}]);
 const v={hand:w[3],seat:3,contract,knownHands:{0:w[0],3:w[3]},history:[],auction:[],trick:[{seat:2,card:cards({C:'2'})[0]}]};
 const p=defensePlan(v,[w,w,w,w,w]);
 assert.equal(p.preferences.get('C14').method,'cash-before-ruff');
 assert.match(p.preferences.get('C14').reason,/100%/);
 const best={card:cards({C:'6'})[0],expectedScore:50,expectedTricks:9,makeProbability:.25};
 const cash={...best,card:cards({C:'A'})[0],expectedScore:49};
 assert.equal(selectDefensiveOption([best,cash],p),cash);
 assert.equal(selectDefensiveOption([best,{...cash,makeProbability:.5}],p),best);
 const noRuff=worlds([{C:'87'},{C:'QJ'},{C:'K9'},{C:'A6'}]);
 assert(!defensePlan(v,[w,w,noRuff,noRuff,noRuff]).preferences.has('C14'));
});

test('never duck the contract-making trick even before the setting trick is available',()=>{
 const w=worlds([{C:'QJT98'},{C:'43',D:'KQ',H:'2'},{C:'2',D:'A63'},{C:'A76',D:'52'}]);
 const t=defensiveTiming(w.map(h=>h.map(encode)),[play(2,'C','K')],3,{...contract,level:3,suit:'N',trump:4},0,8);
 assert.equal(t.method,'stop-contract');assert.equal(t.card,encode(cards({C:'A'})[0]));
 const v={hand:w[3],knownHands:{0:w[0],3:w[3]},seat:3,contract:{...contract,level:3,suit:'N'},trick:[{seat:2,card:cards({C:'K'})[0]}],history:Array.from({length:8},()=>({winner:2,cards:[]}))};
 assert.equal(defensePlan(v,[w]).preferences.get('C14').method,'stop-contract');
 assert(![...defensePlan(v,[w]).preferences.values()].some(t=>t.method==='hold-up'));
});

test('the full analysis reports a timed hold-up in a five-trick hypothetical ending',()=>{
 // All hands are intentionally known for this search fixture. Fill the rest of
 // the deck into public history, as in the existing exact-ending tests.
 const hands=worlds([{C:'QJT98'},{C:'43',D:'KQ',H:'2'},{C:'2',D:'A63'},{C:'A76',D:'52'}]);
 const trick=[{seat:2,card:cards({C:'K'})[0]}],used=new Set([...hands.flat(),trick[0].card].map(c=>c.id));
 const rest=createDeal(1,()=>.5).hands.flat().filter(c=>!used.has(c.id));
 const old=hands.map((h,s)=>rest.splice(0,13-h.length-trick.filter(x=>x.seat===s).length));
 const history=Array.from({length:8},(_,i)=>({winner:i<6?2:1,cards:old.map((h,seat)=>({seat,card:h[i]}))}));
 const v={hand:hands[3],knownHands:Object.fromEntries(hands.map((h,s)=>[s,h])),seat:3,trick,history,auction:[],contract:{...contract,level:3,suit:'N',doubled:1}};
 const before=structuredClone(v),a=analyzePlay(v);
 assert.equal(a.card.id,'C6');assert.equal(a.defense.method,'hold-up');
 assert.equal(a.options[0].makeProbability,0);assert.equal(a.options[0].expectedTricks,8);
 assert.deepEqual(v,before);
});

test('search cashes the ace and defeats 3NT when ducking would concede the ninth trick',()=>{
 const hands=worlds([{C:'QJT98'},{C:'4',H:'KQ',D:'AK'},{C:'2',H:'J98'},{C:'A76',H:'A2'}]);
 const trick=[{seat:2,card:cards({C:'K'})[0]}],used=new Set([...hands.flat(),trick[0].card].map(c=>c.id));
 const rest=createDeal(1,()=>.5).hands.flat().filter(c=>!used.has(c.id));
 const old=hands.map((h,s)=>rest.splice(0,13-h.length-trick.filter(x=>x.seat===s).length));
 const history=Array.from({length:8},(_,i)=>({winner:2,cards:old.map((h,seat)=>({seat,card:h[i]}))}));
 const a=analyzePlay({hand:hands[3],knownHands:Object.fromEntries(hands.map((h,s)=>[s,h])),seat:3,trick,history,auction:[],contract:{...contract,level:3,suit:'N',doubled:1}});
 assert.equal(a.card.id,'C14');assert.equal(a.defense.method,'stop-contract');
 assert.equal(a.options[0].makeProbability,0);
 assert(a.options.filter(o=>o.card.id!=='C14').every(o=>o.makeProbability===1));
});
