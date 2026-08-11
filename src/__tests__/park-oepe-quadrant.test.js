// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { computeParkOepeQuadrants } from '../engine/park-oepe-quadrant.js';

describe('computeParkOepeQuadrants — medians recomputed per call, never frozen', () => {
  it('a store above both medians lands in A (parks a lot, flow good)', () => {
    const rows = [
      { loc: '1', park: 0.30, oepe: 100 },  // high park, best flow → A
      { loc: '2', park: 0.05, oepe: 200 },  // low park, worst flow → D
      { loc: '3', park: 0.15, oepe: 150 },  // middle — ties break to A (>=/<= both true)
    ];
    const { medians, byLoc } = computeParkOepeQuadrants(rows);
    expect(medians.park).toBe(0.15);
    expect(medians.oepe).toBe(150);
    expect(byLoc['1'].quadrant).toBe('A');
    expect(byLoc['2'].quadrant).toBe('D');
    expect(byLoc['3'].quadrant).toBe('A'); // exactly at both medians
  });

  it('classifies all four quadrants correctly against a clean synthetic district', () => {
    const rows = [
      { loc: 'A1', park: 0.30, oepe: 100 }, // high park, good flow
      { loc: 'B1', park: 0.30, oepe: 200 }, // high park, bad flow
      { loc: 'C1', park: 0.02, oepe: 100 }, // low park, good flow
      { loc: 'D1', park: 0.02, oepe: 200 }, // low park, bad flow
    ];
    const { quadrants } = computeParkOepeQuadrants(rows);
    expect(quadrants.A.map(r => r.loc)).toEqual(['A1']);
    expect(quadrants.B.map(r => r.loc)).toEqual(['B1']);
    expect(quadrants.C.map(r => r.loc)).toEqual(['C1']);
    expect(quadrants.D.map(r => r.loc)).toEqual(['D1']);
  });

  it('rows missing park or oepe are excluded from both the medians and the quadrants', () => {
    const rows = [
      { loc: '1', park: 0.10, oepe: 150 },
      { loc: '2', park: null, oepe: 150 },   // missing park
      { loc: '3', park: 0.10, oepe: null },  // missing oepe
    ];
    const { medians, byLoc, excluded } = computeParkOepeQuadrants(rows);
    expect(medians.park).toBe(0.10); // computed from row 1 only
    expect(byLoc['2']).toBeUndefined();
    expect(byLoc['3']).toBeUndefined();
    expect(excluded.map(r => r.loc).sort()).toEqual(['2', '3']);
  });

  it('empty input returns null medians and no quadrant members, not a crash', () => {
    const { medians, quadrants } = computeParkOepeQuadrants([]);
    expect(medians.park).toBeNull();
    expect(medians.oepe).toBeNull();
    expect(quadrants.A).toEqual([]);
  });

  // Reproduces the UNAMBIGUOUS part of issue #181's own worked example (27 stores, district
  // medians ~10.91% park / ~158.4s OEPE): the heaviest parkers land in A (tool working, flow
  // protected), not penalized as a single-axis band would. Near-zero parkers with good flow land
  // in C. Borderline cases within ~0.1pp of the issue's displayed (rounded) median are NOT
  // reproduced here — display rounding makes their exact side-of-median ambiguous from the
  // comment text alone.
  it('reproduces #181\'s Elgin/Ponce de Leon (A) and Cottondale/Lindsay (C) classifications', () => {
    const rows = [
      { loc: 'elgin',       park: 0.305, oepe: 135 },
      { loc: 'poncedeleon', park: 0.336, oepe: 154 },
      { loc: 'cottondale',  park: 0.021, oepe: 139 },
      { loc: 'lindsay',     park: 0.012, oepe: 158 },
      // padding rows to establish a realistic median without relying on just these 4
      { loc: 'mid1', park: 0.11, oepe: 158 }, { loc: 'mid2', park: 0.11, oepe: 158 },
      { loc: 'mid3', park: 0.11, oepe: 158 }, { loc: 'mid4', park: 0.11, oepe: 158 },
      { loc: 'mid5', park: 0.11, oepe: 158 },
    ];
    const { byLoc } = computeParkOepeQuadrants(rows);
    expect(byLoc.elgin.quadrant).toBe('A');
    expect(byLoc.poncedeleon.quadrant).toBe('A');
    expect(byLoc.cottondale.quadrant).toBe('C');
    expect(byLoc.lindsay.quadrant).toBe('C');
  });
});
