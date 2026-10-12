// @ts-nocheck
export default {version:'5.529', date:'2026-10-12', changes:[
  'Security panel: added an "All" pill alongside the Min Signals 1+/2+/3+ filter. Before this, ' +
  'the subject table had NO way to show a "Clear" subject -- every floor, including the lowest ' +
  '(1+), required at least one FLAGGED verdict, so a domain that is 100% clear rendered the exact ' +
  'same empty "No findings match the current filters" as a genuine loading failure.',
  'Surfaced for real the same day LABOR-001/LABOR-002 went live (v5.528): both rules came back ' +
  '0/129 flagged -- a clean, real result -- and the table had no way to show that 258 real ' +
  'findings had actually loaded. "All" (minSignals=0) now lists every subject with at least one ' +
  'verdict, flagged or clear, so the real data is visible without having to trust the batch ' +
  "job's own log output.",
  'Default filter is unchanged (still 1+) -- this is additive, not a behavior change for existing ' +
  'Cash/Inventory users. Print/export title and the on-screen filter line both read "All (incl. ' +
  'clear)" instead of the nonsensical "0+" (minSignalsLabel()).',
]};
