import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { StoreProvider } from './lib/store';
import { ToastProvider } from './ui/kit';
import { NavProvider } from './ui/nav';
import './styles.css';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <NavProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </NavProvider>
    </StoreProvider>
  </StrictMode>
);
