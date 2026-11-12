import React from 'react';
import { reportError } from '../utils/errorReporter';

interface State {
  failed: boolean;
}

/** Last-resort screen for a render crash: reports it and offers a reload instead of a blank page. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError('react', Object.assign(error, { stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}` }));
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main id="main-content" className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950 px-4">
        <div role="alert" className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Something went wrong</h1>
          <p className="text-slate-700 dark:text-slate-300">
            PixelFlow hit an unexpected error and has reported it. Your images and saved pipelines are safe on the server.
          </p>
          <button type="button" onClick={() => window.location.reload()} className="btn-primary">
            Reload the page
          </button>
        </div>
      </main>
    );
  }
}

export default ErrorBoundary;
