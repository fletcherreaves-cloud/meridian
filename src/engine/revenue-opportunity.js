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

// ── Daypart erosion (competitive pressure signal) ───────────────────────────────
// Extracted from views/store-analytics.js's computeRevenueOpportunity block 3 — Decisions Panel
// Inventory salvage #5. Also already live in RevenueIntelligence (that panel's own subtitle:
// "...Daypart erosion · Competitive pressure signals..."); this pass only extracts it so
// attention-feed.js can reuse it, same split pattern as computeOepeDollarGap above.
//
// A store-wide sales decline usually moves every daypart together (macro traffic, economy). ONE
// daypart eroding while the others hold is a different signature — a nearby competitor taking
// share in a specific window. `ds.peaksSalesRows` = the 3 Peaks manual-upload sales rows;
// `settings.weeksBack` (default 6) sets both the lookback window and its own 2x-longer
// comparison base. Returns null when there isn't at least 2 dayparts with ≥3 rows in both the
// recent and older windows to compare.
const PEAK_SLICES = {
  '7am-9am': 'breakfast', '7am - 9am': 'breakfast', 'breakfast': 'breakfast',
  '11am-2pm': 'lunch', '11am - 2pm': 'lunch', 'lunch': 'lunch',
  '5pm-7pm': 'dinner', '5pm - 7pm': 'dinner', 'dinner': 'dinner',
};
function normSlice(s) { return PEAK_SLICES[s.toLowerCase().trim()] || s.toLowerCase().replace(/\s/g, ''); }

export function computeDaypartErosion(loc, ds, settings) {
  if (!(ds && ds.peaksSalesRows)) return null;
  const locStr = String(loc || '').trim();
  const wb6 = (settings && settings.weeksBack) || 6;
  const cut12 = new Date(Date.now() - wb6 * 2 * 7 * 86400000); // 2× lookback for comparison base
  const cut6 = new Date(Date.now() - wb6 * 7 * 86400000); // lookback period
  const slices = ['breakfast', 'lunch', 'dinner'];
  const erosion = {};
  for (const sl of slices) {
    const all = ds.peaksSalesRows.filter(r => String(r.loc || '').trim() === locStr && normSlice(r.slice) === sl && r.date >= cut12);
    const recent = all.filter(r => r.date >= cut6);
    const older = all.filter(r => r.date < cut6);
    if (recent.length >= 3 && older.length >= 3) {
      const avgR = recent.reduce((a, r) => a + r.netSales, 0) / recent.length;
      const avgO = older.reduce((a, r) => a + r.netSales, 0) / older.length;
      const trend = avgO > 0 ? (avgR - avgO) / avgO : 0;
      erosion[sl] = { trend: +trend.toFixed(4), avgRecent: +avgR.toFixed(0), avgOlder: +avgO.toFixed(0) };
    }
  }
  if (Object.keys(erosion).length < 2) return null;
  const trends = Object.values(erosion).map(e => e.trend);
  const overallTrend = trends.reduce((a, v) => a + v, 0) / trends.length;
  const maxVariance = Math.max(...trends) - Math.min(...trends);
  // Asymmetric: one daypart significantly worse than others
  const isAsymmetric = maxVariance > 0.06;
  const worstSlice = Object.entries(erosion).sort((a, b) => a[1].trend - b[1].trend)[0];
  const bestSlice = Object.entries(erosion).sort((a, b) => b[1].trend - a[1].trend)[0];
  return {
    erosion, overallTrend: +overallTrend.toFixed(4), isAsymmetric,
    worstSlice: worstSlice[0], worstTrend: worstSlice[1].trend,
    bestSlice: bestSlice[0], bestTrend: bestSlice[1].trend,
    competitiveSignal: isAsymmetric && worstSlice[1].trend < -0.05,
    explanation: isAsymmetric && worstSlice[1].trend < -0.05
      // Matches views/store-analytics.js's original fPct(Math.abs(trend), 2) call exactly —
      // fPct always prepends '+' for a >=0 input, so an already-abs'd value reads "+5.23%" here.
      // A cosmetic quirk, not fixed here: this extraction preserves existing behavior byte for
      // byte rather than silently changing display text no one asked to change.
      ? `${worstSlice[0].charAt(0).toUpperCase() + worstSlice[0].slice(1)} is declining +${(Math.abs(worstSlice[1].trend) * 100).toFixed(2)}% while other dayparts hold — this is the signature of a nearby competitor taking market share in a specific window, not an overall traffic issue. Check what opened near this store in the last 90 days.`
      : overallTrend < -0.03
        ? 'All dayparts declining proportionally — likely a traffic, economic, or macro-level issue rather than a competitive threat.'
        : 'Daypart mix is stable. No asymmetric erosion detected.',
  };
}
