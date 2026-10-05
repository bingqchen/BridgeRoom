import {BIDS,hcp,shape,partner} from './bridge-cards.js';
import {meaning as m,artificial as a,suits,has,agreedTrump,lastNaturalSuit,cheapest} from './bidding-context.js';
import {ntContext} from './gib-notrump.js';
const nextStep=(c,trump)=>c.legal.find(b=>BIDS.includes(b)&&b[1]!==trump);
const keycards=(hand,trump)=>hand.filter(x=>x.rank===14||x.rank===13&&x.suit===trump).length;
export function interpretSlam(c,bid){
 const {p,own}=c,n=ntContext(c),s=bid[1];
 if(c.partnerFresh&&p?.kind==='rkcb'){
  const interference=c.enemy.some(x=>c.auction.indexOf(x)>c.auction.indexOf(p)&&BIDS.includes(x.bid));
  if(interference){if(bid==='X'||bid==='P')return m('dopi',`DOPI: ${bid==='X'?'zero':'one'} keycard.`,{keyCounts:[bid==='X'?0:1],trump:p.trump});const steps=c.legal.filter(b=>BIDS.includes(b)),count=steps.indexOf(bid)+2;if(count>=2)return a('dopi',`DOPI step response: ${count} keycards.`,{keyCounts:[count],trump:p.trump});}
  const counts={'5C':[0,3],'5D':[1,4],'5H':[2,5],'5S':[2,5]};
  if(counts[bid])return a('rkcb-answer',`0314 keycard response: ${counts[bid].join(' or ')} keycards${bid==='5H'?', without the trump queen':bid==='5S'?', with the trump queen':''}.`,{keyCounts:counts[bid],trump:p.trump,trumpQueen:bid==='5H'?false:bid==='5S'?true:undefined});
  if(bid==='5N'||bid[0]==='6')return a('rkcb-void',bid==='5N'?'Even keycards and a void.':'Odd keycards and a void; a side-suit response identifies the void.',{trump:p.trump,keyCounts:bid==='5N'?[0,2,4]:[1,3,5],voidSuit:s===p.trump||s==='N'?undefined:s});
 }
 if(c.partnerFree&&['rkcb-answer','rkcb-void','dopi','queen-answer'].includes(p?.kind)&&['rkcb','queen-ask'].includes(own?.kind)){
  if(bid==='5N')return a('king-ask','All five keycards and the trump queen are accounted for; asks for a specific side king.',{trump:p.trump});
  if(p.kind==='rkcb-answer'&&['5C','5D'].includes(p.bid)&&bid===nextStep(c,p.trump))return a('queen-ask','Asks for the trump queen.',{trump:p.trump});
  if(s===p.trump)return m('signoff','Stops in the agreed trump suit.',{fitSuit:p.trump});
 }
 if(c.partnerFree&&p?.kind==='queen-ask')return m('queen-answer',s===p.trump?'Denies the trump queen.':bid==='5N'?'Trump queen, without a side king that can be shown below six of trumps.':'Trump queen and the king of the suit bid.',{trump:p.trump,trumpQueen:s!==p.trump,kingSuit:s!=='N'&&s!==p.trump?s:undefined});
 if(c.partnerFree&&p?.kind==='king-ask')return m('king-answer',s===p.trump?'No lower-ranking side king to show.':'Shows the lowest side king below the trump suit.',{trump:p.trump,kingSuit:s!==p.trump?s:undefined});
 if(c.partnerFree&&['gerber','gerber-kings'].includes(p?.kind)){
  const steps=p.kind==='gerber'?['4D','4H','4S','4N']:['5D','5H','5S','5N'],i=steps.indexOf(bid);
  if(i>=0)return a('gerber-answer',`Gerber response: ${i===0?'0 or 4':i} ${p.kind==='gerber'?'aces':'kings'}.`,{counts:i===0?[0,4]:[i],asking:p.kind});
 }
 if(c.partnerFree&&p?.kind==='gerber-answer'&&own?.kind==='gerber'&&bid==='5C')return a('gerber-kings','Gerber continuation asking for kings.');
 if(n&&c.seat===partner(n.nt.seat)&&!n.response&&bid==='4C')return a('gerber','Gerber: asks for aces over notrump.');
 if(bid==='4N'||bid==='5N'){
  if(c.partnerFree&&p?.kind==='nt-rebid'&&!agreedTrump(c.auction,c.seat))return m('quantitative','Quantitative invitation over partner’s natural notrump rebid.',{ntMax:p.max,slamLevel:bid==='4N'?6:7});
  const quantitative=n&&(!n.response||c.partnerFree&&['stayman-answer','transfer-accept','transfer-superaccept'].includes(p?.kind)&&!['texas','minor-transfer'].includes(p.transferType));
  if(quantitative){if(bid==='5N'&&p?.transferType==='transfer')return null;return m('quantitative',bid==='4N'?'Quantitative invitation to a small slam; not Blackwood.':'Quantitative invitation to 7NT.',{ntBase:n.base,ntMax:n.nt.max,target:p?.transferType==='transfer'?p.target:undefined,slamLevel:bid==='4N'?6:7});}
  if(bid==='4N'&&c.theirs.length){const trump=agreedTrump(c.auction,c.seat)||p?.target||lastNaturalSuit(c.auction,c.seat);if(trump)return a('rkcb','Roman Keycard Blackwood, 0314 responses; trump king is the fifth keycard.',{trump,fitSuit:trump});}
 }
 return null;
}
export function chooseSlam(hand,c){
 const {p,own}=c;if(!c.partnerFresh)return null;const len=shape(hand),points=hcp(hand);
 if(p?.kind==='rkcb'){
  const count=keycards(hand,p.trump),interference=c.enemy.some(x=>c.auction.indexOf(x)>c.auction.indexOf(p)&&BIDS.includes(x.bid));
  if(interference)return count===0?'X':count===1?'P':c.legal.filter(b=>BIDS.includes(b))[count-2];
  const voidSuit=suits.find(s=>s!==p.trump&&len[s]===0);
  if(voidSuit&&count>=2){if(count%2===0)return '5N';return '6'+(suits.indexOf(voidSuit)<suits.indexOf(p.trump)?voidSuit:p.trump);}
  return count===0||count===3?'5C':count===1||count===4?'5D':has(hand,p.trump,12)?'5S':'5H';
 }
 if(!c.partnerFree)return null;
 if(p?.kind==='queen-ask'){if(!has(hand,p.trump,12))return cheapest(c.auction,p.trump);return c.legal.find(b=>b[0]==='6'&&suits.indexOf(b[1])<suits.indexOf(p.trump)&&has(hand,b[1],13))||'5N';}
 if(p?.kind==='king-ask')return suits.filter(s=>suits.indexOf(s)<suits.indexOf(p.trump)).filter(s=>has(hand,s,13)).map(s=>'6'+s)[0]||'6'+p.trump;
 if(['rkcb-answer','rkcb-void','dopi'].includes(p?.kind)&&own?.kind==='rkcb'){
  const total=keycards(hand,p.trump)+Math.min(...p.keyCounts.filter(n=>n+keycards(hand,p.trump)<=5));
  if(total<4)return cheapest(c.auction,p.trump);
  if(p.trumpQueen===undefined&&!has(hand,p.trump,12)&&['5C','5D'].includes(p.bid))return nextStep(c,p.trump);
  return (total===5&&(p.trumpQueen||has(hand,p.trump,12))&&points>=22?7:6)+p.trump;
 }
 if(p?.kind==='queen-answer'&&own?.kind==='queen-ask')return (p.trumpQueen||has(hand,p.trump,12)?'6':cheapest(c.auction,p.trump)?.[0]||'6')+p.trump;
 if(p?.kind==='king-answer'&&own?.kind==='king-ask')return '6'+p.trump;
 if(['gerber','gerber-kings'].includes(p?.kind)){const count=hand.filter(c=>c.rank===(p.kind==='gerber'?14:13)).length;return (p.kind==='gerber'?['4D','4H','4S','4N']:['5D','5H','5S','5N'])[count%4];}
 if(p?.kind==='gerber-answer'&&['gerber','gerber-kings'].includes(own?.kind)){const aces=hand.filter(c=>c.rank===14).length+Math.min(...p.counts);return aces>=3?'6N':'4N';}
 if(p?.kind==='quantitative')return points>=(p.ntMax||(p.ntBase===1?17:21))?p.slamLevel+(p.target&&len[p.target]>=3?p.target:'N'):p.slamLevel===7?'6N':'P';
 return null;
}
