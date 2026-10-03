import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {captureDevConfigFromUrl} from './config/lumenConfig';
import {locale} from './i18n/strings';
import {InstagramProvider} from './InstagramProvider';
import './styles.css';

// Development fallback: only a regular browser (no window.lumen) keeps
// `?bridge.*` parameters. They are always removed from the address bar.
captureDevConfigFromUrl(window.lumen?.config == null);
document.documentElement.lang = locale;

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root mount element');

createRoot(root).render(
  <StrictMode>
    <InstagramProvider>
      <App />
    </InstagramProvider>
  </StrictMode>,
);
