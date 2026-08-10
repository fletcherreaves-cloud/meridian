import { describe, it, expect } from 'vitest';
import { weeklyBuckets, buildSwingFeed, ackKey, partitionAcked, blocking,
         acknowledge, pruneAcks, businessDate, lastClosedBusinessDay, buildAckHistory } from '../engine/swing-feed.js';

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

describe('buildAckHistory', () => {
  const storeName = (loc) => ({ A: 'Ardmore', B: 'Bonifay' }[loc] || loc);

  it('returns nothing when both ack stores are empty', () => {
    expect(buildAckHistory({})).toEqual([]);
  });

  it('merges both sources into one list', () => {
    const swingAcks = { 'A:2026-06-07:crit': { at: '2026-06-08T00:00:00.000Z', by: 'a@x.com' } };
    const attentionAcks = { 'fob-B': { at: '2026-06-09T00:00:00.000Z', by: 'b@x.com' } };
    const rows = buildAckHistory({ swingAcks, attentionAcks, storeName });
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.source).sort()).toEqual(['attention', 'swing']);
  });

  it('sorts most-recent-first', () => {
    const swingAcks = { 'A:2026-06-07:crit': { at: '2026-06-01T00:00:00.000Z' } };
    const attentionAcks = { 'fob-B': { at: '2026-06-15T00:00:00.000Z' } };
    const rows = buildAckHistory({ swingAcks, attentionAcks, storeName });
    expect(rows[0].source).toBe('attention'); // 06-15, newer
    expect(rows[1].source).toBe('swing');     // 06-01, older
  });

  it('enriches a still-live swing ack with its real title, not the parsed fallback', () => {
    const item = { loc: 'A', swing: { to: '2026-06-07' }, severity: 'crit', title: 'Ardmore — 3-week decline' };
    const swingAcks = { [ackKey(item)]: { at: '2026-06-08T00:00:00.000Z', by: 'a@x.com' } };
    const [row] = buildAckHistory({ swingAcks, swingItems: [item], storeName });
    expect(row.what).toBe('Ardmore — 3-week decline');
    expect(row.resolved).toBe(false);
    expect(row.storeName).toBe('Ardmore');
    expect(row.by).toBe('a@x.com');
  });

  it('falls back to a parsed description for a swing ack whose situation is no longer live', () => {
    const swingAcks = { 'A:2026-06-07:crit': { at: '2026-06-08T00:00:00.000Z', by: 'a@x.com' } };
    const [row] = buildAckHistory({ swingAcks, swingItems: [], storeName });
    expect(row.resolved).toBe(true);
    expect(row.storeName).toBe('Ardmore');
    expect(row.severity).toBe('crit');
    expect(row.what).toContain('2026-06-07');
  });

  it('enriches a still-live attention ack with its real title and loc', () => {
    const item = { id: 'fob-B', loc: 'B', severity: 'warn', title: 'Bonifay FOB over target' };
    const attentionAcks = { 'fob-B': { at: '2026-06-09T00:00:00.000Z', by: 'b@x.com' } };
    const [row] = buildAckHistory({ attentionAcks, attentionItems: [item], storeName });
    expect(row.what).toBe('Bonifay FOB over target');
    expect(row.storeName).toBe('Bonifay');
    expect(row.resolved).toBe(false);
  });

  it('falls back to the raw id — never a guessed store — for a resolved attention ack', () => {
    // No live attentionItems passed: the finding has resolved and dropped out of the feed.
    const attentionAcks = { 'fob-B': { at: '2026-06-09T00:00:00.000Z', by: 'b@x.com' } };
    const [row] = buildAckHistory({ attentionAcks, attentionItems: [], storeName });
    expect(row.resolved).toBe(true);
    expect(row.loc).toBeNull();
    expect(row.storeName).toBeNull();
    expect(row.what).toBe('fob-B');
  });
});

describe('the still-open business day is excluded', () => {
  // Found on preview 2026-08-07: the alarm counted TODAY as part of a complete week.
  // Store 10422 had rung $7,359 against a typical closed day of $11,003 — 67% — so the
  // week was judged on ~$3,600 of sales that had not happened yet, and the headline
  // number drifted through the day. An alarm whose number moves while you look at it is
  // an alarm nobody trusts.
  const daily = (loc, n, from) => Array.from({ length: n }, (_, i) => ({
    loc, date: new Date(2026, 7, from + i), sales: 10000, lySales: 10000, gc: 800, lyGc: 800,
  }));

  it('drops rows on the current business date', () => {
    // 14 closed days + today. Today must not form part of a bucket.
    const rows = daily('A', 15, 1);                        // 08-01 .. 08-15
    const b = weeklyBuckets(rows, { now: new Date(2026, 7, 15, 12, 0, 0) });
    expect(b.map(w => w.label)).toEqual(['2026-08-07', '2026-08-14']);
    expect(b.some(w => w.label === '2026-08-15')).toBe(false);
  });

  it('honours the 4am ABC cutover — at 2am the business day is still yesterday', () => {
    expect(businessDate(new Date(2026, 7, 8, 2, 0, 0))).toBe('2026-08-07');
    expect(businessDate(new Date(2026, 7, 8, 5, 0, 0))).toBe('2026-08-08');
  });

  it('lastClosedBusinessDay is the day before businessDate, honouring the same cutover', () => {
    expect(lastClosedBusinessDay(new Date(2026, 7, 8, 5, 0, 0)).toISOString().slice(0, 10)).toBe('2026-08-07');
    // 2am — business day is still 08-07, so the last CLOSED day is 08-06.
    expect(lastClosedBusinessDay(new Date(2026, 7, 8, 2, 0, 0)).toISOString().slice(0, 10)).toBe('2026-08-06');
  });

  it('lastClosedBusinessDay lands on local midnight, so day-arithmetic on it stays exact', () => {
    const d = lastClosedBusinessDay(new Date(2026, 7, 8, 12, 0, 0));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('an explicit asOf is still taken at face value, for replay', () => {
    const rows = daily('A', 15, 1);
    const b = weeklyBuckets(rows, { asOf: new Date(2026, 7, 14) });
    expect(b[b.length - 1].label).toBe('2026-08-14');
  });

  it('buildSwingFeed threads `now` through so the whole feed excludes today', () => {
    const rows = [...daily('A', 14, 1), { loc: 'A', date: new Date(2026, 7, 15), sales: 2000, lySales: 10000, gc: 150, lyGc: 800 }];
    // That partial day is -80%; if it leaked in it would drag the last week hard.
    const feed = buildSwingFeed(rows, { now: new Date(2026, 7, 15, 12, 0, 0), storeName: l => l });
    expect(feed).toEqual([]);                              // flat weeks only — nothing fires
  });
});
