import React from 'react';
import BrandMark from './BrandMark';

/** Shared card layout for the account pages reached from emailed links
 *  (forgot / reset password, verify email); matches the sign-in card. */
export const AuthShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <main
    id="main-content"
    className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 px-4 py-8"
  >
    <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-lg shadow-xl dark:shadow-black/50 border-2 border-slate-300 dark:border-zinc-800 p-8">
      <div className="flex justify-center mb-4">
        <BrandMark size={56} />
      </div>
      {children}
    </div>
  </main>
);

export const authInputClass =
  'w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-500 dark:border-zinc-500 text-slate-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

export const authButtonClass =
  'w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

export const authLinkClass =
  'font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline underline-offset-2';

export const authHeadingClass = 'text-2xl font-bold text-slate-900 dark:text-slate-50 text-center focus:outline-none';

export const authErrorClass =
  'mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-md focus:outline-none';

export const authSuccessClass =
  'p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300 rounded-md';

export default AuthShell;
