import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { GoogleSignIn } from './GoogleSignIn';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import BrandMark from './BrandMark';

interface RegisterProps {
  onSwitchToLogin?: () => void;
}

export const Register: React.FC<RegisterProps> = ({ onSwitchToLogin }) => {
  const { register } = useAuth();
  const navigate = useNavigate();
  useDocumentTitle('Create account');
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    full_name: '',
  });
  const [error, setError] = useState('');
  // Which field the current error is about, so it can be marked aria-invalid.
  const passwordError = /password/i.test(error);
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setLoading(true);

    try {
      await register({
        email: formData.email,
        username: formData.username,
        password: formData.password,
        full_name: formData.full_name || undefined,
      });
      navigate('/app');
    } catch (err: any) {
      setError(err.message || 'Failed to register');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 px-4 py-8">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-lg shadow-xl dark:shadow-black/50 border-2 border-slate-300 dark:border-zinc-800 p-8">
        <div className="text-center mb-8">
          {/* Custom Icon */}
          <div className="flex justify-center mb-4">
            <BrandMark size={64} />
          </div>
          
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">PixelFlow</h1>
          <p className="text-slate-600 dark:text-slate-300 mt-2">Create your account</p>
        </div>

        {/* Always-present live region so the error is announced when it appears


            (WCAG 3.3.1 Error Identification, 4.1.3 Status Messages). */}


        <div id="register-error" role="alert" aria-live="assertive" className={error ? "mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-md" : 'sr-only'}>


          {error}


        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Email Address *
            </label>
            <input
              id="email"
              aria-invalid={!!error && !passwordError}
              aria-describedby={!!error && !passwordError ? 'register-error' : undefined}
              autoComplete="email"
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-500 dark:border-zinc-500 text-slate-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="you@example.com"
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Username *
            </label>
            <input
              id="username"
              aria-invalid={!!error && !passwordError}
              aria-describedby={!!error && !passwordError ? 'register-error' : undefined}
              autoComplete="username"
              name="username"
              type="text"
              required
              value={formData.username}
              onChange={handleChange}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-500 dark:border-zinc-500 text-slate-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="username"
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="full_name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Full Name (optional)
            </label>
            <input
              id="full_name"
              autoComplete="name"
              name="full_name"
              type="text"
              value={formData.full_name}
              onChange={handleChange}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-500 dark:border-zinc-500 text-slate-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="John Doe"
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Password *
            </label>
            <input
              id="password"
              aria-invalid={passwordError}
              aria-describedby={passwordError ? 'register-error password-hint' : 'password-hint'}
              autoComplete="new-password"
              name="password"
              type="password"
              required
              value={formData.password}
              onChange={handleChange}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-500 dark:border-zinc-500 text-slate-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
              disabled={loading}
            />
            <p id="password-hint" className="text-xs text-slate-600 dark:text-slate-400 mt-1">Minimum 8 characters</p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Confirm Password *
            </label>
            <input
              id="confirmPassword"
              aria-invalid={passwordError}
              aria-describedby={passwordError ? 'register-error' : undefined}
              autoComplete="new-password"
              name="confirmPassword"
              type="password"
              required
              value={formData.confirmPassword}
              onChange={handleChange}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-500 dark:border-zinc-500 text-slate-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-6"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-300 dark:border-zinc-700"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-400">Or continue with</span>
          </div>
        </div>

        {/* Google Sign-In */}
        <GoogleSignIn 
          onSuccess={() => navigate('/app')}
          onError={(error) => setError(error)}
        />

        {onSwitchToLogin && (
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Already have an account?{' '}
              <button
                onClick={onSwitchToLogin}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
              >
                Sign in
              </button>
            </p>
          </div>
        )}
      </div>
    </main>
  );
};
