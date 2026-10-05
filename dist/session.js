import {createDeal} from './engine.js';

// Restart from the saved deal, never from the cards still left in players' hands.
export function replayDeal(deal){
 const contract=deal.startContract?structuredClone(deal.startContract):null;
 return {board:deal.board,dealer:deal.dealer,vulnerable:[...deal.vulnerable],
  hands:structuredClone(deal.originalHands),originalHands:structuredClone(deal.originalHands),
  ...(deal.dealName?{dealName:deal.dealName}:{}),...('startContract' in deal?{startContract:structuredClone(contract)}:{}),
  auction:[],phase:contract?'play':'bidding',turn:contract?(contract.declarer+1)%4:deal.dealer,contract,trick:[],history:[],
  tricks:[0,0],dummyExposed:false,result:null};
}

export class TableSession {
 constructor(){
  this.snapshots=[];
  this.totals=[0,0];
  this.comparisonTotals={boards:0,points:0,imps:0};
  this.score=null;
  this.comparison=null;
 }
 get canUndo(){return this.snapshots.length>0;}
 get scored(){return this.score!==null;}
 act(state,action){
  const before=structuredClone(state);
  action(state); // Invalid bids/cards must not create an undo entry.
  this.snapshots.push(before);
 }
 undo(){
  if(!this.canUndo)return null;
  this.removeResult();
  return this.snapshots.pop();
 }
 replay(state){
  this.removeResult();
  this.snapshots=[];
  return replayDeal(state);
 }
 skip(state,rng,options){
  // Completed boards stay in the session; incomplete boards add nothing.
  const next=createDeal(state.board+1,rng,options);
  return this.start(next);
 }
 start(next){
  // A loaded library deal is a new board, just like Skip. Keep prior results.
  this.snapshots=[];
  this.score=null;
  this.comparison=null;
  return next;
 }
 recordScore(state){
  if(state.phase!=='complete'||this.scored)return;
  this.score=state.result.nsScore??0;
  this.totals[0]+=this.score;
  this.totals[1]-=this.score;
 }
 recordComparison(comparison){
  if(!this.scored||this.comparison)return;
  this.comparison=comparison;
  this.comparisonTotals.boards++;
  this.comparisonTotals.points+=comparison.pointDifference;
  this.comparisonTotals.imps+=comparison.imps;
 }
 removeResult(){
  if(this.scored){this.totals[0]-=this.score;this.totals[1]+=this.score;}
  if(this.comparison){
   this.comparisonTotals.boards--;
   this.comparisonTotals.points-=this.comparison.pointDifference;
   this.comparisonTotals.imps-=this.comparison.imps;
  }
  this.score=null;
  this.comparison=null;
 }
}
