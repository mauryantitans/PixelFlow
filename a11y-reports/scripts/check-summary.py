#!/usr/bin/env python3
"""Fail (exit 1) if an audit summary has any accessibility problem.

  python3 a11y-reports/scripts/check-summary.py a11y-reports/<phase>/summary.json [...]

Checks every state: Lighthouse accessibility 100, no axe violations (light and
dark), no tab stop without a visible focus ring, no focus escaping a dialog, no
reflow overflow or clipped text.
"""

import json
import sys

problems = []
for path in sys.argv[1:]:
    for s in json.load(open(path)):
        name = f"{path}:{s['state']}"
        if s.get("lighthouse") is not None and s["lighthouse"] < 100:
            problems.append(f"{name} Lighthouse {s['lighthouse']} {s.get('lighthouseFailed')}")
        for mode, res in (s.get("axe") or {}).items():
            if res.get("rules"):
                problems.append(f"{name} axe ({mode}): {res['rules']}")
        k = s.get("keyboard") or {}
        if k.get("noVisibleFocus"):
            problems.append(f"{name} {k['noVisibleFocus']} tab stop(s) without visible focus")
        if k.get("focusEscapedDialog"):
            problems.append(f"{name} focus escaped the dialog")
        for key, v in (s.get("layout") or {}).items():
            if v:
                problems.append(f"{name} {key}={v}")
print("\n".join(problems) if problems else f"OK: {len(sys.argv) - 1} summary file(s), no problems")
sys.exit(1 if problems else 0)
