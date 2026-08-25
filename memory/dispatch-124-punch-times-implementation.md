---
name: dispatch-124-punch-times-implementation
description: Dispatch #124 implementation record -- QSRSoft actual punch-times pull. Live measurement confirming geid == audit_rows.emp_id identity space (1000 rows each, both digit-length bands and the '0' sentinel match), the identity-resolution decision that follows from it (geid -> qsr_employee_tenure name lookup -> identity-vault token, NOT tokenize(geid) directly), and the business-day-boundary question left explicitly unconfirmed (no live QSRSoft credentials in this session).
sensitivity: open
metadata:
  node_type: memory
  type: implementation-record
---

# Dispatch #124 — actual punch-times pull, implementation record

Built `scripts/qsrsoft-punch-times-pull.mjs` + `supabase/schema-qsr-punch-times.sql` +
`.github/workflows/qsrsoft-punch-times-pull.yml` per `memory/dispatch-124.md`, on top of
`memory/finding-qsrsoft-time-punches-endpoint-2026-08-21.md`. This file records the three things
the dispatch asked to be confirmed rather than assumed, and how each was resolved.

## 1. geid vs. audit_rows.emp_id — MEASURED, not re-asserted from the one-store-one-day sample

The finding's own claim ("almost certainly" the same space) was checked against exactly one
store, one day, 32 geids. This session had a live service-role Supabase credential (the
post-2026-08-24 key rotation — `sb_secret_…`, not the dead legacy key CLAUDE.md's Top Priorities
section warns about) and no live QSRSoft credentials, so the independent check available was:
cross-reference `qsr_employee_tenure.geid` (populated by the CONFIRMED-WORKING sibling
`/reporting/v2/people/employee-roster` pull, same endpoint family) against `audit_rows.emp_id`
(populated by the Register Audit pull, a completely different QSRSoft report family) — both real
production tables, both read via `apikey`+`Authorization: Bearer` with the service-role key,
`content-range` confirming real rows (not `*/0`).

Query: 1000 rows each (`select geid/emp_id limit 5000`, actual return capped at 1000 by
Supabase's default), digit-length histogram + min/max range per length:

| digits | `qsr_employee_tenure.geid` range | `audit_rows.emp_id` range | relationship |
|---|---|---|---|
| 6 | 361,676 – 841,908 | 361,691 – 841,908 | near-identical |
| 7 | 1,462,646 – 7,913,417 | 4,171,116 – 7,902,187 | emp_id ⊂ geid |
| 8 | 12,188,709 – 26,265,427 | 12,188,709 – 26,263,054 | near-identical |
| 9 | 200,093,393 – 200,596,080 | 200,123,701 – 200,566,188 | emp_id ⊂ geid |

`audit_rows.emp_id` also had 173/1000 rows at digit-length 1, value `0` — exactly the finding's
own documented sentinel ("`'0'` is not a short geid, it is a placeholder where no geid was
captured"), not a contradiction of the pattern.

**Verdict: CONFIRMED**, on data ~30x broader than the finding's original sample, across many
stores and days (not one store, one day). `audit_rows.emp_id` and this endpoint's `geid` are the
same identifier space.

## 2. What that does and doesn't license — the tokenization decision (dispatch rule 5)

Confirming `geid == audit_rows.emp_id`'s space does **not** mean `geid` is safe to tokenize
directly as if it were dispatch #123's `emp_token`. Reading `memory/dispatch-123.md` (its own
spec, not yet implemented in this repo) shows #123's join key is produced by
`get_or_create_employee_token(employeeName)` — a **name-keyed** space, entirely independent of
`geid`. `tokenize(geid)` would create a third, unrelated token space that happens to also be
called `emp_token`, silently breaking any future schedule↔punch join by person.

Resolution shipped: `resolveEmpTokens()` in the pull script looks up `(loc, geid)` against
`qsr_employee_tenure` (already populated, already owner-approved to store
`full_employee_name` — dispatch #57) to get a name, then calls the SAME
`get_or_create_employee_token()` RPC `#123` will use. This lands `emp_token` in the correct
name-keyed space when a tenure record exists, and leaves it `null` (with `geid` as the reliable
fallback) when it doesn't (e.g. an employee who separated before ever appearing in an
active-only roster pull).

**Open caveat, stated rather than hidden:** this only produces the identical token #123 would
produce for the same person if `qsr_employee_tenure.full_employee_name` and whatever name
string #123's LifeLenz pull captures are byte-identical after `btrim()` (the RPC's own
normalization — exact match, not fuzzy). That has not been checked because #123 doesn't exist in
this repo yet — there is nothing to diff against. Whoever wires punch data into the Crew Schedule
panel should verify this before relying on `emp_token` equality across the two sources; `geid` is
the space that IS independently confirmed here and is the safer join key to fall back to if name
parity turns out to be imperfect.

## 3. Business-day boundary — NOT confirmed, deliberately not guessed

No `QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD` were present in this session's environment (verified via
`env`), so no live call to `time-punches-matched` was possible — the boundary question could not
be settled by direct measurement, and CLAUDE.md's "measure it, don't reason about it" rule means
that's stated as a gap, not papered over with the finding's own inconclusive one-day sample
restated as if it were new evidence.

Design response: `qsr_punch_times.start_date_time`/`end_date_time` are raw `timestamptz` — no
`dt` column, no business-day bucketing applied at ingest. Whoever needs day-bucketed punches
later must call `businessDate()`/`lastClosedBusinessDay()` (`src/utils/date.js`) or bucket by
calendar day, explicitly, as a conscious choice — this table does not pre-decide it.

## 4. What was NOT built, and why

Manual-upload fallback was considered and skipped (stated in the pull script's own header):
QSRSoft doesn't expose this report as a franchisee-facing spreadsheet export the way it does
Ops/FOB, and nobody manually re-keys individual clock punches — same reasoning
`qsrsoft-register-audit-pull.mjs` already gives for skipping a manual path.

No panel/UI work — out of scope per the dispatch, reserved for a future dispatch once both #123
and #124 exist.
