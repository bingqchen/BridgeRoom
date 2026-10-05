import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';
const hand=spec=>Object.entries(spec).flatMap(([s,rs])=>rs.split(' ').filter(Boolean).map(r=>({suit:s,rank:Number({A:14,K:13,Q:12,J:11,T:10}[r]||r),id:s+r})));
function auction(bids,dealer=0){const state=E.createDeal(dealer+1);for(const b of bids)E.makeCall(state,b);return state.auction;}
const last=bids=>auction(bids).at(-1);
function choose(h,bids,dealer=0,options={}){const a=auction(bids,dealer);return E.chooseBid(hand(h),a,(dealer+bids.length)%4,options).bid;}
function meanings(cases){for(const [bids,kind]of cases)assert.equal(last(bids).kind,kind,bids.join(' '));}
test('GIB total points reduce each honor-containing short suit once',()=>{
 assert.equal(E.totalPoints(hand({S:'A K Q J 9 8 7 6',H:'Q',D:'7 2',C:'6 3'})),15);
 assert.equal(E.totalPoints(hand({S:'A K Q J 9 8 7 6',H:'',D:'Q 2',C:'6 3 2'})),15);
});
test('opening shape and notrump exception follow GIB',()=>{
 assert.equal(choose({S:'A K J 9 7',H:'K Q 2',D:'A 4 2',C:'8 5'},[]),'1S');
 assert.equal(choose({S:'A K J 9 7',H:'K Q 2',D:'Q 4 2',C:'8 5'},[]),'1N');
 assert.equal(choose({S:'A J 2',H:'Q 3',D:'K 8 7 2',C:'K 9 4 2'},[]),'1D');
 assert.equal(choose({S:'A J 8 7',H:'K Q 9 3',D:'K 2',C:'8 7 2'},[]),'1C');
 assert.equal(choose({S:'A J 8 7',H:'K Q 9 3',D:'K 8 2',C:'7 2'},[]),'1D');
});
test('inverted minors, Soloway, natural invitational jumps and passed-hand fit jumps',()=>{
 meanings([[['1D','P','2D'],'inverted-minor'],[['1C','P','3C'],'preemptive-raise'],[['1C','P','2H'],'soloway'],[['1S','P','3C'],'jump-invite'],[['P','P','1D','P','2H'],'fit-jump'],[['P','P','1S','P','3C'],'jump-invite']]);
 assert.equal(last(['1D','P','2C']).force,'game');
 assert.equal(last(['1C','P','1S','P','3C']).lengths.C,6);
 assert.equal(last(['1S','P','2D','P','2S']).lengths.S,5);
 assert.equal(last(['1H','P','2H']).minTP,7);
});
test('Drury and Jacoby responses distinguish strength and shortness',()=>{
 meanings([[['P','P','1S','P','2C'],'drury'],[['P','P','1S','P','2C','P','2D'],'drury-invite'],[['P','P','1S','P','2C','P','2S'],'drury-minimum'],[['P','P','1S','X','2C'],'natural-weak'],[['P','P','1S','2D','3D'],'competitive-raise'],[['1S','P','2N','P','3C'],'jacoby-shortness'],[['1H','P','2N','P','3H'],'jacoby-strong']]);
 assert.equal(choose({S:'K J 5',H:'A 7 2',D:'Q 6 4',C:'J 8 5 3'},['P','P','1S','P']),'2C');
});
test('two-way game tries and asking steps',()=>{
 meanings([[['1H','P','2H','P','2S'],'short-game-try'],[['1H','P','2H','P','2N'],'long-game-try'],[['1S','P','2S','P','2N','P','3C'],'short-game-ask'],[['1S','P','2S','P','2N','P','3C','P','3D'],'short-game-answer']]);
 assert.equal(last(['1H','P','2H','P','2N']).trialSuit,'S');
});
test('fourth suit and one-way new minor forcing; jump to spades is natural',()=>{
 meanings([[['1C','P','1D','P','1H','P','1S'],'fourth-suit'],[['1C','P','1D','P','1H','P','2S'],'fourth-suit-natural'],[['1C','P','1S','P','1N','P','2D'],'new-minor']]);
 assert.equal(last(['1C','P','1D','P','1H','P','1S']).artificial,true);
});
test('notrump meanings: minor transfers are not invites; Smolen and Texas',()=>{
 meanings([[['1N','P','2N'],'minor-transfer'],[['1N','P','3C'],'minor-transfer'],[['1N','P','2S'],'minor-stayman'],[['1N','P','3D'],'nt-shortness'],[['1N','P','2C','P','2D','P','3H'],'smolen'],[['1N','P','2C','P','2D','P','2N'],'invite-nt'],[['1N','P','4H'],'texas'],[['2N','P','3S'],'minor-stayman'],[['2N','P','3C','P','3S','P','4H'],'nt-slam-try']]);
 assert.equal(last(['1N','P','2C','P','2D','P','3H']).target,'S');
 assert.equal(choose({S:'A K 4',H:'K Q 3',D:'Q 7 4',C:'J 6 3 2'},['1N','P','2N','P']),'3C');
 assert.equal(choose({S:'A K 4',H:'K Q 3',D:'Q 7 4',C:'J 6 3 2'},['1N','P','3C','P']),'3D');
});
test('systems on after 1NT double and 2C interference; redouble minor escape',()=>{
 meanings([[['1N','X','2D'],'transfer'],[['1N','2C','X'],'stayman'],[['1N','X','XX'],'nt-runout']]);
 assert.equal(choose({S:'A K 4',H:'K Q 3',D:'Q 7 4',C:'J 6 3 2'},['1N','X','XX','P']),'2C');
 assert.equal(choose({S:'8 4',H:'9 3',D:'K 7 6 4 2',C:'9 6 3 2'},['1N','X','XX','P','2C','P']),'2D');
});
test('quantitative 4NT differs from RKCB after Texas or a minor transfer',()=>{
 meanings([[['1N','P','4N'],'quantitative'],[['1N','P','2C','P','2H','P','4N'],'quantitative'],[['1N','P','2D','P','2H','P','4N'],'quantitative'],[['1N','P','4D','P','4H','P','4N'],'rkcb'],[['1N','P','2N','P','3C','P','4N'],'rkcb'],[['1N','P','4C'],'gerber']]);
 assert.equal(last(['1N','P','4D','P','4H','P','4N']).trump,'H');
 assert.equal(last(['1N','P','2N','P','3C','P','4N']).trump,'C');
});
test('0314 keycards, queen inquiry, kings and DOPI',()=>{
 const base=['1S','P','2N','P','4S','P','4N','P'];
 assert.equal(choose({S:'A K Q 8 4',H:'A 7 3',D:'8 4 2',C:'6 3'},base),'5C');
 assert.equal(choose({S:'A Q 8 7 4',H:'7 3',D:'K 8 4',C:'K 6 3'},base),'5D');
 assert.equal(choose({S:'A K 8 7 4',H:'Q 7 3',D:'8 4 2',C:'6 3'},base),'5H');
 assert.equal(choose({S:'A K Q 7 4',H:'7 3',D:'8 4 2',C:'6 3 2'},base),'5S');
 meanings([[base.concat('5C','P','5D'),'queen-ask'],[base.concat('5C','P','5N'),'king-ask'],[['1S','P','2N','P','4S','P','4N','5C','X'],'dopi'],[['1S','P','2N','P','4S','P','4N','5C','P'],'dopi']]);
 assert.equal(last(base.concat('5C','P','5S')).kind,'signoff');
});
test('competitive doubles have distinct meanings and ceilings',()=>{
 meanings([[['1C','1H','X'],'negative-double'],[['1D','P','1H','2C','X'],'support-double'],[['1H','X','2H','X'],'responsive-double'],[['4H','X'],'takeout'],[['4S','X'],'penalty'],[['1C','4H','X'],'penalty'],[['1D','P','1H','2S','X'],'penalty']]);
});
test('Cappelletti, Michaels, unusual NT, Sandwich, Jordan and UVU',()=>{
 meanings([[['1N','2C'],'capp-one'],[['1N','2D'],'capp-majors'],[['1N','2H'],'capp-major-minor'],[['1N','2N'],'unusual-nt'],[['1D','2D'],'michaels'],[['1H','2N'],'unusual-nt'],[['2S','4S'],'michaels'],[['2S','4N'],'michaels'],[['P','1C','P','1H','1N'],'sandwich'],[['1H','X','2N'],'jordan'],[['1H','2N','3C'],'unusual-v-unusual'],[['1H','2S'],'weak-jump']]);
 assert.deepEqual(last(['1H','2N']).lengths,{C:5,D:5});
 assert.equal(last(['1C','P','1H','1N']).kind,'overcall');
 assert.equal(choose({S:'A Q J 8 7',H:'2',D:'K J 7 4 3',C:'7 2'},['1N']),'2S');
});
test('Lebensohl works over NT interference, weak-two doubles and reverses',()=>{
 meanings([[['1N','2H','2N'],'lebensohl'],[['2S','X','P','2N'],'lebensohl'],[['1C','P','1S','P','2H','P','2N'],'lebensohl'],[['1N','2H','2N','P','3C','P','3N'],'lebensohl-stopped'],[['1N','2H','3N'],'lebensohl-unstopped']]);
 assert.equal(choose({S:'8 5 2',H:'6 4 3',D:'K 8 4 3',C:'9 6 3'},['2S','X','P']),'2N');
});
test('passing a completed transfer does not become an artificial cue-bid',()=>{
 const a=last(['1N','P','4D','P','4H','P','P']);assert.equal(a.force,undefined);assert.equal(a.kind,undefined);
});
test('weak escape relays can be passed in the requested minor',()=>{
 assert.equal(choose({S:'8 4',H:'9 3',D:'9 6 3 2',C:'K 7 6 4 2'},['1N','X','XX','P','2C','P']),'P');
 assert.equal(choose({S:'8 4',H:'9 3',D:'9 6 3',C:'K 7 6 4 3 2'},['1N','2H','2N','P','3C','P']),'P');
 assert.equal(choose({S:'8 4',H:'9 3',D:'A K J 7 6 3',C:'9 6 3'},['1N','2C','P','2D','P']),'P');
});
test('a declined short-suit game try can stop at three of the major',()=>{
 assert.equal(choose({S:'Q J 8',H:'K 7 6',D:'9 4 2',C:'8 7 6 3'},['1S','P','2S','P','2N','P','3C','P','3S','P']),'P');
});
test('a DOPI pass retains its keycard meaning for the asker',()=>{
 const bids=['1S','P','2N','P','4S','P','4N','5C','P','P'];
 assert.equal(last(bids.slice(0,-1)).keyCounts[0],1);
 assert.equal(choose({S:'A K Q J 8',H:'A K 7',D:'A Q 4',C:'K 3'},bids),'7S');
});
