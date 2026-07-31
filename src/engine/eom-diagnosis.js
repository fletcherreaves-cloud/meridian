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
import { normClass, diagnoseIncompleteCount, nonProductDueToday } from './eom-inventory.js';
import { summarizeWasteByManager, summarizeTransfers, yieldBandFor, yieldStatus } from './eom-parsers.js';
import { eventTs, recountBatchTiming, recountTimingSentence } from './eom-recount-forensics.js';

export const SEVERITY = { critical: 3, high: 2, medium: 1, info: 0 };
const sevWord = s => ({ 3: 'critical', 2: 'high', 1: 'medium', 0: 'info' }[s] || 'info');
const _mny = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString(); // module-level $ (checks run outside formatDiagnosisReport)
// Fountain / self-serve beverage items — at self-serve-tower stores their yield runs structurally
// low (free refills we can't meter), so it must NOT read as a loss or over-portioning there.
const FOUNTAIN_BEV_RE = /\b(COKE|SPRITE|FANTA|HI ?C|DR ?PEPPER|MINUTE MAID|MM |LEMONADE|ICED TEA|TEA\/|FRUIT PUNCH|REFRESHER|BIB|LAVABURST|POWERADE|BARQ|SWEET TEA)\b/i;

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
      // Time-aware + cost-control-aware (owner 2026-07-30): Food, Condiment AND Paper are due to 100%
      // by EOD; Non-Product is not counted until TOMORROW → don't call it out today. And only
      // Food/Condiment $ is the cost-control "at risk" money; Paper is due today for COMPLETENESS,
      // not cost. See reference-eom-count-timing-by-class.
      const U = diag.uncounted || [];
      const npDue = nonProductDueToday(ctx.period, ctx.asOf);  // last day of month → Non-Product due today too
      const fc = U.filter(u => { const c = normClass(u.cls); return c === 'food' || c === 'condiment'; });
      const paper = U.filter(u => normClass(u.cls) === 'paper');
      const nonProd = U.filter(u => { const c = normClass(u.cls); return c !== 'food' && c !== 'condiment' && c !== 'paper'; });
      const dueToday = fc.length + paper.length + (npDue ? nonProd.length : 0);
      if (!dueToday) return [];  // only Non-Product left AND not the last day → nothing due today
      const fcVal = fc.reduce((s, u) => s + (u.valueAtRisk || 0), 0);
      const bits = [];
      if (fc.length) bits.push(`${fc.length} Food/Condiment (~$${Math.round(fcVal)} at risk — the cost-control money)`);
      if (paper.length) bits.push(`${paper.length} Paper (due by EOD for completeness — not cost-control)`);
      if (npDue && nonProd.length) bits.push(`${nonProd.length} Non-Product (due today — it's the last day of the month)`);
      const npNote = (!npDue && nonProd.length) ? ` · ${nonProd.length} Non-Product not due until tomorrow (expected — not counted today)` : '';
      const sev = fcVal >= 500 ? SEVERITY.high : fc.length ? SEVERITY.medium : SEVERITY.info;
      return [mkFinding('incomplete-count', sev,
        `${dueToday} item${dueToday === 1 ? '' : 's'} still uncounted — due by EOD`,
        `${bits.join(' · ')}${npNote}.`,
        fcVal, { uncounted: [...fc, ...paper].slice(0, 20), fcCount: fc.length, paperCount: paper.length, nonProductPending: nonProd.length })];
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
    // Recount SWING (integrity, Notes 37 / CoachQ fry case store 29760): a same-day pair of counts on
    // ONE item where the recorded variance swings by a large amount — the classic "counted 24, recounted
    // 413" overshoot. Even with just 2 counts (below count-manipulation's >4/day threshold), a swing this
    // big with no delivery between should trigger a THIRD count by a different manager before saving.
    // Non-accusatory: we don't claim which count was wrong — we ask them to verify so the on-hand is clean.
    id: 'recount-swing', label: 'Recount swing — large same-day count-to-count change (verify 3rd count)', order: 27, enabled: true,
    requires: ['rawItems'], params: { minSwing: 150 },
    run: (ctx) => {
      const minSwing = ctx.params.minSwing ?? 150;
      const out = [];
      for (const d of (ctx.data.rawItems || [])) {
        const counts = (d.counts || []).filter(c => c && c.dt && c.difference != null);
        if (counts.length < 2) continue;
        const byDay = {};
        for (const c of counts) { const day = String(c.dt).slice(0, 10); (byDay[day] || (byDay[day] = [])).push(c); }
        for (const day in byDay) {
          const dc = byDay[day].slice().sort((a, b) => String(`${a.dt} ${a.tm || ''}`).localeCompare(`${b.dt} ${b.tm || ''}`));
          if (dc.length < 2) continue;
          // Largest consecutive swing in the recorded variance ($) across the day's counts.
          let best = null;
          for (let i = 1; i < dc.length; i++) {
            const a = Number(dc[i - 1].difference) || 0, b = Number(dc[i].difference) || 0;
            const swing = Math.abs(b - a);
            if (!best || swing > best.swing) best = { swing, a, b, from: dc[i - 1], to: dc[i], crossZero: (a < 0) !== (b < 0) && a !== 0 && b !== 0 };
          }
          if (!best || best.swing < minSwing) continue;
          const sev = (best.crossZero || best.swing >= minSwing * 3) ? SEVERITY.high : SEVERITY.medium;
          const mgrs = [best.from.manager, best.to.manager].filter(Boolean);
          const sameMgr = mgrs.length === 2 && mgrs[0] === mgrs[1];
          out.push(mkFinding('recount-swing', sev,
            `Recount swing: ${d.descr || d.wrin}`,
            `On ${day} the recorded variance moved ${_mny(best.a)} → ${_mny(best.b)} between two counts (${_mny(best.swing)} swing${best.crossZero ? ', crossing zero' : ''})${mgrs.length ? (sameMgr ? `, both counts by ${mgrs[0]}` : ` (${best.from.manager || '?'} → ${best.to.manager || '?'})`) : ''}. A swing this large between counts — with no delivery in between — is exactly where a THIRD count by a different manager should be required before saving. Verify which count was right so the on-hand is clean.`,
            best.swing, {
              wrin: d.wrin, day, swing: best.swing, crossZero: best.crossZero, sameMgr,
              manager: sameMgr ? mgrs[0] : null,
              origTs: eventTs(best.from.dt, best.from.tm), corrTs: eventTs(best.to.dt, best.to.tm),
            }));
        }
      }
      // Pattern + TIMING forensics (owner 2026-07-31): the same single counter offsetting many items on
      // one day is where padding hides. A genuine recount takes physical time to walk + recount each
      // item; if the offsetting corrections landed in a window too short for that, the "recount" didn't
      // happen. Group the same-manager offsetting swings per day and test the batch timing.
      const sm = out.filter(f => f.data?.sameMgr);
      if (sm.length >= 2) sm.forEach(f => { f.detail += ` PATTERN: the same single-counter recount-swing shows on ${sm.length} items today.`; });
      const byMgrDay = {};
      for (const f of sm) {
        const k = `${f.data.manager || '?'}|${f.data.day}`;
        (byMgrDay[k] || (byMgrDay[k] = [])).push(f);
      }
      for (const k of Object.keys(byMgrDay)) {
        const batch = byMgrDay[k].filter(f => f.data.crossZero);   // offsetting swings only
        if (batch.length < 3) continue;
        const timing = recountBatchTiming(batch.map(f => ({ wrin: f.data.wrin, origTs: f.data.origTs, corrTs: f.data.corrTs })));
        if (timing.verdict === 'implausible') {
          const sentence = ' ' + recountTimingSentence(timing);
          byMgrDay[k].forEach(f => { f.detail += sentence; f.severity = Math.max(f.severity, SEVERITY.high); f.severityWord = sevWord(f.severity); if (f.data) f.data.timing = timing; });
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
  {
    // High-$ waste SESSION (integrity, Notes 37 A2): one manager's waste on one day totals far above a
    // typical session. Two legitimate-vs-not paths, framed without accusation: if it's expired product
    // pulled at once, it's real waste → coach ordering-to-on-hands + FIFO rotation so it stops recurring;
    // if not, verify it was physically thrown, not entered to absorb a variance. Distinct from
    // waste-inflation (store-wide daily spike) and waste-patterns (overall per-manager share).
    id: 'waste-session', label: 'High-$ waste session — one manager, one day (verify / rotation)', order: 52, enabled: true,
    requires: ['waste'], params: { factor: 2.5, minTotal: 75 },
    run: (ctx) => {
      const events = (ctx.data.waste || []).filter(w => w && w.dt && Number(w.amount) > 0);
      if (events.length < 4) return [];
      const sess = {};
      for (const w of events) {
        const day = String(w.dt).slice(0, 10); const k = `${w.manager || '?'}|${day}`;
        const s = sess[k] || (sess[k] = { manager: w.manager || '?', day, total: 0, n: 0 });
        s.total += Number(w.amount) || 0; s.n++;
      }
      const sessions = Object.values(sess);
      if (sessions.length < 3) return [];
      const totals = sessions.map(s => s.total).sort((a, b) => a - b);
      const median = totals[Math.floor(totals.length / 2)] || 0;
      const factor = ctx.params.factor ?? 2.5, minTotal = ctx.params.minTotal ?? 75;
      const windowStart = countWindowStartTs(ctx.period);
      const out = [];
      for (const s of sessions) {
        if (median <= 0 || s.total < median * factor || s.total < minTotal) continue;
        const t = Date.parse(s.day); const nearEOM = windowStart != null && t != null && t >= windowStart;
        out.push(mkFinding('waste-session', nearEOM ? SEVERITY.high : SEVERITY.medium,
          `Large waste session: ${s.manager} on ${s.day}`,
          `${_mny(s.total)} of waste in one session (${s.n} entries) vs a ${_mny(median)} typical session (${(s.total / median).toFixed(1)}×)${nearEOM ? ' — and it lands in the count window, where waste gets inflated to absorb a variance' : ''}. If this was expired product pulled at once, it's real waste — coach tighter ordering to on-hands + FIFO rotation so it doesn't recur. If not, verify it was physically thrown, not entered to balance a number.`,
          s.total, { manager: s.manager, day: s.day, n: s.n, nearEOM }));
      }
      return out;
    },
  },
  { id: 'purchases-posted', label: 'Purchases — all invoices posted (none pending)', order: 60, enabled: true, requires: ['purchases'], pending: true, run: () => [] },
  {
    // Transfers — large / not-approved transfers that shift the variance picture.
    // Transfers — large / not-posted, PLUS phantom-transfer timing (integrity #47): a transfer
    // logged inside the EOM count window is the classic move to shift inventory across the period
    // boundary on paper. Elevate those + prompt for a signed slip on BOTH sides in the same period.
    // (Full unmatched-side detection — a Transfer-In with no counterparty Transfer-Out — needs
    // district-wide transfer data, not the single-store diagnosis context; tracked as future.)
    id: 'transfers', label: 'Transfers — large / not-posted / EOM-window / unmatched', order: 70, enabled: true,
    requires: ['transfers'], params: { largeAmt: 100 },
    run: (ctx) => {
      const { flagged, netAmt } = summarizeTransfers(ctx.data.transfers || [], { largeAmt: ctx.params.largeAmt });
      const windowStart = countWindowStartTs(ctx.period);
      // Unmatched-side set (integrity #47): computed district-wide upstream (dashboard) since the
      // matching counterparty side lives at ANOTHER store; passed in as a Set of `${normLoc}|${id}`.
      const norm = s => String(s || '').replace(/^0+/, '') || String(s || '');
      const unmatched = ctx.data.unmatchedTransfers instanceof Set ? ctx.data.unmatchedTransfers : null;
      const myNorm = norm(ctx.store);
      return flagged.map(t => {
        const notPosted = t.status !== 'approved';
        const tt = Date.parse(t.dt);
        const boundary = windowStart != null && !Number.isNaN(tt) && tt >= windowStart;
        const isUnmatched = !!unmatched && unmatched.has(myNorm + '|' + t.id);
        let sev = notPosted ? (boundary ? SEVERITY.high : SEVERITY.medium)
                            : (boundary ? SEVERITY.medium : SEVERITY.info);
        if (isUnmatched) sev = SEVERITY.high;   // no mirror at a sister store = the strongest signal
        const notes = [];
        if (isUnmatched) notes.push('NO matching side found at the paired sister store — possible phantom transfer; confirm the other store logged the mirror In/Out for the same $ and date (or that both sides land in the same period)');
        if (notPosted) notes.push('NOT posted — verify');
        if (boundary) notes.push('logged inside the count window — the classic phantom-transfer timing; confirm a signed physical slip on BOTH stores and that the counterparty logged the matching side in the same period');
        return mkFinding('transfers', sev,
          `Transfer ${t.dir} ${notPosted ? `(${t.status})` : ''}${isUnmatched ? ' · UNMATCHED' : boundary ? ' · EOM-window' : ''} — store ${t.counterpartyNsn}`,
          `${_mny(t.total)} on ${t.dt}${notes.length ? ' — ' + notes.join('; ') : ''} (period net ${_mny(netAmt)})`,
          t.total, { transferId: t.id, dir: t.dir, status: t.status, manager: t.manager, counterpartyNsn: t.counterpartyNsn, boundary, unmatched: isUnmatched });
      });
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
      const names = `${hits.map(v => v.descr).slice(0, 6).join(', ')}${hits.length > 6 ? '…' : ''}`;
      // Self-serve beverage-tower EXEMPTION (integrity #47, owner): at stores with a dining-room
      // self-serve tower, fountain yield runs structurally low because guests take allowed free
      // refills we can't meter. Don't flag it as a loss — surface it as an INFO note (not an action
      // item) so it's acknowledged + transparent, not silently dropped. Flag is per-store from VLH config.
      if (ctx.data.selfServeTower) {
        return [mkFinding('bib-yield', SEVERITY.info, `${hits.length} beverage item(s) short w/ zero waste — expected (self-serve tower)`,
          `${names} — $${Math.round(Math.abs(total))} short, no waste logged. This store has a self-serve beverage tower, so low fountain yield is STRUCTURAL (free refills we can't meter), not a loss or portioning issue — not flagged. Only investigate if it's far beyond this store's usual (then check BIB connections / syrup ratios).`,
          Math.abs(total), { items: hits.map(v => v.wrin), selfServeTower: true, exempt: true })];
      }
      return [mkFinding('bib-yield', SEVERITY.medium, `${hits.length} beverage item(s) short with zero waste`,
        `${names} — $${Math.round(Math.abs(total))} short, no waste logged. Check BIB yield settings / syrup-to-water ratios + BIB connections; recount.`,
        Math.abs(total), { items: hits.map(v => v.wrin) })];
    },
  },
  {
    // Unrealistic OVER / gain (integrity #47). A large POSITIVE variance = the item shows a gain
    // (usage understated / more on-hand than theory). On a product that only ever depletes this is
    // rarely legit — fries are the classic: being substantially over isn't realistic (a real surplus
    // means customers are shorted, and they'd complain in droves). The regular bounce-back-from-a-
    // prior-short pattern is caught by the `inconsistent-count` chronic Item Journey; here we flag
    // the current-period magnitude. See memory/project-inventory-integrity-detection.
    id: 'unrealistic-over', label: 'Unrealistic OVER / gain (esp. fries)', order: 47, enabled: true,
    requires: ['variance'], params: { threshold: 75, friesThreshold: 40 },
    run: (ctx) => {
      const FRIES = /\b(FRIES|FRENCH FR(Y|IES)|WORLD FAMOUS FR(Y|IES)|\bFRY\b)\b/i;
      const th = ctx.params.threshold ?? 75, fth = ctx.params.friesThreshold ?? 40;
      const out = [];
      for (const v of (ctx.data.variance || [])) {
        if ((v.dolDiff || 0) <= 0) continue;
        const isFries = FRIES.test(v.descr || '');
        if ((v.dolDiff || 0) < (isFries ? fth : th)) continue;
        out.push(mkFinding('unrealistic-over', isFries ? SEVERITY.high : SEVERITY.medium,
          `Unrealistic OVER: ${v.descr}`,
          `${_mny(v.dolDiff)} OVER (showing a gain)${isFries
            ? ' — fries almost never run legitimately over; a genuine surplus would mean guests are being shorted (they’d complain in droves)'
            : ' — a gain on a product that only depletes is rarely legitimate'}. Recount to confirm it isn’t masking a loss elsewhere or a portioning-down / keying error. A recurring bounce-back from a prior short is the classic tell (check the item’s Journey).`,
          v.dolDiff, { wrin: v.wrin, isFries, dolDiff: v.dolDiff }));
      }
      return out;
    },
  },
  {
    // Negative ON-HAND (integrity #47, owner add 2026-07-30). A store physically cannot hold less
    // than zero of an item. A below-zero ending count / perpetual balance = a keying error, an
    // un-received invoice (product rung/used before its delivery was booked), or a wrong-UOM entry.
    // Auto-flag every offending WRIN.
    id: 'negative-onhand', label: 'Negative on-hand — physically impossible balance', order: 33, enabled: true,
    requires: ['onHand'], params: { tol: -0.001 },
    run: (ctx) => {
      const tol = ctx.params.tol ?? -0.001;
      return (ctx.data.onHand || [])
        .filter(o => Number(o.totalUnits) < tol || Number(o.onHandAmt) < tol)
        .map(o => {
          const u = Number(o.totalUnits);
          const uStr = Number.isFinite(u) ? `${u.toLocaleString()} units (${_mny(o.onHandAmt)})` : `${_mny(o.onHandAmt)}`;
          return mkFinding('negative-onhand', SEVERITY.high,
            `Negative on-hand: ${o.descr || o.wrin}`,
            `Ending on-hand shows ${uStr} — below zero is physically impossible. Usually an un-received invoice (product rung/used before its delivery was booked into the system), a keying error, or a count entered against the wrong unit of measure. Book any pending invoice for this item, then recount.`,
            Math.abs(Number(o.onHandAmt) || 0), { wrin: o.wrin, totalUnits: u, onHandAmt: Number(o.onHandAmt) });
        });
    },
  },
  {
    // Negative actual usage = a mathematical impossibility (integrity #47, owner need-to-know #2).
    // Actual Usage = Begin + Purchases − Ending; if it comes out < 0 the ending count is HIGHER than
    // everything on hand plus everything received — the padding tell in its extreme form (or a
    // mis-keyed / UOM count, e.g. inner bags entered as full cases). Auto-flag every offending WRIN.
    id: 'negative-usage', label: 'Negative usage — impossible (padded / mis-keyed count)', order: 34, enabled: true,
    requires: ['variance'], params: { tol: -0.001 },
    run: (ctx) => {
      const tol = ctx.params.tol ?? -0.001;
      // Field name differs by source: client parser → actualUsage; Supabase loader → actUsage.
      const usageOf = v => Number(v.actualUsage ?? v.actUsage);
      return (ctx.data.variance || [])
        .filter(v => usageOf(v) < tol)
        .map(v => mkFinding('negative-usage', SEVERITY.high,
          `Negative usage: ${v.descr}`,
          `Actual usage computed to ${usageOf(v).toLocaleString()} (below zero) — impossible: the ending count is higher than everything on hand plus everything received this period. Almost always an over-padded ending count or a mis-keyed unit of measure (inner bags entered as full cases). Recount ${v.descr} and re-verify the ending quantity + UOM.`,
          Math.abs(v.dolDiff || 0), { wrin: v.wrin, actualUsage: usageOf(v) }));
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
      const got = c.run({ data, params: c.params || {}, period, asOf, store }) || [];
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
// Integrity/pattern checks — the "worth a second look" family (padding, uniform/inflated waste,
// impossible balances, re-count churn). When one of these fires, the recap softens into a
// non-accusatory "let's verify" note instead of the punchy default (owner: give the why, nicely).
// Owner-chosen name for the integrity/anti-padding family — non-accusatory, "verify not accuse".
export const INTEGRITY_LABEL = 'Second-Look Signals';
export const INTEGRITY_CHECK_IDS = new Set([
  'count-manipulation', 'recount-swing', 'waste-inflation', 'waste-session', 'waste-patterns',
  'unrealistic-over', 'negative-onhand', 'negative-usage', 'uom-sanity',
]);

// The six FOB components and the DEFAULT_TARGETS key that sets each one's target %.
export const FOB_COMPONENTS = [
  ['comp', 'Comp Waste', 'tCompWaste'], ['raw', 'Raw Waste', 'tRawWaste'], ['cond', 'Condiments', 'tCondiment'],
  ['emp', 'Emp Meals', 'tEmpFood'], ['statv', 'Stat Variance', 'tStatLoss'], ['unex', 'Unexplained', 'tUnex'],
];
// Per-component actual-% vs target-% deltas from the FOB $ breakdown + the store's targets. Lets the
// report explain a FOB overage that lives in the COMPONENTS (waste / stat variance) even when the
// item-level Food/Condiment action list is clean (owner: over target yet "clean sweep" is a contradiction).
export function fobComponentDeltas(components, targets) {
  const c = components || {}, tg = targets || {}, sales = Number(c.sales) || 0;
  if (!sales) return [];
  return FOB_COMPONENTS.map(([key, label, tk]) => {
    const amt = Number(c[key]) || 0;
    const pct = amt / sales;
    const tgtPct = tg[tk] != null ? Number(tg[tk]) : null;
    return { key, label, amt, pct, tgtPct, deltaPp: tgtPct != null ? (pct - tgtPct) * 100 : null };
  });
}

// `mode:'recap'` returns the super-abbreviated message (FOB line → count status → Top-5 → net → soft
// integrity note → punchy close + optional link), scaled hard — the day-of nudge to a GM. It reuses
// the SAME computed doNow/net/shorts/overs as the full report, so the two can never drift.
// `fob` = { pct, tgt, dollars, components? } for the FOB one-liner; `link` = optional "more detail" URL.
export function formatDiagnosisReport(result, { threshold = 50, incomplete = null, caseSzByWrin = {}, selfServeTower = false, mode = 'full', fob = null, link = '', asOf = new Date(), exception = null } = {}) {
  // FOB-over-target driver analysis: which components exceed their own target (biggest gap first). Used
  // to explain an overage that item-level variance doesn't capture (raw waste, stat variance, condiments).
  const fobOver = !!(fob && fob.pct != null && fob.tgt != null && (fob.pct - fob.tgt) > 5e-5);
  // Food-cost component levers worth an action (waste discipline / condiment portioning / stat-variance
  // review). Emp meals + unexplained are excluded — they're policy/reconciliation, not coaching levers.
  const DRIVER_KEYS = new Set(['raw', 'comp', 'cond', 'statv']);
  const overComps = (fob && Array.isArray(fob.components) ? fob.components : [])
    .filter(x => DRIVER_KEYS.has(x.key) && x.deltaPp != null && x.deltaPp > 0.005).sort((a, b) => b.deltaPp - a.deltaPp);
  const fobDriverStr = (n = 3) => overComps.slice(0, n).map(x => `${x.label} +${x.deltaPp.toFixed(2)}pp (${money(x.amt)})`).join(' · ') + (overComps.length > n ? ` _+${overComps.length - n} more_` : '');
  const fobOverPp = fobOver ? ((fob.pct - fob.tgt) * 100).toFixed(2) : null;
  // Last day of the month → Non-Product is due today too (owner Notes 38). Flips its "tomorrow" framing.
  const npDueToday = nonProductDueToday(result.period, asOf);
  // Dedupe variance rows by WRIN first (owner: duplicate lines) — a doubled row would otherwise
  // surface the same item twice in Top-5, Focus now, and the reference table. Keep the largest-|$|
  // instance (a literal duplicate is identical; keeping one is correct, summing would double it).
  const _vByWrin = new Map();
  for (const v of (result.variance || [])) {
    const k = String(v.wrin ?? v.descr ?? '');
    const prev = _vByWrin.get(k);
    if (!prev || Math.abs(v.dolDiff || 0) > Math.abs(prev.dolDiff || 0)) _vByWrin.set(k, v);
  }
  const V = [..._vByWrin.values()].filter(v => Math.abs(v.dolDiff || 0) >= threshold)
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
    // Waste-logging is a Food/Condiment concern only — never on Paper/Non-Product (owner).
    if (/^(food|condiment)$/.test(normClass(v && v.cls)) && v.dolDiff < 0 && (Number(v.rawWaste) || 0) + (Number(v.compWaste) || 0) < 0.01) t.push('zero waste logged — verify');
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
  // "No waste logged" is a Food/Condiment concern only — Paper/Non-Product aren't raw-wasted the same
  // way, so don't put waste-verification chips/actions on them (owner 2026-07-30, "still getting waste
  // comments on paper"). Class-aware so cups/paper/promo never surface a waste flag.
  const noWaste = v => { const c = normClass(v && v.cls); return (c === 'food' || c === 'condiment') && v.dolDiff < 0 && (Number(v.rawWaste) || 0) + (Number(v.compWaste) || 0) < 0.01; };
  // Actual-vs-standard yield % from the row's own yield band (CoachQ-style over-portioning
  // fingerprint). std = band midpoint; over-portioned = actual below the band's low end.
  const yieldPct = v => {
    const a = Number(v.yield), lo = Number(v.yieldLo), hi = Number(v.yieldHi);
    if (!(a > 0) || !isFinite(lo) || !isFinite(hi) || (lo + hi) <= 0) return null;
    return a / ((lo + hi) / 2);
  };
  // At a self-serve-tower store, a fountain beverage running below its yield band is EXPECTED (free
  // refills we can't meter) — not over-portioning. bevExempt(v) marks those so they're noted, not flagged.
  const bevExempt = v => selfServeTower && FOUNTAIN_BEV_RE.test(v && v.descr || '');
  const overPortioned = v => { if (bevExempt(v)) return false; const p = yieldPct(v); return p != null && Number(v.yield) < Number(v.yieldLo); };
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
  // FOB headline (owner Notes 38: the full report was missing the FOB-vs-target line the recap has).
  if (fob && fob.pct != null) {
    const dpp = fob.tgt != null ? (fob.pct - fob.tgt) * 100 : null;
    L.push(`**FOB ${(fob.pct * 100).toFixed(2)}%**${dpp != null ? ` · ${dpp >= 0 ? '+' : ''}${dpp.toFixed(2)}pp vs ${(fob.tgt * 100).toFixed(2)}% target` : ''}${fob.dollars != null ? ` · ${money(fob.dollars)}` : ''}`, '');
    // Explain WHERE an overage lives — the components over their own target — since the item-level Top-5
    // only sees Food/Condiment variance and can read "clean" while waste/stat-var push FOB over (owner).
    if (fobOver && overComps.length) L.push(`_Driving the +${fobOverPp}pp overage:_ **${fobDriverStr()}** — component levers (waste discipline / stat-variance review), separate from the item-level recounts below.`, '');
  }
  // Always-visible exception banner — this store's EOM count was accepted off standard process.
  if (exception) {
    const d = exception.acceptedDate ? exception.acceptedDate : null;
    const by = exception.approvedBy && exception.approvedBy !== 'unspecified' ? exception.approvedBy : null;
    L.push(`> ⚠️ **Count-date exception granted** — this store's EOM count was accepted from an **early count**${d ? ` (dated ${d})` : ''}${by ? `, approved by ${by}` : ''}, off the standard final-window process. Numbers below reflect that accepted count.`, '');
  }

  // ── TOP 5 — DO NOW (owner req #46, focused to FOOD + CONDIMENT only per owner — the profit-driver
  // classes worth a manager's here-and-now energy). Cut-and-dry, ranked by best chance to improve
  // THIS cycle. Reuses the count-integrity buckets, recount-worthiness, and the portioning fingerprint.
  const isFCcls = c => { const x = normClass(c); return x === 'food' || x === 'condiment'; };
  const isPaperCls = c => normClass(c) === 'paper';
  const isFC = v => isFCcls(v && v.cls);
  const clsLabel = c => ({ food: 'Food', condiment: 'Condiment', paper: 'Paper', nonproduct: 'Non-Product', other: 'Other' })[normClass(c)] || 'Item';
  const sumVR = arr => arr.reduce((s, u) => s + (u.valueAtRisk || 0), 0);
  const _byVR = (a, b) => (b.valueAtRisk || 0) - (a.valueAtRisk || 0);
  const _unc = (incomplete && incomplete.uncounted) || [];
  // Never-counted split by class + COUNT-TIMING rule (owner 2026-07-30): Food, Condiment AND Paper
  // are due to 100% by EOD (today); Non-Product is NOT counted until tomorrow. So Non-Product
  // uncounted today is EXPECTED, not a gap — flag it separately, never as a "still needs counting"
  // to-do for today. Food/Condiment blanks are also the only FOB-consequential "count & recover".
  const neverFC = _unc.filter(u => u.state === 'never' && isFCcls(u.cls)).sort(_byVR);
  const neverPaper = _unc.filter(u => u.state === 'never' && isPaperCls(u.cls)).sort(_byVR);
  const neverNonProd = _unc.filter(u => u.state === 'never' && !isFCcls(u.cls) && !isPaperCls(u.cls)).sort(_byVR);
  // Food/Condiment counted EARLY (before the final window) = a real gap for the profit-driver classes
  // (owner: Holdenville had one food item not counted → should be a top priority). QSRSoft carries the
  // stale early count as the EOM value, so it hasn't been counted at the TRUE close — recounting NOW
  // gets a current number (unlike a mid-cycle count that WAS followed by an EOM count). Paper/Non-Product
  // early is fine; only Food/Condiment is elevated.
  const earlyFC = _unc.filter(u => u.state === 'early' && isFCcls(u.cls)).sort(_byVR);
  const doNow = [];
  if (neverFC.length) {
    const nv = sumVR(neverFC);
    doNow.push({ score: 1e6 + nv, group: true, text: `**Count the ${neverFC.length} never-counted Food/Condiment item${neverFC.length === 1 ? '' : 's'} before close** (~${money(nv)}) — the only true "count it and recover" money. Start with: ${neverFC.slice(0, 3).map(u => u.descr || u.wrin).join(', ')}.` });
  }
  if (earlyFC.length) {
    const ev = sumVR(earlyFC);
    doNow.push({ score: 95e4 + ev, group: true, text: `**Recount the ${earlyFC.length} Food/Condiment item${earlyFC.length === 1 ? '' : 's'} counted EARLY** (${money(ev)} on hand) — counted before the final window, so QSRSoft is carrying a stale value into the close. Get a current EOM count for the profit-driver classes: ${earlyFC.slice(0, 3).map(u => `${u.descr || u.wrin} (last ${u.lastCounted || '?'})`).join(', ')}.` });
  }
  V.filter(v => isFC(v) && (recountByWrin[v.wrin] || '').startsWith('recount may')).sort((a, b) => Math.abs(b.dolDiff) - Math.abs(a.dolDiff)).slice(0, 2)
    .forEach(v => doNow.push({ score: 5e5 + Math.abs(v.dolDiff), wrin: v.wrin, text: `**Recount ${v.descr || v.wrin}** (${money(v.dolDiff)}${casesNote(v)}) — the count looks off and it's still recoverable this cycle.` }));
  V.filter(v => overPortioned(v) && isFC(v)).sort((a, b) => Math.abs(b.dolDiff) - Math.abs(a.dolDiff)).slice(0, 2)
    .forEach(v => doNow.push({ score: 4e5 + Math.abs(v.dolDiff), wrin: v.wrin, text: `**Fix portioning on ${v.descr || v.wrin}** — running ${Math.round(yieldPct(v) * 100)}% of standard yield; audit the station's recipe/portion now.` }));
  const staleFC = _unc.filter(u => u.state === 'stale' && isFCcls(u.cls));
  if (staleFC.length) {
    const sv = sumVR(staleFC);
    doNow.push({ score: 3e5 + sv, group: true, text: `**Verify & clear the ${staleFC.length} obsolete/inactive Food/Condiment item${staleFC.length === 1 ? '' : 's'}** (${money(sv)} on hand) — count if usable, waste to zero if it won't be used before expiration; don't let it ride into next month's opening.` });
  }
  const topFC = V.filter(v => !(recountByWrin[v.wrin] || '').startsWith('early') && isFC(v)).find(v => !(recountByWrin[v.wrin] || '').startsWith('recount may') && !overPortioned(v));
  if (topFC) doNow.push({ score: 2e5 + Math.abs(topFC.dolDiff), wrin: topFC.wrin, text: `**Investigate ${topFC.descr || topFC.wrin}** (${money(topFC.dolDiff)}, ${dir(topFC)}${casesNote(topFC)}) — ${causeTags(topFC)[0] || 'recount + verify waste logging'}.` });

  // ── FINISH TODAY'S COUNT (owner req 2026-07-30) — time-aware by class. Food, Condiment AND Paper
  // are due to 100% by EOD; Non-Product is NOT counted until tomorrow (so it's expected, not a gap).
  // Only Food/Condiment is FOB-consequential (real recovery); Paper is due today for completeness.
  // Item label always carries the WRIN (owner Notes 38: list uncounted items WITH wrins up top).
  const nameW = u => `${u.descr || u.wrin}${u.wrin && u.descr ? ` [${u.wrin}]` : ''}`;
  const listW = (arr, n, withDate) => arr.slice(0, n).map(u => `${nameW(u)}${withDate ? ` (last ${u.lastCounted || '?'})` : ''}`).join(', ') + (arr.length > n ? ` _+${arr.length - n} more_` : '');
  const npLabel = npDueToday ? 'Food, Condiment, Paper & Non-Product' : 'Food, Condiment & Paper';
  // When an early-count exception was granted, "all counted (in the final window)" is technically off
  // process — the count was accepted early. Reconcile it right on the line so the awareness travels
  // with the number (owner request).
  const excDate = exception && exception.acceptedDate ? exception.acceptedDate : null;
  const excBy = exception && exception.approvedBy && exception.approvedBy !== 'unspecified' ? exception.approvedBy : null;
  const allCountedFC = exception
    ? `- ✅ **Food & Condiment — all counted**, ⚠️ _via an **accepted early-count exception**${excDate ? ` (count dated ${excDate})` : ''}${excBy ? `, approved by ${excBy}` : ''} — off standard process; the final-window count was waived for this store._`
    : '- ✅ **Food & Condiment — all counted (in the final window).**';
  if (neverFC.length || neverPaper.length || neverNonProd.length || earlyFC.length) {
    L.push(`## 🧮 Finish today's count to 100% — ${npLabel} (due by EOD)`, '');
    if (neverFC.length) L.push(`- **Food & Condiment — ${neverFC.length} item${neverFC.length === 1 ? '' : 's'} (${money(sumVR(neverFC))}) never counted.** These ARE food-cost-consequential — **count before close to recover real dollars:** ${listW(neverFC, 6)}`);
    // Only claim "all counted" when there are NO never-counted AND no counted-early FC (owner: the
    // "all counted" line contradicted the "1 counted EARLY" line right below it).
    else if (!earlyFC.length) L.push(allCountedFC);
    if (earlyFC.length) L.push(`- 🔴 **Food & Condiment — ${earlyFC.length} item${earlyFC.length === 1 ? '' : 's'} (${money(sumVR(earlyFC))}) counted EARLY, not in the final window** (so not fully counted for the close). QSRSoft is carrying a stale count in — **recount now for a current number:** ${listW(earlyFC, 6, true)}`);
    if (neverPaper.length) L.push(`- **Paper — ${neverPaper.length} item${neverPaper.length === 1 ? '' : 's'} (${money(sumVR(neverPaper))}) left:** ${listW(neverPaper, 6)}. Due by EOD too, but **not** food-cost-consequential — count for completeness, not recovery.`);
    else if (neverFC.length || neverNonProd.length) L.push('- ✅ **Paper — all counted.**');
    if (neverNonProd.length) L.push(npDueToday
      ? `- 🔴 **Non-Product — ${neverNonProd.length} item${neverNonProd.length === 1 ? '' : 's'} (${money(sumVR(neverNonProd))}) still uncounted, and it's DUE TODAY** (last day of the month) — count these to hit 100%: ${listW(neverNonProd, 6)}`
      : `- **Non-Product — ${neverNonProd.length} item${neverNonProd.length === 1 ? '' : 's'} (${money(sumVR(neverNonProd))}) still uncounted, and that's EXPECTED** — Non-Product isn't due until tomorrow. Not a gap, not a today action.`);
    L.push(`_Today's 100% = ${npLabel}. Full itemized list in Count integrity below._`, '');
  }

  // Late-count coaching (owner 2026-07-31): Food/Condiment/Paper should be counted on the 2nd & 3rd day
  // out from EOM — the last day is for Non-Product. If the bulk landed on the last day, note it (soft).
  if (incomplete && incomplete.lateBulk) {
    L.push(`📅 _**Count timing:** Food/Condiment/Paper were bulk-counted on the **last day of the month**${incomplete.lateBulkDay ? ` (${incomplete.lateBulkDay})` : ''}. Target is the **2nd & 3rd day out** — coach the store to count these classes 1–2 days earlier so the last day is free for Non-Product and the close._`, '');
  }

  // Dedupe Do-Now by WRIN (owner: duplicate lines) — the same item can surface via BOTH the recount
  // and the portioning push; keep only the highest-priority action per item. Group summaries pass through.
  {
    const seenW = new Set(), kept = [];
    for (const d of doNow.slice().sort((a, b) => b.score - a.score)) {
      if (!d.group && d.wrin) { if (seenW.has(d.wrin)) continue; seenW.add(d.wrin); }
      kept.push(d);
    }
    doNow.length = 0; doNow.push(...kept);
  }

  // ── TOP 5 — always surface five real Food/Condiment moves. Fill toward 5 from the next-best FC
  // opportunities; if the store genuinely can't produce five, that's a WIN — celebrate it (owner).
  if (doNow.length < 5) {
    const used = new Set(doNow.map(d => d.wrin).filter(Boolean));
    for (const v of V.filter(v => isFC(v) && !(recountByWrin[v.wrin] || '').startsWith('early') && !used.has(v.wrin)).sort((a, b) => Math.abs(b.dolDiff) - Math.abs(a.dolDiff))) {
      if (doNow.length >= 5) break;
      used.add(v.wrin);
      doNow.push({ score: 1e5 + Math.abs(v.dolDiff), wrin: v.wrin, text: `**Investigate ${v.descr || v.wrin}** (${money(v.dolDiff)}, ${dir(v)}${casesNote(v)}) — ${causeTags(v)[0] || 'recount + verify waste logging'}.` });
    }
  }
  // Include ALL food-cost analysis in the Top-5 ranking (owner): the component levers over target
  // (raw/comp waste, condiments, stat variance) compete head-to-head by dollars-over-target with the
  // item-level moves. This is what makes an over-target store surface real actions instead of a false
  // "clean sweep" — the overage lives in components the item-level variance never inspects.
  if (fobOver) {
    const compAction = {
      raw:   ['Cut', 'tighten raw-waste discipline — every waste entry weighed, not estimated'],
      comp:  ['Cut', 'tighten completed-product waste discipline + verify waste logging'],
      cond:  ['Tighten', 'audit condiment portioning + dispenser calibration'],
      statv: ['Investigate', 'reconcile counted-vs-theoretical usage — recount the biggest movers, check receiving/transfers'],
    };
    for (const oc of overComps) {
      const a = compAction[oc.key]; if (!a) continue;
      const sales = oc.pct ? oc.amt / oc.pct : 0;
      const dollarsOver = Math.max(0, (oc.pct - (oc.tgtPct || 0)) * sales);
      doNow.push({ score: 2e5 + dollarsOver, group: true, comp: oc.key,
        text: `**${a[0]} ${oc.label}** — +${oc.deltaPp.toFixed(2)}pp over target (${money(oc.amt)}, ~${money(dollarsOver)} over target) — ${a[1]}.` });
    }
  }
  doNow.sort((a, b) => b.score - a.score);
  if (doNow.length >= 5) {
    L.push('## ✅ Top 5 — do these now · Food & Condiment (best shot at improving this result)', '');
    doNow.slice(0, 5).forEach((d, i) => L.push(`${i + 1}. ${d.text}`));
    L.push('', '_Cut-and-dry, focused on the profit-driver classes: knock these out, then **re-run the diagnosis** to see what changed. Full analysis (all classes) below._', '');
  } else if (doNow.length) {
    L.push(`## ✅ Do these now · Food & Condiment — only ${doNow.length}, and that's a good sign`, '');
    doNow.forEach((d, i) => L.push(`${i + 1}. ${d.text}`));
    L.push('', `_Fewer than 5 Food/Condiment action items surfaced — this store is running tight on the profit-driver classes. Knock ${doNow.length === 1 ? 'it' : 'them'} out, then **re-run the diagnosis.**_`, '');
  } else if (fobOver) {
    // Edge case: FOB over target but no single component materially over (spread thin / emp-meals /
    // sub-threshold). Don't celebrate a "clean sweep" while over target — point at the FOB strip.
    L.push('## 🟡 Item & component counts read clean — but FOB is over target', '');
    L.push(`**No item-level recount or single component surfaced above threshold**, yet **FOB is +${fobOverPp}pp over target**. The overage is spread across components rather than one driver — review the FOB component strip above; the lever here is broad waste/portion discipline, not a single item.`, '');
  } else {
    L.push('## 🏆 Clean sweep — zero Food & Condiment action items', '');
    L.push('**Nothing** actionable surfaced on the profit-driver classes this count: no never-counted Food/Condiment, nothing to recount, no portioning flags, and **FOB is at/under target**. **That is a win in itself** — the classes that drive food cost are tight and under control. Keep doing exactly what produced this result. 🎉', '');
  }

  L.push(`**Bottom line:** ${V.length} item${V.length === 1 ? '' : 's'} exceed ±$${threshold} · **Net variance ${money(net)}**`);
  L.push(`Shortages: ${shorts.length} (${money(shorts.reduce((s, v) => s + v.dolDiff, 0))}) · Overages: ${overs.length} (${money(overs.reduce((s, v) => s + v.dolDiff, 0))})`, '');

  // ── RECAP MODE — the super-abbreviated day-of message (owner Notes 37 C1) ──
  // FOB line first → count status one-liner → Top-5 → net → soft integrity note → punchy close.
  // Reuses doNow/net/shorts/overs/V + the count-timing buckets above, so it can't drift from the report.
  if (mode === 'recap') {
    const R = [`**${result.storeName || result.store} — EOM FOB ${result.period}**`, ''];
    if (fob && fob.pct != null) {
      const dpp = (fob.tgt != null) ? (fob.pct - fob.tgt) * 100 : null;
      R.push(`**FOB ${(fob.pct * 100).toFixed(2)}%**${dpp != null ? ` · ${dpp >= 0 ? '+' : ''}${dpp.toFixed(2)}pp vs ${(fob.tgt * 100).toFixed(2)}% target` : ''}${fob.dollars != null ? ` · ${money(fob.dollars)}` : ''}`, '');
    }
    // Uncounted items land on the recap IN PROMINENCE (owner Notes 37) — the actual items + $ on hand,
    // right under the FOB line. Time/class-aware: Food, Condiment & Paper are due to 100% by EOD (list
    // them); Non-Product isn't due until tomorrow, so it's omitted here (expected, not a gap).
    const showNP = npDueToday && neverNonProd.length;   // last day → Non-Product due today too
    if (earlyFC.length || neverFC.length || neverPaper.length || showNP) {
      R.push(`⏳ **Finish today's count — recount these before you close:**`);
      const uncList = (arr, label, withDate) => { if (arr.length) R.push(`- **${label}** (${money(sumVR(arr))}): ${arr.slice(0, 8).map(u => `${nameW(u)}${withDate ? ` _(last ${u.lastCounted || '?'})_` : ''}`).join(', ')}${arr.length > 8 ? ` _+${arr.length - 8} more_` : ''}`); };
      uncList(earlyFC, `${earlyFC.length} Food/Condiment counted early`, true);
      uncList(neverFC, `${neverFC.length} Food/Condiment not counted`, false);
      uncList(neverPaper, `${neverPaper.length} Paper not counted`, false);
      if (showNP) uncList(neverNonProd, `${neverNonProd.length} Non-Product not counted (due today — last day of month)`, false);
      R.push('');
    } else {
      R.push(npDueToday ? `✅ All classes counted.` : `✅ Food, Condiment & Paper counted.`, '');
    }
    // Top 5 (scales down — celebrates a clean sweep).
    if (doNow.length) {
      R.push(`**Do these now${doNow.length < 5 ? ` (only ${doNow.length} — running tight, good sign)` : ''}:**`);
      doNow.slice(0, 5).forEach((d, i) => R.push(`${i + 1}. ${d.text}`));
      R.push('');
    } else {
      R.push(`🏆 **Clean sweep on Food & Condiment** — nothing to action. Nice work.`, '');
    }
    if (V.length) R.push(`**Net variance ${money(net)}** across ${V.length} item${V.length === 1 ? '' : 's'} over ±$${threshold} (short ${shorts.length} / over ${overs.length}).`, '');
    // Soft, non-accusatory note when an integrity/pattern check fired — give the why, recommend a look.
    const intg = (result.findings || []).filter(f => INTEGRITY_CHECK_IDS.has(f.checkId));
    if (intg.length) {
      const names = [...new Set(intg.slice(0, 2).map(f => (f.title || '').replace(/\s*\(WRIN[^)]*\)/i, '').trim()))].filter(Boolean);
      R.push(`_🔍 ${INTEGRITY_LABEL} — worth a look together: ${names.join(' · ') || 'a few entries'}. Nothing's being called wrong; a clean verify just makes the number airtight and off our radar._`, '');
    }
    // Recount rule (owner Notes 38): a store already AT/UNDER its FOB target shouldn't be pushed to
    // chase variance-reduction recounts (no upside, real downside). But integrity items (padding,
    // swings, impossible values) are about TRUTH, not optimization — pursue them regardless of target.
    // So under-target reframes OPTIMIZATION recounts as optional while keeping integrity front-and-center.
    const underTarget = fob && fob.pct != null && fob.tgt != null && fob.pct <= fob.tgt + 1e-9;
    const clean = !V.length && !doNow.length;
    R.push(clean
      ? `Go ahead and finalize.${link ? ` More detail: ${link}` : ''}`
      : underTarget
        ? `You're at/under your FOB target ✓ — the recounts above are optional polish, not required.${intg.length ? ' The one thing worth doing: verify the flagged items so the number is airtight.' : ' Finalize once your count is complete.'}${link ? ` · More detail: ${link}` : ''}`
        : `Time's the lever — knock these out today, then re-run and reply.${link ? ` · More detail: ${link}` : ''}`);
    return R.join('\n');
  }

  // ── SECOND-LOOK SIGNALS — the integrity/pattern family, grouped + framed verify-not-accuse ──
  {
    const intgFull = (result.findings || []).filter(f => INTEGRITY_CHECK_IDS.has(f.checkId));
    if (intgFull.length) {
      L.push(`## 🔍 ${INTEGRITY_LABEL} — verify, don't accuse`, '');
      L.push('_A clean recount / verify makes these numbers airtight. Nothing here is an accusation — just entries worth a second look together._', '');
      // Roll up items that share the SAME diagnosis into one coaching block + a compact item list,
      // instead of repeating an identical paragraph N times (owner 2026-07-31 — the 14 recount-swings).
      const groups = {};
      for (const f of intgFull) {
        const key = f.checkId === 'recount-swing'
          ? `recount-swing|${f.data?.manager || '?'}|${f.data?.day || '?'}`
          : `solo|${f.checkId}|${f.title}`;
        (groups[key] || (groups[key] = [])).push(f);
      }
      let shown = 0;
      for (const key of Object.keys(groups)) {
        if (shown >= 14) break;
        const g = groups[key];
        if (key.startsWith('recount-swing|') && g.length >= 3) {
          const mgr = g[0].data?.manager, day = g[0].data?.day;
          const timing = (g.find(f => f.data?.timing) || {}).data?.timing;
          const nCross = g.filter(f => f.data?.crossZero).length;
          L.push(`- **Recount swings — ${g.length} items${mgr ? `, single counter (${mgr})` : ''}${day ? `, ${day}` : ''}.** A swing this large between counts — with no delivery in between — is where a **3rd count by a different manager** should be required before saving. Verify which count was right so the on-hand is clean.${nCross ? ` ${nCross} crossed zero (offsetting).` : ''}${timing ? ' ' + recountTimingSentence(timing) : ''}`);
          const items = g.slice().sort((a, b) => (b.dollars || 0) - (a.dollars || 0))
            .map(f => `${(f.title || '').replace(/^Recount swing:\s*/, '')} (${money(f.dollars)} swing${f.data?.crossZero ? ' ↔' : ''})`);
          L.push(`  ${items.slice(0, 12).join(' · ')}${items.length > 12 ? ` _+${items.length - 12} more_` : ''}`);
          shown++;
        } else {
          for (const f of g) { if (shown >= 14) break; L.push(`- **${f.title}** — ${f.detail}`); shown++; }
        }
      }
      L.push('');
    }
  }

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
  L.push('_"Don\'t chase rabbits at EOM" applies to just one cell — a **one-off real loss** (top-left: already locked, nothing to recover). The other three all deserve action. The value is separating that locked one-off (drop it) from a recurring loss (fix the cause) and from a still-fixable count (recount)._', '');

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
  // Self-serve-tower EXEMPTION note (owner): fountain beverages below their yield band are NOT
  // over-portioning here — free refills we can't meter. Surface them as expected, not flagged.
  if (selfServeTower) {
    const exemptBev = V.filter(v => FOUNTAIN_BEV_RE.test(v.descr || '')).filter(v => { const p = yieldPct(v); return p != null && Number(v.yield) < Number(v.yieldLo); }).sort((a, b) => (yieldPct(a) || 1) - (yieldPct(b) || 1));
    if (exemptBev.length) {
      L.push(`## 🥤 Fountain beverages below yield — expected (self-serve tower)`, '');
      L.push(`_This store has a self-serve beverage tower, so low fountain yield is STRUCTURAL (guests take allowed free refills we can't meter) — NOT over-portioning, not flagged. Only investigate if a value is far beyond this store's usual (then check BIB connections / syrup ratios)._`, '');
      exemptBev.slice(0, 12).forEach(v => { const std = (Number(v.yieldLo) + Number(v.yieldHi)) / 2; L.push(`- ${v.descr || v.wrin} — yield ${Number(v.yield).toFixed(2)} vs std ${std.toFixed(2)} (${Math.round(yieldPct(v) * 100)}% of std) — expected`); });
      L.push('');
    }
  }

  // ── Count integrity — WHY items read "uncounted" (Notes: Durant #5985) ──
  // Critical framing so nobody (or SAGE) treats early/stale items as "free money — just count
  // it." "Uncounted" here = not counted in the final window, NOT "never counted."
  if (incomplete && incomplete.uncountedCount > 0) {
    const bs = incomplete.byState || {};
    const m = (o) => `${(o && o.n) || 0} item${((o && o.n) || 0) === 1 ? '' : 's'} (${money((o && o.value) || 0)})`;
    L.push('## 🧮 Count integrity — the "uncounted" list, explained', '');
    L.push('_"Uncounted" = not counted in the FINAL window. **Due by EOD: Food, Condiment, Paper. Non-Product is not counted until tomorrow** — so Non-Product here is expected, not a gap. Only Food/Condiment is food-cost-consequential._', '');

    // NEVER counted, split THREE ways by count-timing + FOB consequence (owner 2026-07-30):
    // Food/Condiment (due today, real recovery), Paper (due today, completeness), Non-Product (tomorrow).
    if (neverFC.length) L.push(`- **${neverFC.length} Food/Condiment item${neverFC.length === 1 ? '' : 's'} (${money(sumVR(neverFC))}) not yet counted** — food-cost-consequential, due by EOD. Count before close to recover real dollars.`);
    if (neverPaper.length) L.push(`- **${neverPaper.length} Paper item${neverPaper.length === 1 ? '' : 's'} (${money(sumVR(neverPaper))}) not yet counted** — due by EOD too, but **not** food-cost-consequential (completeness, not recovery).`);
    if (neverNonProd.length) L.push(`- **${neverNonProd.length} Non-Product item${neverNonProd.length === 1 ? '' : 's'} (${money(sumVR(neverNonProd))}) not yet counted — EXPECTED**, not due until tomorrow. Not a gap, not a today action, and not cost-control-focused.`);

    // Itemized TO-COUNT table — the DUE-TODAY items (Food/Condiment first, then Paper). Non-Product
    // is intentionally excluded (it's on tomorrow's timeline).
    const toCountRows = [...neverFC, ...neverPaper].slice(0, 40);
    if (toCountRows.length) {
      L.push('', '### 📝 To-count list — due by EOD (Food, Condiment, Paper)', '');
      L.push('| Item | WRIN | Class | On-hand qty | On-hand $ | Food-cost? |', '|---|---|---|---:|---:|:---:|');
      toCountRows.forEach(u => { const q = Number(u.totalUnits); const qs = Number.isFinite(q) && q !== 0 ? q.toLocaleString() : '—'; L.push(`| ${u.descr || u.wrin} | ${u.wrin || '—'} | ${clsLabel(u.cls)} | ${qs} | ${money(u.onHandAmt ?? u.valueAtRisk)} | ${isFCcls(u.cls) ? '**Yes**' : 'no'} |`); });
      const moreN = (neverFC.length + neverPaper.length) - toCountRows.length;
      if (moreN > 0) L.push('', `_+${moreN} more due-today item(s)._`);
    }

    // Counted EARLY — FOOD/CONDIMENT ONLY (owner 2026-07-30, Harrah): Paper/Non-Product counted
    // mid-month is fine — NOT cost-control, and the "recount won't recover, it cascades" framing is
    // wrong for these anyway (an item whose LATEST count is the early one carries that stale value
    // into the close). So only the profit-driver classes appear here, framed to recount for a current
    // EOM number. When Food/Condiment were counted fresh in the window, this section disappears.
    const earlyItems = _unc.filter(u => u.state === 'early' && isFCcls(u.cls)).sort((a, b) => (b.valueAtRisk || 0) - (a.valueAtRisk || 0)).slice(0, 25);
    const earlyFCcount = _unc.filter(u => u.state === 'early' && isFCcls(u.cls)).length;
    if (earlyItems.length) {
      L.push('', `### ⏱ Food/Condiment counted EARLY — ${earlyFCcount} item${earlyFCcount === 1 ? '' : 's'} (${money(sumVR(earlyItems))})`, '');
      L.push('_Counted before the final window, so QSRSoft is carrying a stale count into the close — **recount for a current EOM number** on the profit-driver classes. (Paper / Non-Product counted mid-month is fine and not listed.)_', '');
      L.push('| Item | WRIN | Class | On-hand qty | On-hand $ | Last counted |', '|---|---|---|---:|---:|---|');
      earlyItems.forEach(u => { const q = Number(u.totalUnits); const qs = Number.isFinite(q) && q !== 0 ? q.toLocaleString() : '—'; L.push(`| ${u.descr || u.wrin} | ${u.wrin || '—'} | ${clsLabel(u.cls)} | ${qs} | ${money(u.onHandAmt ?? u.valueAtRisk)} | ${u.lastCounted || '—'} |`); });
      const moreE = earlyFCcount - earlyItems.length;
      if (moreE > 0) L.push('', `_+${moreE} more Food/Condiment counted-early item(s)._`);
    }

    // OBSOLETE / DISCONTINUED / INACTIVE — table with the class-aware action (owner req 2026-07-30).
    const staleItems = _unc.filter(u => u.state === 'stale').sort((a, b) => (b.valueAtRisk || 0) - (a.valueAtRisk || 0)).slice(0, 25);
    if (bs.stale && bs.stale.n) {
      L.push('', `### Obsolete / Discontinued / Inactive — verify & clear · ${m(bs.stale)}`, '');
      L.push('_Last counted a PRIOR period; a residual on-hand is riding into next month\'s opening._', '');
      if (staleItems.length) {
        L.push('| Item | WRIN | Class | On-hand qty | On-hand $ | Last counted | Action |', '|---|---|---|---:|---:|---|---|');
        staleItems.forEach(u => {
          const action = isFCcls(u.cls)
            ? `**Verify with a count first.** If it won't be used before expiration, **waste to zero** (−${money(u.valueAtRisk)}), then deactivate the WRIN at a verified zero.`
            : `**Keep if usable** (donation / giveaway) — do not discard; deactivate only once genuinely used up. No count/waste verification needed.`;
          const qty = Number(u.totalUnits);
          const qtyStr = Number.isFinite(qty) && qty !== 0 ? qty.toLocaleString() : '—';
          L.push(`| ${u.descr || u.wrin} | ${u.wrin || '—'} | ${clsLabel(u.cls)} | ${qtyStr} | ${money(u.onHandAmt)} | ${u.lastCounted || '—'} | ${action} |`);
        });
        const moreS = (bs.stale?.n || 0) - staleItems.length;
        if (moreS > 0) L.push('', `_+${moreS} more item(s)._`);
      }
      L.push('', '_Rule: **Food / Condiment** → verify with a physical count, then waste to zero if it won\'t be used before expiration and deactivate at a verified zero. **Paper / Non-Product** (promo, Happy Meal items, paper) → keep if usable; deactivate only once used up — no count/waste verification needed. Never discard usable product._');
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
