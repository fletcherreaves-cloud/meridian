---
name: lifelenz-session
description: "LifeLenz GitHub Actions daily sync — runbook, API details, token refresh, how it works"
metadata: 
  node_type: memory
  type: reference
  originSessionId: ac407d52-bc14-4517-af65-49f116393c04
---

## Status

**Operational as of v4.300 (2026-07-04).** Daily sync runs at 10:00 UTC via GitHub Actions, saves labor analysis CSV rows to `lifelenz_schedule` Supabase table (upserted on `loc, date`).

---

## How the Sync Works (complete sequence)

1. **Auth** — reads `LIFELENZ_TOKEN` env var (GitHub Secret). Token is validated (rejects only 401/403/422, not 404). When it's expired, falls through to `getAuthTokenDirect()` (a direct GraphQL `SignIn` POST — see **2026-11-01 finding** below) and then, as a last resort, a Playwright-driven real login at `admin.lifelenz.com/us01/auth/login`.

2. **Schedule discovery** — `GET https://us01-connect.lifelenz.com/api/admin/businesses/{businessId}/schedules`  
   - Returns JSON:API format: `{ data: [{ id, type: "schedules", attributes: { schedule_name, schedule_status, ... } }] }`  
   - 35 schedules total; 8 are group/org schedules (e.g. "MCDOK/Emerald Arches") — filtered out  
   - 27 active store schedules pass the `/\b\d{4,7}\b/` store-number filter on `schedule_name`  
   - **Do NOT use** GraphQL `GetPdfReportsBusinessOfficeLocations` — it returns office location IDs which differ from schedule IDs and cause 404 on the report endpoint

3. **Report download** — for each store, in 21-day date chunks:  
   `GET /api/admin/report/businesses/{businessId}/schedules/{scheduleId}/labor_analysis_actuals_report?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&type=csv`  
   Headers: `X-Auth-Token`, `X-Business-Id`, `X-Lifelenz-Device: webadmin`, `X-Version: 1.75.21`, `X-Schedule-Id: {scheduleId}`, `X-Page-Module: reports-pdf`

4. **Parse CSV** — row 0 is metadata (store number), row 1 is headers, rows 2+ are daily data

5. **Upsert** — to `lifelenz_schedule` Supabase table, conflict key `(loc, date)`

---

## API Reference

| Item | Value |
|------|-------|
| Base URL | `https://us01-connect.lifelenz.com` |
| Business ID | `01979dbf-a166-759b-8702-aba9915c578e` |
| Schedules endpoint | `GET /api/admin/businesses/{businessId}/schedules` |
| Report endpoint | `GET /api/admin/report/businesses/{businessId}/schedules/{scheduleId}/labor_analysis_actuals_report` |
| GraphQL endpoint | `POST /manager/graphql?{OperationName}` |

**Required headers for all API calls:**
- `X-Auth-Token: {token}`
- `X-Business-Id: 01979dbf-a166-759b-8702-aba9915c578e`
- `X-Lifelenz-Device: webadmin`
- `X-Version: 1.78.11` (bumped 2026-11-01 — was still 1.75.21 from before LifeLenz's Oct 29 redesign; confirmed against a real captured live request)

---

## Token Refresh (when sync starts failing with auth errors)

1. Log in to `admin.lifelenz.com` in Chrome
2. Open DevTools → Network tab → filter to `us01-connect`
3. Click any request → Headers → copy the `X-Auth-Token` value (long base64 string)
4. GitHub repo → Settings → Secrets and variables → Actions → `LIFELENZ_TOKEN` → Update
5. Re-run the workflow manually from Actions tab

Token lifespan: unknown, but observed to last multiple days. The sync only fails if the token fully expires — GraphQL returning 200 does NOT guarantee the report endpoint will accept it (report endpoint may be stricter).

---

## Inactivity Timeout (for manual/local use)

- LifeLenz shows a timeout overlay after ~5 minutes of inactivity
- Wiggling the mouse dismisses it — tab stays alive
- If timeout fires and you're logged out, the token becomes invalid mid-run

---

## Key Dead Ends (don't re-investigate)

- **GraphQL `GetPdfReportsBusinessOfficeLocations`** — returns office location IDs, NOT schedule IDs. These differ from schedule IDs and cause 404 on the report endpoint.
- **`schedules` field on `BusinessOfficeLocation` GraphQL type** — does not exist (returns "undefinedField" error)
- **Playwright from GitHub Actions** — blocked on both `admin.lifelenz.com` and `idm.lifelenz.com`
- **OIDC/OAuth2 ROPC against `idm.lifelenz.com`** — attempted, unsuccessful
- **`page[number]`/`page[size]` pagination** — rejected with 422 by the schedules endpoint; call without params, follow `links.next` if present

---

## ⚠️ OPEN ISSUE (2026-09-30) — `idm.lifelenz.com` blocks GitHub Actions' IP whenever the fallback auth path is needed. Owner knows, deferred, revisit before the next token expiry.

**What's confirmed, measured directly from job logs, not inferred:** every time `LIFELENZ_TOKEN` has expired and the script had to fall through to the real login flow, `idm.lifelenz.com` has returned **HTTP 500 with an empty body** on every endpoint tried — OIDC discovery, `/connect/token` (ROPC, all 4 client_id variants), `/api/auth/login` and 3 other IDM JSON login paths, and finally `/connect/authorize` itself via a real headless Playwright browser (realistic desktop UA, `--disable-blink-features=AutomationControlled`, `navigator.webdriver` patched — none of it mattered, the 500 comes back before any page/JS loads). Confirmed identical on **two separate occasions three weeks apart** (2026-09-09/10 and 2026-09-26–30), with a **manual browser login from the owner's own network succeeding fine in between** (2026-09-30) — so this is not a general LifeLenz outage, it's specific to the source network the request comes from. Response carried real `cloudfront.net` `via` headers (AWS CloudFront), so the request is genuinely reaching LifeLenz's infra, not failing earlier in the path.

**Leading theory (not vendor-confirmed):** a WAF/bot-protection rule on `idm.lifelenz.com` blocking known cloud/datacenter IP ranges (GitHub Actions runners, and probably cloud IPs generally) — consistent with the instant 500-before-any-JS-runs pattern, and with this repo's own prior dead-end note above ("blocked ... on both admin.lifelenz.com and idm.lifelenz.com").

**This is NOT an official API integration** — LifeLenz support is unlikely to help (owner's own assessment, 2026-09-30). Emailing them costs nothing but isn't expected to move it.

**Three real options, none implemented yet — owner is deferring, revisit before the next expiry:**
1. **Move the pull off GitHub Actions to a residential/business IP** — small always-on device (Raspberry Pi/mini PC) at a store, cron-scheduled. No recurring cost beyond hardware; loses GitHub Actions' logging/retry/secrets unless we build a thin equivalent.
2. **Residential proxy service for just the `idm.lifelenz.com` calls** — keeps everything on GitHub Actions; new paid dependency, another thing that can break or get expensive.
3. **Status quo** — keep manually refreshing `LIFELENZ_TOKEN` ~monthly when it expires (this is what's happening today; this incident was resolved 2026-09-30 by a manual token update, took 5 days to notice this time). Cheapest, but the data-staleness window recurs every expiry cycle and depends on someone noticing.

**Trigger for revisiting:** next `LIFELENZ_TOKEN` expiry (roughly monthly — last two expiries were ~Sept 9-11 and ~Sept 26-30, so expect the next one around late October 2026). A reminder is scheduled for 2026-10-21 to bring this back up before that window.

**Third occurrence, 2026-10-15 to -17 — same signature, re-measured, owner re-confirmed status quo.** `LifeLenz Daily Sync` failed 3 consecutive scheduled runs (Oct 15/16/17); data hit 85.4h old before being caught. Checked the Oct 17 job log directly: `LIFELENZ_TOKEN` rejected 422 → falls through to the `idm.lifelenz.com` fallback → every endpoint (ROPC all 4 client_ids, 4 IDM JSON login paths, the real Playwright `/connect/authorize` nav) returns an instant 500 with empty body, identical to the two prior occurrences above — not re-diagnosed as new. Not yet fixed as of this note — still needs a manual `LIFELENZ_TOKEN` refresh (DevTools → Network → any `us01-connect.lifelenz.com` request → copy `X-Auth-Token` → update the GitHub Secret). **Owner decision, asked directly:** keep doing manual refreshes for now; the on-site-device and residential-proxy options stay logged above for later, not actioned this round. Do not re-propose them unprompted next time this recurs — just do the manual refresh and note the occurrence here.

---

## ✅ RESOLVED 2026-11-01 — the ⚠️ OPEN ISSUE above (WAF/IP-block theory) is SUPERSEDED. The fallback chain was pointed at a dead OAuth2 flow LifeLenz retired, not blocked by IP. Fixed in `scripts/lifelenz-pull.mjs`; do not re-raise the residential-proxy/on-site-device options above for this specific failure mode.

**Fourth occurrence, 2026-11-01** — `LifeLenz Daily Sync` run #161 failed: `LIFELENZ_TOKEN` rejected (422) → fallback chain → every `idm.lifelenz.com` endpoint **404**, not the previous occurrences' 500. That status-code change was the tell that this isn't the same WAF-block pattern recurring — it's something structural.

**Measured directly, not inferred (three independent confirmations):**
1. **Every `idm.lifelenz.com` path 404s identically, from two separate networks** (GitHub Actions *and* a completely different sandbox/IP) — `/.well-known/openid-configuration`, `/connect/token`, `/connect/authorize`, `/api/auth/login`, and a deliberately nonexistent control path all return the identical `content-length: 0`, `x-cache: Error from cloudfront`. A WAF blocking one bad actor's IP doesn't explain two unrelated networks getting the same empty response on a URL that was never real in the first place (the control path) — this is CloudFront reporting no working origin behind the whole distribution for the OLD path set, not a targeted block.
2. **`admin.lifelenz.com` itself is healthy and was redeployed 2026-10-29** (LIFELENZ app version 1.78.11, per its own build metadata) — 2 days before the first 404 occurrence. New Reports UI (Compliance/Labor/Payroll/Scheduling/Time & Attendance categories) confirmed live by the owner.
3. **Owner's own live DevTools session, logged in and working fine:** searching the Network panel for `authorize` across the whole session turned up **zero real requests** (only unrelated minified-JS text matches like `view.unauthorized_title`). Searching for `token` showed the real, current mechanism is unchanged in SHAPE: `sessionStorage.getItem("authToken")`, sent as an `X-AUTH-TOKEN` header on every `us01-connect.lifelenz.com` call — exactly what `LIFELENZ_TOKEN` already is. Owner also confirmed directly: login is still plain username+password on LifeLenz's own page, not SSO, "for now" (so the fallback stays scriptable — this is not an MFA/SSO lockout).

**The real current login flow** (captured directly, via a headless-browser probe hitting the live site with no cookies, independently cross-confirmed by the owner's own captured `AsyncReports` cURL showing the unchanged `us01-connect.lifelenz.com` data-layer shape):
- Real login page: `https://admin.lifelenz.com/us01/auth/login` — plain email/password form (`#email`/`#password` input ids), with "Log in with SSO" offered only as an alternate, not the default.
- Real submission: `POST https://idm.lifelenz.com/external/graphql?SignIn` — a GraphQL mutation, NOT the old OAuth2 ROPC/authorize-code flow. `idm.lifelenz.com` itself is NOT dead — only its old `/connect/*` OAuth2 surface is; `/external/graphql` works fine.
  ```graphql
  mutation SignIn($username: String!, $credential: String!) {
    signIn(email: $username, credential: $credential) { authToken }
  }
  ```
  `credential` = the password, **base64-encoded** (confirmed: submitting a test password through the real form showed the exact base64 of what was typed in the captured request body).
- Response shape: `{"data":{"signIn":{"authToken":"..."}}}` on success; `{"errors":[{"extensions":{"code":"AUTHENTICATION_ERROR","reason":"invalidUserOrPassword"}}],"data":null}` on failure — verified directly against the live endpoint with a deliberately wrong password (a clean, well-formed GraphQL error, not a 404, confirming the endpoint/shape itself is correct).
- That `authToken` is the same credential as `LIFELENZ_TOKEN` / `X-Auth-Token` always was — nothing about the DOWNSTREAM API shape changed, only how you obtain a fresh one.

**Fixed:** `getAuthTokenDirect()` now POSTs the `SignIn` mutation directly (fast, no browser) instead of probing the dead OIDC-discovery/ROPC/IDM-JSON-login paths. The Playwright fallback (`getAuthToken()`) now navigates to the real login page instead of the dead `/connect/authorize` URL, and captures `authToken` straight out of the `SignIn` response body (the old flow's auth-code-redirect-and-exchange logic is gone — the real flow is an in-page XHR, not an OAuth redirect). `apiHeaders()`'s `X-Version` bumped from the stale `1.75.21` to the live `1.78.11`.

**Immediate unblock for this occurrence:** owner manually refreshed `LIFELENZ_TOKEN` from DevTools (same runbook as always — that part never changed), confirmed working via a clean scheduled re-run (run #162, succeeded in 5m22s). The script fix above is for the NEXT time the token expires, so the fallback doesn't die against dead endpoints again.

**Owner, verbatim, on the MFA note seen in the live LIFELENZ banner:** *"restaurant managers will be required to use multi-factor authentication (MFA) to access LIFELENZ" starting 11/09* — owner is confirming what that means for their own credentials. **Open risk, not yet resolved:** if MFA becomes mandatory for the `LIFELENZ_USERNAME`/`LIFELENZ_PASSWORD` service account the Playwright fallback uses (not just human GM logins), the fallback becomes fully unusable — no way for a script to answer an MFA prompt unattended. Worth confirming with LifeLenz whether service/integration accounts are exempt. If not, the only paths left are (a) manual `LIFELENZ_TOKEN` refresh becoming the sole mechanism (status quo, just without the automated self-heal), or (b) a scripted MFA bypass (e.g. a long-lived API key/service-account credential LifeLenz issues separately) if LifeLenz offers one — don't assume one exists without asking them directly.

---

## New Data Explorer (admin.lifelenz.com) runs on a separate "Lakehouse" backend — observed 2026-11-01, not yet automated, nothing built against it

Same redeploy (app version 1.78.11, 2026-10-29) that moved login to the `SignIn` GraphQL mutation above also shipped a second reporting surface, reachable from the sidebar's **Data Explorer** icon, separate from the existing **Download Reports** page (which is unchanged — confirmed still live with the same 5 reports: Attendance Reliability, Pay Period Variance, Availability, Biometric Consent, Compliance Dismissal — our pull script's auth fix above already proves those endpoints untouched end-to-end). Data Explorer currently offers 5 new views, none of which this repo pulls today: **Compliance Audit** (labor compliance warnings/penalties), **Employee Performance** (attendance/shift/hours per employee), **Payroll Readiness** (hours/pay data for a pay period), **Schedule Variance** (post-publish schedule edit audit trail, scheduled-vs-actual), **Time Punch Activity Log** (punch-edit audit trail — likely overlaps what `punch-audit` in `lifelenz-pull.mjs` already captures via the old report; not yet compared side by side).

**Confirmed from 3 owner-captured live DevTools curls (tokens NOT retained — stripped per this file's own PII rule, data retained):**
- `POST us01-connect.lifelenz.com/manager/graphql?AsyncReports` — `asyncReports(businessId, ids:[...])` polls one or more report-generation jobs by id, returning `{status, reportName, url, error, expiresAt, ...}`. This is the DOWNLOAD/poll half of a generate-then-poll flow.
- `POST us01-connect.lifelenz.com/manager/graphql?GetEntityFilterOptions` — `lakehouseEntityFilterOptions(businessId, query:"schedules", first:20)` returns `{id,label}` pairs; this is how the Data Explorer UI populates its Schedule picker. Generic — `query` is a `LakehouseEntityQueryEnum`, so other entity types (employees? stores?) are likely queryable the same way, unconfirmed.
- A LaunchDarkly `events/bulk` beacon (client telemetry, not app data) confirms the backend name and rollout state directly from the feature-flag payload: `lz-20260925-lakehouse-report-async: true` (the 5 new reports ARE async/Lakehouse-backed — matches the `AsyncReports` poll), `lz-20260928-lakehouse-report-async-prism: false` (a newer async variant not yet enabled for this account), `lz-20260601-lakehouse-report-page-size: 20`, `lz-20260826-lakehouse-report-max-group-depth: 4`. Also visible, unrelated to Data Explorer but worth knowing: `lz-20260708-schedule-next: false` and `lz-20260705-timekeeping-next: false` — a next-gen Schedule/Timekeeping UI is flagged but not live for this account yet.

**What's still missing to automate any of this:** the trigger call — whatever mutation actually kicks off a report generation job and hands back the id that `AsyncReports` then polls. Only the poll half and the entity-picker half have been captured so far. **Not building anything against this yet** — this section is the finding, not a dispatch. Next step if/when this becomes worth automating: capture that trigger mutation (open a Data Explorer report, DevTools Network, find the "Generate"/"Run" request) and compare Schedule Variance's actual field shape against what `lifelenz-pull.mjs`'s existing schedule/lead-time-snapshot pull already covers, since that one in particular may be redundant rather than net-new.

**4th curl (same session) — the report SCHEMA query, a real building block:** `POST .../manager/graphql?GetReportMeta` → `lakehouseReportMeta(businessId, reportKey: "compliance_audit_report")` returns the full report definition: `columns[]` (name/member/type/aggType/display formatting/tooltip/link config), `entityFilters[]` (the Schedule picker etc. — `member`/`query`/`allowAll`/`multi`), `defaultFilters`, `dateRangePresets`, `defaultDateRange`, `defaultGroupBy`, `grandTotals`, `disclaimer`. So each Data Explorer report has a stable `reportKey` (`compliance_audit_report` confirmed; the other 4 tiles almost certainly follow the same naming pattern, e.g. `employee_performance_report`, `payroll_readiness_report`, `schedule_variance_report`, `time_punch_activity_report` — unconfirmed, would need to open each tile and capture its own `GetReportMeta` call to be sure). This is the CONFIG half of the flow, not the trigger — it tells you what filters/columns a report supports, which strongly implies the still-missing trigger mutation takes `reportKey` + the filters this describes as its arguments and hands back a job id for `AsyncReports` to poll. Still need that exact trigger mutation name/shape before anything here is automatable.

**5th curl (same session) — THIS IS the trigger call. The full flow is now captured end to end:**
`POST .../manager/graphql?GetReportDataTreeAsync` → `lakehouseReportDataTreeAsync(businessId, reportKey, dateRangeStart, dateRangeEnd, sortOrder, groupBy, filters, limit, columns)` returns an `AsyncReport` record (same `asyncReportFields` fragment as the poll query: `id, status, reportName, contentType, params, url, error, expiresAt, ...`). Captured live example: `reportKey:"compliance_audit_report"`, `dateRangeStart/End: "2026-10-25"/"2026-11-01"`, `groupBy:["compliance_audit_report.locations_location_name","compliance_audit_report.employees_employee_name"]`, `filters:[{member:"compliance_audit_report.locations_location_id", operator:"equals", values:["<scheduleId>"]}]`, `limit:20` — i.e. the column/filter `member` names from `GetReportMeta` above are exactly what `GetReportDataTreeAsync`'s `filters`/`groupBy`/`sortOrder` reference, and the filter VALUE for a location is the schedule's own GUID (the same id `lifelenz-pull.mjs` already resolves per store from `AsyncReports`... no — from the schedules REST call). So the complete automatable flow for any Data Explorer report is now known:
1. `GetReportMeta(reportKey)` → column/filter schema (not needed at runtime once the shape for a given reportKey is known and hardcoded, same as this repo already does for its existing REST reports).
2. `GetReportDataTreeAsync(reportKey, dateRangeStart, dateRangeEnd, filters, groupBy, sortOrder, limit)` → kicks off the Lakehouse job, returns an `AsyncReport` with an `id` (likely `status:"pending"` or similar at this point, not yet `url`).
3. `AsyncReports(businessId, ids:[id])` → poll until `status` flips to complete and `url` is populated.
4. `GET` that `url` → the actual report payload (shape/format controlled by `contentType`).

**Still not building anything against this** — confirming the mechanism is enough for now; the owner hasn't asked for a new automated pull against Data Explorer yet. If/when asked: `compliance_audit_report` is the one confirmed `reportKey`; the other 4 tiles' keys are unconfirmed and would need their own `GetReportMeta` capture (very likely to follow the same naming convention, e.g. `employee_performance_report`).

**6th+ curls (same session) — second confirmed `reportKey`, and a CSV-flavored sibling of the trigger call:** `POST .../manager/graphql?GetReportDataCsvAsync` → `lakehouseReportDataCsvAsync(businessId, reportKey, dateRangeStart, dateRangeEnd, sortOrder, groupBy, filters, columns, groupLevel)`, same `AsyncReport` return shape as `GetReportDataTreeAsync` above — so the UI has (at least) two trigger variants per report, one for the on-screen tree view and one for a CSV export, both landing in the same `AsyncReports` poll/download flow. Captured live for **`schedule_variance_report`** (2nd confirmed reportKey): `groupBy:["schedule_variance_report.locations_location_name","schedule_variance_report.scheduled_shifts_scheduled_shift_id"]`, `columns:["locations_location_name","scheduled_shifts_scheduled_shift_id","employees_employee_name","original_value","updated_value","schedule_event_actors_employee_name","occurred_at","scheduled_hours_variance","cost_variance"]`. That column list answers the open redundancy question from this section's own earlier note: Schedule Variance is a **shift-edit audit trail** (original value → updated value, who made the edit, when, plus the resulting hours/cost delta) — this is NOT the same as `lifelenz-pull.mjs`'s existing lead-time-snapshot capture (which tracks how far in advance a shift was published/edited relative to its start, not a value-level before/after diff). Genuinely net-new, not redundant, if ever automated.

---

## ✅ BUILT 2026-11-01 — Schedule Variance is live (`scripts/lifelenz-schedule-variance-pull.mjs`); the other 4 reportKeys CONFIRMED (schema captured, not guessed) via a live discovery dispatch

Owner asked to build out the Data Explorer finding above and find good uses for it. Shipped: `lifelenz_schedule_variance` table + daily pull + a "Schedule Discipline" tab in the Labor & Scheduling hub (per-store/per-editor rollups + recent-edits drill-down) + 2 new Signals metrics. Full writeup in `memory/project-backlog.md`'s "Shipped 2026-11-01" entry — this section only covers the NEW Data Explorer findings from validating it live (`workflow_dispatch debug=1`, run `41349875190`).

**All 4 previously-guessed reportKeys are REAL** — the pull's own discovery pass (`GetReportMeta`) resolved every one, with full real column lists captured live for the first time (previously only inferred from the UI tile text):

- **`compliance_audit_report`** (42 columns): `locations_location_name`, `employees_employee_name`/`employees_geid`, `shift_date`, `category`, `title`, `description`, `source`, `scheduled_shifts_scheduled_start_time`, `worked_shifts_clock_in_time`, `shift_breaks_completed_count`/`shift_meal_breaks_completed_count`/`shift_rest_breaks_completed_count`, **`cost_penalty`/`hour_penalty`** (+`_all`/`_raw` variants), `warning_time`, `worked_shifts_last_updated_by`, `is_dismissed`/`dismissal_reason`/`dismissed_by`/`dismissed_on`, `employees_minor_age`/`employees_is_salaried`/`employees_is_manager`, `compliance_warning_id`, plus the usual id/shift/time columns. This is a real labor-compliance-violation log with a DOLLAR PENALTY figure per violation — meal/rest break violations, minor-labor-law issues, etc., each with a cost. Nothing in Meridian tracks this today (no compliance-violation panel exists at all per CLAUDE.md's panel list).
- **`employee_performance_report`** (29 columns): `absent_count`, `late_count`, `no_punch_count`, `attendance_rate`, `scheduled_count`/`worked_count`/`unscheduled_count`, `drop_approved_count`/`drop_rate`, `pickup_request_count`/`pickup_approved_count`, `swap_manager_approved_count`/`swap_rate`, `total_worked_hours`, `disciplinary_action_count`, `commendation_count`, `leave_days_requested`/`leave_days_approved`, `employees_minor_age`/`is_salaried`/`is_manager`. A real per-employee reliability/performance scorecard — attendance, drops, swaps, discipline, commendations — richer than anything currently in Meridian's attendance rollup (`lifelenz_attendance_summary` is store-level only, no per-employee detail stored).
- **`payroll_readiness_report`** (58 columns, the richest of the five): `pay_periods_start_time`/`pay_periods_pay_period_status`, `scheduled_shifts_scheduled_hours` vs `worked_hours`/`total_worked_hours`, **`hours_variance`/`cost_variance`** (same field names as Schedule Variance, but at the PAY-PERIOD level, not per-edit), `total_earnings` broken into `regular_earnings`/`overtime_earnings`/`double_earnings`/`time_off_earnings`/`additional_earnings`/`misc_earnings`/`compliance_earnings`/`differential_earnings` (and matching `_hours` columns for each), `pay_period_posters_employee_name`/`pay_period_approvers_employee_name` (who posted/approved payroll), `scheduled_shifts_absent_reason_text`, `time_off_types_name`. This is effectively a full payroll pre-close audit report — whether a pay period is ready to post, broken down by earnings type, with a variance figure per employee.
- **`time_punch_activity_report`** (43 columns): `worked_shift_events_original_value`/`worked_shift_events_adjusted_value` (the actual punch edit, original→new), `worked_shift_events_punch_type`/`adjustment_type`/`punch_edit_reason`/`contest_reason`, `worked_shift_event_modifiers_employee_name` (the editor), `worked_shift_events_punch_variance_minutes`, `worked_shift_events_event_source`/`punch_method`/`is_employee_initiated`, `worked_shift_events_employee_action_status`/`employee_action_datetime` (did the employee acknowledge the edit), `worked_shift_events_attestation`, break-type/duration columns. **This DOES look like it substantially overlaps `lifelenz_punch_edits`** (this repo's existing table, sourced from the OLD `time_punch_change_approvals_report`) — both are punch-edit-with-editor-name audit trails. Worth a real side-by-side comparison before building a second pull against this reportKey; it may be a straight replacement/superset rather than a new source, unlike the other 3.

**New mechanical finding, from TWO live dispatches (the first fix attempt was a wrong guess, corrected by the second run's more detailed error body):** the Lakehouse report `url` (the pre-signed download link `AsyncReports` returns once a report's `status` resolves) returns HTTP 412 for a download request that's missing the same `X-Version` header every other LifeLenz call sends — the real response body, `{"error":{"code":"API_VERSION","detail":"malformed API version: \"\""}}`, only showed up once `downloadReport()` started logging error bodies on failure. The first attempted fix (retry with zero headers on any failure) was a wrong hypothesis — it reproduced the identical 412 for the identical real reason, just louder. Second fix: send the full `lakehouseHeaders(token)` set (which includes `X-Version: 1.78.11`) on the download request, falling back to auth-only only as a second attempt. Confirmed across 28/28 stores both times, not a flake either time.

**Not yet confirmed**: whether `GetReportDataTreeAsync`/`GetReportDataCsvAsync` accept a MULTI-location filter (`operator:"in"` with several schedule GUIDs) to fetch all 27+ stores in one call instead of one trigger per store. The live dispatch triggered all 28 stores individually (28 separate `GetReportDataCsvAsync` calls) and that worked fine/fast (all resolved within 2 poll rounds), so there's no pressing need to find out — noting it only as a possible future efficiency improvement, not a gap.
