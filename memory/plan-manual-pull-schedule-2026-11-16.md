---
name: plan-manual-pull-schedule-2026-11-16
description: Draft manual-pull cadence for the domains left uncovered by the QSRSoft compliance pause (dispatch 2026-11-16) -- Tier 1 (existing Meridian upload path, just needs a recurring habit) vs Tier 2 (no ingestion path, and genuinely 1-store-at-a-time to pull by hand since there is no bulk multi-store manual export for eBOS/Security Events/Forms). Includes the drafted CoachQ ask about schedulable/bulk options, and open brainstorming on event-triggered (not calendar-triggered) pulls for the expensive Tier 2 reports. Living doc -- owner is actively thinking through this, not a finished plan.
sensitivity: open
metadata:
  node_type: memory
  type: plan
---

# Manual-pull schedule — covering the gap left by the paused QSRSoft scraping pulls

## Context

Per `memory/finding-qsrsoft-security-notice-2026-11-16.md`, 32 credential-login QSRSoft pull
workflows are paused (cron disabled, scripts/tables untouched, `workflow_dispatch` intact) while
staying compliant with QSRSoft's Operator Security Notice. Sales/channel-mix/speed-of-service
stay fully covered via At-A-Glance + the MCP server + the emailed-report pipeline (now also
parsing Labor Analysis + Labor Exceptions, v5.803/5.804). This file is the stopgap for everything
else, while the owner decides what to do about the notice itself (on hold — "we will wait to push
harder").

## Tier 1 — Meridian already has an upload path; just needs a recurring habit, no new code

One multi-store export per report, uploaded through Data Manager like any manual file today.

| Report | Covers | Cadence | Day |
|---|---|---|---|
| Operations Report (combined) | Cash sheet, service stats, controls, sales mix, labor OT | Weekly | Monday, prior 7 days |
| FOB | Food-cost variance | Weekly + always at EOM close | Monday |
| DAR (manual) | Hourly OEPE/R2P/sales-by-hour — stopgap for the paused hourly automated pull | Weekly | Monday (intraday freshness is necessarily degraded during the pause — accepted tradeoff, not a bug) |
| Register Audit | Loss-prevention / cash handling | Weekly | Wednesday |
| Product Mix | Item-level sales/cost | Biweekly | Every other Wednesday |
| Shift Manager Summary | Manager-on-floor accountability | Weekly | Wednesday |

## Tier 2 — No ingestion path exists, AND genuinely one-store-at-a-time to pull

This is the real constraint the owner flagged: before the pause, `qsrsoft-security-events-pull.mjs`
(and its eBOS/Forms siblings) pulled **all 27 stores in one batched API call cycle** — see
`memory/finding-qsrsoft-security-events-drawer-open-2026-11-10.md`'s live 7-day/28-store backfill
as a measured example of that scale. QSRSoft's manual UI has no equivalent bulk/multi-store export
for these report types — Register Audit and Operations Report do (one multi-store export, Tier 1
above); eBOS, Security Events, and Forms do not, as far as confirmed so far. Manually replacing
the automated pull means opening **each store's account separately**, 27 times, per report, per
pull. That is real, measured-shape, operational cost — not a convenience nit.

| Domain | Stakes | Automated-pull scale (pre-pause) | Manual-replacement cost |
|---|---|---|---|
| eBOS purchases | Inventory/ordering | All 27 stores/day, one pull | 27 separate per-store exports |
| Security Events | Loss prevention | All 27 stores/day, one pull (9 event tokens) | 27 separate per-store exports |
| Forms/checklists | Compliance | All 27 stores/day, one pull | 27 separate per-store exports |

**Open question, not yet answered: is there a bulk/multi-store manual view for any of these that
just isn't the default?** Register Audit and Operations Report both have one — worth confirming
the same isn't true for these three before assuming the 27x cost is unavoidable.

## Drafted ask for CoachQ / QSRSoft support (not yet sent — owner's call when)

> Following up on the Scheduled Reports catalog (Sales Ledger, Labor Analysis, Labor Exceptions,
> Cash Sheet, Daily Glimpse, Birthday/Anniversary, Adyen Adjustments) — two questions about reports
> NOT on that list:
> 1. Can **eBOS/Purchases**, **Security Events**, and **Forms/Checklist Completion** be added to
>    the schedulable email-report list, the same way Labor Analysis and Labor Exceptions already
>    are?
> 2. If not schedulable, is there a **bulk, multi-store export view** for any of these three (the
>    way Register Audit and the Operations Report already support exporting all locations in one
>    file), or does pulling them always require opening each store's account individually?

## Smarter-than-calendar: event-triggered Tier 2 pulls (owner is actively thinking this through)

Pulling all 27 stores' worth of eBOS/Security Events/Forms by hand on any fixed calendar cadence
is expensive enough that it's worth asking whether a **calendar cadence is even the right shape**
for Tier 2, as opposed to **triggering a pull for a specific store when something already-live
flags that store** — turning the surviving automated signals into the radar that decides *which*
store and *when*, instead of blanket-pulling all 27 on a fixed day. Brainstorm, not a decision:

- **eBOS/Purchases** → trigger a per-store pull when that store's **FOB variance** (already
  auto-covered, Tier 1 weekly upload) or the **EOM recount-vs-FOB impact** engine (SAGE's
  `query_eom_recount_impact`, already live and automated) flags it as off-target. A clean store
  doesn't need its purchase ledger hand-pulled; a flagged one does.
- **Security Events** → trigger a per-store pull when **Register Audit** or the **Controls
  loss-prevention metrics already in Signals' metric registry** (T-Reds before/after, cash O/S,
  refunds, POS-over $ — all still automated/unaffected by the pause) spike for that store. Those
  metrics are the early-warning layer; Security Events detail is the drill-down you'd only need
  once something's already lit up.
- **Forms/checklists** → trigger a pull **ahead of a scheduled graded visit** (CFV/RGRV/EcoSure) —
  Visit Readiness already tracks each store's last actual visit and its own overdue threshold
  (`overdueThresholdDays`), so the panel already knows which store is coming up for a visit soon.
  Pull that store's Forms data proactively before the visit, not on a blanket schedule.
- **General shape**: use the automated signals that *survived* the pause (FOB, Register Audit,
  Controls, Visit Readiness) as the trigger layer, and reserve the expensive one-at-a-time Tier 2
  manual pulls for the specific store + moment a trigger actually fires — not a standing calendar
  commitment across all 27 stores for data that's quiet 90%+ of the time anyway.

**Not yet worked out**: what the actual trigger thresholds should be, who checks for a trigger
firing (a panel, a SAGE scheduled prompt, a manual glance at Signals), and whether this is worth
formalizing into a Meridian feature (a "needs a Tier-2 manual pull" flag surfaced somewhere) versus
staying a personal habit. This is the open part the owner wants to keep thinking through.

## CoachQ's answer (same day) — closes the "can these be scheduled/bulk-exported" question

Pasted the drafted ask above into CoachQ. Answer, verbatim gist:
- **eBOS/Purchases, Security Events, and Forms/Checklist Completion are NOT on the schedulable
  email list** and the KB documents no way to add one — a report shows the calendar icon or it
  doesn't. **To request this as a feature, contact QSRSoft Support directly** (not something
  CoachQ's KB-grounded answer can resolve on its own).
- **Forms Completion Report is ALREADY an above-store, multi-store report** (Reports > Forms >
  Forms Completion Report — Completion Summary + Completion Details tabs). This changes its
  classification: it is NOT one-store-at-a-time like eBOS/Security Events. Moved out of the
  "expensive Tier 2" bucket below.
- **eBOS/Purchases and Security Events: no documented bulk export found for either.** Still
  genuinely one-store-at-a-time per the KB.
- **Security Events partially overlaps Register Audit** (already a Tier-1 weekly pull) — for
  Security subscribers, Register Audit offers drawer-level drill-down. Worth checking next
  Register Audit pull for how much of Security Events' own ground it already covers before
  treating a separate Security Events pull as mandatory.

Revised bucketing:
- **Still genuinely 1-store-at-a-time, no bulk path**: eBOS/Purchases, Security Events (though
  Register Audit may cover a meaningful slice of the latter already).
- **No longer "expensive"**: Forms Completion Report — it's a normal above-store report, just add
  it to the regular rotation like any Tier 1 item, no event-triggering needed.
- **Open, owner's call**: whether to actually file an enhancement request with QSRSoft Support to
  get eBOS/Security Events onto the schedulable list.

## Built, same day — Manual Pull Triggers (owner: "we need to build this in to the app... flag
## ... the very specifics for what needs to be pulled")

Shipped a real in-app feature rather than leaving this as a personal habit. `src/engine/
manual-pull-triggers.js`'s `computeManualPullTriggers(ds, opts)` composes two EXISTING single-
sources-of-truth — never re-derives either:
- `tolerance-status.js`'s `tolStatusesDistrict` (the same red/yellow/green FOB comparison
  UnifiedTargetsPanel/the rollup tile/coaching findings already use) → flags **eBOS Purchases**
  for a store whose FOB-category metric is red/yellow against its own official target.
- `visit-readiness.js`'s `computeVisitReadiness`/`overdueThresholdDays` (the Visit Readiness
  panel's own overdue-visit tracking) → flags **Forms Completion Report** for a store within 14
  days of (or already past) its own graded-visit cadence threshold.

Surfaced as a "📋 MANUAL PULL NEEDED" card in Data Manager's overview tab (`src/views/
analytics.js`'s `DataManagerPanel`), red/yellow per flag, naming the exact store and report.

**A real gap, caught by measuring rather than assuming (this repo's own standing rule): there is
no Security Events trigger.** Checked `TOL_METRICS` directly — all 4 `cat:'pos'` entries
(cashOS/tRedB/tRedA/discP) have `offKey: null`, meaning none of them has an official-target
workbook column, so `TOL_ROLLUP_METRICS` (which requires both `offKey` and `tol`) excludes every
one of them and `tolStatusesForStore` can **never** emit a `'pos'` status — confirmed empirically
with a one-line node probe before writing a single line of the trigger logic, not assumed from
reading the array. A first draft of this module had a `pos → Security Events` mapping that would
have been silent dead code. **Left as an explicit open item, not guessed at**, since closing it
means a real threshold/product decision (one of: add official target columns for those 4
metrics so they get a real tol status like everything else; a fixed absolute threshold specific
to this trigger; or a dedicated anomaly signal — Signals' Scanner already does correlation/
z-score work on these same Controls metrics, but on data this trigger exists to help REPLACE, so
it can't be the input here). Documented in the module's own header comment and guarded by a test
(`src/__tests__/manual-pull-triggers.test.js`) that fails loudly if the gap is ever silently
closed without updating this file.

Tests: `src/__tests__/manual-pull-triggers.test.js` (engine, 7 cases) +
`src/__tests__/manual-pull-triggers-data-manager.test.js` (renders the real `DataManagerPanel`,
not just the engine — per "would this verification still pass if reverted," a revert of the
panel's wiring fails here even though the engine's own tests would still pass unchanged).
