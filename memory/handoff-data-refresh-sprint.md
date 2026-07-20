---
name: handoff-data-refresh-sprint
description: Dense handoff from the 2026-07-12 session — data-refresh sprint context, bugs fixed, new tables/pipelines, open T1 queue, gotchas
metadata:
  type: project
---

## Current State (as of 2026-07-12)

**Main is at v4.426.** A "Data-Refresh sprint" (v4.406–v4.426) shipped in a parallel session after this one's v4.404/405 landed. Start a new session by pulling `origin/main` — do NOT work off any `claude/*` auto-branch.

```
git checkout main && git pull origin main
```

---

## What Was Built in the Data-Refresh Sprint (v4.406–v4.426)

### New cloud-first pipeline for emailed QSRSoft CSV reports
- **Script:** `scripts/qsrsoft-email-parse.mjs` (GitHub Action `.github/workflows/qsrsoft-email-parse.yml`, runs 1pm + 4pm CT daily)
- Reads CSVs that the ingest pipeline drops in `qsr-reports` Supabase Storage bucket
- Parses with the same `src/parsers` functions the client uses — zero parser drift
- **New Supabase tables:** `sales_ledger_daily`, `daily_glimpse_daily`, `cash_sheet_daily`
- Previously these lived only in device IDB (parsed client-side on login). Now cloud-fresh on every device.

### At A Glance tiles — freshest-wins logic
- **Digital Sales** ← `sales_ledger_daily` (auto) when no manual upload, or manual data if newer
- **Service (OEPE/KVS)** ← `daily_glimpse_daily`
- **Controls** ← Glimpse + Cash Sheet daily tables
- **Labor %** ← Daily Glimpse
- **FOB** ← `qsr_fob` rows, **dollar-weighted** (Σ food_cost_dollars / Σ prod_net_sales — NOT straight average), showing current MTD as primary + last completed month as reference

### Bugs fixed in this session (now on main)
- **v4.404:** `loadQsrActSummary` in `src/lib/supabase.js` was selecting nonexistent columns (`sales_amount`, `trans_cnt`, `ly_sales_amount`, `ly_trans_cnt`). Correct columns: `product_sales`, `healthy_count`, `unhealthy_count`, `ly_product_sales`, `ly_transactions`.
- **v4.404:** `noData` logic in AtAGlance (`analytics.js` near line 6964) used `||` with `!ds.loaded`, making it always true when no file upload. Fixed to `!ds?.laborRows?.length && !ds?.qsrActSummaryRows?.length`.
- **v4.405:** Added `env(safe-area-inset-top,0px)` to `.hdr` height + padding-top so iPhone notch/Dynamic Island doesn't overlap the top nav in PWA mode. Desktop unaffected (env() = 0). `viewport-fit=cover` was already set.
- **v4.406 (parallel session):** `lifelenz_schedule` table name fixed (was queried as `lifelenz_schedules` — extra 's' — in DataManagerPanel useEffect, so `syncTimes.life` was always null).

### Other sprint fixes
- **Freshness banner** re-anchored to newest date across all auto streams. Root cause: `loadQsrActSummary` was truncating at Supabase's default 1000-row cap — now paginated.
- **Movers strip** on AAG: top sales-vs-LY movers, slowest DT, stores behind LY — cloud-fresh from auto tables.
- **In-app Sync buttons** in Data Manager dispatch GitHub Actions workflows (one per stream). **Intraday DAR** at ~8a/10a/2p CT.
- **OK/FL market pills** fixed: were defaulting all stores to MCDOK (FL pill empty). Now split by `INV_ORG_COORDS.state` (Oklahoma = 20 stores, Florida = 7 stores).
- **Ops Report guard:** refuses period-summary uploads (no daily dates) — daily rows only.
- **PWA cold-start fix (v4.403):** `ds` was initialized as `null`; all Supabase startup loads used `if(!prev) return prev` guard, silently dropping data when IDB was empty. Fixed by initializing `ds` to empty shell in the else/catch branch of `performFullIDBRestore`.

---

## Open T1 Task Queue (as of 2026-07-12)

Run `node scripts/tasks.mjs list --tier=1` to get live state. Open items:

| ID (short) | Title | Priority |
|---|---|---|
| `47683b2f` | Data showing QSRSoft Ops report not loaded — AAG not current | P2 |
| `7f803fa7` | Monthly Projections: fill in results for current month (all locs/groups) | P2 |
| `a6003790` | Monthly Projections: page-break doesn't fit-to-page correctly | P2 |
| `68edc307` | Market Intelligence (weather stopped showing) | P2 |
| `f4583d2b` | DI Compare | P2 |
| `0dba4905` | Fact Reference | P2 |
| `7976132e` | Fact Reference (duplicate entry) | P2 |
| `611d40cc` | Projections weekly view crashes on location expand | P2 |
| `a3fcfe88` | Labor Analytics: missing data in several sections | P2 |
| `b3ee8ccb` | Signals won't close on mobile | P2 |
| `f0592536` | Digital Sales on AAG — rewire to auto data source | P2 |
| `c3c6194c` | Settings sync: audit localStorage-only settings for Supabase migration | P3 |

CLAUDE.md lists these as "Phase-2 bugs": Projections weekly-view crash (`611d40cc`), Signals won't close on mobile (`b3ee8ccb`), Market Intelligence weather stopped showing (`68edc307`).

---

## Architecture — New Tables Added in Sprint

| Table | Source | Written by | Read by |
|---|---|---|---|
| `sales_ledger_daily` | QSRSoft Sales Ledger CSV emails | `qsrsoft-email-parse.mjs` | `loadSalesLedgerDaily()` in supabase.js |
| `daily_glimpse_daily` | QSRSoft Daily Glimpse CSV emails | `qsrsoft-email-parse.mjs` | `loadDailyGlimpseDaily()` |
| `cash_sheet_daily` | QSRSoft Cash Sheet CSV emails | `qsrsoft-email-parse.mjs` | `loadCashSheetDaily()` |
| `qsr_daily_activity` | QSRSoft DAR API (Playwright) | `qsrsoft-dar-pull.mjs` | `loadDailyActivity()`, `loadQsrActSummary()` |
| `qsr_ebos_daily` | QSRSoft eBOS API (Playwright) | `qsrsoft-ebos-pull.mjs` | DataManagerPanel |
| `qsr_fob` | QSRSoft FOB email/pull | existing pipeline | `loadQsrFob()` |

**FOB dollar-weighting convention:** Never average food cost % directly across stores. Always compute `Σ food_cost_dollars / Σ prod_net_sales` to get a meaningful district-level %. This was introduced in v4.426 and applies wherever FOB % is aggregated.

**`qsr_daily_activity` schema:** PK = `(loc, dt, hour_slot)`. `loc` = NSN zero-padded to 7 chars (`0003708` not `3708`). `hour_slot` = `endQtrHourTime` string ("06:00" = 5am–6am block). LY fields: `ly_product_sales`, `ly_transactions` (NOT `ly_sales_amount` / `ly_trans_cnt` — those don't exist).

---

## Gotchas / Dead Ends

### QSRSoft DAR auth
`api.reports.myqsrsoft.com` requires browser session cookies — server-side Node fetch with token alone → 401. Must use Playwright `page.evaluate()` with explicit `X-Auth-Token` header (`credentials: 'include'` does NOT work). One `page.evaluate()` per date, not one evaluate with an internal loop (internal loop hangs with no output).

### Supabase 1000-row default cap
Any `supabase.from(...).select(...)` without explicit range is capped at 1000 rows by default. `loadQsrActSummary` was silently truncating. Fix: use `.range(0, 9999)` or paginate in batches.

### `lifelenz_schedule` vs `lifelenz_schedules`
The table is `lifelenz_schedule` (singular). There is NO `lifelenz_schedules` table. The DataManagerPanel `useEffect` had this wrong for a long time — `syncTimes.life` was always null as a result.

### `ds` null guard pattern
All Supabase startup loads in App.js use: `setDs(prev => { if(!prev) return prev; return {...prev, newKey: data}; })`. If `ds` is null (which it is on fresh PWA / IDB-empty cold start), every load silently drops data. The fix in v4.403 initializes `ds` to an empty shell (`loaded:false`) in the else/catch branch of `performFullIDBRestore` so these guards can pass.

### `env(safe-area-inset-top)` on mobile
Requires `viewport-fit=cover` in the `<meta name="viewport">` tag AND `apple-mobile-web-app-status-bar-style: black-translucent` in meta. Both are already set in `index.html`. The `.hdr` mobile override (`padding: 0 8px !important`) was zeroing out padding-top — now `padding: env(safe-area-inset-top,0px) 8px 0 !important`.

### LifeLenz GraphQL dead end
Do NOT re-investigate `GetPdfReportsBusinessOfficeLocations` — returns location IDs, not schedule IDs. See `memory/lifelenz-session.md`.

### OK/FL store split
Split by `INV_ORG_COORDS.state` value: `"Oklahoma"` (20 stores) → MCDOK org; `"Florida"` (7 stores) → MCDFL. Do NOT use the `loc` prefix or any other heuristic — was causing all stores to land in OK bucket.

### `loadQsrActSummary` correct column mapping
```js
// CORRECT (as of v4.404):
.select('loc,dt,product_sales,healthy_count,unhealthy_count,dt_untilserve,dt_trans_cnt,ly_product_sales,ly_transactions')
// Mapping:
map[key].sales   += r.product_sales || 0;
map[key].gc      += (r.healthy_count||0) + (r.unhealthy_count||0);
map[key].lySales += r.ly_product_sales || 0;
map[key].lyGc    += r.ly_transactions || 0;
```

### Freshest-wins tile logic (AAG)
Manual upload data overrides same-day auto data. Auto data fills gaps since last upload. Do not average or merge — newest wins for each date/loc. Pattern established in v4.406–v4.417 sprint.

---

## Dev Conventions Established

- **Version bump every significant feature:** `v4.xxx` in commit message. Next would be v4.427.
- **Task queue:** `node scripts/tasks.mjs list` / `update <uuid> --status=done --result_summary="..." --result_pr="v4.xxx"`. Mark done same commit it ships.
- **Deploy:** `git push origin main` → Vercel auto-deploys. Always push after commit.
- **No TypeScript.** Plain JS, `// @ts-nocheck` everywhere.
- **New persistent data → Supabase.** Ask before adding anything to IDB/localStorage only.
- **Parser parity rule (new):** Email-pipeline parsers use the same functions as the client (`src/parsers/index.js`). Do not duplicate parser logic in `scripts/`.
- **FOB % always dollar-weighted** when aggregating across stores (see above).
- **`npm run build` must pass clean** before every commit.

---

## Pending User Actions (Blocking Features)

1. **Run `forecast_snapshots` SQL** from `supabase/schema.sql` in the Supabase SQL Editor — still not confirmed done. Blocks forecast accuracy tracking.
2. **GitHub Secrets refresh** if LifeLenz or QSRSoft token expires (both ~monthly): copy `X-Auth-Token` from DevTools Network tab on respective site, update in GitHub repo Secrets.

---

## Files Changed Most in This Session

- `src/meridian.css` — `.hdr` safe-area-inset-top fix; `@keyframes spin` + `.spin` for Data Manager refresh button
- `src/lib/supabase.js` — `loadQsrActSummary` column fix; new load functions for 3 email-report tables
- `src/views/analytics.js` — `noData` logic fix; DataManagerPanel `autoSyncRow` helper + `refreshSource` per source; new AAG tile data wiring (sprint); FOB dollar-weighted rollup (v4.426)
- `src/app/App.js` — startup load IIFE extended for 3 new tables; `performFullIDBRestore` empty-shell init
- `src/parsers/index.js` — parser functions now used both client-side and by `qsrsoft-email-parse.mjs`
- `scripts/qsrsoft-email-parse.mjs` — new: server-side email report parser (GitHub Action)
