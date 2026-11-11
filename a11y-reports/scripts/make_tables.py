"""Build the before/after tables in REPORT.md from the audit summary.json files
(before/, after/ = desktop 1440x900; before-mobile/, after-mobile/ = 320x640).

Usage (from the repo root):  python3 a11y-reports/scripts/make_tables.py
Replaces the block between <!--SCORES--> and <!--/SCORES--> (and the summary
block) in a11y-reports/REPORT.md.
"""

import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
before = {r["state"]: r for r in json.loads((ROOT / "before" / "summary.json").read_text())}
after = {r["state"]: r for r in json.loads((ROOT / "after" / "summary.json").read_text())}


def load(name):
    f = ROOT / name / "summary.json"
    return {r["state"]: r for r in json.loads(f.read_text())} if f.exists() else {}


before_m = load("before-mobile")
after_m = load("after-mobile")

LABELS = {
    "route-landing": "`/` landing page (navigation)",
    "route-auth": "`/auth` sign-in (navigation)",
    "route-app": "`/app` workspace, guest (navigation)",
    "landing": "Landing page",
    "auth-login": "Sign in",
    "auth-register": "Create account",
    "auth-login-error": "Sign in with error message",
    "app-empty": "Workspace, empty",
    "app-pipeline": "Workspace with 4-step pipeline",
    "modal-gallery": "Gallery dialog",
    "modal-lightbox": "Image lightbox",
    "modal-method-details": "Method details dialog",
    "app-results": "Results grid",
    "modal-analytics": "Image analytics dialog",
    "app-inspector": "Inspector",
    "app-inspector-slider": "Inspector, before/after slider",
    "app-live": "Live processing mode",
    "app-signed-in": "Workspace, signed in",
    "menu-user": "Account menu open",
    "modal-save-pipeline": "Save Pipeline dialog",
    "modal-load-pipeline": "Load Pipeline dialog",
    "modal-admin": "Admin Tools dialog",
    "modal-admin-pin": "Admin PIN dialog",
    "modal-admin-userdata": "Admin user-data view (behind the PIN)",
}


def axe_counts(row):
    """(critical+serious nodes, all violation nodes) summed over light + dark."""
    cs = total = 0
    for t in (row.get("axe") or {}).values():
        n = t["nodesByImpact"]
        cs += n.get("critical", 0) + n.get("serious", 0)
        total += sum(n.values())
    return cs, total


def esc(v):
    return "–" if v is None else str(v)


lines = [
    "Lighthouse accessibility score (0–100). The axe columns count failing elements in each",
    "state, light + dark theme added together, so an element that fails in many states (such",
    "as an unlabeled button in the toolbar) is counted in each one. The last column is how many",
    "of 25 scripted Tab presses landed outside the open dialog.",
    "",
    "| Page / state | Lighthouse before | Lighthouse after | axe critical+serious before → after | axe all violations before → after | Focus escaped dialog before → after |",
    "|---|---:|---:|---:|---:|---:|",
]
for state, label in LABELS.items():
    b, a = before.get(state, {}), after.get(state, {})
    bcs, bt = axe_counts(b)
    acs, at = axe_counts(a)
    kb_b = (b.get("keyboard") or {}).get("focusEscapedDialog")
    kb_a = (a.get("keyboard") or {}).get("focusEscapedDialog")
    axe_cs = f"{bcs} → {acs}" if b.get("axe") else "–"
    axe_all = f"{bt} → {at}" if b.get("axe") else "–"
    kb = f"{kb_b} → {kb_a}" if kb_b is not None else "–"
    lines.append(f"| {label} | {esc(b.get('lighthouse'))} | **{esc(a.get('lighthouse'))}** | {axe_cs} | {axe_all} | {kb} |")

# Averages over the states measured in both runs (the admin user-data view
# was only added to the audit later, so it has no desktop "before").
common = [s for s in LABELS if before.get(s, {}).get("lighthouse") is not None and after.get(s, {}).get("lighthouse") is not None]
scores_b = [before[s]["lighthouse"] for s in common]
scores_a = [after[s]["lighthouse"] for s in common]
tot_b = sum(axe_counts(before.get(s, {}))[0] for s in common)
tot_a = sum(axe_counts(after.get(s, {}))[0] for s in common)
all_b = sum(axe_counts(before.get(s, {}))[1] for s in common)
all_a = sum(axe_counts(after.get(s, {}))[1] for s in common)
lines += [
    "",
    f"**Average Lighthouse score: {sum(scores_b) / len(scores_b):.0f} → {sum(scores_a) / len(scores_a):.0f}** "
    f"(lowest {min(scores_b)} → {min(scores_a)}). "
    f"**axe critical + serious: {tot_b} → {tot_a}**; all axe violations: {all_b} → {all_a}.",
]
summary = (
    f"Across the {len(common)} pages and states audited before and after (desktop), the average Lighthouse accessibility score went from "
    f"**{sum(scores_b) / len(scores_b):.0f} to {sum(scores_a) / len(scores_a):.0f}**. The worst page "
    f"went from {min(scores_b)} to {min(scores_a)}. axe-core findings rated critical or serious went "
    f"from **{tot_b} to {tot_a}** (light and dark theme combined). Before, keyboard focus escaped "
    f"all 8 dialogs I measured; now it stays inside every one."
)

# ---- Mobile (320x640): reflow + Lighthouse/axe ----------------------------
mlines = [
    "Same states at a **320×640** viewport, which is what WCAG 1.4.10 Reflow asks for",
    "(320 CSS px = a 1280px screen at 400% zoom). \"Page width\" is the scrollable width of",
    "the page. Anything over 320 means sideways scrolling.",
    "",
    "| Page / state | Lighthouse before | Lighthouse after | Page width before → after (px) | axe critical+serious before → after |",
    "|---|---:|---:|---:|---:|",
]
widths_b, widths_a = [], []
for state, label in LABELS.items():
    b, a = before_m.get(state, {}), after_m.get(state, {})
    if not b and not a:
        continue
    wb = (b.get("layout") or {}).get("overflowX")
    wa = (a.get("layout") or {}).get("overflowX")
    wtxt = f"{320 + wb} → **{320 + wa}**" if wb is not None and wa is not None else "–"
    if wb is not None and wa is not None:
        widths_b.append(320 + wb)
        widths_a.append(320 + wa)
    axe_m = f"{axe_counts(b)[0]} → {axe_counts(a)[0]}" if b.get("axe") else "–"
    mlines.append(f"| {label} | {esc(b.get('lighthouse'))} | **{esc(a.get('lighthouse'))}** | {wtxt} | {axe_m} |")
mcommon = [s for s in LABELS if before_m.get(s, {}).get("lighthouse") is not None and after_m.get(s, {}).get("lighthouse") is not None]
if mcommon:
    mb = [before_m[s]["lighthouse"] for s in mcommon]
    ma = [after_m[s]["lighthouse"] for s in mcommon]
    over_b = sum(1 for w in widths_b if w > 320)
    over_a = sum(1 for w in widths_a if w > 320)
    mlines += [
        "",
        f"**Mobile average Lighthouse: {sum(mb) / len(mb):.0f} → {sum(ma) / len(ma):.0f}** (lowest {min(mb)} → {min(ma)}). "
        f"States wider than the 320px screen: **{over_b} → {over_a}** (widest {max(widths_b)}px → {max(widths_a)}px).",
    ]

# ---- Text spacing (1.4.12) and 200% text (1.4.4), desktop after run --------
llines = [
    "Checked on the fixed version (desktop run). *Text spacing* applies the exact WCAG 1.4.12",
    "values: line height 1.5, paragraph spacing 2×, letter spacing 0.12em, word spacing 0.16em.",
    "*200% text* doubles the root font size. Every size in the app is rem-based, so this",
    "scales all text. Each check counts text that becomes cut off (clipped by an",
    "`overflow:hidden` box) and that was not cut off before.",
    "",
    "| Page / state | Text spacing: newly clipped text | 200% text: newly clipped text | 200% text: sideways overflow (px) |",
    "|---|---:|---:|---:|",
]
ts_fail = t2_fail = 0
for state, label in LABELS.items():
    lay = (after.get(state) or {}).get("layout")
    if not lay:
        continue
    ts_fail += 1 if lay["textSpacingClipped"] else 0
    t2_fail += 1 if (lay["text200Clipped"] or (lay["text200OverflowX"] or 0) > 0) else 0
    llines.append(f"| {label} | {lay['textSpacingClipped']} | {esc(lay['text200Clipped'])} | {esc(lay['text200OverflowX'])} |")
llines += ["", f"States with a text-spacing problem: **{ts_fail}**. States with a 200%-text problem: **{t2_fail}**."]

report = ROOT / "REPORT.md"
text = report.read_text()
block = "<!--SCORES-->\n" + "\n".join(lines) + "\n<!--/SCORES-->"
text = re.sub(r"<!--SCORES-->.*?<!--/SCORES-->", block, text, flags=re.S) if "<!--/SCORES-->" in text else text.replace("<!--SCORES-->", block)
sblock = "<!--SUMMARY-->\n" + summary + "\n<!--/SUMMARY-->"
text = re.sub(r"<!--SUMMARY-->.*?<!--/SUMMARY-->", sblock, text, flags=re.S) if "<!--/SUMMARY-->" in text else text.replace("<!--SUMMARY-->", sblock)
for tag, body in (("MOBILE", mlines), ("LAYOUT", llines)):
    blk = f"<!--{tag}-->\n" + "\n".join(body) + f"\n<!--/{tag}-->"
    if f"<!--/{tag}-->" in text:
        text = re.sub(rf"<!--{tag}-->.*?<!--/{tag}-->", lambda m: blk, text, flags=re.S)
    elif f"<!--{tag}-->" in text:
        text = text.replace(f"<!--{tag}-->", blk)
report.write_text(text)
print("\n".join(mlines))
print("\n".join(llines))
print("\n".join(lines))
print(summary)
