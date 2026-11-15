// @ts-nocheck
export default {version:'5.795', date:'2026-11-15', changes:[
  '**Fix: FOB metrics loading slowly (or not at all) on Targets vs Actual.** Owner report: "the ' +
  'fob eventually loaded previously, but not seeming to now." Root cause: the Monthly tab\'s FOB-' +
  'leg metrics call fob-reference.js\'s `resolveMetricForRange()` once per store PER metric (12 ' +
  'of them) -- with no cache, every call re-sorted and re-reconstructed daily $ deltas for EVERY ' +
  'store\'s entire qsr_fob history from scratch, just to read one store\'s slice. Up to 324 full ' +
  'recomputations per report run, growing slower every month more history accumulates. Fixed with ' +
  'a cache keyed on the dataset object itself -- zero call-site changes, automatically correct ' +
  '(a cache entry is unreachable the moment new data loads, since a fresh pull always replaces ' +
  'the dataset object).',
  '**Targets vs Actual Yearly tab now computes a real year-to-date actual.** Owner follow-up: ' +
  '"on the yearly, for sales[,] add the monthly actuals together [to] generate the yearly actual ' +
  '... for completed months and pace for any current month. For labor and fob ... monthly maybe ' +
  'with a roll up based on dollars." Every yearly metric\'s actual used to be computed over ' +
  'whatever narrow 7/14/21/28D/MTD window the date picker had selected -- compared against a ' +
  'full ANNUAL target, that never made sense. Now widened to Jan-1-through-the-picker\'s-end-date. ' +
  'Sales $ sums each completed month\'s real total plus a month-end pace projection for the ' +
  'current month (the honest to-date total still shows as the row\'s actual; the pace drives the ' +
  'status). Crew Labor %, FOB Target %, TPPH, OEPE, Parked %, KVS Time and R2P are all graded ' +
  'against the same widened year-to-date window -- the ratio/dollar fields are dollar-weighted ' +
  'across the full span (never an average of monthly percentages), the rate fields are a true ' +
  'day-weighted mean across the span (never a flat average of monthly averages) -- proven by a ' +
  'dedicated multi-month test fixture to give a measurably different (and correct) number than ' +
  'either naive-average shortcut would. 10 new engine tests (46 total in the dispatch file).',
  '**Targets vs Actual self-corrects when a stream finishes loading late.** Owner report: on ' +
  'mobile, switching away from and back to the app made FOB rows go blank again, and only a ' +
  'later re-run brought them back. Traced to the app\'s FOB stream loading once at startup with ' +
  'no visibility-change refresh and no local cache -- a mobile browser reloading a backgrounded ' +
  'tab restarts that fetch from scratch, so clicking Run Report before it lands reads blank, and ' +
  'nothing ever prompted a re-check once the data actually arrived moments later. The report now ' +
  'notices when a stream that was still loading at Run time later lands, and silently recomputes ' +
  'with the same parameters instead of leaving a stale, part-blank result on screen. 1 new test.',
]};
