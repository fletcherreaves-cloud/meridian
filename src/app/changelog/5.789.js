// @ts-nocheck
export default {version:'5.789', date:'2026-11-15', changes:[
  '**Fix: Register Audit tab showed stale data frozen at June 30, hiding the pull v5.779/5.781 ' +
  'already restored.** The restored pull writes `loc` NSN-zero-padded (matching qsr_daily_' +
  'activity/qsr_fob\'s own convention); `loadAuditRows()`/`loadAuditRowsWindow()` ' +
  '(src/lib/supabase.js) never stripped it, unlike every other zero-padded-source loader in this ' +
  'file — so every padded row (27/27 stores, the only ones with data past 2026-06-30) was ' +
  'invisible to RegisterAuditTab\'s `r.loc===loc` filter. Worse: because the format differed, ' +
  'the restored pull\'s backfill never matched its own upsert key against the old unpadded rows ' +
  'and wrote a second, padded copy of the same 2026-03-01 — 06-30 history instead of overwriting ' +
  'it — 21,929 genuine duplicate rows, confirmed lossless-to-delete by a 0-orphans anti-join. ' +
  'Both loaders now normalize on read. Data-fix SQL (`supabase/data-fix-audit-rows-unpadded-' +
  'dupes-2026-11-15.sql`) written for the owner to run, removing the stale copy. 3 new tests. ' +
  '**Also fixed, same report:** the top-bar layout glitch the owner saw alongside it was the ' +
  'same `⚠ DATA INCOMPLETE` banner (several background loads 500ing at once) rendering an ' +
  'unwrapped long message — neither `html` nor `body` had ever constrained `overflow-x`, so the ' +
  'whole PAGE scrolled sideways instead of the banner just wrapping. Fixed both: `html,body{' +
  'overflow-x:hidden}` (the safety net every panel\'s own `overflowX:\'auto\'` container was ' +
  'always assuming existed) and `flexWrap` on the banner itself. Full findings: ' +
  'memory/finding-register-audit-loc-padding-2026-11-15.md.',
]};
