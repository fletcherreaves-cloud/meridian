// @ts-nocheck
// src/engine/store-settings.js — cash-relevant slice of the QSRSoft store_settings config payload
// (scripts/qsrsoft-store-settings-pull.mjs -> qsr_store_settings.settings jsonb). The endpoint
// returns a much larger config object (inventory/yield-groups, waste limits, store hours,
// dayparts, homepage-metric thresholds); this pulls out ONLY the drawer/safe/instore sections --
// the owner's stated interest ("cash-control automation") -- as a flat, stable shape a panel can
// read without knowing the raw payload's nesting. The raw jsonb blob is preserved unmodified in
// the DB either way (same discipline qsr_store_controls uses), so nothing here is lossy.
export function extractCashSettings(raw = {}) {
  const drawer = raw?.drawer ?? {};
  const safe = raw?.safe ?? {};
  const instore = raw?.instore ?? {};
  return {
    drawerStartAmount: drawer.settingDrawerAmount ?? null,
    drawerCount: drawer.settingDrawerCount ?? null,
    drawerStartAmountSecond: drawer.settingDrawerAmountSecond ?? null,
    drawerCountSecond: drawer.settingDrawerCountSecond ?? null,
    armoredCarService: drawer.settingArmoredCarService ?? null,
    smartSafes: drawer.settingSmartSafes ?? null,
    validateDeposits: drawer.settingValidateDeposits ?? null,
    allowCashAdjustments: drawer.settingAllowCashAdjustments ?? null,
    allowDepositAdjustments: drawer.settingAllowDepositAdjustments ?? null,
    cashRecyclerEnabled: drawer.cash_recycler_enabled ?? null,
    disableManualRefunds: drawer.disable_manual_refunds ?? null,
    safeBackupAmount: safe.settingBackupAmount ?? null,
    safePettyCash: safe.settingPettyCash ?? null,
    safeCoinMagazineAmount: safe.settingCoinMagazineAmount ?? null,
    safeGiftCertificateInventory: safe.settingGiftCertificateInventory ?? null,
    maxStorewideCash: instore.settingMaxStorewide ?? null,
    maxDrawerCash: instore.settingMaxDrawer ?? null,
    maxDrawerOverShort: instore.settingMaxDrawerOverShort ?? null,
    promoPercentage: instore.settingPromoPercentage ?? null,
    discountPercentage: instore.settingDiscountPercentage ?? null,
    couponPercentage: instore.settingCouponPercentage ?? null,
    giftCertDollarVariance: instore.settingGiftCertDollarVariance ?? null,
    giftCertQuantityVariance: instore.settingGiftCertQuantityVariance ?? null,
    requiredDailyDeposits: instore.settingRequiredNumberDailyDeposits ?? null,
    depositValidationDaysPastDue: instore.settingDepositValidationsDaysPastDue ?? null,
  };
}
