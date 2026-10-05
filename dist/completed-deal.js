import {SEATS,SYMBOLS,hcp,rankName} from './bridge-cards.js';
const suitName={C:'clubs',D:'diamonds',H:'hearts',S:'spades'};
const cardMarkup=c=>`<span class="review-card ${['H','D'].includes(c.suit)?'red':''}" role="img" aria-label="${rankName(c.rank)} of ${suitName[c.suit]}"><b>${rankName(c.rank)}</b><span aria-hidden="true">${SYMBOLS[c.suit]}</span></span>`;

// Only completed boards reveal the original deal, including after a claim.
export function completedDealMarkup(state,suitOrder){
 if(state.phase!=='complete')return '';
 return `<div class="completed-deal-heading">All four original hands</div><div class="revealed-hands">${[0,3,1,2].map(seat=>{
  const hand=state.originalHands[seat];
  const role=state.contract?.declarer===seat?'Declarer':state.contract?.dummy===seat?'Dummy':seat===2?'You':seat===0?'Partner':'';
  const cardsIn=suit=>hand.filter(c=>c.suit===suit).sort((a,b)=>b.rank-a.rank);
  const cards=seat===0||seat===2?`<div class="revealed-fan">${suitOrder.flatMap(cardsIn).map(cardMarkup).join('')}</div>`:suitOrder.map(suit=>{
   const cards=cardsIn(suit),red=['H','D'].includes(suit)?'red':'';
   return `<div class="revealed-suit ${red}"><span class="revealed-suit-label" aria-hidden="true">${SYMBOLS[suit]}</span><div class="revealed-cards">${cards.length?cards.map(cardMarkup).join(''):`<span class="revealed-void" aria-label="No ${suitName[suit]}">—</span>`}</div></div>`;
  }).join('');
  return `<section class="revealed-hand revealed-${SEATS[seat].toLowerCase()}" aria-label="${SEATS[seat]} original hand"><div class="revealed-hand-heading"><strong>${SEATS[seat]}${role?' · '+role:''}</strong><span>${hcp(hand)} HCP</span></div>${cards}</section>`;
 }).join('')}</div>`;
}
