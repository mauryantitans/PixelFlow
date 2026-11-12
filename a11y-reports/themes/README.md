# Accessibility by theme

Every appearance theme was audited with the same script and states as the main report
([../REPORT.md](../REPORT.md)): Lighthouse accessibility, axe-core (WCAG 2.0/2.1 A + AA) in light
**and** dark mode, keyboard focus, and at 320px reflow, text spacing and 200% text.

| Theme | Desktop (1440×900) | Mobile (320×640) |
|---|---|---|
| Classic | 24 states · Lighthouse 100 · axe 0 · focus 0 · layout 0 | — |
| Spectrum | 24 states · Lighthouse 100 · axe 0 · focus 0 · layout 0 | 24 states · Lighthouse 100 · axe 0 · focus 0 · layout 0 |
| Verdant | 24 states · Lighthouse 100 · axe 0 · focus 0 · layout 0 | 24 states · Lighthouse 100 · axe 0 · focus 0 · layout 0 |
| Cobalt | 24 states · Lighthouse 100 · axe 0 · focus 0 · layout 0 | 24 states · Lighthouse 100 · axe 0 · focus 0 · layout 0 |
| Fjord | 24 states · Lighthouse 100 · axe 0 · focus 0 · layout 0 | 24 states · Lighthouse 100 · axe 0 · focus 0 · layout 0 |
| Orchid | 24 states · Lighthouse 100 · axe 0 · focus 0 · layout 0 | 24 states · Lighthouse 100 · axe 0 · focus 0 · layout 0 |
| Safelight | 24 states · Lighthouse 100 · axe 0 · focus 0 · layout 0 | 24 states · Lighthouse 100 · axe 0 · focus 0 · layout 0 |

Lighthouse is the lowest score; axe counts violating nodes in light and dark; focus counts tab stops
without a visible focus indicator; layout counts reflow overflow and clipped text. Classic was re-audited on desktop after the
theme engine landed to confirm it is unchanged; its full desktop and mobile results are in
`../after/` and `../after-mobile/`.

Why every theme passes: `frontend/scripts/gen-themes.py` gives each theme shade the same relative
luminance as the Tailwind shade it replaces, so every contrast ratio is identical to Classic's.

Re-run one theme:

```bash
UI_THEME=verdant PHASE=themes/verdant TOOLS=… IMG1=… USER_EMAIL=… USER_PASSWORD=… ADMIN_EMAIL=… ADMIN_PASSWORD=… node a11y-reports/scripts/audit.js
```
