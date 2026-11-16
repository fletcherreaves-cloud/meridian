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

## Draft response letter

A draft reply to Michael Henkel is saved at `memory/draft-letter-qsrsoft-response-2026-11-16.md`
and delivered to Fletcher as a `.docx` — **not sent, Fletcher's call entirely** on whether/how/
when to send it, per his own instruction ("I'll figure out how to approach them, but draft a
letter and save").
