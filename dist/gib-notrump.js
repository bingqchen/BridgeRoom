import {BIDS,hcp,shape,partner,gameLevel} from './bridge-cards.js';
import {meaning as m,artificial as a,suits,majors,minors,has,totalPoints,cheapest,stopper} from './bidding-context.js';
const otherMajor=s=>s==='H'?'S':'H';
export function ntContext(c){const nt=c.auction.find(x=>[c.seat,partner(c.seat)].includes(x.seat)&&(x.kind==='nt-open'||x.kind==='nt-rebid'&&x.ntSystems));if(!nt)return null;const response=c.auction.slice(c.auction.indexOf(nt)+1).find(x=>x.seat===partner(nt.seat)&&x.bid!=='P');return {nt,base:Number(nt.bid[0]),response};}
export function interpretNT(c,bid){
 if(!BIDS.includes(bid)&&bid!=='X'&&bid!=='XX')return null;
 const n=ntContext(c);if(!n)return null;const {nt,base,response}=n,{p,own}=c,s=bid[1],level=Number(bid[0]),r=base+1;
 if(c.seat===partner(nt.seat)&&!response){
  const interference=c.enemy.filter(x=>c.auction.indexOf(x)>c.auction.indexOf(nt));
  if(interference.some(x=>BIDS.includes(x.bid)&&x.bid!=='2C'))return null;
  if(bid==='XX'&&c.lastAction?.bid==='X')return a('nt-runout','Redouble asks opener to bid clubs; responder may correct to diamonds.',{target:'C'});
  if(bid===`${r}C`||base===1&&bid==='X'&&c.last?.bid==='2C')return a('stayman','Stayman: asks for a four-card major; a 1NT invitation need not contain a major.',{ntBase:base,min:base===1?8:4});
  if(bid===`${r}D`||bid===`${r}H`){const target=s==='D'?'H':'S';return a('transfer',`Jacoby transfer: five or more ${target==='H'?'hearts':'spades'}.`,{target,lengths:{[target]:5},ntBase:base});}
  if(bid===`${r}S`)return a('minor-stayman','Minor-suit Stayman: usually at least 5–4 in the minors; game forcing.',{force:'game',lengths:{C:4,D:4},ntBase:base});
  if(base===1&&['2N','3C'].includes(bid)){const target=bid==='2N'?'C':'D';return a('minor-transfer',`Transfer to ${target==='C'?'clubs':'diamonds'}, showing six or more cards.`,{target,lengths:{[target]:6},ntBase:base});}
  if(['4D','4H'].includes(bid)){const target=s==='D'?'H':'S';return a('texas','Texas transfer: six or more cards in the target major; opener completes at game.',{target,fitSuit:target,lengths:{[target]:6},ntBase:base});}
  if(base===1&&['3D','3H','3S'].includes(bid))return a('nt-shortness','Game force with shortness here, at least four cards in the other suits, and no five-card major.',{shortSuit:s,force:'game',lengths:Object.fromEntries(suits.filter(t=>t!==s).map(t=>[t,4]))});
  if(bid==='3N')return m('signoff','To play in 3NT.');
 }
 if(c.partnerFree&&p?.kind==='nt-runout'&&bid==='2C')return a('nt-runout-accept','Forced club bid after the runout redouble.',{target:'C',force:undefined});
 if(c.partnerFree&&p?.kind==='nt-runout-accept'&&bid==='2D')return m('signoff','Corrects the runout to diamonds.',{lengths:{D:5}});
 if(c.partnerFree&&['transfer','minor-transfer','texas'].includes(p?.kind)&&s===p.target){const superaccept=p.kind==='transfer'&&level>Number(p.bid[0]);return m(superaccept?'transfer-superaccept':'transfer-accept',superaccept?'Maximum notrump opener with four-card support.':'Completes partner’s transfer.',{target:s,transferType:p.kind,ntBase:p.ntBase,fitSuit:p.kind==='texas'||superaccept?s:undefined,lengths:superaccept?{[s]:4}:{}});}
 if(c.partnerFree&&p?.kind==='minor-stayman')return m('minor-stayman-answer',s==='N'?'No suitable four-card minor to show.':'Shows a four-card or longer minor.',{lengths:s==='N'?{}:{[s]:4},ntBase:base});
 if(c.partnerFree&&p?.kind==='minor-stayman-answer'&&majors.includes(s))return a('splinter','Shortness in this major after Minor-suit Stayman.',{shortSuit:s,fitSuit:p.bid[1]==='N'?'C':p.bid[1],force:'game'});
 if(c.partnerFree&&p?.kind==='stayman'&&['D','H','S'].includes(s))return m('stayman-answer',s==='D'?'Denies a four-card major.':s==='H'?'Four hearts; may also have four spades.':'Four spades; denies four hearts.',{ntBase:base,lengths:s==='D'?{}:{[s]:4}});
 if(c.partnerFree&&p?.kind==='stayman-answer'){
  if(p.bid[1]==='D'&&majors.includes(s)&&level===3)return a('smolen','Smolen: four cards in the major bid and five in the other major; game forcing.',{force:'game',target:otherMajor(s),lengths:{[s]:4,[otherMajor(s)]:5}});
  if(base===1&&p.bid[1]==='D'&&majors.includes(s)&&level===2)return m('major-invite','Invitational, five cards in this major and four in the other.',{lengths:{[s]:5,[otherMajor(s)]:4}});
  if(base===1&&p.bid==='2H'&&bid==='2S')return m('major-invite','Invitational with four spades.',{lengths:{S:4}});
  if(bid==='2N')return m('invite-nt','Invites 3NT.',{min:8,max:9});
  if(minors.includes(s)&&level===(base===1?3:4))return m('nt-new-minor',base===1?'Five-card or longer minor; game forcing.':'Five-card or longer minor; slam interest.',{force:'game',lengths:{[s]:5}});
  if(majors.includes(p.bid[1])){
   const fit=p.bid[1];if(bid===`${base===1?3:fit==='H'?3:4}${otherMajor(fit)}`)return a('nt-slam-try','Artificial slam try with at least four-card support for opener’s major.',{fitSuit:fit,force:'game',lengths:{[fit]:4}});
   if(level===4&&s!==fit&&s!=='N'&&BIDS.indexOf(bid)<BIDS.indexOf('4'+fit))return a('splinter','Shortness in the bid suit with four-card major support and slam interest.',{fitSuit:fit,shortSuit:s,force:'game',lengths:{[fit]:4}});
   if(s===fit&&level===3)return m('major-invite','Invitational major raise.',{fitSuit:s,lengths:{[s]:4}});
  }
  if(bid==='3N')return m(base===2&&p.bid==='3H'?'nt-choice':'signoff',base===2&&p.bid==='3H'?'Choice of games; four spades.':'To play in notrump.',{lengths:base===2?{[otherMajor(p.bid[1])]:4}:{}});
 }
 if(c.partnerFree&&['transfer-accept','transfer-superaccept'].includes(p?.kind)){
  const target=p.target,type=p.transferType;
  if(type==='texas'&&s!=='N'&&s!==target)return m('control-bid','Control cue-bid after the Texas transfer.',{fitSuit:target,controlSuit:s,force:'round'});
  if(type==='minor-transfer'){
   if(bid==='3N')return m('minor-slam-try','Mild slam interest after the minor transfer; often balanced.',{fitSuit:target});
   if(s!=='N'&&s!==target&&level===3)return a('splinter','Shortness after the minor transfer.',{fitSuit:target,shortSuit:s,force:'game'});
  }
  if(type==='transfer'){
   if(bid==='2N')return m('invite-nt','Invitational with exactly five cards in the transferred major.',{target,lengths:{[target]:5},min:8,max:9});
   if(bid==='3N')return m('nt-choice','Choice of games: exactly five cards in the transferred major.',{target,lengths:{[target]:5}});
   if(bid==='5N')return a('slam-choice','Choose between six of the major and 6NT.',{target,fitSuit:target});
   if(s===target&&level===3)return m('major-invite','Invitational with six or more trumps.',{target,fitSuit:target,lengths:{[target]:6}});
   if(s===target&&level===4)return m('major-slam-try','Six or more trumps, no shortness, mild slam interest.',{target,fitSuit:target,lengths:{[target]:6}});
   if(base===1&&target==='H'&&bid==='2S')return m('major-invite','Invitational with five hearts and five spades.',{lengths:{H:5,S:5}});
   if((base===1&&target==='S'&&bid==='3H')||(base===2&&target==='H'&&bid==='3S')||(base===2&&target==='S'&&bid==='4H'))return m('two-majors','Five cards in each major; game force or choice of games.',{force:'game',lengths:{H:5,S:5}});
   if(minors.includes(s)&&level===(base===1?3:4))return m('transfer-new-suit','Four-card or longer side suit with five in the major; game forcing.',{force:'game',target,lengths:{[target]:5,[s]:4}});
   if(s!==target&&s!=='N'&&level>=3)return a('splinter','Shortness with six-card support for the transferred major; slam interest.',{force:'game',fitSuit:target,shortSuit:s,lengths:{[target]:6}});
  }
 }
 if(c.partnerFree&&p?.kind==='smolen'&&s===p.target)return m('game','Accepts Smolen with support for the five-card major.',{fitSuit:s});
 return null;
}
export function chooseNT(hand,c){
 const n=ntContext(c);if(!n)return null;const {nt,base,response}=n,{p}=c,len=shape(hand),points=hcp(hand),tp=totalPoints(hand),r=base+1;
 const game=tp+(nt.min||15)>=25,invite=tp+(nt.max||17)>=25;
 if(c.seat===partner(nt.seat)&&!response){
  const interference=c.enemy.filter(x=>c.auction.indexOf(x)>c.auction.indexOf(nt));
  if(interference.some(x=>BIDS.includes(x.bid)&&x.bid!=='2C'))return null;
  if(c.lastAction?.bid==='X'&&points<7&&Math.max(len.C,len.D)>=5)return 'XX';
  if(points+(nt.min||15)>=33&&Math.max(len.H,len.S)<5)return '6N';
  if(points+(nt.max||17)>=33&&Math.max(len.H,len.S)<5)return '4N';
  if(game&&len.H>=5&&len.S>=4||game&&len.S>=5&&len.H>=4)return base===1&&c.last?.bid==='2C'?'X':`${r}C`;
  const major=['S','H'].find(s=>len[s]>=5);
  if(major){if(len[major]>=6&&game&&tp+(nt.min||15)<31)return major==='H'?'4D':'4H';return `${r}${major==='H'?'D':'H'}`;}
  if(game&&len.C>=4&&len.D>=4&&Math.max(len.C,len.D)>=5)return `${r}S`;
  if(base===1&&points<8&&Math.max(len.C,len.D)>=6)return len.C>=len.D?'2N':'3C';
  if(invite&&(len.H>=4||len.S>=4||base===1&&!game))return base===1&&c.last?.bid==='2C'?'X':`${r}C`;
  if(base===1&&game){const short=suits.find(s=>len[s]<=1&&s!=='C'&&suits.filter(t=>t!==s).every(t=>len[t]>=4));if(short)return '3'+short;}
  return game?'3N':'P';
 }
 if(!c.partnerFree)return null;
 if(p?.kind==='nt-runout')return '2C';
 if(p?.kind==='nt-runout-accept')return len.C>=len.D?'P':'2D';
 if(p?.kind==='stayman')return `${Number(p.bid[0])||2}${len.H>=4?'H':len.S>=4?'S':'D'}`;
 if(['transfer','minor-transfer','texas'].includes(p?.kind)){
  if(p.kind==='texas')return '4'+p.target;
  const level=p.kind==='minor-transfer'?3:Number(p.bid[0]);
  return `${p.kind==='transfer'&&points===(nt.max||17)&&len[p.target]>=4?level+1:level}${p.target}`;
 }
 if(p?.kind==='minor-stayman')return len.C>=4&&len.C>=len.D?`${base+2}C`:len.D>=4?`${base+2}D`:base===1?'2N':'3N';
 if(p?.kind==='minor-stayman-answer')return p.bid[1]==='N'?'3N':tp+(nt.min||15)>=32?'4N':'3N';
 if(p?.kind==='stayman-answer'){
  const major=p.bid[1];if(majors.includes(major)&&len[major]>=4)return game?'4'+major:'3'+major;
  if(major==='D'&&game&&len.H>=5&&len.S===4)return '3S';
  if(major==='D'&&game&&len.S>=5&&len.H===4)return '3H';
  if(base===1&&!game&&major==='D'){const five=majors.find(s=>len[s]>=5);if(five)return '2'+five;}
  if(base===1&&!game&&major==='H'&&len.S===4)return '2S';
  if(base===2&&major==='H'&&len.S===4)return '3N';
  return game?'3N':base===1?'2N':'P';
 }
 if(['transfer-accept','transfer-superaccept'].includes(p?.kind)){
  const target=p.target;
  if(p.transferType==='texas')return 'P';
  if(p.transferType==='minor-transfer')return game?'3N':'P';
  if(game)return len[target]>=6?'4'+target:'3N';
  if(invite)return len[target]>=6?'3'+target:'2N';
  return 'P';
 }
 if(p?.kind==='smolen')return len[p.target]>=3?'4'+p.target:'3N';
 if(p?.kind==='nt-choice')return p.target&&len[p.target]>=3?'4'+p.target:base===2&&len.S>=4?'4S':'P';
 if(p?.kind==='two-majors')return len.H>=len.S?'4H':'4S';
 if(p?.kind==='slam-choice')return len[p.target]>=3?'6'+p.target:'6N';
 if(p?.kind==='major-invite'){
  const target=p.target||p.fitSuit||p.bid[1];return points>=(nt.max||17)?'4'+target:'P';
 }
 if(p?.kind==='invite-nt')return points>=(nt.max||17)?p.target&&len[p.target]>=3?'4'+p.target:'3N':'P';
 if(['nt-new-minor','transfer-new-suit','nt-shortness'].includes(p?.kind))return '3N';
 if(['nt-slam-try','major-slam-try','minor-slam-try'].includes(p?.kind))return points>=(nt.max||17)?'4N':p.fitSuit?'4'+p.fitSuit:'P';
 return null;
}
