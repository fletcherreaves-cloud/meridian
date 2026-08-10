---
name: decisions-panel-inventory-2026-08-10
description: OWNER DECISIONS (2026-08-10) on all 97 registry panels — keep / merge / retire, with the standing rule that "retire" means harvest-then-remove, never delete-on-sight. The input the UI/UX redesign scopes from.
metadata:
  type: project
---

# Panel decisions — owner, 2026-08-10

The owner worked through every panel in `src/app/panel-registry.js` and returned a full
keep/merge/retire set. **This is the input the redesign scopes from** — the information
architecture follows from these calls, not the other way round.

Recorded here because a 74-panel decision set is exactly the kind of thing that dies with a
session (see the three memory files already lost that way, per [[mac-session-todo-2026-08-06]] §7).

---

## ⭐ Standing rule the owner added: RETIRE means HARVEST-THEN-REMOVE

Owner, verbatim: *"let's scope this and strip anything worth keeping prior to retiring. Ex: A
different way to analyze the data that could supplement or accent what else we have."*

**Nothing on the retire list gets deleted until it has been scoped for salvage.** The question
asked of each is "what is genuinely distinct here that we would lose?" — not "confirm it is
redundant." If a panel holds a different analytical angle, a visualization treatment, or a
calculation that exists nowhere else, that gets lifted somewhere before the panel goes.

This applies to future retirements too, not just this batch.

---

## RETIRE — 9 unique items (harvest first)

`priority-brief` and `inventory` each appeared twice in the sheet (once in the duplicate-overlap
section, once in the hidden-panels section); they are one decision each, not two.

| Panel | id | Salvage note |
|---|---|---|
| Priority Actions | `priority-brief` | Owner: *"verify functions and strip of useful content first."* Third of three attention panels; the other two are merging. |
| Inventory (hidden) | `inventory` | Owner explicitly wants this scoped for "a different way to analyze the data." ⚠️ **The file also exports `parseInventoryData`, which `pipeline.js` imports — the panel can go, the file cannot.** |
| Revenue | `revintel` | Owner: *"Ok with retiring, just scope for anything valuable and incorporate if needed."* |
| Smart Targets v1 | `smart-targets` | Dormant, no nav entry, v2 does not reuse it. Lowest-risk removal on the list. |
| Orphan · AnomalyPanel | — | See orphan note below. |
| Orphan · AIInsightsLog | — | See orphan note below. |
| Orphan · DevDashboard | — | See orphan note below. |
| Orphan · ForecastAudit | — | See orphan note below. |
| 10 dead state flags | `VESTIGIAL_STATE` | Inert, but each is counted in `anyModalOpen`, which gates re-renders — removal is a small perf win, not only tidiness. |

### ⚠️ The orphans are NOT assumed to be junk

Owner, verbatim: *"these could be ideas i had and were partially executed with me moving so
fast, I assumed they just got skipped and forgot to revisit."*

All four are complete enough to render — something built them. They are being scoped against
three verdicts, not one: **FINISH-IT** (real distinct capability, wire it up), **HARVEST** (lift
the good part elsewhere), or **DELETE** (genuinely superseded). Check `git log` on each component
for the original commit message — that is the fastest route to the intent the owner is trying to
recall.

---

## MERGE — 8

| Panel | id | Merges into / how |
|---|---|---|
| Attention Now | `priorities` | Into **Needs Attention** (name kept). Two-part job — engine first, layout second. Layout chosen: severity-ranked store list, expandable, with clickable severity filter chips and an Acknowledged section at the top. **SHIPPED (v4.943 engine, v4.946 layout, 2026-08-10 — issues #113/#115).** `priorities` nav entry retired, `WhatNeedsAttentionPanel` deleted; the pinned district strip in the new `AttentionPanel` carries the loc-less alerts (sync staleness, signal decay) that panel used to be the only surface for. Full write-up in [[notes-63-queue]]. |
| End of Month | `fob-eom` | Into **Food Cost** as an EOM mode. Closes the "merge vs update" question open since 2026-08-06. |
| Count Cycle | `count-cycle` | Into **Inventory Control** as a tab — a view of the same data, not a separate job. |
| Calendar | `calendar-manager` | Into **Events & Tags**. Long-standing overlap, already pruned from nav. |
| Leadership One-Pager | `leader-one-pager` | Into **Above-Store One-Pager** with a scope selector. Three one-pagers → two. |
| Feature Requests | `feature-requests` | Into **Task Queue** with a type field. Owner asked for this in Notes 26. |
| Metric Correlations | `corr-explorer` | See the best-of-both decision below. |
| Help | `help` | **Rename to "Workflow."** Owner wants "Help" to mean troubleshooting, and a real two-mode (End User / Developer) Troubleshooting panel built. |

### Metric Correlations — owner asked for "the best of both worlds"

Owner: *"Good with merge, but like the layout and appearance of Metric Correlations a lot better."*

**Resolution: merge the ENGINE, keep the PRESENTATION.** Signals Scanner has the statistical
guardrails worth preserving — Pearson + Spearman, an effect-size floor, and Benjamini–Hochberg
FDR correction, which is real protection against spurious correlations across many metric pairs.
Metric Correlations has the interface the owner prefers. Take Scanner's math, Correlations'
presentation. Nothing is lost in either direction.

---

## KEEP — 55

Everything not listed above. Notable ones carrying follow-up work rather than a decision:

- **Planning** — ⚠️ **rename.** "PACE" collides with McDonald's internal meaning. Flagged in
  Notes 60 as *"cheap, and gets more expensive the longer it waits."*
- **Panel Manager** — must list ALL panels with a locked core section. **The owner asked for this
  twice** (Notes 25 #9 and Notes 27 #7) and the panel's current on-screen copy states the
  opposite. One of the clearest never-actioned asks in the whole backlog.
- **Sched Summary / Labor Analysis** — still read raw rows instead of the shared helpers; a
  standing-rule violation to fix, not a reason to retire.
- **Product Mix** — gates the Pricing Engine and the Filet-O-Fish-Friday correlation. Needs its
  auto-pull built.
- **Rankings** — needs the blank-metric fix and group-level (patch/operator/state/org) ranking.
- **Visit Readiness** — owner wants it reframed as diagnostic ("how to get and stay ready").
- **Record Days** — owner wants all-time, top-3, and near-misses.

### District Lens — the owner's call, and a design signal

Owner: *"One of my favorites! Could be merged with something, I like the heatmaps and
graphs/charts."*

**Decision: KEEP, and treat it as a reference rather than a merge candidate.** The owner named a
preference for the visual treatment twice in one message — heatmaps and charts here, Metric
Correlations' appearance there. That is a consistent signal, not a coincidence. District Lens
becomes the reference for how visual/exploratory analysis looks in the redesign: the thing other
panels borrow from, not the thing that gets absorbed.

---

## LOCKED — 9, excluded from the exercise

Standing owner directive to cautiously protect the forecast and diagnostic cluster:
`dialedin`, `dicompare`, `fcst-accuracy`, `fcst-ref`, `model-assign`, `pvsa`, `proj`, `lfz-gap`,
`lifelenz-bridge`.

Noted only: `proj` (Proj Workflow) shares a duplicate modal id with Projections and its nav line
is commented out. Flagged, not actioned — it is protected.

---

---

## Salvage scoping results (2026-08-10) — owner's hypothesis CONFIRMED

Scoped all 9 retire candidates. **Zero outright deletes — every one holds something worth taking.**

**Two were actively maintained AFTER becoming unreachable**, which is the strongest evidence for
the owner's "forgotten, not abandoned" read: `detectAnomalies` was migrated to `metricSeries` in
the August data-integrity sweep (PR #105), and `DevDashboard`'s Engine Trace was fixed in June
(v4.197). Nobody maintains code they have decided to abandon.

### ⚠️ CORRECTION — `ForecastAudit` is NOT an orphan. It is live in production.

`panel-registry.js`'s `ORPHANS` list is **wrong** about this one, and the panel decision sheet
inherited the error. `ForecastAudit` (`analytics.js:5753-5972`, ~220 lines) is rendered at
`projections.js:1808` with **three live user paths** (`:1196` deep-dive, `:1753` tab click,
`:1800` per-date 🔬 icon). Only the standalone `App.js` entry point is orphaned.

Nothing else in the app answers "why is this specific day's forecast this number?" — it walks all
seven `fetchLY` candidate offsets and reports why each was rejected. **Owner decision (2026-08-10):
promote it to a standalone panel** (~5 lines: registry entry + dispatch branch; the `App.js:3892`
render block already works).

**Bug to fix while in there:** `analytics.js:5772` does `const userEvents = settings._userEvents || {}`,
shadowing the `userEvents` prop. The sidebar (`:5834`) reads the prop; the detail pane reads the
shadowed value. If they diverge, the two disagree about the same date — in a panel whose entire
purpose is trustworthy explainability.

### Harvest list, ranked by what would actually be lost

| # | Source | Lift this | Into |
|---|---|---|---|
| 1 | `DevDashboard` (orphan) | **Data Audit coverage grid** — per-store × per-source row counts, first/last date, coverage %, Full/Partial pill. No live equivalent. **Would have surfaced the `labor_rows` staleness at a glance instead of two weeks late.** ~30 lines. | `DataManagerPanel` as a Coverage tab |
| 2 | `inventory` | **`computeTransfers`** — cross-store redistribution matching overstock↔understock for the same WRIN, same state, **ranked by haversine distance** over `INV_ORG_COORDS`. Nothing else does cross-store matching or uses those coords. Plus `invDist`, `invSameState`, `formatXferQty`. | new `src/engine/inventory-transfers.js`; surface as an attention-feed detector (it yields a natural `dollars` for `rankAttention`) |
| 3 | `inventory` | **`rollupByWRIN`** — duplicate-WRIN detection ("usage split across N WRINs, verify manager is using the correct one"). Real integrity finding, caught nowhere else. | `integrityFlags()` in `attention-feed.js` |
| 4 | `revintel` | **OEPE dollarization** — seconds→revenue, including `valuePerSecond`. Fills a real hole: `slowDT` currently reports `dollars: 0`, so slow drive-thrus cannot rank against FOB or sales items. | `attention-feed.js` `slowDT`, or `opportunity.js` as a guardrailed 4th pillar |
| 5 | `revintel` | **Daypart-asymmetry detector** — proportional decline across all dayparts = macro traffic; ONE daypart collapsing while others hold = competitor signature. Explanation copy already written. | new `daypartErosion` detector in `attention-feed.js` |
| 6 | `priority-brief` | **Forecast-calibration-gap flag** — fires only when MAPE > 12% AND zero crits AND zero watches: "operationally green but the forecast is broken." Structurally impossible to surface via `buildBrief` (operational metrics only) or `buildAttentionFeed` (no model-accuracy detector). | `attention-feed.js` as `forecastCalibrationGap` |
| 7 | `priority-brief` | **"This Week's Focus"** — ranks problem TYPES across stores, not stores. Everything else ranks stores. ⚠️ Rebuild against the structured `item.category` field, NOT the current substring-matching on finding prose (`f.m.includes('OT')` matches far too much). | merged attention panel header |
| 8 | `AnomalyPanel` | **Event-tagged baseline exclusion** — drops closure/remodel/weather days from the DOW baseline so a remodel doesn't poison the mean. `runScan`'s trimmed mean blunts outliers but doesn't know *why* a day was odd. | `runScan` in `analytics.js` (already owns the event registry + tagging UI) |
| 9 | `AIInsightsLog` | **Category taxonomy** (ops/ctrl/labor/sales/weather/anomaly/other + colors) — well-chosen buckets, exist nowhere else. Separately: **the unfinished idea is worth finishing** — every record carries `source:'manual'` and nothing ever writes a non-manual one, so scanners auto-filing findings was designed and never built. | taxonomy → `TaskQueuePanel` as a category facet; auto-file → `saveTask` from `AIBacktestScanner` |

### Why each panel is broken (all field-drift, no missing dependencies)

- **`AnomalyPanel`** — engine current and correct; the *panel* drifted. `store-analytics.js:133`
  calls `detectAnomalies(ds, stores)` but the signature is `(ds, userEvents)`, so event exclusion
  silently no-ops. Render reads `a.value`/`a.baseline`/`a.description`/`a.causes`; the engine emits
  `actual`/`mean`/`std`/`z`/`note` and never emits `causes`. The "Warning" tab tests a severity the
  engine never produces.
- **`AIInsightsLog`** — would work as-is today. Superseded by `TaskQueuePanel`/`FeatureRequestsPanel`
  (Supabase-backed vs its localStorage-only, single-device storage).
- **`DevDashboard`** — one span-nesting bug in the Engine Trace output. ⚠️ **Two different
  components share this name** — a live one in `management.js:27` (dev links, Supabase check) and
  this orphan. Deleting the orphan resolves the collision.

### ⚠️ Two hazards for whoever executes

1. **`inventory.js` cannot be deleted.** It also exports `parseInventoryData`, imported by
   `pipeline.js:11` (used at `:76` and `:510`) and `App.js:25`. It depends on `classifyInvArea` →
   `INV_MASTER`, a hand-curated **298-WRIN master table** (case/inner-pack/each conversions) that
   exists nowhere else. **Split the parser + `INV_MASTER` + helpers into their own module and
   repoint the importers BEFORE removing the view.** Also note `ds.inventoryRows` is populated in
   three places in `App.js` and read only by this panel — after retirement the stream is parsed and
   stored with no consumer, which is the argument for lifting the transfers engine rather than
   dropping it.
2. **Retiring `revintel` orphans `ModelComparisonPanel`** (`store-analytics.js:566`), mounted in
   exactly one place — line 1200, inside `RevenueIntelligence`. Decide deliberately: re-home or let
   go. Separately, `computeRevenueOpportunity` **survives regardless** — `ShiftAnalysisTab`
   (`store-analytics.js:249`) also calls it, so the OEPE math is already proven outside this panel.
3. Soft references that will dead-end when `priority-brief`'s route is removed:
   `tutorial.js:40` (`highlight:'priority-brief'`) and an in-app `onOpenModal('priority-brief')`
   button at `analytics.js:8295`.

### Green stores — owner asked whether this ties to the scoring review. It does, halfway.

`green` **membership** is not score-based — it is `tier==='green'`, i.e. no crit/watch findings.
That is trustworthy. But the **ordering within it** is `opsScore + ctrlScore` (`analytics.js:2125`)
— exactly the composite the owner has flagged for review.

**Decision (owner, 2026-08-10): carry the tier, drop the score-based ranking.** Green stores come
through to the merged panel sorted by store name. Preserves the capability (both merging panels are
exception-only and structurally cannot show a healthy store) without shipping a "best stores"
ranking built on numbers that are under review. Revisit the ordering in the dedicated scoring
session.

---

## Sequence

1. **Salvage scoping** on the 9 retire items (read-only; no deletions until this reports).
2. **Deletions** — orphans and vestigial state first, they are the lowest-risk and the owner most
   wants to know what was in them.
3. **Merges** — attention panels first (two PRs, engine then layout), since that one is already
   scoped and has a chosen layout.
4. **Renames** — Planning → (new name), Help → Workflow. Cheap and they get more expensive with
   every session that adds a reference.

Related: [[notes-63-queue]], [[panel-catalog]] (stale by ~420 versions — re-sync from this),
[[vision-and-roadmap]] Workstream D, [[feedback-pm-worker-split]], [[notes-60-queue]].
