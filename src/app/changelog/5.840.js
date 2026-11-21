// @ts-nocheck
export default {version:'5.840', date:'2026-11-21', changes:[
  '**Egress reduction, Phase 1 pilot #2: qsrActSummaryRows (the At-A-Glance Sales/vs-LY/Guest-' +
  'Count/TPPH tiles, Scheduling\'s QSR labor columns) now also renders from local cache on login.** ' +
  'Second stream added to the OPFS snapshot (v4→v5) after schedRows (pilot #1, v5.839) — chosen ' +
  'because unlike schedRows, this one is a T1-TIER stream: App.js\'s tiered startup loader AWAITS ' +
  'it before calling the app "usable," and it\'s the stream the owner has explicitly said he ' +
  'watches load ("when that line popped up, the tiles populated"). Same mechanism as pilot #1: ' +
  'seed `ds.qsrActSummaryRows` from last session\'s cache immediately on cold start (both restore ' +
  'paths), and `_stQsrsoftActSummary`\'s live T1 fetch still runs and wins once it lands, writing ' +
  'its result back to the same cache for next time. ' +
  'One real wrinkle pilot #1 didn\'t have: these rows carry a SECOND Date field (`refreshedAt`, ' +
  'used by At-A-Glance\'s Movers strip via `.getTime()`) beyond the `date` field the shared ' +
  'strip()/toRow() helpers already handle. Added a dedicated `toQsrActRow` wrapper in ' +
  '`opfsLoad` specifically for it — confirmed by test that reverting it breaks with exactly the ' +
  'failure a shipped version would have hit (`refreshedAt` restored as a string, not a Date). ' +
  '4 new tests (`dispatch-egress-phase1-qsract-cache-2026-11-21.test.js`). ' +
  'Scope unchanged from pilot #1: no delta sync yet (still a full 60-day re-fetch every login), ' +
  'not generalized beyond this one stream. Separately investigated and answered the same day: ' +
  'whether this caching change could be why Signals\' LiveOps DAR tab looked empty — it can\'t be ' +
  '(not yet shipped when asked, and that tab reads `qsr_daily_activity` directly via its own ' +
  '`refreshDar()`, a code path this pilot never touches). The real, confirmed cause: ' +
  '`qsrsoft-dar-pull.yml`\'s schedule has been paused since 2026-11-16 (QSRSoft compliance ' +
  'triage) and nothing has backfilled since — `qsr_daily_activity`/`qsr_daily_activity_rollup` ' +
  'are both frozen at 2026-11-17 (measured live), so LiveOps genuinely has nothing for any more ' +
  'recent date. `lifelenz_dar` is fresh through 2026-11-20 and already feeds `metric-source.js`\'s ' +
  'fallback chains, but was never wired into the LiveOps tab\'s own direct query — a real, ' +
  'separate gap, not fixed in this change. Full suite + build both clean.',
]};
