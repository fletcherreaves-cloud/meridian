---
name: finding-qsrsoft-security-events-drawer-open-2026-11-10
description: Task #131 results -- the real event_token for the owner's "General Drawer Open" KB category (drawer_open), the real raw row shape (including a date-sentinel bug this would have caused on write), and the measurement that EVENT-004 (a z-score, peer-baseline scoring rule) is buildable and does work end-to-end against real data -- shipped, inserted into security_rules, active=false pending owner review. Read before re-proposing a new drawer-open scoring rule or re-probing for the token.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# QSRSoft Security Events — "General Drawer Open" token + "Manager Authorization Type" field (task #131)

## Context

`acbde8f9`/`383aa87c` added a read-only probe
(`scripts/qsrsoft-security-events-new-fields-probe-2026-11-08.mjs`) for two things the owner found
in QSRSoft's own KB release notes (screenshots, 2026-11-08):

1. A new "General Drawer Open" Security Events category — no matching `event_token`.
2. A "Manager Authorization Type" field (manager code / biometrics / unknown) on `pos_overring`
   rows, with no column mapped for it.

**The probe's own results were never captured in that session or anywhere else.** This file is
that capture — run live 2026-11-10, from an interactive Claude Code Remote session (not a GitHub
Actions job), per the already-settled finding in
`memory/finding-qsrsoft-security-entitlement-request-2026-08-22.md` that GitHub-Actions-job
callers get `403` on `api.security.myqsrsoft.com` while an interactive cloud session gets `200`.
That held again here: `IDENTITY 3f73c22fba95` (same identity hash as every prior successful
measurement), real `200`s throughout, no 403s.

## 1. "General Drawer Open" — RESOLVED: `event_token: 'drawer_open'`

Found by brute-force probe against the live endpoint (the task's own candidate list —
`general_drawer_open`, `no_sale_drawer_open`, `unauthorized_drawer_open`, etc. — all guessed
wrong; the real token wasn't in that list either). Confirmed real and **far more frequent** than
any of the other 8 tokens:

- Initial probe (store 29760, 2026-11-03): 8 rows.
- Widened probe (4 stores × 9 dates, 2026-11-01..09): every single store-day sampled had at least
  1 row; range **1–21 rows/store/day**, typically high single digits to low teens.
- Production-shaped backfill (all 28 stores × 7 days, 2026-11-03..09, via the real pull script's
  own `runSecurityEvents`/`fetchOne`): consistent with the above, no store-day came back empty.

**The API's own `event_name` on these rows is `"Unauthorized Drawer Open"`, not literally
"General Drawer Open".** The owner's KB screenshot names the QSRSoft UI's report *category*; the
API's discrete event carries a different display string. Both describe the same thing — a drawer
opened with no attached order:

```json
{
  "event_dt": "2026-11-03", "event_tm": "23:47:09",
  "pos_session_start_dt": "0000-00-00", "pos_session_start_tm": "00:00:00",
  "event_name": "Unauthorized Drawer Open", "tender_type": "other",
  "daypart_name": "Evening", "mgr_code": "Unknown",
  "reg_num": "POS0013", "event_amt": 0, "order_key": ":0",
  "store_busn_dt": "2026-11-03", "crew": "<name> - <badge>", "mgr": "Unavailable - 000"
}
```

Characteristic shape, true on every sampled row: `event_amt: 0`, `order_key: ":0"` (a literal
sentinel, not a real order), `tender_type: "other"`. A meaningful minority of rows carry
`crew: "Unavailable"` with no badge at all — nobody logged in opened the drawer, not just an
unidentified employee.

### ⚠️ A real bug this would have shipped: the session-sentinel date

**Every single `drawer_open` row carries the literal string `"0000-00-00"` for
`pos_session_start_dt` and `"00:00:00"` for `pos_session_start_tm`** — not an absent/null field.
Makes sense: a drawer-open-with-no-POS-event has no POS session to report, and QSRSoft encodes
that absence as an invalid zero-date rather than `null`.

`qsr_security_events.pos_session_start_dt` is a Postgres `date` column. `'0000-00-00'::date` is
rejected outright by Postgres — not silently coerced. The pre-existing parser
(`src/engine/security-events.js`'s `parseSecurityEventRow`) did `raw.pos_session_start_dt || null`,
and `"0000-00-00"` is truthy, so it would have passed straight through. **Had `drawer_open` been
wired into `EVENT_TOKENS` without this fix, every drawer_open row's DB write would have failed on
every single row, every single day**, going forward (and only drawer_open — the other 8 tokens
never carry this sentinel in anything sampled).

**Fixed**: `parseSessionStart()` nulls both fields together, keyed off the date sentinel (not the
time value alone, since `00:00:00` could in principle be a real session start). Verified live: the
7-day/28-store backfill below ran with this fix in place and wrote real `drawer_open` rows with no
save errors.

## 2. "Manager Authorization Type" — NOT a new field; already mapped; one new raw value found

`parseSecurityEventRow` has mapped `mgr_code` → `mgrCode` **since the original dispatch #58 build
(commit `3dddb652`), predating task #131 entirely.** This is not a gap task #131 opened — the
owner's KB screenshot describes a UI feature that corresponds to a raw field this repo already
captures and stores.

**What's genuinely new, measured**: the original 2026-08-21 capture (38 `pos_overring` rows) only
ever saw `mgr_code` values `"true"` / `"Unknown"`. A wider re-probe this session — **164
`pos_overring` rows across 4 stores × 9 dates (2026-11-01..09)** — found a **third value,
`"false"`**, never documented before. No row in either sample (38 + 164 = 202 total) carried any
raw key beyond the already-known set (`crew, daypart_name, event_amt, event_dt, event_name,
event_tm, mgr, mgr_code, order_key, pos_session_start_dt, pos_session_start_tm, reg_num,
store_busn_dt, tender_type`) — specifically, nothing resembling a literal `mgr_auth_type` or
"biometric" field ever appeared.

**Working hypothesis, NOT confirmed**: the KB's 3-way label (manager code / biometrics / unknown)
is QSRSoft's own UI translation of this same `mgr_code` raw value, not a separate field this
parser is missing — `"true"` plausibly = a manager code was entered, `"Unknown"` = no manager
named on the event, and `"false"` plausibly = some other authorization path (biometric scan?).
**Explicitly not acted on**: no row in 202 samples exhibited whatever the real "Biometrics" case
looks like at the raw-API level, so there is nothing to measure that specific mapping against.
Per this repo's own standing rule (CLAUDE.md, "measure it, don't reason about it"), the code does
**not** invent a `true→"Manager Code"` / `false→"Biometrics"` / `Unknown→"Unknown"` translation
table — `mgrCode` is stored verbatim, as before, now with a comment stating this exact finding so
a future session doesn't have to re-derive it. If a real biometric-authorized override is ever
captured, re-open this question with that example in hand.

## EVENT-004 ("General Drawer Open" scoring rule) — SHIPPED, not deferred

**First hypothesis (while only a small 4-store/9-date sample existed): the sessions-worked
denominator wouldn't fit this token** — reasoning that a drawer-open-with-no-POS-event never
itself carries a session, so a crew member whose only flagged event that day was a drawer-open
would land an honest `null` every time. **That reasoning was WRONG, and measurement caught it**
(this repo's own standing rule: measure, don't reason). Once the real 7-day/28-store backfill
existed, the actual aggregator (`aggregateSecurityEventsBySubject`, called for real, not
reconstructed) was run against it directly:

- **528/528 (100%)** of the real `(loc, date, crew_token)` buckets with ≥1 `drawer_open` event
  had `sessionCnt > 0`. A crew member's `sessionCnt` comes from their WHOLE day's flagged
  activity, not just the drawer-open row — and in practice, every crew member who triggered a
  drawer-open that day also had other flagged events (mean `sessionCnt` among those buckets:
  **56.44**). The theoretical zero-denominator case never actually occurred in real data.
- **Crew attribution is NOT a meaningful gap either**, measured precisely rather than estimated:
  only **5/1,211 (0.4%)** of real `drawer_open` rows had no `crew_token` at all. The earlier draft
  of this file called this "a meaningful share" before counting it — it is not; corrected here.

So the two objections that justified deferring EVENT-004 were both measured away. What the real
rate distribution DID show is a reason to change the RULE SHAPE, not abandon it:

- Across **1,152 real crew/day buckets with `sessionCnt >= 5`** (2026-11-03..09): mean **32.96**,
  p50 **0**, p75 **43.48**, p90 **100**, p95 **142.86**, p99 **290.32**, max **600** (per 1,000
  sessions). **45.3%** of those buckets had ≥1 `drawer_open` event that day — common, not rare.
- A flat-rate threshold (the shape originally drafted here, "150 per 1,000 sessions") would be
  measuring against a population where nearly half the normal baseline already has nonzero
  activity — exactly the kind of threshold that either fires constantly or has to be set so high
  it stops meaning anything.
- **A live REST read of the three sibling rules (EVENT-001/002/003) found they had ALREADY been
  upgraded from their own phase1 SQL file's flat-ratio shape to `z-score`/`threshold:2.5` in the
  live `security_rules` table**, sometime after that file was written (the checked-in SQL is now
  stale for those three rows — noted, not fixed in this dispatch, a separate scoped cleanup).
  EVENT-004 is built to match that CURRENT live shape, not the stale file's: z-score, peer
  baseline (store colleagues — same choice as EVENT-001/002, since this reads more as a
  store/shift-culture signal than EVENT-003's individual-authorization one, so
  `opportunity_factor: false` matches EVENT-001/002), threshold 2.5σ, `min_denominator: 5`,
  `scale: 1000`, same as every sibling.

**End-to-end validation, live, not just unit tests**: fetched the real inserted `EVENT-004` row
from `security_rules` and ran it through the real `computeSecurityEventFindingsForRule` against
the real aggregated 7-day backfill (1,245 crew/day buckets) — no crash, **419/443 buckets got a
real (non-null) verdict, 22 (1.8%) would be flagged if active** — a sane, non-overwhelming flag
rate, in sharp contrast to what the rejected flat-rate-150 draft would likely have produced given
the 45.3% baseline-activity rate above. Sample flagged finding: one crew member at store
`0010422` with a rate of 181.82/1,000 sessions against an 18-member peer baseline of mean 44.51 /
stdev 42.66 (z ≈ 3.22).

## What shipped this dispatch

- `src/engine/security-events.js`: `drawer_open` added to `EVENT_TOKENS` (9 tokens now); the
  session-sentinel-date fix (`parseSessionStart`); comments documenting the `mgr_code`/manager-
  authorization-type finding above.
- `src/__tests__/security-events.test.js`: real-shaped (synthetic-name) tests for the sentinel fix
  and the new `"false"` `mgr_code` value.
- `scripts/qsrsoft-security-events-pull.mjs`: no code change needed — it already defaults
  `eventTokens` to the full `EVENT_TOKENS` export, so `drawer_open` flows into the daily
  production pull automatically now that the fix is in place.
- **Live-verified**: a real 7-day/28-store backfill (2026-11-03..09, via the actual production
  pull script, not a reconstruction) ran against `qsr_security_events` with real credentials —
  `drawer_open` rows parsed and saved with zero errors (57,641 rows parsed/saved total across all
  9 tokens, 1,211 of them `drawer_open`), confirming the sentinel fix works against live data,
  not just the synthetic test fixture.
- **`EVENT-004` inserted into live `security_rules`** via the service-role REST API (a data row,
  not DDL, per the task's own instruction) — `active: false`, same posture every Phase-1 rule
  ships with, pending the owner's review given how common the raw event is. The exact insert is
  also checked in as `supabase/schema-security-rules-events-drawer-open-2026-11-10.sql` (idempotent,
  `on conflict (tenant_id, rule_id) do nothing`) so a future environment/replay reaches the same
  state without a second manual REST call.
- `scripts/security-rules-run.mjs`: `EVENT_TOKEN_FIELD.drawer_open = 'drawerOpenCnt'`, and
  `drawerOpenCnt: 0` added to `aggregateSecurityEventsBySubject`'s bucket shape — no other engine
  change; `computeSecurityEventFindingsForRule`/`evaluateZScoreRule` needed nothing new.
- `src/__tests__/security-rules-events-2026-11-09.test.js`: `drawerOpenCnt` aggregation coverage,
  plus an EVENT-004-shaped z-score/peer-baseline test matching the rule's real live shape.

## Still open, not fixed in this dispatch

- `supabase/schema-security-rules-events-phase1.sql` (EVENT-001/002/003) is now stale relative to
  the live `security_rules` table — it documents a flat `ratio`/rate-threshold shape; the live
  rows are `z-score`/`threshold:2.5`. Noted here because EVENT-004 was deliberately built to match
  the LIVE shape, not the stale file. Reconciling that file is a separate, scoped cleanup.
- The `mgr_code`→"manager code"/"biometrics"/"unknown" translation (KB screenshot wording) is
  still unconfirmed at the raw-value level — see the section above. Revisit if/when a real
  biometric-authorized override is captured.
