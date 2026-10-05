import {SUITS,BIDS,side,partner,hcp,shape,lastBid,legalCalls} from './bridge-cards.js';
export const suits=['C','D','H','S'],majors=['H','S'],minors=['C','D'];
export const meaning=(kind,reason,extra={})=>({kind,reason,...extra});
export const artificial=(kind,reason,extra={})=>meaning(kind,reason,{artificial:true,force:'round',...extra});
export const totalPoints=hand=>hcp(hand)+Object.entries(shape(hand)).reduce((sum,[s,n])=>sum+(n<3?3-n-(hand.some(c=>c.suit===s&&c.rank>=11)?1:0):0),0);
export const controls=hand=>hand.reduce((n,c)=>n+(c.rank===14?2:c.rank===13?1:0),0);
export const has=(hand,suit,rank)=>hand.some(c=>c.suit===suit&&c.rank===rank);
export const suitHCP=(hand,s)=>hcp(hand.filter(c=>c.suit===s));
export const stopper=(hand,s)=>has(hand,s,14)||suitHCP(hand,s)+hand.filter(c=>c.suit===s).length>=5;
export const cheapest=(auction,suit)=>BIDS.find(b=>b[1]===suit&&(!lastBid(auction)||BIDS.indexOf(b)>BIDS.indexOf(lastBid(auction).bid)));
export const jump=(auction,bid)=>BIDS.includes(bid)?Number(bid[0])-Number(cheapest(auction,bid[1])?.[0]||8):0;
export const naturalSuit=c=>c?.naturalSuit||(c&&!c.artificial&&BIDS.includes(c.bid)&&c.bid[1]!=='N'?c.bid[1]:null);
export function context(auction,seat){
 const opening=auction.find(c=>BIDS.includes(c.bid)),ours=auction.filter(c=>c.seat===seat&&(c.bid!=='P'||c.kind==='dopi')),theirs=auction.filter(c=>c.seat===partner(seat)&&(c.bid!=='P'||c.kind==='dopi')),p=theirs.at(-1),own=ours.at(-1);
 const enemy=auction.filter(c=>side(c.seat)!==side(seat)&&c.bid!=='P');
 return {auction,seat,opening,ours,theirs,p,own,enemy,last:lastBid(auction),lastAction:auction.findLast(c=>c.bid!=='P'),legal:legalCalls(auction,seat),unpassed:!auction.some(c=>c.seat===seat&&c.bid==='P'),uncontested:!enemy.length,partnerFresh:!!p&&(!own||auction.indexOf(p)>auction.indexOf(own)),partnerFree:!!p&&(!own||auction.indexOf(p)>auction.indexOf(own))&&!auction.slice(auction.indexOf(p)+1).some(c=>side(c.seat)!==side(seat)&&c.bid!=='P'),responding:opening?.seat===partner(seat)&&!ours.length};
}
export function partnerModel(ctx){const model={min:0,max:0,minTP:0,lengths:{C:0,D:0,H:0,S:0}};for(const c of ctx.theirs){model.min=Math.max(model.min,c.min||0);model.max=Math.max(model.max,c.max||c.min||0);model.minTP=Math.max(model.minTP,c.minTP||c.min||0);for(const [s,n] of Object.entries(c.lengths||{}))model.lengths[s]=Math.max(model.lengths[s],n);}return model;}
export function agreedTrump(auction,seat){
 const calls=auction.filter(c=>side(c.seat)===side(seat));
 const explicit=calls.findLast(c=>c.fitSuit);if(explicit)return explicit.fitSuit;
 for(const c of [...calls].reverse()){const s=naturalSuit(c);if(s&&calls.some(d=>d.seat!==c.seat&&naturalSuit(d)===s))return s;}
 return null;
}
export const lastNaturalSuit=(auction,seat)=>auction.findLast(c=>side(c.seat)===side(seat)&&naturalSuit(c))?.bid[1];
export const suitQuality=(hand,s)=>{const cards=hand.filter(c=>c.suit===s),n=cards.length,honors=cards.filter(c=>c.rank>=10).length,akq=[14,13,12].every(r=>has(hand,s,r));return {rebiddable:n>=6||n===5&&(honors>=3||has(hand,s,14)||has(hand,s,13)),strong:n>=6&&(honors>=4||akq),solid:n>=6&&akq&&(n>=7||has(hand,s,10)||has(hand,s,11))};};
