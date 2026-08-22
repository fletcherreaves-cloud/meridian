---
name: dispatch-59
description: Dispatch #59 - collect registerType Manager and Preparer, and turn on the role dimension the security rules were explicitly written to need. audit_rows holds one third of the Register Audit today. CASH-004 (manager-meal abuse) already ships with opportunity_factor FALSE because "no role/authority column exists in audit_rows to check against yet" - this dispatch is that column. Changes audit_rows' grain, so the PK and 30-plus consumers are the real work.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #59 — the role dimension the security rules are already waiting for

**Owner: *"We can get those."*** (2026-08-21, on collecting Manager and Preparer.)

## This is not "collect more data" — it completes a rule that already ships degraded

`scripts/qsrsoft-register-audit-pull.mjs:295` hardcodes `registerType: 'cashier'`. The Register
Audit offers **Cashier · Manager · Preparer**, so `audit_rows` holds **one third** of it.

And the security rules already know. `supabase/schema-security-rules-phase1.sql`, on **CASH-004
(`discount-abuse`, "Promo/discount rate")** — a rule whose own plan reference is *§2.1 "Unauthorized
discount / **manager-meal** abuse"*:

> *"`opportunity_factor` **FALSE**, examined not assumed: **no role/authority column exists in
> `audit_rows` to check against yet**."*

**That column is what this dispatch adds.** A rule written to catch manager abuse currently cannot
tell a manager from a crew member. Framing #59 as a data-collection chore undersells it: the
consumer is already built, already shipped, and already degraded on purpose with a comment saying
exactly what it needs.

## 🔴 The real work is the grain change, not the pull

`audit_rows` PK is **`(loc, date, emp)`** — see the pull's own
`upsert(..., { onConflict: 'loc,date,emp' })` at line 174 and `src/lib/supabase.js:859`.

Adding a second register type for the same employee on the same day **collides on that PK**. One
person can appear as both Cashier and Manager in a day; today the second row would silently
overwrite the first.

**So the PK must become `(loc, date, emp, register_type)`** — and that is a schema migration on a
live, populated table with **30+ referencing files**:

```
src/lib/supabase.js · src/app/App.js · src/engine/{security-rules,security-baselines,
security-drilldown,metric-source}.js · scripts/{register-audit,variance,security-rules-run,
backfill-identity-vault}.mjs · 5 test files · ~20 schema/RLS/migration .sql files
```

**Do not start with the pull.** Start by reading what breaks. Specific things to settle:

1. **Existing rows are all cashier.** Backfill `register_type = 'cashier'` with a `not null default`
   so no row is ambiguous and no consumer sees a null it wasn't written for.
2. **Does every aggregate need to change?** A per-employee daily total that currently sums one row
   will start summing up to three. **Some consumers want the sum; some want cashier-only.** Decide
   per consumer, explicitly — this is the highest-risk part of the dispatch and the place a silent
   wrong number gets in.
3. **Subject grouping in the security panel.** `groupFindingsBySubject` keys on `(loc, subject)`.
   Decide whether a manager's Manager-register activity is the same subject as their Cashier
   activity (probably yes) and whether the panel should distinguish them (probably also yes).
4. **`security-baselines.js`.** Personal and peer baselines computed over cashier-only rows will
   shift when Manager/Preparer rows land. **A baseline that silently changes meaning is worse than
   one that breaks** — check whether any stored baseline needs recomputing rather than just
   continuing.

## Then: turn CASH-004's `opportunity_factor` on

Once `register_type` exists, revisit that flag with the same "examined not assumed" discipline the
original comment used. **Do not flip it blind** — confirm the rule's logic actually reads the new
column and that its threshold still means what it meant when the population was cashier-only.

## The meal signals — related, and cheaper than they look

`employee_meal` and `manager_meal` are two of the eight `event_token`s (dispatch #58), so **their
event-level detail arrives free once #58's pull runs.** But neither appears in `audit_rows`' metric
set, so no rule can fire on them.

**Sequence this after #58 has data**, not before — a rule with no populated source is untestable.
When it comes: the role split is the interesting half. A manager comping their own food carries no
second signature, which is exactly what a controls rule is for, and splitting employee from manager
lets each be held to its own bar instead of one blended rate.

## Scope discipline

**In:** the `register_type` column, the PK migration, the consumer audit, the backfill, the pull
change, and CASH-004's flag.

**Out:** new meal rules (above), and any new panel. If the consumer audit turns out larger than it
looks, **stop and report rather than pushing through** — a half-migrated grain on a table 30 files
read is worse than an un-migrated one.

## Verification bar

- **Prove the collision first.** Write the failing case — same `(loc, date, emp)` with two register
  types — and show it overwrites on today's PK and doesn't on the new one. That test is the dispatch.
- Existing `audit_rows` consumers unchanged in behaviour for cashier-only data — the migration must
  be a no-op for every current reader until someone opts into the new dimension.
- `npm run build` clean, and **check `node -v` against `ci.yml`'s matrix** before trusting a local
  green (dispatch #60).
