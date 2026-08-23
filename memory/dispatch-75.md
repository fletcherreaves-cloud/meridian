# Dispatch #75 — Visit Patterns shows channel performance pooled across 4 years, hiding the one real trend in the data

**Status:** ready to start. Data already in the app (dispatch #74). No capture, no new source.
**Reads:** `memory/finding-cfv-2026-drivethru-decline-2026-08-22.md`.

---

## The gap

`VisitPatterns` renders `block('Channel', a.channel)` — one pass-rate and average per channel,
**pooled across the entire history**. With #74's import that is now 217 visits spanning 2023-2026
collapsed into three rows.

**That pooling hides the only clear trend in the dataset.** Measured:

| channel | share of visits 2025 → 2026 | below-80 2025 → 2026 |
|---|---|---|
| **drive-thru** | **43% → 60%** | **25% → 54%** |
| curbside | 46% → 30% | 20% → 29% |
| in-restaurant | 11% → 11% | 29% → 40% |

Pooled, drive-thru reads as a middling channel. Split by year, it is a channel that **doubled its
failure rate while simultaneously becoming the majority of visits.** The estate's below-80 rate
went 23.1% → 44.7%, and a decomposition attributes **81% of that to performance, 19% to mix**.

An operator looking at today's panel cannot see any of this.

## What to build

**Add a time dimension to the Channel block.** The minimum that surfaces the finding: per-channel
rows broken out by year (or by the panel's existing window if one fits better), showing both the
**share of visits** and the **below-80 rate** — because the two moved together and either alone
tells the wrong story.

⚠️ **Show the mix, not just the rate.** A channel getting worse and a channel getting shopped more
are different problems with different responses, and drive-thru did both. A view with only the rate
would have the owner chasing execution when a fifth of the move is scheduling.

## 🔴 The constraint that will make or break this — thin cells

217 visits ÷ 4 years ÷ 3 channels averages ~18 per cell, and the real distribution is far worse:
**in-restaurant 2023 is n=1.** At those counts a pass rate is close to meaningless.

- **Show `n` on every cell.** Never a bare percentage.
- **Suppress or visibly de-emphasise cells below a floor** rather than rendering a confident-looking
  0% or 100% off two visits. Pick the floor from the data, not by feel — and state it in a comment
  the way `OVERDUE_MULTIPLIER` now does.
- ⚠️ **Do not add a trend line or an arrow.** Four annual points, several with single-digit n, do
  not support a slope. The table is the honest form.

📌 This is the same discipline the amber threshold needed: the panel's job is to show what the data
supports, and the failure mode here is a tidy-looking grid that implies precision it does not have.

## Do NOT

- ⚠️ **Do not surface the per-store year-over-year list.** It is in the finding and it is explicitly
  flagged as unreliable: at ρ≈0.02 test-retest and ~2 visits per store per year, single-store moves
  are noise. The estate-level channel signal is trustworthy; the store names are not. A "most
  declined stores" table would be actively misleading.
- ⚠️ **Do not present 2026 as a completed year.** It runs to 2026-08-18. Label partial years.
- ⚠️ **Do not restate the p-value in the UI.** The finding records p=0.029 and also that it does not
  survive a Bonferroni correction for the three channels examined. That nuance does not compress
  into a panel; showing `n` and letting the numbers speak is the honest version.

## Verification bar

Revert-sensitive per the standing rule: render the real `VisitPatterns` with a fixture whose
channel mix and rates differ across two years, and assert **both** the mix and rate cells for a
given (channel, year). A test that only checks the engine's grouping cannot tell "computed" from
"rendered".

Include a **thin-cell fixture** (a channel-year with n=1) and assert it is suppressed or marked,
not rendered as a bare 0%/100%.

---

## Resolution (2026-08-22)

**Built.** `analyzeGradedVisits` (`src/engine/visit-readiness.js`) gained a `channelByYear`
computation: per (channel, year), `n`, `share` (of that year's total visits), `passRate`, and a
`thin` flag. `VisitPatterns` (`src/views/visit-readiness.js`) replaced the pooled
`block('Channel', a.channel)` with a dedicated "Channel over time" section rendering both figures
per cell, `n` always shown, thin cells collapsed to a count only.

**The suppression floor was measured, not guessed**, per the dispatch's own instruction to treat
it the way `OVERDUE_MULTIPLIER` was: computed the sorted `n` across all 12 real (channel, year)
cells that have any visits — `[1, 3, 5, 7, 14, 20, 23, 28, 28, 29, 29, 30]`. The gap from 7→14 is
more than double every other consecutive gap in that list and cleanly separates every In
Restaurant cell (1/3/5/7, every year) from every Drive Thru/Curbside cell (14+). `10` sits in that
gap and is now `CHANNEL_YEAR_MIN_N`, documented with the same measured-not-felt comment style as
`OVERDUE_MULTIPLIER`. Confirmed against the real dataset (not just the fixture) that all 4 In
Restaurant cells fall under it and every Drive Thru/Curbside cell does not.

**Both do-nots and the three thin-cell requirements are satisfied:**
- No per-store year-over-year list was added — the freq table's per-store cadence view is
  untouched and remains separate from this section.
- No trend line/arrow — the section is a table only; a test explicitly asserts no `<svg>`/
  `<canvas>` is rendered for it.
- No p-value shown in the UI.
- The current calendar year (2026 at merge time) is labeled with a footnote (`2026*` / "partial
  year, not yet complete"), computed from `new Date().getFullYear()` rather than hardcoded, so the
  label moves forward with the calendar on its own.
- `n` is shown on every real cell and on every thin cell.

**Verification, per the dispatch's explicit bar:**
- Revert-sensitive, confirmed by direct measurement rather than assumed: stashed only the panel
  file (keeping the engine's `channelByYear` computation in place) and re-ran the new test suite —
  it failed on both share/rate assertions, proving the test exercises the panel's own rendering,
  not just the engine's grouping. Restored and re-confirmed green.
- A synthetic fixture pins exact share **and** rate cells across two years (including a cell that
  sits exactly at the `n=10` floor boundary, to confirm `10` itself is not thin), plus a thin-cell
  (`n=1`) case that must render `n=1 (thin)` with no percentage anywhere in that cell's own DOM
  node — not a raw `textContent` substring check, which turned out to be a real trap: several
  legitimate non-thin cells in the same fixture render `"X0.00% below"` (e.g. `20.00%`, `60.00%`)
  and would have falsely matched a naive `not.toContain('0.00% below')` check.
- A fourth test runs the panel against the exact 217-visit seed file dispatch #74 imported (not a
  re-fabricated copy) and asserts it reads **59.57% of visits / 53.57% below-80** for 2026
  drive-thru — computed independently in this Resolution, matching
  `memory/finding-cfv-2026-drivethru-decline-2026-08-22.md`'s reported ~60%/~54% at full
  precision — and that all 4 In Restaurant cells across real history render as thin.

**Not touched, as scoped**: the per-store list, any trend/slope indicator, the p-value/Bonferroni
nuance, and the Speed component's drive-thru-centric design (the incidental note that CFV now
shopping drive-thru 60% of the time narrows, not widens, the channel-mismatch concern — already
recorded in the finding memory file's own "What this does and does not imply" section, nothing
further needed here).

4 new tests, 191/191 test files, 2080/2080 tests, build clean, entry-eager payload unchanged
(Visit Readiness is lazy-loaded).
