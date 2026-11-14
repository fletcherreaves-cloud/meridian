---
name: finding-register-audit-preparer-duplicate-2026-11-14
description: "GH #1314 follow-up -- after the endpoint migration (v5.779) fixed the 403 outage, a live-dispatched verification run hit a SECOND, different Postgres error on the preparer register type: 'ON CONFLICT DO UPDATE command cannot affect row a second time.' Root cause not yet confirmed; resilience fix shipped, root-cause investigation still open."
metadata:
  node_type: memory
  type: finding
scope: tenant
sensitivity: open
---

# Register Audit Pull: preparer-type duplicate-key collision (2026-11-14)

## What happened

After v5.779 (the GH #1314 endpoint migration) merged, I manually dispatched the real
`QSRSoft Register Audit Pull` workflow (run #107,
https://github.com/fletcherreaves-cloud/meridian/actions/runs/43626325752) to verify the fix in
the actual CI/Playwright pipeline rather than wait for the next daily cron. Result: **partial
success, new failure.**

```
[audit-pull] 2026-11-08..2026-11-14:cashier: 1060 rows → 1060 saved
[audit-pull] 2026-11-08..2026-11-14:manager: 488 rows → 488 saved
[audit_rows] save error: {
  code: '21000',
  hint: 'Ensure that no rows proposed for insertion within the same command have duplicate constrained values.',
  message: 'ON CONFLICT DO UPDATE command cannot affect row a second time'
}
[audit-pull] 2026-11-08..2026-11-14:preparer ERROR: ON CONFLICT DO UPDATE command cannot affect row a second time
[audit-pull] 1/3 unit(s) failed (33%)
```

So: **the 403/endpoint-migration fix is confirmed working** -- cashier and manager both saved
cleanly on the new `data_layer/v1/cash/register-audit-by-employee` endpoint. But the `preparer`
register type hit a genuinely different bug: two rows in that single response share the exact
same `(loc, date, emp, register_type)` composite -- `audit_rows`'s upsert conflict key
(`src/lib/supabase.js`'s `saveAuditRows()`, mirrored in the pull script). Postgres cannot resolve
a duplicate conflict key within one multi-row `INSERT ... ON CONFLICT` statement, so the whole
preparer batch for that window failed, not just the colliding row.

This is the SAME error class as GH #1698 (duplicate ON CONFLICT key) but a **different root
cause** -- #1698 was two genuinely distinct employees split by `job_title_code`, which this
table's key already includes nowhere near (register_type is fixed per API call, not per row).
Here, `register_type='preparer'` is constant for the whole call, so two rows sharing
`(loc,date,emp)` within ONE preparer response means either: the API returns a true duplicate row
(e.g. pagination overlap), or two distinct real preparer-type employees share an identical
`empName` string at the same store on the same date (a name collision, since the conflict key
uses the raw name, not `empId`).

## Why I couldn't confirm which, directly

Tried to reproduce the raw API response live (same Playwright two-path auth pattern as the real
script) from this agent sandbox to inspect the actual duplicate rows. Blocked:

```
We make it easier to run great restaurants Sign in Email Password
Request not allowed due to WAF block.
```

QSRSoft's WAF rejects the login POST from this sandbox's egress IP. This is NOT the same failure
as #1314/#1698 -- the GitHub Actions runner's IP clearly has clean access (it logged in and
pulled 1548 real rows in the very same run). Not something to route around (that would be
evasive behavior against a third party's access controls, and isn't the kind of blocker this
agent should try to bypass) -- the real fix has to come from a production run's own debug output.

## What shipped now (resilience, not root-cause-fix)

`scripts/qsrsoft-register-audit-pull.mjs`'s new `dedupeAuditRows(rows, warn)` (exported, pure,
unit-tested -- no supabase dependency, same pattern as `mapRow()`/`extractRows()`):
- Collapses any duplicate `(loc,date,emp,registerType)` to one row (last-row-wins, by array
  order) BEFORE the upsert -- the same outcome two separate single-row upserts would produce
  anyway; Postgres just can't do it within one statement when both rows are in the same payload.
- Logs every collision loudly (`console.warn`, not swallowed): loc, date, emp name, register
  type, and BOTH colliding rows' `empId` -- so the next real production run's job log names the
  exact person(s)/date/store, closing the gap my WAF-blocked sandbox couldn't.

This means: a preparer-type collision no longer fails the ENTIRE register-type window's save (as
it did in run #107 -- that window saved 0 preparer rows). It does NOT yet explain why the
collision happens. If the next run's warn log shows two DIFFERENT `empId` values colliding on
the same name, that's a genuine same-name-different-person collision and the `audit_rows` key
itself may eventually need widening (same shape as #1698's fix) to include `emp_id`. If it shows
the SAME `empId` twice, that points at a true API-side duplicate (pagination overlap or similar)
and the fix is upstream of this dedup, not the key. **Re-dispatch the workflow and read the
job log before acting on either theory** -- per this repo's "measure it, don't reason about it"
rule, this doc deliberately does not guess which.

## Status

- #1314's 403/endpoint-migration root cause: **fixed and confirmed live** (v5.779).
- This NEW preparer-duplicate bug: resilience fix shipped (this dispatch), real root cause
  **still open** -- needs one more live dispatch + job-log read once this ships, or the next
  natural scheduled run (daily cron, 10:00 UTC).
- GH issue #1314 will not auto-close until a scheduled/dispatched run of this workflow succeeds
  end-to-end (all 3 register types, not just 2 of 3).
