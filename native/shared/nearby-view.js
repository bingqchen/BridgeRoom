// Table rotation changes only presentation, never the actual bridge seats.
export function bottomSeatFor(view){
 const s=view?.state,c=s?.contract;
 return s?.phase==='play'&&s.dummyExposed&&c?.dummy===view.you&&view.players[c.declarer].bot?c.declarer:view.you;
}
export function tablePosition(view,seat){return (seat-bottomSeatFor(view)+6)%4;}
