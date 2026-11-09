// @ts-nocheck
// Shift Scoreboard -- SM/AM/DM front door (task #122, owner-confirmed metric list 2026-11-08:
// "Agree with your response. Go ahead"). Fourth of the "Four Decks" builds (Game Plan,
// src/engine/game-plan.js; The Patch, src/engine/patch-plan.js). Pure data layer only;
// src/views/shift-scoreboard-view.js owns rendering.
//
// Every tile reads TODAY via metric-source.js's metricDaily() -- the exact same single-day
// accessor every other live "today" tile in this app already uses (At-A-Glance, Store
// Dashboard). The dispatch #153 zero-fill trap (CLAUDE.md) is about AVERAGING an in-progress
// day into a multi-day rate (metricAvg/metricSumRatio) -- a single metricDaily() read of today
// is the established safe pattern for a live tile, not a new risk.
//
// Owner's metric list, 2026-11-08 (task #122 description) + Claude-proposed additions,
// confirmed: OEPE, R2P, KVS Time, Healthy Use of KVS/Side 2, Labor %, TPPH, Act vs Sched
// (hours), Act vs Needed (hours), Cash Controls (T-Red Before/After %, POS-Over $, Cash O/S $).
// "+/- Hours vs Sched" and "Act vs Sched" are the SAME underlying signed-hour-gap chain
// (actVsSched) -- metric-source.js has one such chain, not two, so they collapse to one tile
// here rather than fabricating a second metric that doesn't exist. FOB and count-cycle
// completion are deliberately NOT live tiles (owner-confirmed) -- see
// countCycleReminderStrip() below for how that surfaces instead.
import { metricDaily, metricDirection } from './metric-source.js';
import { DEFAULT_TARGETS } from '../constants.js';

export const SCOREBOARD_METRICS = [
  { id: 'oepe',        label: 'OEPE',                        metricKey: 'oepe',       unit: 'sec', targetKey: 'tOepe' },
  { id: 'r2p',         label: 'R2P',                         metricKey: 'r2p',        unit: 'sec', targetKey: 'tR2p' },
  { id: 'kvst',        label: 'KVS Time',                    metricKey: 'kvst',       unit: 'sec', targetKey: 'tKvst' },
  { id: 'kvsHealthy',  label: 'Healthy Use of KVS/Side 2',   metricKey: 'kvsHealthy', unit: 'pct', targetKey: 'tKvsu' },
  { id: 'laborPct',    label: 'Labor %',                     metricKey: 'laborPct',   unit: 'pct', targetKey: 'tLabor' },
  { id: 'tpph',        label: 'TPPH',                        metricKey: 'tpph',       unit: 'num', targetKey: 'tTpph' },
  { id: 'actVsSched',  label: 'Act vs Sched (hrs)',          metricKey: 'actVsSched', unit: 'hrs', targetKey: null },
  { id: 'actVsNeed',   label: 'Act vs Needed (hrs)',         metricKey: 'actVsNeed',  unit: 'hrs', targetKey: null },
  { id: 'tRedAPct',    label: 'T-Red Before %',              metricKey: 'tRedAPct',   unit: 'pct', targetKey: 'tRedAPct' },
  { id: 'tRedBPct',    label: 'T-Red After %',               metricKey: 'tRedBPct',   unit: 'pct', targetKey: 'tRedBPct' },
  { id: 'posOverAmt',  label: 'POS-Over $',                  metricKey: 'posOverAmt', unit: 'usd', targetKey: 'tPosOverAmt' },
  { id: 'cashOSAmt',   label: 'Cash O/S $',                  metricKey: 'cashOSAmt',  unit: 'usd', targetKey: 'tCashOSAmt' },
];

export const DEFAULT_VISIBLE_METRIC_IDS = SCOREBOARD_METRICS.map(m => m.id);

// Per-store tiles for TODAY, filtered to the caller's chosen visible set (configurable metrics,
// per the task's "allow customization as to what metrics should be shown" requirement) --
// default is every metric, in the catalog's own order. A store with no DEFAULT_TARGETS entry
// still renders every tile's live value; `target` is simply null for it, never fabricated.
export function computeShiftScoreboardTiles(ds, loc, asOf = new Date(), visibleIds = DEFAULT_VISIBLE_METRIC_IDS) {
  const targets = DEFAULT_TARGETS[String(loc)] || null;
  const wanted = new Set(visibleIds);
  return SCOREBOARD_METRICS
    .filter(m => wanted.has(m.id))
    .map(m => ({
      id: m.id,
      label: m.label,
      unit: m.unit,
      value: metricDaily(ds, loc, asOf, m.metricKey),
      direction: metricDirection(m.metricKey),
      target: (targets && m.targetKey != null) ? (targets[m.targetKey] ?? null) : null,
    }));
}

// Sales $ and guest-count pace vs plan, today so far -- reuses the SAME QSRSoft plan fields
// Signals' LiveOps Tracking-to-Plan tile already reads (projSales/projGC, metric-source.js),
// never a second, independently-derived forecast.
export function computeShiftPaceVsPlan(ds, loc, asOf = new Date()) {
  const sales = metricDaily(ds, loc, asOf, 'sales');
  const projSales = metricDaily(ds, loc, asOf, 'projSales');
  const gc = metricDaily(ds, loc, asOf, 'gc');
  const projGC = metricDaily(ds, loc, asOf, 'projGC');
  return {
    sales, projSales,
    salesPacePct: (sales != null && projSales > 0) ? ((sales - projSales) / projSales * 100) : null,
    gc, projGC,
    gcPacePct: (gc != null && projGC > 0) ? ((gc - projGC) / projGC * 100) : null,
  };
}

// Divergence signal #1 (memory/plan-shift-scoreboard-2026-11-07.md, owner-endorsed: "I can
// agree here!") -- guest-count pace and sales pace disagreeing in direction is invisible from
// either number scanned alone. Gated on BOTH clearing a minimum magnitude so two near-zero
// values on opposite sides of 0% don't fire a flag that means nothing.
export const DIVERGENCE_MIN_PCT = 5;
export function shiftDivergenceFlag(pace) {
  if (!pace || pace.salesPacePct == null || pace.gcPacePct == null) return null;
  const bothMoved = Math.abs(pace.salesPacePct) >= DIVERGENCE_MIN_PCT && Math.abs(pace.gcPacePct) >= DIVERGENCE_MIN_PCT;
  const oppositeSigns = (pace.salesPacePct > 0) !== (pace.gcPacePct > 0);
  if (!bothMoved || !oppositeSigns) return null;
  const guestsUp = pace.gcPacePct > 0;
  return {
    id: 'traffic-sales-divergence',
    headline: guestsUp
      ? `Guest counts are up ${pace.gcPacePct.toFixed(1)}% vs plan but sales are down ${Math.abs(pace.salesPacePct).toFixed(1)}%`
      : `Sales are up ${pace.salesPacePct.toFixed(1)}% vs plan but guest counts are down ${Math.abs(pace.gcPacePct).toFixed(1)}%`,
    detail: guestsUp
      ? 'More guests than planned without the sales to match — check suggestive selling, pricing, or a register/promo issue.'
      : 'Sales ahead of plan without the traffic to explain it — check average check/upsell, or whether guest counts are under-captured.',
  };
}

// Divergence signal #2 -- a binary cash-integrity flag (T-Red spike), rare + urgent, a badge
// not a tile, per the owner-endorsed divergence-signal framing. Gated against the STORE'S OWN
// target (DEFAULT_TARGETS varies 0.09%-5% on tRedAPct alone across stores), never a generic
// district-wide threshold.
export const CASH_SPIKE_MULTIPLE = 2;
export function shiftCashIntegrityFlag(ds, loc, asOf = new Date()) {
  const targets = DEFAULT_TARGETS[String(loc)] || null;
  if (!targets) return null;
  const checks = [
    { key: 'tRedAPct', targetKey: 'tRedAPct', label: 'T-Red Before %' },
    { key: 'tRedBPct', targetKey: 'tRedBPct', label: 'T-Red After %' },
  ];
  for (const c of checks) {
    const value = metricDaily(ds, loc, asOf, c.key);
    const target = targets[c.targetKey];
    if (value != null && target > 0 && value >= target * CASH_SPIKE_MULTIPLE) {
      return {
        id: 'cash-integrity-' + c.key,
        headline: `${c.label} is ${(value * 100).toFixed(2)}% today — more than ${CASH_SPIKE_MULTIPLE}x this store's own ${(target * 100).toFixed(2)}% target`,
        detail: 'Worth a real-time look at the drawer/register in question before close.',
      };
    }
  }
  return null;
}
