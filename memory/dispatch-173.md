# Dispatch #173 — Investigate #327's real cause (10.2% laborPct derive mismatch, boundary theory refuted)

## Where this stands (fully measured, not guessed — read the actual code comment first)

`src/engine/metric-source.js`'s `laborPct` chain entry (~line 176-211) already documents the full
history. Summary, so you don't have to re-derive it:

- The `laborPct` derive (`crew_labor_dollars ÷ DAR product_sales`, both from auto/API sources) was
  measured against Daily Glimpse's real `labor_pct` on 648 real store-days (27 stores,
  2026-07-19..2026-08-11): **582/648 (89.8%) match within 0.001; 66/648 (10.2%) do NOT.**
- Signed diff on the mismatches: mean **+0.0050** (58 positive / 8 negative — the derive mostly
  runs HIGH), mean |diff| 0.0074, max 0.0276. **Spread across 25 of 27 stores, no store at 100%
  mismatch** — it's day-specific, not a fixed per-store definitional gap.
- **The leading hypothesis (a `compType:'calendar'` day-boundary mismatch between the two pull
  paths) was directly tested and REFUTED by dispatch #164 this same session** — both legs of the
  derive are confirmed on the identical 4am-business-day boundary (re-bucketed raw
  `qsr_punch_times` clock punches two ways, 0.000 mean abs diff against the 4am cut, midnight never
  won a single store-day). **Do not re-open the boundary question — it's closed.**
- **One deep-dive (store 31357, 2026-07-19) already ruled out BOTH candidate sales denominators**
  for that specific day: neither `product_sales_amt` nor `net_sales_amt` implies Glimpse's 0.1876
  from `crew_labor_dollars=2270.67`. This means **the NUMERATOR itself likely disagrees with
  whatever Glimpse used internally** for at least this one case — not just a denominator
  candidate-picking problem. This is the strongest existing lead and hasn't been chased further.

## What this dispatch is

A continuation of the SAME investigation, not a new one — pick up exactly where the deep-dive left
off. Per this repo's "measure it, don't reason about it" standing rule, and matching the posture
already established for #172 (a sibling investigation dispatch this same session): **a fix is only
in scope if you find and confirm a real, narrow, explainable cause. "Investigated further, still
open, here's what's now ruled out" is a legitimate, valuable outcome** — do not force a fix onto
a partial finding, and do not touch `METRIC_SOURCES`' `laborPct` chain/derive unless you have an
unambiguous correction in hand.

## Leads to chase, in rough priority order

1. **Job-code / pay-type scope mismatch on the numerator.** `crew_labor_dollars` (from
   `qsr_labor_summary`, the `labor-summary` API endpoint) is supposed to be "crew (punched,
   hourly) labor $" — but does its underlying QSRSoft definition include/exclude the exact same pay
   categories Daily Glimpse's own `labor_pct` numerator does? Candidates: overtime premium pay,
   training-wage codes, shift-lead/keyholder differential pay, PTO/holiday pay accidentally
   swept into or out of one side. `qsrsoft_kb` (a public-read Supabase table, confirmed reachable
   in this session's environment per prior sessions' notes) may have field definitions for both
   reports — check there before guessing from field names alone.
2. **A correction/revision-lag hypothesis, given the mismatches run mostly HIGH and are day-
   specific rather than store-specific.** If `qsr_labor_summary` is pulled soon after a business
   day closes (a snapshot), and punch edits/corrections continue to land afterward (a known pattern
   in labor systems — a manager fixing a missed punch a day or two later), an EARLY pull would
   overstate labor $ before corrections land, while Daily Glimpse (pulled or computed later, or
   computed from a source that's naturally correction-aware) reflects the corrected, lower figure —
   consistent with the mostly-positive skew. Testable: do the 66 mismatched days cluster near
   "most recently closed" days relative to when they were pulled, or are they scattered evenly
   across the whole window? If the pull script or its logs preserve a pull timestamp separate from
   the business date, compare the two. If nothing in this environment can test the "does the same
   date's crew_labor_dollars value change on a later re-pull" question directly, say so explicitly
   and explain what you tried.
3. **A rounding/truncation or unit-scale artifact specific to certain dollar ranges.** Check
   whether mismatch magnitude correlates with store sales volume or absolute labor $ (a scale-
   dependent bug would show a pattern here; a definitional gap would not).
4. **Re-run the store 31357 / 2026-07-19 deep-dive's method across a larger sample of the 66
   mismatched days** (not just the one already checked) to see whether the "numerator disagrees,
   not just the denominator" finding generalizes, or was specific to that one case.

## Task

1. Pull the actual list of mismatched (loc, date) pairs from the original 648-day measurement
   window (re-run the same comparison the existing comment describes if the original list wasn't
   preserved anywhere) — you need the real 66 days to test any hypothesis against, not a fresh
   independent sample.
2. Chase the leads above in priority order; stop and write up whichever one actually explains the
   pattern, or write up that none of them do if that's where the evidence leads.
3. Write up findings as a new `memory/finding-*.md` file (this repo's standing convention),
   whether or not a clean cause is found.
4. Only touch `metric-source.js`'s `laborPct` chain if you have a confirmed, narrow fix — and if
   so, update the existing chain comment to record what was found (matching how dispatch #164
   corrected the boundary hypothesis in place, in the same comment block, rather than leaving
   stale reasoning standing).

## Verification

- If a fix lands: a real-data reconciliation test (same shape as the existing 648-day measurement,
  or a targeted subset covering the previously-mismatched days) showing the match rate improves,
  plus standard suite + build.
- If no fix lands: the finding file itself is the deliverable — no code change required, but do
  not skip writing it up just because the investigation came up empty. An "I checked X, Y, Z and
  none of them explain it" write-up is exactly what the next person picking this up needs, per
  this repo's own repeated lesson about rediscovery costing more than the original investigation.

## Out of scope

- Re-opening the day-boundary question — closed by dispatch #164, cited above.
- `laborDollar`'s own chain definition or `sales`'s own chain definition, beyond what's needed to
  test the leads above — this is about the DERIVE's accuracy, not a broader audit of either input
  chain.
- Any change to which source "wins" in the `laborPct` chain's source-priority order
  (`glimpseRows` → `ctrlRows` → `laborRows` → derive) — out of scope unless directly implicated by
  a confirmed finding.
