// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { streamFreshness, worstStream, STREAMS, WARN_GRACE_DAYS, CRIT_GRACE_DAYS } from '../engine/stream-freshness.js';

const day = n => new Date(2026, 7, n, 12); // Aug n 2026, noon local
const rowsAt = date => [{ loc: '1', date }];

/** A ds with every stream fresh at `asOf`, so tests can override just the one under test. */
function freshDs(asOf) {
  const ds = {};
  for (const s of STREAMS) ds[s.dsField] = rowsAt(asOf);
  return ds;
}

describe('streamFreshness — per-stream, not pooled', () => {
  it('a field never loaded into ds is skipped, not reported as an incident', () => {
    const res = streamFreshness({}, day(16));
    expect(res).toEqual([]);
  });

  it('a stream fresh as of today is ok', () => {
    const ds = { qsrFobRows: rowsAt(day(16)) };
    const res = streamFreshness(ds, day(16));
    expect(res.find(r => r.key === 'fob').severity).toBe('ok');
    expect(res.find(r => r.key === 'fob').staleDays).toBe(0);
  });

  it('clamps to asOf — a future-dated row (LifeLenz\'s forward schedule) cannot read as fresher than it is', () => {
    const ds = { schedRows: [...rowsAt(day(10)), ...rowsAt(day(30))] }; // Aug 30 is "the future" relative to asOf=Aug16
    const res = streamFreshness(ds, day(16));
    const lifelenz = res.find(r => r.key === 'lifelenz');
    expect(lifelenz.staleDays).toBe(6); // uses Aug 10, not the future Aug 30 row
  });

  it('a stream with rows but every date unusable (NaN) reports Infinity staleDays, not a false ok', () => {
    const ds = { qsrFobRows: [{ loc: '1', date: 'not-a-date' }] };
    const res = streamFreshness(ds, day(16));
    expect(res.find(r => r.key === 'fob').staleDays).toBe(Infinity);
    expect(res.find(r => r.key === 'fob').severity).toBe('crit');
  });

  it('thresholds are per-stream cadence + grace, not the old hardcoded 14 days', () => {
    // Every current stream is cadenceDays:1, so warn/crit land at 1+WARN_GRACE_DAYS and
    // 1+CRIT_GRACE_DAYS — nowhere near the old pooled 7/14-day thresholds.
    for (const s of STREAMS) expect(s.cadenceDays).toBe(1);
    expect(WARN_GRACE_DAYS).toBeLessThan(7);
    expect(CRIT_GRACE_DAYS).toBeLessThan(14);
  });
});

describe('#171 verification bar — case 1: one dead stream among four fresh ones', () => {
  it('names the one stale stream even though four others are current today', () => {
    const ds = freshDs(day(16));
    ds.schedRows = rowsAt(day(-14)); // 30 days before Aug16 (Jul 17) — LifeLenz dark a month
    const w = worstStream(ds, day(16));
    expect(w).toBeTruthy();
    expect(w.key).toBe('lifelenz');
    expect(w.label).toBe('LifeLenz labor/schedule');
    expect(w.severity).toBe('crit');
    expect(w.staleDays).toBe(30);
  });

  // The regression guard: prove the OLD pooled Math.max logic (at-a-glance.js's original
  // _freshD/latestLab) stays SILENT on this exact scenario — that silence is #171's bug,
  // and it's what makes the assertion above worth having. Reimplemented verbatim from the
  // pre-fix at-a-glance.js (not imported — that file is a huge React module with no
  // pure-function seam), run against the SAME fixture as the test above.
  it('regression guard: the pre-#171 pooled Math.max check stays green on the same fixture — this is the silence being fixed', () => {
    const ds = freshDs(day(16));
    ds.schedRows = rowsAt(day(-14));
    const tMs = day(16).getTime();
    const pick = arr => (arr || []).map(r => r.date).filter(Boolean)
      .map(d => d instanceof Date ? d.getTime() : new Date(d).getTime());
    // The old array: laborRows + qsrActSummaryRows + qsrFobRows + glimpseRows + cashRows.
    // schedRows (LifeLenz) was never even in the pooled array — that's half of why it
    // could go dark 6 days unnoticed; the other half is Math.max itself.
    const all = [...pick(ds.qsrActSummaryRows), ...pick(ds.qsrFobRows),
      ...pick(ds.glimpseRows), ...pick(ds.cashRows)].filter(ms => !isNaN(ms) && ms <= tMs);
    const latestLab = all.length ? new Date(Math.max(...all)) : null;
    const dataAge = latestLab ? Math.floor((tMs - latestLab.getTime()) / 864e5) : 999;
    expect(dataAge).toBe(0); // every OTHER stream is fresh today, so the pool reads "0 days old"
    expect(dataAge).toBeLessThanOrEqual(7); // stays under even the old WARN threshold — silent
  });
});

describe('#171 verification bar — case 2: real sales_ledger_daily gap, Aug 12-16', () => {
  // Real production dates, not synthetic: sales_ledger_daily's max(date) was 2026-08-11 as
  // measured live against Supabase during this fix (the same gap #346 found while debugging
  // the Digital Sales tile) — DAR/FOB/LifeLenz/Ops Labor were all current at 2026-08-16 the
  // same moment. Real history, so this can't drift into a synthetic that passes for the
  // wrong reason.
  it('names the Sales Ledger specifically while its siblings are current', () => {
    const ds = {
      qsrActSummaryRows: rowsAt(day(16)),   // DAR — current
      qsrFobRows:        rowsAt(day(16)),   // FOB — current
      opsLaborRows:       rowsAt(day(16)),   // Ops Labor Summary — current
      schedRows:          rowsAt(day(16)),   // LifeLenz — current
      salesLedgerRows:    rowsAt(day(11)),   // real measured max(date): 2026-08-11
    };
    const w = worstStream(ds, day(16));
    expect(w).toBeTruthy();
    expect(w.key).toBe('salesLedger');
    expect(w.label).toBe('Sales Ledger (email)');
    expect(w.staleDays).toBe(5);
    expect(w.severity).toBe('crit'); // 5 > cadence(1)+CRIT_GRACE_DAYS(3)=4
  });

  it('all streams current reports no worst stream', () => {
    const ds = freshDs(day(16));
    expect(worstStream(ds, day(16))).toBeNull();
  });
});
