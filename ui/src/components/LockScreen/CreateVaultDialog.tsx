import { FilePlus2, LoaderCircle, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toastError } from '../../app/actions';
import { getPlatform } from '../../platform';
import { useUi } from '../../store/ui';
import { useVault } from '../../store/vault';
import { DEFAULT_GENERATOR, generatePassphrase } from '../../vault/generator';
import { estimateStrength } from '../../vault/strength';
import { Dialog, Field } from '../common/Dialog';
import { SecretInput } from '../common/SecretInput';
import { StrengthMeter } from '../common/visuals';

export const MIN_MASTER_LENGTH = 10;

/** Is this good enough to protect a vault? Returns why not, or null. */
export function masterProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_MASTER_LENGTH) return `Use at least ${MIN_MASTER_LENGTH} characters.`;
  if (estimateStrength(password).score < 2) return 'Too easy to guess. Try a passphrase of four or more words.';
  if (password !== confirm) return 'The two passwords do not match.';
  return null;
}

export function CreateVaultDialog() {
  const open = useUi((s) => s.createVaultOpen);
  if (!open) return null;
  return <Create />;
}

function Create() {
  const [name, setName] = useState('My vault');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [suggested, setSuggested] = useState<string | null>(null);
  const problem = masterProblem(password, confirm);
  const close = () => useUi.getState().set({ createVaultOpen: false });

  const create = async () => {
    if (problem || !understood || !name.trim() || busy) return;
    const path = await getPlatform().chooseVaultToCreate(name.trim());
    if (!path) return;
    setBusy(true);
    try {
      await useVault.getState().create(path, name.trim(), password);
      close();
    } catch (e) {
      toastError('Could not create the vault', e);
      setBusy(false);
    }
  };

  const suggest = () => {
    const p = generatePassphrase({ ...DEFAULT_GENERATOR, words: 5, separator: '-', capitalize: true, addNumber: true });
    setSuggested(p);
    setPassword(p);
    setConfirm('');
  };

  return (
    <Dialog
      title="Create a new vault"
      icon={<FilePlus2 size={18} className="text-accent" />}
      width={520}
      onClose={close}
      onSubmit={() => void create()}
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void create()} disabled={!!problem || !understood || !name.trim() || busy}>
            {busy && <LoaderCircle size={14} className="spin" />}
            {getPlatform().kind === 'electron' ? 'Choose location and create' : 'Create vault'}
          </button>
        </>
      }
    >
      <div className="form">
        <Field label="Vault name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
        <Field
          label="Master password"
          hint={
            <span className="master-hint">
              <StrengthMeter password={password} />
              {!password && <span>The one password you will need to remember. A few random words work best.</span>}
            </span>
          }
        >
          <SecretInput value={password} onChange={(v) => (setPassword(v), setSuggested(null))} mono={false} />
        </Field>
        <div>
          <button type="button" className="link-btn" onClick={suggest}>
            <Sparkles size={14} /> Suggest a passphrase
          </button>
        </div>
        {suggested && (
          <div className="notice">
            <span>
              Write this down and keep it somewhere safe: <strong className="mono selectable">{suggested}</strong>
            </span>
          </div>
        )}
        <Field label="Type it again" hint={confirm && problem ? <span className="text-danger">{problem}</span> : undefined}>
          <SecretInput value={confirm} onChange={setConfirm} mono={false} />
        </Field>
        <label className="check notice warning">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
          <span>I understand that nobody, not even Kipas, can recover a forgotten master password.</span>
        </label>
      </div>
    </Dialog>
  );
}
