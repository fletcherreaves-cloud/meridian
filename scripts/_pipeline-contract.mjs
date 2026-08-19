// scripts/_pipeline-contract.mjs — the two pieces of the pipeline contract that don't
// exist anywhere in this repo yet (dispatch #25/#32, Workstream C).
//
// CORRECTION TO DISPATCH #25/#32's OWN MEASUREMENT, made before writing this file (per
// CLAUDE.md's standing rule: "check whether a helper exists before writing one" — grep first,
// build second): both dispatches state "2 of ~19 pull/write scripts have [any assert-on-
// zero-rows guard]," measured by grepping for the exact inline shape in
// qsrsoft-pmix-pull.mjs:444-447. That grep missed scripts/lib/pull-outcome.mjs
// (`makeOutcomeTracker`) — a SEPARATE shared module, already built, already imported by
// **8** scripts (lifelenz-pull.mjs, qsrsoft-dar-pull.mjs, qsrsoft-ebos-pull.mjs,
// qsrsoft-employee-roster-pull.mjs, qsrsoft-onhand-pull.mjs, qsrsoft-ops-pull.mjs,
// qsrsoft-roster-stats-pull.mjs, qsrsoft-variance-pull.mjs) — that already implements
// assert-on-zero-rows (its own `finalize()`, "zero rows saved... a quiet no-op, not a
// success") PLUS a failure-rate threshold neither dispatch #25 nor #32 asked for. Real
// adoption of "assert on what was written" is ~40% (8/20), not ~10% (2/19).
//
// This module does NOT reimplement that piece — `pull-outcome.mjs` already owns it, and
// duplicating it here would be exactly the second-copy-drifts-from-the-first problem
// CLAUDE.md's "check whether a helper exists" rule exists to prevent. What's still
// genuinely missing everywhere, including in all 8 already-governed scripts, is:
//
//   1. logPartitionCoverage — pull-outcome.mjs's tracker logs FAILURES, never unconditional
//      SUCCESS coverage. qsrsoft-pmix-pull.mjs:427-434 has its own inline "N/27 stores had
//      at least one row" logger (the dispatch's own reference shape) but it's local to that
//      one file, not shared, and none of the 8 pull-outcome.mjs adopters have an equivalent.
//   2. checkFreshness — a warn/error SLA on how stale a source's own latest known-good data
//      is. Confirmed via repo-wide grep: nothing implements this anywhere. This is the piece
//      that would have caught the 6-day silent LifeLenz outage (CLAUDE.md's own "adding a
//      new automated pull" standing rule) at the SOURCE, not just via the separate
//      sync-failure-watch GitHub Actions-level monitor.
//
// Built the way this repo already builds a shared script module (`_retry.mjs`'s own
// convention): small, pure, exported functions — not a framework the ~20 pull scripts get
// rewritten around. Neither function calls process.exit() itself — callers decide what a
// warn/error status means for their own exit code, matching how withRetry() (`_retry.mjs`)
// throws rather than exits, and matching how pull-outcome.mjs's finalize() RETURNS a code
// instead of exiting so the caller stays in control of when the process actually ends.

// coveredIds: a Set (or anything with `.has(id)`) of partition ids that had at least one row
// upserted this run. allIds: the full expected partition list (e.g. STORE_NSNS). Generalizes
// qsrsoft-pmix-pull.mjs:427-434's exact pattern to any partition kind (store, date, …) —
// unconditional, not just-on-failure, so a partial run is visible even when it "succeeded."
export function logPartitionCoverage(coveredIds, allIds, opts = {}) {
  const { label = 'pull', kind = 'partition', log = console.log, warn = console.warn } = opts;
  const covered = allIds.filter(id => coveredIds.has(id));
  const missing = allIds.filter(id => !coveredIds.has(id));
  log(`[${label}] per-${kind}: ${covered.length}/${allIds.length} ${kind}(s) had at least one row upserted.`);
  if (covered.length > 0 && missing.length > 0) {
    warn(`[${label}] ${missing.length} ${kind}(s) with zero rows across the whole window: ${missing.join(', ')}`);
  }
  return { covered: covered.length, total: allIds.length, missing };
}

// lastKnownDate: a Date, ISO string, or null/undefined (no known-good data at all — always
// 'error'). now: injectable for testability (mirrors withRetry's own opts-object convention;
// real callers just omit it and get `new Date()`). Returns a status + a ready-to-log message
// (null when 'ok', so a caller can do `if (r.message) console.warn(r.message)` without an
// extra status check) rather than logging itself — kept a pure function, same reasoning as
// logPartitionCoverage's injectable log/warn (testable without capturing console output).
export function checkFreshness(lastKnownDate, opts = {}) {
  const { warnAfterHours = 24, errorAfterHours = 48, label = 'source', now = new Date() } = opts;
  if (lastKnownDate == null) {
    return { status: 'error', ageHours: null, message: `[${label}] no known-good data at all — treating as stale.` };
  }
  const last = lastKnownDate instanceof Date ? lastKnownDate : new Date(lastKnownDate);
  if (isNaN(last.getTime())) {
    return { status: 'error', ageHours: null, message: `[${label}] unparseable last-known-good timestamp (${lastKnownDate}) — treating as stale.` };
  }
  const ageHours = (now.getTime() - last.getTime()) / 3_600_000;
  const status = ageHours >= errorAfterHours ? 'error' : ageHours >= warnAfterHours ? 'warn' : 'ok';
  const thresholdHit = status === 'error' ? errorAfterHours : warnAfterHours;
  const message = status === 'ok' ? null
    : `[${label}] data is ${ageHours.toFixed(1)}h old (${status} threshold: ${thresholdHit}h).`;
  return { status, ageHours, message };
}
