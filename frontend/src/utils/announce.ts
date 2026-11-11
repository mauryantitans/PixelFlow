/**
 * Screen-reader announcements (WCAG 4.1.3 Status Messages).
 *
 * Two visually hidden live regions are appended to <body> once. `announce()`
 * writes a message into the polite one (or the assertive one for errors), so
 * assistive tech reads it out without moving keyboard focus.
 */
type Politeness = 'polite' | 'assertive';

const regions: Partial<Record<Politeness, HTMLElement>> = {};

function getRegion(politeness: Politeness): HTMLElement {
  const existing = regions[politeness];
  if (existing && document.body.contains(existing)) return existing;
  const el = document.createElement('div');
  el.setAttribute('aria-live', politeness);
  el.setAttribute('aria-atomic', 'true');
  el.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
  el.className = 'sr-only';
  el.dataset.liveRegion = politeness;
  document.body.appendChild(el);
  regions[politeness] = el;
  return el;
}

export function announce(message: string, politeness: Politeness = 'polite'): void {
  if (typeof document === 'undefined' || !message) return;
  const region = getRegion(politeness);
  // Clear first so repeating the same message is still announced.
  region.textContent = '';
  window.setTimeout(() => {
    region.textContent = message;
  }, 50);
}
