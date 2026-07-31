// @ts-nocheck
// ── Recount-swing TIMING forensics (padding detection) ──────────────────────────────────────────
// Owner teaching (2026-07-31): a recount swing is GOOD when genuine — a manager counts, sees a big
// variance, physically recounts, and enters a correction that offsets the error. It's BAD (padding)
// when a real shortage is negated by offsetting "corrections" that were never physically recounted.
// The tell the vendor system can't hide is TIME: to legitimately produce N corrections you must walk
// the restaurant and recount N items (walk-in, freezer, dry, line, DT) — that takes a floor of time.
// If the corrections for a batch of offsetting swings land in a window physically too short to have
// recounted them, the "recount" didn't happen — the numbers were entered to negate the variance.
//
// This module is pure + testable. It's fed the swing pairs the recount-swing check already finds
// (each with the original-count timestamp and the correcting-count timestamp) and returns a batch
// verdict: plausible vs IMPLAUSIBLE, with the math shown so it's a conversation, not an accusation.
//
// The two legitimate shapes it must NOT false-flag:
//   • item-by-item recount → corrections spread out over the physical-recount time.
//   • pen-and-paper → walk + record all, THEN batch-enter — but the gap between the originals and the
//     corrections must still span the walk. Either way the ORIG→CORR window must clear the floor.

// Minutes-of-day from "H:MM AM/PM" (or "HH:MM"). Mirrors eom-item-journey.tmMin.
export function tmMin(tm) {
  const s = String(tm || '').trim(); if (!s) return 0;
  const m = s.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i); if (!m) return 0;
  let h = +m[1]; const mm = +m[2]; const ap = (m[3] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
  return h * 60 + mm;
}
// Full ms timestamp from a count event's date + time-of-day (null if the date won't parse).
export function eventTs(dt, tm) {
  const base = Date.parse(String(dt || '').slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(base)) return null;
  return base + tmMin(tm) * 60000;
}

// Physical-recount floor: the minimum time to accurately recount N items across the store. Owner's
// standard (2026-07-31): "a minimum of 20-30 minutes to accurately and fully recount those 14 items —
// that's only ~2 min/item, realistically longer." So perItemSec = 120 (walk to the item's location +
// count + record) is the conservative FLOOR, plus a small base to reach the floor. 14 items → ~29 min.
// Deliberately a floor, not an average — it should under-flag before it ever false-flags a real recount.
export const RECOUNT_DEFAULTS = { perItemSec: 120, travelBaseSec: 60, cadenceFloorSec: 30, minBatch: 3 };

// Given the batch of offsetting swings for ONE manager on ONE day, decide whether enough time
// physically elapsed to have recounted them. `swings` = [{ wrin, descr, origTs, corrTs }] (ms).
export function recountBatchTiming(swings, opts = {}) {
  const { perItemSec, travelBaseSec } = { ...RECOUNT_DEFAULTS, ...opts };
  const s = (swings || []).filter(x => x && Number.isFinite(x.origTs) && Number.isFinite(x.corrTs));
  const n = s.length;
  if (n < 2) return { n, verdict: 'insufficient', plausible: true };

  const corr = s.map(x => x.corrTs), orig = s.map(x => x.origTs);
  const corrStart = Math.min(...corr), corrEnd = Math.max(...corr), origEnd = Math.max(...orig);
  // Window physically available for the recount: from the last original to the last correction, and at
  // least the span of the corrections themselves (handles interleaved same-day recounting). Generous.
  const windowSec = Math.max(corrEnd - origEnd, corrEnd - corrStart) / 1000;
  const requiredSec = travelBaseSec + n * perItemSec;
  const cadenceSec = n > 1 ? (corrEnd - corrStart) / 1000 / (n - 1) : null;   // avg gap between correction entries
  const plausible = windowSec >= requiredSec;
  return {
    n, plausible,
    verdict: plausible ? 'plausible' : 'implausible',
    windowSec: Math.round(windowSec),
    requiredSec: Math.round(requiredSec),
    cadenceSec: cadenceSec == null ? null : Math.round(cadenceSec),
    corrStart, corrEnd, origEnd,
    // shortfall = how far under the physical floor the timing is (seconds). Bigger = more damning.
    shortfallSec: Math.max(0, Math.round(requiredSec - windowSec)),
  };
}

const mins = (sec) => sec == null ? '?' : (sec >= 90 ? `${(sec / 60).toFixed(sec < 600 ? 1 : 0)} min` : `${Math.round(sec)}s`);

// One-line, non-accusatory verdict sentence for the report/UX.
export function recountTimingSentence(t) {
  if (!t || t.verdict !== 'implausible') return '';
  const cad = t.cadenceSec != null ? ` (~${mins(t.cadenceSec)} between entries)` : '';
  return `⏱ TIMING: the ${t.n} offsetting corrections landed within ${mins(t.windowSec)}${cad} — physically recounting ${t.n} items takes at least ~${mins(t.requiredSec)}. The elapsed time doesn't support an actual walk-and-recount, so these read as offsetting entries, not a re-count. Per the trained count process a swing this size needs a 3rd-party recount — sit with the manager and have them walk you through these before accepting the count.`;
}
