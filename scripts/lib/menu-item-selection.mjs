// scripts/lib/menu-item-selection.mjs — shared item-selection for per-menu-item eBOS pulls.
//
// Extracted from qsrsoft-menu-item-activity-pull.mjs (dispatch #193) on its second use
// (qsrsoft-menu-item-recipe-pull.mjs) — CLAUDE.md's own "check whether a helper exists before
// writing one" rule: a second near-identical copy is exactly how these things drift (four copies
// of the org map, three of scheduled-hours, before this repo's history). Behavior is unchanged
// from the original inline functions — this is a pure code move, `supabase` now passed in rather
// than closed over a module-scope client, so both callers use their own client instance.
//
// Selects the SAME trailing-window item_numbers dispatch #186's sizing measurement was made
// against (memory/finding-menu-item-activity-subset-2026-08-28.md, ~330-390/store) — change the
// window only with a fresh measurement, not casually, since callers rely on this scope matching.

// ── Item selection: trailing-windowDays active item_numbers from qsr_product_mix, paginated ────
export async function activeItemNumbers(supabase, withRetry, loc, cutoff) {
  const items = new Set();
  const PAGE = 5000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await withRetry(
      () => supabase.from('qsr_product_mix').select('item').eq('loc', loc).gte('date', cutoff).range(from, from + PAGE - 1),
      { label: 'qsr_product_mix select' },
    );
    if (error) throw new Error(`qsr_product_mix query failed for ${loc}: ${error.message}`);
    for (const r of data || []) if (r.item != null) items.add(Number(r.item));
    if (!data || data.length < PAGE) break;
  }
  return items;
}

// ── Catalog lookup: this store's qsr_menu_items, item_number -> {storeMenuitemId, value} ────────
export async function catalogLookup(supabase, withRetry, loc) {
  const map = new Map();
  const PAGE = 5000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await withRetry(
      () => supabase.from('qsr_menu_items').select('store_menuitem_id,item_number,value').eq('loc', loc).range(from, from + PAGE - 1),
      { label: 'qsr_menu_items select' },
    );
    if (error) throw new Error(`qsr_menu_items query failed for ${loc}: ${error.message}`);
    for (const r of data || []) if (r.item_number != null) map.set(Number(r.item_number), { storeMenuitemId: r.store_menuitem_id, value: r.value });
    if (!data || data.length < PAGE) break;
  }
  return map;
}
