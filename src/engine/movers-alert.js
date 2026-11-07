// @ts-nocheck
// ── Movers Alerts trigger evaluation (task #91) — pure, no network, no React ────────────────────
// Threshold methodology measured against real data, not guessed — see
// memory/plan-movers-alerts-2026-11-07.md for the full measurement (53,196 qualifying store-days
// pulled live from qsr_daily_activity_rollup, same calibration discipline the swing alarm's own
// -10%/-8% used). Key finding from that doc: up-swings are NOT a usable alert signal at this
// grain (25/26 stores sustain +10-30% for a week+ at some point) — this module deliberately has
// no up-swing rule.
//
// Owner-decided (live Q&A, 2026-11-07): GM/AS/DO only, fire on occurrence (not a daily digest),
// push body carries the swing + a top cause.
import { classify, KIND_LABEL } from './swing-detect.js';

// Measured thresholds (memory/plan-movers-alerts-2026-11-07.md's table) — recalibrate against
// fresh data if the business changes shape, same standing caveat swing-detect.js's own
// SWING_DEFAULTS carries.
export const MOVERS_THRESHOLDS = {
  critSingleDayPct: -25,  // one day at/below this → CRIT on its own, no run required
  warnRunPct: -20,        // N+ consecutive days at/below this → WARN
  warnMinRun: 3,
};

export const MOVERS_TARGET_ROLES = ['gm', 'area_supervisor', 'do'];

/**
 * `series`: [{ date: 'YYYY-MM-DD', pct, guestPct }] for one store, OLDEST → NEWEST, already
 * computed sales-vs-LY% (and optional guest-count-vs-LY%) for each day — same `lySales>=$1k`/
 * `|pct|<=200` guard the real caller (scripts/movers-alert-run.mjs) applies before building this,
 * matching moversStrip's (at-a-glance.js) own comp-sanity rule exactly.
 *
 * Returns the alert for the LATEST day only, or null if neither rule fires. Only the latest day
 * is ever a new event — a run that started 3 days ago already fired its own alert on day 3; this
 * function doesn't re-fire for days already covered by an earlier call (the caller's dedupe
 * against existing app_notifications rows is what actually prevents re-firing — see that
 * script's own header).
 */
export function evaluateMoversAlert(series) {
  if (!series?.length) return null;
  const latest = series[series.length - 1];
  if (latest.pct == null) return null;

  if (latest.pct <= MOVERS_THRESHOLDS.critSingleDayPct) {
    return { severity: 'crit', rule: 'single-day', swingPct: latest.pct, guestPct: latest.guestPct, consecutiveDays: 1, date: latest.date };
  }

  let run = 0;
  for (let i = series.length - 1; i >= 0 && series[i].pct != null && series[i].pct <= MOVERS_THRESHOLDS.warnRunPct; i--) run++;
  if (run >= MOVERS_THRESHOLDS.warnMinRun) {
    return { severity: 'warn', rule: 'sustained', swingPct: latest.pct, guestPct: latest.guestPct, consecutiveDays: run, date: latest.date };
  }
  return null;
}

// Top-cause classification — reuses swing-detect.js's own classify()/KIND_LABEL rather than the
// full Why Engine's diagnoseMiss(), which needs the browser app's full `ds` dataset object and
// can't run from a Node pull script. Same sales-vs-guest-count relationship swing-detect.js
// already uses at weekly grain, applied here at the daily grain Movers operates at.
export function moversTopCauseKind(alert) {
  return classify(alert.swingPct, alert.guestPct);
}

/** Pure — the exact {title, body} shape the push payload and app_notifications row both use. */
export function buildMoversAlertContent({ storeName, alert }) {
  const { severity, swingPct, consecutiveDays } = alert;
  const pctTxt = `${swingPct.toFixed(1)}%`;
  const sevTxt = severity === 'crit' ? 'CRIT' : 'WARN';
  const runTxt = consecutiveDays > 1 ? ` (${consecutiveDays} days running)` : '';
  const causeKind = moversTopCauseKind(alert);
  const causeLabel = (KIND_LABEL[causeKind] || '').replace(/\.$/, '');
  const title = `${storeName}: ${sevTxt} sales decline`;
  const body = `Sales ${pctTxt} vs LY${runTxt}.${causeLabel ? ` ${causeLabel}.` : ''}`;
  return { title, body, causeKind };
}
