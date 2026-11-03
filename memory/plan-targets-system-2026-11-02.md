---
name: plan-targets-system-2026-11-02
description: "Feasibility + phased approach for the owner's 2026-11-02 ask: bring Yearly and Monthly Targets fully in-app (editor + printable export matching the current workbook look), with flexible/cascading metric categories, Smart-Targets-assisted yearly values, day-part TPPH targets, and easy patch/location-roster maintenance."
metadata:
  type: plan
---

# Yearly + Monthly Targets — in-app build, feasibility & phasing

**Status: queued, not started.** Owner asked explicitly for a feasibility read and a recommended
path, so this is that — not a build log.

## What already exists (read before any of this is built — avoids re-deriving or duplicating)

- **`DEFAULT_TARGETS`** (`constants.js`) — the hardcoded, code-shipped fallback target set per
  store. Always the last-resort layer in every target lookup.
- **`yearly_targets` / `monthly_targets`** (Supabase) — one row per `(loc, year[, month])`,
  populated today only by uploading the owner's Excel workbooks
  (`parseYearlyTargets`/`parseMonthlyTargets`, `src/parsers/index.js`), auto-saved on upload.
  This is the system being asked to move in-app.
- **`target_overrides` + the Targets Editor panel** (`memory/project-targets-editor.md`, dispatch
  #132) — **already does real cascading hierarchy editing**: Company → State → Patch → Store
  scoped overrides, resolved at read time (`applyTargetOverrides`), precedence Store > Patch >
  State > Company > monthly > yearly > `DEFAULT_TARGETS`. Fields are a fixed registry
  (`TARGET_OVERRIDE_FIELDS`) today — **this is the natural foundation to extend**, not a
  parallel system to build next to.
- **Smart Targets** (`memory/vision-and-roadmap.md` Workstream B) — median of the T3M/T6W/T3W
  trailing-average models, the proven winner for **monthly store SALES** specifically (not a
  general per-metric target engine). "Use Smart Targets as an option" for yearly targets
  realistically means: offer the Smart Targets sales number as a suggested/seed value for the
  sales line, not a Smart Targets number for every metric category — nothing today computes a
  "smart" FOB%/labor%/OSAT target the same way.
- **The older "🎯 Targets" panel** (`MonthlyTargetManager`, `store-dash.js`) — a *different*,
  `localStorage`-only, store-only editor, **not connected to Performance Review scoring**
  (documented gap in `project-targets-editor.md`). Don't build on this one; it's the thing the
  new system should eventually replace or absorb, not extend.
- **`org_config`** (Supabase) already holds patch/territory assignments live, not hardcoded —
  `getStoreOrg`/`supervisorOf()` resolve patch membership from it. This means the *cascade*
  (Company/State/Patch/Store) the owner wants to stay current under patch realignment **already
  tracks realignment automatically**, since `target_overrides`' patch-scoped rows resolve against
  live `org_config` data, not a frozen snapshot. Real strength to build on, not a gap to fix.
- **What's NOT yet data-driven:** `STORE_NAMES`/`STORE_COORDS`/`INV_ORG_COORDS` (the store roster
  itself) are still hardcoded in `constants.js`, not Supabase-backed, **except** where
  `project-multitenant-onboarding.md` documents `setLiveStoreNames()`/`setLiveDefaultTargets()`
  already exist and are wired into the login path for the multi-tenant case. Adding/removing a
  single store for the *existing* tenant today still means a `constants.js` edit + deploy, not a
  Supabase row — worth deciding whether "easy to update for location add/remove" means finishing
  that live-registry path for the single-tenant case too, since the plumbing already exists for
  the multi-tenant case and would very likely cover both.

## The four distinct asks, by difficulty (easiest/most-reused-plumbing first)

✅ **CORRECTED 2026-11-02 (same day, re-measured before starting #1 below) — item #1's "smallest
lift" framing was wrong on two counts, found by reading the actual code instead of building from
this plan's own un-verified assumption (the exact trap CLAUDE.md's "measure, don't reason" rule
warns about).** First: **`yearly_targets` has no sales column at all** — `parseYearlyTargets`
(`src/parsers/index.js`) reads OEPE/Park/KVS/R2P/TPPH/Labor%/FOB%/OSAT only; the sales figure
("Sales Projection" → `tProdSales`) lives in `monthly_targets` (`parseMonthlyTargets`), not
yearly. Second, and bigger: **the "suggest from Smart Targets" capability this item describes
is not a gap — it is ALREADY SHIPPED**, just not through the Targets Editor/`target_overrides`
system this plan assumed it would extend. `src/views/smart-targets.js`'s Sales metric
(`official: 'tProdSales', officialCol: 'sales_proj'`) has a live "Apply as Official" action that
writes the computed Smart number (median of T3M/T6W/T3W) directly to the real `monthly_targets`
row for that store/month — which Projections, the EOM Supervisor panel, and Pace-to-Target all
already read. `tProdSales` is also confirmed absent from `TARGET_OVERRIDE_FIELDS`
(`src/engine/target-overrides.js`) — sales was never part of that registry (which pairs each
field with a `reviewKey` for Performance Review scoring; sales isn't a review-scored KPI the
same way the FOB%/labor%/OSAT fields are). **Do not build a second "suggest" button for this —
it exists and works.** What remains open, if anything, is discoverability/UX polish on the
already-shipped flow, not a new engine or field.

1. ~~Smart-Targets-assisted yearly sales target.~~ **Already shipped — see correction above.**
2. **Day-part TPPH targets.** A genuinely new concept — every target today is one value per
   store per period, never split by daypart. Needs: (a) a decision on which dayparts (breakfast/
   lunch/dinner/late-night, matching the DAR's existing `hour_slot` bucketing conventions so it's
   measurable against real data, not an invented split with no actual comparison), (b)
   `TARGET_OVERRIDE_FIELDS`-equivalent extension to carry a `{daypart: value}` shape instead of a
   scalar for TPPH (and "possibly other metrics" — scope that explicitly before building, since
   each metric added this way multiplies the UI/print surface). Moderate lift once (a) is
   decided.
3. **In-app Yearly Targets builder + printable export, replacing the Excel upload.** The biggest
   *new UI* piece, but a known pattern — this session's own EOM Supervisor panel
   (`src/views/eom-supervisor.js`) is the live precedent for "one data model, two renderers": a
   live React table/form (`EOMBlock`) and a pure-function HTML-string print renderer
   (`eomBlockHtml`/`formatSupervisorHtml`) that can never disagree because they share the same
   row-value formatters and color/marker helpers. The new Yearly Targets panel should follow that
   exact shape: one `YearlyTargetsBlock`-style live editor + one `yearlyTargetsHtml` print
   renderer, both reading/writing the SAME underlying `yearly_targets` row shape the parser
   already produces, so the in-app and uploaded-workbook paths can coexist safely during
   transition (upload still works as a fallback/import path, same "manual upload stays the
   fallback" convention this whole app already follows for every other automated stream).
4. **Fully configurable metric categories (add/remove/rename a target metric or section — e.g.
   retire SMG, add whatever replaces it) that "cascade to all reports."** The architecturally
   biggest piece, and the one to be most honest about scope on. Today's target fields are a fixed,
   hardcoded JS shape (`tOepe`, `tTpph`, `tOsat`, …) baked into `DEFAULT_TARGETS`, the
   parsers, and every panel that reads a specific field by name. Making the metric *set itself*
   editable needs a metric-registry pattern — conceptually the same shape
   `src/engine/signal-registry.js` already uses for Signals' metric groups, or
   `src/engine/metric-source.js`'s `METRIC_SOURCES` — a Supabase-backed list of
   `{key, label, section, format, source}` definitions instead of a hardcoded object. **"Cascades
   to all reports" automatically, for every existing panel, is not realistic in one pass** — dozens
   of panels read specific hardcoded target fields by name today (Performance Review, Projections,
   Store Dashboard, Visit Readiness, EOM…). The achievable version: a new/renamed metric appears
   immediately in the Targets Editor and in a small number of *generic* "targets vs. actual" views
   built to read the registry dynamically; existing specialized panels keep their current hardcoded
   fields until individually migrated, same way a new metric source is added to `METRIC_SOURCES`
   today without every consumer panel needing to change on day one. Flag this nuance to the owner
   up front — "flexible categories that cascade everywhere" sounds like one feature; it is closer
   to a new generic-rendering layer plus an ongoing migration of individual panels onto it.

## Recommended order, if/when this is picked up

1. ~~Add the Smart-Targets-suggest feature first to prove the pattern.~~ **Moot — already
   shipped (see correction above).** Start directly with #2.
2. Decide the daypart-TPPH shape (#2) — needs a real decision meeting, not just an engineering
   guess, since "which dayparts" and "measured against what" are business questions.
3. Build the in-app Yearly Targets editor + print renderer (#3) on the EOM-Supervisor dual-render
   pattern, reusing the current `yearly_targets` row shape so the Excel-upload path keeps working
   as a fallback during the transition (matches this app's own "manual upload is last-resort
   fallback, never removed outright" standing convention).
4. Only after 2–3 are real and in use: scope the metric-registry work (#4) as its own project,
   explicitly bounded to "new metrics appear in the editor + N generic views" rather than "every
   existing panel migrates," and revisit which existing panels are worth migrating onto it over
   time.
5. Monthly Targets (the owner's second, explicitly-tied ask) follows the same shape as #3 once
   proven on Yearly — same dual-render pattern, same `monthly_targets` table, same registry if #4
   has landed by then.

**Both #2 (daypart definitions) and #3 (the in-app editor itself — a multi-week build) are real
open decisions/scope for the owner, not something to start unprompted** — flagged back to him
rather than built speculatively.

This is realistically a multi-phase initiative measured in weeks, not a single dispatch — sizing
that plainly up front so the scope is set with eyes open, as asked.

## Multi-tenant note

If the second-organization conversation (see `project-multitenant-onboarding.md`'s 2026-11-02
correction) moves forward before this does, build the Yearly Targets table/RLS policy using
`public.current_tenant_id()` from the start — not the hardcoded-literal pattern that correction
found on `schema-yearly-targets.sql`/`schema-target-overrides.sql` themselves. Worth fixing those
two specifically in the same pass as whichever comes first (this project or the multi-tenant
remediation), since they'll otherwise need the same fix twice.
