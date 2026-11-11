/**
 * The viewer's appearance: UI theme + light/dark mode, kept in localStorage and
 * shared by every component through a tiny external store (so the header's mode
 * toggle and the appearance picker always agree).
 */
import { useCallback, useSyncExternalStore } from 'react';
import { applyUiTheme, DEFAULT_UI_THEME, getUiTheme, UiThemeId } from './themes';

export type Mode = 'light' | 'dark';

const THEME_KEY = 'pixelflow_ui_theme';
const MODE_KEY = 'pixelflow_theme'; // existing key, kept so saved preferences survive
const EVENT = 'pixelflow:appearance-change';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / blocked storage: the choice just isn't remembered */
  }
}

function systemMode(): Mode {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function getThemeId(): UiThemeId {
  return getUiTheme(read(THEME_KEY) ?? DEFAULT_UI_THEME).id;
}

export function getMode(): Mode {
  const saved = read(MODE_KEY);
  return saved === 'dark' || saved === 'light' ? saved : systemMode();
}

function applyAll(): void {
  const mode = getMode();
  document.documentElement.classList.toggle('dark', mode === 'dark');
  applyUiTheme(getThemeId(), mode);
}

export function setThemeId(id: UiThemeId): void {
  write(THEME_KEY, id);
  applyAll();
  window.dispatchEvent(new Event(EVENT));
}

export function setMode(mode: Mode): void {
  write(MODE_KEY, mode);
  applyAll();
  window.dispatchEvent(new Event(EVENT));
}

/** Call once before the first render so the page never flashes the wrong theme. */
export function initAppearance(): void {
  applyAll();
  // Another tab changed it.
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_KEY || e.key === MODE_KEY) {
      applyAll();
      window.dispatchEvent(new Event(EVENT));
    }
  });
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

export function useAppearance() {
  const themeId = useSyncExternalStore(subscribe, getThemeId, () => DEFAULT_UI_THEME);
  const mode = useSyncExternalStore(subscribe, getMode, (): Mode => 'light');
  const toggleMode = useCallback(() => setMode(getMode() === 'dark' ? 'light' : 'dark'), []);
  return { themeId, mode, setThemeId, setMode, toggleMode };
}
