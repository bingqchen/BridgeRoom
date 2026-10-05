// Installation is optional; the standalone HTML download also works from file://.
export function setupOffline(showDialog){
 const bundled=document.documentElement.hasAttribute('data-offline-bundle');
 let status=bundled?'file':'saving',installPrompt=null,preparing=null;
 const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const messages={file:'This file is ready to play offline. Keep it on your device and open it in a browser.',saving:'Saving the game for offline play… Keep this page open until it is ready.',ready:'Ready for offline play. You can disconnect after installing or downloading the app.',error:'Offline setup did not finish. Reconnect and try again, or download the offline file.',unsupported:'This browser cannot save an installable offline app. Use the offline file instead.'};
 function panel(){
  return `<p class="offline-status" role="status">${messages[status]}</p>${bundled?'':`<div class="offline-options"><button id="install-app" class="primary" ${installPrompt&&status==='ready'&&!installed()?'':'disabled'}>${installed()?'App installed':'Install app'}</button><a class="outline offline-download" href="./bridge-room-offline.html" download="The Bridge Room.html">Download offline file</a></div>${status==='error'?'<button id="prepare-offline" class="small-button">Retry offline setup</button>':''}<h3>On your phone</h3><p>Open this site in your browser. Use Share or the browser menu, then <strong>Add to Home Screen</strong> or <strong>Install app</strong> when available. Wait for “Ready for offline play” before disconnecting.</p><h3>Use the download</h3><p>Save the HTML file, then open it in a browser. It contains the entire game and works without a server or installation. On phones that only preview HTML files, use the home-screen option instead.</p>`}<p>Bidding, all three bots, hints, undo, replay, and duplicate comparisons work offline. There are no accounts or downloads needed during a game.</p><p>Your current deal and session scores last while the app stays open. Closing or refreshing starts a new session. Reference links in the system card still need a connection.</p>`;
 }
 function bind(){
  document.querySelector('#install-app')?.addEventListener('click',async()=>{
   if(!installPrompt)return;
   const prompt=installPrompt;installPrompt=null;refresh();
   try{await prompt.prompt();await prompt.userChoice;}catch{/* Browser menu remains available. */}
   refresh();
  });
  document.querySelector('#prepare-offline')?.addEventListener('click',prepare);
 }
 function refresh(){
  document.querySelector('#offline-button').textContent=bundled?'Offline app':'Get app';
  if(document.querySelector('#info-dialog').open&&document.querySelector('#dialog-title').textContent==='Play offline'){
   document.querySelector('#dialog-body').innerHTML=panel();bind();
  }
 }
 function open(){showDialog('Play offline',panel());bind();}
 function deadline(promise,ms){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Offline setup timed out')),ms);promise.then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});}
 async function prepare(){
  if(bundled||preparing)return;
  if(!('serviceWorker' in navigator)||!window.isSecureContext){status='unsupported';refresh();return;}
  status='saving';refresh();
  preparing=(async()=>{
   try{
    await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
    const registration=await deadline(navigator.serviceWorker.ready,15000);
    const channel=new MessageChannel();
    try{
     const ready=new Promise(resolve=>{channel.port1.onmessage=e=>resolve(e.data?.ready===true);});
     registration.active.postMessage({type:'OFFLINE_STATUS'},[channel.port2]);
     status=await deadline(ready,4000)?'ready':'error';
    }finally{channel.port1.close();channel.port2.close();}
   }catch{status='error';}
   finally{preparing=null;refresh();}
  })();
  return preparing;
 }
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;refresh();});
 window.addEventListener('appinstalled',()=>{installPrompt=null;refresh();});
 window.addEventListener('online',()=>{if(status!=='ready')prepare();});
 document.querySelector('#offline-button').onclick=open;
 prepare();refresh();return open;
}
