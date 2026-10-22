// Password and passphrase generator. Randomness comes from crypto.getRandomValues with rejection sampling, so every
// character and word is equally likely (no modulo bias).
import { WORDS } from './words';

export interface GeneratorOptions {
  mode: 'password' | 'passphrase';
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  /** Leave out characters that are easy to misread: 0 O o 1 l I | ` ' " */
  avoidAmbiguous: boolean;
  words: number;
  separator: string;
  capitalize: boolean;
  addNumber: boolean;
}

export const DEFAULT_GENERATOR: GeneratorOptions = {
  mode: 'password',
  length: 20,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: false,
  words: 5,
  separator: '-',
  capitalize: true,
  addNumber: true,
};

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!#$%&()*+,-./:;<=>?@[]^_{}~',
};
const AMBIGUOUS = /[0Oo1lI|`'"]/g;

/** A uniform integer in [0, n). */
export function randomInt(n: number): number {
  if (n <= 0 || n > 2 ** 32) throw new RangeError('randomInt range');
  const limit = Math.floor(2 ** 32 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

function charSets(o: GeneratorOptions): string[] {
  const sets = (['lower', 'upper', 'digits', 'symbols'] as const).filter((k) => o[k]).map((k) => (o.avoidAmbiguous ? SETS[k].replace(AMBIGUOUS, '') : SETS[k]));
  return sets.length ? sets : [SETS.lower];
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generatePassword(o: GeneratorOptions): string {
  const sets = charSets(o);
  const all = sets.join('');
  const length = Math.max(4, Math.min(128, Math.round(o.length)));
  // One character from each chosen set, so "digits" really means at least one digit; the rest from the whole pool.
  const chars = sets.map((s) => s[randomInt(s.length)]);
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  return shuffle(chars).join('');
}

export function generatePassphrase(o: GeneratorOptions): string {
  const count = Math.max(3, Math.min(12, Math.round(o.words)));
  const words = Array.from({ length: count }, () => {
    const w = WORDS[randomInt(WORDS.length)];
    return o.capitalize ? w[0].toUpperCase() + w.slice(1) : w;
  });
  if (o.addNumber) {
    const i = randomInt(words.length);
    words[i] = `${words[i]}${randomInt(10)}`;
  }
  return words.join(o.separator);
}

export function generate(o: GeneratorOptions): string {
  return o.mode === 'passphrase' ? generatePassphrase(o) : generatePassword(o);
}

/** Entropy of what the generator produces with these options (not of a particular result). */
export function generatorBits(o: GeneratorOptions): number {
  if (o.mode === 'passphrase') {
    const count = Math.max(3, Math.min(12, Math.round(o.words)));
    return Math.round(count * Math.log2(WORDS.length) + (o.addNumber ? Math.log2(10) + Math.log2(count) : 0));
  }
  const pool = charSets(o).join('').length;
  return Math.round(Math.max(4, Math.min(128, o.length)) * Math.log2(pool));
}
