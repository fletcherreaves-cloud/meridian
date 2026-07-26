// @ts-nocheck
// ── EOM / FOB Diagnosis engine ────────────────────────────────────────────────
// Encodes the owner's food-cost troubleshooting decision tree (see
// memory/project-eom-diagnosis-flow.md) as a DECLARATIVE, EDITABLE check registry
// rather than hard-coded logic — so the flow can be reordered, retuned, and
// extended over time ("map this logic flow so it becomes editable").
//
// Each check = { id, label, order, requires[], threshold, severityFn, run(ctx) }.
// runDiagnosis() executes the enabled checks whose required data is present, in
// order, collects LINKED findings (one finding can reference another — mirroring
// "one thing leads to another"), applies a per-manager risk overlay, and assembles
// a detailed report + a summarized action-item list.
//
// Data it consumes (per store, per period), as available:
//   fob        — qsr_fob rows (FOB components $ vs target)         ✅ have
//   onHand     — qsr_onhand rows (incomplete-count)               ✅ have
//   variance   — qsr_variance_stat rows (top-5 by $, ±$50)        ⏳ pull pending
//   rawItems   — raw-item register (count timing, variance-at-count) ⏳ pull pending
//   waste      — waste rollup (manager/date/$, raw vs completed)   ⏳ pull pending
//   transfers  — transfers                                        ⏳ pull pending
//   purchases  — qsr_ebos_daily (verify posted / not pending)     ✅ have (status check TBD)
import { normClass, diagnoseIncompleteCount } from './eom-inventory.js';

export const SEVERITY = { critical: 3, high: 2, medium: 1, info: 0 };
const sevWord = s => ({ 3: 'critical', 2: 'high', 1: 'medium', 0: 'info' }[s] || 'info');

// Default FOB-component targets are supplied by the caller (monthly_targets); this
// is only a floor so the check runs before targets are wired.
export const DEFAULT_FOB_BAND = 0.0025; // 0.25% over target before we flag

// ── The editable check registry ───────────────────────────────────────────────
// Order + enabled + thresholds are all data → an editing UI can mutate this later.
export const DEFAULT_CHECKS = [
  {
    id: 'fob-components', label: 'FOB components vs target', order: 10, enabled: true,
    requires: ['fob'], params: { band: DEFAULT_FOB_BAND },
    // Always look at Food Over Base first; flag components excessively out of range.
    run: (ctx) => {
      const f = ctx.data.fob; if (!f) return [];
      const t = ctx.data.targets || {};
      const out = [];
      const COMPONENTS = [
        ['compWaste', 'Completed Waste'], ['rawWaste', 'Raw Waste'], ['condiments', 'Condiments'],
        ['empMgrMeals', 'Emp/Mgr Meals'], ['statVariance', 'Variance Stat'], ['unexplained', 'Unexplained'],
      ];
      for (const [key, label] of COMPONENTS) {
        const actPct = f.sales ? (f[key] || 0) / f.sales : null;
        if (actPct == null) continue;
        const tgt = t[key];
        const over = tgt != null ? actPct - tgt : null;
        if (over != null && over > (ctx.params.band ?? DEFAULT_FOB_BAND)) {
          out.push(mkFinding('fob-components', over > 0.01 ? SEVERITY.high : SEVERITY.medium,
            `${label} over target`, `${(actPct * 100).toFixed(2)}% vs ${(tgt * 100).toFixed(2)}% target (+${(over * 100).toFixed(2)} pts)`,
            (f[key] || 0), { component: key }));
        }
      }
      return out;
    },
  },
  {
    id: 'variance-top5', label: 'Variance Stat — top 5 by $', order: 20, enabled: true,
    requires: ['variance'], params: { topN: 5 },
    // ALWAYS review at least the top 5 items by $ difference (default sort).
    run: (ctx) => {
      const rows = (ctx.data.variance || []).slice().sort((a, b) => Math.abs(b.dolDiff || 0) - Math.abs(a.dolDiff || 0));
      return rows.slice(0, ctx.params.topN ?? 5).map(v =>
        mkFinding('variance-top5', Math.abs(v.dolDiff) >= 300 ? SEVERITY.critical : Math.abs(v.dolDiff) >= 100 ? SEVERITY.high : SEVERITY.medium,
          `Variance: ${v.descr || v.wrin}`, `$${Math.round(v.dolDiff)} difference (${normClass(v.cls)})`,
          Math.abs(v.dolDiff || 0), { wrin: v.wrin, cls: normClass(v.cls) }));
    },
  },
  {
    id: 'variance-50', label: 'Variance ≥ ±$50', order: 30, enabled: true,
    requires: ['variance'], params: { threshold: 50 },
    // Good practice: troubleshoot any item with variance of ±$50 or more.
    run: (ctx) => {
      const th = ctx.params.threshold ?? 50;
      const top5 = new Set((ctx.data.variance || []).slice().sort((a, b) => Math.abs(b.dolDiff || 0) - Math.abs(a.dolDiff || 0)).slice(0, 5).map(v => v.wrin));
      return (ctx.data.variance || [])
        .filter(v => Math.abs(v.dolDiff || 0) >= th && !top5.has(v.wrin)) // top-5 already surfaced
        .map(v => mkFinding('variance-50', SEVERITY.medium, `±$50 item: ${v.descr || v.wrin}`,
          `$${Math.round(v.dolDiff)} difference (${normClass(v.cls)})`, Math.abs(v.dolDiff || 0), { wrin: v.wrin }));
    },
  },
  {
    id: 'incomplete-count', label: 'Incomplete count (uncounted high-value items)', order: 40, enabled: true,
    requires: ['onHand'], params: { minValue: 25 },
    run: (ctx) => {
      const diag = diagnoseIncompleteCount(ctx.data.onHand || [], { period: ctx.period, asOf: ctx.asOf, minValue: ctx.params.minValue });
      if (!diag.uncountedCount) return [];
      return [mkFinding('incomplete-count', diag.uncountedValue >= 500 ? SEVERITY.high : SEVERITY.medium,
        `${diag.uncountedCount} items still uncounted`, `~$${Math.round(diag.uncountedValue)} at risk across ${diag.byClass.length} classes`,
        diag.uncountedValue, { uncounted: diag.uncounted.slice(0, 20) })];
    },
  },
  // ── Declared but pending their data pulls (light up when captured) ──
  { id: 'raw-items-timing', label: 'Raw Items — count timing & variance-at-count', order: 25, enabled: true, requires: ['rawItems'], pending: true, run: () => [] },
  { id: 'waste-patterns', label: 'Waste — manager/pencil-whip patterns', order: 50, enabled: true, requires: ['waste'], pending: true, run: () => [] },
  { id: 'purchases-posted', label: 'Purchases — all invoices posted (none pending)', order: 60, enabled: true, requires: ['purchases'], pending: true, run: () => [] },
  { id: 'transfers', label: 'Transfers', order: 70, enabled: true, requires: ['transfers'], pending: true, run: () => [] },
];

function mkFinding(checkId, severity, title, detail, dollars, data = {}) {
  return { checkId, severity, severityWord: sevWord(severity), title, detail, dollars: Number(dollars) || 0, links: [], data };
}

// ── Manager-risk overlay ──────────────────────────────────────────────────────
// Owner: a manager with a history of manipulation gets closer scrutiny. A risk
// weight (0..1) bumps severity on manager-attributable findings (waste/raw-items).
export function applyManagerRisk(findings, managerRisk = {}) {
  for (const f of findings) {
    const mgr = f.data?.manager;
    const w = mgr && managerRisk[mgr];
    if (w && w >= 0.5 && f.severity < SEVERITY.critical) {
      f.severity += 1; f.severityWord = sevWord(f.severity);
      f.links.push({ type: 'manager-risk', manager: mgr, note: `elevated — ${mgr} flagged for prior scrutiny` });
    }
  }
  return findings;
}

// ── Run the flow ──────────────────────────────────────────────────────────────
// data = { fob, onHand, variance, rawItems, waste, transfers, purchases, targets }
export function runDiagnosis({ store, storeName, period, asOf = new Date(), data = {}, checks = DEFAULT_CHECKS, managerRisk = {} } = {}) {
  const active = checks.filter(c => c.enabled).sort((a, b) => a.order - b.order);
  const findings = [];
  const ran = [], pending = [];
  for (const c of active) {
    const haveData = (c.requires || []).every(k => data[k] != null && (!Array.isArray(data[k]) || data[k].length));
    if (!haveData || c.pending) { pending.push({ id: c.id, label: c.label, reason: c.pending ? 'awaiting data pull' : 'no data' }); continue; }
    try {
      const got = c.run({ data, params: c.params || {}, period, asOf }) || [];
      got.forEach(f => { f.checkLabel = c.label; findings.push(f); });
      ran.push({ id: c.id, label: c.label, count: got.length });
    } catch (e) { ran.push({ id: c.id, label: c.label, error: String(e && e.message || e) }); }
  }
  applyManagerRisk(findings, managerRisk);
  findings.sort((a, b) => (b.severity - a.severity) || (b.dollars - a.dollars));

  const actionItems = findings
    .filter(f => f.severity >= SEVERITY.medium)
    .map(f => `[${f.severityWord.toUpperCase()}] ${f.title} — ${f.detail}`);

  return {
    store, storeName, period,
    findings,
    ran, pending,
    totalDollars: findings.reduce((s, f) => s + (f.dollars || 0), 0),
    actionItems,
    summary: findings.length
      ? `${findings.length} finding${findings.length !== 1 ? 's' : ''}${pending.length ? ` · ${pending.length} check(s) awaiting data` : ''}`
      : (pending.length ? `No findings yet · ${pending.length} check(s) awaiting data` : 'No findings — clean'),
  };
}

// A human-readable report string (owner downloads/attaches to email to start).
export function formatDiagnosisReport(result) {
  const lines = [`EOM Food-Cost Diagnosis — ${result.storeName || result.store} · ${result.period}`, ''];
  if (!result.findings.length) lines.push('No findings surfaced.');
  for (const f of result.findings) {
    lines.push(`• [${f.severityWord.toUpperCase()}] ${f.title}`);
    lines.push(`    ${f.detail}${f.dollars ? `  (~$${Math.round(f.dollars)})` : ''}`);
    f.links.forEach(l => lines.push(`    ↳ ${l.note || l.type}`));
  }
  if (result.pending.length) {
    lines.push('', 'Checks awaiting data:');
    result.pending.forEach(p => lines.push(`  · ${p.label} (${p.reason})`));
  }
  return lines.join('\n');
}
