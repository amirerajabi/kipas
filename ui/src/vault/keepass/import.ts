// KeePass XML -> Kipas entries. Nested groups become flat Kipas groups named by their path ("Internet / Social"),
// entries in the recycle bin land in Kipas's trash, history becomes password history, and every extra string field is
// kept (hidden if KeePass protected it). Two-factor secrets are read from KeePass 2.47+ (TimeOtp-*), KeePassXC (otp)
// and the older KeeOtp / KeeTrayTOTP fields. Attachments are not imported (Kipas has no attachments yet); they are counted.
import { parseSequence } from '../autotype';
import { blankEntry, HISTORY_LIMIT, newId, type CustomField, type Entry, type Group, type VaultData } from '../model';
import { readKdbx, type KdbxCredentials, type KdbxProgress } from './kdbx';
import { child, children, textOf, type XmlNode } from './xml';

export interface KeePassImport {
  name: string;
  entries: Entry[];
  /** Groups that did not exist in the vault yet. */
  groups: Group[];
  attachmentsSkipped: number;
  version: string;
}

const STANDARD = new Set(['Title', 'UserName', 'Password', 'URL', 'Notes']);
const TOTP_KEYS = /^(otp|TOTP Seed|TOTP Settings|TimeOtp-.*|HmacOtp-.*)$/;

/** KDBX 4 stores times as base64 seconds since 0001-01-01; KDBX 3 as ISO 8601. */
function parseTime(s: string | undefined, fallback: number): number {
  const t = (s ?? '').trim();
  if (!t) return fallback;
  if (/^\d{4}-/.test(t)) {
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? ms : fallback;
  }
  try {
    const bin = atob(t);
    if (bin.length !== 8) return fallback;
    let secs = 0n;
    for (let i = 7; i >= 0; i--) secs = (secs << 8n) | BigInt(bin.charCodeAt(i));
    const ms = Number(secs - 62135596800n) * 1000;
    return Number.isFinite(ms) ? ms : fallback;
  } catch {
    return fallback;
  }
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** Turn the various KeePass two-factor fields into what Kipas stores: a base32 secret or an otpauth:// URI. */
export function totpFrom(strings: Map<string, string>, title: string, user: string): string {
  const otp = strings.get('otp')?.trim();
  if (otp?.startsWith('otpauth://')) return otp;
  let secret = '';
  const b32 = strings.get('TimeOtp-Secret-Base32');
  const hexS = strings.get('TimeOtp-Secret-Hex');
  const b64 = strings.get('TimeOtp-Secret-Base64');
  const utf8 = strings.get('TimeOtp-Secret');
  let digits = Number(strings.get('TimeOtp-Length') ?? 6);
  let period = Number(strings.get('TimeOtp-Period') ?? 30);
  let algorithm = (strings.get('TimeOtp-Algorithm') ?? 'HMAC-SHA-1').replace(/^HMAC-/, '').replace('-', '');
  if (b32) secret = b32.replace(/\s+/g, '').toUpperCase();
  else if (hexS) secret = base32(Uint8Array.from(hexS.replace(/\s+/g, '').match(/../g) ?? [], (h) => parseInt(h, 16)));
  else if (b64) secret = base32(Uint8Array.from(atob(b64.replace(/\s+/g, '')), (c) => c.charCodeAt(0)));
  else if (utf8) secret = base32(new TextEncoder().encode(utf8));
  else if (otp) {
    // KeeOtp: "key=BASE32&size=6&step=30"
    const q = new URLSearchParams(otp);
    secret = (q.get('key') ?? otp).replace(/\s+/g, '').toUpperCase();
    digits = Number(q.get('size') ?? digits);
    period = Number(q.get('step') ?? period);
    algorithm = (q.get('otpHashMode') ?? algorithm).toUpperCase();
  } else if (strings.get('TOTP Seed')) {
    // KeeTrayTOTP / old KeePassXC: "TOTP Settings" = "30;6"
    secret = strings.get('TOTP Seed')!.replace(/\s+/g, '').toUpperCase();
    const [p, d] = (strings.get('TOTP Settings') ?? '').split(';');
    if (Number(p)) period = Number(p);
    if (Number(d)) digits = Number(d);
  }
  if (!secret) return '';
  if (digits === 6 && period === 30 && /^SHA1$/i.test(algorithm)) return secret;
  const label = encodeURIComponent(user ? `${title}:${user}` : title || 'Kipas');
  return `otpauth://totp/${label}?secret=${secret}&digits=${digits}&period=${period}&algorithm=${algorithm.toUpperCase()}`;
}

interface Version {
  strings: Map<string, string>;
  protectedKeys: Set<string>;
  created: number;
  modified: number;
}

function readVersion(e: XmlNode, now: number): Version {
  const strings = new Map<string, string>();
  const protectedKeys = new Set<string>();
  for (const s of children(e, 'String')) {
    const key = textOf(s, 'Key');
    const value = child(s, 'Value');
    // KeePass writes Windows line endings; Kipas keeps plain newlines.
    strings.set(key, (value?.text ?? '').replace(/\r\n?/g, '\n'));
    if (value?.attrs.Protected === 'Decoded') protectedKeys.add(key);
  }
  const times = child(e, 'Times');
  const created = parseTime(textOf(times, 'CreationTime'), now);
  return { strings, protectedKeys, created, modified: parseTime(textOf(times, 'LastModificationTime'), created) };
}

/**
 * A KeePass auto-type sequence Kipas can type the same way, else ''. KeePass reads + ^ % ~ outside braces as Shift,
 * Ctrl, Alt and Enter; Kipas would type them as characters, so such a sequence falls back to the default instead.
 */
export function keepassSequence(seq: string): string {
  const s = seq.trim();
  if (!s || /[+^%~]/.test(s.replace(/\{[^}]*\}/g, ''))) return '';
  try {
    parseSequence(s);
    return s;
  } catch {
    return '';
  }
}

function toEntry(e: XmlNode, groupId: string | null, trashedAt: number | null, now: number, groupSequence = ''): { entry: Entry; attachments: number } {
  const cur = readVersion(e, now);
  const s = cur.strings;
  const username = s.get('UserName') ?? '';
  const password = s.get('Password') ?? '';
  const url = s.get('URL') ?? '';
  const notes = s.get('Notes') ?? '';
  const title = s.get('Title') ?? '';
  const entry = blankEntry(!username && !password && !url && notes ? 'note' : 'login', groupId, cur.created);
  entry.title = title || url.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0] || 'Untitled';
  entry.username = username;
  entry.password = password;
  entry.url = url;
  entry.notes = notes;
  entry.totp = totpFrom(s, title, username);
  entry.tags = textOf(e, 'Tags')
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter(Boolean);
  entry.fields = [...s.keys()]
    .filter((k) => !STANDARD.has(k) && !TOTP_KEYS.test(k) && k !== 'KPRPC JSON')
    .map((k): CustomField => ({ id: newId(), name: k, value: s.get(k) ?? '', secret: cur.protectedKeys.has(k) }));
  entry.created = cur.created;
  entry.modified = cur.modified;
  entry.trashed = trashedAt;
  // The entry's own sequence, else the one its group (or a parent group) sets.
  entry.autoType = keepassSequence(textOf(child(e, 'AutoType'), 'DefaultSequence')) || keepassSequence(groupSequence);

  // History: versions oldest first, then the current one. A password "changed" when the next version has a different one.
  const versions = [...children(child(e, 'History'), 'Entry').map((h) => readVersion(h, now)), cur].sort((a, b) => a.modified - b.modified);
  const history: Entry['history'] = [];
  let since = cur.created;
  for (let i = 0; i < versions.length - 1; i++) {
    const a = versions[i].strings.get('Password') ?? '';
    const b = versions[i + 1].strings.get('Password') ?? '';
    if (a !== b) {
      if (a && a !== password && !history.some((h) => h.password === a)) history.push({ password: a, changed: versions[i + 1].modified });
      since = versions[i + 1].modified;
    }
  }
  entry.history = history.reverse().slice(0, HISTORY_LIMIT);
  entry.passwordChanged = since;
  return { entry, attachments: children(e, 'Binary').length };
}

/** Map a decrypted KeePass XML tree onto entries and groups, reusing vault groups with the same name. */
export function fromKeePassXml(xml: XmlNode, vault: Pick<VaultData, 'groups'>, now = Date.now()): Omit<KeePassImport, 'version'> {
  const file = child(xml, 'KeePassFile');
  const meta = child(file, 'Meta');
  const rootGroup = child(child(file, 'Root'), 'Group');
  if (!rootGroup) throw new Error('The database has no groups.');
  const binUuid = textOf(meta, 'RecycleBinEnabled') !== 'False' ? textOf(meta, 'RecycleBinUUID') : '';

  const byName = new Map(vault.groups.map((g) => [g.name.toLowerCase(), g]));
  const created: Group[] = [];
  const groupFor = (path: string): string | null => {
    if (!path) return null;
    let g = byName.get(path.toLowerCase());
    if (!g) {
      g = { id: newId(), name: path };
      byName.set(path.toLowerCase(), g);
      created.push(g);
    }
    return g.id;
  };

  const entries: Entry[] = [];
  let attachments = 0;
  const walk = (g: XmlNode, path: string, trashedAt: number | null, parentSequence: string) => {
    const groupId = groupFor(path);
    const sequence = textOf(g, 'DefaultAutoTypeSequence').trim() || parentSequence;
    for (const e of children(g, 'Entry')) {
      const r = toEntry(e, trashedAt ? null : groupId, trashedAt, now, sequence);
      entries.push(r.entry);
      attachments += r.attachments;
    }
    for (const sub of children(g, 'Group')) {
      const isBin = !!binUuid && textOf(sub, 'UUID') === binUuid;
      const name = textOf(sub, 'Name').trim() || 'Group';
      walk(sub, isBin || trashedAt ? '' : path ? `${path} / ${name}` : name, isBin ? now : trashedAt, sequence);
    }
  };
  // The root group is the database itself: its entries get no group.
  walk(rootGroup, '', null, '');
  // A group that only held trashed entries was never created; groups made for nothing are dropped.
  const used = new Set(entries.map((e) => e.groupId));
  return {
    name: textOf(meta, 'DatabaseName') || textOf(rootGroup, 'Name') || 'KeePass',
    entries,
    groups: created.filter((g) => used.has(g.id)),
    attachmentsSkipped: attachments,
  };
}

export async function importKeePass(file: Uint8Array, credentials: KdbxCredentials, vault: Pick<VaultData, 'groups'>, onProgress?: KdbxProgress): Promise<KeePassImport> {
  const doc = await readKdbx(file, credentials, onProgress);
  return { ...fromKeePassXml(doc.xml, vault), version: `KDBX ${doc.version.major}.${doc.version.minor}` };
}
