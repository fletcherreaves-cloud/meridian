// @ts-nocheck
export default {version:'4.209', date:'2026-06-19', changes:[
  'Diagnostic instrumentation (temporary) — Priority Brief still hard-freezing the browser despite two rounds of targeted fixes means something is being missed, not guessed around',
  'Console timing added at: rawStores (all 27 buildStore calls, broken down into compute6wk vs buildBrief time), and DistrictPriorityBrief\'s own mount/tiered/pulse computations',
  'Open the browser console before clicking Priority Brief — the [PERF] log lines will show exactly where the time goes on the next freeze, replacing speculation with real numbers from the actual session',
]};
