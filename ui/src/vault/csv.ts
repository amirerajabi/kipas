// CSV import and export. Import recognises the column names that KeePass, KeePassXC, Bitwarden, 1Password, LastPass and
// the Chromium/Firefox password exports use; export writes KeePassXC's layout so the file opens elsewhere too.
import { blankEntry, groupPath, groupResolver, type Entry, type Group, type VaultData } from './model';

/** RFC 4180: quoted fields, doubled quotes, CRLF or LF, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

function csvField(v: string): string {
  return /[",\r\n]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

type Column = 'group' | 'title' | 'username' | 'password' | 'url' | 'notes' | 'totp' | 'tags' | 'favorite';

const ALIASES: Record<Column, string[]> = {
  group: ['group', 'folder', 'grouping', 'vault', 'category'],
  title: ['title', 'name', 'account', 'entry', 'item name'],
  username: ['username', 'user name', 'login name', 'login_username', 'login', 'email', 'user'],
  password: ['password', 'login_password', 'pass'],
  url: ['url', 'web site', 'website', 'login_uri', 'uri', 'address', 'urls'],
  notes: ['notes', 'note', 'comments', 'comment', 'extra'],
  totp: ['totp', 'login_totp', 'otp', 'otpauth', 'one-time password', 'otp secret'],
  tags: ['tags', 'tag', 'labels'],
  favorite: ['favorite', 'favourite', 'fav', 'starred'],
};

export interface CsvImport {
  entries: Entry[];
  /** Groups that did not exist yet and were created for the imported entries. */
  groups: Group[];
  skipped: number;
}

/** Build entries from a CSV export. Group paths are matched to existing groups (case-insensitive) or created, nested. */
export function importCsv(text: string, vault: Pick<VaultData, 'groups'>, now = Date.now()): CsvImport {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('The file has no rows to import.');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = {} as Record<Column, number>;
  for (const key of Object.keys(ALIASES) as Column[]) col[key] = header.findIndex((h) => ALIASES[key].includes(h));
  if (col.password < 0 && col.username < 0) throw new Error('No "password" or "username" column found. Export as CSV with a header row.');

  const groups = groupResolver(vault.groups);
  const groupFor = (name: string): string | null => {
    // Nested groups and folders come as paths: "Root/Internet/Mail" (KeePassXC), "Work/Clients" (Bitwarden). The
    // database root is not a group of its own.
    const parts = name.split(/[\\/]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length && /^(root|database)$/i.test(parts[0])) parts.shift();
    return groups.resolve(parts);
  };

  const entries: Entry[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const get = (c: Column) => (col[c] >= 0 ? (r[col[c]] ?? '').trim() : '');
    const username = get('username');
    const password = r[col.password] ?? '';
    const url = get('url');
    const title = get('title') || url.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0] || username;
    if (!title && !password && !get('notes')) {
      skipped++;
      continue;
    }
    const e = blankEntry(password || username || url ? 'login' : 'note', groupFor(get('group')), now);
    e.title = title || 'Untitled';
    e.username = username;
    e.password = password;
    e.url = url;
    e.notes = col.notes >= 0 ? (r[col.notes] ?? '') : '';
    e.totp = get('totp');
    e.tags = get('tags').split(/[,;]/).map((t) => t.trim()).filter(Boolean);
    e.favorite = /^(1|true|yes|x)$/i.test(get('favorite'));
    entries.push(e);
  }
  return { entries, groups: groups.created, skipped };
}

/** Live entries (not the trash) in KeePassXC's CSV layout; nested groups as "Internet/Social". */
export function exportCsv(vault: VaultData): string {
  const groupName = new Map(vault.groups.map((g) => [g.id, groupPath(vault.groups, g.id, '/')]));
  const rows = [['Group', 'Title', 'Username', 'Password', 'URL', 'Notes', 'TOTP', 'Tags']];
  for (const e of vault.entries) {
    if (e.trashed) continue;
    const extra = e.fields.filter((f) => f.value).map((f) => `${f.name}: ${f.value}`);
    const notes = [e.notes, ...extra].filter(Boolean).join('\n');
    rows.push([e.groupId ? (groupName.get(e.groupId) ?? '') : '', e.title, e.username, e.password, e.url, notes, e.totp, e.tags.join(',')]);
  }
  return toCsv(rows);
}
