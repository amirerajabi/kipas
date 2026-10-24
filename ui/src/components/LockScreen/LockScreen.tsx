import { ArrowRight, FilePlus2, FileWarning, FolderOpen, Lock, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createVault, openVaultFile } from '../../app/actions';
import { formatAge } from '../../lib/format';
import { BROWSER_PREFIX, getPlatform } from '../../platform';
import { useVault, type RecentVault } from '../../store/vault';
import { VaultFormatError, WrongPasswordError } from '../../vault/crypto';
import { SecretInput } from '../common/SecretInput';
import { UpdateChip } from '../common/UpdateChip';
import { BrandMark } from '../common/visuals';

/** What you see while locked: unlock the last vault, pick another recent one, open a file or create a vault. */
export function LockScreen() {
  const recent = useVault((s) => s.recent);
  const [path, setPath] = useState<string | null>(recent[0]?.path ?? null);
  useEffect(() => {
    // A vault opened from the menu jumps to the top of the list; follow it.
    setPath(recent[0]?.path ?? null);
  }, [recent]);
  const chosen = recent.find((r) => r.path === path) ?? null;

  return (
    <div className="lock-screen">
      <div className="lock-card">
        <div className="lock-brand">
          <BrandMark size={40} />
        </div>
        {chosen ? <Unlock vault={chosen} /> : <Welcome />}
        {recent.length > (chosen ? 1 : 0) && (
          <div className="lock-recent">
            <div className="lock-recent-title muted">{chosen ? 'Other vaults' : 'Recent vaults'}</div>
            {recent
              .filter((r) => r.path !== path)
              .map((r) => (
                <div key={r.path} className="lock-recent-row">
                  <button className="lock-recent-btn" onClick={() => setPath(r.path)} title={displayPath(r.path)}>
                    <Lock size={14} />
                    <span className="ellipsis">{r.name}</span>
                    <span className="muted lock-recent-when">{formatAge(r.opened)}</span>
                  </button>
                  <button className="icon-btn xs" title="Remove from this list (the file stays)" aria-label={`Remove ${r.name} from the list`} onClick={() => useVault.getState().forgetRecent(r.path)}>
                    <X size={12} />
                  </button>
                </div>
              ))}
          </div>
        )}
        {chosen && (
          <div className="lock-links">
            <button className="link-btn" onClick={() => void openVaultFile()}>
              <FolderOpen size={14} /> Open another vault
            </button>
            <button className="link-btn" onClick={() => void createVault()}>
              <FilePlus2 size={14} /> Create a new vault
            </button>
          </div>
        )}
      </div>
      <div className="lock-footer muted">
        <ShieldCheck size={13} /> AES-256 encrypted · stored only on this device
      </div>
      <UpdateChip />
    </div>
  );
}

function displayPath(path: string): string {
  return path.startsWith(BROWSER_PREFIX) ? `Browser storage: ${path.slice(BROWSER_PREFIX.length)}` : path;
}

function Welcome() {
  return (
    <div className="lock-welcome">
      <h1>Welcome to Kipas</h1>
      <p className="muted">One strong master password protects all the others. Your vault is an encrypted file on this device, and nothing is ever sent anywhere.</p>
      <div className="lock-actions">
        <button className="btn btn-primary btn-lg" onClick={() => void createVault()}>
          <FilePlus2 size={16} /> Create a new vault
        </button>
        <button className="btn btn-lg" onClick={() => void openVaultFile()}>
          <FolderOpen size={16} /> Open a vault file
        </button>
      </div>
    </div>
  );
}

function Unlock({ vault }: { vault: RecentVault }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [caps, setCaps] = useState(false);
  const [missing, setMissing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPassword('');
    setError(null);
    setMissing(false);
    void getPlatform()
      .statVault(vault.path)
      .then((s) => setMissing(!s))
      .catch(() => setMissing(true));
    ref.current?.querySelector('input')?.focus();
  }, [vault.path]);

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await useVault.getState().unlock(vault.path, password);
    } catch (e) {
      setError(e instanceof WrongPasswordError ? 'That password did not unlock the vault. Check Caps Lock and try again.' : e instanceof VaultFormatError ? e.message : `Could not open the vault: ${e instanceof Error ? e.message : String(e)}`);
      setPassword('');
      setBusy(false);
      setTimeout(() => ref.current?.querySelector('input')?.focus(), 0);
    }
  };

  return (
    <div className="lock-unlock" ref={ref}>
      <h1 className="ellipsis">{vault.name}</h1>
      <p className="muted lock-path ellipsis" title={displayPath(vault.path)}>
        {displayPath(vault.path)}
      </p>
      {missing ? (
        <div className="notice warning">
          <FileWarning size={16} /> The file is not there any more. It may have been moved or deleted.
          <button className="link-btn" onClick={() => useVault.getState().forgetRecent(vault.path)}>
            Remove from the list
          </button>
        </div>
      ) : (
        <form
          className="lock-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <SecretInput
            value={password}
            onChange={setPassword}
            placeholder="Master password"
            aria-label="Master password"
            disabled={busy}
            mono={false}
            className={error ? 'invalid' : ''}
            onKeyUp={(e) => setCaps(e.getModifierState('CapsLock'))}
          />
          <button className="btn btn-primary btn-lg" type="submit" disabled={!password || busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
        </form>
      )}
      {caps && !missing && <div className="lock-hint text-warning">Caps Lock is on.</div>}
      {error && (
        <div className="lock-hint text-danger" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
