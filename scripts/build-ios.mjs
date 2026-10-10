import {build} from 'esbuild';
import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'native/ios/BridgeRoom/Web');
const sources=new Map();
for(const dir of ['dist','native/shared','native/web']){
 for(const name of await readdir(path.join(root,dir)))if(name.endsWith('.js')&&name!=='sw.js'){
  const key=path.posix.join(dir,name);sources.set(key,await readFile(path.join(root,key),'utf8'));
 }
}
const bundle=await build({entryPoints:['native/web/nearby.js'],absWorkingDir:tmpdir(),tsconfigRaw:{},bundle:true,write:false,format:'iife',target:'safari16',minify:true,legalComments:'inline',plugins:[{name:'bundled-native-game',setup(builder){
 builder.onResolve({filter:/.*/},args=>({path:path.posix.normalize(path.posix.join(args.importer?path.posix.dirname(args.importer):'',args.path)),namespace:'bridge'}));
 builder.onLoad({filter:/.*/,namespace:'bridge'},args=>{
  if(!sources.has(args.path))throw Error('Missing local module: '+args.path);
  return {contents:sources.get(args.path),loader:'js'};
 });
}}]});
await mkdir(output,{recursive:true});
await writeFile(path.join(output,'nearby.js'),bundle.outputFiles[0].text);
for(const name of ['nearby.html','nearby.css'])await copyFile(path.join(root,'native/web',name),path.join(output,name));
// The existing offline build contains all game code, fonts, styles and licenses.
await copyFile(path.join(root,'dist/bridge-room-offline.html'),path.join(output,'solo.html'));
console.log('Bundled native iOS solo and nearby games. No runtime downloads are required.');
