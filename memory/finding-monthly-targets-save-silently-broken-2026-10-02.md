---
name: finding-monthly-targets-save-silently-broken-2026-10-02
description: Every monthly-targets upload has been silently failing to save to Supabase since dispatch #164's labor_pct/fob_bonus_base_pct migration shipped in code but was never actually run against production -- the exact "SQL patch written, not run" pattern. Owner reported October's upload "succeeded" but didn't show; root cause found by downloading and replaying the owner's actual uploaded file.
metadata:
  node_type: memory
  type: finding
---

# monthly_targets saves have been silently failing since dispatch #164 (2026-10-02)

## What the owner reported

Uploaded October's monthly-targets/projections workbook. The app acknowledged the upload as
successful. The October numbers never showed up anywhere that reads `monthly_targets`.

## What was measured, in order

1. **Live Supabase query, `monthly_targets` where year=2026/month=10: zero rows.** Newest
   month on file was September. Not a client-side cache/scope-filter illusion — the write
   genuinely never reached the table.
2. **Found the real uploaded file.** Every manual upload is archived to the `reports` storage
   bucket (`pending_reports` table tracks it, `uploadReportFile()` in `src/lib/supabase.js`).
   Most recent manual upload: `"October 2026 - Restaurant Projections - Multi Layout - v4 -
   Revised for Holdenville and Pauls Valley.xlsm"`, uploaded 2026-10-02T15:01:43Z. Downloaded
   it directly from storage with the service-role key.
3. **Ran it through the real parsers, standalone (no browser needed).** `detectType()` →
   `'projections'`, correctly. Filename year/month detection → `{year:2026, month:10}`,
   correctly — **the filename-detection theory was wrong.** `parseMonthlyTargets()` →
   27 real stores with sane, complete target values (confirmed by eyeballing: e.g. 3708
   tCrewLabor 0.215, tProdSales 359479 — nothing garbled).
4. **Replayed the EXACT upsert `saveMonthlyTargets()` would send**, with the real-service-role
   key, against the live table: `HTTP 400 PGRST204 "Could not find the 'fob_bonus_base_pct'
   column of 'monthly_targets' in the schema cache"`. Removed that field, tried again: same
   error for `labor_pct`. Direct `select labor_pct` against the live table: Postgres `42703
   "column monthly_targets.labor_pct does not exist"`.

## The real root cause

**`supabase/schema-monthly-targets-labor-fobbonus.sql` (dispatch #164's migration, adding
nullable `labor_pct`/`fob_bonus_base_pct` columns) was written and the application code built
against it — `saveMonthlyTargets()`/`loadMonthlyTargets()`/`loadAllMonthlyTargets()` all
reference both columns unconditionally — but the migration was never actually run against the
live database.** This is the exact "SQL patch written, not run" pattern CLAUDE.md already
documents for `forecast_snapshots`/`qsr_daily_activity_rollup`.

Because `saveMonthlyTargets()` sends every row's full field set in ONE batch `upsert()` call,
PostgREST rejects the WHOLE batch the instant any row references a column the schema doesn't
have — so **every single monthly-targets upload since dispatch #164's code shipped has been
failing outright, for every store, not just October's.** The only place this ever showed was a
`console.error` nobody was watching; the client-side parse succeeds, the upload summary and the
generic "✓ ... loaded" toast both reported success with zero connection to whether the write
actually landed.

⚠️ **Correction (2026-10-02, same day): August and September were NOT affected — checked
properly and the claim above that September had no real save was wrong.** The first check of
September only pulled the top 5 rows by `updated_at`, and all 34 of that month's rows (27 real
+ 7 junk, see below) share one identical timestamp — the query just happened to surface junk
rows first. Re-queried the full month: **both August and September have real, complete
27-store data** (`sales_proj` etc. populated and sane for every real store, e.g. loc 3708:
Aug 322,757 → Sep 314,036 → Oct 359,479 — a believable trend, not garbage). Both predate
dispatch #164's code shipping, so neither upload ever sent the two now-missing columns and
neither ever hit the broken schema. **October was the only broken month; nothing else needs
re-uploading.**

## Fix required (DB-side — needs the owner, no exec_sql RPC or DATABASE_URL available)

```sql
alter table public.monthly_targets
  add column if not exists labor_pct         float,
  add column if not exists fob_bonus_base_pct float;
```

This is `supabase/schema-monthly-targets-labor-fobbonus.sql` verbatim — purely additive, two
nullable columns, no data migration, no change to any existing row. Run it once in the Supabase
SQL Editor. Confirmed absent (again) in this session: no `DATABASE_URL`/direct Postgres
connection, no `exec_sql`-style RPC — same situation every prior schema-*.sql in this repo's
history has hit (`src/app/changelog/5.147.js`, `5.304.js`, `supabase/schema-weekly-count-day.sql`'s
own comment). An agent session cannot run DDL here; this has to be the owner, every time.

**Once that's run, the real October data is ready to insert directly** — already parsed from
the owner's actual file, filtered to this org's own 27 stores (see next section), service-role
insert is a two-minute follow-up, no re-upload needed from the owner.

## Secondary bug found and fixed in the same pass (code-side, shipped)

The real uploaded file is a **multi-operator "Multi Layout" workbook** — its Restaurant column
also carries OTHER operators' store numbers alongside this org's own 27. `parseMonthlyTargets()`
had no org-scoping, so 7 foreign/junk rows (`1291, 2010, 2370, 2510, 2920, 16392, 17750` — no
real target fields, just column drift) were landing in `ds.monthlyTargets` and would have been
upserted into `monthly_targets` right alongside the real 27 stores, exactly matching what's
already sitting in the table for month=8/month=9 (the same 7 loc values, `sales_proj: null`).

Fixed: `mergeDS`'s `'projections'` branch (`src/engine/pipeline.js`) now filters
`parseMonthlyTargets()`'s output down to `DEFAULT_TARGETS`' own keys before merging into
`ds.monthlyTargets` or saving — the exact precedent `applyProjectionsToTargets` already sets a
few lines above it (`if(!DEFAULT_TARGETS[r.loc]) return;`). Single-org tool; a foreign
operator's row has no business in `monthly_targets`.

## Tertiary robustness/visibility fix, also shipped (did not cause this incident, but closes a real gap)

Not what broke this specific upload (filename detection worked fine here) — but reading
`mergeDS`'s year/month detection while diagnosing this surfaced a real gap: it depended
entirely on the filename, with no sheet-content fallback, and its failure path was a
`console.warn` nobody would ever see.

- `mergeDS` now also tries the sheet's own title rows (text above the data header) as a
  fallback, since these workbooks often carry a title like "Restaurant Projections - October
  2026" that would survive a filename rename (e.g. a browser re-download's "(1)" suffix).
- Broadened the numeric filename pattern to also accept `.` as a separator (`10.2026`, not
  just `10-2026`/`10/2026`).
- When detection still fails on a file that parsed real target rows, `mergeDS` now sets
  `ds._monthlyTargetsUndetected`, which `App.js`'s `handleFiles` turns into a visible `saveErr`
  on the Upload Summary modal (the same red "⚠ Parsed, but NOT saved to the cloud" box
  VOICE Daypart already uses) — so a future miss of this kind can never again look like a
  silent success.

22 + 8 new tests total across `src/__tests__/dispatch-monthly-targets-period-detection-
2026-10-02.test.js`, covering all three fixes, built directly from the real incident (not
invented fixtures) wherever practical.

## Resolution (2026-10-02, same day)

- Owner ran the `ALTER TABLE` above; confirmed live (`select labor_pct` now returns `200`
  instead of Postgres `42703`).
- Inserted the real October data directly (the 27-store rows already parsed from the owner's
  actual uploaded file, filtered to this org's own stores) — confirmed live via a fresh query:
  27 rows, no re-upload needed from the owner.
- Checked August and September properly (see the correction above): both already had real,
  complete 27-store data and needed no action.
- The 7 junk rows (`1291, 2010, 2370, 2510, 2920, 16392, 17750`) still sit in August's and
  September's `monthly_targets` rows — harmless (nothing in the app reads those store
  numbers), left in place pending the owner's call on whether to clean them up. October's
  insert did not include them (filtered at parse time by the code fix above).
