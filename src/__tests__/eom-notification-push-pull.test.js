// @ts-nocheck
// Dispatch #216 Task 5 — scoped integration-style test of the ACTUAL hook-point wiring in
// scripts/qsrsoft-onhand-pull.mjs's notifyRow() -> sendPushNotifications(), mirroring
// eom-notification-delivery-pull.test.js's own pattern (#211) for the email/SMS channels: import
// the real exported notifyRow from the pull script and exercise it directly, mocking only the
// leaf dependencies (webpush-notify.mjs's sendWebPush + the supabase-js client factory), so
// deleting the hook-point call would make these assertions fail rather than leave them passing
// against an unused engine (this repo's own "would this verification still pass if reverted" rule).
//
// CI FAILURE, root-caused and fixed 2026-08-30, two bugs:
// 1. A static `import ... from '../../scripts/qsrsoft-onhand-pull.mjs'` is hoisted above every
//    other top-level statement in this SAME file regardless of source order, so it always ran
//    BEFORE the env-var setup below -- in a clean CI checkout (neither real var set),
//    qsrsoft-onhand-pull.mjs's own `supabase = (url && key) ? createClient(...) : null` guard saw
//    both as undefined, resolved to null, and sendPushNotifications()'s `if (!supabase) return`
//    silently no-op'd -- so sendWebPushMock was never called and every assertion below failed.
//    Fixed by switching that import to a dynamic import() placed after the env vars are set
//    (below) -- a dynamic import genuinely evaluates where it's written.
// 2. A raw `process.env.X = process.env.X || 'dummy'` assignment (as this used to be) mutates the
//    real, PROCESS-WIDE process.env and is never undone -- Vitest does not reset process.env
//    between test FILES sharing the same worker, so it can leak a dummy-but-valid-shaped
//    Supabase URL/key into whatever runs after this file, poisoning an unrelated file's own real
//    (unmocked) guarded createClient() call -- see dispatch-217-eom-digest-schedule.test.js's own
//    header comment for the exact incident this caused on Node 20 (no native WebSocket). Using
//    vi.stubEnv (this repo's own established pattern) + afterAll(vi.unstubAllEnvs) scopes the
//    mutation to this file only.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');
afterAll(() => { vi.unstubAllEnvs(); });

const sendEmailMock = vi.fn().mockResolvedValue(true);
const sendSmsMock = vi.fn().mockResolvedValue(true);
vi.mock('../../scripts/lib/resend-notify.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    sendEmailNotification: (...args) => sendEmailMock(...args),
    sendSmsViaCarrierGateway: (...args) => sendSmsMock(...args),
  };
});

const sendWebPushMock = vi.fn().mockResolvedValue(true);
vi.mock('../../scripts/lib/webpush-notify.mjs', () => ({
  sendWebPush: (...args) => sendWebPushMock(...args),
}));

// push_subscriptions rows this run's read should return — mutated per-test.
let _mockSubs = [];
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      if (table !== 'push_subscriptions') throw new Error(`unexpected table in test: ${table}`);
      return { select: () => Promise.resolve({ data: _mockSubs, error: null }) };
    },
  }),
}));

// Dynamic import, evaluated HERE (after the env-var stubs above), not hoisted like a static
// import would be — see the header comment (bug 1) for why this matters.
const { deliverNotifications, notifyRow, buildNotificationRow } = await import('../../scripts/qsrsoft-onhand-pull.mjs');
import { computeCountProgress, diagnoseIncompleteCount, detectCountNotifications } from '../engine/eom-inventory.js';

beforeEach(() => {
  sendEmailMock.mockClear();
  sendSmsMock.mockClear();
  sendWebPushMock.mockClear().mockResolvedValue(true);
  _mockSubs = [];
});

const PERIOD = '2026-08';
const d = (day) => new Date(`2026-08-${String(day).padStart(2, '0')}T00:00:00`);
const ASOF = d(31);

function mkRealNotificationRow(loc) {
  const rows = [
    { wrin: 'F0', cls: 'Food', onHandAmt: 100, unitPrice: 5, totalUnits: 20, lastCounted: d(30), lastSubmitted: null },
    { wrin: 'C0', cls: 'Condiment', onHandAmt: 50, unitPrice: 5, totalUnits: 10, lastCounted: d(30), lastSubmitted: null },
  ];
  const p = computeCountProgress(rows, { period: PERIOD, asOf: ASOF });
  const detection = detectCountNotifications({ notified_classes: [] }, p, { asOf: ASOF });
  const diag = diagnoseIncompleteCount(rows, { period: PERIOD, minValue: 0 });
  return buildNotificationRow(loc, PERIOD, detection, diag);
}

describe('notifyRow — the push channel fires once per subscribed device, alongside email/SMS', () => {
  it('no subscriptions: sendWebPush is never called (email/SMS still fire as before)', async () => {
    const row = mkRealNotificationRow('0011657');
    await notifyRow(row);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    expect(sendWebPushMock).not.toHaveBeenCalled();
  });

  it('one subscription: sendWebPush called once with the subscription shape + a title/body/url payload', async () => {
    _mockSubs = [{ id: 'sub-1', endpoint: 'https://push.example/a', p256dh: 'p1', auth_key: 'a1' }];
    const row = mkRealNotificationRow('0011657'); // Purcell, per src/constants.js STORE_NAMES
    await notifyRow(row);

    expect(sendWebPushMock).toHaveBeenCalledTimes(1);
    const [sub, payload] = sendWebPushMock.mock.calls[0];
    expect(sub).toEqual({ id: 'sub-1', endpoint: 'https://push.example/a', p256dh: 'p1', authKey: 'a1' });
    expect(payload.title).toContain('Purcell');
    expect(payload.body).toContain('2026-08');
    expect(payload.url).toContain('panel=eom-dashboard');
    expect(payload.url).toContain('store=0011657');
  });

  it('a user with 2 devices gets 2 pushes, by design', async () => {
    _mockSubs = [
      { id: 'sub-1', endpoint: 'https://push.example/a', p256dh: 'p1', auth_key: 'a1' },
      { id: 'sub-2', endpoint: 'https://push.example/b', p256dh: 'p2', auth_key: 'a2' },
    ];
    const row = mkRealNotificationRow('0011657');
    await notifyRow(row);
    expect(sendWebPushMock).toHaveBeenCalledTimes(2);
    const endpoints = sendWebPushMock.mock.calls.map(c => c[0].endpoint);
    expect(endpoints).toEqual(['https://push.example/a', 'https://push.example/b']);
  });

  it('a rejected push send for one subscriber does not stop email/SMS or the next subscriber', async () => {
    sendWebPushMock.mockResolvedValueOnce(false); // sendWebPush itself never throws (own tests cover this)
    _mockSubs = [
      { id: 'sub-1', endpoint: 'https://push.example/a', p256dh: 'p1', auth_key: 'a1' },
      { id: 'sub-2', endpoint: 'https://push.example/b', p256dh: 'p2', auth_key: 'a2' },
    ];
    const row = mkRealNotificationRow('0011657');
    await notifyRow(row);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    expect(sendWebPushMock).toHaveBeenCalledTimes(2);
  });
});

describe('deliverNotifications — push fires per row too, same as email/SMS', () => {
  it('two notification rows, one subscriber each -> 2 push sends total', async () => {
    _mockSubs = [{ id: 'sub-1', endpoint: 'https://push.example/a', p256dh: 'p1', auth_key: 'a1' }];
    const rows = [mkRealNotificationRow('0011657'), mkRealNotificationRow('0005183')];
    await deliverNotifications(rows);
    expect(sendWebPushMock).toHaveBeenCalledTimes(2);
  });
});
