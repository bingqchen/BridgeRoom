import test from 'node:test';
import assert from 'node:assert/strict';
import {TableSession,replayDeal} from '../dist/session.js';
import * as E from '../dist/engine.js';
import {compareWithBots} from '../dist/duplicate.js';
const rng=()=>{let seed=429;return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};};
function finish(session,state){
 while(state.phase!=='complete'){
  if(state.phase==='bidding'){
   const bid=E.botBid(state).bid;
   if(state.turn===2)session.act(state,s=>E.makeCall(s,bid));else E.makeCall(state,bid);
  }else if(state.trick.length===4)E.collectTrick(state);
  else{
   const id=E.botCard(state).id;
   if(state.turn===2||E.side(state.contract.declarer)===0&&E.side(state.turn)===0)session.act(state,s=>E.playCard(s,id));else E.playCard(state,id);
  }
 }
 session.recordScore(state);session.recordComparison(compareWithBots(state));return state;
}
test('undo returns to the human decision before intervening bot bids; invalid actions add no history',()=>{
 const session=new TableSession();let state=E.createDeal(3,rng()),before=structuredClone(state);
 assert.equal(session.undo(),null);
 assert.throws(()=>session.act(state,s=>E.makeCall(s,'8S')));assert.equal(session.canUndo,false);
 session.act(state,s=>E.makeCall(s,'1N'));
 E.makeCall(state,'P');E.makeCall(state,'2D');E.makeCall(state,'P');
 state=session.undo();assert.deepEqual(state,before);assert.equal(session.canUndo,false);
 session.act(state,s=>E.makeCall(s,'1H'));assert.equal(state.auction[0].bid,'1H');assert.equal(before.auction.length,0);
});
test('undo crosses from play to the last auction decision and hides dummy again',()=>{
 const session=new TableSession(),state=E.createDeal(4,rng());
 ['1N','P','P'].forEach(b=>E.makeCall(state,b));const before=structuredClone(state);
 session.act(state,s=>E.makeCall(s,'P'));assert.equal(state.phase,'play');
 E.playCard(state,E.botCard(state).id);assert.equal(state.dummyExposed,true);
 assert.deepEqual(session.undo(),before);
});
test('undo restores dummy cards, a collected trick, winner, counts and turn together',()=>{
 const session=new TableSession(),state=E.createDeal(1,rng());
 ['1N','P','P','P'].forEach(b=>E.makeCall(state,b));assert.equal(state.contract.dummy,2);
 E.playCard(state,E.botCard(state).id);assert.equal(state.turn,2);
 const before=structuredClone(state);
 session.act(state,s=>E.playCard(s,E.botCard(s).id));
 while(state.trick.length<4)E.playCard(state,E.botCard(state).id);
 E.collectTrick(state);E.playCard(state,E.botCard(state).id);
 assert.deepEqual(session.undo(),before);
});
test('completed result and IMPs are removed on undo and counted only once after finishing again',()=>{
 const session=new TableSession(),state=finish(session,E.createDeal(1,rng()));
 const totals=[...session.totals],comparisonTotals={...session.comparisonTotals};
 const lastDecision=structuredClone(session.snapshots.at(-1));
 session.recordScore(state);session.recordComparison(compareWithBots(state));
 assert.deepEqual(session.totals,totals);assert.deepEqual(session.comparisonTotals,comparisonTotals);
 const restored=session.undo();assert.deepEqual(restored,lastDecision);assert.notEqual(restored.phase,'complete');
 assert.deepEqual(session.totals,[0,0]);assert.deepEqual(session.comparisonTotals,{boards:0,points:0,imps:0});assert.equal(session.comparison,null);
 finish(session,restored);assert.deepEqual(session.totals,totals);assert.deepEqual(session.comparisonTotals,comparisonTotals);
});
test('replay keeps the original deal and replaces only this board’s session contribution',()=>{
 const session=new TableSession();const first=finish(session,E.createDeal(5,rng()));
 const priorTotals=[...session.totals],priorComparison={...session.comparisonTotals};
 const second=finish(session,session.skip(first,rng()));
 const original=structuredClone(second.originalHands),fresh=session.replay(second);
 assert.equal(fresh.board,second.board);assert.equal(fresh.dealer,second.dealer);assert.deepEqual(fresh.vulnerable,second.vulnerable);
 assert.deepEqual(fresh.hands,original);assert.deepEqual(fresh.originalHands,original);
 assert.equal(fresh.phase,'bidding');assert.equal(fresh.turn,second.dealer);assert.equal(fresh.contract,null);assert.equal(fresh.result,null);
 assert.deepEqual(fresh.history,[]);assert.deepEqual(fresh.auction,[]);assert.deepEqual(fresh.trick,[]);assert.deepEqual(fresh.tricks,[0,0]);assert.equal(fresh.dummyExposed,false);
 assert.equal(session.canUndo,false);assert.deepEqual(session.totals,priorTotals);assert.deepEqual(session.comparisonTotals,priorComparison);
 session.replay(fresh);assert.deepEqual(session.totals,priorTotals);assert.deepEqual(session.comparisonTotals,priorComparison);
 fresh.hands[0].pop();assert.equal(second.originalHands[0].length,13);assert.equal(fresh.originalHands[0].length,13);
});
test('skip abandons incomplete boards without scoring and prevents undo across board boundaries',()=>{
 const session=new TableSession();let state=E.createDeal(3,rng());
 session.act(state,s=>E.makeCall(s,'1N'));state=session.skip(state,rng());
 assert.equal(state.board,4);assert.equal(state.dealer,3);assert.deepEqual(state.vulnerable,E.vulnerability(4));assert.equal(session.undo(),null);
 assert.deepEqual(session.totals,[0,0]);assert.equal(session.comparisonTotals.boards,0);
 finish(session,state);const totals=[...session.totals],comparisons={...session.comparisonTotals};
 state=session.skip(state,rng());assert.equal(state.board,5);assert.deepEqual(session.totals,totals);assert.deepEqual(session.comparisonTotals,comparisons);
 assert.equal(session.comparison,null);assert.equal(session.scored,false);assert.equal(session.canUndo,false);
});
test('passed-out boards have a removable zero score and replay starts a fresh auction',()=>{
 const session=new TableSession(),state=E.createDeal(1,rng());
 ['P','P'].forEach(b=>E.makeCall(state,b));session.act(state,s=>E.makeCall(s,'P'));E.makeCall(state,'P');
 session.recordScore(state);session.recordComparison(compareWithBots(state));assert.equal(session.scored,true);
 const replay=session.replay(state);assert.equal(replay.auction.length,0);assert.equal(replay.result,null);
 assert.equal(session.scored,false);assert.deepEqual(session.totals,[0,0]);assert.equal(session.comparisonTotals.boards,0);
 assert.deepEqual(replay,replayDeal(state));
});
