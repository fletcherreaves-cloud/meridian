// @vitest-environment happy-dom
// @ts-nocheck
// Backlog item: "ds.storeIds and ds.loaded are both manual-labor-derived (set from laborRows)
// -- the same silent-failure-on-cloud-only-device shape #270 was supposed to fix for SAGE."
// ds.loaded/ds.storeIds (engine/pipeline.js) were `ds.laborRows.length>0` / a Set built from
// `ds.laborRows.map(r=>r.loc)` verbatim -- true/populated only once a manual Labor Analysis
// workbook had been uploaded on THIS device, false/empty on a cloud-only device even with
// every auto/emailed stream (DAR, FOB, LifeLenz, Glimpse, Sales Ledger, ...) fully populated.
// That silently disabled 10+ `if(!ds.loaded)` gates in analytics.js, why.js's "Single-store
// anomaly" forecast-miss diagnosis, Location Intel, SAGE's own hasData check (sage.js has its
// own comment naming this exact bug and explicitly NOT using ds.loaded because of it), and more.
//
// Fix: dsHasData/dsAutoStoreIds/annotateAutoFirstFlags derive from laborRows OR any
// STREAMS-tracked (stream-freshness.js) cloud/emailed source, so a cloud-only device with real
// auto data is no longer indistinguishable from a genuinely empty one. buildDS/mergeDS
// (manual-upload paths) call the same shared function; App.js's setDs is wrapped so every one
// of its ~32 direct cloud-stream setDs() calls (which never touch buildDS/mergeDS at all) gets
// the same re-derivation too -- see setDs's own comment in App.js. These tests cover the shared
// derivation function itself, which is where the actual logic (and its edge cases -- the
// qsrFobRows zero-pad quirk in particular) lives.
import { describe, it, expect } from 'vitest';
import { dsHasData, dsAutoStoreIds, annotateAutoFirstFlags, buildDS, mergeDS } from '../engine/pipeline.js';
import { STREAMS } from '../engine/stream-freshness.js';

const emptyWb = () => ({ SheetNames: [], Sheets: {} });

describe('dsHasData (dispatch: ds.loaded auto-first fix)', () => {
  it('false for null/undefined ds', () => {
    expect(dsHasData(null)).toBe(false);
    expect(dsHasData(undefined)).toBe(false);
  });

  it('false when every known source is empty/absent', () => {
    expect(dsHasData({ laborRows: [] })).toBe(false);
    expect(dsHasData({})).toBe(false);
  });

  it('true from manual laborRows alone (pre-fix behavior preserved)', () => {
    expect(dsHasData({ laborRows: [{ loc: '5', date: new Date() }] })).toBe(true);
  });

  it('true from an auto/cloud stream alone, laborRows empty -- the actual bug this closes', () => {
    // qsrActSummaryRows = DAR, the fully-automated daily stream (CLAUDE.md: "qsr_daily_activity").
    expect(dsHasData({ laborRows: [], qsrActSummaryRows: [{ loc: '5', date: new Date() }] })).toBe(true);
  });

  it('true from an emailed stream alone (glimpseRows/salesLedgerRows/cashRows)', () => {
    expect(dsHasData({ laborRows: [], glimpseRows: [{ loc: '9', date: new Date() }] })).toBe(true);
    expect(dsHasData({ laborRows: [], salesLedgerRows: [{ loc: '9', date: new Date() }] })).toBe(true);
    expect(dsHasData({ laborRows: [], cashRows: [{ loc: '9', date: new Date() }] })).toBe(true);
  });

  it('true from LifeLenz schedRows alone', () => {
    expect(dsHasData({ laborRows: [], schedRows: [{ loc: '12', date: new Date() }] })).toBe(true);
  });

  it('every STREAMS entry individually flips it true (exhaustive over the real registry, not a hardcoded subset)', () => {
    for (const s of STREAMS) {
      const ds = { laborRows: [], [s.dsField]: [{ loc: '7', date: new Date() }] };
      expect(dsHasData(ds), `dsField "${s.dsField}" (${s.key}) should flip dsHasData true`).toBe(true);
    }
  });

  it('an empty array on a stream field does NOT flip it true', () => {
    expect(dsHasData({ laborRows: [], qsrActSummaryRows: [] })).toBe(false);
  });
});

describe('dsAutoStoreIds (dispatch: ds.loaded auto-first fix)', () => {
  it('empty array for null/undefined/empty ds', () => {
    expect(dsAutoStoreIds(null)).toEqual([]);
    expect(dsAutoStoreIds({})).toEqual([]);
  });

  it('unions laborRows locs with auto-stream locs, sorted, deduped', () => {
    const ds = {
      laborRows: [{ loc: '3', date: new Date() }, { loc: '9', date: new Date() }],
      qsrActSummaryRows: [{ loc: '9', date: new Date() }, { loc: '5', date: new Date() }],
      glimpseRows: [{ loc: '20', date: new Date() }],
    };
    expect(dsAutoStoreIds(ds)).toEqual(['20', '3', '5', '9']); // string sort, matches the pre-fix .sort() convention
  });

  it('a cloud-only store (never in laborRows) is included -- this is the actual fix', () => {
    const ds = { laborRows: [], qsrActSummaryRows: [{ loc: '42', date: new Date() }] };
    expect(dsAutoStoreIds(ds)).toEqual(['42']);
  });

  it('qsrFobRows is zero-padding-normalized to match every other source (metric-source.js\'s own _PADDED_LOC_SOURCES quirk)', () => {
    const ds = {
      laborRows: [{ loc: '8', date: new Date() }],
      qsrFobRows: [{ loc: '0000008', date: new Date() }, { loc: '0000015', date: new Date() }],
    };
    // '0000008' must collapse onto laborRows' '8', not appear as a spurious second store.
    expect(dsAutoStoreIds(ds)).toEqual(['15', '8']);
  });

  it('ignores rows with a null/undefined loc rather than adding a bogus entry', () => {
    const ds = { laborRows: [], qsrActSummaryRows: [{ loc: null, date: new Date() }, { date: new Date() }] };
    expect(dsAutoStoreIds(ds)).toEqual([]);
  });
});

describe('annotateAutoFirstFlags (dispatch: ds.loaded auto-first fix)', () => {
  it('sets both ds.loaded and ds.storeIds in place and returns the same object', () => {
    const ds = { laborRows: [], qsrActSummaryRows: [{ loc: '5', date: new Date() }] };
    const out = annotateAutoFirstFlags(ds);
    expect(out).toBe(ds);
    expect(ds.loaded).toBe(true);
    expect(ds.storeIds).toEqual(['5']);
  });

  it('a genuinely empty ds still resolves loaded:false, storeIds:[] (no false positive)', () => {
    const ds = { laborRows: [] };
    annotateAutoFirstFlags(ds);
    expect(ds.loaded).toBe(false);
    expect(ds.storeIds).toEqual([]);
  });

  it('passes null through unchanged', () => {
    expect(annotateAutoFirstFlags(null)).toBe(null);
  });
});

describe('buildDS/mergeDS call the shared derivation (not a redundant reimplementation)', () => {
  it('buildDS([]) still resolves loaded:false/storeIds:[] with zero manual data (no false positive from the fix)', () => {
    const ds = buildDS([]);
    expect(ds.loaded).toBe(false);
    expect(ds.storeIds).toEqual([]);
  });

  it('mergeDS on an already cloud-loaded ds (App.js\'s real shape after auto streams land) keeps loaded:true and the cloud store, even for a no-op manual upload', () => {
    const cloudDs = buildDS([]);
    cloudDs.qsrActSummaryRows = [{ loc: '11', date: new Date() }];
    // Simulate what App.js's setDs wrapper does after every cloud stream lands -- this is the
    // actual shape mergeDS receives as `existing` on a real cloud-loaded device.
    annotateAutoFirstFlags(cloudDs);
    expect(cloudDs.loaded).toBe(true); // sanity: cloud data alone already resolves this

    // A manual upload that parses to zero rows (empty workbook, same fixture dispatch #72's
    // own buildDS test uses) must not silently wipe out the cloud-derived flags -- pre-fix,
    // mergeDS recomputed ds.loaded/storeIds from ds.laborRows ALONE, which this upload leaves
    // empty, so this was the exact regression a manual upload could trigger.
    const merged = mergeDS(cloudDs, emptyWb(), 'labor', 'Empty Labor Analysis.xlsx');
    expect(merged.loaded).toBe(true);
    expect(merged.storeIds).toContain('11');
  });
});
