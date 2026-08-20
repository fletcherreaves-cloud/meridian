# Dispatch #39 — Security build Phase 1: real cash-domain detection rules

2026-08-20. `memory/dispatch-39.md`. First dispatch in this build that produces real,
`ACTIVE=true` output — Phase 0a (register audit pull), Phase 0b (rules registry + interpreter +
baselines, dispatch #36), and the identity-vault/reveal-UI pair (dispatches #37/#38) were all
substrate. No change to `src/engine/security-rules.js`, `security-baselines.js`, or
`CASH-001`/`CASH-002`'s existing `logic_expression` — all already correct, reused exactly as-is.

## The same-day TvA correction, folded in before building anything

The dispatch's own header documents a same-day self-correction: an earlier draft excluded TvA
inventory variance on the theory that "no theoretical-usage table exists." Re-checked directly —
QSRSoft already computes TvA-equivalent variance natively (`qsr_variance_stat`,
`qsr_raw_item_detail`), Meridian already pulls both, and `eom-variance-raw.js` already consumes
the more accurate one for a different (EOM) workflow. What's genuinely missing is **employee
attribution** on that store × item × date data — turning "this store's beef is short 8%" into
"who likely caused it" is a cross-domain correlation problem (plan §3), not a single-table ratio
rule Phase 1's existing shape can express. A store-level (no-attribution) TvA-spike rule is a
real, separate follow-up; this dispatch stays cash-domain only, which the plan itself names as
"the single most-corroborated method" across all three research sources — a complete, valuable
slice, not a partial delivery.

## Post-open revision: `security_findings`' subject shape widened for dispatch #40, before merge

While this PR was open (still unmerged, table not yet live anywhere), the owner flagged a
same-day heads-up: dispatch #40 is expected to add item-level (store-level TvA-spike) findings —
exactly the follow-up this dispatch's own TvA-correction section names — and `security_findings`
as originally built here only had room for an employee subject (`emp_token uuid not null`). Since
the table doesn't exist live yet, there was nothing to migrate — building the wider shape now
avoided a second migration next week instead of shipping the narrower one tonight. Applied before
merge, not after:

- `emp_token` is now nullable; `wrin text` (matching every other `wrin` column in this repo —
  `schema.sql`'s inventory tables all use the same type) added as a co-equal subject column.
- `constraint security_findings_one_subject check ((emp_token is not null and wrin is null) or
  (emp_token is null and wrin is not null))` — a finding is always about exactly one subject,
  never both, never neither.
- **A real correctness issue this surfaced and fixed in the same pass**: Postgres unique indexes
  treat `NULL` as never equal to another `NULL`, so a plain `(tenant_id, rule_id, emp_token, loc,
  window_start, window_end)` unique index would silently stop enforcing idempotency the moment
  `emp_token` could be null — a second run of an item-level finding would insert a duplicate row
  instead of updating the first. Added a generated `subject_key` column
  (`coalesce(emp_token::text,'') || '::' || coalesce(wrin,'')`) and moved the unique index (and
  the batch job's `onConflict` target) onto that NOT-NULL-by-construction column instead.
- Dispatch #39 itself still only ever writes `emp_token` findings — `wrin` stays null for every
  row this dispatch produces. Dispatch #40 is the one that populates it.

## What was built

**`supabase/schema-security-rules-phase1.sql`** — idempotent, additive to Phase 0b's schema:

- **`CASH-001`/`CASH-002` flipped to `ACTIVE=true`** — no `logic_expression` change, thresholds
  unchanged (still the plan's own §2.1 first-guess numbers).
- **`CASH-003` — manual refund / self-authorized refund rate.** `manualRefAmt` per $1,000 drawer
  sales, `baseline_type: personal` (matches CASH-001's own reasoning — a rising rate against an
  employee's OWN history is the more direct signal). `opportunity_factor: true` — same privileged-
  override class as CASH-002's POS-overring. Threshold `$8/$1,000` — a first guess in CASH-001's
  tier, deliberately not identical since manual refunds are rarer/higher-severity than routine
  cash variance.
- **`CASH-004` — promo/discount rate.** `promoAmt` per $1,000 drawer sales, `baseline_type: peer`
  (plan's own framing: relative to colleagues' headcount-on-shift, not personal drift).
  `opportunity_factor: false` — **examined, not assumed**: `audit_rows` still has no
  role/authority column (dispatch #36's documented gap), and unlike a manual-refund override, a
  standard discount code isn't obviously restricted to privileged staff in this data. **Threshold
  (100 = 10%) is measured, not invented** — it's `src/utils/register-audit.js`'s own existing
  `discPct` amber band (`>0.10` → watch, `>0.20` → crit), already live in the Register Audit
  table today, expressed in this rule's per-$1,000 units instead of a raw percentage.

**`supabase/schema-security-findings.sql`** — the first output table.

- **Subject is `emp_token`, never `emp`** — carried forward from dispatch #37/#38 as the single
  most important constraint. A finding referencing a token is exactly as safe at rest as
  `audit_rows` itself.
- Stores the **full explanation breakdown** (`jsonb`), not a bare score — plan §4's own
  instruction, sliced to what one rule's finding can honestly say (composite multi-rule scoring
  across an explanation array is Phase 2, not built here).
- `pass boolean` is nullable, mirroring `evaluateRule()`'s own honest-null contract — never a
  fabricated verdict.
- **RLS gated to the SAME tier as `reveal_employee_identity()`** (admin/supervisor always,
  manager on the existing `org_config.gm_identity_reveal_enabled` toggle — not a second flag),
  deliberately **not** the general any-authenticated-user pattern most operational tables use.
  Reasoning stated in the file itself: a token alone isn't PII, but a small-store finding can be
  practically de-anonymizing even in token form (a 4-person night crew with one flagged token
  isn't meaningfully anonymous to whoever's looking). Starting conservative, loosening later only
  on an explicit owner decision.
- **No insert/update/delete policy for any role** — only `scripts/security-rules-run.mjs`'s
  service-role key writes here, matching `identity_reveal_log`'s own backend-only pattern.

**`scripts/security-rules-run.mjs`** — the new scheduled batch job, a **compute** job (reads
already-stored `audit_rows`, writes `security_findings`) — the first of its kind in this repo;
every existing scheduled workflow only pulls external data. Own field mapping (does not import
`src/lib/supabase.js`'s browser-oriented `loadAuditRows()`, per the dispatch's own instruction —
matches every other `scripts/*.mjs` file's convention of maintaining its own snake_case→camelCase
map). Core loop, pure and unit-tested (`computeFindingsForRule`, no Supabase dependency in the
function itself, same testing shape as `mapRow()`/`evaluateRule()` before it):

1. Load every `ACTIVE` rule.
2. Per rule, load the `audit_rows` window (`window_days` back from today, cached across rules
   sharing the same window so 4 rules with the same 28-day window fetch once, not four times).
3. Find every distinct `(loc, empToken)` pair present with a real token — a pre-backfill row
   (`empToken` null) is excluded from being a finding's **subject**.
4. Per pair, evaluate the rule via `evaluateRule()` (unmodified) and compute the relevant
   baseline via `personalBaseline`/`peerBaseline`/`storeBaseline`/`networkBaseline` (unmodified),
   using the `emp` (name) → `empToken` mapping the row itself already carries.
5. Upsert one idempotent `security_findings` row (`onConflict:
   tenant_id,rule_id,emp_token,loc,window_start,window_end`).

**A real, non-obvious behavior found and verified by test, not assumed**: an untokenized
employee's row can never make them the *subject* of a finding, but it still anonymously
**contributes a rate to their peers' baseline population** — `personalBaseline`/`peerBaseline`
(dispatch #36, unmodified per this dispatch's own constraint) group by the raw `emp` name, not
`empToken`, so a not-yet-backfilled colleague's data still shapes what "normal" looks like for
the people being scored. This is correct, not a privacy leak: no identity is ever exposed, only
a pooled number contributes to a mean/stdev. Documented explicitly in the test file rather than
silently discovered and left unexplained.

**Scheduling**: `.github/workflows/security-rules-run.yml`, `0 11 * * *` (11:00 UTC) — one hour
after `qsrsoft-register-audit-pull.yml`'s own 10:00 UTC run, since this job's input is that
pull's output; running before it completes would score stale data. `sync-failure-watch.yml`
entry added (alphabetical position, between `SAGE Scheduled Prompts` and `YouTube Mentions
Pull`).

## A real bug caught by actually running the tests, not assumed away

The first draft of `security-rules-run.test.js`'s fixture rules (`RULE_A`/`RULE_B`) omitted
`data_required: ['audit_rows']` — `evaluateRule()`'s own `dataContext[primary]` lookup silently
resolved to an empty row set with no `data_required` present, so every test asserted against
`null` values instead of the hand-computed numbers. Caught by running the suite (not by
inspecting the code), fixed in the fixtures, not the production code — exactly the "measure it,
don't reason about it" discipline this whole build has followed. A second, related mistake in
the same draft (asserting Carol's untokenized row was excluded from Bob's peer baseline
population) was also caught the same way and corrected into the documented behavior described
above, rather than silently patched to make a wrong assertion pass.

## Verification approach (matches every prior dispatch in this sequence)

- 13 new fixture tests: field-mapping round-trip (`mapAuditRow`), `data_required` support
  detection, `logic_expression` field extraction for both `ratio` and `threshold` shapes,
  `computeFindingsForRule()` against a hand-computed 2-employee/1-store fixture (personal AND
  peer baseline rules, including the untokenized-peer-contribution case above), and
  `buildExplanation()`'s honest-null contract (a null value reads "no exposure," a null pass
  with a real value reads "undetermined," never a fabricated verdict).
- **Cannot be verified against live data from this sandbox** — same constraint as every prior
  dispatch. `CASH-001`/`CASH-002`'s existing thresholds and the two new rules' first-guess
  numbers all need tuning against a real batch of `security_findings` output once the job has
  run a few times — not something computable here.

## Explicitly not in this dispatch

TvA inventory variance (see the correction above — a real, separate follow-up, not a permanent
cut). Any UI/panel — no findings-viewer, no risk-score display, no ranking panel; this mirrors
the #37→#38 split deliberately (substrate + real data first, a viewing surface as its own
follow-up once real findings exist to look at — **recommended as the next dispatch**). Phase 2
(composite scoring, decay, opportunity-adjusted risk layering) and Phase 3 (sequence engine,
change-point detection). The employee rule-out/evidence-chain mechanism (§5) — separately gated
on `project-rls-hardening-plan.md`'s Phase 2. Segregation-of-duties/labor-domain rules
(§2.4/§2.5) — different domains. Any change to `security-rules.js`, `security-baselines.js`, or
`CASH-001`/`CASH-002`'s `logic_expression` shape.

## Verified

- `node --check scripts/security-rules-run.mjs`: clean, imports without Supabase env vars set.
- 13 new tests, 1652/1652 full suite passes (157 files). `npm run build` clean, unaffected.
- `sync-failure-watch.test.js` re-run directly to confirm the new watch-list entry.

## What's needed to close this out for real

Owner runs `supabase/schema-security-rules-phase1.sql` then
`supabase/schema-security-findings.sql` against live Supabase. The scheduled workflow then runs
daily at 11:00 UTC; a `workflow_dispatch` run can be triggered manually first to spot-check
output before trusting the schedule. Real `security_findings` output is what actually tunes
`CASH-001`–`CASH-004`'s threshold numbers — not anything computable from this sandbox.
