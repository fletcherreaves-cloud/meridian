// @ts-nocheck
// Owner-reported (screenshot, 2026-11-04): Unified Targets' "Current (L4W)" column showed
// "— no data" for DT Park %, KVS Time, R2P, T-Red Before/After %, and Discount % even though a
// Smart Target (computed from a full year of history) existed for each. Root cause, measured
// against the real loaders in src/lib/supabase.js, not guessed: these metrics' TOL_SPEC entries
// (src/engine/tolerance-status.js) had either no cloud fallback at all (r2p, tRedB, tRedA,
// discP — manual ctrlRows/opsRows only) or only one (park/kvst — glimpseRows, the EMAILED Daily
// Glimpse stream, which isn't always fresh for a trailing 4-week window), while a second, often-
// fresher auto-pulled cloud source already existed and was simply never wired in:
// ds.qsrActSummaryRows.r2p (loadQsrActSummary's _finalizeQsrAct, reconciled exactly against
// QSRSoft's own R2P column), ds.opsCashRows.{tRedBPct,tRedAPct,discPct,cashOSPct}
// (loadOpsCashSheet, net-sales-weighted from qsr_cash_sheet), and ds.opsServiceRows.{park,kvst}
// (loadOpsServiceStats, from qsr_service_stats).
import { describe, it, expect } from 'vitest';
import { tolValuesForLoc } from '../engine/tolerance-status.js';

const LOC = '3708';
const now = new Date();
const sinceMs = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10).getTime();
const d = (daysAgo) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);

describe('tolValuesForLoc — cloud/cloud2 fallback chain for previously "no data" metrics', () => {
  it('r2p: falls through to ds.qsrActSummaryRows.r2p when there is no manual opsRows coverage', () => {
    const ds = { qsrActSummaryRows: [{ loc: LOC, date: d(2), r2p: 85.4 }] };
    expect(tolValuesForLoc(ds, 'r2p', LOC, sinceMs)).toEqual([85.4]);
  });

  it('r2p: manual opsRows still wins when both are present (man before cloud, unchanged precedence)', () => {
    const ds = {
      opsRows: [{ loc: LOC, date: d(2), r2p: 70 }],
      qsrActSummaryRows: [{ loc: LOC, date: d(2), r2p: 85.4 }],
    };
    expect(tolValuesForLoc(ds, 'r2p', LOC, sinceMs)).toEqual([70]);
  });

  it('park: falls through to ds.opsServiceRows.park (cloud2) when glimpseRows (cloud) has no coverage', () => {
    const ds = { opsServiceRows: [{ loc: LOC, date: d(2), park: 0.091 }] };
    expect(tolValuesForLoc(ds, 'park', LOC, sinceMs)).toEqual([0.091]);
  });

  it('park: the first cloud tier (glimpseRows) still wins over the second (opsServiceRows) when both resolve', () => {
    const ds = {
      glimpseRows: [{ loc: LOC, date: d(2), parkedPct: 0.05 }],
      opsServiceRows: [{ loc: LOC, date: d(2), park: 0.091 }],
    };
    expect(tolValuesForLoc(ds, 'park', LOC, sinceMs)).toEqual([0.05]);
  });

  it('kvst: falls through to ds.opsServiceRows.kvst (cloud2)', () => {
    const ds = { opsServiceRows: [{ loc: LOC, date: d(2), kvst: 48.2 }] };
    expect(tolValuesForLoc(ds, 'kvst', LOC, sinceMs)).toEqual([48.2]);
  });

  it('tRedB/tRedA/discP: resolve from ds.opsCashRows, which previously had no fallback at all', () => {
    const ds = { opsCashRows: [{ loc: LOC, date: d(2), tRedBPct: 0.0354, tRedAPct: 0.002, discPct: 0.0501 }] };
    expect(tolValuesForLoc(ds, 'tRedB', LOC, sinceMs)).toEqual([0.0354]);
    expect(tolValuesForLoc(ds, 'tRedA', LOC, sinceMs)).toEqual([0.002]);
    expect(tolValuesForLoc(ds, 'discP', LOC, sinceMs)).toEqual([0.0501]);
  });

  it('cashOS: gains ds.opsCashRows as a second cloud tier, on top of the pre-existing glimpseRows tier', () => {
    const ds = { opsCashRows: [{ loc: LOC, date: d(2), cashOSPct: -0.0002 }] };
    expect(tolValuesForLoc(ds, 'cashOS', LOC, sinceMs)).toEqual([-0.0002]);
  });

  it('still returns [] (real "no data", not a code bug) when NEITHER manual nor any cloud source has rows', () => {
    expect(tolValuesForLoc({}, 'r2p', LOC, sinceMs)).toEqual([]);
    expect(tolValuesForLoc({}, 'tRedB', LOC, sinceMs)).toEqual([]);
  });

  it('a loc with no matching rows in a populated stream still returns [] (store scoping unaffected)', () => {
    const ds = { opsCashRows: [{ loc: '9999', date: d(2), discPct: 0.05 }] };
    expect(tolValuesForLoc(ds, 'discP', LOC, sinceMs)).toEqual([]);
  });
});
