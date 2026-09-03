// @ts-nocheck
// views/delivery-mix.js's aggregate() had zero test coverage despite being live -- it's the
// entire computation behind the "3PO Delivery" nav panel's Delivery Platforms tab (called at
// line 326 inside DeliveryPlatformsTab, itself rendered by the exported, nav-wired
// DeliveryMixPanel). Rolls raw ds.cashRows into per-store DoorDash/UberEats/Grubhub totals, 3PO
// % of net sales, and a platform "leader" tie-break.
import { describe, it, expect } from 'vitest';
import { aggregate } from '../views/delivery-mix.js';

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dk = d => d.toISOString().slice(0, 10);
const today = new Date();

describe('aggregate', () => {
  it('returns [] for empty/missing cashRows', () => {
    expect(aggregate(null, 7)).toEqual([]);
    expect(aggregate([], 7)).toEqual([]);
  });

  it('excludes rows missing loc or date', () => {
    const rows = [
      { date: dk(today), doorDashSales: 100 },              // no loc
      { loc: '3708', doorDashSales: 100 },                   // no date
    ];
    expect(aggregate(rows, 30)).toEqual([]);
  });

  it('excludes rows older than the lookback window', () => {
    const rows = [
      { loc: '3708', date: dk(addDays(today, -1)), doorDashSales: 100, allNetSales: 1000 },
      { loc: '3708', date: dk(addDays(today, -60)), doorDashSales: 9999, allNetSales: 9999 },
    ];
    const [store] = aggregate(rows, 7);
    expect(store.days).toBe(1);
    expect(store.doorDashSales).toBe(100);
  });

  it('sums per-platform sales/GC across rows and computes total3poPct against allNetSales', () => {
    const rows = [
      { loc: '3708', date: dk(addDays(today, -1)), doorDashSales: 100, doorDashGC: 10, allNetSales: 1000 },
      { loc: '3708', date: dk(addDays(today, -2)), uberEatsSales: 50, uberEatsGC: 5, allNetSales: 1000 },
    ];
    const [store] = aggregate(rows, 7);
    expect(store.doorDashSales).toBe(100);
    expect(store.uberEatsSales).toBe(50);
    expect(store.allNetSales).toBe(2000);
    expect(store.total3poSales).toBe(150); // falls back to dd+ue+gh since total3poSales not on rows
    expect(store.total3poPct).toBeCloseTo(150 / 2000, 6);
  });

  it('prefers an explicit total3poSales field over the dd+ue+gh fallback sum', () => {
    const rows = [
      { loc: '3708', date: dk(addDays(today, -1)), doorDashSales: 100, total3poSales: 500, allNetSales: 1000 },
    ];
    const [store] = aggregate(rows, 7);
    expect(store.total3poSales).toBe(500);
  });

  it('guards total3poPct/doorDashPct/uberEatsPct/grubhubPct at 0 when the denominator is 0', () => {
    const rows = [{ loc: '3708', date: dk(addDays(today, -1)) }]; // no sales fields at all
    const [store] = aggregate(rows, 7);
    expect(store.total3poPct).toBe(0);
    expect(store.doorDashPct).toBe(0);
    expect(store.uberEatsPct).toBe(0);
    expect(store.grubhubPct).toBe(0);
  });

  it('picks DoorDash as the leader on an all-zero tie', () => {
    const rows = [{ loc: '3708', date: dk(addDays(today, -1)) }];
    expect(aggregate(rows, 7)[0].leader).toBe('DoorDash');
  });

  it('picks UberEats over Grubhub on a tie between the two, when both beat DoorDash', () => {
    const rows = [{ loc: '3708', date: dk(addDays(today, -1)), doorDashSales: 10, uberEatsSales: 50, grubhubSales: 50 }];
    expect(aggregate(rows, 7)[0].leader).toBe('UberEats');
  });

  it('picks Grubhub when it strictly beats both other platforms', () => {
    const rows = [{ loc: '3708', date: dk(addDays(today, -1)), doorDashSales: 10, uberEatsSales: 20, grubhubSales: 30 }];
    expect(aggregate(rows, 7)[0].leader).toBe('Grubhub');
  });

  it('aggregates multiple stores independently and sorts by total3poPct descending', () => {
    const rows = [
      { loc: 'A', date: dk(addDays(today, -1)), doorDashSales: 100, allNetSales: 1000 }, // 10%
      { loc: 'B', date: dk(addDays(today, -1)), doorDashSales: 500, allNetSales: 1000 }, // 50%
    ];
    const stores = aggregate(rows, 7);
    expect(stores.map(s => s.loc)).toEqual(['B', 'A']);
  });
});
