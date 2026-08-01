// @ts-nocheck
// ── Trading-day (weekday-aligned) period comparison ─────────────────────────────────────────────
// Owner (2026-08-01): Meridian is built on DAILY pulls, so a PARTIAL-period comparison is only fair when
// the day-of-week MIX matches — restaurant sales swing hugely by weekday (weekends >> weekdays). Rules:
//   • If the current range is a WHOLE number of weeks (7 / 14 / 21 / 28 …), every weekday appears the
//     same number of times → it's already balanced → a plain calendar comparison is fair.
//   • If it's a PARTIAL-week range (e.g. MTD through the 10th), the weekday mix is lopsided → we MUST
//     align the prior period by day-of-week, or the comparison is apples-to-oranges.
// The clean trick for year-over-year: shift by 52 weeks = 364 days (NOT 365), which preserves the weekday
// EXACTLY (364 = 52×7). This module is the pure, tested foundation that vs-LY / projections-pace / movers
// wire into. All dates in/out are 'YYYY-MM-DD' (local, tz-safe — we never let a shift drift across midnight).

const DAY_MS = 86400000;

// Parse 'YYYY-MM-DD' (or a Date) to a LOCAL-midnight Date — component-built so no tz drift on shifts.
function toLocal(d) {
  if (d instanceof Date) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const m = String(d).slice(0, 10).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}
function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Inclusive day count of a range.
export function rangeDays(start, end) {
  const a = toLocal(start), b = toLocal(end);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / DAY_MS) + 1;
}

// A whole number of weeks → weekdays are already balanced → calendar comparison is fair.
export function isWholeWeeks(start, end) {
  const n = rangeDays(start, end);
  return n > 0 && n % 7 === 0;
}

// A partial-week range needs weekday alignment to compare fairly.
export function needsTradingAlignment(start, end) {
  return rangeDays(start, end) > 0 && !isWholeWeeks(start, end);
}

// Count of each weekday (0=Sun..6=Sat) in the range — the building block for pace weighting.
export function weekdayCounts(start, end) {
  const out = [0, 0, 0, 0, 0, 0, 0];
  let d = toLocal(start); const b = toLocal(end);
  if (!d || !b) return out;
  while (d <= b) { out[d.getDay()]++; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); }
  return out;
}

// Shift a date by n days (n<0 = back), returned as 'YYYY-MM-DD'.
export function shiftDays(day, n) {
  const d = toLocal(day); if (!d) return null;
  return fmt(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

// Weekday-aligned prior-year comparable range: shift back yearsBack × 364 days (52-week multiple), which
// keeps the day-of-week identical to the current range. Preferred over a 365-day / same-calendar-date LY.
export function priorYearRange(start, end, yearsBack = 1) {
  const n = -364 * yearsBack;
  return { start: shiftDays(start, n), end: shiftDays(end, n) };
}

// THE helper callers use: the FAIR prior range to compare a current range against, plus how it was aligned.
// basis 'ly' = year-over-year (52-week shift). Returns { start, end, days, method, aligned, note }:
//   method 'trading'     — a partial range; weekday-aligned shift was REQUIRED for fairness.
//   method 'calendar-ok' — a whole-week range; calendar comparison was already fair (shift still applied
//                          for exact weekday match, but it wasn't strictly necessary).
export function comparableRange(curStart, curEnd, { basis = 'ly', yearsBack = 1 } = {}) {
  const days = rangeDays(curStart, curEnd);
  const whole = isWholeWeeks(curStart, curEnd);
  if (basis === 'ly') {
    const r = priorYearRange(curStart, curEnd, yearsBack);
    return {
      ...r, days, aligned: true,
      method: whole ? 'calendar-ok' : 'trading',
      note: whole
        ? `${days}-day whole-week range — weekdays already balanced (calendar comparison is fair)`
        : `${days}-day partial range — weekday-aligned to LY via a 52-week (364-day) shift`,
    };
  }
  return { start: curStart, end: curEnd, days, aligned: false, method: 'calendar-ok', note: 'no basis alignment applied' };
}
