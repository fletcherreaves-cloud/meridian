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
