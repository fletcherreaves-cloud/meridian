// @ts-nocheck
// ── Attention feed hook ────────────────────────────────────────────────────────
// useAttentionFeed fuses buildBrief's per-store findings with the cross-domain
// detectors in src/engine/attention-feed.js (food-cost outliers, behind-LY,
// drive-thru speed, sync health, visit-readiness, signal decay) into one ranked
// feed. The standalone "Attention Now" modal that used to render this feed
// directly (WhatNeedsAttentionPanel) was retired 2026-08-10 (issue #115) — its
// content is fully absorbed into AttentionPanel (src/views/analytics.js), which
// this hook now feeds exclusively.
import * as React from 'react';
import { STORE_NAMES, DEFAULT_TARGETS } from '../constants.js';
import { matchedVsLY } from '../engine/vs-ly.js';
import { metricAvg } from '../engine/metric-source.js';
import { computeVisitReadiness } from '../engine/visit-readiness.js';
import { lastClosedBusinessDay } from '../engine/swing-feed.js';
import { addD } from '../utils/date.js';
import { buildAttentionFeed, mergeWorstSalesLY } from '../engine/attention-feed.js';
import { loadGradedVisits, loadSavedCorrelations, loadEomCountExceptions, loadEomIntegrityFlags } from '../lib/supabase.js';
import { recordFireVolume } from '../engine/insight-ledger-measure.js';

const { useMemo, useState, useEffect } = React;
export const unpad = (l) => String(l || '').replace(/^0+/, '') || String(l || '');
const nm = (l) => STORE_NAMES[unpad(l)] || unpad(l);

// FOB-by-store for the latest month present in the auto qsr_fob stream (same
// Σ$ ÷ Σsales math the dashboard uses).
function fobByStoreLatest(rows) {
  const monthOf = (r) => (typeof r.date === 'string' ? r.date : (r.date && r.date.toISOString ? r.date.toISOString() : '')).slice(0, 7);
  const months = [...new Set((rows || []).map(monthOf).filter(Boolean))].sort();
  const latest = months.pop();
  if (!latest) return {};
  const acc = {};
  for (const r of rows) {
    if (monthOf(r) !== latest) continue;
    const loc = unpad(r.loc);
    const a = acc[loc] || (acc[loc] = { sales: 0, fob: 0 });
    a.sales += r.prodSalesAmt || 0;
    a.fob += (r.compWasteAmt || 0) + (r.rawWasteAmt || 0) + (r.condimentsAmt || 0) + (r.empMgrMealsAmt || 0) + (r.statVarianceAmt || 0) + (r.unexplainedAmt || 0);
  }
  for (const loc in acc) { const a = acc[loc]; a.fob$ = a.fob; a.fobPct = a.sales ? a.fob / a.sales : null; }
  return acc;
}

// ── Shared engine hook (Needs Attention / Attention Now merge, Part 1) ──────────────────────
// Both AttentionPanel (analytics.js) and WhatNeedsAttentionPanel below now go through this ONE
// hook, so buildAttentionFeed is the single engine for both instead of AttentionPanel grouping
// store.findings itself. `briefFindings` (buildBrief's per-store findings, already carrying
// severity/category/dollars/title/detail/loc via finding-rules.js's attachFindingMeta) is
// merged in alongside the other 9 detectors via findingsToFeedItems, so a store showing up in
// EITHER of the old panels shows up here too.
//
// `max` is a real parameter, not a fixed constant, because the two consumers need genuinely
// different shapes: WhatNeedsAttentionPanel wants a flat top-N "what to look at first" list
// (max:20, unchanged from before); AttentionPanel wants a store-GROUPED view where a flat
// top-15/20 cap would silently drop whole stores, so it passes an effectively unbounded max —
// rankAttention's own no-silent-caps warning is what protects against that mistake being made
// silently at either call site, not a magic number picked here.
export function useAttentionFeed({ ds, stores, dateRange, max = 20 }) {
  const allLocs = useMemo(() => (stores || []).filter(s => /^\d+$/.test(s.loc)).map(s => s.loc), [stores]);

  // Phase-2 inputs load async (graded visits → readiness; saved correlations → decay; EOM exceptions).
  const [gradedVisits, setGradedVisits] = useState(ds?.gradedVisits || null);
  const [savedCorr, setSavedCorr] = useState(null);
  const [exceptions, setExceptions] = useState(null);   // eom_count_exceptions for the current period → Integrity
  const [integrity, setIntegrity] = useState(null);     // eom_integrity_flags (recount-padding batches) → Integrity
  useEffect(() => {
    let live = true;
    if (!ds?.gradedVisits) loadGradedVisits().then(v => { if (live) setGradedVisits(v || []); }).catch(() => { if (live) setGradedVisits([]); });
    loadSavedCorrelations().then(c => { if (live) setSavedCorr(c || []); }).catch(() => { if (live) setSavedCorr([]); });
    const period = new Date().toISOString().slice(0, 7);
    loadEomCountExceptions({ period }).then(m => { if (live) setExceptions(m || {}); }).catch(() => { if (live) setExceptions({}); });
    loadEomIntegrityFlags({ period }).then(f => { if (live) setIntegrity(f || []); }).catch(() => { if (live) setIntegrity([]); });
    return () => { live = false; };
  }, [ds]);

  const visitStores = useMemo(() => {
    if (!gradedVisits) return [];
    // computeVisitReadiness returns { stores, district, weights, ... } — NOT an array.
    // visitRisk() does `for (const s of (stores || []))`, so passing the whole object
    // throws "(e || []) is not iterable" and takes the panel down. This was latent from
    // v4.552: the try/catch returned [] whenever the call THREW for want of graded-visit
    // data, which masked it. It only surfaced once the data was complete enough to
    // succeed — a crash that appears when the data gets better.
    try { return computeVisitReadiness({ ...ds, gradedVisits })?.stores || []; } catch { return []; }
  }, [ds, gradedVisits]);

  return useMemo(() => {
    // Freshest business date across the auto streams → data age in days.
    const tMs = Date.now();
    const pick = (arr) => (arr || []).map(r => r.date).filter(Boolean)
      .map(d => d instanceof Date ? d.getTime() : new Date(d).getTime())
      .filter(ms => !Number.isNaN(ms) && ms <= tMs);
    const fresh = [...pick(ds?.laborRows), ...pick(ds?.qsrActSummaryRows), ...pick(ds?.qsrFobRows), ...pick(ds?.glimpseRows), ...pick(ds?.salesLedgerRows)];
    const ageDays = fresh.length ? Math.floor((tMs - Math.max(...fresh)) / 864e5) : null;

    const fobByStore = fobByStoreLatest(ds?.qsrFobRows || []);
    const salesLYWindow = allLocs.map(loc => { const m = matchedVsLY(ds, [loc], dateRange); return { loc, cur: m.cur, ly: m.ly }; })
      .filter(r => r.ly > 0);
    // Rolling 28-day window, independent of whatever dateRange is currently selected — a
    // real multi-week decline shouldn't need to clear salesBehindLY's threshold in one
    // specific week to surface here (Notes 63 part 2). >=14-of-28 matched-days floor mirrors
    // the same guard buildBrief's trailing-28-day detector uses (engine/pipeline.js), so an
    // aggregate built from a handful of days doesn't get treated as a trend.
    // Ends on the last CLOSED business day, not literal "now" — otherwise today's
    // still-filling partial day matches against a FULL last-year day and inflates every
    // decline (signature #4 — same defect the swing alarm hit 2026-08-07, see
    // swing-feed.js's businessDate() doc).
    const lastClosedRolling = lastClosedBusinessDay();
    const rollingRange = { s: addD(lastClosedRolling, -27), e: lastClosedRolling };
    const salesLYRolling = allLocs.map(loc => {
      const m = matchedVsLY(ds, [loc], rollingRange);
      return { loc, cur: m.cur, ly: m.ly, days: m.days };
    }).filter(r => r.ly > 0 && r.days >= 14);
    // Worse of the two windows per store — never averaged, never both shown (that would be
    // a duplicate row for the same store at two severities).
    const salesLY = mergeWorstSalesLY(salesLYWindow, salesLYRolling);

    // Drive-thru speed vs each store's own OEPE target. The slowDT detector has been
    // implemented and tested since the engine was written but was never fed inputs, so
    // it silently contributed nothing. Sourced through metricAvg (auto-first per day)
    // per the standing rule — never filter opsRows directly.
    // Note: OEPE is a mean of daily values, not car-weighted — the source stores it as a
    // ratio with no car count (see memory/notes-57-metric-registry-plan.md §4).
    const dtRows = allLocs.map(loc => {
      const dt = metricAvg(ds, [loc], dateRange, 'oepe');
      const tgt = (DEFAULT_TARGETS[unpad(loc)] || {}).tOepe;
      return (dt != null && tgt != null) ? { loc, dt, target: Number(tgt) } : null;
    }).filter(Boolean);

    const countExceptionRows = Object.entries(exceptions || {}).map(([loc, e]) => ({ loc, acceptedDate: e.acceptedDate, approvedBy: e.approvedBy }));
    const integrityItems = (integrity || []).map(f => ({ id: `intg-${f.loc}-${f.kind}`, loc: f.loc, severity: f.severity, dollars: f.dollars, title: `${nm(f.loc)} — ${f.title || 'integrity flag'}`, detail: f.detail, nav: 'analytics' }));
    const briefFindings = (stores || []).flatMap(s => s.findings || []);
    // issue #143 — Insight Ledger step 0 instrumentation. Observation only: recordFireVolume
    // never touches what buildAttentionFeed returns, it just writes a day-bucketed count of
    // what fired to a throwaway Supabase blob. See engine/insight-ledger-measure.js.
    return buildAttentionFeed({ fobByStore, targetsByLoc: DEFAULT_TARGETS, salesLY, dtRows, ageDays, visitStores, savedCorrelations: savedCorr || [], countExceptionRows, integrityItems, briefFindings, storeName: nm, max, onFireVolume: recordFireVolume });
  }, [ds, stores, allLocs, dateRange, visitStores, savedCorr, exceptions, integrity, max]);
}

// WhatNeedsAttentionPanel (the standalone "Attention Now" modal) was retired 2026-08-10
// (issue #115, Part 2 of the merge into Needs Attention — AttentionPanel in analytics.js).
// Its content is fully absorbed there: the pinned district strip carries the loc-less
// items (staleData, signalDecay) this panel used to be the only surface for.
