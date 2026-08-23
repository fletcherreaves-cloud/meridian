---
name: reference-shift-manager-summary
description: QSRSoft Shift Manager Summary report — endpoint, shape, and field map. Attributes operational metrics to the manager-on-duty per daypart (with per-manager Total + geid). The source for isolating an individual DM/shift-manager's performance in reviews (Notes 33 A#3).
sensitivity: open
metadata:
  node_type: memory
  type: reference
---

# QSRSoft Shift Manager Summary (Notes 33 — per-manager attribution)

Confirms rec C: QSRSoft **already attributes** metrics to the manager-on-duty per daypart, so we PULL it
rather than reconstruct MOD×hourly ourselves.

**Endpoint:** `GET https://api.reports.myqsrsoft.com/reports/mcd/shift/shiftManagerSummary`
**Params:** `nsn=<csv>&orgId=<org>&enterpriseName=McDonalds&timeSegment=daypart&segmentBy=daypart&`
`timeInterval=daypart&startDate=&endDate=&dsd=s&compType=trading&weekStart=3&timeSlices=<12 daypart JSON>`
- `timeSlices` = 12 daypart windows (4am-11am, 11am-2pm, 2pm-4pm, 4pm-9pm, 9pm-12am, 12am-4am — each
  listed twice, normal + +24h overnight form, e.g. startTime "28:00").
**Shape:** top-level `{ resp: [ ... ] }` (no result wrapper). One row per (nsn, timeSlice, manager).
- `timeSlice` ∈ the 6 dayparts + **"Manager Total"** (the manager's roll-up for the day).
- `geid` + `managerName` identify the manager. **geid joins to Employee Roster** (same id). `geid:0` /
  `managerName:"No FL Manager"` = **No FLOOR Manager scheduled** for that shift (NOT Florida — FL = Floor;
  easy to confuse). Happens at any store; skipped (can't attribute to a person) → rolls into store-total.

**Per-row metrics (manager-attributed):** actualHours · actualVsNeeded · actualVsScheduled ·
allNetSales (+ dt/fc/instore splits + *CompAmt vs plan) · transactions · numShifts · avgCheck ·
transPerPunchedHour · **OEPE** (+OEPEComp) · OEPENoPark · **CTP** · **dtTTL** · **R2P** (+R2PComp) ·
expTTL · **KVSTimePerTran** · dtPctPullForward · healthyUsePct · **punchedLaborPct**.
Times are in **seconds** (OEPE 157 = 2:37); Comp fields are vs-target deltas.

**How to use for reviews (Notes 33 A#3):** pull a monthly window per store, aggregate each manager's
"Manager Total" rows across days (weight speed metrics by shifts/trans, sum sales/hours), key by geid →
`shift_manager_monthly` (loc, period_month, geid, name, …). Wire **DM/shift-role** reviews to the
manager-attributed metrics (OEPE/R2P/CTP/KVS/labor%/avgCheck/sales); **GMs keep store-total**. Provenance
(per [[feedback-metric-provenance]]): source = this report, per-manager-on-duty daypart attribution.

Not built yet — queued behind Notes 33 order (wiring+provenance → One-Pager bugs → this). Owner sent the
dev capture 2026-07-28. See [[notes-33-queue]], [[session-handoff-2026-07-28]].

**Explicit-range pulls (#266, added 2026-08-14):** `scripts/qsrsoft-shift-manager-pull.mjs` accepts
`SHIFTMGR_START`/`SHIFTMGR_END` overrides for investigative pulls narrower than a calendar month —
a single day: set only `SHIFTMGR_START`. Because the endpoint already takes an arbitrary
startDate/endDate, this is a one-request change, not a per-day loop. An explicit range writes to
the companion table **`shift_manager_range`** (loc, geid, period_start, period_end), never
`shift_manager_monthly` — upserting a partial window against the monthly table's `(loc,
period_month, geid)` key would silently overwrite the cron job's whole-month aggregate. See
`supabase/schema-shift-manager-range.sql`. Carries `tenant_id` + tenant-scoped RLS from creation
(PR #267 review — added before the table had any rows, matching CLAUDE.md's standing rule for
new pulls even though its older sibling `shift_manager_monthly` predates that rule and still
lacks it). `resolveWindow()` validates `SHIFTMGR_START`/`SHIFTMGR_END` are `YYYY-MM-DD` and
non-inverted before any network call — a hand-invoked path where a typo'd date is the expected
failure mode, not an edge case; previously a bad date silently reached the endpoint, returned
zero rows, and printed a misleading "check timeSlices / auth" error.
