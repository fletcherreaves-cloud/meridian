---
name: dispatch-54-job-a
description: Dispatch #54 Job A, done. shell.js's AppSidebar now reads label/icon/perm from panel-registry.js instead of duplicating them as literals -- caught and fixed a real drift (proj's stale "Proj Workflow"/lock label). section: values corrected on 21 panels to describe today's REAL placement instead of a partly-aspirational earlier guess; this is the real starting state for Job B, not a finished regroup.
metadata:
  node_type: memory
  type: finding
---

# Dispatch #54 Job A — the registry now drives label/icon/perm, done 2026-08-21

Scope was exactly Job A from `memory/dispatch-54.md`: wire `shell.js` to `panel-registry.js` as a
pure refactor, nav must render identically, list every disagreement found so Job B starts from
truth instead of the earlier partly-aspirational `section:` values.

## What actually changed vs. what stayed hardcoded

`shell.js`'s hand-built header/order structure (DAILY → PERFORMANCE → LABOR & SCHEDULING →
PEOPLE / HR → OPERATIONS → ANALYTICS → ⚗ TEST KITCHEN → ADMIN, and each item's position within
its header) is **unchanged** — that's what "must render identically" requires, and it's verified
by rendering, not just asserting registry shape (see Verification below).

What moved to the registry: **label, icon, and perm for every panel-backed nav item** (~44 of
them), via two new helpers in `AppSidebar`:

- `navP(id, {onClick, active, badge, disabled})` — looks up `PANEL_BY_ID[id]`, calls
  `pis(p.perm, p.label, p.icon, onClick || (()=>onOpenModal(id)), ...)`. Equivalent to the old
  `pis('perm','Label','icon', ()=>onOpenModal('id'), ...)` literal, but sourced, not duplicated.
- `navPBeta(id, ...)` — same, via `pi` (hidden when `betaMode` is on). Used for every ⚗ Test
  Kitchen item plus three ordinary `kind:'nav'` panels that are *also* beta-hidden today
  (`brief`, `loc-intel`, `one-pager`) — a real behavioral split the registry's `kind` field
  doesn't model. `panel-registry.test.js` now pins this exact exception list so a future
  `navPBeta(id)` call is a deliberate choice, not copy-paste that silently starts hiding an
  ordinary panel.

**Not migrated, on purpose — these have no registry id at all:** `Home` (view switch, not a
panel), `District View` (view switch), `Save Session` / `Restore Session` (direct actions, not
`onOpenModal` calls). They stay as literal `navItem(...)`/`pi(...)` calls in their exact current
position.

**Not migrated, out of scope for Job A:** the `⚗ Test Kitchen` PRUNED-duplicate comment line, the
`OPTIONAL_PANELS` spread (already registry-consistent via a *different*, pre-existing mechanism
and its own test in `panel-registry.test.js`), and everything about `panelsForSection()`/`SECTIONS`
actually driving the render loop — that's the "v2 sidebar," explicitly deferred by the registry's
own header comment ("Used by the v2 sidebar only — the v1 sidebar keeps its existing literal list
until v2 is adopted"). See "Why not switch to section-driven rendering" below for why this line
was held rather than crossed.

## One real drift, found and fixed: `proj`'s label/icon

Migrating `proj` to `navPBeta('proj')` would have changed the live TEST KITCHEN entry from
**"Projections" / ▦** to the registry's **"Proj Workflow" / 🔒** — a real label+icon disagreement,
not a section one. Root cause: the registry was built from the commented-out PRUNED duplicate nav
line (`// pi('analytics.forecasting', 'Proj Workflow', '🔒', ...)`), not the live line, which has
read "Projections"/▦ since v4.517. Fixed in `panel-registry.js`: today's UI wins.

## `section:` corrected on 21 panels — the real Job B starting state

The registry's `section:` field was set by an earlier pass toward the OWNER'S TARGET IA
(dispatch #54's own finding #2: "suggests the regrouping is ~60% done... none of that is true in
the UI"). Job A's job was to stop it lying about *today* — so every panel below had its `section:`
corrected to the header it **actually renders under right now**, not the aspiration. Job B is
where the aspiration gets applied on top of this corrected baseline.

One new section id was added to do this honestly: **`performance`** (label "Performance") — for
`operator-summary` / `ranking` / `planning`, which render under an ad hoc "PERFORMANCE" sidebar
header that doesn't correspond to any of the 12 pre-existing section ids. It has no owner-decided
target home yet; Job B disperses its three members (see dispatch-54.md's Job B list: Org Summary
+ Rankings → confirm they land in `reports`; Planning → the owner's `planning` hub, per the
already-answered Planning-is-four-links decision).

| id | was | now (today's real header) |
|---|---|---|
| `about` | help | admin |
| `above-store` | reports | analytics |
| `attention` | notifications | daily |
| `calendar-manager` | planning | daily |
| `event-impact` | planning | daily |
| `events` | planning | daily |
| `feature-requests` | help | analytics |
| `forms-library` | forms | analytics |
| `forms-print` | forms | analytics |
| `help` | help | admin |
| `kb` | help | admin |
| `leader-one-pager` | reports | analytics |
| `metric-lineage` | help | admin |
| `my-reports` | reports | analytics |
| `one-pager` | reports | analytics |
| `operator-summary` | reports | **performance** (new) |
| `planning` | planning | **performance** (new) |
| `ranking` | reports | **performance** (new) |
| `report` | reports | daily |
| `sage` | intelligence | analytics |
| `task-queue` | help | analytics |

24 other `kind:'nav'` panels already matched their real header and were left alone (see the full
`PANELS` array — `delivery-mix`, `dt-sos`, `news`, `count-cycle`, `eom-dashboard`, `eom-summary`,
`fob-analysis`, `fob-eom`, `graded-visits`, `perf-reviews`, `security`, `visit-readiness`,
`data-manager`, `panel-manager`, `settings`, `signals`, `smg-voice`, `promo-roi`, `sched-hub`,
`brief`, `loc-intel`, `morning-brief`).

**Two flags worth Job B's attention, not fixed here (would be a UI change, out of scope):**

- **`inventory`** (label "Inventory") has **no sidebar entry at all** — reachable only via
  `?modal=inventory` deep link or from inside another panel. Its `kind:'nav'` says it should have
  one; it doesn't today. Left at `section:'operations'` as a placeholder, not a "today" value.
  Job B's "Inventory and Food Cost" section (owner: "all inventory and food cost related items...
  plus Inventory and Product Mix") is presumably where this finally gets a real nav entry.
- **`forms-library` / `forms-print`** land at `section:'analytics'` above (today's true render
  location), even though dispatch-54.md's Job C section calls them "Not candidates" for routing
  and refers to them as sitting in `forms` — that reference was to the *aspirational* value, which
  this correction intentionally overwrote. Job B should move them to `forms` deliberately as part
  of its own pass; don't read their current `analytics` tag as a Job C decision.

## Why not switch to section-driven rendering now

Tried the literal reading first — loop over `SECTIONS` + `panelsForSection()` and let that drive
the header/order directly. It cannot render identically to today's nav no matter how `section:`
is set: today's headers are **coarser and differently composed** than the registry's 13-section
taxonomy (e.g. the ad hoc "PERFORMANCE" header mixes what are, by topic, a `reports` panel and a
`planning` panel; "ANALYTICS" mixes real analytics panels with parked help/forms/reports panels).
Reproducing today's exact grouping via section-loop would need either a one-off "current-reality"
taxonomy divorced from the target IA, or per-section item ordering the registry doesn't carry —
both real designs, neither a "pure refactor." `panel-registry.js`'s own header comment already
anticipated this split ("v1 sidebar keeps its existing literal list until v2 is adopted") — Job A
stops short of "adopting v2," consistent with that comment, and gets the label/icon/perm dedup
(the actual drift-prevention value) without touching what's visually grouped where.

## Verification

`src/__tests__/shell-nav-snapshot.test.js` (new) renders `AppSidebar` via
`ReactDOMServer.renderToStaticMarkup` (works in vitest's `node` environment, no jsdom needed for
static markup) with a fixed full-permission prop set, extracts every visible text node in DOM
order, and asserts it exactly matches the array captured **immediately before** this refactor
landed. This is the check that would fail if the refactor dropped, reordered, or relabeled an
item — a test only asserting the registry's own shape would not have caught the `proj` drift
above, since the registry's (wrong) shape was internally consistent.

`panel-registry.test.js` updated: `navIds()` now also matches `navP('id')`/`navPBeta('id')` call
sites (the old regex only saw literal `onOpenModal('id')` strings, which mostly stopped existing
in `shell.js` once this refactor landed — that check would otherwise have quietly gone vacuous).
The old "permissions agree with what shell.js gates on" test (regex-diffing literal perm strings)
is retired — there's only one copy of `perm` now, so that specific drift is structurally
impossible — and replaced with two tests that guard the new invariants directly: no id re-hardcoded
as a `pis`/`pi` literal instead of `navP`/`navPBeta` (backslide guard), and `navPBeta` used only
for `test-kitchen` panels or the three named exceptions (misuse guard).

1817/1817 tests pass. Build clean, entry-chunk eager payload 510.36 KB gzip (well within the
850 KB budget, no new imports added).
