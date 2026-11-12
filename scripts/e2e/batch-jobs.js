/*
 * Browser check for background batch jobs: start a heavy batch, reload the page
 * mid-run, and the results still arrive (the job ran on the server).
 *
 *   TOOLS=/path/with/puppeteer-core BIG1=big1.png BIG2=big2.png \
 *   USER_EMAIL=… USER_PASSWORD=… node scripts/e2e/batch-jobs.js
 * Needs backend :8000 and frontend build :3000 (APP_URL, CHROME_PATH optional).
 */
const { createRequire } = require('module');
const req = createRequire(process.env.TOOLS + '/package.json');
const puppeteer = req('puppeteer-core');
const APP = process.env.APP_URL || 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? '  — ' + d : ''}`); };

(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  p.on('dialog', (d) => d.accept());
  try {
    await p.goto(APP + '/auth', { waitUntil: 'networkidle0' });
    await p.type('#email', process.env.USER_EMAIL); await p.type('#password', process.env.USER_PASSWORD);
    await p.click('button[type=submit]');
    await p.waitForFunction(() => location.pathname === '/app', { timeout: 20000 });
    await p.waitForFunction(() => document.querySelector('[data-op="Brightness"]'), { timeout: 20000 });
    await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Reset')?.click());
    const input = await p.$('#upload-image'); await input.uploadFile(process.env.BIG1, process.env.BIG2); await sleep(4000);
    // select just the two new images, Live off
    await p.evaluate(async () => {
      [...document.querySelectorAll('button')].find((x) => /^Gallery \(/.test(x.innerText.trim())).click();
      await new Promise((r) => setTimeout(r, 500));
      const tiles = [...document.querySelectorAll('[aria-pressed]')];
      tiles.forEach((t, i) => { const want = i >= tiles.length - 2; if ((t.getAttribute('aria-pressed') === 'true') !== want) t.click(); });
      await new Promise((r) => setTimeout(r, 300));
      document.querySelector('button[aria-label="Close gallery"]').click();
    });
    if (await p.$eval('#live-toggle', (e) => e.checked)) await p.click('#live-toggle');
    for (let i = 0; i < 2; i++) await p.evaluate(() => document.querySelector('[data-op="Non-Local Means Denoising"]').click());
    await sleep(300);
    await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim().startsWith('Apply Pipeline')).click());
    await sleep(1200);
    const jobId = await p.evaluate(() => sessionStorage.getItem('pixelflow_batch_job'));
    check('The batch runs as a server job', !!jobId);
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => /Results \(2\)/.test(document.body.innerText), { timeout: 180000 });
    check('After a reload mid-run, both results still arrive', true);
    await sleep(1000);
    check('…and the job is finished', await p.evaluate(() => !sessionStorage.getItem('pixelflow_batch_job')));
  } catch (e) {
    check('script error', false, e.message);
  }
  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exitCode = results.every(Boolean) && results.length ? 0 : 1;
})();
