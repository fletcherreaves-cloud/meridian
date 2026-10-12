import { describe, it, expect } from 'vitest';
import { buildAppNotification, isNotificationVisible, resolvedKeys, SEVERITY_COLOR, SEVERITIES }
  from '../engine/app-notifications.js';

describe('buildAppNotification', () => {
  it('builds a minimal row with sane defaults', () => {
    const row = buildAppNotification({ type: 'signal_anomaly', title: 'Sales down 30%' });
    expect(row).toEqual({
      type: 'signal_anomaly', loc: null, period: null, severity: 'info',
      title: 'Sales down 30%', detail: null, link: null, resolve_key: null, payload: null,
      notify_push: false, notify_email: false,
    });
  });

  it('carries every optional field through', () => {
    const row = buildAppNotification({
      type: 'sync_failure', loc: 3708, period: '2026-10', severity: 'crit',
      title: 'LifeLenz pull failing', detail: '3 days stale', link: 'data-manager',
      resolveKey: 'sync_failure:lifelenz-pull', payload: { streamId: 'lifelenz' },
    });
    expect(row).toEqual({
      type: 'sync_failure', loc: '3708', period: '2026-10', severity: 'crit',
      title: 'LifeLenz pull failing', detail: '3 days stale', link: 'data-manager',
      resolve_key: 'sync_failure:lifelenz-pull', payload: { streamId: 'lifelenz' },
      notify_push: true, notify_email: true,
    });
  });

  it('falls back to info for an unrecognized severity rather than throwing', () => {
    const row = buildAppNotification({ type: 'x', title: 't', severity: 'bogus' });
    expect(row.severity).toBe('info');
  });

  it('throws on a missing type or title -- a producer bug, not user input', () => {
    expect(() => buildAppNotification({ title: 't' })).toThrow(/type/);
    expect(() => buildAppNotification({ type: 'x' })).toThrow(/title/);
  });

  it('SEVERITY_COLOR/SEVERITIES cover exactly the three severities the UI renders', () => {
    expect(SEVERITIES).toEqual(['crit', 'warn', 'info']);
    expect(Object.keys(SEVERITY_COLOR).sort()).toEqual(['crit', 'info', 'warn']);
  });
});

describe('buildAppNotification — delivery defaults by severity ("where appropriate and valuable")', () => {
  it('crit defaults to BOTH push and email', () => {
    const row = buildAppNotification({ type: 'x', title: 't', severity: 'crit' });
    expect(row.notify_push).toBe(true);
    expect(row.notify_email).toBe(true);
  });
  it('warn defaults to push only', () => {
    const row = buildAppNotification({ type: 'x', title: 't', severity: 'warn' });
    expect(row.notify_push).toBe(true);
    expect(row.notify_email).toBe(false);
  });
  it('info defaults to neither -- in-app only', () => {
    const row = buildAppNotification({ type: 'x', title: 't', severity: 'info' });
    expect(row.notify_push).toBe(false);
    expect(row.notify_email).toBe(false);
  });
  it('an explicit notifyPush/notifyEmail always overrides the severity default', () => {
    const row = buildAppNotification({ type: 'x', title: 't', severity: 'info', notifyPush: true, notifyEmail: true });
    expect(row.notify_push).toBe(true);
    expect(row.notify_email).toBe(true);
    const row2 = buildAppNotification({ type: 'x', title: 't', severity: 'crit', notifyPush: false, notifyEmail: false });
    expect(row2.notify_push).toBe(false);
    expect(row2.notify_email).toBe(false);
  });
});

describe('isNotificationVisible', () => {
  it('is true for a fresh row', () => {
    expect(isNotificationVisible({ title: 't' })).toBe(true);
  });
  it('is false once dismissed or cleared', () => {
    expect(isNotificationVisible({ dismissed_at: '2026-10-12T00:00:00Z' })).toBe(false);
    expect(isNotificationVisible({ cleared_at: '2026-10-12T00:00:00Z' })).toBe(false);
  });
  it('is false for a null/undefined row', () => {
    expect(isNotificationVisible(null)).toBe(false);
    expect(isNotificationVisible(undefined)).toBe(false);
  });
});

// This is the "general, not EOM-specific" proof -- a synthetic type (sync_failure) no live
// producer writes yet, run through the exact same pure logic a real producer would call.
describe('resolvedKeys — the auto-clear primitive, proven generic with a synthetic type', () => {
  const row = (key, extra = {}) => ({ type: 'sync_failure', resolve_key: key, ...extra });

  it('clears a key no longer in the producer\'s current still-open set', () => {
    const prior = [row('sync_failure:lifelenz'), row('sync_failure:qsrsoft')];
    // Producer re-ran: lifelenz recovered, qsrsoft is still failing.
    expect(resolvedKeys(prior, ['sync_failure:qsrsoft'])).toEqual(['sync_failure:lifelenz']);
  });

  it('clears nothing when every prior key is still open', () => {
    const prior = [row('a'), row('b')];
    expect(resolvedKeys(prior, ['a', 'b'])).toEqual([]);
  });

  it('clears everything when the producer reports nothing open at all', () => {
    const prior = [row('a'), row('b')];
    expect(resolvedKeys(prior, [])).toEqual(['a', 'b']);
  });

  it('ignores rows with no resolve_key (one-shot events, nothing to auto-clear)', () => {
    const prior = [row(null), { type: 'sync_failure' }];
    expect(resolvedKeys(prior, [])).toEqual([]);
  });

  it('ignores rows already dismissed or cleared -- never re-clears or double-processes', () => {
    const prior = [row('a', { dismissed_at: '2026-10-12T00:00:00Z' }), row('b', { cleared_at: '2026-10-12T00:00:00Z' })];
    expect(resolvedKeys(prior, [])).toEqual([]);
  });

  it('de-duplicates when the same resolve_key appears on more than one prior row', () => {
    const prior = [row('a'), row('a')];
    expect(resolvedKeys(prior, [])).toEqual(['a']);
  });
});
