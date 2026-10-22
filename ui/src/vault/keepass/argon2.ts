// Argon2 (RFC 9106, version 0x13: Argon2d, Argon2i, Argon2id) and the BLAKE2b it is built on, in plain TypeScript.
// Web Crypto has neither, and KeePass 2.35+ / KeePassXC derive their keys with Argon2, so importing a KeePass file
// needs it. 64-bit words are held as (lo, hi) pairs of 32-bit numbers; the hot loop (the BlaMka permutation) works on
// one Uint32Array holding all of Argon2's memory. Lanes are computed one after another, which gives the same result as
// running them in parallel.

// ------------------------------------------------------------------------------------------------------------ BLAKE2b

const B2B_IV = new Uint32Array([
  0xf3bcc908, 0x6a09e667, 0x84caa73b, 0xbb67ae85, 0xfe94f82b, 0x3c6ef372, 0x5f1d36f1, 0xa54ff53a, 0xade682d1, 0x510e527f, 0x2b3e6c1f, 0x9b05688c, 0xfb41bd6b,
  0x1f83d9ab, 0x137e2179, 0x5be0cd19,
]);

const SIGMA = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
].map((r) => r.map((i) => i * 2));

/** v[a] += v[b] (64-bit). */
function add64(v: Uint32Array, a: number, b: number): void {
  const lo = v[a] + v[b];
  v[a + 1] = v[a + 1] + v[b + 1] + (lo >= 0x100000000 ? 1 : 0);
  v[a] = lo;
}

/** v[a] += (lo, hi) (64-bit). */
function add64c(v: Uint32Array, a: number, lo: number, hi: number): void {
  const l = v[a] + lo;
  v[a + 1] = v[a + 1] + hi + (l >= 0x100000000 ? 1 : 0);
  v[a] = l;
}

function b2bG(v: Uint32Array, m: Uint32Array, a: number, b: number, c: number, d: number, ix: number, iy: number): void {
  add64(v, a, b);
  add64c(v, a, m[ix], m[ix + 1]);
  let x0 = v[d] ^ v[a];
  let x1 = v[d + 1] ^ v[a + 1];
  v[d] = x1;
  v[d + 1] = x0;
  add64(v, c, d);
  x0 = v[b] ^ v[c];
  x1 = v[b + 1] ^ v[c + 1];
  v[b] = (x0 >>> 24) ^ (x1 << 8);
  v[b + 1] = (x1 >>> 24) ^ (x0 << 8);
  add64(v, a, b);
  add64c(v, a, m[iy], m[iy + 1]);
  x0 = v[d] ^ v[a];
  x1 = v[d + 1] ^ v[a + 1];
  v[d] = (x0 >>> 16) ^ (x1 << 16);
  v[d + 1] = (x1 >>> 16) ^ (x0 << 16);
  add64(v, c, d);
  x0 = v[b] ^ v[c];
  x1 = v[b + 1] ^ v[c + 1];
  v[b] = (x1 >>> 31) ^ (x0 << 1);
  v[b + 1] = (x0 >>> 31) ^ (x1 << 1);
}

function b2bCompress(h: Uint32Array, block: Uint8Array, t: number, last: boolean): void {
  const v = new Uint32Array(32);
  const m = new Uint32Array(32);
  for (let i = 0; i < 32; i++) m[i] = block[i * 4] | (block[i * 4 + 1] << 8) | (block[i * 4 + 2] << 16) | (block[i * 4 + 3] << 24);
  v.set(h, 0);
  v.set(B2B_IV, 16);
  v[24] ^= t >>> 0;
  v[25] ^= Math.floor(t / 0x100000000);
  if (last) {
    v[28] = ~v[28];
    v[29] = ~v[29];
  }
  for (let r = 0; r < 12; r++) {
    const s = SIGMA[r];
    b2bG(v, m, 0, 8, 16, 24, s[0], s[1]);
    b2bG(v, m, 2, 10, 18, 26, s[2], s[3]);
    b2bG(v, m, 4, 12, 20, 28, s[4], s[5]);
    b2bG(v, m, 6, 14, 22, 30, s[6], s[7]);
    b2bG(v, m, 0, 10, 20, 30, s[8], s[9]);
    b2bG(v, m, 2, 12, 22, 24, s[10], s[11]);
    b2bG(v, m, 4, 14, 16, 26, s[12], s[13]);
    b2bG(v, m, 6, 8, 18, 28, s[14], s[15]);
  }
  for (let i = 0; i < 16; i++) h[i] ^= v[i] ^ v[i + 16];
}

/** BLAKE2b without a key, 1 to 64 bytes of output. */
export function blake2b(input: Uint8Array, outLen: number): Uint8Array {
  const h = new Uint32Array(B2B_IV);
  h[0] ^= 0x01010000 ^ outLen;
  const block = new Uint8Array(128);
  let off = 0;
  // Every block but the last is compressed as "not last"; an empty input is one empty last block.
  while (input.length - off > 128) {
    b2bCompress(h, input.subarray(off, off + 128), off + 128, false);
    off += 128;
  }
  block.fill(0);
  block.set(input.subarray(off));
  b2bCompress(h, block, input.length, true);
  const out = new Uint8Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = h[i >> 2] >>> (8 * (i & 3));
  return out;
}

// ------------------------------------------------------------------------------------------------------------- Argon2

export type Argon2Type = 'argon2d' | 'argon2i' | 'argon2id';

export interface Argon2Params {
  type: Argon2Type;
  password: Uint8Array;
  salt: Uint8Array;
  /** Memory in KiB. */
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  hashLength: number;
  secret?: Uint8Array;
  associatedData?: Uint8Array;
  version?: 0x10 | 0x13;
  /** Called with 0..1 now and then; also yields to the event loop when it returns a promise. */
  onProgress?: (fraction: number) => void | Promise<void>;
}

const TYPE_ID: Record<Argon2Type, number> = { argon2d: 0, argon2i: 1, argon2id: 2 };

function le32(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** H' from the RFC: BLAKE2b stretched to any length. */
function hashLong(input: Uint8Array, outLen: number): Uint8Array {
  const withLen = concat([le32(outLen), input]);
  if (outLen <= 64) return blake2b(withLen, outLen);
  const out = new Uint8Array(outLen);
  let v = blake2b(withLen, 64);
  out.set(v.subarray(0, 32), 0);
  let pos = 32;
  while (outLen - pos > 64) {
    v = blake2b(v, 64);
    out.set(v.subarray(0, 32), pos);
    pos += 32;
  }
  out.set(blake2b(v, outLen - pos), pos);
  return out;
}

/** a = a + b + 2 * lo32(a) * lo32(b), the BlaMka mix (64-bit, on (lo, hi) pairs in `v`). */
function blamka(v: Uint32Array, a: number, b: number): void {
  const al = v[a];
  const bl = v[b];
  // 32x32 -> 64-bit product from 16-bit halves, exact in doubles.
  const a0 = al & 0xffff;
  const a1 = al >>> 16;
  const b0 = bl & 0xffff;
  const b1 = bl >>> 16;
  const mid = a0 * b1 + a1 * b0;
  const low = (mid % 65536) * 65536 + a0 * b0;
  const pLo = low % 0x100000000;
  const pHi = a1 * b1 + Math.floor(mid / 65536) + Math.floor(low / 0x100000000);
  // times two
  const p2Lo = (pLo * 2) % 0x100000000;
  const p2Hi = pHi * 2 + (pLo >= 0x80000000 ? 1 : 0);
  const lo = al + bl + p2Lo;
  v[a + 1] = v[a + 1] + v[b + 1] + p2Hi + Math.floor(lo / 0x100000000);
  v[a] = lo;
}

/** The Argon2 GB function on four 64-bit words at (lo) indices a, b, c, d of `v`. */
function gb(v: Uint32Array, a: number, b: number, c: number, d: number): void {
  blamka(v, a, b);
  let x0 = v[d] ^ v[a];
  let x1 = v[d + 1] ^ v[a + 1];
  v[d] = x1;
  v[d + 1] = x0;
  blamka(v, c, d);
  x0 = v[b] ^ v[c];
  x1 = v[b + 1] ^ v[c + 1];
  v[b] = (x0 >>> 24) ^ (x1 << 8);
  v[b + 1] = (x1 >>> 24) ^ (x0 << 8);
  blamka(v, a, b);
  x0 = v[d] ^ v[a];
  x1 = v[d + 1] ^ v[a + 1];
  v[d] = (x0 >>> 16) ^ (x1 << 16);
  v[d + 1] = (x1 >>> 16) ^ (x0 << 16);
  blamka(v, c, d);
  x0 = v[b] ^ v[c];
  x1 = v[b + 1] ^ v[c + 1];
  v[b] = (x1 >>> 31) ^ (x0 << 1);
  v[b + 1] = (x0 >>> 31) ^ (x1 << 1);
}

/** The permutation P on 16 64-bit words given by their (lo) indices into `v`. */
function permute(v: Uint32Array, w: number[]): void {
  gb(v, w[0], w[4], w[8], w[12]);
  gb(v, w[1], w[5], w[9], w[13]);
  gb(v, w[2], w[6], w[10], w[14]);
  gb(v, w[3], w[7], w[11], w[15]);
  gb(v, w[0], w[5], w[10], w[15]);
  gb(v, w[1], w[6], w[11], w[12]);
  gb(v, w[2], w[7], w[8], w[13]);
  gb(v, w[3], w[4], w[9], w[14]);
}

// Word indices (in u32 units) of each row and column of a 1 KiB block seen as an 8x8 matrix of 16-byte registers.
const ROWS: number[][] = [];
const COLS: number[][] = [];
for (let i = 0; i < 8; i++) {
  ROWS.push(Array.from({ length: 16 }, (_, k) => (16 * i + k) * 2));
  COLS.push(Array.from({ length: 16 }, (_, k) => (2 * i + (k & 1) + 16 * (k >> 1)) * 2));
}

const R = new Uint32Array(256);
const Q = new Uint32Array(256);

/**
 * G(X, Y) written into `out` (offsets are u32 indices into the arrays). With `xor`, the result is XORed into the block
 * already there (Argon2 1.3 passes after the first).
 */
function compress(mem: Uint32Array, x: number, y: number, outArr: Uint32Array, out: number, xor: boolean, xArr: Uint32Array = mem, yArr: Uint32Array = mem): void {
  for (let i = 0; i < 256; i++) R[i] = xArr[x + i] ^ yArr[y + i];
  Q.set(R);
  for (let i = 0; i < 8; i++) permute(Q, ROWS[i]);
  for (let i = 0; i < 8; i++) permute(Q, COLS[i]);
  if (xor) for (let i = 0; i < 256; i++) outArr[out + i] ^= Q[i] ^ R[i];
  else for (let i = 0; i < 256; i++) outArr[out + i] = Q[i] ^ R[i];
}

/** High 32 bits of a 32x32-bit product. */
function mulHi(a: number, b: number): number {
  const a0 = a & 0xffff;
  const a1 = a >>> 16;
  const b0 = b & 0xffff;
  const b1 = b >>> 16;
  const mid = a0 * b1 + a1 * b0;
  return a1 * b1 + Math.floor((mid * 65536 + a0 * b0) / 0x100000000);
}

function bytesToWords(bytes: Uint8Array, out: Uint32Array, off: number): void {
  for (let i = 0; i < 256; i++) out[off + i] = bytes[i * 4] | (bytes[i * 4 + 1] << 8) | (bytes[i * 4 + 2] << 16) | (bytes[i * 4 + 3] << 24);
}

export async function argon2(p: Argon2Params): Promise<Uint8Array> {
  const lanes = p.parallelism;
  const version = p.version ?? 0x13;
  if (lanes < 1 || lanes > 0xffffff) throw new Error('Argon2: bad parallelism');
  if (p.iterations < 1) throw new Error('Argon2: bad iteration count');
  if (p.memoryKiB < 8 * lanes) throw new Error('Argon2: too little memory');
  if (p.memoryKiB > 4 * 1024 * 1024) throw new Error('Argon2: more than 4 GiB of memory is not supported');
  const type = TYPE_ID[p.type];
  const secret = p.secret ?? new Uint8Array(0);
  const ad = p.associatedData ?? new Uint8Array(0);

  const h0 = blake2b(
    concat([
      le32(lanes),
      le32(p.hashLength),
      le32(p.memoryKiB),
      le32(p.iterations),
      le32(version),
      le32(type),
      le32(p.password.length),
      p.password,
      le32(p.salt.length),
      p.salt,
      le32(secret.length),
      secret,
      le32(ad.length),
      ad,
    ]),
    64,
  );

  const segment = Math.floor(p.memoryKiB / (4 * lanes));
  const laneLength = segment * 4;
  const blocks = laneLength * lanes;
  const mem = new Uint32Array(blocks * 256);
  const at = (lane: number, index: number) => (lane * laneLength + index) * 256;

  for (let l = 0; l < lanes; l++) {
    bytesToWords(hashLong(concat([h0, le32(0), le32(l)]), 1024), mem, at(l, 0));
    bytesToWords(hashLong(concat([h0, le32(1), le32(l)]), 1024), mem, at(l, 1));
  }

  const zero = new Uint32Array(256);
  const input = new Uint32Array(256);
  const address = new Uint32Array(256);
  const total = p.iterations * 4 * lanes;
  let done = 0;

  for (let pass = 0; pass < p.iterations; pass++) {
    for (let slice = 0; slice < 4; slice++) {
      for (let lane = 0; lane < lanes; lane++) {
        const independent = type === 1 || (type === 2 && pass === 0 && slice < 2);
        if (independent) {
          input.fill(0);
          input[0] = pass;
          input[2] = lane;
          input[4] = slice;
          input[6] = blocks;
          input[8] = p.iterations;
          input[10] = type;
        }
        const nextAddresses = () => {
          input[12]++;
          compress(zero, 0, 0, address, 0, false, zero, input);
          compress(zero, 0, 0, address, 0, false, zero, address);
        };
        let start = 0;
        if (pass === 0 && slice === 0) {
          start = 2;
          if (independent) nextAddresses();
        }
        for (let i = start; i < segment; i++) {
          const cur = slice * segment + i;
          const prev = cur === 0 ? laneLength - 1 : cur - 1;
          let j1: number;
          let j2: number;
          if (independent) {
            if (i % 128 === 0) nextAddresses();
            j1 = address[(i % 128) * 2];
            j2 = address[(i % 128) * 2 + 1];
          } else {
            j1 = mem[at(lane, prev)];
            j2 = mem[at(lane, prev) + 1];
          }
          const refLane = pass === 0 && slice === 0 ? lane : j2 % lanes;
          const same = refLane === lane;
          let area: number;
          if (pass === 0) {
            if (slice === 0) area = i - 1;
            else area = same ? slice * segment + i - 1 : slice * segment + (i === 0 ? -1 : 0);
          } else area = same ? laneLength - segment + i - 1 : laneLength - segment + (i === 0 ? -1 : 0);
          const rel = area - 1 - mulHi(area, mulHi(j1, j1));
          const startPos = pass !== 0 && slice !== 3 ? (slice + 1) * segment : 0;
          const refIndex = (startPos + rel) % laneLength;
          compress(mem, at(lane, prev), at(refLane, refIndex), mem, at(lane, cur), pass !== 0 && version === 0x13);
        }
        done++;
        if (p.onProgress) await p.onProgress(done / total);
      }
    }
  }

  const final = new Uint32Array(256);
  for (let l = 0; l < lanes; l++) {
    const off = at(l, laneLength - 1);
    for (let i = 0; i < 256; i++) final[i] ^= mem[off + i];
  }
  const bytes = new Uint8Array(1024);
  for (let i = 0; i < 256; i++) {
    bytes[i * 4] = final[i];
    bytes[i * 4 + 1] = final[i] >>> 8;
    bytes[i * 4 + 2] = final[i] >>> 16;
    bytes[i * 4 + 3] = final[i] >>> 24;
  }
  return hashLong(bytes, p.hashLength);
}
