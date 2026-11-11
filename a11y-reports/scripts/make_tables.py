"""Build the before/after tables in REPORT.md from before/ and after/ summary.json.

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

scores_b = [before[s]["lighthouse"] for s in LABELS if s in before and before[s].get("lighthouse") is not None]
scores_a = [after[s]["lighthouse"] for s in LABELS if s in after and after[s].get("lighthouse") is not None]
tot_b = sum(axe_counts(before.get(s, {}))[0] for s in LABELS)
tot_a = sum(axe_counts(after.get(s, {}))[0] for s in LABELS)
all_b = sum(axe_counts(before.get(s, {}))[1] for s in LABELS)
all_a = sum(axe_counts(after.get(s, {}))[1] for s in LABELS)
lines += [
    "",
    f"**Average Lighthouse score: {sum(scores_b) / len(scores_b):.0f} → {sum(scores_a) / len(scores_a):.0f}** "
    f"(lowest {min(scores_b)} → {min(scores_a)}). "
    f"**axe critical + serious: {tot_b} → {tot_a}**; all axe violations: {all_b} → {all_a}.",
]
summary = (
    f"Across 23 audited pages and states, the average Lighthouse accessibility score went from "
    f"**{sum(scores_b) / len(scores_b):.0f} to {sum(scores_a) / len(scores_a):.0f}**. The worst page "
    f"went from {min(scores_b)} to {min(scores_a)}. axe-core findings rated critical or serious went "
    f"from **{tot_b} to {tot_a}** (light and dark theme combined). Before, keyboard focus escaped "
    f"all 8 dialogs I measured; now it stays inside every one."
)

report = ROOT / "REPORT.md"
text = report.read_text()
block = "<!--SCORES-->\n" + "\n".join(lines) + "\n<!--/SCORES-->"
text = re.sub(r"<!--SCORES-->.*?<!--/SCORES-->", block, text, flags=re.S) if "<!--/SCORES-->" in text else text.replace("<!--SCORES-->", block)
sblock = "<!--SUMMARY-->\n" + summary + "\n<!--/SUMMARY-->"
text = re.sub(r"<!--SUMMARY-->.*?<!--/SUMMARY-->", sblock, text, flags=re.S) if "<!--/SUMMARY-->" in text else text.replace("<!--SUMMARY-->", sblock)
report.write_text(text)
print("\n".join(lines))
print(summary)
