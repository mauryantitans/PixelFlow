#!/usr/bin/env python3
"""
Generate src/theme/palettes.generated.ts: the colour scales for each UI theme.

Every Tailwind colour class in the app reads a CSS variable (see tailwind.config.js),
so a theme only has to supply new values for those variables.

Accessibility by construction: each generated shade has the *same relative
luminance* as the Tailwind shade it replaces (neutrals match slate/gray/zinc,
accents match blue). WCAG contrast depends only on luminance, so every
text/background pair that passed with the default palette keeps the same ratio
in every theme. Only hue and chroma change.

Run from frontend/:  python3 scripts/gen-themes.py
"""

from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path

SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"]
NEUTRAL_PALETTES = ["slate", "gray", "zinc", "neutral", "stone"]
ACCENT_PALETTES = ["blue", "indigo", "sky"]
DECORATIVE_PALETTES = ["purple", "violet", "fuchsia", "pink", "rose", "cyan", "teal", "emerald", "lime"]
# red / orange / amber / yellow / green stay as they are: they carry meaning (error, warning, success).

# Optional per-theme luminance overrides for the darkest neutrals. Only ever
# *darker* than the default: dark surfaces then contrast more with light text,
# never less. Verdant's dark mode is near-black.
DEEPER_DARKS = {"verdant": {"900": 0.0052, "950": 0.0011}}

# id: (neutral hue, neutral chroma, accent hue, accent max chroma, decorative -> "accent" | "neutral")
THEMES = {
    "spectrum": (275, 0.006, 262, 0.21, "neutral"),
    "verdant": (160, 0.005, 157, 0.16, "accent"),
    "cobalt": (258, 0.016, 266, 0.22, "accent"),
    "safelight": (62, 0.013, 66, 0.17, "accent"),
    "fjord": (232, 0.024, 208, 0.11, "accent"),
    "orchid": (318, 0.012, 304, 0.19, "accent"),
}


def tailwind_colors() -> dict:
    out = subprocess.run(
        ["node", "-e", "process.stdout.write(JSON.stringify(require('tailwindcss/colors')))"],
        capture_output=True, text=True, check=True,
    ).stdout
    return json.loads(out)


def hex_to_rgb(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]


def to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def to_srgb(c: float) -> float:
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def luminance_of_linear(r: float, g: float, b: float) -> float:
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def hex_luminance(h: str) -> float:
    return luminance_of_linear(*(to_linear(c) for c in hex_to_rgb(h)))


def oklch_to_linear(L: float, C: float, H: float) -> tuple[float, float, float]:
    a, b = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s_ = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    return (
        4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
        -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
        -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_,
    )


def in_gamut(rgb) -> bool:
    return all(-1e-6 <= c <= 1 + 1e-6 for c in rgb)


def shade_for(target_y: float, hue: float, max_chroma: float, chroma_scale: float) -> str:
    """Find an in-gamut OKLCH colour with this hue whose luminance equals target_y."""
    chroma = max_chroma * chroma_scale
    for _ in range(60):  # reduce chroma until a matching in-gamut lightness exists
        lo, hi = 0.0, 1.0
        for _ in range(60):
            mid = (lo + hi) / 2
            rgb = [min(1, max(0, c)) for c in oklch_to_linear(mid, chroma, hue)]
            if luminance_of_linear(*rgb) < target_y:
                lo = mid
            else:
                hi = mid
        rgb = oklch_to_linear(hi, chroma, hue)
        if in_gamut(rgb) and abs(luminance_of_linear(*rgb) - target_y) < target_y * 0.004 + 1e-5:
            return "#" + "".join(f"{round(to_srgb(max(0, min(1, c))) * 255):02x}" for c in rgb)
        chroma *= 0.92
    raise RuntimeError("no colour found")


# Chroma profile across the scale: muted at the very light / very dark ends.
CHROMA_PROFILE = {"50": 0.25, "100": 0.4, "200": 0.6, "300": 0.8, "400": 0.95, "500": 1, "600": 1, "700": 0.92, "800": 0.8, "900": 0.65, "950": 0.5}


def triplet(h: str) -> str:
    r, g, b = (round(c * 255) for c in hex_to_rgb(h))
    return f"{r} {g} {b}"


def main() -> None:
    tw = tailwind_colors()
    neutral_y = {s: sorted(hex_luminance(tw[p][s]) for p in ("slate", "gray", "zinc"))[1] for s in SHADES}
    accent_y = {s: hex_luminance(tw["blue"][s]) for s in SHADES}

    themes: dict[str, dict] = {}
    for tid, (nh, nc, ah, ac, deco) in THEMES.items():
        ny = {**neutral_y, **{k: min(v, neutral_y[k]) for k, v in DEEPER_DARKS.get(tid, {}).items()}}
        neutral = {s: shade_for(ny[s], nh, nc, 1.0) for s in SHADES}
        accent = {s: shade_for(accent_y[s], ah, ac, CHROMA_PROFILE[s]) for s in SHADES}
        themes[tid] = {"neutral": neutral, "accent": accent, "decorative": deco}

    lines = [
        "// Generated by scripts/gen-themes.py. Do not edit by hand.",
        "// Each shade has the same luminance as the Tailwind shade it replaces, so WCAG",
        "// contrast is unchanged in every theme.",
        "",
        "export type Scale = Record<string, string>; // shade -> 'r g b'",
        "",
        f"export const NEUTRAL_PALETTES = {json.dumps(NEUTRAL_PALETTES)} as const;",
        f"export const ACCENT_PALETTES = {json.dumps(ACCENT_PALETTES)} as const;",
        f"export const DECORATIVE_PALETTES = {json.dumps(DECORATIVE_PALETTES)} as const;",
        "",
        "export interface GeneratedPalette {",
        "  neutral: Scale;",
        "  accent: Scale;",
        "  /** Where purple/pink/teal/… go: the accent, or the neutral scale. */",
        "  decorative: 'accent' | 'neutral';",
        "  /** Hex values, for swatches in the theme picker. */",
        "  hex: { neutral: Record<string, string>; accent: Record<string, string> };",
        "}",
        "",
        "export const GENERATED_PALETTES: Record<string, GeneratedPalette> = {",
    ]
    for tid, t in themes.items():
        lines.append(f"  {tid}: {{")
        lines.append(f"    neutral: {json.dumps({s: triplet(h) for s, h in t['neutral'].items()})},")
        lines.append(f"    accent: {json.dumps({s: triplet(h) for s, h in t['accent'].items()})},")
        lines.append(f"    decorative: '{t['decorative']}',")
        lines.append(f"    hex: {{ neutral: {json.dumps(t['neutral'])}, accent: {json.dumps(t['accent'])} }},")
        lines.append("  },")
    lines.append("};")
    lines.append("")
    lines.append("/** Tailwind defaults used by the Classic theme's swatches. */")
    lines.append(
        "export const CLASSIC_HEX = "
        + json.dumps({"neutral": tw["zinc"], "slate": tw["slate"], "accent": tw["blue"]})
        + ";"
    )
    lines.append("")

    out = Path(__file__).resolve().parent.parent / "src" / "theme" / "palettes.generated.ts"
    out.parent.mkdir(exist_ok=True)
    out.write_text("\n".join(lines))

    # Report: worst luminance mismatch, so a regression is visible when tuning.
    worst = 0.0
    for t in themes.values():
        for s in SHADES:
            if s not in DEEPER_DARKS.get(next(k for k, v in themes.items() if v is t), {}):
                worst = max(worst, abs(hex_luminance(t["neutral"][s]) - neutral_y[s]) / neutral_y[s])
            worst = max(worst, abs(hex_luminance(t["accent"][s]) - accent_y[s]) / accent_y[s])
    print(f"wrote {out} ({len(themes)} themes); worst luminance mismatch {worst * 100:.2f}% (rounding)")
    for tid, t in themes.items():
        print(f"  {tid:10s} neutral 50/500/900/950 {t['neutral']['50']} {t['neutral']['500']} {t['neutral']['900']} {t['neutral']['950']}"
              f"  accent 100/400/600/700 {t['accent']['100']} {t['accent']['400']} {t['accent']['600']} {t['accent']['700']}")


if __name__ == "__main__":
    main()
