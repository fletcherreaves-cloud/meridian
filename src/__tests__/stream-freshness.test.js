// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { streamFreshness, worstStream, STREAMS, WARN_GRACE_DAYS, CRIT_GRACE_DAYS } from '../engine/stream-freshness.js';

const day = n => new Date(2026, 7, n, 12); // Aug n 2026, noon local
const rowsAt = date => [{ loc: '1', date }];
const rowsAtField = (date, field) => [{ loc: '1', [field]: date }];

/** A ds with every stream fresh at `asOf`, so tests can override just the one under test.
 *  Respects each stream's own dateField (defaults to 'date') -- the 'month'-keyed streams
 *  need a row shaped { month: <date> }, not { date: <date> }, to read as fresh. */
function freshDs(asOf) {
  const ds = {};
  for (const s of STREAMS) ds[s.dsField] = rowsAtField(asOf, s.dateField || 'date');
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
    // Every daily stream is cadenceDays:1, so warn/crit land at 1+WARN_GRACE_DAYS and
    // 1+CRIT_GRACE_DAYS — nowhere near the old pooled 7/14-day thresholds. The 6 'month'-keyed
    // streams (added 2026-09-16) are genuinely monthly-grained and use cadenceDays:31 instead —
    // see stream-freshness.js's own comment on why a daily threshold would false-alarm them.
    for (const s of STREAMS) expect(s.cadenceDays).toBe(s.dateField === 'month' ? 31 : 1);
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

describe('Inventory Summary/Usage freshness (closed 2026-09-13 -- was a documented gap)', () => {
  it('is present in STREAMS, checked the same as every other auto stream', () => {
    const s = STREAMS.find(x => x.key === 'inventorySummary');
    expect(s).toBeTruthy();
    expect(s.dsField).toBe('qsrInventorySummaryRows');
    expect(s.cadenceDays).toBe(1);
  });

  it('names Inventory Summary specifically when its lightweight freshness probe is stale while siblings are current', () => {
    const ds = freshDs(day(16));
    ds.qsrInventorySummaryRows = rowsAt(day(10)); // the pull went silent 6 days
    const w = worstStream(ds, day(16));
    expect(w).toBeTruthy();
    expect(w.key).toBe('inventorySummary');
    expect(w.label).toBe('Inventory Summary/Usage');
    expect(w.staleDays).toBe(6);
  });

  it('a probe field never populated in ds (App.js load failed/still pending) is skipped, not reported as an incident -- same "not loaded" contract as every other stream', () => {
    const res = streamFreshness({}, day(16));
    expect(res.find(r => r.key === 'inventorySummary')).toBeUndefined();
  });

  it('an empty-but-loaded probe (loadQsrInventorySummaryFreshness resolved to []) reads as critically stale, not silently skipped -- same as any other stream with an array present but no usable date', () => {
    const res = streamFreshness({ qsrInventorySummaryRows: [] }, day(16));
    const s = res.find(r => r.key === 'inventorySummary');
    expect(s.staleDays).toBe(Infinity);
    expect(s.severity).toBe('crit');
  });
});

describe('coverage audit additions (2026-09-16) -- eBOS, Forecast Week Cache, and 6 month-keyed streams', () => {
  it('eBOS and Forecast Week Cache use the default date field, checked like any daily stream', () => {
    const ebos = STREAMS.find(x => x.key === 'ebos');
    const fwc = STREAMS.find(x => x.key === 'forecastWeekCache');
    expect(ebos).toMatchObject({ dsField: 'ebosRows', cadenceDays: 1 });
    expect(fwc).toMatchObject({ dsField: 'forecastWeekCache', cadenceDays: 1 });
    expect(ebos.dateField).toBeUndefined();
    expect(fwc.dateField).toBeUndefined();
  });

  it('the 6 month-keyed streams read their own `month` field (YYYY-MM), not `date`', () => {
    const s = STREAMS.find(x => x.key === 'rosterStats');
    const ds = { rosterStatsRows: [{ loc: '1', month: '2026-08' }] };
    const res = streamFreshness(ds, day(16)); // Aug 16 2026
    const found = res.find(r => r.key === 'rosterStats');
    expect(found.staleDays).toBe(15); // Aug 16 - Aug 1 (month parses as the 1st)
    expect(found.severity).toBe('ok'); // well within cadenceDays:31 + grace
  });

  it('THE BUG THIS PREVENTS: a month-keyed row has no `date` field at all -- without the dateField override, every one of these 6 streams would read Infinity-stale permanently, even on a fully healthy daily pull', () => {
    const row = { loc: '1', month: '2026-08' };
    expect(row.date).toBeUndefined(); // confirms these rows genuinely have nothing under 'date'
    expect(STREAMS.find(x => x.key === 'rosterStats').dateField).toBe('month'); // the real entry overrides it
  });

  it('a real dead pull (month value frozen from over a month ago) IS flagged, not masked by the coarser threshold', () => {
    const ds = { rosterStatsRows: [{ loc: '1', month: '2026-06' }] }; // frozen at June, asOf is Aug 16
    const res = streamFreshness(ds, day(16));
    const found = res.find(r => r.key === 'rosterStats');
    expect(found.severity).toBe('crit'); // >34 days since Jun 1
  });

  it('all 8 new streams are skipped (not an incident) when not yet loaded into ds this session', () => {
    const res = streamFreshness({}, day(16));
    for (const key of ['ebos', 'forecastWeekCache', 'rosterStats', 'rosterRoleCounts', 'turnover', 'digitalApp', 'mcdelivery', 'shiftManager']) {
      expect(res.find(r => r.key === key)).toBeUndefined();
    }
  });
});
