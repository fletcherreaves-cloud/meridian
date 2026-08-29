// Dispatch #209 — detectCountNotifications() unit tests. Synthetic prevStatus/newProgress
// fixtures only (no live data needed), covering every rule combination named in the dispatch:
// both-together, one-then-stale, one-then-other-arrives-before-stale, paper-alone,
// not-started-vs-not-applicable, and the no-refire (fire-once) case.
import { describe, it, expect } from 'vitest';
import { detectCountNotifications, NOTIFY_STALE_HOURS } from '../engine/eom-inventory.js';

// Minimal byClass fixture builder: { total, counted, pct, done } per class, matching
// computeCountProgress()'s real shape. A class omitted entirely means "zero items of that
// class exist for this store" (rule 3's not_applicable case) — never invent a bucket for it.
function progress(byClass) {
  return { byClass };
}
const cls = (total, counted, doneOverride) => {
  const pct = total ? counted / total : 0;
  return { total, counted, pct, done: doneOverride !== undefined ? doneOverride : pct >= 0.98 };
};

const HOUR = 3600 * 1000;
const T0 = new Date('2026-08-29T12:00:00Z');

describe('detectCountNotifications — Rule 1: Food+Condiment pairing', () => {
  it('fires immediately when BOTH complete in the same run (both newly true)', () => {
    const prev = { food_done: false, condiment_done: false, notified_classes: [] };
    const p = progress({
      food: cls(10, 10),
      condiment: cls(6, 6),
      paper: cls(4, 0),
    });
    const r = detectCountNotifications(prev, p, { asOf: T0 });
    expect(r).not.toBeNull();
    expect(r.shouldNotify).toBe(true);
    expect(r.triggerKinds).toEqual(['food_condiment']);
    expect(r.triggerClasses.sort()).toEqual(['condiment', 'food']);
    expect(r.reasons).toEqual(['both_complete']);
  });

  it('one-then-other-arrives-before-stale: fires immediately as both_complete, NOT stale_timeout', () => {
    // Food already done from a prior run (done_at only 30 min ago — well under the 3h stale
    // window); Condiment just flipped true THIS run. Owner's rule: no need to wait for the
    // stale timer once both read complete.
    const prev = {
      food_done: true, food_done_at: new Date(T0.getTime() - 30 * 60 * 1000).toISOString(),
      condiment_done: false, notified_classes: [],
    };
    const p = progress({ food: cls(10, 10), condiment: cls(6, 6), paper: cls(4, 0) });
    const r = detectCountNotifications(prev, p, { asOf: T0 });
    expect(r).not.toBeNull();
    expect(r.triggerKinds).toEqual(['food_condiment']);
    expect(r.reasons).toEqual(['both_complete']);
  });

  it('one done, other still in progress, UNDER the stale window: does not fire', () => {
    const prev = {
      food_done: true, food_done_at: new Date(T0.getTime() - 1 * HOUR).toISOString(),
      condiment_done: false, notified_classes: [],
    };
    const p = progress({ food: cls(10, 10), condiment: cls(6, 3), paper: cls(4, 0) });
    const r = detectCountNotifications(prev, p, { asOf: T0, staleHours: NOTIFY_STALE_HOURS });
    expect(r).toBeNull();
  });

  it('one done, other still in progress, OVER the stale window: fires stale_timeout, showing the stalled class\'s REAL % (not "not started")', () => {
    const prev = {
      food_done: true, food_done_at: new Date(T0.getTime() - 4 * HOUR).toISOString(),
      condiment_done: false, notified_classes: [],
    };
    const p = progress({ food: cls(10, 10), condiment: cls(6, 3), paper: cls(4, 0) });
    const r = detectCountNotifications(prev, p, { asOf: T0, staleHours: 3 });
    expect(r).not.toBeNull();
    expect(r.triggerKinds).toEqual(['food_condiment']);
    expect(r.reasons).toEqual(['stale_timeout']);
    expect(r.triggerClasses).toEqual(['food']); // the done one — that's what actually triggered
    expect(r.classStatuses.condiment.status).toBe('in_progress');
    expect(r.classStatuses.condiment.pct).toBeCloseTo(0.5);
  });

  it('exactly at the stale boundary (not strictly over) does not fire', () => {
    const prev = {
      food_done: true, food_done_at: new Date(T0.getTime() - 3 * HOUR).toISOString(),
      condiment_done: false, notified_classes: [],
    };
    const p = progress({ food: cls(10, 10), condiment: cls(6, 3), paper: cls(4, 0) });
    const r = detectCountNotifications(prev, p, { asOf: T0, staleHours: 3 });
    expect(r).toBeNull();
  });

  it('neither food nor condiment done: never fires the pairing', () => {
    const prev = { food_done: false, condiment_done: false, notified_classes: [] };
    const p = progress({ food: cls(10, 2), condiment: cls(6, 0), paper: cls(4, 0) });
    const r = detectCountNotifications(prev, p, { asOf: T0 });
    expect(r).toBeNull();
  });
});

describe('detectCountNotifications — Rule 2: Paper independent trigger', () => {
  it('paper-alone: fires the moment Paper completes, and the payload includes Food/Condiment/Non-Product current status too', () => {
    const prev = { paper_done: false, notified_classes: [] };
    const p = progress({
      food: cls(10, 4),        // in progress
      condiment: cls(6, 0),    // not started
      paper: cls(8, 8),        // just completed
      nonproduct: cls(5, 0),   // not started
    });
    const r = detectCountNotifications(prev, p, { asOf: T0 });
    expect(r).not.toBeNull();
    expect(r.triggerKinds).toEqual(['paper']);
    expect(r.triggerClasses).toEqual(['paper']);
    // Rule 2: every class's CURRENT status is in the payload, not just Paper's.
    expect(r.classStatuses.food.status).toBe('in_progress');
    expect(r.classStatuses.condiment.status).toBe('not_started');
    expect(r.classStatuses.paper.status).toBe('complete');
    expect(r.classStatuses.nonproduct.status).toBe('not_started');
  });

  it('paper completing does not require food/condiment to be done, and fires independently of the pairing state', () => {
    const prev = { paper_done: false, food_done: false, condiment_done: false, notified_classes: [] };
    const p = progress({ food: cls(10, 0), condiment: cls(6, 0), paper: cls(8, 8) });
    const r = detectCountNotifications(prev, p, { asOf: T0 });
    expect(r.triggerKinds).toEqual(['paper']);
  });
});

describe('detectCountNotifications — Rule 3: not_started vs not_applicable vs in_progress vs complete', () => {
  it('a class entirely absent from byClass (zero items in the catalog) is not_applicable, never a fake 0%', () => {
    const prev = { paper_done: false, notified_classes: [] };
    // No `nonproduct` key at all — this store's catalog has zero Non-Product items.
    const p = progress({ food: cls(10, 10), condiment: cls(6, 6), paper: cls(4, 4) });
    const r = detectCountNotifications(prev, p, { asOf: T0 });
    expect(r.classStatuses.nonproduct).toEqual({ status: 'not_applicable', pct: null, total: 0, counted: 0 });
  });

  it('a touched-but-unfinished class is in_progress with its real pct, distinct from not_started', () => {
    const prev = { notified_classes: [] };
    const p = progress({
      food: cls(10, 0),   // not started — real items, zero counted
      condiment: cls(8, 3), // in progress — some counted, not done
      paper: cls(4, 4),     // complete — triggers
    });
    const r = detectCountNotifications(prev, p, { asOf: T0 });
    expect(r.classStatuses.food).toEqual({ status: 'not_started', pct: 0, total: 10, counted: 0 });
    expect(r.classStatuses.condiment.status).toBe('in_progress');
    expect(r.classStatuses.condiment.pct).toBeCloseTo(0.375);
    expect(r.classStatuses.condiment.total).toBe(8);
    expect(r.classStatuses.condiment.counted).toBe(3);
  });

  it('only ONE class is ever touched (rule 3): the untouched class reports not_started, never blank/missing', () => {
    // Store only touches Food today — Condiment/Paper/Non-Product buckets don't even exist yet
    // in this run's byClass (nothing counted, nothing scanned) EXCEPT they still have catalog
    // items (total>0, counted=0) so they must read not_started, not not_applicable.
    const prev = { food_done: false, condiment_done: false, notified_classes: [] };
    const p = progress({
      food: cls(10, 10),      // completes — but alone, pairing waits (see below)
      condiment: cls(6, 0),   // real items, untouched
      paper: cls(4, 0),
      nonproduct: cls(3, 0),
    });
    const r = detectCountNotifications(prev, p, { asOf: T0 });
    // Food alone completing does not fire the pairing trigger immediately (waits for stale).
    expect(r).toBeNull();
    // But once the stale timer elapses, the same fixture's classStatuses must show condiment as
    // not_started (real items, zero counted), not "missing".
    const prevStale = { food_done: true, food_done_at: new Date(T0.getTime() - 4 * HOUR).toISOString(), condiment_done: false, notified_classes: [] };
    const r2 = detectCountNotifications(prevStale, p, { asOf: T0, staleHours: 3 });
    expect(r2).not.toBeNull();
    expect(r2.classStatuses.condiment).toEqual({ status: 'not_started', pct: 0, total: 6, counted: 0 });
    expect(r2.classStatuses.paper).toEqual({ status: 'not_started', pct: 0, total: 4, counted: 0 });
  });
});

describe('detectCountNotifications — fire-once (no re-fire for the same transition)', () => {
  it('running detection twice against the same both-complete transition does not fire twice', () => {
    const prev1 = { food_done: false, condiment_done: false, notified_classes: [] };
    const p = progress({ food: cls(10, 10), condiment: cls(6, 6), paper: cls(4, 0) });
    const r1 = detectCountNotifications(prev1, p, { asOf: T0 });
    expect(r1).not.toBeNull();

    // Simulate the caller persisting the fire-once marker after r1 fires (Task 2/3's contract).
    const prev2 = {
      food_done: true, condiment_done: true,
      food_done_at: T0.toISOString(), condiment_done_at: T0.toISOString(),
      notified_classes: r1.triggerKinds, // ['food_condiment']
    };
    const r2 = detectCountNotifications(prev2, p, { asOf: new Date(T0.getTime() + HOUR) });
    expect(r2).toBeNull();
  });

  it('running detection twice against the same paper-complete transition does not fire twice', () => {
    const prev1 = { paper_done: false, notified_classes: [] };
    const p = progress({ paper: cls(8, 8), food: cls(1, 0), condiment: cls(1, 0) });
    const r1 = detectCountNotifications(prev1, p, { asOf: T0 });
    expect(r1.triggerKinds).toEqual(['paper']);

    const prev2 = { paper_done: true, paper_done_at: T0.toISOString(), notified_classes: ['paper'] };
    const r2 = detectCountNotifications(prev2, p, { asOf: new Date(T0.getTime() + 30 * 24 * HOUR) });
    expect(r2).toBeNull(); // stays null for the rest of the month even though paper.done stays true
  });

  it('a stale-timeout notification also fire-once guards, even on a later still-stalled run', () => {
    const prev1 = { food_done: true, food_done_at: new Date(T0.getTime() - 4 * HOUR).toISOString(), condiment_done: false, notified_classes: [] };
    const p = progress({ food: cls(10, 10), condiment: cls(6, 3), paper: cls(1, 0) });
    const r1 = detectCountNotifications(prev1, p, { asOf: T0, staleHours: 3 });
    expect(r1.reasons).toEqual(['stale_timeout']);

    const prev2 = { ...prev1, notified_classes: r1.triggerKinds };
    const r2 = detectCountNotifications(prev2, p, { asOf: new Date(T0.getTime() + 2 * HOUR), staleHours: 3 });
    expect(r2).toBeNull();
  });

  it('one trigger already fired does not block the OTHER, independent trigger from firing', () => {
    const prev = {
      food_done: true, condiment_done: true, notified_classes: ['food_condiment'], // already notified
      paper_done: false,
    };
    const p = progress({ food: cls(10, 10), condiment: cls(6, 6), paper: cls(4, 4) }); // paper just completed
    const r = detectCountNotifications(prev, p, { asOf: T0 });
    expect(r).not.toBeNull();
    expect(r.triggerKinds).toEqual(['paper']);
  });
});

describe('detectCountNotifications — both triggers satisfied in the same run', () => {
  it('merges into a single notification event covering both trigger kinds (never silently drops one)', () => {
    const prev = { food_done: false, condiment_done: false, paper_done: false, notified_classes: [] };
    const p = progress({ food: cls(10, 10), condiment: cls(6, 6), paper: cls(4, 4), nonproduct: cls(2, 0) });
    const r = detectCountNotifications(prev, p, { asOf: T0 });
    expect(r.triggerKinds.sort()).toEqual(['food_condiment', 'paper']);
    expect(r.triggerClasses.sort()).toEqual(['condiment', 'food', 'paper']);
  });
});

describe('detectCountNotifications — no-op cases', () => {
  it('returns null when nothing is complete and nothing is stale', () => {
    const prev = { notified_classes: [] };
    const p = progress({ food: cls(10, 1), condiment: cls(6, 0), paper: cls(4, 0) });
    expect(detectCountNotifications(prev, p, { asOf: T0 })).toBeNull();
  });

  it('handles a missing/undefined prevStatus gracefully (first-ever run for a store)', () => {
    const p = progress({ food: cls(10, 10), condiment: cls(6, 6) });
    const r = detectCountNotifications(undefined, p, { asOf: T0 });
    expect(r.triggerKinds).toEqual(['food_condiment']);
  });
});
