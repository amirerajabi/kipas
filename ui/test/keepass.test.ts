// KeePass import tests. The fixtures in ./fixtures were written by KeePass 2.61 itself (scripts/make-kdbx-fixtures.ps1),
// password "kipas-test": KDBX 3.1 + AES-KDF, KDBX 4 + Argon2d + ChaCha20, KDBX 4 + Argon2id + key file.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { emptyVault } from '../src/vault/model';
import { argon2, blake2b } from '../src/vault/keepass/argon2';
import { fromKeePassXml, importKeePass, keepassSequence, totpFrom } from '../src/vault/keepass/import';
import { KdbxFormatError, KdbxKeyError, keyFileKey } from '../src/vault/keepass/kdbx';
import { ChaCha20, Salsa20 } from '../src/vault/keepass/streams';
import { parseXml } from '../src/vault/keepass/xml';

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const PASSWORD = 'kipas-test';

describe('keepass primitives', () => {
  it('BLAKE2b matches RFC 7693', () => {
    assert.equal(
      hex(blake2b(new TextEncoder().encode('abc'), 64)),
      'ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923',
    );
  });

  // RFC 9106 section 5 test vectors.
  const base = { password: new Uint8Array(32).fill(1), salt: new Uint8Array(16).fill(2), secret: new Uint8Array(8).fill(3), associatedData: new Uint8Array(12).fill(4), memoryKiB: 32, iterations: 3, parallelism: 4, hashLength: 32 };
  const vectors = {
    argon2d: '512b391b6f1162975371d30919734294f868e3be3984f3c1a13a4db9fabe4acb',
    argon2i: 'c814d9d1dc7f37aa13f0d77f2494bda1c8de6b016dd388d29952a4c4672b6ce8',
    argon2id: '0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659',
  } as const;
  for (const [type, tag] of Object.entries(vectors)) {
    it(`${type} matches RFC 9106`, async () => {
      assert.equal(hex(await argon2({ ...base, type: type as keyof typeof vectors })), tag);
    });
  }

  it('ChaCha20 matches RFC 8439 2.3.2', () => {
    const key = Uint8Array.from({ length: 32 }, (_, i) => i);
    const ks = new ChaCha20(key, Uint8Array.from([0, 0, 0, 9, 0, 0, 0, 0x4a, 0, 0, 0, 0])).xor(new Uint8Array(128));
    assert.equal(hex(ks.subarray(64, 96)), '10f1e7e4d13b5915500fdd1fa32071c4c7d1f4c733c068030422aa9ac3d46c4e');
  });

  it('Salsa20 keystream continues across calls', () => {
    const key = new Uint8Array(32).fill(7);
    const nonce = new Uint8Array(8).fill(9);
    const whole = new Salsa20(key, nonce).xor(new Uint8Array(150));
    const s = new Salsa20(key, nonce);
    const parts = [s.xor(new Uint8Array(10)), s.xor(new Uint8Array(100)), s.xor(new Uint8Array(40))];
    assert.deepEqual(Buffer.concat(parts), Buffer.from(whole));
  });

  it('parses the XML KeePass writes and refuses DTDs', () => {
    const doc = parseXml('<?xml version="1.0"?><a x="1 &amp; 2"><b>&lt;t&gt; &#65;&#x42;</b><c/><!-- note --><d><![CDATA[<raw>]]></d></a>');
    const a = doc.children[0];
    assert.equal(a.attrs.x, '1 & 2');
    assert.equal(a.children[0].text, '<t> AB');
    assert.equal(a.children[1].name, 'c');
    assert.equal(a.children[2].text, '<raw>');
    assert.throws(() => parseXml('<!DOCTYPE x [<!ENTITY e "boom">]><a>&e;</a>'), /not supported/);
    assert.throws(() => parseXml('<a><b></a>'), /unexpected/);
  });

  it('reads KeePass two-factor fields in every common format', () => {
    const m = (o: Record<string, string>) => new Map(Object.entries(o));
    assert.equal(totpFrom(m({ otp: 'otpauth://totp/x?secret=ABC' }), 't', 'u'), 'otpauth://totp/x?secret=ABC');
    assert.equal(totpFrom(m({ 'TimeOtp-Secret-Base32': 'jbsw y3dp' }), 't', 'u'), 'JBSWY3DP');
    assert.equal(totpFrom(m({ 'TimeOtp-Secret-Hex': '48656c6c6f' }), 't', 'u'), 'JBSWY3DP');
    assert.match(totpFrom(m({ 'TimeOtp-Secret-Base32': 'JBSWY3DP', 'TimeOtp-Length': '8', 'TimeOtp-Algorithm': 'HMAC-SHA-256' }), 'Site', 'me'), /digits=8&period=30&algorithm=SHA256/);
    assert.equal(totpFrom(m({ otp: 'key=JBSWY3DP&size=6&step=30' }), 't', 'u'), 'JBSWY3DP');
    assert.match(totpFrom(m({ 'TOTP Seed': 'JBSWY3DP', 'TOTP Settings': '60;6' }), 't', 'u'), /period=60/);
    assert.equal(totpFrom(m({}), 't', 'u'), '');
  });

  it('keeps KeePass auto-type sequences Kipas types the same way, inherited from groups', () => {
    assert.equal(keepassSequence('{USERNAME}{TAB}{PASSWORD}{ENTER}'), '{USERNAME}{TAB}{PASSWORD}{ENTER}');
    assert.equal(keepassSequence('{USERNAME}{TAB}^v'), '', 'KeePass modifiers fall back to the default');
    assert.equal(keepassSequence('{CLEARFIELD}{PASSWORD}'), '', 'unknown placeholders too');
    const xml = parseXml(`<KeePassFile><Meta/><Root><Group><Name>Root</Name><DefaultAutoTypeSequence>{USERNAME}{TAB 2}{PASSWORD}</DefaultAutoTypeSequence>
      <Entry><String><Key>Title</Key><Value>Inherits</Value></String><String><Key>Password</Key><Value>a</Value></String></Entry>
      <Group><Name>Web</Name><Entry><String><Key>Title</Key><Value>Own</Value></String><String><Key>Password</Key><Value>b</Value></String>
        <AutoType><Enabled>True</Enabled><DefaultSequence>{PASSWORD}{ENTER}</DefaultSequence></AutoType></Entry></Group>
    </Group></Root></KeePassFile>`);
    const r = fromKeePassXml(xml, { groups: [] });
    assert.equal(r.entries.find((e) => e.title === 'Inherits')?.autoType, '{USERNAME}{TAB 2}{PASSWORD}');
    assert.equal(r.entries.find((e) => e.title === 'Own')?.autoType, '{PASSWORD}{ENTER}');
  });

  it('understands every key file format', async () => {
    const xml2 = fixture('test.keyx');
    assert.equal((await keyFileKey(xml2)).length, 32);
    const raw = new Uint8Array(32).fill(5);
    assert.deepEqual(await keyFileKey(raw), raw);
    const hex64 = new TextEncoder().encode('ab'.repeat(32));
    assert.deepEqual(await keyFileKey(hex64), new Uint8Array(32).fill(0xab));
    const other = new TextEncoder().encode('any file at all');
    assert.equal((await keyFileKey(other)).length, 32);
    const broken = new TextDecoder().decode(xml2).replace(/Hash="[0-9A-F]+"/, 'Hash="00000000"');
    await assert.rejects(keyFileKey(new TextEncoder().encode(broken)), /checksum/);
  });
});

describe('keepass import', () => {
  const cases = [
    { file: 'kdbx3-aeskdf.kdbx', version: 'KDBX 3.1', keyFile: false },
    { file: 'kdbx4-argon2d-chacha20.kdbx', version: 'KDBX 4.0', keyFile: false },
    { file: 'kdbx4-argon2id-keyfile.kdbx', version: 'KDBX 4.0', keyFile: true },
  ];
  for (const c of cases) {
    it(`imports ${c.file}`, async () => {
      const vault = emptyVault('V');
      vault.groups.push({ id: 'existing-banking', name: 'banking' });
      const r = await importKeePass(fixture(c.file), { password: PASSWORD, keyFile: c.keyFile ? fixture('test.keyx') : undefined }, vault);
      assert.equal(r.version, c.version);
      assert.equal(r.name, 'Test Vault');
      assert.equal(r.attachmentsSkipped, 1);
      assert.deepEqual(r.groups.map((g) => g.name).sort(), ['Internet', 'Internet / Social'], 'existing groups are reused, case-insensitively');
      const by = Object.fromEntries(r.entries.map((e) => [e.title, e]));
      assert.deepEqual(Object.keys(by).sort(), ['Bank', 'Deleted thing', 'GitHub', 'Mastodon', 'Root note']);

      const gh = by.GitHub;
      assert.equal(gh.username, 'octocat');
      assert.equal(gh.password, 'Gh!new-Pa55word');
      assert.equal(gh.url, 'https://github.com/login');
      assert.equal(gh.notes, 'Line one\nLine two <with> & entities');
      assert.equal(gh.totp, 'otpauth://totp/GitHub:octocat?secret=JBSWY3DPEHPK3PXP&issuer=GitHub');
      assert.deepEqual([...gh.tags].sort(), ['code', 'work']);
      assert.deepEqual(gh.history.map((h) => h.password), ['old-password-1']);
      assert.deepEqual(
        gh.fields.map((f) => [f.name, f.value, f.secret]).sort(),
        [
          ['Plain field', 'not secret', false],
          ['Recovery code', 'abcd-efgh-ijkl', true],
        ],
      );
      assert.equal(r.groups.find((g) => g.id === gh.groupId)?.name, 'Internet');
      assert.ok(gh.created > Date.UTC(2020, 0, 1) && gh.created <= Date.now() + 1000, 'times are converted');

      assert.equal(by.Mastodon.password, 'Ünïcødé-πass');
      assert.equal(r.groups.find((g) => g.id === by.Mastodon.groupId)?.name, 'Internet / Social');
      assert.equal(by.Bank.groupId, 'existing-banking');
      assert.deepEqual(by.Bank.fields.map((f) => [f.name, f.secret]), [['PIN code', true]]);
      assert.equal(by['Root note'].kind, 'note');
      assert.equal(by['Root note'].groupId, null);
      assert.ok(by['Deleted thing'].trashed, 'recycle bin entries go to the trash');
    });
  }

  it('rejects a wrong password, a missing key file and non-KeePass files', async () => {
    await assert.rejects(importKeePass(fixture('kdbx3-aeskdf.kdbx'), { password: 'nope' }, emptyVault('V')), KdbxKeyError);
    await assert.rejects(importKeePass(fixture('kdbx4-argon2d-chacha20.kdbx'), { password: 'nope' }, emptyVault('V')), KdbxKeyError);
    await assert.rejects(importKeePass(fixture('kdbx4-argon2id-keyfile.kdbx'), { password: PASSWORD }, emptyVault('V')), KdbxKeyError);
    await assert.rejects(importKeePass(new TextEncoder().encode('hello'), { password: 'x' }, emptyVault('V')), KdbxFormatError);
    const kdb = new Uint8Array(12);
    new DataView(kdb.buffer).setUint32(0, 0x9aa2d903, true);
    new DataView(kdb.buffer).setUint32(4, 0xb54bfb65, true);
    await assert.rejects(importKeePass(kdb, { password: 'x' }, emptyVault('V')), /KeePass 1\.x/);
  });

  it('detects a damaged database', async () => {
    const f = fixture('kdbx4-argon2d-chacha20.kdbx');
    f[f.length - 40] ^= 1;
    await assert.rejects(importKeePass(f, { password: PASSWORD }, emptyVault('V')), /damaged/);
  });
});
