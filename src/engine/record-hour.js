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

// Best 60-minute window for ONE store-day's quarter-hour rows. `slotMinutes` on each row
// is the END of that 15-minute bucket (qtr_slot/endQtrHourTime's own convention — see
// labor-standard.js's DAYPARTS header comment), so 4 consecutive end-times e, e+15, e+30,
// e+45 cover the real clock interval [e-15, e+45]. Requires true 15-minute CONTIGUITY
// between all 4 buckets — a gap (a missed pull, a short day) breaks any window that would
// span it, rather than silently summing non-adjacent buckets into a fake "60 minutes."
// Returns null if the day has fewer than RECORD_HOUR_WINDOW_SLOTS rows or no 4 are
// contiguous (e.g. a store closed most of the day).
function bestWindowForDay(dayRows) {
  const sorted = [...dayRows].sort((a, b) => a.slotMinutes - b.slotMinutes);
  let best = null;
  for (let i = 0; i + RECORD_HOUR_WINDOW_SLOTS <= sorted.length; i++) {
    const w = sorted.slice(i, i + RECORD_HOUR_WINDOW_SLOTS);
    let contiguous = true;
    for (let j = 1; j < w.length; j++) {
      if (w[j].slotMinutes - w[j - 1].slotMinutes !== SLOT_MINUTES) { contiguous = false; break; }
    }
    if (!contiguous) continue;
    const sales = w.reduce((s, r) => s + (Number(r.netSales) || 0), 0);
    if (!best || sales > best.sales) {
      best = {
        sales,
        startMinutes: w[0].slotMinutes - SLOT_MINUTES,
        endMinutes:   w[w.length - 1].slotMinutes,
      };
    }
  }
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
