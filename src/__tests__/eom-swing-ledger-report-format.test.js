// @ts-nocheck
// eom-swing-ledger-report.js's formatSwingLedgerText/formatSwingLedgerHtml had zero direct test
// coverage despite being live: the "📋 Copy" and "🖨 Print" export paths for the Count-Swing
// Ledger report (called at lines 130/135 in the same file). The existing render test for this
// panel never touches these two formatters or a clipboard/print path.
import { describe, it, expect } from 'vitest';
import { formatSwingLedgerText, formatSwingLedgerHtml } from '../views/eom-swing-ledger-report.js';

const ROWS = [
  { loc: '5985', storeName: 'Rest. #5985', org: 'mcdok', descr: 'Beef Patty', wrin: 'WR-1', cls: 'food', dollars: -50, dt: '2026-08-05', manager: 'J. Smith', locked: true, recovered: false },
  { loc: '5985', storeName: 'Rest. #5985', org: 'mcdok', descr: 'Cup 22oz', wrin: 'WR-2', cls: 'paper', dollars: 30, dt: '2026-08-10', manager: 'A. Lee', locked: false, recovered: true },
  { loc: '3708', storeName: 'Rest. #3708', org: 'emerald', descr: 'Bag Large', wrin: 'WR-3', cls: 'paper', dollars: -10, dt: '2026-08-12', manager: 'unknown', locked: false, recovered: false },
];

describe('formatSwingLedgerText', () => {
  it('reports zero swings with a "no material count swings" line', () => {
    const text = formatSwingLedgerText([], { period: '2026-08', scopeLabel: 'all stores', totalDollars: 0 });
    expect(text).toContain('0 count swings');
    expect(text).toContain('No material count swings this period for the current scope.');
  });

  it('totals net dollars and the locked (real-loss) subtotal separately from the full list', () => {
    const text = formatSwingLedgerText(ROWS, { period: '2026-08', scopeLabel: 'MCDOK', totalDollars: -30 });
    expect(text).toContain('3 count swings');
    expect(text).toContain('net -$30');
    expect(text).toContain('1 locked real loss (-$50)'); // only the first row is locked
  });

  it('groups rows by location then status (locked/recovered/open), stating the status once per group', () => {
    const text = formatSwingLedgerText(ROWS, { period: '2026-08', scopeLabel: 'MCDOK', totalDollars: -30 });
    expect(text).toContain('Rest. #5985 (OK)');
    expect(text).toContain('Rest. #3708 (FL)');
    expect(text).toContain('🔒 Locked — real loss, no recovery chance this period');
    expect(text).toContain('↩ Recovered — a later count this period washed it out');
    expect(text).toContain('⏳ Still open — more counts may follow');
    expect(text).toContain('Beef Patty -$50');
    expect(text).toContain('Cup 22oz +$30');
  });

  it('includes an optional "top swingers to recount" section when provided', () => {
    const text = formatSwingLedgerText(ROWS, {
      period: '2026-08', scopeLabel: 'MCDOK', totalDollars: -30,
      topSwingers: [{ descr: 'Beef Patty', wrin: 'WR-1', cls: 'food', netCountDollars: -50, nCounts: 3 }],
    });
    expect(text).toContain('Top items to recount at count time');
    expect(text).toContain('Beef Patty (Food, net -$50 across 3 counts)');
  });

  it('omits the top-swingers and reconstruction sections when not provided', () => {
    const text = formatSwingLedgerText(ROWS, { period: '2026-08', scopeLabel: 'MCDOK', totalDollars: -30 });
    expect(text).not.toContain('Top items to recount');
    expect(text).not.toContain('product reconstruction');
  });
});

describe('formatSwingLedgerHtml', () => {
  it('renders an empty-scope message when there are no rows', () => {
    const html = formatSwingLedgerHtml([], { period: '2026-08', scopeLabel: 'all stores', totalDollars: 0 });
    expect(html).toContain('No material count swings this period for the current scope.');
  });

  it('renders one <table> per (location, status) group with item rows inside', () => {
    const html = formatSwingLedgerHtml(ROWS, { period: '2026-08', scopeLabel: 'MCDOK', totalDollars: -30 });
    expect(html).toContain('Rest. #5985 (OK)');
    expect(html).toContain('Rest. #3708 (FL)');
    const tableCount = (html.match(/<table>/g) || []).length;
    expect(tableCount).toBe(3); // locked + recovered at 5985 (different statuses) + open at 3708
    expect(html).toContain('WR-1');
  });

  it('escapes HTML-significant characters in item descriptions', () => {
    const html = formatSwingLedgerHtml([
      { loc: '5985', storeName: 'Rest. #5985', org: 'mcdok', descr: 'A & B <Special>', wrin: 'WR-9', cls: 'food', dollars: 5, dt: '2026-08-01', manager: 'X', locked: false, recovered: false },
    ], { period: '2026-08', scopeLabel: 'MCDOK', totalDollars: 5 });
    expect(html).toContain('A &amp; B &lt;Special&gt;');
    expect(html).not.toContain('<Special>');
  });
});
