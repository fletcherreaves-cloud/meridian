---
name: dispatch-51
description: Phase 0's measurement failed twice on a bespoke API pull. This moves it onto the production pull path - capture empID into audit_rows as a nullable column, backfill through the existing hardened script, then run Phase 0 as pure SQL with no API dependency. Owner-approved as a deliberate, additive slice ahead of the gate; the gate on the re-key itself still holds.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #51 — capture `empID`, then measure Phase 0 in SQL

**Owner-approved 2026-08-21** as a deliberate scope call. Read `memory/dispatch-49.md` first — this
dispatch does not replace it, it makes its Phase 0 measurable.

## Why this exists

Phase 0's measurement failed **twice**. Both attempts pulled the widened Register Audit window
through a **bespoke, one-off API call written for the measurement**, and both hit the same auth
flakiness (`token captured: false`, cookie fallback 401 on the first chunk). The engineer stopped at
the two-failure bar and — correctly — **flagged the resulting "row 5 = 1,140 (100%)" as an artefact
of fetching zero rows, not a finding.** That is exactly the false row-5 population dispatch #49
warned about, and passing it through would have sent the decision to option B on no evidence.

**The problem is the approach, not the flakiness.** A production pull for this endpoint already
exists — `scripts/qsrsoft-register-audit-pull.mjs` — with two-path auth, a Playwright fallback,
retry handling, and a proven 80-day / 14,528-row / 27-store run (`32415565305`). The measurement
script re-implemented that and inherited none of its hardening. **Do not retry the bespoke path a
third time.**

**Banked from the failed run, and real:** `audit_rows` holds **1,140 distinct employee names across
36,631 rows, 2026-03-01 → 2026-08-20**. That is Phase 0's denominator and does not need re-measuring.

## Scope boundary — read this before starting

This is **additive only** and does NOT open Phase 1. Specifically:

- ✅ A **nullable** `emp_id` column on `audit_rows`, populated by the existing pull. Nothing reads it.
- ❌ **Do not touch the identity vault**, `get_or_create_employee_token()`, or any token keying.
- ❌ **Do not change `audit_rows`' PK.** It stays `(loc, date, emp)`. Five months of manual-upload
  history and freshest-wins continuity depend on it.
- ❌ **Do not reconcile, merge, or re-key anything.**

The gate stands: the owner sees the five numbers before anyone commits to the re-key, and taking the
option-B fallback remains a success.

## Part A — capture `empID`

The field is **confirmed**, not inferred: `empID` sits immediately beside `empName` in the response
(dispatch #49's key-name run, merged in #504).

Sites, all of which already have `manualRefCnt` as a worked example of the same round trip:

| file | line | change |
|---|---|---|
| `supabase/schema.sql` | ~779 | `emp_id text` on `audit_rows` (nullable) |
| `scripts/qsrsoft-register-audit-pull.mjs` | ~213 | `empId: (r.empID \|\| '').trim() \|\| null` in `mapRow()` |
| `scripts/qsrsoft-register-audit-pull.mjs` | ~132 | `emp_id: r.empId ?? null` in the upsert row |
| `src/lib/supabase.js` | ~880, ~946 | both directions of the round trip |
| migration | new | `alter table public.audit_rows add column if not exists emp_id text;` |

**Null on manually-uploaded rows, by design** — `parseRegisterAudit`'s Excel path has no ID column,
exactly like `manual_ref_cnt`. Say so in the comment; do not invent a fallback.

**While you are in `mapRow()`, fix a now-stale comment.** Line ~40 still calls `manualRefCnt`'s
source field "UNVERIFIED FIELD NAME." It is no longer unverified — `manOverringQty` is **confirmed
absent** three independent ways (the key-name run, `parseRegisterAudit`'s headers, and the owner
checking the report). Update it to say confirmed-absent and point at
`finding-cash003-manoverringqty-absent-2026-08-20.md`. The mapping itself is harmless (always null)
and CASH-003 now runs on an absolute dollar threshold — leave the mapping, fix the words.

## Part B — backfill

Run the **existing** workflow with `start_date=2026-03-01`, `end_date=today` — matching the banked
`audit_rows` span so row 5 measures real coverage rather than a narrow window.

**One retry maximum on failure, then stop and report.** This auth path is intermittent (it worked
for 1,781 rows hours before it failed twice), and repeated Playwright logins run against the
owner's own QSRSoft account — a lockout would take down the daily DAR and eBOS syncs too. **Do not
grind.**

## Part C — Phase 0, now pure SQL

With `emp_id` populated, the five numbers come from Supabase with **no API dependency**, and the
measurement becomes repeatable — which matters, because it will want re-running after any future
backfill.

1. distinct `emp` names (**1,140**, already known)
2. names resolving to exactly one `emp_id` — the clean core
3. names resolving to **multiple** `emp_id`s — people currently **merged** into one token
4. `emp_id`s resolving to **multiple** names — people currently **split** across tokens
5. names with **no** `emp_id` on any row — manual-only / departed. **The row that decides it**

**Report all five as counts and percentages, then STOP.** Rows 3 and 4 are worth reporting even if
the re-key never happens — they are the first measurement of how many findings are attributed to the
wrong person, or split across two identities for one person.

**Row 5 caveat that must travel with the number:** a name with no `emp_id` could be genuinely
ID-less, or simply absent from the backfilled window. Say which, or say you cannot tell. **A
non-trivial row 5 is a legitimate result pointing at option B — do not treat it as a failure to be
worked around.**

## Guardrails

- **Never log a name or an ID value.** Counts and status lines only; every row here is
  employee-attributed PII. Both failed runs were clean on this — keep it that way.
- **Would this pass if reverted?** A test that only asserts the mapper's output shape would pass
  with the pull's wiring deleted. Exercise the round trip.
- **`MEASURED_MAX` and the loader field map** — regenerate with
  `node scripts/gen-loader-emits.mjs --write` if a loader changed.
