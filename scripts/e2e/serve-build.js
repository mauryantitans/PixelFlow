/*
 * Tiny static server for the production build with SPA fallback (any unknown
 * path serves index.html, like the Vercel rewrite). Used by CI and local
 * browser checks:  node scripts/e2e/serve-build.js frontend/build 3000
 */
const http=require('http'),fs=require('fs'),path=require('path');
const root=process.argv[2],port=+process.argv[3]||3000;
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.svg':'image/svg+xml','.ico':'image/x-icon','.map':'application/json','.webmanifest':'application/manifest+json','.txt':'text/plain','.xml':'application/xml'};
process.on('uncaughtException',(e)=>console.error('ignored',e.message));
http.createServer((req,res)=>{
  try{
    let p=decodeURIComponent(req.url.split('?')[0]);let f=path.join(root,p);
    let st=null; try{st=fs.statSync(f)}catch{}
    if(!f.startsWith(root)||!st||st.isDirectory())f=path.join(root,'index.html');
    const s=fs.createReadStream(f);
    s.on('error',()=>{if(!res.headersSent)res.writeHead(503);res.end('rebuilding, retry')});
    s.on('open',()=>{res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});s.pipe(res)});
  }catch(e){if(!res.headersSent)res.writeHead(500);res.end()}
}).listen(port,()=>console.log('serving',root,port));
