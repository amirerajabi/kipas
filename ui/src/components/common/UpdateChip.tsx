import { ArrowDownCircle, CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react';
import { useUi } from '../../store/ui';
import { updateChip, useUpdates } from '../../store/updates';

/** The update state: checking, download progress, "Restart to update", or a quiet mark after a failed check. */
export function UpdateChip() {
  const status = useUpdates((s) => s.status);
  const chip = updateChip(status);
  if (!status || !chip) return null;
  const ready = status.state === 'ready';
  const error = status.state === 'error';
  const Icon = status.state === 'checking' ? LoaderCircle : ready ? RefreshCw : error ? CircleAlert : ArrowDownCircle;
  return (
    <button
      className={`update-chip tone-${chip.tone}`}
      title={ready ? `${chip.text}. Click to restart now.` : error ? `${chip.text}: ${status.message ?? ''}` : chip.text}
      aria-label={chip.text}
      onClick={() => (ready || status.state === 'available' ? void useUpdates.getState().install() : useUi.getState().set({ settingsOpen: 'updates' }))}
    >
      <Icon size={13} className={status.state === 'checking' ? 'spin' : undefined} />
      {/* a failed check is a quiet mark only: an offline machine should not carry a red label all day */}
      {!error && <span className="ellipsis">{chip.text}</span>}
      {status.state === 'downloading' && (
        <span className="update-chip-bar" aria-hidden="true">
          <span className="update-chip-fill" style={{ width: `${status.percent ?? 0}%` }} />
        </span>
      )}
    </button>
  );
}
