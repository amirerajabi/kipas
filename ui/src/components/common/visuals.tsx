import { CreditCard, KeyRound, StickyNote, Wifi } from 'lucide-react';
import { displayShortcut, shortcutParts } from '../../app/keys';
import { estimateStrength } from '../../vault/strength';
import { hostOf, type Entry, type EntryKind } from '../../vault/model';

/** The Kipas mark: a vault-door dial with a lit keyhole (same artwork as the app icon). */
export function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <svg className="brand-mark-svg" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="bm-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--brand-mark-tile-top)" />
          <stop offset="1" stopColor="var(--brand-mark-tile-bottom)" />
        </linearGradient>
        <linearGradient id="bm-lit" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand-mark-lit-start)" />
          <stop offset="1" stopColor="var(--brand-mark-lit-end)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="url(#bm-tile)" />
      <circle cx="16" cy="16" r="10" fill="none" stroke="var(--brand-mark-row)" strokeWidth="1.8" />
      <circle cx="16" cy="13.5" r="3.6" fill="url(#bm-lit)" />
      <rect x="14.2" y="14.5" width="3.6" height="8" rx="1.4" fill="url(#bm-lit)" />
    </svg>
  );
}

const KIND_ICON: Record<EntryKind, typeof KeyRound> = { login: KeyRound, card: CreditCard, note: StickyNote, wifi: Wifi };

export function KindIcon({ kind, size = 16 }: { kind: EntryKind; size?: number }) {
  const Icon = KIND_ICON[kind];
  return <Icon size={size} />;
}

/** A stable tint per name, so the same site always gets the same colour. */
function tint(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 8;
}

/**
 * The entry's picture: the first letter of its site or title on a tinted tile. Kipas never fetches favicons, so the
 * list reveals nothing about your accounts to the network.
 */
export function Avatar({ entry, size = 28 }: { entry: Pick<Entry, 'title' | 'url' | 'kind'>; size?: number }) {
  const host = hostOf(entry.url);
  // The colour follows the site (so every Google login matches), the letter follows what you called it.
  const name = host || entry.title.trim();
  const label = entry.title.trim() || host;
  const letter = entry.kind === 'login' && label ? [...label][0].toUpperCase() : null;
  return (
    <span className={`avatar tint-${tint(name || entry.kind)}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }} aria-hidden="true">
      {letter ?? <KindIcon kind={entry.kind} size={Math.round(size * 0.55)} />}
    </span>
  );
}

export function StrengthMeter({ password, showLabel = true }: { password: string; showLabel?: boolean }) {
  const s = estimateStrength(password);
  if (!password) return null;
  return (
    <div className={`strength s-${s.score}`} title={`${s.label} · about ${s.bits} bits${s.hint ? ` · ${s.hint}` : ''}`}>
      <div className="strength-bars" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`strength-bar${i < Math.max(1, s.score) ? ' on' : ''}`} />
        ))}
      </div>
      {showLabel && (
        <span className="strength-label">
          {s.label}
          {s.hint && <span className="muted"> · {s.hint}</span>}
        </span>
      )}
    </div>
  );
}

/** A small dot for the list: red weak, amber fair, green strong. */
export function StrengthDot({ password }: { password: string }) {
  if (!password) return null;
  const s = estimateStrength(password);
  return <span className={`strength-dot s-${s.score}`} title={`Password: ${s.label}`} aria-label={`Password strength ${s.label}`} />;
}

export function Kbd({ shortcut }: { shortcut?: string }) {
  if (!shortcut) return null;
  return (
    <span className="kbd-group" aria-label={displayShortcut(shortcut)}>
      {shortcutParts(shortcut).map((k, i) => (
        <kbd key={i}>{k}</kbd>
      ))}
    </span>
  );
}

/** A countdown ring for one-time codes. */
export function CountdownRing({ remaining, period, size = 18 }: { remaining: number; period: number; size?: number }) {
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`ring${remaining <= 5 ? ' ending' : ''}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`${remaining} seconds left`}>
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" />
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - remaining / period)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}
