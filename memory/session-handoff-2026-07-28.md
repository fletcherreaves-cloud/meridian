---
name: session-handoff-2026-07-28
description: MASTER handoff from the 2026-07-28 session (Notes 30/31/32 — Perf Reviews, Leadership One-Pager, QSRSoft People/Sales/Delivery data sourcing). Read FIRST at the next session start to resume without re-deriving. What shipped, what's pending, decisions locked, the exact next task (build the QSRSoft pull scripts), and the access/settings needed.
metadata:
  node_type: memory
  type: project
---

# MASTER SESSION HANDOFF — 2026-07-28

## Branch / PR
- Branch: `claude/status-data-refresh-strategy-u88lz9` · **open draft PR #80** (build clean, 429 tests green, Vercel deployed).
- Read these memory files for full detail: `notes-30-queue.md`, `notes-31-queue.md`, `notes-32-queue.md`,
  `perf-review-data-sourcing.md`, `perf-review-excel-audit.md`.

## SHIPPED this session (all on PR #80)
- **Perf Reviews KPI directory** (v4.535) — `src/engine/kpi-registry.js` + Customize wiring (add/rename/
  delete Results categories, KPI dropdown, ⓘ plain-English thresholds).
- **One-Pager Notes 31** (v4.536) — metricSeries accepts string OR Date ranges; FOB prodSales>0 guard;
  Week/MTD/YTD/Custom range + YTD-alongside; timeframe labels; L/F/G spelled out; cascade tag.
- **One-Pager window-consistency** (v4.537) — killed the weekly Opportunity blow-up (was mixing the
  monthly FOB prodSales into a weekly avgCheck → GC pillar exploded). All pillars use the window's own
  sales/guests/days; canonical FOB% tile.
- **One-Pager cascade FOCUS** (v4.539) — level selector re-emphasizes the page (focus banner + reordered
  state grid + prints). DRAFT per-level focus — **owner may refine / upload JobRole descriptions**.
- **Perf Reviews target auto-fill** (v4.538) — autoPopulateKPIs fills each mapped metric's TARGET from
  DEFAULT<yearly<monthly (monthly wins). `missingReviewTargets()` + `mergedTargetsForLoc()`.
- **Op Supplies wired** (v4.541) — `loadEbosDaily`→ds.ebosRows; opSupplies actual = Σ ops_purchases.
- **Total Profit derivation** (v4.540) — `deriveTotalProfitVsTarget()` (FOB%+Labor%+OpSupplies$). Engine
  ready; NOT wired into autoPopulate yet (gated on FOB %-basis + it now has op-supplies).
- **QSRSoft People/Digital/Delivery PARSERS** (v4.542/543) — `src/engine/people-reports.js`: Employee
  Roster, Roster Statistics, Turnover (monthly + wide), Digital App, McDelivery 3PO. Header-indexed,
  tested, **validated against the owner's real sample exports**. Job-code taxonomy configurable.
- **People persistence + review wiring** (v4.544) — `supabase/schema-people-reports.sql` (**owner RAN it
  — roster_statistics / roster_role_counts / turnover_monthly created**); save/load in supabase.js;
  startup loaders → ds; autoPopulateKPIs fills Headcount / Shift-Cert / 0-90 Turnover per loc/month.

## DECISIONS LOCKED (do not re-ask)
- Shift-Certified Managers = **Cert Swing + Dept Mgrs** (shiftMgr bucket; GM excluded).
- 0-90 Turnover = **1 − Retained>90%** (`turnover090Pct`).
- Headcount source = **Roster Statistics** (Roster Active); Shift-Cert source = **Employee Roster** bucket
  (they reconcile within ~1 — active-definition/bucket boundary).
- Missing-targets UX = **prompt + Smart-Targets seed** (approved; NOT yet built).
- Cascade focus = I drafted; **owner refines**.
- Monthly target wins over yearly (already the merge order).

## PROGRESS — continued session (Roster Statistics + Employee Roster pulls SHIPPED)
- **Roster Statistics auto-pull LIVE** (v4.545) — 27/27 → `roster_statistics` 2026-07 (run 30387183521).
  Files: `scripts/qsrsoft-roster-stats-pull.mjs`, workflow, `parseRosterStatisticsApi()`. Commit `c06c328`.
- **Employee Roster auto-pull LIVE** (v4.546) — 1493 active employees → 27/27 → `roster_role_counts`
  2026-07 (run 30388186099). `parseEmployeeRosterApi()`, `scripts/qsrsoft-employee-roster-pull.mjs`,
  workflow. Commit `a0debaa`. **PII-safe**: trimmed selectCols (no SSN/DOB/address fetched); only
  aggregate integer counts persisted. Shape note: employee-roster is a FLAT `result:[]` (NOT result.resp).
- **Two of three review People metrics now have live data: Headcount + Shift-Cert.** Remaining: Turnover.
- Both cherry-picked to **main** (c8ae189, 75e852d) so cron/dispatch fire. Both rely on the Playwright
  fallback (stored QSRSOFT_TOKEN + QSRSOFT_COGNITO_TOKEN are stale/401).
- **NEXT: Turnover** (→ `turnover_monthly`, the 0-90 metric = 1−Retained>90%). Need its capture
  (endpoint likely `/reporting/v2/people/turnover…` + JSON `result[]` shape). Then Digital App +
  McDelivery 3PO (future delivery project, lower priority). Consider consolidating the 3 people pulls
  into one `qsrsoft-people-pull.mjs` (single Playwright auth) once Turnover lands.
- **REUSABLE PATTERN for the remaining People pulls** (Employee Roster, Turnover, Digital, McDelivery):
  - Host/prefix: `GET https://api.reports.myqsrsoft.com/reporting/v2/people/<report>` —
    params `nsd=d&nsn=<csv all 27>&orgId=<ORG>&enterpriseName=McDonalds&startDate=YYYY-MM-01&endDate=YYYY-MM-DD&weekStart=3`.
    **One call returns all 27 stores.**
  - Response envelope: `{ result: { resp: [ {nsn, …camelCase…} ], totals: {…Grand Total…} } }`.
    The JSON keys DIFFER from the xlsx headers the `parse*` fns expect → each report needs a
    `parse<Report>Api()` normalizer that maps the JSON to the SAME record shape as its xlsx parser
    (see parseRosterStatisticsApi as the template). Skip the `totals`/"Grand Total" row.
  - Auth reality in CI: stored `QSRSOFT_TOKEN` AND `QSRSOFT_COGNITO_TOKEN` both **401** (stale) —
    the Playwright user/pass fallback logs in and captures a FRESH token from the report page's own
    XHR (~40s/run). Works reliably. Refresh those two secrets only if faster runs are wanted.
  - **DEPLOYMENT GOTCHA (important):** `workflow_dispatch` AND `schedule` only fire from the
    DEFAULT branch (main). New pull workflows must be cherry-picked onto **main** (additive files:
    the `parse*Api`+engine, the script, the yml — inert for the deployed app since main doesn't
    import them yet) so cron runs + you can dispatch. Done for roster-stats; do the same for each.
  - **STILL NEED per-report captures** (URL + JSON `result.resp[]` shape, AUTH REDACTED) for:
    Employee Roster, Turnover, Digital App, McDelivery 3PO — endpoint paths + camelCase keys aren't
    safely guessable. Ask the owner for one network capture per report.

## THE NEXT TASK — build the QSRSoft pull scripts (data still needs to LAND in the tables)
Parsers + tables + review wiring are done. What's missing: getting data into the tables. Two paths:
1. **Playwright auto-pull scripts** (the real deployment) — one per report, pattern in
   `scripts/qsrsoft-ebos-pull.mjs` / `qsrsoft-variance-pull.mjs`: Playwright logs into v3.myqsrsoft.com
   (or exchanges a token via `api.sso.myqsrsoft.com/token/…`) → fetch each report endpoint per store →
   parse with people-reports.js → upsert to Supabase (service-role). Then a `.github/workflows/*.yml`.
2. **Manual upload routing** — add filename detection in `src/parsers/index.js` `detectType()` + a
   dispatch branch in the App.js upload handler → parse → save. (Fallback; smaller.)

**Reports still needing pulls (parsers done):** Employee Roster, Roster Statistics, Turnover (per-loc
monthly + annual wide), Digital App (daily → monthly GC/R/D roll-up), McDelivery 3PO (3PO GC + CSAT/
missing-items/times). Endpoints likely on `api.reports.myqsrsoft.com` — **need one captured network
request per report (URL + method + payload, AUTH REDACTED)** to know the exact endpoint, OR infer from
existing report pulls. Digital App backfill recommendation: seed MTD per month + daily forward.

## ACCESS / SETTINGS for the next session
- **QSRSoft: NO new access/secrets needed for the deployment path.** GitHub Secrets already exist
  (QSRSOFT_TOKEN, QSRSOFT_USERNAME, QSRSOFT_PASSWORD, QSRSOFT_COGNITO_TOKEN, QSRSOFT_EBOS_TOKEN,
  QSRSOFT_FORMS_TOKEN). Pulls run on **GitHub Actions runners** (not the agent sandbox), which already
  reach QSRSoft. Build script → commit → trigger workflow via GitHub MCP → read job logs to debug.
- **Optional:** to test-fetch QSRSoft live from inside the session, add these to Capabilities → network
  egress allowlist (same place `*.supabase.co` was added): `*.myqsrsoft.com` (covers api.reports /
  api.sso / forms.home / v3). NOT required if using the GitHub-Actions loop.
- **Supabase egress** was allowlisted (`*.supabase.co`) — still pending the FL FOB live check (query in
  this file's earlier note). Applies at session start → a fresh session picks it up.
- **NEVER** write live creds (x-auth-token / Cognito JWT / passwords) to repo/memory/commits — redact.

## STILL PENDING (no access needed)
- Missing-targets prompt + Smart-Targets seed UI (approved).
- FOB metric-definition fix (score FOB% not fob$) → unblocks Total-Profit wiring (perf-review-excel-audit
  ROUND 2 has the banked threshold-value corrections too: OEPE %-of-target+120s floor, Shift-Certified
  gentle count step, Bonus-Eligibility module, Total Profit Excel bands).
- #65 EOM qty-variance + Item-Journey reconcile. #67 target write-back to QSRSoft.

## FL FOB LIVE CHECK (carry-over)
Weekly FOB was fragile; guard + month/YTD range added. Confirm on a full-month/YTD range: if FL still
~15%, real qsr_fob data issue. Query: `GET {VITE_SUPABASE_URL}/rest/v1/qsr_fob?select=loc,date,
prod_sales_amt,comp_waste_amt,raw_waste_amt,condiments_amt,emp_mgr_meals_amt,stat_variance_amt,
unexplained_amt&order=date.desc` → FL locs (INV_ORG_COORDS[loc].state==='FL'), Σcomponents÷Σprod_sales.

## UPLOADED FILES — DO NOT ASSUME THEY TRANSFER
The 5 sample xlsx were uploaded to the previous session and are session-local; a new session will NOT
have them. Parsers are validated so they're usually not needed again — but if a NEW column edge case
appears, ask the owner to re-upload the relevant sample.
