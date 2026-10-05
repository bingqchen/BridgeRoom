import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeal,hcp,vulnerability} from '../dist/engine.js';
import {TableSession,replayDeal} from '../dist/session.js';
import {playBotBoard} from '../dist/duplicate.js';
const rngFor=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);

test('strong South swaps an intact maximum-HCP hand and preserves every deal rule',()=>{
 for(let board=1;board<=128;board++){
  const normal=createDeal(board,rngFor(board*127)),strong=createDeal(board,rngFor(board*127),{southHighestHcp:true});
  assert.equal(hcp(strong.hands[2]),Math.max(...strong.hands.map(hcp)));
  assert.deepEqual(strong.hands.map(h=>h.length),[13,13,13,13]);
  assert.equal(new Set(strong.hands.flat().map(c=>c.id)).size,52);
  assert.deepEqual(strong.hands.map(h=>h.map(c=>c.id).join(',')).sort(),normal.hands.map(h=>h.map(c=>c.id).join(',')).sort());
  assert.deepEqual(strong.originalHands,strong.hands);
  assert.equal(strong.dealer,(board-1)%4);assert.deepEqual(strong.vulnerable,vulnerability(board));
  if(hcp(normal.hands[2])===Math.max(...normal.hands.map(hcp)))assert.deepEqual(strong,normal);
  assert.deepEqual(createDeal(board,rngFor(board*127),{southHighestHcp:false}),normal);
 }
});
test('new-board preference preserves replay and the duplicate comparison deal',()=>{
 const session=new TableSession(),original=createDeal(1,rngFor(43)),before=structuredClone(original);
 const next=session.skip(original,rngFor(79),{southHighestHcp:true});
 assert.deepEqual(original,before);assert.equal(next.board,2);assert.equal(hcp(next.hands[2]),Math.max(...next.hands.map(hcp)));
 assert.deepEqual(replayDeal(next).hands,next.originalHands);
 assert.deepEqual(playBotBoard(next).originalHands,next.originalHands);
 assert.deepEqual(session.skip(next,rngFor(93),{southHighestHcp:false}).hands,createDeal(3,rngFor(93)).hands);
});
