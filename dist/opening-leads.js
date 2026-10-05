import {SUITS,side,partner} from './bridge-cards.js';
const suits=SUITS.slice(0,4);
const sorted=cards=>[...cards].sort((a,b)=>b.rank-a.rank);

// Partnership choice where the guide offers alternatives: fourth-best from
// four or more spots; middle from three spots. This is opening-lead logic only.
export function leadFromHolding(holding,trump='N'){
 const cards=sorted(holding);if(!cards.length)return null;
 const [a,b,c]=cards,isTrump=a.suit===trump;
 const riskyAce=cards.length>1&&trump!=='N'&&!isTrump&&a.rank===14&&b.rank!==13;
 const pick=(card,method,reason,extra={})=>({card,method,reason,...(riskyAce?{riskyAce:true}:{}),...extra});
 if(cards.length===1)return pick(a,'singleton','Only card in the suit.');
 if(c&&a.rank>=11&&a.rank===b.rank+1&&b.rank===c.rank+1)return pick(a,'sequence','Highest card of a touching honor run.',{sequence:true});
 if(a.rank===14&&b.rank===13&&cards.length>2)return pick(trump==='N'?b:a,'ace-king',trump==='N'?'King from ace-king in notrump.':'Ace from ace-king against trumps.',{sequence:true});
 if(a.rank>=11&&a.rank<=13&&a.rank===b.rank+1)return pick(a,'partial-sequence','Lead the upper touching honor.',{sequence:true});
 if(cards.length===2)return pick(a,'doubleton','Higher card of a doubleton.');
 if(trump!=='N'&&!isTrump&&a.rank===14)return pick(a,'unsupported-ace','An unsupported side-suit ace: avoid unless no sounder lead exists.',{riskyAce:true});
 if(isTrump)return pick(cards.at(-1),'low-trump','Small trump to reduce ruffing opportunities.');
 if(cards.length>=4)return pick(cards[3],'fourth-best','Fourth card down in this suit.',{fourthBest:true});
 if(a.rank<11)return pick(b,'mud','Middle card from three small cards.');
 return pick(c,'low-from-honor','Small card from a three-card honor holding.');
}

export function isOpeningLead(view){
 return !!view.contract&&!view.history?.length&&!view.trick?.length&&view.hand.length===13&&view.seat===(view.contract.declarer+1)%4;
}

// Auction meanings show real holdings even when the denomination is artificial.
// Conversely, a waiting bid, cue-bid or shortness bid does not promise that suit.
export function shownSuits(call){
 const result=new Set(Object.entries(call.lengths||{}).filter(([s,n])=>suits.includes(s)&&n>=3).map(([s])=>s));
 if(suits.includes(call.naturalSuit))result.add(call.naturalSuit);
 if(suits.includes(call.trialSuit))result.add(call.trialSuit);
 const named=call.bid?.[1];
 const forcedOrControl=['waiting','stayman','fourth-suit','strong-open','transfer-accept','control-bid','weak-two-answer'].includes(call.kind)||call.kind==='stayman-answer'&&named==='D';
 if(!call.artificial&&suits.includes(named)&&!call.shortSuit&&!forcedOrControl)result.add(named);
 if(call.shortSuit)result.delete(call.shortSuit);
 return result;
}

export function openingLeadPlan(view){
 if(!isOpeningLead(view))return null;
 const {hand,contract,seat}=view,trump=contract.suit,auction=view.auction||[];
 const groups=Object.fromEntries(suits.map(s=>[s,sorted(hand.filter(c=>c.suit===s))]));
 const enemy=new Set(),supported=new Set(),takeout=new Set();
 for(let i=0;i<auction.length;i++){
  const call=auction[i],shown=shownSuits(call);
  if(side(call.seat)!==side(seat))for(const s of shown)enemy.add(s);
  if(call.seat===partner(seat)){
   for(const s of shown)supported.add(s);
   if(call.kind==='takeout'){
    const bidByOpponents=new Set(auction.slice(0,i).filter(c=>side(c.seat)!==side(seat)).flatMap(c=>[...shownSuits(c)]));
    for(const s of suits)if(!bidByOpponents.has(s))takeout.add(s);
   }
  }
 }
 // Treat a takeout double as support for unbid suits, not as one named suit.
 for(const s of takeout)if(!enemy.has(s))supported.add(s);
 const hasTrumps=groups[trump]?.length>0;
 const entry=s=>hand.some(c=>c.suit!==s&&c.rank===14)||suits.some(t=>t!==s&&groups[t].some(c=>c.rank===13)&&groups[t].some(c=>c.rank===12));
 const dummyShort=auction.some(c=>c.seat===contract.dummy&&c.shortSuit&&c.shortSuit!==trump);
 const options=suits.filter(s=>groups[s].length).map(s=>{
  const lead=leadFromHolding(groups[s],trump),isTrump=s===trump;
  const fragileTrump=isTrump&&groups[s].some(c=>[11,12,13].includes(c.rank))&&!lead.sequence&&!groups[s].some(c=>c.rank===14);
  const partnerSuit=supported.has(s),unbid=!enemy.has(s);
  return {...lead,length:groups[s].length,partnerSuit,unbid,isTrump,fragileTrump,priority:0,suitReason:''};
 });
 if(trump==='N'){
  const partnerOptions=options.filter(o=>o.partnerSuit);
  const pool=options.filter(o=>o.unbid),available=pool.length?pool:options;
  const longest=Math.max(...available.map(o=>o.length));
  for(const o of options){
   if(partnerOptions.length){
    o.priority=o.partnerSuit||o.sequence&&o.length>=5&&o.unbid?3:0;
    o.suitReason=o.partnerSuit?'Partner has shown this suit.':'A long honor run offers an independent source of tricks.';
   }else{
    o.priority=available.includes(o)&&(o.length===longest||o.sequence&&o.length>=4)?2:0;
    o.suitReason=o.length===longest?'Develop a longest available suit.':'Develop a long suit with touching honors.';
   }
  }
 }else{
  for(const o of options){
   if(o.partnerSuit&&!o.isTrump){o.priority=3;o.suitReason='Attack a suit supported by partner.';}
   else if(o.sequence&&!o.isTrump){o.priority=3;o.suitReason='Establish side-suit tricks behind touching honors.';}
   else if(o.length===1&&!o.isTrump&&hasTrumps&&entry(o.card.suit)){o.priority=o.unbid?3:2;o.suitReason='A singleton, trumps and a quick entry offer a ruffing chance.';}
   else if(o.isTrump&&dummyShort&&!o.fragileTrump){o.priority=3;o.suitReason='Dummy advertised shortness; remove ruffing power.';}
   else{o.priority=(o.unbid&&!o.riskyAce&&!o.isTrump||o.isTrump&&!o.fragileTrump)?1:0;o.suitReason=o.isTrump?'A trump is the passive alternative.':'No more attractive attacking lead is available.';}
   if(o.riskyAce&&!o.partnerSuit)o.priority=-1;
  }
 }
 const priority=Math.max(...options.map(o=>o.priority));
 const candidates=options.filter(o=>o.priority===priority);
 return {candidates,options,system:'BridgePlaybook opening leads'};
}

// Conditional arithmetic only: the observed spot could also be a short-suit
// lead, so callers must not treat this as proof of a fourth-best agreement.
export function ruleOfEleven(lead,knownCards=[]){
 const outside=11-lead.rank;
 const known=knownCards.filter(c=>c.suit===lead.suit&&c.rank>lead.rank).length;
 if(outside<0||known>outside)return null;
 return {outsideLeader:outside,unseenHigher:outside-known};
}

// A soft inference from a public lead, never from the actual concealed hand.
// Human leads may depart from the agreement, so inconsistent worlds survive.
export function openingLeadLogWeight(first,leaderHolding,trump){
 const holding=leaderHolding.filter(c=>c.suit===first.card.suit),lead=leadFromHolding(holding,trump);
 if(!lead)return 0;
 return lead.card.rank===first.card.rank?0:-2;
}
