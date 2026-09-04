// @ts-nocheck
// eom-recount-report.js's formatRecountImpactText had zero direct test coverage despite being
// live: the "📋 Copy" export path (called at line ~130-ish in the same file). Its sibling
// formatRecountImpactHtml is already exercised indirectly by dispatch-227-eom-reports.test.js's
// Print-button click test, but the Copy/text twin was never touched.
import { describe, it, expect } from 'vitest';
import { formatRecountImpactText } from '../views/eom-recount-report.js';

const ROWS = [
  { loc: '5985', storeName: 'Rest. #5985', org: 'mcdok', cls: 'food', descr: 'Beef Patty', wrin: 'WR-1', verdict: 'helping', verdictText: 'Helped: corrected a $50 undercount', baseVar: -50, curVar: 5 },
  { loc: '5985', storeName: 'Rest. #5985', org: 'mcdok', cls: 'paper', descr: 'Cup 22oz', wrin: 'WR-2', verdict: 'hurting', verdictText: 'Hurt: moved further from expected usage', baseVar: 10, curVar: 40 },
  { loc: '3708', storeName: 'Rest. #3708', org: 'emerald', cls: 'food', descr: 'Bag Large', wrin: 'WR-3', verdict: 'hurting', verdictText: 'Hurt: moved further from expected usage', baseVar: 5, curVar: 20 },
];

describe('formatRecountImpactText', () => {
  it('reports zero recounted items with a "no recounted items" line', () => {
    const text = formatRecountImpactText([], null, { period: '2026-08', scopeLabel: 'all stores' });
    expect(text).toContain('0 recounted items');
    expect(text).toContain('No recounted items in this close window for the current scope.');
  });

  it('counts helped vs hurt items separately from the total', () => {
    const text = formatRecountImpactText(ROWS, null, { period: '2026-08', scopeLabel: 'MCDOK' });
    expect(text).toContain('3 recounted items');
    expect(text).toContain('1 helped');
    expect(text).toContain('2 hurt');
  });

  it('groups items by location then verdict text, stating the verdict once per group', () => {
    const text = formatRecountImpactText(ROWS, null, { period: '2026-08', scopeLabel: 'MCDOK' });
    expect(text).toContain('Rest. #5985 (OK)');
    expect(text).toContain('Rest. #3708 (FL)');
    expect((text.match(/Hurt: moved further from expected usage/g) || []).length).toBe(2); // once per group, covering 2 items total
    expect(text).toContain('Beef Patty (Food, $-50 → $5)');
  });

  it('includes an optional Cross-Store Inconsistency section when crossStore rows are provided', () => {
    const crossStore = [{
      descr: 'Beef Patty', wrin: 'WR-1', nStores: 2, nHelped: 1, nHurt: 1, helpedDol: 50, hurtDol: -30,
      stores: [{ storeName: 'Rest. #5985', baseVar: -50, curVar: 5, verdict: 'helping' }, { storeName: 'Rest. #3708', baseVar: 10, curVar: 40, verdict: 'hurting' }],
    }];
    const text = formatRecountImpactText(ROWS, crossStore, { period: '2026-08', scopeLabel: 'MCDOK' });
    expect(text).toContain('⚠ Cross-Store Inconsistency — 1 item');
    expect(text).toContain('Beef Patty — 2 stores, 1 helped ($50), 1 hurt ($-30)');
    expect(text).toContain('Rest. #5985: $-50 → $5 (helping)');
  });

  it('omits the cross-store section when none is provided', () => {
    const text = formatRecountImpactText(ROWS, null, { period: '2026-08', scopeLabel: 'MCDOK' });
    expect(text).not.toContain('Cross-Store Inconsistency');
  });
});
