import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { authService } from '../services/auth';
import { apiErrorMessage } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { announce } from '../utils/announce';
import {
  AuthShell, authButtonClass, authErrorClass, authHeadingClass, authInputClass, authLinkClass, authSuccessClass,
} from './AuthShell';

/** /forgot-password — ask for a reset link. The reply is the same whether or
 *  not an account exists for the address, so it never reveals accounts. */
export const ForgotPassword: React.FC = () => {
  const location = useLocation();
  const initialEmail = (location.state as { email?: string } | null)?.email ?? '';
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState('');
  const [sentMessage, setSentMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const doneHeadingRef = useRef<HTMLHeadingElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const [retrying, setRetrying] = useState(false);
  useDocumentTitle(sentMessage ? 'Check your email' : 'Forgot password');

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (sentMessage) {
      doneHeadingRef.current?.focus();
      announce(sentMessage);
    }
  }, [sentMessage]);

  // "Try again" swaps the confirmation back for the form: put focus in it.
  useEffect(() => {
    if (retrying && !sentMessage) {
      emailRef.current?.focus();
      setRetrying(false);
    }
  }, [retrying, sentMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authService.forgotPassword(email.trim());
      setSentMessage(res.message);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Could not send the reset email. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (sentMessage) {
    return (
      <AuthShell>
        <h1 ref={doneHeadingRef} tabIndex={-1} className={authHeadingClass}>Check your email</h1>
        <p className={`${authSuccessClass} mt-6`}>{sentMessage}</p>
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          The link works once and expires in 1 hour. Didn't get it?{' '}
          <button
            type="button"
            onClick={() => { setRetrying(true); setSentMessage(''); }}
            className={authLinkClass}
          >
            Try again
          </button>
        </p>
        <p className="mt-6 text-center text-sm">
          <Link to="/auth" className={authLinkClass}>Back to sign in</Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className={authHeadingClass}>Forgot your password?</h1>
      <p id="forgot-intro" className="text-slate-600 dark:text-slate-300 mt-2 mb-6 text-center">
        Enter the email address for your account and we'll send you a link to choose a new password.
      </p>

      {error && (
        <div id="forgot-error" ref={errorRef} tabIndex={-1} className={authErrorClass}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="forgot-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Email Address
          </label>
          <input
            id="forgot-email"
            ref={emailRef}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? 'forgot-error forgot-intro' : 'forgot-intro'}
            className={authInputClass}
            placeholder="you@example.com"
            disabled={loading}
          />
        </div>
        <button type="submit" disabled={loading} className={authButtonClass}>
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
        Remembered it? <Link to="/auth" className={authLinkClass}>Back to sign in</Link>
      </p>
    </AuthShell>
  );
};

export default ForgotPassword;
