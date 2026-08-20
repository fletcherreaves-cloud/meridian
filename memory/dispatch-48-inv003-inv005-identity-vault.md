---
name: dispatch-48-inv003-inv005-identity-vault
description: Two new inventory security rules (INV-003 waste-unexplained, INV-005 phantom gains), both inactive with measured thresholds, both threshold-guard-tested. Plus the identity-vault extension INV-004 needs (qsr_waste.emp_token), with a stated, unresolved limitation -- qsr_waste.manager is an eID, audit_rows.emp is a name, so the two land in separate token spaces for the same real person until an eID<->name mapping exists somewhere in the codebase (it currently does not, by deliberate privacy design). INV-004 itself (manager x day-part x store) is NOT built this pass -- the vault extension ships alone per the dispatch's own sequencing note.
metadata:
  node_type: memory
  type: project
---

# Dispatch #48 — INV-003, INV-005, and the qsr_waste identity-vault extension

2026-08-20. Full brief: `memory/dispatch-48.md` (PM branch, commit `21c9b2c`, not yet merged as of
this migration). Sequencing was deliberate and not easiest-first: **INV-003 → INV-005 → INV-004**,
because building INV-005's guard against a real, pre-checked degenerate baseline only makes sense
after INV-003 establishes the same mechanism works, and INV-004 carries a hard prerequisite (the
vault extension) that has to land before the rule itself can avoid a plaintext-identifier violation.

## INV-003 — variance unmatched by logged waste

`unexplainedVariance = max(0, |variance| - (raw_waste + comp_waste))`. Plan §2.2's own "strongest
single signal": an unexplained usage variance with little or no waste logged against it. Dispatch
#45 Part C already measured the gap this closes — only 44.1% of INV-001's flags carry any logged
waste at all, and only 4.2% have waste covering even half the variance.

Reuses `security_findings.exoneration_share` (added dispatch #46 §C item 6) automatically —
`computeItemFindingsForRule()` computes it for ANY flagged INV rule already, gated only on
`evalResult.pass === true`, not on `rule.rule_id === 'INV-001'`. No new column, no new code path.
A new test (`src/__tests__/security-rules-run.test.js`) proves this through the real call site —
`exonerationShare` reads 0.6 for a store with variance=50, waste=30 — rather than just asserting it
as an already-satisfied fact.

**Measured 2026-08-20 (second pass — see correction below)**, live `qsr_variance_stat`, period
2026-08, non-condiment, `exp_usage>0`: population rate (`unexplainedVariance/exp_usage*100`),
n=4,221, median=14.98, p90=103.13, max=36134.38. Peer-baseline stdev (per-`(loc,wrin)`
leave-one-out, n≥5 peers), n=4,200: p5=1.75, p10=3.74, median=25.79, only 2 exact-zero (0.05%).
`min_value:15` (population median), `min_denominator:10` (INV-001's exp_usage floor),
`min_stdev:1` (comfortably below p5, mirroring INV-001's own choice on a well-behaved distribution).

## INV-005 — unexplained positive inventory adjustment ("phantom gains")

`positiveVariance = max(0, variance)`. Sign convention determined **by measurement, not read off
the column name** — dispatch #48's own explicit warning ("a reversed rule detects the opposite of
what it claims and passes review invisibly"). Confirmed live across every sampled row:
`variance = exp_usage - act_usage` exactly (not merely same-sign) — positive means actual usage
came in *below* theoretical, the gain direction this rule targets.

Built `min_stdev` in **from the start**, not discovered live: an offline leave-one-out simulation
of `storeBaseline()`'s exact peer-computation logic, run before either rule shipped, found this
metric's peer-baseline stdev distribution measurably degenerate — `positiveVariance` is 0 for the
~70.6% shrink-side majority of subjects, so a peer population is frequently mostly-zero with one or
two real gains, exactly the shape dispatch #45b's guard exists to catch. This is the SAME defect
class INV-001/INV-002 originally shipped without a guard for and had to fix live — pre-empted here
instead.

**Measured 2026-08-20 (second pass)**, same scope as INV-003: only subjects with `variance>0` are
eligible at all — 1,243 of 4,221 (29.4%). Population rate among those, n=1,243: median=15.22,
p90=92.46, max=36234.38. Peer-baseline stdev, n=4,200: p5=0.00, p10=0.68, median=8.70 — 211 of
4,200 (5.0%) exact-zero, 586 (14.0%) below stdev 1 — a measurably degenerate tail INV-003's own
metric does not show. `min_value:15`, `min_denominator:10` (same as INV-003), `min_stdev:1` —
here sized ABOVE this rule's own p10 (0.68), unlike every other min_stdev in this build, deliberately
to clear the degenerate cluster (the 14.0% below 1) while leaving the median (8.70) untouched.

**Ships without the plan's "recent negative-variance history" qualifier** — stated explicitly per
dispatch #48's own "do not silently ship the weaker version" instruction, not left implicit.

## A correction made mid-build, same session

An earlier draft of this migration's header claimed `qsr_variance_stat` "holds only ONE period,
2026-08" as the reason the recent-history qualifier wasn't built. **That was true when first
measured but had gone stale by the time the migration was finished** — a live re-check found the
table now holds **four periods** (2026-05 through 2026-08, 23,154 total rows), not one. Per
CLAUDE.md's standing rule ("a table's `min(dt)` describes when the pull was first run, not what
exists... never scope an analysis down... because our data doesn't reach that far"), this was not
a data gap to file — the prior-period rows a recency qualifier would need are already sitting in
the table. The qualifier still isn't built this pass, but the reason is now stated correctly: scope
and time, not data availability. All population-rate and peer-baseline-stdev figures in both rules'
migration headers were re-measured against the live table the same day to make sure the numbers
backing `min_value`/`min_stdev` reflect the real, current table rather than the earlier snapshot
(they moved by low single digits — same design decisions hold, just refreshed).

## Threshold-guard coverage

`src/__tests__/security-rules-thresholds.test.js` — added `MEASURED_MAX['INV-003'/'INV-005']`
(36134.38 / 36234.38), `MEASURED_STDEV_P10['INV-003'/'INV-005']` (3.736 / 0.679), both rules parsed
into `CASES` from the real migration SQL (not hand-transcribed), plus dedicated tests: min_stdev
sits at/near each rule's own measured p10 (INV-005's is asserted ABOVE its p10 on purpose, with
the reason inline); min_value/min_denominator match the documented figures; the numerator field
names are asserted directly (`unexplainedVariance` / `positiveVariance`, never raw `variance`) —
guarding the exact reversed-sign failure mode dispatch #48 warned about; and a plain-string check
that both rules' SQL literally ends in `active: false` — directly guarding a mistake I made and
caught mid-build this same session (an earlier draft shipped both `active: true`).

## Identity-vault extension — qsr_waste.emp_token

`supabase/schema-identity-vault-qsr-waste.sql`: additive `emp_token uuid references
employee_identity_vault(id)` column on `qsr_waste`, same shape as `audit_rows.emp_token`
(`schema-identity-vault.sql`). `scripts/qsrsoft-variance-pull.mjs`'s waste-pull section now calls
`tokenizeRows(supabase, wasteEvents, 'manager')` (the same generic helper register-audit-pull.mjs
already uses with `'emp'`) and writes `emp_token` alongside the existing plaintext `manager` column
on every upsert.

**Stated limitation, not silently resolved.** `qsr_waste.manager` is an eID string
(`mapWasteEvents()` in `src/engine/eom-parsers.js` maps it from the API's `r.eID` field) —
`audit_rows.emp` is a NAME string. `get_or_create_employee_token()` keys purely on whatever raw
string it's handed (`unique(tenant_id, employee_name)`), so tokenizing an eID and tokenizing a name
for the same real person produces **two separate, unrelated tokens**. A future INV-004's
manager-attributed findings will not cross-reference with that same manager's CASH findings under
one `emp_token` in the Security panel's subject grouping.

Checked whether this could be closed in the same pass, per "measure, don't reason about it":
searched for any existing eID↔name mapping in this codebase. None exists, by design —
`scripts/qsrsoft-employee-roster-pull.mjs` is the only place QSRSoft ever returns `geid` (the
platform's own eID field name) alongside `fullEmployeeName` together, and that script's own header
states it deliberately discards the name before persisting anything: *"PRIVACY: the Employee
Roster catalog carries heavy PII... This pull... persists ONLY aggregate integer counts per
store/month (roster_role_counts). No individual-employee data is stored anywhere."*
`parseEmployeeRosterApi()` throws the name away before `rosterCounts()` ever runs. Building the
reconciliation this gap needs would mean this codebase starts persisting a name↔eID pairing for
the first time — a real, first-time PII-retention decision, not an implied part of "extend the
identity vault," and not something to add quietly inside this dispatch. Left as a named, explicit
open item for the owner to decide, not a silent gap discovered later.

**What IS fully satisfied**: dispatch #48's stated privacy bar — *"security_findings' subject is
emp_token or wrin, never a plaintext identifier. A rule that names managers in plaintext is worse
than no rule."* Once this pull writes `emp_token`, the raw eID has no path into a future
`security_findings` row for INV-004, regardless of whether that token happens to align with
`audit_rows`' token space for the same person.

## INV-004 — not built this pass

Per dispatch #48's own sequencing note: *"If time runs short, ship the vault extension alone —
it's independently valuable and unblocks every future person-attributed rule."* Two more things
stand between the vault extension and a working INV-004, beyond what this dispatch covers:

1. `qsr_waste` carries no `wrin` — it's event-level (`loc, event_id` PK), not item-level. The
   plan's literal "group waste logs by item" is not expressible from this table; INV-004 needs
   scoping as manager × day-part × store, per dispatch #48's own instruction ("say so, rather than
   half-implementing the plan's sentence"), not attempted yet.
2. A day-part sales denominator (to rate waste dollars against) is not yet identified — likely
   `qsr_daily_activity`'s hourly grain, not investigated this pass.

## CASH-003 — engineer action from the merged dispatch-48 commit, closed in this same PR

While rebasing this branch onto `main`, two new commits had landed: `2a02a2f` ("dispatch #48 +
CASH-003 resolved and live") and `71245b4`. The first is docs-only but records that the owner
already applied CASH-003's rebuild directly against production Supabase — rebuilt as an absolute
`manualRefAmt` dollar-sum threshold (`logic_type: 'threshold'`, no denominator, `threshold: 5`,
`active: true`), after three independent confirmations that no count field exists to build the
count rule dispatch #44/#45e had planned. Verified live via a direct Supabase read
(`updated_at: 2026-08-20T21:23:14Z`, matching the commit's own measured numbers: 6 occurrences, 4
employees, $7 smallest, $10 median, $26 largest, $70 total over the 80-day backfill).

That commit's own text flagged an outstanding engineer action: *"security-rules-thresholds.test.js
excluded CASH-003 from MEASURED_MAX for having no measured range. It has one now. Add the entry or
the guard silently skips the very rule it was built after."* No checked-in migration existed for
the live change either — every other threshold change in this build ships as a migration file, so
this PR adds `supabase/schema-security-rules-phase1g.sql` matching the live state exactly, and:
`MEASURED_MAX['CASH-003'] = 26` (the measured largest occurrence — this is a SUM ceiling, not a
rate, so units are dollars directly), CASH-003 moved into `CASES` reading from the new
`phase1gRules` parse instead of the now-historical `phase1eRules`, the old "carries no threshold"
test relabeled as historical (phase1e.sql's own state, superseded), and a new test asserting the
live threshold (5) sits inside the measured ceiling and the migration sets `active = true`.

## Verification

56/56 `security-rules-run.test.js` (rename INV-004→INV-005 verified clean, plus the new
exoneration-share proof), 24/24 `security-rules-thresholds.test.js` (new INV-003/INV-005 coverage
plus the CASH-003 phase1g entries), 15/15 `eom-parsers.test.js` + `identity-vault.test.js`
(unaffected by the waste-pull change), full suite 1785/1785, `npm run build` clean (entry-chunk
unaffected — no new panel code, only migration SQL + a script-side pull change). `node --check` on
the modified `.mjs` pull script.

## Not done this session (opportunistic, demoted per the prior dispatch)

Dispatch #47's response-key diagnostic (`scripts/qsrsoft-register-audit-pull.mjs`, already
committed in a prior commit this session) ran once via GitHub Actions (run `32418915409`) and
**failed** — only the post-job cleanup log tail was retrieved, not the actual pull-step error.
Not re-diagnosed: #47 was explicitly demoted to opportunistic priority before this dispatch began,
and #48 was the stated real work. The response key-list CASH-003/`transaction_detail`
reconnaissance was hoping to capture has still not been obtained.
