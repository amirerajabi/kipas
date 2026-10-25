import { create } from 'zustand';
import { baseName, getPlatform } from '../platform';
import { createKey, DEFAULT_ITERATIONS, deriveKey, openVault, openWithKey, seal, WrongPasswordError, type VaultKey } from '../vault/crypto';
import { canMoveGroup, editEntry, emptyVault, newId, type Entry, type Group, type VaultData } from '../vault/model';

export type SaveState = 'saved' | 'saving' | 'error';

export interface RecentVault {
  path: string;
  name: string;
  opened: number;
}

interface VaultState {
  /** The open vault's file; null while locked. */
  path: string | null;
  data: VaultData | null;
  save: SaveState;
  saveError: string | null;
  lastSaved: number | null;
  recent: RecentVault[];
  create(path: string, name: string, password: string): Promise<void>;
  unlock(path: string, password: string): Promise<void>;
  /** Save what is pending, then forget the key and the data. False when the save failed (the vault stays open). */
  lock(force?: boolean): Promise<boolean>;
  /** Every change goes through here: the new data is shown at once and written shortly after. */
  apply(recipe: (d: VaultData) => VaultData): void;
  flush(): Promise<void>;
  changePassword(current: string, next: string, iterations?: number): Promise<void>;
  /** Put a vault file at the top of the lock screen's list. */
  remember(path: string, name?: string): void;
  forgetRecent(path: string): void;

  addEntry(e: Entry): void;
  updateEntry(id: string, patch: Partial<Entry>): void;
  trash(ids: string[]): void;
  restore(ids: string[]): void;
  purge(ids: string[]): void;
  addGroup(name: string, parentId?: string | null): string;
  renameGroup(id: string, name: string): void;
  /** Put a group inside another (or at the top level with null); refused when it would end up inside itself. */
  moveGroup(id: string, parentId: string | null): boolean;
  /** Its subgroups and items move up into its parent. */
  deleteGroup(id: string): void;
  importEntries(entries: Entry[], groups: Group[]): void;
}

const RECENT_KEY = 'kipas.recent';

function loadRecent(): RecentVault[] {
  try {
    const r = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentVault[];
    return Array.isArray(r) ? r.filter((x) => typeof x?.path === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecent(list: RecentVault[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* private mode */
  }
}

// Outside the store on purpose: the key never shows up in DevTools' store snapshots or in a re-render.
let key: VaultKey | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** Bumped on every change; a write that finishes for an older generation leaves the state at 'saving'. */
let generation = 0;
let chain: Promise<void> = Promise.resolve();

export const useVault = create<VaultState>((set, get) => {
  const remember = (path: string, name = baseName(path)) => {
    const recent = [{ path, name, opened: Date.now() }, ...get().recent.filter((r) => r.path !== path)].slice(0, 8);
    saveRecent(recent);
    set({ recent });
  };

  /** Queue one write of the current data; writes never overlap, so the newest data always lands last. */
  const write = (): Promise<void> => {
    const gen = generation;
    chain = chain.then(async () => {
      const { path, data } = get();
      if (!path || !data || !key) return;
      try {
        const text = await seal(key, data);
        await getPlatform().writeVault(path, text);
        if (gen === generation) set({ save: 'saved', saveError: null, lastSaved: Date.now() });
      } catch (e) {
        set({ save: 'error', saveError: e instanceof Error ? e.message : String(e) });
      }
    });
    return chain;
  };

  const touch = (entries: Entry[], ids: Set<string>, fn: (e: Entry) => Entry) => entries.map((e) => (ids.has(e.id) ? fn(e) : e));

  return {
    path: null,
    data: null,
    save: 'saved',
    saveError: null,
    lastSaved: null,
    recent: loadRecent(),

    async create(path, name, password) {
      const vk = await createKey(password);
      const data = emptyVault(name);
      await getPlatform().writeVault(path, await seal(vk, data));
      key = vk;
      set({ path, data, save: 'saved', saveError: null, lastSaved: Date.now() });
      remember(path, name);
    },

    async unlock(path, password) {
      const text = await getPlatform().readVault(path);
      const { vk, data } = await openVault(text, password);
      key = vk;
      generation++;
      set({ path, data, save: 'saved', saveError: null, lastSaved: null });
      remember(path, data.name);
    },

    async lock(force = false) {
      await get().flush();
      if (get().save === 'error' && !force) return false;
      clearTimeout(saveTimer);
      key = null;
      getPlatform().clearClipboard();
      set({ path: null, data: null, save: 'saved', saveError: null });
      return true;
    },

    apply(recipe) {
      const d = get().data;
      if (!d) return;
      generation++;
      set({ data: { ...recipe(d), modified: Date.now() }, save: 'saving' });
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void write(), 300);
    },

    async flush() {
      if (get().save === 'saved') return chain;
      clearTimeout(saveTimer);
      return write();
    },

    async changePassword(current, next, iterations = key?.kdf.iterations ?? DEFAULT_ITERATIONS) {
      if (!key) throw new Error('The vault is locked.');
      // The key is opaque, so the current password is checked by sealing a probe with the key it derives and opening
      // that probe with the key in use: only the same password (and salt) produces a key that can.
      const path = get().path!;
      await get().flush();
      const probe = await seal({ key: await deriveKey(current, key.kdf), kdf: key.kdf }, emptyVault('probe'));
      await openWithKey(probe, key).catch(() => {
        throw new WrongPasswordError();
      });
      const vk = await createKey(next, iterations);
      await getPlatform().writeVault(path, await seal(vk, get().data!));
      key = vk;
      set({ save: 'saved', saveError: null, lastSaved: Date.now() });
    },

    remember,

    forgetRecent(path) {
      const recent = get().recent.filter((r) => r.path !== path);
      saveRecent(recent);
      set({ recent });
    },

    addEntry: (e) => get().apply((d) => ({ ...d, entries: [...d.entries, e] })),
    updateEntry: (id, patch) => get().apply((d) => ({ ...d, entries: d.entries.map((e) => (e.id === id ? editEntry(e, patch) : e)) })),
    trash: (ids) => get().apply((d) => ({ ...d, entries: touch(d.entries, new Set(ids), (e) => ({ ...e, trashed: Date.now() })) })),
    restore: (ids) => get().apply((d) => ({ ...d, entries: touch(d.entries, new Set(ids), (e) => ({ ...e, trashed: null })) })),
    purge(ids) {
      const set_ = new Set(ids);
      get().apply((d) => ({ ...d, entries: d.entries.filter((e) => !set_.has(e.id)) }));
    },
    addGroup(name, parentId = null) {
      const id = newId();
      get().apply((d) => ({ ...d, groups: [...d.groups, { id, name, parentId }] }));
      return id;
    },
    renameGroup: (id, name) => get().apply((d) => ({ ...d, groups: d.groups.map((g) => (g.id === id ? { ...g, name } : g)) })),
    moveGroup(id, parentId) {
      const d = get().data;
      if (!d || id === parentId || !canMoveGroup(d.groups, id, parentId)) return false;
      get().apply((v) => ({ ...v, groups: v.groups.map((g) => (g.id === id ? { ...g, parentId } : g)) }));
      return true;
    },
    deleteGroup: (id) =>
      get().apply((d) => {
        const parent = d.groups.find((g) => g.id === id)?.parentId ?? null;
        return {
          ...d,
          groups: d.groups.filter((g) => g.id !== id).map((g) => (g.parentId === id ? { ...g, parentId: parent } : g)),
          entries: d.entries.map((e) => (e.groupId === id ? { ...e, groupId: parent } : e)),
        };
      }),
    importEntries: (entries, groups) => get().apply((d) => ({ ...d, groups: [...d.groups, ...groups], entries: [...d.entries, ...entries] })),
  };
});

export function isUnlocked(): boolean {
  return useVault.getState().data !== null;
}
