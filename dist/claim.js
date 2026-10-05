import {SUITS,side} from './bridge-cards.js';
import {scoreContract} from './play-rules.js';

const deck=SUITS.slice(0,4).flatMap(suit=>Array.from({length:13},(_,i)=>({suit,rank:i+2,id:suit+(i+2)})));
const encode=c=>SUITS.indexOf(c.suit)*13+c.rank-2;
const suit=c=>Math.floor(c/13);
const strength=(c,lead,trump)=>(suit(c)===trump?100:suit(c)===lead?50:0)+c%13;
const winner=(trick,trump)=>trick.reduce((a,b)=>strength(a.card,suit(trick[0].card),trump)>=strength(b.card,suit(trick[0].card),trump)?a:b).seat;

export function claimAvailable(state){
 return state.phase==='play'&&state.dummyExposed&&side(state.contract?.declarer)===0&&side(state.turn)===0&&state.trick.length<4;
}

// A two-defender information set: exact remaining capacities plus a per-suit
// ownership mask. No actual East/West hand, auction guess or sample is read.
function claimPosition(state){
 const seen=new Set(),played=[0,0,0,0],allowed=[3,3,3,3];
 function add(c){
  const code=encode(c);
  if(!Number.isInteger(code)||code<0||code>=52||c.id!==deck[code].id||seen.has(code))throw Error('Invalid card history.');
  seen.add(code);return code;
 }
 for(const trick of [...state.history.map(t=>t.cards),state.trick]){
  if(!trick.length)continue;
  for(const x of trick){add(x.card);played[x.seat]++;
   if(side(x.seat)===1&&x.card.suit!==trick[0].card.suit)allowed[SUITS.indexOf(trick[0].card.suit)]&=~(x.seat===1?1:2);
  }
 }
 const hands=[state.hands[0].map(add).sort((a,b)=>a-b),state.hands[2].map(add).sort((a,b)=>a-b)];
 if(hands[0].length!==13-played[0]||hands[1].length!==13-played[2])throw Error('Incomplete card history.');
 const pool=deck.map(encode).filter(c=>!seen.has(c)),caps=[13-played[1],13-played[3]];
 const position={hands,pool,caps,allowed,turn:state.turn,trick:state.trick.map(x=>({seat:x.seat,card:encode(x.card)}))};
 if(!feasible(position))throw Error('No consistent East/West distribution.');
 return position;
}
function feasible({pool,caps,allowed}){
 if(caps[0]<0||caps[1]<0||caps[0]+caps[1]!==pool.length)return false;
 let east=0,west=0;
 for(const c of pool){const mask=allowed[suit(c)];if(!mask)return false;if(mask===1)east++;if(mask===2)west++;}
 return east<=caps[0]&&west<=caps[1];
}

function next(position,c){
 const p={...position,turn:(position.turn+1)%4,trick:[...position.trick,{seat:position.turn,card:c}]};
 if(side(position.turn)===0){p.hands=position.hands.map((h,i)=>i===position.turn/2?h.filter(x=>x!==c):h);}
 else{
  const index=position.turn===1?0:1,bit=1<<index;
  p.pool=position.pool.filter(x=>x!==c);p.caps=[...position.caps];p.caps[index]--;
  if(position.trick.length&&suit(c)!==suit(position.trick[0].card)){
   p.allowed=[...position.allowed];p.allowed[suit(position.trick[0].card)]&=~bit;
  }
 }
 return p;
}
function legalMoves(p){
 if(side(p.turn)===0){const h=p.hands[p.turn/2];if(!p.trick.length)return h;const follow=h.filter(c=>suit(c)===suit(p.trick[0].card));return follow.length?follow:h;}
 const bit=p.turn===1?1:2;
 // Off-suit plays are legal only if a complete compatible deal exists in
 // which this defender has no cards of the suit led. This also updates what
 // declarer will know after observing the discard or ruff.
 return p.pool.filter(c=>(p.allowed[suit(c)]&bit)&&feasible(next(p,c)));
}
function key(p){return [p.hands[0].join(','),p.hands[1].join(','),p.pool.join(','),p.caps.join(','),p.allowed.join(','),p.turn,p.trick.map(x=>x.seat+':'+x.card).join(',')].join('|');}

function distinctMoves(p){
 const moves=legalMoves(p),chosen=new Set(moves);
 const outside=[...p.hands.flat(),...p.pool,...p.trick.map(x=>x.card)].filter(c=>!chosen.has(c));
 // Adjacent ranks owned by the same information set are interchangeable if
 // no other live card separates them. Keep one representative of each run.
 return moves.filter(c=>!moves.some(higher=>suit(higher)===suit(c)&&higher>c&&!outside.some(x=>suit(x)===suit(c)&&x>c&&x<higher)));
}
function canCashFromLead(p,trump){
 if(p.trick.length||side(p.turn)!==0)return false;
 const h=p.hands[p.turn/2],other=p.hands[1-p.turn/2];
 // A simple sufficient certificate avoids a large search for a solid hand:
 // leader can cash every card without an overtake or a possible ruff.
 if(trump<4&&!h.every(c=>suit(c)===trump)&&(p.pool.some(c=>suit(c)===trump)||other.some(c=>suit(c)===trump)))return false;
 return h.every(c=>![...p.pool,...other].some(x=>suit(x)===suit(c)&&x>c));
}

export function verifyClaim(state,{nodeLimit=100000,timeLimitMs=750}={}){
 if(!claimAvailable(state))return {accepted:false,status:'unavailable',reason:'Claim on your turn when North/South declares and dummy is exposed.'};
 const remaining=13-state.history.length;
 let initial;try{initial=claimPosition(state);}catch{return {accepted:false,status:'invalid',reason:'The remaining cards could not be verified.'};}
 const trump=SUITS.indexOf(state.contract.suit),memo=new Map(),deadline=performance.now()+timeLimitMs;
 let nodes=0;
 const exhausted=Symbol('claim search limit');
 function prove(p){
  if(++nodes>nodeLimit||(nodes%256===0&&performance.now()>deadline))throw exhausted;
  if(p.trick.length===4){const won=winner(p.trick,trump);if(side(won)===1)return false;return prove({...p,trick:[],turn:won});}
  if(!p.pool.length&&!p.hands[0].length&&!p.hands[1].length)return true;
  if(canCashFromLead(p,trump))return true;
  const id=key(p);if(memo.has(id))return memo.get(id);
  const ours=side(p.turn)===0;
  const moves=distinctMoves(p).sort((a,b)=>{
   // Try winning cards first; challenge a claim with the strongest defense.
   const lead=p.trick.length?suit(p.trick[0].card):trump;
   return strength(b,lead,trump)-strength(a,lead,trump);
  });
  if(!moves.length)throw Error('Inconsistent claim position.');
  for(const c of moves){
   const success=prove(next(p,c));
   // One declarer strategy must survive every legal defense. Declarer may
   // adapt only after seeing the card actually played, never its hidden owner.
   if(success===ours){memo.set(id,ours);return ours;}
  }
  memo.set(id,!ours);return !ours;
 }
 try{
  const accepted=prove(initial);
  return {accepted,status:accepted?'proven':'unsafe',remaining,nodes,reason:accepted?`All ${remaining} remaining tricks are guaranteed.`:'East/West can prevent the claim in at least one possible distribution. Play on.'};
 }catch(error){
  if(error!==exhausted)throw error;
  return {accepted:false,status:'unverified',remaining,nodes,reason:'The check could not prove every remaining trick within its search limit. Play on and try again later.'};
 }
}

export function claimRemaining(state,options){
 const check=verifyClaim(state,options);
 if(!check.accepted){const error=new Error(check.reason);error.claimStatus=check.status;throw error;}
 const remaining=check.remaining;
 state.claim={side:0,tricks:remaining,fromTrick:state.history.length+1,partialTrick:structuredClone(state.trick)};
 state.tricks[0]+=remaining;
 const tricks=state.tricks[0],result=scoreContract(state.contract,tricks,state.vulnerable[0]);
 state.result={...result,tricks,nsScore:result.score,claimed:remaining};
 // Retain the unplayed cards and actual trick history for review and undo.
 state.phase='complete';
 return state;
}
