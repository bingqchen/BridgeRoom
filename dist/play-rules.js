export function legalCards(hand,trick){if(!trick.length)return hand;const follow=hand.filter(c=>c.suit===trick[0].card.suit);return follow.length?follow:hand;}
export function trickWinner(trick,trump){const lead=trick[0].card.suit;const strength=c=>(c.suit===trump?100:c.suit===lead?50:0)+c.rank;return trick.reduce((best,x)=>strength(x.card)>strength(best.card)?x:best).seat;}
export function scoreContract(c,tricks,vulnerable){
 const delta=tricks-(c.level+6),mult=c.doubled||1;let score;
 if(delta<0){const down=-delta;if(mult===1)score=-down*(vulnerable?100:50);else{const penalty=vulnerable?200+(down-1)*300:down===1?100:down===2?300:500+(down-3)*300;score=-penalty*(mult===4?2:1);}}
 else{const unit=['C','D'].includes(c.suit)?20:30;const contractPoints=(c.level*unit+(c.suit==='N'?10:0))*mult;const bonus=contractPoints>=100?(vulnerable?500:300):50;const over=mult===1?delta*unit:delta*(vulnerable?200:100)*(mult===4?2:1);const slam=c.level===6?(vulnerable?750:500):c.level===7?(vulnerable?1500:1000):0;score=contractPoints+bonus+over+slam+(mult===2?50:mult===4?100:0);}
 return {score,delta};
}
