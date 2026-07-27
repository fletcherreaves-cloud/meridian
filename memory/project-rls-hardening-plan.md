---
name: project-rls-hardening-plan
description: Phased plan to close the wide-open Supabase RLS (audit finding A1/C2/B2) before Meridian widens to more operators. Reviewed-before-implemented. Key safety fact — automation + edge functions use the service-role key (bypass RLS), client uses authenticated sessions — so tightening RLS only closes ANONYMOUS access and breaks nothing legitimate.
metadata:
  node_type: memory
  type: project
---

# Supabase RLS Hardening Plan (owner-approved to draft, 2026-07-27)

Addresses audit A1 (wide-open `using(true)` on ~30 tables), C2 (public buckets),
B2 (client-only RBAC), M1 (review writes unscoped). **Nothing is changed until the
owner reviews this plan.**

## ✅ Why this is LOW-RISK (verified)
- **Every data-pull script uses `SUPABASE_SERVICE_ROLE_KEY`** (qsrsoft-dar/ebos/onhand/
  variance/pull/email-parse, lifelenz-*). Service role **bypasses RLS entirely** → no
  automation writes break, ever.
- **Edge functions use service role** (ingest-report, sage-chat) or only trigger a
  workflow (trigger-dar-sync, anon but no table writes).
- **Client uses the anon key WITH an authenticated magic-link session** → runs as the
  Postgres `authenticated` role, so `auth.uid()`-scoped policies work once logged in.
- Therefore tightening `using(true)` only removes **anonymous** access. The single
  behavior change: the app must be logged in (prod already is; only localhost-without-login dev is affected).
- **Pre-req to confirm before Phase 1:** every write workflow passes `SUPABASE_SERVICE_ROLE_KEY`
  (email-parse falls back to anon if the secret is missing — verify the secret is set).

## Scoping key: `profiles.accessible_locs`
`profiles(id=auth.uid(), role, accessible_locs)`. `accessible_locs` null = all stores
(owner/admin); array = restricted to those store codes. This already drives client
RBAC; we make it the RLS authority too. Loc-keyed tables (qsr_*, labor_rows, ops_rows,
ctrl_rows, monthly_targets, sales_ledger/glimpse/cash, etc.) all carry a `loc` column.

Add one SECURITY DEFINER helper (created once):
```sql
create or replace function public.can_see_loc(p_loc text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid()
      and (pr.accessible_locs is null
           or p_loc = any (select jsonb_array_elements_text(pr.accessible_locs)))
  );
$$;
```
(Handle loc zero-padding: normalize `p_loc` and stored codes to the same form — most
tables store unpadded NSN; qsr_* store 7-char zero-padded. The helper should compare
`ltrim(p_loc,'0')` both sides, or store a normalized column.)

## Phases (each its own reviewed, testable migration)

### Phase 1 — Close the anonymous hole (fast, near-zero risk)
Replace every `for all using (true)` / `for select using (true)` with
`using (auth.uid() is not null)` (+ `with check (auth.uid() is not null)` on writes).
Instantly stops anonymous read/write on all ~30 tables. No per-loc logic yet — any
logged-in user still sees everything, but the internet no longer can. Ship + smoke-test
the whole app logged in; confirm pulls still write (they will — service role). Keep the
old policies commented for rollback.

### Phase 2 — Per-loc isolation (the multi-operator fix)
On loc-keyed tables, swap `auth.uid() is not null` → `public.can_see_loc(loc)` for
select, and for write add `with check (public.can_see_loc(loc))`. Now operator B (users
whose `accessible_locs` = their stores) cannot read/write operator A's rows; the owner
(`accessible_locs is null`) still sees all. Test with a restricted test profile.
- **District aggregates:** SAGE already exposes district totals to all roles server-side;
  decide whether any UI needs a cross-loc read (if so, gate via role, not open RLS).

### Phase 3 — Non-loc tables, review writes, storage
- **Shared-config tables** (feature_requests, custom_signals, saved_correlations,
  sage_prompts, org_config, review_templates): org-shared is fine → keep
  `auth.uid() is not null`. (Multi-TENANT later may add an `org_id`; not needed for one org.)
- **reviews (M1):** reads are already role/accessible_locs-scoped; scope WRITES the same
  (`with check` on role+loc or owner), so a manager can't overwrite arbitrary reviews.
- **PII tables** (employee_skills, smg_comments, reviews): loc-scope + confirm no anon.
- **Storage buckets** (qsr-reports, reports, pending_reports): make private; replace
  public read/insert with `auth.uid() is not null` (or service-role-only for the ingest
  path, since email-parse reads them with service role). Remove public `update` on pending_reports.

### Phase 4 — Defense-in-depth (from the audit medium list)
- Back client RBAC decisions with RLS (falls out of Phases 1-2; treat permissions.js as UX only).
- sage-chat: build the base system prompt server-side (don't accept it from the client) — C4.
- Escape HTML in print/export `document.write` paths — C3 (separate small PR).

## Testing / rollback
- Apply per-phase in the Supabase SQL editor; each phase is idempotent (drop policy if
  exists → create). Keep the prior policy text in a commented block for one-command rollback.
- After each phase: (1) log in to the app, load every major panel (no empty/permission
  errors); (2) run one data-pull workflow manually and confirm rows upsert; (3) with a
  restricted test profile (accessible_locs = 2 stores), confirm cross-store data is hidden.
- Roll out on a quiet window; Phase 1 first, bake a day, then Phase 2.

## Deliverable when approved
A single reviewed `supabase/schema-rls-hardening.sql` (phase-tagged, idempotent, with
rollback blocks) + a checklist. Owner runs it phase-by-phase in the SQL editor (same as
the other schema blocks), verifying the app between phases.
