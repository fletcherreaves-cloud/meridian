// @ts-nocheck
export default {version:'5.854', date:'2026-11-22', changes:[
  '**Signals LiveOps "⟳ Sync Now" now auto-refreshes once the lifelenz_dar sync actually ' +
  'lands — no more manual page reload.** Owner report: clicking Sync Now dispatched the ' +
  'LifeLenz DAR GitHub Actions pull and re-queried immediately, but the real pull takes ~10 ' +
  'min to land, so that immediate re-query just re-showed the same old rows; nothing was ' +
  'watching for the fresh data to actually arrive, same gap Data Manager\'s own "↻ Sync" ' +
  'button already closed for its 4 streams (task #138). `loadLifelenzDarFreshness()` (new, ' +
  '`src/lib/supabase.js`) reads the newest `updated_at` off `lifelenz_dar`. `LiveOpsTab`\'s ' +
  '`handleSync` (`src/views/signals.js`) now captures that as a pre-dispatch baseline, polls ' +
  'it every 45s for up to 15 min, and calls `refreshDar` again — with a visible confirmation — ' +
  'the moment it moves past the baseline; mirrors Data Manager\'s own `needsBaseline` safety ' +
  'so a failed baseline read is never mistaken for "newer than nothing." Gives up with a clear ' +
  'message after 15 min if the pull never lands. 4 new tests ' +
  '(`dispatch-signals-liveops-dar-sync-autorefresh-2026-11-22.test.js`). Full suite + build ' +
  'both clean.',
]};
