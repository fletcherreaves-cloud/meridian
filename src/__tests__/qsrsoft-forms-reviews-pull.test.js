// @ts-nocheck
// qsrsoft-forms-reviews-pull.mjs -- see memory/finding-qsrsoft-review-forms-schedules-endpoint-
// 2026-10-08.md for the two live-measured endpoint quirks this script is built around:
//   1. startDate === endDate (a single calendar day) returns ZERO rows, for every form.
//   2. A wider date window can silently return FEWER recent rows than a narrower one (measured:
//      an 8-day window caught 2 of today's occurrences vs a 3-day window's 157) -- short,
//      overlapping chunks are the fix, same pattern qsrsoft-forms-completion-pull.mjs already
//      uses for this host family.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { pullWithEscalation, fetchWindow, chunkDays } from '../../scripts/qsrsoft-forms-reviews-pull.mjs';

describe('chunkDays -- quirk 1: never produce a single-day-wide chunk', () => {
  it('a range longer than one chunk size splits without leaving a 1-day remainder', () => {
    const chunks = chunkDays('2026-10-01', '2026-10-08', 3); // 8 days, chunkSize 3 -> naive split leaves a 1-day tail
    for (const c of chunks) {
      expect(c.start).not.toBe(c.end);
    }
    // every requested day is still covered by at least one chunk
    expect(chunks[0].start).toBe('2026-10-01');
    expect(chunks[chunks.length - 1].end).toBe('2026-10-08');
  });

  it('a range exactly one day long still widens to a 2-day request, not a 1-day one', () => {
    const chunks = chunkDays('2026-10-08', '2026-10-08', 3);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].start).not.toBe(chunks[0].end);
  });

  it('a range exactly matching the chunk size (3 days) is untouched', () => {
    const chunks = chunkDays('2026-10-01', '2026-10-03', 3);
    expect(chunks).toEqual([{ start: '2026-10-01', end: '2026-10-03' }]);
  });

  it('a 4-day range with chunkSize 3 -- the naive 1-day tail is widened forward, not dropped', () => {
    const chunks = chunkDays('2026-10-01', '2026-10-04', 3);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ start: '2026-10-01', end: '2026-10-03' });
    // the naive second chunk would be {start: '10-04', end: '10-04'} -- widened one day forward
    // instead, so every chunk stays >= 2 days wide (quirk 1). Overshooting the nominal end by a
    // day is harmless; a silent zero-row chunk is not.
    expect(chunks[1]).toEqual({ start: '2026-10-04', end: '2026-10-05' });
  });
});

describe('fetchWindow response parsing', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('reads a bare array response', async () => {
    const row = { response: { formId: 'f1', startedAt: '2026-10-08T10:00:00Z' }, form: { formId: 'f1' } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [row], text: async () => JSON.stringify([row]) }));
    const rows = await fetchWindow('faketoken', '2026-10-07', '2026-10-09', null);
    expect(rows).toEqual([row]);
  });

  it('reads a {"results": [...]} wrapped response', async () => {
    const row = { response: { formId: 'f1', startedAt: '2026-10-08T10:00:00Z' }, form: { formId: 'f1' } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ results: [row] }), text: async () => JSON.stringify({ results: [row] }) }));
    const rows = await fetchWindow('faketoken', '2026-10-07', '2026-10-09', null);
    expect(rows).toEqual([row]);
  });

  it('throws AUTH_FAILED on 401/403 so the escalation ladder can catch it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}), text: async () => '' }));
    await expect(fetchWindow('faketoken', '2026-10-07', '2026-10-09', null)).rejects.toThrow('AUTH_FAILED:401');
  });
});

// Same escalation contract as qsrsoft-forms-completion-pull.mjs's own test file (dispatch #71) --
// a 200-with-zero-rows direct result is indistinguishable from a real auth denial on this host
// family, so it is checked via Playwright before being trusted.
describe('pullWithEscalation', () => {
  const chunks = [{ start: '2026-10-06', end: '2026-10-08' }];
  const tracker = { fail: vi.fn() };

  it('does NOT call Playwright when the direct path already saved rows', async () => {
    const runDirectFn = vi.fn().mockResolvedValue({ grand: 2, coveredLocs: new Set(['5985']) });
    const viaPlaywrightFn = vi.fn();
    const r = await pullWithEscalation(chunks, tracker, { runDirectFn, viaPlaywrightFn });
    expect(r.grand).toBe(2);
    expect(viaPlaywrightFn).not.toHaveBeenCalled();
  });

  it('escalates to Playwright when the direct path saves exactly 0 rows, and uses its result', async () => {
    const runDirectFn = vi.fn().mockResolvedValue({ grand: 0, coveredLocs: new Set() });
    const viaPlaywrightFn = vi.fn().mockResolvedValue({ grand: 157, coveredLocs: new Set(['5985', '10422']) });
    const r = await pullWithEscalation(chunks, tracker, { runDirectFn, viaPlaywrightFn });
    expect(viaPlaywrightFn).toHaveBeenCalledTimes(1);
    expect(r.grand).toBe(157);
  });

  it('still escalates on thrown AUTH_FAILED', async () => {
    const runDirectFn = vi.fn().mockRejectedValue(new Error('AUTH_FAILED:403'));
    const viaPlaywrightFn = vi.fn().mockResolvedValue({ grand: 5, coveredLocs: new Set(['5985']) });
    const r = await pullWithEscalation(chunks, tracker, { runDirectFn, viaPlaywrightFn });
    expect(viaPlaywrightFn).toHaveBeenCalledTimes(1);
    expect(r.grand).toBe(5);
  });

  it('reports the direct path\'s zero when Playwright also returns nothing -- a genuinely quiet window is not masked as an error', async () => {
    const runDirectFn = vi.fn().mockResolvedValue({ grand: 0, coveredLocs: new Set() });
    const viaPlaywrightFn = vi.fn().mockResolvedValue({ grand: 0, coveredLocs: new Set() });
    const r = await pullWithEscalation(chunks, tracker, { runDirectFn, viaPlaywrightFn });
    expect(r.grand).toBe(0);
  });
});
