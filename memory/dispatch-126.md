# Dispatch #126 — Reverse identity-vault tokenization for Punch Times (follow-up to merged
# PR #724)

**Owner's directive, verbatim (2026-08-25):** *"I flagged the PII/privacy considerations to you
upfront via the scope question, and both #123 and #124 are built around the existing
tokenized-identity-vault pattern rather than storing raw names > Let's update this > there is no
reason to hide names for scheduling and punch times > everyone can see this data as-is."*

Companion to dispatch #125, which covers the same reversal on the LifeLenz schedule side
(PR #725, still open). **This dispatch is the QSRSoft punch-times side — PR #724 already merged
and its pull has been running in production**, so this is a real migration against live data and
a running scheduled workflow, not a pre-merge rework. Keep this separate from #125's PR — same
reasoning the original #123/#124 split used (independent review, no file conflicts).

## What NOT to change — read this first

**The SSN-adjacent risk this table's design guards against is a SEPARATE question from the
tokenization question, and this dispatch does not touch it.** `scripts/qsrsoft-punch-times-pull.mjs`
requests punch data from `people/time-punches-matched`, the same endpoint documented in
`memory/finding-qsrsoft-time-punches-endpoint-2026-08-21.md` to return full SSNs + full legal
names when `ssn`/name fields are added to `selectCols`. The current `SELECT_COLS` allowlist
(`geid, storeNum, punchType, isPaidBreak, startDateTime, endDateTime, inModified, outModified,
jobTitleCode, badgeType`) and its `assertNoDeniedSelectCols()` guard exist to keep that specific
risky endpoint from ever being asked for `ssn` or a name field, regardless of what this dispatch
does. **Do not widen `SELECT_COLS` on this endpoint to include a name field, and do not touch
`DENIED_SELECT_COLS`/`assertNoDeniedSelectCols()`.** That guard is orthogonal to "should we hide
names from authorized users" — it's "never let this specific endpoint anywhere near an SSN," and
stays exactly as strict as it is today.

## What changes instead

The table already has everything needed to show a real name **without going near the risky
endpoint's name field at all**: `qsr_punch_times.geid` joins to the pre-existing, already-owner-
approved (dispatch #57) `qsr_employee_tenure.full_employee_name` — the pull script already does
this exact join today, just to feed `getOrCreateToken()` instead of storing the result.

1. **`scripts/qsrsoft-punch-times-pull.mjs`'s identity-resolution step** (`geid → 
   qsr_employee_tenure.full_employee_name → get_or_create_employee_token()`) — change the last
   step: instead of tokenizing the resolved name into `emp_token`, store the resolved
   `full_employee_name` directly on the row (new `employee_name text` column). Keep `geid` as the
   primary/fallback join key exactly as today — this part of the design (geid as the reliable
   identifier, name resolution as best-effort/nullable when no `qsr_employee_tenure` row matches)
   doesn't change, only what gets stored at the end of it.
   - Decide and state whether to keep `emp_token` alongside the new raw name column (harmless to
     leave, may be useful if #125 keeps `emp_token` on the LifeLenz side and something wants to
     join by token instead of name-string) or drop it. No wrong answer — document the choice.
2. **`supabase/schema-qsr-punch-times.sql`** — add the `employee_name` column
   (nullable, same nullability reasoning as `emp_token` today: a `geid` with no matching
   `qsr_employee_tenure` row has no name to resolve). Update the table's `comment on table`
   (currently says "NO ssn, NO name" — needs to now say "no ssn; employee_name resolved via
   qsr_employee_tenure, not requested from the punch endpoint itself").
3. **Migration for already-collected rows.** PR #724 has been live since 2026-08-25 and has real
   rows in `qsr_punch_times`. Write a one-time backfill (SQL `update` joining existing rows to
   `qsr_employee_tenure` by `(loc, geid)`, same logic the pull script now does going forward) so
   historical rows aren't stuck with only a token/no name while new rows get one. State how many
   rows were backfilled and how many remained unresolved (no matching tenure row) when you ran it.
4. Any panel/consumer built on top of this table so far (check whether dispatch #123's seam
   description or anything else already reads `qsr_punch_times` — as of this dispatch nothing
   should, since wiring punch data into a panel was explicitly deferred past both #123 and #124)
   should be re-checked, but this table is backend-only today, so this is likely a no-op — confirm
   and state that in the PR rather than assuming.

## Do NOT

- Do not widen `SELECT_COLS` on `people/time-punches-matched` to request a name or `ssn` — resolve
  the name via the existing `qsr_employee_tenure` join, never from the risky endpoint itself.
- Do not touch `DENIED_SELECT_COLS`/`assertNoDeniedSelectCols()` or its test — that guard's job is
  unrelated to this dispatch and must keep working exactly as it does today.
- Do not touch dispatch #125 / PR #725's LifeLenz files.
- Do not touch `memory/finding-qsrsoft-time-punches-endpoint-2026-08-21.md`'s documented risk or
  weaken any of its stated rules.

## Verification bar

- Grep the final diff: `SELECT_COLS` for the punch endpoint is byte-identical to what's on `main`
  today (no name/ssn field added) — the only change is what happens to the name **after** the
  separate `qsr_employee_tenure` join.
- Confirm the existing "throws if a denied field is ever added to SELECT_COLS" test still exists
  and still passes unmodified.
- Confirm the backfill actually ran against production (or state plainly if it wasn't run and why
  — e.g. no production credential available in this environment — and hand off exact SQL for the
  owner or a future session to run), with before/after row counts.
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build` clean
  (should be a no-op on the bundle — this is backend-only, same as #124 itself).

## Verification note for the PM (independent-review pass)

This is the same identity-space question dispatch #124 was rigorously checked on — re-verify the
`geid`→`qsr_employee_tenure` join is still correct after this change (it shouldn't be touched, but
confirm), and independently spot-check a handful of backfilled `employee_name` values against
`qsr_employee_tenure` directly with a live production query, the same way #124's `geid`/
`audit_rows.emp_id` claim was independently re-queried rather than trusted from the PR description.
