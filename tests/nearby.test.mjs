import test from 'node:test';
import assert from 'node:assert/strict';
import {NearbyTable,NEARBY_PROTOCOL} from '../native/shared/nearby-table.js';
import {bottomSeatFor,tablePosition} from '../native/shared/nearby-view.js';
import * as E from '../dist/engine.js';

const HOST='host';
const IDS=['north','east',HOST,'west'];
const rng=()=>{let seed=51973;return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};};
function table(options={}){
 return new NearbyTable({hostId:HOST,hostName:'Host',rng:rng(),...options});
}
function fourPlayers(t){
 t.join(IDS[0],'North');t.join(IDS[1],'East');t.join(IDS[3],'West');return t;
}
function act(t,id,type,fields={}){
 return t.action(id,{type,revision:t.view(id).revision,...fields});
}
function start(t){act(t,HOST,'start');return t;}
function contractDeal(declarer=2,suit='N'){
 return (_board,random)=>{
  const s=E.createDeal(declarer+1,random);
  [`1${suit}`,'P','P','P'].forEach(bid=>E.makeCall(s,bid));
  s.startContract=structuredClone(s.contract);return s;
 };
}
function legalIds(view){return view.legalCards.map(card=>typeof card==='string'?card:card.id);}
function playLegal(t,id){act(t,id,'play',{cardId:legalIds(t.view(id))[0]});}
function noCardsLeaked(view,cards){
 const wire=JSON.stringify(view);
 for(const card of cards)assert(!wire.includes(JSON.stringify(card.id)),`${card.id} leaked to seat ${view.you}`);
}
function finishMixedBoard(t){
 let decisions=0;
 while(t.state.phase!=='complete'){
  assert(decisions++<200,'The board must make progress and finish.');
  const host=t.view(HOST),before=JSON.stringify(t.state);
  if(t.state.phase==='bidding'&&host.legalCalls.length)act(t,HOST,'bid',{bid:host.legalCalls.includes('1N')?'1N':'P'});
  else if(t.state.phase==='play'&&host.legalCards.length)playLegal(t,HOST);
  else t.step();
  assert.notEqual(JSON.stringify(t.state),before,'A bot, human decision, or trick collection must advance the board.');
 }
}

test('nearby lobby reserves one seat per identity and only the host starts the table',()=>{
 const t=table(),initial=t.view(HOST);
 assert.equal(NEARBY_PROTOCOL,2);assert.equal(initial.protocol,NEARBY_PROTOCOL);assert.equal(initial.you,2);assert.equal(initial.host,true);
 assert.equal(initial.started,false);assert.equal(initial.state,null);
 assert.equal(initial.players.filter(p=>p.bot).length,3);
 t.join('guest','Guest');
 assert.equal(t.view('guest').you,0);assert.equal(t.view('guest').host,false);
 t.join('guest','Guest reconnected');
 assert.equal(t.view('guest').you,0);
 assert.equal(t.view(HOST).players.filter(p=>!p.bot).length,2);
 assert.throws(()=>act(t,'guest','start'));
 assert.throws(()=>t.action('stranger',{type:'start'}));
 assert.throws(()=>t.view('stranger'));
 assert.throws(()=>act(t,HOST,'seat',{seat:0}));
 act(t,HOST,'seat',{seat:1});
 assert.equal(t.view(HOST).you,1);assert.equal(t.view(HOST).players[2].bot,true);
 assert.throws(()=>act(t,HOST,'seat',{seat:-1}));
 assert.throws(()=>act(t,HOST,'seat',{seat:4}));
 assert.throws(()=>act(t,HOST,'seat',{seat:1.5}));
 start(t);
 assert.equal(t.view(HOST).started,true);
 assert.throws(()=>act(t,HOST,'seat',{seat:2}));
 assert.throws(()=>act(t,HOST,'start'));
 assert.throws(()=>t.join('late','Late arrival'));
});

test('nearby snapshots reveal only the player hand before the opening lead, including nested fields',()=>{
 const t=start(fourPlayers(table()));
 assert.throws(()=>t.join('fifth','Fifth player'));
 for(let seat=0;seat<4;seat++){
  const view=t.view(IDS[seat]);
  assert.equal(view.you,seat);
  assert.deepEqual(view.state.hands[seat],t.state.hands[seat]);
  for(let other=0;other<4;other++)if(other!==seat)assert.equal(view.state.hands[other],null);
  assert.equal(view.state.originalHands,undefined);
  assert.deepEqual(view.legalCalls,seat===t.state.turn?E.legalCalls(t.state.auction,seat):[]);
  assert.deepEqual(view.legalCards,[]);
  noCardsLeaked(view,t.state.hands.filter((_,other)=>other!==seat).flat());
 }
 // Mutating a received snapshot must never alter the authoritative table.
 const view=t.view(HOST),original=structuredClone(t.state);
 view.state.hands[2][0].rank=99;view.state.auction.push({bid:'7N'});
 view.players[0].name='Changed on a client';
 assert.deepEqual(t.state,original);
 assert.notEqual(t.view(HOST).players[0].name,'Changed on a client');
});

test('nearby rejects stale, out-of-turn, illegal, and client-authored state changes without advancing',()=>{
 const t=start(fourPlayers(table())),revision=t.view(IDS[0]).revision;
 const untouched=structuredClone(t.state);
 assert.throws(()=>act(t,HOST,'bid',{bid:'1C'}));
 assert.throws(()=>act(t,IDS[0],'bid',{bid:'8C'}));
 assert.throws(()=>act(t,IDS[0],'state',{state:{phase:'complete',result:{score:9999}}}));
 assert.deepEqual(t.state,untouched);assert.equal(t.view(HOST).revision,revision);
 act(t,IDS[0],'bid',{bid:'1C'});
 const after=structuredClone(t.state),now=t.view(HOST).revision;
 assert(now>revision);
 assert.throws(()=>t.action(IDS[0],{type:'bid',bid:'1C',revision}));
 assert.throws(()=>t.action(IDS[1],{type:'bid',bid:'P',revision}));
 assert.throws(()=>t.action(IDS[1],{type:'bid',bid:'P'}));
 assert.deepEqual(t.state,after);assert.equal(t.view(HOST).revision,now);
 act(t,IDS[1],'bid',{bid:'P'});
 assert.equal(t.state.auction.length,2);
});

test('nearby stops automated and human play while disconnected or backgrounded, then reconnects to the same seat',()=>{
 const t=table({dealFactory:contractDeal(2)});t.join('guest','Guest');start(t);
 t.setConnected('guest',false);
 assert.equal(t.view(HOST).paused,true);
 const before=structuredClone(t.state),revision=t.view(HOST).revision;
 t.step();assert.deepEqual(t.state,before);assert.equal(t.view(HOST).revision,revision);
 assert.throws(()=>act(t,HOST,'play',{cardId:t.state.hands[2][0].id}));
 t.join('guest','Guest');
 assert.equal(t.view('guest').you,0);assert.equal(t.view(HOST).paused,false);
 assert.throws(()=>t.join('intruder','Guest'));
 t.setActive(false);assert.equal(t.view(HOST).paused,true);
 t.step();assert.deepEqual(t.state,before);
 t.setActive(true);assert.equal(t.view(HOST).paused,false);
 t.step();assert.equal(t.state.trick.length,1);
});

test('only the host may replace a disconnected player with a bot, without opening the seat to a newcomer',()=>{
 const t=table({dealFactory:contractDeal(2)});t.join('guest','Guest');t.join('other','Other');start(t);
 assert.throws(()=>act(t,HOST,'replace',{seat:0}));
 t.setConnected('guest',false);
 assert.throws(()=>act(t,'other','replace',{seat:0}));
 assert.throws(()=>act(t,HOST,'replace',{seat:2}));
 act(t,HOST,'replace',{seat:0});
 assert.equal(t.view(HOST).players[0].bot,true);assert.equal(t.view(HOST).paused,false);
 assert.throws(()=>t.join('guest','Guest'));
 assert.throws(()=>t.view('guest'));
});

test('replacing a disconnected lobby guest also prevents their automatic reconnection',()=>{
 const t=table();t.join('guest','Guest');t.setConnected('guest',false);
 act(t,HOST,'replace',{seat:0});
 assert.throws(()=>t.join('guest','Guest'));
 assert.equal(t.view(HOST).players[0].bot,true);
});

test('each human dummy sees declarer only after the lead, while the human declarer alone plays both hands',()=>{
 for(let declarer=0;declarer<4;declarer++){
  const t=start(fourPlayers(table({dealFactory:contractDeal(declarer)})));
  const lead=(declarer+1)%4,dummy=(declarer+2)%4;
  assert.equal(t.view(IDS[lead]).controller,lead);
  assert.equal(t.view(IDS[declarer]).state.hands[dummy],null);
  assert.equal(t.view(IDS[dummy]).state.hands[declarer],null);
  noCardsLeaked(t.view(IDS[dummy]),t.state.hands[declarer]);
  playLegal(t,IDS[lead]);
  assert.equal(t.state.turn,dummy);
  for(const id of IDS)assert.deepEqual(t.view(id).state.hands[dummy],t.state.hands[dummy]);
  const declarerView=t.view(IDS[declarer]),dummyView=t.view(IDS[dummy]);
  assert.equal(declarerView.controller,declarer);
  assert.deepEqual(legalIds(declarerView),E.legalCards(t.state.hands[dummy],t.state.trick).map(c=>c.id));
  assert.deepEqual(dummyView.legalCards,[]);assert.deepEqual(dummyView.state.hands[declarer],t.state.hands[declarer]);
  assert.equal(bottomSeatFor(dummyView),dummy,'A human partner keeps their own seat at the bottom.');
  assert.equal(tablePosition(dummyView,declarer),0);
  for(const defender of [lead,(declarer+3)%4]){
   assert.equal(t.view(IDS[defender]).state.hands[declarer],null);
   noCardsLeaked(t.view(IDS[defender]),t.state.hands[declarer]);
  }
  assert.throws(()=>act(t,IDS[dummy],'play',{cardId:legalIds(declarerView)[0]}));
  playLegal(t,IDS[declarer]);assert.equal(t.state.trick.length,2);
  playLegal(t,IDS[(declarer+3)%4]);
  assert.equal(t.view(IDS[dummy]).controller,declarer);
  assert.deepEqual(t.view(IDS[dummy]).legalCards,[]);
  assert.throws(()=>act(t,IDS[dummy],'play',{cardId:legalIds(t.view(IDS[declarer]))[0]}));
  playLegal(t,IDS[declarer]);assert.equal(t.state.trick[3].seat,declarer);
 }
});

test('human dummy controls both bot-declarer partnership hands after the lead in every seat, with a rotated view',()=>{
 for(let declarer=0;declarer<4;declarer++){
  const dummy=(declarer+2)%4,lead=(declarer+1)%4,otherDefender=(declarer+3)%4;
  const t=table({dealFactory:contractDeal(declarer)});
  act(t,HOST,'seat',{seat:dummy});
  t.join('defender','Defender');act(t,'defender','seat',{seat:lead});
  assert.equal(bottomSeatFor(t.view(HOST)),dummy);
  start(t);
  const beforeLead=t.view(HOST);
  assert.equal(beforeLead.state.hands[declarer],null);assert.deepEqual(beforeLead.legalCards,[]);
  noCardsLeaked(beforeLead,t.state.hands[declarer]);
  assert.equal(bottomSeatFor(beforeLead),dummy);
  assert.equal(tablePosition(beforeLead,dummy),2);
  playLegal(t,'defender');
  const view=t.view(HOST);
  assert.deepEqual(view.state.hands[declarer],t.state.hands[declarer]);
  assert.equal(view.controller,dummy);
  assert.deepEqual(legalIds(view),E.legalCards(t.state.hands[dummy],t.state.trick).map(c=>c.id));
  assert.equal(t.view('defender').state.hands[declarer],null);
  noCardsLeaked(t.view('defender'),t.state.hands[declarer]);
  assert.equal(bottomSeatFor(view),declarer);
  assert.equal(tablePosition(view,declarer),2);assert.equal(tablePosition(view,dummy),0);
  assert.equal(tablePosition(view,lead),3);assert.equal(tablePosition(view,otherDefender),1);
  let before=structuredClone(t.state),revision=view.revision;
  assert.equal(t.step(),false);assert.deepEqual(t.state,before);assert.equal(t.view(HOST).revision,revision);
  assert.throws(()=>act(t,'defender','play',{cardId:legalIds(view)[0]}));
  playLegal(t,HOST);assert.equal(t.state.trick[1].seat,dummy);
  assert.equal(t.step(),true);assert.equal(t.state.trick[2].seat,otherDefender);
  assert.equal(t.state.turn,declarer);assert.equal(t.view(HOST).controller,dummy);
  assert.deepEqual(legalIds(t.view(HOST)),E.legalCards(t.state.hands[declarer],t.state.trick).map(c=>c.id));
  before=structuredClone(t.state);revision=t.view(HOST).revision;
  assert.equal(t.step(),false);assert.deepEqual(t.state,before);assert.equal(t.view(HOST).revision,revision);
  playLegal(t,HOST);assert.equal(t.state.trick[3].seat,declarer);
  assert.equal(t.view('defender').state.hands[declarer],null);
  noCardsLeaked(t.view('defender'),t.state.hands[declarer]);
 }
});

test('nearby perspective keeps bidding seats unchanged and does not rotate a defender',()=>{
 const t=start(fourPlayers(table()));
 for(let you=0;you<4;you++){
  const view=t.view(IDS[you]);assert.equal(bottomSeatFor(view),you);
  assert.equal(tablePosition(view,you),2);assert.equal(tablePosition(view,(you+2)%4),0);
 }
 const defending=table({dealFactory:contractDeal(0)});
 act(defending,HOST,'seat',{seat:1});start(defending);playLegal(defending,HOST);
 assert.equal(bottomSeatFor(defending.view(HOST)),1);
 assert.equal(tablePosition(defending.view(HOST),3),0);
 assert.equal(defending.view(HOST).state.hands[0],null);
});

test('a disconnected human dummy pauses both hands until replaced, then both partnership hands resume as bots',()=>{
 const t=table({dealFactory:contractDeal(1)});
 t.join('dummy','Dummy');act(t,'dummy','seat',{seat:3});start(t);
 playLegal(t,HOST);assert.equal(t.state.turn,3);assert.equal(t.view('dummy').controller,3);
 t.setConnected('dummy',false);
 assert.equal(t.view(HOST).paused,true);assert.deepEqual(t.view('dummy').legalCards,[]);
 const before=structuredClone(t.state);
 assert.equal(t.step(),false);assert.deepEqual(t.state,before);
 t.setConnected('dummy',true);
 assert.equal(t.view('dummy').controller,3);assert(t.view('dummy').legalCards.length>0);
 assert.equal(t.step(),false);
 t.setConnected('dummy',false);act(t,HOST,'replace',{seat:3});
 assert.equal(t.view(HOST).paused,false);assert.equal(t.view(HOST).controller,1);
 assert.equal(t.step(),true);assert.equal(t.state.trick[1].seat,3);
 assert.equal(t.step(),true);assert.equal(t.state.trick[2].seat,0);
 assert.equal(t.step(),true);assert.equal(t.state.trick[3].seat,1);
 assert.throws(()=>t.join('dummy','Dummy'));
});

test('replacing a disconnected human declarer transfers both hands to human dummy only after replacement',()=>{
 const t=table({dealFactory:contractDeal(0)});t.join('declarer','Declarer');start(t);
 t.step();assert.equal(t.state.turn,2);
 assert.equal(t.view(HOST).controller,0);assert.deepEqual(t.view(HOST).legalCards,[]);
 assert.deepEqual(t.view(HOST).state.hands[0],t.state.hands[0]);
 assert(t.view('declarer').legalCards.length>0);
 t.setConnected('declarer',false);
 const before=structuredClone(t.state),paused=t.view(HOST);
 assert.equal(paused.paused,true);assert.equal(paused.controller,0);
 assert.deepEqual(paused.legalCards,[]);
 assert.equal(t.step(),false);assert.deepEqual(t.state,before);
 assert.throws(()=>act(t,HOST,'play',{cardId:E.legalCards(t.state.hands[2],t.state.trick)[0].id}));
 act(t,HOST,'replace',{seat:0});
 const transferred=t.view(HOST);
 assert.equal(transferred.paused,false);assert.equal(transferred.players[0].bot,true);
 assert.equal(transferred.controller,2);assert.equal(bottomSeatFor(transferred),0);
 assert.deepEqual(legalIds(transferred),E.legalCards(t.state.hands[2],t.state.trick).map(card=>card.id));
 assert.equal(t.step(),false);playLegal(t,HOST);assert.equal(t.state.trick[1].seat,2);
 assert.equal(t.step(),true);assert.equal(t.state.trick[2].seat,3);
 assert.equal(t.state.turn,0);assert.equal(t.view(HOST).controller,2);
 assert.equal(t.step(),false);playLegal(t,HOST);assert.equal(t.state.trick[3].seat,0);
 assert.throws(()=>t.join('declarer','Declarer'));
});

test('human dummy can finish a full bot-declarer board, and replay restores concealed hands and the original perspective',()=>{
 const t=start(table({dealFactory:contractDeal(0)})),original=structuredClone(t.state.originalHands);
 finishMixedBoard(t);
 assert.equal(t.state.history.length,13);assert.equal(t.state.hands.flat().length,0);
 assert.equal(new Set(t.state.history.flatMap(trick=>trick.cards.map(play=>play.card.id))).size,52);
 assert.deepEqual(t.view(HOST).state.originalHands,original);
 assert.equal(bottomSeatFor(t.view(HOST)),2);
 const score=t.state.result.nsScore;assert.deepEqual(t.totals,[score,-score]);
 act(t,HOST,'replay');
 const replay=t.view(HOST);
 assert.deepEqual(t.state.hands,original);assert.equal(replay.state.dummyExposed,false);
 assert.equal(replay.state.hands[0],null);assert.equal(replay.state.originalHands,undefined);
 noCardsLeaked(replay,t.state.hands[0]);assert.equal(bottomSeatFor(replay),2);
 assert.deepEqual(t.totals,[0,0]);assert.deepEqual(replay.legalCards,[]);
 t.step();assert.equal(bottomSeatFor(t.view(HOST)),0);assert.equal(t.view(HOST).controller,2);
 assert.deepEqual(t.view(HOST).state.hands[0],t.state.hands[0]);
});

test('nearby enforces follow suit and refuses to play cards from an unauthorized hand',()=>{
 const t=start(fourPlayers(table({dealFactory:contractDeal(2)})));
 const lead=t.state.hands[3].find(card=>t.state.hands[0].some(c=>c.suit===card.suit)&&t.state.hands[0].some(c=>c.suit!==card.suit));
 assert(lead,'Fixture must leave dummy both a following card and an off-suit card.');
 act(t,IDS[3],'play',{cardId:lead.id});
 const illegal=t.state.hands[0].find(card=>card.suit!==lead.suit);
 const before=structuredClone(t.state),revision=t.view(HOST).revision;
 assert.throws(()=>act(t,HOST,'play',{cardId:illegal.id}));
 assert.throws(()=>act(t,HOST,'play',{cardId:t.state.hands[2][0].id}));
 assert.deepEqual(t.state,before);assert.equal(t.view(HOST).revision,revision);
 playLegal(t,HOST);assert.equal(t.state.trick[1].card.suit,lead.suit);
});

test('a complete mixed human/bot board preserves 52 cards, reveals all hands, and scores exactly once',()=>{
 const t=start(table({dealFactory:contractDeal(2)})),original=structuredClone(t.state.originalHands);
 assert.throws(()=>act(t,HOST,'next'));assert.throws(()=>act(t,HOST,'replay'));
 finishMixedBoard(t);
 assert.equal(t.state.history.length,13);assert.equal(t.state.tricks[0]+t.state.tricks[1],13);
 assert.equal(new Set(t.state.history.flatMap(trick=>trick.cards.map(play=>play.card.id))).size,52);
 assert.equal(t.state.hands.flat().length,0);
 const view=t.view(HOST),score=t.state.result.nsScore;
 assert.deepEqual(view.state.originalHands,original);
 assert(view.state.hands.every(Array.isArray));assert.deepEqual(view.legalCards,[]);assert.deepEqual(view.legalCalls,[]);
 assert.deepEqual(t.totals,[score,-score]);
 const revision=view.revision;
 for(let i=0;i<3;i++)t.step();
 assert.deepEqual(t.totals,[score,-score]);assert.equal(t.view(HOST).revision,revision);
 act(t,HOST,'replay');
 assert.deepEqual(t.state.originalHands,original);assert.deepEqual(t.state.hands,original);
 assert.deepEqual(t.totals,[0,0]);assert.equal(t.view(HOST).state.originalHands,undefined);
 finishMixedBoard(t);
 const totals=[...t.totals];act(t,HOST,'next');
 assert.deepEqual(t.totals,totals);assert.notEqual(t.state.phase,'complete');
});

test('all-pass boards complete and reveal cards, but only the host can move on',()=>{
 const t=start(fourPlayers(table()));
 for(const id of [IDS[0],IDS[1],HOST,IDS[3]])act(t,id,'bid',{bid:'P'});
 assert.equal(t.state.phase,'complete');assert.equal(t.state.result.passedOut,true);
 assert.equal(t.view(IDS[1]).state.originalHands.flat().length,52);assert.deepEqual(t.totals,[0,0]);
 assert.throws(()=>act(t,IDS[1],'next'));assert.throws(()=>act(t,IDS[1],'replay'));
 const board=t.state.board;act(t,HOST,'next');assert.equal(t.state.board,board+1);
});
