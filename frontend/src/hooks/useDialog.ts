import { useEffect, useRef } from 'react';

/**
 * Accessible modal dialog behaviour (WCAG 2.1.2 No Keyboard Trap, 2.4.3 Focus
 * Order, 4.1.2 Name/Role/Value):
 *  - moves focus into the dialog when it opens ([data-autofocus] element, else
 *    the first focusable control, else the dialog container itself)
 *  - keeps Tab / Shift+Tab cycling inside the dialog while it is open
 *  - closes on Escape (only the top-most dialog when several are stacked)
 *  - returns focus to the element that opened it when it closes
 *
 * Usage:
 *   const dialogRef = useDialog<HTMLDivElement>(isOpen, onClose);
 *   <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="x" tabIndex={-1}>
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Stack of open dialogs so Escape/Tab only act on the top-most one.
const openDialogs: HTMLElement[] = [];

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.closest('[aria-hidden="true"]')) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && el.getClientRects().length > 0;
  });
}

export function useDialog<T extends HTMLElement>(isOpen: boolean, onClose?: () => void) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const node = ref.current;
    if (!node) return;

    const opener = document.activeElement as HTMLElement | null;
    openDialogs.push(node);

    const focusInitial = () => {
      if (node.contains(document.activeElement)) return;
      const preferred = node.querySelector<HTMLElement>('[data-autofocus]');
      const target = preferred || getFocusable(node)[0] || node;
      target.focus({ preventScroll: false });
    };
    // Wait a frame so conditionally rendered content is in the DOM.
    const raf = window.requestAnimationFrame(focusInitial);

    const onKeyDown = (e: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== node) return;
      if (e.key === 'Escape' && onCloseRef.current) {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = getFocusable(node);
      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !node.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      const i = openDialogs.lastIndexOf(node);
      if (i !== -1) openDialogs.splice(i, 1);
      // Return focus to whatever opened the dialog (if it still exists).
      if (opener && document.contains(opener) && typeof opener.focus === 'function') {
        opener.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  return ref;
}

export default useDialog;
