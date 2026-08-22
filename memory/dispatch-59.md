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

---

## Addendum (2026-08-22) — the four questions, answered from measurement

The engineer asked four scoping questions before touching a live table. Answers below were
verified against the code, not recalled. **Where this addendum is more specific than the body
above, the addendum wins** — the body's "30+ referencing files" was a file count, not a
consumer audit, and a file count is not an answer to a grain question.

### 1. Is `registerType` collection additive, or bigger?

**The pull change is one line. The migration under it is the dispatch.**
`scripts/qsrsoft-register-audit-pull.mjs:295` sends `registerType: 'cashier'` as a **query
parameter**, so the API returns per-`(date, employee)` rows *filtered to that one register type*.
Collecting the other two means calling the endpoint three times (or once per type) and
concatenating. That part is genuinely small.

What is not small: today `registerType` is a constant, so it never had to be a column. The moment
three values exist, it becomes part of the row's identity — see Q2.

### 2. Does register-type join the row key, or is it a new column?

**Both, and they are the same edit.** It must be a new column *and* enter the PK.

Verified: `audit_rows` upserts on `onConflict: 'loc,date,emp'`
(`scripts/qsrsoft-register-audit-pull.mjs:174`, mirrored in `src/lib/supabase.js:859` —
the pull's own comment at :130 says the mapping was copied verbatim from there, so **both call
sites change or the two writers disagree**).

One person can work a Cashier drawer and a Manager drawer on the same day. On today's PK the
second row silently overwrites the first — not an error, just a lost row. So the PK becomes
`(loc, date, emp, register_type)`, backfilled `'cashier'` `not null default` so no existing row
is ambiguous.

So: **one employee-day becomes up to three rows.** That is the grain change, and it is why Q4
matters more than Q1.

### 3. What is the actual meal-signal rule?

**No rule yet — and deliberately not in this dispatch's scope.** The body already puts new meal
rules under **Out**. `employee_meal` / `manager_meal` are two of dispatch #58's eight
`event_token`s, so their event-level detail arrives free once #58's pull runs — but **#58's pull
is currently blocked on an auth question** (403 on `api.security`, three causes eliminated, one
header-comparison test outstanding). A rule written against an unpopulated source is untestable,
so it is sequenced after, not now.

What #59 *does* owe the meal rules is the column they will need: a manager comping their own food
carries no second signature, and holding manager-comps and crew-comps to one blended rate is the
thing `register_type` exists to stop. **Build the dimension; leave the rule.**

The one rule change **in** scope is **CASH-004's `opportunity_factor`**, which is already shipped
`FALSE` with the reason stated in the SQL itself
(`supabase/schema-security-rules-phase1.sql:60`): *"no role/authority column exists in
`audit_rows` to check against yet."* Revisit it with the same "examined not assumed" discipline
the original comment used — confirm the rule reads the new column and that its threshold still
means what it meant on a cashier-only population. **Do not flip it blind.**

### 4. Which readers assume the current grain? — two, and one breaks silently

Of the ~40 files touching `audit_rows`, most are changelogs, `.sql` migrations, or tests. **Two
computation sites encode the one-row-per-employee-day invariant.** Grep found them; both were read.

**🔴 `src/utils/register-audit.js:12` — `const key = r.loc+'::'+r.emp`, and `e.days++` at :21.**
The key omits `date` deliberately (it rolls a window up per employee), so `days` counts *rows*
as a proxy for *days worked*. Post-change an employee on two register types in one day scores
`days = 2`. This one is **mixed, not uniformly broken**, which is the trap:
- **Dollar and count sums are correct to keep adding** — `totalSales`, `promoAmt`, `tRedACnt`,
  `posOverAmt` etc. are genuinely separate drawers, so summing them across register types is the
  right answer and needs no change.
- **`days` and anything derived from it is wrong**, as is `avgCashOS` at :73
  (`/ results.length`) and `cashOSDays` at :22.

**🔴 `src/engine/security-baselines.js:69` — `personalBaseline`.** Its own comment at :61 states
the invariant outright: *"Distribution is PER-DAY (one rate per qualifying row in the window)."*
That equivalence — **one row = one day** — is precisely what this dispatch breaks. After the
change an employee contributes two or three observations for a single day, inflating `n` and
double-weighting that day in `mean`/`stdev`. Every z-score built on it shifts, with no error
anywhere. **This is the silent one.**

**Safe, verified, no change needed:**
- `personalBaseline`'s `overall` (:72) — dollar-weighted via `exposureRate`, so extra rows
  aggregate correctly.
- `peerBaseline` (:88) and `storeBaseline` (:100) — both `groupBy` then dollar-weight; extra rows
  fold in cleanly.
- **RLS.** `audit_rows` appears only inside table *lists* in `schema-rls-phase2-loc.sql:34` and
  `schema-multitenant-phase2-rls.sql:47` (loc-scope + tenant-scope, generated per table). A new
  column does not touch either. **No RLS work in this dispatch** — this is not #58's situation.
- `security-rules.js`, `security-drilldown.js`, `metric-source.js` — no `(loc,date,emp)` grouping
  found.

### The decision this forces, stated plainly

`personalBaseline` is where "some consumers want the sum, some want cashier-only" (body item 2)
stops being abstract. Pick one and write down why:
- **collapse to one row per employee-day before computing `perDay`** — preserves today's meaning
  exactly, and is the conservative choice; or
- **keep per-register-type observations** — a defensible different metric, but it is a *new*
  baseline, and any stored baseline computed under the old meaning must be recomputed, not
  continued.

**A baseline that silently changes meaning is worse than one that breaks.** Whichever is chosen,
the test asserts it.

### Verification bar (unchanged, plus)

- **Prove the collision first** — same `(loc, date, emp)`, two register types: show it overwrites
  on today's PK and does not on the new one. That test is the dispatch.
- **Add a test that pins `personalBaseline`'s observation count** for an employee with two
  register-type rows on one date. Per the standing revert rule: it must fail if the collapse
  decision is reverted, so it has to call `personalBaseline`, not just the row builder.
- Cashier-only data must be **behaviourally identical** before and after, for every consumer.
- `npm run build` clean, and **check `node -v` against `ci.yml`'s matrix** before trusting a local
  green (dispatch #60).

## ✅ Shipped (2026-08-22, v5.103)

**The migration.** New `supabase/schema-audit-rows-register-type.sql` — `add column if not
exists register_type text not null default 'cashier'`, then unconditional `drop constraint if
exists` + `add constraint` on the PK (Postgres has no `ADD CONSTRAINT IF NOT EXISTS` for a
primary key, so drop-then-add is the idempotent shape, not a guarded `do $$` block). Also updated
`schema.sql`'s own `CREATE TABLE` so a fresh install starts with the correct grain — that file
doesn't itself migrate the live table (`create table if not exists` no-ops against one that
already exists), the incremental file does that.

**The pull.** `scripts/qsrsoft-register-audit-pull.mjs`: `REGISTER_TYPES = ['cashier', 'manager',
'preparer']` (exported), `buildUrl(startDate, endDate, registerType='cashier')`,
`mapRow(r, registerType='cashier')` (the API returns no such field — it's the request filter
that produced the response, so the caller supplies it). `runAll()`'s chunk loop gained a nested
register-type loop; `main()`'s `requestedUnits` now lists `(chunk, registerType)` pairs to match
— missed on the first pass, then caught: `tracker.finalize()`'s `failRate = failed/requested`
would have gone wrong (any single register-type's calls failing would report against the OLD
1x-per-chunk denominator) if `requestedUnits` had stayed chunk-only while `runAll()`'s own `unit`
strings became 3x-per-chunk. `src/lib/supabase.js`'s `saveAuditRows`/`loadAuditRows`/
`loadAuditRowsWindow` all updated together (onConflict, select list, camelCase mapping).

**The consumer audit — exactly the two sites the addendum predicted, no others.**
`src/utils/register-audit.js`: `days`/`cashOSDays` now built from `Set`s of `dateKey(r.date)`
(handles both the `Date`-object and raw-string wire shapes different loaders return), finalized
once per employee after the accumulation loop. `src/engine/security-baselines.js`:
`personalBaseline()`'s `perDay` now groups `subject` by `dateKeyOf(r.date)` first
(`groupBy` — already existed, reused) and rates each day's combined rows, not each raw row. Both
fixes are no-ops on cashier-only data (still 100% of history until the pull's next real run) —
demonstrated, not assumed: each was reverted to its pre-fix form and the new tests were shown to
fail, then restored and shown to pass again.

**`computeFindingsForRule()` — verified safe empirically, not just by reading.** Added a test in
`security-rules-run.test.js` that hands a real Manager-register row (same date as an existing
Cashier row) through the actual call site: `value` correctly sums across both register types
((6+10+2)/3000*1000=6, not the cashier-only 4), and `baselineContext.n` stays 2 (two collapsed
days), not 3. `peerBaseline`/`storeBaseline`/`evaluateRule`'s own aggregation needed no change —
confirmed by that same test, not asserted.

**CASH-004.** New `supabase/schema-security-rules-cash004-authority.sql` flips
`opportunity_factor` to `true` and rewrites the description. Grepped `security-rules.js` (the
one interpreter, per its own header) before flipping: zero references to `rule.opportunity_factor`
anywhere in the evaluator — it's a documentation column (`schema-security-rules.sql`'s own
comment: "does this rule need an access/authority check to fire meaningfully"), not a runtime
gate. So this is a metadata correction reflecting the now-met precondition, not a computed-value
change — `logic_expression` and the summed-across-all-register-types population are untouched.

**Not built, per the dispatch's own scope:** meal-signal rules on `employee_meal`/`manager_meal`
(sequenced after #58's pull has data — #58 is still blocked on its own auth question), any new
panel, pay surfacing.

2005/2005 tests (16 new): `register-audit-pull.test.js` (registerType passthrough, `buildUrl`'s
query param, and the PK-collision proof itself — a plain upsert-semantics simulator showing the
old key collapses two rows to one and the new key keeps both); `register-audit-units.test.js`
(two register-type rows on one date count as one day, not two; two distinct dates still count as
two); `security-baselines.test.js` (the collapse decision, pinned against the real
`personalBaseline()` call, plus the multi-type day's combined rate and the unaffected
dollar-weighted `overall`); `security-rules-run.test.js` (the empirical "no change needed" proof
above). Build clean, no client-bundle size change (all touched files are engine/pull-side, not
imported by any lazy panel differently than before).
