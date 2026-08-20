# Dispatch #39 — Security build Phase 1: real cash-domain detection rules

**Board (2026-08-20), at time of writing:** Phase 0b substrate is merged and live
(`security_rules` table + `security-rules.js` interpreter + `security-baselines.js`, dispatch
#36, PR #451 — schema confirmed run against production). Dispatch #37 (identity vault) and #38
(reveal-UI) are both merged and live — `audit_rows.emp_token` is populated for all 21,929 rows
(confirmed 2026-08-20). This dispatch is the first one that produces real, `ACTIVE=true` output —
everything before it was substrate.

**Read before starting:** `memory/plan-security-loss-prevention.md` (the whole file — §1 for the
architecture principles, §2.1 for the cash-fraud methods, §4 for the explanation-breakdown
format, §6 for the rules-registry schema, §7 for build order); `memory/dispatch36-security-
phase0b-substrate.md` (what the interpreter/baselines already do — do not rebuild any of it);
`memory/dispatch37-identity-vault.md` + `memory/dispatch38-reveal-ui.md` (why every subject-facing
identifier in this build is a token, never a plaintext name).

---

## CORRECTION, 2026-08-20 (same day) — the TvA exclusion below was WRONG, read this first

**This dispatch originally excluded TvA inventory variance, reasoning from `variance-trace.js`'s
comment that "Meridian has no per-item theoretical-usage table." That comment is true narrowly
(no POS-sales × BOM-coefficient reconstruction exists) but the conclusion drawn from it was
wrong — treating "we haven't looked" as "the data doesn't exist," exactly the error CLAUDE.md's
own standing rule warns against ("a missing-data gap is never a finding, it is a work item").
Owner correctly pushed back same-day.** Re-checked directly, not re-assumed:

- **QSRSoft already computes TvA-equivalent variance natively.** Its own KB (`qsrsoft-kb-
  digest.md`) documents "Inventory Stat compares expected usage versus actual usage... the
  Inventory Statistical Loss report" and a "Variance Stat/Yields" page, plus an "Inventory Usage"
  report whose `Actual Usage = Starting Inventory + Purchases +/- Transfers - Waste/Promo - Ending
  Inventory` is the "actual" leg computed server-side, per WRIN. There's also a real "Menu Items -
  Recipes" report (BOM-shaped) and an "Inventory Analysis Report" whose Topics 3/6/7 are
  explicitly about recipe-membership completeness.
- **Meridian already PULLS this.** `scripts/qsrsoft-variance-pull.mjs` → `qsr_variance_stat`
  (the aggregate, confirmed lagging) and `qsr_raw_item_detail` (per-count-event history) are both
  real, live tables with existing consumer code — `src/engine/eom-variance-raw.js`'s
  `latestVarianceByWrin()` already computes the more accurate "as-counted" per-WRIN variance from
  the raw count-event history, built for the EOM inventory workflow, not this security build.
  `variance-trace.js`'s narrower comment was about a *different*, harder path (reconstructing
  theoretical usage from POS sales × recipe math) that this org indeed hasn't built — not about
  whether TvA-shaped variance data exists at all. It does, and it's already flowing.

**What's actually still missing, precisely stated:** `qsr_variance_stat`/`qsr_raw_item_detail`
are **store × item × date grain, not employee-attributed** — turning "this store's ground beef is
short 8% this month" into "which employee(s) likely caused it" needs correlating the variance
window against who had access/opportunity (shift data), which is genuinely a cross-domain
correlation problem (plan §3), not a single-table ratio rule. A **store-level** TvA-variance-spike
rule (flag a store/item, no employee attribution) fits Phase 1's existing shape today, using data
already flowing; an **employee-attributed** one is real Phase 2/3 scope. Being investigated
further now (background research in progress, same session) — see the follow-up dispatch this
produces before assuming either path is fully scoped.

**This means Phase 1, as actually dispatched here, is CASH-domain only** — the domain
`audit_rows` genuinely and fully supports today. This is a legitimate, valuable-on-its-own slice
of plan §7's Phase 1 list (cash-drawer variance + void/refund detection are explicitly named as
"the single most-corroborated method" across all three research sources) — not a partial or
compromised delivery.

---

## What's already there — do not rebuild any of this

- **`src/engine/security-rules.js`** — `evaluateRule(rule, dataContext, {loc})`. Handles
  `LOGIC_TYPE` `threshold` and `ratio`. Call this, don't reimplement rule evaluation.
- **`src/engine/security-baselines.js`** — `exposureRate()`, `personalBaseline()`,
  `peerBaseline()`, `storeBaseline()`, `networkBaseline()`. Each returns `{mean, stdev, n, values,
  ...}` over a population of rates. Use these to build the `dataContext` / explanation breakdown
  — do not write a second rate-normalization helper.
- **`supabase/schema-security-rules.sql`** — `security_rules` table, already has 2 seed rows
  (`CASH-001` cash-drawer over/short, `CASH-002` POS overring rate), currently `ACTIVE=false`
  test fixtures. **This dispatch's job includes deciding whether to flip these to `ACTIVE=true`
  with real thresholds** (see "The rules" below) — not re-deriving their `logic_expression`
  shape, which is already correct and tested against the interpreter.
- **`audit_rows`** (raw table, `loc/date/emp` PK, `emp_token` additive column) — the input data.
  Real column names (snake_case in Postgres, mapped to camelCase by `src/lib/supabase.js`'s
  `loadAuditRows()`): `drawer_sales`→`drawerSales`, `drawer_gc`→`drawerGC`,
  `cash_os_dollar`→`cashOSDollar`, `pos_over_cnt`→`posOverCnt`, `pos_over_amt`→`posOverAmt`,
  `manual_ref_amt`→`manualRefAmt`, `refund_cash`→`refundCash`, `refund_cashless`→`refundCashless`,
  `refund_cnt`→`refundCnt`, `promo_amt`→`promoAmt`, `t_red_a_cnt`/`t_red_a_dollar`, `t_red_b_cnt`/
  `t_red_b_dollar`, `emp_token`→`empToken`.
  **`loadAuditRows()` is a browser-oriented loader (`src/lib/supabase.js`) — do not import it
  into the new Node batch job.** Follow this repo's established `scripts/*.mjs` pattern instead
  (own `createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`, own snake_case→camelCase
  mapping, matching `scripts/backfill-identity-vault.mjs`'s own client-setup shape) — re-derive
  the same field mapping shown above explicitly in the new script, don't try to cross-import a
  browser module into Node.

## 1. The rules — activate 2, add 2, all cash-domain, all `audit_rows`-supported

**Activate `CASH-001` and `CASH-002` as `ACTIVE=true`.** Their `logic_expression` is already
correct and tested; no code change needed, just an `UPDATE security_rules SET active=true WHERE
rule_id IN ('CASH-001','CASH-002')` in the new schema file (or re-seed with `active:true` — either
is fine, whichever is more idiomatic against how this repo's other `schema-*.sql` files handle
"activate an existing row" vs "insert fresh"). Keep their existing threshold numbers — they're the
plan's own first-guess starting values (§2.1), explicitly meant to be tuned against real score
distributions once this job has run a few times, not re-derived here from nothing.

**Add two new rules**, same `ratio` `LOGIC_TYPE`, same pattern as CASH-001/002, both genuinely
supported by real `audit_rows` columns (verified against `src/utils/register-audit.js`'s actual
field usage, not guessed):

- **`CASH-003` — Manual refund / self-authorized refund rate** (plan §2.1 "Refund/return abuse").
  `manualRefAmt` normalized against `drawerSales` (dollars-of-manual-refund per $1,000 of drawer
  sales — same per-thousand convention as CASH-001). `baseline_type: 'personal'` (an employee
  whose manual-refund rate is climbing against their OWN history is the more direct signal here
  than a peer comparison, matching CASH-001's own baseline choice). Starting threshold: use
  judgment consistent with the plan's own §2.1 framing (manual refunds are a privileged-override
  category worth a moderate severity, similar to CASH-001) — pick a defensible first-guess number
  and state the reasoning in the commit/PR, same as the plan did for CASH-001/002's own numbers.
- **`CASH-004` — Promo/discount rate** (plan §2.1 "Unauthorized discount / manager-meal abuse").
  `promoAmt` normalized against `drawerSales`. `baseline_type: 'peer'` (peer comparison is the
  more natural fit here — the plan's own framing is "high discount frequency relative to actual
  headcount on shift," i.e. relative to what colleagues are doing, not a personal-drift question).
  `opportunity_factor: true` if a discount-authority distinction exists in this data (check —
  `audit_rows` doesn't carry a role/authority field per dispatch #36's own documented gap, so this
  is very likely `false` in practice today; state which one you land on and why, don't leave it
  unexamined).

**False positives / exoneration / investigation-action fields**: fill these in following the
plan's own §2.1 table entries and CASH-001/002's existing seeded values as the pattern — don't
leave them empty just because they're free-text; the plan names real candidates for each method
(e.g. CASH-004: "new promo campaign," "documented manager-approved comp").

## 2. New output table — `security_findings`, token-keyed

No output/findings table exists yet — Phase 0b built the rule registry and the interpreter, not
where a computed result lives. New schema file: `supabase/schema-security-findings.sql`.

- **Subject is `emp_token` (uuid, references `employee_identity_vault(id)`), never `emp`
  (plaintext name).** This is the single most important design constraint in this dispatch —
  Direction B's whole point (dispatch #37) is that no new table introduces a second, unlogged path
  to a plaintext name. A finding referencing `emp_token` is exactly as safe at rest as `audit_rows`
  itself; a finding that stored `emp` directly would silently reopen the hole #37/#38 just closed.
- Store the **explanation breakdown**, not just a bare score — plan §4's worked example is the
  target shape: an array of `{label, contribution, sign}`-style entries (rule description, the
  computed value, the baseline compared against, the resulting weighted contribution) as a `jsonb`
  column, so a future panel can render the additive/subtractive list without recomputing it.
  "Explanation surfacing... build this from day one" is the plan's own explicit instruction
  (§7 Phase 1), not a nice-to-have — a bare number with no breakdown is exactly what §1 principle
  6 warns against.
- Columns at minimum: `id`, `tenant_id`, `emp_token`, `loc`, `rule_id` (references
  `security_rules.rule_id`), `window_start`/`window_end`, `value` (the computed rate),
  `threshold_used`, `pass` (boolean, nullable — mirror `evaluateRule()`'s own honest-null
  contract, never fabricate a verdict), `baseline_context` (jsonb — which baseline type, its
  mean/stdev/n at evaluation time), `explanation` (jsonb, per above), `computed_at`.
- **RLS — default to the SAME access tier as `reveal_employee_identity()`** (admin/supervisor
  always; manager gated on `org_config.gm_identity_reveal_enabled`, the existing toggle — don't
  invent a second one), **not** the general "any authenticated user" pattern most operational
  tables use. Reasoning to state explicitly in the PR, not silently assume: a token alone isn't
  PII, but `project-sage-knowledge-grounding.md`'s disclosure-gating policy (referenced in plan
  §0/§5) is written around "a named-employee risk-score view," and a small-store finding can be
  practically de-anonymizing even in token form (a 4-person night crew with one flagged token
  isn't meaningfully anonymous to whoever's looking at the panel). Starting conservative and
  loosening later on an explicit owner decision is the safer default than the reverse. **Real
  finding to carry forward from dispatch #37, unchanged**: `profiles.role`'s DB check constraint
  only allows `'admin'/'supervisor'/'manager'` — CLAUDE.md's 8-tier RBAC (including "DO") is not a
  real DB role, so any RLS policy here uses those three real values only, same as every other
  security-* table in this build.

## 3. The scheduled batch job

**Compute pattern already decided (2026-08-20, plan §7 Phase 1 header): a scheduled batch job**
(matching the `*-pull.mjs` / GitHub Actions family, e.g. `sage-run.mjs`'s own pattern of a
service-role script on a cron schedule), **not** an on-demand Edge Function. This is a new
*compute* pattern for this repo — every existing scheduled workflow only pulls external data, none
evaluate rules against already-stored data — scope it as such, don't treat it as a copy of an
existing pull script's shape even though the surrounding scaffolding (service-role client, GitHub
Actions workflow, `sync-failure-watch.yml` entry per CLAUDE.md's standing new-automated-pull
checklist) should match.

- New script: `scripts/security-rules-run.mjs`.
- Loads `security_rules` WHERE `active=true`.
- For each active rule, loads the relevant `audit_rows` window (`window_days` back from today),
  computes the appropriate baseline context via `security-baselines.js` (personal/peer per the
  rule's `baseline_type`), evaluates via `security-rules.js`'s `evaluateRule()` per distinct
  `emp_token` present in that window, and upserts one `security_findings` row per
  (rule, emp_token, window) — idempotent on re-run (same convention as every other pull script:
  a scheduled re-run should update, not duplicate).
- **Cadence not yet decided by the plan — pick a reasonable default and state the reasoning**:
  daily, after `qsrsoft-register-audit-pull.yml`'s own 10:00 UTC run (this job's input is
  `audit_rows`, so running before that day's pull completes would score stale data) is the
  obvious choice unless a reason emerges to differ.
- **New automated pull checklist (CLAUDE.md standing rule)** — even though this isn't a pull, it's
  a new scheduled workflow, so the same checklist applies: add its workflow name to
  `.github/workflows/sync-failure-watch.yml`'s watch list (`sync-failure-watch.test.js` enforces
  this both directions), and consider whether "staleness" is a meaningful concept for a
  compute job the way it is for a pull (probably: "did this run today," not "is the underlying
  data fresh," which `audit-pull`'s own freshness check already covers separately).

## Verification approach

- `security-rules.test.js`/`security-baselines.test.js` already prove the interpreter and
  baseline math independently (dispatch #36) — this dispatch's own tests should prove the NEW
  pieces: `CASH-003`/`CASH-004`'s `logic_expression` round-trips through `evaluateRule()` against
  a realistic fixture (mirroring how `CASH-001`/`CASH-002` were verified), and the batch job's
  core per-rule-per-employee evaluation loop is unit-testable against a mocked Supabase client
  (matching `scripts/backfill-identity-vault.mjs`'s own test-free-but-`node --check`-clean
  precedent, or add a real test if the loop logic is complex enough to warrant one — judgment
  call, but err toward testing given this directly produces a personnel-sensitive artifact).
- **Cannot be verified against live data from this sandbox** — same constraint as every prior
  dispatch in this sequence. State plainly that the real threshold numbers (CASH-001/002's
  existing ones, and whatever gets picked for CASH-003/004) are first guesses; the owner reviewing
  a real batch of `security_findings` output after the first live run is what actually tunes them,
  not anything computable from this sandbox.

## Explicitly not in this dispatch

- TvA inventory variance (see the finding at the top — genuinely not buildable today).
- Any UI/panel — no findings-viewer, no risk-score display, no ranking panel. This mirrors the
  #37→#38 split deliberately: substrate + real data first, a viewing surface as its own follow-up
  dispatch once real findings exist to look at. (**Recommended next dispatch after this one.**)
- Phase 2 (composite scoring, decay, opportunity-adjusted risk layering) and Phase 3 (sequence
  engine, change-point detection) — unrelated, later phases.
- The employee rule-out/evidence-chain mechanism (§5) — separately gated on
  `project-rls-hardening-plan.md`'s Phase 2 landing, unrelated to this dispatch's scope.
- Segregation-of-duties / labor-domain rules (§2.4/§2.5) — different domains, not scoped here.
- Any change to `security-rules.js`, `security-baselines.js`, or the existing `CASH-001`/`CASH-002`
  `logic_expression` shape — all already correct, this dispatch only adds rows and a consumer.
