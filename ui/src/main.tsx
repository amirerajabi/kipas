import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { getPlatform } from './platform';
import { QuickApp } from './quick/QuickApp';
import { applyBootTheme } from './theme/theme';
import './theme/tokens.css';
import './theme/app.css';
import './theme/kipas.css';

applyBootTheme();
const platform = getPlatform();
// The quick-access window loads this same page with #quick and shows only the search.
const quick = platform.isQuickWindow || location.hash === '#quick';
if (import.meta.env.DEV && !quick) {
  // Dev builds only: stores on window for inspection from DevTools. Never in a release: the vault store holds secrets.
  void Promise.all([import('./store/ui'), import('./store/list'), import('./store/vault')]).then(([ui, list, vault]) => {
    Object.assign(window, { __kipas: { ui: ui.useUi, list: list.useList, vault: vault.useVault } });
  });
}
document.documentElement.classList.add(`os-${platform.os}`);
if (platform.titleBar && !quick) document.documentElement.classList.add(`titlebar-${platform.titleBar}`);
if (quick) document.documentElement.classList.add('quick-window');

createRoot(document.getElementById('root')!).render(<StrictMode>{quick ? <QuickApp /> : <App />}</StrictMode>);
