import { Menu as MenuIcon, Moon, Search, Sun, SunMoon } from 'lucide-react';
import { getCommand, runCommand } from '../../app/commands';
import { withShortcut } from '../../app/keys';
import { useSettings } from '../../store/settings';
import { useUi } from '../../store/ui';
import { useVault } from '../../store/vault';
import type { EffectiveTheme } from '../../theme/theme';
import { CommandButton } from '../common/CommandButton';
import { showMenuBelow, type MenuItem } from '../common/Menu';
import { BrandMark, Kbd } from '../common/visuals';

const MENU: { label: string; ids: (string | '-')[] }[] = [
  { label: 'Vault', ids: ['vault.create', 'vault.open', 'vault.reveal', '-', 'vault.changePassword', 'vault.import', 'vault.export', '-', 'vault.lock'] },
  { label: 'Items', ids: ['entry.new', 'entry.newCard', 'entry.newNote', 'entry.newWifi', '-', 'entry.edit', 'entry.duplicate', 'entry.favorite', 'entry.delete', 'entry.restore', '-', 'group.new', 'trash.empty'] },
  { label: 'Copy', ids: ['entry.copyUsername', 'entry.copyPassword', 'entry.copyTotp', 'entry.openUrl'] },
  { label: 'View', ids: ['view.toggleSidebar', 'view.toggleDetails', 'view.toggleTheme', '-', 'view.palette', 'view.shortcuts', '-', 'app.checkUpdates'] },
];

function appMenu(): MenuItem[] {
  return [
    ...MENU.map((m) => ({
      label: m.label,
      submenu: m.ids.map((id): MenuItem => {
        if (id === '-') return 'separator';
        const c = getCommand(id)!;
        return { label: c.label, icon: c.icon, shortcut: c.shortcut, disabled: c.disabled?.() ?? false, run: () => runCommand(id) };
      }),
    })),
    'separator',
    { label: getCommand('tools.generator')!.label, icon: getCommand('tools.generator')!.icon, shortcut: 'Mod+G', run: () => runCommand('tools.generator') },
    { label: 'Settings…', icon: getCommand('view.settings')!.icon, shortcut: 'Mod+,', run: () => runCommand('view.settings') },
  ];
}

/** Glass top bar (Grabbit/Rowlit style): brand, app menu, side panel toggle, New / Generator, search, lock, theme. */
export function TopBar({ theme }: { theme: EffectiveTheme }) {
  const pref = useSettings((s) => s.settings.theme);
  const sidebar = useUi((s) => s.sidebarVisible);
  const unlocked = useVault((s) => !!s.data);
  const name = useVault((s) => s.data?.name);
  const ThemeIcon = pref === 'system' ? SunMoon : theme === 'dark' ? Moon : Sun;
  const next = pref === 'system' ? 'dark' : pref === 'dark' ? 'light' : 'system';
  const paletteShortcut = getCommand('view.palette')?.shortcut;

  return (
    <header className="topbar" aria-label="Application">
      <div className="brand">
        <BrandMark size={18} />
        <span className="brand-name">Kipas</span>
        {name && <span className="brand-vault ellipsis">{name}</span>}
      </div>
      <button className="icon-btn" title="Menu" aria-label="Application menu" aria-haspopup="menu" onClick={(e) => showMenuBelow(e.currentTarget, appMenu())}>
        <MenuIcon size={16} />
      </button>
      {unlocked && (
        <>
          <CommandButton command="view.toggleSidebar" variant="icon" className={sidebar ? 'on' : ''} />
          <div className="topbar-sep" />
          <CommandButton command="entry.new" variant="ghost" label="New" className="topbar-text-btn" />
          <CommandButton command="tools.generator" variant="ghost" label="Generator" className="topbar-text-btn" />
        </>
      )}
      <div className="flex-1 topbar-drag" />
      {unlocked && (
        <button
          type="button"
          className="palette-trigger"
          onClick={() => useUi.getState().set({ paletteOpen: true })}
          title={withShortcut('Search items and commands', paletteShortcut)}
          aria-label="Search items and commands"
        >
          <Search size={14} />
          <span className="palette-trigger-text">Search the vault or run a command</span>
          <Kbd shortcut={paletteShortcut} />
        </button>
      )}
      <div className="flex-1 topbar-drag" />
      {unlocked && <CommandButton command="vault.lock" variant="icon" className="lock-btn" />}
      <button className="icon-btn" title={`Theme: ${pref} — click for ${next}`} aria-label={`Theme ${pref}, switch to ${next}`} onClick={() => runCommand('view.toggleTheme')}>
        <ThemeIcon size={16} />
      </button>
      <CommandButton command="view.shortcuts" variant="icon" />
      <CommandButton command="view.settings" variant="icon" />
    </header>
  );
}
