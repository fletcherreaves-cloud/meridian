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

1. **Auth** — reads `LIFELENZ_TOKEN` env var (GitHub Secret). Cloudflare blocks headless Playwright from GH Actions IPs on both `admin.lifelenz.com` and `idm.lifelenz.com`, so token bypass is the only working approach. Token is validated (rejects only 401/403, not 404).

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
- `X-Version: 1.75.21`

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
