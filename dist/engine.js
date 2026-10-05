import {legalCards,trickWinner,scoreContract} from './play-rules.js';
export {legalCards,trickWinner,scoreContract} from './play-rules.js';
import {analyzePlay,playView} from './card-play.js';
export {analyzePlay,playView} from './card-play.js';
import {SUITS,SYMBOLS,SEATS,BIDS,side,partner,rankName,cardName,bidName,hcp,shape,balanced,sortHand,lastBid,gameLevel,isGame,legalCalls,auctionOver,getContract,vulnerability} from './bridge-cards.js';
export * from './bridge-cards.js';
import {interpret,chooseBid} from './gib-system.js';
export {interpret,chooseBid,totalPoints} from './gib-system.js';
export function createDeal(board=1,rng=Math.random,{southHighestHcp=false}={}){
 const deck=SUITS.slice(0,4).flatMap(suit=>Array.from({length:13},(_,i)=>({suit,rank:i+2,id:suit+(i+2)})));
 for(let i=51;i>0;i--){const j=Math.floor(rng()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
 const hands=Array.from({length:4},(_,s)=>sortHand(deck.filter((_,i)=>i%4===s)));
 if(southHighestHcp){
  const highest=Math.max(...hands.map(hcp));
  if(hcp(hands[2])<highest){const seat=hands.findIndex(hand=>hcp(hand)===highest);[hands[2],hands[seat]]=[hands[seat],hands[2]];}
 }
 return {board,dealer:(board-1)%4,vulnerable:vulnerability(board),hands,originalHands:structuredClone(hands),auction:[],phase:'bidding',turn:(board-1)%4,contract:null,trick:[],history:[],tricks:[0,0],dummyExposed:false,result:null};
}
export function makeCall(state,bid){
 if(state.phase!=='bidding'||!legalCalls(state.auction,state.turn).includes(bid))throw Error('That call is not legal.');
 const meta=interpret(state.auction,state.turn,bid);state.auction.push({seat:state.turn,bid,...meta});state.turn=(state.turn+1)%4;
 if(auctionOver(state.auction)){state.contract=getContract(state.auction);if(!state.contract){state.phase='complete';state.result={score:0,delta:0,tricks:0,passedOut:true};}else{state.phase='play';state.turn=(state.contract.declarer+1)%4;}}
 return state;
}
export function playCard(state,id){
 if(state.phase!=='play'||state.trick.length===4)throw Error('Wait for the next trick.');
 const hand=state.hands[state.turn];const card=legalCards(hand,state.trick).find(c=>c.id===id);if(!card)throw Error('Follow the suit led if you can.');
 hand.splice(hand.findIndex(c=>c.id===id),1);state.trick.push({seat:state.turn,card});state.dummyExposed=true;state.turn=(state.turn+1)%4;
 if(state.trick.length===4){const winner=trickWinner(state.trick,state.contract.suit);state.tricks[side(winner)]++;state.history.push({cards:structuredClone(state.trick),winner});state.turn=winner;}
 return state;
}
export function collectTrick(state){
 if(state.trick.length!==4)throw Error('The trick is not complete.');state.trick=[];
 if(state.history.length===13){state.phase='complete';const tricks=state.tricks[side(state.contract.declarer)];const result=scoreContract(state.contract,tricks,state.vulnerable[side(state.contract.declarer)]);state.result={...result,tricks,nsScore:side(state.contract.declarer)===0?result.score:-result.score};}return state;
}
export function botBid(state,seat=state.turn){const choice=chooseBid(state.hands[seat],state.auction,seat,{vulnerable:state.vulnerable[side(seat)]});return {...choice,...interpret(state.auction,seat,choice.bid)};}
export const chooseCard=view=>analyzePlay(view).card;
export const botAnalysis=state=>analyzePlay(playView(state));
export const botCard=state=>botAnalysis(state).card;
