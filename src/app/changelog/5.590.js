// @ts-nocheck
export default {version:'5.590', date:'2026-10-27', changes:[
  '**Fixed SAGE never finishing on complex multi-part questions (owner report, with screenshots)** ' +
  '-- a district-wide night-shift analysis prompt burned through the tool-calling round budget ' +
  'still exploring, and every round\'s pre-tool narration ("Now the guest-experience and controls ' +
  'side") streamed to the user as if it were the final answer. Stripping tools on the forced-final ' +
  'round stopped it calling MORE tools but never told it to stop planning, so it kept narrating ' +
  'instead of synthesizing -- and "continue" made it worse, since it\'s a fresh user turn ' +
  '(src/views/sage.js) that resets the round budget to 0 rather than resuming.',
  'Added an explicit instruction, appended only on the forced-final round, telling the model to ' +
  'stop describing what it would look up next and write its complete answer now from whatever it ' +
  'already has -- including saying plainly what it could not get, instead of trailing off. ' +
  'Extracted into supabase/functions/sage-chat/final-round-nudge.js (same pattern as paginate.js/' +
  'stream-events.js) so it\'s directly testable despite no Deno test runner in this repo -- ' +
  'src/__tests__/sage-final-round-nudge.test.js (4 new tests).',
  'Two deeper issues diagnosed but NOT fixed here, flagged for a follow-up decision rather than ' +
  'guessed at: (1) MAX_TOOL_ROUNDS=3 may genuinely be too tight for questions needing many data ' +
  'pulls -- raising it has real cost/latency implications, needs owner input before changing; ' +
  '(2) SAGE\'s own toolset cannot answer daypart-level (hour-of-day) or staffing/punch-time ' +
  'questions at all today -- no tool exists for either, so some questions are categorically ' +
  'unanswerable regardless of round budget.',
  'Full suite 665/665 files, 6174/6174 tests green. Build clean, unchanged (supabase/functions/ only).',
]};
