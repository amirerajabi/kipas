import { Menu as MenuIcon, Moon, Sun, SunMoon } from 'lucide-react';
import { getCommand, runCommand } from '../../app/commands';
import { useSettings } from '../../store/settings';
import { useUi } from '../../store/ui';
import { useVault } from '../../store/vault';
import type { EffectiveTheme } from '../../theme/theme';
import { CommandButton } from '../common/CommandButton';
import { showMenuBelow, type MenuItem } from '../common/Menu';
import { BrandMark } from '../common/visuals';

const MENU: { label: string; ids: (string | '-')[] }[] = [
  { label: 'Vault', ids: ['vault.create', 'vault.open', 'vault.reveal', '-', 'vault.changePassword', 'vault.importKeePass', 'vault.import', 'vault.export', '-', 'vault.lock'] },
  { label: 'Items', ids: ['entry.new', 'entry.newCard', 'entry.newNote', 'entry.newWifi', '-', 'entry.edit', 'entry.duplicate', 'entry.favorite', 'entry.delete', 'entry.restore', '-', 'group.new', 'trash.empty'] },
  { label: 'Copy', ids: ['entry.copyUsername', 'entry.copyPassword', 'entry.copyTotp', 'entry.openUrl'] },
  { label: 'View', ids: ['view.health', 'view.toggleSidebar', 'view.toggleDetails', 'view.toggleTheme', '-', 'view.palette', 'view.shortcuts', '-', 'app.checkUpdates'] },
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

/**
 * A slim title bar: the brand and vault name, the app menu, and a few global buttons. Everything about items lives in
 * the three columns below; this strip is mostly there to drag the window and to hold the window's caption buttons.
 */
export function TopBar({ theme }: { theme: EffectiveTheme }) {
  const pref = useSettings((s) => s.settings.theme);
  const sidebar = useUi((s) => s.sidebarVisible);
  const unlocked = useVault((s) => !!s.data);
  const name = useVault((s) => s.data?.name);
  const ThemeIcon = pref === 'system' ? SunMoon : theme === 'dark' ? Moon : Sun;
  const next = pref === 'system' ? 'dark' : pref === 'dark' ? 'light' : 'system';

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
      {unlocked && <CommandButton command="view.toggleSidebar" variant="icon" className={sidebar ? 'on' : ''} />}
      <div className="flex-1 topbar-drag" />
      {unlocked && <CommandButton command="tools.generator" variant="icon" />}
      <button className="icon-btn" title={`Theme: ${pref} — click for ${next}`} aria-label={`Theme ${pref}, switch to ${next}`} onClick={() => runCommand('view.toggleTheme')}>
        <ThemeIcon size={16} />
      </button>
      <CommandButton command="view.settings" variant="icon" />
    </header>
  );
}
