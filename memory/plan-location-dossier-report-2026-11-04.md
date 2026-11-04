# The location dossier — a full-picture report per store, rolled up the chain

**Task #79.** Owner, verbatim: "a report for each location/patch/operator/state (primarily
location focused, and then summarized up the chain) on any and all data we know and trends and
results in (current, 28 day, lm, l3m, ytd, etc...maybe customizable) within our environment...
factual by ingest (data and trends) or analyzed and discovered (correlations, etc). You can
include location specific demographics, layouts known, equipment (once it is obtained), weather
trends, personnel, important findings, etc... something that can be generated for the full
picture on the locations and a master collection of the data we have. A very well laid report
that can use tables and charts." Queued explicitly "for later" — this is design-only, nothing
built yet.

## 1. What this actually is

Strip the framing and this is **a store dossier**: one document per location that answers "tell
me everything we know about this store" — then the same document shape rolled up to patch,
operator, state, and district level (aggregating, not just concatenating, the stores underneath).
Nothing else in Meridian currently does this — every existing report is single-domain (Food Cost,
Labor, SMG VOICE, Security...) or single-metric (Trend Explorer). This is the first
cross-domain, single-subject report, and it's a genuinely new report SHAPE, not a new report
TOPIC — worth being deliberate about the architecture for that reason alone, since it'll likely
become the template for anything "profile"-shaped later (an operator dossier, a GM dossier).

## 2. Content map — what sections exist and where they'd pull from

Organized into the three tiers the owner's own framing already names: factual/ingested,
analyzed/discovered, and semi-static context.

### A. Factual / ingested (the easy 80%)

Every metric `metric-source.js`'s `METRIC_SOURCES` registry already covers is a candidate —
sales, labor %, TPPH, food cost, service times, controls/loss-prevention, OSAT/complaints, forms
completion, OT, cash variance. This tier is "just" a rollup table per metric, at whatever windows
are chosen (see §3), using the SAME auto-first sourcing every other panel in the app already uses
— no new data plumbing, this is pure presentation over existing registry entries. Reuse candidate:
**ReportShell** (`components/ReportShell.js`, the Reports Hub Phase 2+ pattern — date range +
LocationSelector + Run + Print/CSV/Excel/PDF export) is the right chassis; **Custom Report
Builder** (`custom-reports` panel, `engine/custom-report.js`'s `customReportCatalog`) is
*already* "pick metrics, see them for a scope + date range" — the closest existing thing to a
slice of this report, and worth reading closely before designing a parallel mechanism.

### B. Analyzed / discovered (the interesting 15%, and the hard part)

- **Correlations**: Signals' Scanner (`engine/correlation-stats.js`) already does cross-metric
  auto-correlation (Pearson + Spearman, FDR-guarded) for a store. The dossier's job here isn't
  discovery — it's *curation*: surfacing the 3-5 correlations that actually matter for THIS
  store, not a noisy full matrix. That's a real design question (§5).
- **Forecast accuracy / model fit**: Model Assignment's per-store winner, MAPE.
- **Visit readiness / PACE score + top risk drivers**: already computed (`engine/visit-readiness.js`).
- **Trend direction**: "is this store's labor % trending up or down over L3M" — `trend-explorer.js`'s
  day-of-week diagnostic is close to this; the dossier would want a plain-language trend read per
  metric, not just a sparkline (same "say the number AND the decision" standing UI rule CLAUDE.md
  already holds every panel to).

### C. Semi-static context (the part needing new or newly-surfaced data)

- **Demographics**: not currently modeled anywhere I can confirm. Open question for the owner —
  trade area population/income data would be a new data source (census API? a manual field?).
- **Layout**: `equipment-layout.js` (Layout Planner, test-kitchen) — a real, visual floor-plan
  feature, single-store today.
- **Equipment**: `equipment-results.js` — real survey data, already landing.
- **Weather trends**: Signals already has a Weather metric group (auto `weatherRows`) correlated
  against sales/day-of-week — the dossier would surface this store's own weather sensitivity, not
  re-pull weather itself.
- **Personnel**: Staffing/tenure/skills-matrix data exists (`employee_tenure`,
  `employee_pay_rate_changes` gated by `payroll.view`, Skills Matrix panel) — needs a decision on
  how much personnel detail belongs in a report that might print/export (PII handling — this
  repo's own standing PII rules apply directly: no SSN, careful with the wider roster fields).
- **Important findings**: Visit Readiness, Graded Visits, Customer Complaints, Security panel
  findings, EcoSure results — all already exist as browsable records; the dossier's job is
  summarizing recent ones, not re-building them.
- **Store KB notes**: `constants.js`'s `STORE_KB` already holds a `notes`/`tags` free-text field
  per store (the Lindsay relocation entries from this session are a live example of this) — the
  one existing piece of "general context about this location" infrastructure, worth surfacing
  directly rather than duplicating.

## 3. Time windows

Owner named: current, 28-day, LM (last month), L3M, YTD, "maybe customizable." Recommend:
ship these five as fixed presets (matching conventions already used elsewhere in the app — 28-day
and L3M in particular are already standard windows in several existing panels) plus a genuinely
custom date-range picker (ReportShell already has one) — not reinventing window logic, reusing
whatever the existing panels' own window definitions are so the dossier's "L3M labor %" and
Labor Analytics' "L3M labor %" are guaranteed to agree (this repo has a standing rule about
exactly this kind of cross-panel number mismatch — diff the computations, don't re-derive).

## 4. Rollup shape (location → patch → operator → state → district)

"Primarily location focused, and then summarized up the chain" — recommend the location-level
report as the real unit (one store, one full dossier), and each rollup tier as a SUMMARY view
over its child stores' dossiers (a patch dossier = patch-wide totals/averages + a ranked list of
its stores' headline numbers, not a full copy of every store's full dossier concatenated). This
mirrors how Above-Store One-Pager / Org Summary already work (district-wide rollup panels existing
today) — the new piece is the LOCATION-level depth and the cross-domain unification, not the
rollup mechanics themselves, which this app already has a working pattern for.

## 5. Open design questions (the owner's call, not mine to presume)

1. **How many correlations/findings surface per store, and how are they picked?** Scanner can
   find dozens; a report with all of them isn't "full picture," it's noise. Needs a materiality
   threshold or a fixed top-N, not an exhaustive dump.
2. **Generated on demand, or scheduled/cached?** A live-query report over 5 time windows × a
   dozen+ metrics × every data domain could be slow to compute on click for every store. Worth
   deciding whether this is request-time (ReportShell's existing pattern) or a nightly-generated
   artifact (closer to the EOM digest email pattern) before building.
2a. **Does SAGE narrate it, or is it pure tables/charts?** The owner's own "say the number AND
    the decision" standing rule suggests at least a plain-language summary per section — worth
    deciding whether that's hand-written logic (like Visit Readiness's driver text) or a SAGE
    call per report generation (more flexible, real token cost, needs a decision given the
    Managed Agents cost conversation this same session already had).
3. **PII boundary.** Personnel data belongs in SOME version of this (the owner named it), but a
   printable/exportable report is exactly the kind of artifact this repo's PII rules are written
   to keep SSN/DOB-grade data out of — needs an explicit decision on what personnel detail is
   in-bounds (tenure/headcount: almost certainly fine; wage data: payroll.view-gated already;
   anything SSN/DOB-adjacent: no).
4. **Demographics** has no existing data source in this app at all — first real "where does this
   number even come from" question, not a presentation question.

## 6. A staged build, if/when this moves from design to build

Not committing to this now — just sizing it so a future "how long would this take" conversation
has a real anchor:

- **Phase 1 (smallest real version)**: factual/ingested tier only (§2A), one location, the five
  fixed time windows, built on ReportShell + the existing metric registry. This is squarely
  "another Reports Hub report," comparable in size to the Phase 5 reports already shipped
  (Weather Impact, Price Change Impact, etc.) — a few hours each, this one bigger since it spans
  more metrics, but the same shape.
- **Phase 2**: add §2B (curated correlations/findings, trend reads) — needs §5.1 answered first.
- **Phase 3**: add §2C (demographics/layout/equipment/weather/personnel/findings) — needs §5.3/§5.4
  answered first, and is naturally staged since equipment/layout data is itself still being
  collected ("once it is obtained," the owner's own words).
- **Phase 4**: the patch/operator/state/district rollup views (§4), once the location-level
  report's shape is proven and stable.

Building Phase 1 before the §5 questions are answered risks building the wrong shape twice —
recommend settling at least §5.1 and §5.2 with the owner before writing any code here.
