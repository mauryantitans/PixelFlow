/**
 * Sends uncaught browser errors to POST /api/client-errors, where they're
 * logged and (when the server has SENTRY_DSN) forwarded to Sentry. No SDK, no
 * personal data: message, stack, path and user agent only. Duplicates are
 * dropped and at most 20 reports leave a page load.
 */
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';
const seen = new Set<string>();
let sent = 0;

export function reportError(kind: string, error: unknown): void {
  try {
    const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));
    const key = `${kind}|${err.message}`;
    if (seen.has(key) || sent >= 20) return;
    seen.add(key);
    sent += 1;
    fetch(`${API_BASE}/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      keepalive: true,
      body: JSON.stringify({
        kind,
        message: err.message.slice(0, 1900),
        stack: (err.stack || '').slice(0, 7900),
        path: window.location.pathname.slice(0, 290),
        user_agent: navigator.userAgent.slice(0, 290),
      }),
    })
      .then((r) => r.text())
      .catch(() => {});
  } catch {
    /* reporting must never throw */
  }
}

export function installErrorReporter(): void {
  window.addEventListener('error', (e) => {
    // Resource load errors (img/script) have no error object; ignore them.
    if (e.error) reportError('error', e.error);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    // Cancelled requests are expected (live preview supersedes them).
    if (reason?.name === 'CanceledError' || reason?.name === 'AbortError' || reason?.code === 'ERR_CANCELED') return;
    reportError('unhandledrejection', reason);
  });
}
