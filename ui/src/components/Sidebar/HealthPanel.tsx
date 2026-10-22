import { CalendarClock, Copy, ShieldAlert, ShieldOff } from 'lucide-react';
import { healthOf, useList, type Filter } from '../../store/list';
import { useVault } from '../../store/vault';
import { HEALTH_LABEL, type HealthIssue } from '../../vault/health';
import { TreeRow } from './VaultPanel';

const ISSUES: { id: HealthIssue; Icon: typeof Copy; tone: string; help: string }[] = [
  { id: 'weak', Icon: ShieldAlert, tone: 'text-danger', help: 'Easy to guess. Replace them with generated ones.' },
  { id: 'reused', Icon: Copy, tone: 'text-danger', help: 'One leak opens every site that shares the password.' },
  { id: 'old', Icon: CalendarClock, tone: 'text-warning', help: 'Not changed for more than a year.' },
  { id: 'no2fa', Icon: ShieldOff, tone: 'text-muted', help: 'Websites without a one-time code saved. Turn on two-factor where the site offers it.' },
];

/** Password health: a score and the entries that need attention. Computed on this device only. */
export function HealthPanel() {
  const data = useVault((s) => s.data);
  const filter = useList((s) => s.filter);
  if (!data) return null;
  const report = healthOf(data.entries);
  const tone = report.score >= 80 ? 'good' : report.score >= 50 ? 'fair' : 'poor';
  const selected = (f: Filter) => filter.kind === f.kind && (filter as { id?: string }).id === (f as { id?: string }).id;

  return (
    <div className="health">
      <div className={`health-score tone-${tone}`}>
        <div className="health-score-value">{report.score}</div>
        <div className="health-score-text">
          <strong>{tone === 'good' ? 'Looking good' : tone === 'fair' ? 'Room to improve' : 'Needs attention'}</strong>
          <span className="muted">Vault health score</span>
        </div>
      </div>
      <div className="tree" role="tree" aria-label="Health">
        {ISSUES.map((i) => (
          <div key={i.id} className="health-item">
            <TreeRow
              depth={0}
              icon={<i.Icon size={16} className={report[i.id].size ? i.tone : 'muted'} />}
              label={HEALTH_LABEL[i.id]}
              count={report[i.id].size}
              selected={selected({ kind: 'health', id: i.id })}
              onClick={() => useList.getState().setFilter({ kind: 'health', id: i.id })}
            />
            <div className="health-help muted">{i.help}</div>
          </div>
        ))}
      </div>
      <div className="panel-note">Checked on this device. Nothing is sent anywhere.</div>
    </div>
  );
}
