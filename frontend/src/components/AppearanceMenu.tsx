import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, Moon, Palette, Sun } from 'lucide-react';
import { useAppearance } from '../theme/appearance';
import { UI_THEMES, themeSwatches } from '../theme/themes';
import { announce } from '../utils/announce';

/**
 * Header popover for choosing a theme and light/dark mode.
 *
 * A disclosure (button + non-modal panel) holding two native radio groups, so
 * arrow keys move between options and screen readers announce "1 of 7".
 * Escape or a click outside closes it and returns focus to the button.
 */
export const AppearanceMenu: React.FC = () => {
  const { themeId, mode, setThemeId, setMode } = useAppearance();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const headingId = useId();

  useEffect(() => {
    if (!open) return;
    // Focus the selected theme so arrow keys work straight away.
    panelRef.current?.querySelector<HTMLInputElement>('input[name="pf-ui-theme"]:checked')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const chooseTheme = (id: (typeof UI_THEMES)[number]['id']) => {
    setThemeId(id);
    announce(`${UI_THEMES.find((t) => t.id === id)?.label} theme`);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Appearance"
        title="Appearance"
        className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-slate-300 transition-colors"
      >
        <Palette aria-hidden="true" className="w-5 h-5" />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={headingId}
          className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[23rem] max-h-[75vh] overflow-y-auto z-[60] rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl p-4 text-left"
        >
          <h2 id={headingId} className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Appearance
          </h2>

          <fieldset className="mt-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
              Mode
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(['light', 'dark'] as const).map((m) => (
                <label
                  key={m}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium cursor-pointer transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue-700 dark:has-[:focus-visible]:outline-blue-300 ${
                    mode === m
                      ? 'border-zinc-900 dark:border-zinc-50 bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900'
                      : 'border-slate-300 dark:border-zinc-600 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-zinc-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="pf-ui-mode"
                    value={m}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    className="sr-only"
                  />
                  {m === 'light' ? <Sun aria-hidden="true" className="w-4 h-4" /> : <Moon aria-hidden="true" className="w-4 h-4" />}
                  {m === 'light' ? 'Light' : 'Dark'}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-4">
            <legend className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
              Theme
            </legend>
            <div className="grid gap-1.5">
              {UI_THEMES.map((t) => {
                const sw = themeSwatches(t.id)[mode];
                const selected = themeId === t.id;
                return (
                  <label
                    key={t.id}
                    className={`flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue-700 dark:has-[:focus-visible]:outline-blue-300 ${
                      selected
                        ? 'border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <input
                      type="radio"
                      name="pf-ui-theme"
                      value={t.id}
                      checked={selected}
                      onChange={() => chooseTheme(t.id)}
                      className="sr-only"
                    />
                    {/* Mini preview of the theme in the current mode. */}
                    <span
                      aria-hidden="true"
                      className="relative shrink-0 w-14 h-10 rounded-md overflow-hidden border border-black/10 dark:border-white/10"
                      style={{ background: sw.page }}
                    >
                      <span className="absolute left-1.5 top-1.5 right-1.5 bottom-1.5 rounded-[4px]" style={{ background: sw.surface }} />
                      <span className="absolute left-3 top-3 w-5 h-1 rounded-full" style={{ background: sw.text, opacity: 0.85 }} />
                      <span className="absolute left-3 top-5 w-7 h-1.5 rounded-full" style={{ background: sw.accent }} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900 dark:text-slate-50">{t.label}</span>
                      <span className="block text-xs text-slate-600 dark:text-slate-400">{t.description}</span>
                    </span>
                    {selected && <Check aria-hidden="true" className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">Saved in this browser.</p>
        </div>
      )}
    </div>
  );
};

export default AppearanceMenu;
