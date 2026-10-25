import { useRef } from 'react';
import { AutoTypeError, parseSequence } from '../../vault/autotype';

const TOKENS: { label: string; token: string }[] = [
  { label: 'User name', token: '{USERNAME}' },
  { label: 'Password', token: '{PASSWORD}' },
  { label: 'Tab', token: '{TAB}' },
  { label: 'Enter', token: '{ENTER}' },
  { label: 'Code', token: '{TOTP}' },
  { label: 'Wait', token: '{DELAY 500}' },
];

/** Why the sequence cannot be used, or null. '' is fine where `optional` (it means "use the default"). */
export function sequenceProblem(value: string, optional = false): string | null {
  if (!value.trim()) return optional ? null : 'Type a sequence, for example {USERNAME}{TAB}{PASSWORD}.';
  try {
    parseSequence(value);
    return null;
  } catch (e) {
    return e instanceof AutoTypeError ? e.message : String(e);
  }
}

/**
 * An auto-type sequence: a text box plus buttons that insert {USERNAME}, {TAB} and friends at the cursor, so nobody has
 * to remember the syntax. Two Tabs is just {TAB}{TAB} (or {TAB 2}).
 */
export function SequenceInput({ value, onChange, placeholder, optional }: { value: string; onChange: (v: string) => void; placeholder?: string; optional?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const problem = sequenceProblem(value, optional);
  const insert = (token: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    // An empty per-item sequence starts from the default, so "+ Tab" on it means "the default, then one more Tab".
    const base = !value && placeholder ? placeholder : value;
    const at = !value && placeholder ? base.length : start;
    const next = base.slice(0, at) + token + base.slice(!value && placeholder ? at : end);
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  };
  return (
    <span className="sequence-input">
      <input ref={ref} className={`input mono${problem ? ' invalid' : ''}`} value={value} placeholder={placeholder} spellCheck={false} autoComplete="off" onChange={(e) => onChange(e.target.value)} aria-invalid={!!problem} />
      <span className="sequence-tokens">
        {TOKENS.map((t) => (
          <button key={t.token} type="button" className="chip" title={`Insert ${t.token}`} onClick={() => insert(t.token)}>
            + {t.label}
          </button>
        ))}
      </span>
      {problem && <span className="field-hint text-danger">{problem}</span>}
    </span>
  );
}
