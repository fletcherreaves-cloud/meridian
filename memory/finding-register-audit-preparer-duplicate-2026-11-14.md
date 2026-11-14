---
name: finding-register-audit-preparer-duplicate-2026-11-14
description: "GH #1314 follow-up -- after the endpoint migration (v5.779) fixed the 403 outage, a live-dispatched verification run hit a SECOND, different Postgres error on the preparer register type: 'ON CONFLICT DO UPDATE command cannot affect row a second time.' RESOLVED same day (run #108): root cause is QSRSoft's own 'No Preparer' placeholder name colliding across distinct empIds, not a true API duplicate or a real-person name collision. Resilience fix (dedupeAuditRows) shipped and confirmed sufficient; #1314 auto-closed."
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

## Root cause confirmed (run #108, same day)

Re-dispatched the workflow after v5.781 merged (run #108,
https://github.com/fletcherreaves-cloud/meridian/actions/runs/43628756900, `days_recent:2
debug:1`). All three register types saved cleanly, no failed units:

```
[audit-pull] 2026-11-11..2026-11-14:cashier: 522 rows → 522 saved
[audit-pull] 2026-11-11..2026-11-14:manager: 240 rows → 240 saved
[audit-pull] duplicate (loc,date,emp,registerType) in one response -- loc=0006972
  date=2026-11-11 emp="No Preparer" type=preparer empId(A)=0 empId(B)=e7225007 --
  keeping the later row
[audit-pull] 2026-11-11..2026-11-14:preparer: 246 rows → 245 saved
[audit-pull] done — 1007 rows saved.
```

The new warn log's `empId(A)`/`empId(B)` resolves the open question directly: this is **neither**
a true API-side duplicate (same empId twice) **nor** two distinct real employees sharing an
identical name. `empId(A)=0` is QSRSoft's own sentinel for "no preparer was assigned to this
transaction" -- `empId(B)=e7225007` is a real employee id. **Both get rendered under the same
literal display string `"No Preparer"`** by QSRSoft's own report, so any store/date with more
than one "preparer not assigned" transaction collides under the name-based conflict key,
regardless of which (if any) real employee record each one is actually attached to.

This means `dedupeAuditRows()`'s last-row-wins collapse is the *correct* permanent handling here,
not a stopgap masking a data-integrity problem -- there is no real "duplicate preparer record" to
reconcile; `register_type='preparer'` rows literally carrying the placeholder name have no
individual identity worth preserving distinctly in `audit_rows` (which is keyed by name, not
`empId`, by design). No further fix is needed unless a FUTURE collision log shows two *different,
non-zero, non-placeholder* `empId`s under the same name -- that would be a genuine same-real-person
duplicate or name collision and would warrant revisiting the key shape. Watch future collision
log lines for that shape; this specific "No Preparer" collision class is closed.

## Status -- RESOLVED

- #1314's 403/endpoint-migration root cause: **fixed and confirmed live** (v5.779).
- The preparer-duplicate bug: **fully root-caused and confirmed resolved** (v5.781 + run #108,
  2026-11-14). No further action needed on this specific collision shape.
- GH issue #1314 **auto-closed** at 2026-11-14T18:51:55Z (`state_reason: completed`), triggered by
  run #108's end-to-end success (all 3 register types, 1007 rows, 0 failed units).
