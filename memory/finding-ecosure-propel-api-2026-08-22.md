---
name: finding-ecosure-propel-api-2026-08-22
description: A working EcoSure 3rd-party food safety API on propel.mcd.com — full per-question FS1..FS36 results, scores and cited reasons. Replaces Visit Readiness's waste-based "food safety" proxy with the real thing, and proves that proxy wrong on a live store.
metadata:
  node_type: memory
  type: finding
---

# EcoSure food-safety data has an API — `propel.mcd.com`

Owner-captured 2026-08-22. **No credentials are recorded in this file; see the security note.**

---

## The endpoint

```
GET https://propel.mcd.com/api/visits
      ?v=778
      &action=getThirdPartyFoodSafetyVisitReport
      &visitId=<id>
      &cultureName=en-US
```

Required headers observed: `hierarchy-level: 12`, `hierarchy-node: <node id>`,
`territory-code: 840`, `referer: https://propel.mcd.com/app/`.
**Auth is cookie-based** (a `connect.sid` session plus a `token` JWT), *not* a bearer header.

## The payload

Per-visit envelope: `restaurantName`, `restaurantNumber` (zero-padded, e.g. `03708`), `visitDate`,
`overallScorePercentage`, `pointsReceived` / `pointsPossible`, `completedBy` (`"Ecosure"`),
`visitMeetsTargetFlag`, `reviewedWithName`, `visitComments`.

Then a **`questions[]` array covering FS1-US … FS36**, each with:

| field | meaning |
|---|---|
| `questionCode` | `FS1-US`, `FS15-US`, `FS-A-US`, `FS-34 HST1`, … ⚠️ **some codes have trailing spaces** (`"FS-A-US "`, `"FS-B-US "`) — trim on ingest |
| `questionSection` | `CRITICAL FOOD SAFETY`, `TCS for Refrigerated Products`, `Hygiene & Sanitation`, `Contamination Prevention`, `Storage`, `Cooking`, `General` |
| `criticalFlag` | 1 = critical gate |
| `pointsReceived` / `pointsPossible` | **critical items score 0/0** — they are pass/fail gates, not points |
| `result` | **`0` = pass · `1` = cited/fail · `-1` = not applicable** (e.g. FS5/FS6 when breakfast is not served) |
| `reasons[]` | `reasonCode` + `reasonText`, e.g. *"blue gloves not removed properly"* |

**Scoring verified against the sample.** Ardmore-Broadway 2026-08-11: 86/100. Four cited items —
FS15 state-of-repair (3), FS18 raw-food handling (5), FS25 shelf lives (3), FS26 leftover heated
foods (3) = 14 lost. 100 − 14 = **86** ✓. The arithmetic is transparent and reproducible.

---

## 🔴 This proves the Visit Readiness "Food Safety" flag wrong on a live store

Visit Readiness currently shows **Ardmore-Broadway** as `At risk`, **`FS elevated`**, with the
headline coaching action *"Address food-safety risk first — waste/holding proxies are elevated
(score 50)."*

**Its actual EcoSure audit, 2026-08-11: 86/100, `visitMeetsTargetFlag: 1` — it met target.**

The waste proxy said elevated food-safety risk; the real third-party food-safety audit passed. That
is not a calibration gap, it is the flag measuring a different subject —
`memory/finding-food-safety-2026-what-is-actually-measured.md` shows why (waste and inventory
variance appear in none of FS1..FS36). **Item 1 of the Visit Readiness backlog is now settled with
a live counterexample, not just a documentary argument.**

## What this unlocks

- **A real food-safety signal**, per store, per visit, with per-question detail and cited reasons —
  replacing the proxy entirely rather than relabelling it.
- **Ground truth for the EcoSure half of PACE.** `project-graded-visits-pace.md` records EcoSure as
  "slots in when a sample lands." A sample has landed, with an API behind it.
- **Cited-reason analytics**: `reasons[]` is coded (`345286`, `345311`, …), so recurring failure
  modes are countable across stores.

## ⚠️ Before anyone builds a pull

1. **Enumeration is unsolved.** This endpoint needs a `visitId`. There must be a list/search
   endpoint; find it before designing anything. Also unknown: how `hierarchy-node` maps to stores.
2. **🔴 `propel.mcd.com` is SSO (owner, 2026-08-22)** — and the `rtFa` cookie indicates Microsoft
   federation (Entra/ADFS/SharePoint). **This is categorically harder than QSRSoft.** QSRSoft has a
   Cognito `USER_PASSWORD_AUTH` grant, so `getFreshToken()` can mint a credential from a stored
   username and password. **SSO has no equivalent** — there is no password grant to call, and if
   MFA is enforced (likely on corporate McDonald's identity) then *no* unattended flow can
   authenticate at all.

   ✅ **ANSWERED (owner, 2026-08-22): MFA IS enforced.** So **headless/unattended SSO
   authentication is impossible** — not difficult, impossible. Any design that assumes a
   credential can be minted from stored secrets is dead on arrival. Do not attempt one.

   **Two viable paths. Recommendation: START MANUAL.**

   - ✅ **Manual capture into the existing upload path — do this first.** Run the numbers:
     ~3 EcoSure visits/store/year × 27 stores ≈ **81/year ≈ 1.5 per week**. One capture a month
     picks up ~7 visits. Building a fragile Playwright + persistent-profile + Akamai path for 1.5
     visits a week is poor value, and it delays the actual win — replacing the waste proxy with
     real data.
   - **Persistent authenticated browser profile on the Mac mini** — the automation path *if*
     manual proves painful. Log in interactively once (human completes MFA); Playwright attaches
     via `launchPersistentContext` and reuses the session. The #65 runner is already the right
     host and already on a permitted network. Re-auth becomes a periodic manual step, structurally
     identical to the `LIFELENZ_TOKEN` refresh runbook.
     ⚠️ **And subject to the same warning CLAUDE.md already records about that runbook:** the
     LifeLenz Playwright fallback became unreliable, so an expiry is a *full outage, not a soft
     one*. Expect the same here, on top of Akamai.
   - ❌ **Headless SSO automation — ruled out.** MFA makes it impossible.

   📌 **On the "manual sourcing is always temporary" standing rule:** this is a *legitimate*
   exception of the same class as "LifeLenz Oklahoma begins Oct 2025" — a real external constraint,
   not deferred work. The intended auto source is named above (persistent-profile Playwright on the
   #65 runner), so the rule's requirement to name one is satisfied. Revisit if the capture burden
   grows or if Propel ever exposes a service account.

3. **Akamai bot protection** (`_abck`, `bm_sz`) sits on top of the SSO problem. A plain server-side
   fetch will likely be challenged. **Measure before designing** — this session has already
   produced two wrong confident conclusions about an auth mechanism by reasoning instead of
   testing.

   ✅ **Cadence makes this tractable.** EcoSure visits are infrequent — a handful per store per
   year, not daily. A weekly or even monthly pull suffices, so a semi-manual path that would be
   unacceptable for a daily stream is perfectly reasonable here. **Do not over-engineer this into a
   daily automated pull.**
4. **PII on ingest.** `reviewedWithName` is an employee name. It must go through
   `get_or_create_employee_token()` like every other person field — no plaintext name in the table,
   a log, a fixture, or a memory file.
5. **A new stream means the full checklist**: Supabase table with `tenant_id` + RLS,
   `sync-failure-watch.yml` registration, per-stream `STREAMS` freshness, manual fallback.

## 🔒 Security note

The capture was shared as a full cURL including a live `token` JWT (name, email, roles, hierarchy
nodes), an `rtFa` SharePoint federation token, `connect.sid`, and Akamai cookies. **None of it is
recorded here.** The JWT is short-lived (~12h), but the session should be treated as
disclosed-by-sharing and re-authenticated. For future captures, the URL, header *names*, and the
response body are sufficient — the cookie jar never needs to leave the browser.
