---
name: reference-shift-manager-summary
description: QSRSoft Shift Manager Summary report — endpoint, shape, and field map. Attributes operational metrics to the manager-on-duty per daypart (with per-manager Total + geid). The source for isolating an individual DM/shift-manager's performance in reviews (Notes 33 A#3).
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
