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
