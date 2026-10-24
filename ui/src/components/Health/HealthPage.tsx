import { CalendarClock, ChevronRight, Copy, ShieldAlert, ShieldOff } from 'lucide-react';
import { healthOf, useList } from '../../store/list';
import { useUi } from '../../store/ui';
import { useVault } from '../../store/vault';
import { HEALTH_LABEL, type HealthIssue } from '../../vault/health';
import type { Entry } from '../../vault/model';
import { Avatar } from '../common/visuals';

const ISSUES: { id: HealthIssue; Icon: typeof Copy; tone: 'danger' | 'warning' | 'muted'; help: string }[] = [
  { id: 'weak', Icon: ShieldAlert, tone: 'danger', help: 'Easy to guess. Replace them with generated passwords.' },
  { id: 'reused', Icon: Copy, tone: 'danger', help: 'One leak opens every site that shares the password.' },
  { id: 'old', Icon: CalendarClock, tone: 'warning', help: 'Not changed for more than a year.' },
  { id: 'no2fa', Icon: ShieldOff, tone: 'muted', help: 'Websites without a one-time code saved. Turn on two-factor where the site offers it.' },
];

/** Password health as a page: the score, then one card per kind of problem with the items it affects. */
export function HealthPage() {
  const data = useVault((s) => s.data);
  if (!data) return null;
  const report = healthOf(data.entries);
  const byId = new Map(data.entries.map((e) => [e.id, e]));
  const tone = report.score >= 80 ? 'good' : report.score >= 50 ? 'fair' : 'poor';
  const show = (id: HealthIssue, entry?: Entry) => {
    useList.getState().setFilter({ kind: 'health', id });
    if (entry) useList.getState().select([entry.id]);
    useUi.getState().set({ view: 'items' });
  };

  return (
    <section className="health-page" aria-label="Password health">
      <div className="health-hero">
        <div className={`health-ring tone-${tone}`} style={{ ['--score' as string]: report.score }}>
          <span>{report.score}</span>
        </div>
        <div className="health-hero-text">
          <h1>{tone === 'good' ? 'Looking good' : tone === 'fair' ? 'Room to improve' : 'Needs attention'}</h1>
          <p className="muted">Vault health score. Weak and reused passwords count most. Checked on this device; nothing is sent anywhere.</p>
        </div>
      </div>
      <div className="health-grid">
        {ISSUES.map((i) => {
          const ids = [...report[i.id]];
          const entries = ids.map((id) => byId.get(id)).filter((e): e is Entry => !!e);
          return (
            <div key={i.id} className={`health-card tone-${ids.length ? i.tone : 'ok'}`}>
              <div className="health-card-head">
                <i.Icon size={18} />
                <strong className="flex-1">{HEALTH_LABEL[i.id]}</strong>
                <span className="health-card-count">{ids.length}</span>
              </div>
              <p className="muted">{ids.length ? i.help : 'Nothing to do here.'}</p>
              {entries.length > 0 && (
                <div className="health-card-list">
                  {entries.slice(0, 4).map((e) => (
                    <button key={e.id} className="health-card-item" onClick={() => show(i.id, e)}>
                      <Avatar entry={e} size={24} />
                      <span className="ellipsis flex-1">{e.title || 'Untitled'}</span>
                      <ChevronRight size={14} className="muted" />
                    </button>
                  ))}
                  {entries.length > 4 && (
                    <button className="link-btn" onClick={() => show(i.id)}>
                      Show all {entries.length}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
