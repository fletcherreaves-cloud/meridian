# Dispatch #165 — Audit suspected redundancy across the three emailed streams (#260): cash
# sheet / glimpse / sales ledger

**Context (2026-08-27):** CLAUDE.md's Top Priorities section flags this as still open: *"Suspected
redundancy in the current three emailed streams is being audited in #260."* This session already
found one concrete data point relevant to this audit (dispatch #159's investigation): `App.js`
loads `daily_glimpse_daily`/`sales_ledger_daily`/`cash_sheet_daily` via `_stCloudEmailReport()`/
`_stOpsReportStream()` in its T1 tier — read that code as a starting point, not from scratch.

## What already exists (read the code, don't re-derive)

- **The three emailed streams**: `daily_glimpse_daily`, `sales_ledger_daily`, `cash_sheet_daily`
  — all populated by `scripts/qsrsoft-email-parse.mjs` (CLAUDE.md: "reads the CSVs the ingest
  pipeline drops... parses them with the SAME `src/parsers` functions the client uses"). All three
  share a hard floor at 2026-07-01 (CLAUDE.md: "the source emails for earlier periods do not
  exist").
- **`memory/pm-handoff-2026-08-15.md`'s corrections register** — CLAUDE.md cites a directly
  relevant prior measurement: *"#347 measured `sales_ledger_daily` at zero rows for Aug 12-16
  while `qsr_sales_mix` held 135 for the same window. The data was never missing... Reach for the
  API source instead of mourning the email."* This is exactly the kind of overlap this dispatch
  should be characterizing systematically — read that file's corrections register in full.
- **`src/engine/metric-source.js`'s `METRIC_SOURCES`** — the auto-first chain for every metric
  already documents, per-metric, which of these streams (if any) is tried and in what order.
  This is the ground truth for "is stream X actually load-bearing for anything, or has it been
  fully superseded by an API-pulled sibling" — read the full registry before concluding anything
  is redundant.

## Scope

1. For EACH of the three emailed streams, determine: (a) which fields does it uniquely supply
   that no API-pulled stream (`qsr_daily_activity`/`qsr_daily_activity_rollup`, `qsr_sales_mix`,
   `qsr_ebos_daily`, `qsr_fob`, etc.) also covers; (b) which `METRIC_SOURCES` entries actually
   read from it, and at what priority in the auto-first chain (is it ever actually reached, or
   does a higher-priority API source always win first).
2. Measure real coverage gaps the way #347 did: for a recent date range, compare row counts/date
   coverage between each emailed stream and its closest API-sourced sibling, live against
   Supabase (service-role curl recipe, name the credential and observation per CLAUDE.md's
   standing rule).
3. Produce a clear verdict per stream: **fully redundant** (an API source already covers
   everything it supplies, in every `METRIC_SOURCES` chain that reads it) → candidate for
   deprecation, but DO NOT actually remove/stop the pull in this dispatch, just document the
   finding and let the owner decide; **partially redundant** (some fields/windows are unique, name
   them precisely); **not redundant** (still the only source for something real). Per CLAUDE.md's
   "API over email" standing rule, redundancy would confirm the email pipeline could eventually be
   retired in favor of the API source — but that's a follow-up decision, not this dispatch's job
   to execute.
4. Write the findings to a `memory/` file (e.g. `memory/audit-emailed-stream-redundancy-2026-08-27.md`)
   and update CLAUDE.md's own "#260" reference to point at it, resolved — matching this project's
   own "never end a session with an uncommitted memory file" standing rule.

## Explicitly out of scope

- Actually deprecating, disabling, or removing any of the three emailed streams, their pull
  script, or their Supabase tables — this dispatch is audit-and-report only. Removing a live data
  pipeline is exactly the kind of "hard-to-reverse... affects shared systems" action this
  project's standing rules require explicit owner sign-off for.
- Building a new automated pull to replace anything found redundant — a future, separate dispatch
  if the owner decides to act on this audit's findings.

## Verification bar

- No code fix is necessarily expected here (this is primarily an investigation/report dispatch)
  — but if the audit surfaces a genuine, small, contained bug (e.g. a `METRIC_SOURCES` chain
  ordered wrong, silently preferring a redundant/stale source over a better one), fix it and
  verify with the full test suite + build, matching this project's "found a real bug while
  investigating, fix it if it's contained" pattern.
- Deliverable is the `memory/` findings file, committed in the same PR/commit as this dispatch's
  own work (never left uncommitted), with the exact measurements (credential + observation) for
  each of the three streams' redundancy verdict.
