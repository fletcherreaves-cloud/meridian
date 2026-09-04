// @ts-nocheck
// Correlation Predictors — the curated ops-metric catalog used by every "what correlates with
// sales/GC/check?" surface that works off the manual/auto laborRows+opsRows+ctrlRows join
// (NOT the full Signals metric registry in signal-registry.js, which is a different, much
// larger catalog covering weather/calendar/pmix/etc for the district-wide Scanner sweep).
//
// Extracted from src/views/analytics.js under dispatch #195 (2026-08-28) so it can be shared
// without either side statically importing the other's (much larger) module:
//   - src/views/analytics.js: DistrictLensPanel (heatmap/lens) + computeAllCorrelations /
//     computeMetricAverages — unchanged by dispatch #195, out of scope for the merge.
//   - src/views/signals.js: the merged Correlations tab (dispatch #195) — now runs this same
//     catalog through Scanner's statistics (src/engine/correlation-stats.js) instead of the
//     plain-Pearson math this catalog used to be paired with in MetricCorrelationExplorer.
// No values changed — same three targets, same nine predictors, same labels/actions/notes.

export const CORR_TARGETS = [
  {id:'sales',  l:'Daily Sales',    emoji:'💰', fn:r=>r.sales},
  {id:'gc',     l:'Guest Count',    emoji:'👥', fn:r=>r.gc||0},
  {id:'avgChk', l:'Avg Check Size', emoji:'🧾', fn:r=>r.avgCheck||0},
];

export const CORR_PREDICTORS = [
  {id:'oepe',    l:'Drive-Thru Speed (OEPE)',       shortL:'OEPE',       src:'ops',   lowerBetter:true,  fn:r=>r.oepe,
   action:'Reduce wait times — faster service lets you handle more orders per hour.',
   note:'Lower OEPE means faster service. On your highest-sales days, speed of service typically drives more throughput. This is usually the most direct operational lever for daily sales.'},
  {id:'park',    l:'Park Rate',                     shortL:'Park %',     src:'ops',   lowerBetter:true,  fn:r=>r.park,
   action:'Review park rate alongside actual guest count to understand day-type patterns.',
   note:'A high park rate can inflate apparent wait times. Its relationship to sales varies — high park on high-sales days may just mean the store is busy, not that parking causes sales.'},
  {id:'r2p',     l:'Receipt to Print (R2P)',         shortL:'R2P',        src:'ops',   lowerBetter:true,  fn:r=>r.r2p,
   action:'Target faster R2P as a front counter service quality indicator — slow R2P signals assembly or kitchen delays that affect guest experience.',
   note:'R2P measures front counter speed: the time from when the receipt prints (order placed) to when the order appears ready on the export monitor. A lower R2P means guests are being served faster at the counter. Strong links to sales suggest faster counter service drives more throughput on busy days.'},
  {id:'labor',   l:'Labor Percentage',              shortL:'Labor %',    src:'labor', lowerBetter:true, fn:r=>r.laborPct,
   // Dispatch #77 -- owner-ruled 2026-08-23: labor has a target, at/below is good, over is bad,
   // no two-sided third state. This entry read lowerBetter:false, disagreeing with every other
   // declaration site in the app (store-dash.js, one-pager-data.js, analytics.js's own target
   // table). The action/note prose below stays -- the nuance it describes is real -- but it
   // does not change the metric's direction. See memory/dispatch-77.md.
   action:'Balance staffing carefully — too lean hurts service quality; too heavy compresses margin.',
   note:'Labor % tends to be high on slow days (fixed cost spread across fewer sales) and can also be high on very busy days with surge staffing. Context and trend matter more than the number alone.'},
  {id:'tpph',    l:'Transactions Per Person Hour',  shortL:'TPPH',       src:'labor', lowerBetter:false, fn:r=>r.tpph,
   action:'Optimize scheduling so your staffed hours align with when customers actually arrive.',
   note:'Higher TPPH means your labor hours are being used when customers are there. It tends to be higher during well-run peak periods and lower on quiet shifts.'},
  {id:'otHrs',   l:'Overtime Hours',                shortL:'OT Hours',   src:'labor', lowerBetter:true,  fn:r=>r.otHrs,
   action:'Review staffing plans — consistent OT signals scheduling gaps or unexpected demand surges.',
   note:'High overtime usually means planned coverage fell short of demand. Chronic OT can erode service quality and crew morale over time.'},
  {id:'cashOS',  l:'Cash Over/Short',               shortL:'Cash O/S',   src:'ctrl',  lowerBetter:true,  fn:r=>r.cashOSPct,
   action:'Monitor as a controls signal, especially on high-volume days when register handling gets rushed.',
   note:'Cash variance tends to increase on fast-paced high-traffic days. A strong correlation here can indicate your controls are being stressed on busy days.'},
  {id:'tRedA',   l:'Voids (T-Red After)',           shortL:'Voids %',    src:'ctrl',  lowerBetter:true,  fn:r=>r.tRedAPct,
   action:'Address order accuracy training — frequent voids slow the line and frustrate guests.',
   note:'High void rates often indicate order errors, which require the cashier to stop and fix the ticket. This slows throughput and can negatively impact service perception.'},
  {id:'discPct', l:'Discount Rate',                 shortL:'Discount %', src:'ctrl',  lowerBetter:true, fn:r=>r.discPct,
   // Dispatch #77 -- owner-ruled 2026-08-23: lower-better, same simplification as Labor % above.
   // This entry read lowerBetter:false, disagreeing with every other declaration site (store-
   // dash.js's two tables, analytics.js's own target table). Action/note prose stays. See
   // memory/dispatch-77.md.
   action:'Analyze whether promotions are driving new visits or just discounting customers who would have come anyway.',
   note:'Higher discount days often bring more guest counts but at a lower average check size. Understanding which promotions drive incremental traffic is key.'},
  {id:'fobPct',  l:'Food Cost (FOB %)',             shortL:'FOB %',      src:'ctrl',  lowerBetter:true,  fn:r=>r.fobPct,
   action:'Review waste, portion control, and ordering accuracy to manage food cost.',
   note:'Food cost is primarily a profitability metric. Its link to daily sales volume is usually indirect — but high FOB on low-sales days signals waste and portion control issues.'},
];

// CORR_TARGETS/CORR_PREDICTORS id -> metric-source.js key, for the auto-first (metricSeries)
// sourcing path both analytics.js's computeAllCorrelations and signals.js's CorrelationsTab use
// instead of reading `.fn` off a raw ds.laborRows/opsRows/ctrlRows-joined row (manual-upload
// only, went blank on auto-only recent days -- notes-61 measured labor_rows 16 days stale while
// every auto stream was current). `.fn` itself stays on the catalog above for consumers that
// still read a raw joined row directly (e.g. a caller with its own already-joined fixture).
// Shared here (not duplicated in each view) so the two consumers can't drift out of sync.
export const TARGET_METRIC_KEY = { sales:'sales', gc:'gc', avgChk:'avgCheck' };
export const PREDICTOR_METRIC_KEY = {
  oepe:'oepe', park:'park', r2p:'r2p', labor:'laborPct', tpph:'tpph', otHrs:'otHrs',
  cashOS:'cashOSPct', tRedA:'tRedAPct', discPct:'discPct', fobPct:'fobPct',
};
