import './electron-api-mock';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error('Application error:', error, errorInfo);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('app-error', { detail: { error, errorInfo } }));
        }
      }}
    >
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
