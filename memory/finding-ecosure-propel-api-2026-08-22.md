---
name: finding-ecosure-propel-api-2026-08-22
description: A working EcoSure 3rd-party food safety API on propel.mcd.com — full per-question FS1..FS36 results, scores and cited reasons. Replaces Visit Readiness's waste-based "food safety" proxy with the real thing, and proves that proxy wrong on a live store.
sensitivity: open
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

Zero comprehensive visits in 2025. Zero in 2026. Zero EcoSure visits.

🔴 **RESOLVED later the same day — see the Tishomingo/opening-dates section below. Ponce de Leon is
a NEW STORE** (first CFV visit 2026-06-20, two visits total). The absence is its age, not neglect.
**The "ask PACE why one restaurant is going ungraded" recommendation below is WITHDRAWN.**

~~It is a real store in the hierarchy (`195500938240`), so this is not a mapping artifact. **Worth
asking PACE why one restaurant is going ungraded** — and worth Visit Readiness saying so rather than
silently scoring it from ops data alone.~~

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

---

# ✅ Addendum — the three visit types CONFIRMED, and what `category=visitResult` actually is

Owner-supplied Propel UI screenshot + *"visitType dropdown options are Ecosure, CFV, and RGR > Not
in a dropdown though."*

The UI has no visit-type dropdown. Its filters are **Completed By** (All / McDonald's / Third
Party / Franchisee — this is the `ownershipType`-style filter, **not** visit type), **Timeframe**,
**Operations PACE Planned**, **Announced**. The three visit types are instead **three separate
result cards**.

## 🔴 The open question is closed by direct match, not inference

The earlier addendum flagged a discrepancy — every scored store showing `visitQuantity: 1.0` with
all seven PACE areas graded, which *"does not look like a CFV"* — and deliberately recorded it as
an open question rather than a conclusion. **The UI confirms it.** The screenshot's left card, at
`Completed By: All` / `Timeframe: 2026`, reads:

| area | Propel UI | my `category=visitResult` 2026 rollup `passPercentage` |
|---|---|---|
| Overall | 100.0% | 1.000 |
| Quality | **93.3%** | **0.933** |
| Service | 100.0% | 1.000 |
| Cleanliness | **93.3%** | **0.933** |
| Shift Leadership | 100.0% | 1.000 |
| Food Safety | 100.0% | 1.000 |
| Health And Safety | 100.0% | 1.000 |

**All seven match exactly.** So `category=visitResult` **is that card** — the comprehensive
**RGR**-class visit, roughly 1 per store per year. It is **not** CFV.

## 🔴 CFV has NOT been pulled, and it is the stream that matters most

The screenshot's second card is **"Customer First — % Meeting 80% / % Below 80% = 55.3% / 44.7%"**.
A completely different metric from anything captured: not a mean score, not a pass rate against the
RGR rule, but a share meeting an 80% bar.

Two things follow:

1. **CFV is the high-volume stream.** Owner-stated cadence: CFV **3/store/yr** = ~81/yr, against
   RGR's ~27/yr and EcoSure's ~54/yr. For pair supply it dominates.
2. 🔴 **44.7% of Customer First visits are below 80%.** RGR passes ~100% and EcoSure ~93–98%; CFV
   fails nearly half. **That is where the operational signal lives**, and none of it is in Meridian
   from these captures.

**Next capture — CORRECTED 2026-08-22.** An earlier draft of this line said to look for *"a
different `category=` value on the same `/api/visits` endpoint."* **That is wrong.** Owner:
*"Clicking on CFV takes you to PEAK site fwiw."*

⚠️ **…and then I over-corrected. Owner, immediately after:** *"It shows scoring, just not full
visit — on Propel."*

**Both things are true, and they are not in conflict.** Propel carries CFV **scoring**; PEAK
carries the **full visit**. The click-through exists for the detail, not because Propel lacks CFV
entirely. Recording all three statements in sequence because the useful fact is the *split*, and I
got it wrong in both directions before landing on it — first assuming Propel had everything, then
assuming it had nothing.

| what you need | where it lives |
|---|---|
| **per-store CFV score** (% meeting 80%) — enough for a Model Check pair | **Propel**, a `category=` on `/api/visits` |
| **per-question detail** — daypart, channel, timer bands, reasons | **PEAK**, `RoipSurvey/<VisitId>` |

🎯 **Practical upshot: for the Model Check, Propel is sufficient and is much the cheaper path.** A
correlation needs `(predicted readiness, actual score)` per store — not per-question detail. Propel
already proved `year=` works and is a one-parameter change, so **2024 / 2025 / 2026 CFV scores are
reachable with the same console snippet and a different `category=`.** PEAK is only required if the
daypart/channel-matched analysis (dispatch #69 Part D) goes ahead.

So the division of labour across the two hosts:

| host | carries |
|---|---|
| `propel.mcd.com` | **RGR** (`category=visitResult`) + **EcoSure** (`thirdPartyFoodSafety`) + a summary tile linking out for CFV |
| `peak.mcd.com` | **CFV** detail — `POST /API/Visit/RoipSurvey/<VisitId>`, `SurveyType.TypeId 3801` (`memory/finding-peak-cfv-api-2026-08-22.md`) |

This also explains why the owner described PEAK as *"another site for CFV and RGR and other
reports"* — the two systems overlap rather than partition cleanly.

📌 **Two captures, and the Propel one is first.**

**(a) Propel — the CFV `category=`, highest value and cheapest.** The screenshot's *"List Results —
Third Party Food Safety"* section changes with the selected card, so selecting **Customer First**
should fire the same `/api/visits` call with a CFV category. Capture that URL and body; then the
existing snippet gives 2024/2025/2026 CFV per-store scores by changing one constant.

**(b) PEAK — the visit-list endpoint, only if per-question detail is wanted:** click through from
Customer First and capture whatever the CFV LIST page fires on landing. That is the still-missing visit-list endpoint
recorded as open question 6 in this file and as the top open question in the PEAK finding — PEAK's
`RoipSurvey/<VisitId>` needs an id nobody can currently enumerate. A click-through from Propel is
the most likely thing to hand one over, because the landing page must list visits to link to them.

Propel's **"List Results — …"** export control (the download icon in the screenshot) is worth a try
for whichever card is selected — it may hand over the per-store list as a file and skip the console
entirely.

## ⚠️ This creates a scoping caveat on the test-retest ceiling — read before using ρ=0.342

The ceiling computed above (**ρ = +0.342**, 2024→2025, n=25) was measured on
`category=visitResult`, i.e. **RGR-class visits only**. It is *not* established for CFV.

And Meridian's Model Check pairs against `ds.gradedVisits`, which `src/parsers/graded-visits.js`
populates from **both** CFV **and** RGR PDFs (`reportType: 'CFV'` / the RGR branch at `:158`). So:

- The Model Check's 27 pairs are plausibly a **MIX of two different instruments** — one that nearly
  everyone passes and one that nearly half fail.
- **Pooling them into one correlation is the same mixing-regimes error already flagged twice** in
  this file (pre/post visit-window, CFV-vs-EcoSure). It would depress ρ on its own, independent of
  model quality.

📌 **So there is now a third candidate explanation for the Model Check's 0.23, and it is cheap to
test and not yet in `memory/dispatch-69.md`:** split the existing pairs by `reportType` and compute
ρ separately for CFV and for RGR. `ds.gradedVisits` already carries the field; no new pull needed.
If the two differ materially, the pooled figure was never meaningful.

**Add this to dispatch #69 Part D**, ahead of the daypart/channel split — it is cheaper, and a
per-instrument ceiling is a prerequisite for interpreting either.

---

# Addendum — `getCustomerExperienceVisits` (CEV): a discontinued predecessor, and the best available test of the ceiling

Owner-captured 2026-08-22, offered as *"maybe"* — correctly hedged. **This is not CFV.** It is
**CEV (Customer Experience Visit)**, the pre-2020 predecessor programme.

```
GET https://propel.mcd.com/api/visits
      ?v=778 &action=getCustomerExperienceVisits
      &locationId=<hierarchy node> &cultureName=en-US
    headers: hierarchy-level: 12 · hierarchy-node: <same locationId> · territory-code: 840
```

**Per-STORE, not estate-wide** — `hierarchy-level: 12` and a single `locationId`, so a full pull is
**27 calls**, unlike the operator-level `getScoredVisitListResults`.

**No `year` parameter — it returns the store's full history in one response.**

## Shape

| field | notes |
|---|---|
| `visitTypeId` / `visitTypeShortDescription` | **57/58/59/60 = CEV1/CEV2/CEV3/CEV4 — quarterly, 4/yr** |
| `visitDate`, `visitYear`, **`visitId`** | a real visit id (e.g. `5517471`) |
| `qualityPercentage` · `fastPercentage` · `accuratePercentage` · `friendlyPercentage` · `cleanlinessPercentage` | five dimensions, as **strings** |
| `operationPercentage` | **null on every row** |

⚠️ `visitTypeShortDescription` is **space-padded** (`"CEV1                "`) — trim on ingest, same
trap as the EcoSure `questionCode` trailing spaces recorded earlier in this file.
⚠️ Percentages are **strings**, not numbers.

**Measured on `3708` (Ardmore-Broadway): 15 visits, 2016-06-01 → 2020-02-12. The series stops in
February 2020** — a discontinued programme, presumably ended by COVID.

## 🔴 Not useful for Model Check pairs — say so plainly

A pair needs `(predicted readiness as of the visit date, actual score)`. Predicted readiness is
computed from DAR / labor / ops streams. **Meridian has no such data for 2016–2020**, and while the
standing rule is *never treat a gap as a floor, backfill it*, this one is different in kind:

- pre-COVID, pre-current-menu, pre-current-POS;
- **LifeLenz for Oklahoma begins Oct 2025** — CLAUDE.md's one acknowledged genuine floor;
- the regime gap is larger than any this project has flagged, including the 11am–5pm window change.

**So do not scope a CEV backfill for the Model Check.** Even if the ops data were pullable, pairing
2017 operations against a model designed on 2026 data would measure the era, not the model.

## 🎯 What it IS good for — and it is the single best available test of the ceiling

**Test-retest needs no ops data at all.** It is visit-vs-visit: does a store's score predict its own
next score? CEV supplies exactly that, at a scale nothing else can:

| source | observations available |
|---|---|
| RGR comprehensive | 25 paired stores (2024→2025) — the current ρ=0.342, CI [−0.06, +0.65] |
| **CEV** | **27 stores × ~15 quarterly visits ≈ 400** |

That would move the ceiling estimate from "CI spanning almost the whole plausible range" to an
actual number — and it is **27 GET requests with no parameters to tune.**

### One store already shows the answer, and it is stark

`3708`, 15 consecutive quarterly visits:

| dimension | mean | min | max | sd |
|---|---|---|---|---|
| quality | 86.7 | 58.3 | 100.0 | 15.8 |
| **fast** | **46.7** | **0.0** | **75.0** | **23.6** |
| accurate | 94.4 | 50.0 | 100.0 | 14.5 |
| friendly | 76.7 | 20.0 | 100.0 | 24.5 |
| cleanliness | 67.8 | 33.3 | 100.0 | 19.7 |

`fast`, in chronological order:
`75 → 25 → 75 → 25 → 50 → 0 → 75 → 25 → 50 → 50 → 75 → 25 → 55 → 25 → 70`

**Mean absolute change between consecutive visits: 39.6 points on a 0–100 scale.** Cleanliness: 15.5.

**A restaurant's actual drive-thru speed does not swing forty points from one quarter to the next.**
That is measurement noise, and it is independent corroboration of the low test-retest ceiling
measured on the modern RGR data (ρ=0.342) — from a different instrument, a different decade, and a
single store.

⚠️ **CEV ≠ CFV ≠ RGR.** The numeric ceiling does not transfer between instruments. What transfers
is the *qualitative* finding: **mystery-shop-style graded visits of these restaurants carry weak
store-level signal and large per-visit variance.** That is the premise dispatch #69 Part B rests on,
and it now has support from two independent sources.

📌 **Recommended:** pull CEV for all 27 stores (27 calls, no parameters, one-off), compute
test-retest per dimension across ~400 visits, and use it to set an honest expectation band on the
Model Check — **without** ingesting CEV as a Meridian data source or attempting to pair it with ops
data. It is a calibration study, not a stream.

---

## ⚠️ Negative result — the `category=` vocabulary is NOT guessable (2026-08-22)

Probed six candidate values against `getScoredVisitListResults`, `year=2026`, operator node:

| category | result |
|---|---|
| `customerFirst` | **HTTP 400** |
| `customerFirstVisit` | **HTTP 400** |
| `customerExperience` | **HTTP 400** |
| `cfv` | **HTTP 400** |
| `visitResult` | ✅ total 27, blocks `visitResult,quality,service,cleanliness,shiftLeadership,foodSafety,people,healthAndSafety` |
| **`thirdPartyFoodSafety`** | **HTTP 400** |

**Two things worth keeping:**

1. 🔴 **`thirdPartyFoodSafety` — the EcoSure response BLOCK name — is not a valid category.** So the
   category parameter is *not* named after the block it returns, which was the heuristic behind
   every guess above. **The EcoSure category value is still unknown**, even though its response has
   been captured twice. Do not re-derive it from the payload; read it off the request.
2. ✅ **The server validates the enum — a bad category returns 400, not a silent default.** That is
   a genuinely good property: no risk of an unrecognised category quietly returning `visitResult`
   data under another name, which is the trap the block-name check in the probe existed to catch.
   It also means probing is safe and cheap; it just doesn't work without the vocabulary.

📌 **The only reliable route is to read the value off the live request.** In the Propel UI, select
the card you want and copy the URL from the Network tab — **the whole URL, not just the category**,
because CFV may also use a *different `action=`* (as `getCustomerExperienceVisits` does) rather than
`getScoredVisitListResults` with a new category. Do not assume the action is shared.

---

# ⭐ Addendum — the full Propel `/api/visits` ACTION SURFACE (2026-08-22)

Enumerated in one line from the browser, no Network-tab hunting and no guessing:

```js
performance.getEntriesByType('resource').map(e=>e.name).filter(n=>n.includes('/api/')).join('\n')
```

📌 **Record this technique.** The `category=` probe cost six 400s and produced nothing; resource
timing listed every real URL the SPA had already called, including their exact `action=` values.
**When an SPA's API vocabulary is unknown, enumerate what it actually fetched — never guess enum
values.**

## 🎯 `getCfvHistory` — the CFV endpoint, found

```
GET https://propel.mcd.com/api/visits
      ?v=778 &action=getCfvHistory &locationId=<hierarchy node> &cultureName=en-US
    headers: hierarchy-level: 12 · hierarchy-node: <same locationId> · territory-code: 840
```

**Per-store**, like `getCustomerExperienceVisits` — so a full pull is 27 calls. **No `year`
parameter**, which on the CEV sibling meant "returns full history in one response"; expect the same
here but ⚠️ **verify rather than assume** — the response shape is not yet measured.

**This corrects the working assumption twice over.** CFV is *not* a `category=` on
`getScoredVisitListResults` (every guess 400'd), and it is *not* only on PEAK — Propel has its own
CFV history action. The earlier over-correction ("CFV is not on Propel") and the original guess
("a different category on the same action") were both wrong; this is the third and measured answer.

## The complete action list observed

**Operator-level** (`hierarchy-level: 11`, `parentHierarchyNode`/`operatorId`):

| action | notes |
|---|---|
| `getScoredVisitListResults` | the paged per-store rollup; takes `category=`, `year=`, `visitType=` |
| `getPaceSupportOrgVisits` | `operatorId=` — unexplored |

**Store-level** (`hierarchy-level: 12`, `locationId=<node>`, `cultureName=en-US`):

| action | notes |
|---|---|
| **`getCfvHistory`** | 🎯 **CFV history — the target** |
| `getCustomerExperienceVisits` | CEV, the pre-2020 predecessor (measured; see its addendum) |
| `getBrandProtectionVisits` | unexplored |
| `getPaceSupportVisits` | unexplored |
| `getMarketSupportVisits` | unexplored |
| `getMarketAdditionalVisits` | unexplored |

**Per-visit detail:**

| action | notes |
|---|---|
| `getThirdPartyFoodSafetyVisitReport` | `visitId=` — the EcoSure per-visit report this file opens with |

**Supporting:** `/api/navigation` (`getNodeDetails`, `getHierarchyLevels`, `getDescendants`),
`/api/role` (`getUserRoles`, `token`, `impersonateUser`), `/api/config`
(`country_config`, `language_messages`), `/api/admin?action=getVersionInfo`,
`/api/accuracy-scales?action=getAccuracyScalesLastRefreshDate`.

⚠️ **`getScoredVisitListResults` is the ONLY action seen taking `category=`.** So the still-unknown
EcoSure category value applies only to that rollup action — the per-visit EcoSure report has its own
action, and CFV has its own action rather than a category. The category vocabulary may be a much
smaller thing than assumed.

📌 **Four unexplored store-level actions** — `getBrandProtectionVisits`, `getPaceSupportVisits`,
`getMarketSupportVisits`, `getMarketAdditionalVisits`.

🔴 **DEPRIORITISED by the owner, 2026-08-22:** *"Not sure we need the additional visits right now.
Only CFV, RGR and EcoSure affect us at the moment. They would be nice to haves down the road, but
not priority now."*

**Do not spend captures on these.** Recorded so the list stays discoverable when the priority
changes — they are known, named and one call each away — but the estate's graded-visit picture is
**complete for present purposes** with the three that matter. Do not re-raise them as a gap.

🔒 The listing includes `role/getUserRoles?eid=…` and `role/impersonateUser?eid=…` with real eIDs in
the query string. **Those values are deliberately not recorded here** — only the action names.


---

# ✅ Scope closed on the three instruments that matter (2026-08-22)

Owner: *"Only CFV, RGR and EcoSure affect us at the moment."* Against that scope, the capture work
is **done**:

| instrument | source | captured | state |
|---|---|---|---|
| **CFV** | `getCfvHistory`, per-store | **217 visits, 2023-01 → 2026-08** | ✅ analysed — `memory/finding-cfv-predictability-ceiling-2026-08-22.md` |
| **RGR** | `getScoredVisitListResults`, `category=visitResult` | 2024 (27), 2025 (27), 2026 (15) | ✅ analysed, all reconciled to their rollups |
| **EcoSure** | `getScoredVisitListResults`, third-party category | two full years, 53 and 54 visits | ⚠️ **analysed, but see below** |

## ⚠️ The one loose end inside the scope: which YEARS the EcoSure captures are

Both EcoSure pulls came from the Network tab, which does not echo the year, and the owner did not
say which was selected. They are recorded as year-unconfirmed:

| capture | visits | mean | pass | fails |
|---|---|---|---|---|
| A | 53 | 0.896 | 52/53 (98.1%) | 1 critical |
| B | 54 | 0.882 | 50/54 (92.6%) | 1 critical + 3 non-critical |

Both are ~2/store, consistent with a **complete** year at the owner's stated EcoSure cadence — so
they are most likely two of 2024/2025, not the partial 2026. **But that is an inference.**

**Owner's recollection, 2026-08-22:** *"I would think a is 2024 and b is 2025."*

⚠️ **Recorded as a recollection, not a fact** — the phrasing is explicitly tentative, and *this same
session already produced a mislabelled-year artifact* from exactly this kind of assumption (a
capture labelled 2024 that was byte-identical 2025 data). Treating "I would think" as settled is
the error that cost a round trip once today already.

**Weak corroboration, both directions checked:**

| | |
|---|---|
| ✅ supports | RGR's comprehensive `foodSafety` **area** fell 0.978 (2024) → 0.953 (2025). EcoSure A → B falls 0.896 → 0.882. **Same direction.** But these are different instruments, and a two-point comparison agrees by chance half the time. |
| ⚠️ does not support | Tishomingo (43380): RGR has 0 visits in 2024 and 1 in 2025; EcoSure has 2 in A and 0 in B. Under A=2024/B=2025 that is EcoSure-but-not-RGR in 2024 and the reverse in 2025. Not contradictory — separate programmes — but no help either. |

## ✅ RESOLVED — and the answer is the REVERSE: **A = 2025, B = 2024**

**Owner supplied the deciding test:** *"My evidence is when Tishomingo opened."* The method is
right, and applied against the CFV history it settles the question — in the opposite direction to
the recollection.

**Measured from `getCfvHistory` (217 visits, per-store first-visit dates):**

| store | first CFV visit | n |
|---|---|---|
| **43380 TISHOMINGO** | **2025-04-15** | 5 |
| 43701 PONCE DE LEON | 2026-06-20 | 2 |
| every other store | 2023-01-18 … 2023-06-27 | 6–12 |
| estate median first visit | 2023-04-21 | |

**Tishomingo generated no graded visits before April 2025**, while all 25 established stores reach
back to early 2023.

Therefore:

| capture | Tishomingo EcoSure visits | ⇒ year |
|---|---|---|
| **A** (53 visits, 0.896, 1 critical fail) | **2** | **must be 2025** — it cannot be a year the store wasn't operating |
| **B** (54 visits, 0.882, 1 critical + 3 non-critical) | **0** | **2024** |

⚠️ Strictly this shows Tishomingo was not generating visits *under this operator* before Apr 2025 —
"opened" versus "acquired" is not distinguished by the data. **The conclusion is robust to either**:
a year with two Tishomingo EcoSure visits is not 2024 on either reading.

**So EcoSure improved 2024 → 2025** (0.882 → 0.896, and 4 fails → 1), which is the opposite of the
trend I noted when the ordering was assumed the other way. **Anything written against the earlier
ordering is wrong and should be re-read.**

📌 **This also retired my own weak counter-signal.** I had flagged Tishomingo's visit pattern as
"does not support" the ordering. It was in fact the *decisive* evidence — I read it as noise
because I had no store-opening context. **A pattern that looks like an anomaly is worth asking the
owner about before filing it as noise;** he identified in one line what the statistics could not.

## 🔴 And it withdraws the Ponce de Leon escalation

Earlier in this file I wrote that Ponce de Leon (43701) is *"ungraded across EVERY dataset seen …
no longer a curiosity; escalate it to PACE."*

**Withdrawn. Ponce de Leon's first CFV visit is 2026-06-20 and it has exactly two, both in 2026.**
It is a **new store**, not a neglected one. Zero RGR visits in 2024/2025/2026 and zero EcoSure in
both years is exactly what a store that began operating mid-2026 should show — RGR runs ~1/store/yr
and EcoSure 2/yr, so neither has come round yet.

**Do not raise it with PACE.** The same applies to any Meridian surface that would flag it: a store
with no graded-visit history because it is new must not be presented as a coverage failure.
`43380` deserves the same care — 5 CFV visits since Apr 2025 is a full record for its age, not a
thin one.

⚠️ Also still unknown: the EcoSure **`category=` value** itself. `thirdPartyFoodSafety` — its own
response block name — returns HTTP 400, and the vocabulary is not guessable. Read it off a live
request via the resource-timing one-liner if an automated pull is ever built.

---

# ✅ Addendum — manual EcoSure ingestion shipped (2026-09-04), matching this file's own "manual
first" recommendation

Owner asked to start on EcoSure automation. Given everything already settled above (headless SSO
is impossible, MFA-blocked; the on-demand-button + persistent-profile design needs a self-hosted
runner this session has no access to build or test against; and this file's own explicit
recommendation was **"Manual capture into the existing upload path — do this first"**), the actual
buildable work this pass was the missing half of that plan: EcoSure had a documented format but no
ingest path at all. `src/parsers/graded-visits.js`'s own comment — *"RGR / Ecosure use a different
layout — add adapters later... add Ecosure the same way once its format is known"* — is now
actionable, since this file fully documented that format.

## What shipped
- **`parseEcoSureVisit()`** (`src/parsers/graded-visits.js`) — pure JSON→`graded_visits`-shape
  mapper, tested against a fixture built from this file's own documented schema, anchored to the
  verified Ardmore-Broadway arithmetic (86/100, FS15/18/25/26 cited, 3+5+3+3=14 lost). Deliberately
  trusts `visitMeetsTargetFlag` for `pass` rather than re-deriving a threshold rule from score or
  `criticalFlag` — the exact target formula was never captured, and guessing one would be exactly
  the "reason instead of measure" mistake this file's own standing rule warns against repeatedly.
  `criticalFailCount` is computed and surfaced separately (`modules.criticalFailCount`), per this
  file's own note that "whatever replaces the waste flag must surface criticalFailQuantity
  separately from score."
- **PII handled as specified**: `reviewedWithName` never reaches `graded_visits` as plaintext.
  `saveGradedVisits()` (`src/lib/supabase.js`) now tokenizes it via the same
  `get_or_create_employee_token()` RPC / `tokenizeRows()` helper `saveAuditRows()` already uses,
  writing only the resulting token into `visit_by` (EcoSure's closest existing column — no new
  column added). Only the token, never the name, reaches the table; verified by a test that
  inspects the exact upsert payload, not just that `tokenizeRows()` itself works.
- **Upload UI** (`src/views/graded-visits.js`) now accepts `.json` files alongside CFV/RGR's
  `.html` exports, routing to `parseEcoSureVisit()`. Source: save the raw JSON response body from
  `getThirdPartyFoodSafetyVisitReport` (DevTools → Network tab) as a `.json` file, one per visit —
  same manual-capture motion as every other endpoint this file documents, formalized into the app
  instead of a one-off console/curl capture.
- Once ingested, EcoSure visits flow into `ds.gradedVisits` with `reportType: 'EcoSure'` — the
  exact shape `analyzeGradedVisits()`/`calibrateReadiness()` (`src/engine/visit-readiness.js`)
  already expected and gated on (`hasEcoSure`), which until now was always false because nothing
  had ever populated it. No engine changes were needed; the consumer side was already built and
  waiting.
- 15 new tests (`dispatch-ecosure-visit-parser.test.js`, `dispatch-ecosure-save-tokenization.test.js`).

## Deliberately not done this pass
- **No automation.** This file's own MFA/Akamai/self-hosted-runner analysis above is unchanged and
  still the standing design if/when automation is revisited — nothing here supersedes it.
- **No UI surfacing of EcoSure results beyond the existing Graded Visits panel.** They show up
  there automatically (same panel CFV/RGR already use, filterable by `reportType`), but nothing
  new was built to highlight EcoSure specifically (e.g., replacing the Visit Readiness food-safety
  gap note, which dispatch #69 already correctly labels as a genuine, unmodelled gap rather than
  claiming an automated feed exists).
- **The `category=` value for the rollup endpoint is still unknown** (see above) — irrelevant to
  this ingestion path, which uses the per-visit report endpoint, not the rollup.
- **No backfill.** Ingestion is manual, one visit at a time, same cadence as CFV/RGR today. The
  owner has the two years of EcoSure data already captured and summarized in this file's earlier
  addenda (2024/2025, resolved which-year-is-which) — re-entering those as individual visits was
  not attempted here, since the per-visit JSON for each of those ~107 visits was never itself saved
  (only the aggregate rollup was).

---

# 🎯 Addendum — bulk visitId enumeration FOUND (2026-09-04), and a real parser bug it exposed

This file's "still open" item 6 — *"EcoSure visitIds cannot currently be enumerated in bulk, only
read off the UI one visit at a time"* — **is resolved.** The owner captured a full HAR of a live,
authenticated Propel session (browsing Restaurant Visit History for two stores, one at
`hierarchy-level 12` directly and one reached via the operator-level Scored Visit Results screen)
and it hit two of the four actions this file listed as "unexplored, deprioritized, do not spend
captures on these." One of them answers the enumeration question outright.

## `getBrandProtectionVisits` IS the bulk EcoSure visit-list endpoint

```
GET /api/visits?v=801&action=getBrandProtectionVisits&locationId=<store hierarchyNodeId>&cultureName=en-US
```

Despite its name (probably a legacy/internal label for the whole third-party-audit family), the
response is **one store's complete graded-visit history across several programs**, mixed in a
single `brand_protection_visits[]` array, disambiguated by `visitTypeDescription`. Measured on one
live store (`hierarchyNodeId 195500301853`, 16 total rows):

| `visitTypeDescription` | count | meaning |
|---|---|---|
| `visits.thirdPartyFoodSafety` | 10 | **EcoSure** — 2022 through 2026, one row per visit |
| `visits.runningGreatRestaurants` | 4 | RGR |
| `visits.rgrHealthAndSafety` | 2 | RGR Health & Safety (a program not otherwise documented in this file) |

Each `thirdPartyFoodSafety` row carries `visitId`, `visitDate`, `visitYear`, plus a **coarse
score/result already computed** (`foodSafetyResult` grade letter, `foodSafetyPercentage`,
`foodSafetyMissedCriticalQuestionQuantity`, `visitMeetsTargetFlag`) — useful for a quick rollup
without a second call, but the per-question `questions[]` detail this file's core finding depends
on still requires the follow-up `getThirdPartyFoodSafetyVisitReport&visitId=<id>` call per visit.

**The full enumeration chain, all three legs confirmed live in the same capture:**
1. `getDescendants` (`parentHierarchyLevel=11&parentHierarchyNode=<operator root>&childHierarchyLevel=12`) → every store's `hierarchyNodeId` + name (one call, `totalCount: 27`, matches the estate size this file already established).
2. `getBrandProtectionVisits&locationId=<hierarchyNodeId>` per store → that store's full visit history with `visitId`s, filterable to `thirdPartyFoodSafety`.
3. `getThirdPartyFoodSafetyVisitReport&visitId=<id>` per EcoSure visit (already documented above) → the full per-question report.

A **browser-console script implementing this chain** now exists:
`scripts/browser-ecosure-bulk-capture.js` — paste into DevTools Console on a signed-in
`propel.mcd.com` tab; it walks all 27 stores, downloads a seed file in
`memory/data/ecosure-visits-seed.json`'s exact shape, ready for
`scripts/import-ecosure-history.mjs`. Uses `fetch(..., {credentials:'include'})` so the browser's
own session cookies carry the auth — the script itself never reads or transmits a credential value.
This turns backfill from "one hand-read visitId per capture" into "one console paste per session,"
though it still requires a human physically at a signed-in browser (SSO+MFA still blocks any
unattended path — unchanged from this file's security section).

**Corrected 2026-09-04, two real runs:** the script's first `getDescendants` call used
`rowsPerPage=100` and got a live **400 Bad Request** (the owner ran it and pasted the console
error). First fix attempt — matching `rowsPerPage=20`, the exact value the real HAR capture used
— was WRONG, or at least incomplete: the owner re-ran it and got the identical 400, on a request
whose query string was now byte-identical to the proven-working capture.

**The real cause, found by re-reading the HAR's own request headers (names + non-secret values
only) for that exact call:** every `/api/` request the real app makes carries three custom headers
— `hierarchy-level`, `hierarchy-node`, `territory-code` — set by the app's own HTTP client. A
plain browser `fetch()` never sends these; only cookies (`credentials:'include'`) and standard
headers travel automatically. The server was rejecting the request outright for missing them (400,
not 401/403 — consistent with a malformed/incomplete request rather than an auth failure).

Cross-checking multiple captured calls confirmed the values reflect the **current page the signed-
in user is on**, not the query's own target params — the SAME `getDescendants` action (querying
the operator's stores, `parentHierarchyNode=1000890759`) carried `hierarchy-level:11,
hierarchy-node:1000890759` while the user was on the operator root page, and `hierarchy-level:12,
hierarchy-node:195500301853` once the user had navigated to a specific store's page — proving
there's no single value tied to the query itself, just "a node this session legitimately has
access to." `scripts/browser-ecosure-bulk-capture.js` now sends the operator root as this context
for the store-list call, and each store's own node for its per-store calls — mirroring exactly
what the real navigation produced. Not yet re-confirmed working end-to-end; the owner will re-run
the corrected script next.

## 🔴 This also exposed a real bug in the shipped parser — now fixed

The real `getThirdPartyFoodSafetyVisitReport` response wraps the report in a `results` envelope —
`{"results": {"restaurantName": ..., "restaurantNumber": ..., "questions": [...], ...}}` — not the
flat object this file's own payload section (and the fixture in
`dispatch-ecosure-visit-parser.test.js`) assumed. `parseEcoSureVisit()` (`src/parsers/graded-visits.js`)
was never checked against a real captured response until this HAR — the shipped fixture was
hand-built flat from this file's prose documentation and passed every test while being
unrepresentative of the actual wire shape. **Fixed 2026-09-04**: the function now unwraps
`{results: {...}}` when present, falling back to the input as-is otherwise (so the existing flat
fixtures, and any future pre-unwrapped caller, still work). Three new tests cover the wrapped
shape (object and JSON-string forms) plus the flat back-compat case. `browser-ecosure-bulk-capture.js`
deliberately stores the RAW wrapped response in the seed file — do not unwrap it before saving;
the parser does that itself.

**What this changes about the earlier `getThirdPartyFoodSafetyVisitReport` payload doc above**:
that section's field list is otherwise still accurate — it just needs a `results.` prefix in front
of every field name when reading the raw HTTP response body. Not correcting that section in place
(it would just be a v.results.restaurantName rewrite of already-correct field names) — flagging
here so a future reader checking the wire shape against this file's prose does not repeat the same
gap this addendum found.

## The `visitType=4` operator-level rollup — checked, not a new capability

The same HAR also called `getScoredVisitListResults` with `visitType=4` (no `category=`) at the
operator level — a candidate for the long-open "what does a non-zero `visitType` value mean"
question. **Confirmed: `visitType=4` = the third-party-food-safety (EcoSure) category filter on
the existing rollup**, e.g. `rollupResults.thirdPartyFoodSafety: {visitQuantity, scorePercentage,
passPercentage, ...}` and each per-store row's `childHierarchyNodeName` + its own
`thirdPartyFoodSafety` sub-object. This is the **same per-store ANNUAL ROLLUP shape** already
established as a dead end for ingest in `memory/finding-propel-scored-visits-are-rollups-2026-08-23.md`
(no visitId, no per-visit dates, one row per store) — `visitType=4` answers what the parameter
means, but changes nothing about that dead end. The real enumeration path is `getBrandProtectionVisits`
above, not this rollup.

## The other three "unexplored, deprioritized" actions — now measured, still not useful for EcoSure

The same capture also hit `getPaceSupportVisits` (empty, `[]`), `getMarketSupportVisits` (4 rows,
`visitTypeDescription: "Check-In Visits"`), and `getMarketAdditionalVisits` (11 rows, including a
**newly observed** `customerCare.healthDepartmentInspection` type — an unrelated program, paired
with its own per-visit action `getHdiVisitReport&visitId=<id>`, spotted in the same capture's
navigation but not otherwise investigated here). None of these three carry `thirdPartyFoodSafety`
rows — `getBrandProtectionVisits` remains the only one that matters for EcoSure. Recording the HDI
action name for a future session; not pursuing it now — it is outside this file's scope (CFV/RGR/
EcoSure) and the owner's 2026-08-22 deprioritization of "additional visits" still stands for
anything beyond the three that matter.
