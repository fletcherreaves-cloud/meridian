---
name: dispatch-57
description: Dispatch #57 - persist per-person employee tenure. Owner-approved reversal of a deliberate "no individual-employee data is stored anywhere" decision in qsrsoft-employee-roster-pull.mjs. Extends the existing pull with a qsr_employee_tenure table carrying both start dates, job title, status, pay rate and name. Answers dispatch #56 Part B, which was never blocked on a capture.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #57 — persist per-person employee tenure (Part B, for real this time)

**Owner-approved 2026-08-21.** Asked whether to reverse the no-individual-data decision: *"reverse
it"*, then on scope: *"Let's just do it all. I can address the role level access to certain
metrics/data later."* Delivery: **extend the existing pull**, not a new one.

## 🔴 This reverses a deliberate decision. Read it before you start.

`scripts/qsrsoft-employee-roster-pull.mjs` says, in its own header:

> *"…per store/month (`roster_role_counts`). **No individual-employee data is stored anywhere.**"*

and above `SELECT_COLS`:

> *"Trimmed column set — job-code + status only. Deliberately EXCLUDES `ssn`, `dateOfBirth`,
> `address`, `phone`, `email` so PII is never fetched onto the CI runner."*

That was a considered choice, not an oversight. **The owner has reversed the storage half of it.**
Update both comments in the same PR so the next reader isn't told the opposite of what the code does
— a stale comment claiming "no individual data is stored" sitting above code that stores it is worse
than no comment.

## 🚫 What does NOT change — the fetch-side allowlist stays

**"Do it all" means all three options that were offered: tenure fields, pay rate, and name.**
It does **not** authorise the fields that were never on the table, and these stay excluded from
`SELECT_COLS`:

**`ssn` · `dateOfBirth`/`birthday` · `nationalOrigin` · `gender` · `federalMaritalStatus` ·
`address`/`streetAddress`/`city`/`zipCode` · `emailAddress` · phone numbers · emergency contacts**

Two reasons, both still live:

1. **`ssn` must never leave QSRSoft.** `selectCols` is caller-chosen, so this costs nothing.
2. **`nationalOrigin` (race), `gender`, `dateOfBirth` and `federalMaritalStatus` are protected-class
   attributes.** Storing them beside performance data makes it possible to compute a metric split by
   race, age or sex *by accident*. Not a hypothetical in a system that auto-correlates metric pairs
   — see the Signals Scanner.

**Add a guard to the script** asserting none of those appear in `SELECT_COLS`, so a future edit fails
loudly rather than silently widening the fetch. Same pattern the `time-punches` finding requires.

## What to add to `SELECT_COLS`

Already present: `homeLocation`, `geid`, `storeStartDate`, `storeEndDate`, `employmentStatus`,
`locationType`, **`fullEmployeeName`**, `terminationEntryDate`, `terminationReason`, `jobTitleCode`,
`jobCodeType`, `jobTitleCodeDescription`, `jobTitleCodeStartDate`.

**Missing and required — add both:**

- **`orgStartDate`** — 🔴 **not currently fetched, and it is half of Part B.** See below.
- **`hourlyPayRate`** — for the approved pay-rate column.

## 🎯 BOTH start dates, distinctly labelled — the core of Part B

Owner, 2026-08-21: *"I think both are relevant."*

| field | meaning |
|---|---|
| `orgStartDate` | joined the **organization** |
| `storeStartDate` | joined **this store** |

They diverge often and hugely — one measured record shows **eight years with the org, two months at
the store**. Neither reconstructs the other.

**Requirements:**

- Store both columns. **Never render either as an unqualified "start date"** — that reading is wrong
  for every transferred employee, and transfers are exactly the people whose tenure gets misjudged.
- Surface the **gap** where they diverge. *"8 years with the org, 2 months at this store"* is a more
  useful sentence to a supervisor than either date alone, and it names a real coaching situation: an
  experienced person who is new *here*.
- `jobTitleCodeStartDate` (time in current role) is arguably the most coaching-relevant of the three
  — keep it.

## Schema — `qsr_employee_tenure`

Per-person, per-store. `tenant_id` + RLS via `accessible_locs`, like every other table.

- **Key on `geid`** — a stable system-of-record person key, already established as the vault's
  identity (`finding-qsrsoft-time-punches-endpoint-2026-08-21.md`). PK `(tenant_id, loc, geid)`.
- **`loc` zero-padded to 7**, matching every other table. The API returns unpadded `storeNum`/
  `homeLocation`; reuse the existing conversion, don't write a second one.
- ⚠️ **`"0000-00-00"` is the date null sentinel**, not `null` — it appears on `storeEndDate` and
  `terminationEntryDate` for every active employee. **Normalise to null on ingest or every date
  parse breaks.** Third sentinel family in this system after `emp_id='0'` and `completedBy='--'`.
- Store `full_employee_name` as approved. **Also keep `geid` as the join key everywhere else** — the
  identity vault stays the reveal path for the security panel; this table is not a licence for other
  panels to start rendering names directly.
- `hourly_pay_rate` as numeric. The owner explicitly deferred role-gating: *"I can address the role
  level access to certain metrics/data later."* **So ship it in the table but do not surface pay in
  any panel in this dispatch** — a column nobody renders is easy to gate later; a rendered one is not.

## Delivery — extend the existing pull

Add the tenure upsert to `qsrsoft-employee-roster-pull.mjs` alongside `roster_role_counts`. One
pull, one schedule, and its workflow (`QSRSoft Employee Roster Pull`) is **already** in
`sync-failure-watch.yml` — so no new watch entry is needed. Keep `roster_role_counts` working
unchanged; this is additive.

## Verification bar

- **Revert-sensitive at the call site.** Per the standing rule, a test that only exercises a
  normalizer would pass with the upsert deleted. Test through the actual write path.
- **Fixtures must be synthetic.** No real names, geids, or pay rates in any test file.
- Cover: the `"0000-00-00"` sentinel on both date fields; `orgStartDate` ≠ `storeStartDate`
  divergence; the `SELECT_COLS` denial guard (assert it fails when `ssn` is added); loc padding.
- `npm run build` clean; the roster pull's existing `roster_role_counts` output unchanged.

## What this dispatch does NOT do

- **No panel.** Storage and pull only. How tenure surfaces — and where the org/store gap gets shown
  — is a separate piece once there is data to look at.
- **No pay surfacing**, per above.
- **No backfill decision.** The pull is forward-looking by default; `employmentStatus=active` is a
  request filter, so terminated staff are reachable by changing it. Whether to backfill history or
  include leavers is an owner call, not this dispatch's.

## ✅ Shipped (2026-08-22, v5.102)

New `supabase/schema-qsr-employee-tenure.sql` — PK `(tenant_id, loc, geid)`, accessible_locs-scoped
read RLS (per this brief's own "like every other table" instruction — matched against
`schema-hourly-projection-accuracy.sql`'s pattern, not the plain tenant-only pattern most ordinary
QSRSoft tables use, since this one carries a name and a pay rate), service-role write.

`src/engine/people-reports.js`'s `parseEmployeeRosterApi()` gained `orgStartDate`/`hourlyPayRate`
fields (both through the same `cleanDate()`/`num()` cleaning every other field already uses) —
the one shared record shape `rosterCounts()`/`shiftCertifiedByLoc()`/the review auto-populate all
still consume, unchanged. `qsrsoft-employee-roster-pull.mjs` gained `orgStartDate`/`hourlyPayRate`
in `SELECT_COLS`, `assertNoDeniedSelectCols()` (called at import time, tested against every listed
denied field individually — ssn, dob, protected-class attributes, address/contact fields), and
`toTenureRows()` (padded loc, drops a record with no `geid` rather than fabricating a key) feeding
a new `qsr_employee_tenure` upsert that runs alongside the existing `roster_role_counts` one,
unchanged.

Both header comments this brief flagged as now-inverted (the module header's "No individual-
employee data is stored anywhere" and `SELECT_COLS`'s own "Deliberately EXCLUDES... so PII is
never fetched") were rewritten to state the current, correct contract rather than the reversed one.

Also added the `import.meta.url === file://process.argv[1]` direct-execution guard around
`main()` (mirroring `qsrsoft-register-audit-pull.mjs`'s own precedent) and guarded the module-level
`createClient()` call to return `null` when Supabase env vars are absent — neither existed before
this dispatch, and both were required to make `toTenureRows()`/`assertNoDeniedSelectCols()`
importable from a test without crashing at import time (this sandbox has no live Supabase
credentials to exercise the actual upsert against).

1989/1989 tests: 3 new in `people-reports.test.js` (orgStartDate vs storeStartDate divergence,
the `0000-00-00` sentinel on `orgStartDate`, `hourlyPayRate` null-when-absent) + 12 new in the new
`src/__tests__/employee-roster-tenure-pull.test.js` (loc padding, date-field divergence at the
actual write-path row shape, the sentinel already-null, pay-rate passthrough, geid-drop, empty-
input, `updated_at` stamping, and the denial guard passing on the real live `SELECT_COLS` plus
failing on every individually-listed denied field). Build clean, no client-bundle size change
(both touched files are Node-only pull-side code, never imported by `src/app`).

Not built, per this brief's own explicit scope: no panel, no pay surfacing, no backfill decision.
