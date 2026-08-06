import { describe, it, expect } from 'vitest';
import { _parseTable, _parseRows, _summarize } from '../utils/load-trace.js';

const BASE = 'https://abc123.supabase.co';

describe('_parseTable', () => {
  it('pulls the table name out of a REST url', () => {
    expect(_parseTable(`${BASE}/rest/v1/qsr_daily_activity?select=*&dt=gte.2026-01-01`))
      .toBe('qsr_daily_activity');
    expect(_parseTable(`${BASE}/rest/v1/profiles?id=eq.abc`)).toBe('profiles');
  });

  it('labels auth, storage and edge-function calls distinctly', () => {
    expect(_parseTable(`${BASE}/auth/v1/token?grant_type=refresh_token`)).toBe('auth');
    expect(_parseTable(`${BASE}/storage/v1/object/qsr-reports/x.csv`)).toBe('storage');
    expect(_parseTable(`${BASE}/functions/v1/sage-chat`)).toBe('fn:sage-chat');
  });

  it('returns null for non-Supabase traffic so it stays untraced', () => {
    expect(_parseTable('https://example.com/api/thing')).toBeNull();
    expect(_parseTable('/assets/index-abc.js')).toBeNull();
  });

  it('never throws on junk input', () => {
    expect(_parseTable(null)).toBeNull();
    expect(_parseTable(undefined)).toBeNull();
    expect(_parseTable({})).toBeNull();
  });
});

describe('_parseRows', () => {
  it('reads a row count from content-range', () => {
    expect(_parseRows('0-999/*')).toBe(1000);
    expect(_parseRows('0-41/42')).toBe(42);
    expect(_parseRows('0-0/1')).toBe(1);
  });

  it('returns null when the header is absent or unparseable', () => {
    expect(_parseRows(null)).toBeNull();
    expect(_parseRows('')).toBeNull();
    expect(_parseRows('*/*')).toBeNull();
  });
});

describe('_summarize', () => {
  it('reports a serialisation ratio near 1 for a strictly serial chain', () => {
    // Three back-to-back 100ms requests — exactly the App.js startup shape.
    const s = _summarize([
      { t0: 0, t1: 100 }, { t0: 100, t1: 200 }, { t0: 200, t1: 300 },
    ]);
    expect(s.n).toBe(3);
    expect(s.wall).toBe(300);
    expect(s.sum).toBe(300);
    expect(s.ratio).toBe(1);
    expect(s.idle).toBe(0);
  });

  it('reports a ratio well above 1 when requests overlap', () => {
    // Same three requests fired together.
    const s = _summarize([
      { t0: 0, t1: 100 }, { t0: 0, t1: 100 }, { t0: 0, t1: 100 },
    ]);
    expect(s.wall).toBe(100);
    expect(s.sum).toBe(300);
    expect(s.ratio).toBe(3);
  });

  it('counts dead air between requests as idle, not busy', () => {
    const s = _summarize([{ t0: 0, t1: 50 }, { t0: 250, t1: 300 }]);
    expect(s.wall).toBe(300);
    expect(s.busy).toBe(100);
    expect(s.idle).toBe(200);
  });

  it('merges overlapping intervals rather than double-counting busy time', () => {
    const s = _summarize([{ t0: 0, t1: 100 }, { t0: 50, t1: 150 }]);
    expect(s.busy).toBe(150);
    expect(s.sum).toBe(200);
    expect(s.idle).toBe(0);
  });

  it('handles the empty case without dividing by zero', () => {
    expect(_summarize([])).toEqual({ n: 0, wall: 0, sum: 0, busy: 0, idle: 0, ratio: 0 });
  });
});
