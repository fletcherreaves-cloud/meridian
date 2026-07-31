import { describe, it, expect } from 'vitest';
import { eventTs, tmMin, recountBatchTiming, recountTimingSentence } from '../engine/eom-recount-forensics.js';

const base = Date.parse('2026-07-03T00:00:00');
const at = (h, m, s = 0) => base + ((h * 60 + m) * 60 + s) * 1000;

describe('eventTs / tmMin', () => {
  it('parses H:MM AM/PM into a full timestamp', () => {
    expect(tmMin('8:15 AM')).toBe(8 * 60 + 15);
    expect(tmMin('1:05 PM')).toBe(13 * 60 + 5);
    expect(eventTs('2026-07-03', '8:15 AM')).toBe(at(8, 15));
  });
});

describe('recountBatchTiming (padding detection)', () => {
  it('flags IMPLAUSIBLE when 14 offsetting corrections land in a few minutes', () => {
    // Originals all ~8:00, corrections rattled off 8s apart → ~2 min total. Physically impossible to
    // have walked + recounted 14 scattered items.
    const swings = Array.from({ length: 14 }, (_, i) => ({ wrin: String(i), origTs: at(8, 0), corrTs: at(8, 0, i * 8) }));
    const t = recountBatchTiming(swings);
    expect(t.verdict).toBe('implausible');
    expect(t.plausible).toBe(false);
    expect(t.requiredSec).toBe(60 + 14 * 120);  // ~29 min floor
    expect(t.shortfallSec).toBeGreaterThan(1500);
    expect(recountTimingSentence(t)).toMatch(/doesn't support an actual walk-and-recount/);
  });

  it('does NOT flag when corrections are spread over a real recount window (item-by-item)', () => {
    const swings = Array.from({ length: 14 }, (_, i) => ({ wrin: String(i), origTs: at(8, 0), corrTs: at(8, 0, i * 180) })); // 3 min apart → 39 min
    const t = recountBatchTiming(swings);
    expect(t.verdict).toBe('plausible');
  });

  it('does NOT flag pen-and-paper: long gap after originals, then batch entry', () => {
    // Walked + recorded 8:00–8:45, then entered all corrections in a tight 8:45 cluster.
    const swings = Array.from({ length: 14 }, (_, i) => ({ wrin: String(i), origTs: at(8, 0), corrTs: at(8, 45, i * 4) }));
    const t = recountBatchTiming(swings);
    expect(t.verdict).toBe('plausible');   // 45 min window ≥ ~29 min floor
  });

  it('is silent below the minimum batch size (needs a pattern, not one item)', () => {
    const t = recountBatchTiming([{ wrin: '1', origTs: at(8, 0), corrTs: at(8, 0, 5) }]);
    expect(t.verdict).toBe('insufficient');
    expect(t.plausible).toBe(true);
    expect(recountTimingSentence(t)).toBe('');
  });
});
