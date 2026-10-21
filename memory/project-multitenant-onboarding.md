# Multi-Tenant Onboarding — what's done, what's left (2026-10-21)

> Owner asked, "just curious," what it'd take to extend Meridian to a second trusted operator.
> This is the answer, consolidated from re-reading the actual multitenant migration files +
> `constants.js`'s live-registry plumbing + the memory files that already independently measured
> pieces of this live — not a fresh design. **Read this before re-deriving any of it**, per
> CLAUDE.md's "check whether an explanation already exists" rule.

## The short version

More is already built than the migration files' own cautionary comments suggest — those comments
were accurate when written but have since been confirmed live by separate measurements. **Tenant
isolation at the database layer is live, not just deployed.** What's actually missing is a short,
concrete list: one schema fix, pull-script credential plumbing, and a user-provisioning path. Not
a redesign.

## Already done (and independently confirmed live — not just "should work")

- **`tenant_id` + tenant-scoped RLS is live in production.** `supabase/schema-multitenant-phase1.sql`
  added the column (`tenants` registry, `tenant_stores` loc→tenant map); `supabase/schema-
  multitenant-phase2-rls.sql` is "the RLS flip" — replaces every loose `using(true)`/`auth.uid() is
  not null` policy across ~70 tables with `tenant_id = public.current_tenant_id()`, via the
  `set_tenant_id()` trigger on insert. The file's own header reads as "don't run until verified" —
  **that verification already happened**: `project-rls-hardening-plan.md`'s 2026-08-20 pass measured
  three things live against production (zero `using(true)` exceptions beyond one known case, RLS
  enabled on all 87 public tables, anonymous callers correctly rejected by the tenant check) and
  closed the anonymous-access question for good.
- **Per-store isolation WITHIN a tenant is also live and tested end-to-end.** CLAUDE.md's RBAC
  section (corrected 2026-10-16) — a throwaway restricted profile, real production data, anon key +
  signed-in JWT (never service-role): `lifelenz_schedule` returned exactly the one assigned store's
  rows, a different real store's loc came back `content-range: */0` (actively blocked), and
  resetting `accessible_locs` to null correctly restored the full unrestricted set on the same
  already-issued JWT. `my_locs()` is confirmed live via direct RPC probe
  (`finding-rls-phase2-my-locs-2026-09-06.md`).
- **The store/targets registry is NOT hard-coded to this owner's 27 stores the way `constants.js`
  looks at a glance.** `STORE_NAMES`/`DEFAULT_TARGETS` are the *seed* (zero-Supabase-row fallback),
  but `setLiveStoreNames()`/`setLiveDefaultTargets()` (constants.js, "Track-B onboarding plumbing")
  mutate those same exported objects in place from `org_config`'s `store_registry` key — and
  **this is already wired into the real login path**: `App.js`'s login sync calls
  `loadOrgConfigs(['app_settings','store_registry','contact_registry','app_user_targets'])` and
  feeds `remote.storeNames`/`remote.defaultTargets` straight into those setters. A second tenant's
  store list would populate the UI without any app code change — once their `store_registry` row
  can actually exist (see gap #1 below).

## What's actually still open

1. **`org_config`'s primary key is just `key`, not `(key, tenant_id)`.** Flagged directly in
   `schema-multitenant-phase2-rls.sql`'s own comment on the `org_config` policy block. Today a
   second tenant's `org_config` row (including the `store_registry` key the mechanism above reads)
   would collide with the owner's single row on the same key. This blocks the store-registry
   mechanism specifically — it's the one dependency standing between "already wired" and "actually
   works for tenant #2." Needs the PK change plus updating the app's upsert `onConflict` target to
   match.
2. **The automated pull scripts (LifeLenz, QSRSoft EBOS/DAR/ops, email-parse, etc.) always stamp
   the owner's tenant_id.** Also flagged directly in the same file: `set_tenant_id()`'s fallback is
   the owner's tenant because service-role inserts (which is what every pull script uses) carry no
   `auth.uid()`. A second operator needs their own LifeLenz/QSRSoft logins, their own GitHub Actions
   secrets, and each pull script needs a tenant parameter so it stamps the right tenant_id instead
   of silently landing on tenant #1's data. Realistically this means either a second parallel set of
   scheduled workflows (one owner's credentials each) or generalizing the existing workflows to loop
   over a credentials-per-tenant list.
3. **New-user signup has no "which tenant" step.** `profiles.tenant_id` keeps its column DEFAULT
   (deliberately — see the phase2 file's comment on why profiles/org_config kept theirs while every
   other table's default was dropped) so a brand-new magic-link signup today auto-joins the owner's
   tenant. A second operator's first users need an admin to explicitly set their `profiles.tenant_id`
   after signup — there's no self-serve "pick your org" flow.
4. **Unverified, not necessarily broken:** SAGE (`sage-chat`) and the other edge functions haven't
   been exercised live under a second tenant — worth a real smoke test before trusting them, not a
   known gap. Also worth naming plainly: this is one shared Supabase project, one Vercel project, one
   Anthropic API key across both tenants — fine technically (that's what the RLS isolation is for),
   but a real consideration if a second operator relationship is ever a paid one rather than a favor,
   since there's no per-tenant cost attribution today.

## If this ever becomes real, in order

1. Fix `org_config`'s PK to `(key, tenant_id)` + the app's upsert target.
2. Insert the new `tenants` row + `tenant_stores` rows for their stores.
3. Populate their `org_config.store_registry`/`app_settings` so the UI picks up their stores/targets
   via the already-wired `setLiveStoreNames`/`setLiveDefaultTargets` path.
4. Get their LifeLenz/QSRSoft credentials, parameterize the pull scripts + stand up their own
   scheduled workflows (or generalize the existing ones), confirm each stamps the right tenant_id.
5. Create their first admin user, manually set `profiles.tenant_id`, verify isolation live with
   that real account the same way the throwaway-profile test already proved the mechanism works.
6. Smoke-test SAGE and any other edge function under their login before calling it done.

Nothing here contradicts `vision-and-roadmap.md`'s own roadmap, which already lists multi-tenant
deployment as a later-stage item (P4) — this file is the concrete "what's actually left" version of
that line, grounded in what's since shipped.
