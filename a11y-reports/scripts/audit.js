/*
 * PixelFlow accessibility audit driver.
 *
 * Drives the running app (frontend on :3000, backend on :8000) through every
 * page and modal state with puppeteer-core, and for each state records:
 *   - a Lighthouse accessibility score (navigation mode for real routes,
 *     snapshot mode for in-page states such as open dialogs)
 *   - axe-core results (WCAG 2.0/2.1 A + AA rules) in light and dark theme
 *   - a keyboard walk: Tab through the page, note whether each focused element
 *     shows a visible focus indicator and (for dialogs) whether focus stays inside
 *
 * Usage (tools installed outside the repo, see REPORT.md):
 *   TOOLS=/path/to/tools PHASE=before node a11y-reports/scripts/audit.js
 * Env: CHROME_PATH, APP_URL (default http://localhost:3000), IMG1, IMG2,
 *      USER_EMAIL/USER_PASSWORD, ADMIN_EMAIL/ADMIN_PASSWORD (local test accounts).
 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { createRequire } = require('module');

const TOOLS = process.env.TOOLS || '';
const toolRequire = createRequire(path.join(TOOLS, 'package.json'));
const puppeteer = toolRequire('puppeteer-core');
const { AxePuppeteer } = toolRequire('@axe-core/puppeteer');

const PHASE = process.env.PHASE || 'before';
const APP = process.env.APP_URL || 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';
const OUT = path.join(__dirname, '..', PHASE);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
// Viewport, e.g. VIEWPORT=320x640 for the WCAG 1.4.10 Reflow run (default desktop).
const [VW, VH] = (process.env.VIEWPORT || '1440x900').split('x').map(Number);
const MOBILE = VW < 768;

for (const d of ['lighthouse', 'axe', 'keyboard', 'layout', ...(MOBILE ? ['screenshots'] : [])]) fs.mkdirSync(path.join(OUT, d), { recursive: true });

/** Keep violations/incomplete in full; trim data: URIs and reduce passes/inapplicable to id + count. */
function compactAxe(r) {
  const trim = (str) => (typeof str === 'string' ? str.replace(/data:[^"' )]{60,}/g, (m) => m.slice(0, 40) + '...[data-uri trimmed]') : str);
  const fixNodes = (rules) =>
    rules.map((v) => ({ ...v, nodes: v.nodes.map((n) => ({ ...n, html: trim(n.html),
      any: n.any.map((c) => ({ ...c, relatedNodes: (c.relatedNodes || []).map((x) => ({ ...x, html: trim(x.html) })) })),
      all: n.all.map((c) => ({ ...c, relatedNodes: (c.relatedNodes || []).map((x) => ({ ...x, html: trim(x.html) })) })),
      none: n.none.map((c) => ({ ...c, relatedNodes: (c.relatedNodes || []).map((x) => ({ ...x, html: trim(x.html) })) })) })) }));
  return {
    ...r,
    violations: fixNodes(r.violations),
    incomplete: fixNodes(r.incomplete),
    passes: r.passes.map((v) => ({ id: v.id, impact: v.impact, tags: v.tags, nodeCount: v.nodes.length })),
    inapplicable: r.inapplicable.map((v) => v.id),
  };
}

if (process.env.COMPACT_ONLY) {
  for (const f of fs.readdirSync(path.join(OUT, 'axe'))) {
    const fp = path.join(OUT, 'axe', f);
    const r = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (Array.isArray(r.inapplicable) && typeof r.inapplicable[0] === 'string') continue;
    fs.writeFileSync(fp, JSON.stringify(compactAxe(r), null, 1));
  }
  for (const f of fs.readdirSync(path.join(OUT, 'lighthouse'))) {
    const fp = path.join(OUT, 'lighthouse', f);
    const r = JSON.parse(fs.readFileSync(fp, 'utf8'));
    delete r.fullPageScreenshot;
    fs.writeFileSync(fp, JSON.stringify(r, null, 1));
  }
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const summary = [];
function writeSummary() {
  const f = path.join(OUT, 'summary.json');
  let rows = summary;
  if (ONLY && fs.existsSync(f)) {
    const prev = JSON.parse(fs.readFileSync(f, 'utf8')).filter((r) => !summary.some((n) => n.state === r.state));
    rows = [...prev, ...summary];
  }
  fs.writeFileSync(f, JSON.stringify(rows, null, 2));
}
let lh;

const LH_FLAGS = {
  onlyCategories: ['accessibility'],
  formFactor: MOBILE ? 'mobile' : 'desktop',
  screenEmulation: { mobile: MOBILE, width: VW, height: VH, deviceScaleFactor: MOBILE ? 2 : 1, disabled: false },
  throttlingMethod: 'provided',
};
const LH_CONFIG = { extends: 'lighthouse:default', settings: LH_FLAGS };

async function clickText(page, text, sel = 'button, a, label, summary') {
  const ok = await page.evaluate(
    (text, sel) => {
      const els = [...document.querySelectorAll(sel)].filter((e) => {
        const t = (e.innerText || e.textContent || '').trim();
        return t === text || t.startsWith(text) || t.split('\n').map((x) => x.trim()).includes(text);
      });
      const el = els[els.length - 1];
      if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return true; }
      return false;
    },
    text,
    sel
  );
  if (!ok) throw new Error(`clickText: "${text}" not found`);
}

async function clickSel(page, sel) {
  const ok = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) { el.click(); return true; }
    return false;
  }, sel);
  if (!ok) throw new Error(`clickSel: ${sel} not found`);
}

/** Open the account menu (works on both the old and the fixed markup). */
async function openAccountMenu(page, username) {
  try {
    await clickSel(page, 'button[aria-controls="account-menu"]');
  } catch {
    // Old markup: on narrow screens only the avatar initial is visible.
    const ok = await page.evaluate((u) => {
      const b = [...document.querySelectorAll('header button, button')].find((x) => {
        const t = (x.innerText || '').trim();
        return t.split('\n').map((s) => s.trim()).includes(u) || t === u.charAt(0).toUpperCase();
      });
      if (b) b.click();
      return !!b;
    }, username);
    if (!ok) throw new Error(`account menu button for ${username} not found`);
  }
}

async function waitText(page, text, timeout = 20000) {
  await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);
}

/** Close the top-most modal: try Escape first, then its X / Cancel / Got it button. */
async function closeModal(page) {
  await page.keyboard.press('Escape');
  await sleep(300);
  await page.evaluate(() => {
    const overlays = [...document.querySelectorAll('[role="dialog"], .fixed.inset-0')].filter(
      (e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed'
    );
    const top = overlays[overlays.length - 1];
    if (!top) return;
    const btn =
      top.querySelector('button[aria-label^="Close"]') ||
      [...top.querySelectorAll('button')].find((b) => b.querySelector('svg.lucide-x')) ||
      [...top.querySelectorAll('button')].find((b) => /^(Cancel|Got it|Close)$/.test(b.innerText.trim()));
    if (btn) btn.click();
  });
  await sleep(300);
}

async function setTheme(page, theme) {
  await page.evaluate((theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, theme);
  await sleep(150);
}

async function currentTheme(page) {
  return page.evaluate(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
}

/** Tab through the page and record focus visibility + whether focus escapes an open dialog. */
async function keyboardWalk(page, name, isModal) {
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  });
  const steps = [];
  const max = isModal ? 25 : 60;
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      // Visible focus = the element looks different while focused (outline,
      // ring/box-shadow, border or background changes) compared with unfocused.
      const snap = () => {
        const cs = getComputedStyle(el);
        const ol = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}` : 'none';
        return [ol, cs.boxShadow, cs.borderColor, cs.backgroundColor].join('|');
      };
      const focused = snap();
      el.blur();
      const unfocused = snap();
      el.focus({ preventScroll: true });
      const outline = focused.split('|')[0] !== 'none';
      const shadow = focused !== unfocused;
      const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], .fixed.inset-0')];
      const top = dialogs[dialogs.length - 1];
      const name =
        el.getAttribute('aria-label') ||
        (el.innerText || '').trim().slice(0, 40) ||
        el.getAttribute('title') ||
        el.getAttribute('placeholder') ||
        el.id ||
        '';
      return {
        tag: el.tagName.toLowerCase(),
        name,
        visibleFocus: !!(outline || shadow),
        insideDialog: top ? top.contains(el) : null,
      };
    });
    if (info) {
      // Stop once focus cycles back to the first stop.
      if (steps.length && info.tag === steps[0].tag && info.name === steps[0].name && steps.length > 2) break;
      steps.push(info);
    }
  }
  const res = {
    state: name,
    tabStops: steps.length,
    noVisibleFocus: steps.filter((s) => !s.visibleFocus).length,
    focusEscapedDialog: isModal ? steps.filter((s) => s.insideDialog === false).length : null,
    steps,
  };
  fs.writeFileSync(path.join(OUT, 'keyboard', `${name}.json`), JSON.stringify(res, null, 2));
  return res;
}

/**
 * Layout checks that axe/Lighthouse do not cover:
 *  - reflow (WCAG 1.4.10): horizontal page overflow at the current viewport,
 *    and the elements that stick out (images/canvas are exempt: 2-D content);
 *  - text spacing (1.4.12): apply the WCAG override values and count text
 *    that becomes clipped (overflow hidden) and was not clipped before;
 *  - text resize (1.4.4, desktop runs only): root font-size 200%, same checks.
 */
async function layoutChecks(page) {
  const measure = () =>
    page.evaluate(() => {
      const vw = window.innerWidth;
      const overflowX = Math.max(0, document.documentElement.scrollWidth - vw);
      const isExempt = (el) => !!el.closest('img, canvas, svg, video, [role="img"], [data-reflow-exempt]');
      const inScroller = (el) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        }
        return false;
      };
      const desc = (el) => {
        const cls = (el.getAttribute('class') || '').split(/\s+/).slice(0, 4).join('.');
        const txt = (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 40);
        return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''} "${txt}"`;
      };
      const all = [...document.body.querySelectorAll('*')];
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.clip !== 'rect(0px, 0px, 0px, 0px)';
      };
      const offenders = all
        .filter((el) => visible(el) && !isExempt(el) && !inScroller(el))
        .filter((el) => el.getBoundingClientRect().right > vw + 1)
        // keep only the outermost offenders
        .filter((el, _, arr) => !arr.some((o) => o !== el && o.contains(el)))
        .slice(0, 8)
        .map((el) => `${desc(el)} right=${Math.round(el.getBoundingClientRect().right)}`);
      // Text that is clipped by an overflow:hidden box.
      const clipped = new Set();
      for (const el of all) {
        if (!visible(el) || isExempt(el)) continue;
        const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!hasText) continue;
        if (el.closest('.sr-only, [aria-hidden="true"]')) continue;
        for (let p = el, i = 0; p && i < 3; p = p.parentElement, i++) {
          const cs = getComputedStyle(p);
          const hides = ['hidden', 'clip'].includes(cs.overflowX) || ['hidden', 'clip'].includes(cs.overflowY);
          if (hides && (p.scrollWidth > p.clientWidth + 1 || p.scrollHeight > p.clientHeight + 1)) {
            // ellipsis truncation that is intentional (full text in title/aria) is reported separately
            clipped.add(desc(el));
            break;
          }
        }
      }
      return { overflowX, offenders, clipped: [...clipped] };
    });

  const base = await measure();
  const res = { viewport: `${VW}x${VH}`, reflow: { overflowX: base.overflowX, offenders: base.offenders } };

  // 1.4.12 Text Spacing override (the exact values from the success criterion).
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.id = '__wcag_text_spacing';
    st.textContent = `* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }`;
    document.head.appendChild(st);
  });
  await sleep(150);
  const ts = await measure();
  await page.evaluate(() => document.getElementById('__wcag_text_spacing')?.remove());
  res.textSpacing = {
    newlyClipped: ts.clipped.filter((c) => !base.clipped.includes(c)),
    newOverflowX: Math.max(0, ts.overflowX - base.overflowX),
  };

  if (!MOBILE) {
    // 1.4.4 Resize Text: 200% root font size (Tailwind sizes are rem-based).
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    await sleep(250);
    const big = await measure();
    await page.evaluate(() => (document.documentElement.style.fontSize = ''));
    res.text200 = {
      newlyClipped: big.clipped.filter((c) => !base.clipped.includes(c)),
      overflowX: big.overflowX,
      offenders: big.offenders,
    };
  }
  res.alreadyClipped = base.clipped;
  await sleep(150);
  return res;
}

async function audit(page, name, { modal = false } = {}) {
  if (ONLY && !ONLY.includes(name)) return;
  await sleep(600);
  const row = { state: name, url: page.url() };
  const theme = await currentTheme(page);
  row.renderedTheme = theme;

  // Lighthouse snapshot of the state exactly as rendered.
  try {
    const result = await lh.snapshot(page, { config: LH_CONFIG });
    delete result.lhr.fullPageScreenshot; // large base64 image, not needed for the a11y audit
    fs.writeFileSync(path.join(OUT, 'lighthouse', `${name}.json`), JSON.stringify(result.lhr, null, 1));
    row.lighthouse = Math.round(result.lhr.categories.accessibility.score * 100);
    row.lighthouseFailed = Object.values(result.lhr.audits)
      .filter((a) => a.score === 0 && a.scoreDisplayMode === 'binary')
      .map((a) => a.id);
  } catch (e) {
    row.lighthouseError = String(e.message || e);
  }

  // axe-core in both themes.
  row.axe = {};
  for (const t of [theme, theme === 'dark' ? 'light' : 'dark']) {
    await setTheme(page, t);
    const r = await new AxePuppeteer(page)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze();
    fs.writeFileSync(path.join(OUT, 'axe', `${name}-${t}.json`), JSON.stringify(compactAxe(r), null, 1));
    const by = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    for (const v of r.violations) by[v.impact] = (by[v.impact] || 0) + v.nodes.length;
    row.axe[t] = { rules: r.violations.map((v) => `${v.id}(${v.impact}:${v.nodes.length})`), nodesByImpact: by };
  }
  await setTheme(page, theme);

  if (MOBILE) {
    await page.screenshot({ path: path.join(OUT, 'screenshots', `${name}.jpg`), type: 'jpeg', quality: 60 });
  }
  try {
    const lay = await layoutChecks(page);
    fs.writeFileSync(path.join(OUT, 'layout', `${name}.json`), JSON.stringify(lay, null, 2));
    row.layout = {
      overflowX: lay.reflow.overflowX,
      textSpacingClipped: lay.textSpacing.newlyClipped.length,
      text200Clipped: lay.text200 ? lay.text200.newlyClipped.length : null,
      text200OverflowX: lay.text200 ? lay.text200.overflowX : null,
    };
  } catch (e) {
    row.layoutError = String(e.message || e);
  }

  const kb = await keyboardWalk(page, name, modal);
  row.keyboard = { tabStops: kb.tabStops, noVisibleFocus: kb.noVisibleFocus, focusEscapedDialog: kb.focusEscapedDialog };
  summary.push(row);
  console.log(JSON.stringify({ state: name, lighthouse: row.lighthouse, axe: Object.fromEntries(Object.entries(row.axe).map(([t, v]) => [t, v.rules])), keyboard: row.keyboard, layout: row.layout }));
}

async function newPage(browser) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: VW, height: VH });
  page.on('dialog', (d) => d.accept());
  // UI_THEME=verdant (etc.) audits one of the appearance themes instead of Classic.
  if (process.env.UI_THEME) {
    await page.evaluateOnNewDocument((t) => {
      try { localStorage.setItem('pixelflow_ui_theme', t); } catch (e) { /* ignore */ }
    }, process.env.UI_THEME);
  }
  return page;
}

async function login(page, email, password) {
  await page.goto(`${APP}/auth`, { waitUntil: 'networkidle0' });
  await page.type('#email', email);
  await page.type('#password', password);
  await clickText(page, 'Sign In', 'button[type="submit"]');
  await page.waitForFunction(() => location.pathname === '/app', { timeout: 20000 });
  await waitText(page, 'Operations');
  await sleep(800);
}

async function addOp(page, label) {
  // Use the search box so collapsed library groups don't matter.
  await page.click('#operationSearch', { clickCount: 3 });
  await page.type('#operationSearch', label);
  await sleep(200);
  await page.evaluate((label) => {
    const b = [...document.querySelectorAll('[data-op], aside button')].find(
      (x) => (x.getAttribute('data-op') || x.childNodes[0]?.textContent || '').trim() === label
    );
    if (!b) throw new Error('op not found ' + label);
    b.click();
  }, label);
  await page.click('#operationSearch', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await sleep(200);
}

async function lighthouseNavigation(url, name) {
  if (ONLY && !ONLY.includes(name)) return;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const result = await lh.navigation(page, url, { config: LH_CONFIG });
    delete result.lhr.fullPageScreenshot; // large base64 image, not needed for the a11y audit
    fs.writeFileSync(path.join(OUT, 'lighthouse', `${name}.json`), JSON.stringify(result.lhr, null, 1));
    const score = Math.round(result.lhr.categories.accessibility.score * 100);
    summary.push({ state: name, url, mode: 'navigation', lighthouse: score,
      lighthouseFailed: Object.values(result.lhr.audits).filter((a) => a.score === 0 && a.scoreDisplayMode === 'binary').map((a) => a.id) });
    console.log(JSON.stringify({ state: name, lighthouse: score }));
  } finally {
    await browser.close();
  }
}

(async () => {
  lh = await import(pathToFileURL(path.join(TOOLS, 'node_modules/lighthouse/core/index.js')).href);

  // 1. Lighthouse navigation audits of each real route (fresh visitor).
  await lighthouseNavigation(`${APP}/`, 'route-landing');
  await lighthouseNavigation(`${APP}/auth`, 'route-auth');
  await lighthouseNavigation(`${APP}/app`, 'route-app');

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  try {
    // ---- Guest flow ----
    let page = await newPage(browser);
    await page.goto(`${APP}/`, { waitUntil: 'networkidle0' });
    await audit(page, 'landing');

    await page.goto(`${APP}/auth`, { waitUntil: 'networkidle0' });
    await audit(page, 'auth-login');

    await clickText(page, 'Sign up');
    await waitText(page, 'Create your account');
    await audit(page, 'auth-register');

    await clickText(page, 'Sign in');
    await waitText(page, 'Sign in to your account');
    await page.type('#email', 'nobody@example.com');
    await page.type('#password', 'wrong-password');
    await clickText(page, 'Sign In', 'button[type="submit"]');
    await page.waitForFunction(() => /invalid|incorrect|failed/i.test(document.body.innerText), { timeout: 15000 });
    await audit(page, 'auth-login-error');

    await page.goto(`${APP}/app`, { waitUntil: 'networkidle0' });
    await waitText(page, 'Brightness');
    await audit(page, 'app-empty');

    const input = await page.$('#upload-image');
    await input.uploadFile(process.env.IMG1);
    await waitText(page, 'Gallery (1)');
    for (const op of ['Brightness', 'Sharpen', 'Threshold Binary', 'Flood Fill']) await addOp(page, op);
    await waitText(page, 'Pipeline (4 steps)');
    await audit(page, 'app-pipeline');

    await clickText(page, 'Gallery (1)');
    await waitText(page, 'Image Gallery');
    await audit(page, 'modal-gallery', { modal: true });

    await clickSel(page, 'button[title="View full size"], button[aria-label^="View full size"]');
    await sleep(500);
    await audit(page, 'modal-lightbox', { modal: true });
    await closeModal(page);
    await closeModal(page);

    await clickSel(page, 'button[title="Method details"], button[aria-label^="Method details"], button[aria-label^="Details for"]');
    await waitText(page, 'Description');
    await audit(page, 'modal-method-details', { modal: true });
    await closeModal(page);

    await clickText(page, 'Apply Pipeline');
    await waitText(page, 'Results (1)', 60000);
    await audit(page, 'app-results');

    await clickSel(page, 'button[title="Analytics"], button[aria-label^="Analytics"], button[aria-label^="Show analytics"]');
    await waitText(page, 'Image Analytics');
    await sleep(1500);
    await audit(page, 'modal-analytics', { modal: true });
    await closeModal(page);

    await clickSel(page, 'button[title="Inspect"], button[aria-label^="Inspect"]');
    await waitText(page, 'Inspector');
    await audit(page, 'app-inspector');

    await clickSel(page, 'button[title="Before/After slider"], button[aria-label="Before/After slider"]');
    await sleep(500);
    await audit(page, 'app-inspector-slider');

    await clickSel(page, 'button[title="Back to results grid"], button[aria-label="Back to results grid"]');
    await sleep(300);
    await clickSel(page, 'input.toggle-checkbox, input#live-toggle');
    await waitText(page, 'Live preview updated', 60000);
    await audit(page, 'app-live');
    await page.close();

    // ---- Logged-in user flow ----
    page = await newPage(browser);
    await login(page, process.env.USER_EMAIL, process.env.USER_PASSWORD);
    await addOp(page, 'Grayscale');
    await audit(page, 'app-signed-in');

    await openAccountMenu(page, 'a11yuser');
    await sleep(300);
    await audit(page, 'menu-user');
    await page.keyboard.press('Escape');
    await openAccountMenu(page, 'a11yuser');
    await sleep(200);

    await clickText(page, 'Save');
    await waitText(page, 'Save Pipeline');
    await audit(page, 'modal-save-pipeline', { modal: true });
    await closeModal(page);

    await clickText(page, 'Load');
    await waitText(page, 'Load Pipeline');
    await sleep(800);
    await audit(page, 'modal-load-pipeline', { modal: true });
    await closeModal(page);
    await page.close();

    // ---- Admin flow ----
    page = await newPage(browser);
    await login(page, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    await openAccountMenu(page, 'a11yadmin2');
    await sleep(200);
    await clickText(page, 'Admin Tools');
    await waitText(page, 'Pipeline Limits', 20000);
    await audit(page, 'modal-admin', { modal: true });

    await clickText(page, 'Database');
    await waitText(page, 'View User Data');
    await clickSel(page, 'input[type="checkbox"].sr-only, #admin-user-data-toggle');
    await page.waitForFunction(() => /Admin PIN/.test(document.body.innerText), { timeout: 10000 });
    await audit(page, 'modal-admin-pin', { modal: true });

    // Enter/create the (local test) PIN and audit the user-data view behind it.
    await page.focus('input[inputmode="numeric"]');
    await page.keyboard.type(process.env.ADMIN_PIN || '2468');
    await page.keyboard.press('Enter');
    await waitText(page, 'Users Overview', 20000);
    await sleep(800);
    await audit(page, 'modal-admin-userdata', { modal: true });
    await page.close();
  } finally {
    await browser.close();
    writeSummary();
  }
})().catch((e) => {
  console.error(e);
  writeSummary();
  process.exit(1);
});
