---
name: finding-cash003-security-events-restructure-2026-11-11
description: CASH-003 (manual/self-authorized refund $, personal baseline, $5 threshold) restructured to source from qsr_security_events (live, current through today) instead of the dead audit_rows/Register Audit pull (zero rows since 2026-09-19, memory/finding-register-audit-pull-403-explicit-deny-2026-11-11.md). Self-authorization = crew_token === mgr_token on a cash_refund/cashless_refund event, confirmed a real pattern in live data. CASH-003's own rule definition (field name, threshold, baseline) is UNCHANGED -- only the data source moved. CASH-001 (cash O/S), CASH-002 (POS-over rate), CASH-004 (promo rate) CANNOT be restructured the same way -- their denominators (drawerSales/drawerGC, a per-register-shift total) have no equivalent in qsr_security_events, which only carries discrete flagged events, not every transaction. They remain blocked until the QSRSoft-side permission issue is fixed. Also corrects memory/design-security-events-risk-rules-2026-11-09.md's stale "already covered by CASH-003 reading audit_rows" premise, which was false even on the day it was written. Read before re-proposing the same restructure for CASH-001/002/004, or re-deriving why CASH-003's data_required array lists BOTH audit_rows and qsr_security_events:manual_refund.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# CASH-003 restructured onto qsr_security_events (2026-11-11)

## Why

`audit_rows` (the Register Audit pull, CASH-001-004's shared source) has returned zero rows
company-wide since 2026-09-19 — a QSRSoft-side 403 "explicit deny" on that one report specifically,
unrelated to token expiry, confirmed from the real job log
(`memory/finding-register-audit-pull-403-explicit-deny-2026-11-11.md`). Owner's direction: *"Let's
treat like we did for the other security data and restructure how we pull the data."*

## What else exists, and what it actually covers

`qsr_security_events` (fed by `scripts/qsrsoft-security-events-pull.mjs`, a 2026-11 rebuild that
dropped the Playwright/browser-context dependency entirely for a plain `fetch()` against
`api.security.myqsrsoft.com` — a *different* QSRSoft host than the blocked
`api.reports.myqsrsoft.com/.../regAudit` endpoint, so it is not subject to the same account-level
explicit-deny) is live and current: **695,509 rows, newest `event_dt` = today (2026-11-11)**,
measured directly. It already carries `cash_refund`/`cashless_refund` events (385 + 183 in the
last 14 days alone) with a real per-event dollar amount (`event_amt`) and BOTH the ringing
employee (`crew_token`) and the authorizing manager (`mgr_token`) on the same row.

**The self-authorization signal exists and is real**, confirmed against live sample rows before
writing any code: several real refund events have `crew_badge === mgr_badge` (the same person rang
the refund and is recorded as its authorizing manager) — exactly the "manual/self-authorized
refund" concept `audit_rows.manualRefAmt` (mapped from QSRSoft's `manOverringAmt` field) was built
to catch. A manager-authorized refund (different crew and mgr) is a different, legitimate event,
correctly excluded.

## What was built

`scripts/security-rules-run.mjs`:
- `loadSecurityEventsWindow()` now also selects `event_amt` (previously unselected — the EVENT-*
  rules only ever needed counts).
- New `aggregateManualRefundEvents(rawRows)`: filters to `cash_refund`/`cashless_refund` events
  where `crew_token === mgr_token` (both non-null), sums `event_amt` into `manualRefAmt` and counts
  into `manualRefCnt`, grouped by `(loc, date, crewToken)` — the exact `{loc, date, emp, empToken,
  manualRefAmt, manualRefCnt}` shape `mapAuditRow()` already produces, so CASH-003's existing
  `computeFindingsForRule()` call needs **zero changes**.
- New `supportsManualRefundEvents(rule)`, checked **before** the generic `supportsAuditRows(rule)`
  in `main()`'s dispatch chain. CASH-003's `data_required` is now `['audit_rows',
  'qsr_security_events:manual_refund']` — **`audit_rows` stays first in the array deliberately**:
  `computeFindingsForRule()`'s own call to `evaluateRule()` hardcodes the dataContext key as
  literally `'audit_rows'` (confirmed by reading that call site, not assumed), not
  `rule.data_required[0]`, so changing the array's first entry away from `'audit_rows'` would have
  silently broken evaluation — caught by a real test exercising the actual call site before this
  shipped, not discovered in production. The qualifier is read only by
  `supportsManualRefundEvents()`'s own dispatch check.
- Reuses the EXACT SAME raw-row cache (`securityEventsRawCache`) the EVENT-001/002/003/004 branch
  already populates for the same window — no new query added.

Rule definition itself (threshold $5, personal baseline, field name `manualRefAmt`) is completely
unchanged in `security_rules`. Updated `data_required` live via the Supabase Management API
(data-only change, not a schema migration).

Tests: `src/__tests__/dispatch-cash003-security-events-restructure-2026-11-11.test.js` — exercises
the real `aggregateManualRefundEvents` + `computeFindingsForRule` call sites, including the
self-authorization filter, the manager-authorized-refund exclusion, and a regression test for the
`data_required` key-resolution bug caught mid-build.

## What this does NOT fix

**CASH-001 (cash O/S rate: `cashOSDollar / drawerSales`), CASH-002 (POS-over rate: `posOverCnt /
drawerGC`), and CASH-004 (promo rate: `promoAmt / drawerSales`) remain blocked.** Checked each
rule's real `logic_expression` before concluding this (not assumed): all three are **ratios**, and
their **denominators** (`drawerSales`, `drawerGC` — a per-register-shift total) have **no
equivalent in `qsr_security_events`**, which only carries discrete *flagged* events, never a
register's total sales or total guest count. CASH-002's numerator (`posOverCnt`, via the
`pos_overring` token) and CASH-004's numerator (`promoAmt`, via `all_promo`) DO have equivalents —
only the denominators are the blocker. CASH-001's numerator (`cashOSDollar`, a till-reconciliation
figure) also has no `qsr_security_events` equivalent at all; that one would need a different
source entirely (e.g. `qsr_cash_sheet`, which is still live via `qsrsoft-ops-pull.mjs` and already
the primary source for `metric-source.js`'s `cashOSAmt` chain elsewhere in the app — a genuinely
different, separate restructuring question, not attempted here).

This is a correction, not new information at the time of writing: `memory/design-security-events-
risk-rules-2026-11-09.md` stated *"CASH-002/003/004 are already active security_rules on POS-over,
manual refund, and promo [via audit_rows]... scoring [cash_refund/cashless_refund] from
qsr_security_events would duplicate live rules on an already-covered signal"* — that was already
false the day it was written (audit_rows had been dead for seven weeks by then). Do not cite that
doc's "already covered" line for CASH-003 going forward; it is corrected here.

## Verification before calling this done

Ran the full suite (845/845 files, 7802/7802 tests passing) after this change. Did not yet
manually trigger `security-rules-run.yml` against production and inspect the real resulting
findings before writing this file — that is the next, final verification step (see commit body /
chat for whether it happened and what it showed).
