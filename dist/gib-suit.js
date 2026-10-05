import {BIDS,SUITS,hcp,shape,balanced,partner,isGame,gameLevel} from './bridge-cards.js';
import {meaning as m,artificial as a,suits,majors,minors,has,totalPoints,controls,suitQuality,cheapest,jump,naturalSuit,agreedTrump,partnerModel,stopper} from './bidding-context.js';
const openingMajor=c=>majors.includes(c.opening?.bid[1]);
const simpleRaise=c=>c.p?.kind==='raise'&&openingMajor(c)&&c.opening.seat===c.seat;
export function interpretSuit(c,bid){
 const {opening,p,own}=c,s=bid[1],level=Number(bid[0]),os=opening?.bid[1];if(!opening||!BIDS.includes(bid))return null;
 if(c.partnerFree&&p?.kind==='strong-open'&&bid==='2D')return a('waiting','Artificial waiting response to strong 2♣.');
 if(c.partnerFree&&p?.kind==='waiting'&&own?.kind==='strong-open')return s==='N'?m('nt-rebid','Balanced strong hand, 22–24 HCP.',{min:22,max:24,ntSystems:true}):m('strong-rebid','Natural strong rebid, forcing for one round.',{force:'round',min:22,lengths:{[s]:5}});
 if(c.partnerFree&&p?.kind==='weak-open'&&bid==='2N')return a('weak-two-ask','Forcing inquiry after a weak two: asks for an outside feature with a maximum.',{target:p.bid[1]});
 if(c.partnerFree&&p?.kind==='weak-two-ask')return m('weak-two-answer',s===p.target?'Minimum weak two.':s==='N'?'Maximum with a strong suit.':'Maximum weak two with an outside ace or king.',{target:p.target,featureSuit:s!==p.target&&s!=='N'?s:undefined});
 if(c.responding&&opening.bid[0]==='1'&&os!=='N'){
  const on=c.unpassed&&c.uncontested;
  if(!c.unpassed&&c.uncontested&&openingMajor(c)&&bid==='2C')return a('drury','Reverse Drury: passed-hand invitation, 11–12 total points and at least three-card major support.',{minTP:11,maxTP:12,fitSuit:os,lengths:{[os]:3}});
  if(on&&bid==='2N'&&openingMajor(c))return a('jacoby','Jacoby 2NT: game-forcing raise with four-card or longer major support.',{force:'game',minTP:13,fitSuit:os,lengths:{[os]:4}});
  if(on&&openingMajor(c)&&s!==os&&s!=='N'&&jump(c.auction,bid)===2)return a('splinter','Double-jump splinter: shortness in this suit and four-card major support; game forcing.',{force:'game',fitSuit:os,shortSuit:s,minTP:13,lengths:{[os]:4}});
  if(s===os){
   if(level>=4)return m('preemptive-raise','High-level raise to play; does not invite further bidding.',{fitSuit:os});
   if(c.uncontested&&minors.includes(os)&&level===2)return m('inverted-minor','Inverted minor raise: forcing, 10+ HCP and at least five-card support; denies a four-card major.',{force:'round',min:10,lengths:{[os]:5},fitSuit:os});
   if(c.uncontested&&minors.includes(os)&&level===3)return m('preemptive-raise','Weak inverted minor raise with five-card or longer support.',{max:7,lengths:{[os]:5},fitSuit:os});
   if(level===2)return m('raise','Simple major raise: 7–10 total points and at least three-card support.',{minTP:7,maxTP:10,lengths:{[os]:3},fitSuit:os});
   if(level===3)return m('limit','Invitational raise: 11–12 total points and four-card support.',{minTP:11,maxTP:12,lengths:{[os]:4},fitSuit:os});
  }
  if(c.uncontested&&s!=='N'&&s!==os&&jump(c.auction,bid)===1){
   if(on&&level===2)return m('soloway','Soloway strong jump shift: 17+ total points, four controls and a strong suit or fit; game forcing.',{minTP:17,force:'game',lengths:{[s]:5}});
   if(!c.unpassed&&bid!=='3C')return m('fit-jump','Passed-hand fit jump: a good five-card suit and support for opener.',{minTP:10,lengths:{[s]:5,[os]:4},fitSuit:os});
   return m('jump-invite','Natural invitational jump shift, with a six-card suit.',{min:9,max:11,lengths:{[s]:6}});
  }
 }
 if(c.partnerFree&&p?.kind==='jacoby'){
  if(level===3&&s!=='N'&&s!==os)return a('jacoby-shortness','Jacoby 2NT continuation: singleton or void in this suit.',{fitSuit:os,shortSuit:s,force:'game'});
  if(level===4&&s!==os&&s!=='N')return m('jacoby-side-suit','Strong five-card side suit after Jacoby 2NT.',{fitSuit:os,lengths:{[s]:5},force:'game'});
  if(bid==='3'+os)return m('jacoby-strong','Extra values, 18+ total points, without shortness to show.',{minTP:18,fitSuit:os,force:'game'});
  if(bid==='3N')return m('jacoby-medium','Intermediate values, 15–17 total points, without shortness.',{minTP:15,maxTP:17,fitSuit:os,force:'game'});
  if(bid==='4'+os)return m('game','Minimum opener; signs off in the agreed major.',{fitSuit:os});
 }
 if(c.partnerFree&&p?.kind==='drury'){
  if(bid==='2D')return a('drury-invite','Full opener, inviting game, with no extra shape.',{fitSuit:os,minTP:13});
  if(bid==='2'+os)return m('drury-minimum','Sub-minimum third- or fourth-seat opener; no game interest.',{fitSuit:os});
  if(bid==='2N'||bid==='3N')return m('drury-shape',bid==='2N'?'5–3–3–2 shape, below 18 total points; one-round force.':'6–3–2–2 shape, below 18 total points; one-round force.',{fitSuit:os,force:'round'});
  if(bid==='3'+os)return m('drury-strong','18+ total points, balanced.',{fitSuit:os,minTP:18,force:'round'});
  if(bid==='4'+os)return m('game','To play in the agreed major.',{fitSuit:os});
  if(s!==os&&s!=='N'){const j=jump(c.auction,bid);return j>=1?a('drury-splinter',j===1?'18+ total points and a singleton.':'18+ total points and a void.',{fitSuit:os,shortSuit:s,minTP:18,force:'game'}):m('drury-side','Four-card side suit, below 18 total points.',{fitSuit:os,lengths:{[s]:4},force:'round'});}
 }
 if(c.partnerFree&&simpleRaise(c)){
  if(bid===(os==='H'?'2S':'2N'))return a('short-game-try','Two-way game try with unspecified shortness.',{fitSuit:os});
  if(bid==='3'+os)return m('strength-game-try','General strength game try: about 17 points, without shortness.',{fitSuit:os});
  if(BIDS.indexOf(bid)<BIDS.indexOf('3'+os)&&s!==os)return m('long-game-try','Long-suit game try: three or more cards with honors in the trial suit.',{trialSuit:bid==='2N'?'S':s,fitSuit:os});
 }
 if(c.partnerFree&&p?.kind==='short-game-try'&&bid===(p.fitSuit==='H'?'2N':'3C'))return a('short-game-ask','Asks where opener’s shortness is.',{fitSuit:p.fitSuit});
 if(c.partnerFree&&p?.kind==='short-game-ask')return a('short-game-answer','Identifies the short suit; a trump rebid covers a suit used by the asking steps.',{fitSuit:p.fitSuit,shortSuit:s===p.fitSuit?undefined:s,force:undefined});
 if(c.partnerFree&&p?.kind==='soloway')return m('soloway-rebid',s===p.bid[1]?'Three-card or longer support for responder’s strong suit.':s===os?'Six-card or longer opening suit.':s==='N'?'No fit, six-card opening suit, or side KQ to show.':'Denies support; shows at least KQ in this side suit.',{force:'game',fitSuit:s===p.bid[1]?s:undefined,lengths:s==='N'?{}:{[s]:s===p.bid[1]?3:s===os?6:3}});
 if(c.partnerFree&&own?.kind==='soloway'&&p?.kind==='soloway-rebid'){
  if(s==='N')return m('soloway-balanced','Balanced jump-shift hand, 18+ HCP.',{force:'game',min:18});
  if(s===os)return m('soloway-fit','Strong suit plus four-card support for opener.',{force:'game',fitSuit:os,lengths:{[os]:4}});
  if(s!==own.bid[1])return a('splinter','Soloway continuation: shortness with four-card support for opener.',{force:'game',fitSuit:os,shortSuit:s,lengths:{[os]:4}});
  return m('soloway-suit','Strong one-suiter; a jump to game shows a minimum with a solid suit.',{force:isGame(bid)?undefined:'game',lengths:{[s]:6}});
 }
 if(c.partnerFree&&p?.kind==='new-minor')return m('new-minor-answer','Answers the forcing inquiry with major support, another major, or a natural rebid.',{lengths:s==='N'?{}:{[s]:c.theirs.some(x=>x.bid[1]===s&&!x.artificial)?3:4}});
 if(c.uncontested&&c.ours.length&&c.theirs.length){
  const shown=new Set(c.auction.map(naturalSuit).filter(Boolean));
  if(c.seat===partner(opening.seat)&&p?.kind==='nt-rebid'&&minors.includes(s)&&!shown.has(s)&&level===2)return a('new-minor','One-way new minor forcing: asks about major support and unbid majors.',{force:'round',min:10});
  if(shown.size===3&&!shown.has(s)&&s!=='N'&&!agreedTrump(c.auction,c.seat)){
   if(opening.bid==='1C'&&c.ours[0]?.bid==='1D'&&p?.bid==='1H'&&bid==='2S')return m('fourth-suit-natural','Natural spades, game forcing.',{force:'game',lengths:{S:4}});
   return a('fourth-suit','Fourth suit forcing to game; asks for more information, not a natural suit.',{force:'game'});
  }
  if(c.seat===opening.seat&&p?.kind==='new-suit'){
   if(s===os&&jump(c.auction,bid)===1)return m('jump-rebid','Opening jump rebid: 17–20 HCP and six or more cards.',{min:17,max:20,lengths:{[s]:6}});
   if(s==='N'&&level<=2)return m('nt-rebid',level===1?'Balanced rebid, 12–14 HCP.':'Balanced jump rebid, 18–19 HCP.',{min:level===1?12:18,max:level===1?14:19});
   if(s!==os&&s!=='N'&&s!==p.bid[1]&&level===2&&suits.indexOf(s)>suits.indexOf(os))return m('reverse','Opener’s reverse: 17+ HCP, longer first suit; forcing one round. Lebensohl applies.',{min:17,force:'round',lengths:{[os]:5,[s]:4}});
  }
  if(c.partnerFree&&p?.kind==='inverted-minor')return s==='N'?m('inverted-nt','Natural notrump continuation with major-suit stoppers.',{min:12,max:bid==='2N'?14:17,fitSuit:os}):s===os?m('inverted-minimum','Minimum hand; returns to the agreed minor.',{fitSuit:os}):m('inverted-stopper','Shows a stopper in the bid suit; the minor remains agreed.',{fitSuit:os,stopperSuit:s,force:'round'});
 }
 return null;
}
export function chooseSuit(hand,c){
 const {opening,p,own}=c,points=hcp(hand),tp=totalPoints(hand),len=shape(hand),os=opening?.bid[1],byLength=['S','H','D','C'].sort((a,b)=>len[b]-len[a]),model=partnerModel(c),fit=agreedTrump(c.auction,c.seat);
 if(!opening){
  if(balanced(hand)&&points>=20&&points<=21)return '2N';
  if(points>=22)return '2C';
  const five=majors.some(s=>len[s]>=5);
  if(balanced(hand)&&points>=15&&points<=17&&!(points===17&&five))return '1N';
  if(points>=12){const major=byLength.find(s=>majors.includes(s)&&len[s]>=5);return '1'+(major||(len.D>len.C||len.D===len.C&&len.D>=4?'D':'C'));}
  const longest=byLength[0],quality=hand.filter(c=>c.suit===longest&&c.rank>=12).length;
  if(points>=6&&points<=10&&len[longest]>=6&&quality>=2)return (len[longest]>=8?4:len[longest]>=7||longest==='C'?3:2)+longest;
  return 'P';
 }
 if(c.partnerFree&&p?.kind==='weak-two-ask'){const feature=suits.find(s=>s!==p.target&&(has(hand,s,14)||has(hand,s,13)));return points>=9&&feature?'3'+feature:'3'+p.target;}
 if(c.partnerFree&&p?.kind==='weak-two-answer')return tp>=16?'4'+p.target:'P';
 if(c.responding&&c.uncontested&&opening.bid[0]==='1'&&os!=='N'){
  if(!c.unpassed&&majors.includes(os)&&len[os]>=3&&tp>=11&&tp<=12)return '2C';
  if(c.unpassed){
   const strong=byLength.find(s=>s!==os&&suits.indexOf(s)>suits.indexOf(os)&&controls(hand)>=4&&tp>=17&&(()=>{const q=suitQuality(hand,s);return q.solid||q.strong&&!suits.some(t=>t!==s&&len[t]>=4)||q.rebiddable&&(points>=18&&['5332','6322'].includes(Object.values(len).sort((a,b)=>b-a).join(''))||len[os]>=4);})());if(strong)return '2'+strong;
   if(majors.includes(os)&&len[os]>=4&&tp>=13){const short=suits.find(s=>s!==os&&len[s]<=1);return short&&tp<=16?(Number(cheapest(c.auction,short)[0])+2)+short:'2N';}
  }
  if(majors.includes(os)&&len[os]>=3){if(tp>=7&&tp<=10)return '2'+os;if(tp>=11&&tp<=12&&len[os]>=4)return '3'+os;}
  if(minors.includes(os)&&!majors.some(s=>len[s]>=4)&&len[os]>=5){if(points>=10)return '2'+os;if(points<=7&&tp>=6)return '3'+os;}
  const invite=byLength.find(s=>s!==os&&suits.indexOf(s)<suits.indexOf(os)&&len[s]>=6&&points>=9&&points<=11);if(invite)return '3'+invite;
 }
 if(!c.partnerFree)return null;
 if(p?.kind==='jacoby'){const short=suits.find(s=>s!==os&&len[s]<=1);if(short)return '3'+short;const side=byLength.find(s=>s!==os&&len[s]>=5&&suitHCPEnough(hand,s));if(side)return '4'+side;return tp>=18?'3'+os:tp>=15?'3N':'4'+os;}
 if(['jacoby-shortness','jacoby-side-suit','jacoby-strong','jacoby-medium'].includes(p?.kind))return tp+(p.minTP||12)>=31?'4N':'4'+p.fitSuit;
 if(p?.kind==='drury'){
  if(points<12)return '2'+os;
  if(tp>=18){const short=suits.find(s=>s!==os&&len[s]<=1);if(short)return (Number(cheapest(c.auction,short)[0])+(len[short]===0?2:1))+short;return '3'+os;}
  const side=byLength.find(s=>s!==os&&len[s]>=4);if(side)return cheapest(c.auction,side);
  return tp>=15?'4'+os:'2D';
 }
 if(p?.kind==='drury-invite')return tp>=12?'4'+p.fitSuit:'2'+p.fitSuit;
 if(p?.kind==='drury-minimum')return 'P';
 if(['drury-shape','drury-side','drury-strong','drury-splinter'].includes(p?.kind))return (tp>=12||p.minTP>=18?'4':'3')+p.fitSuit;
 if(simpleRaise(c)){
  if(tp>=19)return '4'+os;if(tp<16)return 'P';
  if(suits.some(s=>s!==os&&len[s]<=1))return os==='H'?'2S':'2N';
  const trial=suits.find(s=>s!==os&&len[s]>=3&&suitHCPEnough(hand,s)&&BIDS.indexOf(cheapest(c.auction,s))<BIDS.indexOf('3'+os));return trial?cheapest(c.auction,trial):'3'+os;
 }
 if(p?.kind==='short-game-try')return p.fitSuit==='H'?'2N':'3C';
 if(p?.kind==='short-game-ask'){const short=suits.find(s=>s!==p.fitSuit&&len[s]<=1);return short&&c.legal.includes('3'+short)&&BIDS.indexOf('3'+short)<BIDS.indexOf('3'+p.fitSuit)?'3'+short:'3'+p.fitSuit;}
 if(['short-game-answer','long-game-try','strength-game-try'].includes(p?.kind)){const useful=tp>=9||p.trialSuit&&(len[p.trialSuit]<=2||suitHCPEnough(hand,p.trialSuit));return (useful?'4':'3')+p.fitSuit;}
 if(p?.kind==='soloway'){
  if(len[p.bid[1]]>=3)return tp>=18?'4N':cheapest(c.auction,p.bid[1]);
  if(len[os]>=6)return cheapest(c.auction,os);
  const side=suits.find(s=>s!==os&&s!==p.bid[1]&&has(hand,s,13)&&has(hand,s,12));return side?cheapest(c.auction,side):cheapest(c.auction,'N');
 }
 if(own?.kind==='soloway'&&p?.kind==='soloway-rebid'){
  if(len[os]>=4){const short=suits.find(s=>s!==os&&s!==own.bid[1]&&len[s]<=1);return short?cheapest(c.auction,short):cheapest(c.auction,os);}
  if(balanced(hand)&&points>=18)return '3N';
  return suitQuality(hand,own.bid[1]).solid&&tp<=19?gameLevel(own.bid[1])+own.bid[1]:cheapest(c.auction,own.bid[1]);
 }
 if(p?.kind==='inverted-minor')return majors.every(s=>stopper(hand,s))?'2N':'3'+os;
 if(['inverted-nt','inverted-minimum','inverted-stopper'].includes(p?.kind))return tp+model.minTP>=25?majors.every(s=>stopper(hand,s))?'3N':'5'+p.fitSuit:p.bid==='2N'?'P':cheapest(c.auction,p.fitSuit)||'P';
 if(['new-minor','fourth-suit'].includes(p?.kind)){
  const major=c.theirs.map(naturalSuit).find(s=>majors.includes(s)&&len[s]>=3);if(major)return cheapest(c.auction,major);
  const unbid=majors.find(s=>len[s]>=4&&!(model.lengths[s]>=4));if(unbid)return cheapest(c.auction,unbid);
  if(stopper(hand,p.bid[1]))return cheapest(c.auction,'N');return cheapest(c.auction,os);
 }
 if(c.uncontested&&c.seat===partner(opening.seat)&&p?.kind==='nt-rebid'&&own?.kind==='new-suit'&&points>=10&&len[own.bid[1]]>=5){const minor=minors.find(s=>s!==os);if(minor)return '2'+minor;}
 if(c.seat===opening.seat&&p?.kind==='new-suit'&&len[os]>=6&&points>=17&&points<=20)return '3'+os;
 if(c.seat===opening.seat&&p?.kind==='new-suit'&&points>=17){const reverse=suits.find(s=>suits.indexOf(s)>suits.indexOf(os)&&s!==p.bid[1]&&len[s]>=4&&len[os]>=5);if(reverse)return '2'+reverse;}
 if(fit&&p.kind==='splinter')return tp+(p.minTP||model.minTP)>=31?'4N':gameLevel(fit)+fit;
 return null;
}
function suitHCPEnough(hand,s){return hcp(hand.filter(c=>c.suit===s))>=3;}
