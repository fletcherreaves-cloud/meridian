// @ts-nocheck
export default {version:'5.317', date:'2026-09-02', changes:[
  'Pricing Engine: ingredient-level recipe/BOM lookup -- owner-captured live recon (2026-09-01) ' +
  'found QSRSoft\'s recipe/BOM endpoint (GET /menuitems/{id}), closing the "no current source at ' +
  'all" gap the legacy-workbook investigation flagged for Martin Brower-tier ingredient cost. New ' +
  'auto-pull (scripts/qsrsoft-menu-item-recipe-pull.mjs, qsr_menu_item_recipe table) covers every ' +
  'item actually sold (same trailing-90-day scope the sibling menu-item-activity pull uses) -- ' +
  'NOT qsr_raw_item_info, which is scoped to only the top-50-by-variance ingredients per store and ' +
  'cannot answer "what\'s the recipe for this item" for most items. Current-state data (recipes ' +
  'change rarely), so re-pulled only when an item\'s stored row goes stale (21 days) or is new, not ' +
  'daily in full -- cheap after the initial backfill.',
  'Item Lookup\'s search results now have a "▸ Recipe" toggle per item, showing its ingredient ' +
  'list (WRIN, description, food/paper class, servings, unit cost, cost contribution), family ' +
  'group / daypart / POS status, and a cross-check against the margin-table\'s own cost (flagged ' +
  'if the two independently-computed numbers disagree by more than 2¢). District-wide scope shows ' +
  'a per-store breakdown, since recipe cost can differ store to store. "No recipe data pulled yet" ' +
  'shown explicitly for items the backfill hasn\'t reached, never confused with zero-cost.',
  'Extracted activeItemNumbers/catalogLookup (item-selection: trailing-90d qsr_product_mix active ' +
  'items ∩ qsr_menu_items catalog) from qsrsoft-menu-item-activity-pull.mjs into a shared ' +
  'scripts/lib/menu-item-selection.mjs on its second use, rather than write a third near-identical ' +
  'copy.',
]};
