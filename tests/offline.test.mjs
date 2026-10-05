import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import vm from 'node:vm';
const dist=new URL('../dist/',import.meta.url);
const read=name=>readFile(new URL(name,dist),'utf8');
async function worker({failInstall=false}={}){
 const listeners={},stores=new Map(),requested=[];let offline=false,claimed=false;
 const storesAPI={
  async open(name){if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {
   async addAll(requests){for(const request of requests){requested.push(request);if(failInstall)throw Error('connection lost');const url=new URL(request.url);const filename=url.pathname==='/'?'index.html':url.pathname.slice(1);const bytes=await readFile(new URL(filename,dist));store.set(request.url,new Response(bytes));}},
   async match(key){return store.get(typeof key==='string'?key:key.url)?.clone();}
  };},async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);}
 };
 const self={registration:{scope:'https://bridge.test/'},location:{origin:'https://bridge.test'},clients:{async claim(){claimed=true;}},async skipWaiting(){},addEventListener:(name,callback)=>listeners[name]=callback};
 vm.runInNewContext(await read('sw.js'),{self,caches:storesAPI,URL,Request,fetch:async request=>{if(offline)throw Error('No network');return new Response('network');}});
 async function lifecycle(name){let work;listeners[name]({waitUntil:p=>work=p});return work;}
 async function fetchPath(path,method='GET'){let work;listeners.fetch({request:new Request('https://bridge.test'+path,{method}),respondWith:p=>work=p});return work;}
 return {lifecycle,fetchPath,requested,stores,setOffline(){offline=true;},get claimed(){return claimed;},async ready(){let work,value;listeners.message({data:{type:'OFFLINE_STATUS'},ports:[{postMessage:v=>value=v}],waitUntil:p=>work=p});await work;return value.ready;}};
}
test('standalone download embeds every startup asset and executable game code',async()=>{
 const html=await read('bridge-room-offline.html');
 assert(html.includes('data-offline-bundle'));assert(html.includes('data:font/ttf;base64,'));assert(html.includes('SIL OPEN FONT LICENSE'));
 assert(!/<script[^>]*\bsrc=/.test(html));assert(!/<link[^>]+rel="(?:stylesheet|manifest|apple-touch-icon)"/.test(html));assert(!/@import\s/.test(html));assert(!/url\(['"]?https?:/.test(html));
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.equal(scripts.length,1);new vm.Script(scripts[0][1]);
 assert(html.includes('Play again'));assert(html.includes('east-dummy'));
});
test('manifest has installable icons and a scoped standalone start URL',async()=>{
 const manifest=JSON.parse(await read('manifest.webmanifest'));assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'./');assert.equal(manifest.start_url,'./');
 for(const size of ['192x192','512x512'])assert(manifest.icons.some(i=>i.sizes===size&&i.purpose==='any'));
 assert(manifest.icons.some(i=>i.purpose==='maskable'));
 for(const icon of manifest.icons)await access(new URL(icon.src,dist));
});
test('service worker serves the whole app and download with the network unavailable',async()=>{
 const w=await worker();await w.lifecycle('install');await w.lifecycle('activate');assert.equal(await w.ready(),true);assert.equal(w.claimed,true);w.setOffline();
 assert((await (await w.fetchPath('/')).text()).includes('The Bridge Room'));
 for(const path of ['/app.js','/bid-preview.js','/completed-deal.js','/opening-leads.js','/engine.js','/gib-system.js','/session.js','/offline.js','/style.css','/mobile.css','/icons/icon-192.png','/fonts/dm-sans-400.ttf','/bridge-room-offline.html'])assert((await w.fetchPath(path)).ok,path);
 assert((await (await w.fetchPath('/?launch=home')).text()).includes('The Bridge Room'));
 assert.equal(await w.fetchPath('/unknown'),undefined);assert.equal(await w.fetchPath('/app.js','POST'),undefined);
 assert(w.requested.every(r=>r.redirect==='error'&&r.cache==='reload'));
});
test('failed offline setup is not reported ready and cleans only its incomplete cache',async()=>{
 const w=await worker({failInstall:true});w.stores.set('unrelated-cache',new Map());await assert.rejects(w.lifecycle('install'));assert.deepEqual([...w.stores.keys()],['unrelated-cache']);assert.equal(await w.ready(),false);
});
test('activation replaces old app caches and preserves other caches',async()=>{
 const w=await worker();w.stores.set('bridge-room-offline-old',new Map());w.stores.set('unrelated-cache',new Map());await w.lifecycle('install');await w.lifecycle('activate');assert(!w.stores.has('bridge-room-offline-old'));assert(w.stores.has('unrelated-cache'));assert.equal(await w.ready(),true);
});
