// A small password strength estimate (no dependency): character-pool entropy, discounted for the patterns attackers try
// first (common passwords, repeats, keyboard and alphabet runs, years, a word with a number on the end).

export type StrengthScore = 0 | 1 | 2 | 3 | 4;

export interface Strength {
  score: StrengthScore;
  bits: number;
  label: string;
  /** One short, actionable hint, or '' when there is nothing to say. */
  hint: string;
}

const LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];

const COMMON = new Set(
  (
    '123456 password 12345678 qwerty 123456789 12345 1234 111111 1234567 dragon 123123 baseball abc123 football monkey letmein ' +
    'shadow master 666666 qwertyuiop 123321 mustang 1234567890 michael 654321 superman 1qaz2wsx 7777777 121212 000000 qazwsx ' +
    '123qwe killer trustno1 jordan jennifer zxcvbnm asdfgh hunter buster soccer harley batman andrew tigger sunshine iloveyou ' +
    '2000 charlie robert thomas hockey ranger daniel starwars klaster 112233 george computer michelle jessica pepper 1111 zxcvbn ' +
    '555555 11111111 131313 freedom 777777 pass maggie 159753 aaaaaa ginger princess joshua cheese amanda summer love ashley ' +
    'nicole chelsea biteme matthew access yankees 987654321 dallas austin thunder taylor matrix welcome admin passw0rd p@ssw0rd ' +
    'password1 password123 qwerty123 abcdef abcd1234 secret changeme default guest login root test'
  ).split(' '),
);

const RUNS = ['abcdefghijklmnopqrstuvwxyz', '01234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1qaz2wsx3edc'];

function poolSize(pw: string): number {
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33;
  // Anything outside ASCII widens the pool a lot; count it modestly.
  if (/[^\x00-\x7f]/.test(pw)) pool += 60;
  return pool;
}

/** Characters that belong to a run of 3+ ("abc", "321", "qwe") or a repeat of 3+ ("aaa"). */
function patternChars(pw: string): number {
  const s = pw.toLowerCase();
  const hit = new Array<boolean>(s.length).fill(false);
  for (let i = 0; i + 2 < s.length; i++) {
    const tri = s.slice(i, i + 3);
    const repeat = tri[0] === tri[1] && tri[1] === tri[2];
    const run = RUNS.some((r) => r.includes(tri) || r.includes([...tri].reverse().join('')));
    if (repeat || run) hit[i] = hit[i + 1] = hit[i + 2] = true;
  }
  return hit.filter(Boolean).length;
}

export function estimateStrength(pw: string): Strength {
  if (!pw) return { score: 0, bits: 0, label: 'Empty', hint: '' };
  const lower = pw.toLowerCase();
  const stripped = lower.replace(/[^a-z0-9]/g, '');
  if (COMMON.has(lower) || COMMON.has(stripped) || COMMON.has(lower.replace(/\d+$/, ''))) {
    return { score: 0, bits: 0, label: LABELS[0], hint: 'This is one of the most common passwords.' };
  }
  const chars = [...pw];
  const unique = new Set(chars).size;
  let effective = chars.length - patternChars(pw) * 0.75;
  // A dictionary-looking word followed by digits or a year is guessed early.
  if (/^[A-Za-z]{3,}\d{1,4}[!.?]?$/.test(pw)) effective *= 0.6;
  if (/(19|20)\d\d/.test(pw)) effective -= 2;
  if (unique <= 3) effective = Math.min(effective, unique);
  const bits = Math.max(0, Math.round(effective * Math.log2(Math.max(poolSize(pw), 2))));
  const score: StrengthScore = bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  let hint = '';
  if (chars.length < 12) hint = 'Use at least 12 characters.';
  else if (score < 3 && patternChars(pw) > 0) hint = 'Avoid runs like "abc" or "111".';
  else if (score < 3) hint = 'Add more words or characters.';
  return { score, bits, label: LABELS[score], hint };
}
