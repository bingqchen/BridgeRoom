import {NearbyTable,NEARBY_PROTOCOL} from '../shared/nearby-table.js';
import {bottomSeatFor,tablePosition} from '../shared/nearby-view.js';
import {SEATS,SYMBOLS,rankName,bidName,hcp,interpret} from '../../dist/engine.js';
import {bindBidPreview} from '../../dist/bid-preview.js';

const $=s=>document.querySelector(s),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const native=message=>window.webkit?.messageHandlers?.bridgeRoom?.postMessage(message);
let table=null,identity=null,view=null,invites=[],tables=[],mode='welcome',level=null,timer=null,pending=false,connected=true,releasePreviews=[];
let playerName='Player',tableId='',inviteDraft='',hostSeat=2,guestSeat=0;
const signed=n=>n>0?'+'+n:String(n);
const red=s=>s==='H'||s==='D'?'red':'';
const ordered=hand=>{const suits=['S','H','C','D'],i=suits.indexOf(view?.state?.contract?.suit),order=i>0?[...suits.slice(i),...suits.slice(0,i)]:suits;return [...hand].sort((a,b)=>order.indexOf(a.suit)-order.indexOf(b.suit)||b.rank-a.rank);};
function notice(message){$('#notice').textContent=message;$('#notice').hidden=!message;}
function connection(message){$('#connection').textContent=message;}
function publish(){
 if(!table)return;
 view=table.view(identity);pending=false;render();
 for(const player of table.players)if(player&&player.id!==identity&&player.connected)native({type:'send',peerId:player.id,payload:{kind:'view',view:table.view(player.id)}});
 schedule();
}
function schedule(){
 clearTimeout(timer);if(!table||table.paused||!table.started||table.state.phase==='complete')return;
 const collecting=table.state.trick.length===4;
 if(!collecting&&table.players[table.controller()])return;
 timer=setTimeout(()=>{try{if(table.step())publish();}catch(error){table.setActive(false);publish();notice('Play paused: '+error.message);}},collecting?1250:700);
}
function action(value){
 if(!view||pending||!connected)return;
 const payload={...value,revision:view.revision};notice('');
 if(table){try{table.action(identity,payload);level=null;publish();}catch(error){notice(error.message);}}
 else{pending=true;native({type:'send',payload:{kind:'action',action:payload}});render();}
}
function showMeaning(bid,auction=view.state.auction,seat=view.state.turn){
 const meta=interpret(auction,seat,bid);$('#meaning-title').textContent=bidName(bid);$('#meaning-text').textContent=meta.reason||'Natural call in this auction.';$('#meaning').showModal();
}
$('#close-meaning').onclick=()=>$('#meaning').close();
function cards(hand,seat,compact=false){
 return `<div class="cards ${compact?'compact':''}" style="--count:${Math.max(1,hand.length)}">${ordered(hand).map(c=>{
  const allowed=connected&&!pending&&view.state.phase==='play'&&view.state.turn===seat&&view.legalCards.includes(c.id);
  return `<button class="card ${red(c.suit)} ${allowed?'playable':''}" data-card="${c.id}" aria-label="${escape(rankName(c.rank)+' '+SYMBOLS[c.suit])}" ${allowed?'':'disabled'}><span>${rankName(c.rank)}</span><b>${SYMBOLS[c.suit]}</b></button>`;
 }).join('')}</div>`;
}
function auction(){
 const s=view.state,order=[3,0,1,2],start=order.indexOf(s.dealer);
 return `<section class="auction" aria-label="Full auction"><div class="auction-grid">${order.map(seat=>`<strong class="${s.phase==='bidding'&&s.turn===seat?'active':''}">${SEATS[seat][0]}${s.dealer===seat?' · D':''}</strong>`).join('')}${'<span></span>'.repeat(start)}${s.auction.map((call,i)=>`<button data-call="${i}" class="${call.bid.length===2?red(call.bid[1]):''}">${escape(bidName(call.bid))}</button>`).join('')}${s.phase==='bidding'?'<span class="next-call">•••</span>':''}</div></section>`;
}
function bidding(){
 const legal=connected&&!pending?view.legalCalls:[],dbl=legal.includes('XX')?'XX':'X';
 if(level!==null&&!['C','D','H','S','N'].some(s=>legal.includes(level+s)))level=null;
 return `<div class="bidding"><div class="bid-actions"><button data-bid="P" ${legal.includes('P')?'':'disabled'}>Pass</button><button data-bid="${dbl}" ${legal.includes(dbl)?'':'disabled'}>${bidName(dbl)}</button><span>Hold a call for its GIB meaning</span></div><div class="bid-choices ${level!==null?'suits':''}">${level===null?[1,2,3,4,5,6,7].map(n=>`<button data-level="${n}" ${['C','D','H','S','N'].some(s=>legal.includes(n+s))?'':'disabled'}>${n}</button>`).join(''):`<button data-back>‹ ${level}</button>${['C','D','H','S','N'].map(s=>`<button data-bid="${level+s}" class="${red(s)}" ${legal.includes(level+s)?'':'disabled'}>${SYMBOLS[s]}</button>`).join('')}`}</div></div>`;
}
function role(seat){const s=view.state;return s?.contract?.dummy===seat?(seat===view.you?'Your dummy':'Dummy'):s?.contract?.declarer===seat?'Declarer':view.players[seat].bot?'Bot':seat===view.you?'You':'Player';}
function seatMarkup(seat){
 const s=view.state,active=s.phase==='play'&&s.trick.length<4&&s.turn===seat;
 return `<section class="seat ${active?'active':''}"><strong>${SEATS[seat]} · ${escape(view.players[seat].name)}</strong><small>${role(seat)}${active?' · To play':''}</small>${Array.isArray(s.hands[seat])?cards(s.hands[seat],seat,true):`<span class="concealed">${s.counts[seat]} cards</span>`}</section>`;
}
function playing(){
 const s=view.state,bottom=bottomSeatFor(view),n=(bottom+2)%4,w=(bottom+1)%4,e=(bottom+3)%4;
 const pos=seat=>['north','east','south','west'][tablePosition(view,seat)];
 return `<div class="play-table"><div class="north-seat">${seatMarkup(n)}</div><div class="west-seat">${seatMarkup(w)}</div><div class="trick">${s.trick.map(x=>`<div class="trick-card ${pos(x.seat)} ${red(x.card.suit)}"><b>${rankName(x.card.rank)}</b><span>${SYMBOLS[x.card.suit]}</span></div>`).join('')}${s.trick.length?'':`<span class="felt-mark">♠</span>`}</div><div class="east-seat">${seatMarkup(e)}</div></div>`;
}
function mainHand(){
 const s=view.state,bottom=bottomSeatFor(view),rotated=bottom!==view.you;
 const title=rotated?`${SEATS[bottom]} · Declarer · You play`:`${SEATS[bottom]} · Your hand${s.contract?.dummy===view.you?' · Dummy':''}`;
 let note='Tap a highlighted card on your turn.';
 if(s.phase==='bidding')note='Choose a level, then a suit or NT.';
 else if(rotated)note=view.controller===view.you?(s.turn===bottom?'Choose a card from declarer’s hand.':'Choose a card from your dummy above.'):`You play ${SEATS[bottom]}’s hand and your dummy.`;
 else if(s.contract?.dummy===view.you)note=s.dummyExposed?`Watch declarer’s hand above. ${SEATS[s.contract.declarer]} plays both hands.`:'Declarer’s hand will appear after the opening lead.';
 else if(view.controller===view.you&&s.turn!==view.you)note='Choose a card from dummy.';
 return `<section class="your-hand ${s.phase==='play'&&s.trick.length<4&&s.turn===bottom?'active':''}"><div><strong>${title}</strong><small>${hcp(s.hands[bottom])} HCP</small></div>${cards(s.hands[bottom],bottom)}<p>${note}</p></section>`;
}
function recap(){
 const s=view.state,score=s.result.nsScore??0;
 return `<section class="recap"><h2>Board ${s.board} complete</h2><p>${s.result.passedOut?'Passed out':`${s.result.tricks} tricks · ${s.result.delta<0?'Down '+(-s.result.delta):'Made'+(s.result.delta?' +'+s.result.delta:' exactly')}`} · <strong>${signed(score)} N/S</strong></p><div class="all-hands">${[0,1,3,2].map(seat=>`<section><strong>${SEATS[seat]} · ${escape(view.players[seat].name)}</strong><small>${hcp(s.originalHands[seat])} HCP · ${role(seat)}</small>${['S','H','C','D'].map(suit=>`<div class="suit-line ${red(suit)}"><b>${SYMBOLS[suit]}</b> ${s.originalHands[seat].filter(c=>c.suit===suit).sort((a,b)=>b.rank-a.rank).map(c=>rankName(c.rank)).join(' ')||'—'}</div>`).join('')}</section>`).join('')}</div><details><summary>Auction</summary>${auction()}</details></section>`;
}
function lobby(){
 return `<section class="lobby"><h1>Your nearby table</h1><p>${view.host?'You host as '+SEATS[view.you]+'.':'Your PIN assigns you '+SEATS[view.you]+'.'} Empty seats use bots.</p><div class="seats">${view.players.map(p=>`<div class="seat-slot ${p.seat===view.you?'selected':''}"><strong>${SEATS[p.seat]}</strong><span>${escape(p.name)}${p.seat===view.you?' · You':''}</span><small>${p.connected?'': 'Reconnecting…'}</small></div>`).join('')}</div>${view.host?`<details class="invitations" open><summary>Invite nearby players</summary><p>Share each PIN with its player. They select that seat when joining.</p>${invites.map(({seat,pin},i)=>`<div><label>${SEATS[seat]}</label><code>${escape(pin)}</code><div class="invite-actions"><button data-copy="${i}">Copy</button><button data-share="${i}">Share</button></div></div>`).join('')}</details>`:'<p class="waiting">The host will start when everyone is seated.</p>'}</section>`;
}
function render(){
 releasePreviews.forEach(f=>f());releasePreviews=[];
 const app=$('#app');
 if(!view){
  app.innerHTML=`<section class="welcome"><span class="felt-mark">♠</span><h1>Bridge, together.</h1><p>Play nearby with friends. No internet or router required. Keep the app open on each device.</p><label>Your name<input id="name" maxlength="28" value="${escape(playerName)}" autocomplete="nickname"></label>${mode!=='browse'?`<label>Your seat as host<select id="host-seat">${SEATS.map((name,seat)=>`<option value="${seat}" ${seat===hostSeat?'selected':''}>${name}</option>`).join('')}</select></label>`:''}<div class="welcome-actions"><button id="host" class="primary">${mode==='browse'?'Host instead':'Host table'}</button><button id="browse">Find a table</button></div>${mode==='browse'?`<section class="join"><h2>Nearby tables</h2>${tables.length?`<label>Table<select id="table-select">${tables.map(t=>`<option value="${escape(t.id)}" ${t.id===tableId?'selected':''}>${escape(t.name)}</option>`).join('')}</select></label><label>Your assigned seat<select id="guest-seat">${SEATS.map((name,seat)=>`<option value="${seat}" ${seat===guestSeat?'selected':''}>${name}</option>`).join('')}</select></label><label>4-digit seat PIN<input id="invite" value="${escape(inviteDraft)}" type="text" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" placeholder="0000"></label><button id="join" class="primary">Join table</button>`:'<p>Looking for hosts nearby… Allow Local Network access when asked and keep Wi-Fi enabled.</p>'}</section>`:''}</section>`;
  $('#name').oninput=e=>playerName=e.target.value;
  $('#host-seat')?.addEventListener('change',e=>hostSeat=Number(e.target.value));
  $('#host').onclick=()=>{notice('');if(mode==='browse'){mode='welcome';render();return;}native({type:'host',name:playerName,seat:hostSeat});};
  $('#browse').onclick=()=>{mode='browse';native({type:'browse'});render();};
  $('#table-select')?.addEventListener('change',e=>tableId=e.target.value);
  $('#guest-seat')?.addEventListener('change',e=>guestSeat=Number(e.target.value));
  $('#invite')?.addEventListener('input',e=>{inviteDraft=e.target.value.replace(/[^0-9]/g,'').slice(0,4);e.target.value=inviteDraft;});
  $('#join')?.addEventListener('click',()=>{if(!/^[0-9]{4}$/.test(inviteDraft))return notice('Enter the four-digit PIN for your assigned seat.');notice('');native({type:'join',tableId:tableId||tables[0]?.id,seat:guestSeat,code:inviteDraft,name:playerName});});
  return;
 }
 const s=view.state;
 const waiting=view.paused||!connected;
 const status=waiting?'Paused · waiting for reconnection':!s?'Waiting for players':s.phase==='complete'?'Board complete':s.trick.length===4?'Trick complete':`${SEATS[s.turn]} ${s.phase==='bidding'?'to bid':'to play'}${view.controller===view.you?' · Your turn':''}`;
 app.innerHTML=`<div class="game"><div class="status ${!waiting&&view.controller===view.you?'your-turn':''}" role="status">${escape(status)}</div>${view.host&&view.players.some(p=>!p.bot&&!p.connected)?`<div class="reconnect">${view.players.filter(p=>!p.bot&&!p.connected).map(p=>`<p>${escape(p.name)} disconnected. <button data-replace="${p.seat}">Replace with bot</button></p>`).join('')}</div>`:''}<div class="game-scroll">${!s?lobby():`<div class="board-meta"><span>Board <b>${s.board}</b> · Dealer ${SEATS[s.dealer][0]}</span><strong>${s.contract?`${s.contract.level}${SYMBOLS[s.contract.suit]}${s.contract.doubled===2?' X':s.contract.doubled===4?' XX':''} · ${SEATS[s.contract.declarer]}`:'Auction'}</strong><span>N/S ${s.tricks[0]} : ${s.tricks[1]} E/W</span><small>${s.vulnerable.every(Boolean)?'Both vulnerable':s.vulnerable[0]?'N/S vulnerable':s.vulnerable[1]?'E/W vulnerable':'Neither vulnerable'}</small></div>${s.phase==='complete'?recap():s.phase==='bidding'?auction()+bidding():playing()}${s.phase==='complete'?'':mainHand()}`}</div><footer><span>${s?'Session N/S '+signed(view.totals[0]):view.players.filter(p=>!p.bot).length+' of 4 players'}</span>${!s&&view.host?`<button class="primary" id="start" ${view.paused?'disabled':''}>Start</button>`:''}${s?.phase==='complete'&&view.host?'<button id="replay">Play again</button><button id="next" class="primary">Next board</button>':''}${s?.phase==='play'?'<button id="auction-toggle">Auction</button>':''}<button id="leave">Leave</button></footer></div>`;
 app.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{native({type:'copy',text:invites[Number(b.dataset.copy)].pin});notice(SEATS[invites[Number(b.dataset.copy)].seat]+' PIN copied.');});
 app.querySelectorAll('[data-share]').forEach(b=>b.onclick=()=>native({type:'share',text:`Join my Bridge Room table as ${SEATS[invites[Number(b.dataset.share)].seat]} with PIN ${invites[Number(b.dataset.share)].pin}.`}));
 $('#start')?.addEventListener('click',()=>action({type:'start'}));
 $('#next')?.addEventListener('click',()=>action({type:'next'}));
 $('#replay')?.addEventListener('click',()=>action({type:'replay'}));
 app.querySelectorAll('[data-replace]').forEach(b=>b.onclick=()=>{if(confirm('Replace this disconnected player with a bot for the rest of this table?'))action({type:'replace',seat:Number(b.dataset.replace)});});
 $('#leave').onclick=()=>{if(confirm(view.host?'Close this nearby table for everyone?':'Leave the table? Your seat will be reserved while the host keeps it open.'))native({type:'leave'});};
 app.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>{level=Number(b.dataset.level);render();});
 app.querySelector('[data-back]')?.addEventListener('click',()=>{level=null;render();});
 app.querySelectorAll('[data-bid]').forEach(b=>{
  const bid=b.dataset.bid;
  releasePreviews.push(bindBidPreview(b,{onBid:()=>action({type:'bid',bid}),onPreview:()=>showMeaning(bid)}));
 });
 app.querySelectorAll('[data-card]').forEach(b=>b.onclick=()=>action({type:'play',cardId:b.dataset.card}));
 app.querySelectorAll('[data-call]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.call),c=s.auction[i];showMeaning(c.bid,s.auction.slice(0,i),c.seat);});
 $('#auction-toggle')?.addEventListener('click',()=>{ $('#meaning-title').textContent='The auction';$('#meaning-text').textContent=s.auction.map(c=>`${SEATS[c.seat]}: ${bidName(c.bid)}`).join(' · ');$('#meaning').showModal();});
}

window.bridgeNativeEvent=event=>{
 try{
  switch(event.type){
   case 'hosting':
    clearTimeout(timer);identity=event.id;invites=event.invites;table=new NearbyTable({hostId:identity,hostName:event.name,hostSeat:event.seat});mode='table';connected=true;connection('Hosting nearby');publish();break;
   case 'tables':tables=event.tables;if(!tables.some(t=>t.id===tableId))tableId=tables[0]?.id||'';if(!view)render();break;
   case 'joined':identity=event.id;connected=true;pending=false;connection('Connected nearby');if(view)render();break;
   case 'peer':
    if(!table)return;
    if(event.connected){try{table.join(event.id,event.name,event.seat);}catch(error){native({type:'send',peerId:event.id,payload:{kind:'error',message:error.message}});return;}}
    else if(table.seatFor(event.id)>=0)table.setConnected(event.id,false);
    publish();break;
   case 'message':
    if(table){
     if(event.payload?.kind!=='action')return;
     try{table.action(event.peerId,event.payload.action);}catch(error){native({type:'send',peerId:event.peerId,payload:{kind:'error',message:error.message}});}
     publish();
    }else if(event.payload?.kind==='view'){
     const next=event.payload.view;
     if(next?.protocol!==NEARBY_PROTOCOL||!Number.isInteger(next.you)||next.you<0||next.you>3||!Array.isArray(next.players)||next.players.length!==4)throw Error('Update Bridge Room on every device to play together.');
     view=next;connected=true;pending=false;mode='table';level=null;render();
    }else if(event.payload?.kind==='error'){pending=false;notice(event.payload.message);render();}
    break;
   case 'active':if(table){table.setActive(event.active);publish();}break;
   case 'status':connection(event.message);if(event.connected===false){connected=false;pending=false;render();}break;
   case 'error':pending=false;notice(event.message);render();break;
   case 'ended':
    clearTimeout(timer);table=null;view=null;identity=null;invites=[];pending=false;connected=true;level=null;mode='welcome';connection('Table closed');render();notice(event.message||'The host closed this table.');break;
   case 'left':clearTimeout(timer);table=null;view=null;identity=null;invites=[];pending=false;connected=true;level=null;mode='welcome';connection('Nearby play');notice('');render();break;
  }
 }catch(error){notice(error.message);}
};
render();native({type:'ready'});
