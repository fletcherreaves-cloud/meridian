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
| Attention Now | `priorities` | Into **Needs Attention** (name kept). Two-part job — engine first, layout second. Layout chosen: severity-ranked store list, expandable, with clickable severity filter chips and an Acknowledged section at the top. |
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
