---
name: dispatch-51
description: Makes dispatch #49's Phase 0 gate measurable as a repeatable SQL query instead of a bespoke API re-pull. Adds a nullable audit_rows.emp_id column, populated by the existing (proven) register-audit pull, backfilled 2026-03-01 -> today. Additive only -- does not touch the identity vault, token keying, or audit_rows' PK, and does not open Phase 1.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #51 — make Phase 0 measurable, don't re-implement the pull

Owner-approved scope call, 2026-08-21. Does not replace dispatch #49 (memory/dispatch-49.md) --
it fixes how Phase 0's measurement gets its data.

## Why

The engineer's first Phase 0 attempt built a bespoke measurement script
(`scripts/dispatch49-phase0-measure.mjs`) that re-implemented `qsrsoft-register-audit-pull.mjs`'s
auth/fetch logic instead of reusing it, and inherited none of the two-path auth, Playwright
fallback, or retry handling that makes the real pull reliable. It failed twice on a widened
window and printed a Row 5 of 100% from zero API rows fetched -- an artifact of "no data pulled,"
not "no employee has an empID." **The stop and the artefact call were both correct** -- flagging a
false population rather than passing it through is the difference between a real decision and a
wrong one. But the right fix is to stop re-implementing the pull, not to retry the bespoke path.

`qsrsoft-register-audit-pull.mjs` already has a proven 80-day / 14,528-row / 27-store backfill
(run `32415565305`) and, as of dispatch #49, a confirmed field name: `empID` sits beside
`empName` on every response row (run `32431369072`'s DEBUG key-name log). It just never got
written anywhere -- `mapRow()` deliberately keeps `emp` (the name) as the PK-facing identity and
discards `empID` by design (see the file's own header on why: switching the PK to empID would
split-brain 5+ months of manual-upload history).

## The fix

Additive column, not a PK change: `audit_rows.emp_id text`, nullable, populated by the SAME
pull that already works, alongside the existing `emp` name column. `manualRefCnt`/`manOverringAmt`
is the worked example of the same round trip already living in this file at every site -- a
response field mapped in `mapRow()`, carried through `saveAuditRows()`'s upsert, landing in an
additive column nothing else reads yet.

Once populated, Phase 0's five numbers (memory/dispatch-49.md) become a single SQL query against
`audit_rows` -- group by `emp`, count distinct `emp_id` per name and distinct `emp` per `emp_id`,
count nulls -- no QSRSoft credentials, no Playwright, no re-pull, repeatable any time.

## Scope boundary (hard)

- **Additive only.** Nothing reads `emp_id` yet. This dispatch does NOT open Phase 1.
- Does **not** touch the identity vault, `get_or_create_employee_token()`, or any token keying.
- Does **not** change `audit_rows`' `(loc, date, emp)` PK -- five months of manual history and
  freshest-wins continuity ride on it, unchanged.
- Does **not** reconcile or merge anything. The gate holds exactly as dispatch #49 left it.

## Also in scope: fix a stale comment

`mapRow()`'s header still called `manOverringQty` an "UNVERIFIED FIELD NAME" -- it's confirmed
absent three independent ways (`memory/finding-cash003-manoverringqty-absent-2026-08-20.md`): zero
of 19,985 backfilled rows carry a value, a live DEBUG key-name run doesn't list it among the
response's real keys, and the owner checked the QSRSoft UI directly and confirmed no count column
exists. Comment corrected to state that plainly; the mapping itself (`null` via `num()`'s
undefined-safe handling) is left unchanged -- there is no live equivalent to map instead.

## Banked, no re-measurement needed

Row 1 (the Phase 0 denominator), from the failed run's own Supabase read before the API side
broke: **1,140 distinct names across 36,631 rows, 2026-03-01 → 2026-08-20.**

## Backfill constraint

**One retry maximum on the backfill, then stop and report.** Repeated Playwright logins run
against the owner's own QSRSoft account; a lockout takes DAR and eBOS down too -- this is not a
free retry loop.

## Status (implementation)

- `audit_rows.emp_id text`, nullable, additive: `supabase/schema-audit-rows-emp-id.sql`. **Not yet
  applied to live Supabase** -- confirmed via direct read (`42703: column audit_rows.emp_id does
  not exist`) before writing any pull-script change, per this build's own "measure before
  deciding" rule. This is the one prerequisite before the backfill can run: PostgREST will reject
  every row in the upsert with "column not found" until the migration lands, and deliberately
  running the backfill against a known-missing column would burn a real QSRSoft login for a
  guaranteed failure -- the exact risk the retry-limit language above is protecting against. Owner
  action item, same manual-migration pattern as every other `schema-*.sql` file in this repo.
- `mapRow()` (`scripts/qsrsoft-register-audit-pull.mjs`) captures `empId` from `r.empID`
  (trimmed, null on missing/blank) alongside the existing `emp` field. `saveAuditRows()`'s upsert
  carries `emp_id: r.empId ?? null` into the same row shape `emp_token` already rides in. The
  client-side twin (`src/lib/supabase.js:saveAuditRows`, used by the manual-upload path) gets the
  same field for consistency with its own "shared verbatim" comment -- `parseRegisterAudit` never
  produces `empId`, so manually-uploaded rows correctly stay `null`.
  onConflict key `'loc,date,emp'` is unchanged.
  3 new tests in `src/__tests__/register-audit-pull.test.js` (empId mapped, null-on-missing,
  trim/blank handling). Full suite 1815/1815, build clean, budget headroom unaffected (this
  doesn't touch a bundled panel).
- The stale `manOverringQty` comment is corrected in `mapRow()`'s header.
- **Backfill not yet run** -- blocked on the schema migration above. Once the owner confirms
  `schema-audit-rows-emp-id.sql` is applied, the next step is one `workflow_dispatch` of
  `qsrsoft-register-audit-pull.yml` with `start_date=2026-03-01`, `end_date=<today>` (one retry
  maximum per the constraint above), after which Phase 0's rows 2-5 are a SQL query against the
  now-populated `emp_id` column, and dispatch #49's gate decision (proceed to Phase 1 vs. fall
  back to option B) can actually be made.
