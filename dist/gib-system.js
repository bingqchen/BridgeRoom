// Public GIB-style agreements, with deterministic hand evaluation (not BBO's robot engine).
import {BIDS,side,hcp,shape,isGame,gameLevel,partner} from './bridge-cards.js';
import {context,totalPoints,partnerModel,agreedTrump,suits,meaning as m,artificial as a,cheapest} from './bidding-context.js';
import {interpretNatural,chooseNaturalBid} from './natural-bidding.js';
import {interpretNT,chooseNT} from './gib-notrump.js';
import {interpretSuit,chooseSuit} from './gib-suit.js';
import {interpretCompetitive,chooseCompetitive} from './gib-competitive.js';
import {interpretSlam,chooseSlam} from './gib-slam.js';
export {totalPoints};
export function interpret(auction,seat,bid){
 const c=context(auction,seat);
 if(bid==='P')return interpretSlam(c,bid)?.kind==='dopi'?interpretSlam(c,bid):interpretNatural(auction,seat,bid);
 if(!c.opening&&BIDS.includes(bid)){
  const base=interpretNatural(auction,seat,bid);
  if(bid==='2C')return {...base,artificial:true};
  if(bid==='1N')return {...base,reason:'15–17 HCP, balanced; may have a five-card major, except 17 HCP with a five-card major opens the major.'};
  if(bid==='1C')return {...base,reason:'Natural opening; at least three clubs. With 4–4 minors, opens diamonds.'};
  if(bid==='1D')return {...base,reason:'Natural opening; normally four diamonds, three only with 4–4–3–2 shape.'};
  if(bid==='3N')return m('natural-nt','Natural strong 3NT opening; not Gambling 3NT.',{min:25,max:27});
  return base;
 }
 const result=interpretCompetitiveSpecial(c,bid)||interpretSlam(c,bid)||interpretNT(c,bid)||interpretCompetitive(c,bid)||interpretSuit(c,bid);
 if(result)return result;
 const base=interpretNatural(auction,seat,bid);
 if(base.kind==='two-over-one')return {...base,min:undefined,minTP:13,reason:'Nonjump 2/1 by an unpassed hand without interference: natural and forcing to game. A major rebid by opener can still be only five cards.'};
 if(base.kind==='forcing-nt')return {...base,min:5,max:12,reason:'Forcing 1NT: opener must rebid; can conceal a three-card limit raise.'};
 return base;
}
// Competitive two-suiters must take precedence over the generic 4NT keycard meaning.
function interpretCompetitiveSpecial(c,bid){
 if(c.opening?.kind==='weak-open'&&!c.ours.length&&!c.theirs.length&&side(c.opening.seat)!==side(c.seat)&&bid==='4N')return interpretCompetitive(c,bid);
 return null;
}
export function chooseBid(hand,auction,seat,options={}){
 const c=context(auction,seat),len=shape(hand),tp=totalPoints(hand),model=partnerModel(c);
 const forcedGame=auction.some(x=>side(x.seat)===side(seat)&&x.force==='game');
 const fit=agreedTrump(auction,seat)||['S','H','D','C'].find(s=>model.lengths[s]>0&&len[s]+model.lengths[s]>=8);
 const gameBid=()=>{const s=fit||'N',b=gameLevel(s)+s;return c.legal.includes(b)?b:c.legal.find(b=>BIDS.includes(b)&&b[1]===s);};
 let bid=chooseSlam(hand,c);
 if(bid==null)bid=chooseNT(hand,c);
 if(bid==null)bid=chooseCompetitive(hand,c,options);
 if(bid==null)bid=chooseSuit(hand,c);
 if(bid==null){
  if(c.partnerFree&&c.p?.kind==='limit')bid=tp+11>=25?gameBid():'P';
  else if(c.partnerFree&&c.p?.kind==='strong-rebid'){
   const s=c.p.bid[1];bid=len[s]>=3?cheapest(auction,s):cheapest(auction,['S','H','D','C'].sort((a,b)=>len[b]-len[a])[0]);
  }else bid=chooseNaturalBid(hand,auction,seat).bid;
 }
 if(!c.legal.includes(bid))bid='P';
 // An artificial inquiry is answered even if it is above game; general GF only binds below game.
 if(bid==='P'&&c.partnerFree&&c.p?.force==='round'&&c.p.artificial){
  bid=c.legal.find(b=>BIDS.includes(b)&&b[1]===(fit||'N'))||c.legal.find(b=>BIDS.includes(b))||'P';
 }
 if(bid==='P'&&forcedGame&&c.partnerFresh&&!isGame(c.last?.bid||'1C')&&c.last&&side(c.last.seat)===side(seat))bid=gameBid()||'P';
 const info=interpret(auction,seat,bid);
 return {bid,...info};
}
