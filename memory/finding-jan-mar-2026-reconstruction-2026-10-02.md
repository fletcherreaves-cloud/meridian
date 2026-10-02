---
name: finding-jan-mar-2026-reconstruction-2026-10-02
description: January-March 2026 monthly_targets was missing entirely (earliest real month on file was April 2026). Owner asked for a retroactive, leak-free reconstruction using the forecast engine's own learnings, flagged clearly so it's never mistaken for a real approved target. This documents the methodology, the fields that are strictly leak-free vs template-derived, the store-43701 exclusion, and the one remaining owner action (run a migration) before the 78 rows can be inserted.
metadata:
  node_type: memory
  type: finding
---

# Jan-Mar 2026 monthly_targets reconstruction (2026-10-02)

## What was asked

Owner, mid-session: *"Why don't you come up with forecast/projections for January - Mar of
this year (since they are missing) and retroactively use our applied learnings and knowledge to
populate those months as if the actuals have not yet occurred."* Clarified via AskUserQuestion:
**flag reconstructed rows clearly**, reconstruct the **full target set** (not just sales $), and
keep it **strictly leak-free** (each month uses only data that existed before that month started).

## Why these 3 months were missing

`monthly_targets` had real, complete 27-store data from April 2026 onward but nothing for
Jan/Feb/Mar — those months were simply never uploaded (predates this tool's regular use).

## Methodology — three tiers, by leak-free discipline

1. **Strictly leak-free (direct real data, no hindsight):**
   - `sales_proj` — `forecastDay(loc, date, ds, {mode:'Back Test'}, null, DEFAULT_TARGETS[loc]||{},
     'monthly', 'simple')`, forced to this repo's own measured-best `'simple'` trailing model
     (T3M/T6W/T3W family — see CLAUDE.md's Smart Targets verdict), summed daily across the month.
     `forecastSimple` anchors every window to the START of the target day, so it is leak-free by
     construction — never reads the target day or anything after it.
   - `crew_labor_pct`, `tpph_target`, and all 8 direct FOB/paper percentage fields (`base_food_pct`,
     `disc_coup_pct`, `comp_waste_pct`, `raw_waste_pct`, `condiment_pct`, `emp_food_pct`,
     `stat_loss_pct`, `unex_diff_pct`, `total_food_cost_pct`, `paper_cost_pct`) — trailing
     90-day dollar-weighted actuals, window ending the day BEFORE the target month starts (so
     March's reconstruction never sees January or February's real data, let alone its own
     month). `total_food_cost_pct`/`paper_cost_pct` use the same
     `begin+purchases+adjustments+transfers+promotions-end` P&L inventory-roll formula used
     elsewhere in this codebase.
   - Source data: `labor_rows` (20,211 rows, `report_date>='2024-06-01'`) and `qsr_fob` (22,237
     rows, `date>='2024-06-01'`), both paginated-fetched in full (not a single capped 1000-row page).

2. **Template-derived (NOT leak-free in the strict data sense — flagged as a separate tier):**
   `bonus_crew_pct`, `fob_bonus_base_pct`, `fob_target_pct`, `op_supply_target` are business-POLICY
   choices with no direct historical-actual counterpart to recover. Each is derived from the
   store's OWN average relationship to its base figure, measured from that store's real,
   already-approved April-September 2026 `monthly_targets` rows (203 rows), applied to the
   reconstructed base. This uses later real data as a structural template — explicitly not
   leak-free, called out separately from tier 1.

3. **Excluded entirely:** store **43701 (Ponce de Leon-Hwy 81/I-10)** — opened **2026-03-13**
   (per `constants.js`'s own note: `"OPENED 03/13/26 — very new. 0 valid LY rows."`). It has
   zero `qsr_fob`/`labor_rows` history before 2026-03-01/03-13 respectively. Backfilling a
   "target" for a restaurant before it existed would be fabrication, not reconstruction — the
   forecast engine would have silently produced a plausible-looking fallback number with nothing
   real behind it. The script detects this generically (`hasHistoryBefore(loc)`: any real labor
   row for that loc dated before 2026-01-01), not via a hardcoded loc check, so a future similar
   backfill for a different period re-derives the right exclusion automatically rather than
   trusting this one store number forever.

   **Result: 26 real stores × 3 months = 78 store-months**, not 81.

## Bug found and fixed while building this

`qsr_fob.loc` is **zero-padded to 7 characters** (NSN convention, same as `qsr_daily_activity`
per CLAUDE.md — e.g. `'0003708'`), while `labor_rows.loc`/`STORE_NAMES`/`DEFAULT_TARGETS` keys
are the bare store number (`'3708'`). The script's first pass compared `String(r.loc) === loc`
unpadded against `qsr_fob`, which silently matched zero rows for EVERY store — initially looked
like a store-specific issue (surfaced first on 3708) but was universal. Fixed by padding the
comparison key (`String(loc).padStart(7,'0')`) specifically for the `qsr_fob` filter only
(`labor_rows` needed no padding). Re-verified across all stores after the fix: 0/78 store-months
have zero FOB or labor rows matched (previously all 81 had `_fobRowCount:0`).

## Sanity check (all 78 store-months, post-fix)

All fields land in plausible, tight ranges consistent with real target data elsewhere in this
system — no outliers, no out-of-bounds percentages:

| field | min | max | avg |
|---|---|---|---|
| sales_proj | 159,467 | 662,539 | 328,424 |
| crew_labor_pct | 19.09% | 26.17% | 22.16% |
| base_food_pct | 20.61% | 24.01% | 22.57% |
| total_food_cost_pct | 26.21% | 33.69% | 29.87% |
| tpph_target | 4.39 | 6.53 | 5.56 |

## The "flag them clearly" mechanism

`monthly_targets.updated_by` is `uuid references public.profiles(id)` (schema.sql) — a real-user
FK, not a free-text marker. Repurposing it would misattribute the reconstruction as a person's
edit. Added a dedicated nullable column instead:

- **`supabase/schema-monthly-targets-data-source-flag.sql`** — additive, `data_source text`,
  null = real data.
- **`saveMonthlyTargets()`** (`src/lib/supabase.js`) now explicitly sends `data_source: null` on
  every real upload (so a real upload for a previously-reconstructed month clears the flag), with
  a self-healing retry if the column doesn't exist yet (same shape as `smg_fullscale`'s `n`
  column) — so shipping this code does NOT repeat the dispatch-#164-style "every upload silently
  fails" incident (see `memory/finding-monthly-targets-save-silently-broken-2026-10-02.md`) while
  the migration is still pending.
- **`loadMonthlyTargets()`/`loadAllMonthlyTargets()`** map `data_source` → `_dataSource`.
- **UI** (`MonthlyProjectionsPanel`, `src/views/analytics.js`): a period-level banner —
  "⚠ Reconstructed" when every visible store-month in the selected period carries the flag, "⚠
  Partially Reconstructed" when only some do — plus a small `⚠` badge on each flagged store's row,
  so a mixed real/reconstructed period is never shown as uniformly one or the other.

## ⚠️ Pending owner action (same shape as the labor_pct/fob_bonus_base_pct incident)

**Run `supabase/schema-monthly-targets-data-source-flag.sql` in the Supabase SQL Editor.**
Confirmed absent this session (same as every prior schema-*.sql): no `DATABASE_URL`, no
`exec_sql`-style RPC — an agent session cannot run DDL here, ever; this is the owner's action
every time. Purely additive, one nullable column, zero risk to existing rows.

**Once that's run, insert the 78 reconstructed store-months.** They are already computed and
sanity-checked (see table above) — the insert is a two-minute service-role upsert against
`monthly_targets` with `data_source:'reconstructed_leak_free_2026-10-02'` on each row, no
re-derivation needed, following the exact same "SQL run → insert the already-prepared data"
two-step the October-data incident resolved with. The reconstruction script is
`_tmp_backfill_janmar.mjs` at the repo root during the session that built this (not committed —
per this repo's own convention, standalone diagnostic/backfill scripts live at the repo root only
for `node_modules` resolution and are deleted after use). If a future session needs to redo this,
the methodology above fully reproduces it from `labor_rows`/`qsr_fob`/`monthly_targets`
(2026 rows) via Supabase REST pagination.

## Owner's own caveat

*"I'll reserve the right to edit or modify your projections"* — reconstructed rows are a
starting point for review, not a final answer, which is exactly why the UI flag matters: an
editor needs to be able to tell at a glance which numbers are synthetic.
