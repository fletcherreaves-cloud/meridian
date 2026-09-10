// @ts-nocheck
export default {version:'5.421', date:'2026-09-10', changes:[
  'Fixed ds.loaded/ds.storeIds -- another confirmed instance of the "silent failure on a ' +
  'cloud-only device" bug class #270 was supposed to close for SAGE, never generalized. Both ' +
  'were laborRows-only (`ds.loaded = ds.laborRows.length>0`, `ds.storeIds` from ' +
  '`ds.laborRows.map(r=>r.loc)`) -- true/populated only once a manual Labor Analysis workbook ' +
  'had been uploaded on THIS device, false/empty on a cloud-only device even with every ' +
  'auto/emailed stream (DAR, FOB, LifeLenz, Glimpse, Sales Ledger, ...) fully populated. That ' +
  'silently disabled 10+ `if(!ds.loaded)` gates in analytics.js, why.js\'s "Single-store ' +
  'anomaly" forecast-miss diagnosis, Location Intel, GM Coaching Letters, and more -- ' +
  'sage.js already carried its own comment naming this exact bug and explicitly avoiding ' +
  '`ds.loaded` for that reason.',
  'engine/pipeline.js: new dsHasData/dsAutoStoreIds/annotateAutoFirstFlags -- true/populated ' +
  'from laborRows OR any STREAMS-tracked (stream-freshness.js\'s own registry, the same one ' +
  'per-stream freshness checking already uses) cloud/emailed source. qsrFobRows\'s own ' +
  'zero-padded loc convention is normalized so it collapses onto the same store id as every ' +
  'other source instead of appearing as a spurious duplicate. buildDS/mergeDS (the manual-' +
  'upload paths) now call this shared function instead of their own two copies of the same ' +
  'laborRows-only line.',
  'The harder half: buildDS/mergeDS only run at manual-upload time, but ~32 of App.js\'s own ' +
  'setDs() calls merge a cloud/auto stream straight into ds (`setDs(prev=>({...prev, ' +
  'qsrActSummaryRows}))`, one per source) without ever touching buildDS/mergeDS -- so fixing ' +
  'only those two functions could not have unlocked anything. App.js\'s setDs itself is now ' +
  'wrapped to re-derive loaded/storeIds after every call, function or plain-value updater ' +
  'alike, which covers all ~32 inline call sites plus configureLazyFill\'s lazy-fill hook and ' +
  'session.js\'s mfRestoreSession -- both already receive this same setDs reference, so ' +
  'neither needed touching. One shared derivation, one place it is wired in.',
  '18 new tests (dispatch-ds-loaded-auto-first.test.js): dsHasData exhaustively over every ' +
  'real STREAMS entry (not a hardcoded subset -- a future stream added there is automatically ' +
  'covered here too), the qsrFobRows zero-pad collision case, a null-loc guard, and buildDS/' +
  'mergeDS end-to-end proving a no-op manual upload on an already cloud-loaded ds no longer ' +
  'wipes out the cloud-derived flags. All confirmed to fail against the pre-fix pipeline.js ' +
  '(reverted, re-ran -- 17/18 failed on the missing export -- restored). Full suite 4717/4717, ' +
  'build clean, 539.38 KB / 850 KB eager-payload budget (unchanged from baseline -- this change ' +
  'is pure logic, no new UI).',
]};
