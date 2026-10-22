import { Eye, EyeOff, Wand2 } from 'lucide-react';
import { useState, type InputHTMLAttributes } from 'react';
import { useUi } from '../../store/ui';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> {
  value: string;
  onChange: (v: string) => void;
  /** Offer the generator; its result replaces the value. */
  generator?: boolean;
  mono?: boolean;
}

/** A password field with show/hide and, optionally, the generator. Never autocompleted or spell-checked. */
export function SecretInput({ value, onChange, generator, mono = true, className = '', ...rest }: Props) {
  const [shown, setShown] = useState(false);
  return (
    <span className="input-with-btn secret-input">
      <input
        {...rest}
        className={`input${mono ? ' mono' : ''} ${className}`}
        type={shown ? 'text' : 'password'}
        value={value}
        autoComplete="new-password"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" className="icon-btn sm" title={shown ? 'Hide' : 'Show'} aria-label={shown ? 'Hide' : 'Show'} onClick={() => setShown(!shown)}>
        {shown ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
      {generator && (
        <button
          type="button"
          className="icon-btn sm"
          title="Generate a password"
          aria-label="Generate a password"
          onClick={() =>
            useUi.getState().set({
              generator: {
                onUse: (pw) => {
                  onChange(pw);
                  setShown(true);
                },
              },
            })
          }
        >
          <Wand2 size={15} />
        </button>
      )}
    </span>
  );
}
