import {SUITS,SEATS,sortHand,hcp,partner} from './bridge-cards.js';
const suits=['S','H','D','C'],ranks='AKQJT98765432';
export const LIBRARY_KEY='bridge-room.deal-library.v1',MAX_DEALS=200;
export const blankFields=()=>Array.from({length:4},()=>({S:'',H:'',D:'',C:''}));
const card=(s,r)=>({suit:s,rank:r,id:s+r});
const deck=()=>suits.flatMap(s=>Array.from({length:13},(_,i)=>card(s,i+2)));
const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);

export function parseHands(fields){
 const hands=[[],[],[],[]],errors=[],owners=new Map();
 for(let seat=0;seat<4;seat++)for(const suit of suits){
  const raw=String(fields?.[seat]?.[suit]??'').trim();
  const text=/^[-–—]*$/.test(raw)?'':raw.toUpperCase().replaceAll('10','T').replace(/[\s,]/g,'');
  if(/[^AKQJT98765432]/.test(text)){errors.push(`${SEATS[seat]} ${suit}: use A K Q J 10 (or T), and 2–9 only.`);continue;}
  for(const r of text){
   const c=card(suit,14-ranks.indexOf(r));
   if(owners.has(c.id))errors.push(`${r==='T'?'10':r}${{S:'♠',H:'♥',D:'♦',C:'♣'}[suit]} is repeated (${SEATS[owners.get(c.id)]} and ${SEATS[seat]}).`);
   else owners.set(c.id,seat);
   hands[seat].push(c);
  }
 }
 hands.forEach((h,i)=>{if(h.length!==13)errors.push(`${SEATS[i]} needs 13 cards; currently ${h.length}.`);});
 return {hands:hands.map(sortHand),errors,valid:errors.length===0,counts:hands.map(h=>h.length),points:hands.map(hcp),missing:deck().filter(c=>!owners.has(c.id))};
}
export function handsToFields(hands){
 return hands.map(h=>Object.fromEntries(suits.map(s=>[s,h.filter(c=>c.suit===s).sort((a,b)=>b.rank-a.rank).map(c=>ranks[14-c.rank]).join('')])));
}
export function fillEmptyHand(fields){
 const parsed=parseHands(fields),empty=parsed.counts.map((n,i)=>n===0?i:-1).filter(i=>i>=0);
 if(empty.length!==1||parsed.counts.some((n,i)=>i!==empty[0]&&n!==13)||parsed.missing.length!==13||parsed.errors.some(e=>!e.includes('needs 13 cards')))
  throw Error('Enter three complete, unique 13-card hands and leave one hand empty.');
 const next=structuredClone(parsed.hands);next[empty[0]]=parsed.missing;return handsToFields(next);
}
export function validateSetup(input){
 if(!input||!Array.isArray(input.hands)||input.hands.length!==4)throw Error('A deal must contain all four hands.');
 if(input.hands.some(h=>!Array.isArray(h)||h.length!==13))throw Error('Every hand must have exactly 13 cards.');
 const hands=input.hands.map(h=>h.map(c=>{
  if(!c||!suits.includes(c.suit)||!Number.isInteger(c.rank)||c.rank<2||c.rank>14)throw Error('The deal contains an invalid card.');
  return card(c.suit,c.rank);
 }));
 if(new Set(hands.flat().map(c=>c.id)).size!==52)throw Error('Assign each card exactly once across the four hands.');
 if(!Number.isInteger(input.dealer)||input.dealer<0||input.dealer>3)throw Error('Choose a valid dealer.');
 if(!Array.isArray(input.vulnerable)||input.vulnerable.length!==2||input.vulnerable.some(v=>typeof v!=='boolean'))throw Error('Choose the vulnerability.');
 let contract=null;
 if(input.contract!=null){
  const c=input.contract;
  if(!Number.isInteger(c.level)||c.level<1||c.level>7||!SUITS.includes(c.suit)||!Number.isInteger(c.declarer)||c.declarer<0||c.declarer>3||![1,2,4].includes(c.doubled))throw Error('Choose a valid contract and declarer.');
  contract={level:c.level,suit:c.suit,declarer:c.declarer,dummy:partner(c.declarer),doubled:c.doubled};
 }
 return {hands:hands.map(sortHand),dealer:input.dealer,vulnerable:[...input.vulnerable],contract};
}
export function customDeal(input,board=1,name='Custom deal'){
 const setup=validateSetup(input),contract=setup.contract;
 if(!Number.isSafeInteger(board)||board<1)throw Error('Invalid board number.');
 return {board,dealer:setup.dealer,vulnerable:setup.vulnerable,hands:structuredClone(setup.hands),originalHands:structuredClone(setup.hands),
  dealName:String(name).trim().slice(0,80)||'Custom deal',startContract:structuredClone(contract),
  auction:[],phase:contract?'play':'bidding',turn:contract?(contract.declarer+1)%4:setup.dealer,contract:structuredClone(contract),trick:[],history:[],tricks:[0,0],dummyExposed:false,result:null};
}
export function setupFromDeal(deal){return validateSetup({hands:deal.originalHands,dealer:deal.dealer,vulnerable:deal.vulnerable,contract:deal.startContract||null});}
function record(input){
 if(!input||typeof input.id!=='string'||!input.id||input.id.length>120||typeof input.name!=='string'||!input.name.trim()||input.name.length>80)throw Error('A saved deal needs a valid name and ID.');
 for(const key of ['createdAt','updatedAt'])if(typeof input[key]!=='string'||!Number.isFinite(Date.parse(input[key])))throw Error('Invalid saved-deal date.');
 return {id:input.id,name:input.name.trim(),createdAt:input.createdAt,updatedAt:input.updatedAt,setup:validateSetup(input.setup)};
}
export function decodeLibrary(text){
 if(typeof text!=='string'||text.length>2_000_000)throw Error('Choose a Bridge Room library file smaller than 2 MB.');
 let data;try{data=JSON.parse(text);}catch{throw Error('This file is not valid JSON.');}
 if(data?.version!==1||!Array.isArray(data.deals)||data.deals.length>MAX_DEALS)throw Error(`Choose a Bridge Room library with up to ${MAX_DEALS} deals.`);
 const deals=data.deals.map(record);
 if(new Set(deals.map(d=>d.id)).size!==deals.length)throw Error('The library contains repeated deal IDs.');
 return deals;
}
export const encodeLibrary=deals=>JSON.stringify({version:1,deals:deals.map(record)},null,2);
export function newRecord(name,setup,id=uid(),now=new Date().toISOString()){
 return record({id,name,setup,createdAt:now,updatedAt:now});
}
export class DealLibrary{
 constructor(storage){this.storage=storage;this.deals=[];this.error=null;this.blocked=false;this.raw=null;this.reload();}
 reload(){
  try{
   if(!this.storage)throw Error('Browser storage is unavailable. You can still play and download a deal file.');
   const raw=this.storage.getItem(LIBRARY_KEY);this.deals=raw===null?[]:decodeLibrary(raw);this.raw=raw;this.error=null;this.blocked=false;
  }catch(e){this.error=e.message;this.blocked=true;}
  return this.list();
 }
 list(){return structuredClone(this.deals).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
 write(next){
  if(this.blocked)throw Error(this.error||'Library storage is unavailable.');
  if(next.length>MAX_DEALS)throw Error(`The library can hold ${MAX_DEALS} deals. Export a backup before removing old deals.`);
  try{
   if(this.storage.getItem(LIBRARY_KEY)!==this.raw)throw Error('The library changed in another tab. Reopen the library before saving.');
   const text=encodeLibrary(next);this.storage.setItem(LIBRARY_KEY,text);this.raw=text;
  }catch(e){throw Error(e.message.includes('another tab')?e.message:'Could not save to this browser. Download a deal file to keep a copy.');}
  this.deals=structuredClone(next);
 }
 save(name,setup,id){
  const old=this.deals.find(d=>d.id===id),entry=newRecord(name,setup,id||uid());
  if(old)entry.createdAt=old.createdAt;
  this.write([entry,...this.deals.filter(d=>d.id!==entry.id)]);return structuredClone(entry);
 }
 remove(id){const old=this.deals.find(d=>d.id===id);if(!old)return null;this.write(this.deals.filter(d=>d.id!==id));return structuredClone(old);}
 restore(deal){const copy=record(deal);if(this.deals.some(d=>d.id===copy.id))copy.id=uid();this.write([...this.deals,copy]);}
 import(text){
  const incoming=decodeLibrary(text),next=structuredClone(this.deals);let added=0;
  for(const item of incoming){
   const old=next.find(d=>d.id===item.id);
   if(old&&old.name===item.name&&JSON.stringify(old.setup)===JSON.stringify(item.setup))continue;
   if(old)item.id=uid();next.push(item);added++;
  }
  this.write(next);return added;
 }
 export(){return encodeLibrary(this.deals);}
}
