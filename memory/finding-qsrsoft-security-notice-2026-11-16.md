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

## ⚠️ Two things Fletcher needs to do before this pull can run for real

1. **Run `supabase/schema-qsrsoft-mcp-reports.sql`** in the Supabase SQL editor (this agent's
   attempt to apply it directly via the Management API was blocked by the sandbox's own
   safety classifier as a live-database write — same as prior DDL in this repo, e.g. the
   Recommendation Ledger migration, which the owner ran manually).
2. **One more "Connect" + paste-the-redirect-URL round** in QSRSoft (same flow as the first
   connection) is needed to mint a **dedicated** refresh token for `qsr_mcp_token_cache` — see
   "A mistake made during this session's own development" below for why the one already
   established can't be reused.

Once both are done, tell this agent (or whichever session is live) the refresh token + client
ID (from the resulting redirect URL / this agent's own session credentials) so it can be seeded
into `qsr_mcp_token_cache` — a one-time `upsert`, never typed into a repo file or commit.

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

## Draft response letter

A draft reply to Michael Henkel is saved at `memory/draft-letter-qsrsoft-response-2026-11-16.md`
and delivered to Fletcher as a `.docx` — **not sent, Fletcher's call entirely** on whether/how/
when to send it, per his own instruction ("I'll figure out how to approach them, but draft a
letter and save").
