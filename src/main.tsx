import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AppProvider } from './context/AppContext';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

if (typeof window !== 'undefined') {
  try {
    registerSW({ immediate: true });
  } catch (err) {
    console.warn('PWA service worker registration failed', err);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
