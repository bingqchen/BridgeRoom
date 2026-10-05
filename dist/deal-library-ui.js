import {SEATS,SYMBOLS,hcp} from './bridge-cards.js';
import {DealLibrary,blankFields,parseHands,handsToFields,fillEmptyHand,validateSetup,setupFromDeal,newRecord,encodeLibrary} from './deal-library.js';
const suits=['S','H','D','C'],suitNames={S:'spades',H:'hearts',D:'diamonds',C:'clubs'};
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=s=>document.querySelector(s);
const vulnName=v=>v.every(Boolean)?'Both':v[0]?'N/S':v[1]?'E/W':'Neither';
const contractName=c=>c?`${c.level}${SYMBOLS[c.suit]}${c.doubled===2?' X':c.doubled===4?' XX':''} by ${SEATS[c.declarer]}`:'Start with bidding';
const options=(items,value)=>items.map(([v,label])=>`<option value="${v}" ${String(v)===String(value)?'selected':''}>${label}</option>`).join('');
function download(text,filename){
 const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
export function setupDealLibrary({dialog,getState,onPlay,onOpen}){
 let storage;try{storage=window.localStorage;}catch{}
 const library=new DealLibrary(storage);let draft=null,removed=null;
 const show=(title,html)=>{onOpen();dialog(title,html);$('#info-dialog').classList.add('deal-dialog');};
 const message=text=>{$('#library-message').textContent=text;};
 function list(notice=''){
  library.reload();
  show('Deal library',`<p class="library-intro">Enter a deal, bid it with the bots, or play a contract you choose. Saved deals stay in this browser on this device.</p><div class="library-tools"><button class="primary" id="new-library-deal">Enter a deal</button><button class="small-button" id="copy-table-deal">Copy current deal</button>${draft?'<button class="small-button" id="resume-deal-editor">Continue editing</button>':''}</div><p class="library-message" id="library-message" role="status"></p><div id="saved-deals" class="saved-deals"></div><div class="library-backup"><button class="small-button" id="export-library">Export library</button><button class="small-button" id="import-library">Import library</button><input type="file" id="library-file" accept=".json,application/json" hidden></div><p class="advice-note">Export a backup before clearing browser data. Import that file on another device or in the offline app; libraries do not sync automatically. Copy current deal reveals its original four hands.</p>`);
  message(library.error?`Library unavailable: ${library.error}`:notice);
  const deals=library.list(),target=$('#saved-deals');
  if(!deals.length)target.innerHTML='<div class="library-empty"><span>♠ ♥ ♦ ♣</span><h3>Your practice collection</h3><p>Save a deal from the editor to find it here.</p></div>';
  for(const d of deals){
   const row=document.createElement('article');row.className='saved-deal';
   row.innerHTML=`<div><h3>${esc(d.name)}</h3><p>${esc(contractName(d.setup.contract))} · ${SEATS[d.setup.dealer]} deals · ${vulnName(d.setup.vulnerable)} vulnerable</p><small>HCP · ${d.setup.hands.map((h,i)=>`${SEATS[i][0]} ${hcp(h)}`).join(' · ')}</small></div><div class="saved-deal-actions"><button class="small-button" data-action="play">Play</button><button class="small-button" data-action="edit">Edit</button><button class="text-button" data-action="remove">Remove</button></div>`;
   row.querySelector('[data-action="play"]').onclick=()=>onPlay(d.setup,d.name);
   row.querySelector('[data-action="edit"]').onclick=()=>edit(d);
   row.querySelector('[data-action="remove"]').onclick=()=>{try{removed=library.remove(d.id);list('Deal removed.');}catch(e){message(e.message);}};
   target.append(row);
  }
  if(removed){const undo=document.createElement('button');undo.className='small-button';undo.textContent='Undo removal';undo.onclick=()=>{try{library.restore(removed);removed=null;list('Deal restored.');}catch(e){message(e.message);}};$('#library-message').after(undo);}
  $('#new-library-deal').onclick=()=>edit(null);
  $('#resume-deal-editor')?.addEventListener('click',()=>edit(undefined));
  $('#copy-table-deal').onclick=()=>edit({name:getState().dealName||`Board ${getState().board}`,setup:setupFromDeal(getState())});
  $('#export-library').disabled=library.blocked||!deals.length;
  $('#export-library').onclick=()=>download(library.export(),'bridge-room-library.json');
  $('#import-library').onclick=()=>$('#library-file').click();
  $('#library-file').onchange=async e=>{
   const file=e.target.files[0];if(!file)return;
   try{if(file.size>2_000_000)throw Error('Choose a library file smaller than 2 MB.');const count=library.import(await file.text());list(`${count} ${count===1?'deal':'deals'} imported.`);}catch(error){message(error.message);e.target.value='';}
  };
 }
 function edit(entry){
  if(entry!==undefined)draft=entry?{id:entry.id,name:entry.name,fields:handsToFields(entry.setup.hands),dealer:entry.setup.dealer,vulnerable:entry.setup.vulnerable,contract:entry.setup.contract}:{name:'',fields:blankFields(),dealer:0,vulnerable:[false,false],contract:null};
  const d=draft,c=d.contract||{level:3,suit:'N',declarer:2,doubled:1};
  show(d.id?'Edit saved deal':'Enter a deal',`<p class="library-intro">Type ranks in each suit: <strong>AKQJ1098765432</strong> (T also means 10). Leave a void blank or use a dash. Each player needs 13 cards.</p><label class="deal-name-field">Deal name <input id="custom-name" maxlength="80" placeholder="e.g. A tricky 3NT defense" value="${esc(d.name)}" autocomplete="off"></label><div class="deal-editor-hands">${SEATS.map((seat,i)=>`<fieldset><legend>${seat}${i===2?' · you':''}</legend><p class="editor-hand-count" data-count="${i}"></p>${suits.map(s=>`<label class="holding-field ${['H','D'].includes(s)?'red':''}"><span aria-hidden="true">${SYMBOLS[s]}</span><input data-seat="${i}" data-suit="${s}" aria-label="${seat} ${suitNames[s]}" value="${esc(d.fields[i][s])}" placeholder="—" maxlength="50" autocapitalize="characters" autocomplete="off" spellcheck="false"></label>`).join('')}</fieldset>`).join('')}</div><div class="editor-validation"><p id="cards-status" role="status" aria-live="polite"></p><button class="small-button" id="fill-last-hand">Fill empty hand</button><details><summary>Unassigned cards</summary><p id="missing-cards"></p></details><ul id="deal-errors"></ul></div><div class="deal-setup-grid"><label>Dealer<select id="custom-dealer">${options(SEATS.map((s,i)=>[i,s]),d.dealer)}</select></label><label>Vulnerability<select id="custom-vulnerability">${options([['0','Neither'],['1','N/S'],['2','E/W'],['3','Both']],Number(d.vulnerable[0])+2*Number(d.vulnerable[1]))}</select></label><label class="start-mode">Start from<select id="custom-mode">${options([['auction','Bidding'],['contract','A set contract']],d.contract?'contract':'auction')}</select></label></div><div id="custom-contract" class="deal-contract-grid" ${d.contract?'':'hidden'}><label>Level<select id="custom-level">${options([1,2,3,4,5,6,7].map(n=>[n,n]),c.level)}</select></label><label>Trump<select id="custom-suit">${options([...suits,'N'].map(s=>[s,SYMBOLS[s]]),c.suit)}</select></label><label>Declarer<select id="custom-declarer">${options(SEATS.map((s,i)=>[i,s]),c.declarer)}</select></label><label>Double<select id="custom-double">${options([[1,'Undoubled'],[2,'Doubled'],[4,'Redoubled']],c.doubled)}</select></label></div><p class="library-message" id="library-message" role="status"></p><p class="advice-note" id="custom-start-note"></p><div class="editor-actions"><button class="primary" id="play-custom">Start bidding</button><button class="small-button" id="save-custom">Save deal</button><button class="small-button" id="download-custom">Download deal</button><button class="text-button" id="back-library">Library</button></div>`);
  const capture=()=>{
   d.name=$('#custom-name').value;
   document.querySelectorAll('.holding-field input').forEach(el=>d.fields[Number(el.dataset.seat)][el.dataset.suit]=el.value);
   d.dealer=Number($('#custom-dealer').value);const v=Number($('#custom-vulnerability').value);d.vulnerable=[Boolean(v&1),Boolean(v&2)];
   d.contract=$('#custom-mode').value==='auction'?null:{level:Number($('#custom-level').value),suit:$('#custom-suit').value,declarer:Number($('#custom-declarer').value),doubled:Number($('#custom-double').value)};
   return parseHands(d.fields);
  };
  const read=()=>{const parsed=capture();if(!parsed.valid)throw Error(parsed.errors[0]);return validateSetup({hands:parsed.hands,dealer:d.dealer,vulnerable:d.vulnerable,contract:d.contract});};
  function update(){
   const p=capture();
   document.querySelectorAll('[data-count]').forEach(el=>{const i=Number(el.dataset.count);el.textContent=`${p.counts[i]} / 13 cards · ${p.points[i]} HCP`;el.classList.toggle('valid',p.counts[i]===13);});
   $('#cards-status').textContent=p.valid?'All 52 cards assigned. Ready to play.':`${52-p.missing.length} / 52 unique cards assigned`;
   $('#deal-errors').replaceChildren();for(const error of p.errors){const li=document.createElement('li');li.textContent=error;$('#deal-errors').append(li);}
   $('#missing-cards').textContent=suits.map(s=>`${SYMBOLS[s]} ${p.missing.filter(c=>c.suit===s).sort((a,b)=>b.rank-a.rank).map(c=>c.rank===10?'10':({14:'A',13:'K',12:'Q',11:'J'}[c.rank]||c.rank)).join(' ')||'—'}`).join('  ·  ');
   try{fillEmptyHand(d.fields);$('#fill-last-hand').disabled=false;}catch{$('#fill-last-hand').disabled=true;}
   $('#play-custom').disabled=!p.valid;$('#save-custom').disabled=!p.valid||!d.name.trim()||library.blocked;$('#download-custom').disabled=!p.valid;
   $('#custom-contract').hidden=!d.contract;$('#play-custom').textContent=d.contract?'Start play':'Start bidding';
   $('#custom-start-note').textContent=(d.contract?'The opening leader plays first. The four-bot comparison uses this same contract.':'The bots bid normally with these cards. The four-bot comparison bids the same deal independently.')+' Your entered seats stay fixed; the South-highest-HCP preference does not apply. Starting replaces the current table.';
  }
  $('#dialog-body').querySelectorAll('input:not([type="file"]),select').forEach(el=>el.addEventListener('input',()=>{update();message('');}));
  $('#fill-last-hand').onclick=()=>{capture();try{d.fields=fillEmptyHand(d.fields);edit(undefined);}catch(e){message(e.message);}};
  $('#play-custom').onclick=()=>{try{const setup=read();onPlay(setup,d.name.trim()||'Custom deal');}catch(e){message(e.message);}};
  $('#save-custom').onclick=()=>{try{const entry=library.save(d.name.trim(),read(),d.id);d.id=entry.id;message(`Saved “${entry.name}” on this device.`);}catch(e){message(e.message);}};
  $('#download-custom').onclick=()=>{try{download(encodeLibrary([newRecord(d.name.trim()||'Custom deal',read(),d.id)]),'bridge-room-deal.json');message('Deal file ready to download. Import it into any Bridge Room library.');}catch(e){message(e.message);}};
  $('#back-library').onclick=()=>{capture();list();};
  update();if(library.blocked)message(`Saving is unavailable: ${library.error} Use Download deal to keep a copy.`);
 }
 return ()=>list();
}
