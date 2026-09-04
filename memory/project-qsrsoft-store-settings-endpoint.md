---
name: project-qsrsoft-store-settings-endpoint
description: Discovered QSRSoft eBOS "store_settings" endpoint (owner-captured live 2026-09-04) — per-store drawer/safe/instore cash-handling config, inventory settings (yield groups, waste limits), homepage-metric thresholds, and full store hours/dayparts. Distinct endpoint from storewide_controls (qsr_store_controls) — different host, different (overlapping but not duplicate) payload. Automated in the same session it was captured — scripts/qsrsoft-store-settings-pull.mjs / qsr_store_settings table.
metadata:
  node_type: memory
  type: project
---

# QSRSoft eBOS — Store Settings endpoint (captured 2026-09-04)

⚠️ **The capture that revealed this had an EMPTY `x-auth-token` header value (the owner's paste
cut it off before any token appeared) — nothing sensitive was ever in this file. Same auth ladder
as every other eBOS pull applies regardless (`QSRSOFT_EBOS_TOKEN` / eBOS SSO exchange /
`QSRSOFT_USERNAME`+`PASSWORD` Playwright).**

## Endpoint
```
GET https://prod-green.ebos.qsrsoft.com/store_settings/{nsn}/settings?store_busn_dt=YYYY-MM-DD
```
- **Per-store** (nsn in path). **Different host** than every other eBOS pull
  (`prod-green.ebos.qsrsoft.com`, not `prod.ebos.qsrsoft.com`) and **no `/api/` prefix** in the
  path — both are real, captured-as-observed differences, not typos.
- The captured request's own `Origin`/`Referer` was `https://prod.ebos.qsrsoft.com` (**not**
  `v3.myqsrsoft.com`, unlike every other eBOS pull) — the pull script honors this exactly as
  captured rather than reusing the other scripts' origin, since a same-site fetch can be
  origin-sensitive and this wasn't measured against the wrong origin.
- Headers observed: `x-auth-token`, `x-current-nsn`, `x-user-language: en`, `x-local-host: null`
  (a literal string `"null"` — almost certainly a browser artifact of an unset local-storage value,
  not sent by the pull script), plus standard browser fingerprint headers (`sec-ch-ua`, etc.) the
  pull script doesn't replicate, matching every other eBOS pull's minimal-header convention.
- Returns a rich JSON **config** object (not time-series) — pull weekly, not daily, same cadence
  as `qsr_store_controls`.

## ✅ RESOLVED 2026-09-04 — both questions below were live-measured on the first real run, same
day this file was written. **Do not re-raise either as open.**
`workflow_dispatch`-triggered run (https://github.com/fletcherreaves-cloud/meridian/actions/runs/33913094476),
job log actually read (not inferred from the green checkmark, per the "measure it" standing rule):
1. **`store_busn_dt` semantics — today (UTC) works.** Log: `[store-settings] pulling 27 store(s)
   as of 2026-09-04…` followed by `27/27 store(s) saved`, each with the expected `8 top-level
   key(s)`. No date-format error, no empty/different-shaped response. The historical-versioning
   worry (that the endpoint might return settings *as of* a past date rather than current config)
   did not materialize — a current-date `store_busn_dt` returns the current config, matching this
   file's original assumption.
2. **Cross-host auth — confirmed, via the Playwright rung specifically.** The SSO-exchange rung
   didn't return a token this run (expected — QSRSoft's Cognito token is short-lived by
   construction, see CLAUDE.md), so `resolveEbosToken()` fell through to
   `getEbosTokenViaPlaywright()`, which captured a fresh eBOS token from a live browser session.
   That Playwright-minted token **was then accepted by `prod-green.ebos.qsrsoft.com`** — the
   log shows no `AUTH_FAILED` anywhere, all 27 stores saved. This confirms the same-host-family
   auth assumption for at least the Playwright-token path; the SSO-exchange path specifically
   against `prod-green` remains unexercised (it simply didn't get reached this run) but is the
   same code path already proven against `prod.ebos.qsrsoft.com` by every sibling eBOS pull, so
   there is no reason to expect it to behave differently.

`qsr_store_settings` now holds real per-store data for all 27 stores (backfilled the same day the
table's schema was run).

## What's in it (why it's valuable)
- **`drawer`** — starting drawer bank (`settingDrawerAmount` 100 / `settingDrawerCount` 6),
  armored-car/smart-safe/deposit-validation flags, cash-adjustment/refund permission flags,
  `cash_recycler_enabled`.
- **`safe`** — `settingBackupAmount` (1800), `settingPettyCash`, coin-magazine and gift-certificate
  inventory amounts.
- **`instore`** — `settingMaxStorewide` (10) / `settingMaxDrawer` (2) / `settingMaxDrawerOverShort`
  (100) cash limits, promo/discount/coupon % variance thresholds, gift-cert $ / qty variance,
  `settingRequiredNumberDailyDeposits`, `settingDepositValidationsDaysPastDue`.
  **Overlaps but does not duplicate** `qsr_store_controls`' `CashControls`/`VarianceControls` — the
  two endpoints were captured for the same store (3708) same day: `storewide_controls.CashControls.
  max_storewide_cash` was **10** there too (consistent), but `instore.settingMaxDrawer` (2) here has
  no obvious counterpart in the `storewide_controls` capture, and neither does the starting
  drawer-bank amount/count or deposit-validation requirements — genuinely new fields, not a
  re-fetch of the same config under different names.
- **`inventory.statVariance.settingYieldGroups`** — real per-store recipe **yield-band ranges**
  (e.g. "Fries: Y Range 84.9–93.9", "Whole Milk: Y Range 310.00–330.00"), one JSON string covering
  ~30 named groups mapped to WRIN lists. Directly relevant to `qsr_variance_stat`'s own schema
  comment about a planned "yield-band cause overlay" (`supabase/schema.sql`, `qsr_variance_stat`
  section) — **not wired into anything yet**, flagged here as the clearest non-cash follow-on this
  capture unlocks.
- **`inventory.waste`** — `settingWasteHardLimit`/`settingWasteSoftLimit` (100/25), food-donation
  status.
- **`homepageMetrics`** — `OOMetrics`/`GMMetrics` per-role threshold tables (DTPH/STV/SWC for OO;
  DTDA/KVST/SSPO for GM) — a different shape than `storewide_controls.UserDefinedMetrics` (flat,
  no role split) for what's likely overlapping underlying data; not reconciled against it.
- **`storeConfig.storeHours`/`dayParts`** — full per-**channel** (Lobby/Curbside/Delivery/
  DriveThru) **and** per-day-of-week open/close times, and per-day BREAKFAST/LUNCH/DINNER/
  LATENIGHT windows — meaningfully richer than `storewide_controls`' single `sob_daily_start_time`/
  `eob_daily_end_time` pair. Not wired into anything yet (candidate use: CSAT-daypart work,
  channel-specific speed-of-service context).

## What shipped this pass (2026-09-04)
- `scripts/qsrsoft-store-settings-pull.mjs` — weekly (Mondays 13:15 UTC), all 27 stores, raw JSONB
  blob preserved in full (`qsr_store_settings.settings`) plus a flattened cash-handling slice
  (`qsr_store_settings.cash`, via `extractCashSettings()`, `src/engine/store-settings.js`) for the
  owner's stated interest ("cash-control automation").
- `supabase/schema-qsr-store-settings.sql` — new table, mirrors `qsr_store_controls`' RLS/
  tenant_id/JSONB-blob shape exactly.
- Watched in `sync-failure-watch.yml`.

## Deliberately not done this pass
- **No UI wiring.** `extractCashSettings()`'s output isn't surfaced anywhere yet — the natural home
  is probably alongside `qsr_store_controls`' existing Signals "🎛️ Store Controls" tab (v5.328),
  shown side-by-side the same way that tab already displays `storewide_controls` data plainly
  without auto-applying it anywhere. A real follow-on, not started here.
- **Yield groups, waste limits, homepage-metrics-by-role, store hours/dayparts** — all captured in
  the raw `settings` JSONB blob and available to query, but nothing downstream reads them yet. Each
  is its own candidate feature (see "What's in it" above), not bundled into this pass's scope.
- **No reconciliation** between this endpoint's `instore`/`homepageMetrics` and
  `storewide_controls`' `CashControls`/`VarianceControls`/`UserDefinedMetrics` beyond the one
  spot-check above (`max_storewide_cash` = `settingMaxStorewide` = 10, consistent). A systematic
  field-by-field reconciliation across both endpoints, for every store, is real work someone should
  do before treating both as independently trustworthy.
