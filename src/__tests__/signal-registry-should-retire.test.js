// @ts-nocheck
// signal-registry.js's shouldRetire had zero direct test coverage despite being live: called
// from src/views/signals.js to propose graveyarding a custom signal whose correlation has gone
// consistently weak (n>=50, |r|<0.15 for the 3 most recent history entries).
import { describe, it, expect } from 'vitest';
import { shouldRetire } from '../engine/signal-registry.js';

const hist = rs => rs.map(r => ({ r }));

describe('shouldRetire', () => {
  it('requires at least 50 observations', () => {
    expect(shouldRetire({ history: hist([0.1, 0.1, 0.1]) }, 0.1, 49)).toBe(false);
    expect(shouldRetire({ history: hist([0.1, 0.1, 0.1]) }, 0.1, null)).toBe(false);
  });

  it('never proposes retiring a signal whose CURRENT correlation is still meaningful (|r| >= 0.15)', () => {
    expect(shouldRetire({ history: hist([0.1, 0.1, 0.1]) }, 0.2, 50)).toBe(false);
    expect(shouldRetire({ history: hist([0.1, 0.1, 0.1]) }, -0.2, 50)).toBe(false);
  });

  it('requires at least 3 history entries', () => {
    expect(shouldRetire({ history: [] }, 0.1, 50)).toBe(false);
    expect(shouldRetire({ history: hist([0.1, 0.1]) }, 0.1, 50)).toBe(false);
  });

  it('proposes retirement when the current r and the last 3 history entries are all weak', () => {
    expect(shouldRetire({ history: hist([0.1, 0.1, 0.1]) }, 0.1, 50)).toBe(true);
  });

  it('does not propose retirement if any of the last 3 history entries is still strong', () => {
    expect(shouldRetire({ history: hist([0.1, 0.1, 0.2]) }, 0.1, 50)).toBe(false);
  });

  it('only looks at the LAST 3 history entries, ignoring older ones', () => {
    // An older strong entry (0.5) should not block retirement once it has aged out of the window.
    expect(shouldRetire({ history: hist([0.5, 0.1, 0.1, 0.1]) }, 0.1, 50)).toBe(true);
  });

  it('treats a missing/null r (current or historical) as 0, not as disqualifying', () => {
    expect(shouldRetire({ history: hist([null, 0.1, 0.1]) }, null, 50)).toBe(true);
  });
});
