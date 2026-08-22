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
