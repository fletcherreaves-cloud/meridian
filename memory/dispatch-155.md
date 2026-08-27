# Dispatch #155 — Extend the OEPE/R2P/TPPH completeness fix (dispatch #153) to its other
# call sites, where the same "current period" judgment genuinely applies

**Context (2026-08-27):** Direct follow-up to dispatch #153 (v5.198, merged). That dispatch fixed
the Leadership One-Pager's OEPE/R2P/TPPH figures blending an in-progress business day into a
"current week" average at full weight, by extending the already-proven `metricSumRatio`
(Σnumerator÷Σdenominator) pattern to `oepe`/`r2p` (mirroring `tpph`, which already had it) and
switching the One-Pager's 3 call sites over. Dispatch #153's own PR (#815) explicitly scoped
itself to ONLY those 3 call sites and listed every other `metricAvg('oepe'|'r2p'|'tpph', ...)`
call site in the app as a follow-up candidate, left untouched on purpose. **This dispatch is that
follow-up.**

Not part of the Performance Review redesign thread — unrelated work, next in the queue after it.

## What already exists (read the code, don't re-derive)

- **`metricSumRatio(ds, locs, range, key)`** (`src/engine/metric-source.js`) — computes the true
  Σnum/Σden period rollup for any `METRIC_SOURCES[key]` whose `derive` is marked
  `kind:'ratio'`. `oepe`, `r2p`, and `tpph` are now all marked this way (dispatch #153).
- **`rateMetric(ds, locs, range, key)`** (`src/engine/one-pager-data.js`) — the small wrapper
  dispatch #153 added: tries `metricSumRatio` first, falls back to `metricAvg` only when
  `metricSumRatio` returns `null` (no day in range resolves both raw legs). This is the exact
  pattern to reuse at every call site in scope below — do not write a second, slightly different
  wrapper; either reuse this one (exporting it, if it isn't already) or inline the identical
  two-line fallback pattern, your call, but don't diverge from it.
- **The bug this fixes**: `qsr_daily_activity_rollup` always carries the full 24-`hour_slot`
  shape even for a business day still in progress (future hours zero-filled, not absent), so an
  in-progress "today" is structurally indistinguishable from a complete day to `metricAvg`'s flat
  mean-of-daily-values — it blends in with full, equal weight, and can read as an implausibly
  fast/high figure purely because it's incomplete. See CLAUDE.md's own note (added by #153) under
  the DAR/hour_slot completeness section for the full mechanism.

## The real judgment call this dispatch requires, per call site — do not blanket-convert

**Not every `metricAvg('oepe'|'r2p'|'tpph', ...)` call site has this bug.** The failure mode
specifically requires the `range` passed in to be able to include an in-progress period (typically
"today" or "this week/period so far"). A call site that only ever operates on **already-complete,
historical** ranges (e.g. a trend chart of PAST weeks that excludes the current one, a report run
for a closed prior period) does not have this bug — converting it to `metricSumRatio` would be
harmless (the two methods agree once every day in range is complete) but is not the point of this
dispatch, and blanket-converting without checking wastes the exact "measure it, don't reason about
it" discipline this bug was found with in the first place.

**For EACH call site below, determine and document:**
1. Does the `range` passed to `metricAvg` ever include the current, still-open business day (or an
   otherwise-incomplete period)? Read the caller's own range-construction logic — don't guess from
   the variable name.
2. If yes → convert to the `rateMetric`-style fallback pattern.
3. If no (provably always historical/complete) → leave it as `metricAvg` and say so explicitly in
   the PR body, with the reasoning (e.g. "this chart's range is always `[start, start+6]` for a
   week that has already fully elapsed by construction, confirmed by reading X").
4. If genuinely ambiguous (could go either way depending on how a caller invokes it, e.g. a shared
   component used both for live and historical views) → convert it. Silently leaving a real,
   possibly-hit bug unconverted because it MIGHT be safe is the wrong default; converting a
   call site that turns out to never hit the bug costs nothing (the two methods agree on complete
   data) — asymmetric risk, resolve it toward converting when truly unsure.

## Call sites to evaluate (from dispatch #153's PR #815, cite by function/variable name — the
## exact line numbers in that PR will have drifted by the time this dispatch is picked up)

- `src/features/morning-brief.js` — the `oepeNorm` computation.
- `src/engine/review-engine.js` — `oepeAvg`/`r2pAvg` (note: this is inside the Performance Review
  engine's `autoPopulateKPIs` or similar — check carefully whether this one is scoring a PAST,
  already-closed review period, which would make it a clean "no bug here" case, vs. auto-populating
  a still-open current period).
- `src/views/at-a-glance.js` — the district `tpph` tile.
- `src/views/signals.js` — the `oepe` reference.
- `src/views/labor-tools.js` — three separate `tpph`/`oepe` references in weekly trend rows (check
  each independently — a "trend row" strongly suggests historical-series display, but confirm
  whether the MOST RECENT row in that trend can be the current, still-open week).
- `src/views/sage.js` — `distAvgTpph`/`distOepe` (SAGE's own tool-use data; check what range SAGE
  actually requests when a user asks about "this week").
- `src/views/store-dash.js` — three separate `tpph`/`oepe`/`r2p` references.
- `src/views/attention-now.js` — the `oepe` reference (a name suggesting live/current-state
  monitoring — likely a real candidate, confirm).
- `src/views/above-store-onepager.js` — `tpph`/`oepe`/`r2p` (a DIFFERENT panel from the Leadership
  One-Pager `one-pager.js` already fixed — confirmed a real, separate file by dispatch #153's own
  audit; this one was never touched).

This list is what was found via `grep` at the time dispatch #153 was written — **re-grep for
`metricAvg(` combined with `'oepe'`/`'r2p'`/`'tpph'` across `src/` before starting**, in case
anything shipped between #153 and this dispatch added or removed a call site; treat the list above
as a starting point to verify, not a guaranteed-complete inventory.

## Scope for this dispatch

1. Work through every call site above (plus any newly-grepped ones), applying the judgment call
   described above to each.
2. Convert the ones that need it to the `rateMetric`/fallback pattern, reusing dispatch #153's
   exact logic (export and reuse `rateMetric` from `one-pager-data.js` if that's the cleanest path,
   or move it to `metric-source.js` itself if it's going to be used from many files — your call,
   but don't duplicate the fallback logic verbatim across many files either; pick ONE home for it).
3. Tests: for each converted call site, a test proving the specific consumer (not just the engine
   function in isolation) now uses the Σ/Σ rollup for a range that includes an incomplete day —
   matching dispatch #152/#153's own established "verification must touch the call site" standard.
4. PR body must include, for every call site in the list above (and any newly-grepped ones): which
   were converted, which were left as `metricAvg` and why, in a plain table or list — this is the
   actual deliverable of the "judgment call" this dispatch is scoped around, not just the code diff.

## Explicitly OUT of scope

- Any metric other than oepe/r2p/tpph — this dispatch is specifically about extending an already-
  shipped fix's reach, not auditing every rate metric in the app for a similar issue. If you
  notice a clearly analogous bug in an unrelated metric while doing this work, note it in the PR
  body as a separate follow-up candidate — do not fix it here.
- Any new "day completeness" tracking mechanism — not needed, `metricSumRatio` already handles
  this correctly for any metric with a real ratio mapping (which oepe/r2p/tpph already have).
- The Performance Review redesign thread (dispatches #148-152/154) — unrelated.

## Verification bar

- New/changed unit tests pass; full `npx vitest run --exclude "**/.claude/**"` suite passing at
  the same or higher count as `main`.
- `npm run build` clean, report before/after entry-chunk gzip.
- PR body must include the full per-call-site disposition table described in scope item 4.
