// Time-based one-time passwords (RFC 6238 / RFC 4226) from a base32 secret or an otpauth:// URI, via Web Crypto HMAC.

export interface TotpSpec {
  secret: Uint8Array;
  digits: number;
  period: number;
  algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512';
  issuer?: string;
  account?: string;
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input: string): Uint8Array | null {
  const s = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  if (!s || /[^A-Z2-7]/.test(s)) return null;
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of s) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Parse what people paste: a bare base32 secret (spaces allowed) or a full otpauth://totp/... URI. */
export function parseTotp(input: string): TotpSpec | null {
  const text = input.trim();
  if (!text) return null;
  if (/^otpauth:\/\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    if (url.host.toLowerCase() !== 'totp') return null;
    const secret = base32Decode(url.searchParams.get('secret') ?? '');
    if (!secret) return null;
    const digits = Number(url.searchParams.get('digits') ?? 6);
    const period = Number(url.searchParams.get('period') ?? 30);
    const alg = (url.searchParams.get('algorithm') ?? 'SHA1').toUpperCase();
    const algorithm = alg === 'SHA256' ? 'SHA-256' : alg === 'SHA512' ? 'SHA-512' : 'SHA-1';
    const label = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const [issuerFromLabel, account] = label.includes(':') ? label.split(/:(.*)/s) : [undefined, label];
    return {
      secret,
      digits: digits >= 6 && digits <= 10 ? digits : 6,
      period: period >= 1 && period <= 300 ? period : 30,
      algorithm,
      issuer: url.searchParams.get('issuer') ?? issuerFromLabel,
      account: account || undefined,
    };
  }
  const secret = base32Decode(text);
  return secret && secret.length >= 5 ? { secret, digits: 6, period: 30, algorithm: 'SHA-1' } : null;
}

export async function hotp(spec: Pick<TotpSpec, 'secret' | 'digits' | 'algorithm'>, counter: number): Promise<string> {
  const msg = new Uint8Array(8);
  const view = new DataView(msg.buffer);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const key = await crypto.subtle.importKey('raw', spec.secret, { name: 'HMAC', hash: spec.algorithm }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** spec.digits).padStart(spec.digits, '0');
}

/** The current code and how many seconds it has left. */
export async function totpNow(spec: TotpSpec, now = Date.now()): Promise<{ code: string; remaining: number }> {
  const seconds = Math.floor(now / 1000);
  const code = await hotp(spec, Math.floor(seconds / spec.period));
  return { code, remaining: spec.period - (seconds % spec.period) };
}

/** "123456" -> "123 456" for reading; copying always uses the plain code. */
export function groupCode(code: string): string {
  const mid = Math.ceil(code.length / 2);
  return `${code.slice(0, mid)} ${code.slice(mid)}`;
}
