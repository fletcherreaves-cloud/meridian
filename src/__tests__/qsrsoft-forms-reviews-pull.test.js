// @ts-nocheck
// qsrsoft-forms-reviews-pull.mjs -- see memory/finding-qsrsoft-review-forms-schedules-endpoint-
// 2026-10-08.md (correction section) for the live measurement this is built from: the API's
// `endDate` is EXCLUSIVE. Proved by the first real production run, not just exploratory probes --
// a 3-day chunk `2026-10-06..2026-10-08` (end = today) saved only 2 rows where a same-width
// window `2026-10-07..2026-10-09` (end = tomorrow) had found 157. chunkDays() always queries one
// calendar day past the logical last day wanted; `startDate===endDate` returning zero rows is the
// same mechanism in its most extreme form, not a separate quirk.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { pullWithEscalation, fetchWindow, chunkDays, fetchResponseContent } from '../../scripts/qsrsoft-forms-reviews-pull.mjs';

describe('chunkDays -- endDate is exclusive, so every chunk queries one day past its logical end', () => {
  it('a range longer than one chunk size splits into padded chunks covering the whole span', () => {
    const chunks = chunkDays('2026-10-01', '2026-10-08', 3);
    for (const c of chunks) {
      expect(c.start).not.toBe(c.end); // never a single-day-wide query
    }
    expect(chunks[0].start).toBe('2026-10-01');
    // the LAST chunk's query end is one day past the logical end (2026-10-08) -- never equal to
    // it, or that final day would be silently excluded again.
    expect(chunks[chunks.length - 1].end).toBe('2026-10-09');
  });

  it('a single logical day still becomes a 2-day query (start, start+1) -- the extreme case of the same bug', () => {
    const chunks = chunkDays('2026-10-08', '2026-10-08', 3);
    expect(chunks).toEqual([{ start: '2026-10-08', end: '2026-10-09' }]);
  });

  it('a range exactly matching the chunk size (3 logical days) still pads its query end by one', () => {
    const chunks = chunkDays('2026-10-01', '2026-10-03', 3);
    expect(chunks).toEqual([{ start: '2026-10-01', end: '2026-10-04' }]);
  });

  it('a 4-day range with chunkSize 3 -- each chunk, including the 1-logical-day tail, is padded', () => {
    const chunks = chunkDays('2026-10-01', '2026-10-04', 3);
    expect(chunks).toEqual([
      { start: '2026-10-01', end: '2026-10-04' }, // logical days 1-3, queried through day 4
      { start: '2026-10-04', end: '2026-10-05' }, // logical day 4 alone, queried through day 5
    ]);
  });

  it('consecutive chunks overlap by exactly the one padding day -- harmless, upsert makes it a no-op', () => {
    const chunks = chunkDays('2026-10-01', '2026-10-08', 3);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].start).toBe(chunks[i - 1].end);
    }
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

// fetchResponseContent -- the separate, heavier per-occurrence call for score/content. See
// memory/finding-qsrsoft-review-forms-schedules-endpoint-2026-10-08.md and forms-reviews.js's
// header for the measurement this is built from.
describe('fetchResponseContent', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns the questions array on success', async () => {
    const questions = [{ id: 'q1', title: 'Q1', hasOptions: true, options: [{ title: 'Good', points: 1 }], answer: 0, pointsPossible: 1, pointsReceived: 1 }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ questions }), text: async () => JSON.stringify({ questions }) }));
    const result = await fetchResponseContent('faketoken', 'form1', 'user1', '2026-10-08T10:00:00Z', null);
    expect(result).toEqual(questions);
  });

  // Measured live: Crew Review (and potentially others in the future) returns 403 for a
  // confidential response this account is not authorized to view. This is an EXPECTED, not
  // exceptional, outcome -- returns null rather than throwing, so one denied occurrence doesn't
  // abort the whole pull chunk.
  it('returns null (not throws) on a 403 confidential-denial', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ message: 'You are not authorized to view this confidential response' }), text: async () => '{"message":"..."}' }));
    const result = await fetchResponseContent('faketoken', 'form1', 'user1', '2026-10-08T10:00:00Z', null);
    expect(result).toBeNull();
  });

  it('throws AUTH_FAILED on a real 401, distinct from the expected 403', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}), text: async () => '' }));
    await expect(fetchResponseContent('faketoken', 'form1', 'user1', '2026-10-08T10:00:00Z', null)).rejects.toThrow('AUTH_FAILED:401');
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
