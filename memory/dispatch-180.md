# Dispatch #180 — promoAmt/promoPct: finish "API over email" (same shape as #175's cashOS/posOver fix)

## Context

Dispatch #165's audit (`memory/audit-emailed-stream-redundancy-2026-08-27.md`) flagged
`promoAmt`/`promoPct` as "same story as posOver — no API entry despite a 98% field-level match,
and `qsr_cash_sheet.promo_amt` is not even aliased to camelCase in `loadOpsCashSheet` yet.
Flagged, not fixed... a natural next dispatch." Dispatch #175 (this same evening, v5.220) already
shipped the identical fix shape for `posOverAmt`/`posOverCnt`/`cashOSAmt`/`cashOSPct` and
explicitly left `promoAmt`/`promoPct` out of scope. This dispatch closes that last remaining item
from #165's list.

**Confirmed still true, live, before drafting this**: `metric-source.js`'s `promoAmt`/`promoPct`
chains have NO `opsCashRows` source at all (`srcs: [['glimpseRows','promoAmt'],
['ctrlRows','promoAmt']]` and the `promoPct` sibling, both email/manual only). `loadOpsCashSheet`
(`src/lib/supabase.js`) has no `promo_amt`/`promo_pct` aliasing — the `promoAmt: r.promo_amt,
promoPct: r.promo_pct` lines that DO exist in the file belong to `loadCash`/`loadGlimpse` (the
EMAIL loaders), not `loadOpsCashSheet` (the auto/API loader) — confirmed by reading the function
boundaries, not just grepping the field names.

**One wrinkle #175's precedent didn't have**: `qsr_cash_sheet.metrics` carries `promo_amt` and
`promo_qty` (confirmed live in a real row), but NO `promo_pct` field — unlike `cash_over_or_short`
(a precomputed % existed for `cashOSPct`), there's nothing to alias directly for `promoPct`. It
needs to be DERIVED, net-sales-weighted, the same pattern `loadOpsCashSheet` already uses for
`discPct`/`cashOSPct`/`tRedAPct`/`tRedBPct` (e.g. `discPct: (r.net_sales_amt > 0 &&
r.discount_amt != null) ? r.discount_amt / r.net_sales_amt : null`) — not a straight column alias.

## Task

1. `src/lib/supabase.js`'s `loadOpsCashSheet`: add `promoAmt: r.promo_amt != null ?
   Number(r.promo_amt) : null` (straight alias, matching every other `*Amt` field in that
   function) AND `promoPct: (r.net_sales_amt > 0 && r.promo_amt != null) ? r.promo_amt /
   r.net_sales_amt : null` (derived, matching `discPct`'s exact pattern immediately above it).
2. `src/engine/metric-source.js`: add `['opsCashRows', 'promoAmt']`/`['opsCashRows', 'promoPct']`
   as the FIRST source in each chain, ahead of `glimpseRows`/`ctrlRows` — matching the pattern
   dispatch #175 just used for `cashOSAmt`/`cashOSPct`/`posOverAmt`/`posOverCnt`. Keep
   `glimpseRows` and `ctrlRows` in the chain as fallback, don't remove them.
3. Update this repo's loader field map per the standing dev rule:
   `node scripts/gen-loader-emits.mjs --write`.

## Verification

- A reconciliation-style sanity check (not a full re-audit — #165 already measured 97-98% field
  match): a test confirming `promoAmt`/`promoPct` resolve from `ds.opsCashRows` when present,
  falling back to `glimpseRows` then `ctrlRows` per-day when it doesn't cover a given (loc, date)
  — same per-day, not-all-or-nothing precedence as every other chain in this file.
- A regression test confirming an email/manual-only device (no `opsCashRows` at all) still
  resolves both metrics exactly as before.
- `metric-source-order.test.js`/`metric-chains.test.js` still pass (update
  `metric-chains.test.js`'s `opsCashRows` field list if it's generated and picks up the new
  fields automatically — same as dispatch #175's experience).
- Standard suite + build, version bump per convention (check `git log` on `main` for the actual
  latest version — several dispatches landed this session, don't assume the number from context).

## Out of scope

- `empMealAmt`/`mgrMealAmt` — a separate dispatch (#181), which #165's audit explicitly said
  needs its OWN reconciliation test first (unlike promo/posOver, which #165 already measured).
- Any `METRIC_SOURCES` chain not named above.
