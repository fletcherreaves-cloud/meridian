# Finding: `security_findings_latest` broke again as the table grew — materialized it

**2026-11-10, owner-reported live from phone:** Security panel (Cash domain, all locations, all
dates) showed a red "⚠ DATA INCOMPLETE — 10 page(s) failed to load across 1 source(s): security
findings (security_findings_latest). Figures from this source are UNDERSTATED — reload before
acting on them." banner, and "No findings match the current filters." underneath it.

## This is the same bug class as the 2026-10-12/10-14 dispatch, recurring because the table kept growing

`src/lib/supabase.js`'s `loadSecurityFindings()` already carries four rounds of hard-won tuning
against this exact view (see its own inline comment history) — the last one (2026-10-14 Part 3)
measured a real RLS session walking the full table sequentially (`maxInflight:1`, `pageSize:1000`)
at 21/21 pages succeeding, max single page 6.2s, comfortably under the ~8s Postgres statement
timeout. That fix was correct **for a 20,793-row table**. It was never going to stay correct
forever, and the view's own 2026-09-09 comment already said so: *"a real DB-side fix (materializing
this view instead of computing it live under RLS on every call) would fix the ROOT cost instead of
working around it, but is future work."*

## Measured today, live, service-role (a floor — real RLS costs more per row per the 2026-10-14 finding)

| What | Then (2026-10-14) | Now (2026-11-10) |
|---|---|---|
| `security_findings` row count | 20,793 | **242,074** (11.6x) |
| `security_findings_latest` row count | ~20,793-ish (dedup) | 22,934 (dedup stays ~flat — same subjects/rules, just more daily snapshots) |
| View, deepest page (offset ~22k) | not separately isolated | **7.78s** — at the statement-timeout edge |
| Base table, filtered query w/ loader's own ORDER BY | n/a | **8.27s — timed out (57014)** |
| Same base-table query, NO order clause | n/a | 1.6s, 149,418 real matching rows |

The last row is the key evidence the "no findings" the owner saw was **not a real empty result** —
it's a UI casualty of failed page loads. Real CASH findings exist in volume; the ORDER BY clause
(needed for stable pagination, not for any UI semantic — `groupFindingsBySubject()` already
re-sorts internally per the loader's own comment) is what's forcing an expensive sort/materialize
over a base table that's now 11.6x bigger than when this ordering was last tuned.

Growth driver: `security-rules-run.mjs` writes one fresh `security_findings` row per subject+rule
**every single day the batch runs**, flagged or not (~9,000 rows/day measured). This has no
ceiling as long as the batch keeps running — unlike most of this app's growing tables, bounding by
`window_end` doesn't help here, since `window_end` is always "recent" by construction (rolling
windows ending today) — the whole table's date range so far is only 2026-08-20 to 2026-11-30, so
*any* reasonable date floor still includes ~100% of the rows today.

## Fix: `security_findings_latest` is now a real materialized view

`supabase/schema-security-findings-latest-materialized-2026-11-10.sql`:
- `security_findings_latest_mv` — the same `DISTINCT ON` query, computed once per refresh instead
  of on every page request. Read cost now scales with the ~23k-row *output*, not the growing
  242k+-row input.
- A unique index on `(tenant_id, loc, subject_key, rule_id)` so refreshes can run
  `CONCURRENTLY` — readers never see the view go empty/locked during a refresh.
- The MV itself is locked down (`revoke all ... from public, anon, authenticated`) — materialized
  views can't carry RLS policies in Postgres at all, so it's never exposed directly.
- A thin wrapper `VIEW`, kept at the **same name** `security_findings_latest` the app already
  reads from, re-applies the exact predicate `"security_findings: gated read"`
  (`schema-security-gm-role-fix-2026-10-28.sql`) already enforces on the base table. Same
  tenant_id check, same `admin`/`owner`/`area_supervisor`-always + `manager`/`gm`-gated-by-
  `org_config` branch, same `get_my_role()` helper. **This is an RLS-equivalent wrapper, not a
  relaxation** — a reader who couldn't see a row on the base table still can't see it here.
- `refresh_security_findings_latest()` — a `SECURITY DEFINER` RPC, `service_role`-only, so
  `scripts/security-rules-run.mjs` can refresh the MV at the end of every daily batch run without
  needing direct DDL rights at runtime.

**`scripts/security-rules-run.mjs`** now calls that RPC once, right before its final log line.
Non-fatal — a refresh failure logs loudly but never fails the batch run or its findings.

**Zero app-code change required** — `loadSecurityFindings()` keeps reading from
`security_findings_latest` by the same name; it has no idea the thing behind that name changed
from a live view to a materialized one.

## ⚠️ NOT YET LIVE

This environment has no DDL-execution path (confirmed directly: `SUPABASE_SERVICE_ROLE_KEY` is a
PostgREST API key, not a Postgres connection string — no `DATABASE_URL`/`POSTGRES_URL` present).
The owner needs to run `schema-security-findings-latest-materialized-2026-11-10.sql` by hand in
the Supabase SQL editor. Until then, nothing changes — the existing plain view keeps behaving
exactly as it does today (including the intermittent failures this file documents), since the
migration's own first line (`drop view if exists`) only runs once applied.

## What this does NOT fix

The underlying table (`security_findings`) still grows ~9,000 rows/day forever with no retention
policy. The materialized view decouples *read* cost from that growth, but doesn't address *write*
volume or storage growth — if that becomes a real problem (it is not one yet: 242k rows is small
for Postgres), the next step would be either an archival/pruning policy on `security_findings`
itself, or writing only on genuine change instead of one row per subject+rule every day
regardless. Not attempted here — out of scope for an availability fix, and a write-side change
like that is a real product decision (does the panel's own history/trend classification still work
correctly against a sparser table?), not something to default into unasked.
