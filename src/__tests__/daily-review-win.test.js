// @ts-nocheck
// Owner, 2026-11-13 (prompted by the Why Engine remedy work): "for each location we need to
// find somewhere to find at least one positive thing to call for each day." findDailyWin()
// operates on an already-built buildDailyReview() result, so these tests construct that shape
// directly rather than mocking the whole metric-source chain again (daily-review.test.js already
// covers how buildDailyReview() itself assembles sections/lines).
import { describe, it, expect } from 'vitest';
import { findDailyWin } from '../engine/daily-review.js';

function emptySection(key, label, lines = [], severity = null) {
  return { key, label, lines, severity };
}

const EMPTY_REVIEW = {
  loc: '10422', date: '2026-11-11',
  sections: [
    emptySection('sales', 'Sales', []),
    emptySection('service', 'Service', []),
    emptySection('labor', 'Controls — Labor', []),
    emptySection('cash', 'Controls — Cash', []),
    emptySection('fob', 'FOB', []),
  ],
};

function withSalesVsLY(review, { prodSalesPct = null, gcPct = null } = {}) {
  const sales = { ...review.sections.find(s => s.key === 'sales') };
  sales.lines = [];
  if (prodSalesPct != null) sales.lines.push({ key: 'prodSales', label: 'Product Sales', actual: 11000, ly: 11000 / (1 + prodSalesPct), vsLYPct: prodSalesPct });
  if (gcPct != null) sales.lines.push({ key: 'gc', label: 'Guest Count (GC)', actual: 300, ly: 300 / (1 + gcPct), vsLYPct: gcPct });
  return { ...review, sections: review.sections.map(s => (s.key === 'sales' ? sales : s)) };
}

function withTargetLine(review, sectionKey, line, severity) {
  return {
    ...review,
    sections: review.sections.map(s => (s.key === sectionKey
      ? { ...s, lines: [...s.lines, line], severity: severity ?? s.severity }
      : s)),
  };
}

describe('findDailyWin()', () => {
  it('always returns a real object, never null', () => {
    expect(findDailyWin(EMPTY_REVIEW)).toBeTruthy();
  });

  it('a clean, trivial sales beat (just barely positive) does NOT count as a headline win', () => {
    const review = withSalesVsLY(EMPTY_REVIEW, { prodSalesPct: 0.004 }); // well under the 3% bar
    const win = findDailyWin(review);
    expect(win.kind).toBe('clean'); // no concerns anywhere, so falls through to the clean-day read
  });

  it('a real sales beat vs LY (>=3%) is the headline win when nothing else qualifies', () => {
    const review = withSalesVsLY(EMPTY_REVIEW, { prodSalesPct: 0.084 });
    const win = findDailyWin(review);
    expect(win.kind).toBe('win');
    expect(win.headline).toMatch(/Sales up 8\.4% vs LY/);
    expect(win.detail).toMatch(/\$11,000/);
  });

  it('guest-count growth can win even when sales growth does not clear the bar', () => {
    const review = withSalesVsLY(EMPTY_REVIEW, { prodSalesPct: 0.01, gcPct: 0.07 });
    const win = findDailyWin(review);
    expect(win.headline).toMatch(/Guest counts up 7\.0% vs LY/);
  });

  it('the single biggest real margin wins when multiple candidates qualify', () => {
    let review = withSalesVsLY(EMPTY_REVIEW, { prodSalesPct: 0.04 }); // margin 0.04
    review = withTargetLine(review, 'labor', // TPPH beats target by a lot more than sales did
      { key: 'tpph', label: 'TPPH', unit: 'rate', actual: 6.5, target: 5.5, direction: 'higher', status: 'good' }, 'good');
    const win = findDailyWin(review);
    expect(win.headline).toMatch(/TPPH beat target/);
  });

  it('a lower-is-better metric (e.g. OEPE) computes margin in the correct direction', () => {
    const review = withTargetLine(EMPTY_REVIEW, 'service',
      { key: 'oepe', label: 'OEPE W/O Parked', unit: 'sec', actual: 100, target: 130, direction: 'lower', status: 'good' }, 'good');
    const win = findDailyWin(review);
    expect(win.kind).toBe('win');
    expect(win.headline).toMatch(/OEPE W\/O Parked beat target by 23\.1%/);
  });

  it('a "good" line that barely beats target (under the 5% margin bar) does not count as a win', () => {
    const review = withTargetLine(EMPTY_REVIEW, 'fob',
      { key: 'fobPct', label: 'FOB %', unit: 'pct', actual: 0.0398, target: 0.04, direction: 'lower', status: 'good' }, 'good');
    const win = findDailyWin(review);
    expect(win.kind).toBe('clean');
  });

  it('a day with no wins but also no concerns reads as an honest "clean, steady day"', () => {
    const win = findDailyWin(EMPTY_REVIEW);
    expect(win.kind).toBe('clean');
    expect(win.headline).toBe('Clean, steady day');
  });

  it('a day with a real concern elsewhere and no win candidate reads as "no standout yet", not a fake clean day', () => {
    const review = { ...EMPTY_REVIEW, sections: EMPTY_REVIEW.sections.map(s => (s.key === 'cash' ? { ...s, severity: 'bad' } : s)) };
    const win = findDailyWin(review);
    expect(win.kind).toBe('none');
    expect(win.headline).toBe('No standout yet');
  });

  it('a sub-threshold sales bump plus a real concern elsewhere reads as "no standout", not a fabricated clean day', () => {
    let review = withSalesVsLY(EMPTY_REVIEW, { prodSalesPct: 0.01 }); // below the 3% win bar
    review = { ...review, sections: review.sections.map(s => (s.key === 'service' ? { ...s, severity: 'watch' } : s)) };
    const win = findDailyWin(review);
    // No candidate clears the win bar, and the service watch means it's not a clean day either.
    expect(win.kind).toBe('none');
  });

  it('a real win still gets announced even when something unrelated has a concern that day', () => {
    let review = withSalesVsLY(EMPTY_REVIEW, { prodSalesPct: 0.084 }); // clears the win bar on its own
    review = { ...review, sections: review.sections.map(s => (s.key === 'service' ? { ...s, severity: 'watch' } : s)) };
    const win = findDailyWin(review);
    // A real, cited win is worth calling out regardless of an unrelated soft spot elsewhere —
    // "find at least one positive thing" shouldn't get suppressed by an unrelated watch.
    expect(win.kind).toBe('win');
    expect(win.headline).toMatch(/Sales up 8\.4% vs LY/);
  });
});
