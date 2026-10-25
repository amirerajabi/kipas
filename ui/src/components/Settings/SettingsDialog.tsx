import { Database, Download, FileLock2, FolderOpen, Info, KeyRound, LoaderCircle, Lock, RefreshCw, Settings, ShieldCheck, SlidersHorizontal, Upload } from 'lucide-react';
import type { ReactNode } from 'react';
import { exportToCsv, importFromCsv } from '../../app/actions';
import { runCommand } from '../../app/commands';
import { formatDate } from '../../lib/format';
import { getPlatform } from '../../platform';
import { useSettings, type Settings as SettingsT } from '../../store/settings';
import { useUi, type SettingsSection } from '../../store/ui';
import { useUpdates } from '../../store/updates';
import { useVault } from '../../store/vault';
import { DEFAULT_ITERATIONS } from '../../vault/crypto';
import { Dialog, Field } from '../common/Dialog';
import { SequenceInput } from '../common/SequenceInput';
import { BrandMark } from '../common/visuals';
import { DEFAULT_AUTOTYPE } from '../../vault/autotype';

const SECTIONS: { id: SettingsSection; label: string; Icon: typeof Settings }[] = [
  { id: 'general', label: 'General', Icon: SlidersHorizontal },
  { id: 'security', label: 'Security', Icon: ShieldCheck },
  { id: 'data', label: 'Import & export', Icon: Database },
  { id: 'updates', label: 'Updates', Icon: RefreshCw },
  { id: 'about', label: 'About', Icon: Info },
];

export function SettingsDialog() {
  const section = useUi((s) => s.settingsOpen);
  if (!section) return null;
  const close = () => useUi.getState().set({ settingsOpen: null });
  return (
    <Dialog title="Settings" icon={<Settings size={18} className="text-accent" />} width={720} className="settings-dialog" onClose={close} footer={<button className="btn btn-primary" onClick={close}>Done</button>}>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Sections">
          {SECTIONS.map((s) => (
            <button key={s.id} className={`nav-item${section === s.id ? ' active' : ''}`} onClick={() => useUi.getState().set({ settingsOpen: s.id })}>
              <s.Icon size={16} />
              {s.label}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {section === 'general' && <General />}
          {section === 'security' && <Security />}
          {section === 'data' && <Data />}
          {section === 'updates' && <Updates />}
          {section === 'about' && <About />}
        </div>
      </div>
    </Dialog>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: ReactNode }) {
  return (
    <label className="toggle-row">
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="toggle-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </span>
    </label>
  );
}

function useS(): [SettingsT, (p: Partial<SettingsT>) => void] {
  return [useSettings((s) => s.settings), useSettings.getState().update];
}

function General() {
  const [s, save] = useS();
  return (
    <>
      <div className="settings-section">
        <h3>Appearance</h3>
        <Field label="Theme">
          <div className="segmented">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button key={t} className={s.theme === t ? 'on' : ''} aria-pressed={s.theme === t} onClick={() => save({ theme: t })}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="settings-section">
        <h3>Auto-type</h3>
        <Field
          label="Default sequence"
          hint={
            <>
              Ctrl+V on an item types this into the window you were in before Kipas. Each item can have its own (Edit → Auto-type).
              {s.autoTypeSequence !== DEFAULT_AUTOTYPE && (
                <>
                  {' '}
                  <button type="button" className="link-btn" onClick={() => save({ autoTypeSequence: DEFAULT_AUTOTYPE })}>
                    Reset
                  </button>
                </>
              )}
              {getPlatform().os !== 'win32' && ' Works in the Windows app for now.'}
            </>
          }
        >
          <SequenceInput value={s.autoTypeSequence} onChange={(v) => save({ autoTypeSequence: v })} />
        </Field>
      </div>
      <div className="settings-section">
        <h3>Quick access</h3>
        <Toggle
          checked={s.quickAccess}
          onChange={(v) => save({ quickAccess: v })}
          label={`Open a search over any app with ${getPlatform().os === 'darwin' ? 'Cmd' : 'Ctrl'}+Shift+Space`}
          hint={getPlatform().kind === 'electron' ? 'Type, press Enter, and the password is on the clipboard. Works while the vault is unlocked.' : 'Needs the desktop app.'}
        />
      </div>
      <div className="settings-section">
        <h3>Clipboard</h3>
        <Field label="Clear copied secrets after" hint="Only if the clipboard still holds the secret, so your own copies are left alone.">
          <select className="input select narrow" value={s.clipboardSeconds} onChange={(e) => save({ clipboardSeconds: Number(e.target.value) })}>
            {[10, 20, 30, 60, 120, 0].map((n) => (
              <option key={n} value={n}>
                {n ? `${n} seconds` : 'Never'}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </>
  );
}

function Security() {
  const [s, save] = useS();
  const unlocked = useVault((v) => !!v.data);
  const electron = getPlatform().kind === 'electron';
  return (
    <>
      <div className="settings-section">
        <h3>Locking</h3>
        <Field label="Lock after being idle for">
          <select className="input select narrow" value={s.autoLockMinutes} onChange={(e) => save({ autoLockMinutes: Number(e.target.value) })}>
            {[1, 2, 5, 10, 15, 30, 60, 0].map((n) => (
              <option key={n} value={n}>
                {n ? `${n} minute${n === 1 ? '' : 's'}` : 'Never'}
              </option>
            ))}
          </select>
        </Field>
        <Toggle checked={s.lockOnSystemLock} onChange={(v) => save({ lockOnSystemLock: v })} label="Lock when the computer locks or sleeps" hint={electron ? undefined : 'Needs the desktop app.'} />
        <Toggle checked={s.lockOnMinimize} onChange={(v) => save({ lockOnMinimize: v })} label="Lock when the window is minimized" hint={electron ? undefined : 'Needs the desktop app.'} />
      </div>
      <div className="settings-section">
        <h3>Master password</h3>
        <div className="info-card">
          <KeyRound size={18} className="text-accent" />
          <div className="flex-1">
            <strong>Change the master password</strong>
            <p className="muted">The vault is encrypted again with a key made from the new password.</p>
          </div>
          <button className="btn" disabled={!unlocked} onClick={() => runCommand('vault.changePassword')}>
            Change…
          </button>
        </div>
      </div>
      <div className="settings-section">
        <h3>Encryption</h3>
        <p className="muted">
          AES-256-GCM with a key from PBKDF2-SHA256 ({DEFAULT_ITERATIONS.toLocaleString()} rounds) and a random salt. Every save uses a fresh nonce, and the file header is
          authenticated, so a tampered file does not open. Copied secrets are wiped from the clipboard, and the vault locks itself when you step away.
        </p>
      </div>
    </>
  );
}

function Data() {
  const data = useVault((v) => v.data);
  const path = useVault((v) => v.path);
  return (
    <>
      <div className="settings-section">
        <h3>This vault</h3>
        {data && path ? (
          <dl className="kv">
            <dt>Name</dt>
            <dd>{data.name}</dd>
            <dt>File</dt>
            <dd className="selectable mono-sm">{path}</dd>
            <dt>Items</dt>
            <dd>{data.entries.filter((e) => !e.trashed).length}</dd>
            <dt>Created</dt>
            <dd>{formatDate(data.created)}</dd>
          </dl>
        ) : (
          <p className="muted">Unlock a vault to import or export.</p>
        )}
        {data && getPlatform().kind === 'electron' && (
          <button className="btn" onClick={() => runCommand('vault.reveal')}>
            <FolderOpen size={14} /> Show the file
          </button>
        )}
        <p className="muted">Back up by copying the .kipas file anywhere: it is encrypted. Kipas also keeps the previous version next to it as .kipas.bak.</p>
      </div>
      <div className="settings-section">
        <h3>Move passwords in or out</h3>
        <div className="info-card">
          <FileLock2 size={18} className="text-accent" />
          <div className="flex-1">
            <strong>Import from KeePass</strong>
            <p className="muted">Open a .kdbx database from KeePass, KeePassXC, KeeWeb or Strongbox directly, with its password and key file.</p>
          </div>
          <button className="btn" disabled={!data} onClick={() => runCommand('vault.importKeePass')}>
            Import…
          </button>
        </div>
        <div className="info-card">
          <Download size={18} className="text-accent" />
          <div className="flex-1">
            <strong>Import from CSV</strong>
            <p className="muted">From KeePass, KeePassXC, Bitwarden, 1Password, LastPass, Chrome, Edge or Firefox. Export a CSV there, then pick it here.</p>
          </div>
          <button className="btn" disabled={!data} onClick={() => void importFromCsv()}>
            Import…
          </button>
        </div>
        <div className="info-card">
          <Upload size={18} className="text-warning" />
          <div className="flex-1">
            <strong>Export to CSV</strong>
            <p className="muted">A plain-text file in KeePassXC's layout. Anyone who opens it can read your passwords.</p>
          </div>
          <button className="btn" disabled={!data} onClick={() => void exportToCsv()}>
            Export…
          </button>
        </div>
      </div>
    </>
  );
}

const UPDATE_TEXT: Partial<Record<string, string>> = {
  idle: 'Checks GitHub Releases for new versions.',
  checking: 'Checking for updates…',
  'up-to-date': 'You have the latest version.',
  error: 'The last check failed.',
};

function Updates() {
  const [s, save] = useS();
  const status = useUpdates((u) => u.status);
  const manual = useUpdates((u) => u.manual);
  const busy = manual || status?.state === 'checking';
  let text = status ? (UPDATE_TEXT[status.state] ?? '') : '';
  if (status?.state === 'downloading') text = `Downloading Kipas ${status.version}: ${status.percent ?? 0}%`;
  if (status?.state === 'ready') text = `Kipas ${status.version} is downloaded. Restart to install it, or it installs when you quit.`;
  if (status?.state === 'available') text = `Kipas ${status.version} is available. macOS only updates signed apps in place, so download it from the release page.`;
  if (status?.state === 'disabled') text = status.message ?? 'Updates are not available in this build.';
  return (
    <div className="settings-section">
      <h3>Updates</h3>
      {!status ? (
        <p className="muted">Updates are part of the desktop app.</p>
      ) : (
        <>
          <div className="info-card">
            <RefreshCw size={18} className="text-accent" />
            <div className="flex-1">
              <strong>Kipas {status.currentVersion}</strong>
              <p className={`muted${status.state === 'error' ? ' text-danger' : ''}`}>
                {text}
                {status.state === 'error' && status.message ? ` ${status.message}` : ''}
              </p>
            </div>
          </div>
          <div className="input-with-btn">
            {status.state === 'ready' || status.state === 'available' ? (
              <button className="btn btn-primary" onClick={() => void useUpdates.getState().install()}>
                {status.state === 'ready' ? 'Restart and update' : 'Open the release page'}
              </button>
            ) : (
              <button className="btn" disabled={busy || status.state === 'disabled' || status.state === 'downloading'} onClick={() => void useUpdates.getState().check()}>
                {busy ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />} Check for updates
              </button>
            )}
          </div>
          <Toggle
            label="Check for updates automatically"
            hint="At start and every 6 hours. Only the version number is fetched from GitHub; your vault never leaves this device."
            checked={s.autoUpdate}
            onChange={(v) => save({ autoUpdate: v })}
          />
        </>
      )}
    </div>
  );
}

function About() {
  const version = getPlatform().appVersion;
  return (
    <div className="settings-section about">
      <BrandMark size={44} />
      <h3>Kipas {version && <span className="muted">{version}</span>}</h3>
      <p className="muted">A friendly, offline password manager in the spirit of KeePass.</p>
      <ul className="about-list">
        <li>
          <Lock size={14} /> Your vault is one encrypted file. No account, no cloud, no tracking.
        </li>
        <li>
          <ShieldCheck size={14} /> AES-256-GCM and PBKDF2-SHA256, from the platform's own Web Crypto.
        </li>
        <li>
          <Database size={14} /> Sync it with any folder sync (OneDrive, Dropbox, Syncthing) if you like.
        </li>
      </ul>
    </div>
  );
}
