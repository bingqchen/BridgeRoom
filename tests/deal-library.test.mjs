import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHands,blankFields,handsToFields,fillEmptyHand,validateSetup,customDeal,setupFromDeal,DealLibrary,LIBRARY_KEY,newRecord,encodeLibrary,decodeLibrary} from '../dist/deal-library.js';
import {TableSession,replayDeal} from '../dist/session.js';
import {playBotBoard,compareWithBots} from '../dist/duplicate.js';
import * as E from '../dist/engine.js';
const fields=()=>[
 {S:'AKQJ',H:'10 9 8',D:'765',C:'432'},
 {S:'T98',H:'765',D:'432',C:'AKQJ'},
 {S:'765',H:'432',D:'AKQJ',C:'T98'},
 {S:'432',H:'AKQJ',D:'T98',C:'765'}
];
const setup=(contract=null)=>({hands:parseHands(fields()).hands,dealer:3,vulnerable:[true,false],contract});
function memory(){const items=new Map();return {items,getItem:k=>items.get(k)??null,setItem:(k,v)=>items.set(k,v)};}
test('rank entry accepts spaces, commas, lowercase and 10; counts every unique card',()=>{
 const f=fields();f[0].S='a, k q j';const before=structuredClone(f),p=parseHands(f);
 assert.equal(p.valid,true);assert.deepEqual(p.counts,[13,13,13,13]);assert.deepEqual(p.points,[10,10,10,10]);assert.equal(p.missing.length,0);assert.equal(new Set(p.hands.flat().map(c=>c.id)).size,52);
 assert.equal(p.hands[0].find(c=>c.id==='H10').rank,10);assert.deepEqual(f,before);
 assert.equal(parseHands(handsToFields(p.hands)).valid,true);
});
test('invalid characters, duplicate cards, incomplete and oversized hands cannot start',()=>{
 const f=fields();f[1].S='AT9';const duplicate=parseHands(f);assert.equal(duplicate.valid,false);assert(duplicate.errors.some(e=>e.includes('repeated')));
 f[1].S='T98Z';assert(parseHands(f).errors.some(e=>e.includes('use A K Q')));
 f[1].S='T98A';assert(parseHands(f).errors.some(e=>e.includes('currently 14')));
 const blank=blankFields();blank[0].S='—';assert.equal(parseHands(blank).counts[0],0);assert.equal(parseHands(blank).missing.length,52);
 assert.throws(()=>customDeal({...setup(),hands:duplicate.hands}),/exactly once/);
 const bad=setup();bad.hands[0][0].rank=15;assert.throws(()=>validateSetup(bad),/invalid card/);
 assert.throws(()=>validateSetup({...setup(),vulnerable:['yes',false]}),/vulnerability/);
 assert.throws(()=>validateSetup({...setup(),dealer:4}),/dealer/);
 assert.throws(()=>validateSetup(setup({level:8,suit:'N',declarer:2,doubled:1})),/contract/);
});
test('auto-fill completes only a wholly empty fourth hand and never changes entered cards',()=>{
 const f=fields(),expected=parseHands(f).hands[3];f[3]={S:'',H:'',D:'',C:''};const before=structuredClone(f),filled=fillEmptyHand(f);
 assert.deepEqual(parseHands(filled).hands[3],expected);assert.deepEqual(f,before);
 assert.throws(()=>fillEmptyHand(blankFields()),/three complete/);
 f[3].S='4';assert.throws(()=>fillEmptyHand(f),/three complete/);
 f[3].S='';f[0].S='AAQJ';assert.throws(()=>fillEmptyHand(f),/three complete/);
});
test('custom deals preserve exact seats and chosen metadata, with either bidding or opening lead',()=>{
 const spec=setup(),d=customDeal(spec,42,'Manual practice');
 assert.deepEqual(d.hands,spec.hands);assert.equal(d.dealer,3);assert.equal(d.turn,3);assert.deepEqual(d.vulnerable,[true,false]);assert.equal(d.phase,'bidding');assert.equal(d.contract,null);
 for(let declarer=0;declarer<4;declarer++){
  const c={level:3,suit:'N',declarer,doubled:2,dummy:99},fixed=customDeal(setup(c),43);
  assert.equal(fixed.phase,'play');assert.equal(fixed.turn,(declarer+1)%4);assert.equal(fixed.contract.dummy,(declarer+2)%4);assert.equal(fixed.dummyExposed,false);assert.equal(fixed.auction.length,0);
  assert.deepEqual(Object.keys(E.playView(fixed).knownHands),[String(fixed.turn)]);
  fixed.hands[0].pop();assert.equal(fixed.originalHands[0].length,13);assert.equal(spec.hands[0].length,13);
 }
});
test('library saves, updates, reloads, removes and restores independent full deal copies',()=>{
 const storage=memory(),library=new DealLibrary(storage),d=library.save('Defense practice',setup());
 d.setup.hands[0].pop();assert.equal(library.list()[0].setup.hands[0].length,13);
 const reload=new DealLibrary(storage);assert.equal(reload.list()[0].name,'Defense practice');
 const id=reload.list()[0].id;reload.save('Renamed',setup({level:4,suit:'H',declarer:0,doubled:1}),id);assert.equal(reload.list().length,1);assert.equal(reload.list()[0].setup.contract.suit,'H');
 const removed=reload.remove(id);assert.equal(reload.list().length,0);reload.restore(removed);assert.equal(reload.list()[0].name,'Renamed');
 assert.throws(()=>reload.save(' ',setup()),/name/);assert.equal(reload.list().length,1);
});
test('imports merge safely, preserve changed ID collisions, and reject invalid batches atomically',()=>{
 const library=new DealLibrary(memory()),a=library.save('One',setup()),exported=library.export();
 assert.equal(library.import(exported),0);assert.equal(library.list().length,1);
 const conflict=structuredClone(a);conflict.name='A different deal';assert.equal(library.import(encodeLibrary([conflict])),1);assert.equal(library.list().length,2);assert.equal(new Set(library.list().map(x=>x.id)).size,2);
 const fresh=newRecord('Two',setup()),bad=newRecord('Invalid',setup());bad.setup.hands[0].pop();const before=library.export();
 assert.throws(()=>library.import(JSON.stringify({version:1,deals:[fresh,bad]})),/13 cards/);assert.equal(library.export(),before);
 const other=new DealLibrary(memory());assert.equal(other.import(exported),1);assert.deepEqual(other.list()[0],a);
 assert.throws(()=>decodeLibrary('{bad'),/valid JSON/);assert.throws(()=>decodeLibrary('{"version":2,"deals":[]}'),/Bridge Room/);
 assert.throws(()=>decodeLibrary(JSON.stringify({version:1,deals:[a,a]})),/repeated deal IDs/);
});
test('corrupt or unavailable storage never reports a successful save or overwrites data',()=>{
 const storage=memory();storage.setItem(LIBRARY_KEY,'broken');const broken=new DealLibrary(storage);
 assert(broken.blocked);assert.throws(()=>broken.save('One',setup()));assert.equal(storage.getItem(LIBRARY_KEY),'broken');
 const unavailable=new DealLibrary(undefined);assert.throws(()=>unavailable.save('One',setup()));assert.equal(customDeal(setup()).phase,'bidding');
 const full=memory(),lib=new DealLibrary(full);full.setItem=()=>{throw Error('Quota exceeded');};assert.throws(()=>lib.save('One',setup()),/Could not save/);assert.equal(lib.list().length,0);
});
test('a stale library tab cannot silently overwrite another tab’s saved deals',()=>{
 const storage=memory(),a=new DealLibrary(storage),b=new DealLibrary(storage);a.save('First tab',setup());
 assert.throws(()=>b.save('Second tab',setup()),/another tab/);assert.equal(new DealLibrary(storage).list().length,1);
 b.reload();b.save('Second tab',setup());assert.equal(new DealLibrary(storage).list().length,2);
});
test('load starts a new board, while replay and undo preserve the chosen contract and prior scores',()=>{
 const session=new TableSession(),completed=customDeal(setup());completed.phase='complete';completed.result={nsScore:100};session.recordScore(completed);
 session.snapshots.push(completed);const state=session.start(customDeal(setup({level:2,suit:'H',declarer:1,doubled:4}),2,'Custom contract'));
 assert.deepEqual(session.totals,[100,-100]);assert.equal(session.canUndo,false);assert.equal(session.scored,false);
 const before=structuredClone(state),id=E.legalCards(state.hands[state.turn],state.trick)[0].id;session.act(state,s=>E.playCard(s,id));assert.equal(state.dummyExposed,true);
 assert.deepEqual(session.undo(),before);assert.deepEqual(session.replay(state),before);assert.deepEqual(session.totals,[100,-100]);
 assert.deepEqual(setupFromDeal(state).hands,before.originalHands);assert.deepEqual(setupFromDeal(state).contract,before.startContract);
 const next=session.skip(state,()=>.5,{southHighestHcp:true});assert.equal(next.startContract,undefined);assert.equal(next.phase,'bidding');
});
test('four-bot replay honors a supplied contract and leaves the saved starting deal untouched',()=>{
 const state=customDeal(setup({level:3,suit:'N',declarer:2,doubled:1}),7,'Notrump practice'),before=structuredClone(state),bot=playBotBoard(state);
 assert.deepEqual(state,before);assert.deepEqual(bot.contract,state.contract);assert.deepEqual(bot.auction,[]);assert.equal(bot.history.length,13);assert.deepEqual(bot.originalHands,state.originalHands);assert.deepEqual(bot.vulnerable,state.vulnerable);
 const same=compareWithBots(bot);assert.equal(same.pointDifference,0);assert.equal(same.imps,0);
 assert.deepEqual(replayDeal(bot),before);
});
