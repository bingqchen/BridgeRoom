import {SUITS,SYMBOLS,SEATS,BIDS,side,partner,rankName,cardName,bidName,hcp,shape,balanced,sortHand,lastBid,gameLevel,isGame,legalCalls,auctionOver,getContract,vulnerability} from './bridge-cards.js';
import {totalPoints} from './bidding-context.js';
const info=(reason,extra={})=>({reason,...extra});
function context(auction,seat){const opening=auction.find(c=>BIDS.includes(c.bid));const ours=auction.filter(c=>c.seat===seat&&c.bid!=='P');const theirs=auction.filter(c=>c.seat===partner(seat)&&c.bid!=='P');const p=theirs.at(-1);return {opening,ours,theirs,p,unpassed:!auction.some(c=>c.seat===seat&&c.bid==='P'),interference:opening?auction.slice(auction.indexOf(opening)+1).some(c=>side(c.seat)!==side(seat)&&c.bid!=='P'):false};}
export function interpretNatural(auction,seat,bid){
 const {opening,ours,theirs,p,unpassed,interference}=context(auction,seat);const s=bid[1],level=Number(bid[0]);
 if(bid==='P')return info('Pass. No further bid at this turn.');
 if(bid==='XX')return info('Redouble. Increases the stakes of the doubled contract.',{kind:'redouble'});
 if(bid==='X'){const takeout=opening&&Number(lastBid(auction).bid[0])<=3&&!ours.length&&lastBid(auction).bid[1]!=='N';return info(takeout?'Takeout double: opening values and support for the unbid suits.':'Penalty double: expects to defeat the contract.',{kind:takeout?'takeout':'penalty',min:takeout?12:0});}
 if(!opening){
  if(bid==='1N')return info('15–17 HCP, balanced.',{kind:'nt-open',min:15,max:17});
  if(bid==='2N')return info('20–21 HCP, balanced.',{kind:'nt-open',min:20,max:21});
  if(bid==='2C')return info('Strong, artificial 2♣: 22+ HCP; forcing for one round.',{kind:'strong-open',min:22,max:37,force:'round'});
  if(level===2)return info('Weak two: 6–10 HCP and a six-card suit.',{kind:'weak-open',min:6,max:10,lengths:{[s]:6}});
  if(level>=3)return info('Preempt: a long suit and limited high-card strength.',{kind:'preempt',min:5,max:10,lengths:{[s]:Math.min(8,level+4)}});
  return info(['H','S'].includes(s)?'Opening values, 12–21 HCP and at least five cards.':'Opening values, 12–21 HCP and at least three cards.',{kind:'suit-open',min:12,max:21,lengths:{[s]:['H','S'].includes(s)?5:3}});
 }
 if(p?.kind==='strong-open'&&!interference&&bid==='2D')return info('Artificial waiting response to strong 2♣. Does not promise diamonds.',{kind:'waiting'});
 if(p?.kind==='nt-open'&&!ours.length&&!interference){
  const base=Number(p.bid[0]);
  if(bid===`${base+1}C`)return info('Stayman: asks for a four-card major.',{kind:'stayman',force:'round',min:base===1?8:4});
  if(bid===`${base+1}D`||bid===`${base+1}H`)return info(`Jacoby transfer: at least five ${s==='D'?'hearts':'spades'}. Partner must complete the transfer.`,{kind:'transfer',target:s==='D'?'H':'S',lengths:{[s==='D'?'H':'S']:5},force:'round'});
 }
 if(p?.kind==='transfer'&&s===p.target)return info('Completes partner’s transfer.',{kind:'transfer-accept'});
 if(p?.kind==='stayman'){if(s==='D')return info('Stayman response: denies a four-card major.',{kind:'stayman-answer'});return info('Stayman response: shows a four-card major.',{kind:'stayman-answer',lengths:{[s]:4}});}
 if(opening.seat===partner(seat)&&!ours.length&&opening.bid[0]==='1'&&opening.bid[1]!=='N'){
  const os=opening.bid[1];const on=unpassed&&!interference;
  if(on&&bid==='2N'&&['H','S'].includes(os))return info('Jacoby 2NT: game-forcing raise, 12+ HCP and four-card trump support.',{kind:'jacoby',force:'game',min:12,lengths:{[os]:4}});
  if(on&&level===2&&s!=='N'&&s!==os&&SUITS.indexOf(s)<SUITS.indexOf(os))return info('2/1 game force: 12+ HCP. Both partners must continue to game.',{kind:'two-over-one',force:'game',min:12,lengths:{[s]:s==='H'?5:s==='C'?3:4}});
  if(on&&bid==='1N'&&['H','S'].includes(os))return info('Forcing 1NT: 6–11 HCP. Opener must bid again; may include a three-card limit raise.',{kind:'forcing-nt',force:'round',min:6,max:11});
  if(s===os)return info(level===2?'Simple raise: 6–9 HCP with support.':'Limit raise: 10–11 HCP with support.',{kind:level===2?'raise':'limit',min:level===2?6:10,max:level===2?9:11,lengths:{[s]:['H','S'].includes(s)?level===2?3:4:5}});
  if(level===1&&s!=='N')return info('Natural response: 6+ HCP and four or more cards; forcing one round for an unpassed hand.',{kind:'new-suit',min:6,lengths:{[s]:4},force:on?'round':undefined});
  if(s==='N')return info(level===1?'Natural, nonforcing 1NT: 6–10 HCP.':level===2?'Invitational 2NT: 10–11 HCP.':'To play in notrump.',{kind:level===2?'invite-nt':'natural-nt',min:level===1?6:level===2?10:12,max:level===1?10:level===2?11:15});
  return info('Natural response. After interference or a previous pass, 2/1 game force is off.',{kind:'natural',min:6,lengths:{[s]:4}});
 }
 if(p?.kind==='takeout')return info('Response to a takeout double: a natural suit.',{kind:'advancer',min:level>Number(lastBid(auction)?.bid[0]||1)?6:0,lengths:{[s]:4}});
 if(!ours.length&&opening.seat!==partner(seat))return info(s==='N'?'Natural notrump overcall, 15–18 HCP and a stopper.':'Natural overcall: at least five cards and values appropriate to the level.',{kind:'overcall',min:s==='N'?15:level===1?8:10,max:s==='N'?18:17,lengths:s==='N'?{}:{[s]:5}});
 if(p?.kind==='forcing-nt')return info(s===opening.bid[1]?'Rebid after forcing 1NT: a six-card opening suit.':'Required rebid after forcing 1NT. A minor may have only three cards.',{kind:'rebid',min:12,max:bid==='2N'?19:17,lengths:s==='N'?{}:{[s]:s===opening.bid[1]?6:3}});
 if(p?.kind==='two-over-one')return info('Natural rebid in a game-forcing auction. The partnership will continue to game.',{kind:'gf-rebid',min:12,max:17,lengths:s==='N'?{}:{[s]:s===opening.bid[1]?['H','S'].includes(s)?5:4:4}});
 if(p?.kind==='jacoby')return info('Signs off in the agreed major after the game-forcing raise.',{kind:'game',lengths:{[s]:5}});
 if(isGame(bid))return info('Natural game or slam contract, to play.',{kind:'game'});
 return info('Natural continuation, showing shape and values.',{kind:'natural',lengths:s==='N'?{}:{[s]:ours.some(c=>c.bid[1]===s)?5:4}});
}
function partnerModel(auction,seat){const calls=auction.filter(c=>c.seat===partner(seat)&&c.bid!=='P');const model={min:0,max:0,minTP:0,lengths:{C:0,D:0,H:0,S:0}};for(const c of calls){model.minTP=Math.max(model.minTP,c.minTP||c.min||0);if(c.min!==undefined)model.min=Math.max(model.min,c.min);if(c.max!==undefined)model.max=c.max;for(const [s,n] of Object.entries(c.lengths||{}))model.lengths[s]=Math.max(model.lengths[s],n);}if(!model.max)model.max=model.min+3;return model;}
export function chooseNaturalBid(hand,auction,seat){
 const legal=legalCalls(auction,seat),points=hcp(hand),len=shape(hand),bal=balanced(hand);const {opening,ours,theirs,p,unpassed,interference}=context(auction,seat);const last=lastBid(auction);const model=partnerModel(auction,seat);
 const byLength=['S','H','D','C'].sort((a,b)=>len[b]-len[a]);const longest=byLength[0];
 const lowest=s=>BIDS.find(b=>b[1]===s&&legal.includes(b));
 const pick=(bid,reason)=>({bid:legal.includes(bid)?bid:'P',reason});
 const natural=(s,ceiling=7)=>{const b=lowest(s);return b&&Number(b[0])<=ceiling?b:null;};
 const fit=['S','H','D','C'].find(s=>len[s]+model.lengths[s]>=8&&model.lengths[s]>0);
 const target=(force=false)=>{const total=totalPoints(hand)+Math.max(model.min,model.minTP);const s=fit||'N';let level=total>=37?7:total>=33?6:force||total>=25?gameLevel(s):total>=23?s==='N'?2:3:s==='N'?1:2;if(s!=='N'&&len[s]+model.lengths[s]>=9&&!bal&&total>=23)level=Math.max(level,gameLevel(s));const b=`${level}${s}`;return legal.includes(b)?b:null;};
 if(!opening){
  if(bal&&points>=20&&points<=21)return pick('2N');
  if(points>=22)return pick('2C');
  if(bal&&points>=15&&points<=17)return pick('1N');
  if(points>=12){const major=['S','H'].filter(s=>len[s]>=5).sort((a,b)=>len[b]-len[a])[0];const minor=len.D>len.C?'D':len.D===len.C&&len.D>=4?'D':'C';return pick('1'+(major||minor));}
  if(points>=6&&points<=10&&len[longest]>=6&&hand.filter(c=>c.suit===longest&&c.rank>=11).length>=2){if(len[longest]>=7)return pick('3'+longest);if(longest!=='C')return pick('2'+longest);}
  return pick('P');
 }
 if(p?.kind==='transfer'){return pick(natural(p.target)||'P');}
 if(p?.kind==='stayman'){const base=Number(p.bid[0]);return pick(`${base}${len.H>=4?'H':len.S>=4?'S':'D'}`);}
 if(p?.kind==='strong-open'&&!interference&&!ours.length)return pick('2D');
 if(p?.kind==='waiting'&&ours[0]?.kind==='strong-open')return pick(bal?'2N':natural(longest)||'3N');
 if(p?.kind==='jacoby')return pick('4'+opening.bid[1]);
 if(p?.kind==='takeout'&&!ours.length){const suit=byLength.find(s=>s!==opening.bid[1]);const b=natural(suit);return pick(points>=10&&target()?target():b||'P');}
 if(p?.kind==='nt-open'&&!ours.length&&!interference){const base=Number(p.bid[0]);if(len.H>=5||len.S>=5){const major=len.S>=len.H?'S':'H';return pick(`${base+1}${major==='H'?'D':'H'}`);}if((len.H>=4||len.S>=4)&&points>=(base===1?8:4))return pick(`${base+1}C`);return pick(target()||'P');}
 if(p?.kind==='transfer-accept'){if(points+model.min>=25)return pick(`${len[ours[0].target]>=6?4:3}${len[ours[0].target]>=6?ours[0].target:'N'}`);if(points+model.max>=25)return pick(len[ours[0].target]>=6?'3'+ours[0].target:'2N');return pick('P');}
 if(p?.kind==='stayman-answer'){if(['H','S'].includes(p.bid[1])&&len[p.bid[1]]>=4)return pick(`${points+model.min>=25?4:3}${p.bid[1]}`);return pick(points+model.min>=25?'3N':'2N');}
 if(opening.seat===partner(seat)&&!ours.length&&opening.bid[0]==='1'&&opening.bid[1]!=='N'){
  const s=opening.bid[1],major=['S','H'].includes(s),on=unpassed&&!interference;
  if(points<6)return pick('P');
  if(major&&len[s]>=3){if(points>=12&&len[s]>=4&&on)return pick('2N');if(points<=9)return pick(natural(s,3)||'P');if(points<=11&&len[s]>=4)return pick('3'+s);}
  if(s==='H'&&len.S>=4&&legal.includes('1S'))return pick('1S');
  if(!major){const m=['H','S'].find(t=>len[t]>=4&&legal.includes('1'+t));if(m)return pick('1'+m);if(s==='C'&&len.D>=4&&legal.includes('1D'))return pick('1D');}
  if(on&&totalPoints(hand)>=13){const suits=byLength.filter(t=>SUITS.indexOf(t)<SUITS.indexOf(s)&&(len[t]>=(t==='H'?5:t==='C'?3:4)));if(suits.length)return pick('2'+suits[0]);return pick('3N');}
  if(on&&major)return pick('1N');
  if(fit)return pick(target()||natural(fit,3)||'P');
  const newSuit=byLength.find(t=>t!==s&&len[t]>=5&&natural(t,2));if(newSuit&&points>=10)return pick(natural(newSuit,2));
  return pick(points>=12?'3N':points>=10&&bal?'2N':legal.includes('1N')?'1N':'P');
 }
 if(p?.kind==='forcing-nt'){
  if(bal&&points>=18&&legal.includes('2N'))return pick('2N');
  if(len[opening.bid[1]]>=6)return pick(natural(opening.bid[1]));
  const s=byLength.find(s=>s!==opening.bid[1]&&len[s]>=4&&natural(s,2));if(s)return pick(natural(s));
  return pick(natural(len.C>=3?'C':'D')||natural(opening.bid[1])||'P');
 }
 if(p?.kind==='two-over-one'){
  const ps=p.bid[1];if(['S','H'].includes(ps)&&len[ps]>=3)return pick(natural(ps,3)||target(true)||'P');
  const second=byLength.find(s=>s!==opening.bid[1]&&len[s]>=4&&natural(s,2));
  return pick(second?natural(second):bal&&legal.includes('2N')?'2N':natural(opening.bid[1],3)||target(true)||'P');
 }
 const gf=auction.some(c=>side(c.seat)===side(seat)&&c.force==='game');
 if(gf&&!isGame(last.bid)){const t=target(true);return pick(t||natural(fit||'N')||'P');}
 if(ours[0]?.kind==='forcing-nt'&&p){if(len[opening.bid[1]]>=3)return pick(points>=10?'3'+opening.bid[1]:natural(opening.bid[1],2)||'P');if(points>=10)return pick('2N');if(len[p.bid[1]]>=3)return pick('P');const s=byLength.find(s=>len[s]>=6&&natural(s,2));return pick(s?natural(s):'P');}
 if(opening.seat===seat&&p?.kind==='new-suit'){
  if(len[p.bid[1]]>=4)return pick(`${points>=18?4:points>=16?3:2}${p.bid[1]}`);
  if(bal)return pick(points>=18?'2N':'1N');
  const second=byLength.find(s=>s!==opening.bid[1]&&len[s]>=4&&natural(s,points>=17?3:2));return pick(second?natural(second):natural(opening.bid[1])||'P');
 }
 if(p&&BIDS.includes(p.bid)&&side(last.seat)===side(seat)){
  if(isGame(last.bid))return pick('P');
  const t=target();if(t&&(totalPoints(hand)+Math.max(model.min,model.minTP)>=25||p.kind==='limit'||p.kind==='invite-nt'))return pick(t);
  if(p.force==='round'){return pick(natural(longest)||'P');}
  return pick('P');
 }
 if(!ours.length&&!theirs.length&&side(opening.seat)!==side(seat)){
  const os=last.bid[1];const stopper=hand.some(c=>c.suit===os&&(c.rank===14||c.rank===13&&len[os]>=2||c.rank===12&&len[os]>=3));
  if(bal&&points>=15&&points<=18&&stopper&&legal.includes('1N'))return pick('1N');
  const s=byLength.find(s=>s!==os&&len[s]>=5&&natural(s,2)&&points>=(Number(natural(s)[0])===1?8:10));if(s)return pick(natural(s));
  if(points>=12&&len[os]<=2&&['C','D','H','S'].filter(s=>s!==os).every(s=>len[s]>=3)&&legal.includes('X'))return pick('X');
 }
 return pick('P');
}
