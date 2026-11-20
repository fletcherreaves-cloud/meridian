// @ts-nocheck
// scripts/lib/lifelenz-auth.mjs — shared "verify LIFELENZ_TOKEN, fall back to a direct SignIn
// mutation" resolver (2026-11-20). Extracted from lifelenz-dar-pull.mjs's resolveToken(), the
// one LifeLenz auth path that kept running clean through the LIFELENZ_TOKEN expiry starting
// 2026-11-16 while five sibling Data Explorer pulls (which each hard-required LIFELENZ_TOKEN
// with no fallback at all) went dark for days. These tests pin the exact validate → fall back →
// throw sequence against a mocked global fetch, same convention census-demographics.test.js uses.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveLifelenzToken } from '../../scripts/lib/lifelenz-auth.mjs';

const BUSINESS_ID = '01979dbf-a166-759b-8702-aba9915c578e';
const ORIG_ENV = { ...process.env };

function restoreEnv() {
  for (const k of ['LIFELENZ_TOKEN', 'LIFELENZ_USERNAME', 'LIFELENZ_PASSWORD']) {
    if (ORIG_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = ORIG_ENV[k];
  }
}

describe('resolveLifelenzToken', () => {
  beforeEach(() => { vi.restoreAllMocks(); restoreEnv(); });
  afterEach(() => { restoreEnv(); });

  it('trusts a LIFELENZ_TOKEN that validates clean, and never calls the SignIn mutation', async () => {
    process.env.LIFELENZ_TOKEN = 'good-token';
    delete process.env.LIFELENZ_USERNAME;
    delete process.env.LIFELENZ_PASSWORD;
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('[]') }));

    const token = await resolveLifelenzToken(BUSINESS_ID);

    expect(token).toBe('good-token');
    expect(global.fetch).toHaveBeenCalledTimes(1); // the validation check only
    const [url] = global.fetch.mock.calls[0];
    expect(url).toBe(`https://us01-connect.lifelenz.com/api/admin/businesses/${BUSINESS_ID}/schedules`);
  });

  it('falls back to the SignIn mutation when the static token is expired (401/403/422)', async () => {
    process.env.LIFELENZ_TOKEN = 'stale-token';
    process.env.LIFELENZ_USERNAME = 'owner@example.com';
    process.env.LIFELENZ_PASSWORD = 'secret';
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 422, text: () => Promise.resolve('{"error":{"detail":"Session expired"}}') })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ data: { signIn: { authToken: 'fresh-token' } } }) });

    const token = await resolveLifelenzToken(BUSINESS_ID);

    expect(token).toBe('fresh-token');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const [signInUrl, signInOpts] = global.fetch.mock.calls[1];
    expect(signInUrl).toBe('https://idm.lifelenz.com/external/graphql?SignIn');
    const body = JSON.parse(signInOpts.body);
    expect(body.operationName).toBe('SignIn');
    expect(body.variables.username).toBe('owner@example.com');
    // credential is base64(password), not the plaintext password, in the wire payload
    expect(body.variables.credential).toBe(Buffer.from('secret', 'utf8').toString('base64'));
  });

  it('falls back to the SignIn mutation when a session-expired body carries a non-auth status', async () => {
    process.env.LIFELENZ_TOKEN = 'stale-token';
    process.env.LIFELENZ_USERNAME = 'owner@example.com';
    process.env.LIFELENZ_PASSWORD = 'secret';
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('INVALID_SESSION_ERROR: please sign in again') })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ data: { signIn: { authToken: 'fresh-token-2' } } }) });

    const token = await resolveLifelenzToken(BUSINESS_ID);
    expect(token).toBe('fresh-token-2');
  });

  it('goes straight to the SignIn mutation when no LIFELENZ_TOKEN is set at all', async () => {
    delete process.env.LIFELENZ_TOKEN;
    process.env.LIFELENZ_USERNAME = 'owner@example.com';
    process.env.LIFELENZ_PASSWORD = 'secret';
    global.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ data: { signIn: { authToken: 'direct-token' } } }) }));

    const token = await resolveLifelenzToken(BUSINESS_ID);

    expect(token).toBe('direct-token');
    expect(global.fetch).toHaveBeenCalledTimes(1); // no wasted validation call against a token that doesn't exist
  });

  it('throws a clear error when both the static token and the SignIn fallback fail', async () => {
    process.env.LIFELENZ_TOKEN = 'stale-token';
    process.env.LIFELENZ_USERNAME = 'owner@example.com';
    process.env.LIFELENZ_PASSWORD = 'wrong-password';
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, text: () => Promise.resolve('Session expired') })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ errors: [{ message: 'Invalid credentials' }] }) });

    await expect(resolveLifelenzToken(BUSINESS_ID)).rejects.toThrow(
      'Could not resolve a LifeLenz auth token via LIFELENZ_TOKEN or LIFELENZ_USERNAME/PASSWORD SignIn.'
    );
  });

  it('does not treat a non-expiry failure (e.g. a transient 503) as a reason to abandon the static token', async () => {
    process.env.LIFELENZ_TOKEN = 'good-but-flaky-token';
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 503, text: () => Promise.resolve('upstream unavailable') }));

    const token = await resolveLifelenzToken(BUSINESS_ID);

    // A 503 isn't a session-expired signal, so the (possibly still-valid) static token is kept
    // rather than discarded for an unrelated outage — same behavior lifelenz-dar-pull.mjs's
    // original resolveToken() has always had.
    expect(token).toBe('good-but-flaky-token');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
