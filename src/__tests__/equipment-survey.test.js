// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { latestEntriesByInstance } from '../engine/equipment-survey.js';

const row = (instanceId, action, submittedAt, extra = {}) =>
  ({ instance_id: instanceId, action, submitted_at: submittedAt, ...extra });

describe('latestEntriesByInstance', () => {
  it('returns the single row for a single-entry instance', () => {
    const rows = [row('a', 'added', '2026-10-01T00:00:00Z')];
    expect(latestEntriesByInstance(rows)).toEqual(rows);
  });

  it('keeps only the newest row per instance when rows are already newest-first', () => {
    const rows = [
      row('a', 'corrected', '2026-10-05T00:00:00Z', { serial_number: 'NEW' }),
      row('a', 'added', '2026-10-01T00:00:00Z', { serial_number: 'OLD' }),
    ];
    const out = latestEntriesByInstance(rows);
    expect(out).toHaveLength(1);
    expect(out[0].serial_number).toBe('NEW');
  });

  it('excludes an instance whose latest action is removed, even though it has older non-removed history', () => {
    const rows = [
      row('a', 'removed', '2026-10-10T00:00:00Z'),
      row('a', 'added', '2026-10-01T00:00:00Z'),
      row('b', 'added', '2026-10-02T00:00:00Z'),
    ];
    const out = latestEntriesByInstance(rows);
    expect(out.map(r => r.instance_id)).toEqual(['b']);
  });

  it('a correction after a removal brings the instance back (re-added)', () => {
    const rows = [
      row('a', 'corrected', '2026-10-10T00:00:00Z'),
      row('a', 'removed', '2026-10-05T00:00:00Z'),
      row('a', 'added', '2026-10-01T00:00:00Z'),
    ];
    const out = latestEntriesByInstance(rows);
    expect(out).toHaveLength(1);
    expect(out[0].action).toBe('corrected');
  });

  it('handles multiple independent instances for the same store', () => {
    const rows = [
      row('a', 'added', '2026-10-03T00:00:00Z'),
      row('b', 'added', '2026-10-02T00:00:00Z'),
      row('c', 'removed', '2026-10-04T00:00:00Z'),
      row('c', 'added', '2026-10-01T00:00:00Z'),
    ];
    const out = latestEntriesByInstance(rows);
    expect(out.map(r => r.instance_id).sort()).toEqual(['a', 'b']);
  });

  it('returns an empty array for no rows or all-removed rows', () => {
    expect(latestEntriesByInstance([])).toEqual([]);
    expect(latestEntriesByInstance(null)).toEqual([]);
    expect(latestEntriesByInstance([row('a', 'removed', '2026-10-01T00:00:00Z')])).toEqual([]);
  });

  it('ignores a malformed row with no instance_id rather than throwing', () => {
    const rows = [{ action: 'added', submitted_at: '2026-10-01T00:00:00Z' }, row('a', 'added', '2026-10-02T00:00:00Z')];
    expect(latestEntriesByInstance(rows).map(r => r.instance_id)).toEqual(['a']);
  });
});
