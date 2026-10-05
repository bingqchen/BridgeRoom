import {SUITS,side,partner} from './bridge-cards.js';
import {legalCards,trickWinner} from './play-rules.js';
const suits=SUITS.slice(0,4),descending=h=>[...h].sort((a,b)=>b.rank-a.rank);
const inSuit=(h,s)=>descending(h.filter(c=>c.suit===s));
const value=(c,lead,trump)=>(c.suit===trump?100:c.suit===lead?50:0)+c.rank;
const isDefender=(seat,c)=>side(seat)!==side(c.declarer);
const system='25 Ways defense';

// The just-completed trick is present in both history and trick until collection.
export function publicTricks(view){
 const result=[],seen=new Set();
 for(const t of [...(view.history||[]).map(t=>t.cards),view.trick||[]]){
  const fresh=t.filter(x=>!seen.has(x.card.id));
  for(const x of fresh)seen.add(x.card.id);
  if(fresh.length)result.push(fresh);
 }
 return result;
}
function signalType(trick,seat,contract,s){
 if(!trick.length||!isDefender(seat,contract)||s===contract.suit)return null;
 const lead=trick[0];
 if(s!==lead.card.suit)return 'discard';
 if(lead.seat===partner(seat)&&lead.card.rank>=11&&trickWinner(trick,contract.suit)===partner(seat))return 'attitude';
 if(!isDefender(lead.seat,contract))return 'count';
 return null;
}

// Signal rank is relative to the spots actually held, never a fixed 7-or-higher
// threshold. Ten and honors are reserved for taking or preserving tricks.
export function signalForSuit(hand,trick,seat,contract,s){
 const type=signalType(trick,seat,contract,s),holding=inSuit(hand,s),spots=holding.filter(c=>c.rank<10);
 if(!type||spots.length<2)return null;
 const follows=hand.some(c=>c.suit===trick[0].card.suit);
 if(type==='discard'&&follows)return null;
 let high,reason;
 if(type==='count'){
  const lead=trick[0].card.suit,winner=trick.find(x=>x.seat===trickWinner(trick,contract.suit));
  // Do not replace a possible honor play with a count signal.
  if(holding.some(c=>c.rank>=10&&value(c,lead,contract.suit)>value(winner.card,lead,contract.suit)))return null;
  high=holding.length%2===0;
  reason=high?'High spot starts an even-count signal.':'Low spot starts an odd-count signal.';
 }else{
  const led=trick[0].card.rank;
  const strength=holding.some(c=>c.rank>=13)||holding.some(c=>c.rank===12)&&(type==='discard'||led>=13);
  const ruff=type==='attitude'&&contract.suit!=='N'&&holding.length===2&&hand.some(c=>c.suit===contract.suit);
  high=strength||ruff;
  reason=high?(ruff?'Encourage a continuation with a doubleton and a possible ruff.':'High spot encourages this suit.'):'Low spot discourages this suit.';
 }
 return {card:high?spots[0]:spots.at(-1),type,high,reason};
}

// Each first signal of a type in a suit is one observation. Later echo cards
// are not counted again as independent evidence. Forced plays carry no signal.
export function signalObservations(view){
 const tricks=publicTricks(view),flat=tricks.flat(),seen=new Set(),result=[];let at=0;
 for(const trick of tricks)for(let i=0;i<trick.length;i++,at++){
  const x=trick[i],prefix=trick.slice(0,i),type=signalType(prefix,x.seat,view.contract,x.card.suit);
  if(!type||x.card.rank>=10)continue;
  const key=x.seat+':'+x.card.suit+':'+type;if(seen.has(key))continue;seen.add(key);
  result.push({...x,type,prefix,after:flat.slice(at).filter(p=>p.seat===x.seat).map(p=>p.card)});
 }
 return result;
}
export function signalLogWeight(hands,observations,unknown,contract){
 let penalty=0;
 for(const o of observations){
  if(!unknown.includes(o.seat))continue;
  const atPlay=[...hands[o.seat],...o.after];
  const signal=signalForSuit(atPlay,o.prefix,o.seat,contract,o.card.suit);
  if(signal&&signal.type===o.type&&signal.card.id!==o.card.id)penalty+=.55;
 }
 // Signals may be ambiguous, tactical, falsecarded or played by a human.
 return penalty?-Math.min(3,penalty):0;
}

function lowerEquivalent(hand,card,played){
 const own=new Set(hand.filter(c=>c.suit===card.suit).map(c=>c.rank));
 const gone=new Set(played.filter(c=>c.suit===card.suit).map(c=>c.rank));
 let low=card;
 for(let r=card.rank-1;r>=2;r--){
  if(own.has(r))low=hand.find(c=>c.suit===card.suit&&c.rank===r);
  else if(!gone.has(r))break;
 }
 return low;
}
function discardGuard(hand,card,dummy){
 const h=inSuit(hand,card.suit),top=h[0],d=inSuit(dummy,card.suit);
 // Keep enough length to guard an honor or a spot which stops dummy's length.
 return top.rank>=11&&h.length<=15-top.rank||d.length>=h.length&&d.some(c=>c.rank>top.rank)&&d.some(c=>c.rank<top.rank);
}

// These are preferences, not forced plays. The score search may override them.
export function defensePlan(view){
 const {hand,seat,contract}=view,trick=view.trick||[],history=view.history||[];
 if(!contract||!isDefender(seat,contract))return null;
 const cards=legalCards(hand,trick),preferences=new Map(),dummy=view.knownHands?.[contract.dummy]||view.dummyHand||[];
 const currentIds=new Set(trick.map(x=>x.card.id));
 const played=publicTricks(view).flat().filter(x=>!currentIds.has(x.card.id)).map(x=>x.card),observations=signalObservations(view);
 const prefer=(card,priority,method,reason)=>{if(card&&cards.some(c=>c.id===card.id)&&(!preferences.has(card.id)||preferences.get(card.id).priority<priority))preferences.set(card.id,{priority,method,reason});};
 if(!trick.length)return {system,preferences,observedSignals:observations.length};
 const lead=trick[0],s=lead.card.suit,holding=inSuit(hand,s),win=trick.find(x=>x.seat===trickWinner(trick,contract.suit));
 const beats=c=>value(c,s,contract.suit)>value(win.card,s,contract.suit);
 const low=holding.at(-1),top=holding[0],d=inSuit(dummy,s);
 if(!holding.length){
  for(const c of cards){
   if(c.suit===contract.suit)continue;
   if(!discardGuard(hand,c,dummy)&&c.rank<10)prefer(c,8,'safe-discard','Discard from a suit whose guard does not need this card.');
   const signal=signalForSuit(hand,trick,seat,contract,c.suit);
   const prior=observations.some(o=>o.seat===seat&&o.card.suit===c.suit&&o.type==='discard');
   if(signal?.card.id===c.id&&!prior&&!discardGuard(hand,c,dummy))prefer(c,12,'discard-signal',signal.reason+' Keep guards in the other suits.');
  }
 }else{
  const signal=signalForSuit(hand,trick,seat,contract,s);
  const prior=signal&&observations.some(o=>o.seat===seat&&o.card.suit===s&&o.type===signal.type);
  if(signal&&!prior)prefer(signal.card,20,signal.type+'-signal',signal.reason);
  if(trick.length===1&&lead.card.rank<10){
   prefer(low,10,'second-hand-low','Play low in second seat; preserve an honor to capture an opposing honor.');
   if(lead.seat===contract.dummy&&!d.length&&hand.some(c=>c.suit===s&&c.rank===14)&&s!==contract.suit)
    prefer(low,22,'duck-singleton','Duck the side-suit singleton from dummy rather than expose the ace unnecessarily.');
   const pair=holding.length>=3&&holding[0].rank<=13&&holding[1].rank>=11&&holding[0].rank===holding[1].rank+1;
   if(pair&&lead.seat===contract.declarer&&d.some(c=>c.rank>top.rank)&&d.some(c=>c.rank<holding[1].rank&&c.rank>low.rank))
    prefer(top,30,'split-honors','Split touching honors to stop dummy from winning cheaply with an intermediate card.');
  }
  if(trick.length===2&&lead.seat===partner(seat)&&top&&beats(top)){
   const dummyHonor=d.find(c=>c.rank>=11&&c.rank<top.rank),second=holding[1];
   if(lead.card.rank<10&&dummyHonor&&second?.rank>=9&&second.rank<dummyHonor.rank&&beats(second))
    prefer(lowerEquivalent(hand,second,played),30,'finesse-dummy','Keep the higher honor over dummy; insert the lower useful card, lowest of equals.');
   else if(contract.suit!=='N'&&s!==contract.suit&&lead.card.rank===11&&top.rank===13&&!holding.some(c=>c.rank===12))
    prefer(signal?.card||low,30,'preserve-king','Keep the king over the missing queen when partner leads the jack against trumps.');
   else if(contract.suit!=='N'&&s!==contract.suit&&top.rank===11&&d.some(c=>c.rank===14)&&d.some(c=>c.rank===10))
    prefer(low,30,'guard-dummy-ten','Keep the jack to guard dummy’s ten instead of promoting dummy’s remaining cards.');
   else prefer(lowerEquivalent(hand,top,played),25,'third-hand-high','Play high in third seat to force an opposing honor; use the lowest of equal cards.');
  }
  if(trick.length===3){
   if(win.seat===partner(seat))prefer(signal?.card||low,24,'preserve-partner','Partner has won this trick; preserve your higher cards.');
   else{const winning=holding.filter(beats).at(-1);prefer(winning,25,'cheapest-winner','Win with the smallest card that beats the current winner.');}
  }
  if(contract.suit==='N'&&top?.rank===14&&holding.length>1&&!isDefender(lead.seat,contract)&&d.length>=3&&d.some(c=>c.rank>=11)){
   const defenseTricks=history.filter(t=>isDefender(t.winner,contract)).length;
   if(defenseTricks+1<8-contract.level)prefer(low,18,'hold-up','Consider holding the ace to interrupt access to dummy’s long suit; the simulations compare taking it now.');
  }
 }
 return {system,preferences,observedSignals:observations.length};
}

// Prefer tactics only among statistically close choices. Never reduce the
// sampled chance of defeating the contract, and never override an exact ending.
export function selectDefensiveOption(options,plan,{exact=false}={}){
 const best=options[0];if(!plan||exact)return best;
 const eligible=options.filter(o=>o.expectedScore>=best.expectedScore-6&&o.makeProbability<=best.makeProbability&&o.expectedTricks<=best.expectedTricks+.10);
 return eligible.reduce((a,b)=>(plan.preferences.get(b.card.id)?.priority||0)>(plan.preferences.get(a.card.id)?.priority||0)?b:a,best);
}
