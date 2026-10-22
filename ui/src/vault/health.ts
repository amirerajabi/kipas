// Password health ("Watchtower"): weak, reused and old passwords among the live entries. Runs locally; nothing is
// checked against an online breach list.
import type { Entry } from './model';
import { estimateStrength } from './strength';

export type HealthIssue = 'weak' | 'reused' | 'old' | 'no2fa';

export const HEALTH_LABEL: Record<HealthIssue, string> = {
  weak: 'Weak passwords',
  reused: 'Reused passwords',
  old: 'Older than a year',
  no2fa: 'Without two-factor',
};

export const OLD_AFTER_MS = 365 * 24 * 3600 * 1000;

export type HealthReport = Record<HealthIssue, Set<string>> & { score: number };

export function analyzeHealth(entries: Entry[], now = Date.now()): HealthReport {
  const report: HealthReport = { weak: new Set(), reused: new Set(), old: new Set(), no2fa: new Set(), score: 100 };
  const live = entries.filter((e) => !e.trashed && e.password);
  const byPassword = new Map<string, string[]>();
  for (const e of live) {
    if (estimateStrength(e.password).score <= 1) report.weak.add(e.id);
    if (now - e.passwordChanged > OLD_AFTER_MS) report.old.add(e.id);
    // Only website logins are expected to have a second factor.
    if (e.kind === 'login' && e.url && !e.totp) report.no2fa.add(e.id);
    const ids = byPassword.get(e.password) ?? [];
    ids.push(e.id);
    byPassword.set(e.password, ids);
  }
  for (const ids of byPassword.values()) if (ids.length > 1) for (const id of ids) report.reused.add(id);
  if (live.length) {
    const bad = new Set([...report.weak, ...report.reused]).size;
    report.score = Math.round(100 * (1 - (bad + report.old.size * 0.25) / live.length));
    report.score = Math.max(0, Math.min(100, report.score));
  }
  return report;
}
