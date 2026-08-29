// @ts-nocheck
// Dispatch #210 Task 4 -- a REAL test of qsrsoft-onhand-pull.mjs's believes-done -> FOB
// pull nudge (triggerFobPullIfPossible), mocking global.fetch so no live network call is
// made, per CLAUDE.md's "would this verification still pass if the change were
// reverted?" standing rule. The script is guarded the same way
// qsrsoft-punch-times-pull.mjs/qsrsoft-variance-pull.mjs already are
// (`if (import.meta.url === file://process.argv[1])`), so importing it here does not also
// fire off a live Playwright/eBOS run.
process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { triggerFobPullIfPossible } from '../../scripts/qsrsoft-onhand-pull.mjs';

describe('triggerFobPullIfPossible() -- dispatch #210 Task 4', () => {
  const ORIG_ENV = { ...process.env };
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.fn(async () => ({ ok: true, status: 204 }));
    global.fetch = fetchSpy;
  });
  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  it('POSTs a workflow_dispatch for qsrsoft-pull.yml when GITHUB_TOKEN/GITHUB_REPOSITORY are set', async () => {
    process.env.GITHUB_TOKEN = 'fake-token';
    process.env.GITHUB_REPOSITORY = 'fletcherreaves-cloud/meridian';
    await triggerFobPullIfPossible();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/fletcherreaves-cloud/meridian/actions/workflows/qsrsoft-pull.yml/dispatches');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer fake-token');
    expect(JSON.parse(opts.body)).toEqual({ ref: 'main' });
  });

  it('skips the network call entirely when GITHUB_TOKEN is missing (never throws)', async () => {
    delete process.env.GITHUB_TOKEN;
    process.env.GITHUB_REPOSITORY = 'fletcherreaves-cloud/meridian';
    await expect(triggerFobPullIfPossible()).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('skips the network call entirely when GITHUB_REPOSITORY is missing', async () => {
    process.env.GITHUB_TOKEN = 'fake-token';
    delete process.env.GITHUB_REPOSITORY;
    await triggerFobPullIfPossible();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never throws even if the GitHub API call itself fails', async () => {
    process.env.GITHUB_TOKEN = 'fake-token';
    process.env.GITHUB_REPOSITORY = 'fletcherreaves-cloud/meridian';
    global.fetch = vi.fn(async () => { throw new Error('network down'); });
    await expect(triggerFobPullIfPossible()).resolves.toBeUndefined();
  });
});
