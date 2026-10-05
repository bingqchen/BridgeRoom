import {botBid,botCard,makeCall,playCard,collectTrick} from './engine.js';
import {replayDeal} from './session.js';

// Lower bounds of the standard ACBL IMP scale (one comparison per board).
// https://www.acbl.org/learn/ — International Match Point Scoring (IMP)
const IMP_THRESHOLDS=[20,50,90,130,170,220,270,320,370,430,500,600,750,900,1100,1300,1500,1750,2000,2250,2500,3000,3500,4000];
export function pointsToIMPs(difference){
 if(!Number.isFinite(difference))throw Error('A finite point difference is required.');
 const imps=IMP_THRESHOLDS.filter(min=>Math.abs(difference)>=min).length;
 return imps===0?0:Math.sign(difference)*imps;
}

export function playBotBoard(deal){
 // Replay original cards and an optional practice contract at a separate table.
 const table=replayDeal(deal);
 let steps=0;
 while(table.phase!=='complete'){
  if(++steps>512)throw Error('The bot comparison could not finish.');
  if(table.phase==='bidding')makeCall(table,botBid(table).bid);
  else if(table.trick.length===4)collectTrick(table);
  else playCard(table,botCard(table).id);
 }
 return table;
}

export function compareWithBots(deal){
 if(deal.phase!=='complete')throw Error('Finish the board before comparing scores.');
 const botTable=playBotBoard(deal);
 const yourScore=deal.result.nsScore??0,botScore=botTable.result.nsScore??0;
 const pointDifference=yourScore-botScore;
 return {yourScore,botScore,pointDifference,imps:pointsToIMPs(pointDifference),botTable};
}
