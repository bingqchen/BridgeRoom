// Browser-only UI fixture. This file is never bundled into the native app.
// Open this page twice on one origin with ?role=host and ?role=guest.
// Use 11111111111111111111111111111111 for the first guest, then 222… or 333….
// role identifies a test device; optional session isolates simultaneous tests.
// BroadcastChannel deliberately substitutes for, and does not test, native TLS.
(()=>{
 const params=new URLSearchParams(location.search);
 const role=params.get('role')||'host',session=params.get('session')||'default';
 const storageKey=`bridge-nearby-fixture:${session}:${role}`;
 let device=sessionStorage.getItem(storageKey);
 if(!device){device=crypto.randomUUID();sessionStorage.setItem(storageKey,device);}
 const endpoint=crypto.randomUUID(),identity=`fixture-${role}-${device}`;
 const channel=new BroadcastChannel(`bridge-nearby-fixture:${session}`);
 const invitations=['1'.repeat(32),'2'.repeat(32),'3'.repeat(32)];
 const queue=[],discovered=new Map(),peers=new Map(),owners=new Map();
 let ready=false,mode='idle',host=null,hostingId=null,hostingName='',lastJoin=null;
 const send=(type,fields={},to=null)=>channel.postMessage({type,...fields,from:endpoint,to});
 function emit(event){
  if(ready&&typeof window.bridgeNativeEvent==='function')window.bridgeNativeEvent(event);
  else queue.push(event);
 }
 function tables(){
  const now=Date.now();
  for(const [id,entry] of discovered)if(now-entry.seen>6500)discovered.delete(id);
  if(mode==='browse')emit({type:'tables',tables:[...discovered.values()].map(({id,name})=>({id,name}))});
 }
 function announce(){
  if(mode==='host')send('announce',{tableId:hostingId,name:hostingName});
 }
 function leave(notify=true){
  if(mode==='host')send('ended',{tableId:hostingId});
  else if(mode==='guest'&&host)send('disconnect',{},host.endpoint);
  mode='idle';host=null;hostingId=null;peers.clear();owners.clear();discovered.clear();lastJoin=null;
  if(notify)emit({type:'left'});
 }
 function error(message){emit({type:'error',message});}
 function copy(text){
  if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).catch(()=>{});
 }
 window.webkit={messageHandlers:{bridgeRoom:{postMessage(message){
  if(!message||typeof message!=='object')return;
  switch(message.type){
   case 'ready':
    ready=true;while(queue.length)window.bridgeNativeEvent(queue.shift());break;
   case 'host':
    leave(false);mode='host';hostingId=`fixture-table-${identity}`;hostingName=String(message.name||'Host').slice(0,28);
    emit({type:'hosting',id:identity,name:hostingName,invites:[...invitations]});announce();break;
   case 'browse':
    leave(false);mode='browse';emit({type:'tables',tables:[]});
    emit({type:'status',message:'Test transport: looking for another browser tab.'});send('discover');break;
   case 'join': {
    const target=discovered.get(message.tableId);
    if(!target)return error('Test host not found. Open the host fixture in another tab.');
    const code=String(message.code||'').replace(/[\s-]/g,'').toLowerCase();
    if(!invitations.includes(code))return error('Use the private invitation shown in the host tab.');
    mode='guest';host={endpoint:target.endpoint,tableId:target.id};
    lastJoin={tableId:target.id,code,name:String(message.name||'Player').slice(0,28),identity};
    send('join',lastJoin,host.endpoint);break;
   }
   case 'send':
    if(mode==='host'){
     const target=[...peers.values()].find(peer=>peer.identity===message.peerId);
     if(target)send('payload',{payload:message.payload},target.endpoint);
    }else if(mode==='guest'&&host)send('payload',{payload:message.payload},host.endpoint);
    break;
   case 'leave':leave();break;
   case 'copy':copy(String(message.text||''));break;
  }
 }}}};
 channel.onmessage=({data})=>{
  if(!data||data.from===endpoint||data.to&&data.to!==endpoint)return;
  switch(data.type){
   case 'discover':announce();break;
   case 'announce':
    if(mode==='browse'){
     discovered.set(data.tableId,{id:data.tableId,name:data.name,endpoint:data.from,seen:Date.now()});tables();
    }
    break;
   case 'join': {
    if(mode!=='host'||data.tableId!==hostingId)return;
    if(!invitations.includes(data.code))return send('rejected',{message:'Incorrect test invitation.'},data.from);
    // Once claimed, a code belongs to a test device. Actions cannot choose the
    // peerId delivered to the app: it always comes from this authenticated map.
    const owner=owners.get(data.code);
    if(owner&&owner!==data.identity)return send('rejected',{message:'That invitation belongs to another player.'},data.from);
    if(typeof data.identity!=='string'||!data.identity.startsWith('fixture-'))return;
    owners.set(data.code,data.identity);
    for(const [key,peer] of peers)if(peer.identity===data.identity)peers.delete(key);
    peers.set(data.from,{endpoint:data.from,identity:data.identity,name:data.name});
    send('joined',{identity:data.identity,tableId:hostingId},data.from);
    emit({type:'peer',id:data.identity,name:data.name,connected:true});break;
   }
   case 'joined':
    if(mode==='guest'&&data.from===host?.endpoint&&data.tableId===host.tableId&&data.identity===identity)
     emit({type:'joined',id:identity});
    break;
   case 'payload':
    if(mode==='host'){
     const peer=peers.get(data.from);
     if(peer)emit({type:'message',peerId:peer.identity,payload:data.payload});
    }else if(mode==='guest'&&data.from===host?.endpoint)emit({type:'message',payload:data.payload});
    break;
   case 'rejected':
    if(mode==='guest'&&data.from===host?.endpoint){mode='browse';host=null;error(data.message);send('discover');}
    break;
   case 'disconnect': {
    if(mode!=='host')return;
    const peer=peers.get(data.from);
    if(peer){peers.delete(data.from);emit({type:'peer',id:peer.identity,name:peer.name,connected:false});}
    break;
   }
   case 'ended':
    discovered.delete(data.tableId);tables();
    if(mode==='guest'&&data.from===host?.endpoint){mode='idle';host=null;emit({type:'left'});error('The test host closed the table.');}
    break;
  }
 };
 setInterval(()=>{announce();tables();},1500);
 window.addEventListener('pagehide',()=>{
  if(mode==='host')send('ended',{tableId:hostingId});
  else if(mode==='guest'&&host)send('disconnect',{},host.endpoint);
 });
})();
