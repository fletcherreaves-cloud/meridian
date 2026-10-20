// @ts-nocheck
// Conversion Efficiency Ratio — parser + engine tests (owner request 2026-10-19).
//
// The parser was verified against the two REAL sample PDFs the owner provided during
// development (see memory of that session) -- this file uses a SYNTHETIC fixture instead,
// matching the real reports' structural shape (fabricated store/owner names, same column
// layout) rather than the real confidential report content, per this repo's standing PII/
// confidentiality handling for proprietary McDonald's corporate documents.
//
// pdfjs-dist is mocked at the exact shape the parser consumes (text items with {str, transform})
// so this exercises the REAL parseConversionEfficiencyPDF logic -- X-coordinate column bucketing,
// row grouping, the CONFIDENTIAL-footer exclusion, the missing-column case -- not a
// reimplementation of it.
import { describe, it, expect, vi } from 'vitest';
import { detectType } from '../parsers/index.js';
import {
  periodsInRange, latestPeriodByStore, buildConversionEfficiencyReport, itemsForStore,
} from '../engine/conversion-efficiency.js';
import { resolveDatePreset } from '../components/PanelControls.js';
import { CE_DATE_PRESETS } from '../views/conversion-efficiency.js';

// item(text, x, y) -- mirrors a real pdfjs TextItem's {str, transform} shape closely enough for
// the parser's own item-mapping (`{text: i.str.trim(), x: i.transform[4], y: i.transform[5]}`).
function item(text, x, y) { return { str: text, transform: [1, 0, 0, 1, x, y] }; }

// Builds one synthetic restaurant section at a given y-top, with 18-ish "items" rows (we use a
// smaller fixed set for the test -- the X-bucket logic doesn't care how many rows there are).
// Each row's columns sit at the midpoints the real COLS array in conversion-efficiency.js uses.
const COL_X = { a: 120, t: 210, e: 270, f: 330, y25: 380, ytd: 430, pct: 480, imp: 550 };

function row(label, y, vals) {
  const items = [item(label, 40, y)];
  if (vals.a   != null) items.push(item(String(vals.a),   COL_X.a,   y));
  if (vals.t   != null) items.push(item(String(vals.t),   COL_X.t,   y));
  if (vals.e   != null) items.push(item(String(vals.e),   COL_X.e,   y));
  if (vals.f   != null) items.push(item('$' + vals.f,     COL_X.f,   y));
  if (vals.y25 != null) items.push(item(String(vals.y25), COL_X.y25, y));
  if (vals.ytd != null) items.push(item(String(vals.ytd), COL_X.ytd, y));
  if (vals.pct != null) items.push(item(vals.pct + '%',   COL_X.pct, y));
  if (vals.imp != null) items.push(item('$' + vals.imp,   COL_X.imp, y));
  return items;
}

function buildPage({ withTitle = true, withOwner = true, withPeriod = true, loc = '03708', locName = 'TEST STORE-US HWY 1', rows = [], withFooter = true, withTotal = true }) {
  let y = 700;
  const items = [];
  if (withTitle) items.push(item('Conversion Efficiency', 300, 780));
  if (withOwner) { items.push(item('Owner:', 40, 760)); items.push(item('TEST OWNER A', 100, 760)); }
  if (withPeriod) items.push(item('52 Weeks Ending September 2026', 300, 740));
  items.push(item(`Restaurant: ${loc}-${locName}`, 40, 720));
  for (const r of rows) { items.push(...row(r.label, y, r.vals)); y -= 20; }
  if (withTotal) items.push(...row('Total', y, { f: 1234, imp: -56 }));
  if (withFooter) items.push(item('This report contains CONFIDENTIAL proprietary business information of McDonalds Corporation. This report or its contents may not', 40, 20));
  return items;
}

function mockPdfjs(pages) {
  return {
    GlobalWorkerOptions: {},
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: pages.length,
        getPage: (n) => Promise.resolve({
          getTextContent: () => Promise.resolve({ items: pages[n - 1] }),
        }),
      }),
    }),
  };
}

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: {},
  getDocument: (...args) => globalThis.__ceMockPdf.getDocument(...args),
}));

async function parseWith(pages, filename = 'Owner_Operator_TEST_OWNER.pdf') {
  globalThis.__ceMockPdf = mockPdfjs(pages);
  const { parseConversionEfficiencyPDF } = await import('../parsers/conversion-efficiency.js');
  return parseConversionEfficiencyPDF(new ArrayBuffer(0), filename);
}

describe('parseConversionEfficiencyPDF', () => {
  it('extracts owner, period, store, and item rows, matching columns by X-bucket not sequence', async () => {
    const rows = [
      { label: 'French Fries',    vals: { a: 1.068, t: 1.135, e: 0,  f: 0,    y25: 1.099, ytd: 1.068, pct: -3,  imp: -1592 } },
      { label: '10 To 1 Beef',    vals: { a: 1.078, t: 1.032, e: 28, f: 4424, y25: 1.068, ytd: 1.07,  pct: 0,   imp: 167 } },
    ];
    const pages = [buildPage({ rows })];
    const out = await parseWith(pages);
    expect(out.length).toBe(2);
    expect(out[0].owner_name).toBe('TEST OWNER A');
    expect(out[0].period).toBe('2026-09');
    expect(out[0].loc).toBe('3708'); // zero-padding stripped to match STORE_NAMES' unpadded keys
    expect(out[0].loc_name).toBe('TEST STORE-US HWY 1');
    expect(out[0].raw_item).toBe('French Fries');
    expect(out[0].conv_eff_52wk).toBeCloseTo(1.068);
    expect(out[0].conv_eff_target).toBeCloseTo(1.135);
    expect(out[0].excess_cases_annual).toBe(0);
    expect(out[0].financial_opportunity_annual).toBe(0);
    expect(out[0].conv_eff_2025_ye).toBeCloseTo(1.099);
    expect(out[0].conv_eff_ytd).toBeCloseTo(1.068);
    expect(out[0].conv_eff_pct_chg).toBe(-3);
    expect(out[0].financial_impact_ytd).toBe(-1592);
  });

  it('resolves a row missing up to 4 columns (no 2025 baseline) to null in exactly those fields, not shifted', async () => {
    // Mirrors the real Ice Cream Mix case: no 2025 YE figure, no %Chg, no $ Impact YTD.
    const rows = [
      { label: 'Ice Cream Mix', vals: { a: 1.646, t: 1.148, e: 18, f: 643, y25: null, ytd: 1.646, pct: null, imp: null } },
    ];
    const out = await parseWith([buildPage({ rows })]);
    expect(out.length).toBe(1);
    const r = out[0];
    expect(r.raw_item).toBe('Ice Cream Mix');
    expect(r.conv_eff_52wk).toBeCloseTo(1.646);
    expect(r.conv_eff_target).toBeCloseTo(1.148);
    expect(r.excess_cases_annual).toBe(18);
    expect(r.financial_opportunity_annual).toBe(643);
    expect(r.conv_eff_2025_ye).toBeNull();
    expect(r.conv_eff_ytd).toBeCloseTo(1.646);
    expect(r.conv_eff_pct_chg).toBeNull();
    expect(r.financial_impact_ytd).toBeNull();
  });

  it('excludes the CONFIDENTIAL footer disclaimer and the Total row from parsed items', async () => {
    const rows = [{ label: 'Coffee', vals: { a: 1.17, t: 1.202, e: 0, f: 0, y25: 1.182, ytd: 1.197, pct: 1, imp: 26 } }];
    const out = await parseWith([buildPage({ rows, withFooter: true, withTotal: true })]);
    expect(out.map(r => r.raw_item)).toEqual(['Coffee']);
    expect(out.some(r => /confidential/i.test(r.raw_item))).toBe(false);
    expect(out.some(r => r.raw_item === 'Total')).toBe(false);
  });

  it('extracts the period from the dated "52 Weeks Ending" item even when a bare undated label with the same leading text sits earlier in the item list — real bug found 2026-10-19 against live sample reports', async () => {
    // Some reports repeat "52 Weeks Ending" twice per page: a bare column-header label with no
    // month/year, and the real dated value elsewhere. items.find() on a loose substring match
    // picked the bare label first and left period permanently null for the whole file.
    const page = [
      item('Conversion Efficiency', 300, 780),
      item('52 Weeks Ending', 66, 780), // bare label, no month/year -- must NOT be picked
      item('Owner:', 40, 760), item('TEST OWNER B', 100, 760),
      item('52 Weeks Ending August 2026', 270, 744), // the real value
      item('Restaurant: 03708-TEST STORE-US HWY 1', 40, 720),
      ...row('Coffee', 700, { a: 1.1, t: 1.1, e: 0, f: 0 }),
    ];
    const out = await parseWith([page]);
    expect(out.length).toBe(1);
    expect(out[0].period).toBe('2026-08');
  });

  it('returns no rows when the PDF never shows the report title (misrouted file guard)', async () => {
    const out = await parseWith([buildPage({ withTitle: false, rows: [{ label: 'Coffee', vals: { a: 1, t: 1 } }] })]);
    expect(out).toEqual([]);
  });

  it('handles multiple restaurant sections on one page via Y-range slicing', async () => {
    const page = [
      item('Conversion Efficiency', 300, 900),
      item('Owner:', 40, 880), item('MULTI OWNER', 100, 880),
      item('52 Weeks Ending October 2026', 300, 860),
      item('Restaurant: 00100-STORE ONE', 40, 840),
      ...row('French Fries', 800, { a: 1.1, t: 1.1, e: 0, f: 0 }),
      item('Restaurant: 00200-STORE TWO', 40, 400),
      ...row('French Fries', 380, { a: 1.2, t: 1.1, e: 5, f: 100 }),
    ];
    const out = await parseWith([page]);
    const byLoc = Object.fromEntries(out.map(r => [r.loc, r]));
    expect(byLoc['100'].loc_name).toBe('STORE ONE');
    expect(byLoc['200'].loc_name).toBe('STORE TWO');
    expect(byLoc['100'].conv_eff_52wk).toBeCloseTo(1.1);
    expect(byLoc['200'].conv_eff_52wk).toBeCloseTo(1.2);
  });
});

describe('detectType routing — Conversion Efficiency', () => {
  it('routes an Owner_Operator_*.pdf filename to conversion-efficiency', () => {
    const t = detectType('Owner_Operator_KATHRYN_LOPEZ-THORLEY.pdf', null);
    expect(t.type).toBe('conversion-efficiency');
    expect(t.confidence).toBe('high');
  });

  it('does not misroute an unrelated PDF filename', () => {
    const t = detectType('Daily Activity Report.pdf', null);
    expect(t.type).not.toBe('conversion-efficiency');
  });
});

describe('engine/conversion-efficiency.js', () => {
  const mk = (loc, period, raw_item, extra = {}) => ({
    loc, period, raw_item, loc_name: `Store ${loc}`, owner_name: 'Owner',
    financial_opportunity_annual: 0, financial_impact_ytd: 0, ...extra,
  });

  it('periodsInRange filters by YYYY-MM against a {s,e} range', () => {
    const rows = [mk('1', '2026-08', 'A'), mk('1', '2026-09', 'A'), mk('1', '2026-10', 'A')];
    const out = periodsInRange(rows, { s: '2026-09-01', e: '2026-10-31' });
    expect(out.map(r => r.period)).toEqual(['2026-09', '2026-10']);
  });

  it('latestPeriodByStore picks the max period per loc', () => {
    const rows = [mk('1', '2026-08', 'A'), mk('1', '2026-10', 'A'), mk('2', '2026-09', 'A')];
    const m = latestPeriodByStore(rows);
    expect(m.get('1')).toBe('2026-10');
    expect(m.get('2')).toBe('2026-09');
  });

  it('buildConversionEfficiencyReport never sums a store’s already-annualized $ across two periods — only its latest period counts', () => {
    const rows = [
      mk('1', '2026-08', 'French Fries', { financial_opportunity_annual: 500, financial_impact_ytd: 100 }),
      mk('1', '2026-09', 'French Fries', { financial_opportunity_annual: 700, financial_impact_ytd: 150 }),
    ];
    const { storeRows, itemsByLoc } = buildConversionEfficiencyReport(rows, {});
    expect(storeRows.length).toBe(1);
    expect(storeRows[0].period).toBe('2026-09');
    expect(storeRows[0].totalOpportunityAnnual).toBe(700); // NOT 1200
    expect(storeRows[0].totalImpactYtd).toBe(150); // NOT 250
    expect(itemsByLoc.get('1').length).toBe(1);
  });

  it('sums across DIFFERENT stores correctly and picks the worst-$-opportunity item per store', () => {
    const rows = [
      mk('1', '2026-09', 'French Fries', { financial_opportunity_annual: 100 }),
      mk('1', '2026-09', '10 To 1 Beef', { financial_opportunity_annual: 900 }),
      mk('2', '2026-09', 'French Fries', { financial_opportunity_annual: 50 }),
    ];
    const { storeRows } = buildConversionEfficiencyReport(rows, {});
    const store1 = storeRows.find(r => r.loc === '1');
    expect(store1.totalOpportunityAnnual).toBe(1000); // 100 + 900, same store same period -> additive across ITEMS
    expect(store1.worstItem).toBe('10 To 1 Beef');
    expect(store1.worstItemOpportunity).toBe(900);
    // sorted worst-first across stores
    expect(storeRows[0].loc).toBe('1');
  });

  it('filters by locs', () => {
    const rows = [mk('1', '2026-09', 'A', { financial_opportunity_annual: 10 }), mk('2', '2026-09', 'A', { financial_opportunity_annual: 20 })];
    const { storeRows } = buildConversionEfficiencyReport(rows, { locs: ['2'] });
    expect(storeRows.map(r => r.loc)).toEqual(['2']);
  });

  it('itemsForStore sorts that store’s items worst-opportunity-first', () => {
    const rows = [
      mk('1', '2026-09', 'A', { financial_opportunity_annual: 10 }),
      mk('1', '2026-09', 'B', { financial_opportunity_annual: 90 }),
    ];
    const { itemsByLoc } = buildConversionEfficiencyReport(rows, {});
    const items = itemsForStore(itemsByLoc, '1');
    expect(items.map(i => i.raw_item)).toEqual(['B', 'A']);
  });

  // Regression, 2026-10-20: a re-uploaded historical backfill "wasn't loading" in the panel while
  // today's emailed row did show. Root cause wasn't the save or the engine -- it was ReportShell's
  // generic defaultPresetId='28d' (src/components/ReportShell.js), which only ever covers the
  // current month, silently excluding every older period before buildConversionEfficiencyReport
  // even runs. This test exercises the real call-site fix (CE_DATE_PRESETS + defaultPresetId:
  // 'all' in views/conversion-efficiency.js), not just the already-correct engine filter, per this
  // repo's "verification must touch the call site" rule.
  it('the panel’s own default date range (CE_DATE_PRESETS "all") does not exclude a year-old backfilled period', () => {
    const range = resolveDatePreset('all', CE_DATE_PRESETS, new Date('2026-10-20'));
    expect(range).toBeTruthy();
    const rows = [
      mk('1', '2024-11', 'French Fries', { financial_opportunity_annual: 500 }), // old backfill
      mk('2', '2026-10', 'French Fries', { financial_opportunity_annual: 10 }), // today's emailed row
    ];
    const { storeRows } = buildConversionEfficiencyReport(rows, { range });
    expect(storeRows.map(r => r.loc).sort()).toEqual(['1', '2']);
  });
});
