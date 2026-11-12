/*
 * End-to-end check of sign-in, token refresh and browser sessions on a
 * "shared computer" (one browser, several people). Needs the stack running
 * (backend :8000, frontend build :3000) and two registered test accounts.
 *
 *   TOOLS=/path/with/puppeteer-core IMG1=a.png IMG2=b.png \
 *   A_EMAIL=… A_PASSWORD=… B_EMAIL=… B_PASSWORD=… node scripts/e2e/session-flow.js
 *
 * Optional: APP_URL (default http://localhost:3000), API_URL (default
 * http://localhost:8000), CHROME_PATH.
 */
const {createRequire}=require('module');const r=createRequire(process.env.TOOLS+'/package.json');const p=r('puppeteer-core');
const APP=process.env.APP_URL||'http://localhost:3000', API=process.env.API_URL||'http://localhost:8000';const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results=[];const check=(n,ok,d)=>{results.push(ok);console.log(`${ok?'PASS':'FAIL'}  ${n}${d!==undefined?'  — '+d:''}`)};
(async()=>{const b=await p.launch({executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium',args:['--no-sandbox']});const pg=await b.newPage();await pg.setViewport({width:1440,height:900});
pg.on('dialog',d=>d.accept());const reqs=[];pg.on('request',q=>reqs.push(q.url()));
const sid=()=>pg.evaluate(()=>localStorage.getItem('pixelflow_session_id'));
const galleryCount=async()=>{await sleep(1500);return pg.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^Gallery \(\d+\)/.test(x.innerText.trim()));return b?+b.innerText.match(/\d+/)[0]:0})};
const login=async(e,pw)=>{await pg.goto(APP+'/auth',{waitUntil:'domcontentloaded'});await pg.waitForSelector('#email');await pg.type('#email',e);await pg.type('#password',pw);await pg.click('button[type=submit]');await pg.waitForFunction(()=>location.pathname==='/app',{timeout:20000});await pg.waitForFunction(()=>document.body.innerText.includes('Brightness'));};
const logout=async()=>{await pg.click('button[aria-controls="account-menu"]');await sleep(300);await pg.evaluate(()=>[...document.querySelectorAll('[role=menuitem]')].find(x=>/Logout/.test(x.innerText)).click());await pg.waitForFunction(()=>location.pathname==='/',{timeout:10000});await sleep(500)};
const upload=async(f)=>{const i=await pg.$('#upload-image');await i.uploadFile(f);await sleep(2500)};
try{
 await login(process.env.A_EMAIL,process.env.A_PASSWORD);
 const conn=await pg.evaluate(()=>document.querySelector('[data-connection-state]')?.getAttribute('data-connection-state'));
 check('Connection badge shows connected', conn==='connected', conn);
 await upload(process.env.IMG1); const SA=await sid();
 check('A uploads an image', await galleryCount()===1);
 // simulate the 30-min expiry: the browser drops pf_access; tokens look old
 const cookies=await pg.cookies(API);await pg.deleteCookie(...cookies.filter(c=>c.name==='pf_access'));
 await pg.evaluate(()=>localStorage.setItem('pixelflow_last_token_refresh','0'));
 reqs.length=0; await pg.reload({waitUntil:'domcontentloaded'});await pg.waitForFunction(()=>document.body.innerText.includes('Brightness'));
 check('After access-token expiry, reload still shows A\'s gallery', await galleryCount()===1);
 check('…because the tokens were refreshed first', reqs.some(u=>u.includes('/auth/refresh')));
 check('…and A kept the same session', (await sid())===SA);
 await logout(); await pg.goto(APP+'/app',{waitUntil:'domcontentloaded'});await pg.waitForFunction(()=>document.body.innerText.includes('Brightness'));
 const SG=await sid();
 check('Signing out starts a new guest session', SG!==SA);
 check('Guest does not see A\'s images', await galleryCount()===0);
 await upload(process.env.IMG2);
 check('Guest can upload (no "belongs to another account" error)', await galleryCount()===1);
 await login(process.env.B_EMAIL,process.env.B_PASSWORD);
 check('B signing in keeps the guest work (guest session carries over)', (await sid())===SG && await galleryCount()===1);
 await logout();
 await login(process.env.A_EMAIL,process.env.A_PASSWORD);
 check('A signing back in gets A\'s session back', (await sid())===SA);
 check('…with A\'s image', await galleryCount()===1);
}catch(e){check('script error',false,e.message)}
await b.close();console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exitCode = results.every(Boolean) && results.length ? 0 : 1;})();
