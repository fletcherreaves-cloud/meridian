---
name: design-security-events-risk-rules-2026-11-09
description: Design for extending the existing security_rules/security_findings engine to score qsr_security_events (the data landed in PR #1765/#1766, 113,782 real rows). Phase 1 (this dispatch) ships two NEW, non-redundant rule types -- employee/manager-meal event rates and manager-authorized POS-override accountability -- and explicitly defers the compound-session pattern detector (a different mechanism) to Phase 2. Read before extending EVENT-* rules or re-proposing a parallel "risk panel."
sensitivity: open
metadata:
  node_type: memory
  type: design
---

# Security Events risk rules — design (Phase 1)

## The premise this design corrects

The owner's ask ("what does this new data unlock") first drew a pitch for a brand-new
"per-person risk ledger" panel. **That would have been a wasted build.** Meridian already has a
full declarative rules engine for exactly this domain:

- `supabase/schema-security-rules*.sql` — `security_rules`, a registry table (rule is DATA, not
  code — a new rule is a row insert, not a deploy).
- `src/engine/security-rules.js` — the interpreter (`evaluateRule`): threshold/ratio/z-score
  logic types, reads a declarative `logic_expression`.
- `src/engine/security-baselines.js` — `personalBaseline`/`peerBaseline`/`storeBaseline`/
  `networkBaseline`, generic over any `{loc, date, emp, numField, denField}` row shape.
- `scripts/security-rules-run.mjs` — the scheduled compute job (`security-rules-run.yml`):
  loads active rules, sources their data per `data_required`, computes findings, upserts to
  `security_findings`.
- `src/views/security-panel.js` + `src/engine/security-drilldown.js` — the UI, already generic
  over rule_id/subject (chronic/new/improving history, RevealName-gated identity reveal,
  cross-store prevalence, corroborating rules).

Four existing families already live in this engine: `CASH-*` (audit_rows), `INV-*`
(qsr_variance_stat/qsr_waste), `LABOR-*` (lifelenz_punch_edits). **Extending this registry with
new rules is the correct move, not building a fifth parallel system.**

## What's already covered — do not re-score this

`audit_rows` (the Register Audit pull, a *different* QSRSoft endpoint than `qsr_security_events`)
already carries, per employee per shift: `tRedACnt`/`tRedBCnt` (T-Red after/before, dollars +
counts), `refundCash`/`refundCashless`/`refundCnt`, `promoAmt`, `posOverCnt`,
`manualRefAmt`/`manualRefCnt`. `src/utils/register-audit.js` already flags on T-Red rates
directly, and `CASH-002`/`CASH-003`/`CASH-004` are already active `security_rules` on POS-over,
manual refund, and promo. **Scoring `all_promo`/`t_red_before`/`t_red_after`/`cash_refund`/
`cashless_refund` from `qsr_security_events` would duplicate live rules on an already-covered
signal.** Confirmed by reading the actual field lists, not assumed.

## What's genuinely new

1. **Employee-meal / manager-meal event rates.** `audit_rows` has no meal-category field at all.
   `qsr_security_events`'s `employee_meal`/`manager_meal` event_tokens are a clean, non-redundant
   signal.
2. **Manager-authorized POS-override accountability.** `CASH-002` scores the *cashier's* POS-over
   rate. `qsr_security_events` carries `mgr_token`/`mgr_code` on the **same row** as `pos_overring`
   — a different accountability axis (which manager's code authorized this override), something
   `audit_rows` cannot provide (no manager column exists on it at all). This is the single
   strongest new signal in the whole dataset and directly answers the owner's original framing
   ("manager-authorization accountability").
3. **Compound within-session pattern detection** (raw per-event timestamps + `pos_session_start_*`,
   tying several event types to one login session) — genuinely new, but **does not fit this
   engine's ratio-rule shape** (one numerator/denominator rate per subject per window, not a
   within-session sequence). `security-rules.js`'s own header already stubs `sequence`/
   `window-function` logic types as "Phase 3, explicitly out of scope" for the exact same reason.
   **Deferred to Phase 2** — scoped below, not built in this dispatch.

## Phase 1 — three new rules, same engine, zero interpreter changes

No change to `security-rules.js` or `security-baselines.js`. Both already state their contract
generically ("any table with `{loc, date, emp, numField, denField}` works unchanged") — `emp` is
read as an opaque grouping key, never assumed to be a plaintext name. `qsr_security_events` never
stores a plaintext name at all (crew/mgr are tokenized before the DB write, per
`src/engine/security-events.js`'s own PII contract) — so the aggregator below sets `emp` directly
to the token UUID. `crew_token`/`mgr_token` are `employee_identity_vault.id` values (same vault
`get_or_create_employee_token()` writes everywhere else), so they satisfy
`security_findings.emp_token`'s FK with no new identity mechanism.

**Denominator decision:** `qsr_security_events` carries no sales/GC column (unlike `audit_rows`),
so the existing dollar/transaction-normalized convention doesn't directly apply. The denominator
used here is **distinct POS sessions worked** (`pos_session_start_dt` + `pos_session_start_tm`,
already on every row, no join needed) — "meal-discount events per 1,000 sessions worked,"
"overrides authorized per 1,000 sessions a manager's code appeared in." Available today, no new
pull, no cross-table join. A session-per-scheduled-hour (LifeLenz) normalization is a real Phase 2
refinement, not required to ship Phase 1.

| rule_id | subject | numerator | denominator | baseline | severity |
|---|---|---|---|---|---|
| `EVENT-001` | crew_token | `employee_meal` event count | distinct sessions (crew, that day) | peer (store colleagues) | 2 |
| `EVENT-002` | crew_token | `manager_meal` event count | distinct sessions (crew, that day) | peer | 2 |
| `EVENT-003` | mgr_token | `pos_overring` event count | distinct sessions (mgr's code appeared, that day) | store (mgr × store grain, same shape as `INV-004`/`LABOR-003`) | 3 |

**Open semantic question, stated plainly rather than assumed:** `crew` on an `employee_meal`/
`manager_meal` row is whoever *rang* the transaction, not necessarily confirmed to be who *ate*
the meal. `EVENT-001`/`EVENT-002`'s subject is the ringing crew member — correct for "who is
processing an unusual volume of this category," not yet verified as "who received the meal." Not
re-derived here from a guess; documented as the honest scope of what the raw field supports.

**All three ship `active = false`**, same posture `LABOR-001`/`002`/`003` already established for
a first-measured rule on real data no dry-run has scored yet ("thresholds are a first guess...
not yet measured against this org's real data"). Flip to `active = true` after a real
`security-rules-run.mjs` pass against the live 113,782-row backfill, once threshold/baseline
distributions are actually seen — never flip blind.

## Implementation shape (`scripts/security-rules-run.mjs`)

- `supportsSecurityEventsCrew(rule)` / `supportsSecurityEventsMgr(rule)` — dispatch on
  `data_required` containing `"qsr_security_events"` (crew subject) vs
  `"qsr_security_events:manager"` (manager subject) — a qualified variant of the one real table
  name, not a second fake table, documented as such at the dispatcher.
- `aggregateSecurityEventsBySubject(rawRows, subjectField)` — collapses raw per-event rows into
  one row per `(loc, event_dt, subjectToken)`, same grain `audit_rows` already uses (one row per
  subject per day), carrying one named count column per `event_token` plus `sessionCnt` (distinct
  non-null session keys that day). Rows with a null token are excluded (unkeyable, same honest
  drop as every other mapper in this file).
- `computeSecurityEventFindingsForRule` — structurally identical to
  `computeLaborEmployeeFindingsForRule` (dynamic primary key from `data_required[0]`, same
  personal/peer/store/network dispatch, same `baselineOpts`). No new primitive.
- `loadSecurityEventsWindow(startDate, endDate)` — new loader, same paginated shape as every
  other `load*Window` in this file, filtered on `event_dt`.

## Phase 2 (not this dispatch)

- **Compound-session detector.** A new, standalone pure module (e.g.
  `src/engine/security-session-signals.js`) grouping raw rows by `(loc, pos_session_start_dt,
  pos_session_start_tm, crew_token)` and flagging sessions with 2+ distinct event_tokens inside a
  tight time window (`event_tm` clustering) — a *shape* question, not a rate, so it needs its own
  output surface (a new table, or a `security_findings`-adjacent `lifecycle_category`-style
  routing) and its own UI slice. Scoped, not built — ask before starting, since it touches schema.
- **LifeLenz cross-reference** (was this person even scheduled at `event_tm`?) — a real
  sharpening of any of the above, once this phase is live and worth the join.
- **`RULE_UNITS` display labels** for `EVENT-001/002/003` in `security-panel.js` — small, optional
  polish (the panel renders unitless fine without it); added opportunistically if touching that
  file for something else, not a reason to delay this dispatch.
