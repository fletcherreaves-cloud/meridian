// @ts-nocheck
export default {version:'5.767', date:'2026-11-13', changes:[
  '**Fix: Location Dossier — FOB % and "Prime Cost %" read permanently blank** (owner-reported, ' +
  'screenshot). Two separate bugs: (1) "Prime Cost %" was routed through the wrong rollup kind — ' +
  'metric-source.js\'s primeCostPct sums two already-resolved ratios (Labor % + FOB %), not a ' +
  'numerator/denominator pair of its own, so it needs the mean-of-daily rollup, not the Σ/Σ one ' +
  'the Dossier was using — fixed, confirmed resolving real numbers. (2) The whole factual grid ' +
  'was computed ONCE at "Run" time and frozen into state, so a metric fed by a slower-loading ' +
  'stream (qsrFobRows, this app\'s T2 startup tier, loaded after Labor %/TPPH/etc.\'s T1) could be ' +
  'null at that exact instant and never update even after the real data arrived moments later — ' +
  'this is what the screenshot actually showed. The grid, sparklines, and demographics now ' +
  'recompute live from the current data on every render, same as every other reactive panel in ' +
  'this app.',
  '**Renamed "Prime Cost %" to "Labor + FOB %" everywhere it\'s shown** (owner-reported — not a ' +
  'term familiar to the team). It was never true industry Prime Cost (Labor % + full COGS %) — ' +
  'this app\'s FOB % is a waste/variance measure, not total food cost, and the data model has no ' +
  'COGS% to compute the real thing with. The new name says exactly what\'s summed. Internal key ' +
  '(`primeCostPct`) and math are unchanged — only display labels moved (Location Dossier, Top/' +
  'Bottom Performers leaderboard).',
  '**Location Dossier is now the "overwhelming single view" the owner originally asked for**, not ' +
  'just a table: a 90-day sparkline next to every factual-grid row, three full-size trend charts ' +
  '(Net Sales, Labor %, TPPH) above the grid, a severity-colored Top Findings strip (red/amber/ ' +
  'green chips in place of a plain list), and a trade-area income bar comparing the store against ' +
  'the district average. The SAGE narrative stays exactly where it was — plain-language summary ' +
  'alongside the visuals, not replacing them. No new charting dependency — same hand-rolled inline-' +
  'SVG sparkline pattern this app already uses (at-a-glance.js, trends.js).',
  '7 new/updated tests, full suite (8017 tests) and build pass clean (701.97 KB eager, budget 850 KB).',
]};
