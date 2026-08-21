---
name: dispatch54-job-b
description: Dispatch #54 Job B, done. Adopted section-driven rendering for real -- AppSidebar now iterates SECTIONS + panelsForSection() instead of Job A's preserved v1 hand-built list -- and applied the owner's three answered regroup decisions as section: edits. Visit Readiness + Graded Visits -> Operations; Calendar/Events & Tags/Event Impact folded into Planning behind the hub, in the owner's own stated order (hub first); a new Inventory & Food Cost section with six named panels; a new (currently empty in the live nav) Analysis section; Org Summary + Rankings confirmed in Reports; Forms Library/Printable Forms moved to Forms.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #54 Job B — the actual regroup, and v2 finally adopted

**2026-08-21**, immediately after Job A (`memory/dispatch-54-job-a.md`) and dispatch #52
(`memory/dispatch52-drilldown.md`). Executes Job B of `memory/dispatch-54.md`.

## Job A deferred one thing Job B had to pick back up

Job A's own memo said Job B's edits would be "one-line `section:` changes" — but that assumed
`shell.js` was already rendering FROM `section:`. It wasn't; Job A deliberately kept the v1
hand-built list (the registry's `section:` values were only made truthful for TODAY's ad hoc
grouping, not the owner's target IA, and switching the renderer over on an untrustworthy metadata
set would have been a silent visual change disguised as a pure refactor). **Job B is where that
foundation actually gets built**: `AppSidebar` now iterates `SECTIONS` + `panelsForSection()` for
every non-`admin` section, then `admin` again at the end (pulled out so Test Kitchen and the
optional-panel spread keep their existing position ahead of it) — see `src/app/shell.js`'s
`renderSection()` helper. A section with zero visible panels for the caller's permissions renders
nothing (no bare empty header) — this falls out of `panelsForSection()`'s existing permission
filter for free, and is exercised directly by a new render-based test (see Verification below).

Two things stayed exactly as they were, on purpose: **Test Kitchen** (still `kind`-driven, not
section-driven — a beta-hide axis the registry doesn't model, per Job A's own finding) and the
**optional-panel spread** (still flat, not grouped by section — Panel Manager's own concern, out
of scope here). `Home` and `District View` — the two non-panel view switches with no registry id —
moved to a small fixed cluster at the very top of the sidebar, above any section, instead of their
old scattered positions (Home was already first; District View used to sit mid-ANALYTICS).

## The owner's three answered decisions, applied

1. **Visit Readiness + Graded Visits → Operations.** ("They would be more Operations.") Both
   `section:` flipped from `people` to `operations`.
2. **Calendar / Events & Tags / Event Impact → fold into Planning**, and the Planning hub does
   **NOT** get exploded — its five internal tabs (Targets/Monthly/Pace/Yearly/Smart) stay
   `kind:'hub-tab'`, invisible to `panelsForSection()`'s `kind==='nav'` filter, so there was no risk
   of accidentally turning them into five more sidebar links. The result is the owner's literal
   four links, **hub first**: *"Planning (the hub, keeping its five tabs) · Calendar · Events & Tags
   · Event Impact."* `panelsForSection()` renders in `PANELS` array declaration order (no separate
   `order:` field exists), so this required physically regrouping four `PANELS` entries together in
   that literal sequence — everywhere else in the array stayed in its existing (roughly
   alphabetical-by-id) order, since no other section had an owner-stated order to honor. The
   internal tab UI *inside* the Planning hub itself (pills vs. underline tabs) is a separate
   component, not touched here — out of scope for a sidebar-registry dispatch.
3. **Inventory and Food Cost** (new section) takes **all** inventory/food-cost panels per the
   owner's own list: Food Cost, End of Month, Inventory Control, Count Cycle, **plus Inventory and
   Product Mix**. Five of six are ordinary `kind:'nav'` panels and now render as real sidebar
   entries. **Inventory** is the one Job A flagged as having **no sidebar entry at all** — it now
   has one, for the first time, exactly matching the owner's own list naming it explicitly.
   **Product Mix** stays `kind:'optional'` (Panel Manager toggle, hidden by default) — the owner's
   words were about *grouping*, not about making a currently-opt-in panel always-visible; if
   enabled via Panel Manager it will render correctly under this section, since the registry
   `section:` is set regardless of `kind`.

## The rest of Job A's disagreement catalog, resolved

- **Org Summary + Rankings → Reports** (explicitly asked for: "confirm Org Summary + Rankings land
  there in the rendered nav"). Both were sitting in Job A's temporary `performance` placeholder
  (the ad hoc "PERFORMANCE" header that doesn't correspond to any real target section) — moved to
  `reports`, their real home.
- **`performance` section retired.** All three of its members now have real homes (Org
  Summary/Rankings → `reports`, the Planning hub → `planning`), so nothing references it anymore.
  Removed from `SECTIONS` rather than left as a dead, always-empty entry.
- **Forms Library / Printable Forms → Forms.** Job A's own memo flagged these as landing at
  `analytics` (today's true placement) rather than their eventual `forms` target, and said Job B
  should move them deliberately — done.
- **Metric Correlations + Why Engine → a new Analysis section.** Both are `kind:'optional'`
  (Panel Manager toggle), unchanged — this only sets where they'd group IF a caller enables them;
  the live sidebar shows no "Analysis" header today because nothing in it is currently `kind:'nav'`.
  Recorded as metadata-only, matching the Product Mix treatment above.

## What was NOT touched, and why

- **"Forecasting and Labor Projections: confirm membership against the owner's 10-item list"** —
  dispatch #54's own Job B text references a list this session does not have (not quoted anywhere
  in `dispatch-54.md` or `dispatch-54-job-a.md`; likely `notes-67-queue.md`, not read this pass).
  Left `forecasting`-section panels exactly as they were rather than guess at membership from a
  list nobody could see. **Flagged, not resolved — a future session with that list should close
  this.**
- **`help` vs. `admin` sidebar split.** Job A folded `about`/`kb`/`metric-lineage`/`help` into
  `admin` (today's true placement — they all render under the literal "ADMIN" header). Job C's
  routing rule ("help and admin panels are interruptions") checks section membership for a
  DIFFERENT purpose (modal vs. routed page) and doesn't require the SIDEBAR to visually separate
  the two — no owner instruction exists to split them here, so they stay merged under `admin`.
- **The rest of the `analytics`-bucket items** (`above-store`, `leader-one-pager`, `my-reports`,
  `one-pager`, `sage`, `feature-requests`, `task-queue`) — Job B's brief named exactly two items
  moving out of that bucket (Org Summary, Rankings, which were never actually IN `analytics` — they
  were in `performance`). Nothing else in `analytics` had an explicit owner decision, so nothing
  else moved. Matches the standing "ask, don't assume" rule Job A and this dispatch both cite.

## Verification

`src/__tests__/shell-nav-snapshot.test.js` fully re-captured (5 tests, up from 2): the exact
post-regroup text-content snapshot, a dedicated assertion that the Planning section is precisely
the four owner-stated links in hub-first order (not five exploded tabs), an assertion that all six
Inventory & Food Cost panels' `section:` is set correctly and the five `nav`-kind ones render, the
re-captured permission-hidden-set table (one real behavioral change: denying `analytics.district`
no longer hides the 📦 icon, since `Inventory` — perm `analytics.store`, unaffected — now also uses
it and stays visible; before Job B, `Inventory` had no sidebar entry to collide with), and a new
test proving a section header disappears when its last member's permission is denied (not just the
member) while a section with a surviving member keeps its header — the exact case a pure-registry
test cannot see, since it depends on the render actually being section-driven.

1859/1859 tests. Build clean, entry-chunk eager payload unchanged (no new imports — `SECTIONS`/
`panelsForSection` were already exported by `panel-registry.js`).
