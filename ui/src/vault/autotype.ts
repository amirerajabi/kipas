// Auto-type sequences, KeePass style: "{USERNAME}{TAB}{PASSWORD}{ENTER}". Placeholders become the entry's values, key
// names become key presses, anything else is typed as written. The sequence is turned into plain steps here; the
// desktop app does the typing (Windows: SendInput with Unicode characters, so the keyboard layout does not matter).
import type { AutoTypeKey, AutoTypeStep } from '../../../shared/protocol';
import type { Entry } from './model';

export const DEFAULT_AUTOTYPE = '{USERNAME}{TAB}{PASSWORD}{ENTER}';
/** The default in 1.3.0, before Enter was added; settings still holding it move to the new default. */
export const OLD_DEFAULT_AUTOTYPE = '{USERNAME}{TAB}{PASSWORD}';
/** Repeats ({TAB 3}) and delays ({DELAY 500}) are capped so a typo cannot type for minutes. */
const MAX_REPEAT = 20;
const MAX_DELAY_MS = 10_000;

const KEYS: Record<string, AutoTypeKey> = {
  TAB: 'tab',
  ENTER: 'enter',
  SPACE: 'space',
  BACKSPACE: 'backspace',
  BS: 'backspace',
  DELETE: 'delete',
  DEL: 'delete',
  ESC: 'esc',
  UP: 'up',
  DOWN: 'down',
  LEFT: 'left',
  RIGHT: 'right',
  HOME: 'home',
  END: 'end',
};

/** The values a sequence reads from: the entry and, when the sequence asks for {TOTP}, the current code. */
export interface AutoTypeValues {
  title: string;
  username: string;
  password: string;
  url: string;
  totp: string;
  fields: { name: string; value: string }[];
}

export class AutoTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AutoTypeError';
  }
}

type Token = { kind: 'text'; text: string } | { kind: 'field'; name: 'title' | 'username' | 'password' | 'url' | 'totp' | `s:${string}` } | { kind: 'key'; key: AutoTypeKey; times: number } | { kind: 'delay'; ms: number };

/** Split a sequence into tokens, or throw an AutoTypeError that says what is wrong in words people understand. */
export function parseSequence(sequence: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const text = (t: string) => {
    const last = tokens[tokens.length - 1];
    if (last?.kind === 'text') last.text += t;
    else tokens.push({ kind: 'text', text: t });
  };
  while (i < sequence.length) {
    const c = sequence[i];
    if (c === '}') throw new AutoTypeError('A "}" has no matching "{". Write {}} to type a brace.');
    if (c !== '{') {
      text(c);
      i++;
      continue;
    }
    // {{} and {}} type a literal brace.
    if (sequence.startsWith('{{}', i) || sequence.startsWith('{}}', i)) {
      text(sequence[i + 1]);
      i += 3;
      continue;
    }
    const end = sequence.indexOf('}', i);
    if (end < 0) throw new AutoTypeError('A "{" is not closed.');
    const inner = sequence.slice(i + 1, end).trim();
    i = end + 1;
    if (/^S:/i.test(inner)) {
      const name = inner.slice(2).trim();
      if (!name) throw new AutoTypeError('{S:...} needs a field name, like {S:PIN}.');
      tokens.push({ kind: 'field', name: `s:${name}` });
      continue;
    }
    const m = /^([A-Za-z]+)(?:[ =](\d+))?$/.exec(inner);
    if (!m) throw new AutoTypeError(`{${inner}} is not something Kipas can type.`);
    const word = m[1].toUpperCase();
    const n = m[2] === undefined ? undefined : Number(m[2]);
    if (word === 'DELAY') {
      if (n === undefined) throw new AutoTypeError('{DELAY} needs milliseconds, like {DELAY 500}.');
      tokens.push({ kind: 'delay', ms: Math.min(n, MAX_DELAY_MS) });
    } else if (KEYS[word]) {
      if (n !== undefined && (n < 1 || n > MAX_REPEAT)) throw new AutoTypeError(`{${word} ${n}}: repeat between 1 and ${MAX_REPEAT} times.`);
      tokens.push({ kind: 'key', key: KEYS[word], times: n ?? 1 });
    } else if (['USERNAME', 'PASSWORD', 'TITLE', 'URL', 'TOTP'].includes(word) && n === undefined) {
      tokens.push({ kind: 'field', name: word.toLowerCase() as 'title' | 'username' | 'password' | 'url' | 'totp' });
    } else {
      throw new AutoTypeError(`{${inner}} is not something Kipas can type. Use {USERNAME}, {PASSWORD}, {TOTP}, {TAB}, {ENTER} or {DELAY 500}.`);
    }
  }
  return tokens;
}

/** Does the sequence need a one-time code (so the caller computes one first)? */
export function needsTotp(sequence: string): boolean {
  return parseSequence(sequence).some((t) => t.kind === 'field' && t.name === 'totp');
}

/** The sequence an entry uses: its own, or the default. */
export function sequenceFor(entry: Pick<Entry, 'autoType'>, defaultSequence: string): string {
  return entry.autoType.trim() || defaultSequence.trim() || DEFAULT_AUTOTYPE;
}

/** Turn a sequence into the steps the desktop app types. Missing values are an error, not silently skipped. */
export function buildSteps(sequence: string, v: AutoTypeValues): AutoTypeStep[] {
  const steps: AutoTypeStep[] = [];
  const type = (s: string) => {
    if (!s) return;
    const last = steps[steps.length - 1];
    if (last?.t === 'text') last.v += s;
    else steps.push({ t: 'text', v: s });
  };
  for (const tok of parseSequence(sequence)) {
    if (tok.kind === 'text') type(tok.text);
    else if (tok.kind === 'delay') steps.push({ t: 'delay', v: tok.ms });
    else if (tok.kind === 'key') for (let k = 0; k < tok.times; k++) steps.push({ t: 'key', v: tok.key });
    else if (tok.name.startsWith('s:')) {
      const name = tok.name.slice(2).toLowerCase();
      const f = v.fields.find((x) => x.name.trim().toLowerCase() === name);
      if (!f) throw new AutoTypeError(`This item has no field called "${tok.name.slice(2)}".`);
      type(f.value);
    } else {
      const value = v[tok.name as keyof Omit<AutoTypeValues, 'fields'>];
      if (!value) throw new AutoTypeError(`This item has no ${tok.name === 'totp' ? 'two-factor secret' : tok.name === 'username' ? 'user name' : tok.name}.`);
      type(value);
    }
  }
  if (!steps.some((s) => s.t !== 'delay')) throw new AutoTypeError('The auto-type sequence types nothing.');
  return steps;
}
