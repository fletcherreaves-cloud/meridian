// @ts-nocheck
// Dispatch #210 -- a REAL test of scripts/scheduled-pull-watchdog.mjs's detection +
// retrigger, per CLAUDE.md's "would this verification still pass if the change were
// reverted?" standing rule: this exercises checkStream() end-to-end with a mocked
// `fetchLatest` (stands in for the Supabase read) and a mocked `fetchImpl` (stands in for
// the GitHub REST calls) and asserts the actual HTTP calls made — a `workflow_dispatch`
// POST really gets issued for a genuinely stale stream, and does NOT for a fresh one.
import { describe, it, expect, vi } from 'vitest';
import {
  computeStaleness, checkStream, closeIfRecovered, ISSUE_LABEL,
} from '../../scripts/scheduled-pull-watchdog.mjs';

const NOW = new Date('2026-08-29T15:00:00Z');
const OWNER = 'fletcherreaves-cloud', REPO = 'meridian', TOKEN = 'fake-token';

/** A fetchImpl stub that records every call and answers per-URL-substring. */
function makeFetchImpl({ openIssue = null } = {}) {
  const calls = [];
  const impl = vi.fn(async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    if (url.includes('/labels/')) return { ok: true, json: async () => ({}) }; // label exists
    if (url.includes('/dispatches')) return { ok: true, status: 204, json: async () => ({}) };
    if (url.match(/\/issues\?state=open/)) return { ok: true, json: async () => (openIssue ? [openIssue] : []) };
    if (url.match(/\/issues$/)) return { ok: true, status: 201, json: async () => ({ number: 42 }) };
    if (url.match(/\/issues\/\d+\/comments$/)) return { ok: true, status: 201, json: async () => ({}) };
    if (url.match(/\/issues\/\d+$/)) return { ok: true, status: 200, json: async () => ({}) };
    return { ok: true, json: async () => ({}) };
  });
  return { impl, calls };
}

describe('computeStaleness — pure math', () => {
  it('fresh (today, daily cadence) is not stale', () => {
    const r = computeStaleness('2026-08-29', 1, NOW, 16);
    expect(r.isStale).toBe(false);
  });
  it('a stream stuck 2+ days back is stale (63h > 40h threshold)', () => {
    // 2026-08-27T00:00Z -> 2026-08-29T15:00Z = 63h. threshold = 24+16 = 40h -- clearly stale.
    const r = computeStaleness('2026-08-27', 1, NOW, 16);
    expect(r.staleHours).toBeCloseTo(63, 0);
    expect(r.isStale).toBe(true);
  });
  it('normal same-morning lag before the daily pull lands is NOT flagged', () => {
    // A pull that lands ~10:30 UTC each day: at 09:00 UTC the freshest row is still
    // yesterday's -- 33h old (2026-08-28T00:00Z -> 2026-08-29T09:00Z), comfortably under
    // the 40h default threshold even though it's already well past a naive 24h.
    const morningBefore = new Date('2026-08-29T09:00:00Z');
    const r = computeStaleness('2026-08-28', 1, morningBefore, 16);
    expect(r.staleHours).toBeCloseTo(33, 0);
    expect(r.isStale).toBe(false);
  });
  it('no usable date at all reads as maximally stale, not a false ok', () => {
    expect(computeStaleness(null, 1, NOW, 16).isStale).toBe(true);
    expect(computeStaleness(null, 1, NOW, 16).staleHours).toBe(Infinity);
  });
});

describe('checkStream() — real detection + retrigger against a mocked GitHub API', () => {
  it('a fresh stream makes NO GitHub API calls at all', async () => {
    const { impl, calls } = makeFetchImpl();
    const fetchLatest = vi.fn(async () => '2026-08-29');
    const result = await checkStream('dar', { fetchLatest, now: NOW, token: TOKEN, owner: OWNER, repo: REPO, fetchImpl: impl });
    expect(result.action).toBe('ok');
    expect(calls.length).toBe(0);
  });

  it('a genuinely stale stream (no prior issue) issues a workflow_dispatch call AND opens an issue', async () => {
    const { impl, calls } = makeFetchImpl({ openIssue: null });
    const fetchLatest = vi.fn(async () => '2026-08-26'); // 3 days stale
    const result = await checkStream('dar', { fetchLatest, now: NOW, token: TOKEN, owner: OWNER, repo: REPO, fetchImpl: impl });

    expect(result.action).toBe('retriggered');
    expect(result.isStale).toBe(true);

    const dispatchCall = calls.find(c => c.url.includes('/dispatches'));
    expect(dispatchCall, 'expected a workflow_dispatch POST').toBeTruthy();
    expect(dispatchCall.method).toBe('POST');
    // dar's registry entry owns qsrsoft-dar-pull.yml -- assert the RIGHT workflow was hit.
    expect(dispatchCall.url).toBe(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/qsrsoft-dar-pull.yml/dispatches`,
    );
    expect(dispatchCall.body).toEqual({ ref: 'main' });

    const issueCreateCall = calls.find(c => c.url.endsWith('/issues') && c.method === 'POST');
    expect(issueCreateCall, 'expected an issue to be opened recording the retrigger').toBeTruthy();
    expect(issueCreateCall.body.labels).toContain(ISSUE_LABEL);
  });

  it('a stream STILL stale with an issue already open escalates (comments) but does NOT dispatch again', async () => {
    const existing = { number: 7, title: '🟡 Scheduled pull may be stale: DAR (QSRSoft daily activity)' };
    const { impl, calls } = makeFetchImpl({ openIssue: existing });
    const fetchLatest = vi.fn(async () => '2026-08-26');
    const result = await checkStream('dar', { fetchLatest, now: NOW, token: TOKEN, owner: OWNER, repo: REPO, fetchImpl: impl });

    expect(result.action).toBe('escalated');
    expect(result.issueNumber).toBe(7);

    const dispatchCall = calls.find(c => c.url.includes('/dispatches'));
    expect(dispatchCall, 'must NOT retrigger a second time for the same incident').toBeUndefined();

    const commentCall = calls.find(c => c.url.includes('/issues/7/comments'));
    expect(commentCall, 'expected an escalation comment on the existing issue').toBeTruthy();
    expect(commentCall.method).toBe('POST');
  });

  it('dryRun computes the verdict but makes no GitHub API calls even when stale', async () => {
    const { impl, calls } = makeFetchImpl();
    const fetchLatest = vi.fn(async () => '2026-08-26');
    const result = await checkStream('dar', { fetchLatest, now: NOW, token: TOKEN, owner: OWNER, repo: REPO, fetchImpl: impl, dryRun: true });
    expect(result.action).toBe('would-check-issue');
    expect(calls.length).toBe(0);
  });

  it('an unknown stream key is a no-op, not a crash', async () => {
    const { impl } = makeFetchImpl();
    const result = await checkStream('not-a-real-stream', { fetchLatest: vi.fn(), now: NOW, token: TOKEN, owner: OWNER, repo: REPO, fetchImpl: impl });
    expect(result.action).toBe('unknown-stream');
  });
});

describe('closeIfRecovered() — closes a stale-issue once the stream is fresh again', () => {
  it('closes and comments on the open issue when the stream has recovered', async () => {
    const existing = { number: 9, title: '🟡 Scheduled pull may be stale: DAR (QSRSoft daily activity)' };
    const { impl, calls } = makeFetchImpl({ openIssue: existing });
    const fetchLatest = vi.fn(async () => '2026-08-29'); // fresh now
    await closeIfRecovered('dar', { fetchLatest, now: NOW, token: TOKEN, owner: OWNER, repo: REPO, fetchImpl: impl });

    const patchCall = calls.find(c => c.method === 'PATCH');
    expect(patchCall, 'expected the issue to be closed via PATCH').toBeTruthy();
    expect(patchCall.body).toEqual({ state: 'closed', state_reason: 'completed' });
  });

  it('does nothing when the stream is fresh and no issue is open', async () => {
    const { impl, calls } = makeFetchImpl({ openIssue: null });
    const fetchLatest = vi.fn(async () => '2026-08-29');
    const closed = await closeIfRecovered('dar', { fetchLatest, now: NOW, token: TOKEN, owner: OWNER, repo: REPO, fetchImpl: impl });
    expect(closed).toBeNull();
    expect(calls.some(c => c.method === 'PATCH')).toBe(false);
  });
});
