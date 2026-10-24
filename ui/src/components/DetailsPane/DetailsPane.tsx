import { ArchiveRestore, ChevronDown, ChevronRight, Eye, EyeOff, History, MoreHorizontal, MousePointerClick, Pencil, SquareArrowOutUpRight, Star, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { copyText, deleteEntries, editEntry, openUrl, selectedEntries } from '../../app/actions';
import { runCommand } from '../../app/commands';
import { formatAge, formatDate } from '../../lib/format';
import { healthOf, useList } from '../../store/list';
import { useUi } from '../../store/ui';
import { useVault } from '../../store/vault';
import type { HealthIssue } from '../../vault/health';
import { hostOf, KIND_LABEL, openableUrl, type Entry } from '../../vault/model';
import { groupCode, parseTotp, totpNow, type TotpSpec } from '../../vault/totp';
import { Avatar, CountdownRing, StrengthMeter } from '../common/visuals';
import { entryMenu } from '../EntryList/contextMenu';

/** The right column: the selected item, read-only, with a Copy button on every field. Secrets stay masked until you ask. */
export function DetailsPane() {
  const data = useVault((s) => s.data);
  const selected = useList((s) => s.selected);
  const entry = useMemo(() => (selected.length === 1 ? data?.entries.find((e) => e.id === selected[0]) : undefined), [data, selected]);

  // Revealed secrets are forgotten when you move to another item.
  useEffect(() => {
    useUi.getState().set({ revealed: new Set() });
  }, [entry?.id]);

  if (selected.length > 1) {
    return (
      <aside className="details" aria-label="Details">
        <div className="details-empty">
          <strong>{selected.length} items selected</strong>
          <span className="muted">Drag them onto a group to move them, or:</span>
          <div className="empty-actions">
            <button className="btn" onClick={() => runCommand('entry.favorite')}>
              <Star size={14} /> Favorite
            </button>
            <button className="btn btn-danger" onClick={() => void deleteEntries(selectedEntries().map((e) => e.id))}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>
      </aside>
    );
  }
  if (!entry || !data) {
    return (
      <aside className="details" aria-label="Details">
        <div className="details-empty muted">
          <MousePointerClick size={26} />
          <span>Select an item to see its details.</span>
        </div>
      </aside>
    );
  }
  return <EntryDetails entry={entry} groupName={data.groups.find((g) => g.id === entry.groupId)?.name} issues={issuesOf(entry, data.entries)} />;
}

const ISSUE_TEXT: Record<HealthIssue, string> = { weak: 'Weak password', reused: 'Reused password', old: 'Password older than a year', no2fa: 'No two-factor' };

function issuesOf(entry: Entry, entries: Entry[]): HealthIssue[] {
  const r = healthOf(entries);
  return (['weak', 'reused', 'old'] as const).filter((k) => r[k].has(entry.id));
}

function EntryDetails({ entry, groupName, issues }: { entry: Entry; groupName?: string; issues: HealthIssue[] }) {
  const revealed = useUi((s) => s.revealed);
  const [history, setHistory] = useState(false);
  const totp = useMemo(() => parseTotp(entry.totp), [entry.totp]);
  const url = openableUrl(entry.url);
  const isRevealed = (key: string) => revealed.has(`${entry.id}:${key}`);
  const toggle = (key: string) => {
    const next = new Set(revealed);
    const k = `${entry.id}:${key}`;
    if (next.has(k)) next.delete(k);
    else next.add(k);
    useUi.getState().set({ revealed: next });
  };

  return (
    <aside className="details" aria-label="Details">
      <div className="details-head">
        <Avatar entry={entry} size={44} />
        <div className="details-head-text">
          <h2 className="details-title ellipsis selectable">{entry.title || 'Untitled'}</h2>
          <span className="muted ellipsis">
            {KIND_LABEL[entry.kind]}
            {groupName && ` · ${groupName}`} · edited {formatAge(entry.modified)}
          </span>
        </div>
        {!entry.trashed && (
          <>
            <button
              className={`icon-btn${entry.favorite ? ' fav-on' : ''}`}
              title={entry.favorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={entry.favorite}
              onClick={() => useVault.getState().updateEntry(entry.id, { favorite: !entry.favorite })}
            >
              <Star size={16} />
            </button>
            <button className="btn" onClick={() => editEntry(entry.id)}>
              <Pencil size={14} /> Edit
            </button>
          </>
        )}
        {entry.trashed && (
          <>
            <button className="btn" onClick={() => runCommand('entry.restore')}>
              <ArchiveRestore size={14} /> Restore
            </button>
            <button className="btn btn-danger" onClick={() => void deleteEntries([entry.id])}>
              <Trash2 size={14} /> Delete
            </button>
          </>
        )}
        <button
          className="btn btn-icon"
          title="More actions"
          aria-label="More actions"
          aria-haspopup="menu"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            entryMenu(r.right - 220, r.bottom + 4, entry);
          }}
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      {entry.trashed && <div className="notice warning">In the trash since {formatDate(entry.trashed)}. Restore it to use or edit it.</div>}
      {issues.length > 0 && !entry.trashed && (
        <div className="notice warning">
          {issues.map((i) => ISSUE_TEXT[i]).join(' · ')}
          {issues.includes('weak') || issues.includes('reused') ? '. Consider changing it.' : '.'}
        </div>
      )}

      <div className="details-body">
        <div className="field-list">
          {entry.username && <FieldRow label={entry.kind === 'wifi' ? 'Network name' : 'User name'} value={entry.username} onCopy={() => copyText(entry.username, 'User name', false)} />}
          {entry.password && (
            <FieldRow
              label="Password"
              value={entry.password}
              secret
              shown={isRevealed('password')}
              onToggle={() => toggle('password')}
              onCopy={() => copyText(entry.password, 'Password')}
              primary
              below={<StrengthMeter password={entry.password} />}
            />
          )}
          {totp && <TotpRow spec={totp} />}
          {entry.url && (
            <FieldRow
              label="Website"
              value={entry.url}
              display={<span className="ellipsis">{hostOf(entry.url) || entry.url}</span>}
              onCopy={() => copyText(entry.url, 'Address', false)}
              extra={
                url && (
                  <button className="icon-btn sm" title="Open website" aria-label="Open website" onClick={() => openUrl(entry)}>
                    <SquareArrowOutUpRight size={15} />
                  </button>
                )
              }
            />
          )}
          {entry.fields
            .filter((f) => f.value)
            .map((f) => (
              <FieldRow
                key={f.id}
                label={f.name || 'Field'}
                value={f.value}
                secret={f.secret}
                shown={isRevealed(f.id)}
                onToggle={() => toggle(f.id)}
                onCopy={() => copyText(f.value, f.name || 'Field', f.secret)}
              />
            ))}
        </div>

        {entry.notes && (
          <section className="details-section">
            <h3>Notes</h3>
            <div className="notes selectable">{entry.notes}</div>
          </section>
        )}

        {entry.tags.length > 0 && (
          <section className="details-section">
            <h3>Tags</h3>
            <div className="tags">
              {entry.tags.map((t) => (
                <button key={t} className="chip" title={`Search for ${t}`} onClick={() => useList.getState().setQuery(t)}>
                  {t}
                </button>
              ))}
            </div>
          </section>
        )}

        {entry.history.length > 0 && (
          <section className="details-section">
            <button className="disclosure" aria-expanded={history} onClick={() => setHistory(!history)}>
              {history ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <History size={14} /> Password history ({entry.history.length})
            </button>
            {history && (
              <div className="field-list compact">
                {entry.history.map((h, i) => (
                  <FieldRow
                    key={i}
                    label={`Until ${formatDate(h.changed)}`}
                    value={h.password}
                    secret
                    shown={isRevealed(`h${i}`)}
                    onToggle={() => toggle(`h${i}`)}
                    onCopy={() => copyText(h.password, 'Old password')}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        <dl className="kv details-meta">
          <dt>Modified</dt>
          <dd title={formatDate(entry.modified)}>{formatAge(entry.modified)}</dd>
          <dt>Created</dt>
          <dd>{formatDate(entry.created)}</dd>
          {entry.password && (
            <>
              <dt>Password set</dt>
              <dd title={formatDate(entry.passwordChanged)}>{formatAge(entry.passwordChanged)}</dd>
            </>
          )}
        </dl>
      </div>
    </aside>
  );
}

function FieldRow(props: {
  label: string;
  value: string;
  display?: ReactNode;
  secret?: boolean;
  shown?: boolean;
  onToggle?: () => void;
  onCopy: () => void;
  extra?: ReactNode;
  below?: ReactNode;
  /** The field people copy most (the password): its Copy button stands out. */
  primary?: boolean;
}) {
  const masked = props.secret && !props.shown;
  return (
    <div className="field-row">
      <div className="field-row-main" onDoubleClick={props.onCopy} title="Double-click to copy">
        <span className="field-row-label">{props.label}</span>
        <span className={`field-row-value${props.secret ? ' mono' : ''}${masked ? ' masked' : ' selectable'}`}>
          {masked ? '•'.repeat(Math.min(16, Math.max(8, props.value.length))) : (props.display ?? props.value)}
        </span>
        {props.below}
      </div>
      <div className="field-row-actions">
        {props.extra}
        {props.secret && props.onToggle && (
          <button className="icon-btn sm" title={props.shown ? 'Hide' : 'Show'} aria-label={props.shown ? `Hide ${props.label}` : `Show ${props.label}`} onClick={props.onToggle}>
            {props.shown ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
        <button className={`copy-btn${props.primary ? ' primary' : ''}`} aria-label={`Copy ${props.label}`} onClick={props.onCopy}>
          Copy
        </button>
      </div>
    </div>
  );
}

function TotpRow({ spec }: { spec: TotpSpec }) {
  const [now, setNow] = useState({ code: '', remaining: spec.period });
  useEffect(() => {
    let alive = true;
    const update = () => void totpNow(spec).then((r) => alive && setNow(r));
    update();
    const t = setInterval(update, 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [spec]);
  return (
    <FieldRow
      label="One-time code"
      value={now.code}
      display={
        <span className="totp">
          <span className="totp-code mono">{now.code ? groupCode(now.code) : '··· ···'}</span>
          <CountdownRing remaining={now.remaining} period={spec.period} />
          <span className="muted tabular">{now.remaining}s</span>
        </span>
      }
      onCopy={() => now.code && copyText(now.code, 'One-time code')}
    />
  );
}
