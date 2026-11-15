---
name: finding-register-audit-loc-padding-2026-11-15
description: "Owner-reported: Register Audit tab for Chipley-St Rd 77 showed 'no data in this week' and claimed only 589 rows on file through 2026-06-30, despite v5.779/v5.781 (GH #1314) having restored the pull two days earlier. Root cause: the restored pull writes loc NSN-zero-padded; loadAuditRows()/loadAuditRowsWindow() never stripped it, so every padded row (27/27 stores, 61,623 rows, the only ones with data past June) was invisible, and the backfill re-pulled 2026-03-01 onward under the new format, creating 21,929 exact-duplicate rows alongside the stale unpadded originals. Fixed both loaders; data-fix SQL written for the owner to run."
metadata:
  node_type: memory
  type: finding
scope: tenant
sensitivity: open
---

# Register Audit: loc-padding mismatch hid the restored pull's data, and duplicated history (2026-11-15)

## What the owner saw

Chipley-St Rd 77 (loc 6178)'s Register Audit tab: "This store has 589 Register Audit rows on
file, spanning Mar 1, 2026 — Jun 30, 2026, but none fall inside 'This Week'." Two days after
v5.779/v5.781 (GH #1314) explicitly claimed to have restored this pull after a ~2-month outage —
so either that fix didn't actually land, or something else was hiding its output. Measured
directly (Supabase Management API, service-role) before touching anything, per this repo's own
"measure it, don't reason about it" rule.

## What was actually in the table

```sql
select loc, count(*) n, min(date) min_d, max(date) max_d from audit_rows
where loc in ('6178','0006178') group by loc;
-- '0006178' | 1754 | 2026-03-01 | 2026-11-13   <- real, current data
-- '6178'    |  589 | 2026-03-01 | 2026-06-30   <- stale legacy copy
```

The restored pull genuinely works — `0006178` has rows through yesterday. The fix landed fine.
The problem is entirely client-side: `loc` is stored two different ways for the SAME physical
store, and every reader of this table compares against `STORE_NAMES`' unpadded keys with a bare
`===`.

## Root cause

`scripts/qsrsoft-register-audit-pull.mjs`'s `mapRow()` writes `loc: nsn7(r.storeNum)` —
NSN-zero-padded to 7 characters, matching `qsr_daily_activity`/`qsr_fob`'s own convention. This
table's much older rows (pre-outage, frozen at 2026-06-30 by construction — that's when the old
pull script's endpoint died) were written unpadded by whatever earlier version of the script ran
back then.

`src/lib/supabase.js`'s `loadAuditRows()` (the eager, 400-day loader feeding `ds.auditRows`) and
`loadAuditRowsWindow()` (the all-stores drill-down loader) both passed `r.loc` through raw, with
no normalization — unlike every OTHER zero-padded-source loader in this file
(`loadHmeDtRows`/`loadSquadleChecklistRecords`, `dispatch-hme-squadle-loc-padding-2026-11-13.test.js`;
`loadQsrSecurityEventsForSubject`). `store-analytics.js`'s `RegisterAuditTab` then does
`ds.auditRows.filter(r => r.loc === loc)` against `STORE_NAMES`' bare, unpadded `loc` — so every
padded row (all of the real, current data) silently never matched, and the panel could only ever
see the stale `'6178'` rows frozen at June 30.

## The compounding problem: 21,929 real duplicate rows, not just an invisibility bug

Because `loc` differs in format between the two eras, the pull script's own upsert
(`onConflict: 'loc,date,emp,register_type'`) never recognized the restored pull's 2026-03-01
backfill as "the same row" as the pre-outage unpadded data — it wrote a second, padded copy of
the identical historical period instead of overwriting the original. Measured:

- 27 of 27 stores have both an unpadded and a padded `loc`.
- 21,929 unpadded rows exist, every one with an exact-matching padded counterpart (0 orphans,
  confirmed via an anti-join) — not a coincidence, a real duplicate of the same data.
- A direct value spot-check (10 rows) showed identical `drawer_sales` between the two copies.

So this was never going to be fixed by the read-side normalization alone — once normalized, EVERY
store would double-count sales/audit figures for the overlapping Mar–Jun window unless the stale
copy is also removed.

## What shipped

- `src/lib/supabase.js` — `loadAuditRows()` and `loadAuditRowsWindow()` now strip the padding
  (`String(parseInt(r.loc, 10))`), same pattern as the three loaders above.
- `src/__tests__/dispatch-register-audit-loc-padding-2026-11-15.test.js` — 3 tests, both loaders,
  confirming a padded DB row normalizes and an already-unpadded legacy row is left alone.
- `supabase/data-fix-audit-rows-unpadded-dupes-2026-11-15.sql` — **for the owner to run**: deletes
  every remaining unpadded row (`loc !~ '^0[0-9]{6}$'`), proven lossless by the 0-orphans
  measurement above. The padded rows (the real, current data) are untouched.

## Separate, related fix shipped in the same pass: the top-bar layout glitch

The owner also reported the top menu bar "acting up again" — a long `⚠ DATA INCOMPLETE` banner
message (the SAME background-load-failure banner firing for `audit_rows`/
`squadle_checklist_records`/`graded_visits`/`lifelenz_payroll_readiness`, all 500ing in his
console at the same time) had no `flexWrap`, and neither `html` nor `body` had ever had
`overflow-x` constrained — so a long failure-source list forced the ENTIRE PAGE to scroll
sideways instead of wrapping onto a second line, squishing the topbar's own (correctly
`overflowX:'auto'`-contained) right-action-group into what looked like a broken nested scrollbar.
Fixed: `html,body{overflow-x:hidden}` (meridian.css) as the page-level safety net every
`overflowX:'auto'` container was always implicitly assuming existed, plus `flexWrap:'wrap'` on
`DataErrorBanner` itself (shell.js) so the message wraps instead of ever needing that net.

## Still open, separate from this fix

The underlying intermittent 500s themselves (`audit_rows`, `squadle_checklist_records`,
`graded_visits`, `lifelenz_payroll_readiness` all failing in the owner's live console within the
same minute) were NOT root-caused this pass — `pg_stat_activity` showed no blocking/stuck queries
at the time of checking, and the Supabase project reports `ACTIVE_HEALTHY`, so this did not look
like a database-level outage at the moment measured. Could be a transient login-time burst
against the REST/PostgREST layer specifically (my own diagnosis queries all went through the
Management API, which bypasses PostgREST+RLS entirely, so a PostgREST-specific or
connection-pool-specific issue wouldn't show up in `pg_stat_activity` the same way). Flagged, not
fixed — if it recurs after a hard refresh, that's the next thing to dig into, with browser-console
network traces as the next piece of evidence.
