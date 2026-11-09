// @ts-nocheck
export default {version:'5.707', date:'2026-11-09', changes:[
  '**Data Manager\'s "↻ Sync" now auto-refreshes the page once the data actually lands — no more '+
  'hard reload (owner request 2026-11-09: "it seems that when I do a manual pull of data, I have '+
  'to reload the page to see the new data").** The dispatch itself returns almost instantly, but '+
  'the real rows don\'t land in Supabase for ~10 min (the GitHub Actions pull has to finish). '+
  'After a click, the button now polls that ONE stream\'s own `updated_at` every 45s (giving up '+
  'with a clear message after ~15 min) and the moment it moves past its pre-dispatch baseline, '+
  'reloads + merges that stream using the exact same loader the tiered startup loader already '+
  'uses for it (`STREAM_RELOADERS`, `src/app/App.js`) — never a second copy of the merge — then '+
  'shows a visible "✓ New … data loaded — no refresh needed" toast. Covers all 5 streams the '+
  'button already had: LifeLenz Schedule, QSRSoft FOB, eBOS Purchases, QSRSoft Daily Activity '+
  '(all four merge into `ds`), and Security Events (no `ds` field to merge — it loads on demand '+
  'per-subject in the Security panel — so this just refreshes its own coverage tile and acks the '+
  'toast). Polling is tracked per-stream, so syncing two streams back to back never cross-cancels, '+
  'and every poll is cleared if the Data Manager panel closes.',
]};
