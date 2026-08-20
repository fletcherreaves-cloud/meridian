# Dispatch #40 — Security build Phase 1b: inventory-domain TvA rule

2026-08-20. `memory/dispatch-40.md`. Runs alongside dispatch #39's cash-domain rules
(`memory/dispatch39-phase1-cash-rules.md`) in the SAME rules registry (dispatch #36), SAME
interpreter (`src/engine/security-rules.js`, unmodified), SAME batch job
(`scripts/security-rules-run.mjs`, extended not duplicated). No change to `security-rules.js`,
`security-baselines.js`, or `CASH-001`–`CASH-004`.

## The finding that makes this buildable

Dispatch #39's own "TvA not buildable — no theoretical-usage table exists" claim was wrong, and
the owner pushed back same-day: *"We need to fix the reason it can't be built. We definitely
either already have what we need or can get it."* Correct — verified directly, not re-asserted:

- **`qsr_variance_stat`** (`supabase/schema.sql:1361-1379`) — grain store × month × item (WRIN),
  PK `(loc, period, wrin)`. `exp_usage` **is** the theoretical-usage figure, computed server-side
  by QSRSoft's own recipe engine — not reconstructed from POS-sales × BOM math in this codebase.
  `dol_diff` is a real, already-dollarized variance figure for food/paper items — no per-item cost
  lookup needed. Pulled daily, all 27 stores.
- **Recipe/BOM data confirmed NOT needed.** The only recipe-adjacent pull today is a boolean
  `recipe_item` flag on `qsr_onhand` (count-cycle denominator, unrelated). QSRSoft's real "Menu
  Items - Recipes" report has never been probed and doesn't need to be for this dispatch —
  `exp_usage` already is the theoretical number. That report only matters for a later, deeper
  capability (tracing a flagged item's variance back to which menu item drove it), not detecting
  that a variance exists.
- **Condiment-class caveat**: items with `ri:0` have `dol_diff` forced to `0` by `mapVarianceRows`
  itself (`src/engine/eom-parsers.js`) — they'll read as zero-variance regardless of reality on
  any `dol_diff`-based rule.

## What's already there — reused exactly as-is

- **`evaluateRule()`** — fully generic, no dependency on `emp` or any specific column name. A rule
  with `data_required: ["qsr_variance_stat"]` plugs in exactly like `CASH-001`–`CASH-004` do
  against `audit_rows`. Zero interpreter changes.
- **`storeBaseline()`** — groups purely by `r.loc`, no `emp` reference at all — exactly the right
  shape for a store-level (not employee-level) subject. `personalBaseline()`/`peerBaseline()`
  **cannot** be used for this data (both hard-require `r.emp === emp`); `networkBaseline()` also
  can't — despite the name it groups by `r.emp` too ("every other employee, org-wide"), not a
  store-network analog. There's no existing "every store, org-wide" function beyond what
  `storeBaseline()` already gives by comparing one store against the pooled rest.

## What was built

**`supabase/schema-security-rules-phase1b.sql`** — idempotent, additive:

- **`INV-001` — item-level TvA variance rate vs. expected usage, store baseline.** Plan §2.2's own
  formula (`|variance| / exp_usage × 100`), single-table, no join. `opportunity_factor: false` —
  no access/authority dimension exists in this data (same finding as `CASH-004`). Threshold (20 =
  20% variance) is a first guess, unmeasured from this sandbox, same tier as every other rule in
  this build.
- **`INV-002` — dollar-variance rate normalized against sales, store baseline.** Numerator
  `dol_diff` (abs, sum). **Denominator was a real decision, not a guess**: `qsr_variance_stat
  .pct_sales`'s actual semantics are **unconfirmed from this sandbox** — no comment, test, or
  prior probe settles what QSRSoft's `percentage` field measures. Rather than trust an unverified
  column as a detection rule's exposure denominator, this uses the real cross-table join instead —
  `qsr_fob.prod_sales_amt` summed per `(loc, month)`, attached to each variance row as
  `storeMonthSales` by the batch job before `evaluateRule` ever sees it. `scale: 1000` matches
  `CASH-001`'s own per-$1,000-sales convention, per the dispatch's explicit instruction — this is
  **not** the same unit as `INV-001` (usage-normalized vs. sales-normalized), by design.
- **Condiment exclusion applied uniformly to BOTH rules** — decided in the batch job, not SQL:
  even `INV-001`'s ratio, whose numerator isn't literally zeroed for condiments, is prone to false
  positives on their inherently low/noisy unit-usage figures. One stated policy, not a per-rule
  special case.
- **Field names in `logic_expression` are camelCase** (`expUsage`, `dolDiff`, `storeMonthSales`),
  matching `mapVarianceStatRow()`'s actual output — **not** `qsr_variance_stat`'s raw snake_case
  columns, which the dispatch's own prose quotes (correctly, for readability) as `exp_usage`. This
  mirrors `CASH-001`–`004`'s own convention (`manualRefAmt`/`drawerSales`, not
  `manual_ref_amt`/`drawer_sales`). **A real bug this avoided**: a snake_case field name in the
  seed SQL would have silently resolved to `undefined` in `evaluateRule()`'s `aggField()`, and
  every `INV-001` finding would have read as "no exposure" — exactly the silent-zero-field class
  CLAUDE.md's loader-field-map rule exists to catch elsewhere in this codebase. Caught by
  cross-checking the mapper's real output against the seed SQL before writing either finding, not
  discovered later by a failing test.

**`supabase/schema-security-findings.sql`** — **needed zero changes.** Dispatch #39 built its
dual-subject shape (nullable `emp_token` + co-equal `wrin` column, `check` constraint enforcing
exactly one subject, NULL-safe `subject_key` generated column as the real upsert-conflict target)
in direct anticipation of this exact dispatch, before the table ever went live. That bet — made
same-day off a PM relay heads-up, before dispatch #40 itself had even arrived — paid off exactly
as intended: this dispatch adds `wrin`-subject findings with zero migration.

**`scripts/security-rules-run.mjs`** — extended with a second rule-type branch in the SAME
active-rules loop, not a second script:

- `dataRequiredList(rule)` — refactored out of the pre-existing `supportsAuditRows()` so both
  branches share one parsing path.
- `supportsVarianceStat(rule)` — the new branch's own support check, parallel to
  `supportsAuditRows()`.
- `mapVarianceStatRow(r)` — snake_case → camelCase, **`date: r.period`** (not `period + '-01'`).
  This is the dispatch's own explicit instruction and a real, non-obvious correctness point:
  `security-baselines.js`'s `inWindow()` does a plain string comparison against `r.date`. If the
  row's date were `'2026-08-01'` while the window bound stayed `'2026-08'` (this job's period
  bounds), the comparison would silently exclude the row — a shorter string that's a proper prefix
  of a longer one compares *less than* it in JS, so `'2026-08-01' <= '2026-08'` is `false`. Keeping
  both the row's date and the window bounds as plain `'YYYY-MM'` strings throughout
  `computeItemFindingsForRule` sidesteps this entirely, with zero `security-baselines.js` changes.
- `joinStoreMonthSales(varianceRows, fobRows)` — the `qsr_fob` join, pure, no Supabase dependency,
  unit-tested directly (leap-year month-end, cross-month bleed, and a no-match → `null` case).
- `periodEndDate(period)` — last real calendar day of a `'YYYY-MM'` period, used only where a
  `'YYYY-MM'`-internal window bound has to become an actual `date` value for storage
  (`security_findings.window_start`/`window_end` are real `date` columns, not text).
- `computeItemFindingsForRule(rule, rows, {windowStart, windowEnd})` — the item-domain parallel to
  dispatch #39's `computeFindingsForRule()`. Subject is `(loc, wrin)`, never a person. Groups
  distinct pairs, evaluates via the unmodified `evaluateRule()`, and computes `storeBaseline()`
  against a row set **pre-filtered to the same `wrin`** — "this store's rate for item X vs. other
  stores' rate for that SAME item X," never pooled across unrelated items (a beef-patty variance
  rate isn't comparable to a napkin one). This filtering is caller-side, not a
  `security-baselines.js` change — `storeBaseline()` already groups by `r.loc` alone; handing it a
  same-item-only row set is all that's needed.
- `main()`'s per-rule loop now branches on `supportsAuditRows(rule)` vs. `supportsVarianceStat(rule)`
  (still falling through to the "not yet supported, skip" warning for anything else), with
  separate caches for `audit_rows` (date-range keyed) and `qsr_variance_stat`/`qsr_fob` (period-
  range keyed, converted from `window_days` to a whole-month count — `INV-001`/`002`'s 90-day
  default lands on a 3-month rolling window).
- `upsertFindings()` now maps `f.wrin ?? null` alongside `f.empToken ?? null` — the same
  `subject_key`-based `onConflict` target already correctly handles both subject types, since it
  was built wide from the start (see above).

## Verification approach

- 11 new fixture tests (`security-rules-run.test.js`), same hand-computed-values discipline as
  dispatch #39: `mapVarianceStatRow` field round-trip, `dataRequiredList`/`supportsVarianceStat`,
  `periodEndDate` (including a leap-Feb case), `joinStoreMonthSales` (cross-month bleed guard, a
  no-match → `null` case), and `computeItemFindingsForRule` against a 2-store/1-item/1-condiment
  fixture proving: the condiment item never becomes a subject and never pollutes a same-item store
  baseline; the store-baseline population is correctly restricted to the same `wrin`;
  `storeBaseline`'s `excludeSelf` keeps a store from baselining against its own rate; and internal
  `'YYYY-MM'` window bounds convert correctly to real calendar-date finding bounds.
- 24/24 tests in this file, 1663/1663 full suite, `npm run build` clean (no bundle-size impact —
  this is a backend/scripts-only change, no `src/` panel code touched).
- **`pct_sales`'s real semantics cannot be verified from this sandbox** — the one open item this
  dispatch explicitly flagged. `INV-002`'s current threshold is unmeasured pending that check;
  `INV-001` is fully buildable and verifiable without it (single-table, no denominator ambiguity).

## Explicitly not in this dispatch

The "Menu Items - Recipes" pull (confirmed not needed, see above — real future work for a deeper
drill-down capability). `qsr_raw_item_detail`-based "as-counted" variant
(`eom-variance-raw.js`'s `latestVarianceByWrin()` — optional future stretch, requires flattening a
nested `history` jsonb array first). The never-called `stat_variance/daily` endpoint (flagged for
whoever next touches `qsrsoft-variance-pull.mjs`, not scoped here). Employee-attributed inventory
findings (needs shift-correlation, a genuine cross-domain correlation problem, real Phase 2/3
scope). Any UI/panel — same substrate-first sequencing as dispatch #39 (a findings-viewer covering
both cash- and inventory-domain findings together is a natural next dispatch once both are real).

## What's needed to close this out for real

Owner runs `supabase/schema-security-rules-phase1b.sql` (in addition to dispatch #39's two files,
if not already applied) against live Supabase — no order dependency between `-phase1.sql` and
`-phase1b.sql`, both are additive to `security_rules`. Real `security_findings` output for
`INV-001`/`INV-002` is what actually tunes their threshold numbers, and is also the only way to
settle `pct_sales`'s real semantics (a live read of real values against known-good store/item
sales figures) — neither is computable from this sandbox.
