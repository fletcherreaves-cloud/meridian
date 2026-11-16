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
import { tolStatusesDistrict, tolMergedTarget } from './tolerance-status.js';
import { computeVisitReadiness, overdueThresholdDays } from './visit-readiness.js';
import { computeTargetAwareRegisterFlags } from '../utils/register-audit.js';
import { STORE_NAMES } from '../constants.js';

// Only the FOB category maps to a Tier-2 manual-pull trigger via tolStatusesDistrict (eBOS
// Purchases) — verified empirically (not assumed) that tolerance-status.js's own 'pos' category
// CANNOT produce a tolerance signal at all: every one of TOL_METRICS' 4 'pos' entries
// (cashOS/tRedB/tRedA/discP) has `offKey: null`, so TOL_ROLLUP_METRICS excludes all 4 and
// tolStatusesForStore can never emit a 'pos' status.
//
// RESOLVED 2026-11-16 (owner follow-up, same day): that is NOT the same as "no target exists"
// for these metrics -- DEFAULT_TARGETS already carries real per-store values for all 5
// (tCashOSPct/tRedBPct/tRedAPct/tPosOverPct/tRefundPct), and register-audit.js's
// computeTargetAwareRegisterFlags already flags egregious/repetitive deviations against them
// (Notes 61 #10/#11, memory/finding-register-audit-target-flags-2026-11-14.md) -- that function
// IS the "already using it to flag potential issues" mechanism the owner recalled. The Security
// Events trigger below reuses it directly (same calibrated 42-day window/egregious-3x/
// repetitive-3days-50% thresholds that engine already ships with) rather than inventing a new
// threshold -- see computeSecurityEventsTrigger below.
const REPORT_BY_CAT = {
  fob: { report: 'eBOS Purchases', why: 'a food-cost/FOB metric' },
};

// Register Audit employee-level riskLevel -> this trigger's store-level severity. 'critical'/
// 'high' both read red (same ≥30 threshold register-audit.js's own riskLevel bucketing uses for
// "high" and above); 'watch' reads yellow; 'ok' never triggers.
const RISK_TO_SEVERITY = { critical: 'red', high: 'red', watch: 'yellow' };

// Rolls computeTargetAwareRegisterFlags' per-employee output up to one flag per STORE (this
// trigger set decides whether to pull Security Events for a whole store, not per employee).
// `targetsByLoc` lets an override (Monthly/Yearly Targets workbook, or any future scope-cascade
// override) actually reach this flagging -- see register-audit.js's own comment on the bug this
// closed (it used to read the literal DEFAULT_TARGETS constant only, ignoring any override).
function computeSecurityEventsTrigger(ds, locs) {
  const auditRows = ds?.auditRows || [];
  if (!auditRows.length) return [];
  const targetsByLoc = {};
  for (const loc of locs) targetsByLoc[loc] = tolMergedTarget(ds, loc);
  const flagsByEmpKey = computeTargetAwareRegisterFlags(auditRows, targetsByLoc);

  const byLoc = {};
  for (const [key, flags] of Object.entries(flagsByEmpKey)) {
    const loc = key.split('::')[0];
    if (!locs.includes(loc)) continue;
    (byLoc[loc] ||= []).push(flags);
  }

  const SEVERITY_RANK = { red: 2, yellow: 1 };
  const out = [];
  for (const [loc, employees] of Object.entries(byLoc)) {
    let severity = null, flaggedEmployees = 0;
    const metricLabels = new Set();
    for (const e of employees) {
      if (e.riskLevel === 'ok') continue;
      flaggedEmployees++;
      const sev = RISK_TO_SEVERITY[e.riskLevel];
      if (sev && (!severity || SEVERITY_RANK[sev] > SEVERITY_RANK[severity])) severity = sev;
      for (const f of e.flags) metricLabels.add(`${f.label} (${f.kind})`);
    }
    if (!severity) continue;
    out.push({
      loc, locName: STORE_NAMES[loc] || loc, report: 'Security Events (and/or this week\'s Register Audit drawer-level detail)',
      severity,
      reason: `${flaggedEmployees} employee(s) with an egregious or repetitive Register Audit flag in the last 6 weeks — ${[...metricLabels].join(', ')}`,
      metricId: 'register_audit_flags', metricLabel: 'Register Audit target-aware flags', source: 'register-audit',
    });
  }
  return out;
}

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

  triggers.push(...computeSecurityEventsTrigger(ds, locs));

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
