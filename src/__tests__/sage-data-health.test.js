// @ts-nocheck
// Task #74 -- pure logic for the new query_data_health SAGE tool. Imports
// supabase/functions/sage-chat/data-health.js directly, the same plain-JS module index.ts's
// query_data_health tool calls to build its JSON.stringify'd tool result. No Deno test
// infrastructure exists in this repo to boot the edge function itself, so this is the closest
// thing to the real call site -- same precedent as sage-labor-summary-agg.test.js /
// sage-forecast-snapshots-agg.test.js.
import { describe, it, expect } from 'vitest';
import { streamRegistryEntries, classifyStream, summarizeDataHealth, DATA_HEALTH_NOTE } from '../../supabase/functions/sage-chat/data-health.js';
import { STREAMS } from '../engine/stream-freshness.js';
import { PULL_REGISTRY } from '../../scripts/lib/scheduled-pull-registry.mjs';

const day = n => new Date(2026, 8, n, 12).toISOString().slice(0, 10); // Sept n 2026

describe('streamRegistryEntries', () => {
  it('joins every real STREAMS entry with its PULL_REGISTRY match, by key', () => {
    const entries = streamRegistryEntries();
    // Same roster this session's Task #70 coverage audit left STREAMS/PULL_REGISTRY in lockstep
    // on -- both real, live modules, not a fixture, so a drift in either would show up here too.
    expect(entries.length).toBe(STREAMS.length);
    const dar = entries.find(e => e.key === 'dar');
    expect(dar).toMatchObject({ label: 'DAR (QSRSoft daily activity)', cadenceDays: 1, table: 'qsr_daily_activity_rollup', dateCol: 'dt' });
    // A month-keyed stream (Task #70's own coverage addition) carries its real dateCol, not a
    // daily 'date' -- the whole reason those 6 streams need cadenceDays:31, not 1.
    const roster = entries.find(e => e.key === 'rosterStats');
    expect(roster).toMatchObject({ cadenceDays: 31, table: 'roster_statistics', dateCol: 'period_month' });
  });

  it('every entry has a real table+dateCol (no silent gaps in the live registries)', () => {
    for (const e of streamRegistryEntries()) {
      expect(typeof e.table).toBe('string');
      expect(typeof e.dateCol).toBe('string');
      expect(PULL_REGISTRY[e.key]).toBeTruthy();
    }
  });
});

describe('classifyStream', () => {
  const dailyEntry = { key: 'fob', label: 'FOB', cadenceDays: 1 };
  const monthlyEntry = { key: 'rosterStats', label: 'Roster Statistics', cadenceDays: 31 };

  it('a daily stream fresh as of today is ok', () => {
    const r = classifyStream(dailyEntry, day(16), new Date(2026, 8, 16, 12));
    expect(r).toMatchObject({ key: 'fob', label: 'FOB', latest_date: day(16), stale_days: 0, severity: 'ok' });
  });

  it('a daily stream 3 days stale is warn (cadence 1 + WARN_GRACE_DAYS 1 = threshold 2)', () => {
    const r = classifyStream(dailyEntry, day(13), new Date(2026, 8, 16, 12)); // 3 days old
    expect(r.stale_days).toBe(3);
    expect(r.severity).toBe('warn');
  });

  it('a daily stream 5 days stale is crit (cadence 1 + CRIT_GRACE_DAYS 3 = threshold 4)', () => {
    const r = classifyStream(dailyEntry, day(11), new Date(2026, 8, 16, 12)); // 5 days old
    expect(r.stale_days).toBe(5);
    expect(r.severity).toBe('crit');
  });

  it('THE BUG THIS PREVENTS: a month-keyed stream at 15 days old is ok, not a false alarm', () => {
    // Same trap dispatch/Task #70 found -- a daily-cadence threshold against a value that only
    // changes once a month would false-alarm every day after the month's first ~4 days, even on
    // a fully healthy pull. This tool must inherit that fix, not just the panel.
    const r = classifyStream(monthlyEntry, '2026-09-01', new Date(2026, 8, 16, 12));
    expect(r.stale_days).toBe(15);
    expect(r.severity).toBe('ok');
  });

  it('a month-keyed stream frozen over a month ago IS flagged crit, not masked by the coarser threshold', () => {
    const r = classifyStream(monthlyEntry, '2026-07-01', new Date(2026, 8, 16, 12));
    expect(r.severity).toBe('crit');
  });

  it('no row found at all (null latest date) reads as crit, never a silent ok', () => {
    const r = classifyStream(dailyEntry, null, new Date(2026, 8, 16, 12));
    expect(r.stale_days).toBeNull();
    expect(r.latest_date).toBeNull();
    expect(r.severity).toBe('crit');
  });

  it('a future-dated value (LifeLenz-style forward schedule) cannot read as fresher than it is', () => {
    const r = classifyStream({ key: 'lifelenz', label: 'LifeLenz', cadenceDays: 1 }, day(30), new Date(2026, 8, 16, 12));
    // day(30) is Sept 30, after the Sept 16 "now" -- treated as unusable, not a fresh read.
    expect(r.latest_date).toBeNull();
    expect(r.severity).toBe('crit');
  });
});

describe('summarizeDataHealth', () => {
  it('surfaces the single worst (most stale) stream among several behind', () => {
    const classified = [
      { key: 'a', label: 'A', latest_date: day(15), stale_days: 1, severity: 'ok' },
      { key: 'b', label: 'B', latest_date: day(10), stale_days: 6, severity: 'crit' },
      { key: 'c', label: 'C', latest_date: day(13), stale_days: 3, severity: 'warn' },
    ];
    const out = summarizeDataHealth(classified, new Date(2026, 8, 16, 12));
    expect(out.worst_stream.key).toBe('b');
    expect(out.streams).toBe(classified);
    expect(out.note).toBe(DATA_HEALTH_NOTE);
    expect(out.checked_at).toBe(new Date(2026, 8, 16, 12).toISOString());
  });

  it('worst_stream is null when every stream is ok', () => {
    const classified = [
      { key: 'a', label: 'A', latest_date: day(16), stale_days: 0, severity: 'ok' },
      { key: 'b', label: 'B', latest_date: day(16), stale_days: 0, severity: 'ok' },
    ];
    expect(summarizeDataHealth(classified).worst_stream).toBeNull();
  });
});
