// @ts-nocheck
// 2026-10-12 -- unit tests for scripts/lib/app-notification-delivery.mjs, the push/email delivery
// half of the general app_notifications framework. Mocks the two underlying send primitives
// (sendWebPush/postResend) rather than re-mocking their own dependencies (web-push/fetch) a
// second time -- those are already covered by webpush-notify.test.js/resend-notify.test.js;
// this file's own job is proving deliverAppNotification() orchestrates them correctly (right
// channel, right payload, skips what wasn't opted into).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendWebPushMock = vi.fn().mockResolvedValue(true);
vi.mock('../../scripts/lib/webpush-notify.mjs', () => ({
  sendWebPush: (...a) => sendWebPushMock(...a),
}));

const postResendMock = vi.fn().mockResolvedValue(true);
vi.mock('../../scripts/lib/resend-notify.mjs', () => ({
  postResend: (...a) => postResendMock(...a),
  EMAIL_TO: 'fletcher.reaves@mcreaves.com',
}));

const {
  appNotificationUrl, buildPushPayload, buildEmailContent, deliverAppNotification,
} = await import('../../scripts/lib/app-notification-delivery.mjs');

beforeEach(() => { vi.clearAllMocks(); });

describe('appNotificationUrl', () => {
  it('is the bare app URL for no link', () => {
    expect(appNotificationUrl(null)).toBe('https://meridianbi.vercel.app');
  });
  it('builds ?panel=<id> for a plain panel link', () => {
    expect(appNotificationUrl('data-manager')).toBe('https://meridianbi.vercel.app/?panel=data-manager');
  });
  it('splits the eom-dashboard:<loc> colon-arg shape into the store param, matching EOM\'s own push URL', () => {
    expect(appNotificationUrl('eom-dashboard:3708')).toBe('https://meridianbi.vercel.app/?panel=eom-dashboard&store=3708');
  });
});

describe('buildPushPayload', () => {
  it('maps title/detail/link onto the {title,body,url} shape sendWebPush expects', () => {
    const row = { title: 'LifeLenz pull failing', detail: '3 days stale', link: 'data-manager' };
    expect(buildPushPayload(row)).toEqual({
      title: 'LifeLenz pull failing', body: '3 days stale',
      url: 'https://meridianbi.vercel.app/?panel=data-manager',
    });
  });
  it('falls back to an empty body when there is no detail', () => {
    const row = { title: 't', detail: null, link: null };
    expect(buildPushPayload(row).body).toBe('');
  });
});

describe('buildEmailContent', () => {
  it('includes the title, detail, severity badge, and a link to open the app', () => {
    const row = { title: 'LifeLenz pull failing', detail: '3 days stale', severity: 'crit', link: 'data-manager' };
    const { subject, html } = buildEmailContent(row);
    expect(subject).toBe('Meridian: LifeLenz pull failing');
    expect(html).toContain('LifeLenz pull failing');
    expect(html).toContain('3 days stale');
    expect(html).toContain('Critical');
    expect(html).toContain('https://meridianbi.vercel.app/?panel=data-manager');
  });
  it('omits the detail paragraph entirely when there is none, not an empty tag', () => {
    const { html } = buildEmailContent({ title: 't', detail: null, severity: 'info', link: null });
    expect(html).not.toContain('<p style="margin:0 0 12px');
  });
});

describe('deliverAppNotification', () => {
  const pushSub = { id: 'sub-1', endpoint: 'https://push.example/x', p256dh: 'p', auth_key: 'a' };
  const supabase = { from: () => ({ select: () => Promise.resolve({ data: [pushSub], error: null }) }) };

  it('sends push when notify_push is set, to every stored subscription', async () => {
    const row = { title: 't', detail: 'd', link: null, severity: 'crit', notify_push: true, notify_email: false };
    await deliverAppNotification(row, { supabase });
    expect(sendWebPushMock).toHaveBeenCalledTimes(1);
    expect(sendWebPushMock).toHaveBeenCalledWith(
      { id: 'sub-1', endpoint: pushSub.endpoint, p256dh: 'p', authKey: 'a' },
      { title: 't', body: 'd', url: 'https://meridianbi.vercel.app' },
    );
    expect(postResendMock).not.toHaveBeenCalled();
  });

  it('sends email when notify_email is set', async () => {
    const row = { title: 't', detail: 'd', link: null, severity: 'crit', notify_push: false, notify_email: true };
    await deliverAppNotification(row, { supabase });
    expect(postResendMock).toHaveBeenCalledTimes(1);
    expect(postResendMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'fletcher.reaves@mcreaves.com', subject: 'Meridian: t' }));
    expect(sendWebPushMock).not.toHaveBeenCalled();
  });

  it('sends neither when both flags are false -- the common, in-app-only case', async () => {
    const row = { title: 't', notify_push: false, notify_email: false };
    await deliverAppNotification(row, { supabase });
    expect(sendWebPushMock).not.toHaveBeenCalled();
    expect(postResendMock).not.toHaveBeenCalled();
  });

  it('skips push gracefully (no throw) when notify_push is set but no supabase client is passed', async () => {
    const row = { title: 't', notify_push: true, notify_email: false };
    await expect(deliverAppNotification(row, {})).resolves.toBeUndefined();
    expect(sendWebPushMock).not.toHaveBeenCalled();
  });

  it('is a no-op for a null row', async () => {
    await expect(deliverAppNotification(null, { supabase })).resolves.toBeUndefined();
    expect(sendWebPushMock).not.toHaveBeenCalled();
    expect(postResendMock).not.toHaveBeenCalled();
  });
});

// task #91 (Movers alerts) — the first producer to use target_roles. A mock supabase that
// differentiates by table name, unlike the single-shape mock above, since this path reads BOTH
// push_subscriptions and profiles.
describe('deliverAppNotification — target_roles (task #91)', () => {
  const subs = [
    { id: 'sub-gm', user_id: 'u-gm', endpoint: 'e1', p256dh: 'p', auth_key: 'a' },
    { id: 'sub-vp', user_id: 'u-vp', endpoint: 'e2', p256dh: 'p', auth_key: 'a' },
    { id: 'sub-gm-other-store', user_id: 'u-gm-other', endpoint: 'e3', p256dh: 'p', auth_key: 'a' },
    { id: 'sub-gm-unrestricted', user_id: 'u-gm-all', endpoint: 'e4', p256dh: 'p', auth_key: 'a' },
  ];
  const profiles = [
    { id: 'u-gm', role: 'gm', accessible_locs: ['3708'] },          // matches role + loc
    { id: 'u-vp', role: 'vp', accessible_locs: null },              // wrong role, even with full access
    { id: 'u-gm-other', role: 'gm', accessible_locs: ['9999'] },    // right role, wrong store
    { id: 'u-gm-all', role: 'gm', accessible_locs: null },          // right role, unrestricted — null means every store
  ];
  const supabase = {
    from: (table) => ({
      select: () => Promise.resolve(
        table === 'push_subscriptions' ? { data: subs, error: null }
        : table === 'profiles' ? { data: profiles, error: null }
        : { data: [], error: null }
      ),
    }),
  };

  it('pushes only to subscriptions whose profile role is in target_roles AND whose accessible_locs covers this row\'s loc', async () => {
    const row = { title: 't', detail: 'd', link: null, severity: 'crit', notify_push: true, notify_email: false, loc: '3708', target_roles: ['gm', 'area_supervisor', 'do'] };
    await deliverAppNotification(row, { supabase });
    const pushedSubIds = sendWebPushMock.mock.calls.map(([sub]) => sub.id);
    expect(pushedSubIds.sort()).toEqual(['sub-gm', 'sub-gm-unrestricted'].sort());
  });

  it('with no target_roles, broadcasts to every subscription regardless of role — unchanged EOM-style behavior', async () => {
    const row = { title: 't', detail: 'd', link: null, severity: 'crit', notify_push: true, notify_email: false, loc: '3708' };
    await deliverAppNotification(row, { supabase });
    expect(sendWebPushMock).toHaveBeenCalledTimes(subs.length);
  });

  it('a null accessible_locs always qualifies for a matching role, regardless of loc', async () => {
    const row = { title: 't', notify_push: true, notify_email: false, loc: '5555', target_roles: ['gm'] };
    await deliverAppNotification(row, { supabase });
    const pushedSubIds = sendWebPushMock.mock.calls.map(([sub]) => sub.id);
    expect(pushedSubIds).toEqual(['sub-gm-unrestricted']);
  });
});
