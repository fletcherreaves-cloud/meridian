// scripts/lib/qsrsoft-ebos-line-items.mjs — pure transform, no side effects.
// Shared by qsrsoft-ebos-pull.mjs's Node-side fetch path (runWithToken) and tested directly here
// -- qsrsoft-ebos-pull.mjs itself can't be imported in a test, its main() runs unconditionally at
// module load with no import.meta.url guard. The Playwright in-browser fallback path can't import
// this module either (page.evaluate() has no module access), so it carries its own inline copy of
// the same logic -- keep the two in sync if this changes.

// Same filter qsrsoft-ebos-pull.mjs's aggregateByDate() uses for the daily "Total Purchases"
// total: Purchase + Credit + Adjustment records only. Transfers (In/Out) move existing stock
// between stores, not a new invoiced price, so they're excluded here for the same reason.
const PURCHASE_RECORD_TYPES = new Set(['Purchase', 'Credit', 'Adjustment']);
export const isPurchaseRecord = rt => PURCHASE_RECORD_TYPES.has(rt);

// One row per purchase-ledger line (not aggregated by day) -- the wrin/description/invoice detail
// aggregateByDate() itself discards after summing into the 5 category totals.
export function toLineItemRows(items, nsn) {
  const loc = String(nsn).padStart(7, '0');
  const rows = [];
  for (const item of items || []) {
    if (!isPurchaseRecord(item.record_type)) continue;
    const posted_date = item.posted_date;
    if (!posted_date) continue;
    rows.push({
      loc, posted_date,
      record_type:        item.record_type || null,
      wrin:                item.wrin || null,
      description:         item.description || null,
      invoice_identifier:  item.invoice_identifier || null,
      ebos_item_id:        item.line_item_id != null ? String(item.line_item_id) : (item.id != null ? String(item.id) : null),
      food_sub:            item.food_sub       || 0,
      paper_sub:           item.paper_sub      || 0,
      ops_sub:             item.ops_sub        || 0,
      happy_meal_sub:      item.happy_meal_sub || 0,
      other_sub:           item.other_sub      || 0,
      total_amount:        item.total_amount   || 0,
      raw:                 item,
    });
  }
  return rows;
}
