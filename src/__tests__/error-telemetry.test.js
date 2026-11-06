// @ts-nocheck
// Error telemetry fingerprint helpers (memory/plan-error-telemetry-auto-fix-2026-11-06.md,
// task #103, Phase 1). Pure-function coverage for engine/error-telemetry.js -- the dedup key
// behind reportRuntimeError() (src/lib/supabase.js), exercised directly through its real
// mocked-Supabase write path in dispatch-runtime-error-reports-2026-11-06.test.js.
import { describe, it, expect } from 'vitest';
import { topStackFrame, computeErrorFingerprint } from '../engine/error-telemetry.js';

describe('topStackFrame', () => {
  it('returns "" for no stack', () => {
    expect(topStackFrame(null)).toBe('');
    expect(topStackFrame(undefined)).toBe('');
    expect(topStackFrame('')).toBe('');
  });

  it('picks the first real "at ..." call-site line, skipping the "Error: message" header line', () => {
    const stack = 'TypeError: t.dkEnd.localeCompare is not a function\n    at sortRecentEvents (store-analytics.js:142:18)\n    at StoreAnalyticsPanel (store-analytics.js:980:5)';
    expect(topStackFrame(stack)).toBe('at sortRecentEvents (store-analytics.js');
  });

  it('strips the trailing :line:col so a rebuild with shifted line numbers does not change the result', () => {
    const a = 'Error: boom\n    at render (chunk-ABC123.js:1:4521)';
    const b = 'Error: boom\n    at render (chunk-ABC123.js:1:9999)'; // same file, different column -- simulates a rebuild
    expect(topStackFrame(a)).toBe(topStackFrame(b));
  });

  it('falls back to the second line (no "at " prefix found) rather than throwing', () => {
    expect(topStackFrame('Error: boom\nsome-weird-frame-shape')).toBe('some-weird-frame-shape');
  });

  it('falls back to the first line when there is only one', () => {
    expect(topStackFrame('just one line, no at-prefix')).toBe('just one line, no at-prefix');
  });
});

describe('computeErrorFingerprint', () => {
  it('is deterministic -- the same (message, stack, panel) always hashes the same', () => {
    const input = { message: 'undefined is not an object', stack: 'Error: x\n    at f (a.js:1:1)', panel: 'store-dash' };
    expect(computeErrorFingerprint(input)).toBe(computeErrorFingerprint({ ...input }));
  });

  it('is STABLE across a rebuild that only shifts line/column numbers in the stack', () => {
    const before = computeErrorFingerprint({ message: 'boom', stack: 'Error: boom\n    at f (chunk-A1B2.js:10:5)', panel: 'sage' });
    const after  = computeErrorFingerprint({ message: 'boom', stack: 'Error: boom\n    at f (chunk-A1B2.js:10:9999)', panel: 'sage' });
    expect(before).toBe(after);
  });

  it('differs when the message differs', () => {
    const base = { stack: 'Error: x\n    at f (a.js:1:1)', panel: 'sage' };
    expect(computeErrorFingerprint({ ...base, message: 'bug A' }))
      .not.toBe(computeErrorFingerprint({ ...base, message: 'bug B' }));
  });

  it('differs when the panel differs -- same error, different panel is a different fingerprint', () => {
    const base = { message: 'boom', stack: 'Error: boom\n    at f (a.js:1:1)' };
    expect(computeErrorFingerprint({ ...base, panel: 'store-dash' }))
      .not.toBe(computeErrorFingerprint({ ...base, panel: 'sage' }));
  });

  it('differs when the top stack frame differs', () => {
    const base = { message: 'boom', panel: 'sage' };
    expect(computeErrorFingerprint({ ...base, stack: 'Error: boom\n    at f (a.js:1:1)' }))
      .not.toBe(computeErrorFingerprint({ ...base, stack: 'Error: boom\n    at g (b.js:1:1)' }));
  });

  it('handles missing fields without throwing', () => {
    expect(() => computeErrorFingerprint({})).not.toThrow();
    expect(() => computeErrorFingerprint()).not.toThrow();
    expect(typeof computeErrorFingerprint({})).toBe('string');
  });
});
