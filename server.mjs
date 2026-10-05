import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
http.createServer(async(req,res)=>{try{const p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(p!==root&&!p.startsWith(root+path.sep))throw Error();const file=p===root?path.join(root,'index.html'):p;const data=await readFile(file);res.setHeader('Content-Type',({'html':'text/html','css':'text/css','js':'text/javascript','svg':'image/svg+xml','webmanifest':'application/manifest+json','png':'image/png','ttf':'font/ttf'})[file.split('.').pop()]||'application/octet-stream');res.end(data);}catch{res.statusCode=404;res.end('Not found');}}).listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
