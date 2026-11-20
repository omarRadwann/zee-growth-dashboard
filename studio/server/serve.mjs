import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { createHttp } from './http.mjs';
import { readConfig } from './config.mjs';

const dist=resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const headers={
  'Cache-Control':'private, no-store',
  'X-Robots-Tag':'noindex, nofollow',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};
const port=Number(process.env.PORT||4173);
const mounted=process.env.ZEE_HTTPS_ORIGIN;
const password=process.env.ZEE_GATE_PASSWORD;
const mount = mounted ? new URL(mounted) : null;
if ((mount||password)&&(!mount||mount.protocol!=='https:'||mount.pathname!=='/'||mount.search||mount.hash||mount.username||mount.password||!password||password.length<24)) {
  console.error('Private hosting requires a plain HTTPS origin and a gate password of at least 24 characters.');
  process.exit(1);
}
if(!existsSync(resolve(dist,'index.html'))) {console.error('Run npm run build before starting the dashboard.');process.exit(1);}
const reporting=createHttp(readConfig(),{local:true});
const expected=mount ? Buffer.from('Basic '+Buffer.from('zee:'+password).toString('base64')) : null;
const allowed=new Set([`127.0.0.1:${port}`,`localhost:${port}`,...(mount?[mount.host]:[])]);
function reject(res,status,extra={}) {res.writeHead(status,{...headers,...extra});res.end();}
const extensions={js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',svg:'image/svg+xml',html:'text/html; charset=utf-8'};
const server=createServer(async(req,res)=>{
  try{
    if(!allowed.has(req.headers.host))return reject(res,421);
    // The external TLS proxy must preserve Host. The app is never bound off loopback.
    if(expected){
      const incoming=Buffer.from(req.headers.authorization??'');
      if(incoming.length!==expected.length||!timingSafeEqual(incoming,expected)) return reject(res,401,{'WWW-Authenticate':'Basic realm="ZEE Analytics Studio", charset="UTF-8"'});
    }
    if(!['GET','HEAD'].includes(req.method))return reject(res,405,{Allow:'GET, HEAD'});
    if(!req.url?.startsWith('/')||req.url.startsWith('//'))return reject(res,400);
    const url=new URL(req.url,`http://127.0.0.1:${port}`);
    if(url.pathname.startsWith('/api/')){
      if(req.method!=='GET')return reject(res,405,{Allow:'GET'});
      const cleanHeaders = new Headers();
      if(req.headers['sec-fetch-site']) cleanHeaders.set('sec-fetch-site',req.headers['sec-fetch-site']);
      const upstream=await reporting(new Request(url,{headers:cleanHeaders}));
      res.writeHead(upstream.status,{...headers,...Object.fromEntries(upstream.headers)});
      if(upstream.body)Readable.fromWeb(upstream.body).pipe(res);else res.end();
      return;
    }
    if(url.pathname!=='/'&&url.pathname!=='/index.html'&&url.pathname!=='/favicon.svg'&&!/^\/assets\/[A-Za-z0-9_\-]+\.(css|js)$/.test(url.pathname))return reject(res,404);
    const path=resolve(dist,'.'+(url.pathname==='/'?'/index.html':url.pathname));
    if(!path.startsWith(dist+sep)||!existsSync(path)||!statSync(path).isFile())return reject(res,404);
    res.writeHead(200,{...headers,'Content-Type':extensions[path.split('.').at(-1)]??'application/octet-stream'});
    if(req.method==='HEAD')res.end();else createReadStream(path).on('error',()=>res.destroy()).pipe(res);
  }catch{if(!res.headersSent)reject(res,500);else res.destroy();}
});
server.requestTimeout=30_000;
server.listen(port,'127.0.0.1',()=>console.log(`ZEE Analytics Studio | http://127.0.0.1:${port}/ | ${mount?'private gateway enabled':'local only'}`));
