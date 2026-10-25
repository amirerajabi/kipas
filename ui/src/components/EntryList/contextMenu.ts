import { ArchiveRestore, Copy, Folder, FolderInput, FolderMinus, KeyRound, Pencil, SquareArrowOutUpRight, Star, TextCursorInput, Timer, Trash2, User } from 'lucide-react';
import { autoTypeEntry, copyText, copyTotp, deleteEntries, duplicate, editEntry, openUrl, selectedEntries } from '../../app/actions';
import { useList } from '../../store/list';
import { useVault } from '../../store/vault';
import { groupTree, openableUrl, type Entry } from '../../vault/model';
import { parseTotp } from '../../vault/totp';
import { useMenu, type MenuItem } from '../common/Menu';

/** Right-click menu for an item (or the selection it belongs to). */
export function entryMenu(x: number, y: number, entry: Entry): void {
  const data = useVault.getState().data;
  if (!data) return;
  const sel = selectedEntries();
  const many = sel.length > 1;

  if (entry.trashed) {
    useMenu.getState().show(x, y, [
      { label: 'Restore', icon: ArchiveRestore, run: () => useVault.getState().restore(sel.map((e) => e.id)) },
      'separator',
      { label: 'Delete for good', icon: Trash2, danger: true, run: () => deleteEntries(sel.map((e) => e.id)) },
    ]);
    return;
  }

  const moveTo = (groupId: string | null) => {
    for (const e of sel) useVault.getState().updateEntry(e.id, { groupId });
  };
  const groups = groupTree(data.groups);
  const items: MenuItem[] = [
    { label: 'Auto-type', icon: TextCursorInput, shortcut: 'Mod+V', disabled: many || (!entry.username && !entry.password), run: () => autoTypeEntry(entry) },
    { label: 'Copy user name', icon: User, shortcut: 'Mod+B', disabled: many || !entry.username, run: () => copyText(entry.username, 'User name', false) },
    { label: 'Copy password', icon: KeyRound, shortcut: 'Mod+C', disabled: many || !entry.password, run: () => copyText(entry.password, 'Password') },
    { label: 'Copy one-time code', icon: Timer, shortcut: 'Mod+T', disabled: many || !parseTotp(entry.totp), run: () => copyTotp(entry) },
    { label: 'Open website', icon: SquareArrowOutUpRight, shortcut: 'Mod+U', disabled: many || !openableUrl(entry.url), run: () => openUrl(entry) },
    'separator',
    { label: 'Edit…', icon: Pencil, shortcut: 'Enter', disabled: many, run: () => editEntry(entry.id) },
    { label: 'Duplicate', icon: Copy, shortcut: 'Mod+D', disabled: many, run: () => duplicate(entry) },
    {
      label: sel.every((e) => e.favorite) ? 'Remove from favorites' : 'Add to favorites',
      icon: Star,
      run: () => {
        const on = !sel.every((e) => e.favorite);
        for (const e of sel) useVault.getState().updateEntry(e.id, { favorite: on });
      },
    },
    {
      label: 'Move to group',
      icon: FolderInput,
      submenu: [
        ...groups.map(({ group: g, depth }): MenuItem => ({ label: `${'\u2003'.repeat(depth)}${g.name}`, icon: Folder, checked: sel.every((e) => e.groupId === g.id), run: () => moveTo(g.id) })),
        ...(groups.length ? (['separator'] as MenuItem[]) : []),
        { label: 'No group', icon: FolderMinus, run: () => moveTo(null) },
      ],
    },
    'separator',
    { label: many ? `Move ${sel.length} items to trash` : 'Move to trash', icon: Trash2, shortcut: 'Delete', danger: true, run: () => deleteEntries(useList.getState().selected) },
  ];
  useMenu.getState().show(x, y, items);
}
