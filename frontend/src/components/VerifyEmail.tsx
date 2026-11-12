import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authService } from '../services/auth';
import { apiErrorMessage, useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { announce } from '../utils/announce';
import { AuthShell, authButtonClass, authErrorClass, authHeadingClass, authLinkClass, authSuccessClass } from './AuthShell';

type Status = 'verifying' | 'verified' | 'failed';

/** /verify-email?token=… — confirms the address as soon as the page loads. */
export const VerifyEmail: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { user, setUser } = useAuth();
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'failed');
  const [message, setMessage] = useState(
    token ? '' : 'This page needs the link from your verification email. Open the link from the email again.',
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const started = useRef(false);
  useDocumentTitle(status === 'verified' ? 'Email verified' : status === 'failed' ? 'Verification failed' : 'Verifying email');

  useEffect(() => {
    // Once per page load (StrictMode runs effects twice in development).
    if (!token || started.current) return;
    started.current = true;
    authService
      .verifyEmail(token)
      .then((res) => {
        setMessage(res.message);
        setStatus('verified');
      })
      .catch((err) => {
        setMessage(apiErrorMessage(err, 'Could not verify your email address. Please try again.'));
        setStatus('failed');
      });
  }, [token]);

  // Signed in here: pick up the new status (hides the "verify your email" banner).
  useEffect(() => {
    if (status !== 'verified' || !user || user.email_verified) return;
    authService.getCurrentUser().then(setUser).catch(() => { /* keep the current state */ });
  }, [status, user, setUser]);

  useEffect(() => {
    if (status === 'verifying') return;
    headingRef.current?.focus();
    announce(message, status === 'failed' ? 'assertive' : 'polite');
  }, [status, message]);

  const heading =
    status === 'verified' ? 'Email verified' : status === 'failed' ? "We couldn't verify your email" : 'Verifying your email…';

  return (
    <AuthShell>
      <h1 ref={headingRef} tabIndex={-1} className={authHeadingClass}>{heading}</h1>
      <div aria-busy={status === 'verifying'} className="mt-6">
        {status === 'verifying' && (
          <p className="text-center text-slate-600 dark:text-slate-300">One moment, please.</p>
        )}
        {status === 'verified' && <p className={authSuccessClass}>{message}</p>}
        {status === 'failed' && (
          <div className={authErrorClass}>
            <p>{message}</p>
            {!(user && user.email_verified) && (
              <p className="mt-2">
                {user ? 'Open the workspace' : 'Sign in'} and choose “Resend email” in the banner at the top to get a
                new link.
              </p>
            )}
          </div>
        )}
      </div>
      {status !== 'verifying' && (
        <p className="mt-6 text-center">
          {user ? (
            <Link to="/app" className={`inline-block ${authButtonClass}`}>Open the workspace</Link>
          ) : (
            <Link to="/auth" className={authLinkClass}>Go to sign in</Link>
          )}
        </p>
      )}
    </AuthShell>
  );
};

export default VerifyEmail;
