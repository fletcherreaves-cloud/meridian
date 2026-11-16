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
