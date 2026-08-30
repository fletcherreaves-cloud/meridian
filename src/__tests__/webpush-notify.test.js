// @ts-nocheck
// Dispatch #216 Task 5 — unit tests for scripts/lib/webpush-notify.mjs's sendWebPush(), mocking
// the `web-push` package so no real push is ever sent (per the dispatch's own verification
// list). Mirrors src/__tests__/eom-digest-notify.test.js / resend-notify.test.js's own
// mocked-dependency shape for this repo's Node-script libs.
//
// Real VAPID keys are stubbed (not real — configureWebPush() just needs both env vars present
// to call webpush.setVapidDetails(), which is itself mocked below). VITE_SUPABASE_URL/
// SUPABASE_SERVICE_ROLE_KEY need to be truthy so webpush-notify.mjs's module-scope `supabase`
// (via safeCreateClient, scripts/lib/safe-supabase-client.mjs) constructs the mocked client below
// rather than resolving to null — this file's own expired-subscription tests assert the mocked
// delete().eq() gets called.
//
// vi.stubEnv (not a raw process.env assignment) + afterAll(unstubAllEnvs) so these dummy values
// can't leak into process.env for whatever OTHER test file Vitest schedules next in the same
// worker — belt-and-suspenders on top of safeCreateClient's own fix (a leaked value can no longer
// crash any script using that helper), but there's no reason to leak it regardless.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'test-public-key');
vi.stubEnv('VAPID_PRIVATE_KEY', 'test-private-key');
vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');
afterAll(() => { vi.unstubAllEnvs(); });

const sendNotificationMock = vi.fn();
const setVapidDetailsMock = vi.fn();
vi.mock('web-push', () => ({
  default: {
    sendNotification: (...args) => sendNotificationMock(...args),
    setVapidDetails: (...args) => setVapidDetailsMock(...args),
  },
}));

const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => ({
      delete: () => ({ eq: (col, val) => deleteEqMock(table, col, val) }),
    }),
  }),
}));

const { sendWebPush, configureWebPush, VAPID_SUBJECT } = await import('../../scripts/lib/webpush-notify.mjs');

const SUB = { id: 'sub-1', endpoint: 'https://push.example/xyz', p256dh: 'p256dh-key', authKey: 'auth-key' };
const PAYLOAD = { title: 'Purcell — Food + Condiment count complete', body: 'EOM count update for 2026-08. Tap to view the Scoreboard.', url: 'https://meridianbi.vercel.app/?panel=eom-dashboard&store=0011657' };

beforeEach(() => {
  sendNotificationMock.mockReset().mockResolvedValue(undefined);
  setVapidDetailsMock.mockReset();
  deleteEqMock.mockReset().mockResolvedValue({ error: null });
});

describe('configureWebPush', () => {
  it('signs with the correct subject + both VAPID keys', () => {
    configureWebPush();
    expect(setVapidDetailsMock).toHaveBeenCalledWith(VAPID_SUBJECT, 'test-public-key', 'test-private-key');
    expect(VAPID_SUBJECT).toBe('mailto:fletcher.reaves@mcreaves.com');
  });
});

describe('sendWebPush — payload shape', () => {
  it('sends the endpoint/keys in the shape web-push expects, JSON-stringifying the payload', async () => {
    const ok = await sendWebPush(SUB, PAYLOAD);
    expect(ok).toBe(true);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    const [subArg, bodyArg] = sendNotificationMock.mock.calls[0];
    expect(subArg).toEqual({ endpoint: SUB.endpoint, keys: { p256dh: SUB.p256dh, auth: SUB.authKey } });
    expect(JSON.parse(bodyArg)).toEqual(PAYLOAD);
  });
});

describe('sendWebPush — expired subscription (404/410) deletes the row', () => {
  it('410: deletes the push_subscriptions row by id and returns false, without throwing', async () => {
    sendNotificationMock.mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }));
    const ok = await sendWebPush(SUB, PAYLOAD);
    expect(ok).toBe(false);
    expect(deleteEqMock).toHaveBeenCalledTimes(1);
    expect(deleteEqMock).toHaveBeenCalledWith('push_subscriptions', 'id', 'sub-1');
  });

  it('404: also deletes the row (same dead-subscription case as 410)', async () => {
    sendNotificationMock.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { statusCode: 404 }));
    const ok = await sendWebPush(SUB, PAYLOAD);
    expect(ok).toBe(false);
    expect(deleteEqMock).toHaveBeenCalledWith('push_subscriptions', 'id', 'sub-1');
  });

  it('does not attempt a delete when the subscription carries no id', async () => {
    sendNotificationMock.mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }));
    const noId = { ...SUB }; delete noId.id;
    const ok = await sendWebPush(noId, PAYLOAD);
    expect(ok).toBe(false);
    expect(deleteEqMock).not.toHaveBeenCalled();
  });
});

describe('sendWebPush — non-throwing on other failures', () => {
  it('a non-404/410 error (e.g. network failure) is swallowed, logged, and does NOT delete the row', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sendNotificationMock.mockRejectedValueOnce(new Error('network down'));
    await expect(sendWebPush(SUB, PAYLOAD)).resolves.toBe(false);
    expect(deleteEqMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('a 500 from the push service is treated as a non-expiry failure (no delete)', async () => {
    sendNotificationMock.mockRejectedValueOnce(Object.assign(new Error('Server Error'), { statusCode: 500 }));
    const ok = await sendWebPush(SUB, PAYLOAD);
    expect(ok).toBe(false);
    expect(deleteEqMock).not.toHaveBeenCalled();
  });
});

describe('sendWebPush — missing VAPID configuration', () => {
  it('warns and returns false without calling web-push at all', async () => {
    const origPub = process.env.VITE_VAPID_PUBLIC_KEY;
    delete process.env.VITE_VAPID_PUBLIC_KEY;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Re-import with a fresh module registry so the module-scope `configured` flag (already
    // flipped true by earlier tests in this file) doesn't mask the missing-key path.
    vi.resetModules();
    const { sendWebPush: freshSendWebPush } = await import('../../scripts/lib/webpush-notify.mjs');
    const ok = await freshSendWebPush(SUB, PAYLOAD);
    expect(ok).toBe(false);
    expect(sendNotificationMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    process.env.VITE_VAPID_PUBLIC_KEY = origPub;
  });
});
