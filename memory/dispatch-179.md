# Dispatch #179 — Item Journey: widen the raw-item forensic pull from top-20 to top-50 WRINs/store

## Owner context (2026-08-27, EOM inventory-count audit)

Item #4 from a PM-run audit: `scripts/qsrsoft-variance-pull.mjs` caps the per-WRIN forensic
detail pull (`raw_detail/{id}` — the transaction-by-transaction history that feeds the Diagnose
count-timing drill-down) at the top ~20 highest-|$|-variance WRINs per store, comment: *"only for
actionable WRINs (|\$| >= 50, has an itemId), top ~20 by |\$| to bound request volume."* Owner:
*"let's go ahead and pull more than the top 20 maybe the top 50."*

## Task

1. In the `actionable` selection (the `.filter(...).sort(...).slice(0, 20)` chain building the
   list of WRINs to fetch full detail for), change the cap from 20 to 50.
2. **Measure the actual impact before shipping, don't just change the number** — the existing
   comment explicitly frames this cap as bounding REQUEST VOLUME (rate-limit/runtime concern), not
   an arbitrary UX choice. Time (or otherwise measure) how long the `raw_detail` fetch loop
   currently takes per store at 20, and estimate/measure the same at 50 (2.5x the requests) across
   all ~27 stores. If this endpoint has any observed rate limiting or the full-run time grows
   enough to risk the pull script's own timeout/schedule window, say so explicitly and propose a
   number that's safe (50 if safe, something between 20-50 if not, with the reasoning shown) —
   don't ship a change that could make the scheduled pull start failing or timing out two days
   before the count.
3. Check whether any downstream consumer of `qsr_raw_item_detail` (the Diagnose panel, item-journey
   drill-down, or dispatch #178's Lead B if that dispatch is also in flight) has an assumption
   baked in about "top 20" specifically (a hardcoded label, a UI hint) that should be updated to
   say "top 50" instead — grep for the literal string before assuming there's nothing to change.

## Verification

- Before/after timing measurement for the `raw_detail` fetch loop (or per-store average), reported
  in the PR body — this is the actual risk this dispatch could introduce, so show the number, don't
  just assert "should be fine."
- Confirm the existing `|$| >= 50` actionability filter and `hasItemId` requirement are unchanged —
  only the `.slice()` bound moves.
- Standard suite + build (this script isn't covered by the Vitest suite directly since it's a
  Node/Playwright pull script, but confirm nothing else broke and any script-level smoke test that
  does exist still passes).

## Out of scope

- The `fob-components`/`purchases-posted`/inventory-summary-automation dispatches (#176/#177/#178)
  — unrelated.
- Any other cap or limit elsewhere in this or other pull scripts — this is the one named line only.
