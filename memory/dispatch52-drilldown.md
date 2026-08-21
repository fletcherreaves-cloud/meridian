---
name: dispatch52-drilldown
description: Dispatch #52, done. The Security panel's drill-down -- five measurements scoped from the real store 0013113 investigation, not Part C's wish list, generalized to both cash (employee) and inventory (item) subjects. Plus the rider that closed the schema-drift class -- found 15 real instances (not 1) while building the guard, including audit_rows.emp_token, the identity-reveal system's own key column.
metadata:
  node_type: memory
  type: finding
---

# Dispatch #52 — the drill-down, and the rider that found 15 real schema-drift instances

**2026-08-21.** Executes `memory/dispatch-52.md` in full: the five measurements from the store
0013113 investigation, generalized to both subject types, plus the schema-drift rider.

## The drill-down

New `src/engine/security-drilldown.js` — pure, unit-tested functions computing all five
measurements from `memory/dispatch-52.md`'s own ordering:

1. **Flag rate by store** (`flagRateByStore`) — flagged subjects ÷ total subjects present at that
   store, not a raw count. Compares the subject's store against the mean of every OTHER store.
2. **Cross-store prevalence** (`crossStorePrevalence`) — for each of the subject's own flagged
   discriminators, how many stores flag the same one. Inventory: the item (wrin). Cash: no
   repeatable "item" exists on an employee, so the discriminator is the RULE itself — same
   question either way, "is this local or does it fire everywhere."
3. **Composition vs. estate** (`compositionVsEstate`, inventory only) — the paper/food class split
   of the subject's flags vs. the estate's, with a two-proportion z (reproduces the finding's own
   82.1%/47.0%/~3.7σ numbers exactly, verified in the test suite). **Cash does NOT get a
   statistical claim here** — a subject typically flags on 1–4 rules, and a z-test on that few
   points would be exactly the "confident-sounding wrong answer" CLAUDE.md warns against. Cash
   instead gets a purely descriptive rule-mix table (this subject's flagged rules, each one's
   share of the estate's OTHER flags).
4. **Period trend** (`periodTrend`) — median value per period, oldest to newest, no flat/step/
   improving classification asserted by the code (the finding's own "flat-and-improving" was a
   description of a table, not a query output).
5. **Secondary metrics vs. estate** (`secondaryMetrics`) — item count / uncounted rate (exp_usage
   >10, matching the finding's own methodology) / waste logged / median variance for inventory;
   the subject's OTHER cash rates (not the ones they're flagged on) vs. their store peers for cash.

Every function returns the subject's number ALONGSIDE the baseline — the standing rule from the
dispatch's own closing section, "the refutation must be as cheap as the claim."

**Wired into the real panel**, not just the engine: `SecurityPanel`'s `SubjectDetail` renders a new
`SubjectDrilldown` component with a "🔎 Investigate further" button. Nothing fetches until clicked
— on-demand, matching dispatch #43's eager-load discipline (`auditRows` was deliberately pulled
out of the startup batch under #191; this must not reintroduce that cost). One on-demand loader was
new: `loadAuditRowsWindow({start,end})` in `src/lib/supabase.js` (bounded, all-stores, minimal
columns, 5-minute cache) — the inventory side needed no new loader, `loadQsrVarianceStat` and
`loadQsrVarianceHistoryAll` already existed and already carry everything metrics 1/3/4/5 need.

**Verification**: `src/__tests__/security-drilldown.test.js` (26 tests, pure functions, including a
fixture that reproduces the finding's own 82.1%/47.0%/z>3 numbers exactly) plus
`src/__tests__/security-panel.test.js`'s new "dispatch #52" describe block — renders the real
`SecurityPanel`, clicks through to expand a subject and click "Investigate further," and asserts
the computed numbers appear in the DOM. This is the render-based check the dispatch's own closing
rule requires ("a test asserting a query's shape passes with the panel unwired").

## The rider — 15 real instances, not 1

The rider asked for a test parsing `ALTER TABLE ... ADD COLUMN` across `supabase/*.sql` and
asserting each column also appears in that table's `CREATE TABLE` in `schema.sql`, mutation-tested
against the known `audit_rows.emp_id` instance. Building it found the class was much bigger than
that one instance — **15 columns across 7 tables**, including **`audit_rows.emp_token`, the column
the entire identity-reveal system (`reveal_employee_identity`, `get_or_create_employee_token`,
every `RevealName` call) is keyed on.** None of this was a hypothetical the test was built to
guard against going forward — it was live, present, undetected drift.

| table | columns missing from schema.sql's CREATE TABLE |
|---|---|
| `org_config` | `tenant_id` |
| `smg_fullscale` | `n` |
| `daily_glimpse_daily` | `emp_meal_amt`, `mgr_meal_amt`, `emp_meal_cnt`, `mgr_meal_cnt` |
| `sage_prompts` | `schedule_enabled`, `schedule_hour`, `schedule_freq`, `schedule_dow`, `last_run_at` |
| `qsr_onhand` | `active`, `recipe_item` |
| `qsr_waste` | `emp_token` |
| `audit_rows` | `emp_token` |

All 15 fixed in `schema.sql` in this same change, alongside their intent comments (which migration
added each). One redundant pre-existing block was also removed while fixing `sage_prompts` —
schema.sql itself carried a trailing `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` block for those
same five columns right after the table's own `CREATE TABLE`, which is now genuinely dead (the
columns are in `CREATE TABLE` directly) rather than doing real work.

**Scope, deliberately**: only tables `schema.sql` itself defines via `CREATE TABLE`. Several tables
(`graded_visits`, `employee_identity_vault`, `org_events`, `security_findings`, `tasks`, `identity_
reveal_log`, `qsr_daily_activity_rollup`) live ONLY in their own `schema-*.sql` file — `schema.sql`
is a consolidated baseline for tables that made it in, not a from-scratch single-file install, and
a migration targeting a table it doesn't define is a different (and not currently broken) question.
Also out of scope: `schema-multitenant-phase1.sql`'s dynamic `ALTER TABLE` via `format('...', t)`
inside a PL/pgSQL backfill loop — a static regex can't resolve a table name behind string
formatting, and that same file's own literal follow-up `ALTER` for `org_config.tenant_id` IS
checked normally (and was one of the 15).

**One real bug in the FIRST draft of the check itself**, caught before it shipped: splitting a
`CREATE TABLE` body naively on `,` glues a trailing `-- comment` onto the START of the next
column's fragment, which then fails the leading-identifier match and silently drops that column —
under-reporting real drift, the worst direction this kind of check can fail in. Comments are now
stripped before the comma-split. `schema-drift.test.js` pins both the parser bug (a unit test with
a comment-adjacent column) and the real-world case it would have hidden (the "reproduces the real
2026-08-21 drift, fully" test, which specifically checks for `emp_token`).

**Mutation-tested per the rider's own instruction**: temporarily removed `emp_id` from the live
`schema.sql` on disk, confirmed the enforcement test failed with the expected drift entry, restored
the file, confirmed green again. The permanent test suite also carries this as a standalone
fixture-based pair (`findSchemaDrift` flags the missing case, is silent once present) so the check
doesn't depend on ever mutating the real file again.

1856/1856 tests. Build clean, entry-chunk eager payload unchanged from Job A (no new static
imports — `security-drilldown.js` and the new loader are both reached only through
`security-panel.js`'s existing lazy chunk).
