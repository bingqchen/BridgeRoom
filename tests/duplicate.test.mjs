import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
import {playBotBoard,compareWithBots,pointsToIMPs} from '../dist/duplicate.js';
const rngFor=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
function finish(table){while(table.phase!=='complete'){if(table.phase==='bidding')E.makeCall(table,E.botBid(table).bid);else if(table.trick.length===4)E.collectTrick(table);else E.playCard(table,E.botCard(table).id);}return table;}

test('IMP scale respects boundaries, sign, equal scores, and the maximum',()=>{
 const cases=[[0,0],[10,0],[20,1],[40,1],[50,2],[80,2],[90,3],[120,3],[130,4],[160,4],[170,5],[210,5],[220,6],[260,6],[270,7],[310,7],[320,8],[360,8],[370,9],[420,9],[430,10],[490,10],[500,11],[590,11],[600,12],[740,12],[750,13],[890,13],[900,14],[1090,14],[1100,15],[1290,15],[1300,16],[1490,16],[1500,17],[1740,17],[1750,18],[1990,18],[2000,19],[2240,19],[2250,20],[2490,20],[2500,21],[2990,21],[3000,22],[3490,22],[3500,23],[3990,23],[4000,24],[8000,24]];
 for(const [difference,expected] of cases){assert.equal(pointsToIMPs(difference),expected);assert.equal(pointsToIMPs(-difference),expected===0?0:-expected);}
 // Opposite-sign N/S scores are subtracted, not compared by magnitude.
 assert.equal(pointsToIMPs(420-(-50)),10);assert.equal(pointsToIMPs(-50-420),-10);
 assert.throws(()=>pointsToIMPs(NaN));
});

test('bot replay preserves all original cards, dealer and vulnerability without touching a played board',()=>{
 const deal=E.createDeal(4,rngFor(82));
 ['1S','P','4S','P','P','P'].forEach(b=>E.makeCall(deal,b));
 for(let i=0;i<7;i++){if(deal.trick.length===4)E.collectTrick(deal);E.playCard(deal,E.botCard(deal).id);}
 const before=structuredClone(deal),bot=playBotBoard(deal);
 assert.deepEqual(deal,before);assert.equal(bot.board,4);assert.equal(bot.dealer,3);assert.deepEqual(bot.vulnerable,[true,true]);
 assert.deepEqual(bot.originalHands,deal.originalHands);assert.equal(bot.auction[0].seat,3);
 assert.equal(bot.phase,'complete');assert.equal(bot.history.length,13);
 assert.deepEqual(new Set(bot.history.flatMap(t=>t.cards.map(c=>c.card.id))),new Set(deal.originalHands.flat().map(c=>c.id)));
 const fresh=E.createDeal(4,rngFor(82));assert.deepEqual(bot,finish(fresh));
});

test('same bot decisions give zero difference across seats and vulnerability cycles',()=>{
 for(let board=1;board<=64;board++){
  const table=finish(E.createDeal(board,rngFor(board*917))),before=structuredClone(table);
  const result=compareWithBots(table);
  assert.deepEqual(table,before);assert.equal(result.yourScore,result.botScore);
  assert.equal(result.pointDifference,0);assert.equal(result.imps,0);
  assert.deepEqual(result.botTable.auction,table.auction);assert.deepEqual(result.botTable.history,table.history);
  assert.deepEqual(compareWithBots(table),result);
 }
});

test('a passed-out player board still compares against a fresh bot auction',()=>{
 const table=E.createDeal(1,rngFor(82));['P','P','P','P'].forEach(b=>E.makeCall(table,b));
 const result=compareWithBots(table);
 assert.equal(result.yourScore,0);assert.equal(result.botTable.result.passedOut,undefined);
 assert.notDeepEqual(result.botTable.auction,table.auction);
 assert.equal(result.pointDifference,-result.botScore);assert.equal(result.imps,pointsToIMPs(-result.botScore));
});

test('both tables can pass out and incomplete boards cannot disclose comparison results',()=>{
 const table=E.createDeal(1);
 const cards=table.originalHands.flat();table.originalHands=[0,1,2,3].map(seat=>cards.filter(c=>(E.SUITS.indexOf(c.suit)+c.rank)%4===seat));table.hands=structuredClone(table.originalHands);
 assert.deepEqual(table.hands.map(h=>E.hcp(h)),[10,10,10,10]);
 assert.throws(()=>compareWithBots(table),/Finish the board/);
 ['P','P','P','P'].forEach(b=>E.makeCall(table,b));const result=compareWithBots(table);
 assert.equal(result.botTable.result.passedOut,true);assert.equal(result.botScore,0);assert.equal(result.pointDifference,0);assert.equal(result.imps,0);
});
