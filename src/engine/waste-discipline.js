// @ts-nocheck
// ── Data-discipline score (#209) ─────────────────────────────────────────────
// QSRSoft's own Food Cost Routines KB: enter Raw and Completed waste daily, minimum once per
// shift — "if waste is missing, follow up with managers to address procedural issues."
// Unrecorded waste does not vanish; it lands in Unexplained. A store with missing waste days
// has an inflated Unexplained and a FOB% not comparable to any other store's — this is the
// trust leg of the coaching spine (#201 identifies -> this makes the numbers real -> #210
// diagnoses labor -> #208 verifies).
//
// Two things this file exists to get right, per the issue:
//   1. "Expected" is DERIVED from each store's own observed submission pattern, never assumed
//      as daily-for-everyone. Mirrors engine/count-cycle.js's shape (detectSessions/
//      cycleCompliance) — derive from what actually happened, not a fixed calendar rule. That
//      is the correct precedent here; engine/eom-inventory.js's fixed 3-day EOM window is NOT
//      — it assumes a schedule rather than deriving one, and is EOM-only besides.
//   2. Missing != zero. qsr_waste rows are discrete events (one row per entry) with NO
//      null-vs-zero column — the only "missing" signal is the absence of any row for a
//      (loc, date, type). This file treats "no row" and "a real $0 entry" as different facts
//      throughout; a caller must never collapse "0 missing days" and "0 entries found" into
//      the same rendered state (the exact v4.870 failure class the FOB Report false-all-clear
//      fix, v4.976, addressed earlier this same session).
//
// COVER_FRAC borrowed, not re-measured: reuses count-cycle.js's own 0.75 (measured from 158
// real count-sessions, memory/feedback-measure-dont-reason.md) as the "this is a real
// recurring pattern, not noise" bar for a day-of-week's submission frequency. Reusing an
// already-measured repo-wide threshold is different from inventing a new unmeasured one — no
// live Supabase session in this sandbox to independently measure waste-submission cadence.
import { isHoliday } from '../utils/holidays.js';

export const COVER_FRAC = 0.75;
export const LOOKBACK_DAYS = 56; // 8 weeks — enough DOW repetitions to judge a pattern, short enough to track a recent schedule change
export const RECENT_WINDOW_DAYS = 14; // how far back "currently missing" looks, once the pattern is known

const unpad = (l) => String(l || '').replace(/^0+/, '') || String(l || '');
const dOnly = (d) => {
  if (!d) return null;
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
};
const addDays = (dateStr, n) => { const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const dowOf = (dateStr) => new Date(dateStr + 'T12:00:00').getDay();

/** Group qsr_waste rows by (loc, type) -> Set of distinct dates with at least one entry. */
function datesByLocType(rows = []) {
  const out = {};
  for (const r of (rows || [])) {
    if (!r || !r.loc || !r.type) continue;
    const d = dOnly(r.dt);
    if (!d) continue;
    const loc = unpad(r.loc);
    const key = loc + '|' + r.type;
    (out[key] || (out[key] = new Set())).add(d);
  }
  return out;
}

/**
 * Which days-of-week this store actually submits `wtype` entries on, derived from the
 * trailing LOOKBACK_DAYS of observed dates — never assumed. A DOW counts as "expected" when
 * entries were present on at least COVER_FRAC of that DOW's occurrences in the window.
 * Returns a Set of DOW indices (0=Sun..6=Sat); empty if there's not enough history to judge.
 */
export function expectedDaysOfWeek(dateSet, asOf) {
  const start = addDays(asOf, -LOOKBACK_DAYS);
  const dowOccurrences = {}, dowHits = {};
  for (let d = start; d <= asOf; d = addDays(d, 1)) {
    const dow = dowOf(d);
    dowOccurrences[dow] = (dowOccurrences[dow] || 0) + 1;
    if (dateSet.has(d)) dowHits[dow] = (dowHits[dow] || 0) + 1;
  }
  const expected = new Set();
  for (const dow of Object.keys(dowOccurrences)) {
    const occ = dowOccurrences[dow];
    if (occ < 3) continue; // not enough repetitions in the window to call a pattern
    if ((dowHits[dow] || 0) / occ >= COVER_FRAC) expected.add(+dow);
  }
  return expected;
}

/**
 * Per-store, per-waste-type missing-entry days over the trailing RECENT_WINDOW_DAYS, against
 * that store's OWN derived expected-DOW pattern. A closed/holiday day (isHoliday fullClosure)
 * is never flagged — the store genuinely has nothing to record.
 */
export function computeMissingWasteDays(rows = [], { asOf = null } = {}) {
  const today = dOnly(asOf) || new Date().toISOString().slice(0, 10);
  const byKey = datesByLocType(rows);
  const out = {}; // loc -> { raw: {...}, completed: {...} }
  for (const key of Object.keys(byKey)) {
    const [loc, wtype] = key.split('|');
    const dateSet = byKey[key];
    const expectedDows = expectedDaysOfWeek(dateSet, today);
    const missingDates = [];
    let expectedCount = 0;
    if (expectedDows.size) {
      const start = addDays(today, -RECENT_WINDOW_DAYS);
      for (let d = start; d <= today; d = addDays(d, 1)) {
        if (!expectedDows.has(dowOf(d))) continue;
        const h = isHoliday(new Date(d + 'T12:00:00'));
        if (h && h.fullClosure) continue; // genuinely closed — nothing to record, not a miss
        expectedCount++;
        if (!dateSet.has(d)) missingDates.push(d);
      }
    }
    (out[loc] || (out[loc] = {}))[wtype] = {
      expectedDows: [...expectedDows].sort(),
      expectedCount, missingDates, missingCount: missingDates.length,
      // null (not 0) when there's no derivable pattern yet — distinct from "pattern derived,
      // zero missing." A store with under 3 weeks of history reports null here, not a false 100%.
      pctOnTime: expectedCount ? +(((expectedCount - missingDates.length) / expectedCount) * 100).toFixed(1) : null,
    };
  }
  return out;
}

/**
 * $ consequence, ESTIMATED not decomposed — the issue's own phrasing ("surface the dollar
 * consequence where it CAN BE estimated"). No code in this repo traces Unexplained back to a
 * specific missing entry (confirmed before writing this — see memory/
 * project-inventory-auto-wiring-214.md-style research for #209 in this file's own commit).
 * This estimates a MISSING day's plausible $ as the store's own average entry amount for that
 * type on days it DOES submit — the best available proxy, not a measurement of the actual
 * Unexplained contribution.
 */
export function estimateMissingWasteImpact(rows = [], missingByLocType) {
  const sums = {}, counts = {}; // 'loc|type' -> {sum,n}
  for (const r of (rows || [])) {
    if (!r || !r.loc || !r.type || !(r.amount > 0)) continue;
    const key = unpad(r.loc) + '|' + r.type;
    sums[key] = (sums[key] || 0) + r.amount;
    counts[key] = (counts[key] || 0) + 1;
  }
  const out = {};
  for (const loc of Object.keys(missingByLocType || {})) {
    let est = 0;
    for (const wtype of Object.keys(missingByLocType[loc])) {
      const key = loc + '|' + wtype;
      const avg = counts[key] ? sums[key] / counts[key] : 0;
      est += avg * (missingByLocType[loc][wtype].missingCount || 0);
    }
    out[loc] = +est.toFixed(2);
  }
  return out;
}

/**
 * Per-store rollup: one row per store, both waste types, an overall discipline pct, and the
 * estimated $ impact. `pctOnTime` is null (not collapsed into a store's overall figure) when
 * a type has no derivable pattern yet — an overall pct only averages the types that HAVE one.
 */
export function computeStoreDataDiscipline(rows = [], { asOf = null } = {}) {
  const missing = computeMissingWasteDays(rows, { asOf });
  const impact = estimateMissingWasteImpact(rows, missing);
  return Object.keys(missing).sort().map(loc => {
    const raw = missing[loc].raw || null;
    const completed = missing[loc].completed || null;
    const pcts = [raw, completed].filter(t => t && t.pctOnTime != null).map(t => t.pctOnTime);
    return {
      loc, raw, completed,
      overallPct: pcts.length ? +(pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(1) : null,
      totalMissing: (raw?.missingCount || 0) + (completed?.missingCount || 0),
      estImpact: impact[loc] || 0,
    };
  });
}

/** District rollup for a tile header — mirrors count-cycle.js's cycleSummary shape. */
export function disciplineSummary(discipline = []) {
  const s = { stores: discipline.length, totalMissing: 0, totalEstImpact: 0, storesWithMissing: 0, storesWithoutPattern: 0 };
  for (const d of discipline) {
    s.totalMissing += d.totalMissing;
    s.totalEstImpact += d.estImpact;
    if (d.totalMissing > 0) s.storesWithMissing++;
    if (d.overallPct == null) s.storesWithoutPattern++;
  }
  s.totalEstImpact = +s.totalEstImpact.toFixed(2);
  return s;
}
