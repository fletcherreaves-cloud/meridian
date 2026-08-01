// @ts-nocheck
// ── Count-timing artifact detection (Durant #5985 lesson, 2026-08-01) ────────────────────────────
// A variance % can be huge yet meaningless when a count lands EARLY in a period. Two numbers govern it:
//   1) daysSinceLastCount — how many days of unmeasured drift this count reconciles. QSRSoft variance is
//      point-to-point: Actual Usage = Beginning Inv (carried POS-Open theoretical) + Purchases − Ending
//      count. The Beginning Inv was last physically calibrated by the item's PRIOR count, so the drift the
//      new count exposes accumulated since that prior count (Durant: 07/29 → 08/01 = 3 days).
//   2) period sales so far — the % denominator. Early in the month it's tiny, so any variance $ explodes
//      as a %. The SAME $ over a full month is trivial (Durant: $559 = 5.60% of 1 day, 0.086% of a month).
// Rule: large days-since-count AND small share-of-period-elapsed ⇒ the % is a TIMING ARTIFACT — judge the
// absolute $ and the trend, not the %. KB-grounded (Inventory-Analysis cat.1 "poor timing of counting").
// Pure + tested; consumed by the EOM diagnosis annotation and the all-location FOB report.

const abs = v => Math.abs(Number(v) || 0);

// Days since an item's last physical count BEFORE `asOfDt`, from its raw ledger history. Counts = the
// 'inventory' events (isCount). Returns null if there's no prior count to measure from.
export function daysSinceLastCount(history, asOfDt) {
  const asOf = _day(asOfDt);
  if (!asOf) return null;
  const days = (history || [])
    .filter(h => h && h.isCount && h.dt)
    .map(h => _day(h.dt))
    .filter(d => d && d < asOf)
    .sort();
  if (!days.length) return null;
  return _diffDays(days[days.length - 1], asOf);
}

// Classify a variance reading as real signal vs count-timing artifact.
//   daysSinceCount   — from daysSinceLastCount (or the period-start gap when it's the first count)
//   periodElapsed    — days of the period elapsed so far (e.g. business day 1 → 1)
//   periodLength     — total days in the period (e.g. 31)
//   dollars          — the variance $ (absolute magnitude used)
// Returns { isArtifact, confidence: 0..1, reason, monthlyEquivalentShare }.
export function countTimingArtifact({ daysSinceCount = null, periodElapsed = null, periodLength = 30, dollars = 0 } = {}) {
  const elapsedShare = (periodElapsed != null && periodLength) ? Math.max(0, Math.min(1, periodElapsed / periodLength)) : null;
  // Denominator effect: the earlier in the period, the more a fixed $ inflates the %. Strong under ~25%.
  const denomFactor = elapsedShare == null ? 0 : elapsedShare <= 0.10 ? 1 : elapsedShare <= 0.25 ? 0.6 : elapsedShare <= 0.5 ? 0.25 : 0;
  // Drift-window effect: a count reconciling many days of theoretical-only drift carries a longer tail.
  const driftFactor = daysSinceCount == null ? 0 : daysSinceCount >= 5 ? 1 : daysSinceCount >= 3 ? 0.6 : daysSinceCount >= 2 ? 0.3 : 0;
  const confidence = Math.max(0, Math.min(1, Math.round((0.65 * denomFactor + 0.35 * driftFactor) * 100) / 100));
  const isArtifact = confidence >= 0.5;
  const bits = [];
  if (elapsedShare != null && elapsedShare <= 0.25) bits.push(`only ${periodElapsed} of ~${periodLength} days into the period (tiny sales denominator)`);
  if (daysSinceCount != null && daysSinceCount >= 2) bits.push(`reconciles ~${daysSinceCount} days of drift since the last count`);
  const reason = bits.length
    ? `Likely a count-timing artifact — ${bits.join('; ')}. Judge the absolute $ (${_m(dollars)}) and the trend, not the %.`
    : null;
  return { isArtifact, confidence, reason, elapsedShare };
}

const _m = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString();
function _day(d) {
  if (!d) return null;
  const s = String(d);
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);            // MM/DD/YYYY
  if (m) return `${m[3]}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);                       // ISO
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
function _diffDays(a, b) {   // a,b = 'YYYY-MM-DD' → whole days b−a (UTC, tz-safe)
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((db - da) / 86400000);
}
