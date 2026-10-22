import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useUi } from '../../store/ui';
import { useVault } from '../../store/vault';
import { WrongPasswordError } from '../../vault/crypto';
import { Dialog, Field } from '../common/Dialog';
import { SecretInput } from '../common/SecretInput';
import { StrengthMeter } from '../common/visuals';
import { masterProblem } from '../LockScreen/CreateVaultDialog';

/** Re-encrypts the vault under a new master password (and a new salt). */
export function ChangePasswordDialog() {
  const open = useUi((s) => s.changePasswordOpen);
  if (!open) return null;
  return <Change />;
}

function Change() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const problem = masterProblem(next, confirm) ?? (next === current ? 'Choose a password different from the current one.' : null);
  const close = () => useUi.getState().set({ changePasswordOpen: false });

  const save = async () => {
    if (!current || problem || busy) return;
    setBusy(true);
    setError(null);
    try {
      await useVault.getState().changePassword(current, next);
      close();
      useUi.getState().toast({ level: 'success', text: 'Master password changed', detail: 'Use the new one the next time you unlock.' });
    } catch (e) {
      setError(e instanceof WrongPasswordError ? 'The current master password is not right.' : e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Change master password"
      icon={<ShieldCheck size={18} className="text-accent" />}
      width={460}
      onClose={close}
      onSubmit={() => void save()}
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={!current || !!problem || busy}>
            {busy && <LoaderCircle size={14} className="spin" />} Change password
          </button>
        </>
      }
    >
      <div className="form">
        <Field label="Current master password" hint={error ? <span className="text-danger">{error}</span> : undefined}>
          <SecretInput value={current} onChange={setCurrent} mono={false} />
        </Field>
        <Field label="New master password" hint={<StrengthMeter password={next} />}>
          <SecretInput value={next} onChange={setNext} mono={false} />
        </Field>
        <Field label="Type the new one again" hint={confirm && problem ? <span className="text-danger">{problem}</span> : undefined}>
          <SecretInput value={confirm} onChange={setConfirm} mono={false} />
        </Field>
      </div>
    </Dialog>
  );
}
