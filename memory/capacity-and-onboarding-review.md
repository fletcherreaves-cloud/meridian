---
name: capacity-and-onboarding-review
description: Answers the owner's four Notes 54 backend questions — current capacity, how many users can be onboarded today, what must land before new users, and gaps in the proposed telemetry list. Key finding — the blocker is architectural (wide-open RLS + client-side RBAC + load-everything startup), not capacity.
metadata:
  type: project
---

# Capacity & onboarding review (2026-08-06)

Answers Notes 54 § Backend questions 4–7. Evidence is code and schema; **live row counts
and Supabase plan/usage numbers are NOT included** — this Mac has no `.env.local`, so
nothing here rests on a live query. Every figure below is derived or estimated, and
labelled as such. See §6 for what to verify from the dashboard.

---

## 1. Headline answer

**How many users can you onboard right now?**

- **Users who are allowed to see everything** (you, a partner, an office admin you'd
  trust with the whole district): realistically **5–15**. The limit is performance and
  Supabase egress, not safety.
- **Users who must only see their own stores** — GMs, supervisors, DOs, the beta
  operator: **zero, today.** Not "risky." It does not currently work as a security
  boundary at all.

That second number is the whole answer to "what should I do before allowing new users."

---

## 2. Why restricted users are currently impossible

Three things compound. Any one alone would be manageable; together they mean per-store
restriction is presentational only.

**2.1 RLS is wide open.** Per `project-rls-hardening-plan.md` (audit findings A1/C2/B2),
roughly **30 tables carry `using(true)`**, plus public storage buckets. That is anonymous
access — not merely "any logged-in user."

**2.2 RBAC is client-side.** `accessible_locs` gates what the UI *renders*. It does not
gate what the database *returns*. Anyone who opens DevTools, or just reads the network
tab, sees every store's data regardless of role.

**2.3 The startup loader fetches all stores for everyone.** The login effect in
`src/app/App.js` (~lines 1880–2175) pulls district-wide windows unconditionally, then
filters in the browser. So a restricted user doesn't merely *could* see other stores'
data — their client actively downloads it on every login.

Net effect: giving a GM an account today hands them the entire district's sales, labor,
cash, and controls data. Including other operators' once you're multi-tenant.

**The fix already exists as a written plan.** `project-rls-hardening-plan.md` is
owner-approved-to-draft and phased. Its central safety proof matters here: every pull
script and edge function uses `SUPABASE_SERVICE_ROLE_KEY`, which **bypasses RLS
entirely**, so tightening policies cannot break automation. Phase 1 closes anonymous
access (near-zero risk); Phase 2 adds per-loc isolation via `can_see_loc()`. That plan is
the gate on onboarding, and it has been sitting drafted since 2026-07-27.

---

## 3. Performance: the startup chain is the real ceiling

This is also the root cause of the Notes 54 AAG complaint ("app is unusable until the
Sales chip loads, sometimes 2–3 minutes"), so it's one fix serving two problems.

**Measured from the code:** the post-login effect runs **28 sequential `try { await … }`
stages** covering **26+ loader calls**. They execute strictly one after another. v4.594
parallelised *within* four of those stages (People, Digital/Delivery, email reports, Ops
streams) but left the top-level chain serial.

The order matters. `loadDarRows()` — which feeds the Sales chip — sits at **stage 3**,
behind `loadOpsRows()` and `loadCtrlRows()`, and `loadQsrActSummary(60)` is later still.
So the single most latency-critical stream waits on two unrelated ones, and ~20 more
stages queue behind it.

**Estimated payload per login** (27 stores; derived from each loader's day-window
argument, not measured):

| Stream | Window | Est. rows |
|---|---|---|
| eBOS op-supplies | 400 d | ~10,800 |
| Ops Report streams (×5) | 60 d | ~8,100 |
| Email reports (glimpse/cash/ledger) | 60 d | ~4,860 |
| QSR act summary | 60 d | ~1,620 |
| DAR, labor, ctrl, ops rows | varies / unbounded | largest unknown |

Order-of-magnitude: **tens of thousands of rows per login**, serialised. That is why it
takes minutes, and it is the number that multiplies by user count.

**Recommendation (matches triage §2.1): instrument before refactoring.** Time each of the
28 stages and log the waterfall. The serial chain is almost certainly the dominant cost,
but "almost certainly" is how v4.594 already missed once. Get the numbers, then fix.

The likely fix is cheap and low-risk: the stages are already independent (each has its own
try/catch and its own `setDs` patch), so they can be `Promise.all`'d in tiers, with the
Sales-chip streams promoted to tier 1. That is a reordering, not a rewrite.

**Note the coupling:** this is *also* the multi-user cost driver, and the per-loc RLS work
in §2 is what finally lets a restricted user download only their own stores instead of all
27. Sequencing RLS Phase 2 before the load refactor means the refactor gets to assume a
smaller payload.

---

## 4. Growth outlook

Estimates from pull cadence and store count, not from live counts.

- **`qsr_daily_activity` is the dominant table.** 27 stores × ~19–24 hour slots × 365 days
  ≈ **190k–240k rows/year**, growing linearly. Everything else is store-daily or
  store-monthly: ~10k rows/store-year, trivial by comparison.
- **72 tables** are defined across `supabase/*.sql`.
- Scaling drivers, in order: (1) DAR hourly granularity, (2) store count, (3) retention —
  you currently delete nothing, and LY comparisons need ≥2 years, so plan for 3+.
- Postgres handles this size without difficulty. **The strain is egress and client
  parsing, not database size** — the load-everything startup pattern means data volume
  hits every user on every login, rather than staying server-side.
- The architectural implication: as retention grows, "pull the window to the client and
  filter" gets worse for everyone simultaneously. At some point windowed server-side
  aggregation (RPC/materialised views) beats widening the client fetch. Not urgent at 27
  stores and a handful of users; it *is* the thing that breaks first at 100 stores or 50
  users.

---

## 5. Gaps in the proposed telemetry list (Notes 54 § Backend)

The owner's list is good and mostly complete. Additions worth considering:

- **Data freshness/staleness alerting per stream.** The list covers pipeline health when it
  *breaks*; the more common failure is a pull that silently succeeds with 0 rows.
  Precedent: v4.802 — `qsrsoft-ops-pull.mjs` pulled 0 rows for ~5 days before anyone
  noticed. Alert on "stream older than its SLA," not just on thrown errors.
- **Failed-login and auth-anomaly logging** — distinct from the listed "unauthorized use";
  this is the earlier signal.
- **Slow-query / slow-load telemetry**, which would have surfaced §3 automatically.
- **Schema-migration history** — which SQL blocks have actually been applied. There's real
  precedent for uncertainty here (the "pending user action" list carried four tables for
  weeks that turned out to already exist).
- **Per-user data-access audit** — who read which stores. Becomes near-mandatory the moment
  a second operator's data is in the same database.
- **Cost/usage tracking** — Supabase egress and Claude API spend per user, so onboarding
  cost per seat is known before you scale seats.

⚠️ **On auto-shutdown of unauthorized instances:** ship this as **flag-and-alert first**.
A false positive locks a legitimate operator out mid-shift, and an ops tool that
occasionally locks out the person running a lunch rush will not be trusted again. Enable
automatic action only after the detector has a clean track record on real traffic.

---

## 6. Verify from the Supabase dashboard (cannot be checked from here)

1. Current plan tier, and actual DB size / egress / MAU against its limits.
2. Real row counts, especially `qsr_daily_activity`.
3. Confirm `SUPABASE_SERVICE_ROLE_KEY` is set for **every** write workflow — the RLS plan
   flags `qsrsoft-email-parse` as falling back to the anon key if the secret is missing,
   which would break under Phase 1.
4. Whether PITR / automated backups are on (feeds triage §1.3, the rollback question).

---

## 7. Recommended sequence before onboarding anyone restricted

1. **RLS Phase 1** — close anonymous access. Near-zero risk, biggest single win. Bake a day.
2. **RLS Phase 2** — per-loc isolation via `can_see_loc()`. Verify with a restricted test
   profile before any real restricted user exists.
3. **Startup load instrumentation → tiered parallel load.** Adoption blocker today at one
   user; a hard ceiling at ten.
4. **Backup/rollback verified** (triage §1.3) — confirm you can actually restore, don't
   assume.
5. **Then** onboard one restricted pilot user and watch the access audit.

Items 1–2 are drafted and waiting on the owner's go-ahead, not on design work.

⚠️ One item from `project-security-notes.md` becomes live at this point: the `xlsx`
(SheetJS) prototype-pollution and ReDoS advisories are currently accepted risk **because
only trusted users upload files**. Onboarding users who can upload spreadsheets changes
that premise. Revisit before, not after.
