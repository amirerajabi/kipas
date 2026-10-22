import { Search, X } from 'lucide-react';
import { getCommand } from '../../app/commands';
import { withShortcut } from '../../app/keys';
import { useList } from '../../store/list';
import { CommandButton } from '../common/CommandButton';

const SHORT: Record<string, string> = {
  'entry.new': 'New',
  'entry.copyUsername': 'User name',
  'entry.copyPassword': 'Password',
  'entry.copyTotp': 'Code',
  'entry.openUrl': 'Open site',
  'entry.edit': 'Edit',
  'entry.delete': 'Delete',
  'entry.restore': 'Restore',
  'trash.empty': 'Empty trash',
  'tools.generator': 'Generator',
  'vault.lock': 'Lock',
};

/** The main toolbar (big icon over label), with the vault search on the right. */
export function Toolbar() {
  const query = useList((s) => s.query);
  const trash = useList((s) => s.filter.kind === 'trash');
  const groups = trash
    ? [['entry.restore', 'entry.delete', 'trash.empty'], ['tools.generator', 'vault.lock']]
    : [['entry.new'], ['entry.copyUsername', 'entry.copyPassword', 'entry.copyTotp', 'entry.openUrl'], ['entry.edit', 'entry.delete'], ['tools.generator', 'vault.lock']];
  const filterShortcut = getCommand('view.focusFilter')?.shortcut;
  return (
    <div className="toolbar" role="toolbar" aria-label="Items">
      {groups.map((g, i) => (
        <div key={i} className="tool-group">
          {g.map((id) => (
            <CommandButton key={id} command={id} label={SHORT[id]} />
          ))}
        </div>
      ))}
      <div className="flex-1" />
      <div className="search-box" title={withShortcut('Search the vault', filterShortcut)}>
        <Search size={14} />
        <input
          id="list-filter"
          className="input borderless"
          placeholder={trash ? 'Search the trash' : 'Search title, user, site, tag'}
          value={query}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => useList.getState().setQuery(e.target.value)}
          onKeyDown={(e) => {
            const list = document.querySelector('.entry-list') as HTMLElement | null;
            if (e.key === 'Escape') {
              useList.getState().setQuery('');
              list?.focus();
            } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
              // Search, then Enter or ↓ lands on the first match, ready for Ctrl+C.
              e.preventDefault();
              list?.focus();
              list?.dispatchEvent(new CustomEvent('select-first'));
            }
          }}
        />
        {query && (
          <button className="icon-btn xs" aria-label="Clear search" onClick={() => useList.getState().setQuery('')}>
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
