import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { getPlatform } from './platform';
import { applyBootTheme } from './theme/theme';
import './theme/tokens.css';
import './theme/app.css';
import './theme/kipas.css';

applyBootTheme();
if (import.meta.env.DEV) {
  // Dev builds only: stores on window for inspection from DevTools. Never in a release: the vault store holds secrets.
  void Promise.all([import('./store/ui'), import('./store/list'), import('./store/vault')]).then(([ui, list, vault]) => {
    Object.assign(window, { __kipas: { ui: ui.useUi, list: list.useList, vault: vault.useVault } });
  });
}
const platform = getPlatform();
document.documentElement.classList.add(`os-${platform.os}`);
if (platform.titleBar) document.documentElement.classList.add(`titlebar-${platform.titleBar}`);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
