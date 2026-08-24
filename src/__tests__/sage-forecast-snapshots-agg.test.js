// @ts-nocheck
// Dispatch #92 (memory/dispatch-92.md) -- SAGE told the owner "-6.0%, 27 of 27 stores under" on a
// forecast-accuracy question and recommended a $42K-85K/mo district-wide downward schedule
// correction on that basis. Measured false on both counts: 24 of 27 stores under, district signed
// bias -2.50%, not -6.0%/27-of-27. Root cause: query_forecast_snapshots fetched
// forecast_sales/actual_sales from Supabase and threw them away, aggregating only the unsigned
// mape column -- SAGE never had signed-direction data available to answer a directional question.
//
// Verification bar (memory/dispatch-92.md): a live SAGE forecast-bias question, post-deploy, over
// 2026-07-20..2026-08-18 or 2026-07-25..2026-08-18 must report a signed district bias in the -2%
// to -3% range (not -6%) and a store count near 24 of 27 under (not 27 of 27). This session has no
// network access to call the live sage-chat edge function (same constraint as dispatch #90/#91),
// but DOES have SUPABASE_SERVICE_ROLE_KEY, so this test independently re-measures the ground truth
// the same way the PM did: pulled forecast_snapshots directly (source='ai', 2026-07-25..2026-08-18,
// 674 rows / 27 stores / 25 days, via REST against VITE_SUPABASE_URL) and computed
// (actual_sales-forecast_sales)/forecast_sales per row, averaged per store then per district --
// same store-then-district basis as the existing district_avg_mape aggregation. Result: district
// signed bias -2.67%, 24 stores under / 3 over -- inside the dispatch's -2..-3%/24-of-27 bar (the
// dispatch's own -2.50%/809-row pull was measured slightly earlier the same day; a few more days of
// snapshots had accumulated by this pull, which is expected drift, not a discrepancy -- see the
// standing "do not hardcode -2.50%, it will drift" rule in the dispatch).
//
// Imports supabase/functions/sage-chat/forecast-snapshots-agg.js directly -- the same plain-JS
// module index.ts's query_forecast_snapshots tool calls and JSON.stringifies as its literal tool
// result. No Deno test infrastructure exists in this repo to boot the edge function itself, so
// this is the closest thing to the real call site (same pattern as sage-labor-summary-agg.test.js).
import { describe, it, expect } from 'vitest';
import { aggregateForecastSnapshots, districtForecastStats, FORECAST_SNAPSHOTS_NOTE } from '../../supabase/functions/sage-chat/forecast-snapshots-agg.js';

// Per-store signed % bias and MAPE, measured live against Supabase forecast_snapshots
// (source='ai', 2026-07-25..2026-08-18) during this dispatch. Reproduced here as a constant
// forecast/actual pair repeated once per real day-count, which reconstructs the exact same
// per-store averages the live pull produced (same technique as labor-summary-agg's otRows
// helper -- a single per-day rate repeated N times to hit an exact measured total/average).
const LIVE_AI_STORES = [
  ['10034', 25, -3.93, 5.50], ['10422', 25, -13.31, 16.05], ['10915', 25, -1.89, 4.29],
  ['11657', 25,  1.67, 7.51], ['13113', 25, -3.14, 5.88],  ['18213', 25, -2.49, 5.14],
  ['20475', 25, -0.98, 3.93], ['24471', 25, -3.79, 6.11],  ['29760', 25, -2.95, 5.28],
  ['31357', 25, -1.56, 5.05], ['32525', 25, -3.06, 6.74],  ['33109', 25, -3.13, 5.83],
  ['33222', 25, -2.64, 5.51], ['33704', 25, -1.71, 4.92],  ['34222', 25, -1.46, 5.75],
  ['35064', 25, -0.84, 5.77], ['35242', 25, -6.10, 7.30],  ['3708',  25, -2.36, 5.08],
  ['37566', 25, -3.51, 7.54], ['38609', 25, -4.52, 7.39],  ['43380', 25,  4.95, 6.68],
  ['43701', 24, -8.62, 12.89],['5183',  25, -0.66, 2.75],  ['5985',  25, -2.30, 4.49],
  ['6178',  25, -1.04, 7.53], ['6838',  25, -2.89, 5.96],  ['6972',  25,  0.34, 2.90],
];

function forecastRows(loc, source, days, signedPctAvg, mapeAvg) {
  const forecast = 1000;
  const actual = forecast * (1 + signedPctAvg / 100);
  const rows = [];
  for (let i = 0; i < days; i++) {
    rows.push({
      loc, source,
      dt: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
      forecast_sales: forecast,
      actual_sales: actual,
      mape: mapeAvg, // unsigned stat, set directly -- not derived from forecast/actual here
    });
  }
  return rows;
}

const LIVE_ROWS = LIVE_AI_STORES.flatMap(([loc, days, signed, mape]) => forecastRows(loc, 'ai', days, signed, mape));

describe('forecast-snapshots-agg -- reproduces the live-measured ground truth (dispatch #92)', () => {
  it('district signed bias lands in the -2% to -3% range, not -6%', () => {
    const stores = aggregateForecastSnapshots(LIVE_ROWS, {});
    const { distAvgSigned } = districtForecastStats(stores);
    expect(distAvgSigned.ai).toBeGreaterThanOrEqual(-3);
    expect(distAvgSigned.ai).toBeLessThanOrEqual(-2);
  });

  it('24 of 27 stores are under-forecast, 3 are over -- not 27 of 27', () => {
    const stores = aggregateForecastSnapshots(LIVE_ROWS, {});
    const { storesUnderOver } = districtForecastStats(stores);
    expect(storesUnderOver.ai).toEqual({ under: 24, over: 3 });
  });

  it('the 3 over-forecast stores are named correctly (Ada, Purcell, Atoka)', () => {
    const stores = aggregateForecastSnapshots(LIVE_ROWS, {});
    const over = stores.filter(s => s.ai_signed_pct_error > 0).map(s => s.loc).sort();
    expect(over).toEqual(['11657', '43380', '6972'].sort());
  });
});

describe('forecast-snapshots-agg -- sign convention is unambiguous', () => {
  it('negative signed_pct_error = actual came in UNDER forecast', () => {
    const rows = forecastRows('99999', 'ai', 5, -10, 10); // actual 10% below forecast
    const stores = aggregateForecastSnapshots(rows, {});
    expect(stores[0].ai_signed_pct_error).toBeCloseTo(-10, 1);
  });

  it('positive signed_pct_error = actual came in OVER forecast', () => {
    const rows = forecastRows('99999', 'ai', 5, 8, 8); // actual 8% above forecast
    const stores = aggregateForecastSnapshots(rows, {});
    expect(stores[0].ai_signed_pct_error).toBeCloseTo(8, 1);
  });

  it('mape alone cannot distinguish these two cases -- same magnitude, opposite direction', () => {
    // This is the actual root cause: two stores with near-identical MAPE can be biased in
    // opposite directions, which mape (unsigned) can never reveal.
    const under = forecastRows('11111', 'ai', 5, -6, 6);
    const over  = forecastRows('22222', 'ai', 5,  6, 6);
    const stores = aggregateForecastSnapshots([...under, ...over], {});
    const s1 = stores.find(s => s.loc === '11111');
    const s2 = stores.find(s => s.loc === '22222');
    expect(s1.ai).toBeCloseTo(s2.ai, 5); // identical mape
    expect(s1.ai_signed_pct_error).toBeLessThan(0);
    expect(s2.ai_signed_pct_error).toBeGreaterThan(0);
  });
});

describe('forecast-snapshots-agg -- rows with no usable forecast_sales are excluded from the signed stat, not zeroed', () => {
  it('a row with forecast_sales null/0 still counts toward mape but not toward signed_pct_error', () => {
    const rows = [
      { loc: '55555', source: 'ai', dt: '2026-08-01', forecast_sales: 1000, actual_sales: 900, mape: 10 },
      { loc: '55555', source: 'ai', dt: '2026-08-02', forecast_sales: null, actual_sales: 900, mape: 5 },
      { loc: '55555', source: 'ai', dt: '2026-08-03', forecast_sales: 0, actual_sales: 900, mape: 5 },
    ];
    const stores = aggregateForecastSnapshots(rows, {});
    const s = stores[0];
    expect(s.ai).toBeCloseTo((10 + 5 + 5) / 3, 1); // all 3 rows count toward mape (rounded to 2dp in the module)
    expect(s.ai_signed_pct_error).toBeCloseTo(-10, 1); // only the 1 usable row counts toward signed
  });

  it('a store with zero usable forecast_sales rows has no signed field at all (not 0)', () => {
    const rows = [{ loc: '66666', source: 'ai', dt: '2026-08-01', forecast_sales: null, actual_sales: 900, mape: 5 }];
    const stores = aggregateForecastSnapshots(rows, {});
    expect(stores[0].ai_signed_pct_error).toBeUndefined();
  });
});

describe('forecast-snapshots-agg -- mape is untouched by this change', () => {
  it('mape values and shape are unchanged from before this dispatch', () => {
    const rows = forecastRows('13113', 'ai', 3, -3.14, 5.88);
    const stores = aggregateForecastSnapshots(rows, { '13113': 'Madill-Hwy 70' });
    expect(stores[0]).toMatchObject({ loc: '13113', name: 'Madill-Hwy 70', ai: 5.88 });
  });
});

describe('forecast-snapshots-agg -- district stats mirror mape\'s store-then-district aggregation', () => {
  it('district_avg_signed_pct_error is the mean of per-store averages, not a flat row average', () => {
    // Store A: 10 days at -10%. Store B: 1 day at +10%. A flat row average would be dominated by
    // A (10 rows vs 1); the store-then-district average must weight both stores equally.
    const rows = [...forecastRows('A', 'ai', 10, -10, 10), ...forecastRows('B', 'ai', 1, 10, 10)];
    const stores = aggregateForecastSnapshots(rows, {});
    const { distAvgSigned } = districtForecastStats(stores);
    expect(distAvgSigned.ai).toBeCloseTo(0, 5); // (-10 + 10) / 2, not row-weighted
  });
});

describe('forecast-snapshots-agg -- note names the sign convention and basis explicitly', () => {
  it('note distinguishes signed_pct_error from mape and states the sign convention', () => {
    expect(FORECAST_SNAPSHOTS_NOTE).toMatch(/unsigned/);
    expect(FORECAST_SNAPSHOTS_NOTE).toMatch(/signed_pct_error/);
    expect(FORECAST_SNAPSHOTS_NOTE).toMatch(/NEGATIVE means/);
    expect(FORECAST_SNAPSHOTS_NOTE).toMatch(/POSITIVE means/);
    expect(FORECAST_SNAPSHOTS_NOTE).toMatch(/district_stores_under_over/);
  });
});
