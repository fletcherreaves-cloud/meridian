# Dispatch #183 — chase the store-clustered emp/mgr-meal gap dispatch #181 left open

## Context

Dispatch #181 (`memory/finding-emp-mgr-meal-reconciliation-2026-08-28.md`) measured
`qsr_cash_sheet`'s emp/mgr meal fields against `audit_rows` (register audit) — 71.3%/67.5% match
overall, but **the mismatch is store-clustered, not random**: some stores (loc 6178, 6838, 37566,
10034, 43701) match to the penny on every sampled day; others (loc 6972, 5183, 5985, 33704, 10915)
are off by a large, persistent amount ($85–$158 mean |diff|) on every sampled day. That dispatch
explicitly named this as a follow-up lead rather than chasing it: *"isolating exactly which side
is wrong, and why only at those stores, would need more investigation than this dispatch's
scope... start by checking whether the high-gap stores share something (higher kiosk/mobile-order
mix, a register-type not present in `audit_rows` for those stores, a POS config difference)."*

This dispatch picks that up. **Not a fix dispatch** — matching #181's own posture, and this
session's established pattern (#172, #177, #178, #181 all show that "investigated further, here's
what's now understood, here's what's still open" is a valid, valuable outcome on its own). Only
touch code if you find and confirm a narrow, specific, correctable cause.

## What to actually do

1. Reproduce #181's own measurement first (`SUPABASE_SERVICE_ROLE_KEY`/`VITE_SUPABASE_URL`, the
   same `audit_rows` vs `qsr_cash_sheet` join on `(loc, date)`, 2026-08-01..08-24, all 27 stores)
   to confirm you're working from the same real 647-store-day population, not a fresh sample that
   only looks similar.
2. Chase the three leads #181 named, in order:
   - **Register-type coverage**: does `audit_rows` cover the same SET of register types
     (`cashier`/`preparer`/`manager`, per #181's own note that all three are present in its
     aggregation) at the high-gap stores as at the clean-match stores? A store missing a register
     type in `audit_rows` (but not in reality) would under-count meals on the audit side, showing
     up exactly as a persistent, store-specific gap.
   - **Channel mix**: do the high-gap stores (6972, 5183, 5985, 33704, 10915) have a meaningfully
     different kiosk/mobile-order/3rd-party-delivery sales mix than the clean-match stores (6178,
     6838, 37566, 10034, 43701)? Pull `qsr_sales_mix`/`sales_ledger_daily` or `cash_sheet_daily`'s
     kiosk/3PO fields for both groups and compare. A channel where meal discounts get applied
     differently (e.g., a kiosk order with an employee discount not flowing into `audit_rows`'
     register-level tracking) would explain a persistent, channel-driven gap.
   - **POS/config difference**: is there anything structurally different about the high-gap
     stores' setup (a different POS terminal count, a different meal-discount button/workflow) —
     check `qsrsoft_kb` for any relevant configuration article, and/or compare a raw sample
     transaction from a high-gap store against a clean-match store if `qsr_raw_item_detail` or
     similar has visibility into meal-discount line items.
3. If one of these (or something else) turns out to be a confirmed, narrow, correctable cause
   (e.g., a specific register type genuinely missing from `audit_rows` for specific stores due to
   a pull-script gap): fix it if it's a Meridian-side bug (a pull script, a parser). If it's a
   genuine QSRSoft-side data/config difference (like #181's own finding that the emailed Glimpse
   report doesn't carry meal columns at all), that's not something to code around — write it up
   and flag as an owner-facing observation instead.
4. If nothing converges on a clear cause: write up what was checked and ruled out, matching #181's
   own rigor. This dispatch's value is in narrowing the search, even without a final answer.

## Verification

- If a fix ships: it must be independently confirmed to close the gap on a real sample (re-run
  the reconciliation measurement post-fix and show the match rate improve for the affected
  stores), plus standard suite + build.
- If no fix ships: the finding write-up is the deliverable.

## Out of scope

- Wiring an `opsCashRows` chain for `empMealAmt`/`mgrMealAmt` — #181 already established this
  doesn't clear the ~90% bar; that verdict stands unless this dispatch's own findings change the
  picture enough to revisit it (unlikely, but not forbidden if you find something that changes the
  numbers substantially).
- `avgCheck` (a separate dispatch, #182 — unrelated metric).
