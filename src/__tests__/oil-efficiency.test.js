// @ts-nocheck
// Oil Efficiency ("Oil Management Report", Cargill) — parser + engine tests (owner request
// 2026-10-19). The parser was verified against 18 real sample PDFs spanning 4 owners during
// development -- this file uses a SYNTHETIC fixture instead (fabricated store/owner names, same
// structural shape), per this repo's standing confidentiality handling for proprietary
// McDonald's/vendor report content.
//
// pdfjs-dist is mocked at the exact shape the parser consumes, same pattern as
// conversion-efficiency.test.js, so this exercises the REAL parseOilEfficiencyPDF logic.
import { describe, it, expect, vi } from 'vitest';
import { detectType } from '../parsers/index.js';
import {
  periodsInRange, latestPeriodByStore, buildOilEfficiencyReport, qualityConcernStores, totalImpactDollars,
} from '../engine/oil-efficiency.js';
import { resolveDatePreset } from '../components/PanelControls.js';
import { OE_DATE_PRESETS } from '../views/oil-efficiency.js';

function item(text, x, y) { return { str: text, transform: [1, 0, 0, 1, x, y] }; }

// TRENDS table column x-positions mirroring the real COLS array in oil-efficiency.js.
const COL_X = { mo3: 260, mo6: 390, mo12: 510 };

function trendsRow(label, y, vals) {
  const items = [item(label, 25.5, y)];
  for (const [key, x] of Object.entries(COL_X)) {
    if (vals[key] != null) items.push(item(String(vals[key]), x, y));
  }
  return items;
}

function buildPage({ withTitle = true, withOwner = true, withPeriod = true, periodText = 'Mar 31, 2026', loc = '03708', locName = 'TEST STORE-US HWY 1', oilUse = {}, impact = {}, filtration = {} }) {
  const items = [];
  if (withTitle) items.push(item('Oil Management Report', 205, 759));
  if (withPeriod) items.push(item(`3-Month Rolling Average Ending ${periodText}`, 137, 739));
  if (withOwner) items.push(item('Owner: Test Owner A', 244, 722));
  items.push(item(`Restaurant: ${loc}-${locName}`, 196, 704));
  items.push(item('TRENDS', 280, 212));
  items.push(...trendsRow('Oil Use vs. Target', 165, oilUse));
  items.push(...trendsRow('Restaurant Impact', 146, impact));
  items.push(...trendsRow('Filtration Compliance', 128, filtration));
  return items;
}

function mockPdfjs(pages) {
  return {
    GlobalWorkerOptions: {},
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: pages.length,
        getPage: (n) => Promise.resolve({ getTextContent: () => Promise.resolve({ items: pages[n - 1] }) }),
      }),
    }),
  };
}

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: {},
  getDocument: (...args) => globalThis.__oeMockPdf.getDocument(...args),
}));

async function parseWith(pages, filename = '1000015842_Cargill_food_oil_report_Mar_2026.pdf') {
  globalThis.__oeMockPdf = mockPdfjs(pages);
  const { parseOilEfficiencyPDF } = await import('../parsers/oil-efficiency.js');
  return parseOilEfficiencyPDF(new ArrayBuffer(0), filename);
}

describe('parseOilEfficiencyPDF', () => {
  it('extracts owner, period, store, and the TRENDS table, matching columns by X-bucket', async () => {
    const page = buildPage({
      oilUse: { mo3: '+25%', mo6: '+8%', mo12: '+1%' },
      impact: { mo3: '$2,444', mo6: '$851', mo12: 'Optimized' },
      filtration: { mo3: '100%', mo6: '100%', mo12: '100%' },
    });
    const out = await parseWith([page]);
    expect(out.length).toBe(1);
    const r = out[0];
    expect(r.owner_name).toBe('Test Owner A');
    expect(r.period).toBe('2026-03');
    expect(r.loc).toBe('3708');
    expect(r.loc_name).toBe('TEST STORE-US HWY 1');
    expect(r.oil_use_3mo_pct).toBe(25);
    expect(r.oil_use_6mo_pct).toBe(8);
    expect(r.oil_use_12mo_pct).toBe(1);
    expect(r.impact_3mo_dollars).toBe(2444);
    expect(r.impact_3mo_label).toBeNull();
    expect(r.impact_6mo_dollars).toBe(851);
    expect(r.impact_12mo_dollars).toBeNull();
    expect(r.impact_12mo_label).toBe('Optimized');
    expect(r.filtration_3mo_pct).toBe(100);
  });

  it('handles a store whose Restaurant Impact is a categorical label at every window (no $ figure)', async () => {
    const page = buildPage({
      oilUse: { mo3: '-18%', mo6: '-10%', mo12: '-4%' },
      impact: { mo3: 'Quality Concern', mo6: 'Quality Concern', mo12: 'Optimized' },
      filtration: { mo3: '100%', mo6: '100%', mo12: '100%' },
    });
    const out = await parseWith([page]);
    const r = out[0];
    expect(r.impact_3mo_dollars).toBeNull();
    expect(r.impact_3mo_label).toBe('Quality Concern');
    expect(r.impact_6mo_label).toBe('Quality Concern');
    expect(r.impact_12mo_dollars).toBeNull();
    expect(r.impact_12mo_label).toBe('Optimized');
  });

  it('parses 3-letter month abbreviations correctly, not just full month names — real bug found against live sample reports', async () => {
    // "May" is identical abbreviated or full, so a naive full-month-name lookup only works by
    // coincidence for that one month; Mar/Apr/Jun/Jul/Aug/etc genuinely differ.
    for (const [abbrev, expected] of [['Mar 31, 2026', '2026-03'], ['Aug 31, 2026', '2026-08'], ['Jun 30, 2026', '2026-06']]) {
      const page = buildPage({ periodText: abbrev, oilUse: { mo3: '+5%' }, impact: { mo3: '$100' }, filtration: { mo3: '90%' } });
      const out = await parseWith([page]);
      expect(out[0].period).toBe(expected);
    }
  });

  it('returns no rows when the PDF never shows the report title (misrouted file guard)', async () => {
    const page = buildPage({ withTitle: false, oilUse: { mo3: '+5%' } });
    const out = await parseWith([page]);
    expect(out).toEqual([]);
  });

  it('handles multiple restaurants across pages', async () => {
    const page1 = buildPage({ loc: '00100', locName: 'STORE ONE', oilUse: { mo3: '+10%' }, impact: { mo3: '$500' }, filtration: { mo3: '90%' } });
    const page2 = buildPage({ loc: '00200', locName: 'STORE TWO', oilUse: { mo3: '-5%' }, impact: { mo3: 'Quality Concern' }, filtration: { mo3: '70%' } });
    const out = await parseWith([page1, page2]);
    const byLoc = Object.fromEntries(out.map(r => [r.loc, r]));
    expect(byLoc['100'].loc_name).toBe('STORE ONE');
    expect(byLoc['200'].loc_name).toBe('STORE TWO');
    expect(byLoc['100'].impact_3mo_dollars).toBe(500);
    expect(byLoc['200'].impact_3mo_label).toBe('Quality Concern');
  });
});

describe('detectType routing — Oil Efficiency', () => {
  it('routes a Cargill food oil report filename to oil-efficiency', () => {
    const t = detectType('1000015842_Cargill_food_oil_report_Mar_2026.pdf', null);
    expect(t.type).toBe('oil-efficiency');
    expect(t.confidence).toBe('high');
  });

  it('does not misroute an unrelated PDF filename', () => {
    const t = detectType('Daily Activity Report.pdf', null);
    expect(t.type).not.toBe('oil-efficiency');
  });
});

describe('engine/oil-efficiency.js', () => {
  const mk = (loc, period, extra = {}) => ({ loc, period, loc_name: `Store ${loc}`, owner_name: 'Owner', ...extra });

  it('periodsInRange filters by YYYY-MM against a {s,e} range', () => {
    const rows = [mk('1', '2026-08'), mk('1', '2026-09'), mk('1', '2026-10')];
    const out = periodsInRange(rows, { s: '2026-09-01', e: '2026-10-31' });
    expect(out.map(r => r.period)).toEqual(['2026-09', '2026-10']);
  });

  it('latestPeriodByStore picks the max period per loc', () => {
    const rows = [mk('1', '2026-08'), mk('1', '2026-10'), mk('2', '2026-09')];
    const m = latestPeriodByStore(rows);
    expect(m.get('1')).toBe('2026-10');
    expect(m.get('2')).toBe('2026-09');
  });

  it('collapses to each store’s latest period within range, never summed', () => {
    const rows = [
      mk('1', '2026-08', { impact_3mo_dollars: 500 }),
      mk('1', '2026-09', { impact_3mo_dollars: 700 }),
    ];
    const { storeRows } = buildOilEfficiencyReport(rows, {});
    expect(storeRows.length).toBe(1);
    expect(storeRows[0].period).toBe('2026-09');
    expect(storeRows[0].impact_3mo_dollars).toBe(700);
  });

  it('ranks a Quality Concern label above any dollar amount, then sorts by $ descending', () => {
    const rows = [
      mk('1', '2026-09', { impact_3mo_dollars: 5000 }),
      mk('2', '2026-09', { impact_3mo_label: 'Quality Concern' }),
      mk('3', '2026-09', { impact_3mo_dollars: 100 }),
    ];
    const { storeRows } = buildOilEfficiencyReport(rows, {});
    expect(storeRows.map(r => r.loc)).toEqual(['2', '1', '3']);
  });

  it('filters by locs', () => {
    const rows = [mk('1', '2026-09'), mk('2', '2026-09')];
    const { storeRows } = buildOilEfficiencyReport(rows, { locs: ['2'] });
    expect(storeRows.map(r => r.loc)).toEqual(['2']);
  });

  it('qualityConcernStores / totalImpactDollars', () => {
    const rows = [
      mk('1', '2026-09', { impact_3mo_dollars: 500 }),
      mk('2', '2026-09', { impact_3mo_label: 'Quality Concern' }),
      mk('3', '2026-09', { impact_3mo_dollars: 300 }),
    ];
    const { storeRows } = buildOilEfficiencyReport(rows, {});
    expect(qualityConcernStores(storeRows).map(r => r.loc)).toEqual(['2']);
    expect(totalImpactDollars(storeRows)).toBe(800);
  });

  // Regression, 2026-10-20 — same root cause and same fix as conversion-efficiency.test.js's
  // equivalent test: ReportShell's generic defaultPresetId='28d' silently excluded a re-uploaded
  // historical backfill. Exercises the real call-site fix (OE_DATE_PRESETS + defaultPresetId:
  // 'all' in views/oil-efficiency.js).
  it('the panel’s own default date range (OE_DATE_PRESETS "all") does not exclude a year-old backfilled period', () => {
    const range = resolveDatePreset('all', OE_DATE_PRESETS, new Date('2026-10-20'));
    expect(range).toBeTruthy();
    const rows = [
      mk('1', '2024-11', { impact_3mo_dollars: 500 }), // old backfill
      mk('2', '2026-10', { impact_3mo_dollars: 10 }), // today's emailed row
    ];
    const { storeRows } = buildOilEfficiencyReport(rows, { range });
    expect(storeRows.map(r => r.loc).sort()).toEqual(['1', '2']);
  });
});
