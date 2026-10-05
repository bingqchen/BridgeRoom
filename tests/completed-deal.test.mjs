import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeal} from '../dist/engine.js';
import {completedDealMarkup} from '../dist/completed-deal.js';
const order=['S','H','C','D'];
test('only a completed board exposes any original hands',()=>{
 const state=createDeal(1);
 Object.defineProperty(state,'originalHands',{get(){throw Error('Concealed hands read');}});
 assert.equal(completedDealMarkup(state,order),'');state.phase='play';assert.equal(completedDealMarkup(state,order),'');
});
test('completion shows all 52 original cards at compass seats even when the played hands are empty',()=>{
 const state=createDeal(1);state.phase='complete';state.hands=[[],[],[],[]];state.contract={declarer:0,dummy:2,suit:'H'};
 const before=JSON.stringify(state.originalHands),html=completedDealMarkup(state,['H','C','D','S']);
 assert.equal((html.match(/class="review-card /g)||[]).length,52);
 for(const seat of ['North','West','East','South'])assert(html.includes(`${seat} original hand`));
 assert(html.indexOf('revealed-north')<html.indexOf('revealed-west'));
 assert(html.indexOf('revealed-west')<html.indexOf('revealed-east'));
 assert(html.indexOf('revealed-east')<html.indexOf('revealed-south'));
 assert(html.includes('South · Dummy'));assert(html.includes('North · Declarer'));
 assert(html.indexOf('>♥</span>')<html.indexOf('>♣</span>'));
 assert.equal(JSON.stringify(state.originalHands),before);
 state.phase='play';assert.equal(completedDealMarkup(state,order),'');
});
test('passed-out and claimed boards both display the original full deal',()=>{
 const state=createDeal(1);state.phase='complete';
 assert.equal((completedDealMarkup(state,order).match(/role="img"/g)||[]).length,52);
 state.claim={tricks:7};assert.equal((completedDealMarkup(state,order).match(/role="img"/g)||[]).length,52);
});
