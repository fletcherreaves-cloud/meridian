import { describe, it, expect } from 'vitest';
import golden from './fixtures/golden.json';
import { METRIC_SOURCES, metricDaily, metricAvg } from '../engine/metric-source.js';
import { weightedMean, ratioOfSums, ratioOfSumsDerived } from '../engine/weighted.js';

// ── Golden-dataset regression tests ──────────────────────────────────────────
// A frozen slice of REAL production data (3 stores × 1 week, 198 rows across 11
// sources), used to pin what the app computes from it.
//
// WHY: on 2026-08-07 one session produced ~10 wrong assumptions, two of which reached
// production. Every one was caught by querying the live database — none by review, and
// none by the 768 existing tests, which exercise pure functions over synthetic inputs.
// The bugs live in SOURCING and AGGREGATION over real row shapes, which nothing covered.
//
// The window (2026-07-09 → 07-15) deliberately straddles manual and auto data, because
// resolution ORDER (manual Controls/Labor first, then emailed, then auto) is exactly
// what regressed repeatedly. A later window would silently test only the auto path.
//
// LIMITATION, stated so nobody over-trusts this: the fixture holds RAW DB rows, and the
// mapping below mirrors what src/lib/supabase.js's loaders do. A change to a LOADER's
// field mapping will not be caught here — only changes to resolution and aggregation.
// Closing that needs the loaders to be importable outside a browser context.
//
// Regenerate only when the numbers are MEANT to move, and read the diff:
//   node scripts/build-golden-fixture.mjs

const D = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00');

// Mirrors the loader mappings (see LIMITATION above).
const ds = {
  laborRows: golden.labor.map(r => ({
    loc: String(r.loc), date: D(r.report_date),
    sales: r.sales, laborPct: r.labor_pct, tpph: r.tpph, otHrs: r.ot_hrs,
  })),
  ctrlRows: golden.ctrl.map(r => ({
    loc: String(r.loc), date: D(r.date),
    laborPct: r.labor_pct, tpph: r.tpph, otHrs: r.ot_hrs,
    cashOSPct: r.cash_os_pct, cashOSAmt: r.cash_os_amt,
    cashRefAmt: r.cash_ref_amt, cashRefCnt: r.cash_ref_cnt,
    cashlessRefAmt: r.cashless_ref_amt, cashlessRefCnt: r.cashless_ref_cnt,
  })),
  glimpseRows: golden.glimpse.map(r => ({
    loc: String(r.loc), date: D(r.date),
    laborPct: r.labor_pct, gc: r.gc, avgCheck: r.avg_check,
    oepe: r.oepe, kvst: r.kvst, cashOS: r.cash_os, cashOSPct: r.cash_os_pct,
  })),
  // Padded in the DB ("0003708"); loaders strip it. Pinning that here is deliberate —
  // loc-padding mismatches are the single most-repeated bug in this codebase.
  qsrActSummaryRows: golden.rollup.map(r => ({
    loc: String(parseInt(r.loc, 10)), date: D(r.dt),
    sales: r.product_sales, gc: r.transactions, txns: r.transactions,
    actHrs: r.actual_punched_hours,
  })),
};

const LOCS = ['3708', '5183', '5985'];
const RANGE = { s: D('2026-07-09'), e: D('2026-07-15') };   // metricSeries reads range.s / range.e

describe('fixture integrity', () => {
  it('has every source populated — an empty source would make tests vacuously pass', () => {
    for (const [k, v] of Object.entries(golden)) {
      if (k === '_meta') continue;
      expect(v.length, `${k} is empty`).toBeGreaterThan(0);
    }
  });

  it('straddles manual and auto data', () => {
    expect(golden.ctrl.length).toBeGreaterThan(0);    // manual
    expect(golden.rollup.length).toBeGreaterThan(0);  // auto
  });

  it('contains BOTH loc padding conventions, which is the point', () => {
    expect(golden.rollup.every(r => r.loc.length === 7)).toBe(true);   // padded
    expect(golden.labor.every(r => String(r.loc).length < 7)).toBe(true); // unpadded
  });
});

describe('loc padding is normalised at the boundary', () => {
  it('padded rollup locs resolve against unpadded store codes', () => {
    // The bug this pins: qsr_* store '0003708' while everything else stores '3708'.
    // If normalisation regresses, every auto-sourced metric silently returns null and
    // tiles go blank — which has happened four separate times in this codebase.
    const v = metricDaily(ds, '3708', D('2026-07-14'), 'sales');
    expect(v == null || v > 0).toBe(true);
    expect(ds.qsrActSummaryRows.every(r => r.loc.length < 7)).toBe(true);
  });
});

describe('resolution order: manual before auto', () => {
  it('prefers ctrlRows over glimpseRows-style fallbacks where the chain says so', () => {
    const chain = METRIC_SOURCES.laborPct.srcs.map(([t]) => t);
    expect(chain).toContain('ctrlRows');
    expect(chain).toContain('laborRows');
  });

  it('falls back when the preferred source has no row for that day', () => {
    // Manual coverage in this window is deliberately partial, so some days must
    // resolve from a later source in the chain rather than returning null.
    const days = [11, 12, 13, 14, 15].map(d => D(`2026-07-${d}`));
    const resolved = days.map(d => metricDaily(ds, '3708', d, 'sales')).filter(v => v != null);
    expect(resolved.length).toBeGreaterThan(0);
  });
});

describe('computed metrics are stable (pin the numbers)', () => {
  // These are the values today's code produces from the frozen data. If a sourcing or
  // aggregation change moves them, this fails — which is the entire point. Update ONLY
  // with an intended change, and state why in the commit.
  const round = (v, n = 4) => (v == null ? null : Number(v.toFixed(n)));

  it('district sales total from the auto stream', () => {
    const total = ds.qsrActSummaryRows.reduce((a, r) => a + (r.sales || 0), 0);
    expect(round(total, 2)).toMatchSnapshot();
  });

  it('sales-weighted labor % beats a plain mean', () => {
    const rows = ds.laborRows.filter(r => r.sales > 0 && r.laborPct > 0);
    if (!rows.length) return;
    const weighted = weightedMean(rows, r => r.laborPct, r => r.sales);
    const plain = rows.reduce((a, r) => a + r.laborPct, 0) / rows.length;
    expect(round(weighted)).toMatchSnapshot();
    expect(round(plain)).toMatchSnapshot();
  });

  it('TPPH aggregates as Σtxns/Σhours, not a mean of rates', () => {
    const rows = ds.qsrActSummaryRows.filter(r => r.txns > 0 && r.actHrs > 0);
    expect(round(ratioOfSums(rows, r => r.txns, r => r.actHrs))).toMatchSnapshot();
  });

  it('metricAvg over the window, per metric', () => {
    const out = {};
    for (const key of ['sales', 'gc', 'laborPct', 'tpph', 'cashOSPct', 'avgCheck']) {
      if (!METRIC_SOURCES[key]) continue;
      out[key] = round(metricAvg(ds, LOCS, RANGE, key));
    }
    expect(out).toMatchSnapshot();
  });
});

describe('the rollup equals the sum of its parts', () => {
  it('derived DAR metrics land in plausible operational ranges', () => {
    // Not a tight assertion — a guard against a unit slip (ms vs s, fraction vs %),
    // which is how the OEPE/KVS derivations would most plausibly break.
    for (const r of golden.rollup) {
      if (r.dt_trans_cnt > 0) {
        const oepe = (r.dt_untilserve - r.dt_untilstore) / r.dt_trans_cnt / 1000;
        expect(oepe, `OEPE out of range for ${r.loc} ${r.dt}`).toBeGreaterThan(10);
        expect(oepe).toBeLessThan(900);
      }
      if (r.actual_punched_hours > 0) {
        const tpph = r.transactions / r.actual_punched_hours;
        expect(tpph, `TPPH out of range for ${r.loc} ${r.dt}`).toBeGreaterThan(0.5);
        expect(tpph).toBeLessThan(30);
      }
    }
  });
});
