import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildSite} from './build.mjs';
export async function serveTestnet({port=4174,directory}={}) {
 const build=await buildSite(directory),root=path.resolve(build.directory);
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css; charset=utf-8','.md':'text/plain; charset=utf-8'};
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  const hosts=[`127.0.0.1:${server.address().port}`,`localhost:${server.address().port}`];
  if(!hosts.includes(req.headers.host)){res.writeHead(403);res.end('Local host required');return;}
  if(req.method!=='GET'){res.writeHead(405);res.end('Read-only static server');return;}
  try{const u=new URL(req.url,`http://${req.headers.host}`),file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
   if(!file.startsWith(root+path.sep)||!mime[path.extname(file)])throw new Error('Not allowed');
   const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]});res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve)),artifacts:build.artifacts};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const app=await serveTestnet({port:Number(process.env.LORROW_TESTNET_PORT??4174)});
 console.log(`Lorrow Sepolia interface: ${app.url}\nConnect a testnet wallet. This server stores no wallet key and starts no development chain.\n`);
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();process.exit(0);});}
