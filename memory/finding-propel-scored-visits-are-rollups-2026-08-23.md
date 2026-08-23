---
name: finding-propel-scored-visits-are-rollups-2026-08-23
description: The Propel Excel export path for CFV/RGR/3PFS is per-store annual rollups with no dates or visit IDs — use the already-documented API path instead. Also records that 3PFS = EcoSure, and corrects a session that re-hunted a closed question.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# The Propel Excel exports are rollups — and this question was already closed

**Date:** 2026-08-23
**Supersedes nothing.** This is a **narrow addendum** to
`memory/finding-ecosure-propel-api-2026-08-22.md`, which remains the authority.

---

## 🔴 Read this first — the correction

The evening of 2026-08-23 was spent hunting a per-visit graded-visit endpoint on `peak.mcd.com`.
**That hunt was unnecessary.** `finding-ecosure-propel-api-2026-08-22.md` had already closed it the
day before, and says so explicitly:

> ✅ **Scope closed on the three instruments that matter** … the estate's graded-visit picture is
> **complete for present purposes** with the three that matter. **Do not re-raise them as a gap.**

| instrument | endpoint already documented | already captured |
|---|---|---|
| CFV | `getCfvHistory`, per-store | 217 visits, 2023-01 → 2026-08 |
| RGR | `getScoredVisitListResults`, `category=visitResult` | 2024 (27), 2025 (27), 2026 (15) |
| EcoSure | `getScoredVisitListResults`, third-party category | 2024 (54 visits), 2025 (53 visits) |

Per-visit EcoSure detail — including `visitDate` and all FS1…FS36 questions — comes from
`getThirdPartyFoodSafetyVisitReport&visitId=<id>`, documented since 08-22.

⚠️ **SCOPE OF THAT CLOSURE — read before quoting it.** "Closed" means: for each of the three
instruments we can get **dated, per-store, per-visit SCORES**. It does **NOT** mean everything
about them is solved. One thing is genuinely open, and this file's own wording caused it to be
reported as closed:

> **Open question 6 (`finding-ecosure-propel-api-2026-08-22.md:366`) — still open.** The EcoSure
> visit-list rows **carry no `visitId`**, and `getThirdPartyFoodSafetyVisitReport` requires one.
> So the per-question **FS1…FS36 detail cannot be enumerated unattended.** The one working call
> used a `visitId` lifted from the UI by hand. Verbatim: *"Still open, and it is what per-question
> detail depends on."*

That matters because the per-question detail is the payload that would **replace** Visit
Readiness's waste/holding food-safety proxy. Scores alone only calibrate it.

📌 **Measured failure of this file's framing.** On 2026-08-23, SAGE — reading this very file —
answered "is there a per-visit endpoint?" with *"EcoSure ✅ Closed by the addendum"*, citing this
document. It had read the blunt "do not re-raise as a gap" line and generalised it over an item
that is not closed. **Suppressing real work is a worse failure than the duplicated hunt this file
was written to prevent**, so the carve-out above is load-bearing, not a footnote. Quote the closure
*with* its scope, or not at all.

**The actual open item was never "find the endpoint."** Per `roadmap-2026-08-23.md`'s HELD
section, it is that **the rows were captured on 08-22 and never committed** — an ingest and
persistence task, not a discovery task. `dispatch-78.md` describes a *re*-capture for that reason.

### Why the miss happened, so it doesn't repeat

The corpus was not read before the hunt resumed. `memory/` now holds ~20 `finding-*` files on this
one workstream, and two of them (`finding-ecosure-propel-api-2026-08-22.md` at 1,232 lines,
`finding-peak-cfv-api-2026-08-22.md`) already contained every answer being re-derived. **Grep
`memory/` for the endpoint or the programme name before opening a capture session.** This is the
same failure the Band 2 roadmap entry documents against itself — a claim inherited and acted on
*without checking current state*.

📌 It also cost the owner several hours at the Mac on a Saturday. That is the real price of
skipping a two-minute grep.

## What today genuinely added

### 1. `3PFS` = "Third Party Food Safety" = **EcoSure**

Nothing in the Propel UI or the export filename says "EcoSure", which is why the acronym had not
been connected to the instrument by name. Minor, but it is the label to search on in the UI.

### 2. The **Excel export path is useless for ingest** — prefer the API, always

All three exports (`PROPEL_SCORED_VISITS_CFV`, `_RGR`, `_3PFS`) share one shape:

| property | value |
|---|---|
| granularity | **one row per store**, plus a leading district total row |
| rows | 1 district + 27 stores = 28 |
| dates | **none** — no visit date, no period, no year column |
| visit IDs | **none** |
| per-visit rows | **none** — a store with 2 visits is still 1 row |

So the export is an **annual rollup over an implicit period the file does not name**. The `year`
selector in the Propel UI changes what is aggregated but is not written into the file, which is
why the same export pulled for 2024/2025/2026 looks identical.

This is a concrete instance of the standing **API-over-email/export** rule: the API takes a
`year=` parameter and returns dated per-visit rows; the export throws that away. Do not build an
ingest on the export path for any of the three.

⚠️ **`27` fooled a gate on this workstream twice.** 27 is the *store* count, so any check
expecting 27 rows from a per-visit source is satisfied by a per-store rollup and proves nothing.
Gate on **field names** (is there a `visitDate`? a `visitId`?), never on row count.

### 3. EcoSure rollup scores, as a cross-check only

District (27 restaurants): **39 completed, 39 acceptable, 0 non-critical fail, 0 critical fail,
score 0.913.** Every store is `Acceptable` with zero fails of either class, so the pass/fail
columns carry no signal — the range lives entirely in `Score`, 0.850 → 1.000.

Bottom five: **37566 Mossy Head .850 · 33222 Elgin .855 · 35064 Holdenville .860 ·
18213 Lindsay .865 · 03708 Ardmore-Broadway .875.**
Top: 05985 Durant 1.000 · 13113 Madill 1.000 · 20475 OKC-I-240 .970 · 43380 Tishomingo .970 ·
43701 Ponce de Leon .970.

**Use the API captures, not this table, for anything real** — these are undated and lower
resolution. Its only value is as a reconciliation target for an API-based ingest, and note the
08-22 analysis already reconciled the RGR captures to their rollups this way.

**Do not average the 27 store scores** to get a district figure. The rollup's own **0.913** is the
authority; `Completed` varies (1 or 2 per store), so a straight mean weights a 1-visit store equal
to a 2-visit one. Standing never-average-averages rule.

## ⚠️ Host mapping — PEAK and Propel OVERLAP, they do not partition

**Owner-stated 2026-08-23:** *"cfv and rgr data on both sites. downloadable copies only on peak."*

So the split *"PEAK = CFV/RGR, Propel = EcoSure"* is **wrong**, and SAGE repeated it on 2026-08-23
after reading these files. Corroborated in the corpus: **`getCfvHistory` is on
`propel.mcd.com/api/visits`** (`finding-ecosure-propel-api-2026-08-22.md:1072`) — the same host and
same `/api/visits` entry point as EcoSure, differing only by `action=`.

| | |
|---|---|
| CFV, RGR | **both hosts** |
| EcoSure | Propel (`action=getThirdPartyFoodSafetyVisitReport`) |
| Downloadable exports | **PEAK only** — and per this file, those exports are rollups |

Practical consequence: **the host does not identify the instrument** — check host *and* `action=`
together. And since the only downloadable copies live on PEAK, "I can export it from PEAK" is not
evidence that per-visit data exists there; it is evidence of the rollup path this file documents.

## PEAK routes captured (recorded so the session isn't a total loss)

From a Comprehensive Visit Report — store 06972 Ada-Country Club, *"Running Great Restaurants Visit
— Running Great Restaurants 2026 — Announced"*, 10-Feb-2026, score 92.1%, **VisitId 8308164**:

- `/API/Visit/GetStoreDetails/195500301143?isChecked=false|true` — argument is a **hierarchy node
  (store) id**, not a visit id
- `/API/Visit/RoipSurvey/8308164`
- `/API/Report/GetVisitReportsByVisitId/8308164`
- `/API/Report/Recap/8308164`

A bare `fetch()` of `GetStoreDetails` from the page console returns **HTML**
(`Unexpected token '<', "<!doctype "…`) rather than JSON — SPA shell or login redirect, cause
unmeasured. **Not worth chasing**: PEAK's `RoipSurvey/<VisitId>` was already recorded as needing an
id nobody can enumerate, and Propel's documented API path supplies the same visits *with* ids and
dates. Logged only so a future session doesn't spend another evening rediscovering these URLs.

## What is actually left on graded visits

Not discovery. **Ingest and persistence:** take the already-documented endpoints, re-capture, and
land the rows in Supabase with `tenant_id` + RLS like every other stream. That is
`dispatch-78.md`'s job. ✏️ **Correction:** an earlier version of this line said dispatch #78 "needs
rewriting to target the API path rather than an export." That was wrong — #78 already targets
`getScoredVisitListResults` with `category=visitResult` and `year=`. Its only weakness was a
count-based verification gate, since 27 is also the store count; that has been amended to assert
non-null `visitDate` and `visitId` per row.

**Plus one discovery item that is NOT closed:** enumerating EcoSure `visitId`s (open question 6
above). Until that lands, per-question FS1…FS36 detail stays a manual, one-visit-at-a-time pull.
