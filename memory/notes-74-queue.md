---
name: notes-74-queue
description: Field notes batch 74 (owner, 2026-11-11) — raw QSRSoft deep-link URLs for the
  operational Quick Links footer (task #133). Raw capture first per this repo's own "commit
  every memory file in the same commit as the work that cites it" rule (Notes queues have been
  lost before when only pasted into a session). Per-store deep-link syntax verification is a
  separate, in-progress follow-up — see the status note below before trusting any URL here to
  already support a store-scoping query param.
metadata:
  type: project
---

# Notes 74 — QSRSoft Quick Links (owner, 2026-11-11)

Owner, verbatim: *"Links (URLS) _ I can supply more as needed... You can also login as well and
verify syntax to make the links even more specific to open directly to active store where
appropriate."*

Feeds task #133 (At A Glance operational Quick Links footer — atMcd, MBSync, PACE Portal was the
original scope; these QSRSoft links are an expansion of that same footer).

## Raw links, as supplied

**QSRSoft**
- Home — https://v3.myqsrsoft.com/home-dashboard
- Register Audit — https://v3.myqsrsoft.com/reports/mcd/controlsCash/registerAudit
- Tickets — https://v3.myqsrsoft.com/equipment/tickets
- Travel Path (With Playplace) — https://v3.myqsrsoft.com/forms/take?formId=fd2c551a-5859-449a-80c1-5bb980ce7704
- Travel Path (No Playplace) — https://v3.myqsrsoft.com/forms/take?formId=3ee1cc75-9f29-42d2-b49f-6ca3216addb4
- Pre-Shift Checklist – Breakfast — https://v3.myqsrsoft.com/forms/take?formId=af2c43a5-2416-4f51-ba78-8377bea88745
- Pre-Shift Checklist – Lunch — https://v3.myqsrsoft.com/forms/take?formId=9f09c80c-436f-4c26-93d6-85198bd1da0e
- Pre-Shift Checklist – Dinner — https://v3.myqsrsoft.com/forms/take?formId=55e8846f-bbcd-4129-a05a-85c964bec805
- Operations Report — https://v3.myqsrsoft.com/reports/mcd/shift/operationsReport
- 3 Peaks — https://v3.myqsrsoft.com/reports/mcd/shift/3PeaksReport

**QSRSoft – Food Cost**
- Food Over Base — https://v3.myqsrsoft.com/cimt/inventory/food-over-base
- On Hand Inventory — https://v3.myqsrsoft.com/cimt/inventory/on-hand-inventory
- Variance Stat/Yields — https://v3.myqsrsoft.com/cimt/inventory/stat-variance

## Status of per-store deep-link syntax verification

**In progress as of 2026-11-11, same session.** Owner explicitly authorized a live login to check
whether each URL accepts a store-scoping parameter. One real constraint already measured this
session, before these links were supplied:

- **`/equipment/tickets` is a SEPARATE sub-app** (its own login screen, own JS bundle at
  `/equipment/assets/...`, does not share the main `v3.myqsrsoft.com` session) — confirmed live via
  Playwright. A first automated login attempt there got a **WAF block** ("Request not allowed due
  to WAF block"). Not retried — repeated blocked logins risk a real account-security flag. This
  link needs either a manual one-time capture from the owner (DevTools → Network while opening a
  real ticket, same pattern as the token-refresh runbooks) or a deliberately slower/different
  approach, not more automated attempts. Every other URL above is the main app (same login, no
  WAF issue hit).

Results for the main-app URLs will be appended to this file once measured — see the dated update
block below if one exists; if not, this verification had not yet completed when this file was
last committed.
