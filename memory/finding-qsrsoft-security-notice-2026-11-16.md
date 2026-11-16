---
description: "QSRSoft's 2026-11-16 Operator Security Notice Letter (blocking AI-bot/credential-scraping access) and Meridian's response: audit of the ~33 affected pull scripts (all RETAINED, none disabled), a new sanctioned QSRSoft Native MCP Server connection + its first migration slice (Time Slice Summary + Service Time Statistics), a gap analysis of what email/MCP cover vs. what would be lost if scraping stopped, and a draft response letter. Read this before touching any qsrsoft-*.mjs script, the qsr_mcp_* tables, or QSRSoft's own compliance posture."
---

# QSRSoft Operator Security Notice (2026-11-16) — audit, migration, and open items

## The letter

Fletcher uploaded `Operator_Security_Notice_Letter-v5_1.docx`, signed by Michael Henkel
(President/Owner, QSRSoft, LLC). Full text extracted via python-docx. Key points:

- QSRSoft is actively blocking "automated AI bots" and "data-scraping tools" connecting via
  valid employee/owner logins, citing their Multi-Service Subscriber Agreement:
  - **Section 1** — a "Service User" is defined as a *person*; scripts/bots fall outside that,
    even via a valid login.
  - **Section 2.1** — access is licensed "solely for Subscriber's internal business purposes."
  - **Schedule 1, Section I.A** — "User IDs and passwords cannot be shared."
  - **Section 2.4 & 6.3** — prohibits automated tools downloading/extracting/creating
    derivative works, and giving access to non-Subscribers.
- Three sanctioned AI paths named: **CoachQ** (in-app AI, new "Boards" + schedulable prompts),
  **Scheduled Reports** (emailed daily, ask CoachQ "Which reports can be scheduled for
  automatic delivery" for the list — this agent has no access to ask CoachQ directly; only
  Fletcher/anyone with a live QSRSoft login can), and the **Native MCP Server**
  (`https://mcp.myqsrsoft.com`, released the same week as the letter).

## What's actually at risk — measured, not assumed

`grep -l "QSRSOFT_USERNAME\|QSRSOFT_PASSWORD\|getFreshToken\|chromium.launch\|playwright"
scripts/qsrsoft-*.mjs scripts/lib/*.mjs` → **33 of ~39** `qsrsoft-*.mjs` scripts use exactly
the pattern the letter targets: `scripts/lib/qsrsoft-auth.mjs`'s `getFreshToken()` mints a
Cognito ID token per run from `QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD` (direct, or Playwright
login fallback), producing an `X-Auth-Token` header + a spoofed browser `User-Agent` against
`api.reports.myqsrsoft.com`/`v3.myqsrsoft.com`/`prod.ebos.qsrsoft.com`. **~24+** of those have
`schedule:` cron triggers (continuous, not occasional, access).

**Decision (owner, 2026-11-16): do not disable or touch any of these scripts.** "I do not need
to push this too hard and jeopardize losing access altogether. That would be way worse of an
outcome." All 33 scripts are retained exactly as they are — this finding documents them, it
does not change them. Any future decision to retire one is Fletcher's call, store by store,
report by report, not a blanket migration.

## What shipped this pass: QSRSoft Native MCP Server connection (first migration slice)

Fletcher connected Meridian (via this agent, acting as the MCP client) to
`https://mcp.myqsrsoft.com` through a real OAuth2 PKCE flow — not a credential/password login.
Confirmed via `org_info`: scope `omni:query offline_access`, permission `reports:read` only,
covering exactly the real org ("RKT Inc.") and all 27 real store locations. This is the
legitimately sanctioned pattern the letter asks for.

**The server exposes exactly 2 report types today** (via `post_listReports` /
`post_getReportDetail`, live, 2026-11-16):

1. **`timeSliceSummaryReport`** (Time Slice Summary) — net sales/GC/avg check, OEPE, OEPE
   w/o parked, R2P, KVS time-per-transaction, full channel split (DT/in-store/kiosk/
   delivery/MOP/FC).
2. **`serviceTimeStatsReport`** (Service Time Statistics) — CTP, OEPE components (order/line/
   window1/window2/parked-car time + pull-forward %), R2P split (kiosk/FC), expeditor total
   time, KVS items/time-per-item/healthy-use %, MFY1/MFY2 items+time, beverage order/run/total
   time. **Finer-grained than anything Meridian currently stores** — the DAR only gives
   aggregate `dt_untilserve`/`dt_untilstore`/`dt_heldtime` sums, not this window-by-window
   breakdown.

Both are **completed-days only** — the report descriptions reference a `dailyActivityReport`
tool for intraday figures, but it does **not exist** as a callable tool yet (confirmed:
`post_getReportDetail({reportId:'dailyActivityReport'})` → `reportId must be one of:
timeSliceSummaryReport, serviceTimeStatsReport`). No intraday MCP equivalent exists.

**`post_queryReport` mechanics, measured live (2026-11-16) — important for any future
work against this server:**
- Omitting the `locations` param returns **all** org stores in one call (confirmed: 26 rows
  for a single day — missing only 18213 [retiring] and 44689 [opened same day, no history
  yet] — no per-store looping needed).
- `segmentBy` must be one of `summary, hour, quarterHour, daypart, peaks` — `day` is invalid.
- **`structuredContent` carries column METADATA ONLY (name/type/rowCount) — never row data.**
  The actual values are only in `content[0].text`, a CSV block whose header uses the report's
  **vendor display labels** (e.g. "STW GC", "DT GCs"), not the camelCase API field keys used to
  request them (`transactions`, `totalDriveThruTransactions`), **in a server-chosen column
  order that does not match the requested `fields` order.** A naive read of
  `structuredContent.rows` or a positional CSV read would both silently produce zero rows,
  every run — exactly the "ran clean, wrote nothing" failure CLAUDE.md's standing rules warn
  about. `scripts/qsrsoft-mcp-pull.mjs`'s `parseReportCsv()` matches by display label instead,
  tested against real captured responses in `src/__tests__/qsrsoft-mcp-pull.test.js` (including
  a test that "DT GCs" (totalDriveThruTransactions) and "DT GC" (dtTransactions) are correctly
  NOT conflated — they are different real fields with near-identical labels).

**Shipped (this PR):**
- `supabase/schema-qsrsoft-mcp-reports.sql` — 3 new tables: `qsr_mcp_time_slice_summary`,
  `qsr_mcp_service_time_stats` (tenant_id + accessible_locs RLS, same pattern as every other
  `qsr_*` table), and `qsr_mcp_token_cache` (the rotating OAuth refresh token — RLS enabled
  with **zero policies**, i.e. default-deny for anon/authenticated; service-role only, by
  design — see its own header comment for why).
- `scripts/lib/qsrsoft-mcp-auth.mjs` — mints a fresh access token per run via OAuth
  `refresh_token` grant (no username/password anywhere), persisting the newly-rotated refresh
  token **before** returning the access token, so a mid-run failure never strands the only
  valid refresh token.
- `scripts/lib/qsrsoft-mcp-client.mjs` — thin MCP JSON-RPC client (stateless Streamable-HTTP,
  this server needs no `Mcp-Session-Id`).
- `scripts/qsrsoft-mcp-pull.mjs` — pulls both reports, all stores, trailing 4-day window
  (completed-days only, so no deep backfill need), once daily.
- `.github/workflows/qsrsoft-mcp-pull.yml` (11:00 UTC daily) + registered in
  `sync-failure-watch.yml`'s watched list.
- `src/__tests__/qsrsoft-mcp-pull.test.js` — `parseReportCsv()` tested against real captured
  server responses (not synthetic fixtures), including the "DT GCs vs DT GC" trap and a
  shuffled-field-order immunity test.

**Deliberately NOT done this pass (first-slice scope cut, stated here per CLAUDE.md's
"spell out what was deferred and why" rule):**
- **Not wired into any panel or `metric-source.js` chain.** These 2 tables are a parallel,
  sanctioned-channel copy — nothing in the app reads them yet. Swapping any live metric's
  sourcing (OEPE/R2P/KVS/channel-mix currently come from `qsr_daily_activity`/
  `daily_glimpse_daily`) to prefer the MCP tables is a deliberate follow-on decision, not done
  here — per the standing "diff two computations before trusting either" rule, the two sources
  should be measured against each other on real overlapping dates first.
- **No `stream-freshness.js` `STREAMS` entry.** That requires an eager-loaded `ds` field with
  a real in-app consumer; there isn't one yet (same deliberate-exclusion precedent as
  `pmixRows`/`opsPeaksRows` before they had consumers). The workflow-failure half of the
  "watch it" checklist (`sync-failure-watch.yml`) IS done — only the per-stream data-freshness
  half is deferred, and only because nothing consumes the data yet.
- **No manual-upload fallback UI.** The existing scraping pipeline, deliberately kept running
  in parallel, already covers this exact ground — it IS the fallback.

## ✅ RESOLVED 2026-11-16 (same day) — both pending items are done; the pull is live

1. **`supabase/schema-qsrsoft-mcp-reports.sql` — owner ran it.** Confirmed by direct measurement
   (service-role `Range: 0-0` probe): all 3 tables (`qsr_mcp_token_cache`,
   `qsr_mcp_time_slice_summary`, `qsr_mcp_service_time_stats`) returned `content-range: */0` —
   real, empty tables, not a missing-table error.
2. **A dedicated refresh token was minted and seeded.** Fletcher disconnected the stale "Claude
   Code" MCP connection in QSRSoft's settings UI, this agent re-initiated the OAuth flow (same
   pseudo-TTY/FIFO technique as the first connection, this time fixed per the note below), and
   the resulting refresh token + client ID were `upsert`ed into `qsr_mcp_token_cache` — the
   value itself was never printed, logged, or committed anywhere; only field *presence* was
   confirmed (`has refreshToken: True`, `has clientId: True`) before the write.

**Then the real pull was run end-to-end and measured against ground truth** (not just "it
didn't error" — see this file's own "measure it" standing rule):
- `QSRSOFT_MCP_DAYS_BACK=2 node scripts/qsrsoft-mcp-pull.mjs` → `time_slice_summary: 52 row(s)
  saved; service_time_stats: 52 row(s) saved, across 2/2 day(s)` (26 stores × 2 days each).
- Spot-check: `qsr_mcp_time_slice_summary` for loc `0003708`, `dt=2026-11-14` returned
  `stw_gc:1033, all_net_sales:12517.79, total_dt_sales:8903.64, total_dt_transactions:798,
  total_instore_sales:3614.15, total_instore_transactions:235` — an **exact match** to the live
  MCP query run by hand earlier the same session against the same store/date.
- `qsr_mcp_token_cache.updated_at` advanced after the run (confirmed via a second read), proving
  the refresh-token rotation fix actually rotates-and-persists correctly in the real pull path,
  not just in isolation — the exact mechanism that broke during this feature's own development
  (see below) is now proven working end to end.

**The scheduled workflow needs no further action** — `.github/workflows/qsrsoft-mcp-pull.yml`
(11:00 UTC daily) will pick up from here on its own schedule, already registered in
`sync-failure-watch.yml`.

**One fine point on the pseudo-TTY/FIFO technique, fixed on this second use (useful if it's
needed a third time):** the first attempt this round tried `setsid nohup tail -f /dev/null >
fifo &` as a standalone "holder" process to keep the FIFO's write end open across Bash tool
calls — but opening a FIFO for either read or write alone BLOCKS until the other end is also
opened, and since nothing was reading yet, the holder itself never finished starting (confirmed
via `bash -x` trace: execution hung at the `tail` line forever). The fix: open the FIFO
**read-write on one fd** in the SAME process that then backgrounds the real reader
(`exec 3<>fifo` then `... <&3 ... &`) — opening a FIFO read-write never blocks, and the
backgrounded child inherits that already-open fd, so a later writer to the FIFO path (a
separate Bash tool call, `printf '...' > fifo`) succeeds immediately with no race. See
`scripts/qsrsoft-mcp-auth.mjs`'s own persist-before-use discipline for the other half of this
lesson (never consume a rotating refresh token without immediately saving its replacement).

## A mistake made during this session's own development (recorded so it isn't repeated)

While proving the refresh flow worked, this agent called the `refresh_token` grant once as a
**test**, read back the response's metadata, but never persisted the newly-rotated refresh
token anywhere. QSRSoft's auth server **rotates refresh tokens on every use** — the old one was
immediately invalidated server-side. A second, careless attempt to "fix" this re-used the same
(already-dead) stored token and failed outright. The session's own interactive MCP connection
kept working only because its short-lived (1h) **access** token was still valid separately —
but once that expired, the connection was unrecoverable without a fresh interactive consent.
This is exactly why `qsrsoft-mcp-auth.mjs`'s header comment is as emphatic as it is about
persist-before-return ordering: **never call the refresh_token grant and discard the result.**

## Track D — gap analysis: emailed streams vs. MCP vs. scraping-only

Per Fletcher's request: "a plan for what data we can retrieve in email... get a list of what
data is covered therein vs what will be lost, for now." Full gap analysis (background research
agent, 2026-11-16):

**A. Covered by emailed streams today** (`sales_ledger_daily`/`daily_glimpse_daily`/
`cash_sheet_daily`, via `scripts/qsrsoft-email-parse.mjs`): net sales/GC/avg check + full
channel split; labor %, promo $/%, POS-over $/count, cash O/S $/%, T-Red counts, OEPE/KVS/
parked %, digital/app % of sales; per-3PO-vendor (DoorDash/UberEats/Grubhub) sales+GC. This is
the **first-choice source** today for `oepe`/`kvst`/`kvsHealthy`/`park`/`laborPct`/`cashOSPct`/
`posOverAmt`/`promoAmt`/`empMealAmt`/`mgrMealAmt` in `metric-source.js`.

**B. Covered by the 2 MCP reports**: net sales/GC/avg check/OEPE/R2P/KVS/channel-split (Time
Slice Summary) overlaps the same `qrsActSummaryRows`(DAR)/`glimpseRows`(email) chains; Service
Time Statistics' full DT-window/MFY/beverage breakdown is **new capability**, finer than
anything currently stored.

**C. Neither emailed nor MCP-covered — would be LOST if all 33 scraping scripts stopped with
no replacement:**
- **Labor/punch detail** — OT $/hrs, crew hours, punch/tenure/pay-rate history
  (`qsr_labor_summary`, `qsr_punch_times`, `qsr_employee_tenure`,
  `qsr_employee_pay_period_history`). Note: `laborPct` itself survives via the Glimpse email
  fallback — it's the underlying OT/punch/pay-rate *detail* that has zero coverage.
- **FOB / food cost** — `qsr_fob`, `qsr_onhand`, `qsr_onhand_item_history`,
  `qsr_raw_item_detail`. Feeds `fobPct`/`primeCostPct`, EOM Food Cost, Count-Cycle, Spot-Check
  Ruler. No overlap anywhere.
- **eBOS / purchases** — `qsr_ebos_daily`, `qsr_ebos_line_items`. Inventory panel.
- **Controls / loss-prevention beyond what's emailed** — register-level `audit_rows`,
  `qsr_security_events` (drawer-open category, manager-auth-type). The email streams already
  cover store/day-level cash-O/S, refunds, POS-over, promo, discount; what's missing is
  register-level attribution and individual security events.
- **Forms/checklists** — `qsr_forms_completion`, `qsr_forms_reviews` (Forms dashboard).
- **Product mix / menu** — `qsr_product_mix` (Pricing Engine, Filet-O-Fish-Fridays signal),
  `qsr_menu_items`/`qsr_menu_item_recipe`/`qsr_menu_item_activity`/`qsr_menu_price_comparison`.
- **HR/turnover** — `turnover_monthly`, `roster_statistics`.
- **Store config** — `qsr_store_controls`, `qsr_store_settings`.
- **Finer granularity** — `qsr_sales_quarter_hour`, `qsr_inventory_summary`; note
  `digital_app_monthly`/`mcdelivery_monthly` may already be largely redundant with
  `cash_sheet_daily`'s daily per-vendor figures per the pre-existing
  `memory/audit-emailed-stream-redundancy-2026-08-27.md` finding, independent of this question.

**Bottom line:** A+B keep sales, channel mix, and speed-of-service fully covered — At-A-Glance
and the forecast/projections engine keep working. Everything else — Labor Tools, EOM Food
Cost, Register Audit, Signals' loss-prevention metrics, Forms, Pricing Engine — would go dark
with no scraping and no replacement. This is the actual stakes of any future "turn off
scraping" decision, and why the owner's own instinct (retain everything, migrate only what's
sanctioned-and-covered, don't push the relationship) is the right call right now, not just the
cautious one.

## ⚠️ 2026-11-16 (same day, later) — owner escalated to an actual pause, not just retention

Owner's own words, verbatim: *"I do not want to jeopardize anything at all, so if that means we
need to, minimally, pause the violating pulls, then do so and offer me up grounded solutions to
overcome it for now... Let's dig in and figure out how to triage this situation while staying
compliant. Let's fix this first, then I will determine when to send a response back."* This
**supersedes** the earlier "retain everything, don't touch scripts" framing — the owner now
wants the automated credential-login pattern itself paused while a triage plan is built, with
the response letter deliberately held until after the triage, on his own timeline.

**Correction to this file's own earlier count, found while auditing which workflows to pause**
(measure, don't trust a prior "not implicated" claim — exactly the standing rule this file cites
elsewhere): the original "~33 scripts" figure and NOT-implicated list were based on a shallow
grep that only caught `getFreshToken` directly, the same undercount pattern CLAUDE.md's own
QSRSoft-token paragraph already warns about ("a plain grep... undercounts"). A real per-file
import audit found **3 scripts previously marked NOT implicated are actually implicated**
via `scripts/lib/ebos-auth.mjs`'s `resolveEbosToken()`: `qsrsoft-menu-item-activity-pull.mjs`,
`qsrsoft-variance-pull.mjs`, and `qsrsoft-backfill-driver.mjs` (which spawns the other
credential-login scripts as subprocesses — pausing it is required even though the driver file
itself has no auth import). `qsrsoft-kb-pull.mjs` was also found implicated (Playwright login
with `QSRSOFT_USERNAME`/`PASSWORD` even to reach the vendor's own public Help Center, confirmed
by reading its body, not just its imports — the KB pull body literally has a "Login to
QSRSoft" step with `page.fill('input[type="password"]'...)`).

**32 scheduled GitHub Actions workflows had their `schedule:` trigger commented out** (cron
removed, `workflow_dispatch:` — manual/emergency run — left intact, scripts and Supabase tables
untouched):
`qsrsoft-dar-pull.yml`, `qsrsoft-digital-app-pull.yml`, `qsrsoft-ebos-pull.yml`,
`qsrsoft-employee-roster-pull.yml`, `qsrsoft-forms-completion-pull.yml`,
`qsrsoft-forms-reviews-pull.yml`, `qsrsoft-inventory-summary-pull.yml`, `qsrsoft-kb-pull.yml`,
`qsrsoft-mcdelivery-pull.yml`, `qsrsoft-menu-item-activity-pull.yml`,
`qsrsoft-menu-item-recipe-pull.yml`, `qsrsoft-menu-items-pull.yml`,
`qsrsoft-menu-price-comparison-pull.yml`, `qsrsoft-onhand-pull.yml`, `qsrsoft-ops-pull.yml`,
`qsrsoft-pay-history-pull.yml`, `qsrsoft-pmix-pull.yml`, `qsrsoft-product-outage-pull.yml`,
`qsrsoft-pull.yml` (FOB), `qsrsoft-punch-times-pull.yml`, `qsrsoft-register-audit-pull.yml`,
`qsrsoft-roster-stats-pull.yml`, `qsrsoft-sales-quarter-hour-pull.yml`,
`qsrsoft-security-events-pull.yml`, `qsrsoft-shift-manager-pull.yml`,
`qsrsoft-store-controls-pull.yml`, `qsrsoft-store-settings-pull.yml`, `qsrsoft-turnover-pull.yml`,
`qsrsoft-variance-pull.yml`, `qsrsoft-backfill.yml`, `qsrsoft-cash-anomaly-check.yml`,
`qsrsoft-live-pulse.yml` (the last two run `qsrsoft-ops-pull.mjs`/`qsrsoft-pull.mjs` on separate
intraday schedules — real invocations confirmed by reading their `run:` step, not just a
filename match in a comment).

**Explicitly NOT paused — confirmed by reading each file's actual auth path, not assumed:**
`qsrsoft-email-parse.yml` (no login — parses QSRSoft's own emailed reports, one of the letter's
own sanctioned paths), `qsrsoft-kb-analyze.yml` (Supabase-only, analyzes already-pulled KB rows,
no live QSRSoft call), `qsrsoft-mcp-pull.yml` (the sanctioned OAuth connection, this file's own
first migration slice). `eom-digest-send.yml` was never a QSRSoft pull at all — it only
*mentions* `qsrsoft-onhand-pull.mjs` in a comment; it sends email from already-stored data.

**`sync-failure-watch.yml` updated to match**: the 32 paused names were removed from its
watched `workflows:` list — `src/__tests__/sync-failure-watch.test.js`'s own "lists no workflow
that does not exist" check correctly flags a watched name with no `cron:` as phantom, so leaving
them in would have failed that test, not just been inert. A comment block at the removal site
names exactly what to do when any of these are re-enabled: restore the `cron:` lines AND the
watch entry in the SAME PR — never one without the other.

**Verified, not assumed:** `npx vitest run src/__tests__/sync-failure-watch.test.js` (4/4 pass),
`src/__tests__/qsrsoft-onhand-pull-fob-nudge.test.js` + `scheduled-pull-watchdog.test.js`
(15/15 pass, both reference these specific workflow files), every one of the 32 transformed
YAML files re-parsed with `yaml.safe_load` to confirm `schedule` is gone and `workflow_dispatch`
survived, and `npm run build` (clean, within payload budget — these are backend-only workflow
files, zero client-bundle impact anyway).

**Not scheduled, but still use credential-login (don't invoke manually during this pause,
though there's no automated schedule to disable for these):** `qsrsoft-inventory-history-pull.mjs`
(`resolveEbosToken`), `qsrsoft-event-details-probe.mjs`, `qsrsoft-field-scraper.mjs`,
`qsrsoft-security-events-new-fields-probe-2026-11-08.mjs`, `qsrsoft-store-transition-probe.mjs`,
`qsrsoft-explore.mjs`. `qsrsoft-ops-gap-report.mjs` is NOT implicated (Supabase-only gap report,
no live QSRSoft call).

**New lead, not yet actioned — owner's QSRSoft account has reports already emailing that
Meridian never parses.** A screenshot of the owner's live "Scheduled Reports" admin page shows
5 currently-scheduled reports: Cash Sheet Extract, Daily Glimpse, Labor Analysis, Labor
Exceptions, Sales Ledger (list may continue past what the screenshot showed — unconfirmed).
Three of these (Cash Sheet Extract, Daily Glimpse, Sales Ledger) already feed
`cash_sheet_daily`/`daily_glimpse_daily`/`sales_ledger_daily` via `qsrsoft-email-parse.mjs`.
**"Labor Analysis" and "Labor Exceptions" are NOT parsed by that script at all** — these emails
may already be landing in the owner's inbox daily with zero ingestion, which if true closes part
of the labor/OT gap (Track D's Group C) with no new QSRSoft access, no new scraping, and no
compliance exposure at all — just a new parser for mail Meridian already receives. **Naming
collision warning:** this codebase's existing `src/views/labor-analysis.js` /
`src/engine/labor-analysis.js` / "Labor Analysis" terminology throughout `memory/` is the
**LifeLenz** labor_analysis_actuals_report — completely unrelated to QSRSoft's own "Labor
Analysis" scheduled report. Any new table/parser for QSRSoft's version must be named distinctly
(e.g. `qsr_labor_analysis_email` or similar) to avoid colliding with the existing LifeLenz-sourced
concept. Waiting on the owner for: (1) whether more reports are scheduled below what the
screenshot showed, (2) a sample of the actual Labor Analysis / Labor Exceptions email content so
a parser can be built against the real shape, not a guess.

## ✅ 2026-11-16 (same day, later still) — Labor Analysis + Labor Exceptions email parsing shipped

Fletcher forwarded real samples (`labor_analysis_daily_2026-11-15.csv`,
`labor_exceptions_daily_2026-11-15.csv`) from his own QSRSoft Scheduled Reports admin page,
which also confirmed 5 reports are already scheduled to email daily: Cash Sheet Extract, Daily
Glimpse, Labor Analysis, Labor Exceptions, Sales Ledger. Only the first 3 were parsed by
`scripts/qsrsoft-email-parse.mjs`. Investigation found:

- **`ingest-report`'s `detectReportType` (Edge Function) already classifies both filenames
  correctly** (`'labor'`, `'labor-exceptions'`) — these reports have likely been arriving and
  sitting in `pending_reports`/the `qsr-reports` bucket for a while already, just never parsed.
  This was the only missing step, not a new data source or any new QSRSoft access.
- **`parseLaborData()` (src/parsers/index.js) — already built, unchanged — matches the real
  "Labor Analysis" CSV field-for-field** (TPPH, SPPH, Act-vs-Need, Opportunity Cost $, OT Hrs/$,
  Crew/Punch/Total Labor %, full channel-sales split). It was previously only reachable via
  manual upload (`type:'labor'` in `pipeline.js` → `ds.laborRows`); the SAME parser is now also
  called server-side on the emailed file, writing to a new table, zero drift.
- **`parseLaborExceptions()` was a real, latent bug — never exercised against a real file.** It
  assumed a per-location summary shape with count-per-type columns ("Total Exceptions",
  "Missed Break", ...). The real emailed file is a PER-EMPLOYEE PER-EXCEPTION detail feed
  (Loc, GEID, Employee, Act/Sch Start/End, Exception, Exception Time, Is Manager Authorized,
  Punches 1-6) — the old function's column-name vocabulary turns out to be the real `Exception`
  field's VALUES, not separate columns. Fixed to parse the real shape and aggregate into the
  exact same (loc,date) summary field names `src/engine/insights.js`'s
  `joinDaily(exceptionRows,'totalExceptions',laborRows,'otHrs')` correlation signal and
  `analytics.js`'s coverage checker already expect — this activates that dormant signal (once a
  follow-on ds-merge wiring lands, see below) rather than requiring their own edit. A second
  function, `parseLaborExceptionsDetail`, preserves the per-employee compliance detail (above
  all the **Is Manager Authorized** flag) the aggregate necessarily discards.
- **A second real bug found and fixed while building this**: `parseXLDate`'s numeric branch
  assumes every numeric input is a pure DATE serial and unconditionally adds +12h to anchor it
  to noon for timezone-safe display. `Exception Time` arrives as an Excel DATETIME serial
  (confirmed live: `raw:true` still yields a fractional serial like `46341.41667`, not a
  string) — applying that same +12h shift to a value that already has a real time-of-day
  silently flipped any exception at/after ~noon into the next calendar day (measured: a 13:00
  exception time became the next day's date). Fixed with a **narrow, dedicated**
  `parseExceptionTimestamp()` used only by the two labor-exceptions functions — `parseXLDate`
  itself is untouched, since many other parsers in this file correctly rely on its existing
  pure-date behavior.

**Shipped:**
- `supabase/schema-labor-analysis-exceptions-email.sql` — 3 new tables: `labor_analysis_daily`
  (full `parseLaborData` output, ~50 columns), `labor_exceptions_daily` (aggregate, matches
  `ds.exceptionRows`' existing field shape), `labor_exceptions_detail_daily` (per-employee,
  including the manager-authorization flag). Same tenant_id + `ltrim(loc,'0')` RLS pattern as
  every sibling emailed-report table (`sales_ledger_daily` etc.) — copied the canonical
  predicate from `schema-rls-phase2-loc.sql` exactly rather than inventing a variant.
- `scripts/qsrsoft-email-parse.mjs` — two new `HANDLERS` entries (`'labor'`, `'labor-exceptions'`),
  plus the detail-table write for `'labor-exceptions'` from the same downloaded file (no second
  download). The existing weekly/monthly-rollup skip-guard (dispatch #172's lesson) is extended
  to cover both new report types preventively — their weekly/monthly variant has NOT been
  checked for a real per-row date column yet, and skipping a rollup only delays that date by
  one day (the next daily file fills it); trusting a wrongly-shaped rollup risks silently
  corrupting a whole week onto one day, exactly #172's original incident.
- `src/__tests__/labor-exceptions-real-shape.test.js` — built from the real file's exact header
  and two real data rows (not an invented fixture), including a regression test for the
  `parseExceptionTimestamp` date-flip bug.
- A generic `camelCase→snake_case` allow-list mapper (`pickSnake`) in the email-parse script for
  `labor_analysis_daily`'s ~50 fields, rather than hand-transcribing each one — the exact
  "forgot to list a field" risk `mapGlimpse`'s own pre-existing comment already documents as
  having happened once.

**Deliberately NOT done this pass (named follow-on, not forgotten):**
- **Not merged into `ds.laborRows`/`ds.exceptionRows`.** App.js's startup data-merge logic for
  these two fields is live, already carries documented race-condition history (see its own
  `loadLaborRows().then(...)` comment block), and deserves a dedicated, careful pass — ideally
  with the owner's sign-off on the exact by-day-override-without-clobbering-older-manual-history
  merge strategy, not rushed alongside everything else in this session. The 3 new tables are
  populated starting with the next `qsrsoft-email-parse.yml` run (1pm/4pm CT, already scheduled,
  no new workflow needed) and are queryable directly (Data Manager, SAGE, a future panel) even
  before that wiring lands.
- **Naming collision note, for whoever does that follow-on:** this codebase's existing
  `src/views/labor-analysis.js`/`src/engine/labor-analysis.js`/"Labor Analysis" terminology is
  the **LifeLenz** `labor_analysis_actuals_report` — unrelated vendor, unrelated data. QSRSoft's
  own "Labor Analysis" report lives in `labor_analysis_daily` here, deliberately not named
  anything containing a bare `labor_analysis` that could collide.
- `labor_exceptions_detail_daily` has no panel reading it yet — a future Register
  Audit/compliance-style panel is the natural home, not built here.

**Owner's own framing, which also answered a question this session had been treating as open**
(whether LifeLenz already covers the labor/OT gap enough to matter): *"LifeLenz may be
perfectly fine to use for that data."* Confirmed: `lifelenz_payroll_readiness` already carries
`overtime_hours`/`overtime_earnings` at the per-employee/per-shift grain (live, automated, a
different vendor entirely — unaffected by any of this pause). That closes the pure OT-hours/
OT-$ slice of the gap on its own. What QSRSoft's own Labor Analysis/Exceptions emails add on
top, that LifeLenz does NOT have: the STORE-level staffing-efficiency metrics tied to QSRSoft's
own "Need" model (TPPH, SPPH, Act-vs-Need, Opportunity Cost $ — the exact basis of the live
`query_labor_summary` SAGE tool and Labor Tools panel content, now paused at the source) and the
manager-authorization compliance flag on individual OT punches.

## ✅ 2026-11-16 (same day, later still) — the full Scheduled Reports catalog is now known

Owner asked CoachQ directly (the letter's own suggested step) for the complete list of reports
that CAN be scheduled for email delivery. Full answer: **Sales Ledger, Labor Analysis, Labor
Exceptions, Cash Sheet, Daily Glimpse, Birthday/Anniversary Report, Adyen Adjustments** — 7
total, no more, no hidden catalog beyond this.

**5 of 7 are already scheduled and now fully parsed** (Sales Ledger/Cash Sheet/Daily Glimpse
since the original email pipeline; Labor Analysis/Labor Exceptions as of this same session, see
above). **The remaining 2 are not worth chasing for this gap:**
- **Birthday/Anniversary Report** — HR recognition data (employee birthdays/anniversaries), no
  connection to any of the Group C operational gaps below.
- **Adyen Adjustments** — Adyen is a payment processor; this is almost certainly card-payment-
  level adjustments/chargebacks, a real but narrow slice that might overlap the cash-O/S/refund
  ground `daily_glimpse_daily`/`cash_sheet_daily` already cover reasonably well. Nobody has
  looked at a real sample — if the owner wants to check, turning it on costs nothing (same
  calendar-icon toggle as the others) and a sample could be parsed the same way the last two
  were, but it's not assumed to close anything major.

**This settles the question this file's "Track D" gap analysis raised as open ("ask CoachQ for
the list").** It is now closed: the Scheduled Reports lever has been fully pulled. **None of the
7 reports cover any of Track D's Group C domains** — labor/punch detail beyond what Labor
Analysis/Exceptions now give (punch times, employee tenure, pay-period history), FOB/food cost,
eBOS/purchases, register-level controls/security events, forms/checklists, product mix, menu
data, turnover/roster, store config, or intraday/quarter-hour granularity. Those genuinely have
**no emailable path at all** — the only remaining levers for them are the MCP server eventually
adding that report type, or a direct resolution with QSRSoft, not anything sitting unused in the
owner's inbox.

## ✅ 2026-11-16 (same day, later still) — ds.laborRows/ds.exceptionRows merge wiring + a real bug caught before it compounded

The deferred follow-on named above ("Not merged into `ds.laborRows`/`ds.exceptionRows`... deserves
a dedicated, careful pass") is now done, per the owner's explicit instruction once the three new
tables existed: *"Go ahead and wire it in its own careful pass."*

**What shipped:**
- `src/lib/supabase.js` gained `loadLaborAnalysisDaily(daysBack=400)` and
  `loadLaborExceptionsDaily(daysBack=400)`, each mapping the real snake_case DB columns back to
  EXACTLY `parseLaborData()`/`parseLaborExceptions()`'s own camelCase output shape — a row from
  either source is indistinguishable to any `ds.laborRows`/`ds.exceptionRows` consumer.
- `src/app/App.js` merges both at startup, in their own effects placed right after the
  pre-existing `loadLaborRows().then(...)` merge (deliberately separate, so this new wiring can
  be reviewed/reverted independently of that older, already-documented-race-condition-prone
  merge). Same additive-by-`(loc,date)` semantics: an existing row (manual upload, or the thinner
  `labor_rows` table merged just above it) always wins on a day already covered; the new tables
  only fill genuinely uncovered days.
- That merge step is pulled out into one shared, exported, directly tested function —
  `mergeFreshRowsByLocDate(existingRows, freshRows)` in `supabase.js` — rather than duplicated
  inline in both effects, and both App.js call sites now just call it.
- `src/__tests__/labor-analysis-exceptions-ds-merge.test.js` — field-mapping correctness for both
  new loaders (built from a realistic row shaped like the real schema, checked field-by-field
  across the full width of the table, not just the first few columns) and direct unit tests of
  `mergeFreshRowsByLocDate`'s additive-wins-existing semantics.

**A real, live bug was caught while writing that test — not a hypothetical.** The test asserted
the loader's output against a fixture built from the ACTUAL schema column names
(`supabase/schema-labor-analysis-exceptions-email.sql`), and the first run failed:
`row.mopGC` came back `null` instead of the fixture's `180`.

Root cause: both the new read-side mapper and the write-side `scripts/qsrsoft-email-parse.mjs`
(shipped earlier today, v5.804) derive each DB column name from `LABOR_ANALYSIS_FIELDS`' camelCase
names via a `toSnake()` transform —
```js
const toSnake = (k) => k.replace(/([A-Z])/g, '_$1').toLowerCase();
```
— which inserts an underscore before **every** uppercase letter, splitting consecutive capitals
apart: `mopGC` → `mop_g_c`, `actualGC` → `actual_g_c`, `dtGC` → `dt_g_c`, and six more of the same
shape (`bfGC`, `delivGC`, `kioskGC`, `eatInGC`, `inStoreGC`, `fcGC`) — **9 fields total**. None of
those match the real columns (`mop_gc`, `actual_gc`, `dt_gc`, …). A tenth field, `salesVsLYPct`,
has a different failure mode: the acronym `LY` immediately followed by another capitalized word
(`Pct`) can't be split correctly by any generic capital-boundary regex at all (`sales_vs_lypct`
vs. the real `sales_vs_ly_pct`).

**Blast radius: this is not a cosmetic read-side-only bug.** The write-side script
(`scripts/qsrsoft-email-parse.mjs`, already live and scheduled 1pm/4pm CT since v5.804 — today)
uses the identical broken `toSnake`, so `mapLaborAnalysis()` has been building upsert payloads
keyed by invented column names (`mop_g_c`, `actual_g_c`, etc.) that don't exist in
`labor_analysis_daily`. PostgREST rejects an upsert containing an unknown column outright
(`42703`), and `upsertRows()`'s own error handling (`console.error(...); continue;`) means that
failure has been **silent except to the script's own console output** — exactly the "quiet
no-op, not a success" failure shape this same script's own guard comment already warns about one
layer up (the whole-batch-upserted-zero check), except this failure mode is per-row-shape, not
per-batch, so it wasn't caught by that guard. Whether any `labor_analysis_daily` row has
successfully upserted since v5.804 depends on whether the 1pm/4pm CT run has fired yet today —
**worth checking the Action's own log output once it has**, since every run since v5.804 would
carry this bug.

**Fix:** switched both files' `toSnake` to match on a lowercase/digit immediately followed by an
uppercase letter (`/([a-z0-9])([A-Z])/g`), which correctly treats a run of consecutive capitals as
one unit (verified against the full real column list in node before shipping — this matches
52 of 53 fields), plus one explicit override object (`{ salesVsLYPct: 'sales_vs_ly_pct' }`) for the
one acronym case no generic transform resolves. `scripts/qsrsoft-email-parse.mjs`'s `main()` is
now guarded behind the same `import.meta.url === \`file://${process.argv[1]}\`` pattern already
used by `qsrsoft-security-events-pull.mjs` and others, and `toSnake`/`LABOR_ANALYSIS_FIELDS`/
`mapLaborAnalysis`/`mapLaborExceptions` are now exported — purely so this exact bug class is
unit-testable against the real schema going forward, with zero behavior change to how the script
runs for real.

This is the "measure it, don't reason about it" rule paying for itself directly: the two sides
agreeing with each other (both derived the same wrong column name) would have looked like
confirmation if the test had only compared the read side's output to the write side's own
field list, instead of to the actual DDL.

## Draft response letter

A draft reply to Michael Henkel is saved at `memory/draft-letter-qsrsoft-response-2026-11-16.md`
and delivered to Fletcher as a `.docx` — **not sent, Fletcher's call entirely** on whether/how/
when to send it, per his own instruction ("I'll figure out how to approach them, but draft a
letter and save").
