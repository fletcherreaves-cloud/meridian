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
