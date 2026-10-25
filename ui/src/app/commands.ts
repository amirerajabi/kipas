import {
  ArchiveRestore,
  Copy,
  CreditCard,
  Download,
  FileLock2,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  KeyRound,
  Keyboard,
  Lock,
  PanelLeft,
  PanelRight,
  Pencil,
  RefreshCw,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SquareArrowOutUpRight,
  Star,
  StickyNote,
  SunMoon,
  TextCursorInput,
  Timer,
  Trash2,
  Upload,
  User,
  Wand2,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import { getPlatform } from '../platform';
import { useList, visibleEntries } from '../store/list';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { useUpdates } from '../store/updates';
import { useVault } from '../store/vault';
import { openableUrl } from '../vault/model';
import { parseTotp } from '../vault/totp';
import {
  copyText,
  copyTotp,
  createVault,
  current,
  deleteEntries,
  duplicate,
  editEntry,
  emptyTrash,
  exportToCsv,
  importFromCsv,
  lockVault,
  autoTypeEntry,
  newEntry,
  newGroup,
  openUrl,
  openVaultFile,
  selectedEntries,
} from './actions';
import { matches } from './keys';

export interface Command {
  id: string;
  label: string;
  icon?: LucideIcon;
  shortcut?: string;
  /** Shown in the palette; false hides it there. */
  palette?: boolean;
  /** Why it is unavailable right now, or null when it can run. */
  disabled?: () => string | null;
  run: () => unknown;
}

const locked = () => (useVault.getState().data ? null : 'Unlock a vault first');
const noSelection = () => locked() ?? (useList.getState().selected.length === 0 ? 'Select an item first' : null);
const one = (test: (e: NonNullable<ReturnType<typeof current>>) => string | null) => () => {
  const r = noSelection();
  if (r) return r;
  const e = current();
  return e ? test(e) : 'Select an item first';
};

function toggleTheme(): void {
  const pref = useSettings.getState().settings.theme;
  useSettings.getState().update({ theme: pref === 'system' ? 'dark' : pref === 'dark' ? 'light' : 'system' });
}

export const COMMANDS: Command[] = [
  { id: 'entry.new', label: 'New login…', icon: Plus, shortcut: 'Mod+N', disabled: locked, run: () => newEntry('login') },
  { id: 'entry.newCard', label: 'New card…', icon: CreditCard, disabled: locked, run: () => newEntry('card') },
  { id: 'entry.newNote', label: 'New secure note…', icon: StickyNote, disabled: locked, run: () => newEntry('note') },
  { id: 'entry.newWifi', label: 'New Wi-Fi network…', icon: Wifi, disabled: locked, run: () => newEntry('wifi') },
  {
    id: 'entry.copyUsername',
    label: 'Copy user name',
    icon: User,
    shortcut: 'Mod+B',
    disabled: one((e) => (e.username ? null : 'This item has no user name')),
    run: () => copyText(current()!.username, 'User name', false),
  },
  {
    id: 'entry.copyPassword',
    label: 'Copy password',
    icon: KeyRound,
    shortcut: 'Mod+C',
    disabled: one((e) => (e.password ? null : 'This item has no password')),
    run: () => copyText(current()!.password, 'Password'),
  },
  {
    id: 'entry.autoType',
    label: 'Auto-type into the previous window',
    icon: TextCursorInput,
    shortcut: 'Mod+V',
    disabled: one((e) => (e.trashed ? 'Restore it from the trash first' : e.username || e.password ? null : 'This item has nothing to type')),
    run: () => autoTypeEntry(current()!),
  },
  {
    id: 'entry.copyTotp',
    label: 'Copy one-time code',
    icon: Timer,
    shortcut: 'Mod+T',
    disabled: one((e) => (parseTotp(e.totp) ? null : 'This item has no two-factor secret')),
    run: () => copyTotp(current()!),
  },
  {
    id: 'entry.openUrl',
    label: 'Open website',
    icon: SquareArrowOutUpRight,
    shortcut: 'Mod+U',
    disabled: one((e) => (openableUrl(e.url) ? null : 'This item has no web address')),
    run: () => openUrl(current()!),
  },
  { id: 'entry.edit', label: 'Edit…', icon: Pencil, shortcut: 'Enter', disabled: one((e) => (e.trashed ? 'Restore it from the trash first' : null)), run: () => editEntry(current()!.id) },
  { id: 'entry.duplicate', label: 'Duplicate', icon: Copy, shortcut: 'Mod+D', disabled: one((e) => (e.trashed ? 'Restore it from the trash first' : null)), run: () => duplicate(current()!) },
  {
    id: 'entry.favorite',
    label: 'Favorite',
    icon: Star,
    disabled: one((e) => (e.trashed ? 'Restore it from the trash first' : null)),
    run: () => {
      const sel = selectedEntries();
      const on = !sel.every((e) => e.favorite);
      for (const e of sel) useVault.getState().updateEntry(e.id, { favorite: on });
    },
  },
  {
    id: 'entry.delete',
    label: 'Delete',
    icon: Trash2,
    shortcut: 'Delete',
    disabled: noSelection,
    run: () => deleteEntries(useList.getState().selected),
  },
  {
    id: 'entry.restore',
    label: 'Restore',
    icon: ArchiveRestore,
    disabled: () => noSelection() ?? (selectedEntries().some((e) => e.trashed) ? null : 'Only items in the trash can be restored'),
    run: () => {
      const ids = selectedEntries().filter((e) => e.trashed).map((e) => e.id);
      useVault.getState().restore(ids);
      useList.getState().select([]);
      useUi.getState().toast({ level: 'success', text: `Restored ${ids.length === 1 ? 'the item' : `${ids.length} items`}` });
    },
  },
  {
    id: 'entry.selectAll',
    label: 'Select all',
    shortcut: 'Mod+A',
    palette: false,
    disabled: locked,
    run: () => useList.getState().select(visibleEntries(useVault.getState().data, useList.getState()).map((e) => e.id)),
  },
  {
    id: 'trash.empty',
    label: 'Empty trash',
    icon: Trash2,
    disabled: () => locked() ?? (useVault.getState().data!.entries.some((e) => e.trashed) ? null : 'The trash is empty'),
    run: emptyTrash,
  },
  { id: 'group.new', label: 'New group…', icon: FolderPlus, disabled: locked, run: newGroup },
  { id: 'tools.generator', label: 'Password generator', icon: Wand2, shortcut: 'Mod+G', run: () => useUi.getState().set({ generator: {} }) },
  { id: 'vault.lock', label: 'Lock vault', icon: Lock, shortcut: 'Mod+L', disabled: locked, run: () => lockVault() },
  { id: 'vault.create', label: 'Create new vault…', icon: FilePlus2, run: createVault },
  { id: 'vault.open', label: 'Open vault file…', icon: FolderOpen, shortcut: 'Mod+O', run: openVaultFile },
  {
    id: 'vault.reveal',
    label: 'Show vault file in folder',
    icon: FolderOpen,
    disabled: () => locked() ?? (getPlatform().kind === 'electron' ? null : 'Part of the desktop app'),
    run: () => getPlatform().revealFile(useVault.getState().path!),
  },
  { id: 'vault.changePassword', label: 'Change master password…', icon: ShieldCheck, disabled: locked, run: () => useUi.getState().set({ changePasswordOpen: true }) },
  { id: 'vault.importKeePass', label: 'Import from KeePass…', icon: FileLock2, disabled: locked, run: () => useUi.getState().set({ keepassImportOpen: true }) },
  { id: 'vault.import', label: 'Import from CSV…', icon: Download, disabled: locked, run: importFromCsv },
  { id: 'vault.export', label: 'Export to CSV…', icon: Upload, disabled: locked, run: exportToCsv },
  { id: 'view.health', label: 'Password health', icon: ShieldCheck, shortcut: 'Mod+H', disabled: locked, run: () => useUi.getState().set({ view: 'health' }) },
  { id: 'view.palette', label: 'Command palette', icon: Search, shortcut: 'Mod+K', palette: false, disabled: locked, run: () => useUi.getState().set({ paletteOpen: true }) },
  {
    id: 'view.focusFilter',
    label: 'Search the vault',
    icon: Search,
    shortcut: 'Mod+F',
    disabled: locked,
    run: () => {
      useUi.getState().set({ view: 'items' });
      setTimeout(() => document.getElementById('list-filter')?.focus(), 0);
    },
  },
  { id: 'view.toggleSidebar', label: 'Toggle side panel', icon: PanelLeft, shortcut: 'Mod+Shift+B', run: () => useUi.getState().setLayout({ sidebarVisible: !useUi.getState().sidebarVisible }) },
  { id: 'view.toggleDetails', label: 'Toggle details pane', icon: PanelRight, shortcut: 'Mod+J', run: () => useUi.getState().setLayout({ detailsVisible: !useUi.getState().detailsVisible }) },
  { id: 'view.toggleTheme', label: 'Switch theme (system / dark / light)', icon: SunMoon, run: toggleTheme },
  { id: 'view.settings', label: 'Settings…', icon: Settings, shortcut: 'Mod+,', run: () => useUi.getState().set({ settingsOpen: 'general' }) },
  {
    id: 'app.checkUpdates',
    label: 'Check for updates',
    icon: RefreshCw,
    disabled: () => (getPlatform().kind === 'electron' ? null : 'Updates are part of the desktop app'),
    run: () => {
      useUi.getState().set({ settingsOpen: 'updates' });
      return useUpdates.getState().check();
    },
  },
  { id: 'view.shortcuts', label: 'Keyboard shortcuts', icon: Keyboard, shortcut: 'Mod+/', run: () => useUi.getState().set({ shortcutsOpen: true }) },
];

const byId = new Map(COMMANDS.map((c) => [c.id, c]));

export function getCommand(id: string): Command | undefined {
  return byId.get(id);
}

export function runCommand(id: string): void {
  const c = byId.get(id);
  if (!c || c.disabled?.()) return;
  void c.run();
}

function modalOpen(): boolean {
  const u = useUi.getState();
  return !!(u.editor || u.generator || u.createVaultOpen || u.keepassImportOpen || u.settingsOpen || u.changePasswordOpen || u.paletteOpen || u.shortcutsOpen || u.confirm || u.prompt);
}

/**
 * Global shortcuts. List-only keys (Enter, Delete, Mod+A, Mod+C) fire only while focus is in the entry list, so they
 * keep their usual meaning in text fields; Mod+C also yields to a text selection.
 */
const LIST_ONLY = new Set(['entry.edit', 'entry.delete', 'entry.selectAll', 'entry.copyPassword', 'entry.autoType']);

export function installKeyboard(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    const inList = !!(document.activeElement as HTMLElement | null)?.closest?.('.entry-list');
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '');
    for (const c of COMMANDS) {
      if (!c.shortcut || !matches(e, c.shortcut)) continue;
      if (LIST_ONLY.has(c.id) && (!inList || typing)) continue;
      if (c.id === 'entry.copyPassword' && String(window.getSelection() ?? '')) continue;
      if (modalOpen() && c.id !== 'view.palette') continue;
      if (typing && !c.shortcut.includes('Mod')) continue;
      e.preventDefault();
      runCommand(c.id);
      return;
    }
  };
  window.addEventListener('keydown', onKey);
  const offMenu = getPlatform().onCommand((id) => runCommand(id));
  return () => {
    window.removeEventListener('keydown', onKey);
    offMenu();
  };
}
