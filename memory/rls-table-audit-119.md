---
name: rls-table-audit-119
description: Issue #119 — full 82-table RLS audit (authenticated vs service-role row counts). qsr_fob measured healthy (does not currently reproduce the reported bug). Two real, currently-reproducing gaps found and fixed forward: qsr_daily_activity_daily view missing its GRANT, and tenants/tenant_stores had zero RLS policy at all. Repeatable check: scripts/rls-table-audit.mjs.
metadata:
  node_type: memory
  type: project
---

# RLS table-by-table audit (2026-08-10, issue #119)

## Why this exists

The Food Cost panel's period dropdown stopped at May 2026. Root cause was traced to
`loadQsrFob()` (`src/lib/supabase.js:927`) allegedly returning `[]` for the authenticated
role while service-role reads fine. Two prior sessions guessed at why (`61355aa` v4.545,
`c552b33` v4.885) and both left it unconfirmed. The owner green-lit measuring it properly
and widened the task: audit **every** table either RLS migration touches for the same
exposure, using a service-role read as the ground-truth control, enumerated from the
**live** PostgREST API (not `supabase/*.sql` DDL — `scripts/metric-inventory.mjs`'s static
DDL scan already missed 11 loc-keyed tables this exact way).

## Method

`scripts/rls-table-audit.mjs`:
1. Mints a short-lived authenticated session for the owner's real account via the Supabase
   Admin API (`/auth/v1/admin/generate_link` + following the verify redirect for the token
   fragment) — no interactive login, no owner-in-the-loop needed, safe to re-run any time.
2. Enumerates every live table from `GET /rest/v1/` (PostgREST's own OpenAPI root) — 82
   tables as of 2026-08-10, not whatever a grep of committed `.sql` files would suggest.
3. For each table, reads `count=exact` as the authenticated role and as service-role
   (bypasses RLS) with a 1-row `select=*&limit=1` request, and classifies:
   `OK` (counts match, including both-zero) / `RLS-FILTERED` (service sees rows,
   authenticated sees fewer or none) / `ERROR` (the read itself failed — a permission
   bug, not a visibility gap).

Run it: `node scripts/rls-table-audit.mjs` (needs `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in the environment).

## Results (2026-08-10, full run against production)

82 tables checked. 79 `OK` (49 with real data, 30 legitimately empty). 3 flagged:

| Table | Auth | Service | Verdict |
|---|---|---|---|
| `qsr_daily_activity_daily` | permission denied | 15,421 | ERROR |
| `tenant_stores` | 0 | 27 | RLS-FILTERED |
| `tenants` | 0 | 1 | RLS-FILTERED |

**`qsr_fob` itself measured `OK`** — 24,156 rows both sides, dates run through today
(2026-08-10), `tenant_id` matches the caller's `current_tenant_id()`, `my_locs()` returns
`NULL` (unrestricted) for the owner's profile. The originally-reported symptom (dropdown
stuck at May) **does not currently reproduce** via direct measurement. Whatever caused it
either predates this check or was already resolved by an untracked manual change — the SQL
files in `supabase/` are hand-run against the dashboard (no CI applies them; see
`diagnose-schema-state.sql`'s own note about files silently going unapplied for weeks), so
there is no commit history to confirm which. Per the "measure, don't reason" rule, a
non-reproducing bug does not get a fix bolted onto it — it gets reported as non-reproducing,
not a third guess.

## Root cause + fix, per finding

### 1. `qsr_daily_activity_daily` — ERROR, not RLS
Postgres error text was literally `permission denied for view
qsr_daily_activity_daily` — a missing table-level `GRANT`, not an RLS filter (RLS
denial reads as an empty 200, not a 403/permission error). `schema-qsr-daily-summary.sql`
already contains the correct `grant select on public.qsr_daily_activity_daily to
authenticated, service_role;` — it was written correctly but, per the same
hand-applied-migration gap noted above, apparently never (fully) executed against
production, or was run before the view's most recent `create or replace`. **No SQL
change was needed** — added a re-apply breadcrumb comment to the top of that file
instead of editing its DDL. The owner needs to re-run that file in the SQL editor
(it's idempotent).

### 2. `tenants` / `tenant_stores` — real RLS gap, currently harmless
Both created in `schema-multitenant-phase1.sql` with **no RLS policy at all**. RLS
ended up enabled on both anyway (default-deny with zero policies), so authenticated
reads return 0 rows cleanly while service-role sees all 1 / 27 — the identical *shape*
of bug qsr_fob was blamed for, just for real this time, and on tables nothing calls yet:
`loadTenants()` / `loadTenantStores()` (`src/lib/supabase.js:3343-3360`) are documented
"NOT yet wired into the app," and `grep -rn "loadTenants\|loadTenantStores" src/` outside
that one file returns nothing. **Fixed forward**: new file
`supabase/schema-multitenant-phase3-registry-rls.sql` adds tenant-scoped `SELECT`
policies (`id = current_tenant_id()` / `tenant_id = current_tenant_id()`), matching the
Phase 2 pattern exactly — fail closed, not open. In the current single-tenant deployment
this is a no-op (one tenant = "see everything" either way); it only starts doing real
work once a second tenant exists, which is the entire point of the table. The owner needs
to run this file in the SQL editor.

## Blast radius of both fixes

- **`qsr_daily_activity_daily` grant**: none. It's a `SUM(...) GROUP BY loc, dt` rollup
  over `qsr_daily_activity`, which the authenticated role can already read row-by-row in
  full (370,130 = 370,130, confirmed by this same audit). The view exposes strictly less
  granular data than what's already visible; granting it doesn't widen access at all.
- **`tenants` / `tenant_stores` policies**: none today (dead code paths, confirmed by
  grep). Forward-looking: once a second tenant exists, this is the isolation boundary
  doing its actual job — a regression here would mean one operator seeing another's
  tenant registry, which is why the policies are scoped (`= current_tenant_id()`) rather
  than opened wide, even though "wide" and "correct" are identical today.

## What I could not do

No direct Postgres connection (no `DATABASE_URL`/connection string in `.env.local`, no
linked Supabase CLI project, no Management API token) — only the PostgREST data API,
Auth Admin API, and service-role REST access are reachable from this environment. I
cannot execute DDL directly. This matches how every other file in `supabase/` already
works in this repo (hand-applied via the SQL editor, per `diagnose-schema-state.sql`'s
own framing) — the deliverable here is the correct, idempotent, reviewable SQL file, not
a live database mutation performed by the agent.

## Repeatable check

`scripts/rls-table-audit.mjs` is meant to be re-run, not a one-off. Good times to run it:
after any new table ships, after any RLS migration, or any time a panel reports "silently
empty" the way Food Cost did — it answers "is this actually an RLS gap, and is it just
this table or a class of tables" in about 30 seconds instead of another two guessed
sessions.
