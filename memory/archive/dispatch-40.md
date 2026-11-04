# Dispatch #40 — Security build Phase 1b: inventory-domain TvA rule

**Board (2026-08-20), at time of writing:** Dispatch #39 (Phase 1, cash-domain rules) is merged
as a brief, not yet implemented. Its own "TvA not buildable" claim was wrong and has been
corrected in-place (`dispatch-39.md`'s correction note) — the owner pushed back same-day: *"We
need to fix the reason it can't be built. We definitely either already have what we need or can
get it."* Correct. This dispatch is that follow-through: a real, buildable, store-level TvA rule
against data Meridian is **already pulling today**, no new QSRSoft probe or recipe/BOM pull
required to ship a first version.

**Read before starting:** `memory/dispatch-39.md` (the cash-domain rules this dispatch runs
alongside — same registry, same interpreter, do not duplicate any of it) and its correction note
in full; `memory/plan-security-loss-prevention.md` §2.2 (the TvA method definition) and §1
principle 1 (exposure normalization — never count raw events).

---

## The finding that makes this buildable — verified directly, not re-asserted

QSRSoft already computes TvA server-side and Meridian already pulls the result. Confirmed by
reading the real schema and pull script, not inferred:

- **`qsr_variance_stat`** (`supabase/schema.sql:1361-1379`, additive columns `:1408-1414`) — grain
  **store × month × item (WRIN)**, PK `(loc, period, wrin)`. Real columns: `loc, period, wrin,
  cls, descr, raw_waste, comp_waste, exp_usage, act_usage, variance, dol_diff, yield_val,
  pct_sales, raw_item_id, yield_lo, yield_hi`. `exp_usage` **is the theoretical-usage figure** —
  computed by QSRSoft's own recipe engine, not reconstructed from POS-sales × BOM math. `dol_diff`
  (`scripts/qsrsoft-variance-pull.mjs:287`, sourced from `mapVarianceRows`,
  `src/engine/eom-parsers.js:20-43`) is a **real, already-dollarized variance figure** for
  food/paper items (`ri:1`) — no per-item cost lookup needed. Pulled daily, all 27 stores
  (`.github/workflows/qsrsoft-variance-pull.yml`).
- **Recipe/BOM data is confirmed NOT needed for this dispatch.** The only recipe-adjacent thing
  ever pulled is a boolean `recipe_item` flag on `qsr_onhand` (count-cycle active/inactive
  denominator, unrelated). QSRSoft's real "Menu Items - Recipes" report (`memory/qsrsoft-kb-
  digest.md:12,39`) has never been probed or ingested — and doesn't need to be for a first rule,
  because `exp_usage` already IS the theoretical number, computed server-side. The recipe report
  only becomes necessary for a *later, deeper* capability — tracing a flagged item's variance back
  to which specific menu item drove it — not for detecting that a variance exists. Do not scope
  a recipe pull into this dispatch; it's real future work, not a blocker.
- **Condiment-class caveat**: items with `ri:0` (condiments) have no dollar figure — `dol_diff` is
  forced to `0` by `mapVarianceRows` itself. Either exclude condiment-class rows from a
  dollar-normalized rule, or run a parallel unit-variance-only variant for them. Don't silently
  include them in a `dol_diff`-based rule — they'll read as zero-variance regardless of reality.

## What's already there — do not rebuild any of this

- **`src/engine/security-rules.js`'s `evaluateRule()`** — fully generic, no dependency on `emp`
  or any specific column name. A rule with `data_required: ["qsr_variance_stat"]` plugs in exactly
  like `CASH-001`-`CASH-004` do against `audit_rows`. **Zero interpreter changes needed.**
- **`src/engine/security-baselines.js`'s `storeBaseline()`** — also usable as-is. It groups by
  `r.loc` with no `emp` reference at all (`security-baselines.js:98-103`), which is exactly the
  right shape for a store-level (not employee-level) rule. **`personalBaseline()`/`peerBaseline()`
  cannot be used for this data** — both hard-require `r.emp === emp` (`:68`, `:87`), which
  `qsr_variance_stat` rows don't carry. `networkBaseline()` also can't be used here — despite the
  name, it groups by `r.emp` too (`:108`), i.e. it's "every other employee, org-wide," not a
  store-network analog; there's no existing function for "every store, org-wide" beyond what
  `storeBaseline()` already gives by comparing one store against the pooled rest.
- **One small, real row-shaping step the batch job DOES need** (not a `security-baselines.js`
  change): every baseline function filters via `inWindow(r.date, start, end)`
  (`security-baselines.js:24-26`), a string comparison against `r.date`. `qsr_variance_stat` rows
  carry `period` (`'YYYY-MM'`), not `date`. Map `period` → a `date`-shaped field when building the
  rule's `dataContext` (e.g. `period + '-01'`), or pass `start`/`end` as `'YYYY-MM'`-shaped bounds
  — the string comparison still works correctly at month granularity either way. Do this in the
  new batch job's own data-loading step, not inside `security-baselines.js`.

## The rules

**`INV-001` — Item-level TvA variance rate vs. expected usage, store baseline.**
- `data_required: ["qsr_variance_stat"]`, `logic_type: 'ratio'`.
- `logic_expression: {numerator: {field: "variance", agg: "sum", abs: true}, denominator:
  {field: "exp_usage", agg: "sum"}, scale: 100, comparator: "gte"}` — this is plan §2.2's formula
  (`variance_pct = (actual − theoretical)/theoretical × 100`) computed from one table, no join.
- `baseline_type: 'store'` — this store's variance rate for an item/class vs. `storeBaseline()`'s
  pooled rate across other stores for the same item/class and window.
- Exclude condiment-class (`ri:0`) rows per the caveat above, or scope a parallel unit-only
  variant — state which one you land on and why, don't leave it unexamined.
- `opportunity_factor: false` — no access/authority dimension exists in this data (same finding
  as `CASH-004` for `audit_rows`).

**`INV-002` — Dollar-variance rate normalized against sales, store baseline.**
- `data_required: ["qsr_variance_stat"]`, `logic_type: 'ratio'`, numerator `dol_diff` (abs, sum).
- **Denominator needs a decision, not a guess — two real paths, pick one and state why:**
  1. `pct_sales` may already be QSRSoft's own "item variance $ / item sales $" figure (persisted
     from `r.percentage`, `eom-parsers.js:35`) — if so, this rule needs no join at all. **Its
     exact semantics are unconfirmed from this sandbox** — no comment, test, or prior probe
     settles what `percentage` actually measures. Confirm via a live read of real
     `qsr_variance_stat.pct_sales` values against known-good store/item sales figures (the owner
     or a live session can do this in minutes; this sandbox cannot) before trusting it as the
     exposure denominator.
  2. If `pct_sales` doesn't mean what's assumed, fall back to a real cross-table join: store-period
     net sales (from `qsr_fob` or a DAR-derived aggregate) joined onto `qsr_variance_stat` rows
     before calling `evaluateRule`, matching `CASH-001`'s own `scale: 1000` per-thousand
     convention. This is real, if small, preprocessing the batch job would own — the interpreter
     itself needs no change either way, since it just reads whatever numeric fields the rows carry.
- `baseline_type: 'store'`.

## A real schema design decision this dispatch must make deliberately — `security_findings`

Dispatch #39 §2 speced `security_findings` with `emp_token` as a required subject column ("the
single most important design constraint in this dispatch... never `emp`"). **That's still correct
for cash-domain findings** — don't relax it there. But `INV-001`/`INV-002` findings have no
employee to attribute at all; the subject is `(loc, wrin, period)`, not a person.

**`supabase/schema-security-findings.sql` does not exist yet** (confirmed — no migration to
undo), so design this correctly from the start rather than discovering the gap mid-build:

- Make `emp_token` **nullable**.
- Add `wrin text null` as a co-equal subject column, alongside the existing `loc`.
- A row is valid with exactly one subject populated: `emp_token IS NOT NULL AND wrin IS NULL` for
  a cash-domain finding, `emp_token IS NULL AND wrin IS NOT NULL` for an inventory-domain one. A
  `check` constraint enforcing this (not just a convention) is worth adding — a finding with
  neither or both populated is a bug, not a valid state.
- **Do not build a fully generic polymorphic `subject_type`/`subject_id` design for this** — two
  concrete subject shapes (employee, store-item) is what Phase 1/1b actually need; a generic
  system is speculative scope this dispatch doesn't require. If a third subject shape (e.g. a
  vendor, for §2.5 segregation-of-duties later) shows up in a future phase, revisit then.

## The scheduled batch job

Same job dispatch #39 specs (`scripts/security-rules-run.mjs`), not a second one — this dispatch
adds `INV-001`/`INV-002` to the same active-rules loop, reading `qsr_variance_stat` instead of
`audit_rows` for those two rule IDs, writing to the same `security_findings` table with
`wrin`/`loc` populated and `emp_token` null. If dispatch #39 is implemented first, this is an
additive change to that job's rule-type dispatch, not a new script.

## Explicitly not in this dispatch

- **The "Menu Items - Recipes" pull** — confirmed not needed for `INV-001`/`INV-002` (see the
  finding above). Real future work for a deeper drill-down capability, not scoped here.
- **`qsr_raw_item_detail`-based "as-counted" variant** — `src/engine/eom-variance-raw.js`'s
  `latestVarianceByWrin()` already exists and could feed a more current (less-lagged) version of
  these rules, but it requires flattening a nested `history` jsonb array first, a real
  preprocessing step `qsr_variance_stat` doesn't need. Optional future stretch, not required for
  a first shippable version — `qsr_variance_stat`'s lag is real (owner-confirmed,
  `eom-variance-raw.js:4-7`) but not disqualifying for a rule with a `window_days` rolling period.
- **The never-called `stat_variance/daily` endpoint** (`eom-parsers.js:10` documents it; grepped
  `scripts/`/`src/` for it — zero call sites) — a possible cheap way to reduce the pull's lag
  without touching the raw-history path, flagged for whoever next touches
  `qsrsoft-variance-pull.mjs`, not scoped into this dispatch.
- **Employee-attributed inventory findings** — needs shift-correlation (who had access/opportunity
  during the variance window), a genuine cross-domain correlation problem (plan §3), real Phase
  2/3 scope, not a single-table ratio rule.
- Any change to `security-rules.js`, `security-baselines.js`, or `CASH-001`-`CASH-004` — untouched.

## Verification approach

- Same pattern as `CASH-003`/`CASH-004`: `INV-001`/`INV-002`'s `logic_expression` round-tripped
  through `evaluateRule()` against a realistic `qsr_variance_stat` fixture.
- **`pct_sales`'s real semantics cannot be verified from this sandbox** — this is the one thing in
  this dispatch that needs a live data check before `INV-002` ships with real thresholds. State
  this plainly rather than guessing; `INV-001` alone is fully buildable and verifiable without it.
