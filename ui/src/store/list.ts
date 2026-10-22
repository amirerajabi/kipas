import { create } from 'zustand';
import { analyzeHealth, type HealthIssue, type HealthReport } from '../vault/health';
import { hostOf, type Entry, type EntryKind, type VaultData } from '../vault/model';

export type Filter =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'type'; id: EntryKind }
  | { kind: 'group'; id: string }
  | { kind: 'trash' }
  | { kind: 'health'; id: HealthIssue };

export type SortKey = 'title' | 'username' | 'modified' | 'created';

interface ListState {
  filter: Filter;
  query: string;
  sort: { key: SortKey; dir: 1 | -1 };
  selected: string[];
  /** The row a Shift+click or Shift+arrow range starts from. */
  anchor: string | null;
  setFilter(f: Filter): void;
  setQuery(q: string): void;
  setSort(key: SortKey): void;
  select(ids: string[], anchor?: string | null): void;
  reset(): void;
}

export const useList = create<ListState>((set, get) => ({
  filter: { kind: 'all' },
  query: '',
  sort: { key: 'title', dir: 1 },
  selected: [],
  anchor: null,
  setFilter: (filter) => set({ filter, selected: [], anchor: null }),
  setQuery: (query) => set({ query }),
  setSort(key) {
    const s = get().sort;
    set({ sort: { key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'modified' || key === 'created' ? -1 : 1 } });
  },
  select: (selected, anchor) => set({ selected, anchor: anchor === undefined ? (selected[0] ?? null) : anchor }),
  reset: () => set({ filter: { kind: 'all' }, query: '', selected: [], anchor: null }),
}));

const healthCache = new WeakMap<Entry[], HealthReport>();

/** Health is recomputed only when the entry list changes (it is a new array after every edit). */
export function healthOf(entries: Entry[]): HealthReport {
  let r = healthCache.get(entries);
  if (!r) {
    r = analyzeHealth(entries);
    healthCache.set(entries, r);
  }
  return r;
}

function inFilter(e: Entry, f: Filter, health: () => HealthReport): boolean {
  if (f.kind === 'trash') return e.trashed !== null;
  if (e.trashed !== null) return false;
  switch (f.kind) {
    case 'all':
      return true;
    case 'favorites':
      return e.favorite;
    case 'type':
      return e.kind === f.id;
    case 'group':
      return e.groupId === f.id;
    case 'health':
      return health()[f.id].has(e.id);
  }
}

/** Every word of the query must appear in the title, user name, address, tags, notes or group. */
export function matchesQuery(e: Entry, words: string[], groupName: string): boolean {
  if (words.length === 0) return true;
  const hay = `${e.title}\n${e.username}\n${hostOf(e.url)}\n${e.url}\n${e.tags.join(' ')}\n${e.notes}\n${groupName}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function visibleEntries(data: VaultData | null, s: Pick<ListState, 'filter' | 'query' | 'sort'>): Entry[] {
  if (!data) return [];
  const words = s.query.toLowerCase().split(/\s+/).filter(Boolean);
  const groups = new Map(data.groups.map((g) => [g.id, g.name]));
  // A search looks through everything that is not in the trash, whatever the side panel shows, like a search box should.
  const filter: Filter = words.length && s.filter.kind !== 'trash' ? { kind: 'all' } : s.filter;
  const list = data.entries.filter((e) => inFilter(e, filter, () => healthOf(data.entries)) && matchesQuery(e, words, e.groupId ? (groups.get(e.groupId) ?? '') : ''));
  const { key, dir } = s.sort;
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  return list.sort((a, b) => {
    // Favourites first when sorting by name, the way people scan a list.
    if (key === 'title' && a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    const r = key === 'modified' || key === 'created' ? a[key] - b[key] : collator.compare(a[key] || '￿', b[key] || '￿');
    return r * dir || collator.compare(a.title, b.title);
  });
}
