# Scoping — port the caseSz fix into SAGE's `query_eom_recount_impact` tool

**Status:** scoped, not started. Owner-requested follow-up after v5.288 (Count Swings report,
`caseSz` fix, product reconstruction) — see that PR (#993) for the client-side history.

## What v5.288 fixed, client-side only

`qsr_raw_item_detail` (the raw count ledger) has **no case-size column at all** — `.caseSz` was
always `undefined` for anything built from it. The real value (`case_qty`) lives in the separate
`qsr_raw_item_info` table (dispatch #184's recipe/BOM pull). v5.288 added a client loader
(`loadQsrRawItemInfo()`, `src/lib/supabase.js`) and merged it onto `rawByLoc` in
`src/views/eom-dashboard.js` (`rawInfoByLoc`), so every case-formatted display in that file now
shows real cases.

## Why `sage-chat` was NOT touched (measured, not assumed)

Checked directly against `supabase/functions/sage-chat/index.ts`: it reads `qsr_raw_item_detail`
in its `query_eom_recount_impact` tool (line ~667, same table, correctly — SAGE explicitly mirrors
the Change Monitor engine for this exact reason) but **never references `caseSz`, `case_qty`, or
`qsr_raw_item_info` anywhere in the file** (grep confirmed, whole-file). Its item output (lines
~698, ~709-713, ~734) is dollar/unit-only: `baseVar`, `curVar`, `dMag`, `verdict`, `nRecounts` —
no case-converted quantity ever leaves this tool. So the v5.288 fix had nothing to port; a redeploy
of `sage-chat` as it stands today is a no-op for this specific gap (confirmed to the owner
2026-08-31 before this doc was written).

## The actual follow-up, if wanted

Give `query_eom_recount_impact`'s item output a case-formatted quantity alongside the existing
dollar figures, so a SAGE answer can say "≈2.00 cases short" the same way the in-app Count Swings
report now does, instead of only a raw unit/dollar number.

1. **Pull `qsr_raw_item_info` alongside `qsr_raw_item_detail`** in the same tool handler (~line
   660-680) — one more `sb.from('qsr_raw_item_info').select('loc,full_wrin,case_qty').eq(...)`
   call, scoped to the same `locs` the recount-detail query already uses. `qsr_raw_item_info` has
   no `period` column (point-in-time, per dispatch #184), so this is an unconditional per-store
   pull, not period-scoped like the detail query.
2. **Build a `caseQtyByLocWrin` map** (mirrors `rawInfoByLoc` client-side) and thread it onto each
   item before it's pushed into `diff.stores[].items` (~line 734) and the top-5 output (~line
   709-713) — e.g. `case_qty: caseQtyByLocWrin[loc]?.[wrin] ?? null` alongside the existing
   `dMag`/`base_variance`/`final_variance` fields, and a derived `implied_cases` when both
   `case_qty` and a unit variance are available. **Unit variance isn't currently in this tool's
   item shape at all** (only `$` variance, via `baseVar`/`curVar`/`dMag`) — check whether
   `ledgerScopeDiff`/`ledgerBaselineDiff` already carry a unit-variance field on each item (they
   likely do, since the $ figures are derived from unit × cost) before assuming a new field is
   needed upstream.
3. **System-prompt note** (near the tool's existing description, line ~209) so SAGE actually reads
   and uses the new field in its prose rather than silently ignoring it — the existing pattern for
   every other tool field in this file.
4. **Needs a `sage-chat` redeploy** once this lands (this is the point at which redeploying would
   actually do something for this feature — not before).

## Out of scope for this doc

- The soft-drink yield rollup (separate owner ask, same session, own scoping/build) — no overlap
  with this one beyond both touching EOM inventory data.
- Any change to the client-side `eom-dashboard.js`/`eom-item-journey.js` caseSz plumbing — that
  part is already shipped (v5.288, PR #993, merged to main).
