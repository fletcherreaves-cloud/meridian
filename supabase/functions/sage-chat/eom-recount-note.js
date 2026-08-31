// Shared, Deno/Node-agnostic note for SAGE's query_eom_recount_impact tool (dispatch-226.md).
// Imported directly by supabase/functions/sage-chat/index.ts and by its Vitest test in
// src/__tests__/, so the SAME text that ships to production is what the test exercises. Plain JS,
// no TypeScript, per repo convention (see promo-roi-note.js for the prior instance of this pattern).
//
// Origin: the owner asked SAGE "give me a summary report on how stores that recounted their eom
// items impacted their final fob and food cost." SAGE answered that this data doesn't exist -- it
// does; SAGE just had no tool exposing it. `src/engine/eom-ledger-baseline.js` already implements
// the honest methodology (same-store, same-item, session-count vs. final-count within the EOM
// close window -- never a between-store comparison, which would be confounded by self-selection:
// stores recount BECAUSE they saw a bad number). This note carries the tool's one real limitation
// inline: it answers FOB impact, not total food cost %. Base Food % / total food-cost % is not in
// Meridian's data model anywhere (confirmed absent, not merely unchecked) -- do not let a "food
// cost" question read as fully answered by this tool alone.
export const EOM_RECOUNT_NOTE =
  'Method: same-store, same-item, SESSION count vs FINAL count within the EOM close window (the '
  + 'last 3 calendar days of the month). A store\'s first count of an item in that window is its '
  + 'session baseline; any later count of the SAME item in the window is a recount. Deliberately '
  + 'NOT a between-store comparison -- a store recounts an item BECAUSE it saw a bad number on the '
  + 'first count, so comparing recounting stores against non-recounting stores would be confounded '
  + 'by that self-selection, not a measure of who counts better. '
  + 'engagement.verdict: improving=recounted and net variance moved toward zero, worsened=recounted '
  + 'and net variance moved away from zero, mixed=recounted but no material net move, '
  + 'no-action=no qualifying recount at all in the close window. '
  + '"moved_toward_zero_dollars" on an item is positive when the recount helped (variance shrank) '
  + 'and negative when it hurt (variance grew) -- sum it, don\'t just count recounts, since a store '
  + 'can recount often and still net negative. '
  + 'IMPORTANT: this tool measures FOB (food/beverage on-hand inventory variance) impact ONLY. '
  + 'Total food cost % / "Base Food %" is NOT present anywhere in Meridian\'s data model -- if asked '
  + 'about food cost broadly, answer the FOB slice this tool gives and say plainly that total food '
  + 'cost % cannot currently be measured here, rather than implying this tool (or any other) covers it.';
