// @ts-nocheck
// ── The Spot-Check Ruler (task #129) ──────────────────────────────────────────────────────────
// memory/plan-count-cycle-surfaces-and-spotcheck-ruler-2026-11-08.md §B. A standard follow-up
// conversation framework, modeled verbatim on the owner's real example to Ashley re: Holdenville's
// FOB and weekly inventory count:
//   1. What was FOB after you counted?
//   2. What were your biggest variance/stat items?
//   3. What items did you recount?
//   4. How confident are you in your counts?
//   5. Did you look at your reports (FOB, On Hand, Variance/Stat)? If so, what did you learn?
// Pure, testable logic — no React, no Supabase calls. Every input is already-loaded data; callers
// (the UI worksheet, the Curated Home prompt, the weekly digest script) fetch it and pass it in.
//
// THE REAL POINT OF THIS MODULE — the owner's own words: "Nuggets, Espresso Beans, Beef Steak and
// others grew in count — $800 between the 3 items improved FOB by 1.72%. Had those three been even
// at +/-0, FOB would have been 5.09% — much more realistic. So either she actually found product or
// it is a miscount." That is counterfactualFob() below: strip the top-N variance movers out of the
// reported FOB and show the swing. A tiny gap means the count and the report agree on their own
// merits; a big gap means the conversation has to happen.
//
// Deliberately OUT OF SCOPE (task #130, logged separately, owner-approved 2026-11-08):
//   - Within-session recount detection (did the GM correct an entry before submitting, same
//     session). qsr_onhand/inv_count_sessions are both keyed off a single last_counted timestamp
//     with no revision history — recountDetection() below only sees ACROSS-session recounts (a
//     second dated inv_count_sessions row for the same class), which is real and already works,
//     and says so plainly rather than guessing at the within-session case.
//   - Tier-2 statistical anomaly detection on variance swings (reusing Signals Scanner's
//     effect-size/FDR machinery) — needs a real-history calibration pass first. flagCounterfactual()
//     below ships tier 1 (target-based) and tier 3 (hard "impossible values") only.

import { fobComponentDeltas } from './eom-diagnosis.js';
import { normClass, isDeactivatedByDescr } from './eom-inventory.js';

export const DEFAULT_TOP_N = 3; // matches the owner's own example (3 items, not variance-top5's default 5)
export const MATERIAL_GAP_PTS = 1.0; // a swing this size or larger is "worth a conversation" on its own,
// independent of whether it crosses the store's own FOB target either way (owner: "any wayward
// swing in an unreasonable amount should be flagged").

// lowercase normClass() output -> the capitalized labels count-cycle.js's CLASSES/session log use,
// so recountDetection() (keyed off the session log's class strings) can be asked about the SAME
// classes the counterfactual's top movers actually touched.
export const CLASS_DISPLAY = { food: 'Food', condiment: 'Condiment', paper: 'Paper', nonproduct: 'Non-Product' };

const QUESTIONS_TEXT = {
  fob: 'What was FOB after you counted?',
  varianceTop: 'What were your biggest variance/stat items?',
  recount: 'What items did you recount?',
  confidence: 'How confident are you in your counts?',
  reportsReviewed: 'Did you look at your reports (FOB, On Hand, Variance/Stat)? If so, what did you learn?',
};

// The "master WRIN" (first 5 digits before the dash) a row belongs to — the same base-WRIN rollup
// convention src/engine/inventory-transfers.js's rollupByWRIN() already uses for Inventory Summary
// & Usage, applied here to variance rows. A product mid-transition between an old and a new WRIN
// suffix (a reformulation, a case-pack change, an "(Deactivated)"/"(New)" swap QSRSoft itself
// labels) shows up as TWO separate rows for the SAME physical item — often with opposite signs
// that are really one net story, not two real movers. Live-measured, 2026-11-09 (owner report):
// "ICE CREAM MIX/VANILLA/RED FAT" (06294-045, being phased out) paired with "MCDN ICM RDFAT VAN
// WHEY (New)" (06294-072) at 8 of 20 Oklahoma stores this period — one store's unrolled-up reading
// overstated its real net swing by 89% ($145.83 vs. a true $15.80), because the old WRIN's big
// negative was mostly offset by the new WRIN's positive, and un-rolled-up ranking only ever shows
// one side of that pair. NOT every multi-WRIN group is a transition artifact, though: Florida's own
// `06294-054` (a distinct, stable regional WRIN for the identical master item, never paired with
// -045/-072 at any Florida store) is just that store's normal code for the product, so rolling up
// never invents a false "this was fine all along" reading for a genuinely real variance.
const masterWrinOf = (wrin) => String(wrin || '').replace('-', '').slice(0, 5);

// ── Q2 answer key — "the biggest variance/stat items" ──────────────────────────────────────────
// Deliberately NOT a call through eom-diagnosis.js's runDiagnosis()/variance-top5 check: that
// check's own finding wrapper (mkFinding) stores the dollar magnitude as Math.abs(dolDiff) and
// drops the sign entirely (only visible, lossily, inside a formatted detail STRING) — exactly the
// sign the counterfactual math below needs to know whether removing an item's swing would raise or
// lower reported FOB. This reuses that check's own ranking algorithm (sort by |dolDiff| desc, same
// tie-break, same field names) rather than a second ranking scheme — see eom-diagnosis.js's
// `variance-top5` check, id-for-id the same sort/slice, EXCEPT that check does not roll up by
// master WRIN (a separate, live-measured gap of its own, not fixed here — see this function's
// masterWrinOf() comment above for why that matters).
export function topVarianceMovers(varianceRows = [], topN = DEFAULT_TOP_N) {
  const byMaster = {};
  for (const v of (varianceRows || [])) {
    if (!v || !v.wrin) continue;
    const key = masterWrinOf(v.wrin);
    (byMaster[key] || (byMaster[key] = [])).push(v);
  }
  const rolled = Object.values(byMaster).map(items => {
    if (items.length === 1) {
      const v = items[0];
      return { wrin: v.wrin, descr: v.descr || v.wrin || '(unnamed item)', cls: normClass(v.cls), dolDiff: Number(v.dolDiff) || 0 };
    }
    // Multiple WRINs sharing a master -- combine into one net dollar figure. Represent the group
    // under whichever row's descr is NOT text-marked "(Deactivated)"/"(Obsolete)" (the one that
    // will still be around next period), falling back to the first row if every variant is marked.
    const dolDiff = items.reduce((s, v) => s + (Number(v.dolDiff) || 0), 0);
    const rep = items.find(v => !isDeactivatedByDescr(v.descr)) || items[0];
    return {
      wrin: rep.wrin, descr: rep.descr || rep.wrin || '(unnamed item)', cls: normClass(rep.cls), dolDiff,
      rolledUpWrins: items.map(v => v.wrin),
    };
  });
  return rolled
    .sort((a, b) => Math.abs(b.dolDiff || 0) - Math.abs(a.dolDiff || 0))
    .slice(0, Math.max(0, topN));
}

// ── The counterfactual box ──────────────────────────────────────────────────────────────────────
// fobSnap: the component-$ shape eom-report-build.js/eom-diagnosis.js already use —
// { sales, comp, raw, cond, emp, statv, unex, fob, fobPct }. fobPct and the returned *Pct fields
// are FRACTIONS (0.033 == 3.3%), matching fobComponentDeltas()'s own convention — multiply by 100
// only at display time.
//
// Sign convention (eom-diagnosis.js's own, unchanged): dolDiff > 0 == "OVER" (counted MORE product
// than expected — a gain that LOWERS reported cost/FOB); dolDiff < 0 == "SHORT" (a loss that RAISES
// reported cost/FOB). So stripping a net-positive swing back out of the report RAISES FOB (the
// owner's real example: +$800 net gain lowered FOB by 1.72pp; removing it raises FOB by that same
// 1.72pp, from 3.37% to 5.09%). This is the exact amt/sales pattern fobComponentDeltas() already
// uses, just applied to the variance-top-N dollars instead of a FOB component.
export function counterfactualFob({ fobSnap = null, varianceRows = [], topN = DEFAULT_TOP_N } = {}) {
  const sales = Number(fobSnap?.sales) || 0;
  const fobAsReportedPct = fobSnap?.fobPct != null
    ? Number(fobSnap.fobPct)
    : (sales && fobSnap?.fob != null ? Number(fobSnap.fob) / sales : null);
  const topMovers = topVarianceMovers(varianceRows, topN);
  const combinedDollars = topMovers.reduce((s, v) => s + v.dolDiff, 0);
  const swingPts = sales ? (combinedDollars / sales) * 100 : null; // percentage POINTS, not a fraction
  const fobWithoutMoversPct = (fobAsReportedPct != null && swingPts != null)
    ? fobAsReportedPct + (swingPts / 100)
    : null;
  return { sales, topMovers, combinedDollars, swingPts, fobAsReportedPct, fobWithoutMoversPct };
}

// ── Tier 1: target-based flagging (buildable now, no research needed) ──────────────────────────
// Owner, 2026-11-08: "Targets are a solid base to judge against." Flags when either (a) the store
// only clears its own FOB target BECAUSE of the top movers — strip them out and it would miss —
// or (b) the swing itself is large enough to be worth a conversation regardless of target (the
// owner's "any wayward swing in an unreasonable amount" clause), using MATERIAL_GAP_PTS as that
// floor. targetPct, like fobAsReportedPct, is a fraction (DEFAULT_TARGETS/monthly_targets'
// fob_target_pct, e.g. 0.03 for a 3% target).
export function flagCounterfactual({ fobAsReportedPct, fobWithoutMoversPct, swingPts, targetPct = null, materialGapPts = MATERIAL_GAP_PTS } = {}) {
  if (fobAsReportedPct == null || fobWithoutMoversPct == null) return { flagged: false, reason: null };
  const hitsAsReported = targetPct != null ? fobAsReportedPct <= targetPct : null;
  const hitsWithoutMovers = targetPct != null ? fobWithoutMoversPct <= targetPct : null;
  const masksTarget = hitsAsReported === true && hitsWithoutMovers === false;
  const materialSwing = swingPts != null && Math.abs(swingPts) >= materialGapPts;
  if (masksTarget) {
    return {
      flagged: true, tier: 'target',
      reason: `Only at/under the ${(targetPct * 100).toFixed(2)}% FOB target because of these items — without them FOB would be ${(fobWithoutMoversPct * 100).toFixed(2)}%, over target.`,
    };
  }
  if (materialSwing) {
    return {
      flagged: true, tier: 'material-swing',
      reason: `A ${Math.abs(swingPts).toFixed(2)}pt swing from a handful of items is worth a conversation either way — either real product turned up or there's a count error large enough that pretending otherwise is dishonest.`,
    };
  }
  return { flagged: false, tier: null, reason: null };
}

// ── Tier 3: hard "impossible values" (buildable now, no research needed) ───────────────────────
// Owner, 2026-11-08: "things we just know can not be correct must always be flagged" — a HARD
// rule, not a statistical threshold, same spirit as count-cycle.js's isStaleDeadRow(). Each check
// degrades gracefully: with no onHandByWrin data at all, this returns [] rather than guessing.
// `onHandByWrin`: { [wrin]: { onHandAmt, totalUnits } } — qsr_onhand's own per-item snapshot.
export function impossibilityFlags({ varianceRows = [], onHandByWrin = {} } = {}) {
  const out = [];
  for (const v of (varianceRows || [])) {
    const oh = onHandByWrin[v.wrin];
    if (!oh) continue;
    const onHandAmt = oh.onHandAmt != null ? Number(oh.onHandAmt) : null;
    if (onHandAmt != null && onHandAmt < 0) {
      out.push({ wrin: v.wrin, descr: v.descr, rule: 'negative-on-hand',
        detail: `On-hand value is negative ($${onHandAmt.toFixed(2)}) — not a physically possible count.` });
    }
    const absDol = Math.abs(Number(v.dolDiff) || 0);
    if (onHandAmt != null && onHandAmt > 0 && absDol > onHandAmt + 0.01) {
      out.push({ wrin: v.wrin, descr: v.descr, rule: 'swing-exceeds-onhand',
        detail: `$${Math.round(absDol)} variance exceeds this item's own on-hand value ($${Math.round(onHandAmt)}) — cannot be explained by this item alone.` });
    }
    const totalUnits = oh.totalUnits != null ? Number(oh.totalUnits) : null;
    if (onHandAmt != null && onHandAmt > 0 && totalUnits != null && totalUnits > 0 && v.variance) {
      const onHandUnitPrice = onHandAmt / totalUnits;
      const impliedUnitPrice = Math.abs(Number(v.dolDiff) / Number(v.variance));
      if (onHandUnitPrice > 0 && isFinite(impliedUnitPrice) && impliedUnitPrice > 0) {
        const ratio = impliedUnitPrice / onHandUnitPrice;
        if (ratio > 1.75 || ratio < 0.57) { // ~1.75x either direction — a plausible case/each mix-up band, not a tuned statistical cutoff
          out.push({ wrin: v.wrin, descr: v.descr, rule: 'implausible-unit-price',
            detail: `Variance implies a per-unit price of $${impliedUnitPrice.toFixed(2)}, vs this item's own on-hand unit price of $${onHandUnitPrice.toFixed(2)} — check for a case-vs-each count entry error before trusting this line.` });
        }
      }
    }
  }
  return out;
}

// ── Q3 — recount detection, ACROSS-session only (task #130 scope line) ─────────────────────────
// `sessionLogRows`: inv_count_sessions log rows for this store (loadInvCountSessions() shape —
// { loc, countDate, cls, ... }), ideally spanning the current + prior period so a near-boundary
// recount isn't missed. A second dated session for the same class IS a recount — detectable today,
// no new column needed. Whether a SPECIFIC ITEM was recounted within one submission is not — see
// this file's header.
export function recountDetection({ sessionLogRows = [], loc, classesOfInterest = [] } = {}) {
  const want = String(parseInt(loc, 10));
  const byClass = {};
  for (const r of (sessionLogRows || [])) {
    if (!r || String(parseInt(r.loc, 10)) !== want || !r.cls) continue;
    (byClass[r.cls] || (byClass[r.cls] = [])).push(r.countDate);
  }
  const classes = classesOfInterest.length ? classesOfInterest : Object.keys(byClass);
  const recounts = [];
  for (const cls of classes) {
    const dates = [...new Set((byClass[cls] || []).filter(Boolean))].sort();
    if (dates.length > 1) recounts.push({ cls, dates, recountDates: dates.slice(1) });
  }
  return {
    recounts,
    withinSessionNote: 'not detectable from today\'s data — qsr_onhand/inv_count_sessions are keyed off a single last_counted timestamp with no revision history, so a correction made before submitting leaves no trace. Ask the GM directly; it still instills the importance of recounting top variance items.',
  };
}

// ── Assembles the full 5-question worksheet + counterfactual box ───────────────────────────────
// `targets`: the store's DEFAULT_TARGETS/Smart Targets/monthly_targets object (tFOBTarget is the
// fraction used for flagging). `reportLink`: an already-created share URL (createEomShareLink/
// createWeeklyShare) for Q5 — the engine never calls Supabase itself; pass null to have the UI
// offer a "generate link" action instead.
export function buildSpotCheckRuler({
  loc, storeName = null, period = null, periodType = 'weekly', countDate = null,
  fobSnap = null, targets = {}, varianceRows = [], sessionLogRows = [], onHandByWrin = {},
  topN = DEFAULT_TOP_N, materialGapPts = MATERIAL_GAP_PTS, reportLink = null,
} = {}) {
  const cf = counterfactualFob({ fobSnap, varianceRows, topN });
  const targetPct = targets?.tFOBTarget != null ? Number(targets.tFOBTarget) : null;
  const flag = flagCounterfactual({
    fobAsReportedPct: cf.fobAsReportedPct, fobWithoutMoversPct: cf.fobWithoutMoversPct,
    swingPts: cf.swingPts, targetPct, materialGapPts,
  });
  const impossibilities = impossibilityFlags({ varianceRows, onHandByWrin });
  const classesTouched = [...new Set(cf.topMovers.map(v => CLASS_DISPLAY[v.cls] || v.cls))];
  const recount = recountDetection({ sessionLogRows, loc, classesOfInterest: classesTouched });

  const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString();
  const pct = n => n == null ? null : `${(n * 100).toFixed(2)}%`;

  const questions = [
    {
      id: 'fob', q: QUESTIONS_TEXT.fob, auto: true, source: 'qsr_fob',
      answer: cf.fobAsReportedPct != null
        ? `${pct(cf.fobAsReportedPct)}${targetPct != null ? ` (target ${pct(targetPct)})` : ''}`
        : null,
      note: cf.fobAsReportedPct == null ? 'No FOB data on record for this period yet.' : null,
    },
    {
      id: 'variance-top', q: QUESTIONS_TEXT.varianceTop, auto: true, source: 'qsr_variance_stat (same ranking as eom-diagnosis.js\'s variance-top5 check, rolled up by master WRIN)',
      answer: cf.topMovers.length
        ? cf.topMovers.map(v => `${v.descr} (${v.dolDiff < 0 ? '-' : '+'}${money(Math.abs(v.dolDiff))}, ${CLASS_DISPLAY[v.cls] || v.cls}${v.rolledUpWrins ? `, net of ${v.rolledUpWrins.length} WRINs` : ''})`).join(' · ')
        : null,
      note: !cf.topMovers.length ? 'No variance/stat data on record for this period yet.' : null,
    },
    {
      id: 'recount', q: QUESTIONS_TEXT.recount, auto: true, source: 'inv_count_sessions',
      answer: recount.recounts.length
        ? recount.recounts.map(r => `${r.cls} — recounted on ${r.recountDates.join(', ')}`).join(' · ')
        : 'None on record for the classes in play this period.',
      note: `Which exact item(s) were re-entered within a single session is ${recount.withinSessionNote}`,
    },
    {
      id: 'confidence', q: QUESTIONS_TEXT.confidence, auto: false,
      answer: null,
      note: 'Not auto-computable — ask it directly. The expected answer is honest, not impressive: instills the importance of not rushing and double-checking accuracy.',
    },
    {
      id: 'reports-reviewed', q: QUESTIONS_TEXT.reportsReviewed, auto: false,
      answer: null, link: reportLink,
      note: reportLink
        ? 'Hand them this link to the real FOB/On-Hand/Variance reports for this exact store+period — "go look" is one click.'
        : 'Not auto-computable — generate a report link so "go look" is one click.',
    },
  ];

  return {
    loc, storeName, period, periodType, countDate,
    questions,
    fobComponents: fobSnap && fobSnap.sales ? fobComponentDeltas(fobSnap, targets) : [],
    counterfactual: {
      ...cf, targetPct,
      flagged: flag.flagged, flagTier: flag.tier, flagReason: flag.reason,
    },
    impossibilities,
    recount,
    generatedAt: new Date().toISOString(),
  };
}

// ── Store ranking for the weekly "deep-dive" digest (owner request, 2026-11-09) ─────────────────
// SAME per-store computation as buildSpotCheckRuler() above — this is not a second engine, just a
// rank over its own output across every store for the prior period. A hard impossibility outranks
// everything (it's a certainty, not a judgment call); then a flagged target-masking/material swing;
// then raw swing size, so an unflagged-but-notable store still sorts above a quiet one.
export function rulerGapScore(ruler) {
  const impossibilityBoost = (ruler?.impossibilities?.length || 0) * 1000;
  const flagBoost = ruler?.counterfactual?.flagged ? 500 : 0;
  const swing = Math.abs(ruler?.counterfactual?.swingPts || 0);
  return impossibilityBoost + flagBoost + swing;
}
export function rankStoresByGap(rulers = []) {
  return rulers.slice().sort((a, b) => rulerGapScore(b) - rulerGapScore(a));
}

// ── Curated Home prompt trigger — "a fresh count session just happened" ────────────────────────
// Owner, 2026-11-08: "it would or should prompt it in a timely manner." Fires when a store's most
// recent qualifying session (satisfiesWeekly or isEom — a REAL complete count, not a partial/spot)
// landed within `withinDays` of `asOf`. `sessionsByLoc`: count-cycle.js's sessionsFromLog().sessions
// shape (already loaded by curated-home.js for the Memory/Save feature — no new data source).
export function freshCountSessionPrompts(sessionsByLoc = {}, stores = [], { asOf = new Date(), withinDays = 2 } = {}) {
  // Date-only comparison (calendar days, not elapsed ms) — "2 days ago" should not flicker
  // depending on what hour `asOf` happens to be.
  const toDateOnly = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const today = toDateOnly(asOf instanceof Date ? asOf : new Date(asOf));
  const out = [];
  for (const st of (stores || [])) {
    const sessions = (sessionsByLoc || {})[st.loc] || [];
    if (!sessions.length) continue;
    // sessionsFromLog() returns sessions sorted ascending by date (Object.keys(...).sort()).
    const qualifying = sessions.filter(s => s.satisfiesWeekly || s.isEom);
    if (!qualifying.length) continue;
    const latest = qualifying[qualifying.length - 1];
    const days = Math.round((today - toDateOnly(latest.date + 'T00:00:00')) / 86400000);
    if (days < 0 || days > withinDays) continue;
    out.push({
      loc: st.loc, storeName: st.name || st.loc,
      countDate: latest.date, periodType: latest.isEom ? 'eom' : 'weekly',
      period: latest.isEom ? latest.date.slice(0, 7) : `wk:${latest.date}`,
      daysAgo: days,
    });
  }
  return out;
}
