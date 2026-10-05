const CACHE="bridge-room-offline-145358faed06b3b1";
const ASSETS=["./","app.js","bid-preview.js","bidding-context.js","bridge-cards.js","bridge-room-offline.html","card-play.js","claim.js","completed-deal.js","defense.js","duplicate.js","engine.js","fonts/DM-Sans-OFL.txt","fonts/Libre-Caslon-Display-OFL.txt","fonts/dm-sans-400.ttf","fonts/dm-sans-500.ttf","fonts/dm-sans-600.ttf","fonts/dm-sans-700.ttf","fonts/libre-caslon-display.ttf","gib-competitive.js","gib-notrump.js","gib-slam.js","gib-suit.js","gib-system-card.js","gib-system.js","icons/icon-192.png","icons/icon-512.png","icons/icon.svg","icons/maskable-512.png","index.html","manifest.webmanifest","mobile.css","natural-bidding.js","offline.js","opening-leads.js","play-rules.js","session.js","style.css","turn-state.js"];
const PREFIX='bridge-room-offline-';
const assetURL=path=>new URL(path,self.registration.scope).href;
const URLs=ASSETS.map(assetURL);
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  try{
   await cache.addAll(URLs.map(url=>new Request(url,{cache:'reload',credentials:'same-origin',redirect:'error'})));
   await self.skipWaiting();
  }catch(error){await caches.delete(CACHE);throw error;}
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 url.search='';url.hash='';
 if(!URLs.includes(url.href))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),saved=await cache.match(url.href);
  return saved||fetch(request);
 })());
});
self.addEventListener('message',event=>{
 if(event.data?.type!=='OFFLINE_STATUS'||!event.ports[0])return;
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  const entries=await Promise.all(URLs.map(url=>cache.match(url)));
  event.ports[0].postMessage({ready:entries.every(Boolean)});
 })());
});
