# Dispatch #195 — merge Metric Correlations into Signals Scanner: Scanner's math, Correlations' UI

## Context — the owner's own "best of both worlds" resolution, not a fresh design call

From `memory/decisions-panel-inventory-2026-08-10.md`: *"Good with merge, but like the layout and
appearance of Metric Correlations a lot better."* The doc's own resolution: **merge the ENGINE,
keep the PRESENTATION.** Signals Scanner has real statistical guardrails (Pearson r + Spearman,
an effect-size floor, and Benjamini–Hochberg FDR correction across many metric pairs — genuine
protection against spurious correlations). Metric Correlations has the interface the owner
prefers. **Take Scanner's math, Correlations' presentation. Nothing is lost in either direction.**
This is the design decision already made — this dispatch executes it, not re-litigates it.

Not yet executed (verified 2026-08-28): `corr-explorer` (label "Metric Correlations",
`MetricCorrelationExplorer`, sourced from the `analytics.js` lazy group) and Signals' own Scanner
tab (`ScannerTab` in `src/views/signals.js`, `kind:'nav'`/`route:true` panel `signals`) are still
two fully separate surfaces.

## Task

1. **Read both implementations in full before writing anything** — `MetricCorrelationExplorer`
   (grep the `analytics.js` lazy group in `App.js` for its real source file/export) and
   `ScannerTab` (`src/views/signals.js`). Confirm where Scanner's actual statistics live: Pearson/
   Spearman/effect-size-floor/Benjamini–Hochberg — this may be inline in `signals.js` rather than
   a separately importable engine module (not yet confirmed at dispatch-writing time). If it's
   inline, extract the pure statistical functions into a shared module (e.g.
   `src/engine/correlation-stats.js`) rather than duplicating them or reaching into `signals.js`'s
   internals from a different panel — this is the actual engineering work of "merge the engine."
2. **Build the merged panel using Metric Correlations' existing layout/interaction model**, but
   have it call the extracted Scanner statistics (Pearson + Spearman + effect-size floor +
   Benjamini–Hochberg FDR) instead of whatever correlation math `MetricCorrelationExplorer`
   currently uses. Read `MetricCorrelationExplorer`'s current math before assuming it's naive —
   state in your PR what it does today and specifically what the Scanner math adds/changes.
3. **Do not regress Scanner's own existing capabilities inside Signals** (the "move together"
   framing, one-click promote to Signal Lab, predefined seed signals, per CLAUDE.md's Signals
   panel description) — those stay live in Signals; this dispatch is about giving
   `corr-explorer`'s standalone surface the same rigorous math, sourced from one shared place, not
   about removing Scanner from Signals.
4. **Retire `corr-explorer` as a separate registry entry OR keep it** — re-read the owner's own
   quote before deciding: *"Good with merge"* — this reads as a genuine merge (one surface, not
   two), so the default is retiring `corr-explorer` and folding its (now Scanner-powered)
   presentation into Signals as an additional tab/mode, matching this dispatch batch's established
   "harvest into the survivor" pattern. If you find a reason the owner would want it to remain a
   separate standalone panel even after the engine-merge, say so explicitly rather than silently
   picking either path.
5. **Harvest-then-remove discipline applies** — if `MetricCorrelationExplorer` has any
   presentation detail Scanner's existing UI doesn't (a chart type, a filter, a table layout), it
   needs to actually land in the merged surface, not just be described as "the layout we're
   keeping" without verifying every piece transferred.

## Verification

- Merged surface uses the extracted shared statistics module — a live example showing Scanner's
  guardrails now applied through Metric Correlations' presentation (a real correlation pair, its
  effect size, and its FDR-adjusted significance, all visible).
- Confirm Signals' own Scanner tab still works unchanged (promote-to-Signal-Lab, seed signals,
  "move together" framing) — this is an extraction, not a removal, from that side.
- Standard suite + build. Version bump (check `origin/main` current version first).

## Out of scope

- Any other panel merge from the 2026-08-10 list (Feature Requests/Task Queue, Help/Workflow).
- Redesigning Scanner's statistical method itself (effect-size threshold, FDR alpha) — reuse as-is,
  this is a code-location/presentation merge, not a methodology change.

## Resolution (2026-08-28, v5.234)

**Where Scanner's math actually lived:** NOT inline in `signals.js` — already in a real
importable module, `src/engine/signal-registry.js` (`pearson`/`spearman`/`pValueFromR`/
`benjaminiHochberg`, used by `scanAllPairs`). But that module also carries ~900 lines of
Signals-specific machinery (`METRIC_CATEGORIES`, `extractMetricValues`, pmix item indexing,
custom-signal computation, `SEEDED_SIGNALS`) that a panel outside Signals had no reason to
statically pull in. So the four pure math functions were extracted to a new, dependency-light
`src/engine/correlation-stats.js`; `signal-registry.js` now imports from there and re-exports
the same names, so its existing consumers (`csat-signals.js`, `signals.js`'s own Scanner tab,
`dispatch-169-*`/`voice-perf-metrics`/`signal-scanner` tests) see zero behavior change.
`CORR_TARGETS`/`CORR_PREDICTORS` (Metric Correlations' own small 9-predictor catalog) similarly
moved out of `analytics.js` into `src/engine/correlation-predictors.js`, shared with District
Lens (untouched, out of scope) the same way.

**What changed in the math:** `MetricCorrelationExplorer` computed Pearson r itself (a private
`corrPearson`, identical formula) plus an ad-hoc single-test t-statistic significance label
('strong'/'sig'/'weak', uncorrected). That's gone. The merged tab now calls the shared
`pearson()` for r (same numbers), then computes a p-value for every predictor tested against
the selected target and runs Benjamini-Hochberg FDR correction across that whole batch (Scanner's
own default alpha, .05) — so "significant" accounts for the ~9 tests run together, not one in
isolation. Spearman rho is now computed alongside r per row, flagged non-linear when it diverges
from r by >= .25. Scanner's own effect-size floor (|r| >= .35) is surfaced per row, and the "Top
Findings" hero card is now gated on BOTH the effect-size floor AND FDR significance (previously a
bare |r| > .25). Everything else — per-store/per-target selection, plain-English finding
sentences, strength bars, expandable detail, raw-stats table — is unchanged presentation.

**corr-explorer retired**, folded into Signals as a new "🔗 Correlations" tab
(`CorrelationsTab` in `signals.js`). `panel-registry.js`'s entry kept as `kind:'internal'`
(same pattern as `calendar-manager`'s dispatch #191 retirement) so `onOpenModal('corr-explorer')`
still redirects (via a new lifted `signalsTab` state in App.js, mirroring `schedTab`/
`planningTab`) instead of doing nothing; removed from `constants.js`'s `OPTIONAL_PANELS` toggle
list since it no longer has a sidebar entry to toggle. Bonus: `MetricCorrelationExplorer`'s
hand-rolled `position:fixed/inset:0/rgba(0,0,0` backdrop (a panel-contract violation) is gone
entirely rather than converted, since the merged tab lives inside Signals' existing
`RoutePanelShell` with no chrome of its own — lowered `ratchet-modal-backdrop-bypass.test.js`'s
ceiling 70 → 69.

**Scanner-in-Signals confirmed unchanged**: `ScannerTab` itself was not touched — only its
underlying math functions moved to a new home file that it now imports from (identical exports,
identical behavior). Its move-together framing, one-click promote-to-Signal-Lab, and seed
signals (`SEEDED_SIGNALS`) are all still driven by the same `signal-registry.js` code path.

**Verification:** `npx vitest run --exclude "**/.claude/**"` and `npm run build` both clean
(see PR). `metric-direction.test.js` updated to read the relocated `CORR_PREDICTORS` declarations
from `correlation-predictors.js` instead of `analytics.js` (7 checks + 2 revert-sensitive
assertions) — same file, same assertions, new location.
