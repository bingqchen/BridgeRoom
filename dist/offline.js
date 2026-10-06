// Installation is optional; the standalone HTML download also works from file://.
function deadline(promise,ms){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Offline setup timed out')),ms);promise.then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});}
export async function offlineCacheReady(registration){
 if(!registration?.active)return false;
 const channel=new MessageChannel();
 try{
  const ready=new Promise(resolve=>{channel.port1.onmessage=e=>resolve(e.data?.ready===true);});
  registration.active.postMessage({type:'OFFLINE_STATUS'},[channel.port2]);
  return await deadline(ready,4000);
 }finally{channel.port1.close();channel.port2.close();}
}
export async function prepareOfflineCache(serviceWorker){
 // A saved app must remain ready even when checking sw.js for an update needs a network.
 const options={scope:'./',updateViaCache:'none'};
 try{
  const existing=await deadline(serviceWorker.getRegistration('./'),4000);
  if(await offlineCacheReady(existing)){
   serviceWorker.register('./sw.js',options).catch(()=>{});
   return true;
  }
 }catch{/* A fresh installation may still succeed. */}
 await deadline(serviceWorker.register('./sw.js',options),15000);
 return offlineCacheReady(await deadline(serviceWorker.ready,15000));
}
export function setupOffline(showDialog){
 const bundled=document.documentElement.hasAttribute('data-offline-bundle');
 let status=bundled?'file':'saving',installPrompt=null,preparing=null;
 const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const messages={file:'This file is ready to play offline. Keep it on your device and open it in a browser.',saving:'Saving the game for offline play… Keep this page open until it is ready.',ready:'Ready for offline play in this app window. If you add a Home Screen icon, open that icon while online and check this message there too.',error:'Offline setup did not finish. This app is not yet ready to launch without a connection. Reconnect and retry.',unsupported:'This browser cannot save an installable offline app. Use the offline file instead.'};
 function panel(){
  return `<p class="offline-status" role="status">${messages[status]}</p>${bundled?'':`<div class="offline-options"><button id="install-app" class="primary" ${installPrompt&&status==='ready'&&!installed()?'':'disabled'}>${installed()?'App installed':'Install app'}</button><a class="outline offline-download" href="./bridge-room-offline" download="The Bridge Room.html">Download offline file</a></div>${status==='error'?'<button id="prepare-offline" class="small-button">Retry offline setup</button>':''}<h3>iPhone and iPad</h3><ol><li>While online, open the site in Safari and sign in if asked.</li><li>Use Share → <strong>Add to Home Screen</strong>. If you already have the icon, keep it.</li><li><strong>Open the Home Screen icon while still online.</strong> In that app, open Menu → Get app · play offline and wait for “Ready for offline play”.</li><li>Turn on Airplane Mode, turn Wi-Fi off, close the app and reopen its icon to check the offline launch.</li></ol><p>The Home Screen icon alone does not mean the game has been saved. Android and desktop browsers can use Install app or their browser's install menu, then open the installed app online once.</p><h3>Use the download</h3><p>Save the HTML file, then open it in a browser. It contains the entire game and works without a server or installation. On phones that only preview HTML files, use the home-screen option instead.</p>`}<p>Bidding, all three bots, hints, undo, replay, saved deals and duplicate comparisons work offline once setup finishes. Signing in for the first time or restoring cleared browser storage needs a connection.</p><p>Your current deal and session scores last while the app stays open. Closing or refreshing starts a new session. Reference links in the system card still need a connection.</p>`;
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
 async function prepare(){
  if(bundled||preparing)return;
  if(!('serviceWorker' in navigator)||!window.isSecureContext){status='unsupported';refresh();return;}
  status='saving';refresh();
  preparing=(async()=>{
   try{
    status=await prepareOfflineCache(navigator.serviceWorker)?'ready':'error';
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
