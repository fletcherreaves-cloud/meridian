---
name: project-qsrsoft-controls-endpoint
description: Discovered QSRSoft eBOS "storewide_controls" endpoint (2026-07-26) — per-store controls/loss-prevention config, threshold data, discount setup, and user-defined metric thresholds. High reuse value for the Controls registry + auto-configuring thresholds instead of hard-coding. NOT the On-Hand/EOM endpoint.
metadata:
  node_type: memory
  type: project
---

# QSRSoft eBOS — Storewide Controls endpoint (captured 2026-07-26)

⚠️ **The capture that revealed this also contained a live `x-auth-token` JWT — NEVER commit
that token anywhere. Auth for this endpoint uses the same token→Playwright ladder as the other
QSRSoft pulls (`QSRSOFT_TOKEN` secret / eBOS SSO exchange).**

## Endpoint
```
GET https://prod.ebos.qsrsoft.com/api/controls/{nsn}/storewide_controls
```
- **Per-store** (nsn in path, e.g. `3708`). Same host as the eBOS purchases ledger
  (`scripts/qsrsoft-ebos-pull.mjs`) → reuse that script's eBOS auth (SSO `token/ebosByOrg` or Playwright).
- Headers: `x-auth-token`, `x-current-nsn: {nsn}`, `origin/referer: https://v3.myqsrsoft.com`.
- Returns a rich JSON **config** object (not time-series) — pull occasionally (config changes rarely),
  not daily.

## What's in it (why it's valuable)
- **`RFMControls`** — the loss-prevention threshold source of truth, per store:
  - **T-Red thresholds:** `tred_before_total_amount` (100), `tred_after_total_amount` (120),
    `tred_after_total_quantity` (100) → these are exactly the T-Reds Before/After metrics already in
    the Signal registry. Today those thresholds are assumed; this endpoint gives the **real per-store values.**
  - **`halo_amount`/`halo_quantity`** (50 / 15), **`skim_amount_limit`** (9000), **`skim_time_limit`** (200),
    **`petty_cash_limit`** (500), **`auth_not_available_limit`** (25), **`CashlessSignLimit`** (9999).
  - **`discount_data`** — the store's discount %s by type: Customer 20%, Employee Meal 50%, Manager Meal
    100%, Police 50% (with tax option). Directly relevant to Emp/Mgr-Meals FOB component + promo/discount ROI.
  - **`active_taxes`** — full tax table + breakpoints (e.g. "3708 OK 9.125").
  - Daypart windows: `sob_daily_start_time`/`eob_daily_end_time` (breakfast/SOB/EOB times) — real
    per-store daypart boundaries (useful for the CSAT daypart work + labor).
- **`VarianceControls`** — `max_drawer_cash_over_short_limit` (100), `invoice_price_pct`/`invoice_qty_amt`, promo/discount/coupon flags.
- **`CashControls`** — `max_drawer_cash`, `max_storewide_cash` (the SWC metric threshold).
- **`UserDefinedMetrics`** — per-store metric thresholds the owner set in QSRSoft:
  DTDA 150, DTPH 150, KVST 60, SSPO 85, STV 1.25, SWC 50 (+ `AdditionalMetrics: "SWC, KVST, CRF, CLR, PRO"`).
  → could **auto-populate DEFAULT_TARGETS / metric thresholds** instead of hard-coding.
- `SafeCountControls`, `DrawerBanks`, `SpareDrawers`, `DepositSettings` (armored car, smart safes),
  `store_busn_dt`, `timezone`.

## Candidate uses (backlog — not the EOM priority)
1. **Feed real T-Red / HALO / skim / cash thresholds into the Signals Controls registry** (replace assumed limits).
2. **Auto-configure per-store metric thresholds** (UserDefinedMetrics → DEFAULT_TARGETS) rather than hard-coding.
3. Wire discount %s + daypart windows into FOB (Emp/Mgr meals) and CSAT-daypart work.
→ Would be a small `scripts/qsrsoft-controls-pull.mjs` (clone eBOS auth) → new `qsr_store_controls` table
  (jsonb config per loc, refreshed weekly). Log here when built.
