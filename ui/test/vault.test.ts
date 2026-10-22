// Vault core tests: encryption round trips and tampering, TOTP against the RFC 6238 vectors, the generator, strength,
// CSV import/export, health, and list filtering. Run with `npm test` (node:test via tsx).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { visibleEntries } from '../src/store/list';
import { createKey, MIN_ITERATIONS, openVault, openWithKey, parseEnvelope, seal, VaultFormatError, WrongPasswordError, type VaultEnvelope } from '../src/vault/crypto';
import { exportCsv, importCsv, parseCsv, toCsv } from '../src/vault/csv';
import { DEFAULT_GENERATOR, generatePassphrase, generatePassword, generatorBits, randomInt } from '../src/vault/generator';
import { analyzeHealth, OLD_AFTER_MS } from '../src/vault/health';
import { blankEntry, editEntry, emptyVault, HISTORY_LIMIT, hostOf, normalizeVault, openableUrl, type VaultData } from '../src/vault/model';
import { estimateStrength } from '../src/vault/strength';
import { base32Decode, hotp, parseTotp, totpNow } from '../src/vault/totp';

// Fast keys for tests; the app uses DEFAULT_ITERATIONS.
const FAST = MIN_ITERATIONS;

function sampleVault(): VaultData {
  const v = emptyVault('Test');
  const e = blankEntry('login', v.groups[0].id);
  Object.assign(e, { title: 'GitHub', username: 'octo', password: 'correct horse battery staple', url: 'https://github.com/login', notes: 'line 1\nline 2 "quoted", comma' });
  v.entries.push(e);
  return v;
}

describe('crypto', () => {
  it('seals and opens a vault with the right password', async () => {
    const vk = await createKey('master password 1', FAST);
    const text = await seal(vk, sampleVault());
    assert.ok(!text.includes('GitHub'), 'no plaintext in the file');
    const { data } = await openVault(text, 'master password 1');
    assert.equal(data.entries[0].title, 'GitHub');
    assert.equal(data.entries[0].notes, 'line 1\nline 2 "quoted", comma');
  });

  it('rejects a wrong password', async () => {
    const vk = await createKey('right one', FAST);
    const text = await seal(vk, sampleVault());
    await assert.rejects(openVault(text, 'wrong one'), WrongPasswordError);
  });

  it('uses a fresh IV for every save', async () => {
    const vk = await createKey('pw', FAST);
    const a = JSON.parse(await seal(vk, sampleVault())) as VaultEnvelope;
    const b = JSON.parse(await seal(vk, sampleVault())) as VaultEnvelope;
    assert.notEqual(a.cipher.iv, b.cipher.iv);
    assert.equal(a.kdf.salt, b.kdf.salt);
  });

  it('detects a tampered header (bound as associated data)', async () => {
    const vk = await createKey('pw', FAST);
    const env = JSON.parse(await seal(vk, sampleVault())) as VaultEnvelope;
    env.kdf.iterations += 1;
    await assert.rejects(openWithKey(JSON.stringify(env), vk), WrongPasswordError);
  });

  it('detects a tampered ciphertext', async () => {
    const vk = await createKey('pw', FAST);
    const env = JSON.parse(await seal(vk, sampleVault())) as VaultEnvelope;
    const bytes = Buffer.from(env.data, 'base64');
    bytes[10] ^= 1;
    env.data = bytes.toString('base64');
    await assert.rejects(openWithKey(JSON.stringify(env), vk), WrongPasswordError);
  });

  it('refuses files that are not vaults or have unsafe settings', async () => {
    assert.throws(() => parseEnvelope('hello'), VaultFormatError);
    assert.throws(() => parseEnvelope('{"format":"other"}'), VaultFormatError);
    const vk = await createKey('pw', FAST);
    const env = JSON.parse(await seal(vk, sampleVault())) as VaultEnvelope;
    env.kdf.iterations = 1000;
    assert.throws(() => parseEnvelope(JSON.stringify(env)), /unsafe/);
    assert.throws(() => parseEnvelope(JSON.stringify({ ...env, version: 2 })), /newer Kipas/);
  });
});

describe('model', () => {
  it('keeps password history newest first, capped', () => {
    let e = blankEntry('login', null, 1000);
    e = editEntry(e, { password: 'p0' }, 2000);
    assert.equal(e.history.length, 0, 'setting the first password is not history');
    for (let i = 1; i <= HISTORY_LIMIT + 3; i++) e = editEntry(e, { password: `p${i}` }, 2000 + i);
    assert.equal(e.history.length, HISTORY_LIMIT);
    assert.equal(e.history[0].password, `p${HISTORY_LIMIT + 2}`);
    assert.equal(e.passwordChanged, 2000 + HISTORY_LIMIT + 3);
    const same = editEntry(e, { title: 'x', password: e.password }, 9999);
    assert.equal(same.history.length, HISTORY_LIMIT);
    assert.equal(same.passwordChanged, e.passwordChanged, 'unchanged password keeps its age');
  });

  it('normalises damaged or partial data', () => {
    const v = normalizeVault({ name: 'N', groups: [{ id: 'g' }], entries: [{ id: 'a', groupId: 'missing', kind: 'bogus', tags: ['t', 3] }, { nope: 1 }] });
    assert.equal(v.entries.length, 1);
    assert.equal(v.entries[0].groupId, null);
    assert.equal(v.entries[0].kind, 'login');
    assert.deepEqual(v.entries[0].tags, ['t']);
    assert.equal(v.groups[0].name, 'Group');
  });

  it('parses hosts and only opens http(s)', () => {
    assert.equal(hostOf('https://www.github.com/login'), 'github.com');
    assert.equal(hostOf('example.org/x'), 'example.org');
    assert.equal(openableUrl('example.org'), 'https://example.org/');
    assert.equal(openableUrl('javascript:alert(1)'), null);
    assert.equal(openableUrl('file:///C:/x'), null);
  });
});

describe('totp', () => {
  // RFC 6238 appendix B, SHA-1, 8 digits, secret "12345678901234567890".
  const secret = new TextEncoder().encode('12345678901234567890');
  const vectors: [number, string][] = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ];
  for (const [t, code] of vectors) {
    it(`matches RFC 6238 at T=${t}`, async () => {
      assert.equal(await hotp({ secret, digits: 8, algorithm: 'SHA-1' }, Math.floor(t / 30)), code);
    });
  }

  it('decodes base32 and parses otpauth URIs', async () => {
    assert.deepEqual([...base32Decode('GEZDGNBVGY3TQOJQ')!], [...new TextEncoder().encode('1234567890')]);
    assert.equal(base32Decode('not base32!'), null);
    const spec = parseTotp('otpauth://totp/GitHub:octo?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=GitHub&digits=8&period=60')!;
    assert.equal(spec.digits, 8);
    assert.equal(spec.period, 60);
    assert.equal(spec.issuer, 'GitHub');
    assert.equal(spec.account, 'octo');
    assert.ok(parseTotp('gezd gnbv gy3t qojq'), 'spaces and lower case are fine');
    assert.equal(parseTotp('otpauth://hotp/x?secret=GEZDGNBV'), null);
    const now = await totpNow(parseTotp('GEZDGNBVGY3TQOJQ')!, 59_000);
    assert.equal(now.remaining, 1);
    assert.match(now.code, /^\d{6}$/);
  });
});

describe('generator', () => {
  it('honours length and includes every chosen set', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword({ ...DEFAULT_GENERATOR, length: 12 });
      assert.equal(pw.length, 12);
      assert.match(pw, /[a-z]/);
      assert.match(pw, /[A-Z]/);
      assert.match(pw, /[0-9]/);
      assert.match(pw, /[^a-zA-Z0-9]/);
    }
  });

  it('can avoid look-alike characters', () => {
    const pw = generatePassword({ ...DEFAULT_GENERATOR, length: 128, avoidAmbiguous: true });
    assert.doesNotMatch(pw, /[0Oo1lI|`'"]/);
  });

  it('builds passphrases', () => {
    const p = generatePassphrase({ ...DEFAULT_GENERATOR, mode: 'passphrase', words: 5, separator: '-', addNumber: true });
    assert.equal(p.split('-').length, 5);
    assert.match(p, /\d/);
    assert.ok(generatorBits({ ...DEFAULT_GENERATOR, mode: 'passphrase', words: 5 }) >= 45);
  });

  it('randomInt is roughly uniform', () => {
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 60_000; i++) counts[randomInt(6)]++;
    for (const c of counts) assert.ok(c > 9000 && c < 11000, `bucket ${c}`);
  });
});

describe('strength', () => {
  it('ranks common, patterned and random passwords sensibly', () => {
    assert.equal(estimateStrength('password1').score, 0);
    assert.equal(estimateStrength('qwerty123').score, 0);
    assert.ok(estimateStrength('Summer2024').score <= 1);
    assert.ok(estimateStrength('aaaaaaaaaaaaaaaa').score <= 1);
    assert.ok(estimateStrength('Tundra-Velvet-Rocket-Mango7').score >= 3);
    assert.equal(estimateStrength('q7$Lp9!vZr2#xK8m@Wd4').score, 4);
  });
});

describe('csv', () => {
  it('parses quotes, commas and newlines', () => {
    const rows = parseCsv('a,b,c\r\n"x, y","he said ""hi""","multi\nline"\n');
    assert.deepEqual(rows, [
      ['a', 'b', 'c'],
      ['x, y', 'he said "hi"', 'multi\nline'],
    ]);
    assert.deepEqual(parseCsv(toCsv(rows)), rows);
  });

  it('imports Bitwarden, Chrome and KeePass layouts', () => {
    const vault = emptyVault('V');
    const bw = importCsv('folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\nWork,1,login,Jira,,,0,https://jira.example,me,pw1,GEZDGNBVGY3TQOJQ\n', vault);
    assert.equal(bw.entries[0].title, 'Jira');
    assert.equal(bw.entries[0].favorite, true);
    assert.equal(bw.entries[0].totp, 'GEZDGNBVGY3TQOJQ');
    assert.equal(bw.entries[0].groupId, vault.groups.find((g) => g.name === 'Work')!.id, 'matches an existing group');
    assert.equal(bw.groups.length, 0);

    const chrome = importCsv('name,url,username,password,note\n,https://www.example.com/,bob,pw2,\n', vault);
    assert.equal(chrome.entries[0].title, 'example.com', 'title falls back to the host');

    const kp = importCsv('"Group","Title","Username","Password","URL","Notes"\n"Root/Internet/Mail","Gmail","a@b.c","pw3","https://mail.google.com",""\n"Root","Bank","x","pw4","",""\n', vault);
    assert.equal(kp.groups.length, 1);
    assert.equal(kp.groups[0].name, 'Mail');
    assert.equal(kp.entries[1].groupId, null, 'the database root is no group');
    assert.throws(() => importCsv('foo,bar\n1,2\n', vault), /column/);
  });

  it('exports live entries in KeePassXC layout and re-imports them', () => {
    const v = sampleVault();
    const trashed = blankEntry('login');
    trashed.title = 'gone';
    trashed.trashed = Date.now();
    v.entries.push(trashed);
    const csv = exportCsv(v);
    assert.ok(csv.startsWith('Group,Title,Username,Password,URL,Notes,TOTP,Tags'));
    assert.ok(!csv.includes('gone'));
    const back = importCsv(csv, v);
    assert.equal(back.entries.length, 1);
    assert.equal(back.entries[0].password, 'correct horse battery staple');
    assert.equal(back.entries[0].notes, v.entries[0].notes);
  });
});

describe('health and list', () => {
  it('finds weak, reused and old passwords', () => {
    const now = Date.now();
    const mk = (title: string, password: string, age = 0) => ({ ...blankEntry('login', null, now - age), title, password, url: 'https://x.test' });
    const entries = [mk('a', 'password1'), mk('b', 'Tundra-Velvet-Rocket-Mango7'), mk('c', 'Tundra-Velvet-Rocket-Mango7', OLD_AFTER_MS + 1)];
    const r = analyzeHealth(entries, now);
    assert.deepEqual([...r.weak], [entries[0].id]);
    assert.deepEqual([...r.reused].sort(), [entries[1].id, entries[2].id].sort());
    assert.deepEqual([...r.old], [entries[2].id]);
    assert.equal(r.no2fa.size, 3);
    assert.ok(r.score < 50);
  });

  it('filters, searches across fields and keeps the trash apart', () => {
    const v = sampleVault();
    const note = blankEntry('note');
    note.title = 'Passport';
    note.tags = ['family'];
    const gone = blankEntry('login');
    gone.title = 'Old GitHub';
    gone.trashed = Date.now();
    v.entries.push(note, gone);
    const sort = { key: 'title' as const, dir: 1 as const };
    assert.equal(visibleEntries(v, { filter: { kind: 'all' }, query: '', sort }).length, 2);
    assert.deepEqual(visibleEntries(v, { filter: { kind: 'type', id: 'note' }, query: '', sort }).map((e) => e.title), ['Passport']);
    assert.deepEqual(visibleEntries(v, { filter: { kind: 'favorites' }, query: 'family', sort }).map((e) => e.title), ['Passport'], 'a search looks past the side panel');
    assert.deepEqual(visibleEntries(v, { filter: { kind: 'all' }, query: 'github octo', sort }).map((e) => e.title), ['GitHub']);
    assert.deepEqual(visibleEntries(v, { filter: { kind: 'trash' }, query: '', sort }).map((e) => e.title), ['Old GitHub']);
  });
});
