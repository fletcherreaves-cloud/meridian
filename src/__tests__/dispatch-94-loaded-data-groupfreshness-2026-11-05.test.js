// @ts-nocheck
// Task #94 (2026-11-05, owner-flagged): At-A-Glance's "Loaded Data" strip hand-unioned 5
// hardcoded ds arrays into 5 fixed buckets -- missing ~15 of the real ~24 automated streams
// entirely, and letting one fresh sibling mask a dead stream within the same bucket (the exact
// #171 pooling bug stream-freshness.js's own per-stream check already exists to prevent, just
// reintroduced one layer up). Added `group` tags to every STREAMS entry and a new
// groupFreshness(ds, asOf) that drives the strip off the SAME canonical registry Data Manager's
// own table and the Action Checklist's worstStream() banner already read.
import { describe, it, expect } from 'vitest';
import { STREAMS, GROUPS, groupFreshness } from '../engine/stream-freshness.js';

describe('stream-freshness.js STREAMS groups (task #94)', () => {
  it('every STREAMS entry declares a real group -- none left ungrouped (invisible to the strip)', () => {
    const groupIds = new Set(GROUPS.map(g => g.key));
    for (const s of STREAMS) {
      expect(s.group, `${s.key} has no group`).toBeTruthy();
      expect(groupIds.has(s.group), `${s.key}'s group '${s.group}' is not a real GROUPS id`).toBe(true);
    }
  });
});

describe('groupFreshness (task #94)', () => {
  const D = (daysAgo) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(12, 0, 0, 0); return d; };

  it('omits a group with no loaded stream this session', () => {
    const out = groupFreshness({});
    expect(out).toEqual([]);
  });

  it('a stale stream\'s severity survives even when grouped with a fresh sibling (the #171 fix, one layer up)', () => {
    // 'sales' group members include dar (qsrActSummaryRows) and salesLedger (salesLedgerRows).
    // dar fresh (today), salesLedger dead (10 days old, past crit) -- the old hand-union would
    // have shown the fresh dar date and hidden the dead salesLedger entirely.
    const ds = {
      qsrActSummaryRows: [{ loc: '3708', date: D(0) }],
      salesLedgerRows: [{ loc: '3708', date: D(10) }],
    };
    const sales = groupFreshness(ds).find(g => g.group === 'sales');
    expect(sales, 'sales group missing from output').toBeTruthy();
    expect(sales.worstSeverity).toBe('crit'); // salesLedger's own staleness, not masked by dar
    expect(sales.maxDate.getTime()).toBe(D(0).getTime()); // union date range still shows the real freshest date
  });

  it('aggregates rowCount and storeCount across every loaded stream in the group', () => {
    const ds = {
      qsrActSummaryRows: [{ loc: '3708', date: D(0) }, { loc: '3708', date: D(1) }],
      salesLedgerRows: [{ loc: '0005183', date: D(0) }], // zero-padded loc must not double-count 5183
    };
    const sales = groupFreshness(ds).find(g => g.group === 'sales');
    expect(sales.rowCount).toBe(3);
    expect(sales.storeCount).toBe(2); // 3708 and 5183, zero-padding normalized
  });

  it('a genuinely new group ("people") is covered -- the old strip had no bucket for it at all', () => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const ds = { rosterStatsRows: [{ loc: '3708', month: thisMonth }] };
    const people = groupFreshness(ds).find(g => g.group === 'people');
    expect(people, 'people group missing -- these streams were invisible in the old 5-bucket strip').toBeTruthy();
    expect(people.worstSeverity).toBe('ok');
  });

  it('all-ok group reports worstSeverity "ok"', () => {
    const ds = { qsrActSummaryRows: [{ loc: '3708', date: D(0) }] };
    const sales = groupFreshness(ds).find(g => g.group === 'sales');
    expect(sales.worstSeverity).toBe('ok');
  });
});
