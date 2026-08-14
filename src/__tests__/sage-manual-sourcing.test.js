// @ts-nocheck
// #270 phase 1 — SAGE's system prompt used to build itself from manual, device-local rows
// (ds.laborRows/ctrlRows/opsRows), bypassing metric-source.js's auto-first resolver entirely.
// The concrete symptom: SAGE volunteered "two open Cash O/S exceptions" sourced from a manual
// Controls upload, on a device that could equally have zero manual uploads and 27 months of
// cloud data. These tests build a `ds` with ONLY cloud streams populated (glimpseRows,
// qsrActSummaryRows, opsLaborRows, opsCashRows, qsrFobRows) and NO manual arrays at all
// (laborRows/ctrlRows/opsRows/fobRows all absent) — exactly the device this issue is about —
// and assert every summary still resolves real data, matching the issue's own verification
// note: "should behave identically on a device that has never had a manual upload."
import { describe, it, expect } from 'vitest';
import {
  buildLaborSummary, buildOpsSummary, buildControlsSummary, buildFobSummary,
  buildSystemPrompt, sageHasData,
} from '../views/sage.js';
import { STORE_NAMES } from '../constants.js';

const LOC = Object.keys(STORE_NAMES)[0];
const today = new Date();
const d = (daysAgo) => { const x = new Date(today); x.setDate(x.getDate() - daysAgo); return x; };

// A cloud-only ds: every field routes through metric-source.js's auto-first chains, and NONE
// of the manual arrays (laborRows/ctrlRows/opsRows/fobRows) are present at all.
function cloudOnlyDs() {
  const glimpseRows = [];
  const qsrActSummaryRows = [];
  const opsLaborRows = [];
  const opsCashRows = [];
  const qsrFobRows = [];
  for (let i = 1; i <= 10; i++) {
    const date = d(i);
    glimpseRows.push({ loc: LOC, date, laborPct: 0.285, oepe: 148, parkedPct: 0.08, cashOS: -4.2 });
    qsrActSummaryRows.push({ loc: LOC, date, tpph: 6.4 });
    opsLaborRows.push({ loc: LOC, date, otHrs: 3.1, otDollar: 62.5 });
    opsCashRows.push({ loc: LOC, date, discPct: 0.021 });
    qsrFobRows.push({
      loc: LOC, date, prodSalesAmt: 5000,
      compWasteAmt: 40, rawWasteAmt: 60, condimentsAmt: 30,
      empMgrMealsAmt: 10, statVarianceAmt: 5, unexplainedAmt: 5,
    });
  }
  return { storeIds: [], glimpseRows, qsrActSummaryRows, opsLaborRows, opsCashRows, qsrFobRows };
}

describe('#270 phase 1 — SAGE summaries resolve on a device with zero manual uploads', () => {
  it('buildLaborSummary resolves via glimpseRows/qsrActSummaryRows/opsLaborRows, not ds.laborRows', () => {
    const ds = cloudOnlyDs();
    expect(ds.laborRows).toBeUndefined();
    const out = buildLaborSummary(ds);
    expect(out).not.toBeNull();
    expect(out).toContain('LABOR & STAFFING');
    expect(out).toContain(STORE_NAMES[LOC]);
    // laborPct is a fraction (0.285) -- must render as "28.50%", not the pre-existing
    // "0.28%" display bug this fix also corrects.
    expect(out).toContain('28.50%');
    expect(out).not.toContain('0.28%');
  });

  it('buildOpsSummary resolves via glimpseRows, not ds.opsRows', () => {
    const ds = cloudOnlyDs();
    expect(ds.opsRows).toBeUndefined();
    const out = buildOpsSummary(ds);
    expect(out).not.toBeNull();
    expect(out).toContain('SERVICE TIMES');
    expect(out).toContain('148s');
    // park is a fraction (0.08) -- must render as "8.00%", not "0.08%".
    expect(out).toContain('8.00%');
  });

  it('buildControlsSummary resolves via opsCashRows/glimpseRows, not ds.ctrlRows, and never claims a mean is an exception', () => {
    const ds = cloudOnlyDs();
    expect(ds.ctrlRows).toBeUndefined();
    const out = buildControlsSummary(ds);
    expect(out).not.toBeNull();
    expect(out).toContain('CONTROLS');
    // discPct 0.021 -> 2.10%, below the elevated threshold, so no ELEVATED section expected.
    expect(out).toContain('2.10%');
    expect(out).not.toContain('NOTABLE EXCEPTIONS');
    expect(out).not.toContain('open exceptions');
  });

  it('buildControlsSummary labels an elevated average as an average, not an "open exception"', () => {
    const ds = cloudOnlyDs();
    // Push this store's cash O/S average over the elevated threshold ($75).
    ds.glimpseRows = ds.glimpseRows.map(r => ({ ...r, cashOS: -229 }));
    const out = buildControlsSummary(ds);
    expect(out).toContain('ELEVATED 60-DAY AVERAGE');
    // The label reads "not open exceptions" -- confirm it's qualified, not a bare claim.
    expect(out).toContain('not open exceptions');
  });

  it('buildFobSummary (the working precedent) still resolves via qsrFobRows', () => {
    const ds = cloudOnlyDs();
    expect(ds.fobRows).toBeUndefined();
    const out = buildFobSummary(ds);
    expect(out).not.toBeNull();
    expect(out).toContain('FOB / FOOD COST');
  });

  it('sageHasData is true on a cloud-only device with zero manual uploads (defect #1)', () => {
    const ds = cloudOnlyDs();
    expect(sageHasData(ds)).toBe(true);
  });

  it('sageHasData is false when ds truly has nothing', () => {
    expect(sageHasData(null)).toBe(false);
    expect(sageHasData({})).toBe(false);
    expect(sageHasData({ laborRows: [], ctrlRows: [], opsRows: [] })).toBe(false);
  });

  it('sageHasData does not require the manual arrays specifically', () => {
    // The old check was ds.laborRows.length > 0 exactly -- confirm cloud-only data alone
    // (glimpseRows present, laborRows absent) is sufficient.
    expect(sageHasData({ glimpseRows: [{ loc: LOC, date: today }] })).toBe(true);
  });

  it('the DATA COVERAGE block in the system prompt reports resolved coverage, not raw manual row counts (defect #3)', () => {
    const ds = cloudOnlyDs();
    const prompt = buildSystemPrompt(ds, [], []);
    expect(prompt).toContain('DATA COVERAGE');
    expect(prompt).not.toContain('UPLOADED FILE DATA');
    // FOB line must read qsrFobRows.length (10), not ds.fobRows (undefined -> would print 0).
    expect(prompt).toMatch(/FOB\/Food Cost:\s+10 records/);
    // Labor/Ops and Controls lines must show non-zero resolved store-days despite zero manual rows.
    expect(prompt).toMatch(/Labor\/Ops:\s+[1-9]\d* store-days resolved/);
    expect(prompt).toMatch(/Controls:\s+[1-9]\d* store-days resolved/);
  });
});
