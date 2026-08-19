# Dispatch #32 — Workstream C: pipeline contract, wired

2026-08-19. `memory/dispatch-32.md` (re-verifying `memory/dispatch-25.md`, unchanged since) —
Workstream C, the last of the seven workstreams to actually start. Both dispatches measured
"2 of ~19 pull/write scripts have an assert-on-zero-rows guard," found by grepping for the exact
inline shape in `qsrsoft-pmix-pull.mjs:444-447`.

## Correction, made before writing anything (checked first, per CLAUDE.md's "check whether a
## helper exists before writing one")

That grep missed `scripts/lib/pull-outcome.mjs` (`makeOutcomeTracker`) — a separate, already-
built, already-shared module implementing assert-on-zero-rows (its `finalize()`: "zero rows
saved... a quiet no-op, not a success") **plus** a failure-rate threshold neither dispatch asked
for. Grepped fresh: **8 of the 20 named scripts already import it** — `lifelenz-pull.mjs`,
`qsrsoft-dar-pull.mjs`, `qsrsoft-ebos-pull.mjs`, `qsrsoft-employee-roster-pull.mjs`,
`qsrsoft-onhand-pull.mjs`, `qsrsoft-ops-pull.mjs`, `qsrsoft-roster-stats-pull.mjs`,
`qsrsoft-variance-pull.mjs`. Real "assert on what was written" adoption is **~40% (8/20), not
~10% (2/19)** — including two of the three highest-stakes daily pulls (`qsrsoft-dar-pull.mjs`,
`lifelenz-pull.mjs`) that both dispatches' own text names as motivating examples. **Not building
a duplicate assert-on-zero function** — that would be exactly the second-copy-drifts-from-the-
first problem CLAUDE.md's own standing rule exists to prevent. `scripts/_pipeline-contract.mjs`'s
own header records this correction in full.

## What's still genuinely missing everywhere (confirmed via repo-wide grep, including inside the
## 8 already-governed scripts)

1. **Unconditional per-partition coverage logging.** `pull-outcome.mjs`'s tracker logs FAILURES
   only (`if (failed.length > 0)`) — never a success-coverage line. `qsrsoft-pmix-pull.mjs`'s own
   reference pattern (lines 427-434, "N/27 stores had at least one row upserted") is local to
   that one file, not shared, and none of the 8 `pull-outcome.mjs` adopters have an equivalent —
   a date that returns 200 with a silently partial store list (no error, no thrown exception)
   is invisible to failure-only tracking.
2. **Freshness SLA.** Confirmed nothing implements this anywhere. This is the piece that would
   catch a silent staleness (like the CLAUDE.md-cited 6-day LifeLenz outage) at the source,
   before `sync-failure-watch.yml`'s GitHub-Actions-run-level monitor would ever notice — that
   monitor only sees a run FAIL, not a run that succeeds while returning nothing new.

## What shipped

**`scripts/_pipeline-contract.mjs`** — two pure, exported functions, `_retry.mjs`'s own
convention (small shared utility, not a framework):
- `logPartitionCoverage(coveredIds, allIds, opts)` — generalizes pmix's exact pattern to any
  partition kind (store, schedule, …), unconditional (always logs the coverage line, warns only
  on a partial run).
- `checkFreshness(lastKnownDate, opts)` — `{status:'ok'|'warn'|'error', ageHours, message}`
  against injectable `warnAfterHours`/`errorAfterHours` thresholds; `now` is injectable for
  testability. Neither function calls `process.exit()` — callers decide, same posture as
  `withRetry()` throwing instead of exiting and `pull-outcome.mjs`'s `finalize()` returning a
  code instead of exiting.

**Two hand conversions**, chosen to prove the two genuinely-new pieces on the highest-stakes
scripts rather than the lowest-risk ones (both already had the assert piece via
`pull-outcome.mjs`; neither had coverage logging or freshness):
- **`lifelenz-pull.mjs`** — freshness check right where `getLatestDate()` already runs (no extra
  DB read; thresholds `warnAfterHours=30`/`errorAfterHours=54`, chosen to catch one/two missed
  daily runs — directly targeting the CLAUDE.md-cited 6-day silent outage class, at the source
  this time, not just via the separate Actions-level watch). Per-schedule coverage logging in the
  main pull loop (`coveredSchedules` populated when `saved > 0`, checked against the discovered
  schedule list).
- **`qsrsoft-dar-pull.mjs`** — same freshness thresholds, one extra cheap single-row
  `getLatestDate()` read alongside (not instead of) the existing gap-detection read inside
  `getDateRange()` — kept as a second read rather than restructuring working logic. Per-store
  coverage threaded through both auth paths (`runDirect`/`pullViaPlaywright`) via a shared
  `coveredStores` Set populated from each upserted record's `loc`, checked against `STORE_NSNS`.

**New ratchet R8** (`ratchet-pipeline-contract-coverage.test.js`) — counts named pull/write
scripts NOT importing `_pipeline-contract.mjs`, dispatch #25's own canonical 20-script list.
Seeded at **18** (20 − the 2 just converted), measured fresh on this branch, not copied from
either dispatch's text. Same bidirectional shape as R1/R3/R4/R7.

## Not done / explicitly deferred

- **C2 (idempotent partition replace, delete-then-insert per date, paced)** — the brief's own
  text calls this "dealer's choice... same PR or a follow-up." Deferred: it's a genuinely
  greenfield write-side feature (nothing in the repo does partition-replace semantics today,
  only defensive 522-handling on reads), and folding it into this PR would risk exactly the
  "19 scripts in one PR" sweep both dispatches explicitly warn against, just moved to a second
  axis. Tracked under #336 (unchanged from dispatch #25), not silently dropped.
- **The other 18 named scripts still missing `_pipeline-contract.mjs`** (including 6 of the 8
  already-governed-for-assert ones, which still lack coverage-logging/freshness) — per both
  dispatches' explicit "bounded slice, not all 19/20" scope guidance; R8 tracks the remaining
  rollout so it isn't silently forgotten.
- **`qsrsoft-pmix-pull.mjs`'s own inline coverage-logging (427-434) was not migrated to call the
  new shared `logPartitionCoverage`** — it already does the equivalent thing correctly; touching
  a working, already-correct script only to swap it onto the new shared helper wasn't asked for
  and adds risk for zero behavior change. Left as a candidate for a future opportunistic pass.

## Verified

- New `src/__tests__/pipeline-contract.test.js` (10 tests) — `_pipeline-contract.mjs`'s first
  coverage, matching `pull-outcome.test.js`'s own precedent for testing a `scripts/` module
  directly from `src/__tests__/` (no supabase/fetch dependency, cheap to test in isolation).
- New `src/__tests__/ratchet-pipeline-contract-coverage.test.js` (3 tests, R8).
- `node --check` on all three touched/new `.mjs` files (syntax only — these scripts need live
  QSRSoft/LifeLenz/Supabase credentials to actually run, which this sandboxed session doesn't
  have; the same limitation every prior dispatch's script work has had).
- 1584/1584 tests pass (13 new). Build clean (scripts/ isn't bundled, so the app build is
  unaffected by this dispatch by construction — confirmed anyway since `npm run build` is the
  standing gate for every commit).
