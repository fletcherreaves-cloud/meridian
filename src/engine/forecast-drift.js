// @ts-nocheck
// ── Rolling Forecast — Commit & Drift (owner-directed 2026-11-09) ──────────────────────────────
// Pure logic over forecast_rolling_captures / forecast_commits (supabase/schema-forecast-rolling-
// captures.sql). See memory/project-rolling-forecast-snapshots-2026-11-09.md for the full design.
//
// The core idea, in the owner's own words from this session: a daily capture job appends a new
// row to forecast_rolling_captures every day, NEVER overwriting — the freshest row for a given
// (loc, period_type, target_period) is the live forecast, and the full set is a complete revision
// history for free. "Committing" a period doesn't freeze a number, it just names which captured
// row (by captured_date) is the official plan — a pointer, not a second copy of the data. Drift is
// the live comparison between those two: the freshest capture vs. the committed one.

// Severity tiers for drift, expressed as a multiple of the existing forecast-tolerance convention
// this file's sibling (forecast.js) already uses everywhere a forecast is graded against an
// actual (`settings.tolerance||5`, see forecastDay's own varPct/pass computation) — reusing that
// number rather than inventing an unrelated one, since "how far off is acceptable" is already a
// real, owner-tunable setting elsewhere in this app.
//   on-track: |delta%| <= tolerance            (the forecast moved, but within normal noise)
//   watching: tolerance < |delta%| <= 2×tolerance   (worth a look, not yet alarming)
//   alert:    |delta%| > 2×tolerance            (significant swing — this is what pushes a notification)
export const DRIFT_WATCH_MULTIPLIER = 2;

/**
 * Pure. Given the freshest capture's value and the committed capture's value for the same
 * (loc, period_type, target_period), returns the drift read. `toleranceePct` mirrors
 * settings.tolerance (a whole-number percent, e.g. 5 for 5%), defaulting to the same 5 every
 * other tolerance-driven read in this app defaults to when settings isn't available.
 *
 * Returns null when there's nothing to compare (no commit yet, or the committed value is 0/falsy
 * — a 0 commit has no meaningful percentage base) — the caller shows "not yet committed" rather
 * than a misleading 0%/Infinity read.
 */
export function computeDrift(liveValue, committedValue, toleranceePct = 5) {
  if (!(committedValue > 0) || liveValue == null || !Number.isFinite(Number(liveValue))) return null;
  const live = Number(liveValue);
  const committed = Number(committedValue);
  const deltaPct = ((live - committed) / committed) * 100;
  const absPct = Math.abs(deltaPct);
  const tier = absPct <= toleranceePct ? 'on-track'
    : absPct <= toleranceePct * DRIFT_WATCH_MULTIPLIER ? 'watching'
    : 'alert';
  return { liveValue: live, committedValue: committed, deltaPct, tier };
}

/**
 * Pure. Given a store's full capture history for one (period_type, target_period) — an array of
 * {capturedDate, forecastValue} rows, any order — returns the freshest one (max capturedDate).
 * Null for an empty array. Shared by both the capture job (which just wrote today's row and wants
 * "is this now the freshest") and the UI (which loads a window of history and wants "what's live
 * right now").
 */
export function freshestCapture(captures) {
  if (!captures || !captures.length) return null;
  return captures.reduce((latest, c) => (!latest || c.capturedDate > latest.capturedDate ? c : latest), null);
}

/**
 * Pure. Given a store's full capture history and a commit's `committedCapturedDate`, finds the
 * exact capture row the commit points at. Null if the pointed-at row isn't in the given set (e.g.
 * it rolled off whatever window the caller loaded — the caller should fall back to the commit's
 * own denormalized value if it has one, such as forecast_commit_history.committed_value).
 */
export function committedCapture(captures, committedCapturedDate) {
  if (!captures || !committedCapturedDate) return null;
  return captures.find(c => c.capturedDate === committedCapturedDate) || null;
}
