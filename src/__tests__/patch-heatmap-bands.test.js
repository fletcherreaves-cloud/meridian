// @ts-nocheck
// #219 — Patch Heatmap band calibration. Guards the structural fact the original v4.985/986
// constants missed: band = 100*(1-gap/badAt) with clean>=80 / watch>=50 means WATCH fires at
// 0.2*badAt and CRITICAL fires at 0.5*badAt, NOT at badAt itself — so badAt has to be set to
// 2x the intended "critical" anchor, not the anchor directly. Also guards the 4 owner-measured
// badAt values (scripts/measure-patch-heatmap-bands.mjs, run against live production
// 2026-08-11) against silent drift.
import { describe, it, expect } from 'vitest';
import { bandFromGap, storeDimensions } from '../views/patch-heatmap.js';

describe('bandFromGap — the structural badAt/threshold relationship', () => {
  it('bands to exactly 100 at zero gap and negative (better-than-target) gaps', () => {
    expect(bandFromGap(0, 27)).toBe(100);
    expect(bandFromGap(-5, 27)).toBe(100); // negative = better than target, never > 100
  });

  it('watch (band<80) fires once gap exceeds 0.2 x badAt, not badAt itself', () => {
    const badAt = 20;
    expect(bandFromGap(0.2 * badAt - 0.001, badAt)).toBeGreaterThan(80); // just under 0.2x -> still clean
    expect(bandFromGap(0.2 * badAt + 0.001, badAt)).toBeLessThan(80);    // just over 0.2x -> watch
  });

  it('critical (band<50) fires once gap exceeds 0.5 x badAt, not badAt itself', () => {
    const badAt = 20;
    expect(bandFromGap(0.5 * badAt, badAt)).toBe(50);                    // exactly at the boundary
    expect(bandFromGap(0.5 * badAt + 0.001, badAt)).toBeLessThan(50);    // just over -> critical
  });

  it('bands to 0 (not negative) once gap reaches or exceeds badAt itself', () => {
    expect(bandFromGap(20, 20)).toBe(0);
    expect(bandFromGap(999, 20)).toBe(0);
  });

  it('returns null for a missing gap or a non-positive badAt, never a fabricated band', () => {
    expect(bandFromGap(null, 27)).toBeNull();
    expect(bandFromGap(5, 0)).toBeNull();
    expect(bandFromGap(5, null)).toBeNull();
  });
});

describe('storeDimensions — the 4 owner-measured badAt constants (2026-08-11 production run)', () => {
  // Each case sits exactly at its dimension's CRITICAL boundary (gap = 0.5 x badAt) to lock
  // in both the constant AND the corrected formula together — a regression in either one
  // moves this boundary.
  it('Sales critical boundary is 13.5% behind LY (badAt=27)', () => {
    const store = { pSales: 86500, pLY: 100000, t: {} }; // -13.5% vs LY
    const dims = storeDimensions(store, null);
    const sales = dims.find(d => d.label === 'Sales');
    expect(sales.band).toBeCloseTo(50, 1);
  });

  it('FOB critical boundary is 0.95pp over target (badAt=1.9)', () => {
    const store = { t: { tFOBTarget: 0.04 }, pSales: 0, pLY: 0 };
    const fobRow = { fobPct: 0.04 + 0.0095 }; // +0.95pp
    const dims = storeDimensions(store, fobRow);
    const fob = dims.find(d => d.label === 'FOB');
    expect(fob.band).toBeCloseTo(50, 1);
  });

  it('Labor critical boundary is 4.4pp over target (badAt=8.8)', () => {
    const store = { t: { tCrewLabor: 0.22 }, p: { laborPct: 0.22 + 0.044 }, pSales: 0, pLY: 0 };
    const dims = storeDimensions(store, null);
    const labor = dims.find(d => d.label === 'Labor');
    expect(labor.band).toBeCloseTo(50, 1);
  });

  it('Speed critical boundary is 36.5% over target OEPE (badAt=73)', () => {
    const store = { t: { tOepe: 120 }, p: { oepe: 120 * 1.365 }, pSales: 0, pLY: 0 };
    const dims = storeDimensions(store, null);
    const speed = dims.find(d => d.label === 'Speed');
    expect(speed.band).toBeCloseTo(50, 0.6);
  });
});
