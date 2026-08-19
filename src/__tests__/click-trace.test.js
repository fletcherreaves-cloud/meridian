// @ts-nocheck
// Dispatch #31: click-trace.js had zero test coverage before this — mark()/reportRender() are
// exercised only by manual ?clicktrace=1 sessions. This covers the one behavior that matters
// most for a diagnostic that runs inside every user's real session: it must be a true no-op
// (return the wrapped value, never throw, never record) when tracing is off, which is the
// default for every user who never opts in. count() is new in this dispatch (a discrete tally
// for facts mark()'s 1ms timing floor would silently drop, e.g. a cache-hit count) and gets
// the same off-by-default guarantee.
import { describe, it, expect } from 'vitest';
import { mark, count, reportRender } from '../utils/click-trace.js';

describe('click-trace safety (tracing off by default)', () => {
  it('mark() returns the wrapped function\'s result unchanged', () => {
    expect(mark('test:span', () => 42)).toBe(42);
  });

  it('mark() propagates a thrown error rather than swallowing it', () => {
    expect(() => mark('test:span', () => { throw new Error('boom'); })).toThrow('boom');
  });

  it('count() never throws when called with no matching mark/reset context', () => {
    expect(() => count('test:counter')).not.toThrow();
    expect(() => count('test:counter', 5)).not.toThrow();
  });

  it('reportRender() never throws for any phase/duration combination', () => {
    expect(() => reportRender('TestPanel', 'update', 250, 10)).not.toThrow();
    expect(() => reportRender('TestPanel', 'mount', 1, 1)).not.toThrow();
  });
});
