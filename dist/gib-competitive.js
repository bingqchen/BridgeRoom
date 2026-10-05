import {BIDS,hcp,shape,balanced,partner,side,gameLevel} from './bridge-cards.js';
import {meaning as m,artificial as a,suits,majors,minors,has,totalPoints,cheapest,jump,naturalSuit,stopper,partnerModel} from './bidding-context.js';
const atMost=(bid,max)=>BIDS.indexOf(bid)<=BIDS.indexOf(max);
const enemySuits=c=>[...new Set(c.enemy.flatMap(x=>Object.keys(x.lengths||{}).concat(naturalSuit(x)||[])))];
const lowestUnbid=c=>suits.filter(s=>!enemySuits(c).includes(s)).slice(0,2);
function lebensohl(c){
 if(c.p?.kind==='reverse'&&c.partnerFree)return {mode:'reverse',enemySuit:null};
 if(c.p?.kind==='takeout'&&c.partnerFree&&c.opening?.kind==='weak-open')return {mode:'weak-two',enemySuit:c.opening.bid[1]};
 if(c.responding&&c.opening.bid==='1N'&&c.last?.seat!==c.opening.seat&&c.last?.bid[0]==='2'&&c.last.bid!=='2C')return {mode:'notrump',enemySuit:c.last.bid[1]};
 return null;
}
export function interpretCompetitive(c,bid){
 const {opening,p,own}=c;if(!opening)return null;const s=bid[1],level=Number(bid[0]),enemy=enemySuits(c),lb=lebensohl(c),theirOpening=side(opening.seat)!==side(c.seat);
 if(c.partnerFree&&p?.kind==='lebensohl'&&bid==='3C')return a('lebensohl-relay','Completes the Lebensohl relay; partner may pass or clarify the hand.',{mode:p.mode,enemySuit:p.enemySuit,force:undefined});
 if(c.partnerFree&&p?.kind==='lebensohl-relay'){
  if(bid==='3N')return m('lebensohl-stopped','Game values with a stopper: slow shows.',{stopperSuit:p.enemySuit});
  if(s===p.enemySuit)return a('lebensohl-cue','Stayman-style cue-bid with a stopper after the relay.',{force:'game',enemySuit:p.enemySuit,stopperSuit:s});
  if(BIDS.includes(bid))return m('lebensohl-escape','Natural weak continuation after the relay.',{lengths:{[s]:p.mode==='notrump'?5:4},max:7});
 }
 if(lb){
  if(bid==='2N')return a('lebensohl','Lebensohl relay to 3♣; can be weak or prepare a stopper-showing continuation.',lb);
  if(bid==='3N'&&lb.mode==='notrump')return m('lebensohl-unstopped','Game values without a stopper: fast denies.',{force:'game',enemySuit:lb.enemySuit});
  if(s===lb.enemySuit&&level===3)return a('lebensohl-cue','Game-forcing cue-bid, seeking a major fit; direct route denies a stopper.',{force:'game',enemySuit:s});
  if(level===3&&s!=='N')return m('lebensohl-positive',lb.mode==='notrump'?'Natural five-card suit, game forcing.':'Positive natural response, about 8+ points.',{force:lb.mode==='notrump'?'game':undefined,min:8,lengths:{[s]:lb.mode==='notrump'?5:4}});
 }
 if(bid==='X'){
  if(opening.bid==='1N'&&theirOpening&&!c.ours.length&&!c.theirs.length)return m('penalty','Cappelletti penalty double of 1NT; a strong hand.');
  if(own?.seat===opening.seat&&p?.kind==='new-suit'&&majors.includes(p.bid[1])&&atMost(c.last.bid,'2H'))return a('support-double','Support double: usually three cards in responder’s major; may be Kx.',{lengths:{[p.bid[1]]:2},supportSuit:p.bid[1]});
  if(c.responding&&opening.bid[1]!=='N'&&BIDS.includes(c.lastAction?.bid)&&atMost(c.last.bid,'3S'))return a('negative-double','Negative double: values and unbid-suit support, especially unbid majors; through 3♠.',{min:Number(c.last.bid[0])===1?6:8,lengths:Object.fromEntries(majors.filter(s=>!enemy.includes(s)&&s!==opening.bid[1]).map(s=>[s,4]))});
  if(p&&['takeout','overcall'].includes(p.kind)&&theirOpening&&c.last?.bid[1]===opening.bid[1]&&c.last.seat!==opening.seat&&atMost(c.last.bid,'3S'))return a('responsive-double','Responsive double: values in the unbid suits after opponents raise; through 3♠.',{min:8});
  if(!c.ours.length&&theirOpening&&c.last.bid[1]!=='N'&&atMost(c.last.bid,'4H'))return m('takeout','Takeout double: support for the unbid suits or a very strong hand; through 4♥.',{min:12});
  return m('penalty','Penalty double: expects to defeat the contract.');
 }
 if(c.responding&&c.lastAction?.bid==='X'){
  if(bid==='2N')return a('jordan','Jordan / Truscott 2NT: limit raise or better with trump support.',{minTP:11,fitSuit:opening.bid[1],lengths:{[opening.bid[1]]:majors.includes(opening.bid[1])?4:5}});
  if(bid==='XX')return m('business-redouble','10+ HCP; interested in penalizing the opponents.',{min:10});
  if(!c.unpassed&&bid==='2C')return m('natural-weak','Passed hand: natural weak clubs over a double; Drury is off.',{lengths:{C:5}});
 }
 if(c.responding&&!c.unpassed&&c.enemy.some(x=>BIDS.includes(x.bid))&&bid==='2C')return m('natural-forcing','Passed hand: natural clubs, forcing one round after an overcall.',{force:'round',lengths:{C:5}});
 const unusual=c.enemy.findLast(x=>['unusual-nt','michaels'].includes(x.kind));
 if(c.responding&&unusual&&opening.bid[0]==='1'&&level<=3&&BIDS.includes(bid)&&Object.keys(unusual.lengths||{}).includes(s))return a('unusual-v-unusual',s===suits.find(s=>Object.keys(unusual.lengths||{}).includes(s))?'Lower cue-bid: limit raise or better of opener.':'Higher cue-bid: game-forcing values in the fourth suit.',{force:'round',fitSuit:s===suits.find(s=>Object.keys(unusual.lengths||{}).includes(s))?opening.bid[1]:undefined,minTP:11});
 if(c.responding&&enemy.includes(s)&&level<=3&&BIDS.includes(bid))return a('competitive-raise','Cue-bid: limit raise or better with support for opener.',{minTP:11,fitSuit:opening.bid[1],lengths:{[opening.bid[1]]:3}});
 if(!c.ours.length&&!c.theirs.length&&theirOpening){
  if(opening.bid==='1N'){
   if(bid==='2C')return a('capp-one','Cappelletti: a one-suited hand; partner usually relays to 2♦.');
   if(bid==='2D')return a('capp-majors','Cappelletti: both majors.',{lengths:{H:5,S:5}});
   if(bid==='2H'||bid==='2S')return a('capp-major-minor','Cappelletti: this major and an unspecified minor.',{target:s,lengths:{[s]:5}});
   if(bid==='2N')return a('unusual-nt','Cappelletti: both minors.',{lengths:{C:5,D:5}});
  }
  if(opening.kind==='weak-open'&&majors.includes(opening.bid[1])&&['4'+opening.bid[1],'4N'].includes(bid))return a('michaels',bid==='4N'?'Both minors, a weaker two-suited hand.':'Strong hand with both minors over a weak two.',{lengths:{C:5,D:5},min:bid==='4N'?10:16});
  if(bid==='1N'&&!c.unpassed&&c.enemy.filter(x=>BIDS.includes(x.bid)).length>=2)return a('sandwich','Passed-hand Sandwich 1NT: the two unbid suits.',{lengths:Object.fromEntries(lowestUnbid(c).map(s=>[s,5]))});
  if(bid==='2N'&&opening.bid[0]==='1'&&opening.bid[1]!=='N')return a('unusual-nt','Unusual 2NT: at least 5–5 in the two lowest unbid suits; intermediate or better, stronger when vulnerable.',{lengths:Object.fromEntries(lowestUnbid(c).map(s=>[s,5]))});
  if(s===opening.bid[1]&&level===2)return a('michaels',minors.includes(s)?'Michaels cue-bid: at least 5–5 in the majors.':'Michaels cue-bid: the other major and a minor, at least 5–5.',{lengths:minors.includes(s)?{H:5,S:5}:{[s==='H'?'S':'H']:5},target:majors.includes(s)?s==='H'?'S':'H':undefined});
  if(BIDS.includes(bid)&&s!=='N'&&jump(c.auction,bid)===1)return m('weak-jump','Weak jump overcall: 3–9 HCP and a long suit, independent of vulnerability.',{min:3,max:9,lengths:{[s]:level+4}});
  if(BIDS.includes(bid)&&s!=='N')return m('overcall',level===1?'Natural overcall: normally five cards, 8–17 HCP and 9–19 total points; a strong four-card major is possible.':'Natural overcall: a five-card or longer suit and sound values.',{min:level===1?8:10,max:17,minTP:level===1?9:10,lengths:{[s]:5}});
 }
 if(c.partnerFree&&p?.kind==='capp-one'&&bid==='2D')return a('capp-relay','Relay: asks the Cappelletti bidder to name the long suit; may pass with diamonds.',{force:undefined});
 if(c.partnerFree&&p?.kind==='capp-relay'&&BIDS.includes(bid))return m('capp-answer','Names the long suit.',{lengths:{[s]:6}});
 if(c.partnerFree&&['capp-major-minor','michaels','capp-majors'].includes(p?.kind)&&bid==='2N')return a('minor-ask','Asks partner to name the minor.',{target:p.target});
 if(c.partnerFree&&p?.kind==='minor-ask'&&minors.includes(s))return m('minor-answer','Names the minor suit.',{lengths:{[s]:5}});
 if(c.partnerFresh&&p?.kind==='support-double'&&s===p.supportSuit)return m('support-rebid','Natural continuation opposite the support double.',{lengths:{[s]:5}});
 return null;
}
export function chooseCompetitive(hand,c,{vulnerable=false}={}){
 const {opening,p}=c;if(!opening)return null;const len=shape(hand),points=hcp(hand),tp=totalPoints(hand),byLength=['S','H','D','C'].sort((a,b)=>len[b]-len[a]),enemy=enemySuits(c),lb=lebensohl(c),model=partnerModel(c),theirOpening=side(opening.seat)!==side(c.seat);
 if(c.partnerFree&&p?.kind==='lebensohl')return '3C';
 if(c.partnerFree&&p?.kind==='lebensohl-relay'){
  if(p.mode==='notrump'&&tp+model.minTP>=25&&stopper(hand,p.enemySuit))return '3N';
  const s=byLength.find(s=>s!==p.enemySuit);return s==='C'?'P':cheapest(c.auction,s);
 }
 if(lb){
  const longest=byLength.find(s=>s!==lb.enemySuit),b=cheapest(c.auction,longest);
  if(lb.mode==='notrump'){
   if(tp+15>=25){if(stopper(hand,lb.enemySuit))return '2N';if(len[longest]>=5)return '3'+longest;return '3N';}
   if(len[longest]>=5)return b?.[0]==='2'?b:'2N';return 'P';
  }
  if(points<8)return b?.[0]==='2'?b:'2N';
  return tp+model.minTP>=25&&majors.includes(longest)?'4'+longest:b;
 }
 if(c.partnerFree&&['lebensohl-unstopped','lebensohl-cue'].includes(p?.kind)){
  if(stopper(hand,p.enemySuit))return p.bid==='3N'?'P':'3N';const major=majors.find(s=>s!==p.enemySuit&&len[s]>=4);return major?'4'+major:'5'+(len.C>=len.D?'C':'D');
 }
 if(c.responding&&c.lastAction?.bid==='X'){
  if(len[opening.bid[1]]>=(majors.includes(opening.bid[1])?4:5)&&tp>=11)return '2N';
  if(points>=10)return 'XX';
 }
 if(c.responding&&c.enemy.some(x=>BIDS.includes(x.bid))&&opening.bid[1]!=='N'){
  const es=c.last.bid[1],os=opening.bid[1];
  if(len[os]>=3&&tp>=11&&es!==os&&atMost(c.last.bid,'3S'))return cheapest(c.auction,es);
  const unbidMajors=majors.filter(s=>s!==os&&!enemy.includes(s));
  if(c.legal.includes('X')&&atMost(c.last.bid,'3S')&&points>=(Number(c.last.bid[0])===1?6:8)&&unbidMajors.length&&unbidMajors.every(s=>len[s]===4))return 'X';
  if(len[os]>=3&&tp>=6){const level=Math.min(gameLevel(os),len[os]+(majors.includes(os)?5:4)-6);return level+os;}
 }
 if(c.legal.includes('X')&&c.own?.seat===opening.seat&&p?.kind==='new-suit'&&majors.includes(p.bid[1])&&atMost(c.last.bid,'2H')&&(len[p.bid[1]]===3||len[p.bid[1]]===2&&has(hand,p.bid[1],13)))return 'X';
 if(c.legal.includes('X')&&p&&['takeout','overcall'].includes(p.kind)&&theirOpening&&c.last.bid[1]===opening.bid[1]&&c.last.seat!==opening.seat&&atMost(c.last.bid,'3S')&&points>=8&&suits.filter(s=>!enemy.includes(s)&&s!==p.bid[1]).every(s=>len[s]>=3))return 'X';
 if(c.partnerFree){
  if(p?.kind==='capp-one')return '2D';
  if(p?.kind==='capp-relay')return byLength[0]==='D'?'P':cheapest(c.auction,byLength[0]);
  if(p?.kind==='minor-ask')return '3'+(len.C>=len.D?'C':'D');
  if(['capp-major-minor','michaels'].includes(p?.kind)&&p.target){if(len[p.target]>=3)return cheapest(c.auction,p.target);if(len.C>=3&&len.D>=3)return '2N';return cheapest(c.auction,p.target);}
  if(['capp-majors','michaels','unusual-nt','sandwich'].includes(p?.kind)){const known=Object.keys(p.lengths||{}).sort((a,b)=>len[b]-len[a]),s=known[0];return s?cheapest(c.auction,s):'P';}
  if(['jordan','competitive-raise','unusual-v-unusual'].includes(p?.kind)&&p.fitSuit)return (tp>=14?gameLevel(p.fitSuit):3)+p.fitSuit;
  if(['negative-double','responsive-double','support-double'].includes(p?.kind)){
   const s=p.supportSuit||byLength.find(s=>!enemy.includes(s)&&s!==opening.bid[1])||byLength[0];return tp+(p.min||6)>=25?gameLevel(s)+s:cheapest(c.auction,s);
  }
  if(p?.kind==='overcall'&&!c.ours.length){const s=p.bid[1];if(s!=='N'&&len[s]>=3){if(tp>=12)return cheapest(c.auction,opening.bid[1]);const level=Math.min(gameLevel(s),len[s]+5-6);return level+s;}if(points>=10&&balanced(hand)&&enemy.every(s=>stopper(hand,s)))return points>=13?'3N':cheapest(c.auction,'N');}
 }
 if(!c.ours.length&&!c.theirs.length&&theirOpening){
  if(opening.bid==='1N'){
   if(points>=17&&balanced(hand))return 'X';if(points<8)return 'P';
   if(len.H>=5&&len.S>=5)return '2D';
   if(len.C>=5&&len.D>=5)return '2N';
   const major=majors.find(s=>len[s]>=5&&Math.max(len.C,len.D)>=5);if(major)return '2'+major;
   if(len[byLength[0]]>=6)return '2C';return 'P';
  }
  const os=opening.bid[1];
  if(opening.kind==='weak-open'&&majors.includes(os)&&len.C>=5&&len.D>=5&&points>=10)return points>=16?'4'+os:'4N';
  if(opening.bid[0]==='1'){
   const lowest=lowestUnbid(c);
   if(!c.unpassed&&c.enemy.filter(x=>BIDS.includes(x.bid)).length>=2&&lowest.every(s=>len[s]>=5)&&points>=6)return '1N';
   const other=os==='H'?'S':'H';
   if((!vulnerable&&points>=8||points>=12)&&(minors.includes(os)&&len.H>=5&&len.S>=5||majors.includes(os)&&len[other]>=5&&Math.max(len.C,len.D)>=5))return '2'+os;
   if(points>=(vulnerable?13:10)&&lowest.length===2&&lowest.every(s=>len[s]>=5))return '2N';
   const weak=byLength.find(s=>s!==os&&len[s]>=6&&points>=3&&points<=9);if(weak){const b=cheapest(c.auction,weak);if(len[weak]>=Number(b[0])+5)return (Number(b[0])+1)+weak;}
  }
  if(points>=18&&c.legal.includes('X')&&os!=='N'&&atMost(c.last.bid,'4H'))return 'X';
  if(points>=12&&len[os]<=2&&suits.filter(s=>s!==os).every(s=>len[s]>=3)&&c.legal.includes('X')&&atMost(c.last.bid,'4H'))return 'X';
  if(points>=8&&points<=17&&tp>=9&&tp<=19){const strongFour=majors.find(s=>s!==os&&len[s]===4&&[14,13,12].every(r=>has(hand,s,r))&&cheapest(c.auction,s)?.[0]==='1');if(strongFour)return '1'+strongFour;}
 }
 return null;
}
