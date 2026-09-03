// @vitest-environment happy-dom
// @ts-nocheck
// app/shell.js's timeAgoShort() had zero test coverage despite being live -- formats a
// notification's created_at timestamp into "Xm/Xh/Xd ago", called inside NotificationRow.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { timeAgoShort } from '../app/shell.js';

const NOW = new Date('2026-06-15T12:00:00Z');

describe('timeAgoShort', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns an empty string for a falsy input', () => {
    expect(timeAgoShort(null)).toBe('');
    expect(timeAgoShort(undefined)).toBe('');
  });

  it('returns "just now" for a timestamp in the future (clock skew guard)', () => {
    expect(timeAgoShort(new Date(NOW.getTime() + 60000).toISOString())).toBe('just now');
  });

  it('returns "just now" for under a minute ago', () => {
    expect(timeAgoShort(new Date(NOW.getTime() - 30000).toISOString())).toBe('just now');
  });

  it('returns minutes ago under an hour', () => {
    expect(timeAgoShort(new Date(NOW.getTime() - 5 * 60000).toISOString())).toBe('5m ago');
    expect(timeAgoShort(new Date(NOW.getTime() - 59 * 60000).toISOString())).toBe('59m ago');
  });

  it('returns hours ago under a day', () => {
    expect(timeAgoShort(new Date(NOW.getTime() - 60 * 60000).toISOString())).toBe('1h ago');
    expect(timeAgoShort(new Date(NOW.getTime() - 23 * 3600000).toISOString())).toBe('23h ago');
  });

  it('returns days ago at 24h and beyond', () => {
    expect(timeAgoShort(new Date(NOW.getTime() - 24 * 3600000).toISOString())).toBe('1d ago');
    expect(timeAgoShort(new Date(NOW.getTime() - 72 * 3600000).toISOString())).toBe('3d ago');
  });
});
