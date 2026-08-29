// @ts-nocheck
// Dispatch #211 — scoped integration-style test of the ACTUAL hook-point wiring in
// scripts/qsrsoft-onhand-pull.mjs (notifyRow/deliverNotifications, called right after the
// eom_count_notifications insert — search that file for "dispatch #211" near the FUTURE HOOK
// comment dispatch #209 left). Mirrors src/__tests__/eom-count-notifications-pull.test.js's own
// pattern: import the real exported functions from the pull script and exercise them directly,
// no live QSRSoft/Supabase/network dependency.
//
// vi.mock's scripts/lib/resend-notify.mjs so this proves the WIRING (both send functions get
// called, once per row, with the right args) without making a real Resend call — the request-
// shape/content correctness of the send functions themselves is covered by resend-notify.test.js.
// Per this repo's "would this verification still pass if the change were reverted" rule: this
// test imports deliverNotifications/notifyRow from the real pull-script module, so deleting the
// hook-point call (reverting Task 2) would make these assertions fail, not just leave them
// silently passing against an unused engine.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendEmailMock = vi.fn().mockResolvedValue(true);
const sendSmsMock = vi.fn().mockResolvedValue(true);
vi.mock('../../scripts/lib/resend-notify.mjs', () => ({
  sendEmailNotification: (...args) => sendEmailMock(...args),
  sendSmsViaCarrierGateway: (...args) => sendSmsMock(...args),
}));

import { deliverNotifications, notifyRow, buildNotificationRow } from '../../scripts/qsrsoft-onhand-pull.mjs';
import { computeCountProgress, diagnoseIncompleteCount, detectCountNotifications } from '../engine/eom-inventory.js';

beforeEach(() => {
  sendEmailMock.mockClear();
  sendSmsMock.mockClear();
});

const PERIOD = '2026-08';
const d = (day) => new Date(`2026-08-${String(day).padStart(2, '0')}T00:00:00`);
const ASOF = d(31);

function mkRealNotificationRow(loc) {
  const rows = [
    { wrin: 'F0', cls: 'Food', onHandAmt: 100, unitPrice: 5, totalUnits: 20, lastCounted: d(30), lastSubmitted: null },
    { wrin: 'C0', cls: 'Condiment', onHandAmt: 50, unitPrice: 5, totalUnits: 10, lastCounted: d(30), lastSubmitted: null },
  ];
  const p = computeCountProgress(rows, { period: PERIOD, asOf: ASOF });
  const detection = detectCountNotifications({ notified_classes: [] }, p, { asOf: ASOF });
  const diag = diagnoseIncompleteCount(rows, { period: PERIOD, minValue: 0 });
  return buildNotificationRow(loc, PERIOD, detection, diag);
}

describe('notifyRow — the hook point calls BOTH channels for a single fired notification', () => {
  it('calls sendEmailNotification and sendSmsViaCarrierGateway exactly once each, with the row and a storeInfo carrying the real store name', async () => {
    const row = mkRealNotificationRow('0011657'); // Purcell, per src/constants.js STORE_NAMES
    await notifyRow(row);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    const [emailRow, emailStoreInfo] = sendEmailMock.mock.calls[0];
    const [smsRow, smsStoreInfo] = sendSmsMock.mock.calls[0];
    expect(emailRow).toBe(row);
    expect(smsRow).toBe(row);
    expect(emailStoreInfo.loc).toBe('0011657');
    expect(emailStoreInfo.name).toBe('Purcell');
    expect(smsStoreInfo).toEqual(emailStoreInfo);
  });

  it('falls back to the raw loc when the store is not in STORE_NAMES', async () => {
    const row = mkRealNotificationRow('9999999');
    await notifyRow(row);
    const [, storeInfo] = sendEmailMock.mock.calls[0];
    expect(storeInfo.name).toBe('9999999');
  });
});

describe('deliverNotifications — fires BOTH channels once per row in notificationRows, no more no less', () => {
  it('three notification rows -> exactly 3 email sends + 3 sms sends, one pair per row', async () => {
    const rows = [
      mkRealNotificationRow('0011657'),
      mkRealNotificationRow('0005183'),
      mkRealNotificationRow('0006178'),
    ];
    await deliverNotifications(rows);

    expect(sendEmailMock).toHaveBeenCalledTimes(3);
    expect(sendSmsMock).toHaveBeenCalledTimes(3);
    const emailedLocs = sendEmailMock.mock.calls.map(c => c[0].loc);
    expect(emailedLocs).toEqual(['0011657', '0005183', '0006178']);
  });

  it('an empty notificationRows list sends nothing', async () => {
    await deliverNotifications([]);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it('a rejected send for one row does not stop the next row from being delivered', async () => {
    sendEmailMock.mockResolvedValueOnce(false); // simulates a warned, non-throwing failure
    const rows = [mkRealNotificationRow('0011657'), mkRealNotificationRow('0005183')];
    await deliverNotifications(rows);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(sendSmsMock).toHaveBeenCalledTimes(2);
  });
});
