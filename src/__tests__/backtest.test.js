// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { calibrateStore } from '../engine/backtest.js';

const LOC = '3708';

// Local-time date key — must match utils/date.js dKey() so laborIdx keys align
// with what backtest's fetchRow() generates.
function localDK(d) {
  const dt = new Date(d);
  return dt.getFullYear() + '-' +
    String(dt.getMonth() + 1).padStart(2, '0') + '-' +
    String(dt.getDate()).padStart(2, '0');
}

function makeDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0);
  return d;
}

function buildLaborIdx(rows) {
  const idx = {};
  for (const r of rows) {
    if (!r.loc || !r.date) continue;
    const k = r.loc + '_' + localDK(r.date);
    if (!idx[k]) idx[k] = [];
    idx[k].push(r);
  }
  return idx;
}

// Two-band fixture:
//   Eval band   — 30 to 110 days ago  (81 rows, all outside the 14-day cutoff)
//   LY band     — 394 to 474 days ago (81 rows, exactly 364 days before eval band)
// This ensures every eval row can find its LY counterpart via fetchLY's -364 offset.
// 81 eval rows + 81 LY rows = 162 total > 60 → passes rows.length check.
function buildDs(loc = LOC) {
  const DOW_MULT = [0.8, 1.0, 1.0, 1.05, 1.1, 1.3, 1.2];
  const laborRows = [];

  // Eval band (eval window rows)
  for (let i = 30; i <= 110; i++) {
    const d = makeDate(i);
    const sales = Math.round(10000 * DOW_MULT[d.getDay()] * (0.95 + (i % 10) * 0.01));
    laborRows.push({ loc, date: d, sales, laborPct: 0.28 });
  }

  // LY band (exactly 364 days earlier, so DOW is preserved and fetchLY finds them)
  for (let i = 30; i <= 110; i++) {
    const d = makeDate(i + 364);
    const sales = Math.round(9800 * DOW_MULT[d.getDay()] * (0.95 + (i % 10) * 0.01));
    laborRows.push({ loc, date: d, sales, laborPct: 0.28 });
  }

  const laborIdx = buildLaborIdx(laborRows);
  const lastActual = { [loc]: makeDate(30) };

  return {
    laborRows,
    laborIdx,
    laborByLoc: { [loc]: laborRows },
    opsRows: [],
    opsByLoc: {},
    ctrlRows: [],
    ctrlByLoc: {},
    weatherRows: [],
    weatherIdx: {},
    darRows: [],
    pmixData: {},
    records: {},
    targets: {},
    lastActual,
    loaded: true,
    storeIds: [loc],
  };
}

const BASE_SETTINGS = {
  mode: 'Forecast',
  weeksBack: 6,
  trendWeights: { t2: 0.5, t4: 0.3, t6: 0.2 },
  dialedInEnabled: false,
  dialedIn: {},
  dialedInSkipped: [],
  _userEvents: {},
  plusUp: 0,
  plusUpByStore: {},
  useEventRegistry: false,
};

// ── calibrateStore ────────────────────────────────────────────────────────────

describe('calibrateStore — insufficient history guard', () => {
  it('returns _why when fewer than 60 rows', async () => {
    const ds = buildDs();
    // Slice to 59 rows so it fails the rows.length check
    const sparseDs = {
      ...ds,
      laborRows: ds.laborRows.slice(0, 59),
      laborIdx: buildLaborIdx(ds.laborRows.slice(0, 59)),
    };
    const result = await calibrateStore(LOC, sparseDs, BASE_SETTINGS);
    expect(result).toHaveProperty('_why');
    expect(result._why).toMatch(/rows<60/);
  });
});

describe('calibrateStore — successful calibration', () => {
  it('resolves without _why when given sufficient history', async () => {
    const ds = buildDs();
    const result = await calibrateStore(LOC, ds, BASE_SETTINGS);
    // If precomputed or evalRows filtering is too aggressive, _why is set —
    // log it so the fixture can be adjusted rather than failing silently.
    if (result._why) {
      console.warn('[backtest.test] calibrateStore returned _why:', result._why);
    }
    expect(result._why).toBeUndefined();
  });

  it('returns mape as a finite positive number', async () => {
    const ds = buildDs();
    const result = await calibrateStore(LOC, ds, BASE_SETTINGS);
    if (result._why) return; // skip rest if fixture is degenerate
    expect(typeof result.mape).toBe('number');
    expect(isFinite(result.mape)).toBe(true);
    expect(result.mape).toBeGreaterThan(0);
  });

  it('returns calibration parameters', async () => {
    const ds = buildDs();
    const result = await calibrateStore(LOC, ds, BASE_SETTINGS);
    if (result._why) return;
    expect(typeof result.lyW).toBe('number');
    expect(typeof result.t2).toBe('number');
    expect(typeof result.t4).toBe('number');
    expect(typeof result.t6).toBe('number');
    expect(typeof result.samples).toBe('number');
    expect(result.samples).toBeGreaterThanOrEqual(35);
  });

  it('t2 + t4 + t6 ≈ 1', async () => {
    const ds = buildDs();
    const result = await calibrateStore(LOC, ds, BASE_SETTINGS);
    if (result._why) return;
    const sum = result.t2 + result.t4 + result.t6;
    expect(sum).toBeGreaterThan(0.98);
    expect(sum).toBeLessThan(1.02);
  });

  it('recentOnlyFlag is false for a regular store', async () => {
    const ds = buildDs();
    const result = await calibrateStore(LOC, ds, BASE_SETTINGS);
    if (result._why) return;
    expect(result.recentOnlyFlag).toBe(false);
    expect(result.windowApplied).toBe(false);
  });
});
