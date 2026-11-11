import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Is the frontend able to reach the backend?
 *
 * Pings the cheap `GET /api/health` endpoint (no database work, no session
 * writes, exempt from rate limiting):
 *  - right away, then about once a minute while the tab is visible;
 *  - immediately when the tab becomes visible again or the network returns;
 *  - never while the tab is hidden;
 *  - with growing back-off (5s, 10s, 20s … max 60s) while it is failing.
 *
 * A request that takes longer than `slowMs` is reported as "waking": on
 * Render's free tier the backend sleeps after inactivity and the first request
 * can take up to a minute.
 */
export type ConnectionState = 'checking' | 'connected' | 'waking' | 'unreachable' | 'offline';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';
const HEALTH_URL = `${API_BASE}/health`;

interface Options {
  intervalMs?: number;
  slowMs?: number;
  timeoutMs?: number;
}

export function useConnectionStatus({ intervalMs = 60000, slowMs = 4000, timeoutMs = 75000 }: Options = {}) {
  const [state, setState] = useState<ConnectionState>('checking');
  const failures = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef<AbortController | null>(null);
  const checkRef = useRef<() => void>(() => {});

  const schedule = useCallback(() => {
    window.clearTimeout(timer.current);
    if (typeof document !== 'undefined' && document.hidden) return;
    const delay = failures.current > 0 ? Math.min(60000, 5000 * 2 ** (failures.current - 1)) : intervalMs;
    timer.current = window.setTimeout(() => checkRef.current(), delay);
  }, [intervalMs]);

  const check = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setState('offline');
      return; // the 'online' event triggers the next check
    }
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    const slow = window.setTimeout(() => setState('waking'), slowMs);
    const hardTimeout = window.setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(HEALTH_URL, { cache: 'no-store', credentials: 'omit', signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      failures.current = 0;
      setState('connected');
    } catch {
      if (inFlight.current !== ctrl) return; // superseded by a newer check
      failures.current += 1;
      setState(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'unreachable');
    } finally {
      window.clearTimeout(slow);
      window.clearTimeout(hardTimeout);
      if (inFlight.current === ctrl) {
        inFlight.current = null;
        schedule();
      }
    }
  }, [schedule, slowMs, timeoutMs]);

  checkRef.current = check;

  useEffect(() => {
    check();
    const onVisibility = () => {
      if (document.hidden) window.clearTimeout(timer.current);
      else check();
    };
    const onOnline = () => check();
    const onOffline = () => {
      window.clearTimeout(timer.current);
      setState('offline');
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.clearTimeout(timer.current);
      inFlight.current?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [check]);

  const retry = useCallback(() => {
    failures.current = 0;
    setState('checking');
    check();
  }, [check]);

  return { state, retry };
}

export default useConnectionStatus;
