// @ts-nocheck
// ── Manual Pull Triggers (owner request 2026-11-16) ─────────────────────────────────────────
// Part of the QSRSoft Operator Security Notice compliance triage — see
// memory/finding-qsrsoft-security-notice-2026-11-16.md and memory/plan-manual-pull-schedule-
// 2026-11-16.md. With the credential-login eBOS/Security Events/Forms pulls paused, a blanket
// weekly manual pull across all 27 stores for the genuinely one-store-at-a-time reports (eBOS,
// Security Events) is real, measured operational cost — the owner's own words: "I just want to
// be smart about this." Owner's explicit instruction: "we need to build this in to the app so
// for wherever we would see a triggered event then we should flag... the very specifics for what
// needs to be pulled manually [and] uploaded for analysis."
//
// This module does NOT re-derive any signal — it composes two that already exist and are
// already each a single source of truth for their own domain:
//   - tolStatusesDistrict (tolerance-status.js) — the same red/yellow/green FOB + POS Controls
//     comparison UnifiedTargetsPanel, the district rollup tile, and coaching findings all use.
//   - computeVisitReadiness (visit-readiness.js) — the same overdue-visit tracking the Visit
//     Readiness panel already shows.
// A store flags for a manual pull when one of those signals is already red/yellow (FOB/Controls)
// or a graded visit is due/overdue soon (Forms) — not on a blanket calendar.
//
// Report mapping, per CoachQ's 2026-11-16 confirmation (memory/plan-manual-pull-schedule-
// 2026-11-16.md): eBOS/Security Events/Forms are NOT schedulable and QSRSoft's KB documents no
// bulk multi-store export for eBOS or Security Events specifically — but Forms Completion Report
// turned out to ALREADY be an above-store, multi-store report (Reports > Forms > Forms Completion
// Report), so its flag here reads as "worth checking soon," not "go open 27 store accounts."
// Security Events also partly overlaps the Register Audit report (already a Tier-1 weekly pull,
// Security-subscriber drawer-level drill-down) — the flag says so rather than implying a wholly
// separate pull is always required.
import { tolStatusesDistrict } from './tolerance-status.js';
import { computeVisitReadiness, overdueThresholdDays } from './visit-readiness.js';
import { STORE_NAMES } from '../constants.js';

// Only the FOB category maps to a Tier-2 manual-pull trigger today (eBOS Purchases) — verified
// empirically (not assumed) that the POS-Controls category CANNOT produce a tolerance signal at
// all: every one of TOL_METRICS' 4 'pos' entries (cashOS/tRedB/tRedA/discP) has `offKey: null` —
// there is no official-target workbook column for any of them, so TOL_ROLLUP_METRICS (which
// requires both offKey and tol) excludes all 4 and tolStatusesForStore can never emit a 'pos'
// status. A Security Events trigger is a real gap, not wired here — closing it means picking one
// of: (a) add official target columns for Cash O/S/T-Red/Discount so they get a real tol status
// like every other metric, (b) a fixed absolute threshold specific to this trigger (a product/
// threshold call, not something to invent unilaterally inside this module), or (c) a dedicated
// anomaly signal (Signals' Scanner already does correlation/z-score work on these same Controls
// metrics, but on data this trigger set exists to help replace, so it can't be the input here).
// Left as an explicit open item (see this module's test file + memory/plan-manual-pull-schedule-
// 2026-11-16.md) rather than guessed at.
const REPORT_BY_CAT = {
  fob: { report: 'eBOS Purchases', why: 'a food-cost/FOB metric' },
};

// A graded visit counts as "coming up soon" once within this many days of its own
// overdue threshold (overdueThresholdDays, visit-readiness.js) — early enough to pull Forms
// completion ahead of the visit, not just after it's already overdue.
const VISIT_LOOKAHEAD_DAYS = 14;

function fmtTolNum(n, unit) {
  if (n == null) return '—';
  if (unit === '%') return (n * 100).toFixed(1) + '%';
  if (unit === '$') return '$' + n.toFixed(2);
  if (unit === 's') return n.toFixed(0) + 's';
  return (Math.round(n * 100) / 100).toString();
}

// Returns a flat array of { loc, locName, report, severity: 'red'|'yellow', reason, metricId,
// metricLabel, source: 'tolerance'|'visit-readiness' }, most severe first. `opts.locs` scopes
// to a subset of stores (same convention tolStatusesDistrict/computeVisitReadiness already use).
export function computeManualPullTriggers(ds, opts = {}) {
  const locs = (opts.locs && opts.locs.length) ? opts.locs : Object.keys(STORE_NAMES);
  const triggers = [];

  const tolByLoc = tolStatusesDistrict(ds, locs, opts);
  for (const loc of locs) {
    for (const s of (tolByLoc[loc] || [])) {
      if (s.status !== 'red' && s.status !== 'yellow') continue;
      const mapping = REPORT_BY_CAT[s.cat];
      if (!mapping) continue;
      triggers.push({
        loc, locName: STORE_NAMES[loc] || loc, report: mapping.report, severity: s.status,
        reason: `${s.label} ${s.status === 'red' ? 'out of tolerance' : 'trending off'} — current ${fmtTolNum(s.cur, s.unit)} vs target ${fmtTolNum(s.off, s.unit)} (±${fmtTolNum(s.tol, s.unit)})`,
        metricId: s.metricId, metricLabel: s.label, source: 'tolerance',
      });
    }
  }

  const readiness = computeVisitReadiness(ds, { locs });
  for (const store of (readiness.stores || [])) {
    const lv = store.lastVisit;
    const threshold = overdueThresholdDays(lv?.type || 'CFV');
    if (threshold == null || !lv) continue;
    const daysSinceLast = Math.round((Date.now() - lv.ms) / 86400000);
    const daysUntilDue = threshold - daysSinceLast;
    if (daysUntilDue > VISIT_LOOKAHEAD_DAYS) continue;
    triggers.push({
      loc: store.loc, locName: STORE_NAMES[store.loc] || store.loc, report: 'Forms Completion Report',
      severity: daysUntilDue < 0 ? 'red' : 'yellow',
      reason: daysUntilDue < 0
        ? `Overdue for a graded visit by ${Math.abs(daysUntilDue)} day(s) — worth checking Forms/checklist completion`
        : `Due for a graded visit within ${daysUntilDue} day(s) — worth checking Forms/checklist completion ahead of it`,
      metricId: 'visit_overdue', metricLabel: 'Visit readiness', source: 'visit-readiness',
    });
  }

  const sevRank = { red: 0, yellow: 1 };
  triggers.sort((a, b) => (sevRank[a.severity] - sevRank[b.severity]) || a.locName.localeCompare(b.locName));
  return triggers;
}
