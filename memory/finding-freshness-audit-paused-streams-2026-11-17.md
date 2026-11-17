---
description: "Audit of every tile/panel fed by one of the 32 paused QSRSoft credential-login pull tables, checking whether it shows its real age or silently reads as current. Owner request: 'every tile sourced from a paused stream should read its real age, not a silent —.' One real gap found and fixed: Register Audit (audit_rows) had no entry in stream-freshness.js's STREAMS registry, so it was invisible to At-A-Glance's freshness strip and scheduled-pull-watchdog.mjs even though it already has a per-row coverage display in Data Manager. ~10 more paused-stream tables are still absent from STREAMS, listed here with a recommendation, not auto-added."
---

# Freshness audit — every tile fed by a paused QSRSoft stream (2026-11-17)

## Why this exists

Owner, after agreeing with the weekly-digest notification plan: *"every tile sourced from a
paused stream should read its real age, not a silent '—'... worth a pass to confirm nothing
paused is quietly showing a stale number as if it were current."* This is that pass, run against
the real 32-table list from `memory/finding-qsrsoft-security-notice-2026-11-16.md`'s pause
commit (065db415), not reasoned about in the abstract.

## Method

For each of the 27 real-data paused pull scripts (the other 5 — `qsrsoft-backfill-driver.mjs`,
`qsrsoft-kb-pull.mjs`, and the cash-anomaly/live-pulse diagnostic workflows — are drivers or
diagnostics, not primary data tables), found the Supabase table(s) it writes via a direct grep of
each script's `upsert`/`from(...)` calls (not assumed from the filename), then checked whether
that table's `ds` field has an entry in `src/engine/stream-freshness.js`'s `STREAMS` registry —
the one place that feeds At-A-Glance's "Loaded Data" strip (`groupFreshness()`) and
`scheduled-pull-watchdog.mjs`'s own coverage.

**Important nuance, caught by checking rather than assuming: being absent from `STREAMS` does NOT
automatically mean a tile silently reads as current.** `src/views/analytics.js`'s Data Manager
panel has its own, separate per-row coverage table (`calcCov` over the raw `ds.*Rows` array,
rendering count/first-date/last-date/a staleness-colored dot) that several of these tables already
appear in via `SRC_INFO`, independent of `STREAMS` entirely. The real risk `STREAMS` absence
creates is narrower than "silently stale" — it means the tile's staleness is invisible **unless
you specifically open Data Manager**, because it never surfaces on the home-screen strip or to the
automated watchdog.

## Fixed: Register Audit (`audit_rows`)

**The one genuine, high-priority gap.** Confirmed via direct read of `src/views/analytics.js`:
`audit_rows` → `ds.auditRows` already has a real coverage row in Data Manager (`SRC_INFO.auditRows
= 'Register Audit export'`, with its own count/from/to/staleness-dot via `calcCov`) — so it was
never silently stale there. But it had **zero entry in `STREAMS`**, confirmed by reading the full
29-entry array directly rather than grepping for "audit" (which can miss an entry using a
different key naming convention) — meaning it never reached At-A-Glance's home-screen freshness
strip or the scheduled watchdog. This is the owner's own **#1-ranked** item on the Upload Calendar
(`memory/` — see the artifact delivered 2026-11-17), so its absence from the glance-level warning
mattered more than most.

**Fix:** added `{ key: 'registerAudit', label: 'Register Audit', dsField: 'auditRows',
cadenceDays: 1, group: 'controls' }` to `STREAMS` — `loadAuditRows` (`src/lib/supabase.js`)
already populates `ds.auditRows` with a plain `date` field (table `audit_rows`), so no `dateField`
override was needed, matching the registry's default convention exactly. 2 new tests in
`src/__tests__/stream-freshness.test.js` (presence/shape + a staleness-naming test, same pattern
every other entry's own addition used) — 29/29 passing. Full suite + build still pass clean.

## Not fixed — listed, not auto-added (needs a cadence/priority call, not a blind add)

Found via the same table-by-table grep, cross-checked against the full `STREAMS` array. None of
these have been independently verified to show *correctly* elsewhere (unlike Register Audit,
which was checked and found fine in Data Manager) — this list is "missing from STREAMS," not yet
"confirmed silently stale somewhere." That next check is the honest next step, not done here for
all ~10 given the time this pass already took.

| Table | Fed by | Likely urgency |
|---|---|---|
| `qsr_forms_completion` | `qsrsoft-forms-completion-pull.mjs` | Medium — Upload Calendar's monthly-housekeeping tier |
| `qsr_forms_reviews` | `qsrsoft-forms-reviews-pull.mjs` | Low |
| `qsr_store_controls` | `qsrsoft-store-controls-pull.mjs` | Low, rarely changes |
| `qsr_store_settings` | `qsrsoft-store-settings-pull.mjs` | Low, rarely changes |
| `qsr_product_outage` | `qsrsoft-product-outage-pull.mjs` | Low, diagnostic-leaning |
| `qsr_punch_times` | `qsrsoft-punch-times-pull.mjs` | Medium — feeds labor-adjacent panels |
| `qsr_employee_tenure` | `qsrsoft-employee-roster-pull.mjs` / `qsrsoft-punch-times-pull.mjs` | Low-medium |
| `employee_pay_rate_changes` | `qsrsoft-employee-roster-pull.mjs` | Low |
| `qsr_menu_items` / `qsr_menu_item_recipe` / `qsr_menu_item_activity` / `qsr_menu_price_comparison` | the 4 menu-catalog pull scripts | Low — Pricing Engine data, changes only when the menu does, arguably event-triggered rather than calendar-cadence like eBOS/Security Events already are |
| `qsr_peaks_sales` | `qsrsoft-ops-pull.mjs` | Low — `daypart-peaks.js` (v5.798) already moved primary reliance off this table onto hourly DAR |

`qsr_employee_pay_period_history` (pay-history pull) and `shift_manager_range` are **deliberately
NOT** on this list — both already have a documented, owner-precedent reason to stay out of
`STREAMS` as-is (see `stream-freshness.js`'s own commented-out `payHistory` entry: a bi-weekly
cadence fits neither the `cadenceDays:1` nor `cadenceDays:31` bucket correctly, and forcing one in
would create a false alarm, not a true one — the same trap this pass is trying to avoid
elsewhere).

**Recommendation, not a decision made here:** if any of these matters enough to add, each needs
the same two checks Register Audit just got — (1) does it already show *somewhere* (Data Manager
or a panel-local badge) before assuming it's silently stale, and (2) does its real pull cadence
actually fit `STREAMS`' binary daily/monthly bucket, or does it need the same "don't force a wrong
cadenceDays into a real alert" caution the `payHistory`/`payrollReadiness` entries already
demonstrate. Not worth doing blind for ~10 mostly-low-urgency tables in one pass.
