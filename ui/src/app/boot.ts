// Start-up wiring that is not a component: auto-lock on idle and on OS events, clean-up when the vault locks, and a
// last save before the window closes, and answering the quick-access window.
import { getPlatform } from '../platform';
import { quickResults, useList } from '../store/list';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { useUpdates } from '../store/updates';
import { useVault } from '../store/vault';
import { copyText, copyTotp, lockVault, openUrl } from './actions';

let lastActivity = Date.now();

/** Milliseconds until the idle lock, or null when it is off or nothing is unlocked. */
export function autoLockIn(now = Date.now()): number | null {
  const mins = useSettings.getState().settings.autoLockMinutes;
  if (!mins || !useVault.getState().data) return null;
  return Math.max(0, lastActivity + mins * 60_000 - now);
}

export function boot(): () => void {
  const activity = () => {
    lastActivity = Date.now();
  };
  const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'] as const;
  for (const ev of events) window.addEventListener(ev, activity, { passive: true });

  const tick = setInterval(() => {
    const left = autoLockIn();
    if (left === 0) void lockVault(true);
    const clip = useUi.getState().clipboard;
    if (clip?.clearsAt && clip.clearsAt <= Date.now()) useUi.getState().set({ clipboard: null });
  }, 1000);

  // Updates: the desktop app checks on its own once told whether it may; the UI only shows the status.
  const platform = getPlatform();
  void platform.getUpdateStatus().then((s) => s && useUpdates.getState().setStatus(s));
  const offUpdates = platform.onUpdateStatus((s) => useUpdates.getState().setStatus(s));
  platform.setAutoUpdate(useSettings.getState().settings.autoUpdate);
  const offAutoUpdate = useSettings.subscribe((s, prev) => {
    if (s.settings.autoUpdate !== prev.settings.autoUpdate) platform.setAutoUpdate(s.settings.autoUpdate);
  });

  // Quick access: the small window asks; this window, which holds the vault, searches and copies.
  platform.setQuickAccess(useSettings.getState().settings.quickAccess);
  const offQuickSetting = useSettings.subscribe((s, prev) => {
    if (s.settings.quickAccess !== prev.settings.quickAccess) platform.setQuickAccess(s.settings.quickAccess);
  });
  const offQuick = platform.onQuickRequest(async (req) => {
    const data = useVault.getState().data;
    if (req.kind === 'search') return data ? { locked: false, vaultName: data.name, results: quickResults(data, req.query) } : { locked: true };
    const entry = data?.entries.find((e) => e.id === req.entryId && !e.trashed);
    if (!entry) return false;
    if (req.action === 'password' && entry.password) copyText(entry.password, 'Password');
    else if (req.action === 'username' && entry.username) copyText(entry.username, 'User name', false);
    else if (req.action === 'totp') await copyTotp(entry);
    else if (req.action === 'open') openUrl(entry);
    else return false;
    return true;
  });

  const offSystem = getPlatform().onSystemEvent((e) => {
    const s = useSettings.getState().settings;
    if ((e === 'minimize' && s.lockOnMinimize) || ((e === 'lock-screen' || e === 'suspend') && s.lockOnSystemLock)) void lockVault(true);
  });

  // Locking forgets everything that came from the vault: dialogs, the selection, the search, revealed secrets.
  const offVault = useVault.subscribe((s, prev) => {
    if (prev.data && !s.data) {
      useUi.getState().closeAll();
      useUi.getState().set({ clipboard: null });
      useList.getState().reset();
    } else if (!prev.data && s.data) {
      lastActivity = Date.now();
    }
  });

  // An unsaved change gets written before the window goes away.
  const beforeUnload = (e: BeforeUnloadEvent) => {
    if (useVault.getState().save !== 'saving') return;
    e.preventDefault();
    void useVault
      .getState()
      .flush()
      .then(() => window.close());
  };
  window.addEventListener('beforeunload', beforeUnload);

  return () => {
    for (const ev of events) window.removeEventListener(ev, activity);
    clearInterval(tick);
    offSystem();
    offUpdates();
    offAutoUpdate();
    offQuickSetting();
    offQuick();
    offVault();
    window.removeEventListener('beforeunload', beforeUnload);
  };
}
