---
name: notes-57-metric-registry-plan
description: Plan for Notes 57 — the app-facing metric catalog, data-lineage audit, and extraction-reduction program. Core recommendation is to build an executable registry that RENDERS the report, not to write a report. Phased, with the phone-safe groundwork separated from Mac execution.
metadata:
  type: project
---

# Notes 57 — Metric Registry & Data Lineage

Owner (2026-08-06): an app-facing report and full audit of every metric pulled in any
form (manual / email / auto), used or unused — well-designed, searchable — then a map of
what reaches Supabase, what's actively used and at what frequency, what each metric is
used *for*, whether daily pulls suffice for period reports, and finally where extraction
is redundant enough to remove a source.

Owner's stated end goal: *"make use of shared components to simplify data management. So
when we want to use a metric in a new way we already have the source and mechanics to
easily wire it in."*

**Not a phone task. Log and plan on the phone; execute from the Mac.**

---

## 1. The reframe: don't write the report — build the thing that renders it

A hand-built audit of 72 tables is stale the week after it ships, and then it's worse than
nothing because people trust it.

Meridian already demonstrates this failure mode. **Two partial metric registries exist
today and have drifted apart:**

| | metrics | carries |
|---|---|---|
| `src/engine/signal-registry.js` | **110** | key, label, source, field, granularity, direction, unit |
| `src/engine/metric-source.js` | **17** | the auto-first fallback chain (which source wins) |

Neither knows the other exists. They use different vocabularies for overlapping metrics.
`signal-registry` knows what a metric *means*; `metric-source` knows where it *comes
from*. Both are half of the same missing object.

**Recommendation: one canonical registry that is the runtime resolution path AND the data
behind the catalog UI.** Then the catalog cannot drift, because if the registry were wrong
the app would visibly break. Documentation that is load-bearing stays true.

---

## 2. Measured surface area (2026-08-06)

| | count |
|---|---|
| Supabase tables in `supabase/*.sql` | 72 |
| `load*` functions in `src/lib/supabase.js` | 78 |
| `save*` functions | 50 |
| distinct `ds.*` fields referenced across `src/` | 79 |
| pull scripts in `scripts/` | 35 |
| metrics described in `signal-registry.js` | 110 |
| metrics with a resolution chain in `metric-source.js` | 17 |

**Immediate finding worth acting on independently:** at least six startup streams appear
to feed a single consumer each — `rosterStatsRows`, `rosterRoleCounts`, `turnoverRows`,
`digitalAppRows`, `mcdeliveryRows`, `shiftManagerRows` (all Perf-Review inputs), plus
`ebosRows` and `opsCashRows` at ≤2 references. Every one is fetched **on every login for
every user**. That connects directly to the v4.840 load tracer and the AAG slowness: the
cheapest performance win may be *not fetching* some of this up front rather than fetching
it faster.

---

## 3. Registry shape — four dimensions per metric

1. **Identity** — key, label, plain-English definition, unit, direction (higher/lower is
   better), granularity.
2. **Lineage** — an *ordered* list of sources, each: upstream report → parser → Supabase
   table → column → `ds.*` field, tagged `auto | emailed | manual` with its pull
   frequency. This is `metric-source.js`'s chain, made explicit and complete.
3. **Aggregation** — how the metric rolls up, plus its numerator/denominator fields
   where it's a ratio. See §4 — this is the part that unlocks the owner's period-report
   question.
4. **Usage** — which panels / engines / reports consume it. **Generated, never
   hand-maintained** (§6).

---

## 4. Why aggregation belongs in the registry — and how it answers the period-report question

Owner asked: *"Explore the option of if daily pulls are sufficient to construct our own
database for period reports or any reports."*

The honest answer is **it depends on a property we don't currently record**, and the
v4.843 audit already proved it the hard way:

- **Additive metrics** (sales, guest counts, hours, dollars) — daily pulls are fully
  sufficient. Any period total is a sum.
- **Ratios whose components we store** (labor % — we have labor$ and sales) — sufficient.
  Any period figure is Σnumerator/Σdenominator, computed correctly.
- **Ratios we store as ratios only** — **not** sufficient. **OEPE is the live example:**
  `opsRows` parse to `{loc, date, oepe, park, kvst, kvsu, r2p}` with no car or guest
  count, so no correct period rollup is possible from that source at any frequency. v4.843
  had to leave four sites as plain means for exactly this reason.

So: **record numerator and denominator per ratio metric.** Then period reports become
derivable by construction, `engine/weighted.js` gets applied automatically instead of
hand-picked per panel, and every missing denominator becomes a *visible, tracked data
gap* rather than a bug someone rediscovers in two years.

That single property converts "can we build our own period reports?" from an open
question into a per-metric field you can filter the catalog by.

---

## 5. Redundancy — two different kinds, and cutting the wrong one is a regression

Owner wants to reduce data flow. Real win available, but the distinction is critical:

**(a) Redundant extraction — genuinely removable.** Two pipelines fetching the same field
at the same frequency into different tables. Pure cost, no benefit. This is the target.

**(b) Fallback depth — must be kept.** A manual upload sitting behind an auto stream is
not redundancy, it's the resilience the standing *auto/emailed-first, freshest-wins* rule
deliberately requires. `laborPct` resolving glimpse → ctrl → labor is three sources on
purpose.

⚠️ Cutting (b) would read as a big win on a spreadsheet and would silently re-create the
blank-tile bugs that v4.808–v4.833 spent an entire sprint fixing. The registry must label
every source with which kind it is, and the redundancy report must only ever propose
cutting (a).

A third category worth surfacing: **pulled but unused** — fields landing in Supabase that
nothing reads. Those are free to stop pulling, and §2 suggests there are some.

---

## 6. Usage mapping — how to generate it rather than maintain it

Three options; recommend the hybrid.

- **Static scan (primary).** A build script that walks `src/` for registry-key references
  and `metricDaily('x')` / `metricAvg('x')` call sites, emitting a usage map. Cheap, no
  runtime cost, covers unvisited panels. Weakness: misses dynamically-constructed keys.
- **Runtime telemetry (confirming).** Record which metrics actually resolve during real
  sessions. Accurate about what's *used*, silent about what isn't visited. **This is the
  same mechanism as the Notes 54 statistics DB** — build once, serve both. It would also
  give the owner "panel usage: what are users actually using" for free.
- **By construction (the end state).** Once every read goes through the registry, usage is
  recorded because there's no other path.

Start static, add telemetry when the Notes 54 telemetry work happens, converge on the
third.

---

## 7. Phases

**Phase 0 — inventory generator (phone-safe, read-only).**
A script that mechanically enumerates tables, columns, loaders, parsers, and `ds.*` fields
into a machine-readable inventory. Generates raw material; changes nothing. Safe to build
and run from anywhere.

**Phase 1 — unify the registry (Mac).**
Merge `signal-registry.js` (110) and `metric-source.js` (17) into one canonical registry.
⚠️ **Keep both existing APIs as thin adapters over it** so Signals, Scanner, Signal Lab and
every `metricDaily` caller keep working untouched. No big-bang rewrite. Reconcile the
110-vs-17 gap — that difference is itself an audit finding.

**Phase 2 — lineage + aggregation fields.** Populate sources, frequency, auto/emailed/manual
tags, numerator/denominator. Falls out of Phase 0's inventory plus reading each parser once.

**Phase 3 — usage map.** Static scan per §6.

**Phase 4 — the app-facing catalog UI.** Searchable, filterable by source/frequency/used/
unused/aggregability. Rendered entirely from the registry. This is the owner's requested
report, and it's now a view, not a document.

**Phase 5 — redundancy analysis and migration plan.** Only after 1–4, and only proposing
category (a) cuts. Migration gets its own reviewed plan per the owner's request.

**Phase 6 — enforcement.** A new metric must be registered to be resolvable; add a CI check
that every `METRIC_SOURCES` key and every signal-registry key exists in the canonical
registry. Without this, drift restarts immediately.

---

## 8. Other shared-resource wins this unlocks (owner asked what else fits this line)

Each is small once the registry exists, and each currently costs repeated per-panel work:

1. **Aggregation applied by construction** — registry says how a metric rolls up;
   `engine/weighted.js` does it. Nobody hand-picks a mean again. Directly prevents the
   v4.842/v4.843 class of bug from recurring.
2. **Formatting by unit** — one formatter per unit (pct at 2dp per v4.826, sec, $, count),
   driven by the registry instead of per-call-site choices.
3. **Targets and thresholds** — link `DEFAULT_TARGETS` per metric so "is this good?" and
   its colour are one lookup rather than bespoke logic per panel.
4. **vs-LY** — record the LY field per metric so `engine/vs-ly.js` resolves it generically.
5. **Freshness SLA per stream** — the registry knows each source's expected frequency, so
   "this stream is older than its SLA" becomes checkable. This is the alert that would have
   caught v4.802, where `qsrsoft-ops-pull` silently returned 0 rows for ~5 days. Feeds the
   Notes 54 telemetry work.
6. **RBAC** — flag loc-keyed metrics; supports RLS Phase 2 (`can_see_loc`) and makes it
   explicit which data is scoped.
7. **SAGE** — let it enumerate available metrics from the registry instead of carrying
   hard-coded tool definitions. New metric becomes SAGE-queryable for free.

---

## 9. Risks

- **Big-bang rewrite.** The adapter approach in Phase 1 is non-negotiable; 110 metrics and
  17 resolution chains are live in production panels.
- **Static-scan false negatives.** Dynamically-built metric keys won't be found. Report
  scan confidence rather than implying completeness.
- **The catalog becoming a second hand-maintained doc.** If any part of it is typed rather
  than derived, it will rot. Anything hand-written should be limited to prose definitions.
- **Over-cutting sources.** See §5.

---

## 10. Recommended starting point

Phase 0 + the Phase 1 reconciliation *analysis* (not the merge) are the highest-value first
step, and Phase 0 is safe to build from a phone. The reconciliation output — "here are the
110 metrics, here are the 17 with resolution chains, here is the gap" — is genuinely
useful on its own and is the input to everything after it.
