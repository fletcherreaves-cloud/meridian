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
// Data it consumes (per store, per period), as available — all via eom-parsers.js
// mappers so the pull script and the client normalize identically:
//   fob        — qsr_fob rows (FOB components $ vs target)              ✅ have
//   onHand     — qsr_onhand rows (incomplete-count)                    ✅ have
//   variance   — mapVarianceRows() (top-5 by $, ±$50)                  ✅ endpoint confirmed
//   yields     — mapYieldGroups() (yield-band cause overlay)           ✅ endpoint confirmed
//   rawItems   — [mapRawItemHistory()] (count timing, variance-at-count) ✅ endpoint confirmed
//   waste      — mapWasteEvents() (manager/$, raw vs completed)        ✅ endpoint confirmed
//   transfers  — mapTransferLines() (In/Out, unposted)                ✅ endpoint confirmed
//   purchases  — qsr_ebos_daily (verify posted / not pending)         ✅ have (status check TBD)
import { normClass, diagnoseIncompleteCount } from './eom-inventory.js';
import { summarizeWasteByManager, summarizeTransfers, yieldBandFor, yieldStatus } from './eom-parsers.js';

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
      return rows.slice(0, ctx.params.topN ?? 5).map(v => {
        const f = mkFinding('variance-top5', Math.abs(v.dolDiff) >= 300 ? SEVERITY.critical : Math.abs(v.dolDiff) >= 100 ? SEVERITY.high : SEVERITY.medium,
          `Variance: ${v.descr || v.wrin}`, `$${Math.round(v.dolDiff)} difference (${normClass(v.cls)})`,
          Math.abs(v.dolDiff || 0), { wrin: v.wrin, cls: normClass(v.cls), rawItemId: v.rawItemId });
        attachYieldCause(f, v, ctx.data.yields);
        return f;
      });
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
  {
    // Raw Items forensic register — attribute a flagged variance to the COUNT event
    // where it occurred, and judge whether recounting NOW still helps (a big variance
    // on an EARLY-period count already cascaded all month → recount won't recover it).
    id: 'raw-items-timing', label: 'Raw Items — count timing & variance-at-count', order: 25, enabled: true,
    requires: ['rawItems'], params: { minDollar: 50 },
    run: (ctx) => {
      const details = ctx.data.rawItems || []; // array of mapRawItemHistory() results
      const out = [];
      const windowStart = countWindowStartTs(ctx.period);
      for (const d of details) {
        const counts = (d.counts || []).filter(c => Math.abs(c.difference || 0) >= (ctx.params.minDollar ?? 50));
        for (const c of counts) {
          const ts = Date.parse(c.dt || '') || null;
          const late = ts != null && windowStart != null ? ts >= windowStart : null;
          const sev = Math.abs(c.difference) >= 500 ? SEVERITY.high : SEVERITY.medium;
          const f = mkFinding('raw-items-timing', sev,
            `Count variance: ${d.descr || d.wrin}`,
            `$${Math.round(c.difference)} at the ${c.dt} count${late === false ? ' (EARLY in period — recounting now won\'t recover it)' : late ? ' (late — recount may help)' : ''}`,
            Math.abs(c.difference || 0), { wrin: d.wrin, rawItemId: d.wrin, manager: c.manager, countDate: c.dt, late });
          if (c.manager) f.links.push({ type: 'count-entry', manager: c.manager, note: `counted by ${c.manager} on ${c.dt}` });
          out.push(f);
        }
      }
      return out;
    },
  },
  {
    // Waste — per-manager $ share, edited entries, disproportionate contributors.
    id: 'waste-patterns', label: 'Waste — manager/pencil-whip patterns', order: 50, enabled: true,
    requires: ['waste'], params: { shareFlag: 0.4, minTotal: 100 },
    run: (ctx) => {
      const { total, byManager } = summarizeWasteByManager(ctx.data.waste || []);
      if (!total) return [];
      const out = [];
      const shareFlag = ctx.params.shareFlag ?? 0.4;
      for (const m of byManager) {
        const editedFlag = m.edited > 0;
        const shareHot = byManager.length > 1 && m.share >= shareFlag && m.total >= (ctx.params.minTotal ?? 100);
        if (!shareHot && !editedFlag) continue;
        const f = mkFinding('waste-patterns', shareHot ? SEVERITY.medium : SEVERITY.info,
          `Waste concentration: ${m.manager}`,
          `$${Math.round(m.total)} (${Math.round(m.share * 100)}% of period waste) across ${m.count} entries${editedFlag ? ` · ${m.edited} edited` : ''}`,
          m.total, { manager: m.manager, share: m.share, edited: m.edited });
        out.push(f);
      }
      return out;
    },
  },
  { id: 'purchases-posted', label: 'Purchases — all invoices posted (none pending)', order: 60, enabled: true, requires: ['purchases'], pending: true, run: () => [] },
  {
    // Transfers — large / not-approved transfers that shift the variance picture.
    id: 'transfers', label: 'Transfers', order: 70, enabled: true,
    requires: ['transfers'], params: { largeAmt: 100 },
    run: (ctx) => {
      const { flagged, netAmt } = summarizeTransfers(ctx.data.transfers || [], { largeAmt: ctx.params.largeAmt });
      return flagged.map(t => mkFinding('transfers',
        t.status !== 'approved' ? SEVERITY.medium : SEVERITY.info,
        `Transfer ${t.dir} ${t.status !== 'approved' ? `(${t.status})` : ''} — store ${t.counterpartyNsn}`,
        `$${Math.round(t.total)} on ${t.dt}${t.status !== 'approved' ? ' — NOT posted, verify' : ''} (period net $${Math.round(netAmt)})`,
        t.total, { transferId: t.id, dir: t.dir, status: t.status, manager: t.manager, counterpartyNsn: t.counterpartyNsn }));
    },
  },
  {
    // Employee/manager-meal leakage — multiple PROTEINS short at once rarely happens by
    // chance; it usually means unrecorded crew/manager meals (or theft). Pattern, not per-item.
    id: 'protein-meals', label: 'Proteins short together — likely unrecorded meals', order: 45, enabled: true,
    requires: ['variance'], params: { threshold: 50, minItems: 3 },
    run: (ctx) => {
      const th = ctx.params.threshold ?? 50;
      const PROTEIN = /\b(BEEF|PATTY|NUGGET|BACON|CHICKEN|MCCRISPY|FILET|SAUSAGE|CANADIAN|MCCHICKEN|MCNUGGET)\b/i;
      const shorts = (ctx.data.variance || []).filter(v => v.dolDiff < 0 && Math.abs(v.dolDiff) >= th && PROTEIN.test(v.descr || ''));
      if (shorts.length < (ctx.params.minItems ?? 3)) return [];
      const total = shorts.reduce((s, v) => s + (v.dolDiff || 0), 0);
      return [mkFinding('protein-meals', SEVERITY.high, `${shorts.length} protein items short together`,
        `${shorts.map(v => v.descr).slice(0, 6).join(', ')}${shorts.length > 6 ? '…' : ''} — $${Math.round(Math.abs(total))} short. Multiple proteins short at once points to unrecorded crew/manager meals (or theft). Audit meal logging + verify counts.`,
        Math.abs(total), { items: shorts.map(v => v.wrin) })];
    },
  },
  {
    // BIB / beverage yield — a fountain item SHORT with ~zero waste logged is almost always a
    // yield-setting / syrup-ratio / BIB-connection issue, not real loss.
    id: 'bib-yield', label: 'Beverage shorts w/ zero waste — BIB yield', order: 46, enabled: true,
    requires: ['variance'], params: { threshold: 50 },
    run: (ctx) => {
      const th = ctx.params.threshold ?? 50;
      const BEV = /\b(COKE|SPRITE|FANTA|HI ?C|DR ?PEPPER|MINUTE MAID|MM |LEMONADE|ICED TEA|TEA\/|FRUIT PUNCH|REFRESHER|BIB|LAVABURST|POWERADE|BARQ|SWEET TEA)\b/i;
      const hits = (ctx.data.variance || []).filter(v => v.dolDiff < 0 && Math.abs(v.dolDiff) >= th && BEV.test(v.descr || '')
        && ((Number(v.rawWaste) || 0) + (Number(v.compWaste) || 0) < 0.01));
      if (!hits.length) return [];
      const total = hits.reduce((s, v) => s + (v.dolDiff || 0), 0);
      return [mkFinding('bib-yield', SEVERITY.medium, `${hits.length} beverage item(s) short with zero waste`,
        `${hits.map(v => v.descr).slice(0, 6).join(', ')}${hits.length > 6 ? '…' : ''} — $${Math.round(Math.abs(total))} short, no waste logged. Check BIB yield settings / syrup-to-water ratios + BIB connections; recount.`,
        Math.abs(total), { items: hits.map(v => v.wrin) })];
    },
  },
];

// ── Yield-band cause overlay ──────────────────────────────────────────────────
// The Yields tab "points to a cause" (procedure / calibration) without adding $.
// If a flagged item's actual yield falls outside its concept-group band, link it.
function attachYieldCause(finding, varianceRow, yieldsLookup) {
  if (!yieldsLookup || varianceRow.yield == null) return;
  const band = yieldBandFor(varianceRow.wrin, yieldsLookup);
  if (!band) return;
  const status = yieldStatus(varianceRow.yield, band);
  if (status === 'below' || status === 'above') {
    finding.links.push({
      type: 'yield-cause',
      note: `yield ${varianceRow.yield.toFixed(1)} is ${status} the ${band.group} band (${band.lo}–${band.hi}) → likely ${status === 'below' ? 'over-portioning / cook loss' : 'calibration / under-portioning'}`,
    });
  }
}

// Timestamp of the first day of the EOM count window (period last-3-days) for
// judging whether a count-variance happened early (cascaded) or late (recountable).
function countWindowStartTs(period) {
  if (!period) return null;
  const [y, m] = String(period).split('-').map(Number);
  if (!y || !m) return null;
  const last = new Date(y, m, 0); // last day of month
  const start = new Date(y, m - 1, last.getDate() - 2); // last 3 days
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

// ── Editable-flow support ─────────────────────────────────────────────────────
// The owner's directive: the diagnosis flow must be editable as techniques are
// learned. checksConfig() exposes the tunable shape of the registry; applyChecksConfig()
// merges a saved override (order / enabled / params) back onto DEFAULT_CHECKS while
// PRESERVING each check's run() function — so a settings UI can persist plain JSON.
export function checksConfig(checks = DEFAULT_CHECKS) {
  return checks.map(c => ({ id: c.id, label: c.label, order: c.order, enabled: c.enabled !== false, params: { ...(c.params || {}) }, pending: !!c.pending }));
}
export function applyChecksConfig(saved, base = DEFAULT_CHECKS) {
  const byId = {};
  for (const s of (saved || [])) byId[s.id] = s;
  return base.map(c => {
    const o = byId[c.id];
    if (!o) return c;
    return {
      ...c,
      enabled: o.enabled !== false,
      order: o.order != null ? o.order : c.order,
      params: { ...(c.params || {}), ...(o.params || {}) },
    };
  }).sort((a, b) => a.order - b.order);
}

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
    .map(f => `[${f.severityWord.toUpperCase()}] ${f.title}${f.data?.wrin ? ` (WRIN ${f.data.wrin})` : ''} — ${f.detail}`);

  return {
    store, storeName, period,
    findings,
    variance: data.variance || [],          // full per-item list, for the tiered report
    ran, pending,
    totalDollars: findings.reduce((s, f) => s + (f.dollars || 0), 0),
    actionItems,
    summary: findings.length
      ? `${findings.length} finding${findings.length !== 1 ? 's' : ''}${pending.length ? ` · ${pending.length} check(s) awaiting data` : ''}`
      : (pending.length ? `No findings yet · ${pending.length} check(s) awaiting data` : 'No findings — clean'),
  };
}

// Full-coverage, tiered variance report (markdown) — every item ≥ ±$50, ranked, with a
// tiered action plan and Meridian's own cause overlays (yield-band, zero-waste flag,
// manager attribution, and recount-recoverability: does recounting NOW still recover it).
// `incomplete` = diagnoseIncompleteCount() result (byState never/early/stale). Lets the report
// (and therefore SAGE, which reads it) frame uncounted items CORRECTLY instead of calling them
// all "blanks to go count" — the Durant #5985 lesson. See memory/project-eom-uncounted-vs-qsrsoft.
export function formatDiagnosisReport(result, { threshold = 50, incomplete = null, caseSzByWrin = {} } = {}) {
  const V = (result.variance || []).filter(v => Math.abs(v.dolDiff || 0) >= threshold)
    .sort((a, b) => Math.abs(b.dolDiff || 0) - Math.abs(a.dolDiff || 0));
  const findings = result.findings || [];
  // Per-WRIN cause overlays from the findings.
  const yieldByWrin = {}, recountByWrin = {}, mgrByWrin = {};
  for (const f of findings) {
    const w = f.data && f.data.wrin; if (!w) continue;
    for (const l of (f.links || [])) if (l.type === 'yield-cause' && l.note) yieldByWrin[w] = l.note;
    if (f.checkId === 'raw-items-timing') {
      if (f.data.late === true) recountByWrin[w] = 'recount may still recover it';
      else if (f.data.late === false) recountByWrin[w] = 'early-period count — recount won’t recover it';
      if (f.data.manager) mgrByWrin[w] = f.data.manager;
    }
  }
  const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString();
  const dir = v => (v.dolDiff < 0 ? 'SHORT' : 'OVER');
  const causeTags = v => {
    const t = [];
    if (yieldByWrin[v.wrin]) t.push('yield setting likely off');
    if (v.dolDiff < 0 && (Number(v.rawWaste) || 0) + (Number(v.compWaste) || 0) < 0.01) t.push('zero waste logged — verify');
    if (recountByWrin[v.wrin]) t.push(recountByWrin[v.wrin]);
    if (mgrByWrin[v.wrin]) t.push('counted by ' + mgrByWrin[v.wrin]);
    return t;
  };

  const shorts = V.filter(v => v.dolDiff < 0), overs = V.filter(v => v.dolDiff >= 0);
  const net = V.reduce((s, v) => s + (v.dolDiff || 0), 0);

  // Manager-first re-tiering (Notes 36 #3): the CURRENT count's actionable items are loud;
  // items whose variance is LOCKED by an early-period count (recount won't recover the $) are
  // rolled up quietly — present, not lost, but not competing for a busy manager's attention.
  const isLocked = v => (recountByWrin[v.wrin] || '').startsWith('early');
  const focus = V.filter(v => !isLocked(v)).sort((a, b) => Math.abs(b.dolDiff) - Math.abs(a.dolDiff));
  const context = V.filter(v => isLocked(v)).sort((a, b) => Math.abs(b.dolDiff) - Math.abs(a.dolDiff));
  const noWaste = v => v.dolDiff < 0 && (Number(v.rawWaste) || 0) + (Number(v.compWaste) || 0) < 0.01;
  // Actual-vs-standard yield % from the row's own yield band (CoachQ-style over-portioning
  // fingerprint). std = band midpoint; over-portioned = actual below the band's low end.
  const yieldPct = v => {
    const a = Number(v.yield), lo = Number(v.yieldLo), hi = Number(v.yieldHi);
    if (!(a > 0) || !isFinite(lo) || !isFinite(hi) || (lo + hi) <= 0) return null;
    return a / ((lo + hi) / 2);
  };
  const overPortioned = v => { const p = yieldPct(v); return p != null && Number(v.yield) < Number(v.yieldLo); };
  // Compact chips (current state first) — rendered as pills by mdToHtml.
  const chipsFor = v => {
    const c = [v.dolDiff < 0 ? `{{bad|SHORT ${money(Math.abs(v.dolDiff))}}}` : `{{info|OVER ${money(Math.abs(v.dolDiff))}}}`];
    if ((recountByWrin[v.wrin] || '').startsWith('recount may')) c.push('{{warn|recount-worthy}}');
    const yp = yieldPct(v);
    if (overPortioned(v)) c.push(`{{bad|over-portioned ${Math.round(yp * 100)}% of std}}`);
    else if (yieldByWrin[v.wrin]) c.push('{{warn|yield off?}}');
    if (noWaste(v)) c.push('{{warn|no waste logged}}');
    return c.join(' ');
  };
  // Recount qty expressed in full cases — "look for ~3 cases" beats "≈2,091 units" (owner req).
  const casesOf = v => { const cs = Number(caseSzByWrin[String(v.wrin)]); return (cs > 0 && v.variance) ? Number(v.variance) / cs : null; };
  const casesNote = v => { const c = casesOf(v); return c != null && Math.abs(c) >= 0.1 ? ` · ~${c > 0 ? '+' : ''}${c.toFixed(1)} cs` : ''; };
  const actionFor = v => overPortioned(v) ? `over-portioning — audit the station recipe/portion (running ${Math.round(yieldPct(v) * 100)}% of standard yield)`
    : yieldByWrin[v.wrin] ? 'check yield setting, then recount'
    : noWaste(v) ? 'verify waste logging, then recount'
    : (recountByWrin[v.wrin] || '').startsWith('recount may') ? 'recount now — still recoverable'
    : 'recount + verify counts';

  const L = [`# FOB Variance Analysis — ${result.storeName || result.store} · ${result.period}`, ''];
  L.push(`**Bottom line:** ${V.length} item${V.length === 1 ? '' : 's'} exceed ±$${threshold} · **Net variance ${money(net)}**`);
  L.push(`Shortages: ${shorts.length} (${money(shorts.reduce((s, v) => s + v.dolDiff, 0))}) · Overages: ${overs.length} (${money(overs.reduce((s, v) => s + v.dolDiff, 0))})`, '');

  if (!V.length) { L.push('_No items exceed the threshold — count looks clean._'); return L.join('\n'); }

  // ── FOCUS NOW (loud) — the short list a manager acts on this count ──
  L.push('## 👉 Focus now', '');
  if (focus.length) {
    const TOP = 6;
    focus.slice(0, TOP).forEach(v => {
      const mgr = mgrByWrin[v.wrin] ? ` · _counted by ${mgrByWrin[v.wrin]}_` : '';
      L.push(`- **${v.descr || v.wrin}** ${chipsFor(v)} — ${actionFor(v)}${casesNote(v)}${mgr}`);
    });
    if (focus.length > TOP) L.push(`- _+${focus.length - TOP} more current item(s) in the full detail below._`);
  } else {
    L.push("_Nothing a recount can recover this count — the open variance is locked in from earlier counts (see context below)._");
  }
  L.push('');

  // ── EARLIER-COUNT CONTEXT (quiet, rolled up) — kept for scope, de-emphasized ──
  if (context.length) {
    const ctxTot = context.reduce((s, v) => s + v.dolDiff, 0);
    const mgrs = [...new Set(context.map(v => mgrByWrin[v.wrin]).filter(Boolean))];
    const top3 = context.slice(0, 3).map(v => `${v.descr || v.wrin} (${money(v.dolDiff)})`).join(' · ');
    L.push('## 📌 Earlier-count context', '');
    L.push(`${context.length} item${context.length === 1 ? '' : 's'} (${money(ctxTot)}) already cascaded from **early-period counts** — recounting now won't recover the dollars; fix the source counts going forward.${mgrs.length ? ` Early counts by: ${mgrs.join(', ')}.` : ''}`);
    L.push(`_${top3}${context.length > 3 ? ` · +${context.length - 3} more` : ''}_`, '');
  }

  // ── Systemic patterns (compact) ──
  const systemic = findings.filter(f => ['protein-meals', 'bib-yield', 'waste-patterns', 'yields', 'incomplete-count', 'fob-components'].includes(f.checkId));
  if (systemic.length) {
    L.push('## 🛠️ Systemic patterns', '');
    systemic.forEach(f => L.push(`- **${f.title}** — ${f.detail}`));
    L.push('');
  }

  // ── Portioning watch — actual-vs-standard yield (CoachQ-style over-portioning fingerprint) ──
  const portio = V.filter(v => overPortioned(v)).sort((a, b) => (yieldPct(a) || 1) - (yieldPct(b) || 1));
  if (portio.length) {
    L.push('## 🎚️ Portioning watch — running below standard yield', '');
    portio.slice(0, 12).forEach(v => {
      const std = (Number(v.yieldLo) + Number(v.yieldHi)) / 2;
      L.push(`- **${v.descr || v.wrin}** — yield ${Number(v.yield).toFixed(2)} vs std ${std.toFixed(2)} (**${Math.round(yieldPct(v) * 100)}% of std**${v.dolDiff != null ? `, ${money(v.dolDiff)}` : ''})`);
    });
    L.push('_Low actual-vs-standard yield = more product used per serving than the recipe allows — audit the station\'s portion/recipe, not the count._', '');
  }

  // ── Count integrity — WHY items read "uncounted" (Notes: Durant #5985) ──
  // Critical framing so nobody (or SAGE) treats early/stale items as "free money — just count
  // it." "Uncounted" here = not counted in the final window, NOT "never counted."
  if (incomplete && incomplete.uncountedCount > 0) {
    const bs = incomplete.byState || {};
    const m = (o) => `${(o && o.n) || 0} item${((o && o.n) || 0) === 1 ? '' : 's'} (${money((o && o.value) || 0)})`;
    L.push('## 🧮 Count integrity — the "uncounted" list, explained', '');
    if (bs.never && bs.never.n) L.push(`- **${m(bs.never)} NEVER counted** — true blanks. Count these before close (real recovery).`);
    if (bs.early && bs.early.n) L.push(`- **${m(bs.early)} counted EARLY** this period — QSRSoft already shows them counted. Recount only if the count looks *wrong*; it will **not** recover this period's dollars (they cascade). NOT "just go count it" money.`);
    if (bs.stale && bs.stale.n) L.push(`- **${m(bs.stale)} STALE / likely deactivated (ghost floats)** — last counted a prior period; a residual on-hand is riding. **Verify:** still sellable/usable → count it; obsolete/gone → **write off before close** (QSRSoft force-zeros a deactivated item ~30–45 days out and fires the full balance as a loss anyway). These inflate "value at risk" without being real count work.`);
    L.push('');
  }

  // ── Reference — full detail (present but demoted below the manager summary) ──
  L.push('## Reference — full detail', '', `_All ${V.length} items ≥ ±$${threshold}, ranked._`, '');
  const anyCases = V.some(v => casesOf(v) != null);
  if (anyCases) {
    L.push('| # | Item | WRIN | $ Var | Qty Var | Cases | Dir |', '|--:|------|------|------:|--------:|------:|-----|');
    V.forEach((v, i) => { const c = casesOf(v); L.push(`| ${i + 1} | ${v.descr || v.wrin} | ${v.wrin || ''} | ${money(v.dolDiff)} | ${(Number(v.variance) || 0).toFixed(1)} | ${c != null ? c.toFixed(1) : '—'} | ${dir(v)} |`); });
  } else {
    L.push('| # | Item | WRIN | $ Var | Qty Var | Dir |', '|--:|------|------|------:|--------:|-----|');
    V.forEach((v, i) => L.push(`| ${i + 1} | ${v.descr || v.wrin} | ${v.wrin || ''} | ${money(v.dolDiff)} | ${(Number(v.variance) || 0).toFixed(1)} | ${dir(v)} |`));
  }
  L.push('');
  const tier = (label, lo, hi) => {
    const items = focus.filter(v => { const a = Math.abs(v.dolDiff); return a >= lo && (hi == null || a < hi); });
    if (!items.length) return;
    L.push(`### ${label}`, '');
    items.forEach(v => { const tags = causeTags(v); L.push(`- **${v.descr || v.wrin}** (${money(v.dolDiff)}, ${dir(v)}) — ${tags.length ? tags.join('; ') : 'recount + verify waste logging'}`); });
    L.push('');
  };
  tier('🔴 CRITICAL — immediate ( ≥ $200 )', 200, null);
  tier('🟠 HIGH — within 24h ( $100–$199 )', 100, 200);
  tier('🟡 MODERATE — within 48–72h ( $50–$99 )', threshold, 100);

  if ((result.pending || []).length) L.push('_Checks awaiting data: ' + result.pending.map(p => p.label).join(', ') + '._');
  return L.join('\n');
}
