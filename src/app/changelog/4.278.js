// @ts-nocheck
export default {version:'4.278', date:'2026-07-03', changes:[
  'Signals: fix loc format mismatch — LifeLenz parser was padding store numbers to 7 digits ("0003708") while all other parsers use short format ("3708"), causing all cross-dataset joins to find zero pairs. Fixed parser + added normLoc() to join helpers for robustness against existing Supabase data.',
  'Signals: added console logging showing pairs/r per signal to aid diagnostics.',
]};
