// @ts-nocheck
// Egress Phase 1.5 (2026-11-22): the 9 LifeLenz Data Explorer / HME / Squadle startup stages
// (_stLifelenzJobHours/_stLifelenzAttendance/_stScheduleVariance/_stComplianceAudit/
// _stEmployeePerformance/_stPayrollReadiness/_stLifelenzDar/_stHmeDt/_stSquadle) never wrote
// back to the OPFS snapshot at all — found while scoping Wave 1 delta-sync (task #190). This
// joins the same cache-first pattern sched/qsrAct/salesLedger already proved out (pilots #1-3).
//
// Deliberately NOT routed through the shared strip()/toRow() pair every other stream uses:
// strip() assumes a row's `date` is either a Date instance or a value safe to re-derive via
// `new Date(date)` + LOCAL Y/M/D components. `lifelenzAttendanceRows.date` is a plain
// "YYYY-MM-DD" STRING (`r.period_end`, confirmed by reading loadLifeLenzAttendance in
// src/lib/supabase.js before writing this) — feeding that through `new Date(date)` parses it as
// UTC midnight, and reading local components back off it would shift the calendar day by one in
// any negative-UTC-offset timezone (the exact bug src/utils/date.js's dKey() header warns
// about). So these 9 fields are cached byte-for-byte (verbatim passthrough on write; JSON
// round-trips plain strings/numbers unaided) except `hmeDt`/`squadle`, which DO carry real Date
// objects and get a dedicated reconstruction on read, mirroring pilot #2's qsrAct/refreshedAt
// wrapper.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';

const fakeFiles = new Map();

class MockOpfsWorker {
  constructor() { this._listeners = []; }
  addEventListener(type, cb) { if (type === 'message') this._listeners.push(cb); }
  removeEventListener(type, cb) { this._listeners = this._listeners.filter(l => l !== cb); }
  postMessage(msg) {
    if (msg.cmd !== 'load') return;
    queueMicrotask(() => {
      const content = fakeFiles.get('meridian-data.json');
      const payload = content == null
        ? { cmd: 'load', ok: false, notFound: true }
        : { cmd: 'load', ok: true, buf: new TextEncoder().encode(content).buffer };
      this._listeners.slice().forEach(cb => cb({ data: payload }));
    });
  }
}

function makeFakeStorageRoot() {
  return {
    getFileHandle: async (name, opts) => {
      if (!fakeFiles.has(name) && !(opts && opts.create)) {
        const e = new Error('not found'); e.name = 'NotFoundError'; throw e;
      }
      return {
        createWritable: async () => ({
          write: async (data) => { fakeFiles.set(name, data); },
          close: async () => {},
        }),
      };
    },
    removeEntry: async (name) => { fakeFiles.delete(name); },
  };
}

globalThis.Worker = MockOpfsWorker;
if (!globalThis.navigator) globalThis.navigator = {};
globalThis.navigator.storage = { getDirectory: async () => makeFakeStorageRoot() };

const { opfsSave, loadDsFromIDB } = await import('../db/index.js');

beforeEach(() => { fakeFiles.clear(); });

// A labor row is required in every save — loadDsFromIDB only trusts the OPFS snapshot once it
// sees at least one labor row (its own corrupt-snapshot sentinel), same precedent pilots #1-3's
// tests all follow.
const anchorLabor = { laborRows: [{ loc: '3708', date: new Date('2026-11-01'), sales: 100 }] };

describe('egress Phase 1.5: LifeLenz/HME/Squadle streams join the OPFS snapshot (v7)', () => {
  it('opfsSave writes v7 and all 9 new fields', async () => {
    await opfsSave({
      ...anchorLabor,
      jobHours: [{ loc: '3708', weekStart: '2026-11-17', hours: 40 }],
      lifelenzAttendanceRows: [{ loc: '3708', date: '2026-11-20', periodEnd: '2026-11-20', employeeCount: 12 }],
      scheduleVarianceRows: [{ loc: '3708', occurredAt: '2026-11-20T14:00:00Z', hoursVariance: 1.5 }],
      complianceAuditRows: [{ loc: '3708', shiftDate: '2026-11-20', violationCount: 2 }],
      employeePerformanceRows: [{ loc: '3708', periodEnd: '2026-11-20', attendanceRate: 0.95 }],
      payrollReadinessRows: [{ loc: '3708', payPeriodStart: '2026-11-09', scheduledHours: 320 }],
      lifelenzDarRows: [{ loc: '3708', dt: '2026-11-20', netSales: 1234.5 }],
      hmeDtRows: [{ loc: '3708', date: new Date('2026-11-20T00:00:00'), pulledAt: new Date('2026-11-21T06:00:00Z'), avgSeconds: 182 }],
      squadleChecklistRows: [{ loc: '3708', date: new Date('2026-11-20T00:00:00'), data: { done: true } }],
    });
    const raw = JSON.parse(fakeFiles.get('meridian-data.json'));
    expect(raw.v).toBe(7);
    expect(raw.jobHours).toHaveLength(1);
    expect(raw.lifelenzAttendance).toHaveLength(1);
    expect(raw.scheduleVariance).toHaveLength(1);
    expect(raw.complianceAudit).toHaveLength(1);
    expect(raw.employeePerformance).toHaveLength(1);
    expect(raw.payrollReadiness).toHaveLength(1);
    expect(raw.lifelenzDar).toHaveLength(1);
    expect(raw.hmeDt).toHaveLength(1);
    expect(raw.squadle).toHaveLength(1);
  });

  it('the 7 no-Date-object streams round-trip byte-for-byte (no date massaging, no field loss)', async () => {
    await opfsSave({
      ...anchorLabor,
      jobHours: [{ loc: '3708', weekStart: '2026-11-17', hours: 40, cost: 650.25 }],
      scheduleVarianceRows: [{ loc: '3708', occurredAt: '2026-11-20T14:00:00Z', hoursVariance: 1.5, editedBy: 'M. Smith' }],
      complianceAuditRows: [{ loc: '3708', shiftDate: '2026-11-20', violationCount: 2, costPenaltySum: 12.4 }],
      employeePerformanceRows: [{ loc: '3708', periodEnd: '2026-11-20', attendanceRate: 0.95, geid: 'G123' }],
      payrollReadinessRows: [{ loc: '3708', payPeriodStart: '2026-11-09', scheduledHours: 320, hoursVariance: -4 }],
      lifelenzDarRows: [{ loc: '3708', dt: '2026-11-20', netSales: 1234.5, transactions: 310 }],
    });
    const ds = await loadDsFromIDB();
    expect(ds.jobHours).toEqual([{ loc: '3708', weekStart: '2026-11-17', hours: 40, cost: 650.25 }]);
    expect(ds.scheduleVariance).toEqual([{ loc: '3708', occurredAt: '2026-11-20T14:00:00Z', hoursVariance: 1.5, editedBy: 'M. Smith' }]);
    expect(ds.complianceAudit).toEqual([{ loc: '3708', shiftDate: '2026-11-20', violationCount: 2, costPenaltySum: 12.4 }]);
    expect(ds.employeePerformance).toEqual([{ loc: '3708', periodEnd: '2026-11-20', attendanceRate: 0.95, geid: 'G123' }]);
    expect(ds.payrollReadiness).toEqual([{ loc: '3708', payPeriodStart: '2026-11-09', scheduledHours: 320, hoursVariance: -4 }]);
    expect(ds.lifelenzDar).toEqual([{ loc: '3708', dt: '2026-11-20', netSales: 1234.5, transactions: 310 }]);
  });

  it('lifelenzAttendance.date (a plain "YYYY-MM-DD" STRING, not a Date) round-trips as the exact same string — never corrupted into a Date or shifted a day', async () => {
    await opfsSave({
      ...anchorLabor,
      lifelenzAttendanceRows: [{ loc: '3708', date: '2026-11-20', periodEnd: '2026-11-20', employeeCount: 12 }],
    });
    const ds = await loadDsFromIDB();
    expect(ds.lifelenzAttendance).toHaveLength(1);
    expect(ds.lifelenzAttendance[0].date).toBe('2026-11-20');
    expect(typeof ds.lifelenzAttendance[0].date).toBe('string');
    expect(ds.lifelenzAttendance[0].employeeCount).toBe(12);
  });

  it('hmeDt restores `date` AND `pulledAt` as real Date objects with the exact original instant', async () => {
    const d = new Date('2026-11-20T00:00:00');
    const pulledAt = new Date('2026-11-21T06:00:00Z');
    await opfsSave({ ...anchorLabor, hmeDtRows: [{ loc: '3708', date: d, pulledAt, avgSeconds: 182 }] });
    const ds = await loadDsFromIDB();
    expect(ds.hmeDt).toHaveLength(1);
    expect(ds.hmeDt[0].date).toBeInstanceOf(Date);
    expect(ds.hmeDt[0].date.getTime()).toBe(d.getTime());
    expect(ds.hmeDt[0].pulledAt).toBeInstanceOf(Date);
    expect(ds.hmeDt[0].pulledAt.getTime()).toBe(pulledAt.getTime());
    expect(ds.hmeDt[0].avgSeconds).toBe(182);
  });

  it('squadle restores `date` as a real Date object', async () => {
    const d = new Date('2026-11-20T00:00:00');
    await opfsSave({ ...anchorLabor, squadleChecklistRows: [{ loc: '3708', date: d, data: { done: true } }] });
    const ds = await loadDsFromIDB();
    expect(ds.squadle).toHaveLength(1);
    expect(ds.squadle[0].date).toBeInstanceOf(Date);
    expect(ds.squadle[0].date.getTime()).toBe(d.getTime());
    expect(ds.squadle[0].data).toEqual({ done: true });
  });

  it('is backward-compatible with a v6 blob that has none of the 9 new fields — all default to []', async () => {
    fakeFiles.set('meridian-data.json', JSON.stringify({
      v: 6,
      labor: [{ loc: '3708', _d: '2026-11-01', sales: 100 }],
      ops: [], ctrl: [], fob: [], audit: [], peaks: [], dar: [], sched: [], qsrAct: [],
      glimpse: [], cash: [], salesLedger: [], exceptions: [],
    }));
    const ds = await loadDsFromIDB();
    expect(ds.jobHours).toEqual([]);
    expect(ds.lifelenzAttendance).toEqual([]);
    expect(ds.scheduleVariance).toEqual([]);
    expect(ds.complianceAudit).toEqual([]);
    expect(ds.employeePerformance).toEqual([]);
    expect(ds.payrollReadiness).toEqual([]);
    expect(ds.lifelenzDar).toEqual([]);
    expect(ds.hmeDt).toEqual([]);
    expect(ds.squadle).toEqual([]);
  });

  it('accepts v7 (does not reject it as an unrecognized version)', async () => {
    fakeFiles.set('meridian-data.json', JSON.stringify({
      v: 7,
      labor: [{ loc: '3708', _d: '2026-11-01', sales: 100 }],
      ops: [], ctrl: [], fob: [], audit: [], peaks: [], dar: [], sched: [], qsrAct: [],
      glimpse: [], cash: [], salesLedger: [], exceptions: [],
      jobHours: [{ loc: '3708', weekStart: '2026-11-17', hours: 40 }],
    }));
    const ds = await loadDsFromIDB();
    expect(ds.jobHours).toEqual([{ loc: '3708', weekStart: '2026-11-17', hours: 40 }]);
  });
});
