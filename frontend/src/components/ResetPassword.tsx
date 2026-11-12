import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authService } from '../services/auth';
import { apiErrorMessage } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { announce } from '../utils/announce';
import {
  AuthShell, authButtonClass, authErrorClass, authHeadingClass, authInputClass, authLinkClass, authSuccessClass,
} from './AuthShell';

const MIN_LENGTH = 8; // matches PasswordPolicy.MIN_LENGTH on the backend

/** /reset-password?token=… — choose a new password from the emailed link. */
export const ResetPassword: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setErrorText] = useState('');
  // Bumped on every error so focus moves to it even when the text repeats.
  const [errorCount, setErrorCount] = useState(0);
  const setError = (message: string) => {
    setErrorText(message);
    if (message) setErrorCount((n) => n + 1);
  };
  // The link itself is unusable (expired / already used): offer a new one.
  const [linkProblem, setLinkProblem] = useState(false);
  const [done, setDone] = useState('');
  const [loading, setLoading] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const doneHeadingRef = useRef<HTMLHeadingElement>(null);
  useDocumentTitle(done ? 'Password reset' : 'Choose a new password');

  useEffect(() => {
    if (errorCount) errorRef.current?.focus();
  }, [errorCount]);

  useEffect(() => {
    if (done) {
      doneHeadingRef.current?.focus();
      announce(done);
    }
  }, [done]);

  // Which field the current error is about, so it can be marked aria-invalid.
  const matchError = error === 'Passwords do not match';
  const passwordError = !!error && !linkProblem && !matchError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLinkProblem(false);
    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters long`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const res = await authService.resetPassword(token, password);
      setDone(res.message);
    } catch (err: any) {
      const code = err?.response?.data?.detail?.code;
      setLinkProblem(code === 'token_invalid' || code === 'token_expired');
      setError(apiErrorMessage(err, 'Could not reset the password. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthShell>
        <h1 className={authHeadingClass}>Reset link incomplete</h1>
        <p className="mt-4 text-slate-600 dark:text-slate-300">
          This page needs the link from your password-reset email. Open the link from the email again, or
          request a new one.
        </p>
        <p className="mt-6 text-center text-sm">
          <Link to="/forgot-password" className={authLinkClass}>Request a new reset link</Link>
        </p>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell>
        <h1 ref={doneHeadingRef} tabIndex={-1} className={authHeadingClass}>Password reset</h1>
        <p className={`${authSuccessClass} mt-6`}>{done}</p>
        <p className="mt-6 text-center">
          <Link to="/auth" className={`inline-block ${authButtonClass}`}>Sign in</Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className={authHeadingClass}>Choose a new password</h1>
      <p className="text-slate-600 dark:text-slate-300 mt-2 mb-6 text-center">
        You'll be signed out on every device and can then sign in with the new password.
      </p>

      {error && (
        <div id="reset-error" ref={errorRef} tabIndex={-1} className={authErrorClass}>
          <p>{error}</p>
          {linkProblem && (
            <p className="mt-2">
              <Link to="/forgot-password" className={authLinkClass}>Request a new reset link</Link>
            </p>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={passwordError}
            aria-describedby={passwordError ? 'reset-error new-password-hint' : 'new-password-hint'}
            className={authInputClass}
            disabled={loading}
          />
          <p id="new-password-hint" className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Minimum {MIN_LENGTH} characters
          </p>
        </div>
        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={matchError}
            aria-describedby={matchError ? 'reset-error' : undefined}
            className={authInputClass}
            disabled={loading}
          />
        </div>
        <button type="submit" disabled={loading} className={`${authButtonClass} mt-2`}>
          {loading ? 'Saving…' : 'Set new password'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
        <Link to="/auth" className={authLinkClass}>Back to sign in</Link>
      </p>
    </AuthShell>
  );
};

export default ResetPassword;
