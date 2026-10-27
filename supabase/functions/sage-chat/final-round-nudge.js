// @ts-nocheck
// Pure, Deno/Node-agnostic helper extracted from the tool-calling round loop in index.ts.
// Imported directly by index.ts (Deno, at runtime) and by its Vitest test in src/__tests__/, so
// the SAME code that runs in production is what the test exercises. Same pattern as paginate.js
// and stream-events.js. Plain JS, no TypeScript, per repo convention.
//
// 2026-10-27 (owner report): stripping tools on the forced-final round of the tool-calling loop
// stopped the model from calling MORE tools, but nothing told it to stop PLANNING -- under
// thinking:{type:'adaptive'} it naturally narrates its next step in visible text ("Now the
// guest-experience and controls side"), and with no tools left to act on that narration the round
// just ends there, streamed to the user as if it were the answer. A complex multi-part question
// (the owner's night-shift analysis prompt) burns through MAX_TOOL_ROUNDS still exploring, never
// reaching synthesis -- and "continue" makes it worse, since it's a fresh user turn that resets
// the round budget to 0, so it narrates a plan again instead of resuming. This nudge is appended
// only on the forced-final round, telling the model explicitly to stop planning and write its
// real answer now from whatever it already has, including saying plainly what it couldn't get.
export const FINAL_ROUND_NUDGE_TEXT =
  'You are out of tool-call rounds for this turn and have no more tools available. ' +
  'Do not describe what you would look up next -- write your complete, final answer ' +
  'right now, using only the data you already have. If something relevant is missing ' +
  'or incomplete, say so plainly as part of the answer (what you could not get and ' +
  'why), rather than trailing off or only narrating a plan.';

export function appendFinalRoundNudge(conversationMessages, isLastRound) {
  if (!isLastRound) return conversationMessages;
  return [...conversationMessages, { role: 'user', content: FINAL_ROUND_NUDGE_TEXT }];
}
