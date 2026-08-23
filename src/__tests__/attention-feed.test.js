import { describe, it, expect, vi } from 'vitest';
import { fobOutliers, salesBehindLY, staleData, slowDT, visitRisk, signalDecay, rankAttention, buildAttentionFeed, SEV, fobOverTarget, countExceptions, integrityFlags, mergeWorstSalesLY, findingsToFeedItems, groupAttentionByStore, opportunityAlerts } from '../engine/attention-feed.js';

const nm = (l) => 'Store' + l;

describe('opportunityAlerts — Opportunity $ cross-domain detector', () => {
  const perStore = [
    { loc: '1', labor$: 3000, food$: 500, gc$: 200, total$: 3700 },
    { loc: '2', labor$: 100, food$: 50, gc$: 0, total$: 150 },   // below minTotal — skipped
    { loc: '3', labor$: 0, food$: 0, gc$: 0, total$: 0 },        // floored at $0 — never flagged
  ];

  it('flags stores at/above minTotal, naming the biggest driver', () => {
    const out = opportunityAlerts(perStore, nm, { minTotal: 1500 });
    expect(out).toHaveLength(1);
    expect(out[0].loc).toBe('1');
    expect(out[0].dollars).toBe(3700);
    expect(out[0].detail).toContain('Labor'); // labor$ is the biggest of the three pillars
    expect(out[0].nav).toBe('opportunity-dollars');
  });

  it('never flags a $0 (beat-target) store, even with minTotal at 0', () => {
    const out = opportunityAlerts(perStore, nm, { minTotal: 0 });
    expect(out.some(o => o.loc === '3')).toBe(false);
  });

  it('escalates severity for a much larger gap', () => {
    const small = opportunityAlerts([{ loc: '1', labor$: 1600, food$: 0, gc$: 0, total$: 1600 }], nm, { minTotal: 1500 });
    const big = opportunityAlerts([{ loc: '1', labor$: 6000, food$: 0, gc$: 0, total$: 6000 }], nm, { minTotal: 1500 });
    expect(small[0].severity).toBe('info');
    expect(big[0].severity).toBe('warn');
  });
});

describe('Integrity + over-target detectors', () => {
  it('fobOverTarget flags a store above its OWN FOB target', () => {
    const out = fobOverTarget(
      { '43701': { fobPct: 0.052, fob$: 15000, sales: 288000 } },
      { '43701': { tFOBTarget: 0.0485 } }, nm);
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe('Food Cost');
    expect(out[0].title).toMatch(/over target/);
    expect(out[0].dollars).toBeGreaterThan(500);
  });
  it('countExceptions surfaces a granted early-count exception as Integrity', () => {
    const out = countExceptions([{ loc: '37566', acceptedDate: '2026-07-28', approvedBy: 'Brad Denley' }], nm);
    expect(out[0].category).toBe('Integrity');
    expect(out[0].detail).toMatch(/2026-07-28/);
    expect(out[0].detail).toMatch(/Brad Denley/);
  });
  it('integrityFlags passes through pre-computed flags (recount padding) into the feed', () => {
    const out = integrityFlags([{ loc: '6838', title: 'Store6838 — implausible recount batch', detail: '8 corrections in 3 min', severity: 'crit', dollars: 7422 }], nm);
    expect(out[0].category).toBe('Integrity');
    expect(out[0].severity).toBe('crit');
    expect(out[0].dollars).toBe(7422);
  });
});

describe('fobOutliers', () => {
  it('flags stores whose FOB% runs above the dollar-weighted district rate', () => {
    // district rate = (300+300+2000)/(10000+10000+20000)=2600/40000=6.5%
    const fob = {
      a: { fobPct: 0.03, fob$: 300, sales: 10000 },   // below
      b: { fobPct: 0.03, fob$: 300, sales: 10000 },   // below
      c: { fobPct: 0.10, fob$: 2000, sales: 20000 },  // 10% >> district*1.3, ~$700 excess → flagged
    };
    const items = fobOutliers(fob, nm);
    expect(items).toHaveLength(1);
    expect(items[0].loc).toBe('c');
    expect(items[0].dollars).toBeGreaterThan(0);
  });
  it('needs at least 3 stores to form a district baseline', () => {
    expect(fobOutliers({ a: { fobPct: 0.9, fob$: 900, sales: 1000 } }, nm)).toHaveLength(0);
  });
  it('marks very-high FOB as critical', () => {
    const fob = { a: { fobPct: 0.03, fob$: 300, sales: 10000 }, b: { fobPct: 0.03, fob$: 300, sales: 10000 }, c: { fobPct: 0.12, fob$: 1200, sales: 10000 } };
    expect(fobOutliers(fob, nm)[0].severity).toBe('crit');
  });
});

describe('salesBehindLY', () => {
  it('flags stores behind LY beyond the min gap', () => {
    const rows = [{ loc: 'a', cur: 8000, ly: 10000 }, { loc: 'b', cur: 10500, ly: 10000 }];
    const items = salesBehindLY(rows, nm);
    expect(items).toHaveLength(1);
    expect(items[0].loc).toBe('a');
    expect(items[0].dollars).toBe(-2000);
  });
});

describe('mergeWorstSalesLY', () => {
  it('keeps the row with the worse (more negative) relative gap per loc', () => {
    // store a: window is a mild -5% dip, but the rolling 28-day trend is a real -20% decline
    // that a single decent week would otherwise hide.
    const windowRows = [{ loc: 'a', cur: 9500, ly: 10000 }, { loc: 'b', cur: 9000, ly: 10000 }];
    const rollingRows = [{ loc: 'a', cur: 8000, ly: 10000 }, { loc: 'b', cur: 9800, ly: 10000 }];
    const merged = mergeWorstSalesLY(windowRows, rollingRows);
    expect(merged.find(r => r.loc === 'a')).toEqual(rollingRows[0]);   // rolling window worse for a
    expect(merged.find(r => r.loc === 'b')).toEqual(windowRows[1]);    // single-week worse for b
  });

  it('a store present in only one window still surfaces', () => {
    const merged = mergeWorstSalesLY([{ loc: 'a', cur: 9500, ly: 10000 }], [{ loc: 'b', cur: 8000, ly: 10000 }]);
    expect(merged.map(r => r.loc).sort()).toEqual(['a', 'b']);
  });

  it('drops rows with no real LY baseline (ly <= 0) from either side', () => {
    const merged = mergeWorstSalesLY([{ loc: 'a', cur: 500, ly: 0 }], [{ loc: 'a', cur: 8000, ly: 10000 }]);
    expect(merged).toEqual([{ loc: 'a', cur: 8000, ly: 10000 }]);
  });

  it('feeds cleanly into salesBehindLY — the worse window decides severity', () => {
    const merged = mergeWorstSalesLY(
      [{ loc: 'a', cur: 9700, ly: 10000 }],              // -3%, below salesBehindLY's warn threshold alone
      [{ loc: 'a', cur: 7500, ly: 10000 }],               // -25% rolling — should win and flag warn
    );
    const items = salesBehindLY(merged, nm);
    expect(items).toHaveLength(1);
    expect(items[0].severity).toBe('warn');
  });
});

describe('staleData', () => {
  it('escalates by age', () => {
    expect(staleData(3)).toHaveLength(0);
    expect(staleData(9)[0].severity).toBe('warn');
    expect(staleData(20)[0].severity).toBe('crit');
  });
});

describe('slowDT', () => {
  it('flags DT over target', () => {
    const rows = [{ loc: 'a', dt: 300, target: 240 }, { loc: 'b', dt: 200, target: 240 }];
    const items = slowDT(rows, nm);
    expect(items).toHaveLength(1);
    expect(items[0].loc).toBe('a');
  });
});

describe('visitRisk', () => {
  it('flags elevated food-safety (crit) and at-risk readiness (warn)', () => {
    const stores = [
      { loc: 'a', band: 'ready', fsFlag: 'low', readiness: 90, fsScore: 80 },
      { loc: 'b', band: 'at-risk', fsFlag: 'watch', readiness: 62, fsScore: 60 },
      { loc: 'c', band: 'watch', fsFlag: 'elevated', readiness: 74, fsScore: 45 },
    ];
    const items = visitRisk(stores, nm);
    expect(items.find(i => i.loc === 'c' && i.category === 'Food Safety').severity).toBe('crit');
    expect(items.find(i => i.loc === 'b' && i.category === 'Visit Readiness').severity).toBe('warn');
    expect(items.some(i => i.loc === 'a')).toBe(false);
  });

  // Dispatch28 -- was a generic "coach before the next CFV/RGR" for every at-risk store
  // regardless of what was actually wrong. Now reads the same per-store verdict
  // computeVisitReadiness/buildVerdict already computes, so this feed and the Visit Readiness
  // panel never disagree about what to coach.
  it('uses the store\'s own verdict when present, not the generic fallback', () => {
    const stores = [{ loc: 'b', band: 'at-risk', fsFlag: 'watch', readiness: 62, fsScore: 60, verdict: 'Coach DT OEPE — 145s vs 120s target, the biggest blocker to PACE-ready.' }];
    const items = visitRisk(stores, nm);
    expect(items[0].detail).toContain('Coach DT OEPE');
    expect(items[0].detail).not.toContain('coach before the next CFV/RGR');
  });

  it('falls back to the generic phrasing when verdict is missing (older/incomplete data)', () => {
    const stores = [{ loc: 'b', band: 'at-risk', fsFlag: 'watch', readiness: 62, fsScore: 60 }];
    const items = visitRisk(stores, nm);
    expect(items[0].detail).toContain('coach before the next CFV/RGR');
  });
});

describe('signalDecay', () => {
  it('flags a saved correlation whose strength dropped well below its peak', () => {
    const saved = [
      { status: 'confirmed', outcomeKey: 'o', driverKey: 'd', outcomeLabel: 'OSAT', driverLabel: 'Speed',
        history: [{ withinR: 0.62 }, { withinR: 0.55 }, { withinR: 0.30 }] }, // 0.30 < 0.62*0.65 → decaying
      { status: 'confirmed', outcomeKey: 'o2', driverKey: 'd2', outcomeLabel: 'X', driverLabel: 'Y',
        history: [{ withinR: 0.5 }, { withinR: 0.48 }] }, // holding
      { status: 'dismissed', outcomeKey: 'o3', driverKey: 'd3', history: [{ withinR: 0.9 }, { withinR: 0.1 }] }, // dismissed → ignored
    ];
    const items = signalDecay(saved);
    expect(items).toHaveLength(1);
    expect(items[0].title).toMatch(/Speed → OSAT/);
  });
});

describe('rankAttention', () => {
  it('orders by severity, then dollars, and caps', () => {
    const items = [
      { id: 1, severity: 'warn', dollars: -500 },
      { id: 2, severity: 'crit', dollars: -100 },
      { id: 3, severity: 'warn', dollars: -2000 },
      { id: 4, severity: 'info', dollars: -9999 },
    ];
    const ranked = rankAttention(items, { max: 3 });
    expect(ranked.map(r => r.id)).toEqual([2, 3, 1]); // crit first; among warns, bigger $ first; info dropped by cap
  });

  it('warns (does not silently drop) when the cap truncates the list', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const items = [
      { id: 1, loc: 'a', title: 'A issue', severity: 'crit', dollars: 100 },
      { id: 2, loc: 'b', title: 'B issue', severity: 'crit', dollars: 90 },
      { id: 3, loc: 'c', title: 'C issue', severity: 'crit', dollars: 80 },
    ];
    rankAttention(items, { max: 2, label: 'testCaller' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const msg = warnSpy.mock.calls[0][0];
    expect(msg).toMatch(/testCaller/);
    expect(msg).toMatch(/truncated 1/);
    expect(msg).toMatch(/c:C issue/); // the dropped item is named, not silently gone
    warnSpy.mockRestore();
  });

  it('does not warn when nothing is dropped', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rankAttention([{ id: 1, severity: 'crit', dollars: 1 }], { max: 15 });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('findingsToFeedItems (buildBrief -> feed adapter)', () => {
  const finding = (over = {}) => ({
    rule: 'cashOS', t: 'crit', m: 'CRITICAL — CASH INTEGRITY: over.',
    severity: 'crit', category: 'Controls', icon: '💵',
    title: 'CRITICAL — Cash Over/Short', detail: 'over.', dollars: 42, loc: '10422',
    ...over,
  });

  it('maps a crit/warn finding into the feed item shape', () => {
    const [item] = findingsToFeedItems([finding()]);
    expect(item).toMatchObject({
      loc: '10422', severity: 'crit', category: 'Controls', icon: '💵',
      title: 'CRITICAL — Cash Over/Short', detail: 'over.', dollars: 42, nav: 'analytics',
    });
    expect(item.id).toBeTruthy();
  });

  it('drops info-severity findings (buildBrief\'s t:\'ok\'/t:\'fc\')', () => {
    const ok = finding({ rule: 'allClear', t: 'ok', severity: 'info' });
    const fc = finding({ rule: 'forecast', t: 'fc', severity: 'info' });
    expect(findingsToFeedItems([ok, fc])).toEqual([]);
  });

  it('keeps warn-severity findings (buildBrief\'s t:\'watch\')', () => {
    const watch = finding({ rule: 'labor', t: 'watch', severity: 'warn' });
    const items = findingsToFeedItems([watch]);
    expect(items).toHaveLength(1);
    expect(items[0].severity).toBe('warn');
  });

  it('ignores null/undefined entries without throwing', () => {
    expect(() => findingsToFeedItems([finding(), null, undefined])).not.toThrow();
    expect(findingsToFeedItems([finding(), null, undefined])).toHaveLength(1);
  });

  it('feeds cleanly into buildAttentionFeed alongside the other detectors', () => {
    const feed = buildAttentionFeed({
      briefFindings: [finding(), finding({ loc: '5985', rule: 'labor', t: 'watch', severity: 'warn', title: 'WATCH — Labor', dollars: 10 })],
      salesLY: [{ loc: 'd', cur: 8000, ly: 10000 }],
      storeName: nm,
      max: 50,
    });
    expect(feed.some(i => i.loc === '10422' && i.severity === 'crit')).toBe(true);
    expect(feed.some(i => i.loc === '5985' && i.severity === 'warn')).toBe(true);
    expect(feed.some(i => i.category === 'Sales')).toBe(true); // salesBehindLY still fires alongside
  });
});

describe('buildAttentionFeed', () => {
  it('fuses detectors into one ranked feed', () => {
    const feed = buildAttentionFeed({
      fobByStore: { a: { fobPct: 0.03, fob$: 300, sales: 10000 }, b: { fobPct: 0.03, fob$: 300, sales: 10000 }, c: { fobPct: 0.12, fob$: 1200, sales: 10000 } },
      salesLY: [{ loc: 'd', cur: 8000, ly: 10000 }],
      ageDays: 20,
      storeName: nm,
    });
    // stale (crit) + fob-c (crit) + ly-d (warn), stale/crit first
    expect(feed[0].category).toMatch(/Data|Food Cost/);
    expect(feed.some(i => i.category === 'Sales')).toBe(true);
    expect(feed.every(i => 'severity' in i)).toBe(true);
  });

  // issue #143 — the fire-volume instrumentation must be observation-only. These two guard
  // the "no behavior change" constraint from the issue: an omitted onFireVolume is a total
  // no-op (every existing caller before this issue), and a supplied one gets called with the
  // per-detector breakdown but the RETURNED feed itself is untouched by its presence.
  const inputs = {
    fobByStore: { a: { fobPct: 0.03, fob$: 300, sales: 10000 }, b: { fobPct: 0.03, fob$: 300, sales: 10000 }, c: { fobPct: 0.12, fob$: 1200, sales: 10000 } },
    salesLY: [{ loc: 'd', cur: 8000, ly: 10000 }],
    ageDays: 20,
    storeName: nm,
  };
  it('an omitted onFireVolume changes nothing (pre-#143 callers keep working identically)', () => {
    expect(() => buildAttentionFeed(inputs)).not.toThrow();
  });
  it('a supplied onFireVolume observes without altering the returned feed', () => {
    const calls = [];
    const withCb = buildAttentionFeed({ ...inputs, onFireVolume: (bySource, max) => calls.push({ bySource, max }) });
    const without = buildAttentionFeed(inputs);
    expect(withCb).toEqual(without);   // byte-identical return value
    expect(calls).toHaveLength(1);
    expect(calls[0].max).toBe(15);     // buildAttentionFeed's default
    expect(calls[0].bySource.fobOutliers).toHaveLength(1);   // store c
    expect(calls[0].bySource.staleData).toHaveLength(1);     // ageDays:20 -> crit
    expect(calls[0].bySource.salesBehindLY).toHaveLength(1); // store d
    expect(calls[0].bySource.slowDT).toHaveLength(0);
  });
  it('a throwing onFireVolume still returns the feed (scaffolding can never break the panel)', () => {
    const feed = buildAttentionFeed({ ...inputs, onFireVolume: () => { throw new Error('boom'); } });
    expect(feed.length).toBeGreaterThan(0);
  });
});

describe('visitRisk shape tolerance (production crash, 2026-08-07)', () => {
  // computeVisitReadiness returns { stores, district, weights, ... } — not an array.
  // attention-now.js passed the whole object, and `for (const s of (stores || []))`
  // threw "(e || []) is not iterable", white-screening the Attention Now panel.
  //
  // Latent since v4.552: the call site's try/catch returned [] whenever the readiness
  // computation THREW for want of graded-visit data, which masked the mismatch. It only
  // surfaced once the data was complete enough for the call to SUCCEED — a crash that
  // appears when the data gets better, which is the hardest kind to anticipate.
  const asObject = { stores: [{ loc: '5985', band: 'at-risk', readiness: 61 }], district: {}, weights: {} };

  it('accepts the full readiness object without throwing', () => {
    expect(() => visitRisk(asObject, String)).not.toThrow();
    expect(visitRisk(asObject, String)).toHaveLength(1);
  });

  it('still accepts a plain array', () => {
    expect(visitRisk(asObject.stores, String)).toHaveLength(1);
  });

  it('degrades to empty on junk rather than taking the panel down', () => {
    for (const bad of [null, undefined, 42, 'nope', {}, { stores: 'not-an-array' }]) {
      expect(() => visitRisk(bad, String), String(bad)).not.toThrow();
      expect(visitRisk(bad, String)).toEqual([]);
    }
  });

  it('buildAttentionFeed survives the object being passed through', () => {
    expect(() => buildAttentionFeed({ visitStores: asObject })).not.toThrow();
  });
});

// ── groupAttentionByStore (issue #115, Needs Attention merge Part 2) ──────────────────────
describe('groupAttentionByStore', () => {
  const storesByLoc = new Map([
    ['10422', { loc: '10422', name: 'Atoka' }],
    ['32525', { loc: '32525', name: 'Elgin' }],
  ]);

  it('groups by loc, splits crit/warn, drops info and loc-less items', () => {
    const items = [
      { id: 'a', loc: '10422', severity: 'crit', title: 'Sales down' },
      { id: 'b', loc: '10422', severity: 'crit', title: 'Cash short' },   // 2nd crit, SAME store
      { id: 'c', loc: '10422', severity: 'warn', title: 'OEPE slow' },
      { id: 'd', loc: '32525', severity: 'warn', title: 'FOB hot' },
      { id: 'e', loc: '10422', severity: 'info', title: 'ignored' },
      { id: 'f', loc: null, severity: 'crit', title: 'sync stale' },     // district item, dropped here
    ];
    const out = groupAttentionByStore(items, storesByLoc, String);
    expect(out).toHaveLength(2);
    const atoka = out.find(x => x.store.loc === '10422');
    expect(atoka.crits).toHaveLength(2);       // Trap 1's shape: two DIFFERENT crits, same store
    expect(atoka.warns).toHaveLength(1);
    expect(atoka.total).toBe(3);
    expect(atoka.worst).toBe(atoka.crits[0]);
    const elgin = out.find(x => x.store.loc === '32525');
    expect(elgin.crits).toHaveLength(0);
    expect(elgin.warns).toHaveLength(1);
  });

  it('ranks crit-tier stores before warn-only stores', () => {
    const items = [
      { id: 'a', loc: '32525', severity: 'warn', title: 'x' },
      { id: 'b', loc: '10422', severity: 'crit', title: 'y' },
    ];
    const out = groupAttentionByStore(items, storesByLoc, String);
    expect(out[0].store.loc).toBe('10422');
    expect(out[1].store.loc).toBe('32525');
  });

  it('drops items whose loc has no matching store (feed references a store outside the loaded set)', () => {
    const out = groupAttentionByStore([{ id: 'a', loc: '99999', severity: 'crit', title: 'x' }], storesByLoc, String);
    expect(out).toHaveLength(0);
  });

  it('normLoc lets the caller match zero-padded item.loc against unpadded storesByLoc keys', () => {
    const out = groupAttentionByStore([{ id: 'a', loc: '0010422', severity: 'crit', title: 'x' }],
      storesByLoc, (l) => String(l).replace(/^0+/, ''));
    expect(out).toHaveLength(1);
    expect(out[0].store.loc).toBe('10422');
  });

  // Issue #115's explicit verification requirement: "every store visible in either panel
  // before must still be visible after. A store that disappears is a regression." The old
  // AttentionPanel (analytics.js, pre-#115) inlined this exact grouping loop; reproduced
  // verbatim here as `oldGroup` so the comparison is against the real prior behavior, not a
  // re-derived approximation that could itself drift.
  function oldGroup(feed, storesByLoc) {
    const byLoc = new Map();
    for (const item of feed) {
      if (item.loc == null) continue;
      const loc = String(item.loc).replace(/^0+/, '') || String(item.loc);
      const store = storesByLoc.get(loc);
      if (!store) continue;
      let bucket = byLoc.get(loc);
      if (!bucket) { bucket = { store, crits: [], warns: [] }; byLoc.set(loc, bucket); }
      if (item.severity === 'crit') bucket.crits.push(item);
      else if (item.severity === 'warn') bucket.warns.push(item);
    }
    return [...byLoc.values()]
      .map(x => ({ ...x, total: x.crits.length + x.warns.length }))
      .sort((a, b) => b.crits.length - a.crits.length || b.warns.length - a.warns.length);
  }

  it('no store disappears in the merge — same store set, same crit/warn counts as the old algorithm', () => {
    const bigStoresByLoc = new Map(
      ['10422', '32525', '35242', '6178', '3708'].map(loc => [loc, { loc, name: 'Store' + loc }]));
    const feed = [
      { id: 'a', loc: '10422', severity: 'crit', title: 'sales' },
      { id: 'b', loc: '10422', severity: 'crit', title: 'cash' },      // Trap 1 shape
      { id: 'c', loc: '32525', severity: 'warn', title: 'fob' },
      { id: 'd', loc: '35242', severity: 'warn', title: 'oepe' },
      { id: 'e', loc: '35242', severity: 'info', title: 'strength' },  // never counted, either version
      { id: 'f', loc: '6178', severity: 'crit', title: 'labor' },
      { id: 'g', loc: null, severity: 'crit', title: 'sync stale' },   // loc-less — old panel dropped it entirely
    ];
    const oldOut = oldGroup(feed, bigStoresByLoc);
    const newOut = groupAttentionByStore(feed, bigStoresByLoc, (l) => String(l).replace(/^0+/, '') || String(l));
    const oldLocs = oldOut.map(x => x.store.loc).sort();
    const newLocs = newOut.map(x => x.store.loc).sort();
    expect(newLocs).toEqual(oldLocs);
    for (const loc of oldLocs) {
      const o = oldOut.find(x => x.store.loc === loc), n = newOut.find(x => x.store.loc === loc);
      expect(n.crits.length, loc).toBe(o.crits.length);
      expect(n.warns.length, loc).toBe(o.warns.length);
    }
    // The loc-less item is the one thing the OLD grouped algorithm structurally could
    // never show — it's the reason the pinned district strip (AttentionPanel, issue #115)
    // exists: without it, retiring Attention Now would have silently dropped this alert.
    expect(feed.filter(i => i.loc == null)).toHaveLength(1);
  });
});
