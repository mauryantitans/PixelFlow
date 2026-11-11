/** @type {import('tailwindcss').Config} */
const defaults = require('tailwindcss/colors');

// Every palette the app uses reads a CSS variable, with Tailwind's own value as the
// fallback. The Classic theme sets no variables (so it looks exactly like Tailwind);
// other themes set them from src/theme (see applyUiTheme). Alpha modifiers such as
// bg-blue-900/30 keep working through <alpha-value>.
const THEMED = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky',
  'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];

const rgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
};

const themed = Object.fromEntries(
  THEMED.map((name) => [
    name,
    Object.fromEntries(
      Object.entries(defaults[name]).map(([shade, hex]) => [
        shade,
        `rgb(var(--c-${name}-${shade}, ${rgb(hex)}) / <alpha-value>)`,
      ]),
    ),
  ]),
);

module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // Set per theme by applyUiTheme; Inter is the Classic face.
        sans: ['var(--font-sans, Inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        inter: ['var(--font-sans, Inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono, ui-monospace)', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
        display: ['var(--font-display, var(--font-sans, Inter))', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: themed,
      animation: {
        'spin': 'spin 1s linear infinite',
      },
      transitionProperty: {
        'width': 'width',
        'spacing': 'margin, padding',
      }
    },
  },
  plugins: [],
}
