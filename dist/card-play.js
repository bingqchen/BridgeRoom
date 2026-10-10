import {SUITS,side,partner,hcp,shape,balanced} from './bridge-cards.js';
import {totalPoints} from './bidding-context.js';
import {legalCards,scoreContract} from './play-rules.js';
import {openingLeadPlan,openingLeadLogWeight,ruleOfEleven} from './opening-leads.js';
import {defensePlan,selectDefensiveOption,signalObservations,signalLogWeight} from './defense.js';
import {defensiveTiming} from './defense-timing.js';

const deck=SUITS.slice(0,4).flatMap(suit=>Array.from({length:13},(_,i)=>({suit,rank:i+2,id:suit+(i+2)})));
const encode=c=>SUITS.indexOf(c.suit)*13+c.rank-2;
const suit=c=>Math.floor(c/13),rank=c=>c%13+2;
const points=c=>Math.max(0,rank(c)-10);
const random=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
function shuffle(a,rng){for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function seedFor(view){
 // Only observable information enters the seed: undo/replay gives the same advice.
 let seed=2166136261;
 const text=JSON.stringify([view.seat,view.hand.map(c=>c.id).sort(),view.knownHands,view.trick,view.history,view.auction,view.contract]);
 for(let i=0;i<text.length;i++)seed=Math.imul(seed^text.charCodeAt(i),16777619);
 return seed>>>0;
}

export function playView(state){
 const seat=state.turn,knownHands={[seat]:state.hands[seat]};
 if(state.dummyExposed){
  knownHands[state.contract.dummy]=state.hands[state.contract.dummy];
  // Declarer chooses dummy's cards with knowledge of their own hand.
  if(seat===state.contract.dummy)knownHands[state.contract.declarer]=state.hands[state.contract.declarer];
 }
 return {seat,hand:state.hands[seat],knownHands,trick:state.trick,history:state.history,
  auction:state.auction,contract:state.contract,vulnerable:state.vulnerable[side(state.contract.declarer)]};
}

function knowledge(view){
 const known={...view.knownHands,[view.seat]:view.hand};
 if(!view.knownHands&&view.dummyHand?.length&&view.contract.dummy!==view.seat)known[view.contract.dummy]=view.dummyHand;
 const played=Array.from({length:4},()=>[]),voids=Array.from({length:4},()=>new Set()),seen=new Set();
 for(const trick of [...view.history.map(t=>t.cards),view.trick]){
  for(const x of trick){if(!seen.has(x.card.id)){played[x.seat].push(x.card);seen.add(x.card.id);}
   if(x.card.suit!==trick[0].card.suit)voids[x.seat].add(trick[0].card.suit);
  }
 }
 for(const hand of Object.values(known))for(const c of hand)seen.add(c.id);
 const unknown=[0,1,2,3].filter(s=>!known[s]);
 const counts=[0,1,2,3].map(s=>13-played[s].length);
 const unseen=deck.filter(c=>!seen.has(c.id));
 if(Object.entries(known).some(([s,h])=>h.length!==counts[s])||unseen.length!==unknown.reduce((n,s)=>n+counts[s],0))throw Error('Incomplete public card history.');
 return {known,played,voids,unknown,counts,unseen};
}

// Count feasible suit allocations. Multinomial weights make the prior uniform
// over card assignments with the observed voids and exact remaining hand sizes.
function allocationSampler(k){
 const {unknown,counts,voids,unseen}=k,groups=SUITS.slice(0,4).map(s=>unseen.filter(c=>c.suit===s)),memo=new Map();
 const factorial=Array.from({length:14},(_,n)=>{let f=1;for(let i=2;i<=n;i++)f*=i;return f;});
 function options(si,caps){
  if(si===4)return {total:caps.every(n=>n===0)?1:0,choices:[]};
  const key=si+':'+caps.join(',');if(memo.has(key))return memo.get(key);
  const choices=[],n=groups[si].length;
  function distribute(i,left,allocation){
   if(i===unknown.length){
    if(left)return;
    const next=caps.map((c,j)=>c-allocation[j]),tail=options(si+1,next).total;
    const ways=factorial[n]/allocation.reduce((f,c)=>f*factorial[c],1);
    if(tail)choices.push({allocation:[...allocation],next,weight:ways*tail});return;
   }
   const max=voids[unknown[i]].has(SUITS[si])?0:Math.min(caps[i],left);
   for(let take=0;take<=max;take++)distribute(i+1,left-take,[...allocation,take]);
  }
  distribute(0,n,[]);const result={choices,total:choices.reduce((n,x)=>n+x.weight,0)};memo.set(key,result);return result;
 }
 const initial=unknown.map(s=>counts[s]);
 const constrained=unknown.some(s=>voids[s].size);
 if(constrained&&!options(0,initial).total)throw Error('Card history has no consistent hidden deal.');
 return rng=>{
  const hands=[0,1,2,3].map(s=>k.known[s]?[...k.known[s]]:[]);
  if(!constrained){const cards=shuffle([...unseen],rng);let at=0;for(const seat of unknown){hands[seat]=cards.slice(at,at+counts[seat]);at+=counts[seat];}return hands;}
  let caps=initial;
  for(let si=0;si<4;si++){
   const entry=options(si,caps);let dart=rng()*entry.total,choice=entry.choices.at(-1);
   for(const x of entry.choices){dart-=x.weight;if(dart<0){choice=x;break;}}
   const cards=shuffle([...groups[si]],rng);let at=0;
   unknown.forEach((seat,j)=>{hands[seat].push(...cards.slice(at,at+choice.allocation[j]));at+=choice.allocation[j];});caps=choice.next;
  }
  return hands;
 };
}

function auctionModels(auction){
 const models=Array.from({length:4},()=>({min:0,max:40,minTP:0,lengths:{},balanced:false}));
 for(const c of auction){const m=models[c.seat];
  if(Number.isFinite(c.min))m.min=Math.max(m.min,c.min);
  if(Number.isFinite(c.max))m.max=c.max;
  if(Number.isFinite(c.minTP))m.minTP=Math.max(m.minTP,c.minTP);
  for(const [s,n] of Object.entries(c.lengths||{}))m.lengths[s]=Math.max(m.lengths[s]||0,n);
  if(c.kind==='nt-open')m.balanced=true;
 }
 return models;
}
function logLikelihood(hands,k,models){
 let penalty=0;
 for(const seat of k.unknown){
  const hand=[...hands[seat],...k.played[seat]],m=models[seat],hp=hcp(hand),len=shape(hand);
  // Auction meanings are estimates, never hard constraints: human calls and
  // competitive agreements may not match the inferred ranges exactly.
  const lo=Math.min(m.min,m.max),hi=Math.max(m.min,m.max);
  penalty+=(Math.max(0,lo-hp,hp-hi)/3)**2;
  if(m.minTP)penalty+=(Math.max(0,m.minTP-totalPoints(hand))/3)**2;
  for(const [s,n] of Object.entries(m.lengths))penalty+=1.2*Math.max(0,n-len[s])**2;
  if(m.balanced&&!balanced(hand))penalty+=1;
 }
 return -penalty;
}

export function sampleDeals(view,{samples=32,rng=random(seedFor(view))}={}){
 const k=knowledge(view),draw=allocationSampler(k),models=auctionModels(view.auction||[]);
 const first=view.history[0]?.cards[0]||view.trick[0];
 const inferLead=first&&first.seat===(view.contract.declarer+1)%4&&k.unknown.includes(first.seat);
 const signals=signalObservations(view);
 const count=k.unknown.length?Math.max(1,Math.min(128,Math.floor(samples))):1;
 const worlds=Array.from({length:count*4},()=>{const hands=draw(rng);return {hands,logWeight:logLikelihood(hands,k,models)+signalLogWeight(hands,signals,k.unknown,view.contract)+(inferLead?openingLeadLogWeight(first,[...hands[first.seat],...k.played[first.seat]],view.contract.suit):0)};});
 const max=Math.max(...worlds.map(w=>w.logWeight));
 const weights=worlds.map(w=>Math.exp(w.logWeight-max)),total=weights.reduce((a,b)=>a+b,0);
 // Systematic resampling spends the rollout budget on plausible deals while
 // comparing every candidate on the very same sample, reducing sampling noise.
 let i=0,cumulative=weights[0],start=rng()*total/count;const result=[];
 for(let j=0;j<count;j++){const target=start+j*total/count;while(i<weights.length-1&&cumulative<target)cumulative+=weights[++i];result.push(worlds[i].hands);}
 return result;
}

const strength=(c,lead,trump)=>(suit(c)===trump?100:suit(c)===lead?50:0)+rank(c);
function winner(trick,trump){const lead=suit(trick[0].card);return trick.reduce((a,b)=>strength(a.card,lead,trump)>=strength(b.card,lead,trump)?a:b).seat;}
function legal(hand,trick){if(!trick.length)return hand;const follow=hand.filter(c=>suit(c)===suit(trick[0].card));return follow.length?follow:hand;}
const cost=(c,hand,trump)=>points(c)*5+rank(c)/15+(suit(c)===trump?5:0)-hand.filter(x=>suit(x)===suit(c)).length/10;

// Cheap continuation policy used only inside hypothetical deals. It preserves
// honors, protects partner's winner, cashes established suits, and draws trumps.
function rolloutCard(hands,trick,seat,trump,declaringSide,contract,defenseTaken,declarerTaken){
 const hand=hands[seat],cards=legal(hand,trick);
 if(cards.length===1)return cards[0];
 const cheap=[...cards].sort((a,b)=>cost(a,hand,trump)-cost(b,hand,trump));
 const timing=defensiveTiming(hands,trick,seat,{...contract,trump},defenseTaken,declarerTaken);
 if(timing)return timing.card;
 if(trick.length){
  const lead=suit(trick[0].card),win=trick.reduce((a,b)=>strength(a.card,lead,trump)>=strength(b.card,lead,trump)?a:b);
  const later=Array.from({length:3-trick.length},(_,i)=>(seat+i+1)%4).filter(s=>side(s)!==side(seat));
  const safe=c=>later.every(s=>legal(hands[s],trick).every(x=>strength(x,lead,trump)<=strength(c,lead,trump)));
  if(side(win.seat)===side(seat)&&safe(win.card))return cheap[0];
  const winners=cheap.filter(c=>strength(c,lead,trump)>strength(win.card,lead,trump));
  return winners.find(safe)||(side(win.seat)!==side(seat)?winners[0]:null)||cheap[0];
 }
 const enemies=hands.flatMap((h,s)=>side(s)!==side(seat)?h:[]);
 const masters=cards.filter(c=>!enemies.some(x=>suit(x)===suit(c)&&x>c)&&hands.every((h,s)=>side(s)===side(seat)||h.some(x=>suit(x)===suit(c))||!h.some(x=>suit(x)===trump)));
 if(side(seat)===declaringSide&&trump<4&&enemies.some(c=>suit(c)===trump)){
  const trumps=masters.filter(c=>suit(c)===trump);if(trumps.length)return trumps.at(-1);
 }
 if(masters.length)return masters.sort((a,b)=>hands[partner(seat)].filter(c=>suit(c)===suit(b)).length-hands[partner(seat)].filter(c=>suit(c)===suit(a)).length||rank(b)-rank(a))[0];
 // After taking a stopper, reach partner's established winners instead of
 // automatically reopening the very suit whose communication was cut.
 if(side(seat)!==declaringSide){
  const entry=cheap.find(c=>hands[partner(seat)].some(p=>suit(p)===suit(c)&&p>c&&!enemies.some(x=>suit(x)===suit(p)&&x>p)&&hands.every((h,s)=>side(s)===side(seat)||h.some(x=>suit(x)===suit(c))||!h.some(x=>suit(x)===trump))));
  if(entry!==undefined)return entry;
 }
 const lengths=[0,1,2,3].map(s=>hand.filter(c=>suit(c)===s).length+hands[partner(seat)].filter(c=>suit(c)===s).length);
 const target=[0,1,2,3].filter(s=>hand.some(c=>suit(c)===s)&&s!==trump).sort((a,b)=>lengths[b]-lengths[a])[0]??suit(hand[0]);
 return cheap.find(c=>suit(c)===target)||cheap[0];
}

// Exact minimax within a sampled two-trick ending; each partnership cooperates.
function solveEnding(hands,trick,turn,trump,declaringSide,alpha=-1,beta=3){
 if(trick.length===4){const win=winner(trick,trump),gain=side(win)===declaringSide?1:0;return gain+solveEnding(hands,[],win,trump,declaringSide,alpha-gain,beta-gain);}
 if(!hands[turn].length)return 0;
 const maximize=side(turn)===declaringSide;let best=maximize?-1:3;
 for(const c of legal(hands[turn],trick)){
  const at=hands[turn].indexOf(c);hands[turn].splice(at,1);trick.push({seat:turn,card:c});
  const value=solveEnding(hands,trick,(turn+1)%4,trump,declaringSide,alpha,beta);
  trick.pop();hands[turn].splice(at,0,c);
  best=maximize?Math.max(best,value):Math.min(best,value);
  if(maximize)alpha=Math.max(alpha,best);else beta=Math.min(beta,best);
  if(alpha>=beta)break;
 }
 return best;
}
function rollout(world,view,first){
 const hands=world.map(h=>h.map(encode).sort((a,b)=>a-b)),trump=SUITS.indexOf(view.contract.suit),declaringSide=side(view.contract.declarer);
 const already=view.history.filter(t=>side(t.winner)===declaringSide).length;
 let trick=view.trick.map(x=>({seat:x.seat,card:encode(x.card)})),turn=view.seat,taken=0,defenseTaken=view.history.filter(t=>side(t.winner)!==declaringSide).length,next=encode(first),remaining=hands.reduce((n,h)=>n+h.length,0);
 while(remaining){
  if(next===null&&remaining+trick.length<=8)return taken+solveEnding(hands,trick,turn,trump,declaringSide);
  const c=next??rolloutCard(hands,trick,turn,trump,declaringSide,view.contract,defenseTaken,already+taken);next=null;
  hands[turn].splice(hands[turn].indexOf(c),1);trick.push({seat:turn,card:c});remaining--;
  if(trick.length===4){turn=winner(trick,trump);if(side(turn)===declaringSide)taken++;else defenseTaken++;trick=[];}else turn=(turn+1)%4;
 }
 return taken;
}

export function analyzePlay(input,{samples=32}={}){
 const view={history:[],trick:[],auction:[],vulnerable:false,...input};
 const cards=legalCards(view.hand,view.trick);
 if(!cards.length||view.trick.length===4)throw Error('There is no card to play.');
 if(cards.length===1)return {card:cards[0],samples:0,options:[],forced:true};
 const worlds=sampleDeals(view,{samples}),declaringSide=side(view.contract.declarer),us=side(view.seat),already=view.history.filter(t=>side(t.winner)===declaringSide).length;
 const leadPlan=openingLeadPlan(view),candidates=leadPlan?leadPlan.candidates.map(o=>o.card):cards;
 const defensive=leadPlan?null:defensePlan(view,worlds);
 const options=candidates.map(card=>{
  let score=0,made=0,tricks=0;
  for(const world of worlds){const count=already+rollout(world,view,card);tricks+=count;made+=count>=view.contract.level+6?1:0;score+=scoreContract(view.contract,count,view.vulnerable).score*(us===declaringSide?1:-1);}
  const openingLead=leadPlan?.candidates.find(o=>o.card.id===card.id);
  return {card,expectedScore:score/worlds.length,makeProbability:made/worlds.length,expectedTricks:tricks/worlds.length,...(openingLead?{leadMethod:openingLead.method,reason:openingLead.suitReason+' '+openingLead.reason}: {})};
 }).sort((a,b)=>b.expectedScore-a.expectedScore||(us===declaringSide?b.expectedTricks-a.expectedTricks:a.expectedTricks-b.expectedTricks)||a.card.rank-b.card.rank||encode(a.card)-encode(b.card));
 const preferred=selectDefensiveOption(options,defensive,{exact:view.hand.length<=2});
 if(preferred!==options[0]){options.splice(options.indexOf(preferred),1);options.unshift(preferred);}
 const tactic=defensive?.preferences.get(options[0].card.id);
 const chosen=leadPlan?.candidates.find(o=>o.card.id===options[0].card.id);
 return {card:options[0].card,samples:worlds.length,options,forced:false,...(defensive?{defense:{system:defensive.system,method:tactic?.method||'statistical-defense',reason:tactic?.reason||'Compare defensive continuations using the public cards, auction and signal clues.',observedSignals:defensive.observedSignals}}:{}),...(chosen?{openingLead:{system:leadPlan.system,method:chosen.method,reason:options[0].reason,ruleOfEleven:chosen.fourthBest&&view.contract.suit==='N'?ruleOfEleven(chosen.card):null}}:{})};
}
