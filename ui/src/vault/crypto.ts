// Sealing and opening vault files with the Web Crypto API (the same code runs in Electron, a browser and Node tests).
//
// File format (JSON text, `.kipas`):
//   { format, version, kdf: { name, iterations, salt }, cipher: { name, iv }, data }
// The master password goes through PBKDF2-HMAC-SHA256 (600 000 iterations by default, OWASP's 2023 figure) into a
// 256-bit AES-GCM key. Every save uses a fresh random IV. The header is bound to the ciphertext as additional
// authenticated data, so editing the iteration count, salt or IV makes the file fail to open instead of weakening it.
// The key is non-extractable and the master password is not kept after the key is derived.
import { normalizeVault, type VaultData } from './model';

export const FORMAT = 'kipas-vault';
export const DEFAULT_ITERATIONS = 600_000;
/** Below this the file is refused: a tampered or broken header must not open with a trivially weak key. */
export const MIN_ITERATIONS = 100_000;

export interface KdfParams {
  name: 'PBKDF2-SHA256';
  iterations: number;
  /** base64 */
  salt: string;
}

export interface VaultEnvelope {
  format: typeof FORMAT;
  version: 1;
  kdf: KdfParams;
  cipher: { name: 'AES-256-GCM'; iv: string };
  data: string;
}

export interface VaultKey {
  key: CryptoKey;
  kdf: KdfParams;
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Wrong master password, or the vault file is damaged.');
    this.name = 'WrongPasswordError';
  }
}

export class VaultFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultFormatError';
  }
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export async function deriveKey(password: string, kdf: KdfParams): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(kdf.salt), iterations: kdf.iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** A new key with a new salt: used when a vault is created and when its master password changes. */
export async function createKey(password: string, iterations = DEFAULT_ITERATIONS): Promise<VaultKey> {
  const kdf: KdfParams = { name: 'PBKDF2-SHA256', iterations, salt: toBase64(randomBytes(32)) };
  return { key: await deriveKey(password, kdf), kdf };
}

/** The header bytes the ciphertext is bound to. Field order is fixed so seal and open produce the same bytes. */
function headerAad(kdf: KdfParams, iv: string): Uint8Array {
  const header = { format: FORMAT, version: 1, kdf: { name: kdf.name, iterations: kdf.iterations, salt: kdf.salt }, cipher: { name: 'AES-256-GCM', iv } };
  return new TextEncoder().encode(JSON.stringify(header));
}

export async function seal(vk: VaultKey, data: VaultData): Promise<string> {
  const iv = toBase64(randomBytes(12));
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: fromBase64(iv), additionalData: headerAad(vk.kdf, iv) }, vk.key, plain);
  const env: VaultEnvelope = { format: FORMAT, version: 1, kdf: vk.kdf, cipher: { name: 'AES-256-GCM', iv }, data: toBase64(new Uint8Array(cipher)) };
  return JSON.stringify(env, null, 1);
}

/** Validate the envelope without decrypting it (used to recognise a vault file before asking for its password). */
export function parseEnvelope(text: string): VaultEnvelope {
  let env: Partial<VaultEnvelope>;
  try {
    env = JSON.parse(text) as Partial<VaultEnvelope>;
  } catch {
    throw new VaultFormatError('This is not a Kipas vault file.');
  }
  if (env.format !== FORMAT) throw new VaultFormatError('This is not a Kipas vault file.');
  if (env.version !== 1) throw new VaultFormatError(`This vault was made by a newer Kipas (format ${String(env.version)}). Update Kipas to open it.`);
  const kdf = env.kdf;
  if (!kdf || kdf.name !== 'PBKDF2-SHA256' || typeof kdf.salt !== 'string' || !Number.isInteger(kdf.iterations)) throw new VaultFormatError('The vault header is damaged.');
  if (kdf.iterations < MIN_ITERATIONS || kdf.iterations > 50_000_000) throw new VaultFormatError('The vault header has an unsafe key setting; refusing to open it.');
  if (env.cipher?.name !== 'AES-256-GCM' || typeof env.cipher.iv !== 'string' || typeof env.data !== 'string') throw new VaultFormatError('The vault header is damaged.');
  return env as VaultEnvelope;
}

export async function openWithKey(text: string, vk: VaultKey): Promise<VaultData> {
  const env = parseEnvelope(text);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(env.cipher.iv), additionalData: headerAad(env.kdf, env.cipher.iv) }, vk.key, fromBase64(env.data));
  } catch {
    throw new WrongPasswordError();
  }
  return normalizeVault(JSON.parse(new TextDecoder().decode(plain)));
}

export async function openVault(text: string, password: string): Promise<{ vk: VaultKey; data: VaultData }> {
  const env = parseEnvelope(text);
  const vk: VaultKey = { key: await deriveKey(password, env.kdf), kdf: env.kdf };
  return { vk, data: await openWithKey(text, vk) };
}
