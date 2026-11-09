---
name: data-collection-bounds-2026-11-09
description: Owner request 2026-11-09 -- "let's denote our findings... on the bounds of data collection available. Seems we have discovered most of them. Good not to lose. Also good for others to be able to find easily." Consolidates every genuine upstream data-collection floor/limit measured across this project into one findable place, cross-referencing the individual finding files rather than replacing them. Also surfaced in-app as KB article `data_collection_bounds` (src/engine/forecast.js's KB_ARTICLES), with an InfoIcon on the Data Manager panel.
metadata:
  type: reference
---

# Data Collection Bounds — what's genuinely unavailable, and why

**Read this before concluding any data source "doesn't go back far enough" or "doesn't cover
that store."** CLAUDE.md's own standing rule (`Dev Rules` section, "Data depth is never the
limiter — backfill it") already states the default assumption: a table's earliest row is almost
always a *backfill artifact* (when the pull was first run), not a real floor. The entries below
are the measured EXCEPTIONS — genuine upstream limits, confirmed live, not assumed. Anything not
listed here should be treated as backfillable until proven otherwise, per that standing rule.

Each entry says: the limit, exactly what it applies to, how it was measured, and where the full
finding lives if more detail is needed. **This doc is the index — it does not replace the
individual `memory/finding-*.md` files**, which keep the full measurement detail.

## Genuine upstream floors (data never existed before this point)

| # | Limit | Applies to | Measured | Full finding |
|---|---|---|---|---|
| 1 | **LifeLenz for Oklahoma begins Oct 2025** — the system transition itself; the data does not exist to be pulled before that date. **The one genuine "we can't" that remains** across the whole LifeLenz/QSRSoft estate. | `lifelenz_schedule` (OK stores only — FL stores have no such floor) | Owner-stated, corroborated by the LifeLenz OK rollout date | CLAUDE.md, "Data depth is never the limiter" section |
| 2 | **Emailed-stream hard floor at 2026-07-01** — the source emails for earlier periods were never sent, because these three streams were only configured to email starting that date. Not a vendor retention limit — a configuration-start date. | `daily_glimpse_daily`, `sales_ledger_daily`, `cash_sheet_daily` | Confirmed: no source emails exist pre-dating this for these three reports | CLAUDE.md, same section; `memory/pm-handoff-2026-08-15.md` corrections register |
| 3 | **QSRSoft `event_details` endpoint (security events): ~92-day retention floor.** Binary-searched to the exact boundary: 2026-08-08 fails (`400 Invalid request. Invalid date range`), 2026-08-09 succeeds (real rows) — exactly 92 days before the 2026-11-09 measurement date. | `qsr_security_events` | Direct API probe, kill-and-binary-search methodology | `memory/finding-qsrsoft-security-events-92day-retention-2026-11-09.md` |
| 4 | **QSRSoft's claimed "7-year rolling retention" for DAR/OPS reports is FALSE.** The real floor sits somewhere between 2018-02 (confirmed empty, zero rows, zero errors — a real "nothing here" response, not a timeout) and 2019-09 (real rows returned). Not narrowed further than that 19-month window. **This supersedes `memory/project-qsrsoft-7year-backfill.md`'s "7yr" framing on this specific point** — that file's own 7-year backfill driver is now a conservative choice given the real measured floor, not a measured limit itself. Don't re-cite the 7-year figure as if it were confirmed. | `qsr_daily_activity_rollup` (DAR), OPS endpoints (`qsr_cash_sheet` etc.) | Direct API probes at both boundary dates, three-way calibrated (real rows vs. real empty vs. a deliberately bad request) | `memory/finding-qsrsoft-retention-2026-10-17.md` |
| 5 | **Store 43701 (Ponce de Leon-Hwy 81/I-10) opened 2026-03-13.** Zero `qsr_fob`/`labor_rows` history before that is a real floor — the store didn't exist yet, not a pull gap. | `qsr_fob`, `labor_rows` for store 43701 only | Store open-date record | `memory/finding-jan-mar-2026-reconstruction-2026-10-02.md` |

## Not a retention limit — a module-activation date (easy to mistake for #4's floor)

| # | What it is | Applies to | Measured | Full finding |
|---|---|---|---|---|
| 6 | **EBOS (purchase ledger) has a per-store `ebos_activation_date`** — e.g. 2019-08-08 for store 3708. Rows before a store's own activation date don't exist because that store's EBOS module wasn't turned on yet, not because of any vendor-side retention cutoff. Naively probing EBOS retention store-by-store without accounting for this confounds the test. | `qsr_ebos_daily` | Per-store activation-date field, confirmed against probe results | `memory/finding-qsrsoft-retention-2026-10-17.md` |

## Backfill artifacts — NOT real floors, explicitly flagged so nobody re-raises them as limits

| # | What looked like a limit | Real explanation | Source |
|---|---|---|---|
| 7 | `qsr_cash_sheet` starting 2024-04-01, `qsr_daily_activity_rollup` starting 2025-01-01 | When each pull was FIRST RUN, not when the data begins. Backfillable per the standing rule at the top of this doc. | CLAUDE.md, "Data depth is never the limiter" section |
| 8 | `monthly_targets` had zero rows for Jan–Mar 2026 | An internal gap (nobody had uploaded/entered those months yet), not a vendor limit — reconstructed via the forecast engine (leak-free, as-if-run-in-advance) rather than left blank. | `memory/finding-jan-mar-2026-reconstruction-2026-10-02.md` |

## Open / unresolved — not yet automatable, not yet proven impossible

| # | Gap | Applies to | Status | Source |
|---|---|---|---|---|
| 9 | **No confirmed automatable source for Inventory Summary & Usage** (starting/ending inventory, purchases, usage/day, days-of-supply, cost, UOM — one of the 6 reports the original Food Cost EOM panel still takes as a manual upload). Lead A (a dedicated "Inventory Usage" QSRSoft report) couldn't be confirmed live — no credentials available in that research session. Lead B (deriving it from `qsr_onhand` + `qsr_raw_item_detail`) only covers ~9% of the catalog — not enough to replace the manual upload. | `qsr_inventory_summary` (never populated) | Open — neither lead shipped; panel stays manual-upload-only for this one report | `memory/finding-inventory-summary-automation-2026-08-27.md` |

---

**Maintenance note:** when a new genuine floor is measured (not assumed), add a row here AND
commit the individual `memory/finding-*.md` with the full measurement — this doc is the index,
the finding file is the proof. When a floor gets superseded by a later, more precise measurement
(like #4 superseding the old "7yr" framing), update this doc's row to state the CURRENT truth and
name what it supersedes, rather than leaving two contradictory claims for the next reader to
reconcile.
