---
name: finding-hme-squadle-integration-2026-11-06
description: "Live-tested findings for two new automated data sources the owner is standing up: HME Cloud (drive-thru timer/DT timing data, all locations) and Squadle (food-safety checklist tablet). Real endpoints and auth mechanisms confirmed by direct testing. UPDATED 2026-11-09: HME's login is now fully solved (direct two-step REST POST, no Playwright needed) but its REST reporting endpoint cannot do real historical date ranges -- that only exists via a Power BI embed, confirmed fragile/not recommended. Squadle's full real-time wire protocol is now captured end-to-end (auth -> squad -> location -> per-day/per-location checklist record) over standard wss/443 -- the earlier-flagged cws.squadle.com:700 relay is blocked in THIS sandbox (non-standard port) but is not the only path to the data; the one remaining unknown is which RTDB shard hosts a given location's records. ✅ UPDATED 2026-11-12 (task #105) -- BOTH integrations now fully built and live-validated end-to-end with the owner's real credentials: scripts/hme-cloud-pull.mjs and scripts/squadle-pull.mjs, Supabase schema (pending the owner's DDL run), GitHub Actions workflows, sync-failure-watch registration. Squadle's remaining unknowns (realtime-permission-session step, exact email-key encoding, shard resolution) are all now resolved -- see the new section below."
metadata:
  node_type: memory
  type: finding
scope: tenant
sensitivity: open
---

# HME Cloud + Squadle integration research (2026-11-06)

## What prompted this

Owner: *"I finally remembered to get this setup. HME Cloud for the DT Timer and timing data - all
locations... And, Squadle - The Food Safety Tablet used in stores for food safety checklists."*
Same session as the Launch Planner build. The owner sent live DevTools network captures (curl
commands) for both systems over the course of the session; each was tested directly against the
real API rather than assumed from the capture alone, per this repo's "measure it, don't reason
about it" standing rule. **Nothing is built yet** — this is the research/scoping pass, written up
because the owner expects to be away until at least tomorrow and didn't want this lost.

**Credential hygiene note:** every token/password the owner pasted during this research (an HME
bearer JWT, the owner's own HME/Squadle login password, Firebase idToken/refreshToken) was used
live, in-memory, to test the real endpoints — none were written to a file, committed, or echoed
back in chat. The two scratch response files written during testing were deleted immediately
after inspection. Building the real pull scripts will need new GitHub Secrets (names proposed
below); that's the owner's own action, same as every other credential in this repo.

## 1. HME Cloud (DT timer / drive-thru timing data)

**Base URL:** `portal-service.hmecloud.com`. **Auth today:** a Bearer JWT captured from the
browser session, 1-hour TTL (`iat`/`exp` exactly 3600s apart). **Not yet solved:** how to MINT
that token programmatically — every capture this session used a token already issued by the
browser's own login flow. Unlike Squadle (§2), we have not captured HME's actual login request.
This is the single open item that blocks real automation here, independent of the report-endpoint
work below.

### Endpoints confirmed live (tested directly, real responses, not inferred from the capture)

| Endpoint | What it returns |
|---|---|
| `GET /api/store/getAllStores?uuid=...&timerDevicesAndNonNitroEssentialsOnly=true&includeDaypartIDs=false` | Store + timer-device directory: `Store_Number`, `Store_Name`, address fields, `Device_Details[]` (`Device_UID`, `Device_SerialNumber`, `Device_MainVersion`, etc.). Store numbers match Meridian's own `STORE_NAMES` exactly. |
| `GET /api/dashboard/getDashboardData?isAdmin=0&reportType=&eventType=2000&hidePreconfiguredDevices=1&sortBy=undefined&sortType=undefined&period=undefined` | Store-level DT rollup for the CURRENT period only (no date param was ever actually populated in any capture — every one had `period=undefined` verbatim): `storeNumber`, `storeName`, `GoalA`-`GoalD` (speed-tier thresholds in seconds), `cars`, `avg` (seconds), `percent` (goal-achievement %). |
| `GET /api/dashboard/downloadReport?download=xls&isAdmin=0&reportType=day&eventType=2000&sortBy=undefined&sortType=ASC&period=undefined&hidePreconfiguredDevices=1` | Returns `{"xlsBuffer":{"type":"Buffer","data":[...]}}` — a real `.xlsx` (confirmed by decoding the byte array and opening it with `openpyxl`). Content: **CURRENT DAY vs. PREVIOUS FULL DAY** comparison per store (`RANK`, `NUMBER`, `GOAL`, then `CARS`/`AVG`/`GOAL%` for each of today and yesterday). Only ever a 2-day comparison with `period=undefined` — not a real date range. |
| `GET /api/group/export?filterOutNitroEssentialsStores=true&filterOutCancelledStores=true&timestamp=...` | Store/manager-group hierarchy: `account` (manager email), `parentgroup`, `groupname`, `storename`, `storenumber`. Returned 25 stores (missing 44689 — not yet open — and 18213 — closing; also confirmed missing from the owner's own separately-downloaded CSV/JSON export of the same data). **Real anomaly found**: store `35242` has a **null store name** in HME's own records (number present, name blank) — worth knowing if any future automation keys on name rather than number. |
| Three captures that turned out to be dead ends | `res.cdn.office.net/.../validDomains.json`, `pbivisuals.powerbi.com/approvedResources.json` — generic unauthenticated Power BI/Teams embed-SDK plumbing, not HME data. A fourth capture (`wabi-west-us.../querydata` with a Power BI `EmbedToken`) IS real data, but it's the embedded "Trends Dashboard" report's own internal query engine — fragile (query shape is auto-generated per-visual, token is even shorter-lived than HME's own), not a stable integration target. Recommend skipping this path entirely. |

### What the official user guide confirmed (PDF: "Navigating and Generating Reports in the HME
Cloud Reporting System", HME Electronics, 2025 rev. C — uploaded by the owner, read in full)

- **Real historical backfill exists in the UI.** Multi Store Report, Single Store Report, Trends
  Dashboard, and Trends Report (Single/Multi Day) all have a genuine **"Custom Dates"** option —
  the guide's own example shows real data spanning 4/1/2022–4/20/2023. This is NOT the same as the
  `period=undefined` default behavior measured above; a real date range has never actually been
  captured yet, only the UI's capability to select one.
- **Real hour-level granularity exists.** Trends Report's "Time Measure" option supports
  **Daypart, Shift, or Hour** — the guide's own screenshot shows a Multi Day report broken into
  named dayparts (e.g. "Daypart 1 6:00AM-10:29AM") with per-daypart `Total Cars`/`Menu Board`/
  `Greet`/`Cashier`/`Lane Total` columns.
- **A native Scheduled Reports feature exists** (Reports → Scheduler → Create New Schedule):
  report type (Summary-Single Store / Summary-Multi Store / Trends), **Time Measure: None,
  Daypart, Shift, or Hour**, Recurrence (Daily/Weekly/Monthly with day-of-week/day-of-month
  control), store-hierarchy + daypart filters, output format **XLSX, CSV, or PDF**, emailed to one
  or more recipients. Structurally identical to this repo's existing QSRSoft email pipeline
  (Apps Script → Edge Function).

### Recommendation

Per this repo's own standing "API over email" rule (an API you can re-query and backfill beats an
emailed report that only ever covers forward time), **the REST endpoints should be the primary
pull mechanism, not the native email schedule** — but only once a real Custom-Dates + Hour
capture proves the query-parameter shape. The Scheduled Reports' native email feature is a good
*documented fallback* (same role the emailed QSRSoft reports play), not the primary path.

### Still needed before building `scripts/hme-cloud-pull.mjs`

1. **One more browser capture**: open Multi Store Report or Trends Report, pick a real **Custom
   Dates** range in the past, set **Time Measure: Hour**, and capture the resulting network
   request. This single capture would confirm both the real date-range parameter shape (unlocks
   backfill) and that hour-level data is reachable via direct API call (not just the email
   schedule).
2. ✅ **RESOLVED 2026-11-09 — the login/token-mint request is now fully captured end-to-end,
   live, via an in-sandbox Playwright run against the real HME Cloud login (`fletcher@mcdok.com`).**
   It's a clean **two-step REST login**, no Playwright needed for production use:
   - **Step 1:** `POST https://auth.hmecloud.com/api/auth-service`, body `{username, ip,
     portalBaseUrl, isAdmin, isPartner}` (no password) → `202`, body `{"location":null}`. This
     looks like a user-exists/SSO-redirect-check step; `location` would presumably carry an SSO
     redirect URL for an SSO-configured account, `null` here since this account uses a direct
     password.
   - **Step 2:** same URL, body `{username, password, ip, portalBaseUrl, isAdmin, isPartner}` →
     `200`, body `{tokenType:"Bearer", expiresIn:"24h", accessToken, refreshToken,
     hmeportal_server_version, userId, familyName, givenName}`. **A refresh token comes back too**
     — field name only, confirmed present, never captured to disk — so a pull script can likely
     mint fresh access tokens the same low-maintenance way Squadle's does, though the actual
     refresh endpoint/shape itself was not captured this pass (not needed yet: `expiresIn` is
     **24h**, not the 1h this doc originally inferred from one JWT's own `iat`/`exp` — plenty of
     room for a pull that runs once or twice a day without ever needing the refresh token at all).
   - The owner's real password was used live, in-memory, for this one login call and never written
     to any file, commit, or this doc — only these field names, which is also true of every other
     scratch script and capture file this pass produced (all deleted immediately after use, same
     discipline as 2026-11-06).
   - `accessToken` is a Bearer token used exactly as-is on every `portal-service.hmecloud.com` call
     already documented above (`Authorization: Bearer <accessToken>`), confirmed live.

### ⚠️ New finding 2026-11-09 — the Custom-Dates + Hour capture happened, and the answer is NO: the REST dashboard endpoint cannot do it. Real historical ranges only exist via Power BI.

Tested directly (not guessed): `GET .../downloadReport?...&period=custom&startDate=2026-10-01&
endDate=2026-10-07&hidePreconfiguredDevices=1` (and the `reportType=hour` variant) both return
`200` with a real xlsx buffer — but decoding both (via `openpyxl`, cross-checked cell-by-cell)
shows the content is **still only ever "CURRENT DAY vs. PREVIOUS FULL DAY"** (or CURRENT/PREVIOUS
HOUR), **identical in shape to the `period=undefined` baseline already documented above**. The
`startDate`/`endDate`/`period=custom` query params are silently accepted (no error) and then
**ignored server-side** — this is not a parameter-naming guess that needs refinement, it's a
measured dead end for this specific endpoint.

**Where Custom Dates + Hour actually DOES work:** the live UI. Logging in and clicking
Reports → **"Multi Store Report"**, **"Trends Report"**, etc. (the `/new-reports/*` routes) loads
an **embedded Power BI report** (`app.powerbi.com/reportEmbed?reportId=...`) for every one of
them — confirmed by inspecting the page's actual iframes, not assumed. This matches this doc's own
2026-11-06 recommendation to treat the Power BI embed path as fragile/skip-worthy (auto-generated
per-visual query shape, short-lived embed token) — now confirmed to be the ONLY place real
historical/hour-level HME reporting lives, not an alternate path alongside a working REST one.

**Revised recommendation:** Phase 1's HME pull should target what the REST API actually,
reliably gives — the **current-day store rollup** (`getDashboardData`/`downloadReport` as already
documented: store rank, car count, avg seconds, goal% for today vs. yesterday) — using the new
two-step REST login above, no Playwright, run on a schedule (e.g. hourly or a few times a day,
matching this repo's existing intraday-pull cadence for Operations Report/DAR). **Historical
backfill and hour-level granularity are NOT reachable via REST today.** Getting them would need
either (a) reversing the Power BI embed's own query calls (fragile, short-lived token, explicitly
not recommended by the 2026-11-06 pass and reconfirmed here), or (b) asking HME/the vendor for a
real reporting API or the Scheduled Reports' native email export (already documented above as a
"good *documented fallback*") as a forward-only substitute for backfill. Not a blocker for
shipping Phase 1 — HME's day-level dashboard is genuinely solid and buildable right now.

## 2. Squadle (food-safety checklist tablet)

**Frontend:** `hq.squadle.com`, an Angular SPA ("Squadle HQ"). **Auth: Firebase Authentication**
(Google Identity Toolkit, project id `firebase-squadle`) — genuinely the cleanest auth story of
any data source in this repo, confirmed by direct testing:

| Step | Endpoint | Confirmed live |
|---|---|---|
| Login | `POST https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword?key=<API_KEY>`, body `{email, password, returnSecureToken:true}` | Returns `idToken`, `refreshToken`, `expiresIn` (3600s), `localId`. Tested with the owner's real credentials — HTTP 200, all fields present. |
| Profile check | `POST https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo?key=<API_KEY>`, body `{idToken}` | Returns the real account profile (email, `displayName`, `lastLoginAt`, etc. — `passwordHash` is present as a field name only, a one-way hash, never the plaintext). Confirms the token is valid and tied to the right account. Not needed for data pulls, just a sanity check. |
| **Refresh (the important one)** | `POST https://securetoken.googleapis.com/v1/token?key=<API_KEY>`, form-urlencoded `grant_type=refresh_token&refresh_token=...` | Returns a fresh `access_token`/`id_token`, a (possibly new) `refresh_token`, `expires_in` (3600), `token_type: Bearer`. **Tested live and confirmed working** — standard, documented Firebase Secure Token API behavior, not an internal trick. |

**Why this beats LifeLenz/QSRSoft's auth situation:** store the **refresh token** (never the
password) as a GitHub Secret, and a pull script can mint a fresh 1-hour ID token on every run
indefinitely — **no Playwright fallback needed at all**, unlike every other automated pull in this
repo.

**One real open question, not yet tested:** the refresh response includes a *new* `refresh_token`
each time, which is how Firebase projects with refresh-token rotation enabled behave (the old
token gets invalidated once a new one is issued). **Before building the pull script, confirm
empirically** whether Squadle's project has rotation on — i.e., does the original refresh token
still work after it's already been exchanged once? If rotation is on, the script must write the
newest `refresh_token` back to the GitHub Secret after every run (a small but real design
difference from a static secret), never assume the stored one stays valid forever.

**Updated 2026-11-08 — a SECOND login path confirmed, which changes the login-step recommendation
above.** A fresh browser capture of the real `hq.squadle.com` login shows the front-end is not
actually calling `verifyPassword` directly — it's calling:

| Step | Endpoint | What it confirms |
|---|---|---|
| Custom-token exchange | `POST https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyCustomToken?key=<API_KEY>`, body `{token, returnSecureToken:true}` | The `token` is a short-lived (3600s `iat`/`exp`) JWT **signed server-side by Squadle's own Firebase Admin SDK service account** (`firebase-adminsdk-opv3i@firebase-squadle.iam.gserviceaccount.com`, visible in the JWT's own `iss`/`sub` claims — field names only, not the signature). This confirms Squadle's backend mints a custom Firebase token after its own (not-yet-captured) login step, rather than the client talking to Firebase's `verifyPassword` directly. Exchanging it returns the same `idToken`/`refreshToken` shape as the `verifyPassword` path above. |
| Account check | `POST .../getAccountInfo?key=<API_KEY>`, body `{idToken}` | Same confirmation role as the `verifyPassword` path — re-observed, not new. |
| Refresh | `POST https://securetoken.googleapis.com/v1/token?key=<API_KEY>`, form body `grant_type=refresh_token&refresh_token=...` | Same endpoint/shape as above — re-confirmed on a second real session. |

**Practical effect: once a refresh token is captured (from either path), the mint-step question is
moot for the automation itself** — the pull script never needs to replay a login at all, it only
ever calls the refresh endpoint. Where this matters is a **one-time bootstrap**: if `verifyPassword`
ever stops working (e.g. Squadle disables direct password auth in favor of SSO/custom-token-only),
the *initial* refresh token would need to come from capturing this custom-token exchange instead —
which itself still depends on whatever (uncaptured) Squadle backend call mints that custom token in
the first place. Not a blocker today since a `verifyPassword`-sourced refresh token is already
confirmed working; worth knowing if that path ever goes away.

The Firebase Web API key seen in all these captures (`AIzaSyC3Gu3Ls2l5fIH3eLn5F3HtbZf41YEPr4M`) is
a public per-project client identifier, not a secret — safe to record and to hardcode in the pull
script exactly as Squadle's own front-end does; it is the refresh token, not this key, that is the
credential to protect.

### Data confirmed (via the owner's own manual exports, not yet via a captured API call)

The download buttons next to each dashboard table are **client-side only** — the page loads
`datatables.net-buttons` (confirmed in the page source: `buttons.dataTables.css`/
`buttons.bootstrap.css`), so clicking "export" just serializes the already-rendered DOM table to a
file. No network request fires on click, which is why an attempted capture there found nothing.
The owner instead exported two reports directly; both were opened and inspected:

- **Monthly Food Safety Procedure Verification** — columns: `Task Completion %`,
  `Action Completion %`, `Location` (e.g. `"03708 [RTS]"`), `CorrectiveActions`, `Month`,
  `Days Until Due`.
- **PACE** — same columns plus `Todo` (which checklist, e.g. `"PACE: Food Safety"`,
  `"PACE: Health & Safety"`).

Both are **monthly store-level compliance-% rollups**, not item-level checklist detail — the same
shape as this repo's existing QSRSoft Forms Completion feature (`forms-completion-rollup.test.js`
et al.), just a different vendor and checklist program.

### Still needed before building `scripts/squadle-pull.mjs`

2. **Confirm refresh-token rotation behavior** (above).

### ✅ Updated 2026-11-09 — the real-time wire protocol is now fully captured end-to-end, live, from a real login through to a real per-store checklist record. This resolves options (a)/(b)/(c) above into a concrete, buildable plan — with one real unknown still open.

**Login: `verifyPassword` still works directly** (re-tested live, HTTP 200, real `idToken`)
— the 2026-11-08 update's "second login path" (`verifyCustomToken`) is a real, alternate thing
the web client does, but it does **not** mean `verifyPassword` stopped working; both are live.
No change needed to the login recommendation above.

**The actual data-loading protocol, captured via an in-sandbox Playwright run with full
WebSocket frame logging against the real `hq.squadle.com` dashboard (owner's own account,
live):**

1. On login, the client opens **~20 parallel WebSocket connections**, one per Firebase RTDB
   project the app might ever need (`wss://<shard-host>.firebaseio.com/.ws?v=5&ns=<namespace>`,
   e.g. `ns=squadle`, `ns=squadle2`, `ns=sqdl-prod-cd-001` through `sqdl-prod-cd-023`) — this
   matches the "multiple shards, no single predictable databaseURL" complexity the 2026-11-08
   update already flagged, now confirmed as a real **fixed list of ~20+ known projects**, not an
   unbounded or per-session-random set.
2. Each socket: server sends a handshake (`{"t":"c","d":{"t":"h","d":{...}}}`), client replies
   with a stats ping (`{"t":"d","d":{"r":1,"a":"s","b":{"c":{"sdk.js.5-10-1":1}}}}`), then an
   **auth** frame using the SAME idToken on every socket: `{"t":"d","d":{"r":2,"a":"auth",
   "b":{"cred":"<idToken>"}}}` — confirmed `{"s":"ok", "d":{"auth": {...}}}` on the primary
   `squadle` project via a direct, non-browser raw-WebSocket re-test (not just observed in the
   browser capture).
3. **Reads are a `"q"` (query/listen) action**, not a raw Firebase REST GET:
   `{"t":"d","d":{"r":N,"a":"q","b":{"p":"<path>","h":""}}}` → response
   `{"t":"d","d":{"b":{"p":"<path-without-leading-slash>","d":<value>},"a":"d"}}`.
4. **The real path hierarchy, walked and confirmed live, end to end:**
   - `/channels/email/<url-encoded-email>` → a user id (e.g. `-P5m_zSDuPJHXVGrcz4y`), on the
     primary **`squadle`** project (host observed as `s-gke-usc1-nssi3-45.firebaseio.com` this
     run — Firebase's own redirect-to-assigned-host behavior, the hostname can vary by run).
   - `/users/<userId>` → profile incl. `squads: {<squadId>: <squadId>}` (the owner's account
     has exactly one squad, `-M8rk3muuQsnkOLhK0Fz`, named `"McDOK | Gary Mornhinweg, Ryan
     Thorley"` in the real data).
   - `/squads/<squadId>` (full object, also on the primary `squadle` project) → `locations: {...}`
     (21 location ids for this tenant), `shifts: {...}` (hundreds of shift-template ids), `brands`,
     `dispatches`, `meta`. **No shard/database field found anywhere in this object** — see the one
     open question below.
   - `/locations/<locationId>/brand` → `"McDonald's"` — the **full** `/locations/<locationId>`
     object itself came back `permission_denied` on a direct re-test (narrower, named sub-paths
     are readable; the whole object is rules-blocked) — this is why the real app only ever
     queries specific known sub-paths like `/brand`, never the bare `/locations/<id>`.
   - **`/records/<YYYY-MM-DD>/<locationId>`** → the real prize: a full, item-level checklist
     record for that store and day — `shifts` (keyed by shift, e.g. `"Start-Up"`), each shift's
     `tasks`/`actions` with real field names (`attributes`, `description`, temperature/bluetooth
     readings), `tags` (one of which is the literal store number, e.g. `{"0":{"text":"rfp-2"},
     "1":{"text":"6972"}}` — **a direct, confirmed way to map a Squadle `locationId` back to a
     Meridian store number** without needing a separate lookup table), `createdOn` timestamp. This
     is genuinely the item-level checklist detail the 2026-11-08 update said existed on the
     Socket.IO relay — it turns out the **same data is also reachable directly over RTDB**, no
     relay needed at all.
5. **`cws.squadle.com:700` (the Socket.IO relay) is NOT needed to get this data** — direct RTDB
   access via `"q"` on the paths above is sufficient and was the actual source of every record
   captured this pass. The relay may still carry live push updates for the open dashboard tab, but
   a once/twice-daily pull script has no need for live pushes, only a point-in-time read.

**Environment note, not a protocol finding:** `wss://cws.squadle.com:700/...` returned
`net::ERR_CONNECTION_RESET` in **this sandbox** on every attempt — almost certainly this sandbox's
own egress proxy blocking a non-standard port (700), not a Squadle-side block. Does not matter for
the plan above since the relay turned out to be unnecessary, but worth knowing before assuming a
future sandbox run "confirms" the relay is unreachable from anywhere — re-test port 700
specifically if that path is ever revisited. The standard `wss://*.firebaseio.com` connections
(port 443) were never blocked.

**The one real open question: which of the ~20 RTDB projects hosts a given squad's `/records`
data.** The squad and location objects queried above carry no explicit shard/database field. In
this pass's own capture, 19 of this tenant's 21 locations' records loaded from one project
(`sqdl-prod-cd-012`) and 2 loaded from a different one (`sqdl-prod-cd-023`) — so it is
per-location, or at least not uniformly per-squad, and the real client clearly knows this
up front (it queried each location's `/records` path on exactly one project, never broadcast to
all ~20). A second attempt at reading the **full** `/locations/<id>` object (not just `/brand`)
to check for a hidden routing field was blocked by Firebase rules (`permission_denied`, see
above) before an answer came back. **Three ways to close this, cheapest first:**
  - **(a) Read the compiled bundle.** `hq.squadle.com`'s own JS almost certainly contains either a
    static squad-id/location-id → project-name lookup table or a deterministic hash function — this
    is public, GET-able, non-interactive, and was the original 2026-11-06 recommendation (b); not
    yet done this pass.
  - **(b) Brute-force-but-safe fallback for the pull script itself:** for each location, on first
    run, issue the same `/records/<date>/<id>` query against every one of the ~20 known projects in
    parallel; exactly one will return real data (the rest return `null`, not an error — confirmed
    behavior pattern, a `null` body is indistinguishable from "no records today" though, so run this
    resolution on a date known to have data, then cache the winning project per location). Costs one
    one-time fan-out per location, not per pull.
  - **(c) Ask Squadle vendor support** directly which project a given customer's data lives on, or
    whether a documented reporting API exists at all (still the simplest, still not tried).

**Phasing update:** Squadle's Phase 1 is now genuinely buildable without any further research —
login (REST, live-confirmed), auth (per-socket), and the real `/records/<date>/<locationId>` path
shape are all known. Only the shard-resolution question above stands between "known" and "a
working `scripts/squadle-pull.mjs`," and option (b) above is enough to ship Phase 1 without
needing (a) or (c) first.

### ⚠️ Updated 2026-11-08 — item 1 above was WRONG. There is no REST endpoint. This is the
single biggest correction in this whole doc and changes Squadle's difficulty ranking.

A real, in-sandbox Playwright login + dashboard load (owner's own account, live) captured EVERY
network event including WebSocket frames — the capture this doc was missing. Result: **the
checklist/record data never travels over a conventional request/response XHR at all.** Two
real-time channels carry it instead:

1. **Direct Firebase Realtime Database connections** — `wss://s-gke-usc1-nssi2-{12,21,35,51,56}
   .firebaseio.com/.ws?v=5&ns=sqdl-prod-cd-0NN`, one socket per shard, each with its OWN logical
   database (`ns=` differs per socket: observed `sqdl-prod-cd-013/017/019/021/022` on one single
   login). Each authenticates with the exact custom-token-derived `idToken` from
   `createRealtimePermissionSession` (§ above) via the RTDB wire protocol's own `{"t":"d","d":
   {"r":N,"a":"auth","b":{"cred":"<idToken>"}}}` frame — confirmed `{"s":"ok"}` on all 5 sockets.
   **Multiple shards opening per login, each its own namespace, is the real complexity**: there
   is no single predictable `databaseURL` the way every other integration in this doc has one.
2. **A second, Squadle-operated relay** — `wss://cws.squadle.com:700/socket.io/?EIO=4&transport
   =websocket` (Engine.IO v4/Socket.IO, NOT raw Firebase) — this is the one actually observed
   carrying real payloads during the captured session: nested JSON under a `records/<date>/
   <locationPushId>` shape (e.g. `records/2026-11-08/-MIMSCVFsi4_eyehTX-M`), each record holding
   the full checklist run — shift name, every task's every action (temperature readings, run
   sizes, select-box answers, pass/fail formulas), `signatureImageUrl`s pointing at
   `firebasestorage.googleapis.com`, timestamps. This is item-level, not the monthly rollup %
   the owner's manual exports showed — genuinely richer data than this doc assumed existed.

**A quick REST probe (`GET https://<shard>.firebaseio.com/records/<date>/<id>.json?auth=
<idToken>`, the standard Firebase RTDB REST fallback) returned a real rules-level `{"error":
"Permission denied"}`, not an auth error** — inconclusive by itself (could be the wrong shard/
path guess as easily as a real rules block), so **this is not proof REST is closed**, only proof
it isn't a simple swap-in-the-idToken-and-GET job the way QSRSoft/LifeLenz/HME are.

**What this means for Phase 1, concretely:** Squadle's AUTH story is still the cleanest in this
repo (unchanged, still true) — but its DATA LAYER is now the hardest of the three, not the
easiest. Building `scripts/squadle-pull.mjs` needs one of:
  - **(a)** Speak the actual `cws.squadle.com` Socket.IO protocol (subscribe/room-join framing,
    not yet captured) in Node via the `socket.io-client` package — most direct path since that's
    where the real payloads were observed flowing.
  - **(b)** Reverse the RTDB shard-selection logic (which shard a given store ID resolves to) by
    reading Squadle's own compiled bundle (`hq.squadle.com/assets/HQ.*.js`) rather than guessing,
    then use the real `firebase` Node SDK (not raw REST) with the custom-token credential.
  - **(c)** Simplest first step, not yet tried: ask the owner whether Squadle's own vendor support
    offers a documented reporting API or scheduled export (same "ask the vendor" shortcut that
    would have saved real effort on other integrations in this repo) before reverse-engineering
    either real-time channel further.
No credential value (idToken/refreshToken/password) was written anywhere during this capture —
only endpoint shapes, namespaces, and one illustrative record path/date, per this doc's own
credential-hygiene note above.

1. ~~The real data-loading network request~~ — captured above; turned out to need (a)/(b)/(c)
   above instead of a simple REST follow-up.

## 3. Phasing, once both captures are in hand

- **Phase 0 (owner, whenever convenient):** the two captures above, plus the rotation check.
- **Phase 1:** build `scripts/hme-cloud-pull.mjs` and `scripts/squadle-pull.mjs` following this
  repo's existing pull-script conventions exactly — two-path auth where applicable, new Supabase
  tables with `tenant_id` + RLS, a GitHub Actions workflow per source, registration in
  `.github/workflows/sync-failure-watch.yml`, a `stream-freshness.js` entry, and a kept manual
  upload path (per the standing "automate everything eventually, always keep manual fallback"
  rule) until each is proven reliable.
- **Phase 2:** surface the data — HME's DT timing likely extends the existing Speed of Service
  panel (`dt-speedofservice.js`) rather than duplicating it; Squadle's compliance rollup likely
  extends or parallels the existing Forms Completion feature. Neither UI decision is made yet —
  worth a quick look at both existing panels before building either one.
- **Phase 3 (only if HME's Custom-Dates capture confirms real backfill range):** backfill
  historical DT timing and food-safety compliance data, same "data depth is never the limiter"
  standing rule this repo already applies to every other source.

Nothing in this doc is built. This is the research this session did, written up so it survives the
owner's own expected break until tomorrow.

## ✅ Task #105 built and live-validated end-to-end (2026-11-12)

Owner provided real credentials (same username/password for both systems) specifically to
unblock this. Both `scripts/hme-cloud-pull.mjs` and `scripts/squadle-pull.mjs` are built,
Supabase schema SQL written (`supabase/schema-hme-cloud-dt.sql` / `schema-squadle-checklist-
records.sql` -- **pending the owner's own DDL run**, per this repo's standing "DDL is never
applied unattended" rule), GitHub Actions workflows added, both registered in
`sync-failure-watch.yml`. `stream-freshness.js` STREAMS entries deliberately deferred as
commented-out placeholders (same precedent as payrollReadiness/payHistory) -- Phase 1 here is
get-the-data-flowing, a real `ds` loader is a separate Phase 2.

Every credential used was kept in-memory only (shell env vars within a single command, never
written to a file) and every scratch script/response file created during live testing was
deleted immediately after use, same discipline as the original 2026-11-06/11-09 research passes.

### HME: fully solved, nothing left open

The two-step REST login (§1 above) works exactly as documented with real values: step 1 body
`{username, ip:'', portalBaseUrl:'https://portal.hmecloud.com', isAdmin:false, isPartner:false}`
→ `202 {"location":null}`; step 2 adds `password` → `200` with a real `accessToken`
(`expiresIn:"24h"`). `getAllStores` and `getDashboardData` both confirmed live with real data
(24 stores, e.g. `storeNumber:"6838"` → Meridian's own `0006838` Defuniak, `storeNumber:"5183"`
→ Chickasha-2 -- both match `STORE_NAMES` exactly). No further research needed here.

### Squadle: the full chain, including the trap that cost the most time

Live-tested the complete path with the real account (`fletcher@mcdok.com`):

1. **Login** (`verifyPassword`) → real `idToken`/`refreshToken`. **Refresh-token rotation
   confirmed OFF** (the 2026-11-06 doc's "one real open question") -- the SAME refresh token
   was exchanged twice in a row and worked both times, no new token forced. Not that it matters
   for the shipped design: the pull script re-logs-in with username/password every run, same
   simplicity as the HME script, rather than managing a stored refresh token.
2. **`/channels/email/<key>` -- the exact key transform, confirmed from hq.squadle.com's own
   compiled JS bundle** (`HQ.*.js`, fetched and grepped live): `encodeURIComponent(email)
   .replace(/\./g, '%2E')`. The critical, easy-to-get-wrong detail: `%2E` is sent as the LITERAL
   3-character string inside the RTDB wire-protocol JSON frame, never re-decoded — because this
   travels inside a JSON payload over a WebSocket, not as an HTTP path, there is no URL-decoding
   layer to strip it back to `.`. An earlier guess (`.replace(/\./g, ',')`, matching a different
   pattern seen elsewhere in the bundle) returned `200` with `null` -- a silent, misleading
   "it worked but found nothing" rather than an error, which is why this took real digging
   rather than a one-shot guess. The correct key resolved the real userId
   (`-P5m_zSDuPJHXVGrcz4y`), confirming the earlier 2026-11-08 capture exactly.
3. **The shards (`sqdl-prod-cd-NNN`) reject the plain login idToken outright** (`permission_
   denied` on all 23) **-- a SEPARATE session-creation step is required**, also found by
   reading the compiled bundle (the `realtimePermissions` Angular factory's `requestSession`
   method): `POST https://sl.squadle.com/createRealtimePermissionSession`, body
   `{clientType:'hq'}`, headers `Authorization: Bearer <loginIdToken>`, `X-Squadle-User-Id:
   <userId>` → `200 {token, sessionId, expiresAt}`. That `token` is the short-lived custom
   Firebase JWT the 2026-11-08 update already found (signed by Squadle's own Admin SDK service
   account) -- exchanging it via `verifyCustomToken` yields a SECOND idToken that IS valid on
   the shards. The plain login idToken remains valid on the PRIMARY `squadle` project the whole
   time (channels/users/squads reads never needed the exchange).
4. **Shard resolution confirmed live**: brute-forcing all 23 shards in parallel for a real
   location (`/records/<date>/-M8rkFa0NUGRQPamf4CH`) using the exchanged idToken -- 22 return
   `permission_denied` immediately, exactly one (`sqdl-prod-cd-012`) grants access and returns
   the real record. Confirms option (b) from the original doc works as designed.
5. **⚠️ THE BIG ONE -- large RTDB responses are fragmented across multiple WebSocket frames,
   and the naive "JSON.parse every frame" approach every scratch test in this session's own
   research used (including the ones that produced this doc's earlier "confirmed live" claims
   about reading `/records/...` directly) silently swallows the real data.** Firebase's own JS
   SDK (`websocket_connection.js`'s frame-reassembly logic) sends a lone decimal-digits string
   as its own frame first (e.g. `"25"`) announcing how many further physical frames the
   logical message spans; those N frames must be concatenated (plain string concat, not array
   join) before the result is valid JSON. Every wrong-shard `permission_denied` response is
   small and never fragments, which is exactly why those "worked" in every prior test while the
   one genuinely large real-record response appeared to simply hang/time out -- it was never a
   network, concurrency, or sandbox-proxy issue (all seriously considered and ruled out live
   before this was found: tested smaller connection-concurrency batches, longer per-connection
   timeouts, and a fresh unpolluted session -- none of it was the real cause). `rtdbQuery()` in
   `scripts/squadle-pull.mjs` implements the fix (tracks `pendingFrames`/`frameBuffer`); its own
   header comment has the full account so this is never rediscovered. Live-validated after the
   fix: all 21 real locations × 2 dates (yesterday + today) resolve their shard and parse a real
   record successfully (confirmed by the pull script's own per-location log lines before the
   expected "table doesn't exist yet" Supabase error, since the schema SQL is still pending the
   owner's DDL run).
6. **Store-number mapping confirmed robust**: every real record's own `tags` map includes the
   literal store number as one entry in no guaranteed position/index (e.g.
   `{"0":{"text":"rfp-2"},"1":{"text":"6972"}}`) -- the pull script scans every tag's text for a
   4-7-digit run rather than assuming a fixed key, so no separate Squadle-location → Meridian-
   store lookup table is needed.

### Next steps for the owner

1. ✅ Run `supabase/schema-hme-cloud-dt.sql` and `schema-squadle-checklist-records.sql` -- DONE,
   confirmed live (see below).
2. ✅ Add GitHub Secrets: `HME_USERNAME`, `HME_PASSWORD`, `SQUADLE_USERNAME`, `SQUADLE_PASSWORD`
   -- DONE (owner, 2026-11-12 night).
3. ✅ **First real write CONFIRMED live (2026-11-13), both pulls manually dispatched and
   measured directly via service-role query, not just a green workflow run:**
   - `hme_dt_daily`: `content-range: 0-2/24` -- 24 real rows, real content (e.g. loc `0043380`
     "Tishomingo - 2", 542 cars, 148s avg, store_rank 1).
   - `squadle_checklist_records`: `content-range: 0-2/42` -- 42 real rows, real content (e.g.
     loc `0006972`, shard `sqdl-prod-cd-012`, a real nested shift/task JSON blob).
   Both tables are genuinely live now -- do not re-raise "is this live yet" without a fresh
   measurement.

Phase 2 (surfacing the data in a real panel/engine, per the original §3 plan -- HME likely
extends `dt-speedofservice.js`, Squadle likely extends or parallels Forms Completion) is
deliberately not started -- still open, not blocked on anything now that both streams write.
