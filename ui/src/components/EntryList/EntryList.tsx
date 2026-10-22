import { ArrowDown, ArrowUp, Download, KeyRound, Plus, SearchX, Star, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { importFromCsv, newEntry } from '../../app/actions';
import { runCommand } from '../../app/commands';
import { formatAge } from '../../lib/format';
import { useList, visibleEntries, type SortKey } from '../../store/list';
import { useSettings } from '../../store/settings';
import { useVault } from '../../store/vault';
import { hostOf, type Entry } from '../../vault/model';
import { Avatar, Kbd, StrengthDot } from '../common/visuals';
import { ENTRY_DRAG } from '../Sidebar/VaultPanel';
import { entryMenu } from './contextMenu';

const COLUMNS: { key: SortKey | null; label: string; className: string }[] = [
  { key: 'title', label: 'Title', className: 'col-title' },
  { key: 'username', label: 'User name', className: 'col-user' },
  { key: null, label: 'Website', className: 'col-site' },
  { key: null, label: 'Group', className: 'col-group' },
  { key: 'modified', label: 'Modified', className: 'col-date' },
];

/** The item list: sortable columns, multi-select (Ctrl/Shift), keyboard navigation, context menu, drag to a group. */
export function EntryList() {
  const data = useVault((s) => s.data);
  const filter = useList((s) => s.filter);
  const query = useList((s) => s.query);
  const sort = useList((s) => s.sort);
  const selected = useList((s) => s.selected);
  const showPassword = useSettings((s) => s.settings.showPasswordColumn);
  const ref = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => visibleEntries(data, { filter, query, sort }), [data, filter, query, sort]);
  const groups = useMemo(() => new Map((data?.groups ?? []).map((g) => [g.id, g.name])), [data]);
  const sel = useMemo(() => new Set(selected), [selected]);

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
      if (r && current(rows, focusId)) entryMenu(r.left + 40, r.bottom, current(rows, focusId)!);
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

  return (
    <div className={`entry-table${showPassword ? ' with-password' : ''}`}>
      <div className="entry-header entry-grid" role="row">
        {COLUMNS.map((c) => (
          <button
            key={c.label}
            type="button"
            role="columnheader"
            className={`entry-th ${c.className}${c.key && sort.key === c.key ? ' sorted' : ''}`}
            disabled={!c.key}
            onClick={() => c.key && useList.getState().setSort(c.key)}
            aria-sort={c.key && sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
          >
            {c.label}
            {c.key && sort.key === c.key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
          </button>
        ))}
        {showPassword && <span className="entry-th col-pass">Password</span>}
      </div>
      <div ref={ref} className="entry-list" role="listbox" aria-multiselectable="true" aria-label="Items" tabIndex={0} onKeyDown={onKeyDown}>
        {rows.length === 0 ? (
          <Empty totalLive={totalLive} />
        ) : (
          rows.map((entry, n) => {
            const isSel = sel.has(entry.id);
            const host = hostOf(entry.url);
            return (
              <div
                key={entry.id}
                role="option"
                aria-selected={isSel}
                className={`entry-row entry-grid${n % 2 ? ' alt' : ''}${isSel ? ' selected' : ''}${entry.id === selected[selected.length - 1] ? ' focus' : ''}`}
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
                <span className="entry-cell col-title">
                  <Avatar entry={entry} />
                  <span className="entry-title-text">
                    <span className="entry-title ellipsis">
                      {entry.title || <span className="muted">Untitled</span>}
                      {entry.favorite && <Star size={12} className="fav-star" aria-label="Favorite" />}
                    </span>
                    <span className="entry-sub ellipsis muted">{entry.username || host || entry.notes.split('\n')[0]}</span>
                  </span>
                </span>
                <span className="entry-cell col-user ellipsis">{entry.username}</span>
                <span className="entry-cell col-site ellipsis muted">{host}</span>
                <span className="entry-cell col-group ellipsis muted">{entry.groupId ? groups.get(entry.groupId) : ''}</span>
                <span className="entry-cell col-date muted tabular" title={new Date(entry.modified).toLocaleString()}>
                  {formatAge(entry.modified)}
                </span>
                {showPassword && (
                  <span className="entry-cell col-pass">
                    {entry.password ? (
                      <>
                        <span className="mask">••••••••</span>
                        <StrengthDot password={entry.password} />
                      </>
                    ) : null}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function current(rows: Entry[], id: string | undefined): Entry | undefined {
  return rows.find((r) => r.id === id);
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
        <p className="muted">Add your first password, or bring them over from another password manager or your browser.</p>
        <div className="empty-actions">
          <button className="btn btn-primary" onClick={() => newEntry('login')}>
            <Plus size={16} /> Add a login
          </button>
          <button className="btn" onClick={() => void importFromCsv()}>
            <Download size={16} /> Import from CSV
          </button>
        </div>
        <ul className="empty-tips muted">
          <li>
            <Kbd shortcut="Mod+N" /> new item
          </li>
          <li>
            <Kbd shortcut="Mod+G" /> password generator
          </li>
          <li>
            <Kbd shortcut="Mod+K" /> find anything
          </li>
          <li>Every change is saved and encrypted at once. Nothing leaves this device.</li>
        </ul>
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
