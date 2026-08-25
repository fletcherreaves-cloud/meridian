# Dispatch #137 — Crew Schedule names showing as "Employee #NNNNN" district-wide: broken roster
# query + a silent upsert-conflict bug, not masking

**Owner's report (2026-08-25):** *"Crew Schedule does not need to be masked > I need to see names
> nothing dangerous here"* + *"same with time punches wherever they are."*

## What was actually true (measured, not assumed)

Crew Schedule's display code was NOT masking anything — dispatch #125 (same day, earlier) already
removed the tokenization layer entirely: `src/views/crew-schedule-panel.js` renders
`e.employeeName || shortEmployeeId(...)`, i.e. it shows the real name whenever one is present and
only falls back to `"Employee #12345"` when the underlying row has no resolved name.

Queried `lifelenz_shift_assignments` directly (live Supabase, service-role key):
**0 of 472 saved rows had a non-null `employee_name`.** Every single row was hitting the fallback,
which is what read as "masking" to the owner — same visible symptom, completely different cause.

Root-caused via the actual LifeLenz Daily Sync job logs (run `32886824302`, triggered manually
this session to backfill the newly-created table), not by reasoning about the code:

```
[shift-assignments] roster fetch failed (0038609 - FREEPORT): GraphQL errors:
  [{"message":"Field 'employmentsInScheduleTimeRange' doesn't accept argument
  'includePayRates'", ...}] -- degrading to ID-only rows
[shift-assignments] save error: ON CONFLICT DO UPDATE command cannot affect row a second time
[shift-assignments] ✓ 472/13688 shift-rows saved (some roster fetches failed...)
```

Two independent, real bugs in `scripts/lifelenz-pull.mjs`:

1. **Every roster fetch failed outright.** `EMPLOYMENTS_QUERY` (`GetSchedulableEmploymentsForPeriod`)
   hardcoded `includePayRates: false, includeEmploymentAvailability: false,
   includeEmploymentContracts: false, includeSharedSchedule: true` as literal field arguments on
   `employmentsInScheduleTimeRange(...)`. The live API rejects `includePayRates` as an argument on
   that field. **This file had already learned this exact lesson** for the sibling `shifts()`
   query — its own comment says *"includePayRates is NOT a shifts() argument; it only gates the
   earnings field via an @include directive"* — but the same mistake was reintroduced for a
   different field when dispatch #123 wrote this second query. Since none of the fields those
   flags would gate (`employmentRate`, `employmentAvailability`, `employmentContracts`, shared-
   schedule data) are requested here (only `id computedName firstName lastName`), the fix is to
   drop the four flags entirely, not reintroduce them as declared `$variables`.
2. **A second, independent bug was silently zeroing out most stores' saved rows even where the
   roster half worked.** `upsertShiftAssignmentRows()` batches a whole store's multi-week shift
   rows into one call, chunked at 500. When the same `shift_id` appeared twice in one chunk,
   Postgres's `ON CONFLICT DO UPDATE` rejects the *entire chunk* ("cannot affect row a second
   time") rather than just the duplicate — explaining why most stores logged "0 shift-rows saved"
   despite finding hundreds of real shifts. Fixed by deduping on the exact `(loc, shift_id)`
   conflict key before upserting.

**Punch Times checked too** (the owner's "same with time punches wherever they are"). Different
pull (`scripts/qsrsoft-punch-times-pull.mjs`), different code path, dispatch #126 already
un-tokenized it the same way. Live query: **81,846 of 132,350 rows (62%) already have a real
`employee_name`** — genuinely working, not masked. The remaining 38% lack a matching
`qsr_employee_tenure` row (a real, separate, smaller data-completeness gap, not a privacy
mechanism) — not in scope for this fix. **No UI panel reads `qsr_punch_times` at all yet** — a
previously-identified, still-open gap, unrelated to naming/masking.

## Fix

`scripts/lifelenz-pull.mjs`:
- `EMPLOYMENTS_QUERY`: drop the four unaccepted field arguments from
  `employmentsInScheduleTimeRange(...)`.
- `upsertShiftAssignmentRows()`: dedupe `rows` by `shift_id` (the exact `onConflict: 'loc,shift_id'`
  key) before building upsert chunks.

## Verification

- Full `npx vitest run`: 2566/2566 passing (no existing coverage of this script's internals —
  purely a live-API/live-DB bug, not something a unit test would have caught).
- `npm run build`: clean, scripts-only change, no bundle impact.
- **Validated against the real LifeLenz API before merge**, not just locally: this PR's branch was
  dispatched via the `LifeLenz Daily Sync` workflow's own `workflow_dispatch` trigger (which the
  live GitHub Actions runner has real `LIFELENZ_TOKEN`/Playwright credentials for, which this
  sandbox does not) and the resulting job log was read directly to confirm real employee names
  now resolve and the save count against `472/13688` improves — see the PR body for the actual
  before/after run numbers.
