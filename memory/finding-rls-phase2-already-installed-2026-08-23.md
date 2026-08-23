---
name: finding-rls-phase2-already-installed-2026-08-23
description: RLS Phase 2's per-location policies are installed on 51 of 51 target tables in production, and Phase 3's registry RLS is live too. The roadmap prices Phase 2 at ~1 week of unstarted work; the policy work is done. What remains is populating accessible_locs and testing a scoped user — hours, not a week. The policies are currently INERT by design.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# RLS Phase 2 is installed, not unstarted — and Phase 3 is live

**Measured 2026-08-23** against production, by SQL query, in response to the roadmap's two
open Band 2 security questions.

---

## Question 1 — was `schema-multitenant-phase3-registry-rls.sql` run? **YES.**

```
tenant_stores : rls_enabled = true, 2 policies
tenants       : rls_enabled = true, 1 policy
```

⚠️ **An anon probe was NOT sufficient to establish this, and nearly produced a wrong answer.**
Querying `tenants`/`tenant_stores` with the anon key returned `[]`, which looks like proof of RLS
but is equally consistent with **the tables simply being empty**. The controls were meaningful
(`qsrsoft_kb`, public-read, returned rows; `qsr_fob`, tenant-scoped, returned `[]`) — the
*inference* was not. `pg_class.relrowsecurity` answers it directly; the probe only ever narrowed it.

## Question 2 — the leaked service-role key

**Still open.** Deliberately not tested from the agent side: verifying a rotation means exercising
the *old* key, and a leaked credential should not be handled to prove a negative. Check
Supabase → Settings → API → the `service_role` key's generation date. ⚠️ Rotating requires
updating `SUPABASE_SERVICE_ROLE_KEY` in GitHub Secrets in the same sitting — a dozen workflows
read it and all fail at the next scheduled run otherwise.

## 🎯 The reclassification — Phase 2 is not a week of work

`memory/roadmap-2026-08-23.md` Band 2 reads:

> **RLS Phase 2, `can_see_loc()`** (~1 w) — Phase 1 IS closed (87/87 tables …). Phase 2 is the
> gate on a second operator seeing only their stores.

**The policy work is already in production.** `schema-rls-phase2-loc.sql` targets 51 tables, and
measured live:

```
with_loc_scope = 51,  tables_checked = 51
```

The live policy on `tenant_stores` matches the migration byte-for-byte in shape:

```
tenant_stores_loc_scope | ALL | RESTRICTIVE | {authenticated}
  ((select my_locs()) IS NULL OR ltrim(loc,'0') IN (select unnest((select my_locs()))))
```

### Two things that make this safe rather than alarming

1. **It is RESTRICTIVE, not permissive.** Restrictive policies combine with **AND**, so they can
   only narrow access. An initial reading of "2 policies on `tenant_stores`" as a possible
   OR-widening was **wrong** — permissive is the default, but this one is explicitly not. The
   effective rule is `tenant_id = current_tenant_id()` **AND** the loc scope.
2. **The `(select my_locs())` wrapper is load-bearing for performance, not cosmetics.** The
   migration header records the measurement: bare `my_locs()` in the filter runs **590 ms**
   (profiles hit once *per row*); wrapped as `(select …)` it becomes an InitPlan at **13.8 ms**.
   Anyone touching these policies must keep the wrapper.

## ⚠️ Installed ≠ effective — the policies are INERT today, by design

From the migration's own header:

> SAFE TODAY: both live profiles have `accessible_locs = NULL`, so `my_locs()` returns [null]

The predicate short-circuits to allow-everything when `accessible_locs` is NULL. So all 51 policies
are currently **correct and doing nothing**. That is the intended staging — install the mechanism
while it cannot lock anyone out, populate the field later.

**So the remaining work is not writing RLS. It is:**

1. Populate `accessible_locs` on a profile (a subset of stores).
2. Log in as that user and confirm they see only those stores, across more than one panel.
3. Confirm a NULL-`accessible_locs` profile still sees everything (the no-op path must not regress).
4. Re-check query timings with a non-NULL `my_locs()` — the 13.8 ms measurement was taken on the
   NULL path, where the InitPlan returns immediately. **The populated path is unmeasured.**

That is hours of testing, not a week of building.

## Pattern worth noticing — twice in one session

This is the **second** roadmap item on 2026-08-23 that was priced as unstarted and turned out
substantially built:

| item | roadmap said | actually |
|---|---|---|
| QSRSoft Cognito auth | ~3 d | lib exists (#312), 5 of 16 scripts converted — mechanical |
| RLS Phase 2 | ~1 w | policies live on 51/51 tables — needs testing, not building |

Both were found by **one query against the real system**, after the roadmap had carried the wrong
estimate for weeks. Before scheduling any multi-day item on that roadmap, spend the two minutes to
check whether it is already done. The estimates were written from the backlog, not from production.
