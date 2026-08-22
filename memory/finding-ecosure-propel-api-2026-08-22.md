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

1. **Enumeration — HALF SOLVED (owner, 2026-08-22).** The store half is done; the visit half is not.

   ### ✅ The store roster + the `hierarchy-node` mapping

   ```
   POST https://peak.mcd.com/API/Stores/Paged/     body: {"page": 0}
   ```
   Cookie-authenticated, `origin`/`referer` = `https://peak.mcd.com`. Paged — iterate `page` until
   empty (10 per page observed).

   Returns per store: `ID`, `LocalCode`, `Name`, `Description`, `Address1..4` (⚠️ `Address3` is the
   **state**, `Address4` the **county**), `City`, `PostalCode`, `Status`, `ActiveStore`,
   `OwnershipType`, `OperatorUserId`, `OperatorName`.

   **🔑 The key finding: `ID` IS the `hierarchy-node`.** Ardmore-Broadway's `ID` is
   `195500300689` — byte-identical to the `hierarchy-node: 195500300689` header on the EcoSure
   call. So PEAK's store list is the lookup table Propel needs. No guessing required.

   **The full identity chain, now closed:**

   | system | value for Ardmore-Broadway |
   |---|---|
   | PEAK `ID` / Propel `hierarchy-node` | `195500300689` |
   | PEAK `LocalCode` = NSN | `03708` |
   | EcoSure `restaurantNumber` | `03708` |
   | Meridian `loc` (7-pad, per CLAUDE.md) | `0003708` |
   | QSRSoft `storeRef` (unpadded) | `3708` |

   Cross-checked on a second store: Duncan `LocalCode 29760` is the same `STORE_REF` the
   `event_details` probe uses, and Meridian's `loc` for it is `0029760`. **The chain holds.**

   **🔑 One SSO session spans both hosts.** `GlobalAS_SessionId` is identical in the `peak.mcd.com`
   and `propel.mcd.com` captures — so a single authenticated browser profile reaches both. That
   matters for the on-demand design: one interactive login, both APIs.

   **Bonus:** this is a canonical, authoritative store roster with addresses and active flags.
   `STORE_NAMES` in `constants.js` is hardcoded; this could validate or replace it. Separate
   work — noted, not scoped here.

   ⚠️ `OperatorName` / `OperatorUserId` are **people**. Same tokenisation rule if ever ingested.

   ### ❌ Still missing: the VISIT list

   `getThirdPartyFoodSafetyVisitReport` needs a `visitId` (`1000132876` in the sample) and nothing
   captured so far produces one. **Next capture:** in Propel, open the page that *lists* food-safety
   visits for a store and grab that request — URL and header names only, no cookie jar. It very
   likely takes `hierarchy-node`, which we can now supply for all 27 stores.
2. **🔴 `propel.mcd.com` is SSO (owner, 2026-08-22)** — and the `rtFa` cookie indicates Microsoft
   federation (Entra/ADFS/SharePoint). **This is categorically harder than QSRSoft.** QSRSoft has a
   Cognito `USER_PASSWORD_AUTH` grant, so `getFreshToken()` can mint a credential from a stored
   username and password. **SSO has no equivalent** — there is no password grant to call, and if
   MFA is enforced (likely on corporate McDonald's identity) then *no* unattended flow can
   authenticate at all.

   ✅ **ANSWERED (owner, 2026-08-22): MFA IS enforced.** So **headless/unattended SSO
   authentication is impossible** — not difficult, impossible. Any design that assumes a
   credential can be minted from stored secrets is dead on arrival. Do not attempt one.

   ### ✅ THE ANSWER: on-demand, not scheduled (owner, 2026-08-22)

   *"I feel like we could run this on demand."* **This is the right design and it dissolves the MFA
   problem rather than working around it.**

   The whole difficulty above comes from wanting an *unattended* pull. Remove that requirement and
   MFA stops mattering: **if the owner triggers the run, the owner is present.** Session alive → it
   pulls. Session expired → it fails loudly, he logs in on the Mac mini, triggers again. No token
   refresh machinery, no silent expiry, no LifeLenz-style outage that goes unnoticed for six days.

   **Precedent already exists in this repo:** Data Manager's in-app **Sync buttons dispatch pull
   workflows** (v4.406–v4.426 sprint). Add one more button; the runner is the #65 Mac mini, already
   on a permitted network, already proven to execute jobs.

   **Shape:** `workflow_dispatch` only — **no `schedule:` block** — running on
   `[self-hosted, macOS, qsr-security]`, using Playwright against a **persistent browser profile**
   the owner has logged into interactively (MFA completed by a human, once per session lifetime).

   ⚠️ **Freshness needs different handling.** `stream-freshness.js`'s `STREAMS` assumes a
   *cadence* — `warnAt = cadence+1`. An on-demand stream has no cadence, so wiring it in naively
   would alarm constantly. Either set a deliberately loose `cadenceDays` (~30, matching real
   EcoSure frequency) or **surface "last pulled" next to the button instead** and leave it out of
   `STREAMS`. Decide explicitly; do not default into a permanent false alarm.

   ⚠️ **`sync-failure-watch.yml` still applies** — an on-demand run that *starts and fails* should
   still be caught. It is only the *never-ran* case that stops being a defect here, because a human
   chose not to run it.

   ---

   **Superseded options, kept for the reasoning.** Recommendation was START MANUAL:

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

3. **Akamai bot protection** (`_abck`, `bm_sz`) sits on top of the SSO problem — but it is a
   **smaller risk than it first looks, for the design we chose.**

   Observed response headers on a successful call (2026-08-22): `Akamai-Grn`,
   `Server-Timing: ak_p`, `cdn-cache MISS`, `origin dur=51`, clean `200 application/json`.
   **Akamai is in front of these hosts and did not challenge the request.** A real Chromium with a
   real logged-in profile is precisely the traffic Bot Manager is built to let through; the risk
   was always about *headless or scripted* fetch, which MFA has already ruled out anyway.

   **So do not over-engineer for Akamai.** Build the persistent-profile path, and treat a challenge
   as a thing to handle *if observed* rather than designed around in advance. **Measure before
   designing** — this session has already produced two wrong confident conclusions about an auth
   mechanism by reasoning instead of testing.

   Minor: responses are `Content-Encoding: br` (brotli). Node's `fetch` and Playwright both handle
   it; a hand-rolled client might not.

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

---

# Addendum — 🔴 THE VISIT-LIST ENDPOINT (2026-08-22)

Owner-captured. **This is the endpoint both this file and
`memory/finding-peak-cfv-api-2026-08-22.md` recorded as the single highest-value missing capture.**
It closes that open question and two others with it.

```
GET https://propel.mcd.com/api/visits
      ?v=778
      &action=getScoredVisitListResults
      &parentHierarchyNode=<operator node>   &parentHierarchyLevel=11
      &childHierarchyLevel=12
      &page=1 &rowsPerPage=20 &sortBy=childHierarchyNodeName &descending=false
      &visitType=0 &year=2026 &ownershipType=0 &category=visitResult
```

Headers as elsewhere on this host: `hierarchy-level: 11`, `hierarchy-node: <operator node>`,
`territory-code: 840`, `referer: https://propel.mcd.com/app/`. Cookie auth.

## What it changes

### 1. 🎯 `year=` is a query parameter — the prior-year backfill is a parameter change

`memory/finding-peak-cfv-api-2026-08-22.md` open question #3 asked whether a prior
`ProgramCycleDescription` could be requested. **`year=2026` is right there in the query string.**
The owner's own plan — *"I can backload data from last year"* — is `year=2025`, not a research
problem.

That is the binding constraint on the Visit Readiness Model Check
(`memory/notes-visit-readiness-backlog-2026-08-22.md` item 2, `memory/dispatch-69.md` Part B/D):
n=27 pairs, ρ CI [−0.16, 0.56], and *"knowing by December won't help — the cycle starts over in
January."* ⚠️ **Untested — nobody has run `year=2025` yet.** Run it before planning on it.

### 2. The estate is **27**, so the earlier 26 was a scope artifact — as flagged

`totalCount: 27`. The `impersonateUser` capture recorded in the PEAK finding returned **26**
Restaurant nodes and was missing Ponce de Leon (43701); that file flagged *"this is impersonateUser
for ONE eID … re-run for the owner's own eID before treating it as the store universe."*
**This confirms it** — the operator-node rollup counts 27, matching `STORE_NAMES` exactly.

✅ **Page 2 captured — Ponce de Leon directly observed.** `195500938240` →
`43701 HWY 81 AND I-10-PONCE DE LEON, FL`. **The node map is complete at 27/27** (20 rows on page 1
+ 7 on page 2). The store was never missing from PACE; the earlier 26 was purely the per-user scope
of `impersonateUser`, exactly as flagged. Add this row to the map in
`memory/finding-peak-cfv-api-2026-08-22.md`.

### 3. Per-PACE-AREA scores, per store — component-level ground truth

Every row carries a block per PACE area, each with `visitQuantity`, `scorePercentage`,
`passPercentage`, `passQuantity`, `criticalFail{Percentage,Quantity}`,
`nonCriticalFail{Percentage,Quantity}`:

`visitResult` (overall) · `quality` · `service` · `cleanliness` · `shiftLeadership` ·
`foodSafety` · `people` · `healthAndSafety`

**This is a materially better validation target than a single composite.** Visit Readiness scores
Speed 35 / Accuracy 30 / Quality 20 / Leadership 15 and today can only be checked against one
overall number. These areas map onto its components — so each can be validated *separately*, which
is how you find out **which** component is carrying the model and which is noise. A composite ρ of
0.23 cannot tell you that.

### 4. 🔴 `cleanliness` IS scored — and Meridian records it as an acknowledged data gap

`memory/project-graded-visits-pace.md` lists Cleanliness as having no daily-data proxy, and
`CoverageGaps` says so honestly in the UI. **That remains true and should not change**: this is a
*graded outcome*, not a predictor. Nothing here lets Meridian forecast cleanliness.

What it does give is **ground truth for the gap** — the ability to say how cleanliness actually
scored, and eventually whether any daily signal tracks it. Keep the gap declared; add the outcome.

### 5. 🔴 `foodSafety` IS scored — this is the real number the waste proxy stands in for

Directly relevant to `memory/dispatch-69.md` Part A. Meridian's `FOODSAFETY`
(`src/engine/visit-readiness.js:139`) is inventory `statVar` + `raw` waste, labelled
`Food safety: elevated`, and the owner's complaint is that the label claims far more than the
metric supports.

**PACE reports an actual food-safety score per visit.** Measured from this capture:

| | 2026 rollup, 15 visits |
|---|---|
| `foodSafety.scorePercentage` | **0.925** |
| `foodSafety.passPercentage` | **1.0** (15/15) |
| `foodSafety.criticalFailQuantity` | **0.0** |
| page-1 range across 10 scored stores | 0.840 – 1.000 |

**Meridian currently flags 10 of 27 stores `FS ELEVATED`. PACE failed zero of 15.**

⚠️ **That is a striking contrast, not yet a refutation, and it must not be written up as one.**
Three things have to be controlled first, and every one of them could explain the gap:
- **Different periods.** The flag reads the latest monthly `fobRows`; these visits are spread
  across 2026. Not a matched comparison.
- **Leading vs concurrent.** The flag is explicitly a *leading* indicator; a store can be trending
  badly and still pass a visit. The two are not required to agree.
- **Different constructs.** Waste/variance and a food-safety audit measure different things — which
  is the owner's whole point.

**The check to actually run:** for the 15 stores with a 2026 visit, compare Meridian's FS flag *as
of each visit date* against that visit's `foodSafety.scorePercentage`. Matched, leak-free, n=15
(plus `year=2025`). That is a real answer. Anything less is the same over-claiming dispatch #69
exists to fix — do not replace an over-strong label with an over-strong refutation of it.

### 6. `people` has zero visits estate-wide — that area is not graded this cycle

Every row and the rollup show `people.visitQuantity: 0.0`. Do not build a component against it.

## The 2026 picture (verified arithmetic, not eyeballed)

Rollup, `parentRestaurantCount: 27`:

| area | score | pass | fails |
|---|---|---|---|
| **overall** (`visitResult`) | **0.920** | **15/15** | 0 critical, 0 non-critical |
| quality | 0.919 | 14/15 | 1 non-critical |
| service | 0.935 | 15/15 | — |
| **cleanliness** | **0.887** | **14/15** | **1 non-critical — the weakest area** |
| shiftLeadership | 0.933 | 15/15 | — |
| foodSafety | 0.925 | 15/15 | 0 critical |
| healthAndSafety | 0.927 | 15/15 | 0 critical |
| people | — | — | not graded |

**15 visits across 27 stores so far in 2026.** Consistent with the owner's stated ceiling
(2–3/store/year); at ~8 months elapsed it reads closer to a **2/yr** cadence than 3 — ⚠️ suggestive
only, since visits are not evenly spaced and page 2 is unseen. It does *not* settle the 3-vs-2
question dispatch #69 Part B says to confirm with the owner.

Page-1 cross-check (10 scored stores) against the 15-visit rollup — every area within ~1.2 pts, and
page 1's single sub-80% cleanliness (**33222 ELGIN, 0.770**) accounts for the rollup's one
cleanliness `nonCriticalFail`; the one quality fail is on the uncaptured page 2. **The two levels
reconcile**, which is the check that says the rollup is a real aggregate and not a separate feed.

## Revised open questions

1. ~~Is there a visit-list endpoint?~~ **Answered.**
2. ~~Can a prior cycle be requested?~~ **`year=` is a parameter** — but **untested**. Run `year=2025`.
3. **What does `visitType=0` enumerate?** `0` presumably means "all". PEAK's CFV discriminator is
   `SurveyType.TypeId 3801`; whether `visitType` shares that numbering is unverified. This is how
   CFV/RGR/EcoSure get separated — **capture one non-zero value and find out.**
4. **`category=visitResult`** implies other categories exist. Unknown.
5. ~~Page 2~~ **Captured.** 7 rows, 5 visits, Ponce de Leon present. Nothing left open here.
6. **Is there a per-visit detail link from these rows?** They carry no `visitId`, and PEAK's
   `RoipSurvey/<VisitId>` needs one. Either another Propel action returns ids, or the two systems
   are joined some other way. **Still open, and it is what per-question detail depends on.**

## 🔒 Security

Another full cURL with live cookies — `GlobalAS_SessionId`, `connect.sid`, `rtFa`, Akamai
`_abck`/`bm_sz`, and a `token` JWT carrying the owner's name, email and allowed hierarchy nodes.
**None recorded here.** Only the endpoint shape, the aggregate figures and the per-area schema are
kept; the operator node's `hierarchyNodeName` is a list of individuals' names and is deliberately
omitted. **Re-authenticate the Propel session** — treat it as disclosed by sharing. Future captures
need only the URL, header *names* and the response body.

---

## Page 2 — the complete 2026 visit set, and what reconciling it proves

7 rows (20 + 7 = 27 ✓), 5 more visits (10 + 5 = **15** ✓, matching the rollup exactly).

### 🔴 The rollup is a STRAIGHT UNWEIGHTED MEAN across visits — measured, not assumed

Recomputed all seven areas from the 15 individual visit scores and compared to the published
rollup:

| area | computed | rollup | Δ |
|---|---|---|---|
| overall | 0.9197 | 0.920 | −0.0003 |
| quality | 0.9185 | 0.919 | −0.0005 |
| service | 0.9355 | 0.935 | +0.0005 |
| cleanliness | 0.8859 | 0.887 | −0.0011 |
| shiftLeadership | 0.9333 | 0.933 | +0.0003 |
| foodSafety | 0.9253 | 0.925 | +0.0003 |
| healthAndSafety | 0.9273 | 0.927 | +0.0003 |

Every area within rounding of a 3-decimal published figure. **PACE averages the visit scores
unweighted** — it does *not* weight by restaurant, despite reporting `parentRestaurantCount: 27`,
and a store with no visit contributes nothing rather than a zero.

📌 **This matters for how Meridian compares to it.** The standing rule here is *never average
averages, dollar-weight aggregates*. PACE does average averages. That is not Meridian's bug to fix
— it is PACE's published number and the one the owner is measured on — but **any Meridian-side
district rollup that claims to match PACE has to replicate PACE's method, and any Meridian-side
rollup that uses the correct weighting must not be labelled as the PACE figure.** Two numbers, two
labels. Getting this wrong is exactly the #348 class of bug: both computations locally correct,
silently inconsistent with each other.

### A component can fail while the visit passes — confirmed on live data

The two sub-80% components in the whole estate are precisely the rollup's two `nonCriticalFail`s:

| store | area | score | overall | overall result |
|---|---|---|---|---|
| 33222 ELGIN | cleanliness | **0.770** | 0.872 | **PASS** |
| 43380 TISHOMINGO | quality | **0.792** | 0.935 | **PASS** |

So **`nonCriticalFail` ⇔ that component scored below 80%**, and one such component does not fail the
visit. That is the rule `src/parsers/graded-visits.js` already encodes for RGR (*"overall ≥
threshold, no critical question missed, and no more than ONE component below 80%"*) — now confirmed
against the API rather than read off a PDF.

⚠️ A district that is 15/15 PASS still has two stores one component away from a fail. **A
readiness panel that only predicts pass/fail would call this a perfect quarter.** Predicting the
*component* is where the value is, which is the same argument for per-area validation above.

### 🔴 The food-safety check, run properly — and it cuts BOTH ways

The previous addendum flagged "10 of 27 flagged FS ELEVATED vs 0 of 15 failed" and explicitly
refused to call it a refutation. With the full set, the honest answer is **mixed, and that is a more
useful result than either extreme.**

Of the three stores whose *headline coaching line* is food safety
(`memory/notes-visit-readiness-backlog-2026-08-22.md` item 1):

| store | Meridian FS flag | PACE 2026 `foodSafety` | reading |
|---|---|---|---|
| **06838 DEFUNIAK SPRINGS** | elevated | **0.840 — the LOWEST in the estate** | **the flag was right** |
| 35064 HOLDENVILLE | elevated | 0.910 — mid-pack (8th of 15) | weak |
| 03708 ARDMORE-BROADWAY | elevated | **no 2026 visit** | untestable |

Full ranking, all 15 PASS: 0.840 · 0.850 · 0.880 · 0.910 · 0.910 · 0.920 · 0.920 · 0.930 · 0.940 ·
0.940 · 0.950 · 0.950 · 0.970 · 0.970 · 1.000.

**What this does and does not license:**
- ✅ The **label** is still wrong, and dispatch #69 Part A stands unchanged. Nothing failed, no
  critical fails estate-wide, and *"Address food-safety risk first"* on a 92.5%-passing estate is
  an over-claim regardless of ranking.
- ❌ It does **not** license the opposite claim — that the waste proxy is worthless. DeFuniak
  ranking dead last on the real measure while flagged is a point in the metric's favour, on n=1.
  **Do not delete the metric; rename it and stop it leading.**
- ⚠️ n=2 testable stores. This is nowhere near enough to judge, and one of the three headline
  stores cannot be checked at all. **`year=2025` is what makes this answerable** — the same
  parameter that unblocks the Model Check.

**The proper test remains the one already specified:** Meridian's FS flag *as of each visit date*
against that visit's `foodSafety.scorePercentage`, matched and leak-free, across 2026 **and** 2025.
Not a rank-eyeball across mismatched periods, which is all the above is.

### The 12 stores with no 2026 visit

`3708 · 5183 · 6178 · 10034 · 13113 · 18213 · 24471 · 29760 · 32525 · 33109 · 38609 · 43701`

📌 **Visit Readiness should know this.** These are the stores where a visit is *due*, which is
arguably more actionable than the readiness score itself — and Ardmore-Broadway being both
FS-flagged and unvisited is exactly the case a "who's overdue" surface would raise. `VisitPatterns`
already computes `daysSinceLast` per store from the manual uploads; this endpoint gives the same
thing authoritatively, estate-wide, for free.

---

## 🔴 Cadence answered by the owner — and it exposes a discrepancy in this very capture

**Owner, 2026-08-22:** *"CFV's I think we determined are 3 per year. EcoSure I believe is 2 per
year."*

That settles the question `memory/dispatch-69.md` Part B said to confirm. **It is per visit type,
not one estate number** — which is better than either single figure, and changes the planning:

| stream | visits/yr | ρ≥0.4 (n=46) | ρ≥0.3 (n=84) | direction ±10% (n=96) |
|---|---|---|---|---|
| **CFV 3/store/yr** | **81** | **~2.8 mo** | ~8.4 mo | ~10.2 mo |
| EcoSure 2/store/yr | 54 | ~4.2 mo | ~12.7 mo | ~15.3 mo |

⚠️ **Do not pool CFV and EcoSure to get there faster.** A mystery-shopped transaction and a
third-party food-safety audit measure different things; pooling them into one correlation is the
same mixing-regimes error already flagged for the pre/post visit-window change. Analyse per type;
each type's n grows at its own rate.

### 🔴 …but the 15 visits in THIS capture do not look like CFVs. Flagging, not concluding.

Two things in the data sit awkwardly with a 3/yr CFV cadence:

1. **Every scored store shows `visitQuantity: 1.0`.** At 3 CFVs/store/year, roughly eight months
   into 2026, a store with any CFV activity should show **2–3**, not 1.
2. **Each visit scores all seven PACE areas** — quality, service, cleanliness, shiftLeadership,
   foodSafety, healthAndSafety. A CFV is a *single-channel transaction*
   (`src/parsers/graded-visits.js` — modules are the order channel plus "Behind the Counter"). It
   would not produce a cleanliness or a health-and-safety score.

**The inference this suggests** — that `visitType=0` is not "all types", and these 15 are an
annual comprehensive/RGR-class visit while the CFVs sit under some other `visitType` — **is an
inference, and this file does not assert it.** This session has already produced two confident
inferences about these external systems that survived until someone checked. It is recorded as the
top open question, not a finding.

**Why it matters enough to test before planning on it:** the time-to-power table above assumes the
Model Check's pairs are CFV-based (81/yr). If the pairs are actually comprehensive visits at ~1
per store per year, the supply is **27/yr** and *"~2.8 months"* becomes *~8 months* — which lands
after the cycle restarts, which is precisely the outcome the owner said is useless.

**The test, cheapest first:**
1. Compare this list against `VisitPatterns` in the panel — it already renders actual CFV/RGR
   counts per store from the manual uploads. If Meridian shows 2–3 CFVs for a store this list shows
   as `visitQuantity: 1.0`, the two are enumerating different things and the question is answered
   with no new capture at all.
2. Call the endpoint with a **non-zero `visitType`** and see what changes. That also answers open
   question 3 (how CFV/RGR/EcoSure are separated) and tells us the id for `year=2025`.

📌 **Until that is settled, `year=2025` remains the right next capture regardless** — it multiplies
whatever these visits are, and it is a one-parameter change.

---

# Addendum — the REAL EcoSure data, all 27 stores (2026-08-22)

Owner-captured, both pages. **This is the actual third-party food-safety measure** — a different
`category` from `visitResult`, returning a single `thirdPartyFoodSafety` block per store instead of
the seven PACE areas.

⚠️ **Which year this is has NOT been confirmed.** The owner reported the year dropdown offers
**2024 · 2025 · 2026**, but did not say which was selected, and the response body does not echo it.
53 visits ÷ 27 stores = **1.96/store**, matching the owner's stated EcoSure cadence of 2/yr for a
*complete* year — which points to 2024 or 2025 rather than eight-months-in 2026, but that is an
inference. **Confirm before using these numbers for anything dated.**

⚠️ Also unrecorded: the exact `category=` value. Capture the URL next time.

## Reconciliation (computed, all 27 rows)

| | computed | rollup | |
|---|---|---|---|
| visits | 53 | 53 | ✅ |
| mean score, unweighted | 0.8950 | 0.896 | ✅ |
| mean score, visit-weighted | 0.8957 | 0.896 | ✅ |
| pass | 52/53 = 0.981 | 0.981 | ✅ |
| critical fails | 1 | 1 | ✅ |

26 stores scored; **Ponce de Leon (43701) has zero EcoSure visits** — consistent with it also
having no 2026 comprehensive visit. Worth asking why a store is going ungraded.

Unweighted and visit-weighted agree to 0.0007 here only because 25 of 26 stores have exactly 2
visits. **Do not read that as license to average averages** — with an uneven visit count the two
diverge, and PACE publishes the unweighted figure (established in the page-2 addendum above).

## 🔴 The single most actionable row: ADA has a CRITICAL food-safety fail

`06972 ADA-COUNTRY CLUB` — **3 visits, 2 pass, 1 CRITICAL FAIL** (`criticalFailQuantity: 1.0`,
`passPercentage: 0.667`). It is the **only** critical fail in the estate across all 53 visits.

Note its *score* is 0.930 — **7th best of 26**. A store can carry a critical food-safety failure
while sitting in the top third on average score. Any surface that ranks by score alone hides this
completely, and a critical fail is categorically more serious than a low average.
📌 **Whatever replaces the waste flag must surface `criticalFailQuantity` separately from score.**

## 🔴 CORRECTION to this file's earlier food-safety read

The page-2 addendum above said, of Meridian's three FS-flagged headline stores:

> *"**06838 DEFUNIAK SPRINGS** | elevated | **0.840 — the LOWEST in the estate** | **the flag was
> right**"*

**That does not survive contact with the actual EcoSure measure.** The 0.840 was the `foodSafety`
*area* inside a 2026 comprehensive visit — a different instrument. On the real third-party audit:

| store | Meridian FS flag | EcoSure score | rank of 26 (1 = best) | vs estate mean 0.895 |
|---|---|---|---|---|
| 06838 DEFUNIAK SPRINGS | elevated | 0.895 | **13th** | **above** |
| 35064 HOLDENVILLE | elevated | 0.890 | 16th | marginally below |
| 03708 ARDMORE-BROADWAY | elevated | 0.870 | 20th | below |

**None is in the bottom tier.** The genuinely worst are stores Meridian does *not* headline:

| rank | store | score |
|---|---|---|
| 26 | 11657 PURCELL | **0.820** |
| 25 | 18213 LINDSAY | 0.825 |
| 24 | 24471 ARDMORE-NEC | 0.835 |
| 23 | 32525 SULPHUR | 0.850 |

Spread 0.820–0.955, sd 0.037.

### What this does and does not establish

- ✅ **Dispatch #69 Part A is strengthened considerably.** The waste/variance proxy is not merely
  *mislabelled* — on this evidence its top-3 coaching picks are ranked 13th, 16th and 20th while
  the four worst stores go unmentioned. That is the *"a number nobody acts on"* rule failing in the
  worst way: it displaces the stores that need the attention.
- ⚠️ **It is still NOT the matched leak-free test.** Only the 3 *headline* stores are known here,
  not all 10 flagged, so no rank correlation can be computed. The year is unconfirmed. And the flag
  reads the latest monthly `fobRows` while these visits span a whole year — periods do not line up.
- ❌ **It does not establish the proxy is worthless**, and nothing here justifies deleting it. It
  establishes that it should not be the headline, which is what the owner said in the first place.

📌 **The honest summary: my earlier "the flag was right on DeFuniak" was an artifact of comparing
against the wrong instrument.** Two different things are both called "food safety" in this data —
the PACE `foodSafety` *area* within a comprehensive visit, and the standalone third-party EcoSure
audit. They rank stores differently. **Always say which one.**

## The proper test is now cheap, and the data reaches back to 2024

The year dropdown offers **2024 · 2025 · 2026**. At ~53 EcoSure visits/year that is
**~160 visits over three years** — far past every power threshold in
`memory/notes-visit-readiness-backlog-2026-08-22.md`, and available today rather than next spring.

**Run:** Meridian's FS flag *as of each visit date* vs that visit's EcoSure score, all stores, all
three years, leak-free (reuse the Back Test discipline; do not hand-roll an `asOf`). That answers
whether waste predicts food safety at all — properly, with n in the hundreds instead of anecdotes.

⚠️ **Tag each year and keep them separable.** Three years of EcoSure spans standard revisions;
pool only after checking the distributions are comparable.

## Operational note for any pull

**`rowsPerPage=50` was NOT honored — the API capped the page at 20 rows.** Any client must page
until `results.length` reaches `totalCount` rather than trusting a large `rowsPerPage`.

---

# 🔴 Addendum — 2025 comprehensive visits, and the TEST-RETEST CEILING nobody had measured

Owner-captured via the console snippet, `year=2025`, `category=visitResult`. Complete: 27 rows,
**27 visits**, matching the rollup exactly. All seven areas reconcile to ≤0.0022 (rounding on a
3-decimal published figure), and the single sub-80% component — `24471 ARDMORE-NEC`, quality
**0.693** — accounts for the rollup's one quality `nonCriticalFail` (26/27 pass = 0.963). The
sub-80% ⇔ `nonCriticalFail` rule holds for a third dataset.

**2025 has near-complete coverage: 26 of 27 stores.** 2026 has 15 so far. The year dropdown offers
**2024 · 2025 · 2026**.

## 🔴 The finding: a store's own past visit barely predicts its next one

Matched on the **same 15 stores** that have both a 2025 and a 2026 comprehensive visit:

**Spearman ρ between a store's 2025 overall score and its own 2026 overall score = +0.113 (n=15).**

**This is the ceiling on what any predictor of this outcome can achieve, and it had never been
measured.** If a store's own prior graded-visit score — the single most informative predictor
available, embodying everything stable about that restaurant — explains almost none of its next
score, then the outcome is dominated by **visit-specific variance**: which shopper, which day,
which shift, which daypart, which channel.

### What that does to `memory/dispatch-69.md` Part B

The Model Check reports **ρ = 0.23** and captions it *"Weak agreement so far."*

**0.23 is not weak against this benchmark — it is higher than the store's own prior score
achieves.** The panel is disparaging a model that beats the natural baseline.

⚠️ **State this carefully, and do NOT overclaim in the other direction.** At n=15 the CI on 0.113
spans roughly [−0.42, 0.59], and at n=27 the CI on 0.23 is [−0.16, 0.56]. **These two intervals
overlap almost entirely — the data cannot establish that 0.23 beats 0.113 either.** That is not a
disappointment; it is the point:

> The premise underneath "the model is weak" — that a good model *should* score high here — is
> itself unevidenced, and the first evidence we have points the other way.

**So the caption fix in Part B is not just more honest, it may be understating the model.** And the
right thing to display is not a bare ρ but **ρ against the test-retest benchmark**, so a reader can
see what "good" would even look like.

📌 **Do this before any scoring rework, and cheaply:** the 2024 dropdown makes the test-retest
figure computable at n≈26 instead of 15 (2024→2025 has near-complete coverage on both sides, unlike
2025→2026). **That single number should gate Part B**, because if the ceiling really is ~0.1–0.2,
then refitting weights is chasing noise no matter how much data arrives — and
`notes-visit-readiness-backlog-2026-08-22.md`'s whole time-to-power table is measuring progress
toward a target that may not exist.

## Matched year-over-year — the operational read

Same 15 stores, so store mix is controlled (the naive all-store comparison is confounded: 2026's 15
are a subset, and it understated cleanliness by a point):

| area | 2025 | 2026 | Δ | better/worse |
|---|---|---|---|---|
| overall | 0.9287 | 0.9197 | −0.0090 | 6/9 |
| quality | 0.9057 | 0.9185 | **+0.0127** | 7/5 |
| service | 0.9391 | 0.9355 | −0.0035 | 8/5 |
| **cleanliness** | 0.9162 | 0.8859 | **−0.0303** | **3/11** |
| **shiftLeadership** | 0.9060 | 0.9333 | **+0.0273** | **5/2** |
| foodSafety | 0.9453 | 0.9253 | −0.0200 | 6/9 |
| healthAndSafety | 0.9503 | 0.9273 | −0.0230 | 5/6 |

**Cleanliness is the one area where the direction is consistent rather than noisy — 11 of 15 stores
worse, and the largest drop.** Given ρ≈0.11 on the overall score, a 3-point move with 11/15 stores
moving the same way is the signal to trust here; most of the other columns are within what
visit-to-visit noise produces. **Shift Leadership improving (only 2 of 15 worse) is the other.**

⚠️ 2026 is a partial year and these are single visits per store per year — treat as directional.

Biggest overall swings: `33222 ELGIN` −0.098 (0.970→0.872), `10422 ATOKA` −0.056; `20475 OKC-I-240`
**+0.070**, `31357 PAULS VALLEY` +0.054.

## 🔴 Ponce de Leon (43701) is ungraded across EVERY dataset seen

Zero comprehensive visits in 2025. Zero in 2026. Zero EcoSure visits. Three independent datasets,
no grades anywhere. It is a real store in the hierarchy (`195500938240`), so this is not a mapping
artifact. **Worth asking PACE why one restaurant is going ungraded** — and worth Visit Readiness
saying so rather than silently scoring it from ops data alone.

## Consistency worth noting

`24471 ARDMORE-NEC` is worst in 2025 comprehensive (0.832, quality 0.693) **and** 3rd-worst on
EcoSure (0.835). Given how little year-to-year signal there is generally, a store that is bad on two
different instruments is more likely to be genuinely bad than a one-visit outlier.

---

# 🔴 Addendum — 2024 comprehensive, and a REVISED test-retest ceiling (supersedes the ρ=0.113 figure)

Owner-captured, `year=2024`, `category=visitResult`. 27 rows, **27 visits across 25 scored
stores** (DeFuniak and Cottondale have 2 each; **Tishomingo and Ponce de Leon have none**).
Computed overall mean 0.9442 vs published rollup 0.945 ✅.

⚠️ **A prior capture labelled "2024" was in fact the 2025 data.** The snippet carried the year in
two places — the URL and a hardcoded output label — so changing one produced a mislabelled but
otherwise valid 2025 payload, byte-identical to the earlier pull. Caught by comparing rows, not by
trusting the label. **The snippet now derives the label from a single `YEAR` constant.** Recorded
because a self-labelling export that *can* lie is a trap worth not rebuilding.

## 🔴 CORRECTION — the ρ=0.113 ceiling was a small-sample artifact, and it pointed the wrong way

The previous addendum computed test-retest at **ρ = +0.113 (n=15**, 2025→2026) and concluded:

> *"0.23 is not weak against this benchmark — it is higher than the store's own prior score
> achieves. The panel is disparaging a model that beats the natural baseline."*

**2024→2025 gives a better estimate on a larger, fully-covered sample, and it reverses the
direction:**

| pairing | n | ρ | 95% CI |
|---|---|---|---|
| 2025 → 2026 | 15 | +0.113 | [−0.42, +0.59] |
| **2024 → 2025** | **25** | **+0.342** | **[−0.06, +0.65]** |

2024→2025 is the better of the two: both years have near-complete coverage, where 2026 is a
partial year of 15 visits. **So the ceiling is ≈0.34, not ≈0.11 — and it sits ABOVE the Model
Check's 0.23, not below it.** My earlier claim that the model beats the baseline does not survive
the larger sample and is withdrawn.

### What the honest read now is

| | ρ | 95% CI |
|---|---|---|
| Visit Readiness model vs actual | 0.23 | [−0.16, +0.56] |
| store's own prior visit (ceiling) | 0.34 | [−0.06, +0.65] |

1. **The two are statistically indistinguishable.** The intervals overlap almost entirely. Nothing
   here says the model is worse than the baseline either — only that it is not measurably better.
2. **The ceiling is real but modest.** Even the best imaginable predictor of a graded visit is
   working against an outcome where the same store's own prior visit explains ~12% of variance.
   **A model scoring 0.9 here is not achievable and should not be the target.**
3. **So dispatch #69 Part B's caption fix stands, and its "do not refit the weights" stands** — but
   for a sharpened reason. Not merely "n is too small to fit": **the achievable ceiling is low
   enough that the payoff from a better fit is bounded regardless of n.** Report ρ *against the
   test-retest benchmark* so a reader can see what "good" looks like — 0.23 against a 0.34 ceiling
   is a very different statement from 0.23 against an implied 1.0.
4. ⚠️ **Do not now swing to "the model is underperforming."** That is the same over-claim in the
   other direction, on overlapping intervals. Two estimates of the ceiling (0.11, 0.34) from two
   samples is not a settled number either.

📌 **Method note for anyone extending this:** the ceiling should be re-estimated whenever another
year lands, and reported *with its CI*, never as a point. Two samples have already produced
0.11 and 0.34.

## 2024 → 2025 movement

Mean **0.9442 → 0.9265 (−0.0177)**; **15 of 25 stores worse**, 10 better. Combined with 2025→2026's
−0.0090 that is two consecutive down years on the overall score.

⚠️ Given ρ≈0.34, single-store year-over-year moves are mostly noise. The exception is a store that
moves consistently: **`24471 ARDMORE-NEC` fell −0.117 (0.949 → 0.832), the largest mover**, and is
also worst overall in 2025, carries 2025's only sub-80% component (quality 0.693), and is
3rd-worst on EcoSure. **Four independent signals on one store** — that is not noise.

Also `11657 PURCELL` −0.079 and `31357 PAULS VALLEY` −0.077; both were also bottom-5 in 2025.

## Two structural differences in 2024 worth knowing

1. **Not every visit graded every area.** Area `visitQuantity` varies: `visitResult` 27, but
   `quality`/`service`/`cleanliness`/`shiftLeadership` **25**, `foodSafety`/`healthAndSafety` **26**.
   In 2025 all seven were 27. **A per-area rollup denominator is not the visit count** — read each
   area's own `visitQuantity` rather than assuming.
2. **2024 had TWO failed visits** (`visitResult.passPercentage` 0.926 = 25/27). 2025 and 2026 to
   date have zero. So the estate's pass record improved while its mean score fell.

## Ponce de Leon — now confirmed across FIVE datasets

Zero visits in 2024 comprehensive, 2025 comprehensive, 2026 comprehensive, and **both** EcoSure
years. Tishomingo also has none in 2024 or in one EcoSure year, but does appear elsewhere — Ponce
de Leon appears nowhere. **This is no longer a curiosity; escalate it to PACE.**
