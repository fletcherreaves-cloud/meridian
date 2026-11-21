// @ts-nocheck
export default {version:'5.841', date:'2026-11-21', changes:[
  '**Signals\' LiveOps DAR tab (and Morning Brief/Curated Home, via the same shared data) now ' +
  'falls back to LifeLenz DAR when QSRSoft has nothing — not just silently blank since 2026-11-16.** ' +
  'QSRSoft\'s own DAR pull has been schedule-paused since that date (compliance triage), and ' +
  'nothing has backfilled since: `qsr_daily_activity`/its rollup are both frozen at 2026-11-17 ' +
  '(measured live). LifeLenz DAR is fresh and already feeds `metric-source.js`\'s daily fallback ' +
  'chains, but LiveOps queried QSRSoft directly with no fallback at all. ' +
  'Fixed in `lib/supabase.js`: `loadDailyActivity()` and `App.js`\'s `refreshDar()` now fall back ' +
  'to `loadLifeLenzDar()` + a new `lifelenzDarToDailyActivityShape()` converter when the primary ' +
  'query comes back empty. That converter maps ONLY what has a genuine equivalent — product ' +
  'sales, transactions, punched hours, and an EXACT algebraic recovery of labor $ from LifeLenz\'s ' +
  'own already-computed labor% (netSales × laborPct, not an approximation) — and converts ' +
  'LifeLenz\'s UTC hourly timestamps into QSRSoft\'s own Central-time `hour_slot` convention ' +
  '(DST-aware via `Intl`, hourCycle pinned per this repo\'s own standing Node-ICU-version warning). ' +
  'It deliberately does NOT fabricate the raw station components LifeLenz doesn\'t track at all ' +
  '(dt_untilserve, fc_trans_cnt, healthy/unhealthy counts, needed/scheduled hours, mean_sales, ' +
  'proj_sales_dollars) — those stay undefined, which every existing `>0`-guarded calculation in ' +
  '`views/signals.js` already reads as "no data," not a fabricated zero. The three fields LifeLenz ' +
  'DOES give as already-finished numbers (avg DT/FC/MFY service time — real substitutes for OEPE/ ' +
  'R2P/KVS seconds, not raw components to re-derive from) ride along as `_ll*`-prefixed fields; ' +
  '`HourlyDetail`\'s per-row render and `aggregateByStore`\'s per-store rollup both branch on them ' +
  '(the store-level rollup is transaction-weighted, same methodology `aggregateLifelenzDarDaily` ' +
  'already uses). Net result for a LifeLenz-sourced day: Product Sales, OEPE, R2P, KVS, Labor %, ' +
  'and TPPH populate with real numbers; vs Mean, DT Parked%, Punch/Need, Gap vs Need/Sched, and ' +
  '2nd Side Usage honestly show "—" rather than a faked figure. A new disclaimer line in the ' +
  'expanded hourly table says so explicitly. A real QSRSoft hour on a mixed day (some hours ' +
  'paused-pull, some backfilled) still wins over the LifeLenz weighted average, never the reverse. ' +
  '15 new tests (`dispatch-liveops-lifelenz-dar-fallback-2026-11-21.test.js`), including a ' +
  'confirmed-catches-a-regression check on the hour_slot conversion\'s trickiest case (the ' +
  'post-midnight business-day wrap to slot 25+, not back to 00-03). Full suite + build both clean.',
]};
