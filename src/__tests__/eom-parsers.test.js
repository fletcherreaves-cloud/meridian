import { describe, it, expect } from 'vitest';
import {
  mapVarianceRows, mapYieldGroups, parseYieldRange, yieldBandFor, yieldStatus,
  mapWasteEvents, summarizeWasteByManager, mapTransferLines, summarizeTransfers, flagUnmatchedTransfers,
  mapRawItemHistory,
} from '../engine/eom-parsers.js';

describe('mapVarianceRows', () => {
  it('carries $ for Food/Paper (ri:1), zeroes $ for Condiment (ri:0)', () => {
    const rows = [
      { wrin: '00005-086', long_desc: '100% PURE BEEF', class: 'F', ri: 1, dollar_variance: -868.13, variance: -2054, yield: 0.916, store_rawitem_id: 1385962, percentage: -0.318 },
      { wrin: '00029-009', long_desc: 'SALT/NON-IODIZED', class: 'C', ri: 0, variance: -1.73, mid_range_yield: 2000 },
    ];
    const [beef, salt] = mapVarianceRows(rows);
    expect(beef.dolDiff).toBeCloseTo(-868.13);
    expect(beef.cls).toBe('food');
    expect(beef.rawItemId).toBe(1385962);
    expect(salt.dolDiff).toBe(0); // condiment: no dollar figure
    expect(salt.unitVar).toBeCloseTo(-1.73);
    expect(salt.hasDollars).toBe(false);
  });
});

describe('yields', () => {
  it('parses "Y Range" bands and matches by wrin prefix', () => {
    expect(parseYieldRange('Y Range: 35.00 - 37.00')).toEqual({ lo: 35, hi: 37 });
    expect(parseYieldRange('Y Range: 53.1-58.7')).toEqual({ lo: 53.1, hi: 58.7 });
    const lookup = mapYieldGroups([
      { groupName: 'Big Mac Sauce', description: 'Y Range: 35.00 - 37.00', items: ['00055'] },
      { groupName: 'Fries', description: 'Y Range: 84.9 - 93.9', items: ['00004'] },
    ]);
    expect(yieldBandFor('00055-332', lookup).group).toBe('Big Mac Sauce');
    expect(yieldBandFor('99999-000', lookup)).toBeNull();
  });
  it('classifies actual yield vs band', () => {
    const band = { lo: 35, hi: 37, group: 'x' };
    expect(yieldStatus(33, band)).toBe('below');
    expect(yieldStatus(36, band)).toBe('in-band');
    expect(yieldStatus(40, band)).toBe('above');
    expect(yieldStatus(null, band)).toBe('unknown');
  });
});

describe('waste', () => {
  const raw = [
    { store_busn_dt: '2026-07-25', type: 'waste', amount: 21.27, eID: 'James T - e8483035', source: 'BOS', edited: 0 },
    { store_busn_dt: '2026-07-25', type: 'comp_waste', amount: 26.53, eID: 'James T - e8483035', source: 'BOS', edited: 1 },
    { store_busn_dt: '2026-07-24', type: 'waste', amount: 3.18, eID: 'liz r - e9762152', source: 'MobileApp', edited: 0 },
  ];
  it('maps type + manager + edited', () => {
    const [a, b] = mapWasteEvents(raw);
    expect(a.type).toBe('raw');
    expect(b.type).toBe('completed');
    expect(b.edited).toBe(true);
  });
  it('summarizes by manager with share', () => {
    const { total, byManager } = summarizeWasteByManager(mapWasteEvents(raw));
    expect(total).toBeCloseTo(50.98, 1);
    expect(byManager[0].manager).toBe('James T - e8483035'); // largest first
    expect(byManager[0].edited).toBe(1);
    expect(byManager[0].share).toBeGreaterThan(0.9);
  });
});

describe('transfers', () => {
  const rows = [
    { id: 1, type: 'Out', trans_nsn: 6972, store_busn_dt: '07/20/2026', status: 'approved', total_amt: 162.32, header_total_amt: 205.23, eID: 'Cinthya a', store_rawitem_id: 1385962, wrin: '00005-086', long_desc: 'BEEF', invty_class_cd: 'F', units_count: 384 },
    { id: 1, type: 'Out', trans_nsn: 6972, store_busn_dt: '07/20/2026', status: 'approved', total_amt: 42.91, header_total_amt: 205.23, eID: 'Cinthya a', store_rawitem_id: 1386211, wrin: '01637-095', long_desc: 'CHKN', invty_class_cd: 'F', units_count: 87 },
    { id: 2, type: 'In', trans_nsn: 24471, store_busn_dt: '07/07/2026', status: 'rejected', total_amt: 4.06, header_total_amt: 4.06, eID: 'Kody E', store_rawitem_id: 62825146, wrin: '07605-041', long_desc: 'GLOVES', invty_class_cd: 'S', units_count: 200 },
  ];
  it('groups by transfer id and flags large/unapproved', () => {
    const lines = mapTransferLines(rows);
    expect(lines[0].dir).toBe('Out');
    const s = summarizeTransfers(lines, { largeAmt: 100 });
    expect(s.outTotal).toBeCloseTo(205.23, 1);
    expect(s.inTotal).toBeCloseTo(4.06, 1);
    // transfer 1 flagged (large), transfer 2 flagged (rejected)
    expect(s.flagged.map(t => t.id).sort()).toEqual([1, 2]);
    expect(s.flagged.find(t => t.id === 2).status).toBe('rejected');
  });
});

describe('flagUnmatchedTransfers', () => {
  const T = (loc, id, dir, cp, total, dt) => ({ loc, transferId: id, dir, counterpartyNsn: cp, transferTotal: total, dt });
  it('flags a transfer with no mirror at the counterparty sister store', () => {
    const lines = [
      // A→B Out has a matching B In (counterparty A, same $, same day) → matched
      T('0003708', 'x1', 'Out', '3709', 200, '2026-07-30'),
      T('0003709', 'y1', 'In', '3708', 200, '2026-07-30'),
      // A→B Out with NO mirror at B → unmatched (phantom risk)
      T('0003708', 'x2', 'Out', '3709', 500, '2026-07-31'),
    ];
    const our = ['0003708', '0003709'];
    const un = flagUnmatchedTransfers(lines, our);
    expect(un.has('3708|x2')).toBe(true);
    expect(un.has('3708|x1')).toBe(false);
    expect(un.has('3709|y1')).toBe(false);
  });
  it('does NOT flag a transfer whose counterparty is outside our store set', () => {
    const lines = [T('0003708', 'x9', 'Out', '9999999', 300, '2026-07-30')];
    const un = flagUnmatchedTransfers(lines, ['0003708']);
    expect(un.size).toBe(0);
  });
});

describe('mapRawItemHistory', () => {
  it('extracts count events (source=inventory) with variance/difference/manager', () => {
    const detail = {
      full_wrin: '00005-086', long_desc: '100% PURE BEEF', uom_desc: 'Each', item_class: 'F',
      history: [
        { store_busn_dt: '2026-07-05', source: 'invoice', qty_change: 384, invoice_identifier: 'INV1' },
        { store_busn_dt: '2026-07-21', source: 'inventory', qty_change: -4608, variance: -4608, difference: -1947.88, eID: 'Cinthya a - e9755633', count_source: 'MobileApp' },
      ],
    };
    const m = mapRawItemHistory(detail);
    expect(m.wrin).toBe('00005-086');
    expect(m.history).toHaveLength(2);
    expect(m.counts).toHaveLength(1);
    expect(m.counts[0].difference).toBeCloseTo(-1947.88);
    expect(m.counts[0].manager).toBe('Cinthya a - e9755633');
    expect(m.counts[0].isCount).toBe(true);
  });
});
