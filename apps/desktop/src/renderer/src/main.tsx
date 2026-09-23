import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/globals.css';

/**
 * Renderer entry point.
 *
 * `StrictMode` is on in development, which double-invokes effects. That is
 * deliberate: the socket layer and every subscription in the app must be
 * idempotent under remount, and StrictMode is what surfaces it when one is
 * not.
 */
const container = document.getElementById('root');
if (!container) throw new Error('Renderer root element is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
