import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {claimAvailable,verifyClaim,claimRemaining} from '../dist/claim.js';
import {TableSession,replayDeal} from '../dist/session.js';
import {compareWithBots} from '../dist/duplicate.js';

const card=(suit,rank)=>({suit,rank,id:suit+rank});
const cards=text=>text.split(' ').map(x=>card(x[0],Number({A:14,K:13,Q:12,J:11,T:10}[x.slice(1)]||x.slice(1))));
const deck=E.SUITS.slice(0,4).flatMap(s=>Array.from({length:13},(_,i)=>card(s,i+2)));
// Synthetic prefixes leave the requested ending. E/W always follow the suit
// led, so these fixtures assert no voids and permit every capacity-correct split.
function ending(north,south,unknown,trump='N'){
 const n=cards(north),s=cards(south),pool=cards(unknown),size=n.length;
 assert.equal(s.length,size);assert.equal(pool.length,size*2);
 const used=new Set([...n,...s,...pool].map(c=>c.id));assert.equal(used.size,size*4);
 let rest=deck.filter(c=>!used.has(c.id));const pairs=[];
 for(let i=0;i<13-size;i++){
  const suit=E.SUITS.slice(0,4).find(s=>rest.filter(c=>c.suit===s).length>=2),pair=rest.filter(c=>c.suit===suit).slice(0,2);
  pairs.push(pair);rest=rest.filter(c=>!pair.includes(c));
 }
 const history=pairs.map((pair,i)=>({winner:0,cards:[{seat:1,card:pair[0]},{seat:2,card:rest[i*2]},{seat:3,card:pair[1]},{seat:0,card:rest[i*2+1]}]}));
 const hands=[n,pool.slice(0,size),s,pool.slice(size)];
 return {board:1,dealer:0,vulnerable:[false,false],phase:'play',turn:0,dummyExposed:true,
  contract:{level:3,suit:trump,declarer:0,dummy:2,doubled:1},auction:[],hands,
  originalHands:hands.map((h,seat)=>[...h,...history.flatMap(t=>t.cards.filter(x=>x.seat===seat).map(x=>x.card))]),
  history,trick:[],tricks:[13-size,0],result:null};
}

test('accepts cashable winners regardless of the actual East/West split',()=>{
 const s=ending('SA SK','S2 S3','SQ SJ ST S9'),before=structuredClone(s),a=verifyClaim(s);
 assert.equal(a.accepted,true);assert.equal(a.remaining,2);assert.deepEqual(s,before);
 const changed=structuredClone(s);[changed.hands[1],changed.hands[3]]=[changed.hands[3],changed.hands[1]];
 assert.deepEqual(verifyClaim(changed),a);
 // The verifier must not even read the concealed hand arrays.
 Object.defineProperty(changed.hands,1,{get(){throw Error('Read concealed East cards');}});
 Object.defineProperty(changed.hands,3,{get(){throw Error('Read concealed West cards');}});
 assert.equal(verifyClaim(changed).accepted,true);
});
test('rejects a finesse, an outstanding ruff, a bad trump break, and blocked winners',()=>{
 for(const s of [ending('SA SQ','S2 S3','SK S4 S5 S6'),ending('SA SK','S2 S3','HA H2 D2 D3','H'),ending('HA HK DA','H2 D2 D3','HQ HJ HT D4 D5 D6','H'),ending('SA C2','SK SQ','S2 S3 CA C3')]){
  const before=structuredClone(s),check=verifyClaim(s);
  assert.equal(check.status,'unsafe');assert.equal(check.accepted,false);assert.deepEqual(s,before);
 }
});
test('can draw trumps and accepts winners after every opponent trump is gone',()=>{
 assert.equal(verifyClaim(ending('HA HK','H2 DA','HQ HJ D2 D3','H')).accepted,true);
 assert.equal(verifyClaim(ending('SA SK','S2 S3','SQ SJ D2 D3','H')).accepted,true);
});
test('shown voids restrict distributions, but auction guesses never certify a claim',()=>{
 const s=ending('DA DQ','D2 D3','DK D4 H2 H3');s.turn=2;
 assert.equal(verifyClaim(s).accepted,false);
 s.auction=[{seat:1,bid:'1H',lengths:{H:13},max:0}];
 assert.equal(verifyClaim(s).accepted,false);
 // Create a public trick led by West in diamonds with East discarding.
 const t=s.history.find(t=>t.cards[0].card.suit!=='D'&&t.cards.some(x=>x.seat%2===0&&x.card.suit==='D'));
 assert(t);const west=t.cards.find(x=>x.seat===3),ns=t.cards.find(x=>x.seat%2===0&&x.card.suit==='D');
 [west.card,ns.card]=[ns.card,west.card];t.cards=[3,0,1,2].map(seat=>t.cards.find(x=>x.seat===seat));
 assert.equal(verifyClaim(s).accepted,true);
});
test('includes the unfinished trick, follows suit and rejects an already-lost trick',()=>{
 const s=ending('SA SK','S2 S3','SQ SJ ST S9');E.playCard(s,'S14');E.playCard(s,'S12');
 assert.equal(s.turn,2);assert.equal(verifyClaim(s).remaining,2);assert.equal(verifyClaim(s).accepted,true);
 const bad=ending('S2 SK','S3 S4','SA SQ SJ ST');E.playCard(bad,'S2');E.playCard(bad,'S14');
 assert.equal(verifyClaim(bad).accepted,false);
});
test('eligibility requires human declarer control, exposed dummy and an active turn',()=>{
 const s=ending('SA SK','S2 S3','SQ SJ ST S9');assert(claimAvailable(s));
 for(const patch of [{phase:'bidding'},{phase:'complete'},{turn:1},{dummyExposed:false},{trick:[1,2,3,4]},{contract:{...s.contract,declarer:1,dummy:3}}])assert.equal(claimAvailable({...s,...patch}),false);
 assert.equal(verifyClaim({...s,turn:1}).status,'unavailable');
});
test('incomplete proofs and invalid histories fail closed, without any table changes',()=>{
 const s=ending('SA SK','S2 S3','SQ SJ ST S9'),before=structuredClone(s);
 assert.equal(verifyClaim(s,{nodeLimit:0}).status,'unverified');
 assert.throws(()=>claimRemaining(s,{nodeLimit:0}),/search limit/);assert.deepEqual(s,before);
 const broken=structuredClone(s);broken.history.pop();assert.equal(verifyClaim(broken).status,'invalid');
});
test('a claim scores once, keeps real history, compares the same original deal, and can be undone',()=>{
 const s=ending('SA SK','S2 S3','SQ SJ ST S9'),session=new TableSession();
 s.contract={...s.contract,level:6,suit:'S',doubled:2};s.vulnerable=[true,true];
 E.playCard(s,'S14');E.playCard(s,'S12');const before=structuredClone(s);
 session.act(s,x=>claimRemaining(x));assert.equal(s.phase,'complete');assert.equal(s.tricks[0],13);assert.equal(s.tricks[1],0);
 assert.deepEqual(s.history,before.history);assert.deepEqual(s.claim.partialTrick,before.trick);assert.equal(s.claim.tricks,2);
 assert.equal(s.result.score,E.scoreContract(s.contract,13,true).score);assert.equal(s.result.nsScore,s.result.score);
 session.recordScore(s);session.recordComparison(compareWithBots(s));
 assert.equal(session.comparisonTotals.boards,1);assert.deepEqual(session.comparison.botTable.originalHands,s.originalHands);
 session.recordScore(s);assert.equal(session.totals[0],s.result.score);
 assert.deepEqual(session.undo(),before);assert.deepEqual(session.totals,[0,0]);assert.equal(session.comparisonTotals.boards,0);
 assert.deepEqual(replayDeal(s).hands,s.originalHands);assert.equal(replayDeal(s).claim,undefined);
});

function combinations(array,n){if(!n)return [[]];return array.flatMap((x,i)=>combinations(array.slice(i+1),n-1).map(t=>[x,...t]));}
// Independent perfect-information exhaustive oracle for small endings. A
// universal claim must win in every single distribution even against best play.
function allTricks(hands,trick,turn,trump){
 if(trick.length===4){const won=E.trickWinner(trick,trump);return E.side(won)===0&&allTricks(hands,[],won,trump);}
 if(!hands.flat().length)return true;
 const outcomes=E.legalCards(hands[turn],trick).map(c=>{
  const next=hands.map((h,s)=>s===turn?h.filter(x=>x.id!==c.id):h);
  return allTricks(next,[...trick,{seat:turn,card:c}],(turn+1)%4,trump);
 });
 return E.side(turn)===0?outcomes.some(Boolean):outcomes.every(Boolean);
}
test('every accepted small-ending claim survives exhaustive distributions and perfect defense',()=>{
 let seed=121,accepted=0;
 const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<160;i++){
  const selected=[...deck];for(let j=51;j>0;j--){const k=Math.floor(rng()*(j+1));[selected[j],selected[k]]=[selected[k],selected[j]];}
  const size=2+i%2,text=h=>h.map(c=>c.suit+c.rank).join(' '),s=ending(text(selected.slice(0,size)),text(selected.slice(size,size*2)),text(selected.slice(size*2,size*4)),E.SUITS[i%5]);
  const result=verifyClaim(s);assert.notEqual(result.status,'unverified');
  if(result.accepted){accepted++;const pool=[...s.hands[1],...s.hands[3]];
   for(const east of combinations(pool,size)){const west=pool.filter(c=>!east.includes(c));assert(allTricks([s.hands[0],east,s.hands[2],west],[],0,s.contract.suit));}
  }
 }
 assert(accepted>0);
});
