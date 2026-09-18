// @ts-nocheck
// SAGE's system prompt built its "Today:" line from calendar-day new Date().toISOString(),
// not businessDate() -- so between midnight and 4am local, SAGE would tell the owner "today"
// is a business day that, by CLAUDE.md's own "business day runs 4am -> 4am" standing rule,
// hasn't started yet. That wrong date then gets used as the actual argument SAGE passes to its
// own query_* tools when asked about "today" -- not just a cosmetic prompt-text issue. Fixed to
// reuse businessDate() (utils/date.js), the same shared ABC-cutover helper every other "today"
// in the app already uses.
//
// Per "would this verification still pass if reverted?": these fixed-clock assertions fail
// against the old new Date().toISOString() code (which would print the calendar date, one day
// ahead of the business date, for the 2am case below).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildSystemPrompt } from '../views/sage.js';

afterEach(() => { vi.useRealTimers(); });

describe('SAGE system prompt -- business-day-aware "today" (4am ABC cutover)', () => {
  it('at 2am local, "Today:" reports the PREVIOUS calendar day (still the prior business day)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T02:00:00'));
    const prompt = buildSystemPrompt({ loaded: false }, [], []);
    expect(prompt).toContain('Today: 2026-09-17');
    expect(prompt).not.toContain('Today: 2026-09-18');
  });

  it('at 5am local (past the cutover), "Today:" reports the current calendar day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T05:00:00'));
    const prompt = buildSystemPrompt({ loaded: false }, [], []);
    expect(prompt).toContain('Today: 2026-09-18');
  });

  it('explains the 4am->4am business-day boundary so SAGE reasons about early-morning hours correctly', () => {
    const prompt = buildSystemPrompt({ loaded: false }, [], []);
    expect(prompt).toMatch(/4:00am\s*->\s*4:00am|4:00am to 4:00am/);
    expect(prompt).toContain('BUSINESS DAY');
  });
});
