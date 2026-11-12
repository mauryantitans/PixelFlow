import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authService } from '../services/auth';
import { useAppearance } from './appearance';
import { getUiTheme } from './themes';

/**
 * Keeps the appearance in step with the signed-in account:
 *  - on sign-in, the account's saved theme/mode is applied (or, if it has none
 *    yet, the browser's current choice is saved to it);
 *  - while signed in, changes are saved (debounced).
 * Signed-out visitors keep the per-browser choice only. Renders nothing.
 */
export default function AppearanceSync() {
  const { user } = useAuth();
  const { themeId, mode, setThemeId, setMode } = useAppearance();
  const syncedFor = useRef<number | null>(null);
  const lastSaved = useRef('');
  const key = `${themeId}|${mode}`;

  // Sign-in: adopt the account's preferences, or seed them.
  useEffect(() => {
    if (!user) {
      syncedFor.current = null;
      return;
    }
    if (syncedFor.current === user.id) return;
    syncedFor.current = user.id;
    const prefs = user.preferences ?? {};
    const theme = prefs.ui_theme && getUiTheme(prefs.ui_theme).id === prefs.ui_theme ? getUiTheme(prefs.ui_theme).id : null;
    const savedMode = prefs.mode === 'light' || prefs.mode === 'dark' ? prefs.mode : null;
    if (theme || savedMode) {
      if (theme) setThemeId(theme);
      if (savedMode) setMode(savedMode);
      lastSaved.current = `${theme ?? themeId}|${savedMode ?? mode}`;
    } else {
      lastSaved.current = key;
      authService.updatePreferences({ ui_theme: themeId, mode }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Changes while signed in are saved to the account.
  useEffect(() => {
    if (!user || syncedFor.current !== user.id || key === lastSaved.current) return;
    const t = window.setTimeout(() => {
      lastSaved.current = key;
      authService.updatePreferences({ ui_theme: themeId, mode }).catch(() => {
        lastSaved.current = ''; // try again on the next change
      });
    }, 600);
    return () => window.clearTimeout(t);
  }, [key, themeId, mode, user]);

  return null;
}
