---
name: finding-voice-mcdelivery-export-field-mapping-2026-11-23
description: Field-mapping reference for SMG VOICE and McDelivery/3PO manual exports, built while sourcing real data for an outside-the-app 2027 targets workbook. Documents which export/sheet/column to pull for OSAT Top-2-Box, Overall Satisfaction B2B, VOICE Execute As Designed, McDelivery Wait Time, McDelivery Star Rating, and McDelivery GC/R/D — plus two real bugs caught and fixed along the way (B2B's direction was inverted; McDelivery GC/R/D only captured 1 of 6 real vendor/channel streams). Not a shipped Meridian feature — these are manual Excel exports, same status as the rest of SMG VOICE per finding-smg-reporting-api-2026-09-05.md. Written so the next session sourcing these metrics (in a workbook or when this eventually gets wired into the app) doesn't re-walk the same ambiguous-column dead ends.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# VOICE / McDelivery export field mapping — what to pull, and the traps

Built while sourcing real 2027-targets data for an owner-reviewed Excel workbook (outside the
app), not a Meridian feature. All six metrics below went through at least one wrong guess before
landing on the right field — recorded here so the next pull starts from the answer, not the
guess.

## OSAT Top-2-Box ("VOICE OSAT")

- **Field:** `smg_fullscale.osat_top2` (live table) — this is correct and already how the app
  computes it (`metric-provenance.js`'s `osat` definition). The live table's real data lags —
  measured stale through 2026-07 as of a 2026-11-23 pull, 4 months behind.
- **Fresher alternative:** a manually-run **"FullScale Report"** export (`Data Only` sheet) gives
  a single Jan–Oct aggregate per store, all 27 stores including FL. Its "Overall Satisfaction"
  group has sub-columns `n, 5, 4, 3, 2, 1` (full rating distribution) — **Top-2-Box = column "5" +
  column "4"**, not any single column. Cross-checked against the live `osat_top2` pull for the
  same store: matched to within 0.1 point (85.0% vs 85.1%) — trustworthy.
- **Do not confuse with:** a separate **"TrendReport"** export's "Overall Satisfaction" group,
  which is **Top-1-Box only** (column "5" alone, no "+4"). Confirmed by averaging a store's 10
  monthly TrendReport scores and comparing against the FullScale Report's column "5" alone for the
  same store — they matched; Top-2-Box did not. If a report just says "Overall Satisfaction" with
  one Score column, don't assume it's Top-2-Box without this cross-check.

## Overall Satisfaction B2B — a real, shipped bug, now fixed

**Two separate things were wrong before this was corrected, not one:**

1. **Direction.** This is a **lower-is-better defect rate**, not a satisfaction percentage to
   maximize. A store doing well shows a SMALL number (Freeport: ~3.7%), not a number near 95-100%.
   Confusing it with CLAUDE.md's "Acc B2B ≥95%" threshold (a *different* metric, Accuracy B2B) led
   to inverting it and reporting Freeport at a nonsensical "97.3%"/hard-capped-at-100%-target
   before the owner caught it by eye.
2. **Column ambiguity in the "FullScale Report" / old-style "TrendReport.xlsx" exports.** Both give
   this measure as two unlabeled sub-columns ("1" and "2") instead of one Score. **Column "1" is
   the real number** — confirmed by cross-referencing against a separate TrendReport export that
   gives the SAME measure as one clearly-labeled "Score" per month, and finding that Score matches
   column "1" almost exactly (0.4037 vs 0.403 for a different measure, Pull Forward EAD, used as
   the cross-check since both files covered it). Column "2" is NOT the metric — don't use it.
- **Best source:** the **"TrendReport_YYYY_Detailed.xlsx"** export format (see "Detailed vs
  Summary" below) — one row per store per measure, with `Overall Satisfaction B2B` as its own
  block, Score only, months as columns, no 1/2 ambiguity at all. Pull both the prior year
  (`_2025_Detailed`) and current year (`_2026_Detailed`) to get LY + a real monthly trend
  (recent 3mo vs. prior 3mo) — not suppressed at this grain, unlike EAD below.

## VOICE Execute As Designed

- **Real field:** `"Pull Forward - Executed as Designed (Yes)"` — exact name, found in the
  FullScale Report / TrendReport exports' measure list. The metric's actual real-world magnitude
  is LOW (district running 30–55%/month) — don't expect a satisfaction-style high percentage.
- **Same column-ambiguity trap as B2B above, same fix:** in the FullScale Report's `n, 1, 2`
  layout, **column "1" is the real "(Yes)" rate**, confirmed by the same TrendReport
  cross-reference method. (First attempt at this metric used column "2" and reported numbers
  backwards — e.g. 73.9% instead of the real 26.1% for one store. Caught and corrected only
  because a second, differently-shaped export (TrendReport) happened to resolve the ambiguity;
  don't trust a bare 1/2 split without a second source to anchor polarity.)
- **No real trend available at store grain, in any export checked so far.** Every store's own
  MONTHLY reading is vendor-suppressed (`**`, sample too small) in both the Nov-2026 TrendReport
  and the full-year 2025/2026 `_Detailed` exports — this is NOT a coverage gap that a better pull
  fixes, it's inherent to how thin this specific measure is per store per month (n in the teens to
  low hundreds, well under whatever threshold the vendor suppresses at). Only a multi-month
  AGGREGATE (FullScale Report's Jan–Oct combined, or similar) gives a real per-store number.
  Treat Recent/Prior as genuinely unavailable at the store level rather than re-attempting a
  monthly parse expecting different results.
- **Coverage:** FL stores and 44689 (Lindsay) are **not** in the FullScale Report or TrendReport
  exports seen so far — MCDOK (+ 18213, pre-relocation) only.

## McDelivery Wait Time

- **Field:** the **"Restaurant Time"** column in a `MCDelivery 3PO` export's one sheet — confirmed
  directly by the owner, not inferred. There is also a "McDelivery Time" column and a "Total
  Experience Time" column in the same row; neither is the right one, despite "McDelivery Time"
  looking like the obvious name match.
- **Star Rating:** the **"CSAT"** column in the same export/row — a real 1-5 scale, also owner-
  confirmed.
- **Coverage:** confirmed to need a specific export; the general Digital_App export does not carry
  this at all. A `MCDelivery_3PO_...` filename export covers all 27 stores (later pulls); earlier
  pulls of a differently-dated export only had the 20 MCDOK stores — re-check coverage per pull,
  don't assume FL is included just because the file loads.

## McDelivery GC/R/D — the old number was ~1/11th of the real total

- **Real source:** a `McDelivery_...xlsx` (or `GC_-R-D_McDelivery_...xlsx`) export's **"All
  Vendors"** sheet, **"All Delivery GC"** column, divided by days in the month for a daily rate.
  This file also breaks the same total down into 6 separate sheets (UberEats/DoorDash/GrubHub ×
  3PO/GMA-Delivery) — verified the "All Delivery GC" column sums EXACTLY to those 6 sheets' GC
  columns added together, so it's the real, complete total, not an estimate.
- **The old (wrong) source:** the `Digital_App` export's "GMA Delivery" sheet has one ambiguous,
  unlabeled column (literally headed "GMA Delivery", same as the sheet name) that turns out to be
  **only DoorDash's GMA-Delivery slice** — one of six real streams. For a typical store, DoorDash's
  regular **3PO** channel alone (a different stream entirely, not captured by that column at all)
  runs roughly **11x bigger** than the one slice that column measures. A store reading "6.2/day"
  off the old source was really running "65.3/day" — not a rounding difference, a fundamentally
  incomplete source. If a future pull only has the Digital_App export available (no dedicated
  McDelivery export), flag the resulting number as likely understated by an order of magnitude
  rather than presenting it as equivalent.

## "Detailed" vs "Summary" vs the bare "FullScale Report" / unnamed "TrendReport" — which to ask for

Four export shapes were seen this round, all nominally covering the same underlying VOICE data,
with meaningfully different usability:

| Export | Shape | Use it for |
|---|---|---|
| `TrendReport_YYYY_Detailed.xlsx` | One row per store **per measure** (`Measure` column), months as columns, Score only | **Preferred.** Cleanest to parse, no 1/2 ambiguity, real monthly data per store for every measure except EAD (suppressed regardless of export shape — see above) |
| `TrendReport_YYYY_Summary.xlsx` / unnamed `TrendReport.xlsx` (e.g. the Nov-2026-only one) | District "Combined" block + a repeating 13-row-per-store block, `Score`/`n` column PAIRS per measure | Usable, but each store's block has to be located by scanning column A for a `"NNNNN - NAME"` row and reading the next N month rows — more parsing surface area than Detailed for the same data |
| `FullScale_Report.xlsx` (`Data Only` sheet) | One row per store, ONE aggregate period (e.g. Jan–Oct) per measure, ambiguous `n, 1, 2` or `n, 5, 4, 3, 2, 1` sub-columns | Use only when a single-period aggregate is enough and a Detailed/Summary export isn't available; always resolve the 1-vs-2 or 5/4-vs-other column question against a second export before trusting a number from this one alone |

**When asking the owner for a future pull, ask for the `_Detailed` shape by name if possible** —
it's the only one of the four with zero ambiguous columns and real per-store monthly granularity
for every measure that supports it.

## Standing takeaway

Every ambiguous-column metric in this file (B2B, EAD) was wrong on the first pass and only caught
because a second, independently-shaped export existed to cross-check against — never because the
number "looked right." Before shipping a metric read off a `1/2` or unlabeled-column export,
either find a second export that labels the same measure unambiguously, or flag the polarity as
unconfirmed rather than guessing from the metric's name.
