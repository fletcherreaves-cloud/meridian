// @ts-nocheck
// ── OEPE dollar-value calculation ───────────────────────────────────────────────
// Extracted from views/store-analytics.js's computeRevenueOpportunity (RevenueIntelligence
// panel) — Decisions Panel Inventory salvage #4, decisions-panel-inventory-2026-08-10.md:
// "fills a real hole: slowDT currently reports dollars: 0, so slow drive-thrus cannot rank
// against FOB or sales items." That panel already computes exactly this figure per store; the
// gap was that engine/attention-feed.js's slowDT detector had no way to reuse it. Pure
// relocation, same split pattern as engine/inventory-transfers.js — store-analytics.js imports
// this back for RevenueIntelligence's own use, zero behavior change there.
//
// `p` = a store's computed perf object (oepe, dtGC, avgCheck, laborPct, tpph — the same shape
// buildStore/computeStoreYear produce). `t` = its targets object (tOepe). Returns null when the
// store isn't over its OEPE target (nothing to compute) or lacks the inputs to compute it.
export function computeOepeDollarGap(p, t) {
  if (!(p && t && p.oepe > 0 && t.tOepe > 0 && p.oepe > t.tOepe)) return null;
  const gapSec = p.oepe - t.tOepe;
  const dtGCPerHour = p.dtGC > 0 ? p.dtGC : 50; // cars/hour estimate
  const avgCheck = p.avgCheck > 0 ? p.avgCheck : (p.laborPct > 0 && p.tpph > 0 ? 9.50 : 8.50);
  // At current OEPE, cars/hr = 3600/OEPE. At target, = 3600/tOepe.
  const currentRate = 3600 / p.oepe;
  const targetRate = 3600 / t.tOepe;
  const addlCarsPerHour = Math.max(0, targetRate - currentRate);
  const revenuePerHour = addlCarsPerHour * avgCheck;
  const peakHours = 4; // conservative: breakfast+lunch peak
  const dailyOpportunity = revenuePerHour * peakHours;
  const monthlyOpportunity = dailyOpportunity * 30;
  const valuePerSecond = dailyOpportunity / gapSec;
  return {
    gapSec, addlCarsPerHour: +addlCarsPerHour.toFixed(2),
    dailyOpportunity: +dailyOpportunity.toFixed(2), monthlyOpportunity: +monthlyOpportunity.toFixed(0),
    valuePerSecond: +valuePerSecond.toFixed(2), avgCheck, dtGCPerHour,
  };
}
