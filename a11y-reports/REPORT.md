# PixelFlow accessibility audit (WCAG 2.1 Level AA)

Branch: `accessibility-audit`. Audit date: 11 Nov 2026.

## 1. Summary

I audited the PixelFlow web app (React/TypeScript frontend, FastAPI backend) against
WCAG 2.1 Level AA. I used free tools (Lighthouse, axe-core) and a scripted keyboard test,
fixed what they found, and then ran the same checks again.

<!--SUMMARY-->
Across 23 audited pages and states, the average Lighthouse accessibility score went from **75 to 100**. The worst page went from 62 to 100. axe-core findings rated critical or serious went from **492 to 0** (light and dark theme combined). Before, keyboard focus escaped all 8 dialogs I measured; now it stays inside every one.
<!--/SUMMARY-->

The biggest problems were in the main workspace (`/app`), which is where people actually
use the app:

- Many icon-only buttons had no name, so a screen reader said only "button".
- Slider and select controls had no labels.
- Grey text was too light to read comfortably.
- None of the 9 pop-up dialogs kept keyboard focus inside them.
- Several features worked only with a mouse: uploading, picking images in the gallery,
  the before/after slider, and picking a point or region on the image.

## 2. How I tested

| | |
|---|---|
| Browser | Headless Chrome for Testing 153 (Playwright's bundled Chromium) |
| Lighthouse | 12.8.2, accessibility category only, desktop, 1440×900. **Navigation mode** for the 3 real routes, **snapshot mode** for in-page states such as open dialogs. |
| axe-core | 4.14.0 via `@axe-core/puppeteer`, tags `wcag2a wcag2aa wcag21a wcag21aa best-practice`. Every state is checked in **both light and dark theme**. |
| Keyboard | Scripted Tab walk per state. It records each focused element, whether it looks different when focused (outline, ring, border or background change), and, for dialogs, whether focus escapes the dialog. |
| Driver | `a11y-reports/scripts/audit.js` (puppeteer-core). It logs in, uploads a test image, builds a 4-step pipeline (Brightness, Sharpen, Threshold Binary, Flood Fill), runs it, and opens every dialog. |

**What was built and run:** the frontend's production build (`npm run build`), served
statically on :3000, plus the FastAPI backend on :8000 with SQLite. I confirmed both with
`/health` and by checking the HTTP responses (`/api/processing/operations` returned 200,
and the pages loaded).

The CRA dev server (`npm start`) would not start in the cloud sandbox:
`options.allowedHosts[0] should be a non-empty string`. This is a known react-scripts 5
bug when `package.json` has a `proxy` and the machine has no private LAN IP. On a
normal laptop it starts fine. The production build is what real users get anyway.

**Logins:** no mock login was needed. Email/password sign-up works locally, and Google
Sign-In hides itself when `REACT_APP_GOOGLE_CLIENT_ID` is not set, so the real login code
is unchanged. I made two throwaway accounts in the local SQLite database only: a normal
user, and an admin (promoted in SQLite) so I could audit the Admin Tools.

### Pages and states audited (23)

- **Routes (Lighthouse navigation):** `/` landing, `/auth` sign-in, `/app` workspace.
- **States (Lighthouse snapshot + axe + keyboard):**
  - Landing; sign-in; sign-up; sign-in with an error message.
  - Empty workspace; workspace with a 4-step pipeline.
  - Gallery dialog; image lightbox; method-details dialog.
  - Results grid; image analytics dialog; Inspector (normal view); Inspector before/after
    slider; live-processing mode.
  - Signed-in workspace; account menu; Save Pipeline dialog; Load Pipeline dialog.
  - Admin Tools dialog; Admin PIN dialog.

### What I could not reach or did not cover

- **Google "Continue with Google" button.** Google renders it in its own iframe, and it
  only appears with a real OAuth client id. It is not our code.
- **Admin "View user data" table after entering the PIN.** I audited the PIN dialog, but
  not the data table behind it.
- **Mobile and small screens** (WCAG 1.4.10 Reflow, 1.4.4 Resize text). The workspace
  is a fixed desktop layout with a 320 px sidebar, so it will not reflow to 320 px width
  without a responsive redesign. I'm calling this out as known, remaining work. It isn't
  something a few attribute fixes can solve.
- **Real screen-reader testing** has to be done by a person. Section 6 has a VoiceOver
  checklist for that.

## 3. Lighthouse accessibility score, before and after

<!--SCORES-->
Lighthouse accessibility score (0–100). The axe columns count failing elements in each
state, light + dark theme added together, so an element that fails in many states (such
as an unlabeled button in the toolbar) is counted in each one. The last column is how many
of 25 scripted Tab presses landed outside the open dialog.

| Page / state | Lighthouse before | Lighthouse after | axe critical+serious before → after | axe all violations before → after | Focus escaped dialog before → after |
|---|---:|---:|---:|---:|---:|
| `/` landing page (navigation) | 91 | **100** | – | – | – |
| `/auth` sign-in (navigation) | 100 | **100** | – | – | – |
| `/app` workspace, guest (navigation) | 74 | **100** | – | – | – |
| Landing page | 91 | **100** | 1 → 0 | 65 → 0 | – |
| Sign in | 100 | **100** | 0 → 0 | 12 → 0 | – |
| Create account | 100 | **100** | 0 → 0 | 18 → 0 | – |
| Sign in with error message | 100 | **100** | 0 → 0 | 14 → 0 | – |
| Workspace, empty | 74 | **100** | 8 → 0 | 12 → 0 | – |
| Workspace with 4-step pipeline | 62 | **100** | 43 → 0 | 47 → 0 | – |
| Gallery dialog | 62 | **100** | 45 → 0 | 57 → 0 | 25 → 0 |
| Image lightbox | 62 | **100** | 51 → 0 | 67 → 0 | 21 → 0 |
| Method details dialog | 62 | **100** | 45 → 0 | 63 → 0 | 25 → 0 |
| Results grid | 62 | **100** | 43 → 0 | 61 → 0 | – |
| Image analytics dialog | 62 | **100** | 44 → 0 | 62 → 0 | 6 → 0 |
| Inspector | 62 | **100** | 41 → 0 | 59 → 0 | – |
| Inspector, before/after slider | 62 | **100** | 41 → 0 | 59 → 0 | – |
| Live processing mode | 62 | **100** | 42 → 0 | 60 → 0 | – |
| Workspace, signed in | 74 | **100** | 12 → 0 | 14 → 0 | – |
| Account menu open | 74 | **100** | 12 → 0 | 16 → 0 | – |
| Save Pipeline dialog | 76 | **100** | 14 → 0 | 30 → 0 | 18 → 0 |
| Load Pipeline dialog | 74 | **100** | 14 → 0 | 22 → 0 | 21 → 0 |
| Admin Tools dialog | 74 | **100** | 24 → 0 | 32 → 0 | 10 → 0 |
| Admin PIN dialog | 74 | **100** | 12 → 0 | 30 → 0 | 23 → 0 |

**Average Lighthouse score: 75 → 100** (lowest 62 → 100). **axe critical + serious: 492 → 0**; all axe violations: 800 → 0.
<!--/SCORES-->

Raw results: `a11y-reports/before/` and `a11y-reports/after/`.

- `lighthouse/*.json`: open these in https://googlechrome.github.io/lighthouse/viewer/
- `axe/*-light.json` and `axe/*-dark.json`
- `keyboard/*.json`
- `summary.json`

To keep the repo small, axe "passes" are stored as rule id + node count, and the
`data:` image URIs inside HTML snippets are shortened. Every violation and every
"needs review" result is kept in full.

## 4. Issues found and how they were fixed

| # | Issue found | WCAG 2.1 success criterion | Where | How it was fixed |
|---|---|---|---|---|
| 1 | Icon-only buttons with no accessible name, so a screen reader says just "button": move up/down, sidebar collapse, lightbox zoom/close, dialog close buttons, analytics close. Others (info, remove step, preview, gallery/result actions) had only a `title` tooltip, which isn't reliably announced and gives no context about which step or image they act on. | **4.1.2 Name, Role, Value**; 2.4.6 Headings and Labels | `PipelineStep`, `App` (sidebar, lightbox), `GalleryModal`, `ResultsGrid`, `Inspector`, `ImageAnalytics`, `Save/LoadPipelineModal`, `MethodDetailsModal`, `AdminPanel`, `Header` | Gave each one a specific `aria-label`, e.g. "Move Brightness up", "Remove Sharpen step", "Delete image: photo.png", "Close gallery". Toggle buttons got `aria-pressed`; the sidebar button got `aria-expanded`. |
| 2 | Decorative icons and logos read aloud. The logo next to the word "PixelFlow" was announced as "PixelFlow PixelFlow". | **1.1.1 Non-text Content** | 148 lucide icons in 13 components; logos in `Header`, `Login`, `Register`, `LandingPage`; avatar; emoji | Decorative icons get `aria-hidden="true"`. Logos and avatars next to visible text get `alt=""`. Emoji are wrapped in `aria-hidden`. The diff-heatmap `<canvas>` gets `role="img"` and a description. |
| 3 | Form controls with no label: parameter sliders, select and color inputs, operation search, live-processing switch, A/B compare selects, 11 admin inputs, admin PIN | **1.3.1 Info and Relationships**; **3.3.2 Labels or Instructions**; 4.1.2 | `ParamControl`, `PipelineStep`, `App`, `Inspector`, `AdminPanel` | Linked the visible captions with `<label htmlFor>`. Coordinate pickers use `aria-labelledby`. The search box got a visually hidden label (a placeholder is not a label). The switches got `role="switch"`. |
| 4 | *Found by the re-audit, and caused by my first round of fixes:* the account-menu button and gallery thumbnails got `aria-label`s that didn't contain their visible text. | 2.5.3 Label in Name | `Header`, `GalleryModal` | Their names now come from the visible content (plus an sr-only "Account menu for" prefix). Operation buttons follow the same rule: visible "Brightness" becomes "Add Brightness". |
| 5 | Sign-in and sign-up fields had no `autocomplete` | **1.3.5 Identify Input Purpose** | `Login`, `Register` | Added `autocomplete` values: `email`, `current-password`, `new-password`, `username`, `name`. |
| 6 | Grey text too light: gray-400/500 on white or gray-100 measured 2.5–4.4:1; dark-mode gray-500 measured 3.7:1 | **1.4.3 Contrast (Minimum)** | Parameter captions (63 nodes), empty-state text, Inspector, Header, admin, dialogs | Light mode now uses gray/slate-600 (about 6.9–7.6:1). Dark mode uses gray/slate-400 (about 6.9:1). |
| 7 | White text on mid-tone gradients (2.4–3.9:1). axe can't measure gradients, so I checked these by hand. | **1.4.3 Contrast (Minimum)** | Operation library headers (OpenCV / Scikit-Image / Basic), button hover gradient | Switched to 700-shade gradients (at least 5.4:1). Hover gradient is now 600 shades. |
| 8 | Green "success" status (3.3:1), yellow "warning" status, white on blue-500 "Download All" in dark mode (3.7:1), green/red toasts | **1.4.3 Contrast (Minimum)** | `App` status bar, `ResultsGrid`, `Header` toast | green-700, amber-700, blue-600/700, and 700-shade toast backgrounds. |
| 9 | Placeholder text in Tailwind's default gray-400 (2.5:1) | **1.4.3 Contrast (Minimum)** | All inputs | Global `::placeholder` set to gray-500 (4.8:1), and zinc-400 in dark mode. |
| 10 | Input borders, slider track and switch track barely visible (about 1.5:1) | **1.4.11 Non-text Contrast** | Inputs and selects across the app, `.param-slider`, live-processing switch, admin switch | Borders are now gray/slate-500 and zinc-500 (at least 3:1). Switch track and knob are at least 3:1, and the checked state is blue. |
| 11 | Footer licence link was identified by color only | **1.4.1 Use of Color** | `LandingPage` footer | The link is now underlined. |
| 12 | Focus indicator was inconsistent: mostly the browser's default ring, and nothing visible on the admin "View user data" switch, because focus sits on a visually hidden checkbox. (The automated Tab walk counted 0 problems here. It measures style changes on the focused element itself, so it can't see this case, which is why I also checked by eye.) | **2.4.7 Focus Visible**; 1.4.11 | Global; `AdminPanel` switch; upload button | Added one global `:focus-visible` outline: 3px blue-700, or blue-300 in dark mode. Custom switches and the upload button show it on the visible part via `peer-focus-visible`. |
| 13 | Upload button not reachable by keyboard (the `<input type=file>` was `display:none`) | **2.1.1 Keyboard** | `App` toolbar | The input is now visually hidden but still focusable, and its label shows the focus ring. |
| 14 | Gallery thumbnails were clickable `<div>`s, so they couldn't be selected by keyboard | **2.1.1 Keyboard**; 4.1.2 | `GalleryModal` | Each thumbnail is now a `<button aria-pressed>` inside a labelled list. The view/delete controls also appear on keyboard focus, not only on hover. |
| 15 | Pipeline builder: reordering wasn't announced, and focus was lost after a move or removal | **2.1.1 Keyboard**; 2.4.3 Focus Order; 4.1.3 | `PipelineStep`, `App` | The keyboard alternative to drag-and-drop is the Move up / Move down buttons (now properly named) plus **Alt+↑ / Alt+↓**. Focus stays on the moved step. After a removal, focus goes to the "Pipeline" heading. "Added / moved to position 2 of 4 / removed" is announced. |
| 16 | Before/after compare divider worked by mouse drag only | **2.1.1 Keyboard**; 4.1.2 | `CompareSlider` | The handle is now a `role="slider"` with ←/→, Shift+arrow, PageUp/PageDown and Home/End. It uses pointer events, so touch works too. |
| 17 | Picking a point, region or color on the image was mouse-only | **2.1.1 Keyboard** | `PreviewCanvas`, `ParamControl` | Added a keyboard crosshair: arrows move it (Shift moves 10%), Enter places it (press twice for a region), Esc cancels. Coordinates are announced, and focus returns to the "Pick" button. If live preview is off, the app explains how to turn it on. |
| 18 | Lightbox zoom and pan worked by mouse wheel/drag only | **2.1.1 Keyboard** | `App` lightbox | + / − / 0 zoom, arrow keys pan, and there is an on-screen hint. The zoom buttons now share the same zoom state. |
| 19 | Account menu: no menu semantics, no arrow keys, no Escape | 4.1.2; 2.1.1 | `Header` | Follows the WAI-ARIA menu-button pattern: `aria-haspopup`, `aria-expanded`, `role="menu"`/`menuitem`, arrow keys, Home/End, Escape returns focus. |
| 20 | Admin and Load-pipeline tabs were plain buttons | 4.1.2; 1.3.1 | `AdminPanel`, `LoadPipelineModal` | Follows the WAI-ARIA tabs pattern: `tablist`/`tab`/`tabpanel`, `aria-selected`, roving tabindex, arrow keys. |
| 21 | **Dialogs did not trap focus.** Tab walked into the page behind, focus didn't move into the dialog, and Escape didn't work (or one Escape closed two dialogs at once). | **2.4.3 Focus Order**; **2.1.2 No Keyboard Trap**; 4.1.2 | All 9: gallery, lightbox, method details, analytics, save, load, quota alert, admin, admin PIN | New `useDialog` hook. It adds `role="dialog"` (or `alertdialog`), `aria-modal`, and `aria-labelledby` pointing at the title. Focus moves in on open and Tab cycles inside. Escape closes only the top dialog, and focus returns to the button that opened it. |
| 22 | Status and error messages were silent for screen readers | **4.1.3 Status Messages**; **3.3.1 Error Identification** | `App` status bar, `Login`, `Register`, `Save/LoadPipelineModal`, `Header` toast, step errors, loading states | Status bar is `role="status"`. Form errors appear in an always-present `role="alert"` region, and the related fields get `aria-invalid` and `aria-describedby`. Toasts are announced through `utils/announce.ts`. |
| 23 | No `<main>`, `<header>` or `<nav>` landmarks on most pages; content outside landmarks (axe "region", 30 nodes on the landing page) | **1.3.1 Info and Relationships**; 2.4.1 Bypass Blocks | `Header`, `LandingPage`, `Login`, `Register`, `App` | `Header` is now a `<header>` with a labelled `<nav>`; Home/App are real links with `aria-current`. Every page has one `<main>`. Workspace areas are labelled `<section>`s. |
| 24 | No way to skip the header and navigation | **2.4.1 Bypass Blocks** | Landing, workspace | Added a "Skip to main content" link that appears on first Tab. |
| 25 | Heading order: landing page started at h2 and skipped h4 to h5; workspace had no h1 and the logo `<h1>` was inside a button | **1.3.1**; 2.4.6 | `LandingPage`, `Header`, `App`, `ResultsGrid`, `Inspector`, `PipelineStep`, dialogs | One h1 per page and no skipped levels: hero h1 → sections h2 → cards h3; workspace has an sr-only h1, panels are h2, steps are h3. |
| 26 | Every route had the same `<title>` | **2.4.2 Page Titled** | All routes | New `useDocumentTitle` hook: "Visual image processing pipeline builder", "Sign in", "Create account", "Workspace" (each followed by "\| PixelFlow"). |
| 27 | Ctrl+Z / Ctrl+Y were hijacked even while typing in a text field (native undo didn't work) | 2.1.1 (keyboard behaviour) | `hooks/index.ts` `useKeyboardShortcuts` | Shortcuts are now ignored inside editable fields, except Ctrl+K and Ctrl+/ (focus search). |

Two real bugs I found along the way (not accessibility, but they affected everyone):

- **Before/after captions were swapped.** The "after" image was shown on the left while
  labelled "After" on the right. Fixed in `CompareSlider`.
- **Duplicate pipeline step ids.** Adding two steps in the same millisecond gave them the
  same id, so editing one edited both. Fixed in `PipelineContext`.

### Keyboard-only checks after the fixes

`a11y-reports/scripts/keyboard-checks.js` drives the app using only the keyboard and
checks focus, ARIA state and announcements. Result: **20/20 passed**
(`a11y-reports/after/keyboard-checks.json`).

| Check | Result |
|---|---|
| Landing: first Tab reaches "Skip to main content" | ✅ pass |
| Landing: Enter on skip link moves focus to `<main>` | ✅ pass |
| Landing: page title | ✅ pass |
| Workspace: Tab reaches the Upload Image(s) file input | ✅ pass |
| Pipeline: steps added with Enter | ✅ pass |
| Pipeline: "Added … as step 2" announced | ✅ pass |
| Pipeline: Enter on "Move Sharpen up" moves it to position 1 | ✅ pass |
| Pipeline: focus stays on the moved step (falls back to Move down at the top) | ✅ pass |
| Pipeline: move announced | ✅ pass |
| Pipeline: Alt+ArrowDown moves the step back down | ✅ pass |
| Gallery: opening moves focus into the dialog | ✅ pass |
| Gallery: 15 Tab/Shift+Tab presses never leave the dialog | ✅ pass |
| Gallery: Space toggles thumbnail selection (aria-pressed) | ✅ pass |
| Gallery: Escape closes it | ✅ pass |
| Gallery: focus returns to the "Gallery" button | ✅ pass |
| Compare slider: 5 × ArrowRight moves 50% -> 55% | ✅ pass |
| Compare slider: End jumps to 100% | ✅ pass |
| Picker: "Pick on image" moves focus onto the image picker | ✅ pass |
| Picker: arrows + Enter set the seed point to (0.53, 0.50) | ✅ pass |
| Picker: focus returns to the Pick button | ✅ pass |

### Remaining issues

- **axe-core: 0 violations of any severity** (critical, serious, moderate or minor)
  in all 20 in-page states, in both light and dark theme. Nothing serious or critical is
  left.
- **axe "needs review" items** are things axe can't decide on its own, mostly text on
  gradient or semi-transparent backgrounds. I checked the important ones by hand: the
  operation-library headers, which led to fix #7, and the white captions on
  `bg-black/75`, which pass. The rest are large headings on the landing page's soft
  gradient, which pass easily.
- **Not covered by automated tools, and still open:**
  - Reflow at 320 px and 400% zoom (1.4.10). The desktop-only layout needs a responsive
    redesign.
  - The content of user-uploaded images. Their alt text is the file name, because the app
    can't know what a photo shows.
- **Regressions the re-audit caught and I fixed:**
  - The Label in Name issue in row 4.
  - My contrast pass had added dark-mode text colors to the Save/Load dialogs, but those
    dialogs stay white in dark mode, so the text dropped to 2.5:1. I removed those
    classes.

  This is why I re-ran the full audit instead of trusting the first fix.
- **Beyond 2.1 AA:** Lighthouse's `target-size` check (WCAG **2.2** SC 2.5.8) flagged
  the 16 px Move up/down arrows. I enlarged them to 24 px anyway.

## 5. Production outage (Render): what happened and what changed

**Root cause** (from the Render deploy log for commit `cb968b4`):

```
could not translate host name "dpg-d3v6rfer433s73clvteg-a" to address: Name or service not known
ERROR:    Application startup failed. Exiting.      ==> Exited with status 3
```

The build was fine. The app crashed at startup because `DATABASE_URL` pointed at a
Render Postgres instance that no longer existed. Render's free databases expire 30 days
after creation and are then deleted. You fixed it by creating a new database and
pointing `DATABASE_URL` at it, and the site is back.

**Code and config hardening on this branch:**

| Commit | Problem | Fix |
|---|---|---|
| `fix(backend): retry DB connection…` | One failed connection crash-looped the service, and the log never said why in plain words | `init_db` retries with backoff (5 tries), then logs the host (password masked) and the likely cause, e.g. "free databases expire, or region mismatch". Has tests. |
| `fix(ci): make plain pytest importable` | CI's `pytest` step failed with `ModuleNotFoundError: app` before running any test | `pythonpath = ["."]` in `pyproject.toml`. 74 tests now pass with plain `pytest`. |
| `fix(auth): don't call /auth/me for guests` | Every page load by every guest called `/auth/me` (+ `/auth/refresh`). `/auth/*` is limited to 10/min per IP, and behind Render's proxy everyone shares one IP, so real users were logged out with 429 errors. | Only check the session when the `pf_csrf` cookie exists. |
| `fix(backend): make CORS the outermost middleware` | CSRF 403 and rate-limit 429 responses had no CORS headers, so the browser showed "Network error" instead of the real reason | CORS is now added last, so it's the outermost middleware. Has a test. |
| `fix(deploy): pin Python 3.11.9…` | Render ignores `runtime.txt`, so a blueprint-created service would build on Python 3.13 and fail (no wheels for the pinned numpy/scikit-image) | `PYTHON_VERSION=3.11.9` in both `render.yaml` files, plus a comment about the database expiry. |
| `fix(deploy): point the Vercel /api proxy…` | `vercel.json` proxied `/api/*` to `REPLACE-WITH-YOUR-RENDER-BACKEND.onrender.com` | Now points at `pixelflow-d9q5.onrender.com`, the host the earlier production bundle used. **Please confirm this is your Render URL.** |

**Things only you can do in the dashboards:**

1. **Vercel → Settings → Environment Variables:** set `REACT_APP_API_URL=/api` and
   redeploy. The cookie login from `c30cb33` needs the frontend and API on the same origin.
   With an absolute `https://…onrender.com/api` URL, browsers drop the `SameSite=Lax`
   cookies: sign-in looks like it worked, then the next request is logged out.
   *Quick check: sign in on the live site and reload. If you're signed out, this is why.*
2. **Render → the new database:** free Postgres expires again in 30 days. Upgrade it or
   set a reminder.
3. **Render → web service → Environment:** set `ADMIN_EMAIL` / `ADMIN_PASSWORD` so the
   first admin is re-created in the new (empty) database.
4. Not changed on purpose: adding `--forwarded-allow-ips='*'` would let each user have
   their own rate-limit bucket. But uvicorn 0.24 then trusts the **first**
   `X-Forwarded-For` value, which any client can fake to dodge the limit.

## 6. Manual screen-reader check (VoiceOver on macOS)

### Run this branch locally (3 commands)

You need Python 3.11 or 3.12 (`brew install python@3.11`) and Node 18+.

```bash
git clone -b accessibility-audit https://github.com/mauryantitans/PixelFlow.git
```

```bash
cd PixelFlow
```

```bash
./start.sh
```

Open http://localhost:3000 in **Safari**, which pairs best with VoiceOver. Turn
VoiceOver on and off with **Cmd+F5**.

- VO key = **Control+Option**.
- **VO+U** opens the Rotor (lists of headings, links, landmarks, form controls).
- **Tab** moves between controls.
- **VO+Space** activates the current item.

### Checklist

| # | Page and action | What to listen for | Correct output sounds like |
|---|---|---|---|
| 1 | Icon-only buttons with no accessible name, so a screen reader says just "button": move up/down, sidebar collapse, lightbox zoom/close, dialog close buttons, analytics close. Others (info, remove step, preview, gallery/result actions) had only a `title` tooltip, which isn't reliably announced and gives no context about which step or image they act on. | **4.1.2 Name, Role, Value**; 2.4.6 Headings and Labels | `PipelineStep`, `App` (sidebar, lightbox), `GalleryModal`, `ResultsGrid`, `Inspector`, `ImageAnalytics`, `Save/LoadPipelineModal`, `MethodDetailsModal`, `AdminPanel`, `Header` | Gave each one a specific `aria-label`, e.g. "Move Brightness up", "Remove Sharpen step", "Delete image: photo.png", "Close gallery". Toggle buttons got `aria-pressed`; the sidebar button got `aria-expanded`. |
| 2 | `/`: press Tab once | Skip link | "Skip to main content, link". Press Enter and focus jumps past the header. |
| 3 | `/`: VO+U, then the Headings list | One h1 and a sensible outline | "Visual Image Processing Made Simple, heading level 1", then level-2 sections ("How It Works", …). No level jumps. |
| 4 | *Found by the re-audit, and caused by my first round of fixes:* the account-menu button and gallery thumbnails got `aria-label`s that didn't contain their visible text. | 2.5.3 Label in Name | `Header`, `GalleryModal` | Their names now come from the visible content (plus an sr-only "Account menu for" prefix). Operation buttons follow the same rule: visible "Brightness" becomes "Add Brightness". |
| 5 | `/auth`: Tab to the email field | Field label | "Email Address, edit text, required". The logo is skipped (no "PixelFlow image"). |
| 6 | `/auth`: submit a wrong password | Error announced without moving | VoiceOver reads the error right away, e.g. "Invalid credentials. 4 attempt(s) remaining before account lockout." Back on the field, you hear "invalid data". |
| 7 | `/app`: Tab to "Upload Image(s)" | Upload is reachable | "Upload Image(s), file upload button" (or "choose file"). Enter opens the file picker. |
| 8 | `/app`: Tab into the Operations panel | Search and operation buttons | "Search operations, search text field", then "Add Brightness, button" followed by its description. |
| 9 | `/app`: press "Add Brightness" | Status message | "Added Brightness as step 1 of 1". |
| 10 | Pipeline step: Tab to the arrows | Named move buttons | "Move Brightness up, button, dimmed" (first step). Press **Alt+Down**, or the down button, and you hear "Brightness moved to position 2 of 2". Focus stays on that step. |
| 11 | Pipeline step: Tab to the slider | Labelled slider | "Brightness, 0, slider". Use VO+Left/Right arrows to change it. |
| 12 | Toolbar: upload one image, then Tab to Live Processing | Switch | "Live Processing, off, switch". After switching on, the status bar says "Live preview updated". |
| 13 | Open "Gallery (1)" | Dialog, focus inside | "Image Gallery (1), web dialog". Tab cycles only inside the dialog. A thumbnail reads "photo.png, 320 × 240, selected, toggle button". Esc closes it, and focus returns to the "Gallery" button. |
| 14 | Inspector → "Before/After slider" | Slider | "Comparison divider: Original on the left, …, 50% Original, 50% Final, slider". Left/Right arrows move it. |
| 15 | Add "Flood Fill", press "Pick on image" (with live mode on) | Keyboard picker | "Image picker. Click to place the point, application". Arrow keys announce "x 51%, y 50%"; Enter says "Point set at …". |
| 16 | Signed in: account button | Menu button | "Account menu for <name>, menu button, collapsed". Enter opens it and you hear "Logout, menu item" (or "Admin Tools"). Esc closes it. |
| 17 | Header icons | No unnamed buttons | VO+U → Form Controls lists no items that say just "button". |

If any row sounds different, note the page, what you pressed, and what VoiceOver said.

## 7. Interview talking points

1. **What I found.** I ran Lighthouse and axe on 23 real pages and states of the app, not just the
   home page. The landing page scored 91, but the main workspace scored 62. Automated
   tools also missed things I only found by tabbing: none of the 9 dialogs trapped focus,
   the upload button was `display:none`, and gallery selection, the compare slider and
   image picking were mouse-only.
2. **How I fixed it.** I fixed by pattern rather than one by one. I wrote a single
   `useDialog` hook for all modals (focus in, trap, Escape, return focus), a live-region
   `announce()` helper for status messages, and a token-level contrast pass over the
   Tailwind classes. Then I added keyboard equivalents for each pointer interaction:
   Move up/down + Alt+arrows instead of drag, a `role="slider"` divider, and an
   arrow-key crosshair for picking points. Every fix type is its own commit with the WCAG
   criterion in the message, and the same script re-measures the before/after scores.
3. **What I learned.** A Lighthouse score of 100 doesn't mean a page is usable. The tools
   catch missing names and contrast, but not focus traps or mouse-only features, so the
   scripted Tab walk and a real screen reader are essential. Accessibility work also
   surfaces real bugs: I found swapped before/after captions and duplicate pipeline ids.
   While doing this I also traced a production outage to an expired free Render database
   and made the startup error spell out the cause.

## 8. Re-running the audit

```bash
mkdir -p /tmp/a11y-tools && cd /tmp/a11y-tools && npm init -y >/dev/null && npm i lighthouse@12 axe-core@4 @axe-core/puppeteer@4 puppeteer-core@23
```

With the backend (:8000) and the frontend build (:3000) running, from the repo root:

```bash
TOOLS=/tmp/a11y-tools PHASE=after CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" IMG1="$PWD/images/PixelFlow (1).png" USER_EMAIL=you@example.com USER_PASSWORD='…' ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='…' node a11y-reports/scripts/audit.js
```
