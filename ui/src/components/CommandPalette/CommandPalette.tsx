import { CornerDownLeft, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { copyText } from '../../app/actions';
import { COMMANDS, runCommand } from '../../app/commands';
import { matchesQuery } from '../../store/list';
import { useList } from '../../store/list';
import { useUi } from '../../store/ui';
import { useVault } from '../../store/vault';
import { hostOf, type Entry } from '../../vault/model';
import { Avatar, Kbd } from '../common/visuals';

type Item = { kind: 'command'; id: string; label: string; score: number } | { kind: 'entry'; entry: Entry; score: number };

/** Subsequence match: every query character in order; earlier and contiguous hits score higher. */
function score(text: string, q: string): number {
  if (!q) return 1;
  const t = text.toLowerCase();
  const direct = t.indexOf(q);
  if (direct >= 0) return 100 - direct;
  let ti = 0;
  let s = 0;
  for (const ch of q) {
    const i = t.indexOf(ch, ti);
    if (i < 0) return 0;
    s += i === ti ? 3 : 1;
    ti = i + 1;
  }
  return s;
}

/**
 * Ctrl+K: jump to any item or run any command. Enter selects the item; Ctrl+Enter copies its password straight away.
 * Type ">" to list commands only.
 */
export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  if (!open) return null;
  return <Palette />;
}

function Palette() {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const data = useVault((s) => s.data);
  const listRef = useRef<HTMLDivElement>(null);
  const close = () => useUi.getState().set({ paletteOpen: false });

  const items = useMemo<Item[]>(() => {
    const commandsOnly = q.startsWith('>');
    const query = (commandsOnly ? q.slice(1) : q).trim().toLowerCase();
    const cmds: Item[] = COMMANDS.filter((c) => c.palette !== false && !c.disabled?.())
      .map((c) => ({ kind: 'command' as const, id: c.id, label: c.label, score: score(c.label, query) }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score);
    if (commandsOnly || !data) return cmds;
    const words = query.split(/\s+/).filter(Boolean);
    const entries: Item[] = query
      ? data.entries
          .filter((e) => !e.trashed && matchesQuery(e, words, ''))
          .map((e) => ({ kind: 'entry' as const, entry: e, score: Math.max(score(e.title, query), score(hostOf(e.url), query) - 5, 1) + (e.favorite ? 3 : 0) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 30)
      : [];
    return [...entries, ...cmds];
  }, [q, data]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (it: Item | undefined, copy = false) => {
    if (!it) return;
    close();
    if (it.kind === 'command') {
      setTimeout(() => runCommand(it.id), 0);
      return;
    }
    if (copy && it.entry.password) copyText(it.entry.password, 'Password');
    const s = useList.getState();
    s.setFilter({ kind: 'all' });
    s.setQuery('');
    s.select([it.entry.id]);
    setTimeout(() => (document.querySelector('.entry-list') as HTMLElement | null)?.focus(), 0);
  };

  return (
    <div className="overlay top" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="Command palette">
        <div className="palette-input-row">
          <Search size={16} className="muted" />
          <input
            className="palette-input"
            autoFocus
            value={q}
            spellCheck={false}
            placeholder="Find an item, or > for commands"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                choose(items[active], e.ctrlKey || e.metaKey);
              }
            }}
          />
        </div>
        <div ref={listRef} className="palette-list" role="listbox">
          {items.length === 0 && <div className="palette-empty muted">Nothing matches.</div>}
          {items.map((it, i) => {
            const c = it.kind === 'command' ? COMMANDS.find((x) => x.id === it.id) : null;
            return (
              <div
                key={it.kind === 'command' ? it.id : it.entry.id}
                role="option"
                aria-selected={i === active}
                className={`palette-item${i === active ? ' active' : ''}`}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(it)}
              >
                <span className="palette-icon">{it.kind === 'entry' ? <Avatar entry={it.entry} size={20} /> : c?.icon ? <c.icon size={16} /> : null}</span>
                <span className="palette-label ellipsis">{it.kind === 'entry' ? it.entry.title || 'Untitled' : it.label}</span>
                {it.kind === 'entry' && <span className="palette-detail muted ellipsis">{it.entry.username || hostOf(it.entry.url)}</span>}
                {c?.shortcut && <Kbd shortcut={c.shortcut} />}
                {i === active && it.kind === 'entry' && it.entry.password && <span className="palette-detail muted">Ctrl+Enter copies the password</span>}
                {i === active && <CornerDownLeft size={14} className="muted" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
