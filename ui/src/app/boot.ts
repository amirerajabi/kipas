// Start-up wiring that is not a component: auto-lock on idle and on OS events, clean-up when the vault locks, and a
// last save before the window closes, and answering the quick-access window.
import { getPlatform } from '../platform';
import { quickResults, useList, type Filter, type ListSort } from '../store/list';
import { useSettings } from '../store/settings';
import { useUi, type MainView } from '../store/ui';
import { useUpdates } from '../store/updates';
import { useVault } from '../store/vault';
import type { VaultData } from '../vault/model';
import { autoTypeEntry, copyText, copyTotp, lockVault, openUrl } from './actions';

let lastActivity = Date.now();

/**
 * Where you were when the vault locked. Memory only (gone when Kipas closes), and only ids, the search text and the
 * view: no secret.
 */
interface Place {
  path: string;
  view: MainView;
  filter: Filter;
  query: string;
  sort: ListSort;
  selected: string[];
  anchor: string | null;
}
let lastPlace: Place | null = null;

/** Put the list back as it was; a group or item deleted meanwhile (another device, a restored backup) is skipped. */
function restorePlace(p: Place, data: VaultData): void {
  const ids = new Set(data.entries.map((e) => e.id));
  const groupGone = p.filter.kind === 'group' && !data.groups.some((g) => g.id === (p.filter as { id: string }).id);
  const selected = p.selected.filter((id) => ids.has(id));
  useList.setState({
    filter: groupGone ? { kind: 'all' } : p.filter,
    query: p.query,
    sort: p.sort,
    selected,
    anchor: p.anchor && ids.has(p.anchor) ? p.anchor : (selected[0] ?? null),
  });
  useUi.getState().set({ view: p.view });
  // Keyboard ready where you left off: arrows, Ctrl+C and Ctrl+V work at once.
  setTimeout(() => (document.querySelector('.entry-list') as HTMLElement | null)?.focus(), 0);
}

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
    else if (req.action === 'autotype') return autoTypeEntry(entry);
    else return false;
    return true;
  });

  const offSystem = getPlatform().onSystemEvent((e) => {
    const s = useSettings.getState().settings;
    if ((e === 'minimize' && s.lockOnMinimize) || ((e === 'lock-screen' || e === 'suspend') && s.lockOnSystemLock)) void lockVault(true);
  });

  // Locking forgets everything that came from the vault: dialogs, the selection, the search, revealed secrets. Where you
  // were is noted first, and unlocking the same vault puts you back there.
  const offVault = useVault.subscribe((s, prev) => {
    if (prev.data && !s.data) {
      const l = useList.getState();
      lastPlace = prev.path ? { path: prev.path, view: useUi.getState().view, filter: l.filter, query: l.query, sort: l.sort, selected: l.selected, anchor: l.anchor } : null;
      useUi.getState().closeAll();
      useUi.getState().set({ clipboard: null });
      useList.getState().reset();
    } else if (!prev.data && s.data) {
      lastActivity = Date.now();
      if (lastPlace && lastPlace.path === s.path) restorePlace(lastPlace, s.data);
      lastPlace = null;
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
