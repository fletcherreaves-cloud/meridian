// @ts-nocheck
// ── Record Hour in Sales ──────────────────────────────────────────────────────
// The single best 60-CONSECUTIVE-MINUTE rolling window of sales a store has ever had,
// built from true 15-minute buckets (qsr_sales_quarter_hour — see scripts/
// qsrsoft-sales-quarter-hour-pull.mjs and supabase/schema-qsr-sales-quarter-hour.sql).
// Owner's own framing: "I don't care how the hour is formed, just that it is :60
// minutes consecutively" — any 15-minute-aligned start counts the same as a clock hour
// (7:15am-8:15am == 7:00am-8:00am). This is a genuine sliding-window maximum over 4
// consecutive quarter-hour buckets. A prior V1 (if it ships) uses only qsr_daily_
// activity's fixed clock-hour buckets (best single hour_slot) because no 15-minute sales
// data existed anywhere in Meridian before this table — this is the real fix.
//
// Deliberately pure/engine-only (no React), same split record-day.js already uses for
// computeRecords (reused as-is by store-analytics.js's StoreRecordsTab) — independently
// testable, and reusable from more than one view without re-deriving the sliding-window
// logic a second time.
import { dKey, businessDate } from '../utils/date.js';
import { daypartOf } from './labor-standard.js';

export const RECORD_HOUR_WINDOW_SLOTS = 4;   // 4 x 15min = 60 minutes
const SLOT_MINUTES = 15;

// ── Categories + metrics (owner request 2026-10-13: breakfast/daypart-scoped records, other
// metrics beyond sales, historical top-5/previous-record) ─────────────────────────────────
// `daypart: null` for 'overall' means "no restriction" -- every other category filters
// candidate windows to those whose START falls in that daypart (DAYPARTS/daypartOf,
// labor-standard.js -- the SAME classification computeHourRecords already uses for its
// single `best.daypart` field, just applied as a filter instead of a label here).
export const HOUR_CATEGORIES = [
  { key:'overall',    label:'Any Hour',   daypart:null },
  { key:'breakfast',  label:'Breakfast',  daypart:'Breakfast' },
  { key:'lunch',      label:'Lunch',      daypart:'Lunch' },
  { key:'afternoon',  label:'Afternoon',  daypart:'Afternoon' },
  { key:'dinner',     label:'Dinner',     daypart:'Dinner' },
  { key:'latenight',  label:'Late Night', daypart:'Late Night' },
];

// `field` matches the per-window sums allWindowsForDay() computes below (netSales/
// transactions are the two metrics qsr_sales_quarter_hour actually carries at quarter-hour
// grain -- productSales tracks net_sales too closely to be a distinct record, and the
// dt_* split has no non-DT counterpart to make "best hour" meaningful across all dayparts).
export const HOUR_METRICS = [
  { key:'sales',        label:'Sales $',      field:'sales',        fmt:'currency' },
  { key:'transactions', label:'Transactions', field:'transactions', fmt:'count' },
];

function fmtClock(totalMinutes) {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const h24  = Math.floor(wrapped / 60);
  const m    = wrapped % 60;
  const h12  = ((h24 % 12) + 11) % 12 + 1;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Exported for the UI layer — e.g. "7:15 AM – 8:15 AM". Minutes are the RAW (un-wrapped)
// business-day minutes a window's start/end carry (can exceed 1440 for the wrapped
// 00:00-04:00 tail) — fmtClock wraps only for display, never for the daypart/ordering math.
export function windowLabel(startMinutes, endMinutes) {
  return `${fmtClock(startMinutes)} – ${fmtClock(endMinutes)}`;
}

function groupByStoreDay(rows) {
  const out = new Map();
  for (const r of rows || []) {
    if (!r || r.loc == null || !r.date || r.slotMinutes == null) continue;
    const key = String(r.loc) + '|' + dKey(r.date);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(r);
  }
  return out;
}

// Every valid contiguous 4-slot window for ONE store-day's quarter-hour rows, with BOTH
// metrics summed and its start-hour daypart attached — computed ONCE per day so a caller
// scanning several category/metric combinations (computeHourLeaderboard below) never re-walks
// the same day's buckets per combination. `slotMinutes` on each row is the END of that
// 15-minute bucket (qtr_slot/endQtrHourTime's own convention — see labor-standard.js's
// DAYPARTS header comment), so 4 consecutive end-times e, e+15, e+30, e+45 cover the real
// clock interval [e-15, e+45]. Requires true 15-minute CONTIGUITY between all 4 buckets — a
// gap (a missed pull, a short day) breaks any window that would span it, rather than silently
// summing non-adjacent buckets into a fake "60 minutes." Returns [] if the day has fewer than
// RECORD_HOUR_WINDOW_SLOTS rows or no 4 are contiguous (e.g. a store closed most of the day).
function allWindowsForDay(dayRows) {
  const sorted = [...dayRows].sort((a, b) => a.slotMinutes - b.slotMinutes);
  const windows = [];
  for (let i = 0; i + RECORD_HOUR_WINDOW_SLOTS <= sorted.length; i++) {
    const w = sorted.slice(i, i + RECORD_HOUR_WINDOW_SLOTS);
    let contiguous = true;
    for (let j = 1; j < w.length; j++) {
      if (w[j].slotMinutes - w[j - 1].slotMinutes !== SLOT_MINUTES) { contiguous = false; break; }
    }
    if (!contiguous) continue;
    const startMinutes = w[0].slotMinutes - SLOT_MINUTES;
    const startHourRaw = Math.floor(startMinutes / 60);   // NOT wrapped -- daypartOf
    windows.push({
      startMinutes,
      endMinutes: w[w.length - 1].slotMinutes,
      daypart: daypartOf(String(startHourRaw).padStart(2, '0') + ':00'),
      sales:        w.reduce((s, r) => s + (Number(r.netSales)     || 0), 0),
      transactions: w.reduce((s, r) => s + (Number(r.transactions) || 0), 0),
    });
  }
  return windows;
}

// Thin wrapper over allWindowsForDay for computeHourRecords' own "overall/sales" contract
// (unchanged since this function shipped — see record-hour.test.js). Kept separate from
// computeHourLeaderboard's category/metric-aware scan below rather than routing
// computeHourRecords through it, so this file's original, already-tested behavior can never
// be perturbed by the newer code.
function bestWindowForDay(dayRows) {
  const windows = allWindowsForDay(dayRows);
  if (!windows.length) return null;
  let best = windows[0];
  for (const w of windows) if (w.sales > best.sales) best = w;
  return best;
}

// Pure computation across every store. `ds.qsrSalesQtrHourRows` — see
// loadQsrSalesQuarterHour (src/lib/supabase.js) for the row shape this expects:
// {loc, date, qtrSlot, slotMinutes, netSales, ...}. That field is a metric-source.js
// LAZY_FILL_SOURCES entry (consumer-triggered, see record-day.js's HourRecordTab for the
// ensureLazyFill('qsrSalesQtrHourRows') call), so this can legitimately be called with
// `ds.qsrSalesQtrHourRows` still undefined before the first trigger — returns null, same
// as computeRecords returns null for `!ds?.loaded`.
export function computeHourRecords(ds, { windowDays = 60 } = {}) {
  const rows = ds?.qsrSalesQtrHourRows;
  if (!rows || !rows.length) return null;

  let dataEnd = null;
  for (const r of rows) {
    const d = r.date instanceof Date ? r.date : new Date(r.date);
    if (!dataEnd || d > dataEnd) dataEnd = d;
  }
  if (!dataEnd) return null;
  const windowStart = new Date(dataEnd.getTime() - windowDays * 86400000);

  // Same same-day completeness guard record-day.js's computeRecords uses (dispatch #103):
  // the current McDonald's business day is still accumulating quarter-hour buckets, so a
  // "best window" computed from whatever has landed so far could look like a record purely
  // because the rest of the day hasn't posted yet. Never allowed to become a CONFIRMED
  // all-time record — reported as PROVISIONAL only (see isProvisional below).
  const todayKey = businessDate();

  const byStoreDay = groupByStoreDay(rows);
  const locDays = new Map();
  for (const [key, dayRows] of byStoreDay) {
    const sep = key.lastIndexOf('|');
    const loc = key.slice(0, sep), dk = key.slice(sep + 1);
    if (!locDays.has(loc)) locDays.set(loc, []);
    locDays.get(loc).push({ dk, rows: dayRows });
  }

  const stores = {};          // loc -> { best: {...,dk,isProvisional,daypart}, daysWithData }
  const recentBreakers = [];

  for (const [loc, days] of locDays) {
    days.sort((a, b) => a.dk.localeCompare(b.dk));
    let confirmedBest = null;   // the permanent, non-provisional running best
    let daysWithData = 0;

    for (const { dk, rows: dayRows } of days) {
      const w = bestWindowForDay(dayRows);
      if (!w) continue;
      daysWithData++;

      const isProvisional = dk >= todayKey;
      const startHourRaw  = Math.floor(w.startMinutes / 60);   // NOT wrapped -- daypartOf
      const daypart       = daypartOf(String(startHourRaw).padStart(2, '0') + ':00');
      const entry = { ...w, loc, dk, isProvisional, daypart };

      const priorBest = confirmedBest ? confirmedBest.sales : 0;
      if (w.sales > priorBest) {
        const dt = new Date(dk + 'T00:00:00');
        if (dt >= windowStart) {
          recentBreakers.push({ ...entry, prev: confirmedBest ? confirmedBest.sales : null });
        }
        if (!isProvisional) confirmedBest = entry;
      }
    }

    // Days are processed oldest-first and `isProvisional` can only be true for today (or a
    // defensively clock-skewed future row) — the very last entry, if at all — so a store
    // with real history always has a confirmedBest by the time the loop ends. Only a
    // brand-new store with ONLY today's data has none; surface today's provisional reading
    // rather than a bare dash, visibly marked, never persisted as "the" record.
    const fallbackProvisional = !confirmedBest && days.length
      ? (() => {
          const last = days[days.length - 1];
          const w = bestWindowForDay(last.rows);
          if (!w) return null;
          const startHourRaw = Math.floor(w.startMinutes / 60);
          return { ...w, loc, dk: last.dk, isProvisional: true, daypart: daypartOf(String(startHourRaw).padStart(2, '0') + ':00') };
        })()
      : null;

    const best = confirmedBest || fallbackProvisional;
    if (best) stores[loc] = { best, daysWithData };
  }

  recentBreakers.sort((a, b) => b.dk.localeCompare(a.dk));

  let distBest = null;
  for (const [loc, s] of Object.entries(stores)) {
    if (!distBest || s.best.sales > distBest.sales) distBest = { ...s.best, loc };
  }

  return { stores, recentBreakers, distBest, dataEnd, windowDays, totalStores: Object.keys(stores).length };
}

// Narrow a computeHourRecords() result to one location scope — same null-means-"All
// Locations"-unchanged contract record-day.js's scopeRecordData uses, so the common case
// never pays for a copy it doesn't need and can never disagree with the unscoped result.
export function scopeHourRecords(data, locs) {
  if (!data || !locs) return data;
  const locSet = new Set(locs.map(String));
  const stores = {};
  for (const [loc, s] of Object.entries(data.stores)) if (locSet.has(String(loc))) stores[loc] = s;
  const recentBreakers = data.recentBreakers.filter(b => locSet.has(String(b.loc)));
  let distBest = null;
  for (const [loc, s] of Object.entries(stores)) if (!distBest || s.best.sales > distBest.sales) distBest = { ...s.best, loc };
  return { ...data, stores, recentBreakers, distBest, totalStores: Object.keys(stores).length };
}

// ── Leaderboard: category/metric-scoped, with top-N history ────────────────────────────────
// Built for the owner's follow-up ask (2026-10-13): best BREAKFAST hour, best LUNCH/DINNER/
// etc. hour (not just whichever daypart the single overall-best window happened to land in),
// the same for a second metric (transactions, not just sales $), and historical context —
// "previous record" (rank 2) and a top-5-all-time list, not just the current #1. Deliberately
// a SEPARATE function from computeHourRecords rather than a parameter added to it: that
// function's "overall/sales, one best value per store" contract is unit-tested exactly as it
// stands (record-hour.test.js) and has a real caller (store-analytics.js's StoreRecordsTab
// indirectly, via record-day.js) that only ever wants that one shape — adding category/metric/
// topN branching into it would risk perturbing output every existing assertion checks.
//
// Insert each day's confirmed best-in-category/metric value into a running top-N (desc,
// capped) rather than scanning the full history at the end — O(topN) per insert, trivial at
// this scale (a few hundred store-days).
function insertTopN(arr, entry, n) {
  let i = arr.length;
  arr.push(entry);
  while (i > 0 && arr[i - 1].value < entry.value) { arr[i] = arr[i - 1]; i--; }
  arr[i] = entry;
  if (arr.length > n) arr.length = n;
}

export function computeHourLeaderboard(ds, { windowDays = 60, category = 'overall', metric = 'sales', topN = 5 } = {}) {
  const rows = ds?.qsrSalesQtrHourRows;
  if (!rows || !rows.length) return null;

  const catDef    = HOUR_CATEGORIES.find(c => c.key === category) || HOUR_CATEGORIES[0];
  const metricDef = HOUR_METRICS.find(m => m.key === metric) || HOUR_METRICS[0];
  const field     = metricDef.field;

  let dataEnd = null;
  for (const r of rows) {
    const d = r.date instanceof Date ? r.date : new Date(r.date);
    if (!dataEnd || d > dataEnd) dataEnd = d;
  }
  if (!dataEnd) return null;

  // Same same-day completeness gate computeHourRecords uses above (dispatch #103's standing
  // rule) — today's still-accumulating business day can never enter the permanent top-N.
  const todayKey = businessDate();

  const byStoreDay = groupByStoreDay(rows);
  const locDays = new Map();
  for (const [key, dayRows] of byStoreDay) {
    const sep = key.lastIndexOf('|');
    const loc = key.slice(0, sep), dk = key.slice(sep + 1);
    if (!locDays.has(loc)) locDays.set(loc, []);
    locDays.get(loc).push({ dk, rows: dayRows });
  }

  const stores = {};   // loc -> { top:[...desc,confirmed-only], provisionalToday, daysWithData }

  for (const [loc, days] of locDays) {
    days.sort((a, b) => a.dk.localeCompare(b.dk));
    const top = [];
    let provisionalToday = null;
    let daysWithData = 0;

    for (const { dk, rows: dayRows } of days) {
      const windows = allWindowsForDay(dayRows);
      if (!windows.length) continue;
      const pool = catDef.daypart ? windows.filter(w => w.daypart === catDef.daypart) : windows;
      if (!pool.length) continue;
      daysWithData++;

      let best = pool[0];
      for (const w of pool) if (w[field] > best[field]) best = w;
      const entry = {
        loc, dk, value: best[field],
        startMinutes: best.startMinutes, endMinutes: best.endMinutes, daypart: best.daypart,
        isProvisional: dk >= todayKey,
      };

      if (entry.isProvisional) { provisionalToday = entry; continue; }   // never joins the top-N
      insertTopN(top, entry, topN);
    }

    if (top.length || provisionalToday) stores[loc] = { top, provisionalToday, daysWithData };
  }

  // District-wide top-N: since no single store can ever contribute more than `topN` entries
  // to a `topN`-sized cross-store ranking, pooling each store's own (already topN-capped) list
  // is provably sufficient — no need to retain every window ever seen just to re-derive this.
  const pool = [];
  for (const s of Object.values(stores)) pool.push(...s.top);
  pool.sort((a, b) => b.value - a.value);
  const distTop = pool.slice(0, topN);

  return {
    stores, distTop, dataEnd, windowDays, topN,
    category: catDef.key, metric: metricDef.key,
    totalStores: Object.keys(stores).length,
  };
}

// Narrow a computeHourLeaderboard() result to one location scope — same null-means-"All
// Locations"-unchanged contract scopeHourRecords uses. distTop is re-derived from the scoped
// stores' own top lists rather than re-scanning raw data, by the same "no store can contribute
// more than topN entries" argument computeHourLeaderboard's own distTop relies on.
export function scopeHourLeaderboard(data, locs) {
  if (!data || !locs) return data;
  const locSet = new Set(locs.map(String));
  const stores = {};
  for (const [loc, s] of Object.entries(data.stores)) if (locSet.has(String(loc))) stores[loc] = s;
  const pool = [];
  for (const s of Object.values(stores)) pool.push(...s.top);
  pool.sort((a, b) => b.value - a.value);
  const distTop = pool.slice(0, data.topN);
  return { ...data, stores, distTop, totalStores: Object.keys(stores).length };
}
