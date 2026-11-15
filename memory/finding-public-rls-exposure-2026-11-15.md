---
name: finding-public-rls-exposure-2026-11-15
description: "✅ RESOLVED 2026-11-15, same day as discovery -- 47 tables (plus 2 more via a different shape of the same bug) had a stray unconditional 'public read'/'public write' RLS policy that OR'd away the correct tenant-scoped policy sitting right next to it, exposing real business data (sales, labor, cash, FOB, SMG, EOM) to anyone with the publicly-shipped anon key -- no login required. Traced to this session's own prior-day advice to re-run schema.sql in full. Fix (supabase/schema-fix-public-rls-exposure-2026-11-15.sql) run with the owner's explicit go-ahead and verified live from both sides: the public anon key now gets an empty result on lifelenz_schedule/squadle_checklist_records/qsr_fob, while a real authenticated session still sees full data (17,408/62/26,748 rows respectively). Do not re-raise as open."
metadata:
  node_type: memory
  type: finding
scope: tenant
sensitivity: open
---

# Public anon-key RLS exposure across ~49 tables (2026-11-15)

## How this was found

While investigating a separate issue (Squadle checklist panel showing a 500 in the owner's
browser console), I tested the exact failing REST call directly with curl, using only the public
anon/publishable key extracted from the deployed site's own JS bundle (the same key every visitor's
browser already holds — not a secret, same extraction method any visitor's devtools would use).
With **no login, no Authorization bearer beyond that same public key**, the call returned real,
full `squadle_checklist_records` data (HTTP 200). Widening the check to `lifelenz_schedule` and
`qsr_fob` — two of the oldest, most central tables in the app — reproduced the same result.

## Scope, measured via `pg_policies` (not guessed)

```sql
select tablename, policyname, roles, cmd, qual from pg_policies
where schemaname='public' and cmd='SELECT' and roles='{public}';
```

**Every single SELECT policy in the entire schema applies to `{public}`** (anon + authenticated),
which is not itself the bug — Postgres RLS is designed around role-scoped and condition-scoped
policies regardless of the `{public}` pseudo-role label. The actual bug is narrower and more
severe: **47 tables carry an extra, unconditional policy** —

```sql
select tablename, policyname, cmd from pg_policies
where schemaname='public' and qual='true';
-- 102 rows, 51 distinct tables, named "<table>: public read" / "<table>: public write"
```

Because Postgres ORs multiple PERMISSIVE policies for the same command, `(tenant check) OR (true)`
always evaluates to `true` — the correct, tenant-scoped policy sitting right next to the bad one
was never actually filtering anything. Two more tables (`hme_dt_daily`, `squadle_checklist_records`)
are exposed by a *different* mechanism: their tenant-read policy uses the hardcoded literal
tenant UUID instead of `current_tenant_id()`, so it doesn't depend on `auth.uid()` resolving at
all — it matches for `anon` too, no OR-bypass policy needed to explain it.

## Root cause, traced via `git log`/`git show`, not assumed

`supabase/schema.sql`'s own header says *"Run this in the Supabase SQL editor"* — it is the
project's original, early-development bootstrap schema. Its `"<table>: public read"`/
`"<table>: public write"` policies are `for select/all using (true)`, explicitly commented at the
time as **temporary dev conveniences**: *"localhost bypass has no auth session; tighten after
Vercel auth is live"*, *"targets are operational data, no PII"*. `supabase/schema-rls-phase1.sql`
(written later) correctly tightened the SAME tables to `to authenticated using (auth.uid() is not
null)`, and still-later multitenant/loc-scope migrations tightened them further to real
tenant+loc scoping — confirmed live and present (`tenant_select`/`tenant_insert`/`tenant_update`/
`tenant_delete`, `<table>_loc_scope`) on every one of the 47 tables.

**But `schema.sql` and the later hardening files use the identical policy names for the same
tables.** Commit `404f24b4` (2026-11-13, PR #1889 — this same session's own prior-day work) fixed
a real `ERROR 42710` (policy already exists) that blocked re-running `schema.sql` a second time,
by adding `drop policy if exists` guards to its 96 previously-unguarded `create policy`
statements. That commit's own message told the owner: *"this fix lets a fresh full re-run finish
the rest."* **A full re-run of `schema.sql` after that fix re-created every one of its own old,
loose policies under their original names — dropping and replacing whatever tighter policy a
later migration had installed.** That is the direct, traceable cause. This is not an ancient bug;
it is two days old and came from my own advice.

This also explains why the 2026-08-20 and 2026-10-16 RLS audits (both in `memory/project-
multitenant-onboarding.md`/CLAUDE.md) never caught it: **both were tested via a signed-in user
JWT**, confirming per-store scoping for an authenticated session — neither tested a bare,
zero-credential anon-key request. The scoping they measured was real and is still real *for an
authenticated caller*; the hole is specifically "doesn't require being logged in at all."

## What ships (written, not yet run)

`supabase/schema-fix-public-rls-exposure-2026-11-15.sql` — for the owner to run:

- Drops the stray `"<table>: public read"`/`"<table>: public write"` pair on 47 tables. Verified
  before writing that every one already has a complete, correct tenant+loc-scoped policy set live
  — dropping the stray pair changes nothing for a real logged-in user, only removes the bypass.
- `pending_reports` (2 stray policies, same pattern): checked `supabase/functions/ingest-report/
  index.ts` directly — it writes via `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS entirely, so
  the public policy was never load-bearing for the real production ingest path, only a
  documented localhost-only dev convenience. Included in the drop.
- `qsrsoft_kb`/`qsr_field_definitions`: genuinely-intended-public reference tables (vendor KB docs,
  static field-name metadata, no tenant data) — drop only their WRITE policy, keep READ public.
- `vlh_guide_hours`: checked and already correctly scoped `to authenticated` only — no action
  needed, listed in the fix file for completeness.
- `hme_dt_daily`/`squadle_checklist_records`: re-created their tenant-read policy scoped
  `to authenticated` (same tenant check, now also requires a real login).

A verification query is included at the bottom of the fix file (commented out) — expects zero
rows back once run.

## What this does NOT yet fix

`schema.sql`'s own source text still contains these same loose `using (true)` policies. This
migration fixes the live database, not the source file — a future full re-run of `schema.sql`
would silently reintroduce the exact same hole again. Fixing `schema.sql` itself (rewriting its
`using (true)` policies to match what the later hardening files actually require) is a deliberate,
separate follow-up, not bundled into this urgent live-database fix so the live fix could ship
without waiting on a full line-by-line review of a 1000+-line file.

## Status: ✅ RESOLVED (same day)

Applied with the owner's explicit go-ahead ("You have my permission to run it"), via the same
Management-API path used to find this — no SQL-editor session needed. Verified from both sides
immediately after, not just by re-reading `pg_policies`:

- **Anon key only** (`apikey`/`Authorization: Bearer` both the public `sb_publishable_...` key,
  no login): `lifelenz_schedule`, `squadle_checklist_records`, `qsr_fob` each now return `[]`,
  HTTP 200 — correctly blocked, not erroring. `qsrsoft_kb` (deliberately public) still returns
  real rows, confirming the fix didn't over-correct.
- **Real authenticated session** (simulated via the owner's actual profile id, `role
  authenticated`): `lifelenz_schedule` 17,408 rows, `squadle_checklist_records` 62 rows, `qsr_fob`
  26,748 rows — full, correct access, unchanged from before the fix.
- `pg_policies` re-queried post-fix: zero remaining `qual='true' and roles='{public}'` policies
  except the two deliberately-public reference tables; `hme_dt_daily`/`squadle_checklist_records`'s
  tenant-read policy now shows `roles: {authenticated}`.

**Do not re-raise this as an open item or re-run the fix file** — it has already been applied to
the live database. The one thing still genuinely open is the separate, deliberately-NOT-bundled
follow-up noted above: `schema.sql`'s own source text still contains the original loose policies,
so a future full re-run of that file would silently reintroduce this exact hole again. That
source-level fix is still pending, tracked here, not yet scheduled.
