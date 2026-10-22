// Reading KeePass databases (KDBX 3.1 and 4.x, as written by KeePass 2, KeePassXC, KeeWeb, Strongbox, ...).
//
// Outer layer: signature, header fields, then
//   KDBX 3: AES-CBC payload that starts with StreamStartBytes, holding SHA-256-hashed blocks.
//   KDBX 4: header SHA-256 + HMAC, then HMAC-SHA-256 blocks; the payload is AES-CBC or ChaCha20, with an inner header.
// The key: SHA-256 of the password (and key file) hashes, transformed by AES-KDF or Argon2d/id.
// Inside: gzip'd XML whose protected values are XORed with a Salsa20 (KDBX 3) or ChaCha20 (KDBX 4) keystream, in
// document order. Twofish databases and KeePass 1.x (.kdb) files are not supported.
import { argon2 } from './argon2';
import { ChaCha20, Salsa20, type StreamCipher } from './streams';
import { parseXml, type XmlNode } from './xml';

export class KdbxKeyError extends Error {
  constructor() {
    super('The master password or key file is not right for this database.');
    this.name = 'KdbxKeyError';
  }
}

export class KdbxFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KdbxFormatError';
  }
}

export interface KdbxCredentials {
  password?: string;
  /** The raw bytes of a key file, if the database uses one. */
  keyFile?: Uint8Array;
}

export interface KdbxProgress {
  /** 0..1 while the key is derived (the slow part). */
  (fraction: number): void | Promise<void>;
}

const SIG1 = 0x9aa2d903;
const SIG2 = 0xb54bfb67;
const SIG2_KDB = 0xb54bfb65;

const CIPHER_AES = '31c1f2e6bf714350be5805216afc5aff';
const CIPHER_CHACHA20 = 'd6038a2b8b6f4cb5a524339a31dbb59a';
const CIPHER_TWOFISH = 'ad68f29f576f4bb9a36ad47af965346c';
const KDF_AES = 'c9d9f39a628a4460bf740d08c18a4fea';
const KDF_AES_KDBX3 = '7c02bb8279a74ac0927d114a00648238';
const KDF_ARGON2D = 'ef636ddf8c29444b91f7a9a403e30a0c';
const KDF_ARGON2ID = '9e298b1956db4773b23dfc3ec6f0a1e6';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

async function sha512(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-512', data));
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

function u64le(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

class Reader {
  private view: DataView;
  pos = 0;
  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  need(n: number): void {
    if (this.pos + n > this.bytes.length) throw new KdbxFormatError('The file is truncated or not a KeePass database.');
  }
  u8(): number {
    this.need(1);
    return this.view.getUint8(this.pos++);
  }
  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  i32(): number {
    this.need(4);
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }
  bytesN(n: number): Uint8Array {
    if (n < 0) throw new KdbxFormatError('The database is damaged.');
    this.need(n);
    const v = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return v;
  }
  get done(): boolean {
    return this.pos >= this.bytes.length;
  }
}

const le = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

/** KDBX 4's typed key/value map (KDF parameters, public custom data). Values are kept as raw bytes. */
function readVariantDictionary(bytes: Uint8Array): Map<string, Uint8Array> {
  const r = new Reader(bytes);
  const version = r.u16();
  if (version >> 8 > 1) throw new KdbxFormatError('Unsupported KDF parameter format.');
  const out = new Map<string, Uint8Array>();
  for (;;) {
    const type = r.u8();
    if (type === 0) break;
    const key = new TextDecoder().decode(r.bytesN(r.i32()));
    out.set(key, r.bytesN(r.i32()));
  }
  return out;
}

function num(v: Uint8Array | undefined, fallback?: number): number {
  if (!v) {
    if (fallback === undefined) throw new KdbxFormatError('A KDF parameter is missing.');
    return fallback;
  }
  if (v.length === 4) return le(v).getUint32(0, true);
  if (v.length === 8) {
    const n = le(v).getBigUint64(0, true);
    if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new KdbxFormatError('A KDF parameter is out of range.');
    return Number(n);
  }
  throw new KdbxFormatError('A KDF parameter has an unexpected size.');
}

/** What a key file contributes to the composite key (KeePass's rules: XML 1.0/2.0, 32 raw bytes, 64 hex chars, else SHA-256). */
export async function keyFileKey(file: Uint8Array): Promise<Uint8Array> {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(file);
  if (/<KeyFile[\s>]/.test(text)) {
    const doc = parseXml(text.replace(/^﻿/, ''));
    const kf = doc.children.find((c) => c.name === 'KeyFile');
    const version = kf?.children.find((c) => c.name === 'Meta')?.children.find((c) => c.name === 'Version')?.text.trim() ?? '';
    const data = kf?.children.find((c) => c.name === 'Key')?.children.find((c) => c.name === 'Data');
    if (!data) throw new KdbxFormatError('The key file is damaged.');
    if (version.startsWith('2.')) {
      const hexText = data.text.replace(/\s+/g, '');
      if (!/^[0-9a-fA-F]+$/.test(hexText) || hexText.length % 2) throw new KdbxFormatError('The key file is damaged.');
      const key = Uint8Array.from(hexText.match(/../g)!, (h) => parseInt(h, 16));
      const check = data.attrs.Hash;
      if (check && hex((await sha256(key)).subarray(0, 4)).toUpperCase() !== check.toUpperCase()) throw new KdbxFormatError('The key file is damaged (its checksum does not match).');
      return key;
    }
    return fromBase64(data.text);
  }
  if (file.length === 32) return file;
  if (file.length === 64 && /^[0-9a-fA-F]{64}$/.test(text)) return Uint8Array.from(text.match(/../g)!, (h) => parseInt(h, 16));
  return sha256(file);
}

async function compositeKey(c: KdbxCredentials): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  if (c.password !== undefined && c.password !== '') parts.push(await sha256(new TextEncoder().encode(c.password)));
  if (c.keyFile) parts.push(await keyFileKey(c.keyFile));
  if (!parts.length) throw new KdbxKeyError();
  return sha256(concat(parts));
}

/**
 * AES-KDF: each 16-byte half of the key is AES-encrypted `rounds` times with the seed. Web Crypto has no ECB, but CBC
 * with a zero IV over [block, 0, 0, ...] produces exactly that chain (C_i = E(0 xor C_i-1)), so long runs of rounds are
 * one call each instead of millions.
 */
async function aesKdf(composite: Uint8Array, seed: Uint8Array, rounds: number, onProgress?: KdbxProgress): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', seed, 'AES-CBC', false, ['encrypt']);
  const CHUNK = 65536;
  const halves: Uint8Array[] = [];
  let done = 0;
  for (const half of [composite.subarray(0, 16), composite.subarray(16, 32)]) {
    let iv = new Uint8Array(16);
    let first: Uint8Array | null = half;
    let left = rounds;
    let last = half;
    while (left > 0) {
      const n = Math.min(CHUNK, left);
      const plain = new Uint8Array(n * 16);
      if (first) plain.set(first, 0);
      first = null;
      const out = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, plain));
      last = out.slice((n - 1) * 16, n * 16);
      iv = last;
      left -= n;
      done += n;
      await onProgress?.(done / (rounds * 2));
    }
    halves.push(last);
  }
  return sha256(concat(halves));
}

async function transformKey(kdf: Map<string, Uint8Array>, composite: Uint8Array, onProgress?: KdbxProgress): Promise<Uint8Array> {
  const uuid = hex(kdf.get('$UUID') ?? new Uint8Array());
  if (uuid === KDF_AES || uuid === KDF_AES_KDBX3) {
    const seed = kdf.get('S');
    if (!seed || seed.length !== 32) throw new KdbxFormatError('The AES-KDF seed is missing.');
    return aesKdf(composite, seed, num(kdf.get('R')), onProgress);
  }
  if (uuid === KDF_ARGON2D || uuid === KDF_ARGON2ID) {
    const memoryBytes = num(kdf.get('M'));
    return argon2({
      type: uuid === KDF_ARGON2D ? 'argon2d' : 'argon2id',
      password: composite,
      salt: kdf.get('S') ?? new Uint8Array(),
      memoryKiB: Math.floor(memoryBytes / 1024),
      iterations: num(kdf.get('I')),
      parallelism: num(kdf.get('P')),
      version: num(kdf.get('V'), 0x13) === 0x10 ? 0x10 : 0x13,
      secret: kdf.get('K'),
      associatedData: kdf.get('A'),
      hashLength: 32,
      onProgress,
    });
  }
  throw new KdbxFormatError('This database uses a key derivation Kipas does not know.');
}

async function decryptPayload(cipher: string, key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  if (cipher === CIPHER_AES) {
    const k = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['decrypt']);
    try {
      return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, k, data));
    } catch {
      // Bad padding: the key is wrong (KDBX 3 has no other check before this) or the file is damaged.
      throw new KdbxKeyError();
    }
  }
  if (cipher === CIPHER_CHACHA20) return new ChaCha20(key, iv).xor(data);
  if (cipher === CIPHER_TWOFISH) throw new KdbxFormatError('This database is encrypted with Twofish, which Kipas cannot read. In KeePass, switch it to AES or ChaCha20 (File → Database Settings → Security), save, then import.');
  throw new KdbxFormatError('This database uses an encryption algorithm Kipas does not know.');
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function innerStream(id: number, key: Uint8Array): Promise<StreamCipher | null> | StreamCipher | null {
  if (id === 0) return null;
  if (id === 2) return sha256(key).then((k) => new Salsa20(k, Uint8Array.from([0xe8, 0x30, 0x09, 0x4b, 0x97, 0x20, 0x5d, 0x2a])));
  if (id === 3) return sha512(key).then((h) => new ChaCha20(h.subarray(0, 32), h.subarray(32, 44)));
  throw new KdbxFormatError('This database protects its fields with a stream cipher Kipas does not know.');
}

/** Decode every Protected="True" value in document order, which is the order the keystream was used in. */
function unprotect(node: XmlNode, stream: StreamCipher | null): void {
  for (const c of node.children) {
    if (c.attrs.Protected === 'True') {
      const bytes = fromBase64(c.text);
      const plain = stream ? stream.xor(bytes) : bytes;
      c.text = c.name === 'Value' ? new TextDecoder().decode(plain) : '';
      c.attrs.Protected = 'Decoded';
    }
    unprotect(c, stream);
  }
}

export interface KdbxDocument {
  version: { major: number; minor: number };
  xml: XmlNode;
}

/** Decrypt a KDBX file to its XML tree, with protected values already decoded. */
export async function readKdbx(file: Uint8Array, credentials: KdbxCredentials, onProgress?: KdbxProgress): Promise<KdbxDocument> {
  const r = new Reader(file);
  if (file.length < 12) throw new KdbxFormatError('This is not a KeePass database.');
  const sig1 = r.u32();
  const sig2 = r.u32();
  if (sig1 === SIG1 && sig2 === SIG2_KDB) throw new KdbxFormatError('This is a KeePass 1.x (.kdb) database. Open it in KeePass 2, save it as .kdbx, then import that.');
  if (sig1 !== SIG1 || sig2 !== SIG2) throw new KdbxFormatError('This is not a KeePass database.');
  const minor = r.u16();
  const major = r.u16();
  if (major !== 3 && major !== 4) throw new KdbxFormatError(`KDBX ${major}.${minor} is not supported.`);

  const fields = new Map<number, Uint8Array>();
  for (;;) {
    const id = r.u8();
    const data = r.bytesN(major >= 4 ? r.i32() : r.u16());
    if (id === 0) break;
    fields.set(id, data);
  }
  const headerEnd = r.pos;
  const cipher = hex(fields.get(2) ?? new Uint8Array());
  const compression = fields.get(3) ? le(fields.get(3)!).getUint32(0, true) : 0;
  const masterSeed = fields.get(4);
  const iv = fields.get(7);
  if (!masterSeed || !iv) throw new KdbxFormatError('The database header is damaged.');

  let kdf: Map<string, Uint8Array>;
  if (major >= 4) {
    const params = fields.get(11);
    if (!params) throw new KdbxFormatError('The database header is damaged.');
    kdf = readVariantDictionary(params);
  } else {
    const seed = fields.get(5);
    const rounds = fields.get(6);
    if (!seed || !rounds) throw new KdbxFormatError('The database header is damaged.');
    kdf = new Map([
      ['$UUID', Uint8Array.from(KDF_AES.match(/../g)!, (h) => parseInt(h, 16))],
      ['S', seed],
      ['R', rounds],
    ]);
  }

  const transformed = await transformKey(kdf, await compositeKey(credentials), onProgress);
  const cipherKey = await sha256(concat([masterSeed, transformed]));
  let payload: Uint8Array;
  let stream: StreamCipher | null;

  if (major >= 4) {
    const headerHash = r.bytesN(32);
    const headerHmac = r.bytesN(32);
    const header = file.subarray(0, headerEnd);
    if (!equal(await sha256(header), headerHash)) throw new KdbxFormatError('The database header is damaged.');
    const hmacBase = await sha512(concat([masterSeed, transformed, Uint8Array.of(1)]));
    const blockKey = (index: bigint) => sha512(concat([u64le(index), hmacBase]));
    if (!equal(await hmacSha256(await blockKey(0xffffffffffffffffn), header), headerHmac)) throw new KdbxKeyError();
    const parts: Uint8Array[] = [];
    for (let index = 0n; ; index++) {
      const mac = r.bytesN(32);
      const size = r.i32();
      const data = r.bytesN(size);
      const signed = concat([u64le(index), Uint8Array.of(size & 0xff, (size >>> 8) & 0xff, (size >>> 16) & 0xff, (size >>> 24) & 0xff), data]);
      if (!equal(await hmacSha256(await blockKey(index), signed), mac)) throw new KdbxFormatError('The database is damaged (a block failed its integrity check).');
      if (size === 0) break;
      parts.push(data);
    }
    payload = await decryptPayload(cipher, cipherKey, iv, concat(parts));
    if (compression === 1) payload = await gunzip(payload);
    // Inner header: the protected-value stream and the attachments.
    const ir = new Reader(payload);
    let streamId = 0;
    let streamKey = new Uint8Array();
    for (;;) {
      const id = ir.u8();
      const data = ir.bytesN(ir.i32());
      if (id === 0) break;
      if (id === 1) streamId = le(data).getUint32(0, true);
      if (id === 2) streamKey = data;
    }
    payload = payload.subarray(ir.pos);
    stream = await innerStream(streamId, streamKey);
  } else {
    const startBytes = fields.get(9);
    const decrypted = await decryptPayload(cipher, cipherKey, iv, file.subarray(headerEnd));
    if (!startBytes || !equal(decrypted.subarray(0, 32), startBytes)) throw new KdbxKeyError();
    const br = new Reader(decrypted.subarray(32));
    const parts: Uint8Array[] = [];
    for (;;) {
      br.u32();
      const hash = br.bytesN(32);
      const data = br.bytesN(br.u32());
      if (data.length === 0) break;
      if (!equal(await sha256(data), hash)) throw new KdbxFormatError('The database is damaged (a block failed its integrity check).');
      parts.push(data);
    }
    payload = concat(parts);
    if (compression === 1) payload = await gunzip(payload);
    stream = await innerStream(fields.get(10) ? le(fields.get(10)!).getUint32(0, true) : 0, fields.get(8) ?? new Uint8Array());
  }

  const xml = parseXml(new TextDecoder().decode(payload).replace(/^﻿/, ''));
  unprotect(xml, stream);
  return { version: { major, minor }, xml };
}
