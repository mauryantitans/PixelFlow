import React from 'react';

/**
 * Arrow-key navigation for a WAI-ARIA tablist (roving tabindex):
 * Left/Right (or Up/Down) move to the previous/next tab and activate it,
 * Home/End jump to the first/last tab.
 */
export function handleTabListKeyDown<T extends string>(
  e: React.KeyboardEvent,
  ids: readonly T[],
  active: T,
  setActive: (id: T) => void,
  idPrefix: string
) {
  const i = ids.indexOf(active);
  let next = -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % ids.length;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + ids.length) % ids.length;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = ids.length - 1;
  if (next === -1) return;
  e.preventDefault();
  setActive(ids[next]);
  document.getElementById(`${idPrefix}-${ids[next]}`)?.focus();
}
