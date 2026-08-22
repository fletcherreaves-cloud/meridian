---
name: finding-peak-cfv-api-2026-08-22
description: peak.mcd.com is a SECOND, separate McD site from propel.mcd.com and it carries CFV and RGR visits. A captured RoipSurvey response gives per-QUESTION scores and TimerData score bands the current PDF parser does not have, plus a cycle handle that may make the owner's prior-year backfill a pull. Includes a correction — daypart/weekpart/channel are NOT new; Meridian already parses and stores all three, so the matched Model Check re-measure needs no new pull at all.
metadata:
  node_type: memory
  type: finding
---

# PEAK (`peak.mcd.com`) — CFV / RGR visits have an API, and it carries daypart + channel

Owner-captured 2026-08-22. **No credentials are recorded in this file; see the security note.**

> **PEAK is not Propel.** Owner, verbatim: *"the last I sent you is for PEAK site > another site
> for CFV and RGR and other reports."* `propel.mcd.com` = **EcoSure third-party food safety**
> (`memory/finding-ecosure-propel-api-2026-08-22.md`). `peak.mcd.com` = **CFV, RGR and other
> visit reports**. Two hosts, two APIs, two auth sessions. Do not conflate them — an earlier
> reading of this session's captures nearly did.

---

## 🔴 CORRECTION — checked the codebase before shipping this claim

My first draft of this file said the capture "unblocks" the daypart/channel-matched Model Check,
on the reasoning that `finding-cfv-2026-visit-rules.md` had named daypart and channel as the two
missing fields. **I then read the code, and that claim was wrong.** Recorded here rather than
quietly edited out, per the standing measure-don't-reason rule — this is the second time in this
session that a confident inference about an external system survived until someone checked.

**Meridian already has daypart, weekpart and channel on every graded visit, today:**

| where | evidence |
|---|---|
| PDF parser | `src/parsers/graded-visits.js:80,81` — `daypart: _after(L,'Day parts')`, `weekpart: _after(L,'Weekpart')` |
| channel | `channelOf()` (`:67`) — *"the FIRST module listed under the Score Calculator … 'Behind the Counter' is the always-present companion module, not the order method"* |
| Supabase | `graded_visits` carries `daypart` / `weekpart` / `channel` columns (`src/lib/supabase.js:2653,2654,2660`) |
| already rendered | `VisitPatterns` (`src/views/visit-readiness.js:266`) breaks actual outcomes down by day-of-week, **daypart**, **weekpart** and **channel** |

Note that `channelOf()`'s rule — first module that is not "Behind the Counter" — is **exactly** the
structure the PEAK payload exposes as `RootCategories` (`"Curbside"` + `"Behind the Counter"`). The
PDF and the API are two renderings of one object. That is corroboration, not new information.

### What this correction is worth

**Good news, and better than the wrong version.** The daypart/channel-matched re-measure that
`notes-visit-readiness-backlog-2026-08-22.md` item 2(b) proposes **needs no new data pull at all.**
It can be run against the existing `graded_visits` rows today. The backlog note framed 2(b) as
windowing the *model side* to 11:00–17:00 (`hour_slot` 12:00–17:00); the visit side can now be
matched exactly, per visit, rather than assumed from the policy window — and it can be done for the
old regime too, where the policy window did not apply. **That moves 2(b) from "cheap" to "cheapest
thing on the list."**

⚠️ Still unmeasured: **how populated those columns actually are.** `_after(L,'Day parts')` returns
null when the PDF layout differs, RGR sets `channel: null` by design (`:158` — whole-restaurant, not
single-channel), and the anon key returns zero rows on `graded_visits` (tenant-scoped RLS), so I
could not count them from here. **Check per-visit fill rate before relying on the match** — a column
that exists is not a column that is populated, which is the same trap `section:` fell into.

## What PEAK genuinely adds

Setting the daypart/channel claim aside, four things here are real:

1. **An API in place of a manual PDF drop.** Graded visits are currently a manual upload. The
   standing **API-over-email/manual** rule points straight at this: an API takes a range and can
   re-pull to correct itself; a PDF drop cannot.
2. **Backfill.** `ProgramCycleDescription: "Customer First Visit 2026"` suggests prior cycles are
   addressable. That is precisely the owner's *"I can backload data from last year"* plan, and it is
   the only route to a powered Model Check inside this calendar cycle. **Unverified — see open
   questions.**
3. **Per-QUESTION detail, which the PDF path does not have.** `parseModules()`
   (`src/parsers/graded-visits.js:47`) extracts module-level `{pct, ach, pos}` only. PEAK gives
   `ShortCode` / `Text` / `Score` / `PossibleScore` / `SelectedReasons` / `Comment` per question.
   Genuinely new resolution.
4. **`TimerData` score bands — the most actionable item in the capture.** Also absent from the PDF
   path. See below.

⚠️ It does **not** fix sample size. ρ=0.23, CI [−0.16, 0.56]; direction 51.9%, CI [34.0%, 69.3%].
Matching on daypart and channel *sharpens* each pair; it does not create more of them. Max 3
visits/store/year × 27 ≈ 81/year. Backfilling last year's cycle remains the only route to a powered
check this cycle.

## The endpoint

```
POST https://peak.mcd.com/API/Visit/RoipSurvey/<VisitId>
```

`<VisitId>` observed: `8721634`. Auth is **cookie-based** (`GlobalAS_SessionId`, plus SharePoint
federation `rtFa` and Akamai cookies) — same shape as Propel, a different session.

Companion endpoint captured the same day:

```
GET/POST https://peak.mcd.com/API/Stores/Paged/
```

→ the store list. Its `ID` is the join key: **PEAK `ID` = Propel `hierarchy-node`.** That single
fact links the two systems and is why the PEAK store list was worth capturing (recorded in the
Propel finding as the solution to the hierarchy-node mapping problem).

## The payload

### Visit envelope

| field | observed / meaning |
|---|---|
| `SurveyType.TypeId` | **`3801`** — the CFV discriminator |
| `SurveyType.Description` | `"Customer First Visit"` |
| `SurveyType.ShortDescription` | `"CFV Visit"` |
| `ProgramCycleDescription` | `"Customer First Visit 2026"` — the annual cycle, so a prior-year backfill is addressable by cycle |
| `VisitId`, `AuditId` | visit identity |
| `StoreId` | = PEAK `ID` = Propel `hierarchy-node` |
| `StoreCode` | the store number |
| `IsComplete`, `VisitCompleteTime` | completion state |

### `VisitDetails` — confirms, but does not add, the daypart/channel fields

| field | observed |
|---|---|
| **`VisitDaypart`** | **`"Snack"`** |
| **`VisitWeekpart`** | **`"Weekday"`** |
| `VisitDate` | visit date |
| `VisitDoneByName` | shopper name — **PII, tokenize on ingest** |
| `Supervisor`, `RestaurantManager` | **PII, tokenize on ingest** |
| `Comment` | free text — may contain names |

### `RootCategories` — a nested question tree

The **root node is the channel**: `"Curbside"` observed, alongside `"Behind the Counter"`. So the
channel is not a field — it is the tree's top level. Ingest must read it from the root name, not
look for a `channel` key.

This is the **same structure** `src/parsers/graded-visits.js:67`'s `channelOf()` already reads out
of the PDF (*"the FIRST module listed … 'Behind the Counter' is the always-present companion
module"*). Two renderings of one object — so an API ingest can reuse that rule verbatim rather than
inventing a second one, and the two paths cannot drift on channel.

Per question:

`ShortCode` · `Text` · `Score` · `PossibleScore` · `SelectedReasons` · `Comment` ·
`AllowableValues` · `Reasons`

### `TimerData` — banded service-time scoring

Timed questions carry their own score bands. Observed for `CU5-US`:

| time | points |
|---|---|
| ≤ 135 s | 8 |
| 136–162 s | 7 |
| 163–188 s | 5 |
| 189–214 s | 3 |
| 215–240 s | 1 |
| 241 s+ | 0 |

Measured on this visit: **110 s → 8 pts.**

📌 **These bands are a finding in their own right.** Visit Readiness currently grades Speed
against `DEFAULT_TARGETS`, i.e. *our* internal targets. CFV grades it against *these* bands. If
the model is meant to predict a CFV score, the Speed component should be graded on the bands the
CFV actually applies — that is a scoring-fidelity improvement independent of sample size, and it
does not require a single extra visit to implement.

⚠️ Do not assume these bands are global. They were observed on one question (`CU5-US`) on one
visit in the 2026 cycle. `TimerData` is per-question, so read the bands from the payload rather
than hardcoding them.

---

## Open questions (do NOT assume — measure)

1. **Is there a visit-LIST endpoint?** `RoipSurvey/<VisitId>` needs an id you already have. The
   equivalent gap exists on Propel (its visit-list endpoint is likewise still unfound). Without
   one, neither a backfill nor an ongoing pull can enumerate. **This is the single highest-value
   next capture on either host.**
2. **Does `SurveyType.TypeId` enumerate RGR?** `3801` = CFV. RGR/RGRV presumably has its own id
   on the same `RoipSurvey` shape — unverified.
3. **Can a prior `ProgramCycleDescription` be requested?** If the 2025 cycle is reachable, the
   owner's backload plan is a pull, not a re-key. Untested.
4. **`compType`/business-day boundary** — `VisitDate` vs the 4am business day. A visit at
   00:30 belongs to the previous business day. Check before joining to any daily metric.

---

## Constraints inherited from the Propel finding (they apply here too)

- **SSO + MFA.** Owner confirmed both. Headless automation is ruled out; the persistent
  authenticated Chromium profile on the **#65 Mac mini runner** is the automation path if one is
  built. Manual capture first — the cadence (≤81 visits/year) does not justify a fragile pipeline.
- **Akamai is present and did not challenge.** Do not over-engineer for it; handle a challenge if
  one is observed.
- **PII.** `VisitDoneByName`, `Supervisor`, `RestaurantManager` route through
  `get_or_create_employee_token()`. No plaintext name in a table, log, fixture, or memory file.
- **A new stream means the full checklist**: Supabase table with `tenant_id` + RLS,
  `sync-failure-watch.yml` registration, per-stream `STREAMS` freshness, manual fallback.

## 🔒 Security note

The captures were shared as full cURLs including live session cookies (`GlobalAS_SessionId`,
`rtFa`, Akamai `_abck`/`bm_sz`). **None of it is recorded here.** The session should be treated as
disclosed-by-sharing and re-authenticated. For future captures the URL, header *names*, and the
response body are sufficient — the cookie jar never needs to leave the browser.

---

# Addendum — the complete `hierarchyNodeId` → store map (2026-08-22)

Owner-captured. **`hierarchy-node` was the blocking unknown for BOTH Propel and PEAK, and this
resolves it for 26 of Meridian's 27 stores.**

```
GET https://propel.mcd.com/api/role/impersonateUser?eid=<EID>&v=778
    headers: hierarchy-level: 0 · hierarchy-node: <eid, lowercased> · territory-code: 840
             referer: https://propel.mcd.com/app/
```

Returns `roles[]`, one entry per node the user can act on. Two `hierarchyLevelType`s appear:

| type | `hierarchyLevelDescription` | what it is |
|---|---|---|
| **11** | `Operator` | the ownership entity — one node covering the whole estate |
| **12** | `Restaurant` | one node per store — **this is the `hierarchy-node` the visit APIs want** |

`hierarchyNodeName` is `"<5-digit store number> <STORE NAME>"`, so the join to Meridian's `loc` is
`hierarchyNodeName.slice(0,5).replace(/^0+/,'')`. Also returned: **`paceLastRefreshDate`**
(`"2026-08-18"` observed) — a real freshness stamp for the PACE side, worth surfacing if a pull is
ever built.

## The map

| `hierarchyNodeId` | store | Meridian `loc` |
|---|---|---|
| 195500300689 | 03708 ARDMORE-BROADWAY | 3708 |
| 195500300825 | 05183 CHICKASHA-SO 4TH | 5183 |
| 195500300979 | 05985 DURANT-US HWY 70 | 5985 |
| 195500235660 | 06178 CHIPLEY-ST.RD.77 | 6178 |
| 195500235547 | 06838 DEFUNIAK SPRINGS | 6838 |
| 195500301143 | 06972 ADA-COUNTRY CLUB | 6972 |
| 195500236896 | 10034 BONIFAY | 10034 |
| 195500301617 | 10422 ATOKA, OK-MISSISSIPPI | 10422 |
| 195500301679 | 10915 SEMINOLE, OK-MILT PHILLIPS | 10915 |
| 195500301853 | 11657 PURCELL | 11657 |
| 195500301860 | 13113 MADILL, HWY. 70 | 13113 |
| 195500302362 | 18213 LINDSAY, OK-WAL*MART | 18213 |
| 195500302430 | 20475 OKC-I-240/SOONER | 20475 |
| 195500332338 | 24471 ARDMORE, OK-NEC COOPER/12TH | 24471 |
| 195500347486 | 29760 DUNCAN, OK-HWY 81 (RELO) | 29760 |
| 195500511764 | 31357 PAULS VALLEY RELO - BALLARD RD NO. | 31357 |
| 195500479224 | 32525 SULPHUR,  OK | 32525 |
| 195500545486 | 33109 MARIETTA, OK | 33109 |
| 195500547640 | 33222 ELGIN, OK - STO | 33222 |
| 195500574400 | 33704 TECUMSEH, OK | 33704 |
| 195500602196 | 34222 HARRAH, OK | 34222 |
| 195500695075 | 35064 HOLDENVILLE, OK | 35064 |
| 195500698571 | 35242 COTTONDALE | 35242 |
| 195500857794 | 37566 MOSSY HEAD | 37566 |
| 195500495156 | 38609 FREEPORT | 38609 |
| 195500924854 | 43380 MAIN AND REFUGE-TISHOMINGO, OK | 43380 |
| 195500938240 | 43701 HWY 81 AND I-10-PONCE DE LEON, FL | 43701 |

## 🔴 Measured against `STORE_NAMES` — one store is missing, and it is not a parse error

Checked programmatically against `src/constants.js` rather than eyeballed:

```
STORE_NAMES:              27
PACE Restaurant roles:    26
matched:                  26
in PACE, not in Meridian:  0
in Meridian, not in PACE:  1  →  43701  Ponce de Leon-Hwy 81/I-10
```

✅ **RESOLVED same day — Ponce de Leon DOES have a node** (`195500938240`), observed on page 2 of
Propel's `getScoredVisitListResults` (`memory/finding-ecosure-propel-api-2026-08-22.md`). The map
above is complete at **27/27**. The gap was purely the per-user scope of `impersonateUser`, which is
what caveat 1 below predicted — **kept here because the caveat is the reusable lesson**: a
per-user endpoint is never the org roster.

~~Every PACE store exists in Meridian. Exactly one Meridian store — Ponce de Leon (43701) — has no
node in this hierarchy.~~ Nothing here explains why, and there are at least three ordinary
explanations, all checkable:

1. **The capture is scoped to ONE user.** This is `impersonateUser` for a *specific* eID, so the
   response is *that user's* access, not the org's roster. Ponce de Leon may simply sit outside it.
   ⚠️ **Do not treat this list as the authoritative store universe until it is re-run for the
   owner's own eID** — that is the single check that settles it.
2. Ponce de Leon may belong to a different operating entity.
3. It may be newer than the node set, or graded under a different program.

📌 **Whichever it is, a PACE-backed pull must not silently cover 26 of 27.** If Ponce de Leon
genuinely has no node, that is a declared coverage gap and belongs in `CoverageGaps`, not an
unremarked absence — the same discipline Visit Readiness already applies to Cleanliness.

## Why this matters

`memory/finding-ecosure-propel-api-2026-08-22.md` recorded `hierarchy-node` as the mapping problem
and named the PEAK store list as its solution. **This is a better solution**: one call, no
pagination, and it returns the node id *paired with the store number* rather than needing a join.
The same `hierarchyNodeId` addresses both hosts — Propel's EcoSure reports and PEAK's CFV/RGR
visits.

## 🔒 Security

The capture included a live `GlobalAS_SessionId`, an employee `eID`, and a person's name. **None of
the session id is recorded here.** The eID and the personal names are also deliberately omitted —
only the node→store mapping, which is org config, is kept. Per the standing rule, any name reaching
a table goes through `get_or_create_employee_token()`. **Re-authenticate the Propel session**; it
should be treated as disclosed by sharing.


---

## ✅ How to reach a CFV `VisitId` — owner-confirmed route (2026-08-22)

Open question 1 in this file asked for a visit-LIST endpoint, since `RoipSurvey/<VisitId>` needs an
id nobody could enumerate. **There is a known route to one.**

Owner: *"Clicking on CFV takes you to PEAK site fwiw."*

Propel's **Customer First** card (`propel.mcd.com`, the summary tile reading *% Meeting 80% / %
Below 80%*) is a link-out to PEAK. So Propel holds RGR + EcoSure and a CFV *summary*; PEAK holds the
CFV detail. **The click-through must land on a page that lists CFV visits in order to link to them
— so that landing request is the visit-list endpoint.**

**Capture instruction:** from Propel, click Customer First; on the PEAK page that loads, take the
request in the Network tab that returns the visit list (not `RoipSurvey`, which is the per-visit
detail). Response body only — no cookies needed.

⚠️ **But do Propel first.** Owner clarified that **Propel shows CFV *scoring*, just not the full
visit**. A Model Check pair needs only `(predicted readiness, actual score)` per store, so **Propel
alone answers it** — and its `year=` parameter is already proven, making 2024/2025/2026 a
one-constant change. This PEAK capture is required only for the per-question work (daypart,
channel, timer bands) in `memory/dispatch-69.md` Part D. Do not spend a PEAK capture on something
Propel already answers more cheaply.

⚠️ **Untested.** It is the most likely route, not a measured one. If the landing page turns out to
be a single pre-selected visit rather than a list, that is a finding too — say so rather than
assuming a list must exist somewhere.

### Why this is now the highest-value open capture

Propel's card reads **55.3% meeting 80% / 44.7% below**. RGR passes ~100% and EcoSure ~93–98%.
**CFV fails nearly half** — and at 3/store/yr it is also the highest-volume instrument (~81/yr vs
RGR ~27 and EcoSure ~54). It is simultaneously the biggest pair supply for the Visit Readiness
Model Check and the only instrument with real spread in its outcomes. Nothing else outstanding
comes close on either axis.
