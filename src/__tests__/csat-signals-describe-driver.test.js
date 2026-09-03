// @ts-nocheck
// csat-signals.js's tierWord/describeDriver had zero direct test coverage despite being live:
// both are called from src/views/signals.js to render the plain-English CSAT-driver
// explanations in the UI (the "say the number AND the decision" panel surface).
import { describe, it, expect } from 'vitest';
import { tierWord, describeDriver } from '../engine/csat-signals.js';

describe('tierWord', () => {
  it('maps each known tier to its plain-English trust word', () => {
    expect(tierWord('slam-dunk')).toBe('Dependable');
    expect(tierWord('strong')).toBe('Likely real');
    expect(tierWord('watch')).toBe('Worth watching');
  });

  it('falls back to "Too weak to trust" for any other tier', () => {
    expect(tierWord('noise')).toBe('Too weak to trust');
    expect(tierWord(undefined)).toBe('Too weak to trust');
  });
});

describe('describeDriver', () => {
  const base = { withinR: 0.55, direction: 'X (helps)', tier: 'slam-dunk', replicated: true, locsUsed: 1, driverLabel: 'Speed of Service', csatLabel: 'OSAT' };

  it('states the driver went UP for a positive within-store r, and reuses tierWord', () => {
    const d = describeDriver(base);
    expect(d.headline).toBe('When Speed of Service goes up, OSAT tends to go UP.');
    expect(d.tierWord).toBe('Dependable');
  });

  it('states the driver went DOWN for a negative within-store r', () => {
    const d = describeDriver({ ...base, withinR: -0.42 });
    expect(d.headline).toBe('When Speed of Service goes up, OSAT tends to go DOWN.');
  });

  it('reads "(helps)" in the direction string as favorable', () => {
    const d = describeDriver({ ...base, direction: 'Speed (helps)' });
    expect(d.goodBad).toBe('That works in your favor.');
  });

  it('treats a direction without "helps" as pulling the score the wrong way', () => {
    const d = describeDriver({ ...base, direction: 'Speed (hurts)' });
    expect(d.goodBad).toBe('That pulls the guest score the wrong way.');
  });

  it('gives the slam-dunk tier its dependable, re-checked trust sentence', () => {
    const d = describeDriver(base);
    expect(d.trust).toBe('This is a strong, dependable pattern — it held up when we re-checked it on data it had never seen.');
  });

  it('gives a replicated watch-tier result a "held up on a fresh test" sentence', () => {
    const d = describeDriver({ ...base, withinR: 0.32, tier: 'watch', replicated: true });
    expect(d.trust).toBe('A moderate pattern that held up on a fresh test — worth keeping an eye on.');
  });

  it('gives an unreplicated watch-tier result a "treat it as a lead" sentence', () => {
    const d = describeDriver({ ...base, withinR: 0.32, tier: 'watch', replicated: false });
    expect(d.trust).toBe('An early moderate pattern — it hasn\'t been re-confirmed on new data yet, so treat it as a lead, not a fact.');
  });

  it('gives any other tier a "probably just noise" sentence', () => {
    const d = describeDriver({ ...base, withinR: 0.15, tier: 'noise' });
    expect(d.trust).toBe('A slight pattern that\'s probably just noise — don\'t act on it yet.');
  });

  it('pluralizes the store-coverage sentence based on locsUsed', () => {
    expect(describeDriver({ ...base, locsUsed: 1 }).coverage).toBe('Seen across 1 store.');
    expect(describeDriver({ ...base, locsUsed: 5 }).coverage).toBe('Seen across 5 stores.');
  });

  it('defaults withinR to 0 (treated as UP, slight strength) when missing', () => {
    const { withinR, ...noR } = base;
    const d = describeDriver(noR);
    expect(d.headline).toContain('go UP');
    expect(d.trust).toContain('slight');
  });
});
