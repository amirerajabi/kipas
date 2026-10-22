import { FileKey, FileLock2, LoaderCircle, X } from 'lucide-react';
import { useState } from 'react';
import { pluralize } from '../../lib/format';
import { getPlatform } from '../../platform';
import { useList } from '../../store/list';
import { useUi } from '../../store/ui';
import { useVault } from '../../store/vault';
import { KdbxFormatError, KdbxKeyError } from '../../vault/keepass/kdbx';
import { importKeePass } from '../../vault/keepass/import';
import { Dialog, Field } from '../common/Dialog';
import { SecretInput } from '../common/SecretInput';

interface Picked {
  name: string;
  bytes: Uint8Array;
}

/** Import a KeePass database (.kdbx): pick the file, give its master password and key file, and everything moves over. */
export function KeePassImportDialog() {
  const open = useUi((s) => s.keepassImportOpen);
  if (!open) return null;
  return <ImportKeePass />;
}

function ImportKeePass() {
  const [db, setDb] = useState<Picked | null>(null);
  const [keyFile, setKeyFile] = useState<Picked | null>(null);
  const [password, setPassword] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null;
  const close = () => !busy && useUi.getState().set({ keepassImportOpen: false });

  const pickDb = async () => {
    const f = await getPlatform().openBinaryFile([{ name: 'KeePass database', extensions: ['kdbx'] }]);
    if (f) {
      setDb(f);
      setError(null);
    }
  };
  const pickKey = async () => {
    const f = await getPlatform().openBinaryFile([]);
    if (f) setKeyFile(f);
  };

  const run = async () => {
    const data = useVault.getState().data;
    if (!db || !data || busy || (!password && !keyFile)) return;
    setError(null);
    setProgress(0);
    try {
      const r = await importKeePass(db.bytes, { password, keyFile: keyFile?.bytes }, data, async (f) => {
        setProgress(f);
        // Give the window a moment to repaint between rounds of the (deliberately slow) key derivation.
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      if (!r.entries.length) throw new Error('The database has no entries.');
      useVault.getState().importEntries(r.entries, r.groups);
      useList.getState().setFilter({ kind: 'all' });
      const trashed = r.entries.filter((e) => e.trashed).length;
      useUi.getState().set({ keepassImportOpen: false });
      useUi.getState().toast({
        level: 'success',
        text: `Imported ${pluralize(r.entries.length - trashed, 'item')} from ${r.name}`,
        detail: [
          r.groups.length ? `${pluralize(r.groups.length, 'new group')}` : '',
          trashed ? `${trashed} from the recycle bin went to the trash` : '',
          r.attachmentsSkipped ? `${pluralize(r.attachmentsSkipped, 'attachment')} not imported (Kipas has no attachments yet)` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      });
    } catch (e) {
      setProgress(null);
      setError(
        e instanceof KdbxKeyError
          ? 'That password or key file does not open this database. Check Caps Lock, and whether the database also needs a key file.'
          : e instanceof KdbxFormatError
            ? e.message
            : `Could not import: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };

  return (
    <Dialog
      title="Import from KeePass"
      icon={<FileLock2 size={18} className="text-accent" />}
      width={500}
      onClose={close}
      onSubmit={() => void run()}
      footer={
        <>
          <button className="btn" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void run()} disabled={!db || busy || (!password && !keyFile)}>
            {busy && <LoaderCircle size={14} className="spin" />}
            {busy ? 'Unlocking…' : 'Import'}
          </button>
        </>
      }
    >
      <div className="form">
        <p className="muted import-intro">
          Brings in every entry, group, custom field, two-factor secret and password history from a KeePass, KeePassXC, KeeWeb or Strongbox database (.kdbx). The
          database itself is not changed.
        </p>
        <Field label="Database">
          <span className="input-with-btn">
            <span className={`input file-pick${db ? '' : ' muted'}`}>{db ? db.name : 'No file chosen'}</span>
            <button className="btn" onClick={() => void pickDb()} disabled={busy}>
              Choose…
            </button>
          </span>
        </Field>
        <Field label="Master password">
          <SecretInput value={password} onChange={setPassword} mono={false} disabled={busy} autoFocus />
        </Field>
        <Field label="Key file (only if the database uses one)">
          <span className="input-with-btn">
            <span className={`input file-pick${keyFile ? '' : ' muted'}`}>
              {keyFile ? (
                <>
                  <FileKey size={14} /> {keyFile.name}
                </>
              ) : (
                'None'
              )}
            </span>
            {keyFile && (
              <button className="icon-btn sm" title="Remove the key file" aria-label="Remove the key file" onClick={() => setKeyFile(null)} disabled={busy}>
                <X size={14} />
              </button>
            )}
            <button className="btn" onClick={() => void pickKey()} disabled={busy}>
              Choose…
            </button>
          </span>
        </Field>
        {busy && (
          <div className="import-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div className="import-progress-bar">
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <span className="muted">Unlocking the database… KeePass makes this slow on purpose, so guessing passwords is slow too.</span>
          </div>
        )}
        {error && (
          <div className="notice warning" role="alert">
            {error}
          </div>
        )}
      </div>
    </Dialog>
  );
}
