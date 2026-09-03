// @ts-nocheck
// eom-inventory.js's scoreboardRowFields had zero direct test coverage despite being live: the
// shared accessor src/views/eom-dashboard.js's CSV export (4 call sites) and
// src/views/eom-team-snapshot.js (2 call sites) both use, explicitly to prevent the
// "two panels disagree on one number" bug class CLAUDE.md's Dev Rules calls out.
import { describe, it, expect } from 'vitest';
import { scoreboardRowFields } from '../engine/eom-inventory.js';

describe('scoreboardRowFields', () => {
  it('maps org "emerald" to state "FL"', () => {
    const r = { name: 'Freeport', org: 'emerald', prog: { pctCounted: 0.5 }, fobPct: 0.03, fob$: 500 };
    expect(scoreboardRowFields(r).state).toBe('FL');
  });

  it('maps any other org (e.g. "mcdok") to state "OK"', () => {
    const r = { name: 'Ada', org: 'mcdok', prog: { pctCounted: 0.5 }, fobPct: 0.03, fob$: 500 };
    expect(scoreboardRowFields(r).state).toBe('OK');
  });

  it('prefers earlyPctCounted over pctCounted when both are present', () => {
    const r = { name: 'Ada', org: 'mcdok', prog: { earlyPctCounted: 0.9, pctCounted: 0.5 }, fobPct: 0.03, fob$: 500 };
    expect(scoreboardRowFields(r).countPct).toBe(0.9);
  });

  it('falls back to pctCounted when earlyPctCounted is null/undefined', () => {
    const r1 = { name: 'Ada', org: 'mcdok', prog: { earlyPctCounted: null, pctCounted: 0.5 }, fobPct: 0.03, fob$: 500 };
    expect(scoreboardRowFields(r1).countPct).toBe(0.5);
    const r2 = { name: 'Ada', org: 'mcdok', prog: { pctCounted: 0.5 }, fobPct: 0.03, fob$: 500 };
    expect(scoreboardRowFields(r2).countPct).toBe(0.5);
  });

  it('does NOT fall back when earlyPctCounted is a real 0 (nullish coalescing, not ||)', () => {
    const r = { name: 'Ada', org: 'mcdok', prog: { earlyPctCounted: 0, pctCounted: 0.5 }, fobPct: 0.03, fob$: 500 };
    expect(scoreboardRowFields(r).countPct).toBe(0);
  });

  it('passes store name, fobPct, and fob$ through verbatim as fobDollar', () => {
    const r = { name: 'Ada', org: 'mcdok', prog: { pctCounted: 0.5 }, fobPct: 0.041, fob$: 1234.5 };
    const out = scoreboardRowFields(r);
    expect(out.store).toBe('Ada');
    expect(out.fobPct).toBe(0.041);
    expect(out.fobDollar).toBe(1234.5);
  });
});
