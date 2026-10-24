import { ArrowDownUp, Copy, Download, FileLock2, KeyRound, Plus, Search, SearchX, Star, Trash2, User, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { copyText, emptyTrash, importFromCsv, newEntry } from '../../app/actions';
import { getCommand, runCommand } from '../../app/commands';
import { withShortcut } from '../../app/keys';
import { pluralize } from '../../lib/format';
import { healthOf, useList, visibleEntries, type Filter, type SortKey } from '../../store/list';
import { useUi } from '../../store/ui';
import { useVault } from '../../store/vault';
import { HEALTH_LABEL } from '../../vault/health';
import { hostOf, KIND_LABEL, KINDS, type Entry, type VaultData } from '../../vault/model';
import { showMenuBelow } from '../common/Menu';
import { Avatar, KindIcon } from '../common/visuals';
import { ENTRY_DRAG } from '../Sidebar/VaultPanel';
import { entryMenu } from './contextMenu';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'title', label: 'Name' },
  { key: 'modified', label: 'Recently changed' },
  { key: 'created', label: 'Recently added' },
  { key: 'username', label: 'User name' },
];

const PLURAL: Record<string, string> = { login: 'Logins', card: 'Cards', note: 'Secure notes', wifi: 'Wi-Fi networks' };

function filterTitle(f: Filter, data: VaultData): string {
  switch (f.kind) {
    case 'all':
      return 'All items';
    case 'favorites':
      return 'Favorites';
    case 'trash':
      return 'Trash';
    case 'type':
      return PLURAL[f.id] ?? KIND_LABEL[f.id];
    case 'group':
      return data.groups.find((g) => g.id === f.id)?.name ?? 'Group';
    case 'health':
      return HEALTH_LABEL[f.id];
  }
}

/** The middle column: what is shown, search, and the items as roomy rows with quick copy buttons. */
export function EntryList() {
  const data = useVault((s) => s.data);
  const filter = useList((s) => s.filter);
  const query = useList((s) => s.query);
  const sort = useList((s) => s.sort);
  const selected = useList((s) => s.selected);
  const ref = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => visibleEntries(data, { filter, query, sort }), [data, filter, query, sort]);
  const sel = useMemo(() => new Set(selected), [selected]);
  const flagged = useMemo(() => {
    if (!data) return new Map<string, string>();
    const r = healthOf(data.entries);
    const m = new Map<string, string>();
    for (const id of r.reused) m.set(id, 'Reused');
    for (const id of r.weak) m.set(id, 'Weak');
    return m;
  }, [data]);

  // Drop selected ids that left the view (deleted, filtered out by a search).
  useEffect(() => {
    const visible = new Set(rows.map((r) => r.id));
    if (selected.some((id) => !visible.has(id))) useList.getState().select(selected.filter((id) => visible.has(id)));
  }, [rows, selected]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const first = () => rows[0] && useList.getState().select([rows[0].id]);
    el.addEventListener('select-first', first);
    return () => el.removeEventListener('select-first', first);
  }, [rows]);

  useEffect(() => {
    ref.current?.querySelector('.entry-row.focus')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const click = (e: React.MouseEvent, entry: Entry) => {
    const s = useList.getState();
    if (e.shiftKey && s.anchor) {
      const a = rows.findIndex((r) => r.id === s.anchor);
      const b = rows.findIndex((r) => r.id === entry.id);
      const [from, to] = a < b ? [a, b] : [b, a];
      s.select(rows.slice(from, to + 1).map((r) => r.id), s.anchor);
    } else if (e.ctrlKey || e.metaKey) {
      s.select(sel.has(entry.id) ? selected.filter((id) => id !== entry.id) : [...selected, entry.id], entry.id);
    } else s.select([entry.id]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!rows.length) return;
    const s = useList.getState();
    const focusId = selected[selected.length - 1];
    const i = rows.findIndex((r) => r.id === focusId);
    let next = -1;
    if (e.key === 'ArrowDown') next = Math.min(rows.length - 1, i + 1);
    else if (e.key === 'ArrowUp') next = Math.max(0, i < 0 ? 0 : i - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = rows.length - 1;
    else if (e.key === 'PageDown') next = Math.min(rows.length - 1, Math.max(0, i) + 10);
    else if (e.key === 'PageUp') next = Math.max(0, i - 10);
    else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault();
      const row = ref.current?.querySelector('.entry-row.focus') as HTMLElement | null;
      const r = row?.getBoundingClientRect();
      const entry = rows.find((x) => x.id === focusId);
      if (r && entry) entryMenu(r.left + 40, r.bottom, entry);
      return;
    }
    if (next < 0) return;
    e.preventDefault();
    if (e.shiftKey && s.anchor) {
      const a = rows.findIndex((r) => r.id === s.anchor);
      const [from, to] = a < next ? [a, next] : [next, a];
      const ids = rows.slice(from, to + 1).map((r) => r.id);
      // Keep the moving end last, so the next arrow continues from it.
      s.select([...ids.filter((id) => id !== rows[next].id), rows[next].id], s.anchor);
    } else s.select([rows[next].id]);
  };

  if (!data) return null;
  const totalLive = data.entries.filter((e) => !e.trashed).length;
  const trash = filter.kind === 'trash';
  // Favourites come first when sorted by name; label the two parts when both are there.
  const sections = sort.key === 'title' && !query && filter.kind !== 'favorites' && !trash && rows.some((r) => r.favorite) && rows.some((r) => !r.favorite);

  return (
    <section className="entry-column" aria-label="Items">
      <div className="entry-head">
        <div className="entry-head-row">
          <h2 className="entry-head-title ellipsis">{query ? 'Search results' : filterTitle(filter, data)}</h2>
          <span className="muted tabular">{rows.length}</span>
          <div className="flex-1" />
          <button
            className="icon-btn"
            title="Sort"
            aria-label="Sort"
            onClick={(e) =>
              showMenuBelow(
                e.currentTarget,
                SORTS.map((s) => ({ label: s.label, checked: sort.key === s.key, run: () => useList.getState().setSort(s.key) })),
              )
            }
          >
            <ArrowDownUp size={15} />
          </button>
          {trash ? (
            <button className="btn btn-xs" onClick={() => void emptyTrash()} disabled={rows.length === 0}>
              <Trash2 size={13} /> Empty
            </button>
          ) : (
            <button
              className="new-btn"
              title={withShortcut('New item', getCommand('entry.new')?.shortcut)}
              aria-label="New item"
              aria-haspopup="menu"
              onClick={(e) => showMenuBelow(e.currentTarget, KINDS.map((k) => ({ label: `New ${KIND_LABEL[k].toLowerCase()}`, run: () => newEntry(k) })))}
            >
              <Plus size={18} />
            </button>
          )}
        </div>
        <label className="entry-search" title={withShortcut('Search the vault', getCommand('view.focusFilter')?.shortcut)}>
          <Search size={15} />
          <input
            id="list-filter"
            placeholder={trash ? 'Search the trash' : `Search ${pluralize(totalLive, 'item')}`}
            value={query}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => useList.getState().setQuery(e.target.value)}
            onKeyDown={(e) => {
              const list = ref.current;
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
          {query ? (
            <button className="icon-btn xs" aria-label="Clear search" onClick={() => useList.getState().setQuery('')}>
              <X size={14} />
            </button>
          ) : (
            <kbd className="entry-search-kbd">Ctrl F</kbd>
          )}
        </label>
      </div>
      <div ref={ref} className="entry-list" role="listbox" aria-multiselectable="true" aria-label="Items" tabIndex={0} onKeyDown={onKeyDown}>
        {rows.length === 0 ? (
          <Empty totalLive={totalLive} />
        ) : (
          rows.map((entry, n) => {
            const isSel = sel.has(entry.id);
            const host = hostOf(entry.url);
            const heading = sections && (n === 0 ? 'Favorites' : rows[n - 1].favorite && !entry.favorite ? 'All items' : null);
            const badge = flagged.get(entry.id);
            return (
              <div key={entry.id}>
                {heading && <div className="entry-section">{heading}</div>}
                <div
                  role="option"
                  aria-selected={isSel}
                  className={`entry-row${isSel ? ' selected' : ''}${entry.id === selected[selected.length - 1] ? ' focus' : ''}`}
                  // A plain press on a selected row waits for the click, so the whole selection can be dragged to a group.
                  onMouseDown={(e) => e.button === 0 && !(isSel && !e.shiftKey && !e.ctrlKey && !e.metaKey) && click(e, entry)}
                  onClick={(e) => isSel && !e.shiftKey && !e.ctrlKey && !e.metaKey && selected.length > 1 && useList.getState().select([entry.id])}
                  onDoubleClick={() => runCommand(entry.trashed ? 'entry.restore' : 'entry.edit')}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!isSel) useList.getState().select([entry.id]);
                    entryMenu(e.clientX, e.clientY, entry);
                  }}
                  draggable={!entry.trashed}
                  onDragStart={(e) => {
                    const ids = isSel ? selected : [entry.id];
                    if (!isSel) useList.getState().select([entry.id]);
                    e.dataTransfer.setData(ENTRY_DRAG, JSON.stringify(ids));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                >
                  <Avatar entry={entry} size={34} />
                  <span className="entry-text">
                    <span className="entry-title ellipsis">
                      {entry.title || <span className="muted">Untitled</span>}
                      {entry.favorite && !sections && <Star size={12} className="fav-star" aria-label="Favorite" />}
                    </span>
                    <span className="entry-sub ellipsis">
                      {entry.kind !== 'login' && !entry.username && <KindIcon kind={entry.kind} size={12} />}
                      {entry.username || host || entry.notes.split('\n')[0] || KIND_LABEL[entry.kind]}
                    </span>
                  </span>
                  {badge && !trash && <span className="entry-badge">{badge}</span>}
                  {!entry.trashed && (entry.username || entry.password) && (
                    <span className="entry-quick" onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                      {entry.username && (
                        <button className="quick-btn" title="Copy user name" aria-label={`Copy user name of ${entry.title}`} onClick={() => copyText(entry.username, 'User name', false)}>
                          <User size={14} />
                        </button>
                      )}
                      {entry.password && (
                        <button className="quick-btn primary" title="Copy password" aria-label={`Copy password of ${entry.title}`} onClick={() => copyText(entry.password, 'Password')}>
                          <Copy size={14} />
                        </button>
                      )}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function Empty({ totalLive }: { totalLive: number }) {
  const filter = useList((s) => s.filter);
  const query = useList((s) => s.query);
  if (query) {
    return (
      <div className="empty-state small">
        <SearchX size={28} className="muted" />
        <p>
          Nothing matches “{query}”. <button className="link-btn" onClick={() => useList.getState().setQuery('')}>Clear the search</button>
        </p>
      </div>
    );
  }
  if (filter.kind === 'trash') {
    return (
      <div className="empty-state small">
        <Trash2 size={28} className="muted" />
        <p>The trash is empty. Deleted items wait here until you empty it.</p>
      </div>
    );
  }
  if (totalLive === 0) {
    return (
      <div className="empty-state">
        <div className="empty-illustration">
          <KeyRound size={30} />
        </div>
        <h2>Your vault is ready</h2>
        <p className="muted">Add your first password, or bring them over from KeePass, another password manager or your browser.</p>
        <div className="empty-actions">
          <button className="btn btn-primary" onClick={() => newEntry('login')}>
            <Plus size={16} /> Add a login
          </button>
          <button className="btn" onClick={() => useUi.getState().set({ keepassImportOpen: true })}>
            <FileLock2 size={16} /> Import from KeePass
          </button>
          <button className="btn" onClick={() => void importFromCsv()}>
            <Download size={16} /> Import CSV
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="empty-state small">
      <p className="muted">
        Nothing here yet.{' '}
        {filter.kind !== 'health' && (
          <button className="link-btn" onClick={() => newEntry()}>
            Add an item
          </button>
        )}
      </p>
    </div>
  );
}
