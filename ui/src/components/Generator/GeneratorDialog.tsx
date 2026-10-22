import { Check, Copy, RefreshCw, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { copyText } from '../../app/actions';
import { useSettings } from '../../store/settings';
import { useUi } from '../../store/ui';
import { generate, generatorBits, type GeneratorOptions } from '../../vault/generator';
import { Dialog, Field } from '../common/Dialog';
import { StrengthMeter } from '../common/visuals';

/** Password / passphrase generator. Options are remembered; opened from a password field it offers "Use". */
export function GeneratorDialog() {
  const g = useUi((s) => s.generator);
  if (!g) return null;
  return <Generator onUse={g.onUse} />;
}

function Generator({ onUse }: { onUse?: (pw: string) => void }) {
  const opts = useSettings((s) => s.settings.generator);
  const [value, setValue] = useState(() => generate(opts));
  useEffect(() => setValue(generate(opts)), [opts]);
  const set = (p: Partial<GeneratorOptions>) => useSettings.getState().update({ generator: { ...opts, ...p } });
  const close = () => useUi.getState().set({ generator: null });
  const use = () => {
    onUse?.(value);
    close();
  };
  const bits = generatorBits(opts);

  return (
    <Dialog
      title="Password generator"
      icon={<Wand2 size={18} className="text-accent" />}
      width={520}
      onClose={close}
      onSubmit={onUse ? use : undefined}
      footer={
        <>
          <button className="btn" onClick={() => copyText(value, 'Generated password')}>
            <Copy size={14} /> Copy
          </button>
          <div className="flex-1" />
          <button className="btn" onClick={close}>
            {onUse ? 'Cancel' : 'Close'}
          </button>
          {onUse && (
            <button className="btn btn-primary" onClick={use}>
              <Check size={14} /> Use this password
            </button>
          )}
        </>
      }
    >
      <div className="form">
        <div className="gen-output">
          <output className="gen-value mono selectable" aria-live="polite">
            {[...value].map((ch, i) => (
              <span key={i} className={/[0-9]/.test(ch) ? 'ch-digit' : /[a-zA-Z]/.test(ch) ? undefined : 'ch-symbol'}>
                {ch}
              </span>
            ))}
          </output>
          <button className="icon-btn" title="Generate another" aria-label="Generate another" onClick={() => setValue(generate(opts))}>
            <RefreshCw size={16} />
          </button>
        </div>
        <div className="gen-meta">
          <StrengthMeter password={value} showLabel={false} />
          <span className="muted">
            About {bits} bits of entropy{bits >= 80 ? ', far beyond guessing' : bits >= 60 ? ', strong' : ', make it longer'}
          </span>
        </div>

        <div className="segmented" role="radiogroup" aria-label="Kind">
          <button type="button" role="radio" aria-checked={opts.mode === 'password'} className={opts.mode === 'password' ? 'on' : ''} onClick={() => set({ mode: 'password' })}>
            Password
          </button>
          <button type="button" role="radio" aria-checked={opts.mode === 'passphrase'} className={opts.mode === 'passphrase' ? 'on' : ''} onClick={() => set({ mode: 'passphrase' })}>
            Passphrase
          </button>
        </div>

        {opts.mode === 'password' ? (
          <>
            <Field label={`Length: ${opts.length}`}>
              <input type="range" className="range" min={8} max={64} value={opts.length} onChange={(e) => set({ length: Number(e.target.value) })} />
            </Field>
            <div className="check-grid">
              <label className="check">
                <input type="checkbox" checked={opts.upper} onChange={(e) => set({ upper: e.target.checked })} /> A–Z
              </label>
              <label className="check">
                <input type="checkbox" checked={opts.lower} onChange={(e) => set({ lower: e.target.checked })} /> a–z
              </label>
              <label className="check">
                <input type="checkbox" checked={opts.digits} onChange={(e) => set({ digits: e.target.checked })} /> 0–9
              </label>
              <label className="check">
                <input type="checkbox" checked={opts.symbols} onChange={(e) => set({ symbols: e.target.checked })} /> !@#$
              </label>
              <label className="check span-2">
                <input type="checkbox" checked={opts.avoidAmbiguous} onChange={(e) => set({ avoidAmbiguous: e.target.checked })} /> Avoid look-alikes (0 O 1 l I)
              </label>
            </div>
          </>
        ) : (
          <>
            <Field label={`Words: ${opts.words}`} hint="Passphrases are easier to type and remember, for example a master password.">
              <input type="range" className="range" min={3} max={10} value={opts.words} onChange={(e) => set({ words: Number(e.target.value) })} />
            </Field>
            <div className="check-grid">
              <label className="check">
                <input type="checkbox" checked={opts.capitalize} onChange={(e) => set({ capitalize: e.target.checked })} /> Capitalize
              </label>
              <label className="check">
                <input type="checkbox" checked={opts.addNumber} onChange={(e) => set({ addNumber: e.target.checked })} /> Add a number
              </label>
              <label className="check">
                Separator
                <select className="input select narrow" value={opts.separator} onChange={(e) => set({ separator: e.target.value })}>
                  <option value="-">-</option>
                  <option value=" ">space</option>
                  <option value=".">.</option>
                  <option value="_">_</option>
                  <option value="">none</option>
                </select>
              </label>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
