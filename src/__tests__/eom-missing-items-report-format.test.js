// @ts-nocheck
// eom-missing-items-report.js's formatMissingItemsText/formatMissingItemsHtml had zero direct
// test coverage despite being live: the "📋 Copy" and "🖨 Print" export paths (called at lines
// 102 and 107 in the same file). The existing render test for this panel only exercises the
// on-screen table, never the Copy/Print formatters -- so empty-list and never-counted edge cases
// were completely unexercised.
import { describe, it, expect } from 'vitest';
import { formatMissingItemsText, formatMissingItemsHtml } from '../views/eom-missing-items-report.js';

const ROWS = [
  {
    loc: '5985', storeName: 'Rest. #5985', org: 'mcdok',
    recommendation: 'Count today', cls: 'paper', descr: 'Cup 22oz', wrin: 'WR-1',
    onHandAmt: 412.5, lastCounted: '2026-08-01', valueAtRisk: 412.5,
  },
  {
    loc: '5985', storeName: 'Rest. #5985', org: 'mcdok',
    recommendation: 'Count today', cls: 'food', descr: 'Beef Patty', wrin: 'WR-2',
    onHandAmt: 88, lastCounted: null, valueAtRisk: 88,
  },
  {
    loc: '3708', storeName: 'Rest. #3708', org: 'emerald',
    recommendation: 'Investigate stale count', cls: 'paper', descr: 'Bag Large', wrin: 'WR-3',
    onHandAmt: 20, lastCounted: '2026-06-15', valueAtRisk: 20,
  },
];

describe('formatMissingItemsText', () => {
  it('reports zero items with a "no uncounted items" line', () => {
    const text = formatMissingItemsText([], { period: '2026-08', scopeLabel: 'all stores', reportAsOf: '2026-09-01' });
    expect(text).toContain('0 items');
    expect(text).toContain('No uncounted items in the current scope.');
  });

  it('groups items by location then recommendation, totals $ at risk, and states the recommendation once per group', () => {
    const text = formatMissingItemsText(ROWS, { period: '2026-08', scopeLabel: 'MCDOK', reportAsOf: '2026-09-01' });
    expect(text).toContain('3 items');
    expect(text).toContain('$521'); // 412.5 + 88 + 20 rounded
    expect(text).toContain('Rest. #5985 (OK)');
    expect(text).toContain('Rest. #3708 (FL)');
    // The recommendation text appears once per group, not once per item.
    expect((text.match(/Count today/g) || []).length).toBe(1);
    expect(text).toContain('Cup 22oz');
    expect(text).toContain('Beef Patty');
  });

  it('shows "never counted" for a null lastCounted date', () => {
    const text = formatMissingItemsText(ROWS, { period: '2026-08', scopeLabel: 'MCDOK' });
    expect(text).toContain('Beef Patty (Food, $88, last never counted)');
  });
});

describe('formatMissingItemsHtml', () => {
  it('renders an empty-scope message when there are no rows, without a table', () => {
    const html = formatMissingItemsHtml([], { period: '2026-08', scopeLabel: 'all stores', reportAsOf: '2026-09-01' });
    expect(html).toContain('No uncounted items in the current scope.');
    expect(html).not.toContain('<table>');
  });

  it('renders one <table> per (location, recommendation) group with the item rows inside', () => {
    const html = formatMissingItemsHtml(ROWS, { period: '2026-08', scopeLabel: 'MCDOK', reportAsOf: '2026-09-01' });
    expect(html).toContain('Rest. #5985 (OK)');
    expect(html).toContain('Rest. #3708 (FL)');
    const tableCount = (html.match(/<table>/g) || []).length;
    expect(tableCount).toBe(2); // one group per location in this fixture
    expect(html).toContain('WR-1');
    expect(html).toContain('Never'); // lastCounted null -> 'Never' in the HTML path
  });

  it('escapes HTML-significant characters in item descriptions', () => {
    const html = formatMissingItemsHtml([
      { loc: '5985', storeName: 'Rest. #5985', org: 'mcdok', recommendation: 'Count today', cls: 'food', descr: 'A & B <Special>', wrin: 'WR-9', onHandAmt: 10, lastCounted: null, valueAtRisk: 10 },
    ], { period: '2026-08', scopeLabel: 'MCDOK' });
    expect(html).toContain('A &amp; B &lt;Special&gt;');
    expect(html).not.toContain('<Special>');
  });
});
