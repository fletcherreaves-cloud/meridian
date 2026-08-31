---
name: dispatch-227-eom-reports
description: Three new EOM report views the owner asked for in one session — missing/uncounted-items report, a simplified "send to teams" EOM Count snapshot, and a recount-impact report
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #227 — Three EOM report additions

Owner requests, verbatim, in one back-to-back burst (2026-08-30), each introduced with "another
good report would be":

1. *"a report that has all our usual components with date, location, print, etc for missing items
   or uncounted items sorted by location and class. Include last count data and logical
   recommendations as appropriate"*
2. *"the EOM Count panel without the columns on the right beginning with diagnosis. It would give
   a quick and easy snapshot to send out teams to help them. Include usual top components as above
   (pic for ref.) You can include the chips at the top of the panel as well. Just roll up to
   selections"*
3. *"the recount report we have been discussing. Just a report stating how many and which products
   were recounted and whether they improved or hurt final result. Sort by class here as well."*

All three are new **read-facing report views**, not new data engines — every number they need
already has a pure function in `src/engine/`. Do not duplicate any of the math below; import it.

**Reuse, don't reinvent, this session's established conventions:**
- **Location/date controls** — `LocationSelector` (`mode:'progressive'`) + `loadEomPeriods()`
  (`src/lib/supabase.js`), the exact pattern dispatch #225 (v5.270, `eom-dashboard.js`) put in
  front of all 5 Inventory Control tabs. These reports live inside that same hub, so they should
  read the hub's *already-selected* `scopedLocs`/`period` (rolled up to current selection — see
  request 2's "Just roll up to selections") rather than adding a second, independent picker.
- **Print** — the established pattern in `eom-supervisor.js` (`PRINT_STYLE` constant ~line 647,
  `doPrint()` callback that flags `forPrint` state + adds `body.eom-printing` + `setTimeout(() =>
  window.print(), 60)`, `afterprint` listener resets it, "🖨 Print" button). Follow it exactly —
  same class hooks (`.eom-block`, `.eom-no-print`, `.eom-print-area`/`.eom-print-title`), same
  `@media print` scoping — don't invent a second print mechanism.
- **FOB header chips** — `FobStrip` (`eom-dashboard.js` ~line 567) for the $-primary/%-secondary
  dashboard style, or the new percent-primary `FobStripLite` pattern just shipped in
  `eom-share-view.js` (v5.272, this session) if request 2's "chips at the top" should match the
  share-link convention instead. **Pick one and say which, in the PR body** — both exist now and a
  report that silently invents a third chip style is exactly the panel-contract drift this repo's
  CLAUDE.md warns about.
- **Dollar-weighted aggregation, never a naive mean of store percentages** — standing rule
  (CLAUDE.md, `vision-and-roadmap.md`). Any "district total" or "class total" row in these reports
  must sum the raw numerator/denominator across stores, matching the item-weighted pattern already
  used for `summary`/`classSummary` in `eom-dashboard.js` (~line 2639-2700) — not average the
  per-store percentages.

---

## Report 1 — District-wide missing/uncounted-items report

**What it is:** every uncounted item across the scoped stores, one flat sortable/printable table,
grouped by location then class, with last-count date and a recommendation per row.

**Data source — `diagnoseIncompleteCount(onHandRows, {period, asOf, minValue: 0})`**
(`src/engine/eom-inventory.js:268`), called once per scoped store (same pattern the dashboard
already uses per-store — see `computeCountProgress`/`diagnoseIncompleteCount` call sites in
`eom-dashboard.js`). Its `uncounted[]` array already carries everything this report needs per item:
`{wrin, descr, cls, valueAtRisk, lastCounted, state, onHandAmt, totalUnits}`. `state` is `'never'`
(no count this period — a true blank), `'early'` (counted before the final close window — the
cascade-count case), or `'stale'` (last counted in a *prior* period — likely deactivated/inactive
carrying a residual). **Do not re-derive this classification** — it already excludes zero-substance
false positives (the store 43380 fix, v5.268) and already has the never/early/stale semantics
fully commented at the top of the function; read that comment before touching anything here.

**Columns:** Location · Class · Item (descr, wrin as secondary) · Last Counted (or "Never" for
`state:'never'`) · $ On Hand · Recommendation.

**"Logical recommendations" — map `state` to text, reusing the phrasing already proven in
`buildIncompleteCountMessage`'s body (`eom-inventory.js:421`), not new copy:**
- `never` → "Physically count and submit — no count on record this period."
- `early` → "Recount before close — last count predates the final count window; a cascade error
  earlier in the count can still be corrected here."
- `stale` → "Verify and deactivate in QSRSoft if no longer sold, or count if still active — no
  count since a prior period."

**Sort:** Location, then class (Food → Condiment → Paper → Non-Product order — reuse the same
`order` array already defined in `eom-dashboard.js`'s `classSummary` ~line 2696, don't
re-invent class ordering), then `valueAtRisk` descending within each group (matches
`diagnoseIncompleteCount`'s own existing sort).

**Controls:** LocationSelector + period picker (shared, rolled up to selection), "🖨 Print" (same
pattern as `eom-supervisor.js`), and a "Date" column showing `asOf` used for the query (today, or
the period's last day if viewing a closed period) so a printed copy is self-dating.

---

## Report 2 — Simplified "send to teams" EOM Count snapshot

**What it is:** the existing per-store Scoreboard table (the one whose CSV export columns are
`Store / State / Count % / FOB % / FOB $ / Diagnosis / Communication` — `eom-dashboard.js:2626`),
minus every column from Diagnosis onward, with FOB header chips added at the top, rolled up to
whatever the hub's shared LocationSelector/period currently has selected. Purpose per the owner:
something you can hand a team (not just look at yourself) that shows count progress and current
FOB without exposing the diagnosis/communication workflow columns that are for internal use.

**Columns:** Store · State · Count % · FOB % · FOB $ — i.e. literally the first 5 columns of the
existing `exportCSV` column list in `eom-dashboard.js:2626-2633`, dropping `Diagnosis` and
`Communication`. **Don't hand-copy the 5 accessor functions** — import/reuse the same `rows`
array and the same per-row `r.prog`/`r.fobPct`/`r.fob$` fields the Scoreboard tab already computes,
so this view can never drift from the Scoreboard's own numbers (this is exactly the "two panels
disagree on one number" trap CLAUDE.md calls out — same underlying `rows`, different column
selection, not a second computation).

**Chips at top:** per-store FOB or a rolled-up FOB summary for the current selection (owner: "roll
up to selections") — if multiple stores are in scope, dollar-weight the summary FOB% the same way
`classSummary`/`summary` already do (sum $, sum sales, divide) rather than averaging per-store
FOB%.

**Print:** same `PRINT_STYLE`/`doPrint()` pattern. This is explicitly meant to be printed or
screen-shared with a store team, so keep it visually plain — no Diagnosis-workflow chrome, no
edit controls, read-only like the EOM Share view.

---

## Report 3 — Recount-impact report

**What it is:** for the scoped stores/period, which items got recounted during the EOM close
window, and whether the recount helped or hurt the final result — sorted by class.

**⚠️ Coordinate with dispatch #226 before starting — do not duplicate its engine wiring.**
Dispatch #226 (in flight as of this writing, `memory/dispatch-226.md`) is building a SAGE tool,
`query_eom_recount_impact`, against the exact same underlying question and the exact same engine:
`src/engine/eom-ledger-baseline.js` — `itemCloseWindowRecount()` (per-item: was this WRIN recounted
inside the close window, and what did the recount change), `ledgerBaselineDiff()` /
`ledgerScopeDiff()` (the store/scope-level before-vs-after diff), `storeEngagement()` (did the
store meaningfully engage with recounting at all). **This is the correct, already-built
methodology** (same-store/same-item baseline vs. close-window recount, fed by
`qsr_raw_item_detail` via the ongoing `scripts/qsrsoft-variance-pull.mjs` pull) — it is what
answered the owner's original SAGE-prompt question correctly after SAGE itself wrongly said the
data didn't exist. **Before writing this report, check dispatch #226's actual merged diff** (it
may already have shipped a shared formatting/summarization helper this report can call directly
instead of re-deriving from the raw engine functions) and reuse whatever it added rather than
building a second UI-facing wrapper around the same three functions.

**Columns:** Item (descr/wrin) · Class · # Times Recounted in Window · Baseline (pre-recount) Value
· Post-Recount Value · Δ · Helped/Hurt Final Result (a plain-language verdict, not just the raw
sign — e.g. "Helped: corrected a $340 undercount" vs. "Hurt: recount moved this further from
expected usage") · Store.

**Sort:** Class first (Food → Condiment → Paper → Non-Product, same order constant as Report 1),
then by `|Δ|` descending within class.

**Verdict wording:** "helped" = the recount moved the item's value *toward* its expected/baseline
usage pattern (reduced unexplained variance); "hurt" = it moved further away. Don't just report
"went up" / "went down" in dollar terms — the owner asked specifically "whether they improved or
hurt final result", which is a statement about food-cost accuracy, not raw dollar direction. Use
whatever helped/hurt classification `ledgerBaselineDiff`/`ledgerScopeDiff` already compute (read
their return shape before inventing a new one) — if neither already classifies helped/hurt, that's
a fair well-scoped addition since it lives in the same engine file as the diff logic.

---

## Verification bar (all three)

- Real render tests through the actual view components (would-this-fail-if-reverted per CLAUDE.md
  — a test that only imports the engine functions doesn't prove the report is wired to them).
- Confirm Report 2's numbers agree with the existing Scoreboard tab's numbers for at least one
  real scoped selection (the two-panels-disagree trap) — same `rows`, just fewer columns.
- Full suite + production build in a fresh worktree; report the gzip eager-payload number
  before/after per the performance-budget standing rule (budget ≤850 KB; last measured baseline
  527.31 KB gzip as of v5.272).
- If any new panel is added rather than a tab inside the existing hub, it must be `lazyPanel()`'d
  and get a real `section:` in `panel-registry.js` per CLAUDE.md's promotion rule — even if it
  starts in Test Kitchen.
