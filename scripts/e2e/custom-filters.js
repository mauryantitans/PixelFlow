/*
 * Browser checks for custom filters: the Custom Kernel editor (presets, size,
 * validation), switching a step off, saving a pipeline as a filter and adding
 * it back from Custom → My filters, and the Expression step (presets as one
 * undo step, formula errors). Also axe on the kernel editor and the formulas.
 *
 *   TOOLS=/path/with/puppeteer-core+@axe-core/puppeteer IMG=small.png \
 *   USER_EMAIL=… USER_PASSWORD=… node scripts/e2e/custom-filters.js
 * Needs backend :8000 and frontend build :3000 (APP_URL, CHROME_PATH optional).
 */
const { createRequire } = require('module');
const req = createRequire(process.env.TOOLS + '/package.json');
const puppeteer = req('puppeteer-core');
const { AxePuppeteer } = req('@axe-core/puppeteer');
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
  const text = () => p.evaluate(() => document.body.innerText);
  const filterName = `E2E filter ${Date.now() % 100000}`;
  try {
    await p.goto(APP + '/auth', { waitUntil: 'networkidle0' });
    await p.type('#email', process.env.USER_EMAIL); await p.type('#password', process.env.USER_PASSWORD);
    await p.click('button[type=submit]');
    await p.waitForFunction(() => location.pathname === '/app', { timeout: 20000 });
    await p.waitForFunction(() => document.querySelector('[data-op="Custom Kernel"]'), { timeout: 20000 });
    await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Reset')?.click());
    const input = await p.$('#upload-image'); await input.uploadFile(process.env.IMG); await sleep(2500);
    await p.evaluate(async () => {
      [...document.querySelectorAll('button')].find((x) => /^Gallery \(/.test(x.innerText.trim())).click();
      await new Promise((r) => setTimeout(r, 500));
      const tiles = [...document.querySelectorAll('[aria-pressed]')];
      tiles.forEach((t, i) => { const want = i === tiles.length - 1; if ((t.getAttribute('aria-pressed') === 'true') !== want) t.click(); });
      await new Promise((r) => setTimeout(r, 300));
      document.querySelector('button[aria-label="Close gallery"]').click();
    });
    if (!(await p.$eval('#live-toggle', (e) => e.checked))) await p.click('#live-toggle');
    await sleep(300);

    // The Custom library starts collapsed, like the other libraries; open it.
    await p.evaluate(() => {
      let el = document.querySelector('[data-op="Custom Kernel"]');
      while (el) { if (el.tagName === 'DETAILS') el.open = true; el = el.parentElement; }
    });
    await sleep(300);
    check('Custom section lists Custom Kernel and My filters', /My filters/.test(await text()) && !!(await p.$('[data-op="Custom Kernel"]')));
    check('The hidden Custom Filter step is not in the palette', !(await p.$('[data-op="Custom Filter"]')));

    await p.click('[data-op="Custom Kernel"]');
    await p.waitForFunction(() => /Live preview updated/.test(document.body.innerText), { timeout: 30000 });
    const cells = () => p.$$eval('input[aria-label*="kernel, row"]', (els) => els.length);
    check('Kernel editor shows a 3×3 grid of named inputs', (await cells()) === 9);
    check('Cells have names like "row 2, column 2 (centre)"', !!(await p.$('input[aria-label$="row 2, column 2 (centre)"]')));

    // preset
    await p.evaluate(() => {
      const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => /Edge detect/.test(o.text)));
      sel.value = [...sel.options].find((o) => /Edge detect/.test(o.text)).value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(300);
    const centre = await p.$eval('input[aria-label$="row 2, column 2 (centre)"]', (e) => e.value);
    check('Choosing the "Edge detect" preset fills the grid', centre === '8', `centre=${centre}`);
    check('The sum of weights is shown', /Sum of weights:\s*0/.test(await text()));

    // size
    await p.evaluate(() => {
      const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.text === '5×5'));
      sel.value = '5'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(300);
    check('Changing size to 5×5 gives 25 cells, keeping the centre', (await cells()) === 25 && (await p.$eval('input[aria-label$="row 3, column 3 (centre)"]', (e) => e.value)) === '8');

    // validation
    const cell = await p.$('input[aria-label$="row 1, column 1"]');
    await cell.click({ clickCount: 3 }); await cell.type('999'); await sleep(300);
    check('An out-of-range value shows an error', /use a value between -100 and 100/.test(await text()));
    await cell.click({ clickCount: 3 }); await cell.type('0'); await sleep(300);
    check('…and fixing it clears the error', !/use a value between/.test(await text()));
    await p.waitForFunction(() => /Live preview updated/.test(document.body.innerText), { timeout: 30000 });

    for (const mode of ['light', 'dark']) {
      await p.evaluate((m) => document.documentElement.classList.toggle('dark', m === 'dark'), mode);
      await sleep(200);
      await p.waitForFunction(() => document.getAnimations().every((an) => an.playState !== 'running'), { timeout: 5000 }).catch(() => {});
      const axe = await new AxePuppeteer(p).include('#main-content').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      check(`axe: workspace with the kernel editor (${mode})`, axe.violations.length === 0, axe.violations.map((v) => v.id + ':' + v.nodes.length).join(', ') || 'no violations');
    }
    await p.evaluate(() => document.documentElement.classList.remove('dark'));

    // switch the step off and on
    await p.click('button[aria-label="Turn off Custom Kernel step"]'); await sleep(1500);
    check('A step can be switched off', /\bOff\b/i.test(await text()) && !!(await p.$('button[aria-label="Turn on Custom Kernel step"]')));
    await p.click('button[aria-label="Turn on Custom Kernel step"]'); await sleep(800);

    // save as a filter
    await p.evaluate(() => document.querySelector('[data-op="Grayscale"]').click());
    await sleep(500);
    await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Save').click());
    await p.waitForSelector('#save-as-filter');
    await p.type('input#name, input[name="name"], #pipeline-name', filterName).catch(async () => {
      const first = await p.$('[role="dialog"] input[type="text"]'); await first.type(filterName);
    });
    await p.click('#save-as-filter');
    await p.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find((x) => /^Save/.test(x.innerText.trim()) && x.type === 'submit').click());
    await p.waitForFunction((n) => !!document.querySelector(`[data-filter="${n}"]`), { timeout: 15000 }, filterName);
    check('Saved filter appears under My filters', true);

    await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Reset')?.click());
    await sleep(400);
    await p.click(`[data-filter="${filterName}"]`);
    await p.waitForFunction(() => /Live preview updated/.test(document.body.innerText), { timeout: 30000 });
    const t = await text();
    check('Adding it inserts one step named after the filter', new RegExp(`Pipeline \\(1 step`).test(t) && t.includes(filterName));
    check('The step lists the saved steps', /Custom Kernel/.test(t) && /Grayscale/.test(t));
    check('No step error', !(await p.$('[role="alert"].mt-2')));

    // clean up the saved filter
    await p.evaluate(async (n) => {
      const csrf = document.cookie.match(/pf_csrf=([^;]+)/)?.[1];
      const list = await (await fetch('http://localhost:8000/api/pipelines/', { credentials: 'include' })).json().catch(() => []);
      for (const f of list.filter ? list.filter((x) => x.name === n) : []) await fetch(`http://localhost:8000/api/pipelines/${f.id}`, { method: 'DELETE', credentials: 'include', headers: { 'X-CSRF-Token': decodeURIComponent(csrf || '') } });
    }, filterName);

    // Expression: presets, one undo step, formula errors
    await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Reset')?.click());
    await sleep(400);
    await p.click('[data-op="Expression"]');
    await p.waitForFunction(() => /Live preview updated/.test(document.body.innerText), { timeout: 30000 });
    const field = (c) => p.$eval(`input[id$="-${c}"]`, (e) => e.value);
    check('Expression step has monospace formula fields with defaults', (await field('red')) === 'r' && (await p.$eval('input[id$="-red"]', (e) => e.classList.contains('font-mono') && e.spellcheck === false)));
    await p.evaluate(() => {
      const sel = document.querySelector('select[id$="-preset"]');
      sel.value = [...sel.options].find((o) => o.text === 'Invert').value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(300);
    check('The "Invert" preset fills all three formulas', (await field('red')) === '1 - r' && (await field('blue')) === '1 - b');
    await p.waitForFunction(() => /Live preview updated/.test(document.body.innerText), { timeout: 30000 });
    check('…and the preview runs without a step error', !(await p.$('[role="alert"].mt-2')));
    await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Undo')?.click());
    await sleep(300);
    check('One Undo reverts the whole preset', (await field('red')) === 'r' && (await field('blue')) === 'b');
    await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Redo')?.click());
    await sleep(300);
    const red = await p.$('input[id$="-red"]');
    await red.click({ clickCount: 3 }); await red.type('r.real');
    await p.waitForFunction(() => /red formula: can't use attribute access/.test(document.body.innerText), { timeout: 30000 }).catch(() => {});
    check('An unsafe formula shows a per-step error', /red formula: can't use attribute access/.test(await text()));
    await red.click({ clickCount: 3 }); await red.type('0.3*r + 0.59*g + 0.11*b');
    await p.waitForFunction(() => !/red formula:/.test(document.body.innerText), { timeout: 30000 }).catch(() => {});
    check('…and a valid formula clears it', !/red formula:/.test(await text()));
    await p.evaluate(() => { const d = document.querySelector('details:has(> p[id$="-code-help"])'); if (d) d.open = true; });
    check('The formula reference lists the variables', /Variables: r, g, b, l \(luma\)/.test(await text()));
    for (const mode of ['light', 'dark']) {
      await p.evaluate((m) => document.documentElement.classList.toggle('dark', m === 'dark'), mode);
      await sleep(200);
      await p.waitForFunction(() => document.getAnimations().every((an) => an.playState !== 'running'), { timeout: 5000 }).catch(() => {});
      const axe = await new AxePuppeteer(p).include('#main-content').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      check(`axe: workspace with the Expression step (${mode})`, axe.violations.length === 0, axe.violations.map((v) => v.id + ':' + v.nodes.length).join(', ') || 'no violations');
    }
    await p.evaluate(() => document.documentElement.classList.remove('dark'));
  } catch (e) {
    check('script error', false, e.message);
  }
  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exitCode = results.every(Boolean) && results.length ? 0 : 1;
})();
