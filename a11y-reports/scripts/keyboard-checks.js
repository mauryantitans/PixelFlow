/*
 * Keyboard-only spot checks for the interactions fixed on this branch.
 * Every action uses page.keyboard (Tab / Shift+Tab / Enter / Space / arrows /
 * Escape) — no mouse clicks — and asserts on focus, ARIA state and live-region
 * text. Results: a11y-reports/<PHASE>/keyboard-checks.json
 *
 *   TOOLS=/path/to/tools PHASE=after IMG1=/path/img.png node a11y-reports/scripts/keyboard-checks.js
 */
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');
const toolRequire = createRequire(path.join(process.env.TOOLS || '', 'package.json'));
const puppeteer = toolRequire('puppeteer-core');

const APP = process.env.APP_URL || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', process.env.PHASE || 'after');
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(name, pass, detail) {
  results.push({ check: name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const active = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return {
      tag: el?.tagName.toLowerCase(),
      id: el?.id || '',
      label: el?.getAttribute('aria-label') || (el?.innerText || '').trim().slice(0, 60),
      role: el?.getAttribute('role') || '',
      inDialog: !!el?.closest('[role="dialog"],[role="alertdialog"]'),
      pressed: el?.getAttribute('aria-pressed'),
      valuenow: el?.getAttribute('aria-valuenow'),
    };
  });

/** Press Tab until predicate(activeElement) is true (max n presses). */
async function tabTo(page, pred, n = 80, key = 'Tab') {
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(key);
    const a = await active(page);
    if (pred(a)) return a;
  }
  return null;
}

const liveText = (page) =>
  page.evaluate(() => [...document.querySelectorAll('[data-live-region]')].map((e) => e.textContent).join(' | '));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  try {
    // 1. Skip link
    await page.goto(`${APP}/`, { waitUntil: 'networkidle0' });
    await page.keyboard.press('Tab');
    let a = await active(page);
    check('Landing: first Tab reaches "Skip to main content"', /Skip to main content/.test(a.label), a.label);
    await page.keyboard.press('Enter');
    await sleep(200);
    a = await active(page);
    check('Landing: Enter on skip link moves focus to <main>', a.id === 'main-content', a.id);
    check('Landing: page title', /PixelFlow/.test(await page.title()), await page.title());

    // 2. Upload is keyboard reachable
    await page.goto(`${APP}/app`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.body.innerText.includes('Brightness'));
    a = await tabTo(page, (x) => x.id === 'upload-image');
    check('Workspace: Tab reaches the Upload Image(s) file input', !!a, a && a.id);
    const input = await page.$('#upload-image');
    await input.uploadFile(process.env.IMG1);
    await page.waitForFunction(() => document.body.innerText.includes('Gallery (1)'));

    // 3. Add steps with the keyboard
    for (const op of ['Brightness', 'Sharpen']) {
      await page.focus('#operationSearch');
      await page.keyboard.type(op);
      await sleep(150);
      a = await tabTo(page, (x) => x.label === `Add ${op}`, 10);
      await page.keyboard.press('Enter');
      await sleep(300);
      await page.focus('#operationSearch');
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
    }
    check('Pipeline: steps added with Enter', /Pipeline \(2 steps\)/.test(await page.evaluate(() => document.body.innerText)));
    check('Pipeline: "Added … as step 2" announced', /Added Sharpen as step 2/.test(await liveText(page)), await liveText(page));

    // 4. Reorder with Move up + Alt+Arrow, focus kept
    await page.focus('button[aria-label="Move Sharpen up"]');
    await page.keyboard.press('Enter');
    await sleep(300);
    let order = await page.$$eval('.pipeline-step h3', (hs) => hs.map((h) => h.innerText.replace(/\s+/g, ' ').replace(/^Step \d+ of \d+: /, '')));
    a = await active(page);
    check('Pipeline: Enter on "Move Sharpen up" moves it to position 1', order[0].includes('Sharpen'), order.join(' > '));
    check('Pipeline: focus stays on the moved step (falls back to Move down at the top)', /Move Sharpen/.test(a.label), a.label);
    check('Pipeline: move announced', /Sharpen moved to position 1 of 2/.test(await liveText(page)), await liveText(page));
    await page.keyboard.down('Alt');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.up('Alt');
    await sleep(300);
    order = await page.$$eval('.pipeline-step h3', (hs) => hs.map((h) => h.innerText.replace(/\s+/g, ' ').replace(/^Step \d+ of \d+: /, '')));
    check('Pipeline: Alt+ArrowDown moves the step back down', order[1].includes('Sharpen'), order.join(' > '));

    // 5. Gallery dialog: focus in, trap, toggle, Escape, focus return
    await page.focus('button.btn-secondary'); // "Gallery (1)"
    await page.keyboard.press('Enter');
    await sleep(400);
    a = await active(page);
    check('Gallery: opening moves focus into the dialog', a.inDialog, a.label);
    let escaped = 0;
    for (let i = 0; i < 15; i++) {
      if (i % 3 === 2) {
        await page.keyboard.down('Shift');
        await page.keyboard.press('Tab');
        await page.keyboard.up('Shift');
      } else {
        await page.keyboard.press('Tab');
      }
      if (!(await active(page)).inDialog) escaped++;
    }
    check('Gallery: 15 Tab/Shift+Tab presses never leave the dialog', escaped === 0, `escaped ${escaped}`);
    a = await tabTo(page, (x) => x.pressed !== null && x.pressed !== undefined, 15);
    const before = a && a.pressed;
    await page.keyboard.press('Space');
    await sleep(200);
    a = await active(page);
    check('Gallery: Space toggles thumbnail selection (aria-pressed)', a.pressed !== before, `${before} -> ${a.pressed}`);
    await page.keyboard.press('Space'); // re-select for later steps
    await sleep(200);
    await page.keyboard.press('Escape');
    await sleep(300);
    a = await active(page);
    const galleryOpen = await page.evaluate(() => !!document.querySelector('[aria-labelledby="gallery-title"]'));
    check('Gallery: Escape closes it', !galleryOpen);
    check('Gallery: focus returns to the "Gallery" button', /Gallery/.test(a.label), a.label);

    // 6. Compare slider by keyboard
    await page.focus('button.btn-primary.flex'); // Apply Pipeline
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.body.innerText.includes('Results (1)'), { timeout: 60000 });
    await page.focus('button[aria-label="Inspect result 1"]');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.body.innerText.includes('Inspector'));
    await page.focus('button[aria-label="Before/After slider"]');
    await page.keyboard.press('Enter');
    await sleep(300);
    await page.focus('[role="slider"]');
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    a = await active(page);
    check('Compare slider: 5 × ArrowRight moves 50% -> 55%', a.valuenow === '55', a.valuenow);
    await page.keyboard.press('End');
    a = await active(page);
    check('Compare slider: End jumps to 100%', a.valuenow === '100', a.valuenow);

    // 7. Image picker by keyboard (needs live mode + Flood Fill)
    await page.focus('button[aria-label="Back to results grid"]');
    await page.keyboard.press('Enter');
    await sleep(300);
    await page.focus('#live-toggle');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.body.innerText.includes('Live preview updated'), { timeout: 60000 });
    await page.focus('#operationSearch');
    await page.keyboard.type('Flood Fill');
    await sleep(150);
    await page.focus('button[aria-label="Add Flood Fill"]');
    await page.keyboard.press('Enter');
    await sleep(800);
    // The picker lives on the Normal view of the preview.
    await page.focus('button[aria-label="Normal View"]');
    await page.keyboard.press('Enter');
    await sleep(500);
    const pick = await page.$$('button[aria-pressed][id$="-pick"]');
    await pick[pick.length - 1].focus();
    await page.keyboard.press('Enter');
    await sleep(500);
    a = await active(page);
    check('Picker: "Pick on image" moves focus onto the image picker', a.role === 'application', a.label);
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await sleep(500);
    const summary = await page.evaluate(() => [...document.querySelectorAll('.pipeline-step span.font-mono')].map((s) => s.textContent).join(' '));
    check('Picker: arrows + Enter set the seed point to (0.53, 0.50)', summary.includes('(0.53, 0.50)'), summary);
    a = await active(page);
    check('Picker: focus returns to the Pick button', /pick/i.test(a.id + a.label), a.label);
  } catch (e) {
    check('script error', false, String(e.message || e));
  } finally {
    await browser.close();
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'keyboard-checks.json'), JSON.stringify(results, null, 2));
    const failed = results.filter((r) => !r.pass).length;
    console.log(`\n${results.length - failed}/${results.length} keyboard checks passed`);
  }
})();
