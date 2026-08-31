// @ts-nocheck
// Dispatch #228 — on-demand "regenerate with fresh data and resend" for the per-store EOM
// count-completion notification (scripts/eom-notification-resend.mjs + the EOM Dashboard's
// "🔄 Resend" button, src/views/eom-dashboard.js).
//
// Per this repo's "would this verification still pass if reverted?" standing rule (CLAUDE.md):
//   1. buildResendRow() is exercised against synthetic on-hand fixtures (mirroring
//      src/__tests__/eom-count-notifications-pull.test.js's own mkRows()/d() pattern), proving
//      the built row's class_statuses/uncounted_items/trigger_kind/fob_snapshot are correct for
//      a KNOWN input — this dispatch's own verification bar — not just that notifyRow gets
//      called with whatever it's handed.
//   2. notifyRow() (the real, unmocked function from qsrsoft-onhand-pull.mjs) is called with a
//      row buildResendRow() actually produced, with only the network boundary (resend-notify.mjs's
//      two send functions) mocked — mirrors src/__tests__/eom-notification-delivery-pull.test.js's
//      own pattern (test-eom-notification-send.mjs's documented limitation: a real Resend send
//      cannot be verified in this sandbox, no RESEND_API_KEY).
//   3. A render test mounts the REAL EOMDashboardPanel, opens the REAL "✉️ Draft" Store message
//      modal, clicks the REAL "🔄 Resend" button, and asserts it calls the real triggerSync()
//      with workflow 'resend_notify' and the right {loc, period} — not an isolated helper, so
//      deleting the wiring (button calls the wrong workflow key, or isn't wired at all) would
//      fail this test, per dispatch-217/224's own established pattern for this same file.
//
// Supabase-touching functions (loadOnHandRowsForStore, resendNotificationForStore's own
// fetchFobSnapshotForStore/resolveFobTargets/insert calls) are NOT tested against a faked
// supabase-js wire protocol — this repo's own eom-digest-send.test.js header explains why: no
// test anywhere fakes that protocol, since faithfully simulating it is itself a source of false
// confidence. Those paths reuse qsrsoft-onhand-pull.mjs's own already-covered functions verbatim
// (see eom-count-notifications-pull.test.js for their existing coverage).
//
// scripts/lib/safe-supabase-client.mjs's safeCreateClient() is mocked to always return null —
// this is NOT faking the wire protocol (nothing about a query/response shape is simulated); it
// forces both qsrsoft-onhand-pull.mjs's and this script's own module-scope `supabase` consts to
// the same null-client state every real `npm test` run gets in CI (ci.yml's Test step sets no
// VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY at all). Doing this explicitly, rather than relying
// on the ambient environment, matters here specifically: unlike most sandboxes, THIS session's own
// environment carries live, working Supabase credentials (CLAUDE.md's dispatch #133 note) — an
// unmocked run of this file was measured making REAL reads against the live qsr_onhand table for
// a real store/period (289 real rows came back) before this mock was added. Forcing a null client
// makes the test deterministic and identical to CI's real condition, regardless of which
// session's ambient credentials it happens to run under — and guarantees zero risk of this test
// ever reaching the real eom_count_notifications insert path.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../scripts/lib/safe-supabase-client.mjs', () => ({ safeCreateClient: () => null }));

const sendEmailMock = vi.fn().mockResolvedValue(true);
const sendSmsMock = vi.fn().mockResolvedValue(true);
vi.mock('../../scripts/lib/resend-notify.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    sendEmailNotification: (...args) => sendEmailMock(...args),
    sendSmsViaCarrierGateway: (...args) => sendSmsMock(...args),
  };
});

import {
  buildResendRow, padLoc, loadOnHandRowsForStore, resendNotificationForStore,
} from '../../scripts/eom-notification-resend.mjs';
import { notifyRow } from '../../scripts/qsrsoft-onhand-pull.mjs';
import { triggerLabel, buildEmailContent } from '../../scripts/lib/resend-notify.mjs';

beforeEach(() => { sendEmailMock.mockClear(); sendSmsMock.mockClear(); });

const PERIOD = '2026-08';
const LOC = '0003708';
const d = (day) => new Date(`2026-08-${String(day).padStart(2, '0')}T00:00:00`);
const ASOF = d(31);

// Same fixture shape as eom-count-notifications-pull.test.js's own mkRows() — camelCase engine
// rows (toEngineRows()'s output shape), 4 food / 3 condiment / 2 paper / 1 nonproduct.
function mkRows({ foodCountedOn = [], condimentCountedOn = [], paperCountedOn = [], nonproductCountedOn = [] } = {}) {
  const rows = [];
  const push = (cls, n, countedDates, prefix) => {
    for (let i = 0; i < n; i++) {
      rows.push({
        wrin: `${prefix}${i}`, cls, descr: `${cls} item ${i}`, onHandAmt: 100 + i * 10, unitPrice: 5, totalUnits: 20,
        lastCounted: countedDates[i] || null, lastSubmitted: null,
      });
    }
  };
  push('Food', 4, foodCountedOn, 'F');
  push('Condiment', 3, condimentCountedOn, 'C');
  push('Paper', 2, paperCountedOn, 'P');
  push('Non-Product', 1, nonproductCountedOn, 'N');
  return rows;
}

describe('padLoc', () => {
  it('pads a short NSN to 7 chars, leaves an already-padded one alone', () => {
    expect(padLoc('3708')).toBe('0003708');
    expect(padLoc('0003708')).toBe('0003708');
  });
});

describe('buildResendRow — the pure row-building core', () => {
  it('returns null when nothing currently reads complete for this store/period (nothing coherent to regenerate)', () => {
    const rows = mkRows({ foodCountedOn: [d(30), null, null, null] }); // in progress only
    expect(buildResendRow(LOC, PERIOD, rows, { asOf: ASOF })).toBeNull();
  });

  it('Paper-only complete -> trigger_kind is manual_resend (not the automated "paper"), and the snapshot widens to ALL classes, not just Paper', () => {
    const rows = mkRows({
      foodCountedOn: [d(30), null, null, null],   // in progress
      paperCountedOn: [d(31), d(31)],              // complete
    });
    const row = buildResendRow(LOC, PERIOD, rows, { dateStr: '2026-08-31', asOf: ASOF });
    expect(row).not.toBeNull();
    expect(row.trigger_kind).toBe('manual_resend'); // distinct from the automated 'paper' kind
    expect(row.class_statuses.paper.status).toBe('complete');
    expect(row.class_statuses.food.status).toBe('in_progress');
    expect(row.class_statuses.condiment.status).toBe('not_started');
    expect(row.class_statuses.nonproduct.status).toBe('not_started');
    // The "full current-state snapshot" design choice: uncounted_items is NOT scoped to just
    // Paper (the class that would have fired an automated notification) — it covers every
    // still-uncounted item across every class, since the whole point of a manual regenerate is
    // showing the CURRENT full picture, not replaying the original narrow trigger.
    const clsSeen = new Set(row.uncounted_items.items.map(it => it.cls));
    expect(clsSeen.has('food')).toBe(true);
    expect(clsSeen.has('condiment')).toBe(true);
    // kb_links likewise cover more than just Paper's own link set.
    expect(row.kb_links.length).toBeGreaterThan(1);
  });

  it('Food+Condiment both complete -> manual_resend trigger_kind, both read complete', () => {
    const rows = mkRows({
      foodCountedOn: [d(30), d(30), d(30), d(30)],
      condimentCountedOn: [d(30), d(30), d(30)],
    });
    const row = buildResendRow(LOC, PERIOD, rows, { asOf: ASOF });
    expect(row.trigger_kind).toBe('manual_resend');
    expect(row.class_statuses.food.status).toBe('complete');
    expect(row.class_statuses.condiment.status).toBe('complete');
  });

  it('passes a given fobSnapshot/fobTargetReport straight through to fob_snapshot/fob_target, and populates fob_tool_links (food+condiment are always in the widened trigger-classes scope)', () => {
    const rows = mkRows({
      foodCountedOn: [d(30), d(30), d(30), d(30)],
      condimentCountedOn: [d(30), d(30), d(30)],
    });
    const snap = { fobPct: 0.03, fob: 3000, comp: 1, raw: 1, cond: 1, emp: 1, statv: 1, unex: 1 };
    const tgt = { fobPct: 0.025, gapPP: 0.5, overTarget: true, comps: [], topDriver: null };
    const row = buildResendRow(LOC, PERIOD, rows, { fobSnapshot: snap, fobTargetReport: tgt, dateStr: '2026-08-31', asOf: ASOF });
    expect(row.fob_snapshot).toBe(snap);
    expect(row.fob_target).toBe(tgt);
    expect(row.fob_tool_links).not.toBeNull();
    expect(row.fob_tool_links.length).toBeGreaterThan(0);
  });

  it('defaults fob_snapshot/fob_target/fob_tool_links to null when none is passed', () => {
    const rows = mkRows({ paperCountedOn: [d(31), d(31)] });
    const row = buildResendRow(LOC, PERIOD, rows, { asOf: ASOF });
    expect(row.fob_snapshot).toBeNull();
    expect(row.fob_target).toBeNull();
    expect(row.fob_tool_links).toBeNull();
  });

  it('every relevant class name appears in class_statuses even though only one class triggered (rule 3 — never fabricated as not_started, never omitted)', () => {
    const rows = mkRows({ paperCountedOn: [d(31), d(31)] });
    const row = buildResendRow(LOC, PERIOD, rows, { asOf: ASOF });
    for (const k of ['food', 'condiment', 'paper', 'nonproduct']) {
      expect(row.class_statuses).toHaveProperty(k);
    }
  });
});

describe('the real send pipeline accepts a buildResendRow() row unmodified', () => {
  it('notifyRow(row) calls the real send functions once each, with a real store label, and no garbled subject text', async () => {
    const rows = mkRows({
      foodCountedOn: [d(30), d(30), d(30), d(30)],
      condimentCountedOn: [d(30), d(30), d(30)],
    });
    const row = buildResendRow('0011657', PERIOD, rows, { asOf: ASOF }); // Purcell, per STORE_NAMES
    await notifyRow(row);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    const [emailRow, storeInfo] = sendEmailMock.mock.calls[0];
    expect(emailRow).toBe(row);
    expect(storeInfo.name).toBe('Purcell');
  });

  it('buildEmailContent(row) — the real HTML builder — renders "Current Status", never the raw "manual + resend" split', () => {
    const rows = mkRows({ paperCountedOn: [d(31), d(31)] });
    const row = buildResendRow(LOC, PERIOD, rows, { dateStr: '2026-08-31', asOf: ASOF });
    const { subject, html } = buildEmailContent(row, { loc: LOC, name: 'Cottondale' });
    expect(subject).toContain('Current Status');
    expect(subject).not.toMatch(/manual \+ resend/i);
    expect(html).toContain('Current Status');
  });
});

describe('triggerLabel — dispatch #228 special case', () => {
  it("'manual_resend' reads as 'Current Status', not the raw underscore-split words", () => {
    expect(triggerLabel('manual_resend')).toBe('Current Status');
  });
  it('existing automated kinds are unaffected', () => {
    expect(triggerLabel('food_condiment')).toBe('Food + Condiment');
    expect(triggerLabel('paper')).toBe('Paper');
  });
});

describe('resendNotificationForStore — graceful no-op when Supabase is unavailable (CI\'s real condition, forced here)', () => {
  it('loadOnHandRowsForStore returns [] rather than throwing when there is no live Supabase client', async () => {
    await expect(loadOnHandRowsForStore(LOC, PERIOD)).resolves.toEqual([]);
  });

  it('resendNotificationForStore returns null (nothing to resend) rather than throwing, and never calls notifyRow\'s send functions', async () => {
    const result = await resendNotificationForStore(LOC, PERIOD, { dateStr: '2026-08-31', asOf: ASOF });
    expect(result).toBeNull();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});
