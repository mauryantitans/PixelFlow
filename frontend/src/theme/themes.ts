/**
 * UI themes: colour scales, typefaces and copy for the appearance picker.
 *
 * Colours: every Tailwind palette class reads a CSS variable (tailwind.config.js)
 * whose fallback is Tailwind's own value. Classic sets none of them; the other
 * themes set the neutral palettes (slate/gray/zinc…), the accent palettes
 * (blue/indigo/sky) and the decorative ones (purple/pink/teal…) from
 * palettes.generated.ts. Red/orange/amber/yellow/green keep their meaning
 * (error, warning, success) in every theme.
 */
import {
  ACCENT_PALETTES,
  CLASSIC_HEX,
  DECORATIVE_PALETTES,
  GENERATED_PALETTES,
  NEUTRAL_PALETTES,
} from './palettes.generated';

export type UiThemeId = 'classic' | 'spectrum' | 'verdant' | 'cobalt' | 'fjord' | 'orchid' | 'safelight';

export interface UiTheme {
  id: UiThemeId;
  label: string;
  description: string;
  fonts: {
    sans: string;
    mono?: string;
    display?: string;
    /** Google Fonts css2 `family=` parameters; Inter is always loaded. */
    google?: string;
  };
  /** Bar colour for the mobile browser chrome, per mode. */
  themeColor: { light: string; dark: string };
}

export const UI_THEMES: UiTheme[] = [
  {
    id: 'classic',
    label: 'Classic',
    description: 'The original PixelFlow look: blue accents and colourful library groups.',
    fonts: { sans: 'Inter' },
    themeColor: { light: '#ffffff', dark: '#18181b' },
  },
  {
    id: 'spectrum',
    label: 'Spectrum',
    description: 'Monochrome, with red, green and blue only where they mean something.',
    fonts: { sans: '"Geist"', mono: '"Geist Mono"', google: 'family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500' },
    themeColor: { light: '#ffffff', dark: '#17181b' },
  },
  {
    id: 'verdant',
    label: 'Verdant',
    description: 'Black and white with a calm green accent.',
    fonts: { sans: '"Manrope"', mono: '"JetBrains Mono"', google: 'family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500' },
    themeColor: { light: '#ffffff', dark: '#0e110f' },
  },
  {
    id: 'cobalt',
    label: 'Cobalt',
    description: 'Cool greys and one deep cobalt blue.',
    fonts: { sans: '"IBM Plex Sans"', mono: '"IBM Plex Mono"', google: 'family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500' },
    themeColor: { light: '#ffffff', dark: '#141820' },
  },
  {
    id: 'fjord',
    label: 'Fjord',
    description: 'Soft blue-grey with a teal accent; low glare for long sessions.',
    fonts: { sans: '"Figtree"', mono: '"Fira Code"', google: 'family=Figtree:wght@400;500;600;700&family=Fira+Code:wght@400;500' },
    themeColor: { light: '#ffffff', dark: '#0c1a21' },
  },
  {
    id: 'orchid',
    label: 'Orchid',
    description: 'Gentle mauve greys with a violet accent.',
    fonts: { sans: '"DM Sans"', mono: '"DM Mono"', google: 'family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Mono:wght@400;500' },
    themeColor: { light: '#ffffff', dark: '#1b171c' },
  },
  {
    id: 'safelight',
    label: 'Safelight',
    description: 'Warm charcoal and darkroom amber. Best in dark mode.',
    fonts: {
      sans: 'Inter',
      display: '"Bricolage Grotesque"',
      mono: '"JetBrains Mono"',
      google: 'family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=JetBrains+Mono:wght@400;500',
    },
    themeColor: { light: '#ffffff', dark: '#1d1712' },
  },
];

export const DEFAULT_UI_THEME: UiThemeId = 'classic';

export function getUiTheme(id: string | null | undefined): UiTheme {
  return UI_THEMES.find((t) => t.id === id) ?? UI_THEMES[0];
}

/** Swatches for the picker: page, surface, accent and text in each mode (hex). */
export function themeSwatches(id: UiThemeId) {
  const p = GENERATED_PALETTES[id];
  const n = p ? p.hex.neutral : CLASSIC_HEX.neutral;
  const a = p ? p.hex.accent : CLASSIC_HEX.accent;
  return {
    light: { page: n['50'], surface: '#ffffff', accent: a['600'], text: n['900'] },
    dark: { page: n['950'], surface: n['900'], accent: a['400'], text: n['50'] },
  };
}

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const ALL_THEMED = [...NEUTRAL_PALETTES, ...ACCENT_PALETTES, ...DECORATIVE_PALETTES];
const FONT_LINK_ID = 'pf-theme-fonts';

/** Apply a theme to the document: colour variables, fonts, data attribute, browser bar colour. */
export function applyUiTheme(id: UiThemeId, mode: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const theme = getUiTheme(id);
  const palette = GENERATED_PALETTES[theme.id];

  for (const name of ALL_THEMED) {
    for (const shade of SHADES) root.style.removeProperty(`--c-${name}-${shade}`);
  }
  if (palette) {
    const set = (names: readonly string[], scale: Record<string, string>) => {
      for (const name of names) for (const shade of SHADES) root.style.setProperty(`--c-${name}-${shade}`, scale[shade]);
    };
    set(NEUTRAL_PALETTES, palette.neutral);
    set(ACCENT_PALETTES, palette.accent);
    set(DECORATIVE_PALETTES, palette.decorative === 'accent' ? palette.accent : palette.neutral);
  }

  const setFont = (prop: string, family?: string) => {
    if (family) root.style.setProperty(prop, family);
    else root.style.removeProperty(prop);
  };
  setFont('--font-sans', theme.id === 'classic' ? undefined : theme.fonts.sans);
  setFont('--font-mono', theme.fonts.mono);
  setFont('--font-display', theme.fonts.display);
  root.dataset.uiTheme = theme.id;

  // Load only the selected theme's typefaces.
  let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
  if (theme.fonts.google) {
    const href = `https://fonts.googleapis.com/css2?${theme.fonts.google}&display=swap`;
    if (!link) {
      link = document.createElement('link');
      link.id = FONT_LINK_ID;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
  } else if (link) {
    link.remove();
  }

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme.themeColor[mode]);
}
