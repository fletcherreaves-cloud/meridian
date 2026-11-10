// @ts-nocheck
// ── Drift / trajectory detection — Phase 2 (dispatch 2026-11-10, building on Phase 1's
// security-health.js) ────────────────────────────────────────────────────────────────────────
// The owner's own words, from the "Security Health Dashboard" deep-dive (§4, "Red flags on
// drift, not just a threshold breach"): "we identify a metric is moving in the wrong direction
// and that creates a red flag." Today's rules (security-rules.js) are point-in-time -- one
// window's z-score/ratio vs. a baseline. That catches a sudden spike. It does NOT say "this has
// been getting worse for 3 windows running," which the deep-dive doc names as usually the more
// actionable pattern, and one that should surface BEFORE a metric fully crosses its own static
// threshold, not just after.
//
// This file is ADDITIVE, exactly as the doc specifies ("This is additive, not a replacement --
// the static rules keep running exactly as they do today... Drift is a second, independent
// signal"). It never changes evaluateRule()/evaluateZScoreRule()'s own pass/fail verdicts, and it
// is NOT the "persistence/convergence multiplier" the deep-dive doc scoped as a SEPARATE, later
// phase (§3's own sketch formula) -- drift asks "is the trajectory worsening," persistence asks
// "how many consecutive windows has this ALREADY been flagged," convergence asks "how many
// independent rules agree THIS window." Building persistence/convergence here would conflate two
// explicitly different concepts the doc itself named apart; they stay out of scope.
//
// "Magnitude" per window reuses security-health.js's own findingMagnitude() -- the SAME honest,
// already-real "how unusual" measure Phase 1's score already uses (z-score when a usable
// baseline exists, value/threshold ratio otherwise), rather than inventing a second formula that
// could silently drift from the first. This file imports FROM security-health.js, never the
// other way around -- security-health.js stays the lower-level, drift-unaware primitive, and
// computeStoreHealth() in that file accepts this file's OUTPUT (plain {loc, amount} additions +
// a per-loc direction map) as a late-bound, optional extra, so the two files never import each
// other and there is no circular dependency.
//
// `history` everywhere below is ONE (loc, subject, rule)'s own window history, oldest to newest
// -- the EXACT shape buildHistoryByRule()/loadSecurityFindingsForSubject() already produce in
// security-panel.js (array of {value, thresholdUsed, baselineContext, pass, lifecycleCategory,
// windowStart, windowEnd, computedAt, ...}). Nothing in this file re-sorts or re-fetches; the
// caller is responsible for ordering, same division of labor security-rules.js's own header
// already establishes for baseline scoping.
import { findingMagnitude } from './security-health.js';

// ── Tunable constants — first-pass, documented, same "stated, conservative floor, not measured
// from live score OUTCOMES (there is no ground truth yet for what SHOULD be flagged), tune later"
// tier as security-rules.js's MIN_BASELINE_N and security-health.js's HEALTH_SCORE_SCALE/
// HEALTH_TIER_THRESHOLDS. What IS measured, live, 2026-11-10 (not reasoned about): pulled every
// row of CASH-002/INV-001/INV-002/INV-003's full production history from Supabase (service-role),
// found every real monotonically-rising 4-window magnitude sequence in each rule's history, and
// looked at the distribution of (last-first)/first across them --
//   CASH-002 (n=1,468 real sequences): p10=0.11 p25=0.25 p50=0.58 p75=1.78 p90=4.75
//   INV-001  (n=175):                  p10=0.51 p25=0.96 p50=2.09 p75=5.56 p90=21.65
//   INV-002  (n=215):                  p10=0.42 p25=0.85 p50=1.87 p75=5.75 p90=15.10
//   INV-003  (n=370):                  p10=0.18 p25=0.49 p50=1.36 p75=4.12 p90=14.32
// A daily rolling window overlaps 27-29 days of its predecessor, so day-to-day values are
// strongly autocorrelated -- a flat "monotonic" test alone fires on roughly 8-9% of all possible
// 4-window spans even for the noisiest rule (CASH-002), which is too common to mean "escalating."
// DRIFT_MIN_RELATIVE_RISE=0.15 sits just above CASH-002's own noisiest decile (p10=0.11) while
// staying under every other rule's p10 (0.18-0.51) -- it trims the noisiest sliver of the
// noisiest rule without needing a per-rule floor, which the doc's own "one shared, simple signal"
// framing doesn't ask for. A real example anchors the "starts near zero" edge case this floor
// has to handle: loc 0006838, WRIN 08235-106, INV-001 -- magnitude (z-score basis) measured
// 0.684 on window_end 2026-10-31, rising to 1.471 on the very next real computed window
// (2026-11-09) -- a real ~2.15x rise, still under INV-001's own threshold_used=2.5 (pre-crossing,
// exactly the case §4 asks to catch).
export const DRIFT_MIN_WINDOWS = 3; // fewer than this is 'insufficient-history', never guessed
export const DRIFT_LOOKBACK_WINDOWS = 4; // the deep-dive doc's own "last 3-4 rolling windows"
export const DRIFT_MIN_RELATIVE_RISE = 0.15; // materiality floor, see measurement above
// Below this fraction of a rule's own threshold (ratio: fraction of 1.0; z-score: fraction of its
// configured sigma threshold_used), a currently-CLEAR subject is not worth pulling history for at
// all -- not because it couldn't theoretically be drifting, but because the health-score/grid
// rollup (computeDriftRollup below) has to bound how many subjects it fetches multi-window
// history for, and "close to its own threshold" is the one truthful, inexpensive way to shrink
// ~20,800 district-wide subjects (measured 2026-11-10, service-role, across the 7 active cash/
// inventory/labor rules) down to a real candidate set of 1,877 (673 already-flagged + 1,204
// near-miss) -- small enough to fetch bounded per-rule history for, without ever claiming
// coverage of a subject this floor excludes (that subject simply gets no drift signal yet, never
// a false one -- see selectDriftCandidates' own header).
export const DRIFT_NEAR_MISS_FRACTION = 0.5;
// Weight applied to a worsening trend's own latest-window magnitude before it's added to a
// store's health score (security-health.js's existing severity×magnitude units, so this rides
// whatever HEALTH_SCORE_SCALE is current -- see that file's own header -- rather than inventing a
// second scale). EARLY (latest window still pass:false, the pre-threshold case §4 exists for) is
// deliberately smaller than CONFIRMED (latest window already pass:true AND still rising) -- "weight
// it higher once it does cross, because now both signals agree" is the doc's own phrase. Neither
// number is measured against real score OUTCOMES (there are none yet to measure against -- same
// honest limitation HEALTH_SCORE_SCALE's own first guess had before dispatch 2026-11-10's
// recalibration gave it one); recalibrate once a real score distribution with drift included exists.
export const DRIFT_EARLY_WEIGHT = 0.3;
export const DRIFT_CONFIRMED_WEIGHT = 0.5;

// One stable string key per (loc, rule, subject) -- shared by every caller in this file and by
// security-panel.js's own bulk fetch, so a drift rollup and a per-card lookup can never drift
// apart on key format. Mirrors groupFindingsBySubject's own key shape (security-panel.js) but
// widened to include ruleId, since drift is tracked per-rule, not per-subject-across-all-rules.
export function driftKeyFor({ loc, ruleId, empToken, wrin }) {
  return `${loc}::${ruleId}::${empToken ? 'emp:' + empToken : 'wrin:' + (wrin || '')}`;
}

// Usable per-window magnitudes for a history array: drops lifecycle-hygiene rows (never a
// security trend) and low-confidence-baseline rows (same "never blend these into anything" rule
// security-health.js's own findingContribution already applies) -- a window this function drops
// is simply absent from the trajectory, never coerced to 0 (which would fake a fall that never
// happened).
function usableMagnitudes(history) {
  const out = [];
  for (const w of (history || [])) {
    if (!w || w.lifecycleCategory) continue;
    const m = findingMagnitude(w);
    if (m.lowConfidence) continue;
    out.push({ entry: w, magnitude: m.magnitude, basis: m.basis });
  }
  return out;
}

// classifySubjectDrift(history) -> { direction: 'worsening'|'improving'|'flat'|
// 'insufficient-history', windowsUsed, magnitudes, latestFlagged, latestMagnitude, relativeChange }
//
// Looks at up to the last DRIFT_LOOKBACK_WINDOWS (4) usable windows and asks whether the
// magnitude sequence is monotonically non-decreasing (allowing flat steps -- a daily rolling
// window often repeats a value exactly when nothing new happened that day) AND the net move from
// first to last clears DRIFT_MIN_RELATIVE_RISE. 'improving' is the exact mirror (non-increasing,
// net fall clears the same floor) -- the district-grid's own "↓ improving" arrow needs this, not
// just 'worsening'. Anything else (fewer than DRIFT_MIN_WINDOWS usable windows, a genuinely mixed
// sequence, or a real-but-sub-floor move) is 'flat' or 'insufficient-history' -- deliberately
// never guessed into a direction the data doesn't actually support, same posture as
// classifySubjectTrend/classifySubjectShape's own 'insufficient-history' branches
// (security-panel.js / security-drilldown.js).
export function classifySubjectDrift(history, opts = {}) {
  const {
    minWindows = DRIFT_MIN_WINDOWS,
    lookback = DRIFT_LOOKBACK_WINDOWS,
    minRelativeRise = DRIFT_MIN_RELATIVE_RISE,
  } = opts;
  const usable = usableMagnitudes(history);
  if (usable.length < minWindows) {
    return { direction: 'insufficient-history', windowsUsed: usable.length, magnitudes: [] };
  }
  const tail = usable.slice(-lookback);
  const mags = tail.map(t => t.magnitude);
  const eps = 1e-9;
  let nonDecreasing = true, nonIncreasing = true;
  for (let i = 1; i < mags.length; i++) {
    if (mags[i] < mags[i - 1] - eps) nonDecreasing = false;
    if (mags[i] > mags[i - 1] + eps) nonIncreasing = false;
  }
  const first = mags[0], last = mags[mags.length - 1];
  const latestEntry = tail[tail.length - 1].entry;
  const base = {
    windowsUsed: tail.length, magnitudes: mags,
    latestFlagged: latestEntry.pass === true, latestMagnitude: last,
  };
  // A sequence that starts at (or extremely near) zero can't divide meaningfully -- a rise FROM
  // near-nothing TO something real is treated as automatically material (Infinity clears any
  // finite floor) rather than suppressed by a division-by-~0 artifact. This is exactly the real
  // CASH-002 case this module's own header measured (z-score magnitude 0 -> 0.008 -> 0.483).
  const relativeRise = first > 1e-6 ? (last - first) / first : (last > 1e-6 ? Infinity : 0);
  if (nonDecreasing && last > first + eps && relativeRise >= minRelativeRise) {
    return { ...base, direction: 'worsening', relativeChange: relativeRise };
  }
  const relativeFall = first > 1e-6 ? (first - last) / first : 0;
  if (nonIncreasing && first > last + eps && relativeFall >= minRelativeRise) {
    return { ...base, direction: 'improving', relativeChange: -relativeFall };
  }
  return { ...base, direction: 'flat', relativeChange: first > 1e-6 ? (last - first) / first : 0 };
}

// contributionFromDrift(drift, rule) -> a non-negative scalar, 0 unless `drift.direction` is
// 'worsening'. Takes an ALREADY-COMPUTED classifySubjectDrift() result rather than a history
// array, so a caller that has already classified the same history once (computeDriftRollup,
// below) never pays to reclassify it a second time just to get the score contribution --
// adversarial self-review caught this exact double-computation before it shipped. Expressed in
// the SAME severity×magnitude units security-health.js's own findingContribution() already uses
// (never a second, independent scale) -- see this file's own header for why EARLY (not yet
// pass:true) is weighted lower than CONFIRMED (already pass:true AND still rising).
export function contributionFromDrift(drift, rule) {
  if (!drift || drift.direction !== 'worsening') return 0;
  const severity = Number.isFinite(rule?.severity) ? rule.severity : 1;
  const weight = drift.latestFlagged ? DRIFT_CONFIRMED_WEIGHT : DRIFT_EARLY_WEIGHT;
  return severity * drift.latestMagnitude * weight;
}

// driftContribution(history, rule) -> the same thing, for a caller that has NOT already
// classified this history (e.g. a one-off call, or a test) -- classifies once, then delegates.
export function driftContribution(history, rule, opts) {
  return contributionFromDrift(classifySubjectDrift(history, opts), rule);
}

// isNearMissVerdict: is this CURRENTLY-clear verdict close enough to its own rule's threshold to
// be worth pulling multi-window history for? See DRIFT_NEAR_MISS_FRACTION's own header for the
// real measured candidate-set size this bounds to. Never true for an already-flagged verdict
// (that population is selected unconditionally in selectDriftCandidates below, regardless of
// proximity) or a low-confidence one (same "never blend a thin baseline into anything" rule).
export function isNearMissVerdict(verdict, magnitudeResult) {
  if (!verdict || verdict.pass === true) return false;
  const { magnitude, basis, lowConfidence } = magnitudeResult || {};
  if (lowConfidence) return false;
  if (basis === 'ratio') return magnitude >= DRIFT_NEAR_MISS_FRACTION;
  if (basis === 'zscore' && Number.isFinite(verdict.thresholdUsed) && verdict.thresholdUsed > 0) {
    return magnitude >= DRIFT_NEAR_MISS_FRACTION * verdict.thresholdUsed;
  }
  return false; // 'unscaled' basis has no threshold to measure proximity against
}

// selectDriftCandidates(findings, rulesById) -> [{loc, ruleId, empToken, wrin}], deduped.
// `findings` is the panel's already-loaded BULK array (loadSecurityFindings()'s latest-only-
// window shape) -- every (loc, subject, rule) combo's MOST RECENT verdict, flagged or not (see
// security-health.js's own header on why that bulk load already covers the clear subjects too).
// The candidate set is every subject that is EITHER currently flagged OR a near-miss on its own
// rule's threshold -- an honest, bounded slice, never the full subject population (measured
// 2026-11-10: ~20,800 subjects district-wide across the 7 currently-active cash/inventory/labor
// rules collapse to 1,877 candidates this way -- small enough for computeDriftRollup's own
// per-rule bulk history fetch to afford, per loadSecurityFindingsRecentHistoryForKeys' own header
// in src/lib/supabase.js). A subject this excludes simply gets no drift signal yet -- never a
// fabricated one -- exactly the same "coverage gap, not a wrong answer" posture 'insufficient-
// history' already has everywhere else in this codebase.
export function selectDriftCandidates(findings, rulesById) {
  const seen = new Set();
  const out = [];
  for (const f of (findings || [])) {
    if (!f?.loc || f.lifecycleCategory) continue;
    const rule = rulesById?.[f.ruleId];
    if (!rule) continue; // defensive, same posture as computeStoreHealth's own rule lookup
    const mag = findingMagnitude(f);
    const isCandidate = f.pass === true ? !mag.lowConfidence : isNearMissVerdict(f, mag);
    if (!isCandidate) continue;
    const key = driftKeyFor(f);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ loc: f.loc, ruleId: f.ruleId, empToken: f.empToken || null, wrin: f.wrin || null });
  }
  return out;
}

// computeDriftRollup(historyByKey, rulesById) -> { byLoc: Map<loc, {loc, contribution,
// worsening, improving}>, perKey: Map<driftKey, driftResult> }
//
// `historyByKey` is Map<driftKeyFor(...), {loc, ruleId, history}> -- one entry per candidate from
// selectDriftCandidates, with `history` being that (loc,subject,rule)'s own real window array
// (oldest to newest) from loadSecurityFindingsRecentHistoryForKeys(). This is the ONE place drift
// results get aggregated per store (for the health-score term + the district grid's directional
// arrow) and per subject+rule (for a narrative card's own trend badge) -- a single pass so the
// two views can never disagree about what the same history classified as.
export function computeDriftRollup(historyByKey, rulesById) {
  const byLoc = new Map();
  const perKey = new Map();
  for (const [key, rec] of (historyByKey || new Map())) {
    if (!rec?.loc || !rec?.ruleId) continue;
    const rule = rulesById?.[rec.ruleId];
    if (!rule) continue;
    const drift = classifySubjectDrift(rec.history);
    perKey.set(key, drift);
    if (!byLoc.has(rec.loc)) byLoc.set(rec.loc, { loc: rec.loc, contribution: 0, worsening: 0, improving: 0 });
    const row = byLoc.get(rec.loc);
    if (drift.direction === 'worsening') {
      row.worsening += 1;
      row.contribution += contributionFromDrift(drift, rule); // reuse the ALREADY-computed drift, never reclassify
    } else if (drift.direction === 'improving') {
      row.improving += 1;
    }
  }
  return { byLoc, perKey };
}

// driftDirectionForStore: a store's own single-arrow summary -- 'worsening' wins over
// 'improving' (a store with one subject escalating and five improving still needs the eye drawn
// to the escalating one; this is a presence check, not a vote), 'improving' wins over the default
// 'flat'. Exported so the panel's grid-tile render and any test asserting the arrow use the exact
// same rule rather than two call sites that could drift apart.
export function driftDirectionForStore(row) {
  if (!row) return 'flat';
  if (row.worsening > 0) return 'worsening';
  if (row.improving > 0) return 'improving';
  return 'flat';
}

// TREND_BADGE_META's three states, from the "Loss Prevention Briefing" mockup's own trend-badge
// treatment ("Escalating" / "Recurring" / "First flag") -- driftTrendBadge() below picks ONE of
// these per flagged verdict, reusing BOTH axes this codebase already classifies independently
// rather than inventing a fourth: 'worsening' drift (this file) wins as "Escalating" (the
// mockup's own crit-colored state, a real still-rising trajectory); failing that, a subject
// already chronic by the EXISTING classifySubjectTrend() (security-panel.js -- flagged before AND
// still flagged, just not necessarily still rising) reads as "Recurring"; anything else (truly
// new, or not enough history to say either way) reads as "First flag" -- the mockup's own
// 'insufficient-history'/'new' grouping, which a reader experiences identically ("nothing to
// compare this to yet").
export const TREND_BADGE_META = {
  escalating: { label: 'Escalating', color: 'var(--crit,#ef4444)' },
  recurring: { label: 'Recurring', color: 'var(--amber,#f59e0b)' },
  'first-flag': { label: 'First flag', color: 'var(--text3)' },
};

// driftTrendBadge(driftDirection, subjectTrend) -> one of TREND_BADGE_META's keys. Takes the
// ALREADY-COMPUTED results of both axes (classifySubjectDrift's own `.direction`, and the
// EXISTING classifySubjectTrend(history) from security-panel.js) rather than re-running either
// classifier itself -- a caller with a per-key rollup already in hand (computeDriftRollup's
// `perKey`) should never pay to reclassify the same history twice, and two call sites computing
// the same thing two different ways is exactly the drift this codebase's own "check whether a
// helper exists first" rule warns about.
export function driftTrendBadge(driftDirection, subjectTrend) {
  if (driftDirection === 'worsening') return 'escalating';
  if (subjectTrend === 'chronic') return 'recurring';
  return 'first-flag';
}
