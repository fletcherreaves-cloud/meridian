// @ts-nocheck
export default {version:'5.839', date:'2026-11-20', changes:[
  '**Egress reduction, Phase 1 pilot: LifeLenz schedule rows now render from local cache on ' +
  'login instead of blanking until the live network fetch lands.** First real step on ' +
  '`memory/plan-egress-reduction-2026-11-20.md`\'s Phase 1 ("cache-first render") after Phase 0\'s ' +
  'window-trimming pass (v5.834/5.835) earlier today. `schedRows` is the first CLOUD-first ' +
  'stream added to the OPFS snapshot (`src/db/index.js`, bumped v3→v4) — that blob previously ' +
  'held only manual-upload-era streams (labor/ops/ctrl/fob/audit/peaks/dar/pmix/weather/glimpse/' +
  'cash/exceptions/targets), never anything `_st*()` pulled live from Supabase. Two changes: ' +
  '(1) on cold start, `App.js` now seeds `ds.schedRows` from last session\'s cached snapshot — ' +
  'both in the normal IDB-restore path and in the "no manual-upload history at all" empty-shell ' +
  'path, so a cloud-only user benefits too, not just one with legacy labor/ops/ctrl uploads; (2) ' +
  '`_stLifelenz`\'s live T2 fetch still runs exactly as before and still wins once it lands, but ' +
  'now also writes the merged result back to the same OPFS snapshot, so the NEXT login has a ' +
  'fresher cache instead of the one before. Backward-compatible: a v3 blob with no `sched` field ' +
  'reads as `[]`, not an error. Scope: this is a single-stream pilot, not the general mechanism — ' +
  'the other ~29 eager `_st*()` loaders in App.js are unconverted; `ops_rows`/`ctrl_rows` were ' +
  'already found NOT safely convertible this way (see that file\'s Section 9 — a dozen-plus raw ' +
  'readers, needs the separate `metric-source.js` migration first). Delta-sync (Phase 2 — only ' +
  're-fetching what changed since last login, the piece that actually bends the egress line) is ' +
  'still not started; this pilot is purely the "speed load" half of the original ask, generalized ' +
  'to one real stream to prove the pattern before rolling it out further. 5 new tests ' +
  '(`dispatch-egress-phase1-sched-cache-2026-11-20.test.js`) exercise the real opfsSave→loadDsFromIDB ' +
  'round-trip (not just a hand-built object shape) by faking the two browser-only primitives — ' +
  'OPFS\'s storage directory handle and its dedicated Worker — that this mechanism depends on and ' +
  'that no prior test in this repo ever exercised, for any of its other 9 cached fields either. ' +
  'Full suite + build both clean.',
]};
