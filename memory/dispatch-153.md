# Dispatch #153 — Fix OEPE/R2P/TPPH silently blending an in-progress business day into
# "current week" rate-metric averages

**Context (2026-08-27):** Found by a parallel audit spawned after the FOB fix (v5.195/v5.196)
shipped, prompted directly by the owner asking to "audit the rest of the report" (the Leadership
One-Pager, `src/views/one-pager.js`). This is a real, reproducible, measured bug — not a
re-derivation of an old finding. Not part of the Performance Review redesign thread; unrelated
work, next in the queue.

## The bug (measured live against production, not assumed)

`metricAvg()` (`src/engine/metric-source.js`) is a **flat, unweighted mean of each day's
already-resolved value** across the days a range covers — correct for a rate metric in general
(its own header comment: "never averages a pre-rolled average, it means the raw daily values from
the freshest source per day"), but it has **no concept of "this day is still in progress."**

`qsr_daily_activity_rollup` (fed by `scripts/qsrsoft-dar-pull.mjs`'s `refreshRollup()`) always
carries a full day's shape even mid-day — every `hour_slot` the DAR report returns exists, with
hours that haven't happened yet simply zero-filled — so a day that's 30% through is
**structurally indistinguishable from a complete day** to anything reading the rollup table:
same 24-slot shape, non-null aggregates, a real `refreshed_at`. `metricAvg` blends it into "this
week" with full, equal weight alongside genuinely finished days.

**Live measurement (2026-08-26/27, service-role Supabase REST, all 27 stores):** the current work
week (Wed→Tue) had exactly one day so far — Aug 26 — and it sat at a **mean 68.5% of that day's
own projected transaction volume** (range 58.8–79.3% across 27 stores; DAR pulls stop ~2pm CDT,
next pull ~3am). Yet district-wide, that same partial day read as the **fastest OEPE and highest
TPPH of the entire 8-day sampled window** (129.2s OEPE / 6.58 TPPH vs the week's 140–170s / ~5.5) —
a 16–19% "improvement" that is a completeness artifact, not real speed. Per-store R2P swings were
extreme: store 3708 went 211.2s (Aug 25, complete) → 92.3s (Aug 26, partial).

This also defeats CLAUDE.md's own documented mitigation ("check `count(hour_slot)` per `(loc,dt)`
before trusting a DAR-denominated derivation") — the DAR **always** returns all 24 slots, so
`count==24` is true for an in-progress day too. That check cannot detect this specific failure
mode; note this gap in CLAUDE.md once the fix ships (don't just patch the code and leave the doc
making a claim that no longer holds for this case).

## The fix — extend an ALREADY-PROVEN pattern, don't invent a new completeness mechanism

`metric-source.js` already has the right tool for exactly this shape of problem:
**`metricSumRatio(ds, locs, range, key)`** — for any metric whose `METRIC_SOURCES[key].derive` is
marked `kind: 'ratio'` (a genuine `[numerator, denominator]` pair), it returns the TRUE period
rollup (Σnumerator ÷ Σdenominator) instead of a mean-of-daily-ratios. `tpph` **already uses this
exact pattern** (`derive: { inputs: ['gc','actHrs'], kind:'ratio' }`) — proven, tested,
production code, not a proposal. Under a sum/sum ratio, an incomplete day naturally contributes
*proportionally less* to the period total (fewer transactions = smaller weight in both numerator
and denominator), instead of being averaged in as if it were a complete, representative day — this
directly addresses the measured symptom without needing to invent or track a new "is this day
done yet" signal at all.

**`oepe` and `r2p` do NOT currently have `derive.kind:'ratio'`** — they're sourced as
already-precomputed daily averages straight from `qsr_daily_activity_rollup.oepe`/`.r2p` (see
`METRIC_SOURCES` in `metric-source.js`), with no numerator/denominator tracked. **But the raw
components likely already exist in the rollup table** — `scripts/qsrsoft-dar-pull.mjs`'s
`refreshRollup()` already sums `dt_untilserve`/`dt_trans_cnt` (drive-thru), `fc_untilserve`/
`fc_trans_cnt` (front counter), and `mfy_untilserve`/`mfy_trans_cnt` (kitchen/MFY) into the
rollup row. These look like real candidate numerator/denominator pairs for R2P (drive-thru speed)
and OEPE (order-entry-to-presentation, likely a specific station or a composite) — **confirm
which exact fields map to which metric before wiring anything**, don't guess: cross-check that
`Σcandidate_numerator ÷ Σcandidate_denominator` for a KNOWN-COMPLETE day matches that day's
existing precomputed `oepe`/`r2p` value within a small tolerance (this proves the mapping is
right, the same "measure it, don't reason about it" discipline every prior dispatch in this repo
has used for exactly this kind of field-identity question).

## Scope for this dispatch

1. **Identify OEPE's/R2P's true raw numerator/denominator fields** in `qsr_daily_activity`/
   `qsr_daily_activity_rollup` (candidates above — confirm, don't assume) via the cross-check
   method described. If a metric genuinely has no clean 1:1 numerator/denominator (e.g. OEPE is a
   composite across multiple stations with no single summable pair), say so explicitly rather than
   forcing a `kind:'ratio'` marking that doesn't hold — `metricSumRatio`'s own comment is explicit
   that this marking must be curated, never applied to a derive that isn't a genuine ratio.
2. **Extend `METRIC_SOURCES['oepe']`/`['r2p']`** with a `derive: {inputs, fn, kind:'ratio'}` entry
   mirroring `tpph`'s exact pattern, for whichever of the two (or both) have a confirmed real
   numerator/denominator pair.
3. **Switch the Leadership One-Pager's current-period calls** for `oepe`/`r2p`/`tpph` from
   `metricAvg` to `metricSumRatio` (falling back to `metricAvg` only when `metricSumRatio` returns
   `null` — e.g., no data resolves both legs for any day in range — never silently drop a number
   that used to display). The relevant call sites are ALL in `src/engine/one-pager-data.js`:
   `buildCurrentState()`, `buildMetricNow()`, and `buildPerLocationRows()` — grep for `metricAvg`
   in that file and check each call against `rollupCapableMetricKeys()` to confirm you've found
   every one, not just the ones named in this dispatch.
4. **Do not silently change every OTHER consumer of `metricAvg('oepe'/'r2p'/'tpph', ...)`
   app-wide** — a grep will likely surface call sites outside the Leadership One-Pager (Signals,
   Analytics, At-A-Glance, etc.). This dispatch is scoped to the panel the bug was reported on.
   If you find other call sites where the identical completeness-skew bug clearly applies (a
   "current week"/"current period" style call, not a fixed historical range), list them plainly in
   the PR body as follow-up candidates — do not fix them here, and do not expand this dispatch's
   blast radius to "every rate metric everywhere."
5. **Tests**: a synthetic scenario reproducing the exact measured real-world shape — 7 complete
   days plus one partial "today" with a plausible per-transaction rate but far fewer transactions
   — proving `metricSumRatio`-based rollup does NOT read as the fastest/best day of the window
   the way the current `metricAvg` approach does (a concrete before/after numeric comparison, not
   just "it returns a number"). Also test the `derive` fn's cross-check itself: given the same
   day's raw components, the derived value matches what `metricAvg` would have returned from the
   precomputed field for a KNOWN-COMPLETE day (proving the numerator/denominator mapping is
   correct, not just self-consistent).
6. **CLAUDE.md**: add a short note under the existing DAR/hour_slot completeness guidance that
   `count(hour_slot)==24` does NOT detect an in-progress day (the DAR zero-fills future hours), so
   a future session doesn't reach for that check here and get burned the same way this dispatch's
   own investigation was.

## Explicitly OUT of scope

- Any other panel's use of these metrics (Signals, Analytics, At-A-Glance, SAGE, etc.) — list
  candidates found, don't fix them.
- Any brand-new "day completeness" tracking mechanism (a stored flag, an hours-elapsed column,
  etc.) — the sum/sum ratio approach is the fix; reach for a new mechanism ONLY if you confirm (and
  document why) no valid numerator/denominator pair exists for a given metric and a completeness
  signal is genuinely the only path — don't default to building one just because it's also a valid
  design.
- The FOB fix (v5.195/v5.196) and dispatch #152 (Performance Review) — unrelated, already shipped.

## Verification bar

- New/changed unit tests pass; full `npx vitest run --exclude "**/.claude/**"` suite passing at
  the same or higher count as `main`.
- `npm run build` clean, report before/after entry-chunk gzip.
- PR body must state: (a) which of oepe/r2p got a confirmed real ratio mapping and which (if
  either) didn't and why; (b) the exact cross-check numbers proving the numerator/denominator
  mapping is correct against a real complete day, not just plausible; (c) the before/after numeric
  comparison for the synthetic incomplete-day test; (d) a plain list of any other `metricAvg`
  call sites for these three metrics found outside the Leadership One-Pager, left unfixed on
  purpose.
