import { ArrowDownCircle, CircleAlert, ClipboardCheck, Clock, Cloud, HardDrive, LoaderCircle, Lock, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { autoLockIn } from '../../app/boot';
import { formatAge, formatCountdown, pluralize } from '../../lib/format';
import { BROWSER_PREFIX } from '../../platform';
import { useList, visibleEntries } from '../../store/list';
import { useUi } from '../../store/ui';
import { updateChip, useUpdates } from '../../store/updates';
import { useVault } from '../../store/vault';

/** Vault file, item counts, save state, clipboard countdown and the auto-lock timer. */
export function StatusBar() {
  const data = useVault((s) => s.data);
  const path = useVault((s) => s.path);
  const save = useVault((s) => s.save);
  const saveError = useVault((s) => s.saveError);
  const lastSaved = useVault((s) => s.lastSaved);
  const clipboard = useUi((s) => s.clipboard);
  const list = useList();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!data || !path) {
    return (
      <footer className="statusbar" aria-label="Status bar">
        <span className="sb-item">
          <Lock size={12} /> Locked
        </span>
        <div className="flex-1" />
        <UpdateChip />
      </footer>
    );
  }

  const shown = visibleEntries(data, list).length;
  const total = data.entries.filter((e) => !e.trashed).length;
  const lockIn = autoLockIn(now);
  const browser = path.startsWith(BROWSER_PREFIX);

  return (
    <footer className="statusbar" aria-label="Status bar">
      <span className="sb-item" title={browser ? 'Stored in this browser (development mode)' : path}>
        {browser ? <Cloud size={12} /> : <HardDrive size={12} />}
        <span className="ellipsis sb-path">{browser ? path.slice(BROWSER_PREFIX.length) : path}</span>
      </span>
      <span className="sb-item muted">{shown === total ? pluralize(total, 'item') : `${shown} of ${pluralize(total, 'item')}`}</span>
      {list.selected.length > 1 && <span className="sb-item muted">{list.selected.length} selected</span>}
      <div className="flex-1" />
      {clipboard && (
        <span className="sb-item sb-clip" title="Copied secrets are wiped from the clipboard">
          <ClipboardCheck size={12} />
          {clipboard.clearsAt ? `${clipboard.label} on clipboard · clears in ${Math.max(0, Math.ceil((clipboard.clearsAt - now) / 1000))}s` : `${clipboard.label} on clipboard`}
        </span>
      )}
      <span className={`sb-item${save === 'error' ? ' text-danger' : ' muted'}`} title={save === 'error' ? (saveError ?? '') : lastSaved ? `Saved ${new Date(lastSaved).toLocaleTimeString()}` : 'Encrypted on disk'}>
        {save === 'saving' ? <LoaderCircle size={12} className="spin" /> : save === 'error' ? <CircleAlert size={12} /> : <Lock size={12} />}
        {save === 'saving' ? 'Saving…' : save === 'error' ? 'Not saved' : lastSaved ? `Saved ${formatAge(lastSaved, now)}` : 'Encrypted'}
      </span>
      <UpdateChip />
      {lockIn !== null && (
        <span className={`sb-item${lockIn < 60_000 ? ' sb-warn' : ' muted'}`} title="Locks when you are away; any key or mouse move resets it">
          <Clock size={12} />
          Locks in {lockIn < 60_000 ? formatCountdown(lockIn) : `${Math.ceil(lockIn / 60_000)} min`}
        </span>
      )}
    </footer>
  );
}

/** The update state at the right of the status bar: checking, download progress, "Restart to update", or a quiet mark. */
function UpdateChip() {
  const status = useUpdates((s) => s.status);
  const chip = updateChip(status);
  if (!status || !chip) return null;
  const ready = status.state === 'ready';
  const error = status.state === 'error';
  const Icon = status.state === 'checking' ? LoaderCircle : ready ? RefreshCw : error ? CircleAlert : ArrowDownCircle;
  return (
    <button
      className={`sb-item sb-button sb-update tone-${chip.tone}`}
      title={ready ? `${chip.text}. Click to restart now.` : error ? `${chip.text}: ${status.message ?? ''}` : chip.text}
      aria-label={chip.text}
      onClick={() => (ready || status.state === 'available' ? void useUpdates.getState().install() : useUi.getState().set({ settingsOpen: 'updates' }))}
    >
      <Icon size={12} className={status.state === 'checking' ? 'spin' : undefined} />
      {/* a failed check is a quiet mark only: an offline machine should not carry a red label all day */}
      {!error && <span>{chip.text}</span>}
      {status.state === 'downloading' && (
        <span className="sb-update-bar" aria-hidden="true">
          <span className="sb-update-fill" style={{ width: `${status.percent ?? 0}%` }} />
        </span>
      )}
    </button>
  );
}
