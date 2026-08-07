import { describe, it, expect } from 'vitest';
import { weeklyBuckets, buildSwingFeed, ackKey, partitionAcked, blocking,
         acknowledge, pruneAcks } from '../engine/swing-feed.js';

const day = (i) => new Date(2026, 5, 1 + i);          // 2026-06-01 + i
/** n days of rows for one store at a given vs-LY ratio. */
const rows = (loc, n, ratio, from = 0) =>
  Array.from({ length: n }, (_, i) => ({
    loc, date: day(from + i),
    sales: 10000 * ratio, lySales: 10000,
    gc: 800 * ratio, lyGc: 800,
  }));

describe('weeklyBuckets', () => {
  it('buckets into complete weeks, oldest first', () => {
    const b = weeklyBuckets(rows('A', 21, 1));
    expect(b).toHaveLength(3);
    expect(b[0].label < b[2].label).toBe(true);
    expect(b[0].cur).toBe(70000);
  });

  it('DROPS an incomplete trailing week', () => {
    // A partial current week reads as a collapse every single time. An alarm that fires
    // every Monday is an alarm nobody reads.
    const b = weeklyBuckets(rows('A', 17, 1));
    expect(b).toHaveLength(2);
    expect(b.every(w => w.cur === 70000)).toBe(true);
  });

  it('carries guest counts through for the diagnosis', () => {
    const b = weeklyBuckets(rows('A', 7, 1));
    expect(b[0].curGuests).toBe(5600);
    expect(b[0].baseGuests).toBe(5600);
  });

  it('honours asOf so history can be replayed', () => {
    const b = weeklyBuckets(rows('A', 28, 1), { asOf: day(13) });
    expect(b).toHaveLength(2);
  });

  it('is safe on empty input', () => {
    expect(weeklyBuckets([])).toEqual([]);
    expect(weeklyBuckets()).toEqual([]);
  });
});

describe('buildSwingFeed', () => {
  const feed = () => buildSwingFeed([
    ...rows('SICK', 14, 1.0),  ...rows('SICK', 14, 0.78, 14),   // -22% for two weeks
    ...rows('MILD', 14, 1.0),  ...rows('MILD', 14, 0.91, 14),   // -9%  for two weeks
    ...rows('WELL', 28, 1.0),                                    // flat
  ], { storeName: (l) => l });

  it('raises the collapsing store as critical and the mild one as a watch', () => {
    const f = feed();
    expect(f.find(i => i.loc === 'SICK').severity).toBe('crit');
    expect(f.find(i => i.loc === 'MILD').severity).toBe('warn');
  });

  it('says nothing about the healthy store', () => {
    expect(feed().find(i => i.loc === 'WELL')).toBeUndefined();
  });

  it('orders worst first', () => {
    expect(feed()[0].loc).toBe('SICK');
  });

  it('only the critical one demands acknowledgement', () => {
    const f = feed();
    expect(f.find(i => i.loc === 'SICK').requiresAck).toBe(true);
    expect(f.find(i => i.loc === 'MILD').requiresAck).toBe(false);
  });

  it('skips a store with too little history to judge a run', () => {
    expect(buildSwingFeed(rows('NEW', 7, 0.5))).toEqual([]);
  });

  it('is safe on empty input', () => {
    expect(buildSwingFeed([])).toEqual([]);
    expect(buildSwingFeed()).toEqual([]);
  });
});

describe('acknowledgement', () => {
  const item = (loc, to, severity = 'crit') =>
    ({ loc, severity, requiresAck: severity === 'crit', swing: { to } });

  it('an ack silences that specific situation', () => {
    const i = item('10422', '2026-08-07');
    const acks = acknowledge({}, i);
    expect(partitionAcked([i], acks).pending).toHaveLength(0);
    expect(blocking([i], acks)).toHaveLength(0);
  });

  // The rule that makes the alarm trustworthy.
  it('does NOT silence the following week — the situation changed', () => {
    const acks = acknowledge({}, item('10422', '2026-08-07'));
    const next = item('10422', '2026-08-14');
    expect(blocking([next], acks)).toHaveLength(1);
  });

  it('does NOT silence an escalation from watch to critical', () => {
    const acks = acknowledge({}, item('10422', '2026-08-07', 'warn'));
    const worse = item('10422', '2026-08-07', 'crit');
    expect(blocking([worse], acks)).toHaveLength(1);
  });

  it('does not silence a different store', () => {
    const acks = acknowledge({}, item('10422', '2026-08-07'));
    expect(blocking([item('35242', '2026-08-07')], acks)).toHaveLength(1);
  });

  it('only critical items block', () => {
    expect(blocking([item('A', 'x', 'warn')], {})).toHaveLength(0);
    expect(blocking([item('A', 'x', 'crit')], {})).toHaveLength(1);
  });

  it('records when and by whom', () => {
    const acks = acknowledge({}, item('A', 'x'), 'fletcher');
    const v = acks[ackKey(item('A', 'x'))];
    expect(v.by).toBe('fletcher');
    expect(Date.parse(v.at)).toBeGreaterThan(0);
  });

  it('never mutates the object it is given', () => {
    const before = {};
    acknowledge(before, item('A', 'x'));
    expect(before).toEqual({});
  });

  it('is a no-op for a null item rather than writing a junk key', () => {
    expect(acknowledge({ a: 1 }, null)).toEqual({ a: 1 });
  });
});

describe('pruneAcks', () => {
  it('keeps acks for situations that are still live', () => {
    const i = { loc: 'A', severity: 'crit', swing: { to: 'x' } };
    const acks = acknowledge({}, i);
    expect(Object.keys(pruneAcks(acks, [i]))).toHaveLength(1);
  });

  it('drops stale acks for situations that are gone', () => {
    const old = { 'A:x:crit': { at: new Date(Date.now() - 200 * 864e5).toISOString() } };
    expect(pruneAcks(old, [])).toEqual({});
  });

  it('keeps recent acks even when not currently live, to avoid re-alarming on a blip', () => {
    const recent = { 'A:x:crit': { at: new Date().toISOString() } };
    expect(Object.keys(pruneAcks(recent, []))).toHaveLength(1);
  });
});
