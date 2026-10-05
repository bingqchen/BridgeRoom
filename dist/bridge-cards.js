// Pure bridge rules. Bots receive only their own hand, the auction and exposed cards.
export const SUITS=['C','D','H','S','N'];
export const SYMBOLS={C:'♣',D:'♦',H:'♥',S:'♠',N:'NT'};
export const SEATS=['North','East','South','West'];
export const BIDS=Array.from({length:35},(_,i)=>`${Math.floor(i/5)+1}${SUITS[i%5]}`);
export const side=s=>s%2;
export const partner=s=>(s+2)%4;
export const rankName=r=>({14:'A',13:'K',12:'Q',11:'J'}[r]||String(r));
export const cardName=c=>`${rankName(c.rank)}${SYMBOLS[c.suit]}`;
export const bidName=b=>b==='P'?'Pass':b==='X'?'Double':b==='XX'?'Redouble':b?.[0]+SYMBOLS[b?.[1]];
export const hcp=hand=>hand.reduce((v,c)=>v+Math.max(0,c.rank-10),0);
export const shape=hand=>Object.fromEntries(SUITS.slice(0,4).map(s=>[s,hand.filter(c=>c.suit===s).length]));
export const balanced=hand=>{const n=Object.values(shape(hand)).sort((a,b)=>b-a).join('');return ['4333','4432','5332'].includes(n);};
export const sortHand=hand=>[...hand].sort((a,b)=>SUITS.indexOf(b.suit)-SUITS.indexOf(a.suit)||b.rank-a.rank);
export const lastBid=auction=>[...auction].reverse().find(c=>BIDS.includes(c.bid));
export const gameLevel=s=>s==='N'?3:['S','H'].includes(s)?4:5;
export const isGame=bid=>BIDS.includes(bid)&&Number(bid[0])>=gameLevel(bid[1]);
export function legalCalls(auction,seat){
 const last=lastBid(auction);const out=['P',...BIDS.filter(b=>!last||BIDS.indexOf(b)>BIDS.indexOf(last.bid))];
 const action=[...auction].reverse().find(c=>c.bid!=='P');
 if(last&&action&&side(last.seat)!==side(seat)&&BIDS.includes(action.bid))out.push('X');
 if(last&&action?.bid==='X'&&side(last.seat)===side(seat))out.push('XX');
 return out;
}
export function auctionOver(auction){return auction.length>=4&&auction.slice(-3).every(c=>c.bid==='P')&&(!!lastBid(auction)||auction.length===4);}
export function getContract(auction){const c=lastBid(auction);if(!c)return null;const declarer=auction.find(x=>side(x.seat)===side(c.seat)&&BIDS.includes(x.bid)&&x.bid[1]===c.bid[1]).seat;const after=auction.slice(auction.indexOf(c)+1);return {level:Number(c.bid[0]),suit:c.bid[1],declarer,dummy:partner(declarer),doubled:after.some(x=>x.bid==='XX')?4:after.some(x=>x.bid==='X')?2:1};}
export function vulnerability(board){const cycle=[0,1,2,3,1,2,3,0,2,3,0,1,3,0,1,2];const v=cycle[(board-1)%16];return [v===1||v===3,v===2||v===3];}
