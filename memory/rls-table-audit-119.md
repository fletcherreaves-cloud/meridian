---
name: rls-table-audit-119
description: Issue #119 — full 82-table RLS audit (authenticated vs service-role row counts). NET RESULT after correction: ONE real gap (tenants/tenant_stores had zero RLS policy), one non-reproduction (qsr_fob measured healthy), and one RETRACTED finding (qsr_daily_activity_daily is superseded, unused infrastructure — its missing GRANT was never a gap; a stale comment in loadQsrActSummary made it look like one). Two reusable lessons: a view over an RLS-protected table is an RLS bypass unless security_invoker=true, and BEFORE fixing a thing, confirm the thing is still used. Repeatable check: scripts/rls-table-audit.mjs.
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

### 1. `qsr_daily_activity_daily` — ⛔ NOT A REAL GAP. The whole finding was wrong.

**⚠️ Retracted 2026-08-10 (PM, same day). Read this before the rest of the section.**
This view is **superseded and unused**. `loadQsrActSummary` abandoned it on 2026-08-07 for
the rollup **TABLE** `qsr_daily_activity_rollup`, and the block comment inside that function
records exactly why: a view over an RLS-protected base table is an RLS bypass without
`security_invoker`, and *with* `security_invoker` it evaluates RLS per row over 367k rows and
hits the **statement timeout** on the real 60-day workload. So the "fix" this audit demanded —
add `security_invoker` and re-run the grant — recreated abandoned infrastructure in the exact
configuration already measured as too slow to use. The owner ran it for nothing.

**Harmless, verified rather than assumed:** the grant is `authenticated`/`service_role` only,
and the anon key gets `42501 permission denied` on the view (checked live 2026-08-10). Nothing
in `src/` reads it. Cost was wasted owner time, not a regression.

**Why it fooled two reviewers.** `loadQsrActSummary`'s *header* comment still claimed it
"prefers the server-side rollup view (supabase/schema-qsr-daily-summary.sql)" while the code
twenty lines below already used the table. The audit found a granted-looking view named in a
stale comment and treated the missing GRANT as an open gap. The PM review then checked whether
the SQL was **safe** and never asked whether the view was still **wanted** — and the answer was
in the same function the stale comment lived in.

> **The transferable rule: before fixing a thing, confirm the thing is still used.**
> "Is this correct?" and "is this wanted?" are different questions, and the second one is
> cheaper. A single `grep -rn "<object_name>" src/ scripts/` would have ended this in seconds.
> A verify query passing is not evidence a thing is needed — the view's single-day verify
> returned correct numbers while being unusable at the window it exists to serve.

Header comment fixed, `scripts/measure-denominator-floors.mjs` repointed at the table, and the
SQL file banner-marked SUPERSEDED with the drop statement, all 2026-08-10.

*Original (incorrect) analysis preserved below, because the security lesson inside it is real
and reusable even though the finding that produced it was not.*

---

**Original finding — ERROR, not RLS. AND a second bug the first one was hiding.**
Postgres error text was literally `permission denied for view
qsr_daily_activity_daily` — a missing table-level `GRANT`, not an RLS filter (RLS
denial reads as an empty 200, not a 403/permission error). `schema-qsr-daily-summary.sql`
already contains a `grant select on public.qsr_daily_activity_daily to authenticated,
service_role;` that was apparently never (fully) executed against production, or was run
before the view's most recent `create or replace`.

**⚠️ Correction (PM review, same day): my original fix here was wrong, and it was wrong
in the dangerous direction.** I initially concluded "no SQL change needed, just re-run
the existing grant" and said the blast radius was "none." That analysis missed something
the file's OWN pre-existing comment already named but didn't draw out: *"a view runs
with the privileges of its owner and does NOT inherit the base table's policies."* By
default, Postgres applies a view's ROW SECURITY policies using the VIEW OWNER's rights,
not the querying role's. Re-applying that grant AS ORIGINALLY WRITTEN would have handed
**every authenticated user, any tenant, any accessible_locs restriction, every row of
`qsr_daily_activity`** through this view — even though the base table itself is
correctly scoped by both tenant (`schema-multitenant-phase2-rls.sql`) and
`accessible_locs` (`schema-rls-phase2-loc.sql` — this table is literally the one
`my_locs()` was proven against). I would have shipped a real RLS bypass while believing
I was applying a harmless, already-written grant.

**Fixed properly**: added `with (security_invoker = true)` to the view definition
(PostgreSQL 15+), which makes the view apply the CALLING role's RLS policies instead of
the owner's — the grant is now safe exactly because the base table's own row security
still does the real scoping per caller.

**Postgres version — RESOLVED 2026-08-10, do not re-raise.** The owner ran
`show server_version` in the Supabase SQL editor: **17.6**. `security_invoker` (added in
15) is fully supported, and the view has been applied to production.

⚠️ **Correction, worth keeping because the mistake is repeatable.** This file originally
recorded that the PostgREST OpenAPI root's `info.version: "14.5"` is "populated from the
connected server's Postgres version," and treated it as a signal the project might be on
Postgres 14. **That is wrong** — `info.version` carries PostgREST's OWN version string,
not the database server's. The two numbers happened to look plausible as a Postgres
version, which is exactly what made it convincing. `GET /rest/v1/` is not a way to learn
the Postgres version, and it also requires the service_role key, so it can't be checked
with the anon key in `.env.local`. **To get the Postgres version, run
`show server_version;` (or `select version();`) in the SQL editor** — one statement, no
inference. The safety property that made shipping under this uncertainty acceptable still
holds and is still worth copying: on Postgres 14 the statement would have failed loudly
and granted nothing, so the wrong reading could only ever have cost a failed run, never a
silent bypass.

## ⭐ The reusable lesson (more important than either individual gap)

**A view defined over an RLS-protected table is itself an RLS bypass, by default, unless
explicitly declared otherwise.** This isn't specific to `qsr_daily_activity_daily` — it's
a property of how Postgres views work: a view's row-security policies apply using the
VIEW OWNER's privileges unless the view is created with `security_invoker = true`
(PostgreSQL 15+). Granting `SELECT` on such a view to a broad role looks exactly as safe
as granting `SELECT` on a table, and is not. Before granting broad access to ANY new view
over an RLS-protected table in this codebase, either add `security_invoker = true`
(15+) or explicitly confirm the exposure is intended.

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

- **`qsr_daily_activity_daily` grant, WITH `security_invoker = true`**: none — the view
  now applies the caller's own RLS, so it exposes exactly what querying
  `qsr_daily_activity` directly already exposes to that caller (currently everyone, since
  both live profiles have unrestricted `accessible_locs` — see `tenants`/`tenant_stores`
  note below on why "harmless today" isn't the same as "harmless forever"). **Without**
  `security_invoker` (my first-pass fix), the blast radius would have been every row,
  every tenant, every restricted store, to any authenticated user — corrected before
  shipping, see the finding above.
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
