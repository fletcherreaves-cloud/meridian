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

## ⚠️ CORRECTION 2026-11-02 — a 5th open item, bigger than the other four, found while answering
the owner's "bringing on a whole different organization" question

The "already done" section above is still true for the **~70 tables the 2026-10-21 phase2 sweep
actually touched** (`using(tenant_id = public.current_tenant_id())`, the dynamic function). But a
direct grep done today (`grep -rl "tenant_id = '00000000-0000-0000-0000-000000000001'::uuid"
supabase/*.sql`) found **51 OTHER schema files** — most added after the phase2 sweep, some before
— whose RLS policy hardcodes the literal owner UUID instead of calling `current_tenant_id()`, and
whose `tenant_id` COLUMN DEFAULT is the same hardcoded literal too. List (not exhaustive-checked
beyond this grep, but grep is exact): `schema-yearly-targets.sql`, `schema-target-overrides.sql`,
every `schema-security-rules*.sql` / `schema-security-findings*.sql` file, `schema-lifelenz-
shift-assignments.sql`, `schema-lifelenz-attendance.sql`, `schema-lifelenz-punch-edits.sql`,
`schema-lifelenz-forecast-captures.sql`, `schema-qsr-employee-tenure.sql`, `schema-qsr-punch-
times.sql`, `schema-qsr-security-events.sql`, `schema-pay-events.sql`, `schema-coaching-cycles.sql`
+ `-notes.sql`, `schema-customer-complaints.sql`, `schema-store-assessments.sql`, plus the six
tables this same session just built/touched (`schema-lifelenz-schedule-variance.sql`, `schema-
lifelenz-compliance-audit.sql`, `schema-lifelenz-employee-performance.sql`, `schema-employee-pay-
rate-changes.sql`, `schema-lifelenz-shift-pay.sql`, `schema-equipment-catalog-settings.sql`) — 51
files total, see that grep for the complete list.

**What this actually means in practice (worked through, not assumed):** these tables are not
"leaky" in the sense of tenant #2 seeing tenant #1's rows through a mismatched check — the policy
doesn't key off the real caller's tenant at all, so a tenant #2 query against one of these 51
tables would never match the hardcoded literal and would correctly see nothing *as long as its
own rows were correctly tagged with its own real tenant_id*. The real failure mode is the other
direction: because the **column default** is also the hardcoded literal, any insert into one of
these 51 tables that doesn't explicitly set `tenant_id` — which is every pull script, since they
use the service-role key and (per open item #2 above) don't pass a tenant parameter at all today —
lands tagged as **tenant #1's data**, visible in tenant #1's own views, regardless of which
organization it actually came from. For a table like `schema-security-findings.sql` or `schema-
employee-pay-rate-changes.sql`, that is a real cross-organization data-exposure risk, not a cosmetic
gap — a second operator's security findings or payroll history could silently appear inside the
owner's own security/pay-rate panels.

**Not yet true today** (no second tenant exists), but this is now the **#1 priority fix** before
any real second-organization onboarding — ahead of the four items already listed above, since
those four are each one concrete, scoped task, while this one is "51 schema files share a
copy-pasted pattern that predates/bypassed the phase2 standard." The fix itself is mechanical
(replace the hardcoded literal with `public.current_tenant_id()` in both the column default and
every policy in each file, same shape the phase2 sweep already proved out on ~70 other tables) —
the discovery, not the fix, is the actual finding. Flagging it rather than fixing it unprompted:
51 files is a large, easily-reviewable-but-not-trivially-small diff, and per this project's own
"DDL needs the owner to run it in the SQL editor" constraint, correcting it still requires the
owner's own action to apply — better to decide as one deliberate pass (possibly regenerating all
51 at once) than discover mid-edit that some of the 51 have one-off differences worth preserving.
