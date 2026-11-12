import React, { useState } from 'react';
import { MailCheck, X } from 'lucide-react';
import { useAuth, apiErrorMessage } from '../contexts/AuthContext';
import { authService } from '../services/auth';
import { announce } from '../utils/announce';

const DISMISS_KEY = 'pixelflow_verify_banner_dismissed';

function dismissedFor(userId: number): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === String(userId);
  } catch {
    return false;
  }
}

/**
 * A non-blocking reminder for signed-in users whose email isn't verified yet.
 * Nothing is gated on verification; the banner can be dismissed (for this
 * browser tab session) and offers to resend the link.
 */
export const VerifyEmailBanner: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);

  if (!isAuthenticated || !user || user.email_verified !== false) return null;
  if (dismissed || dismissedFor(user.id)) return null;

  const resend = async () => {
    setSending(true);
    setStatus(null);
    try {
      const res = await authService.resendVerification();
      setStatus({ text: res.message, error: false });
      announce(res.message);
    } catch (err: any) {
      const text = apiErrorMessage(err, 'Could not send the verification email. Please try again.');
      setStatus({ text, error: true });
      announce(text, 'assertive');
    } finally {
      setSending(false);
    }
  };

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, String(user.id));
    } catch {
      /* ignore */
    }
    setDismissed(true);
    // The focused button is going away: continue from the workspace.
    document.getElementById('main-content')?.focus();
  };

  return (
    <section
      aria-label="Email verification"
      className="bg-blue-50 dark:bg-zinc-900 border-b border-blue-200 dark:border-blue-800 px-3 sm:px-6 py-2 text-sm text-blue-900 dark:text-slate-100"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <MailCheck aria-hidden="true" size={16} className="shrink-0 text-blue-700 dark:text-blue-300" />
        <p className="min-w-0 break-words">
          Verify your email (<span className="font-medium">{user.email}</span>): open the link we sent you.
        </p>
        <button
          type="button"
          onClick={resend}
          disabled={sending}
          className="font-medium text-blue-700 dark:text-blue-300 underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-200 rounded disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {sending ? 'Sending…' : 'Resend email'}
        </button>
        {status && (
          <p className={status.error ? 'text-red-700 dark:text-red-400' : 'text-green-800 dark:text-green-300'}>
            {status.text}
          </p>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss email verification reminder"
          title="Dismiss"
          className="ml-auto p-1 rounded-md text-blue-800 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-zinc-800"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>
    </section>
  );
};

export default VerifyEmailBanner;
