import {SUITS,SYMBOLS,SEATS,BIDS,side,partner,rankName,cardName,bidName,hcp,totalPoints,interpret,shape,lastBid,isGame,createDeal,legalCalls,makeCall,legalCards,playCard,collectTrick,botBid,botCard,botAnalysis,trickWinner} from './engine.js';
import {compareWithBots} from './duplicate.js';
import {systemCard} from './gib-system-card.js';
import {TableSession} from './session.js';
import {setupOffline} from './offline.js';
import {activeSeat} from './turn-state.js';
import {claimAvailable,claimRemaining} from './claim.js';
import {bindBidPreview} from './bid-preview.js';
import {completedDealMarkup} from './completed-deal.js';
import {customDeal} from './deal-library.js';
import {setupDealLibrary} from './deal-library-ui.js';
const $=s=>document.querySelector(s);
const session=new TableSession(),totals=session.totals,comparisonTotals=session.comparisonTotals;
let southHighestHcp=false,preferencesSaved=true;
try{southHighestHcp=localStorage.getItem('bridge-room.southHighestHcp')==='true';}catch{preferencesSaved=false;}
const dealOptions=()=>({southHighestHcp});
let state=createDeal(1,Math.random,dealOptions()),selectedLevel=null,timer=null,paused=false,explanation=null;
const signed=n=>n>0?'+'+n:String(n);
const seatIds=['north','east','south-seat','west'];
const mobileLayout=window.matchMedia('(max-width: 700px)');
let activePanel=null;
let libraryOpen=false;
let releaseBidPreviews=()=>{};
const DISPLAY_SUITS=['S','H','C','D'];
const displaySuitOrder=()=>{const start=DISPLAY_SUITS.indexOf(state.contract?.suit);return start>0?[...DISPLAY_SUITS.slice(start),...DISPLAY_SUITS.slice(0,start)]:DISPLAY_SUITS;};
const sortVisibleHand=hand=>{const order=displaySuitOrder();return [...hand].sort((a,b)=>order.indexOf(a.suit)-order.indexOf(b.suit)||b.rank-a.rank);};
const red=s=>['H','D'].includes(s)?'red':'';
const bidHTML=b=>BIDS.includes(b)?`${b[0]}<span class="${red(b[1])}">${SYMBOLS[b[1]]}</span>`:b==='P'?'Pass':b==='X'?'X':b==='XX'?'XX':'';
const contractText=(c=state.contract)=>c?`${c.level}${SYMBOLS[c.suit]}${c.doubled===2?' X':c.doubled===4?' XX':''} by ${SEATS[c.declarer]}`:'Passed out';
const humanTurn=()=>state.phase==='bidding'?state.turn===2:state.phase==='play'&&state.trick.length<4&&(state.turn===2||side(state.contract.declarer)===0&&side(state.turn)===0);
// Rotate the view, keeping all bridge seats and game rules unchanged.
const bottomSeat=()=>state.phase!=='bidding'&&state.contract?.dummy===2?0:2;
const tablePosition=seat=>(seat-bottomSeat()+6)%4;
const westDummy=()=>state.phase==='play'&&state.dummyExposed&&state.contract?.declarer===1;
const eastDummy=()=>state.phase==='play'&&state.dummyExposed&&state.contract?.declarer===3;
const showDummy=seat=>state.contract&&state.dummyExposed&&seat!==bottomSeat()&&state.contract.dummy===seat;
function cardMarkup(c,{enabled=false,dim=false,small=false,extra=''}={}){return `<button class="${small?'mini-card':'playing-card'} ${red(c.suit)} ${enabled?'playable':''} ${dim?'unplayable':''} ${extra}" data-card="${c.id}" aria-label="${rankName(c.rank)} of ${{S:'spades',H:'hearts',D:'diamonds',C:'clubs'}[c.suit]}" ${enabled?'':'disabled'}>${small?cardName(c):`<span class="rank ${c.rank===10?'ten':''}">${rankName(c.rank)}</span><span class="suit">${SYMBOLS[c.suit]}</span><span class="pip">${SYMBOLS[c.suit]}</span>`}</button>`;}
function updateScores(){
 if(state.phase==='complete'&&!session.scored){
  session.recordScore(state);
  finishComparison();
 }
 $('#ns-score').textContent=signed(totals[0]);$('#ew-score').textContent=signed(totals[1]);
}
function finishComparison(){
 if(session.comparison)return;
 try{session.recordComparison(compareWithBots(state));}
 catch(error){console.error('Bot comparison failed:',error);}
}
function resultText(table){
 if(table.result.passedOut)return 'Four passes · 0 points';
 const delta=table.result.delta;
 return `${table.result.tricks} tricks${table.claim?' ('+table.claim.tricks+' claimed)':''} · ${delta<0?'Down '+(-delta):delta===0?'Made exactly':'Made +'+delta}`;
}
function comparisonMarkup(){
 const comparison=session.comparison;
 if(!comparison)return `<p class="comparison-note" role="status">The bot comparison could not finish. Your table’s score is ${signed(state.result.nsScore||0)} N/S.</p><button class="small-button" id="retry-comparison">Retry comparison</button>`;
 const {yourScore,botScore,pointDifference,imps,botTable}=comparison;
 return `<p class="comparison-caption">Same deal · scores from N/S’s side</p><div class="comparison-tables">${[[state,'Your table',yourScore],[botTable,'Four bots',botScore]].map(([table,label,score])=>`<div class="comparison-table"><span>${label}</span><strong>${signed(score)}</strong><b>${contractText(table.contract)}</b><small>${resultText(table)}</small></div>`).join('')}</div><div class="comparison-swing ${pointDifference>0?'ahead':pointDifference<0?'behind':'tied'}"><div><span>Point difference</span><strong>${signed(pointDifference)}</strong></div><div><span>This board</span><strong>${signed(imps)} <small>IMPs</small></strong></div></div><p class="comparison-session">Session: <strong>${signed(comparisonTotals.imps)} IMPs</strong> · ${comparisonTotals.boards} ${comparisonTotals.boards===1?'board':'boards'}</p><button class="small-button" id="compare-details">Bot auction &amp; play</button>`;
}

function render(){
 document.body.dataset.phase=state.phase;
 const active=activeSeat(state);
 $('#table').dataset.turn=active===null?'none':['north','east','south','west'][tablePosition(active)];
 $('#turn-status').textContent=active===null?(state.phase==='complete'?'Board complete':'Trick complete'): `${SEATS[active]}${active===2?' · you':''} ${state.phase==='bidding'?'to bid':'to play'}${paused?' · paused':''}`;
 $('#turn-status').classList.toggle('is-active',active!==null);
 $('#table').classList.toggle('west-dummy',westDummy());
 $('#table').classList.toggle('east-dummy',eastDummy());
 const controlHome=mobileLayout.matches&&state.phase!=='play'?$(state.phase==='complete'?'#mobile-results':'#mobile-bidding'):$('#controls-home');
 if($('#controls').parentElement!==controlHome)controlHome.append($('#controls'));
 const auctionHome=state.phase==='bidding'?$('#table-auction'):$('#auction-home');
 if($('.auction-section').parentElement!==auctionHome)auctionHome.append($('.auction-section'));
 updateScores();const complete=state.phase==='complete';
 $('#completed-deal').hidden=!complete;
 $('#completed-deal').innerHTML=completedDealMarkup(state,displaySuitOrder());
 $('#board-label').textContent=`Board ${String(state.board).padStart(2,'0')}`;$('#vulnerability').textContent=state.vulnerable.every(Boolean)?'Both vulnerable':state.vulnerable[0]?'N/S vulnerable':state.vulnerable[1]?'E/W vulnerable':'Neither vulnerable';
 const legal=state.phase==='play'&&state.trick.length<4?legalCards(state.hands[state.turn],state.trick).map(c=>c.id):[];
 for(let seat=0;seat<4;seat++){
  const el=$('#'+seatIds[tablePosition(seat)]);const dummy=showDummy(seat);el.classList.toggle('active',active===seat);el.setAttribute('aria-label',`${SEATS[seat]}${active===seat?', '+(state.phase==='bidding'?'to bid':'to play'):''}`);el.classList.toggle('dummy',dummy);
  let role=seat===0?'YOUR PARTNER':seat===2?'SOUTH · YOU':'BOT';if(state.contract){if(seat===state.contract.declarer)role=seat===bottomSeat()?'DECLARER · YOU PLAY':'DECLARER';if(seat===state.contract.dummy)role='DUMMY';}
  el.innerHTML=`<div class="seat-name"><div class="avatar">${SEATS[seat][0]}</div>${state.dealer===seat?'<span class="dealer-tag" title="Dealer">D</span>':''}</div><div><strong>${seat===2&&bottomSeat()===2?'You':SEATS[seat]}</strong><small>${role}</small>${active===seat?`<span class="turn-badge">${state.phase==='bidding'?'To bid':'To play'}</span>`:''}</div>${dummy?`<div class="dummy-hand">${sortVisibleHand(state.hands[seat]).map(c=>cardMarkup(c,{small:true,enabled:humanTurn()&&state.turn===seat&&legal.includes(c.id)})).join('')}</div>`:''}`;
 }
 $('#phase-chip').textContent=complete?'Result':state.phase==='bidding'?(paused?'Paused':state.turn===2?'Your call':SEATS[state.turn]+' to bid'):'Playing';
 if(state.phase==='bidding'){
  $('#center').innerHTML=`<div class="compass"><span>♠</span></div><div class="center-caption">THE AUCTION</div><div class="center-title">${state.turn===2?'Your call.':SEATS[state.turn]+' to bid.'}</div><div class="center-sub">${lastBid(state.auction)?'Current bid · '+bidHTML(lastBid(state.auction).bid):'Find your contract together.'}</div>`;
 }else if(complete){
  $('#center').innerHTML=`<div class="center-caption">BOARD COMPLETE</div><div class="center-title">${state.result.passedOut?'Passed out.':state.result.delta>=0?'Contract made.':'Contract defeated.'}</div><div class="center-sub">${state.result.passedOut?'Four passes. A fresh deal awaits.':contractText()+' · '+state.result.tricks+' tricks'}</div>`;
 }else{
  $('#center').innerHTML=state.trick.length?`<div class="trick-grid">${state.trick.map(x=>cardMarkup(x.card,{extra:'trick-card '+['n','e','s','w'][tablePosition(x.seat)]})).join('')}</div><div class="center-sub">${state.trick.length===4?SEATS[trickWinner(state.trick,state.contract.suit)]+' wins the trick':`Trick ${state.history.length+1} of 13`}</div>`:`<div class="center-caption">${state.history.length?'TRICK '+(state.history.length+1):'OPENING LEAD'}</div><div class="center-title">${humanTurn()?(state.turn===bottomSeat()?'Your lead.':'Dummy leads.'):SEATS[state.turn]+' leads.'}</div><div class="center-sub">${contractText()}</div>`;
 }
 $('#table-label').hidden=true;
 const mainSeat=bottomSeat();
 $('.hand-zone').classList.toggle('active-hand',active===mainSeat);
 $('#mobile-dummy').classList.toggle('active-hand',state.phase==='play'&&active===state.contract?.dummy);
 $('#hand-title').textContent=mainSeat===0?(complete?'North’s original hand':'North’s hand · declarer'):(complete?'Your original hand':'Your hand');
 $('#hand-description').textContent=mainSeat===0?'NORTH · YOU PLAY':'SOUTH · YOU';
 $('.hand-zone').setAttribute('aria-label',mainSeat===0?'North’s declaring hand':'Your hand');
 $('.table-footer span').textContent=complete?'All four original hands are shown. Replay this deal or start a new board.':mainSeat===0?'You’re playing North. South is dummy.':'North is your partner. East & West are the opponents.';
 const cards=sortVisibleHand(complete?state.originalHands[mainSeat]:state.hands[mainSeat]);$('#hand-stats').title='High-card points · GIB total points · shape in ♠ ♥ ♦ ♣ order';$('#hand-stats').textContent=`${hcp(cards)} HCP · ${totalPoints(cards)} TP · ${['S','H','D','C'].map(s=>shape(cards)[s]).join('–')}`;
 $('#hand').innerHTML=cards.map(c=>cardMarkup(c,{enabled:humanTurn()&&state.turn===mainSeat&&legal.includes(c.id),dim:state.phase==='play'&&state.turn===mainSeat&&!legal.includes(c.id)})).join('');
 $('#hand-note').textContent=complete?'Review the deal, or take your seat for the next board.':state.phase==='bidding'?'Your cards are sorted ♠ ♥ ♣ ♦. HCP: A = 4, K = 3, Q = 2, J = 1.':humanTurn()?(state.turn===mainSeat?'Select a highlighted card to play.':`Play a card from ${SEATS[state.turn]}’s dummy hand above.`):(state.trick.length===4?'Trick complete.':SEATS[state.turn]+' is choosing a card.');
 renderAuction();renderControls();renderMobile(legal);
 $('#undo-button').disabled=!session.canUndo;
 $('#claim-button').hidden=state.phase!=='play';
 $('#claim-button').disabled=!claimAvailable(state);
 $('#claim-button').title=claimAvailable(state)?'Claim every remaining trick, only if guaranteed against every East/West distribution':'Available on your turn when North/South declares and dummy is exposed';
 $('#replay-button').disabled=state.auction.length===0&&state.history.length===0&&state.trick.length===0;
 $('#replay-button').title=state.startContract?'Restart this deal at the chosen contract':'Restart this same deal from the auction';
 const auction=$('#auction');auction.scrollTop=auction.scrollHeight;
 document.querySelectorAll('[data-card]').forEach(el=>{if(!el.disabled)el.addEventListener('click',()=>humanPlay(el.dataset.card));});
}
function renderAuction(){
 const start=[3,0,1,2].indexOf(state.dealer);const cells=Array(start).fill('<div></div>');state.auction.forEach((c,i)=>cells.push(`<button class="call ${c.bid==='P'?'pass':''} ${i===state.auction.length-1?'latest':''}" data-call="${i}" aria-label="${SEATS[c.seat]}: ${bidName(c.bid)}. Show explanation">${bidHTML(c.bid)}</button>`));
 if(state.phase==='bidding')cells.push(`<div class="call next-call" aria-label="${SEATS[state.turn]} to bid">To bid</div>`);
 const auction=$('#auction');auction.innerHTML=[3,0,1,2].map(seat=>`<div class="auction-label ${seat===2?'you':''} ${state.phase==='bidding'&&state.turn===seat?'to-bid':''}">${SEATS[seat]}${state.dealer===seat?'<span class="auction-dealer" title="Dealer">D</span>':''}</div>`).join('')+cells.join('');
 const c=explanation===null?state.auction.at(-1):state.auction[explanation];$('#bid-explanation').textContent=c?`${SEATS[c.seat]} · ${bidName(c.bid)} — ${c.reason}`:state.startContract?`Chosen contract: ${contractText(state.startContract)}. This deal starts directly from the opening lead, with no auction.`:'North is your partner. The dealer makes the first call.';
 document.querySelectorAll('[data-call]').forEach(el=>el.onclick=()=>{explanation=Number(el.dataset.call);renderAuction();});
 if(activePanel==='auction')renderAuctionPanel();
}
function renderControls(){
 releaseBidPreviews();releaseBidPreviews=()=>{};
 const el=$('#controls');el.removeAttribute('aria-label');if(state.phase==='complete'){
  el.innerHTML=`<h3>Board ${state.board} · duplicate result</h3>${state.claim?`<p class="claim-note">Claim accepted · ${state.claim.tricks} remaining tricks to N/S.</p>`:''}${comparisonMarkup()}<button class="primary" id="next-board">Next board</button><div class="result-actions"><button class="small-button" id="review-deal">All four hands</button>${state.history.length||state.claim?'<button class="small-button" id="last-trick">Your trick history</button>':''}</div>`;
  $('#next-board').onclick=newDeal;$('#review-deal').onclick=reviewDeal;$('#last-trick')?.addEventListener('click',()=>reviewTricks());
  $('#compare-details')?.addEventListener('click',reviewComparison);
  $('#retry-comparison')?.addEventListener('click',()=>{finishComparison();render();});return;
 }
 if(state.phase==='play'){
  el.innerHTML=`<h3>${contractText()}</h3><p class="control-caption">${humanTurn()?(state.turn===bottomSeat()?'Your turn. Follow suit if you can.':`Play from ${SEATS[state.turn]}’s dummy hand above.`):`${state.trick.length===4?SEATS[trickWinner(state.trick,state.contract.suit)]+' wins the trick.':SEATS[state.turn]+' to play.'}`}</p><div class="trick-count"><div>N/S tricks<strong>${state.tricks[0]}</strong></div><div>E/W tricks<strong>${state.tricks[1]}</strong></div></div><p class="control-caption">Declarer needs ${state.contract.level+6} tricks.${state.contract.suit==='N'?' No trumps.':' Trump suit: '+SYMBOLS[state.contract.suit]+'.'}</p>${humanTurn()?'<button class="small-button" id="hint-card">Suggest a card</button>':''}<button class="small-button" id="pause">${paused?'Resume play':'Pause play'}</button>${state.history.length?'<button class="small-button" id="last-trick">View last trick</button>':''}`;
  $('#hint-card')?.addEventListener('click',suggestCard);$('#pause').onclick=togglePause;$('#last-trick')?.addEventListener('click',()=>reviewTricks(true));return;
 }
 const yourTurn=state.turn===2,legal=yourTurn?legalCalls(state.auction,2):[];
 if(!yourTurn||selectedLevel!==null&&!SUITS.some(s=>legal.includes(selectedLevel+s)))selectedLevel=null;
 const double=legal.includes('XX')?'XX':'X';
 const gf=state.auction.some(c=>side(c.seat)===0&&c.force==='game')&&!isGame(lastBid(state.auction)?.bid);
 el.innerHTML=`<div class="bid-actions"><button data-bid="P" class="pass-action" ${yourTurn?'':'disabled'}>Pass</button><button data-bid="${double}" ${legal.includes(double)?'':'disabled'}>${double==='XX'?'Redouble':'Double'}</button><button class="bid-utility" id="${yourTurn?'hint-bid':'pause'}">${yourTurn?'Hint':paused?'Resume':'Pause'}</button></div><div class="bid-choice ${selectedLevel===null?'level-select':'suit-select'}" aria-label="${selectedLevel===null?'Choose a bid level':'Choose a suit for level '+selectedLevel}">${selectedLevel===null?[1,2,3,4,5,6,7].map(l=>`<button data-level="${l}" aria-label="Level ${l}" ${SUITS.some(s=>legal.includes(l+s))?'':'disabled'}>${l}</button>`).join(''):`<button id="change-level" aria-label="Change bid level" title="Change bid level">‹ ${selectedLevel}</button>${SUITS.map(s=>`<button data-suit="${s}" class="${red(s)}" aria-label="Bid ${selectedLevel} ${{C:'clubs',D:'diamonds',H:'hearts',S:'spades',N:'notrump'}[s]}" ${legal.includes(selectedLevel+s)?'':'disabled'}>${SYMBOLS[s]}</button>`).join('')}`}</div>`;
 el.setAttribute('aria-label',`Bidding controls${gf?' · Your partnership has established a game force':''}`);
 document.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>{selectedLevel=Number(b.dataset.level);renderControls();$('#change-level').focus({preventScroll:true});});
 const bindings=[...el.querySelectorAll('[data-suit],[data-bid="X"],[data-bid="XX"]')].map(b=>{
  const bid=b.dataset.bid||selectedLevel+b.dataset.suit;
  b.title=interpret(state.auction,state.turn,bid).reason;
  b.setAttribute('aria-description','Tap to bid. Hold or press F1 for the GIB meaning.');
  b.setAttribute('aria-keyshortcuts','F1 Shift+F10');
  return bindBidPreview(b,{onBid:()=>humanBid(bid),onPreview:()=>previewBid(bid)});
 });
 releaseBidPreviews=()=>bindings.forEach(release=>release());
 el.querySelector('[data-bid="P"]').onclick=()=>humanBid('P');
 $('#change-level')?.addEventListener('click',()=>{const level=selectedLevel;selectedLevel=null;renderControls();$(`[data-level="${level}"]`).focus({preventScroll:true});});
 $('#hint-bid')?.addEventListener('click',suggestBid);$('#pause')?.addEventListener('click',togglePause);
}
function previewBid(bid){
 if(state.phase!=='bidding'||state.turn!==2||!legalCalls(state.auction,2).includes(bid))return;
 const info=interpret(state.auction,2,bid),details=[];
 const range=(min,max)=>min!==undefined?max!==undefined?`${min}–${max}`:`${min}+`:max!==undefined?`Up to ${max}`:null;
 const points=range(info.min,info.max),total=range(info.minTP,info.maxTP);
 if(points)details.push(['High-card points',points]);
 if(total)details.push(['Total points',total]);
 for(const [suit,count] of Object.entries(info.lengths||{}))if(count>0)details.push([`${SYMBOLS[suit]} length`,`${count}+ cards`]);
 if(info.force)details.push(['Forcing',info.force==='game'?'To game':info.force==='round'?'One round':info.force]);
 if(info.artificial)details.push(['Type','Artificial']);
 dialog(`${bidName(bid)} · GIB meaning`,`${info.reason?'<p class="bid-meaning-reason"></p>':''}<dl class="bid-meaning-details"></dl><p class="bid-meaning-note">For your next call in this auction. No bid has been placed.</p><button class="primary" id="bid-meaning-done">Back to bidding</button>`);
 if(info.reason)$('#dialog-body .bid-meaning-reason').textContent=info.reason;
 const list=$('#dialog-body .bid-meaning-details');
 for(const [label,value] of details){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;list.append(dt,dd);}
 $('#bid-meaning-done').onclick=()=>$('#info-dialog').close();
}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),4500);}
function humanBid(bid){if(state.phase!=='bidding'||state.turn!==2)throw Error('Wait for your turn to bid.');session.act(state,s=>makeCall(s,bid));selectedLevel=null;explanation=null;render();schedule();return publicState();}
function humanPlay(id){if(!humanTurn()||state.phase!=='play')throw Error('Wait for your turn to play.');session.act(state,s=>playCard(s,id));render();schedule();return publicState();}
function humanClaim(){
 if(!claimAvailable(state))return;
 try{
  session.act(state,s=>claimRemaining(s));
  clearTimeout(timer);render();schedule();
  toast(`Claim accepted: ${state.claim.tricks} remaining tricks to N/S.`);
 }catch(error){
  dialog(error.claimStatus==='unverified'?'Claim not verified':'Claim not accepted',`<p>${error.message}</p><p>A claim must succeed against every possible East/West distribution consistent with exposed cards and shown voids. High probabilities and favorable actual cards do not qualify.</p><button class="primary" id="claim-continue">Continue playing</button>`);
  $('#claim-continue').onclick=()=>$('#info-dialog').close();
 }
}
function schedule(){clearTimeout(timer);if(paused||libraryOpen||state.phase==='complete')return;if(state.phase==='play'&&state.trick.length===4){timer=setTimeout(()=>{collectTrick(state);render();schedule();},1600);return;}if(humanTurn())return;timer=setTimeout(()=>{try{if(state.phase==='bidding'){makeCall(state,botBid(state).bid);explanation=null;}else playCard(state,botCard(state).id);render();schedule();}catch(e){paused=true;toast('Play paused: '+e.message);render();}},1000);}
function togglePause(){paused=!paused;render();schedule();}
function resetView(){
 explanation=null;selectedLevel=null;activePanel=null;
 $('#info-dialog').close();$('#toast').classList.remove('show');
 render();schedule();return publicState();
}
function undoMove(){
 if(!session.canUndo)return publicState();
 clearTimeout(timer);state=session.undo();
 resetView();toast('Back to your previous decision.');return publicState();
}
function replayBoard(){
 clearTimeout(timer);state=session.replay(state);paused=false;
 resetView();toast(state.startContract?'Same deal and contract. Start the play again.':'Same deal. Start again from the auction.');return publicState();
}
function newDeal(){
 clearTimeout(timer);state=session.skip(state,Math.random,dealOptions());paused=false;
 return resetView();
}
function dialog(title,html){activePanel=null;$('#info-dialog').classList.remove('deal-dialog');$('#dialog-title').textContent=title;$('#dialog-body').innerHTML=html;if(!$('#info-dialog').open)$('#info-dialog').showModal();}
const openLibrary=setupDealLibrary({dialog,getState:()=>state,onOpen:()=>{libraryOpen=true;clearTimeout(timer);},onPlay:(setup,name)=>{
 const next=customDeal(setup,state.board+1,name);
 clearTimeout(timer);state=session.start(next);paused=false;libraryOpen=false;
 resetView();toast(`${name} · ${state.startContract?contractText():'ready to bid'}`);
}});
$('#library-button').onclick=openLibrary;
$('#close-dialog').onclick=()=>$('#info-dialog').close();$('#info-dialog').addEventListener('click',e=>{if(e.target===$('#info-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('#undo-button').onclick=undoMove;
$('#replay-button').onclick=replayBoard;
$('#skip-button').onclick=newDeal;
$('#claim-button').onclick=humanClaim;
$('#preferences-button').onclick=showPreferences;
$('#system-button').onclick=()=>dialog('GIB-style system card',systemCard);
$('#help-button').onclick=()=>dialog('A seat at the table',`<h3>1. Bid for a contract</h3><p>You are South; North is your partner. Select a level, then tap a suit or NT to place your bid. Press and hold a suit, NT, Double or Redouble to read its GIB meaning for the current auction without bidding. Release to keep reading, then close the explanation and tap when ready. Keyboard users can focus any of these call buttons and press F1. Use the level arrow to change levels. The Double button changes to Redouble when that call is legal. Each bid must outrank the previous one. Three passes after a bid end the auction; four opening passes pass the board out.</p><h3>2. Take tricks</h3><p>The first player on the winning side to bid the final denomination becomes declarer. The player to declarer’s left leads. Dummy is exposed after that first card. Follow the suit led when possible; otherwise play any card. The highest trump wins, or the highest card of the suit led if no trump was played.</p><p>When North/South declares, you play both hands. If South is dummy, the table rotates 180° so North’s declaring hand is at the bottom and South’s dummy is at the top. Play dummy’s cards above when it is that hand’s turn. When East declares, West’s exposed dummy hand is a vertical column on the left. When West declares, East’s dummy appears vertically on the right. Both columns put trumps first at the top. On mobile, other dummy hands have a full-width card row at the top; Auction opens the bidding history, and Menu contains the other table controls. The table returns to your South seat for the next auction. When East/West declares, play your South hand as a defender.</p><h3>3. Score the board</h3><p>Declarer needs six tricks plus the contract level. The table uses duplicate scoring, including vulnerability, overtricks, undertricks, doubles, redoubles and slams. N/S and E/W show opposing net session totals. Each new board rotates the dealer and follows the standard vulnerability cycle. After each completed board, four bots independently bid and play the same original cards with the same dealer and vulnerability. Your N/S score minus the bots’ N/S score is the point difference; positive means you did better. We convert each board’s difference to IMPs and add those IMPs for the session. This is a comparison against one bot table. <a href="https://www.acbl.org/learn/" target="_blank" rel="noreferrer">ACBL scoring guide</a>. Refreshing starts a new session.</p><h3>4. Claim the remaining tricks</h3><p>When North/South declares, tap Claim all on your turn after dummy is exposed. The check must prove a strategy that wins every remaining trick against every East/West distribution consistent with played cards and shown voids, including possible ruffs and bad breaks. It does not use the actual hidden hands, bidding estimates or the hint probabilities. A claim is accepted only with a proof; if the search cannot finish, keep playing and try again later. Accepted claims finish and score the board, record the claimed tricks separately in the history, and can be undone.</p><h3>5. Deal editor &amp; library</h3><p>Open Deal library (in Menu on mobile) to enter all four hands. Enter ranks by suit; the editor checks 13 cards per seat and rejects duplicates. Set dealer and vulnerability, then start with bidding or a chosen contract. Name and save the deal to replay it later. Set contracts are also used at the comparison table and by Play again. Saved deals stay in this browser; export/import transfers them between devices and the offline app. Entered hands keep their seats regardless of the South-highest-HCP preference.</p><h3>6. Undo, replay or skip</h3><p>Undo takes back your last bid, card or claim and any bot moves that followed it, returning to your previous decision. You can undo repeatedly, including cards you played from dummy. Play again restarts the same cards, seats, dealer and vulnerability from the auction. Undoing or replaying a completed board removes its old score and IMP comparison; only the new result counts. Preferences can give South the highest-HCP hand (ties allowed) on new boards. This preference is saved on this device; the current board and replay keep their cards. Skip deals the next board; an unfinished board is left unscored, and completed results stay in your session.</p><p>The gold seat and hand highlight show whose turn it is. Use “Hint” or “Suggest a card” to compare estimated outcomes. Card play samples unseen hands using the auction and revealed suit shortages, then estimates the duplicate score for each legal choice. Bots never receive the actual concealed hands. Percentages are simulation estimates, not guarantees; bidding still follows the GIB-style agreements. Click an auction call to inspect its meaning.</p>`);
function showPreferences(){
 dialog('Preferences',`<label class="deal-option"><input id="south-highest" type="checkbox" ${southHighestHcp?'checked':''}><span><strong>South gets the highest HCP</strong><small>Your hand will have at least as many high-card points as every other hand. Ties are allowed.</small></span></label><p id="deal-option-status" role="status">${southHighestHcp?'On':'Off'} · ${preferencesSaved?'saved on this device':'this session only'}</p><p>Set this once; it applies automatically to future deals. Your current board, Undo and Play again keep the same cards. The four-bot comparison uses the exact same deal.</p><button class="primary" id="preferences-done">Done</button><p class="advice-note">This preference is saved on this device when browser storage is available. Games and scores still reset on refresh.</p>`);
 $('#south-highest').onchange=e=>{
  southHighestHcp=e.target.checked;
  try{localStorage.setItem('bridge-room.southHighestHcp',String(southHighestHcp));preferencesSaved=true;}catch{preferencesSaved=false;}
  $('#deal-option-status').textContent=`${southHighestHcp?'On':'Off'} · ${preferencesSaved?'saved on this device':'this session only'}`;
 };
 $('#preferences-done').onclick=()=>$('#info-dialog').close();
}
function reviewDeal(){dialog(`Board ${state.board} · all four hands`,`<div class="result-hands">${state.originalHands.map((hand,seat)=>`<div class="result-hand"><strong>${SEATS[seat]} · ${hcp(hand)} HCP</strong>${displaySuitOrder().map(s=>`<div class="${red(s)}">${SYMBOLS[s]} ${hand.filter(c=>c.suit===s).map(c=>rankName(c.rank)).join(' ')||'—'}</div>`).join('')}</div>`).join('')}</div>`);}
function trickHistoryMarkup(history,start=1){return `<table class="trick-log"><thead><tr><th>Trick</th><th>N</th><th>E</th><th>S</th><th>W</th><th>Won</th></tr></thead><tbody>${history.map((t,i)=>`<tr><td>${start+i}</td>${[0,1,2,3].map(seat=>{const c=t.cards.find(c=>c.seat===seat).card;return `<td class="${red(c.suit)}">${cardName(c)}</td>`;}).join('')}<td>${SEATS[t.winner][0]}</td></tr>`).join('')}</tbody></table>`;}
function reviewTricks(lastOnly=false){dialog(lastOnly?'Last completed trick':'Trick history',trickHistoryMarkup(lastOnly?state.history.slice(-1):state.history,lastOnly?state.history.length:1)+(state.claim&&!lastOnly?`<p class="claim-note">N/S claimed the last ${state.claim.tricks} tricks, from trick ${state.claim.fromTrick}. They were awarded without playing the remaining cards.${state.claim.partialTrick.length?' Cards already played in that trick: '+state.claim.partialTrick.map(x=>SEATS[x.seat]+' '+cardName(x.card)).join(', ')+'.':''}</p>`:''));}

function reviewComparison(){
 const comparison=session.comparison;
 if(state.phase!=='complete'||!comparison)return;
 const table=comparison.botTable,start=[3,0,1,2].indexOf(table.dealer);
 const auction=Array(start).fill('<div></div>').concat(table.auction.map(c=>`<div class="call ${c.bid==='P'?'pass':''}" title="${SEATS[c.seat]}: ${c.reason}">${bidHTML(c.bid)}</div>`)).join('');
 dialog('The four-bot table',`<p class="comparison-note">Same cards, seats, dealer and vulnerability.${table.startContract?' Both tables play the chosen contract.':''} All four bots use the same GIB-style agreements and card-play rules as your opponents.</p><div class="comparison-detail-score"><strong>${signed(comparison.botScore)} N/S</strong><span>${contractText(table.contract)} · ${resultText(table)}</span></div>${table.auction.length?'<h3>Bot auction</h3>':'<h3>Chosen contract · no auction</h3>'}<div class="auction auction-panel bot-auction">${['West','North','East','South'].map(s=>`<div class="auction-label">${s}</div>`).join('')}${auction}</div>${table.history.length?`<h3>Bot trick history</h3>${trickHistoryMarkup(table.history)}`:''}<p class="comparison-note">Your ${signed(comparison.yourScore)} − bots’ (${signed(comparison.botScore)}) = ${signed(comparison.pointDifference)} points · ${signed(comparison.imps)} IMPs. Positive is better for you. <a href="https://www.acbl.org/learn/" target="_blank" rel="noreferrer">Scoring guide</a>.</p>`);
}

function suggestCard(){
 if(state.phase!=='play'||!humanTurn())return;
 const advice=botAnalysis(state),declaring=side(state.turn)===side(state.contract.declarer);
 if(advice.forced){dialog('Suggested card',`<p class="advice-pick">Play <strong class="${red(advice.card.suit)}">${cardName(advice.card)}</strong> from ${SEATS[state.turn]}.</p><p>This is the only legal card.</p>`);return;}
 dialog('Suggested card',`<p class="advice-pick">Play <strong class="${red(advice.card.suit)}">${cardName(advice.card)}</strong> from ${SEATS[state.turn]}.</p><p>${advice.openingLead?advice.openingLead.reason:advice.defense?advice.defense.reason:'Highest estimated score for your side.'}</p>${advice.openingLead?.ruleOfEleven?`<p>Rule of 11: 11 − ${advice.card.rank} = ${advice.openingLead.ruleOfEleven.outsideLeader} higher cards outside your hand.</p>`:''}${advice.openingLead?'<p class="advice-note">Opening-lead agreement: <a href="https://bridgeplaybook.com/bridge-strategy/opening-leads/" target="_blank" rel="noreferrer">BridgePlaybook</a>. Sampled scores compare the suitable conventional leads.</p>':''}${advice.defense?'<p class="advice-note">Defense: <a href="https://sites.utoronto.ca/bridge/lessons/25defense.pdf" target="_blank" rel="noreferrer">25 Ways to Be a Better Defender</a>. Tactics help choose between similarly rated plays. Signals are uncertain clues, not instructions to continue a suit.</p>':''}<table class="advice-table"><thead><tr><th>Card</th><th>${declaring?'Make contract':'Defeat contract'}</th><th>Expected points</th></tr></thead><tbody>${advice.options.slice(0,3).map((option,i)=>`<tr class="${i===0?'recommended':''}"><td class="${red(option.card.suit)}">${cardName(option.card)}</td><td>${Math.round(100*(declaring?option.makeProbability:1-option.makeProbability))}%</td><td>${signed(Math.round(option.expectedScore))}</td></tr>`).join('')}</tbody></table><p class="advice-note">Estimates from ${advice.samples} sampled deals using known cards, the auction, signal clues and shown suit shortages. Points are from ${side(state.turn)===0?'N/S':'E/W'}’s side and include vulnerability. Unseen cards and future play remain uncertain.</p>`);
}
function suggestBid(){
 if(state.phase!=='bidding'||state.turn!==2)return;
 const c=botBid(state);explanation=null;const message=`Suggested ${bidName(c.bid)} — ${c.reason}`;
 $('#bid-explanation').textContent=message;if(mobileLayout.matches)toast(message);
}
function renderMobile(legal){
 const vulnerable=state.vulnerable.every(Boolean)?'Both vulnerable':state.vulnerable[0]?'N/S vulnerable':state.vulnerable[1]?'E/W vulnerable':'Neither vulnerable';
 const call=lastBid(state.auction);
 $('#mobile-status').innerHTML=`<div class="mobile-board"><small>BOARD</small><strong>${state.board}</strong><span>Dealer ${SEATS[state.dealer][0]}</span></div><div class="mobile-contract"><small>${state.phase==='bidding'?'AUCTION':'CONTRACT'}</small><strong>${state.contract?contractText():call?bidHTML(call.bid):'—'}</strong><span>${vulnerable}</span></div><div class="mobile-tricks"><small>${state.phase==='bidding'?'SESSION · N/S':'TRICKS'}</small><strong>${state.phase==='bidding'?(totals[0]>0?'+':'')+totals[0]:`${state.tricks[0]} <span>:</span> ${state.tricks[1]}`}</strong><span>${state.phase==='bidding'?'GIB-style 2/1':'N/S · E/W'}</span></div>`;
 const exposed=state.phase==='play'&&state.dummyExposed&&!westDummy()&&!eastDummy();
 const tray=$('#mobile-dummy');tray.hidden=!exposed;
 if(exposed){const seat=state.contract.dummy;tray.innerHTML=`<div class="mobile-hand-label"><strong>${SEATS[seat]} · dummy</strong><span>${state.turn===seat&&state.trick.length<4?'To play':state.hands[seat].length+' cards'}</span></div><div class="mobile-card-row">${sortVisibleHand(state.hands[seat]).map(c=>cardMarkup(c,{enabled:humanTurn()&&state.turn===seat&&legal.includes(c.id),dim:state.turn===seat&&!legal.includes(c.id)})).join('')}</div>`;}
 else tray.innerHTML='';
 const primary=$('#mobile-primary'),secondary=$('#mobile-secondary');
 primary.disabled=state.phase!=='complete'&&!humanTurn();
 primary.textContent=state.phase==='complete'?'Next board':'Hint';
 primary.onclick=state.phase==='complete'?newDeal:state.phase==='bidding'?suggestBid:()=>$('#hint-card')?.click();
 secondary.disabled=state.phase==='play'&&!state.history.length;
 secondary.textContent=state.phase==='complete'?'Review':state.phase==='bidding'?'System':'Last trick';
 secondary.onclick=state.phase==='complete'?reviewDeal:state.phase==='bidding'?()=>$('#system-button').click():()=>reviewTricks(true);
 if(mobileLayout.matches){
  if(state.phase==='bidding')$('#hand-note').textContent='Your hand · '+hcp(state.hands[2])+' HCP · '+totalPoints(state.hands[2])+' TP';
  if(state.phase==='play'&&state.trick.length===4)$('#hand-note').textContent=SEATS[trickWinner(state.trick,state.contract.suit)]+' wins the trick.';
 }
}
function renderAuctionPanel(){
 $('#dialog-body').innerHTML=`<div class="auction auction-panel">${$('#auction').innerHTML}</div><p class="auction-panel-explanation">${$('#bid-explanation').textContent}</p>`;
 document.querySelectorAll('#dialog-body [data-call]').forEach(el=>el.onclick=()=>{explanation=Number(el.dataset.call);renderAuction();});
}
$('#mobile-auction').onclick=()=>{dialog('The auction','');activePanel='auction';renderAuctionPanel();};
$('#mobile-menu').onclick=()=>{
 dialog('Table menu',`<div class="mobile-menu-score"><span>N/S <strong>${totals[0]>0?'+':''}${totals[0]}</strong></span><span>E/W <strong>${totals[1]>0?'+':''}${totals[1]}</strong></span></div><p class="comparison-session">Bot comparison: ${signed(comparisonTotals.imps)} IMPs · ${comparisonTotals.boards} completed ${comparisonTotals.boards===1?'board':'boards'}</p><div class="mobile-menu-list"><button id="menu-pause" ${state.phase==='complete'?'disabled':''}>${paused?'Resume play':'Pause play'}</button><button id="menu-library">Deal library · enter or replay hands</button><button id="menu-preferences">Preferences${southHighestHcp?' · South highest HCP':''}</button><button id="menu-system">GIB-style system card</button><button id="menu-offline">Get app · play offline</button><button id="menu-help">How to play</button></div>`);
 $('#menu-pause').onclick=()=>{togglePause();$('#info-dialog').close();};
 $('#menu-library').onclick=openLibrary;
 $('#menu-preferences').onclick=showPreferences;
 $('#menu-system').onclick=()=>$('#system-button').click();
 $('#menu-offline').onclick=openOffline;
 $('#menu-help').onclick=()=>$('#help-button').click();
};
$('#info-dialog').addEventListener('close',()=>{activePanel=null;$('#info-dialog').classList.remove('deal-dialog');if(libraryOpen){libraryOpen=false;schedule();}});
mobileLayout.addEventListener('change',()=>render());

function publicState(){const comparison=session.comparison;return {canUndo:session.canUndo,claimAvailable:claimAvailable(state),claim:state.claim||null,sessionScores:[...totals],board:state.board,phase:state.phase,turn:SEATS[state.turn],yourTurn:humanTurn(),view:{bottomSeat:SEATS[bottomSeat()],rotated:bottomSeat()===0,suitOrder:displaySuitOrder()},displayedHand:sortVisibleHand(state.hands[bottomSeat()]),yourHand:sortVisibleHand(state.hands[2]),dummy:state.dummyExposed?{seat:SEATS[state.contract.dummy],hand:sortVisibleHand(state.hands[state.contract.dummy])}:null,contract:state.contract,auction:state.auction,trick:state.trick,tricks:state.tricks,result:state.result,comparison:state.phase==='complete'&&comparison?{yourScore:comparison.yourScore,botScore:comparison.botScore,pointDifference:comparison.pointDifference,imps:comparison.imps,botContract:comparison.botTable.contract,botResult:comparison.botTable.result}:null,comparisonTotals:{...comparisonTotals},legalCalls:state.phase==='bidding'&&state.turn===2?legalCalls(state.auction,2):[],legalCards:state.phase==='play'&&humanTurn()?legalCards(state.hands[state.turn],state.trick).map(c=>c.id):[],northHand:state.phase==='play'&&side(state.contract.declarer)===0?sortVisibleHand(state.hands[0]):undefined};}
if(document.modelContext?.registerTool){const lifecycle=new AbortController();const defs=[{name:'read_bridge_table',description:'Read the public bridge table, your cards, and available actions.',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{},additionalProperties:false},execute:()=>publicState()},{name:'make_bridge_call',description:'Make South’s auction call. P, X, XX, or level 1–7 followed by C, D, H, S, N.',inputSchema:{type:'object',properties:{bid:{type:'string'}},required:['bid'],additionalProperties:false},execute:input=>{if(typeof input?.bid!=='string')throw Error('A bid string is required.');return humanBid(input.bid);}},{name:'play_bridge_card',description:'Play a legal card from the currently controlled hand.',inputSchema:{type:'object',properties:{cardId:{type:'string'}},required:['cardId'],additionalProperties:false},execute:input=>{if(typeof input?.cardId!=='string')throw Error('A card ID is required.');return humanPlay(input.cardId);}}];for(const d of defs){try{Promise.resolve(document.modelContext.registerTool({...d,title:d.name.replaceAll('_',' '),annotations:{readOnlyHint:false,untrustedContentHint:false,...d.annotations}},{signal:lifecycle.signal})).catch(()=>{});}catch{}}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}
const openOffline=setupOffline(dialog);
render();schedule();
