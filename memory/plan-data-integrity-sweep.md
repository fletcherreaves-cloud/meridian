---
name: plan-data-integrity-sweep
description: Bounded data-integrity sweep plan — the greppable defect signatures earned from the 2026-08-08 bug run, with measured counts of how many sites match each.
metadata:
  type: project
---

# Data-integrity sweep — scoped by defect signature, not "check everything"

Owner asked (2026-08-08, after a long bug run): *"How about all the calculations and data we've
been working through. We found a lot of common things while doing so. Do you think a full sweep
to make sure we have all of the data pinned down would be wise?"*

**Answer: yes, and it is bounded.** A general "verify every number" audit is unbounded and would
mostly re-confirm working code. What this session actually produced is better: every bug was an
instance of a RECURRING, GREPPABLE class. A sweep targeting those signatures is finite and
high-yield.

## The signatures, each earned from a real bug

| # | Signature | Real instance | Measured sites |
|---|---|---|---|
| 1 | Ratio guarded only by `>0`, so a near-zero denominator survives | `getDOWTrend` → 1,200,000% chart axis (v4.912) | **132 candidate ratio sites** |
| 2 | Panel reads `ds.*Rows` directly instead of the resolver | Dialed-In blank trend; the manual-only class | **56 metric reads** (210 more are structural and fine) |
| 3 | Units mixed — dollars into a count field | Register Audit `refundCnt += refundCashless` (v4.903) | small; `*Cnt` sites scanned clean apart from that |
| 4 | Partial/incomplete period treated as complete | Biggest Miss grading today (v4.917); swing alarm (v4.880); count completeness | recurred **3+ times** — highest-priority class |
| 5 | Missing data indistinguishable from a real zero | `avg6`→0 graded as passing green; failed read vs empty read | audit `\|\| 0` on metric reads |
| 6 | Exclusion filter that can eliminate EVERY candidate | `fetchLY` skipping all 7 offsets on tagged days (v4.910) | audit every multi-candidate fallback chain |
| 7 | Ordering/precedence wrong | resolver manual-before-auto in 30 of 35 chains (v4.905) | now guarded by a test |
| 8 | Date representation divergence | `dKey('2025-07-15')` off by one (v4.907) | now guarded by a test |

## Why #4 deserves to go first

It is the only class that has recurred **three separate times** in different subsystems, and
every instance produced a number that was *plausible but wrong* — the worst kind, because
nobody investigates a number that looks reasonable. `businessDate()` (4am ABC cutover) already
exists as the shared helper; the sweep is finding every place that should use it and does not.

## Method

1. Enumerate sites per signature (the counts above are a first pass, already run).
2. Triage each: real defect / intentional / not applicable. **Expect most to be fine** — the
   value is the small number that are not.
3. Fix with a measured threshold where one is needed (see the ±300% bound in v4.912 — derived
   from 40,000 store-days, not chosen).
4. Add a guard for the CLASS, not the instance. Signatures 7 and 8 already have one; that is
   the model.

## Standing caution

Three hypotheses were wrong for every one that was right this session. The sweep must
**measure each candidate against real data** before changing it — a "fix" applied to a site
that was already correct is a regression, and v4.904 already broke calibration for all 27
stores exactly that way.

Related: [[feedback-measure-dont-reason]], [[data-sourcing-standard]],
[[feedback-performance-budget]], [[notes-62-queue]].
