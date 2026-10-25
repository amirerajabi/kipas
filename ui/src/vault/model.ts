// The decrypted vault: entries, groups, and the helpers that create and normalise them. Everything here is plain data
// so it can be sealed as JSON (crypto.ts) and tested without a DOM.

export type EntryKind = 'login' | 'card' | 'note' | 'wifi';

export interface CustomField {
  id: string;
  name: string;
  value: string;
  /** Masked in the details pane and copied with the clipboard timeout, like the password. */
  secret: boolean;
}

export interface PasswordChange {
  password: string;
  /** When this password stopped being the current one. */
  changed: number;
}

export interface Entry {
  id: string;
  kind: EntryKind;
  groupId: string | null;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  /** Base32 secret or an otpauth:// URI; '' when the entry has no two-factor code. */
  totp: string;
  /** Auto-type sequence for this entry, like "{USERNAME}{TAB}{PASSWORD}"; '' uses the default from Settings. */
  autoType: string;
  tags: string[];
  favorite: boolean;
  fields: CustomField[];
  history: PasswordChange[];
  created: number;
  modified: number;
  passwordChanged: number;
  /** When it went to the trash; null while it is live. */
  trashed: number | null;
}

export interface Group {
  id: string;
  name: string;
  /** The group it sits in; null at the top level. Groups nest to any depth. */
  parentId: string | null;
}

export interface VaultData {
  version: 1;
  name: string;
  created: number;
  modified: number;
  groups: Group[];
  entries: Entry[];
}

export const KIND_LABEL: Record<EntryKind, string> = { login: 'Login', card: 'Card', note: 'Secure note', wifi: 'Wi-Fi' };
export const KINDS: EntryKind[] = ['login', 'card', 'note', 'wifi'];

/** Old passwords kept per entry; enough to undo a few changes without growing the vault forever. */
export const HISTORY_LIMIT = 10;

export function newId(): string {
  return crypto.randomUUID();
}

/** The fields a new entry of each kind starts with; the user can rename, remove or add more. */
function kindFields(kind: EntryKind): CustomField[] {
  const f = (name: string, secret = false): CustomField => ({ id: newId(), name, value: '', secret });
  switch (kind) {
    case 'card':
      return [f('Cardholder'), f('Number', true), f('Expiry'), f('Security code', true), f('PIN', true)];
    case 'wifi':
      return [f('Security')];
    default:
      return [];
  }
}

export function blankEntry(kind: EntryKind = 'login', groupId: string | null = null, now = Date.now()): Entry {
  return {
    id: newId(),
    kind,
    groupId,
    title: '',
    username: '',
    password: '',
    url: '',
    notes: '',
    totp: '',
    autoType: '',
    tags: [],
    favorite: false,
    fields: kindFields(kind),
    history: [],
    created: now,
    modified: now,
    passwordChanged: now,
    trashed: null,
  };
}

export function emptyVault(name: string, now = Date.now()): VaultData {
  return {
    version: 1,
    name,
    created: now,
    modified: now,
    groups: [
      { id: newId(), name: 'Personal', parentId: null },
      { id: newId(), name: 'Work', parentId: null },
    ],
    entries: [],
  };
}

/**
 * Apply an edit to an entry, keeping the password history: a changed password pushes the old one (newest first) and
 * restarts its age.
 */
export function editEntry(old: Entry, patch: Partial<Entry>, now = Date.now()): Entry {
  const next: Entry = { ...old, ...patch, id: old.id, created: old.created, modified: now };
  if (patch.password !== undefined && patch.password !== old.password) {
    next.passwordChanged = now;
    if (old.password) next.history = [{ password: old.password, changed: now }, ...old.history].slice(0, HISTORY_LIMIT);
  }
  return next;
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Read a decrypted payload defensively: a vault written by an older or newer build still opens with sane defaults. */
export function normalizeVault(raw: unknown): VaultData {
  const r = (raw ?? {}) as Record<string, unknown>;
  const now = Date.now();
  const groups = (Array.isArray(r.groups) ? r.groups : [])
    .map((g) => g as Record<string, unknown>)
    .filter((g) => typeof g.id === 'string')
    .map((g): Group => ({ id: g.id as string, name: str(g.name, 'Group'), parentId: typeof g.parentId === 'string' ? g.parentId : null }));
  fixGroupParents(groups);
  const groupIds = new Set(groups.map((g) => g.id));
  const entries = (Array.isArray(r.entries) ? r.entries : [])
    .map((e) => e as Record<string, unknown>)
    .filter((e) => typeof e.id === 'string')
    .map((e): Entry => {
      const created = num(e.created, now);
      const kind = KINDS.includes(e.kind as EntryKind) ? (e.kind as EntryKind) : 'login';
      return {
        id: e.id as string,
        kind,
        groupId: typeof e.groupId === 'string' && groupIds.has(e.groupId) ? e.groupId : null,
        title: str(e.title),
        username: str(e.username),
        password: str(e.password),
        url: str(e.url),
        notes: str(e.notes),
        totp: str(e.totp),
        autoType: str(e.autoType),
        tags: Array.isArray(e.tags) ? e.tags.filter((t): t is string => typeof t === 'string') : [],
        favorite: e.favorite === true,
        fields: (Array.isArray(e.fields) ? e.fields : []).map((f) => {
          const x = (f ?? {}) as Record<string, unknown>;
          return { id: str(x.id) || newId(), name: str(x.name), value: str(x.value), secret: x.secret === true };
        }),
        history: (Array.isArray(e.history) ? e.history : []).map((h) => {
          const x = (h ?? {}) as Record<string, unknown>;
          return { password: str(x.password), changed: num(x.changed, created) };
        }),
        created,
        modified: num(e.modified, created),
        passwordChanged: num(e.passwordChanged, created),
        trashed: typeof e.trashed === 'number' ? e.trashed : null,
      };
    });
  return { version: 1, name: str(r.name, 'Vault'), created: num(r.created, now), modified: num(r.modified, now), groups, entries };
}

/** Host name for display and avatars: "https://www.github.com/login" -> "github.com". */
export function hostOf(url: string): string {
  const u = url.trim();
  if (!u) return '';
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** A URL the browser can open; bare host names get https://. Only http(s) is ever opened. */
export function openableUrl(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  const full = /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`;
  try {
    const parsed = new URL(full);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/**
 * Make the group tree sound: a parent that does not exist, or a loop (A inside B inside A), puts the group back at the
 * top level. Works in place; used when a vault is read, so a damaged file still opens.
 */
export function fixGroupParents(groups: Group[]): void {
  const byId = new Map(groups.map((g) => [g.id, g]));
  for (const g of groups) {
    if (g.parentId !== null && !byId.has(g.parentId)) g.parentId = null;
    const seen = new Set([g.id]);
    for (let p = g.parentId; p !== null; p = byId.get(p)?.parentId ?? null) {
      if (seen.has(p)) {
        g.parentId = null;
        break;
      }
      seen.add(p);
    }
  }
}

/** "Internet / Social" for a group inside "Internet". */
export function groupPath(groups: Group[], id: string | null, separator = ' / '): string {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const names: string[] = [];
  for (let g = id ? byId.get(id) : undefined; g; g = g.parentId ? byId.get(g.parentId) : undefined) {
    names.unshift(g.name);
    if (names.length > 64) break;
  }
  return names.join(separator);
}

/** The group and every group inside it, at any depth. */
export function groupAndDescendants(groups: Group[], id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const g of groups) {
      if (g.parentId && out.has(g.parentId) && !out.has(g.id)) {
        out.add(g.id);
        grew = true;
      }
    }
  }
  return out;
}

/** Groups in tree order (each followed by its subgroups, names A-Z at every level), with their depth. */
export function groupTree(groups: Group[]): { group: Group; depth: number }[] {
  const kids = new Map<string | null, Group[]>();
  for (const g of groups) kids.set(g.parentId, [...(kids.get(g.parentId) ?? []), g]);
  const out: { group: Group; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const g of (kids.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
      out.push({ group: g, depth });
      walk(g.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Can `id` move into `parentId` without ending up inside itself? */
export function canMoveGroup(groups: Group[], id: string, parentId: string | null): boolean {
  return parentId === null || !groupAndDescendants(groups, id).has(parentId);
}

/**
 * Turns group paths (["Internet", "Social"]) into nested groups for an import: a level that already exists under the
 * same parent (same name, any case) is reused, the rest are created and listed in `created`.
 */
export function groupResolver(existing: Group[]): { resolve(path: string[]): string | null; created: Group[] } {
  const created: Group[] = [];
  const key = (parentId: string | null, name: string) => `${parentId ?? ''}\u0000${name.trim().toLowerCase()}`;
  const known = new Map(existing.map((g) => [key(g.parentId, g.name), g.id]));
  return {
    created,
    resolve(path) {
      let parentId: string | null = null;
      for (const raw of path) {
        const name = raw.trim();
        if (!name) continue;
        let id = known.get(key(parentId, name));
        if (!id) {
          id = newId();
          created.push({ id, name, parentId });
          known.set(key(parentId, name), id);
        }
        parentId = id;
      }
      return parentId;
    },
  };
}
