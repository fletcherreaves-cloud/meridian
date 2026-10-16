// @ts-nocheck
// ── Cash Variance Pattern report (Reports redesign Tier 3, 2026-10-16) ──────────────────────
// Owner's own half-built ask (2026-08-31, memory/project-backlog.md): linking cash controls to
// food cost surfaced a CoachQ (competing tool) sample that also showed a register/cashier-level
// cash-variance table naming specific managers/cashiers ("Register 13 — Seth F, Bobbi J"). That
// half was deliberately NOT built — this repo's standing "verify, don't accuse" convention
// (eom-diagnosis.js's INTEGRITY_LABEL section) holds that naming individuals in an automated,
// forwardable report is the wrong mechanism for a loss-prevention finding.
//
// Measured before building (2026-10-16): Meridian's own Register Audit import
// (parsers/index.js's parseRegisterAudit) is keyed by EMPLOYEE + store + date — there is no
// register-NUMBER field anywhere in this app's data model, so a literal "by register" report
// was never buildable here in the first place, privacy concerns aside.
//
// What IS buildable, privacy-safe by construction: the same cash-variance SIGNAL (cash O/S,
// POS overrides, refunds, no-sale drawer opens, T-Reds After) the owner's CoachQ example cared
// about, already tracked store-day-level (never per-employee) in signal-registry.js's Controls
// metric group — aggregated here by STORE × DAY-OF-WEEK instead of by register or person. A
// store whose Thursdays run consistently high cash O/S is the same kind of recurring-pattern
// finding "Register 13's recurring variances" was pointing at, just at the grain this app's
// real data actually supports.
//
// Deliberately NO synthetic "flagged" threshold — CLAUDE.md's own standing rule against
// inventing unvalidated cutoffs (the swing alarm's -10% and the count-completeness 75% both
// came from hundreds of measured store-weeks; this report has no equivalent backtest yet). Real
// per-day-of-week averages are shown, sortable by any column, so the worst combinations surface
// naturally — same posture Weather Impact and Channel Mix (Phase 5) already take.
import { metricRowsForRange } from './signal-registry.js';
import { STORE_NAMES } from '../constants.js';
import { dKey } from '../utils/date.js';

export const CASH_VARIANCE_METRICS = [
  { key: 'cashOSPct', label: 'Cash O/S %', unit: 'pct' },
  { key: 'cashOSAmt', label: 'Cash O/S ($)', unit: '$' },
  { key: 'posOverCnt', label: 'POS Override (count)', unit: 'count' },
  { key: 'posOverAmt', label: 'POS Override ($)', unit: '$' },
  { key: 'manualRefAmt', label: 'Manual Refund ($)', unit: '$' },
  { key: 'cashRefCnt', label: 'Cash Refund (count)', unit: 'count' },
  { key: 'cashlessRefCnt', label: 'Cashless Refund (count)', unit: 'count' },
  { key: 'drawerOpens', label: 'Drawer Opens / No-Sale (count)', unit: 'count' },
  { key: 'tRedACnt', label: 'T-Reds After (count)', unit: 'count' },
  { key: 'tRedAPct', label: 'T-Reds After %', unit: 'pct' },
];

const DOW_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MIN_DAYS = 3; // below this a day-of-week average is too noisy to report

function toDate(d) {
  if (d == null) return null;
  if (d instanceof Date) return isNaN(+d) ? null : d;
  const parsed = new Date(d);
  return isNaN(+parsed) ? null : parsed;
}

/**
 * One row per store × day-of-week with at least MIN_DAYS observed days: the real mean of each
 * CASH_VARIANCE_METRICS field for that bucket, plus `n` (distinct days observed — not the max
 * across metrics, since a day can be missing one field and not another).
 */
export function buildCashVariancePatternReport(ds, { locs, range } = {}) {
  if (!range?.s || !range?.e) return [];
  const targetLocs = (locs && locs.length) ? locs : (ds?.storeIds || []);
  const out = [];

  for (const loc of targetLocs) {
    const byDow = Array.from({ length: 7 }, () => ({ dates: new Set(), vals: {} }));
    for (const m of CASH_VARIANCE_METRICS) {
      const rows = metricRowsForRange(m.key, ds, { loc, start: range.s, end: range.e });
      for (const r of rows) {
        if (r.value == null) continue;
        const d = toDate(r.date);
        if (!d) continue;
        const bucket = byDow[d.getDay()];
        bucket.dates.add(dKey(d));
        (bucket.vals[m.key] || (bucket.vals[m.key] = [])).push(r.value);
      }
    }
    for (let dow = 0; dow < 7; dow++) {
      const bucket = byDow[dow];
      const n = bucket.dates.size;
      if (n < MIN_DAYS) continue;
      const row = { loc, name: STORE_NAMES[loc] || loc, dow, dowLabel: DOW_LABELS[dow], n };
      for (const m of CASH_VARIANCE_METRICS) {
        const vals = bucket.vals[m.key] || [];
        row[m.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      }
      out.push(row);
    }
  }
  return out;
}
