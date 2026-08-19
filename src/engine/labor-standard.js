// @ts-nocheck
// ── Labor-standard engine (dispatch20 §3) ────────────────────────────────────
// Source of truth: memory/analysis-labor-allocation-2026-08-18.md +
// memory/analysis-labor-allocation-queries.sql (owner-run against qsr_daily_activity,
// 27 stores, 90 days). Every number this file's tests assert against is copied
// verbatim from that already-measured, already-proven analysis — this is encoding a
// proven result, not deriving a new one.
//
// Two independent pieces:
//   1. THE ALLOCATION VIEW (§3a) — scheduled_vs_guide and punched_vs_scheduled as
//      SEPARATE columns per store/daypart. A single punched_vs_guide number cannot
//      tell a scheduling problem (Group A: Bonifay, schedule short, execution fine)
//      from an execution problem (Group B: Lindsay, schedule fine, people don't
//      arrive) apart — conflating them tells one of the two groups exactly the wrong
//      thing to fix. See the file's "KEY INSIGHT" section.
//   2. THE OVERNIGHT STANDARD (§3b) — the owner's close-down/pre-open hours standard,
//      which the VLH guide cannot answer for a closed restaurant (guide is
//      guest-count-driven; a closed store returns near-zero and can't say what a
//      close-down should cost).
//
// ── DAYPART BOUNDARIES — THE VLH GUIDE'S OWN, do not re-derive ───────────────
// Breakfast 5a-11a | Lunch 11a-2p | Afternoon 2p-5p | Dinner 5p-11p | Late Night 11p-5a
// hour_slot is the END of the hour block, running '05:00' -> '28:00' across the 4am
// business day (24 slots). '05:00' (the 4-5am block) is therefore Late Night at the
// START of the business day, and hours 24-28 (the wrapped 00:00-04:00 block) are also
// Late Night. This is the exact case-statement from analysis-labor-allocation-queries.sql,
// ported to JS so app and SQL can never drift onto two different boundary sets — the
// trap CLAUDE.md's own standing note says recurred five times before becoming one
// shared answer for the business-day cutover; this is that same trap for daypart
// boundaries specifically.
export const DAYPARTS = ['Breakfast', 'Lunch', 'Afternoon', 'Dinner', 'Late Night'];

export function daypartOf(hourSlot) {
  const h = parseInt(String(hourSlot).slice(0, 2), 10);
  if (h >= 6 && h <= 11) return 'Breakfast';
  if (h >= 12 && h <= 14) return 'Lunch';
  if (h >= 15 && h <= 17) return 'Afternoon';
  if (h >= 18 && h <= 23) return 'Dinner';
  return 'Late Night'; // 05, and the wrapped 24-28 (00:00-04:00)
}

const unpad = (l) => String(parseInt(l, 10) || '');

// ── §3a — THE ALLOCATION VIEW ─────────────────────────────────────────────────
// `rows`: hourly qsr_daily_activity rows — { loc, dt, hour_slot, dt_trans_cnt,
// actual_punched_hours, total_needed_hours, total_scheduled_hours, actual_punched_dollars }.
//
// 24-SLOT COMPLETENESS GUARD — mandatory, not optional. A short DAR day understates
// any denominator and silently inflates the ratio above it (a day with 18 of 24 slots
// pulled still divides by whatever hours DID land, reading artificially efficient or
// artificially over/understaffed depending on which slots are missing). Matches the
// SQL's `complete_days` CTE exactly: only (loc, dt) pairs with all 24 distinct
// hour_slots are included.
function completeDayKeys(rows) {
  const byDay = new Map(); // "loc|dt" -> Set(hour_slot)
  for (const r of rows) {
    if (!r || !r.loc || !r.dt || !r.hour_slot) continue;
    const k = r.loc + '|' + (r.dt instanceof Date ? r.dt.toISOString().slice(0, 10) : String(r.dt).slice(0, 10));
    if (!byDay.has(k)) byDay.set(k, new Set());
    byDay.get(k).add(r.hour_slot);
  }
  const complete = new Set();
  for (const [k, slots] of byDay) if (slots.size === 24) complete.add(k);
  return complete;
}

function dayKeyOf(r) {
  return r.loc + '|' + (r.dt instanceof Date ? r.dt.toISOString().slice(0, 10) : String(r.dt).slice(0, 10));
}

// RATIO OF SUMS, never average-of-per-row-ratios — sum every leg across all rows in
// the bucket first, divide once. Standing rule, restated because it is the single
// easiest way to get this file quietly wrong.
function ratio(num, den) { return den > 0 ? num / den : null; }

/**
 * Per-(loc, daypart) allocation view — scheduled_vs_guide and punched_vs_scheduled as
 * SEPARATE fields, per the file's own explicit requirement. Do not collapse them into
 * one number; a store can be short on one leg and fine on the other (Group A vs
 * Group B in the breakfast-deficit finding), and a single blended ratio erases exactly
 * the distinction that makes the finding actionable.
 *
 * Also carries `tpph`/`secPerCar` at this SAME (loc, daypart) grain — Dispatch29's
 * "ENGINEER TASK — TPPH from DAR" step 2, extended to every daypart (not just the Late
 * Night case it was motivated by), reusing this function's own hour_slot iteration
 * rather than a separate pass. This is a genuinely finer grain than METRIC_SOURCES'
 * `tpph` chain (per-day only, via qsrActSummaryRows' daily rollup) — that daily chain
 * stays exactly as-is; this is an ADDITION for daypart-level panels, not a replacement.
 * `tpph` uses `dt_trans_cnt` (drive-thru only), matching this function's own `cars` —
 * deliberately NOT the all-channel `transactions` field, so both figures share one
 * denominator (Dispatch29's own explicit warning: "pick one deliberately and label it").
 * `secPerCar` = Σdt_untilserve (already a per-row SUM of milliseconds, confirmed against
 * graded-visits.js's own secOf()) ÷ Σcars ÷ 1000 — ratio of sums, same discipline as
 * every other figure in this file.
 *
 * Returns { [loc]: { [daypart]: { gapHrs, punchedVsGuide, scheduledVsGuide,
 *   punchedVsScheduled, tpph, secPerCar, cars, punchedHrs, neededHrs, scheduledHrs,
 *   untilserveMs } } } — untilserveMs is the raw Σdt_untilserve for this bucket,
 *   exposed (like the other raw sums) so allocationDistrict can sum it again rather
 *   than re-deriving it from secPerCar*cars, which would reintroduce rounding error.
 */
export function allocationByStoreDaypart(rows) {
  const complete = completeDayKeys(rows);
  const buckets = new Map(); // "loc|daypart" -> sums
  for (const r of rows) {
    if (!r || !r.hour_slot) continue;
    if (!complete.has(dayKeyOf(r))) continue;
    const loc = unpad(r.loc);
    const dp = daypartOf(r.hour_slot);
    const k = loc + '|' + dp;
    if (!buckets.has(k)) buckets.set(k, { loc, dp, cars: 0, punchedHrs: 0, neededHrs: 0, scheduledHrs: 0, untilserveMs: 0 });
    const b = buckets.get(k);
    b.cars += r.dt_trans_cnt || 0;
    b.punchedHrs += r.actual_punched_hours || 0;
    b.neededHrs += r.total_needed_hours || 0;
    b.scheduledHrs += r.total_scheduled_hours || 0;
    b.untilserveMs += r.dt_untilserve || 0;
  }
  const out = {};
  for (const b of buckets.values()) {
    if (!out[b.loc]) out[b.loc] = {};
    out[b.loc][b.dp] = {
      gapHrs: b.punchedHrs - b.neededHrs,
      punchedVsGuide: ratio(b.punchedHrs, b.neededHrs),
      scheduledVsGuide: ratio(b.scheduledHrs, b.neededHrs),
      punchedVsScheduled: ratio(b.punchedHrs, b.scheduledHrs),
      tpph: ratio(b.cars, b.punchedHrs),
      secPerCar: b.cars > 0 ? (b.untilserveMs / b.cars / 1000) : null,
      cars: b.cars, punchedHrs: b.punchedHrs, neededHrs: b.neededHrs, scheduledHrs: b.scheduledHrs,
      untilserveMs: b.untilserveMs,
    };
  }
  return out;
}

/** District-wide rollup, one row per daypart — the Query 1 replica. */
export function allocationDistrict(rows) {
  const byStore = allocationByStoreDaypart(rows);
  const totals = {};
  for (const dp of DAYPARTS) totals[dp] = { cars: 0, punchedHrs: 0, neededHrs: 0, scheduledHrs: 0, untilserveMs: 0 };
  for (const storeDp of Object.values(byStore)) {
    for (const dp of DAYPARTS) {
      const c = storeDp[dp];
      if (!c) continue;
      totals[dp].cars += c.cars;
      totals[dp].punchedHrs += c.punchedHrs;
      totals[dp].neededHrs += c.neededHrs;
      totals[dp].scheduledHrs += c.scheduledHrs;
      totals[dp].untilserveMs += c.untilserveMs;
    }
  }
  const out = {};
  for (const dp of DAYPARTS) {
    const t = totals[dp];
    out[dp] = {
      gapHrs: t.punchedHrs - t.neededHrs,
      punchedVsGuide: ratio(t.punchedHrs, t.neededHrs),
      scheduledVsGuide: ratio(t.scheduledHrs, t.neededHrs),
      punchedVsScheduled: ratio(t.punchedHrs, t.scheduledHrs),
      tpph: ratio(t.cars, t.punchedHrs),
      secPerCar: t.cars > 0 ? (t.untilserveMs / t.cars / 1000) : null,
      cars: t.cars, punchedHrs: t.punchedHrs, neededHrs: t.neededHrs, scheduledHrs: t.scheduledHrs,
    };
  }
  return out;
}

// ── §3b — OVERNIGHT: is the store even open? ─────────────────────────────────
// Query 5's own criterion: pct of Late Night hour_slots with ANY drive-thru
// transaction. Near 0 = closed overnight (punched hours are production, not missed
// coverage — the guide is not claiming they're wrong). Near 100 = genuinely open,
// the guide gap is a real coverage question and belongs in the allocation view above,
// NOT the overnight standard below. A general classifier, not a hardcoded name list —
// which nine stores this is true for will drift as operations change.
const CLOSED_OVERNIGHT_PCT_THRESHOLD = 5; // pct_slots_with_cars below this = closed

export function overnightOpenness(rows) {
  const complete = completeDayKeys(rows);
  const byStore = new Map();
  for (const r of rows) {
    if (!r || !r.hour_slot || daypartOf(r.hour_slot) !== 'Late Night') continue;
    if (!complete.has(dayKeyOf(r))) continue;
    const loc = unpad(r.loc);
    if (!byStore.has(loc)) byStore.set(loc, { loc, slotsWithCars: 0, slotsTotal: 0, nights: new Set(), cars: 0, punchedHrs: 0, neededHrs: 0 });
    const b = byStore.get(loc);
    b.slotsTotal++;
    if ((r.dt_trans_cnt || 0) > 0) b.slotsWithCars++;
    b.nights.add(dayKeyOf(r));
    b.cars += r.dt_trans_cnt || 0;
    b.punchedHrs += r.actual_punched_hours || 0;
    b.neededHrs += r.total_needed_hours || 0;
  }
  const out = {};
  for (const b of byStore.values()) {
    const pct = b.slotsTotal > 0 ? (100 * b.slotsWithCars / b.slotsTotal) : null;
    out[b.loc] = {
      pctSlotsWithCars: pct, isClosedOvernight: pct != null && pct < CLOSED_OVERNIGHT_PCT_THRESHOLD,
      nights: b.nights.size, carsPerNight: b.nights.size > 0 ? b.cars / b.nights.size : null,
      punchedHrsPerNight: b.nights.size > 0 ? b.punchedHrs / b.nights.size : null,
      neededHrsPerNight: b.nights.size > 0 ? b.neededHrs / b.nights.size : null,
      gapHrs: b.punchedHrs - b.neededHrs,
    };
  }
  return out;
}

// ── §3b — the owner's close-down / pre-open standard ─────────────────────────
export const CLOSE_DOWN_HOURS = { low: 3, high: 4 };   // combined labor hrs after close
export const PRE_OPEN_HOURS = 3;                       // 1 mgr + 2 crew, clocked in 1hr before open

// Excel day-fraction -> 24hr decimal hour. 0.2083333 -> 5.0, 0.25 -> 6.0, etc.
export function fracToHour(frac) { return frac == null ? null : frac * 24; }

/**
 * Where does the pre-open hour land? Crew clocks in exactly 1hr before open, i.e. the
 * window [open-1, open). The fraction of THAT hour before 5:00am is what lands in Late
 * Night; the rest lands in Breakfast. A 5:00am opener puts the whole hour in Late
 * Night (fraction 1); a 6:00am opener puts none of it there (fraction 0); a 5:30am
 * opener splits it evenly (fraction 0.5) — reproduces the file's own worked examples
 * (Ardmore-Cooper 5:00 -> 3.0 in LN; Sulphur 6:00 -> 0; Lindsay 5:30 -> 1.5) exactly.
 */
export function preOpenLateNightFraction(openHour) {
  if (openHour == null) return null;
  return Math.max(0, Math.min(1, 6 - openHour));
}

/**
 * The Late Night standard for ONE weekday at ONE store: combined close-down (always,
 * every closed-overnight store has a close-down) plus whatever share of the pre-open
 * hour falls before 5am. Returns { low, high, preOpenInLN } in hours, or null if the
 * store is 24hr (the close-down/pre-open model does not apply to a store that never
 * closes — see Ponce de Leon below).
 */
export function lateNightStandardForDay(openHour, is24hr) {
  if (is24hr) return null;
  const frac = preOpenLateNightFraction(openHour);
  const preOpenInLN = frac == null ? 0 : frac * PRE_OPEN_HOURS;
  return { low: CLOSE_DOWN_HOURS.low + preOpenInLN, high: CLOSE_DOWN_HOURS.high + preOpenInLN, preOpenInLN };
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Per-store overnight excess vs the owner's standard. `storeLaborConfig`: the
 * loadStoreLaborConfig() shape, keyed by UNPADDED loc (`{[loc]: {is24hr, hours:
 * {sun:{open,close,hours}, ...}}}`) -- note store_labor_config.loc is unpadded while
 * qsr_daily_activity.loc is zero-padded to 7; overnightOpenness() above already
 * unpads via the shared `unpad()` helper so both sides match on the same key.
 * `openness`: overnightOpenness()'s output, gating which stores this standard even
 * applies to (only isClosedOvernight stores -- a genuinely-open 24hr store like Ponce
 * de Leon has no "close-down" in this sense and must not be graded against it).
 *
 * MIXED-HOURS GUARD: if a store's open time (or the resulting standard) varies across
 * the week -- most commonly a 24hr weekend ("24 HR W/E") folded into an otherwise
 * fixed weekday schedule -- a single weekly-average comparison is unsafe (a 24hr
 * Saturday blended with a midnight-closing Monday erases the variation, per the file's
 * Chickasha example: 32.0 punched vs 2.43 AVERAGE open hours). Returns
 * `safeForWeeklyAverage: false` and the per-weekday standards separately in that case
 * rather than collapsing them into one misleading number.
 */
export function overnightExcessByStore(storeLaborConfig, openness) {
  const out = {};
  for (const [loc, o] of Object.entries(openness || {})) {
    if (!o.isClosedOvernight) continue;
    const cfg = storeLaborConfig[loc];
    if (!cfg) { out[loc] = { na: true, reason: 'no store_labor_config row' }; continue; }
    if (cfg.is24hr) { out[loc] = { na: true, reason: '24hr store -- standard does not apply' }; continue; }
    const perDay = {};
    let anyMixed = false;
    let sawStandard = null;
    for (const wd of WEEKDAYS) {
      const h = (cfg.hours || {})[wd];
      if (!h || h.open == null) continue;
      const openHour = fracToHour(h.open);
      const std = lateNightStandardForDay(openHour, cfg.is24hr);
      perDay[wd] = { openHour, ...std };
      const key = std ? std.low + '|' + std.high : 'na';
      if (sawStandard == null) sawStandard = key; else if (sawStandard !== key) anyMixed = true;
    }
    const punchedPerNight = o.punchedHrsPerNight;
    // Weekly-average verdict only when every weekday shares the same standard AND
    // is24Note doesn't carry the "24 HR W/E" (or similar) nuance the file names.
    const noteMixed = !!(cfg.is24Note && /24/i.test(cfg.is24Note));
    const safeForWeeklyAverage = !anyMixed && !noteMixed;
    let verdict = null;
    if (safeForWeeklyAverage && sawStandard && sawStandard !== 'na') {
      const [low, high] = sawStandard.split('|').map(Number);
      const overStandard = punchedPerNight > high;
      const underStandard = punchedPerNight < low;
      verdict = {
        standardLow: low, standardHigh: high, punchedPerNight,
        excess: overStandard ? punchedPerNight - high : null,       // matches the file's "excess/night" column
        shortfall: underStandard ? low - punchedPerNight : null,
        overStandard, underStandard, onTarget: !overStandard && !underStandard,
      };
    }
    out[loc] = { safeForWeeklyAverage, perDay, punchedPerNight, verdict,
      is24Note: cfg.is24Note || null };
  }
  return out;
}
