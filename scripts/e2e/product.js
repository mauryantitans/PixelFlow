/*
 * Browser checks for product/UX features: sample images, drag-and-drop upload,
 * selection + Live mode kept on reload, share-by-link (signed-out viewer opens
 * it in the workspace), and the appearance following the account.
 *
 *   TOOLS=/path/with/puppeteer-core+@axe-core/puppeteer IMG=small.png \
 *   USER_EMAIL=… USER_PASSWORD=… node scripts/e2e/product.js
 * Needs backend :8000 and frontend build :3000 (APP_URL, API_URL, CHROME_PATH optional).
 */
const { createRequire } = require('module');
const fs = require('fs');
const req = createRequire(process.env.TOOLS + '/package.json');
const puppeteer = req('puppeteer-core');
const { AxePuppeteer } = req('@axe-core/puppeteer');
const APP = process.env.APP_URL || 'http://localhost:3000';
const API = process.env.API_URL || 'http://localhost:8000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? '  — ' + d : ''}`); };

async function signIn(p) {
  await p.goto(APP + '/auth', { waitUntil: 'networkidle0' });
  await p.type('#email', process.env.USER_EMAIL);
  await p.type('#password', process.env.USER_PASSWORD);
  await p.click('button[type=submit]');
  await p.waitForFunction(() => location.pathname === '/app', { timeout: 20000 });
  await p.waitForFunction(() => document.querySelector('[data-op="Brightness"]'), { timeout: 20000 });
}
const gallery = (p) => p.evaluate(() => +((document.body.innerText.match(/Gallery \((\d+)\)/) || [])[1] || 0));
const axeOk = async (p, name, include) => {
  const a = await new AxePuppeteer(p).include(include).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  check(`axe: ${name}`, a.violations.length === 0, a.violations.map((v) => v.id + ':' + v.nodes.length).join(', ') || 'no violations');
};

(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  try {
    // ---------- signed-in user ----------
    const ctx = await b.createBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport({ width: 1440, height: 900 });
    p.on('dialog', (d) => d.accept());
    await signIn(p);

    // Sample images
    const before = await gallery(p);
    await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Try a sample').click());
    await p.waitForSelector('button[data-sample="coffee"]');
    check('"Try a sample" opens a panel with six samples', (await p.$$('button[data-sample]')).length === 6);
    await axeOk(p, 'sample images panel', '[role="dialog"]');
    check('Focus moves into the panel', await p.evaluate(() => !!document.activeElement?.dataset?.sample));
    await p.click('button[data-sample="coffee"]');
    await p.waitForFunction((n) => +((document.body.innerText.match(/Gallery \((\d+)\)/) || [])[1] || 0) > n, { timeout: 20000 }, before);
    check('Choosing a sample uploads it', (await gallery(p)) === before + 1);

    // Drag-and-drop
    const bytes = fs.readFileSync(process.env.IMG).toString('base64');
    const n1 = await gallery(p);
    await p.evaluate(async (b64) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bin], 'dropped.png', { type: 'image/png' }));
      const main = document.getElementById('main-content');
      main.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 200));
      window.__overlay = /Drop images to upload/.test(document.body.innerText);
      main.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, bytes);
    check('Dragging files over the workspace shows the drop target', await p.evaluate(() => window.__overlay));
    await p.waitForFunction((n) => +((document.body.innerText.match(/Gallery \((\d+)\)/) || [])[1] || 0) > n, { timeout: 20000 }, n1);
    check('Dropping a file uploads it', (await gallery(p)) === n1 + 1);

    // Keep only the newest image selected, turn Live on, then reload.
    await p.evaluate(async () => {
      [...document.querySelectorAll('button')].find((x) => /^Gallery \(/.test(x.innerText.trim())).click();
      await new Promise((r) => setTimeout(r, 500));
      const tiles = [...document.querySelectorAll('[aria-pressed]')];
      tiles.forEach((t, i) => { const want = i === tiles.length - 1; if ((t.getAttribute('aria-pressed') === 'true') !== want) t.click(); });
      await new Promise((r) => setTimeout(r, 300));
      document.querySelector('button[aria-label="Close gallery"]').click();
    });
    if (!(await p.$eval('#live-toggle', (e) => e.checked))) await p.click('#live-toggle');
    await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Reset')?.click());
    await p.evaluate(() => document.querySelector('[data-op="Invert"]').click());
    await p.waitForFunction(() => /Live preview updated/.test(document.body.innerText), { timeout: 30000 });
    await p.reload({ waitUntil: 'networkidle0' });
    await p.waitForFunction(() => /Live preview updated/.test(document.body.innerText), { timeout: 30000 }).catch(() => {});
    check('After a reload, Live mode is still on', await p.$eval('#live-toggle', (e) => e.checked));
    check('…with the same image selected and the preview rebuilt', /Live preview updated/.test(await p.evaluate(() => document.body.innerText)));

    // Share by link: save, create a link
    await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Save').click());
    await p.waitForSelector('#name');
    const pname = `Shared E2E ${Date.now() % 100000}`;
    await p.type('#name', pname);
    await p.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.type === 'submit').click());
    await sleep(1200);
    await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Load').click());
    await p.waitForFunction((n) => !!document.querySelector(`button[aria-label="Share ${n} by link"]`), { timeout: 15000 }, pname);
    await p.click(`button[aria-label="Share ${pname} by link"]`);
    await p.waitForFunction(() => [...document.querySelectorAll('button')].some((x) => x.innerText.trim() === 'Create link'), { timeout: 10000 });
    await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Create link').click());
    await p.waitForFunction(() => [...document.querySelectorAll('input[readonly]')].some((i) => /\/p\//.test(i.value)), { timeout: 10000 });
    const link = await p.evaluate(() => [...document.querySelectorAll('input[readonly]')].find((i) => /\/p\//.test(i.value)).value);
    check('Creating a share link shows a /p/… URL', /\/p\/[\w-]{16,}$/.test(link), link);
    await axeOk(p, 'load dialog with the share panel', '[role="dialog"]');

    // ---------- signed-out viewer ----------
    const ctx2 = await b.createBrowserContext();
    const v = await ctx2.newPage();
    await v.setViewport({ width: 1280, height: 860 });
    await v.goto(link, { waitUntil: 'networkidle0' });
    await v.waitForFunction((n) => document.body.innerText.includes(n), { timeout: 15000 }, pname);
    const vt = await v.evaluate(() => document.body.innerText);
    check('A signed-out visitor sees the shared pipeline', vt.includes(pname) && /Invert/.test(vt));
    check('…without the owner\'s email', !vt.includes(process.env.USER_EMAIL));
    await axeOk(v, 'shared pipeline page', '#main-content');
    await v.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Open in workspace/.test(x.innerText)).click());
    await v.waitForFunction(() => location.pathname === '/app', { timeout: 15000 });
    await v.waitForFunction(() => /Pipeline \(1 step/.test(document.body.innerText), { timeout: 15000 });
    check('"Open in workspace" loads the steps for the visitor', true);
    await v.goto(APP + '/p/not-a-real-token', { waitUntil: 'networkidle0' });
    await v.waitForFunction(() => /Link not found/.test(document.body.innerText), { timeout: 10000 });
    check('A bad link shows "Link not found"', true);
    await ctx2.close();

    // Stop sharing, then clean up the pipeline
    await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Stop sharing/.test(x.innerText)).click());
    await sleep(800);
    const gone = await p.evaluate(async (u) => (await fetch(u.replace(/.*\/p\//, `${location.protocol}//${location.hostname}:8000/api/pipelines/shared/`))).status, link);
    check('"Stop sharing" makes the link stop working', gone === 404, `status=${gone}`);

    // ---------- appearance follows the account ----------
    await p.keyboard.press('Escape');
    await p.click('button[aria-label="Appearance"]');
    await sleep(300);
    await p.evaluate(() => { document.querySelector('input[name="pf-ui-theme"][value="orchid"]').click(); document.querySelector('input[name="pf-ui-mode"][value="dark"]').click(); });
    await p.keyboard.press('Escape');
    await sleep(1500); // debounced save
    const ctx3 = await b.createBrowserContext();
    const q = await ctx3.newPage();
    await q.setViewport({ width: 1280, height: 860 });
    await signIn(q);
    await sleep(800);
    const applied = await q.evaluate(() => ({ t: document.documentElement.dataset.uiTheme, dark: document.documentElement.classList.contains('dark') }));
    check('Signing in on another browser applies the saved theme and mode', applied.t === 'orchid' && applied.dark, JSON.stringify(applied));
    // put the account back on Classic/light for other test runs
    await q.click('button[aria-label="Appearance"]'); await sleep(300);
    await q.evaluate(() => { document.querySelector('input[name="pf-ui-theme"][value="classic"]').click(); document.querySelector('input[name="pf-ui-mode"][value="light"]').click(); });
    await sleep(1500);
    await ctx3.close();

    // delete the test pipeline
    await p.evaluate(async (n, api) => {
      const csrf = decodeURIComponent(document.cookie.match(/pf_csrf=([^;]+)/)?.[1] || '');
      const list = await (await fetch(`${api}/api/pipelines/`, { credentials: 'include' })).json();
      for (const f of list.filter((x) => x.name === n)) await fetch(`${api}/api/pipelines/${f.id}`, { method: 'DELETE', credentials: 'include', headers: { 'X-CSRF-Token': csrf } });
    }, pname, API);
  } catch (e) {
    check('script error', false, e.message);
  }
  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
})();
