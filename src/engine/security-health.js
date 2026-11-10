// @ts-nocheck
// ── Security Health Score — Phase 1 (minimal), dispatch 2026-11-10 ──────────────────────────────
// The owner's own "Security Health Dashboard" deep-dive doc (2026-10-28) scoped the full model as
// severity × dollar_exposure_normalized × persistence_multiplier × convergence_multiplier −
// exoneration_share. Per the owner's explicit phased choice ("both together, phased"), THIS file
// builds only the minimal slice: severity × magnitude − exoneration_share. persistence_multiplier
// and convergence_multiplier are deliberately NOT built here (they need multi-window trend
// history this phase doesn't touch) -- a future phase, not an oversight.
//
// "dollar_exposure_normalized" from the deep-dive doc does NOT exist as a real, measured
// convention anywhere in this codebase -- checked (grepped every src/engine/*.js and
// security-panel.js for dollarExposure/dollar_exposure/estimatedDollar/exposureDollar before
// writing this; zero hits) before assuming it. security_findings.value is a RATE (per $1,000,
// per 1,000 transactions/sessions, a %, or a plain count -- see security-panel.js's own
// RULE_UNITS), never a dollar amount, and security_rules carries no dollar-weighting column.
// Inventing a dollar figure here would be exactly the kind of fabricated number CLAUDE.md's
// "measure it, don't reason about it" standing rule forbids. This file substitutes an honest,
// already-real measure of "how unusual" instead: for a z-score rule, the finding's own z-score
// (value vs. baselineContext mean/stdev -- the SAME number security-rules.js's evaluateZScoreRule
// computed when the finding was written); for a ratio/threshold rule (no baseline), how far the
// value sits past its own threshold. Neither is "dollars," and this file never claims it is.
//
// Data-quality guard: security_findings does not persist the raw numerator/denominator sum a
// past finding was computed from, so this file cannot re-check security_rules' own
// min_denominator/min_numerator/min_stdev floors after the fact. What IS real and persisted is
// baselineContext.n -- the baseline population size at evaluation time -- so the guard here is a
// real, measurable one: a z-score finding whose baseline population is below MIN_BASELINE_N (the
// SAME floor security-rules.js's own evaluateZScoreRule gates on, imported so the two numbers
// can't drift) is routed to a separate "insufficient data" bucket and never blended into a
// store's score, exactly the deep-dive doc's own ask ("never blend these into the score") --
// built on the real field that actually exists, not the min_denominator one the doc assumed.
import { MIN_BASELINE_N } from './security-rules.js';

// HEALTH_SCORE_SCALE: measured, not guessed, as of 2026-11-10 (dispatch, owner-reported from
// phone: the district grid showed literally every store at 100/"Needs attention" -- no
// differentiation at all). Root cause: this constant shipped at 8, a placeholder picked before
// the Security Events pull was live and before security_findings_latest's own pagination bug
// (fixed the same dispatch -- see schema-security-findings-latest-materialized-2026-11-10.sql)
// let real bulk findings reach this engine at all. Once real data could flow, 8 was wildly too
// aggressive: measured live against the full real dataset (884 deduped latest findings across
// all 27 stores with at least one flag, pass=true, non-hygiene-routed, window_end >= 2026-10-01)
// -- raw per-store contribution sums ranged 45.00 to 1,480.40 (median 249.12, mean 341.45).
// At scale=8 every single one of the 27 stores saturates at the 100 clamp (score*8 >= 2,000 for
// all of them) -- exactly the "all red, no ranking" bug reported. Re-solved for a scale that
// gives real tier separation against that live distribution: 0.1 leaves only the one genuine
// outlier (raw 1480.40, nearly double the next-highest) at the clamp, and splits the rest
// 3 needs-attention / 17 watch / 6 clean -- a district grid that actually ranks stores instead of
// painting the whole fleet the same color. Still a single linear scale, not the full
// persistence/convergence model the deep-dive doc scoped (phase 2, unchanged) -- but now anchored
// to a real measurement instead of an unmeasured guess, which is what this comment originally
// flagged as the thing to do "once a real score distribution exists."
export const HEALTH_SCORE_SCALE = 0.1; // contribution-sum -> 0-100-ish display scale
export const HEALTH_TIER_THRESHOLDS = { needsAttention: 50, watch: 15 }; // score >= these cutoffs

// One flagged finding's "how unusual" magnitude, honest about its basis. Returns
// { magnitude, basis: 'zscore'|'ratio'|'unscaled', lowConfidence }.
//   - zscore basis: baselineContext has a real stdev>0 -- magnitude is max(0, zscore), floored at
//     0 so a finding that passed its rule's own comparator (gte/gt almost always; lte/lt rules
//     would have a zscore on the far side, but severity×0 is still a safe floor, never negative).
//     lowConfidence true when baselineContext.n < MIN_BASELINE_N -- the SAME population-size
//     guard security-rules.js's z-score interpreter itself applies before ever flagging.
//   - ratio basis: no usable baseline, but a real threshold_used > 0 exists (every threshold/
//     ratio-type rule) -- magnitude is value/threshold, i.e. "how many multiples of the line."
//   - unscaled basis: neither a baseline nor a positive threshold (shouldn't happen for a flagged
//     finding in practice, since evaluateRule requires a threshold to form any verdict at all --
//     kept as an honest, non-crashing floor rather than assuming it can't occur).
export function findingMagnitude(verdict) {
  const bc = verdict?.baselineContext;
  if (bc && Number.isFinite(bc.stdev) && bc.stdev > 0 && Number.isFinite(bc.mean) && Number.isFinite(verdict.value)) {
    const zscore = (verdict.value - bc.mean) / bc.stdev;
    return { magnitude: Math.max(0, zscore), basis: 'zscore', lowConfidence: !bc.n || bc.n < MIN_BASELINE_N };
  }
  if (Number.isFinite(verdict?.thresholdUsed) && verdict.thresholdUsed > 0 && Number.isFinite(verdict.value)) {
    return { magnitude: Math.max(0, verdict.value / verdict.thresholdUsed), basis: 'ratio', lowConfidence: false };
  }
  return { magnitude: 1, basis: 'unscaled', lowConfidence: false };
}

// One flagged finding's contribution to its store's score. 0 for anything that isn't a real,
// current security flag (hygiene-routed, not pass===true, or low-confidence) -- those are
// excluded by the caller (computeStoreHealth) before this is even reached, but this function
// stays honest on its own terms too rather than relying only on the caller's filter.
export function findingContribution(verdict, rule) {
  if (!rule || verdict?.pass !== true || verdict?.lifecycleCategory) return 0;
  const { magnitude, lowConfidence } = findingMagnitude(verdict);
  if (lowConfidence) return 0;
  const severity = Number.isFinite(rule.severity) ? rule.severity : 1;
  const exoneration = Number.isFinite(verdict.exonerationShare) ? Math.max(0, Math.min(1, verdict.exonerationShare)) : 0;
  return severity * magnitude * (1 - exoneration);
}

function tierOf(score) {
  if (score >= HEALTH_TIER_THRESHOLDS.needsAttention) return 'needs-attention';
  if (score >= HEALTH_TIER_THRESHOLDS.watch) return 'watch';
  return 'clean';
}

// Per-store health score across EVERY domain/rule at once (cash + inventory + labor + events) --
// deliberately not scoped to whatever one domain tab a panel happens to have selected, since a
// store's overall health is the whole picture, not one slice of it. `findings` is the panel's
// already-loaded bulk array (loadSecurityFindings()'s own shape, security_findings_latest --
// already ONE row per (rule, subject) at its most recent window, per that loader's own header),
// so no re-grouping/deduping is needed here; a caller passing full multi-window history per
// subject (e.g. loadSecurityFindingsForSubject's output) would double-count and is NOT what this
// function expects.
//
// `driftContributions`/`driftDirectionByLoc` (dispatch 2026-11-10 follow-on, src/engine/
// security-drift.js) are optional, late-bound extras -- deliberately plain data ({loc, amount}
// pairs; a loc->direction map), not drift-aware types, so THIS file never imports security-
// drift.js (which itself imports findingMagnitude from here) and the two stay a one-directional
// dependency, never circular. Omitting either argument reproduces Phase 1's exact behavior --
// pure addition, nothing here changes unless a caller opts in by supplying them. `driftDirection`
// defaults to `null` -- NOT 'flat' -- on every row: null means "drift not computed for this store
// yet" (no candidate there, or the caller hasn't fetched drift history at all), which a renderer
// must show differently from a real, computed 'flat' (genuinely tracked, genuinely not moving).
// Collapsing those two would make every tile read as a confident "→ flat" before the drift fetch
// has even resolved -- a fabricated certainty this file's own "honest, never invented" posture
// (findingMagnitude's own header) exists to avoid.
//
// ── Convergence (dispatch 2026-11-10, Phase 2) ───────────────────────────────────────────────────
// The owner's own §3 formula named `convergence_multiplier` as a score term, separate from the
// "2+ Signal Convergence" TILE security-panel.js's SecuritySummaryBar already shows -- that tile
// is a count, it never touched the score itself. Needs NO new fetch: convergence is "how many
// DISTINCT rules currently flag the SAME subject," which is already fully answerable from the same
// bulk `findings` array computeStoreHealth already receives (security-panel.js's own
// groupFindingsBySubject proves this -- its flaggedCount is exactly this count, computed from the
// identical bulk load). groupFlaggedRuleIdsBySubject below is a minimal, engine-local version of
// that same subject_key grouping (loc + emp/wrin), not a reuse of groupFindingsBySubject itself --
// that function lives in security-panel.js, a view file, and this engine layer must not import
// from it (the dependency has to run view -> engine, never the other way).
//
// First-pass weight, same honest tier as HEALTH_SCORE_SCALE's own original guess and drift.js's
// EARLY/CONFIRMED weights: not measured against real score OUTCOMES (none exist yet to measure
// against -- the same limitation every score constant in this codebase starts from). Expressed as
// a per-SUBJECT bonus, not a per-finding multiplier -- each additional corroborating rule beyond
// the first adds CONVERGENCE_WEIGHT × that subject's own worst flagged severity, capped so one
// subject converging across many domains can't dominate a store's score unboundedly.
export const CONVERGENCE_WEIGHT = 1.5; // per extra independent rule flagging the same subject
export const CONVERGENCE_BONUS_CAP = 30; // raw units (pre HEALTH_SCORE_SCALE), same scale findingContribution uses

// Map<subjectKey, {loc, ruleIds: Set<ruleId>, maxSeverity}> from the bulk `findings` array --
// CURRENTLY flagged (pass===true), non-hygiene rows only, same filter findingContribution itself
// applies. Key shape mirrors groupFindingsBySubject's own (security-panel.js) closely enough to
// group the same way, but is NOT that function -- see this section's own header for why.
export function groupFlaggedRuleIdsBySubject(findings, rulesById) {
  const bySubject = new Map();
  for (const f of (findings || [])) {
    if (!f?.loc || f.lifecycleCategory || f.pass !== true) continue;
    const rule = rulesById?.[f.ruleId];
    if (!rule) continue;
    const subjectId = f.empToken || f.wrin;
    if (!subjectId) continue;
    const key = f.loc + '::' + (f.empToken ? 'emp:' : 'wrin:') + subjectId;
    if (!bySubject.has(key)) bySubject.set(key, { loc: f.loc, ruleIds: new Set(), maxSeverity: 0 });
    const row = bySubject.get(key);
    row.ruleIds.add(f.ruleId);
    row.maxSeverity = Math.max(row.maxSeverity, Number.isFinite(rule.severity) ? rule.severity : 1);
  }
  return bySubject;
}

// convergenceContribution(ruleCount, maxSeverity) -> a non-negative scalar, 0 for a single-rule
// subject (N<=1 -- nothing to corroborate yet). See this section's header for the formula's intent.
export function convergenceContribution(ruleCount, maxSeverity) {
  if (!Number.isFinite(ruleCount) || ruleCount <= 1) return 0;
  const raw = CONVERGENCE_WEIGHT * (ruleCount - 1) * (Number.isFinite(maxSeverity) ? maxSeverity : 1);
  return Math.min(CONVERGENCE_BONUS_CAP, raw);
}

// Returns a Map keyed by loc -> { loc, score, tier, flaggedCount, criticalCount, insufficientCount, driftDirection }.
// `persistenceContributions` is the SAME {loc, amount} shape driftContributions already uses --
// see src/engine/security-persistence.js's own header for why it reuses the exact multi-window
// history security-panel.js already fetches for drift, rather than a second bulk query.
export function computeStoreHealth(findings, rulesById, { driftContributions, driftDirectionByLoc, persistenceContributions } = {}) {
  const byLoc = new Map();
  const touch = (loc) => {
    if (!byLoc.has(loc)) byLoc.set(loc, { loc, score: 0, flaggedCount: 0, criticalCount: 0, insufficientCount: 0, driftDirection: null });
    return byLoc.get(loc);
  };
  for (const f of (findings || [])) {
    if (!f?.loc || f.lifecycleCategory || f.pass !== true) continue;
    const rule = rulesById?.[f.ruleId];
    if (!rule) continue; // defensive -- a finding for a rule no longer in the (active+inactive) registry read
    const row = touch(f.loc);
    const { lowConfidence } = findingMagnitude(f);
    if (lowConfidence) { row.insufficientCount += 1; continue; }
    const contribution = findingContribution(f, rule);
    row.score += contribution;
    row.flaggedCount += 1;
    if (rule.severity >= 4) row.criticalCount += 1;
  }
  // Convergence's own additive term -- see this file's header section on it. A pure function of
  // `findings`/`rulesById`, already in hand, so this always runs (never gated behind a fetch the
  // way drift/persistence are).
  for (const row of groupFlaggedRuleIdsBySubject(findings, rulesById).values()) {
    const bonus = convergenceContribution(row.ruleIds.size, row.maxSeverity);
    if (bonus > 0) touch(row.loc).score += bonus;
  }
  // Drift's own additive term -- a worsening trend, pre-threshold or confirmed-and-still-rising,
  // nudges the SAME score the static rules already built, in the SAME severity×magnitude units
  // (security-drift.js's own header), never a second scale. This can touch() a loc the static
  // loop above never did (a subject with no CURRENT flag at all can still carry a real worsening
  // or improving trend -- the deep-dive doc's own "before it crosses" case) -- an intentional,
  // bounded widening: only a loc with at least one real drift candidate (selectDriftCandidates'
  // own near-miss/already-flagged gate) ever appears here, never every store by default.
  if (Array.isArray(driftContributions)) {
    for (const d of driftContributions) {
      if (!d?.loc || !(d.amount > 0)) continue;
      touch(d.loc).score += d.amount;
    }
  }
  // Persistence's own additive term -- same shape/caller pattern as drift immediately above
  // (security-persistence.js's own computePersistenceRollup produces this), deliberately omitted
  // (undefined) until that fetch resolves, same progressive-disclosure posture drift already has.
  if (Array.isArray(persistenceContributions)) {
    for (const p of persistenceContributions) {
      if (!p?.loc || !(p.amount > 0)) continue;
      touch(p.loc).score += p.amount;
    }
  }
  if (driftDirectionByLoc) {
    const entries = driftDirectionByLoc instanceof Map ? driftDirectionByLoc : Object.entries(driftDirectionByLoc);
    for (const [loc, dir] of entries) {
      if (!loc || !dir) continue;
      touch(loc).driftDirection = dir;
    }
  }
  for (const row of byLoc.values()) {
    row.score = Math.min(100, Math.round(row.score * HEALTH_SCORE_SCALE));
    row.tier = tierOf(row.score);
  }
  return byLoc;
}

// Convenience array form, sorted worst-first (score desc) -- the shape a district grid renders
// directly without each caller re-deriving the same sort. `opts` passes straight through to
// computeStoreHealth (see that function's own header for the optional drift extras).
export function storeHealthList(findings, rulesById, opts) {
  return [...computeStoreHealth(findings, rulesById, opts).values()].sort((a, b) => b.score - a.score);
}
