// @ts-nocheck
// Store Settings automation (memory/project-qsrsoft-store-settings-endpoint.md) — owner-captured
// live 2026-09-04 while exploring cash-control automation leads. Tests the pure extractor
// (extractCashSettings, src/engine/store-settings.js) against a REAL captured store_settings
// response for store 3708 (not an invented fixture).
import { describe, it, expect } from 'vitest';
import { extractCashSettings } from '../engine/store-settings.js';

// Full real response, GET https://prod-green.ebos.qsrsoft.com/store_settings/3708/settings, 2026-09-04.
const REAL_RESPONSE = {
  drawer: {
    settingDrawerAmount: 100, settingDrawerCount: 6, settingDrawerAmountSecond: null,
    settingDrawerCountSecond: null, settingArmoredCarService: true, settingSmartSafes: true,
    settingValidateDeposits: true, settingEnvelopeLabelPreference: null,
    settingAllowCashAdjustments: false, settingAllowDepositAdjustments: 'ASU',
    settingUseDaypartCodes: false, settingUseCustomCodes: false, settingDepositDaypartCodes: [],
    settingDepositCustomCodes: [], cash_recycler_enabled: false, drawer_billable_enabled: false,
    show_drawer_billable: false, watermark_json: null, settings_json: null,
    disable_manual_refunds: false,
  },
  safe: {
    settingBackupAmount: 1800, settingPettyCash: 0, settingCoinMagazineUsage: 0,
    settingCoinMagazineAmount: 0, settingCoinMagazineCount: 0, settingGiftCertificateInventory: 0,
    settingOtherSafeItems: 0, settingOtherName: '', settingSafeDollarsPettyCash: 0,
    settingSafeDollarsCoinMag: 0,
  },
  instore: {
    settingMaxStorewide: 10, settingMaxDrawer: 2, settingPromoPercentage: 1,
    settingDiscountPercentage: 1, settingCouponPercentage: 1, settingGiftCertDollarVariance: 5,
    settingGiftCertQuantityVariance: 5, settingRequiredNumberDailyDeposits: 1,
    settingDepositValidationsDaysPastDue: 4, settingMaxDrawerOverShort: 100,
    settingSAFAlertThreshold: null,
  },
};

describe('extractCashSettings', () => {
  it('maps the real drawer/safe/instore fields, camelCased, against the live-captured response', () => {
    expect(extractCashSettings(REAL_RESPONSE)).toEqual({
      drawerStartAmount: 100, drawerCount: 6, drawerStartAmountSecond: null, drawerCountSecond: null,
      armoredCarService: true, smartSafes: true, validateDeposits: true,
      allowCashAdjustments: false, allowDepositAdjustments: 'ASU',
      cashRecyclerEnabled: false, disableManualRefunds: false,
      safeBackupAmount: 1800, safePettyCash: 0, safeCoinMagazineAmount: 0, safeGiftCertificateInventory: 0,
      maxStorewideCash: 10, maxDrawerCash: 2, maxDrawerOverShort: 100,
      promoPercentage: 1, discountPercentage: 1, couponPercentage: 1,
      giftCertDollarVariance: 5, giftCertQuantityVariance: 5,
      requiredDailyDeposits: 1, depositValidationDaysPastDue: 4,
    });
  });

  it('a missing drawer/safe/instore section maps to nulls, not a throw', () => {
    const out = extractCashSettings({});
    expect(out.drawerStartAmount).toBeNull();
    expect(out.safeBackupAmount).toBeNull();
    expect(out.maxStorewideCash).toBeNull();
  });

  it('a zero petty-cash / zero max-drawer value round-trips as 0, not null (falsy-but-real)', () => {
    const out = extractCashSettings(REAL_RESPONSE);
    expect(out.safePettyCash).toBe(0);
    expect(out.safeCoinMagazineAmount).toBe(0);
  });

  it('called with no argument at all defaults cleanly (raw = {})', () => {
    expect(() => extractCashSettings()).not.toThrow();
    expect(extractCashSettings().drawerStartAmount).toBeNull();
  });
});
