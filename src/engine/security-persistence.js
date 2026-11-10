// @ts-nocheck
// ── Persistence — Phase 2 (dispatch 2026-11-10, building on security-health.js's Phase 1 and
// security-drift.js's own Phase 2 drift layer) ──────────────────────────────────────────────────
// The owner's own §3 formula named `persistence_multiplier` as a score term distinct from drift:
// drift asks "is the TRAJECTORY worsening" (the magnitude rising across windows, whether or not it
// has crossed the rule's own threshold yet); persistence asks "how many CONSECUTIVE windows,
// ending at the latest, has this (loc, rule, subject) ALREADY been flagged" -- the Sep 9 field
// test's own correction the deep-dive doc cites: "a 21-day chronic single-rule flag is a bigger
// deal than a 2-day multi-rule one." security-drift.js's own header is explicit that persistence
// is a SEPARATE concept it deliberately does not build ("building persistence/convergence here
// would conflate two explicitly different concepts the doc itself named apart") -- this file is
// that separate piece, kept in its own module for the same reason, not folded into drift.js.
//
// Deliberately reuses the EXACT SAME multi-window history security-panel.js already fetches for
// drift (loadSecurityFindingsRecentHistoryForKeys(selectDriftCandidates(findings, rulesById))) --
// never a second bulk query. Persistence and drift ask different questions of the identical data,
// so they are computed from the identical fetch; `historyByKey` here is the same
// Map<driftKeyFor(...), {loc, ruleId, history}> computeDriftRollup (security-drift.js) consumes.
// This file imports findingMagnitude from security-health.js (same one-way dependency direction
// drift.js already established: security-health.js stays the lower-level, persistence-unaware
// primitive, and computeStoreHealth() accepts this file's OUTPUT as a late-bound, optional extra).
import { findingMagnitude } from './security-health.js';

// ── Tunable constants — first-pass, documented, same honest tier as drift.js's own EARLY/CONFIRMED
// weights and security-health.js's original HEALTH_SCORE_SCALE guess: NOT measured against real
// score OUTCOMES (there is no ground truth yet for what a score SHOULD read -- the same limitation
// every constant in this file starts from, recalibrate once a real distribution exists).
// PERSISTENCE_MIN_WINDOWS matches DRIFT_MIN_WINDOWS exactly (security-drift.js) -- deliberately, so
// the two Phase-2 score extras agree on how much history counts as "enough to act on" rather than
// each picking its own floor. Fewer than this many consecutive flagged windows earns no bonus at
// all -- a 2-day flag is not yet "persistent" in a way that should outweigh a fresh single flag of
// equal severity.
export const PERSISTENCE_MIN_WINDOWS = 3;
// Weight applied per consecutive flagged window BEYOND the floor, to the LATEST window's own
// magnitude (security-health.js's findingMagnitude -- the same honest "how unusual" measure every
// other score term in this codebase uses, never a second scale). Mirrors
// contributionFromDrift's own severity×magnitude×weight shape exactly.
export const PERSISTENCE_WEIGHT_PER_WINDOW = 0.25;
// Raw-unit cap (pre HEALTH_SCORE_SCALE), same purpose as security-health.js's own
// CONVERGENCE_BONUS_CAP -- one very long streak must not dominate a store's score unboundedly.
export const PERSISTENCE_BONUS_CAP = 20;

// Usable windows for a persistence count: drops lifecycle-hygiene rows, same posture
// security-drift.js's own usableMagnitudes applies (a dropped window is simply ABSENT from the
// streak count, never coerced to "not flagged," which would fake a break that never happened).
function usableWindows(history) {
  return (history || []).filter(w => w && !w.lifecycleCategory);
}

// classifySubjectPersistence(history) -> { consecutiveFlaggedWindows, windowsUsed, latestFlagged,
// latestMagnitude, lowConfidence }
//
// Counts backward from the LATEST usable window: how many windows in a row (including the latest)
// have pass===true. Stops counting (and returns 0) the moment the latest window itself is not
// flagged -- persistence is a property of a CURRENTLY flagged subject, matching
// findingContribution's own "0 unless pass===true" rule elsewhere in this score.
export function classifySubjectPersistence(history) {
  const usable = usableWindows(history);
  if (!usable.length) return { consecutiveFlaggedWindows: 0, windowsUsed: 0, latestFlagged: false, latestMagnitude: 0, lowConfidence: false };
  const latest = usable[usable.length - 1];
  if (latest.pass !== true) {
    return { consecutiveFlaggedWindows: 0, windowsUsed: usable.length, latestFlagged: false, latestMagnitude: 0, lowConfidence: false };
  }
  const latestMag = findingMagnitude(latest);
  let count = 0;
  for (let i = usable.length - 1; i >= 0; i--) {
    if (usable[i].pass === true) count++;
    else break;
  }
  return {
    consecutiveFlaggedWindows: count, windowsUsed: usable.length,
    latestFlagged: true, latestMagnitude: latestMag.magnitude, lowConfidence: latestMag.lowConfidence,
  };
}

// contributionFromPersistence(persistence, rule) -> a non-negative scalar, 0 unless the streak
// clears PERSISTENCE_MIN_WINDOWS and the latest window's own magnitude is a confident one (same
// "never blend a thin baseline into anything" rule findingContribution/drift both already apply).
// Takes an ALREADY-COMPUTED classifySubjectPersistence() result, same "classify once, reuse"
// discipline contributionFromDrift follows, so a caller with a rollup in hand never reclassifies.
export function contributionFromPersistence(persistence, rule) {
  if (!persistence?.latestFlagged || persistence.lowConfidence) return 0;
  const extra = persistence.consecutiveFlaggedWindows - PERSISTENCE_MIN_WINDOWS;
  if (extra <= 0) return 0;
  const severity = Number.isFinite(rule?.severity) ? rule.severity : 1;
  const raw = severity * persistence.latestMagnitude * PERSISTENCE_WEIGHT_PER_WINDOW * extra;
  return Math.min(PERSISTENCE_BONUS_CAP, raw);
}

// persistenceContribution(history, rule, opts) -> the same thing, for a caller that has NOT
// already classified this history (a one-off call, or a test) -- classifies once, then delegates.
export function persistenceContribution(history, rule) {
  return contributionFromPersistence(classifySubjectPersistence(history), rule);
}

// computePersistenceRollup(historyByKey, rulesById) -> Map<loc, {loc, contribution, chronicCount}>
//
// `historyByKey` is the EXACT SAME Map security-drift.js's computeDriftRollup consumes (see this
// file's own header) -- one pass here, independent of drift's own pass over the identical data, so
// the two Phase-2 extras can never disagree about what the same history means for THEIR OWN
// question, even though they read the same input.
export function computePersistenceRollup(historyByKey, rulesById) {
  const byLoc = new Map();
  for (const [, rec] of (historyByKey || new Map())) {
    if (!rec?.loc || !rec?.ruleId) continue;
    const rule = rulesById?.[rec.ruleId];
    if (!rule) continue;
    const persistence = classifySubjectPersistence(rec.history);
    const contribution = contributionFromPersistence(persistence, rule);
    if (contribution <= 0) continue;
    if (!byLoc.has(rec.loc)) byLoc.set(rec.loc, { loc: rec.loc, contribution: 0, chronicCount: 0 });
    const row = byLoc.get(rec.loc);
    row.contribution += contribution;
    row.chronicCount += 1;
  }
  return byLoc;
}
