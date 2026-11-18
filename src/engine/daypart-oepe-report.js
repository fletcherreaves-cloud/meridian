// @ts-nocheck
// ── OEPE w/o Parked by Daypart report ────────────────────────────────────────────────────────
// Owner request, 2026-11-18: first ask was nights only ("create a report for OEPE w/o parked
// for nights (4pm-close) for each location... do it for the entire night period but also for
// 5p-7p and 7p-cl"), shipped as a night-only report. Follow-up, same day, after seeing it live:
// "For my current purposes, as prescribed is good, but adding multiple dayparts would be
// helpful. Even a start time and end time selector would be useful." This file generalizes the
// original night-only engine into named daypart presets (Breakfast/Lunch/Dinner/4pm-Close/
// 7pm-Close) PLUS an arbitrary custom hour_slot range the caller can build on the fly -- the
// night-only behavior from the first ask is still here verbatim as 3 of the 5 presets, unchanged.
//
// Same 6 lookback periods as before (MTD / LM / Last 30 / Last 45 / Last 90 Days / YTD), reused
// from dt-oepe-report.js rather than redefined.
//
// DT OEPE here always excludes parked/held time -- the real, scored formula
// (src/utils/oepe.js's oepeSeconds()), never the diagnostic-only "with park" variant.
//
// hour_slot is the END of its hour block (daypart-peaks.js's header comment, confirmed live):
// '08:00'/'09:00' = 7-9am (Breakfast), '12:00'-'14:00' = 11am-2pm (Lunch), '18:00'/'19:00' =
// 5-7pm (Dinner), '17:00' is the 4pm-5pm block, and the 24-slot shape runs through '28:00' (the
// 3am-4am block, the last hour before the 4am ABC cutover -- CLAUDE.md's "the business day runs
// 4am to 4am"). Breakfast/Lunch/Dinner slot sets are the exact same ones daypart-peaks.js's
// DAYPART_HOUR_SLOTS already defines for the "3 Peaks" panel -- reused here, not redefined, per
// the standing "check whether a helper exists before writing one" rule. So:
//   - "Breakfast"    = hour_slot in ('08:00', '09:00')
//   - "Lunch"        = hour_slot in ('12:00', '13:00', '14:00')
//   - "Dinner"       = hour_slot in ('18:00', '19:00')              [the original "5pm-7pm" ask]
//   - "4pm-Close"    = hour_slot >= '17:00'                          [the original "entire night" ask]
//   - "7pm-Close"    = hour_slot >= '20:00'                          [the original "7p-cl" ask]
//   - a caller-supplied custom range (any start/end hour_slot pair, inclusive)
// A store that's already closed in a given hour_slot has dt_trans_cnt = 0 for that slot, which
// contributes nothing to any of these sums -- no per-store closing-time lookup is needed; "close"
// falls out automatically from summing across whatever slot range the loader pulled
// (src/lib/supabase.js's loadOepeHourlyActivity).
//
// Rolls up the same way dt-oepe-report.js and daypart-peaks.js's aggregateAutoPeaks do: sum every
// raw leg across every matching hourly row for the segment+period+store, THEN take one ratio --
// never average a day's or hour's already-divided OEPE value (CLAUDE.md's ROLLUP CAVEAT).
import { oepeSeconds } from '../utils/oepe.js';
import { DT_OEPE_WINDOW_COLS, dtOepeReportWindows } from './dt-oepe-report.js';

export const DAYPART_PRESETS = [
  { key: 'breakfast', label: 'Breakfast (7–9am)', test: slot => slot === '08:00' || slot === '09:00' },
  { key: 'lunch', label: 'Lunch (11am–2pm)', test: slot => slot === '12:00' || slot === '13:00' || slot === '14:00' },
  { key: 'dinner', label: 'Dinner (5–7pm)', test: slot => slot === '18:00' || slot === '19:00' },
  { key: 'allNight', label: '4pm–Close', test: slot => slot >= '17:00' },
  { key: 'sevenPmClose', label: '7pm–Close', test: slot => slot >= '20:00' },
];

// All real hour_slot values this table can carry, in order -- used to populate a custom
// start/end picker (the UI labels each with utils/oepe.js's hourSlotLabel()).
export const ALL_HOUR_SLOTS = Array.from({ length: 24 }, (_, i) => String(i + 5).padStart(2, '0') + ':00');

// Builds a caller-defined segment for an arbitrary inclusive hour_slot range -- the "start time
// and end time selector" the owner asked for. `start`/`end` are hour_slot strings ('05:00'..
// '28:00'); a plain string .gte/.lte-style comparison is correct here since every value is a
// zero-padded two-digit-hour string (same reasoning as the loader's own hour_slot filter).
export function customDaypartSegment(start, end) {
  if (!start || !end) return null;
  const lo = start <= end ? start : end;
  const hi = start <= end ? end : start;
  return { key: 'custom', label: `${start}–${end}`, test: slot => slot >= lo && slot <= hi };
}

function _windowRanges(asOf) {
  const windows = dtOepeReportWindows(asOf);
  const out = {};
  for (const col of DT_OEPE_WINDOW_COLS) {
    const s = new Date(windows[col.key].s); s.setHours(0, 0, 0, 0);
    const e = new Date(windows[col.key].e); e.setHours(23, 59, 59, 999);
    out[col.key] = { s, e };
  }
  return out;
}

// rows: raw qsr_daily_activity rows from loadOepeHourlyActivity (loc, dt, hour_slot,
// dt_untilserve, dt_untilstore, dt_heldtime, dt_trans_cnt). `segments` defaults to the 5 named
// presets; a caller adds a custom segment (customDaypartSegment()) to this array to compute it
// alongside, or passes just the one segment it currently needs. Returns one entry per requested
// loc: { loc, segments: { <segment.key>: {mtd,lm,...}, ... } }.
export function computeDaypartOepeReport(rows, locs, asOf, segments = DAYPART_PRESETS) {
  const d = (asOf instanceof Date && !isNaN(asOf)) ? asOf : new Date();
  const ranges = _windowRanges(d);
  const periodKeys = DT_OEPE_WINDOW_COLS.map(c => c.key);
  const activeSegments = (segments || []).filter(Boolean);

  const acc = new Map(); // loc -> segKey -> perKey -> {untilServe,untilStore,heldTime,cnt}
  const _bucket = (loc, segKey, perKey) => {
    let byLoc = acc.get(loc); if (!byLoc) { byLoc = new Map(); acc.set(loc, byLoc); }
    let bySeg = byLoc.get(segKey); if (!bySeg) { bySeg = new Map(); byLoc.set(segKey, bySeg); }
    let b = bySeg.get(perKey);
    if (!b) { b = { untilServe: 0, untilStore: 0, heldTime: 0, cnt: 0 }; bySeg.set(perKey, b); }
    return b;
  };

  for (const r of (rows || [])) {
    if (!r || !r.loc || !r.dt || !r.hour_slot) continue;
    const loc = String(r.loc).trim();
    const dt = r.dt instanceof Date ? r.dt : new Date(String(r.dt) + 'T00:00:00');
    if (isNaN(dt)) continue;
    for (const seg of activeSegments) {
      if (!seg.test(r.hour_slot)) continue;
      for (const perKey of periodKeys) {
        const range = ranges[perKey];
        if (dt < range.s || dt > range.e) continue;
        const b = _bucket(loc, seg.key, perKey);
        b.untilServe += r.dt_untilserve || 0;
        b.untilStore += r.dt_untilstore || 0;
        b.heldTime += r.dt_heldtime || 0;
        b.cnt += r.dt_trans_cnt || 0;
      }
    }
  }

  return (locs || []).map(loc => {
    const locStr = String(loc).trim();
    const byLoc = acc.get(locStr);
    const segmentsOut = {};
    for (const seg of activeSegments) {
      const bySeg = byLoc?.get(seg.key);
      const row = {};
      for (const perKey of periodKeys) {
        const b = bySeg?.get(perKey);
        row[perKey] = b
          ? oepeSeconds({ dt_untilserve: b.untilServe, dt_untilstore: b.untilStore, dt_heldtime: b.heldTime, dt_trans_cnt: b.cnt })
          : null;
      }
      segmentsOut[seg.key] = row;
    }
    return { loc: locStr, segments: segmentsOut };
  });
}
