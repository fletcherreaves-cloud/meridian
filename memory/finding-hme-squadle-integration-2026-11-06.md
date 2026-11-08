---
name: finding-hme-squadle-integration-2026-11-06
description: "Live-tested findings for two new automated data sources the owner is standing up: HME Cloud (drive-thru timer/DT timing data, all locations) and Squadle (food-safety checklist tablet). Real endpoints and auth mechanisms confirmed by direct testing. HME needs one more capture (Custom Dates + Hour report request) before its pull script can be built. Squadle's auth is fully solved but its DATA LAYER is not a REST endpoint -- real-time Firebase RTDB + a Squadle Socket.IO relay -- see the 2026-11-08 update for what that actually takes to automate."
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
2. **The login/token-mint request — partially captured 2026-11-08, response body still needed.**
   The owner captured the real browser login flow (`fletcher@mcdok.com` on the HME Cloud login
   page, DevTools Network tab): `POST https://auth.hmecloud.com/api/auth-service`, JSON body with
   fields `username`, `password`, `ip`, `portalBaseUrl`, `isAdmin`, `isPartner` — a clean REST
   login endpoint, same shape as Squadle's, not a Playwright-only form as feared above. Request
   returned HTTP 202. **The owner's real password was in that capture — it was never written to
   any file, commit, or this doc, only these field names.** **Not yet captured: the response body**
   (which field holds the resulting Bearer token — presumably reused as-is by every `portal-service
   .hmecloud.com` call documented above). One more capture (open the Network tab's response/preview
   pane on this same request, or repeat the login) closes this out and unblocks a real two-path
   auth script (`getFreshToken()`-style direct POST, no Playwright needed after all).

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
