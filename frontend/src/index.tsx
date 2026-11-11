import React from 'react';
import ReactDOM from 'react-dom/client';
import AppRoutes from './AppRoutes';
import { OperationSchemaProvider } from './contexts/OperationSchemaContext';
import './index.css';
import { initAppearance } from './theme/appearance';

// Apply the saved theme and mode before the first render (no flash).
initAppearance();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <OperationSchemaProvider>
      <AppRoutes />
    </OperationSchemaProvider>
  </React.StrictMode>
);
