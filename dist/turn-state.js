// A completed trick is waiting to be collected; its winner is not yet on lead.
export function activeSeat(state){
 return state.phase==='bidding'||state.phase==='play'&&state.trick.length<4?state.turn:null;
}
