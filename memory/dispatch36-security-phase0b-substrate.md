# Dispatch #36 — Security build Phase 0b: the substrate

2026-08-19. `memory/dispatch-36.md`, on top of `memory/plan-security-loss-prevention.md` §1/§6/§7.
Needs no QSRSoft access (pure schema/utility work) — not blocked on Phase 0a's still-open
live-verification (`memory/dispatch35-register-audit-implementation.md`).

## Part 1 — Rules Registry: table + interpreter

**`supabase/schema-security-rules.sql`** — `security_rules`, matching plan §6's schema
field-for-field: `RULE_ID, DOMAIN, SUBDOMAIN, METHOD, DESCRIPTION, DATA_REQUIRED, LOGIC_TYPE,
LOGIC_EXPRESSION, WINDOW (window_days), BASELINE_TYPE, THRESHOLD, SEVERITY, WEIGHT, CONFIDENCE,
OPPORTUNITY_FACTOR, CORROBORATION_RULES, EXONERATION_RULES, FALSE_POSITIVES,
INVESTIGATION_ACTION, SOURCE, VERSION, ACTIVE`.

**RLS design decision**: §6 explicitly names `org_config` as the precedent ("Matches this repo's
existing pattern for tunable config… same idea, new table"). `org_config`'s own RLS
(`supabase/schema.sql`) is authenticated-read-all + admin/supervisor-write, with **no**
`tenant_id` — it predates that standing rule. Copied the RLS *shape* from `org_config` but added
`tenant_id` per CLAUDE.md's "every new persistent data type... tenant_id + RLS." Considered
gating read more tightly (the "DO and above" policy `memory/data-acquisition-shopping-list.md`
sets for Register Audit *findings*) but rejected it: that policy is about individual employee
scores, a narrower and more sensitive concern than this table, which holds detection
logic/thresholds — config, not personnel data. Confirmed `profiles.role`'s actual DB-level check
constraint is `('admin', 'supervisor', 'manager')` only (`supabase/schema.sql:13`) — CLAUDE.md's
8-tier RBAC table (Developer/Admin/Owner/VP/DO/Supervisor/GM/Office Staff) is an app-level
concept not yet reflected as DB roles, so `get_my_role() in ('admin','supervisor')` (mirroring
`org_config` exactly) is what's actually enforceable today, not a wider role list that doesn't
exist in the DB.

**`src/engine/security-rules.js`** — the interpreter. `evaluateRule(rule, dataContext, {loc})`
takes a `dataContext` keyed BY the rule's own `data_required` entries (e.g. `{audit_rows: [...]}`)
rather than a flat row array, so a future cross-table rule (Phase 3) can be handed more than one
key without a signature change. Handles `LOGIC_TYPE` `threshold` and `ratio` — the two the
dispatch required. `z-score`/`sequence`/`window-function` are **stubbed**
(`{implemented:false, pass:null}`, never thrown) so a rule row of any `LOGIC_TYPE` the schema
accommodates can exist today without every consumer needing its own type-check first — building
those out is Phase 2 (change-point detection) / Phase 3 (sequence engine), out of scope here.

`pass` is `null` — never fabricated `false` — whenever a verdict can't be honestly computed: zero
exposure (empty denominator) or no threshold configured. This matters because a naive
"count how many rules failed" downstream must not silently count an un-evaluatable rule as a
clean pass.

**Seed rules**: 2 rows from plan §2.1 (cash-drawer over/short rate, POS overring rate),
`ACTIVE=false`. These are test fixtures proving the interpreter round-trips a real rule — the
`security-rules.test.js` suite uses the EXACT `logic_expression` JSON these rows carry, not an
invented shape, so the SQL and the interpreter are verified against each other, not just each
independently. Not a Phase 1 delivery — Phase 1's actual rule count/tuning is separate work.

## Part 2 — Baselines + exposure normalization

Checked `src/engine/metric-source.js` (full read, 590 lines) and `src/engine/vs-ly.js` (full
read) first, per the dispatch's own instruction and CLAUDE.md's "source data through the shared
helpers" standing rule. **Neither carries a rate-normalization or cohort-baseline primitive** —
`metric-source.js` is `ds`-driven per-(loc,date) metric *sourcing* (which upload/stream wins for
one number on one day), and `vs-ly.js` is store-level sales-vs-last-year matched-day comparison.
Grepped both for `1000`/`normalize`/`rate(` — no hits beyond an unrelated date-normalization
comment. This is genuinely new ground, not a 4th parallel path to something that already exists —
but `src/engine/security-baselines.js` follows their established conventions rather than
inventing new ones:

- **Dollar-weighted aggregation, never averaging an average.** Every "combine a rate across
  rows" step is `sum(numerator)/sum(denominator)*scale`, matching CLAUDE.md's standing rule —
  the same discipline `vs-ly.js`'s matched-day comparison and `metric-source.js`'s "derive
  per-day, not on aggregates" already enforce elsewhere in this codebase.
- **Honest nulls on zero exposure** — `exposureRate()` returns `null`, never `0`/`NaN`/`Infinity`,
  when the denominator is zero, matching `metric-source.js`'s own contract.

**`exposureRate(rows, {numField, denField, scale, abs})`** is the shared normalization
primitive — Part 2's own explicit deliverable. `scale` defaults to `PER_THOUSAND = 1000`, which
IS `memory/data-acquisition-shopping-list.md`'s stated convention ("we call the usage per
thousand… to normalize a low volume store versus a highline store"), not a new unit invented for
this dispatch.

**Four baseline functions**, each returning `{mean, stdev, n, values, ...}` — a distribution, not
a single blended number, per plan §1 principle 2:

| Function | Population | What it answers |
|---|---|---|
| `personalBaseline(rows, {emp, loc, ...})` | subject's own rows, one rate PER DAY | "different than they normally do" |
| `peerBaseline(rows, {emp, loc, ...})` | other employees, SAME STORE, one rate per employee | "different than comparable employees" |
| `storeBaseline(rows, {loc, ...})` | OTHER stores, all employees pooled per store, one rate per store | "different than comparable stores" |
| `networkBaseline(rows, {emp, ...})` | every OTHER employee, ORG-WIDE (no store boundary), one rate per employee | "unusual org-wide" |

**Data-limited design decision, stated explicitly rather than silently assumed correct**: plan
§1 principle 2 specifies peer cohorting by "same role/daypart/tenure/volume band." `audit_rows`
carries none of those dimensions (confirmed against `src/utils/register-audit.js` and
`parseRegisterAudit`'s column list) — `peerBaseline` uses same-store colleagues as the only
cohort the data actually supports today. Refining this once role/daypart/tenure data exists is
future work, not a redesign of the function's shape.

`personalBaseline` also returns a separate `overall` field — the dollar-weighted whole-window
rate — distinct from `mean` (the per-day distribution's mean). These are NOT interchangeable:
`mean`/`stdev`/`values` are the per-day distribution a future z-score `LOGIC_TYPE` needs;
`overall` is the single period-total figure a `threshold`/`ratio` rule (or a panel) should read.
Documented in-file so nothing accidentally substitutes one for the other.

**Event normalization / `audit_rows` shape** — re-read `src/utils/register-audit.js`'s
`analyzeRegisterAudit` (already fully read in dispatch #35) to confirm it covers a normalized
event record: who (`emp`), where (`loc`), when (`date`), how-tendered (cash/cashless split on
refunds specifically). Confirmed adequate for these baseline functions to consume directly, per
the plan's own "close to already shaped" note — extended nothing, no gap found worth flagging.

## Verified

- 22 new fixture tests (`security-rules.test.js`, `security-baselines.test.js`) — every expected
  value hand-computed in the test file's own comments (dollar-weighted rates, per-day/per-member
  distributions, mean/stdev via the population-variance formula). Two interpreter tests mirror
  the seed SQL's `CASH-001`/`CASH-002` `logic_expression` JSON exactly, so the schema file and
  the interpreter are verified against each other's actual shape, not independently guessed
  shapes that happen to both compile.
- 1618/1618 full suite passes (22 new, matching the 1596 baseline from dispatch #35 plus these).
  Build clean, unaffected (no `App.js` import — this is unwired substrate for Phase 1, not a
  bundled feature; entry chunk unchanged at 510.16 KB gzip).
- `security_rules`'s SQL was NOT run against live Supabase from this session (same standing
  pattern as every other `schema-*.sql` file in this repo — the owner runs these manually).

## Explicitly not in this dispatch

Phase 1's actual fraud-detection rules (cash-drawer variance / peer ranking / TvA inventory
variance) beyond the 2 test-fixture seed rows. Sequence engine, change-point detection,
cross-domain correlation (Phase 3). Opportunity-adjusted risk layering (Phase 2, needs these
baselines as an input first). Exoneration/explanation-library automation beyond the
`EXONERATION_RULES` column structurally accommodating it. The employee rule-out/evidence-chain
mechanism (§5, gated on owner decisions + RLS hardening). Any UI/panel work — no rules-management
panel, no risk-score display. The `refundCnt` semantic drift flagged in dispatch #35's own
follow-up doc — unrelated, still parked.

## What's needed to close this out for real

Owner needs to run `supabase/schema-security-rules.sql` against live Supabase (standard pattern
for every `schema-*.sql` file in this repo). Phase 1 can then build the first real, ACTIVE rules
on top of this interpreter + these baseline functions.
