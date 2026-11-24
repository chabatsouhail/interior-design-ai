import http from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createAuth, diskVault, ServiceError } from './auth.mjs';
import { createInference } from './inference.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const preferredPort = 43127;
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.ttf':'font/ttf',
  '.woff':'font/woff','.woff2':'font/woff2','.glb':'model/gltf-binary','.bin':'application/octet-stream','.gltf':'model/gltf+json',
  '.wasm':'application/wasm','.avif':'image/avif','.hdr':'application/octet-stream'};
const json = (res,status,data) => {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
};
const redirect = (res,loc) => {
  res.writeHead(303,{Location:loc,'Cache-Control':'no-store'}); res.end();
};
const esc = value => String(value).replace(/[<>&"']/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[char]));
function accountPage(res,status,title,paragraph,links) {
  res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'"});
  const a=links.map(([href,name])=>'<a href="'+esc(href)+'">'+esc(name)+'</a>').join('');
  res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+
    esc(title)+' · Apartment Studio</title><style>body{color:#243229;background:#f3f2e9;font:17px/1.55 system-ui;margin:0}main{max-width:32rem;margin:12vh auto;padding:2rem}p{color:#46574b}h1{font:2.3rem Georgia,serif}a{display:block;background:#31483c;color:white;text-decoration:none;padding:.75rem 1rem;margin:.6rem 0;border-radius:.5rem}small{letter-spacing:.1em}</style>'+
    '<main><small>APARTMENT STUDIO</small><h1>'+esc(title)+'</h1><p>'+esc(paragraph)+'</p>'+a+'</main></html>');
}

async function readBody(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new ServiceError(415,'Send a JSON request.');
  let length=0; const chunks=[];
  for await (const chunk of req) {
    length+=chunk.length;
    if (length>350000) throw new ServiceError(413,'This selection is too large for one request.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ServiceError(400,'This request is not valid JSON.'); }
}

function vaultPath() {
  const base=process.platform==='win32' ? process.env.LOCALAPPDATA || join(homedir(),'AppData','Local')
    : process.env.XDG_STATE_HOME || join(homedir(),'.local','state');
  return join(base,'ApartmentStudio','accounts.dat');
}

export function createStudioServer({root=join(here,'..','dist'),vault=diskVault(vaultPath()),fetcher=fetch}={}) {
  const auth=createAuth(vault,fetcher), edit=createInference(auth,fetcher);
  const sessions = new Map();
  let editing=false;
  const server=http.createServer(async(req,res)=>{
    const origin='http://127.0.0.1:'+server.address().port;
    if (req.headers.host!==new URL(origin).host || !req.url?.startsWith('/') || req.url.startsWith('//')) {
      return json(res,403,{error:'Open Apartment Studio from its local address.'});
    }
    const url=new URL(req.url,origin);
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','no-referrer');
    const cookieName='aptstudio_'+server.address().port;
    let session=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(c=>c.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    const obtainSession=()=>{
      if (session && sessions.get(session)>Date.now()) return;
      for (const [id,expires] of sessions) if (expires<=Date.now()) sessions.delete(id);
      session=randomBytes(32).toString('base64url');
      sessions.set(session,Date.now()+86400000);
      res.setHeader('Set-Cookie',cookieName+'='+session+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400');
    };
    try {
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
        const cross=req.headers['sec-fetch-site']==='cross-site' || (req.headers.origin && req.headers.origin!==origin);
        if (url.pathname !== '/auth/callback' && cross) throw new ServiceError(403,'Open the local Apartment Studio window to use this action.');
        if (req.method==='POST' && (!sessions.has(session) || req.headers.origin!==origin)) throw new ServiceError(403,'Refresh the apartment window to reconnect.');
        if (url.pathname==='/api/session' && req.method==='GET') {
          obtainSession(); return json(res,200,{...auth.status(),usageUrl:'https://chatgpt.com/settings/usage'});
        }
        if ((url.pathname==='/api/login' || url.pathname==='/auth/accounts') && req.method==='GET') {
          obtainSession();
          const status=auth.status(), choice=url.searchParams.get('account');
          if (url.pathname==='/auth/accounts' || (!choice && status.accounts.length>0)) {
            const links=status.accounts.map((a,index)=>['/api/login?account='+encodeURIComponent(a.id),(a.email||'Saved account')+' · '+(index+1)]);
            links.push(['/api/login?account=new','Use another ChatGPT account'],['/','Return to the apartment']);
            return accountPage(res,200,'Connect your ChatGPT account','Choose the account whose plan you want to use for design requests.',links);
          }
          return redirect(res,auth.login(origin,session,choice));
        }
        if (url.pathname==='/auth/callback' && req.method==='GET') {
          const state=await auth.callback(url.searchParams,session);
          if (!state.connected) return accountPage(res,200,'Plan access needs permission','Your sign-in succeeded. To make design edits, allow Apartment Studio to use your ChatGPT plan.',
            [['/api/login','Enable plan usage'],['/','Return to the apartment']]);
          return redirect(res,'/');
        }
        if (url.pathname==='/api/logout' && req.method==='POST') return json(res,200,await auth.logout());
        if (url.pathname==='/api/edit' && req.method==='POST') {
          if (editing) throw new ServiceError(409,'A design request is already in progress. Wait for it to finish.');
          const body=await readBody(req);
          if (editing) throw new ServiceError(409,'A design request is already in progress. Wait for it to finish.');
          editing=true;
          try { return json(res,200,await edit(body)); } finally { editing=false; }
        }
        throw new ServiceError(404,'Unknown local action.');
      }
      if (req.method!=='GET' && req.method!=='HEAD') throw new ServiceError(405,'Unsupported method.');
      const path=decodeURIComponent(url.pathname);
      const pieces=path.split('/').filter(Boolean);
      if (pieces.some(p=>p.startsWith('.') || /[\\:\x00-\x1f]/.test(p))) throw new ServiceError(404,'File not found.');
      if (!pieces.length) pieces.push('index.html');
      const mime=types[extname(pieces.at(-1)).toLowerCase()];
      if (!mime) throw new ServiceError(404,'File not found.');
      let full,rootPath;
      try {
        rootPath=await realpath(root); full=await realpath(join(rootPath,...pieces));
        if (!full.startsWith(rootPath+sep) || !(await stat(full)).isFile()) throw Error();
      } catch { throw new ServiceError(404,'File not found.'); }
      if (mime.startsWith('text/html')) obtainSession();
      res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache'});
      if (req.method==='HEAD') return res.end();
      createReadStream(full).on('error',()=>res.destroy()).pipe(res);
    } catch(e) {
      const known=e instanceof ServiceError;
      const message=known?e.message:(e.name==='TimeoutError' || e.name==='AbortError'?'The connection to OpenAI timed out. Try again.':'Apartment Studio could not complete this request. Check your network connection and try again.');
      const status=known?e.status:502;
      if (res.headersSent) return res.destroy();
      if (url.pathname==='/auth/callback' || url.pathname==='/api/login') return accountPage(res,status,'Couldn’t connect this account',message,[['/','Return to the apartment'],['/api/login','Continue with ChatGPT']]);
      return json(res,status,{error:message});
    }
  });
  server.requestTimeout=130000;
  server.headersTimeout=15000;
  return server;
}

function openBrowser(address) {
  const command=process.platform==='win32'?'rundll32.exe':process.platform==='darwin'?'open':'xdg-open';
  const args=process.platform==='win32'?['url.dll,FileProtocolHandler',address]:[address];
  const child=spawn(command,args,{detached:true,windowsHide:true,stdio:'ignore'});
  child.on('error',()=>console.log('Open the local address above in your browser.'));
  child.unref();
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const raw=process.argv.find(a=>a.startsWith('--port='))?.slice(7) ?? process.env.APARTMENT_PORT ?? String(preferredPort);
  const port=Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(port) || port<0 || port>65535) {
    console.error('Choose a valid local port with --port=43127.'); process.exitCode=1;
  } else {
    const server=createStudioServer();
    server.on('error',e=>{
      if(e.code==='EADDRINUSE') console.error('The local port is in use. If Apartment Studio is already open, return to its window. You can also start it with --port=43128.');
      else console.error('Could not start Apartment Studio on the local interface.');
      process.exitCode=1;
    });
    server.listen(port,'127.0.0.1',()=>{
      const address='http://127.0.0.1:'+server.address().port+'/';
      console.log('Apartment Studio is running at '+address);
      if (!process.argv.includes('--no-open')) openBrowser(address);
    });
  }
}
