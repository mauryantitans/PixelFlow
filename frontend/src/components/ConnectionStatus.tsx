import React, { useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { ConnectionState, useConnectionStatus } from '../hooks/useConnectionStatus';
import { announce } from '../utils/announce';

const COPY: Record<ConnectionState, { label: string; detail?: string; tone: 'ok' | 'wait' | 'bad' }> = {
  checking: { label: 'Connecting…', tone: 'wait' },
  connected: { label: 'Server connected', tone: 'ok' },
  waking: { label: 'Server waking up…', detail: 'The first request can take up to a minute.', tone: 'wait' },
  unreachable: { label: "Can't reach server", detail: 'Retrying automatically.', tone: 'bad' },
  offline: { label: "You're offline", detail: 'Check your internet connection.', tone: 'bad' },
};

const TONE_CLASSES = {
  ok: 'bg-slate-100 dark:bg-zinc-800 border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-slate-300',
  wait: 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200',
  bad: 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200',
};

const DOT_CLASSES = {
  ok: 'bg-green-600',
  wait: 'bg-amber-500 animate-pulse',
  bad: 'bg-red-600',
};

/**
 * Shows whether the frontend can reach the backend (replaces the old
 * "Session - Active" badge, which was driven by a database-writing heartbeat).
 * The state is always spelled out in text (not colour alone), changes are
 * announced to screen readers, and failures offer a Retry button.
 */
export const ConnectionStatus: React.FC = () => {
  const { state, retry } = useConnectionStatus();
  const previous = useRef<ConnectionState>('checking');

  useEffect(() => {
    const prev = previous.current;
    previous.current = state;
    if (prev === state) return;
    // Don't announce the routine "connecting → connected" on every page load.
    if (prev === 'checking' && state === 'connected') return;
    const c = COPY[state];
    announce(c.detail ? `${c.label} ${c.detail}` : c.label, c.tone === 'bad' ? 'assertive' : 'polite');
  }, [state]);

  const c = COPY[state];
  return (
    <div
      className={`flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg border text-sm ${TONE_CLASSES[c.tone]}`}
      data-connection-state={state}
    >
      <span aria-hidden="true" className={`w-2 h-2 rounded-full ${DOT_CLASSES[c.tone]}`} />
      <span className="font-medium">{c.label}</span>
      {c.detail && <span className="text-xs">{c.detail}</span>}
      {(state === 'unreachable' || state === 'offline') && (
        <button
          type="button"
          onClick={retry}
          className="inline-flex items-center gap-1 text-xs font-semibold underline hover:no-underline"
        >
          <RefreshCw aria-hidden="true" className="w-3 h-3" />
          Retry now
        </button>
      )}
    </div>
  );
};

export default ConnectionStatus;
