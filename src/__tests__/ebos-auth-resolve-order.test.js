// @ts-nocheck
// Issue #1539 (2026-10-24): scripts/qsrsoft-onhand-pull.mjs carried its OWN duplicated
// resolveEbosToken() that checked the static QSRSOFT_EBOS_TOKEN secret FIRST, before ever
// attempting the fresh SSO exchange. Since that secret is always set in CI (a persistent
// GitHub Secret), the "fresh, preferred" path -- the one that actually works -- never ran,
// and every pull failed once the stored secret aged past its few-minutes eBOS-token lifetime.
// Fixed by migrating onhand-pull.mjs onto the shared scripts/lib/ebos-auth.mjs ladder.
//
// This test covers the shared ladder itself (resolveEbosToken() in ebos-auth.mjs), which had
// zero test coverage despite already being imported by qsrsoft-inventory-history-pull.mjs and
// now qsrsoft-onhand-pull.mjs too. Per "would this verification still pass if the change were
// reverted?" -- a test that only asserts onhand-pull.mjs's import line is correct couldn't
// catch a FUTURE regression where the shared ladder itself goes back to checking the env
// token first. This test exercises the real resolveEbosToken() and proves the priority order
// directly: SSO (fresh) wins when it works, the env token is used ONLY when SSO fails, and
// Playwright is reached ONLY when both of those fail.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../scripts/lib/qsrsoft-auth.mjs', () => ({
  getFreshToken: vi.fn(async () => 'fake-cognito-token'),
}));

const ORIG_ENV = { ...process.env };

describe('ebos-auth.mjs resolveEbosToken() -- priority order (issue #1539)', () => {
  let fetchSpy;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIG_ENV };
    delete process.env.QSRSOFT_EBOS_TOKEN;
    delete process.env.QSRSOFT_USERNAME;
    delete process.env.QSRSOFT_PASSWORD;
  });
  afterEach(() => {
    process.env = { ...ORIG_ENV };
    vi.restoreAllMocks();
  });

  it('uses the fresh SSO exchange even when a static QSRSOFT_EBOS_TOKEN is also set', async () => {
    // This is the exact bug: the stale secret must NOT shadow a working SSO exchange just
    // because it happens to be present (it always is, in CI).
    process.env.QSRSOFT_EBOS_TOKEN = 'stale-secret-token';
    fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ token: 'fresh-sso-token' }) }));
    global.fetch = fetchSpy;

    const { resolveEbosToken } = await import('../../scripts/lib/ebos-auth.mjs');
    const token = await resolveEbosToken();

    expect(token).toBe('fresh-sso-token');
    expect(fetchSpy).toHaveBeenCalledTimes(1); // SSO was actually tried, not skipped
  });

  it('falls back to the static QSRSOFT_EBOS_TOKEN only once the SSO exchange fails', async () => {
    process.env.QSRSOFT_EBOS_TOKEN = 'stale-secret-token';
    fetchSpy = vi.fn(async () => ({ ok: false, status: 403, text: async () => '' }));
    global.fetch = fetchSpy;

    const { resolveEbosToken } = await import('../../scripts/lib/ebos-auth.mjs');
    const token = await resolveEbosToken();

    expect(fetchSpy).toHaveBeenCalledTimes(1); // SSO was tried first
    expect(token).toBe('stale-secret-token'); // then the fallback, not null
  });

  it('falls through to Playwright (returns null without it configured) when neither SSO nor the env token is available', async () => {
    fetchSpy = vi.fn(async () => ({ ok: false, status: 403, text: async () => '' }));
    global.fetch = fetchSpy;
    // QSRSOFT_USERNAME/PASSWORD deliberately absent -- getEbosTokenViaPlaywright's own guard
    // returns null immediately rather than launching a real browser.

    const { resolveEbosToken } = await import('../../scripts/lib/ebos-auth.mjs');
    const token = await resolveEbosToken();

    expect(token).toBeNull();
  });
});
