import { describe, it, expect } from 'vitest';
import { computeEventFactors, _withPriceEvents } from '../utils/events.js';

function pmixDays(loc, item, price, start, n) {
  const out = [];
  const d0 = new Date(start + 'T00:00:00Z');
  for (let i = 0; i < n; i++) {
    const d = new Date(d0.getTime() + i * 86400000);
    out.push({ loc, item, price, date: d.toISOString().slice(0, 10) });
  }
  return out;
}

describe('_withPriceEvents', () => {
  it('is a no-op (same object) when ds.pmixRows is absent', () => {
    const userEvents = { '3708': { '2026-08-13': { type: 'holiday', label: 'X' } } };
    expect(_withPriceEvents({}, userEvents)).toBe(userEvents);
    expect(_withPriceEvents({ pmixRows: [] }, userEvents)).toBe(userEvents);
  });

  it('adds a synthetic price_change entry on a date with no existing event', () => {
    const pmixRows = [
      ...pmixDays('3708', 1, 2.79, '2026-06-01', 14),
      ...pmixDays('3708', 1, 2.99, '2026-06-15', 14),
    ];
    const out = _withPriceEvents({ pmixRows }, {});
    const ev = out['3708']['2026-06-15'];
    expect(ev.type).toBe('price_change');
    expect(ev.tags).toEqual([{ type: 'price_change' }]);
    expect(ev.synthetic).toBe(true);
    expect(ev.itemsChanged).toBe(1);
  });

  it('MERGES with a real hand-entered event on the same date -- never overwrites it', () => {
    const pmixRows = [
      ...pmixDays('3708', 1, 2.79, '2026-06-01', 14),
      ...pmixDays('3708', 1, 2.99, '2026-06-15', 14),
    ];
    const userEvents = { '3708': { '2026-06-15': { type: 'sports', label: 'Home Game', tags: [{ type: 'sports' }] } } };
    const out = _withPriceEvents({ pmixRows }, userEvents);
    const ev = out['3708']['2026-06-15'];
    expect(ev.label).toBe('Home Game');            // real label preserved
    expect(ev.tags.map(t => t.type)).toEqual(['sports', 'price_change']); // both types present
  });

  it('does not mutate the original userEvents object', () => {
    const pmixRows = [
      ...pmixDays('3708', 1, 2.79, '2026-06-01', 14),
      ...pmixDays('3708', 1, 2.99, '2026-06-15', 14),
    ];
    const userEvents = { '3708': { '2026-01-01': { type: 'holiday', label: 'New Year' } } };
    const frozen = JSON.parse(JSON.stringify(userEvents));
    _withPriceEvents({ pmixRows }, userEvents);
    expect(userEvents).toEqual(frozen);
  });
});

describe('computeEventFactors — price events flow through end to end', () => {
  function buildLabor(loc, n, salesFn) {
    const out = [];
    const d0 = new Date('2026-01-01T12:00:00Z');
    for (let i = 0; i < n; i++) {
      const d = new Date(d0.getTime() + i * 86400000);
      out.push({ loc, date: d, sales: salesFn(i, d) });
    }
    return out;
  }

  it('confirmed price-change dates produce a price_change factor, unprompted by userEvents', () => {
    const loc = '3708';
    // Two confirmed price-change dates (computeEventFactors needs >=2 impacts of one type
    // to report a median), both with a sales spike that day -- a step-up in $ sales when
    // the menu repriced, with no guest-count change modeled. Also elevate the day BEFORE
    // each spike: computeEventFactors's own laborRow lookup is `.find(within 1.5 days)`,
    // which (on real, gap-free daily data) matches the array's first candidate -- the
    // preceding day -- not necessarily the exact date; elevating both sidesteps that
    // pre-existing lookup quirk rather than depending on it.
    const spikeDates = new Set(['2026-01-19', '2026-01-20', '2026-02-16', '2026-02-17']);
    const laborRows = buildLabor(loc, 90, (i, d) => (spikeDates.has(d.toISOString().slice(0, 10)) ? 1300 : 1000));
    const pmixRows = [
      ...pmixDays(loc, 1, 2.79, '2026-01-01', 19),
      ...pmixDays(loc, 1, 2.99, '2026-01-20', 28),
      ...pmixDays(loc, 1, 3.19, '2026-02-17', 14),
    ];
    const factors = computeEventFactors({ laborRows, pmixRows }, {}); // no hand-entered events at all
    expect(factors[loc]).toBeDefined();
    expect(factors[loc].price_change).toBeGreaterThan(0.2); // ~30% sales step, well above noise
  });

  it('unchanged behavior (byte-identical factors) when ds has no pmixRows', () => {
    const loc = '3708';
    const laborRows = buildLabor(loc, 60, (i, d) => (d.toISOString().slice(0, 10) === '2026-01-20' ? 1300 : 1000));
    const userEvents = { [loc]: { '2026-01-20': { type: 'sports', label: 'Game' } } };
    const withPmix = computeEventFactors({ laborRows, pmixRows: [] }, userEvents);
    const withoutPmix = computeEventFactors({ laborRows }, userEvents);
    expect(withPmix).toEqual(withoutPmix);
  });
});
