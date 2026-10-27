// @ts-nocheck
// 2026-10-27 -- live SAGE bug (owner report): a complex multi-part question (the night-shift
// analysis prompt) burned through sage-chat's tool-calling round budget still exploring, and
// every round's pre-tool narration streamed to the user as if it were the answer -- the model
// never actually wrote a final, complete response, even after the user typed "continue".
// Stripping tools on the forced-final round stopped it calling MORE tools but never told it to
// stop PLANNING, so it kept narrating ("Now the guest-experience and controls side") instead of
// synthesizing. This tests the fix: an explicit instruction appended only on the final round.
//
// Imports supabase/functions/sage-chat/final-round-nudge.js directly -- the same plain-JS module
// index.ts's round loop calls every round. No Deno test infrastructure exists in this repo to
// boot the edge function itself, so this is the closest thing to the real call site: reverting
// the nudge (not just its wiring into index.ts) makes these tests fail. Same pattern as
// sage-paginate.test.js and sage-stream-events.test.js.
import { describe, it, expect } from 'vitest';
import { appendFinalRoundNudge, FINAL_ROUND_NUDGE_TEXT } from '../../supabase/functions/sage-chat/final-round-nudge.js';

describe('final-round-nudge -- appendFinalRoundNudge', () => {
  it('leaves the conversation untouched on a non-final round', () => {
    const messages = [{ role: 'user', content: 'What were sales yesterday?' }];
    const result = appendFinalRoundNudge(messages, false);
    expect(result).toBe(messages); // same reference -- no copy made when nothing changes
    expect(result).toEqual([{ role: 'user', content: 'What were sales yesterday?' }]);
  });

  it('appends an explicit stop-planning-and-answer instruction on the final round', () => {
    const messages = [{ role: 'user', content: 'Build me a night-shift plan for OK and FL.' }];
    const result = appendFinalRoundNudge(messages, true);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(messages[0]); // original history preserved, not mutated
    expect(result[1].role).toBe('user');
    expect(result[1].content).toBe(FINAL_ROUND_NUDGE_TEXT);
  });

  it('the nudge text tells the model to stop narrating a plan and write the real answer now', () => {
    // Guards the actual bug, not just that a message gets appended: a vaguer nudge ("please
    // finish up") would not reliably override the model's tendency to keep planning out loud.
    expect(FINAL_ROUND_NUDGE_TEXT).toMatch(/final answer/i);
    expect(FINAL_ROUND_NUDGE_TEXT).toMatch(/do not describe what you would look up next/i);
    expect(FINAL_ROUND_NUDGE_TEXT).toMatch(/say so plainly/i); // honest about gaps, not silent
  });

  it('does not mutate the original messages array (conversationMessages is reused across rounds)', () => {
    const messages = [{ role: 'user', content: 'x' }];
    const original = [...messages];
    appendFinalRoundNudge(messages, true);
    expect(messages).toEqual(original);
  });
});
