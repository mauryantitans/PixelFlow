/*
 * Browser checks for workspace workflows fixed after the bug hunt:
 * partial uploads, TIFF previews, live preview reset, Stop-then-Apply,
 * "Preview this step", picking on the step's input, pipeline kept on reload.
 *
 *   TOOLS=/path/with/puppeteer-core IMG=small.png BIG1=big1.png BIG2=big2.png \
 *   TIFF=img.tif BAD=img.gif node scripts/e2e/workflows.js
 * Needs backend :8000 and frontend build :3000 (APP_URL, CHROME_PATH optional).
 */
const { createRequire } = require('module');
const req = createRequire(process.env.TOOLS + '/package.json');
const puppeteer = req('puppeteer-core');
const APP = process.env.APP_URL || 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  — ' + detail : ''}`);
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('dialog', (d) => d.accept());
  const text = () => page.evaluate(() => document.body.innerText);
  const gallery = () =>
    page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /^Gallery \(\d+\)/.test(x.innerText.trim()));
      return b ? +b.innerText.match(/\d+/)[0] : 0;
    });
  const open = async () => {
    await page.goto(APP + '/app', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.includes('Brightness'));
    await sleep(800);
  };
  const upload = async (...files) => {
    const input = await page.$('#upload-image');
    await input.uploadFile(...files);
    await sleep(3000);
  };
  const addOp = (op) => page.evaluate((o) => document.querySelector(`[data-op="${o}"]`).click(), op);
  const clickText = (t) =>
    page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.innerText.trim().startsWith(t)).click(), t);
  const setSelection = (n) =>
    page.evaluate(async (n) => {
      // keep only the first n gallery images selected
      [...document.querySelectorAll('button')].find((x) => /^Gallery \(\d+\)/.test(x.innerText.trim())).click();
      await new Promise((r) => setTimeout(r, 400));
      [...document.querySelectorAll('[aria-pressed]')].forEach((b, i) => {
        const want = i < n;
        if ((b.getAttribute('aria-pressed') === 'true') !== want) b.click();
      });
      await new Promise((r) => setTimeout(r, 300));
      document.querySelector('button[aria-label="Close gallery"]').click();
    }, n);

  try {
    // fresh guest
    const ctx = await browser.createBrowserContext();
    const p2 = await ctx.newPage();
    await p2.close();
    await open();

    // 1. partial upload: one valid + one unsupported file
    await upload(process.env.IMG, process.env.BAD);
    check('One bad file no longer hides the good one', (await gallery()) === 1, `gallery=${await gallery()}`);
    check('…and the user is told which file failed', /1 of 2 image\(s\) uploaded/.test(await text()));

    // 2. TIFF: preview comes from the server copy (browsers can't show TIFF)
    await upload(process.env.TIFF);
    await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^Gallery \(\d+\)/.test(x.innerText.trim())).click());
    await sleep(500);
    await page.evaluate(() => [...document.querySelectorAll('button[aria-label^="View full size"]')].pop().click());
    await sleep(800);
    const tiffOk = await page.evaluate(() => {
      const img = document.querySelector('.zoomable-image');
      return !!img && img.naturalWidth > 0 && !img.src.startsWith('data:image/tiff');
    });
    check('TIFF upload shows a full-size preview', tiffOk);
    await page.keyboard.press('Escape');
    await sleep(200);
    await page.keyboard.press('Escape');
    await sleep(300);

    // 3. live preview resets when the last step is removed
    await setSelection(1);
    await page.click('#live-toggle');
    await sleep(500);
    await addOp('Invert');
    await page.waitForFunction(() => document.body.innerText.includes('Live preview updated'), { timeout: 30000 });
    await page.click('button[aria-label^="Remove Invert"]');
    await sleep(1200);
    const reset = await page.evaluate(() => {
      const shown = document.querySelector('img[alt="Final Result"], img[alt^="Step"]');
      return { hasTiming: /\d+ms$/m.test(document.body.innerText), src: shown?.src?.slice(0, 30) };
    });
    check('Removing the last step clears the stale result and timing', !reset.hasTiming, JSON.stringify(reset));

    // 4. "Preview this step" selects the step in the Inspector
    await addOp('Grayscale');
    await addOp('Invert');
    await page.waitForFunction(() => document.body.innerText.includes('Live preview updated'), { timeout: 30000 });
    await page.click('button[aria-label="Preview Grayscale step"]');
    await sleep(600);
    check('Eye button shows that step in the Inspector', /Step 1 of 2/.test(await text()));

    // 5. picking a point shows the step's input image
    await addOp('Flood Fill');
    await sleep(1500);
    const pick = await page.$$('button[aria-pressed][id$="-pick"]');
    await pick[pick.length - 1].click();
    await sleep(600);
    check('Picker shows the input of the step being edited', /Picking on the input of step 3/.test(await text()));
    await page.keyboard.press('Escape');

    // 6. pipeline survives a reload
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.includes('Brightness'));
    await sleep(800);
    check('Pipeline is kept after a reload', /Pipeline \(3 steps\)/.test(await text()));

    // 7. Stop then Apply runs only the new batch
    await page.click('button[aria-label="Remove Flood Fill step"]').catch(() => {});
    await sleep(300);
    await upload(process.env.BIG1, process.env.BIG2);
    await setSelection(99);
    if (await page.$eval('#live-toggle', (el) => el.checked)) await page.click('#live-toggle');
    await sleep(300);
    for (let i = 0; i < 3; i++) await addOp('Non-Local Means Denoising');
    await sleep(300);
    const selected = await page.evaluate(async () => {
      [...document.querySelectorAll('button')].find((x) => /^Gallery \(\d+\)/.test(x.innerText.trim())).click();
      await new Promise((r) => setTimeout(r, 400));
      const n = document.querySelectorAll('[aria-pressed="true"]').length;
      document.querySelector('button[aria-label="Close gallery"]').click();
      return String(n);
    });
    await clickText('Apply Pipeline');
    await sleep(700);
    await clickText('Stop');
    await sleep(300);
    await clickText('Apply Pipeline');
    await page.waitForFunction(() => /Successfully processed|No images were processed/.test(document.body.innerText), { timeout: 180000 });
    await sleep(4000); // give a stale loop time to (wrongly) add results
    const count = await page.evaluate(() => +((document.body.innerText.match(/Results \((\d+)\)/) || [])[1] || 0));
    const status = await page.evaluate(() => (document.body.innerText.match(/Successfully processed[^\n]*/) || [''])[0]);
    check('Stop then Apply shows one result per image', String(count) === selected, `results=${count}, images=${selected}; ${status}`);
  } catch (e) {
    check('script error', false, e.message);
  }
  await browser.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exitCode = results.every(Boolean) && results.length ? 0 : 1;
})();
