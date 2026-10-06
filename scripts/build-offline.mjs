import {build} from 'esbuild';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=name=>readFile(path.join(dist,name),'utf8');
const sources=new Map();
for(const name of await readdir(dist))if(name.endsWith('.js')&&name!=='sw.js')sources.set(name,await read(name));
const bundle=await build({entryPoints:['app.js'],absWorkingDir:tmpdir(),tsconfigRaw:{},bundle:true,write:false,format:'iife',target:'es2022',minify:true,legalComments:'inline',plugins:[{name:'local-game-modules',setup(builder){
 builder.onResolve({filter:/.*/},args=>({path:path.posix.normalize(path.posix.join(path.posix.dirname(args.importer||'app.js'),args.path)),namespace:'game'}));
 builder.onLoad({filter:/.*/,namespace:'game'},args=>{if(!sources.has(args.path))throw Error('Missing game module: '+args.path);return {contents:sources.get(args.path),loader:'js'};});
}}]});
let css=(await read('style.css'))+'\n'+await read('mobile.css');
for(const match of [...css.matchAll(/url\(['"]?(fonts\/[^)'"\s]+)['"]?\)/g)]){
 const bytes=await readFile(path.join(dist,match[1]));
 css=css.replaceAll(match[0],`url(data:font/ttf;base64,${bytes.toString('base64')})`);
}
const licenses=(await read('fonts/DM-Sans-OFL.txt'))+'\n'+await read('fonts/Libre-Caslon-Display-OFL.txt');
let html=await read('index.html');
html=html.replace('<html lang="en">','<html lang="en" data-offline-bundle>')
 .replace(/<link[^>]+(?:rel="manifest"|rel="apple-touch-icon")[^>]*>/g,'')
 .replace('<link rel="stylesheet" href="style.css"><link rel="stylesheet" href="mobile.css">',()=>`<style>${css.replaceAll('</style','<\\/style')}</style>`)
 .replace('<a class="brand" href="./">','<a class="brand" href="#">')
 .replace('<script type="module" src="app.js"></script>',()=>`<script>${bundle.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`)
 .replace('</body>',()=>`<template id="font-licenses">${licenses.replaceAll('&','&amp;').replaceAll('<','&lt;')}</template></body>`);
await writeFile(path.join(dist,'bridge-room-offline.html'),html);
async function files(dir=''){
 const entries=await readdir(path.join(dist,dir),{withFileTypes:true});
 const result=[];
 for(const e of entries){const name=path.posix.join(dir,e.name);if(e.isDirectory())result.push(...await files(name));else if(!e.name.startsWith('.')&&name!=='sw.js')result.push(name);}
 return result.sort();
}
const template=await readFile(path.join(root,'scripts/sw-template.js'),'utf8');
const assets=await files(),hash=createHash('sha256').update(template);
for(const name of assets){hash.update(name);hash.update(await readFile(path.join(dist,name)));}
const version=hash.digest('hex').slice(0,16);
// Sites serves HTML at canonical extensionless URLs and redirects /index.html to /.
// Cache those final URLs directly; redirect:'error' must still reject sign-in redirects.
const cachePaths=['./',...assets.filter(name=>name!=='index.html').map(name=>name.replace(/\.html$/,''))];
await writeFile(path.join(dist,'sw.js'),template.replace('__CACHE_NAME__',JSON.stringify('bridge-room-offline-'+version)).replace('__ASSETS__',JSON.stringify(cachePaths)));
console.log(`Offline HTML: ${Math.round(Buffer.byteLength(html)/1024)} KB; ${cachePaths.length} cached resources; version ${version}.`);
