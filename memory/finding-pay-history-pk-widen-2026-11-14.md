---
name: finding-pay-history-pk-widen-2026-11-14
description: "GH #1698 -- QSRSoft Employee Pay History Pull failed on 15/28 stores with a Postgres upsert error. Root cause, the two options weighed, and the permanent fix the owner ran."
metadata:
  node_type: memory
  type: finding
scope: tenant
sensitivity: open
---

# Employee Pay History Pull: PK widened to include job_title_code (2026-11-14, GH #1698)

## Root cause

`qsr_employee_pay_period_history`'s primary key was `(tenant_id, loc, geid, pay_type,
period_start)`. QSRSoft's employee-pay-details endpoint genuinely returns a distinct row per
job title within one pay period -- an employee who worked two different job titles in the same
period gets two real rows, each with its own `hourly_pay_rate`/`total_hours`/`total_dollars`.
The old PK couldn't distinguish those two rows, so the upsert batch collided on the same
conflict key twice in a single statement:

```
ERROR: ON CONFLICT DO UPDATE command cannot affect row a second time
```

Confirmed on a real example: geid 200379134 (Michael Yarbrough) had two Regular-pay rows in one
period under two different job titles. This failed 15/28 stores (54%, over the script's 25%
alert threshold) while 12/28 still saved 1879 real rows that session -- a real, live bug, not
routine sync noise, and a **different** root cause from the concurrent #1314 outage (confirmed
by reading both failure logs directly rather than assuming a shared cause).

## Two options weighed, owner chose the permanent one

1. **Widen the PK to include `job_title_code`.** Matches the real data model. No information
   loss, ever. Every current and future multi-title case just works without anyone touching it
   again. One-time DDL, then done.
2. **Script-only merge** (blend colliding rows before upsert). No DDL needed, but this is NOT a
   one-time cost -- it silently blends two different jobs' hours/rate/dollars into one row
   *every time this happens, forever*, in a table whose entire stated purpose
   (`schema-qsr-employee-pay-history.sql`'s own comment) is being the real historical wage
   ground truth. A standing, recurring data-loss trade disguised as a quick fix.

Owner ran option 1.

## The wrinkle: job_title_code can be null

`mapRow()` previously mapped a missing job title to `null` (`r.jobTitleCode ?? null`). A
PRIMARY KEY column can't be nullable, so the migration had to backfill existing nulls to a
sentinel (`''`) before widening the PK, and the pull script had to switch its own coalesce from
`?? null` to `?? ''` so it never writes a real null again going forward -- otherwise the very
next pull with a missing job title would hit a NOT NULL violation instead of the old upsert
error.

## What shipped

**`supabase/schema-pay-history-widen-pk-job-title-2026-11-14.sql`** (owner-run, confirmed live
via the Management API this same session):
```sql
update public.qsr_employee_pay_period_history set job_title_code = '' where job_title_code is null;
alter table public.qsr_employee_pay_period_history drop constraint qsr_employee_pay_period_history_pkey;
alter table public.qsr_employee_pay_period_history alter column job_title_code set not null;
alter table public.qsr_employee_pay_period_history alter column job_title_code set default '';
alter table public.qsr_employee_pay_period_history add primary key (tenant_id, loc, geid, pay_type, period_start, job_title_code);
```

**Measured directly against the live DB after the run** (Supabase Management API, `pg_constraint`
introspection -- not inferred):
- PK is now `(tenant_id, loc, geid, pay_type, period_start, job_title_code)`, all 6 columns
  `attnotnull: true`.
- `select count(*) where job_title_code is null` → `0`.
- `job_title_code`'s `column_default` → `''::text`.

**`scripts/qsrsoft-pay-history-pull.mjs`** (companion code change, same dispatch):
- `mapRow()`: `jobTitleCode: r.jobTitleCode ?? ''` (was `?? null`).
- `saveRows()`'s upsert: `onConflict: 'tenant_id,loc,geid,pay_type,period_start,job_title_code'`
  (was missing `job_title_code`).

**End-to-end live proof, not just unit tests:** upserted two synthetic rows (fake
`loc:'9999999'`/`geid:'TEST-1698-FIX'`) with identical loc/geid/pay_type/period_start but
different `job_title_code` (`'650'` vs `'710'`) directly against the live table via the REST API
-- both saved as two distinct rows, confirming the exact #1698 collision shape no longer errors.
Test rows deleted immediately after and confirmed gone.

5 new unit tests in `src/__tests__/qsrsoft-pay-history-pull-2026-11-05.test.js` cover `mapRow()`'s
null→`''` sentinel and the two-job-titles-same-period collision shape.
