---
name: finding-missing-lifelenz-tables-2026-11-02
description: "Root cause of a DATA INCOMPLETE banner naming lifelenz_schedule_variance / employee_pay_rate_changes / lifelenz_shift_pay / \"a data table\" — three of the four never had their schema SQL run in Supabase; the fourth is a generic-label gap in _loadOpsTable's fetchAll call (now fixed)."
metadata:
  type: finding
---

# Finding: three LifeLenz tables don't exist live — owner SQL action required

**Reported by the owner 2026-11-02**, via a screenshot of the app's "⚠ DATA INCOMPLETE" banner:
*"4 page(s) failed to load across 4 source(s): lifelenz_schedule_variance,
employee_pay_rate_changes, a data table, lifelenz_shift_pay. Figures from these sources are
UNDERSTATED — reload before acting on them."*

## Measured directly against production (service-role key, `curl`, 2026-11-02)

| table | result |
|---|---|
| `lifelenz_schedule_variance` | **HTTP 404**, `PGRST205` — *"Could not find the table 'public.lifelenz_schedule_variance' in the schema cache"* |
| `employee_pay_rate_changes` | **HTTP 404**, `PGRST205` — table not found |
| `lifelenz_shift_pay` | **HTTP 404**, `PGRST205` — table not found |
| `lifelenz_shift_assignments` | HTTP 200, real rows — fine |
| `lifelenz_compliance_audit` | HTTP 200, real rows — fine (sibling stream, same recent wave) |
| `lifelenz_employee_performance` | HTTP 200, real rows — fine (sibling stream, same recent wave) |

**This is not a code bug, a padding bug, or a transient network failure — the three tables
genuinely do not exist in the live database.** Their `CREATE TABLE` statements are committed and
correct (`supabase/schema-lifelenz-schedule-variance.sql`,
`supabase/schema-employee-pay-rate-changes.sql`, `supabase/schema-lifelenz-shift-pay.sql` — table
names verified to match exactly what the loaders in `src/lib/supabase.js` query), but per this
project's standing architecture, **this agent session has no DDL execution path** (no
`DATABASE_URL`, no `exec_sql` RPC) — schema SQL has always had to be pasted into the Supabase SQL
editor by the owner, and these three were apparently never run.

**✅ Action needed (owner): paste these three files into the Supabase SQL editor, in any order —
no cross-dependencies between them:**
1. `supabase/schema-lifelenz-schedule-variance.sql`
2. `supabase/schema-employee-pay-rate-changes.sql`
3. `supabase/schema-lifelenz-shift-pay.sql`

Once run, the DATA INCOMPLETE banner for these three sources should clear on the next load — no
code or redeploy needed, the loaders already query the right table/column names.

**Downstream impact while unresolved:**
- `employee_pay_rate_changes` feeds the **Pay Rate History** panel's management-pay view
  (CLAUDE.md records this as shipped 2026-10-15) — it has been silently returning zero rows for
  every store since whenever that table's schema SQL should have been run.
- `lifelenz_shift_pay` feeds Pay Rate History's crew-pay view (same panel, hourly side) and
  `src/engine/employee-pay-history.js`'s on-demand derivation.
- `lifelenz_schedule_variance` feeds the Schedule Variance tab/stream (`scheduleVarianceRows`,
  in `stream-freshness.js`'s `STREAMS`) — its own freshness check should also be flagging this
  stream as stale/missing in At-A-Glance's checklist and the Data Manager panel's per-stream
  table; worth a glance there too, though this finding doesn't re-verify that independently.
- The three corresponding pull scripts/workflows (LifeLenz Schedule Variance Pull is its own
  watched GitHub Action; the other two write as a side effect of QSRSoft Employee Roster Pull and
  LifeLenz Daily Sync respectively) have very likely been running "successfully" (exit 0) this
  whole time while their `upsert()` calls against these tables silently failed per-row — the
  known "ran clean, wrote nothing" gap `sync-failure-watch.yml`'s own header comment describes,
  which only `stream-freshness.js`'s STREAMS check (not the workflow-level watcher) can catch,
  and only for `lifelenz_schedule_variance` (the other two aren't in `STREAMS` — they're loaded
  directly by `pay-rate-history.js`, not through `ds`).

## The 4th source — "a data table" (generic fallback, now fixed, unrelated root cause)

`_loadOpsTable()` (`src/lib/supabase.js`, serves `opsCashRows`/`opsLaborRows`/`opsServiceRows`/
`opsSalesMixRows`/`opsPeaksRows` — i.e. `qsr_cash_sheet`/`qsr_labor_summary`/`qsr_service_stats`/
`qsr_sales_mix`/`qsr_peaks_sales`) called `fetchAll()` with no `label` argument — `fetchAll`'s own
fallback for an unlabeled call is the literal string `'a data table'` (`src/lib/supabase.js`,
the `_recordDataError(label || 'a data table', ...)` line). All 5 of those tables were measured
live and respond fine (HTTP 200) — so the 4th failure the banner captured was very likely a
genuine, one-off transient page failure (egress throttle or statement timeout; `fetchAll`'s own
extensive retry logic already handles and reports this correctly) on whichever of the 5 tables
happened to hit it, just rendered meaninglessly as "a data table" instead of naming which one.
**Fixed**: `_loadOpsTable` now passes `table` as `fetchAll`'s label, so a future failure here will
name the real table (`qsr_cash_sheet`, etc.) instead of the generic fallback.

**Not fixed (out of scope for this pass, flagged for awareness):** a broader sweep found roughly
40 other `fetchAll()` call sites across `src/lib/supabase.js` that also omit the label argument
and would fall back to the same generic `'a data table'` string on a page failure. This is a
pre-existing, widespread pattern — not something introduced by or specific to the recent LifeLenz
Data Explorer work — and a full sweep of all ~40 is a much larger change than this pass's actual
trigger (one banner screenshot) warrants. Worth a dedicated pass if generic "a data table"
banners keep recurring and need to be traced to a specific source.
