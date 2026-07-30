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
const _mny = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString(); // module-level $ (checks run outside formatDiagnosisReport)

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
    // UOM sanity (Gemini trap #2 — "3 vs 900"): a variance whose QUANTITY is a clean
    // whole-case multiple is a classic case-vs-each entry error, not real usage. We can't
    // recompute the entered count, so this is a VERIFY nudge (not a hard claim): if the count
    // was entered in cases when the system wanted eaches, the monthly figure — and next
    // month's opening baseline — is corrupted. Owner-requested 2026-07-30.
    id: 'uom-sanity', label: 'UOM sanity — variance is a clean case-multiple (verify entry)', order: 35, enabled: true,
    requires: ['variance'], params: { minDollar: 50, tol: 0.05, minCases: 1 },
    run: (ctx) => {
      const caseSz = {};
      for (const it of (ctx.data.rawItems || [])) { if (it.caseSz > 1) caseSz[String(it.wrin)] = it.caseSz; }
      if (!Object.keys(caseSz).length) return []; // no case sizes → can't judge units
      const minDol = ctx.params.minDollar ?? 50, tol = ctx.params.tol ?? 0.05, minCases = ctx.params.minCases ?? 1;
      const out = [];
      for (const v of (ctx.data.variance || [])) {
        const cs = caseSz[String(v.wrin)];
        if (!cs) continue;
        const qty = Math.abs(Number(v.variance) || 0);
        if (Math.abs(v.dolDiff || 0) < minDol || qty < cs * minCases) continue;
        const mult = qty / cs;
        const near = Math.abs(mult - Math.round(mult));
        if (near > tol || Math.round(mult) < minCases) continue;
        out.push(mkFinding('uom-sanity', SEVERITY.info,
          `Verify units: ${v.descr || v.wrin}`,
          `$${Math.round(v.dolDiff)} variance ≈ ${Math.round(mult)} full case${Math.round(mult) !== 1 ? 's' : ''} (${cs}/case) — confirm this wasn't a case-vs-each count entry before trusting it`,
          Math.abs(v.dolDiff || 0), { wrin: v.wrin, caseSz: cs, cases: Math.round(mult) }));
      }
      return out.sort((a, b) => b.dollars - a.dollars).slice(0, 10);
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
    // Count MANIPULATION (owner integrity req #47): a store re-entering a count to NEGATE the
    // variance it doesn't like. Legit travel-path counting (QSRSoft Inventory app, primary→service
    // walkthrough, lock-in submits every 15-20 items under Live Inventory) yields 2-4 entries/item/
    // day — most items live in 2-4 storage locations. MORE than that, ESPECIALLY a later entry that
    // walks the variance back toward zero, is the tell. See memory/project-inventory-integrity-detection.
    id: 'count-manipulation', label: 'Count manipulation — excessive same-day re-counts', order: 26, enabled: true,
    requires: ['rawItems'], params: { maxPerDay: 4, believableDollar: 50 },
    run: (ctx) => {
      const max = ctx.params.maxPerDay ?? 4, believable = ctx.params.believableDollar ?? 50;
      const out = [];
      for (const d of (ctx.data.rawItems || [])) {
        const counts = (d.counts || []).filter(c => c && c.dt);
        if (counts.length <= max) continue;
        const byDay = {};
        for (const c of counts) { const day = String(c.dt).slice(0, 10); (byDay[day] || (byDay[day] = [])).push(c); }
        for (const day in byDay) {
          const dc = byDay[day].slice().sort((a, b) => String(a.dt).localeCompare(String(b.dt)));
          if (dc.length <= max) continue;
          const diffs = dc.map(c => Number(c.difference) || 0);
          const firstBig = diffs.find(v => Math.abs(v) >= believable);
          const lastDiff = diffs[diffs.length - 1];
          // "Negate" tell: an earlier believable count exists, and a later entry walks the variance
          // back toward zero (|last| < half of |first big|) — a re-count to erase an unfavorable result.
          const negated = firstBig != null && Math.abs(lastDiff) < Math.abs(firstBig) * 0.5;
          out.push(mkFinding('count-manipulation', (dc.length >= max + 2 || negated) ? SEVERITY.high : SEVERITY.medium,
            `Excessive re-counts: ${d.descr || d.wrin}`,
            `${dc.length} count entries on ${day} (2-${max} is normal for travel-path counting)${negated ? ` — and a later entry walked the variance from ${_mny(firstBig)} back toward ${_mny(lastDiff)}, which looks like a re-count to negate an unfavorable result` : ''}. Verify the earlier counts were believable and why it was re-entered.`,
            Math.abs(lastDiff), { wrin: d.wrin, day, nCounts: dc.length, negated }));
        }
      }
      // Cross-item pattern = intent, not a one-off correction. Bump severity to critical when the
      // negate signal shows on 2+ items (the owner's "found on more than one item" tell).
      const negItems = out.filter(f => f.data?.negated);
      if (negItems.length >= 2) negItems.forEach(f => { f.severity = SEVERITY.critical; f.severityWord = sevWord(f.severity); f.detail += ` PATTERN: the same negate-the-variance move appears on ${negItems.length} items today — treat as intentional, not a correction.`; });
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
  {
    // Waste INFLATION (integrity #47): waste artificially spiked near EOM / on the count day to
    // absorb a variance, OR a repeated-static value entered nightly (the "same fry waste every
    // night" shortcut — a guess to clear the EOD prompt, not a real weigh-out). Both corrupt
    // theoretical on-hand. See memory/project-inventory-integrity-detection.
    id: 'waste-inflation', label: 'Waste inflation — EOM/count-day spike or static nightly value', order: 51, enabled: true,
    requires: ['waste'], params: { spikeFactor: 2.5, minDays: 6, staticRepeats: 4, minSpike: 50 },
    run: (ctx) => {
      const events = (ctx.data.waste || []).filter(w => w && w.dt && Number(w.amount) > 0);
      if (events.length < 3) return [];
      const out = [];
      const P = ctx.params;
      // Daily totals across the period.
      const byDay = {};
      for (const w of events) { const d = String(w.dt).slice(0, 10); byDay[d] = (byDay[d] || 0) + (Number(w.amount) || 0); }
      const days = Object.keys(byDay).sort();
      if (days.length >= (P.minDays ?? 6)) {
        const sorted = days.map(d => byDay[d]).sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)] || 0;
        const factor = P.spikeFactor ?? 2.5;
        const windowStart = countWindowStartTs(ctx.period);
        for (const d of days) {
          if (median <= 0 || byDay[d] < median * factor || byDay[d] < (P.minSpike ?? 50)) continue;
          const t = Date.parse(d);
          const nearEOM = windowStart != null && t != null && t >= windowStart;
          out.push(mkFinding('waste-inflation', nearEOM ? SEVERITY.high : SEVERITY.medium,
            `Waste spike: ${d}`,
            `${_mny(byDay[d])} logged that day vs a ${_mny(median)} daily median (${(byDay[d] / median).toFixed(1)}×)${nearEOM ? ' — and it lands in the count window, exactly where waste gets inflated to absorb a variance' : ''}. Verify it was physically weighed/thrown, not entered to make a number balance.`,
            byDay[d], { day: d, nearEOM, median }));
        }
      }
      // Repeated-static value: the exact same entry amount on ≥N distinct days = a guessed/copy-paste
      // nightly value, not a real weigh-out. "Zero is better than fake."
      const amtDays = {};
      for (const w of events) { const a = (Number(w.amount) || 0).toFixed(2); const d = String(w.dt).slice(0, 10); (amtDays[a] || (amtDays[a] = new Set())).add(d); }
      const staticHits = Object.keys(amtDays)
        .filter(a => Number(a) > 0 && amtDays[a].size >= (P.staticRepeats ?? 4))
        .sort((a, b) => amtDays[b].size - amtDays[a].size);
      for (const a of staticHits) {
        const n = amtDays[a].size;
        out.push(mkFinding('waste-inflation', SEVERITY.medium,
          `Repeated static waste value: ${_mny(Number(a))}`,
          `The exact same ${_mny(Number(a))} waste amount was logged on ${n} separate days — looks like a guessed/copy-paste value to clear the closing prompt, not a real weigh-out. Coach: log the real weight or leave it blank ("zero is better than fake").`,
          Number(a) * n, { amount: Number(a), nDays: n }));
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

  // ── TOP 5 — DO NOW (owner req #46, focused to FOOD + CONDIMENT only per owner — the profit-driver
  // classes worth a manager's here-and-now energy). Cut-and-dry, ranked by best chance to improve
  // THIS cycle. Reuses the count-integrity buckets, recount-worthiness, and the portioning fingerprint.
  const isFCcls = c => { const x = normClass(c); return x === 'food' || x === 'condiment'; };
  const isFC = v => isFCcls(v && v.cls);
  const doNow = [];
  const neverFC = ((incomplete && incomplete.uncounted) || []).filter(u => u.state === 'never' && isFCcls(u.cls)).sort((a, b) => (b.valueAtRisk || 0) - (a.valueAtRisk || 0));
  if (neverFC.length) {
    const nv = neverFC.reduce((s, u) => s + (u.valueAtRisk || 0), 0);
    doNow.push({ score: 1e6 + nv, text: `**Count the ${neverFC.length} never-counted Food/Condiment item${neverFC.length === 1 ? '' : 's'} before close** (~${money(nv)}) — the only true "count it and recover" money. Start with: ${neverFC.slice(0, 3).map(u => u.descr || u.wrin).join(', ')}.` });
  }
  V.filter(v => isFC(v) && (recountByWrin[v.wrin] || '').startsWith('recount may')).sort((a, b) => Math.abs(b.dolDiff) - Math.abs(a.dolDiff)).slice(0, 2)
    .forEach(v => doNow.push({ score: 5e5 + Math.abs(v.dolDiff), text: `**Recount ${v.descr || v.wrin}** (${money(v.dolDiff)}${casesNote(v)}) — the count looks off and it's still recoverable this cycle.` }));
  V.filter(v => overPortioned(v) && isFC(v)).sort((a, b) => Math.abs(b.dolDiff) - Math.abs(a.dolDiff)).slice(0, 2)
    .forEach(v => doNow.push({ score: 4e5 + Math.abs(v.dolDiff), text: `**Fix portioning on ${v.descr || v.wrin}** — running ${Math.round(yieldPct(v) * 100)}% of standard yield; audit the station's recipe/portion now.` }));
  const staleFC = ((incomplete && incomplete.uncounted) || []).filter(u => u.state === 'stale' && isFCcls(u.cls));
  if (staleFC.length) {
    const sv = staleFC.reduce((s, u) => s + (u.valueAtRisk || 0), 0);
    doNow.push({ score: 3e5 + sv, text: `**Verify & clear the ${staleFC.length} obsolete/inactive Food/Condiment item${staleFC.length === 1 ? '' : 's'}** (${money(sv)} on hand) — count if usable, waste to zero if it won't be used before expiration; don't let it ride into next month's opening.` });
  }
  const topFC = V.filter(v => !(recountByWrin[v.wrin] || '').startsWith('early') && isFC(v)).find(v => !(recountByWrin[v.wrin] || '').startsWith('recount may') && !overPortioned(v));
  if (topFC) doNow.push({ score: 2e5 + Math.abs(topFC.dolDiff), text: `**Investigate ${topFC.descr || topFC.wrin}** (${money(topFC.dolDiff)}, ${dir(topFC)}${casesNote(topFC)}) — ${causeTags(topFC)[0] || 'recount + verify waste logging'}.` });
  if (doNow.length) {
    doNow.sort((a, b) => b.score - a.score);
    L.push('## ✅ Top 5 — do these now · Food & Condiment (best shot at improving this result)', '');
    doNow.slice(0, 5).forEach((d, i) => L.push(`${i + 1}. ${d.text}`));
    L.push('', '_Cut-and-dry, focused on the profit-driver classes: knock these out, then **re-run the diagnosis** to see what changed. Full analysis (all classes) below._', '');
  }

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

  // ── DECISION GUIDE (2×2) — how to act on a variance once the count is verified ──
  // Grounded in verified fact: QSRSoft anchors variance at the PERIOD BOUNDARY (ending inventory
  // → next period's beginning), so a mid-month COUNT ERROR telescopes out of the monthly figure
  // (self-corrects); only a REAL physical loss and NOT-yet-counted items remain. The 2×2 keeps a
  // manager from chasing a locked, verified one-off — while still chasing the CAUSE of a recurring
  // loss (it can't be recovered this period, but it recurs next). See memory/project-eom-uncounted.
  L.push('## 🧭 Decision guide — act on it, or let it go?', '');
  L.push('_Verified: a mid-month **count error** washes out of the monthly number (QSRSoft anchors period-to-period, so intermediate counts cancel). Only a **real physical loss** and **not-yet-counted** items still move the figure — so the only question that matters is which of those a variance is._', '');
  L.push('| Once the EOM count is verified | One-off | Recurring (see pattern chips) |', '|---|---|---|');
  L.push('| **Real loss** | Locked — note it, move on. No EOM recovery. | Locked this period, but **chase the cause** (portion/yield/theft/process) — it comes back next month. |');
  L.push('| **Count artifact** | Noise — it self-corrected; coach count discipline. | Early count not re-counted at EOM → **fixable**: get a real count now (protects next month\'s opening). |');
  L.push('_"Don\'t chase rabbits at EOM" applies to the top-left only. The value is separating a locked one-off (drop it) from a recurring loss (fix the cause) and from a still-fixable count (recount)._', '');

  // ── EARLIER-COUNT CONTEXT — reframed as an ACCURACY/PERFORMANCE signal, not a $ recovery (owner
  // 2026-07-30, grounded in the telescoping math). Mid-cycle counts wash out of the final EOM number
  // (anchored only by the opening = prior EOM count, and this EOM count) — so they aren't this
  // cycle's dollars. Their value is: WHERE a discrepancy first surfaced + a read on count accuracy/
  // consistency. Caveat: with Live Inventory + counting up to 3 days pre-close, a WRONG count inside
  // that window IS the EOM number, and any wrong count corrupts the running theoretical + can distort
  // next month's opening. Takeaway = accuracy + consistency, not recovery. See memory/project-eom-uncounted.
  if (context.length) {
    const ctxTot = context.reduce((s, v) => s + v.dolDiff, 0);
    const mgrs = [...new Set(context.map(v => mgrByWrin[v.wrin]).filter(Boolean))];
    const top3 = context.slice(0, 3).map(v => `${v.descr || v.wrin} (${money(v.dolDiff)})`).join(' · ');
    L.push('## 📌 Earlier-count context — accuracy signal, not this cycle\'s $', '');
    L.push(`${context.length} item${context.length === 1 ? '' : 's'} (${money(ctxTot)}) surfaced at **early-period counts**. These **wash out of the final EOM number** (only the opening + this EOM count drive the P&L), so this is **not recoverable $** — it's a **read on count accuracy/consistency** and **where** the discrepancy first showed. Fix the *source counts going forward*: a wrong count doesn't cost this cycle, but it corrupts the running theoretical and can distort next month's opening. **Accuracy + consistency is the goal.**${mgrs.length ? ` Early counts by: ${mgrs.join(', ')}.` : ''}`);
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
    // Itemized TO-COUNT list — the actual never-counted products a manager must complete
    // (owner req: surface the uncounted list in the report + SAGE, not just a hover count).
    const neverItems = (incomplete.uncounted || []).filter(u => u.state === 'never').sort((a, b) => b.valueAtRisk - a.valueAtRisk).slice(0, 25);
    if (neverItems.length) {
      L.push('', '### 📝 To-count list — complete before close', '');
      neverItems.forEach(u => L.push(`- **${u.descr || u.wrin}**${u.valueAtRisk ? ` — ~${money(u.valueAtRisk)} on hand` : ''}${u.cls ? ` · ${u.cls}` : ''}`));
      const more = (bs.never?.n || 0) - neverItems.length;
      if (more > 0) L.push(`- _+${more} more._`);
    }
    if (bs.early && bs.early.n) L.push('', `- **${m(bs.early)} counted EARLY** this period — QSRSoft already shows them counted. Recount only if the count looks *wrong*; it will **not** recover this period's dollars (they cascade). NOT "just go count it" money.`);
    if (bs.stale && bs.stale.n) L.push(`- **${m(bs.stale)} OBSOLETE / DISCONTINUED / INACTIVE** — last counted a prior period; a residual on-hand is riding. **Always verify with a physical count first.** Food/condiment: if it won't be used before its expiration, waste it to zero to account for the balance, then deactivate the WRIN at a verified zero on-hand. Non-product (promo / Happy Meal items / paper): count and keep it — it may be usable (donation, local giveaway); deactivate only once it's genuinely used up and verified at zero. These inflate "value at risk" without being real count work.`);
    // Itemized obsolete/discontinued/inactive verify-&-clear list (Notes: Durant #5985 / #38). Each
    // gets a CLASS-AWARE direction so nobody discards usable non-product (owner req 2026-07-30):
    // food/condiment (perishable) → verify count, waste-to-zero if it won't be used before expiration,
    // then deactivate the WRIN at a verified zero; non-product (promo toys e.g. HM26, paper) → count
    // & KEEP if usable (donation / local giveaway), deactivate only once genuinely at zero.
    const perishable = (cls) => { const c = normClass(cls); return c === 'food' || c === 'condiment'; };
    const staleItems = (incomplete.uncounted || []).filter(u => u.state === 'stale').sort((a, b) => b.valueAtRisk - a.valueAtRisk).slice(0, 15);
    if (staleItems.length) {
      L.push('', '### Obsolete / Discontinued / Inactive — verify & clear before close', '');
      staleItems.forEach(u => {
        const head = `- **${u.descr || u.wrin}** (${normClass(u.cls) || 'item'}) — on-hand ${money(u.onHandAmt)} · last counted ${u.lastCounted || '—'} → **verify & enter a count.**`;
        const dir = perishable(u.cls)
          ? ` If it won't be used before its expiration, **waste it to zero** (−${money(u.valueAtRisk)}) to account for the balance, then **deactivate the WRIN** at a verified zero on-hand.`
          : ` **Keep it in inventory** if usable (donation / local giveaway) — do **not** discard. Deactivate the WRIN only once it's genuinely used up and verified at zero.`;
        L.push(head + dir);
      });
      const more = (incomplete.byState?.stale?.n || 0) - staleItems.length;
      if (more > 0) L.push(`- _+${more} more item(s)._`);
      L.push('_Rule: always verify with a physical count first. **Food/condiment** → if it won\'t be used before expiration, waste to zero, then deactivate the WRIN at a verified zero on-hand. **Non-product** (promo, Happy Meal items, paper) → count and keep if usable (donation / local giveaway); deactivate only once genuinely at zero. Never discard usable product._');
    }
    L.push('');
  }

  // ── Reference — full detail ──. Food + Condiment lead (the profit-driver classes the owner
  // works first); Paper / Non-Product are broken out into their own section below so they're
  // available but not cluttering the here-and-now (owner req 2026-07-30). Class column added.
  const anyCases = V.some(v => casesOf(v) != null);
  const isFoodCond = v => { const c = normClass(v.cls); return c === 'food' || c === 'condiment'; };
  const foodCond = V.filter(isFoodCond);
  const otherCls = V.filter(v => !isFoodCond(v));
  const detailTable = (items) => {
    if (!items.length) { L.push('_None in this group._', ''); return; }
    if (anyCases) {
      L.push('| # | Item | Class | WRIN | $ Var | Qty Var | Cases | Dir |', '|--:|------|-------|------|------:|--------:|------:|-----|');
      items.forEach((v, i) => { const c = casesOf(v); L.push(`| ${i + 1} | ${v.descr || v.wrin} | ${normClass(v.cls) || '—'} | ${v.wrin || ''} | ${money(v.dolDiff)} | ${(Number(v.variance) || 0).toFixed(1)} | ${c != null ? c.toFixed(1) : '—'} | ${dir(v)} |`); });
    } else {
      L.push('| # | Item | Class | WRIN | $ Var | Qty Var | Dir |', '|--:|------|-------|------|------:|--------:|-----|');
      items.forEach((v, i) => L.push(`| ${i + 1} | ${v.descr || v.wrin} | ${normClass(v.cls) || '—'} | ${v.wrin || ''} | ${money(v.dolDiff)} | ${(Number(v.variance) || 0).toFixed(1)} | ${dir(v)} |`));
    }
    L.push('');
  };
  L.push('## Reference — full detail', '', `_Food + Condiment (${foodCond.length}) — the profit-driver classes, shown first. Paper / Non-Product broken out below._`, '');
  detailTable(foodCond);
  if (otherCls.length) {
    L.push(`### Other classes — Paper / Non-Product (${otherCls.length})`, '');
    L.push('_Fine print: Food + Condiment (≈22–29% of revenue) is where variance/waste attention moves the P&L; Paper / Non-Product is ≈3–4% and rarely a real opportunity. Raw paper is seldom wasted on its own — it\'s normally accounted for inside a completed-product waste — so treat these as reference, not an action area unless a number is clearly out of line._', '');
    detailTable(otherCls);
  }
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
