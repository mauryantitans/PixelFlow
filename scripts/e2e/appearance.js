/*
 * Browser checks for the appearance picker: keyboard use, saving, no flash on reload,
 * typeface, axe on the open panel (light + dark), 320px fit.
 *
 *   TOOLS=/path/with/puppeteer-core+@axe-core/puppeteer node scripts/e2e/appearance.js
 * Needs the frontend on :3000 (APP_URL, CHROME_PATH optional).
 */
const { createRequire } = require('module');
const req = createRequire(process.env.TOOLS + '/package.json');
const puppeteer = req('puppeteer-core');
const { AxePuppeteer } = req('@axe-core/puppeteer');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const check = (n, ok, d) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? '  — ' + d : ''}`); };
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 860 });
  await p.goto((process.env.APP_URL || 'http://localhost:3000') + '/', { waitUntil: 'networkidle0' });
  await p.evaluate(() => { localStorage.removeItem('pixelflow_ui_theme'); localStorage.setItem('pixelflow_theme', 'light'); });
  await p.reload({ waitUntil: 'networkidle0' });
  check('Default theme is Classic', await p.evaluate(() => document.documentElement.dataset.uiTheme) === 'classic');
  await p.focus('button[aria-label="Appearance"]'); await p.keyboard.press('Enter'); await sleep(300);
  check('Enter opens the panel (aria-expanded)', await p.$eval('button[aria-label="Appearance"]', (b) => b.getAttribute('aria-expanded')) === 'true');
  check('Focus moves to the selected theme', await p.evaluate(() => document.activeElement?.name === 'pf-ui-theme' && document.activeElement.value === 'classic'));
  await p.keyboard.press('ArrowDown'); await sleep(400);
  check('Arrow key selects the next theme and applies it', await p.evaluate(() => document.documentElement.dataset.uiTheme) === 'spectrum');
  check('Choice is saved', await p.evaluate(() => localStorage.getItem('pixelflow_ui_theme')) === 'spectrum');
  for (const mode of ['light', 'dark']) {
    if (mode === 'dark') { await p.evaluate(() => document.querySelector('input[name="pf-ui-mode"][value="dark"]').click()); await sleep(400); }
    const axe = await new AxePuppeteer(p).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    check(`axe: open picker, ${mode}`, axe.violations.length === 0, axe.violations.map((v) => v.id + ':' + v.nodes.length).join(', ') || 'no violations');
  }
  check('Dark mode applied from the picker', await p.evaluate(() => document.documentElement.classList.contains('dark')));
  await p.keyboard.press('Escape'); await sleep(200);
  check('Escape closes and returns focus to the button', await p.evaluate(() => !document.querySelector('[role="dialog"]') && document.activeElement?.getAttribute('aria-label') === 'Appearance'));
  await p.reload({ waitUntil: 'domcontentloaded' });
  check('Theme survives a reload (applied before render)', await p.evaluate(() => document.documentElement.dataset.uiTheme === 'spectrum' && getComputedStyle(document.documentElement).getPropertyValue('--c-blue-600').trim() !== ''));
  const fam = await p.evaluate(async () => { await document.fonts.ready; return getComputedStyle(document.body).fontFamily; });
  check('Theme typeface applied', /Geist/.test(fam), fam.slice(0, 40));
  // 320px: panel fits the screen
  await p.setViewport({ width: 320, height: 640 }); await p.reload({ waitUntil: 'networkidle0' });
  await p.click('button[aria-label="Appearance"]'); await sleep(300);
  const box = await p.$eval('[role="dialog"]', (d) => { const r = d.getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth, ov: document.documentElement.scrollWidth - innerWidth }; });
  check('320px: panel fits, no horizontal scroll', box.l >= 0 && box.r <= box.w && box.ov <= 0, JSON.stringify(box));
  await p.evaluate(() => localStorage.removeItem('pixelflow_ui_theme'));
  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
})();
