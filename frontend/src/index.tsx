import React from 'react';
import ReactDOM from 'react-dom/client';
import AppRoutes from './AppRoutes';
import { OperationSchemaProvider } from './contexts/OperationSchemaContext';
import './index.css';
import { initAppearance } from './theme/appearance';
import { installErrorReporter } from './utils/errorReporter';
import ErrorBoundary from './components/ErrorBoundary';

// Apply the saved theme and mode before the first render (no flash).
initAppearance();
installErrorReporter();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <OperationSchemaProvider>
        <AppRoutes />
      </OperationSchemaProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
