// @ts-nocheck
// ── Conversion Efficiency Ratio — rollup engine (owner request 2026-10-19) ───────────────────
// Pure helpers over conversion_efficiency rows (shape: see parsers/conversion-efficiency.js's
// header) for the ReportShell-based viewing panel in views/conversion-efficiency.js.
//
// The two $ fields split cleanly by what they measure, and that split drives the one rule this
// whole module exists to enforce:
//   - financial_opportunity_annual / excess_cases_annual are ALREADY trailing-52-week ANNUALIZED
//     estimates, baked fresh into every monthly report. Summing them across two periods for the
//     same store double-counts the same 52-week window, not two different ones.
//   - financial_impact_ytd is a running Jan-to-date total, so it's also NOT additive across
//     periods for the same store (a later period's YTD figure already includes the earlier one).
// So a multi-period range never sums across periods for one store — it always collapses to that
// store's single LATEST period within the range ("never average averages" / correct-math
// standing rule, CLAUDE.md). Summing IS correct across DIFFERENT stores' own latest figures,
// which is exactly what a district rollup needs.

// Filters rows to those whose period (YYYY-MM) falls within a ReportShell date range.
export function periodsInRange(rows, range) {
  if (!range) return rows;
  const from = range.s ? String(range.s).slice(0, 7) : null;
  const to = range.e ? String(range.e).slice(0, 7) : null;
  return rows.filter(r => r.period && (!from || r.period >= from) && (!to || r.period <= to));
}

// Each store's most recent period present in `rows` — the window this module reports against.
export function latestPeriodByStore(rows) {
  const byLoc = new Map();
  for (const r of rows) {
    if (!r.loc || !r.period) continue;
    const cur = byLoc.get(r.loc);
    if (!cur || r.period > cur) byLoc.set(r.loc, r.period);
  }
  return byLoc;
}

// { storeRows, itemsByLoc } — storeRows is one row per store (its latest period in range only);
// itemsByLoc is that same latest-period item-level detail, keyed by loc, for drill-down.
export function buildConversionEfficiencyReport(allRows, { locs, range } = {}) {
  const locSet = locs && locs.length ? new Set(locs.map(String)) : null;
  const scoped = locSet ? allRows.filter(r => locSet.has(String(r.loc))) : allRows.slice();
  const inRange = periodsInRange(scoped, range);
  const latest = latestPeriodByStore(inRange);

  const itemsByLoc = new Map();
  for (const r of inRange) {
    if (latest.get(r.loc) !== r.period) continue;
    if (!itemsByLoc.has(r.loc)) itemsByLoc.set(r.loc, []);
    itemsByLoc.get(r.loc).push(r);
  }

  const storeRows = [];
  for (const [loc, items] of itemsByLoc) {
    let totalOpportunityAnnual = 0, totalImpactYtd = 0;
    let worstItem = null;
    for (const it of items) {
      if (it.financial_opportunity_annual != null) totalOpportunityAnnual += it.financial_opportunity_annual;
      if (it.financial_impact_ytd != null) totalImpactYtd += it.financial_impact_ytd;
      if (it.financial_opportunity_annual != null &&
          (!worstItem || it.financial_opportunity_annual > worstItem.financial_opportunity_annual)) {
        worstItem = it;
      }
    }
    storeRows.push({
      loc, loc_name: items[0]?.loc_name || null, owner_name: items[0]?.owner_name || null,
      period: latest.get(loc), itemCount: items.length,
      totalOpportunityAnnual, totalImpactYtd,
      worstItem: worstItem ? worstItem.raw_item : null,
      worstItemOpportunity: worstItem ? worstItem.financial_opportunity_annual : null,
    });
  }
  storeRows.sort((a, b) => (b.totalOpportunityAnnual || 0) - (a.totalOpportunityAnnual || 0));

  return { storeRows, itemsByLoc };
}

// The 18-item drill-down for one store, worst-opportunity-first.
export function itemsForStore(itemsByLoc, loc) {
  const items = itemsByLoc.get(String(loc)) || [];
  return items.slice().sort((a, b) => (b.financial_opportunity_annual || 0) - (a.financial_opportunity_annual || 0));
}
