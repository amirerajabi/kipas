// The stream ciphers KeePass uses: ChaCha20 (RFC 8439; KDBX 4 payload cipher and inner stream) and Salsa20 (the KDBX 3
// inner stream that hides protected values inside the XML). Both produce a keystream that is XORed with the data.

function rotl(x: number, n: number): number {
  return (x << n) | (x >>> (32 - n));
}

function words(bytes: Uint8Array): Uint32Array {
  const out = new Uint32Array(bytes.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = bytes[i * 4] | (bytes[i * 4 + 1] << 8) | (bytes[i * 4 + 2] << 16) | (bytes[i * 4 + 3] << 24);
  return out;
}

const SIGMA = words(new TextEncoder().encode('expand 32-byte k'));

/** A keystream generator: `xor(data)` encrypts or decrypts, continuing where the last call stopped. */
export interface StreamCipher {
  xor(data: Uint8Array): Uint8Array;
}

abstract class BlockStream implements StreamCipher {
  protected state = new Uint32Array(16);
  private block = new Uint8Array(64);
  private used = 64;

  protected abstract core(out: Uint32Array): void;
  protected abstract nextCounter(): void;

  xor(data: Uint8Array): Uint8Array {
    const out = new Uint8Array(data.length);
    const x = new Uint32Array(16);
    for (let i = 0; i < data.length; i++) {
      if (this.used === 64) {
        this.core(x);
        for (let k = 0; k < 16; k++) {
          const w = x[k];
          this.block[k * 4] = w;
          this.block[k * 4 + 1] = w >>> 8;
          this.block[k * 4 + 2] = w >>> 16;
          this.block[k * 4 + 3] = w >>> 24;
        }
        this.nextCounter();
        this.used = 0;
      }
      out[i] = data[i] ^ this.block[this.used++];
    }
    return out;
  }
}

/** ChaCha20 with a 32-byte key, 12-byte nonce and a 32-bit block counter starting at 0. */
export class ChaCha20 extends BlockStream {
  constructor(key: Uint8Array, nonce: Uint8Array) {
    super();
    if (key.length !== 32 || nonce.length !== 12) throw new Error('ChaCha20: bad key or nonce length');
    this.state.set(SIGMA, 0);
    this.state.set(words(key), 4);
    this.state[12] = 0;
    this.state.set(words(nonce), 13);
  }

  protected core(out: Uint32Array): void {
    const s = this.state;
    out.set(s);
    const qr = (a: number, b: number, c: number, d: number) => {
      out[a] += out[b];
      out[d] = rotl(out[d] ^ out[a], 16);
      out[c] += out[d];
      out[b] = rotl(out[b] ^ out[c], 12);
      out[a] += out[b];
      out[d] = rotl(out[d] ^ out[a], 8);
      out[c] += out[d];
      out[b] = rotl(out[b] ^ out[c], 7);
    };
    for (let i = 0; i < 10; i++) {
      qr(0, 4, 8, 12);
      qr(1, 5, 9, 13);
      qr(2, 6, 10, 14);
      qr(3, 7, 11, 15);
      qr(0, 5, 10, 15);
      qr(1, 6, 11, 12);
      qr(2, 7, 8, 13);
      qr(3, 4, 9, 14);
    }
    for (let i = 0; i < 16; i++) out[i] += s[i];
  }

  protected nextCounter(): void {
    this.state[12]++;
  }
}

/** Salsa20/20 with a 32-byte key, 8-byte nonce and a 64-bit block counter starting at 0. */
export class Salsa20 extends BlockStream {
  constructor(key: Uint8Array, nonce: Uint8Array) {
    super();
    if (key.length !== 32 || nonce.length !== 8) throw new Error('Salsa20: bad key or nonce length');
    const k = words(key);
    const n = words(nonce);
    const s = this.state;
    s[0] = SIGMA[0];
    s[1] = k[0];
    s[2] = k[1];
    s[3] = k[2];
    s[4] = k[3];
    s[5] = SIGMA[1];
    s[6] = n[0];
    s[7] = n[1];
    s[8] = 0;
    s[9] = 0;
    s[10] = SIGMA[2];
    s[11] = k[4];
    s[12] = k[5];
    s[13] = k[6];
    s[14] = k[7];
    s[15] = SIGMA[3];
  }

  protected core(out: Uint32Array): void {
    const s = this.state;
    out.set(s);
    const qr = (a: number, b: number, c: number, d: number) => {
      out[b] ^= rotl(out[a] + out[d], 7);
      out[c] ^= rotl(out[b] + out[a], 9);
      out[d] ^= rotl(out[c] + out[b], 13);
      out[a] ^= rotl(out[d] + out[c], 18);
    };
    for (let i = 0; i < 10; i++) {
      qr(0, 4, 8, 12);
      qr(5, 9, 13, 1);
      qr(10, 14, 2, 6);
      qr(15, 3, 7, 11);
      qr(0, 1, 2, 3);
      qr(5, 6, 7, 4);
      qr(10, 11, 8, 9);
      qr(15, 12, 13, 14);
    }
    for (let i = 0; i < 16; i++) out[i] += s[i];
  }

  protected nextCounter(): void {
    if (++this.state[8] === 0) this.state[9]++;
  }
}
