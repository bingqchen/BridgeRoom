// Pure tactics inside one hypothetical deal. Cards use suitIndex * 13 + rank - 2.
// Callers supply sampled hands, never the actual concealed table hands.
const suit=c=>Math.floor(c/13),rank=c=>c%13+2,side=s=>s%2;
const inSuit=(hand,s)=>hand.filter(c=>suit(c)===s);
const strength=(c,lead,trump)=>(suit(c)===trump?100:suit(c)===lead?50:0)+rank(c);

function outsideEntry(hands,contract,led,trump){
 const dummy=hands[contract.dummy],declarer=hands[contract.declarer];
 // Remaining dummy trumps can be entries by ruffing or after drawing trumps.
 if(trump<4&&dummy.some(c=>suit(c)===trump))return true;
 for(let s=0;s<4;s++){
  if(s===led)continue;
  const d=inSuit(dummy,s),h=inSuit(declarer,s);
  if(!d.length||!h.length)continue;
  const top=Math.max(...d),low=Math.min(...h);
  if(top<=low)continue; // Declarer cannot lead a lower card to dummy.
  const higher=hands.flatMap((hand,seat)=>side(seat)!==side(contract.declarer)?inSuit(hand,s):[]).filter(c=>c>top).length;
  // Count both established entries and honors that can be promoted while
  // declarer retains a card to lead to dummy. This is deliberately cautious.
  if(higher===0||rank(top)>=11&&higher<Math.min(d.length,h.length))return true;
 }
 return false;
}

export function defensiveTiming(hands,trick,seat,contract,defenseTaken=0,declarerTaken=0){
 if(side(seat)===side(contract.declarer))return null;
 const trump=contract.trump,hand=hands[seat],led=trick.length?suit(trick[0].card):null;
 const follow=led===null?[]:inSuit(hand,led),cards=follow.length?follow:hand;
 const opponents=[contract.declarer,contract.dummy];
 const later=trick.length?Array.from({length:3-trick.length},(_,i)=>(seat+i+1)%4):[0,1,2,3].filter(s=>s!==seat);
 const current=trick.length?trick.reduce((a,b)=>strength(a.card,led,trump)>=strength(b.card,led,trump)?a:b):null;
 const safe=c=>opponents.filter(s=>later.includes(s)).every(s=>{
  const h=inSuit(hands[s],led??suit(c)),legal=h.length?h:hands[s];
  return legal.every(x=>strength(x,led??suit(c),trump)<strength(c,led??suit(c),trump));
 });
 const beats=c=>!current||strength(c,led,trump)>strength(current.card,led,trump);
 if(current&&side(current.seat)===side(seat)&&safe(current.card))return null;
 const winners=cards.filter(c=>beats(c)&&safe(c));
 const needed=8-contract.level;
 if(defenseTaken<needed&&defenseTaken+1>=needed&&winners.length)
  return {card:[...winners].sort((a,b)=>rank(a)-rank(b))[0],priority:60,method:'take-setting-trick',reason:'Take the available setting trick now; there is no reason to hold it up.'};
 if(current&&declarerTaken===contract.level+5&&winners.length)
  return {card:[...winners].sort((a,b)=>rank(a)-rank(b))[0],priority:55,method:'stop-contract',reason:'Win this trick rather than let declarer make the contract by ducking.'};

 const masters=winners.filter(c=>opponents.every(s=>hands[s].every(x=>suit(x)!==suit(c)||x<c)));
 const leftAfter=(s,t)=>inSuit(hands[s],t).length-(later.includes(s)&&inSuit(hands[s],t).length?1:0);
 if(trump<4){
  const urgent=masters.filter(c=>suit(c)!==trump&&opponents.some(s=>hands[s].some(x=>suit(x)===trump)&&leftAfter(s,suit(c))===0));
  if(urgent.length)return {card:urgent.sort((a,b)=>rank(a)-rank(b))[0],priority:50,method:'cash-before-ruff',reason:'Cash this winner while the opponents can still follow; a later round may be ruffed.'};
 }
 if(!current||side(trick[0].seat)!==side(contract.declarer)||!follow.length||led===trump||defenseTaken>=needed||declarerTaken>=contract.level+6)return null;
 const stopper=masters.filter(c=>suit(c)===led).sort((a,b)=>rank(a)-rank(b))[0];
 if(stopper===undefined)return null;
 const d=leftAfter(contract.dummy,led),h=leftAfter(contract.declarer,led);
 if(d<2||h>=d||outsideEntry(hands,contract,led,trump))return null;
 if(h===0)return {card:stopper,priority:45,method:'cut-dummy-entry',reason:'Win now as declarer runs out of this suit, cutting the connection to dummy’s remaining winners.'};
 const low=[...follow].sort((a,b)=>a-b).find(c=>c!==stopper&&(!beats(c)||!safe(c)));
 if(low!==undefined)return {card:low,priority:40,method:'hold-up',reason:'Duck while declarer still has another card in this suit; keep the stopper to cut the connection to dummy later.'};
 return null;
}
