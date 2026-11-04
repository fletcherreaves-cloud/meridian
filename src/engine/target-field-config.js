// @ts-nocheck
// ── Target field customization (owner-requested 2026-11-04) ──────────────────────────────────
// Owner, verbatim: "how we can add settings to the targets so they may be customized as needed.
// Need to be able to add or remove metrics and categories on monthly and yearly."
//
// Both Monthly Targets (analytics.js's PROJ_FIELDS, a flat array tagged with a `g` group) and
// Yearly Targets (yearly-projections.js's YEARLY_CATS, a nested array of categories each
// holding its own fields) are static, hardcoded field lists today. Every field is tied to a
// REAL data column (monthly_targets.tProdSales, yearly_targets.tOepe, etc.) -- there's no
// backing store for a genuinely novel metric with no existing column, so this module does NOT
// invent new metrics out of nothing. What it DOES do, with zero schema change: let the owner
// show/hide any of the existing fields ("remove" a metric from the grid without deleting its
// data), rename a field's display label, and regroup fields into owner-named categories
// ("add"/reorganize categories) -- all via one JSON config object already storable through the
// existing settings/org_config mechanism this app uses for every other org-level preference.
// See memory/plan-target-field-customization-2026-11-04.md for the full design, including the
// Tier 2 (genuinely new custom metrics, which WOULD need a schema change) option left for later.
//
// `items`: a flat array of field definitions, each needing at minimum {key, g} (Monthly's own
// shape) or {k, g} (Yearly's shape, once flattened by the caller) -- this module reads whichever
// of `key`/`k` is present, so it works unmodified against either source array.
// `config`: { fields: { [fieldKey]: {hidden?, group?, order?, label?} },
//             groups: { [groupName]: {label?, order?} } }
// Returns a NEW array (never mutates `items`), filtered/relabeled/regrouped/sorted — never
// hides or reorders anything when `config` is null/undefined/empty (today's exact behavior for
// anyone who's never touched this).

const _fieldId = (item) => item.key ?? item.k;

export function applyFieldConfig(items, config) {
  if (!Array.isArray(items)) return items;
  if (!config || (!config.fields && !config.groups)) return items.slice();
  const fieldCfg = config.fields || {};
  const groupCfg = config.groups || {};

  const withOverrides = items
    .map((item, idx) => {
      const id = _fieldId(item);
      const fc = fieldCfg[id];
      if (fc && fc.hidden) return null;
      const origGroup = item.g;
      const group = (fc && fc.group) || origGroup;
      const gc = groupCfg[group];
      return {
        ...item,
        g: group,
        l: (fc && fc.label) || item.l,
        _origIdx: idx,
        _fieldOrder: fc && typeof fc.order === 'number' ? fc.order : null,
        _groupLabel: (gc && gc.label) || group,
        _groupOrder: gc && typeof gc.order === 'number' ? gc.order : null,
      };
    })
    .filter(Boolean);

  // Stable sort: group order (explicit, else first-seen order among surviving items), then
  // field order within the group (explicit, else original position).
  const groupFirstSeen = {};
  withOverrides.forEach((it, i) => { if (!(it.g in groupFirstSeen)) groupFirstSeen[it.g] = i; });

  withOverrides.sort((a, b) => {
    const ao = a._groupOrder != null ? a._groupOrder : groupFirstSeen[a.g];
    const bo = b._groupOrder != null ? b._groupOrder : groupFirstSeen[b.g];
    if (ao !== bo) return ao - bo;
    const afo = a._fieldOrder != null ? a._fieldOrder : a._origIdx;
    const bfo = b._fieldOrder != null ? b._fieldOrder : b._origIdx;
    return afo - bfo;
  });

  // Apply the group label override (group key itself stays the stable identity fields key off
  // of; `_groupLabel` is what a renderer should actually print) and strip the internal sort keys.
  return withOverrides.map(({ _origIdx, _fieldOrder, _groupLabel, _groupOrder, ...rest }) =>
    ({ ...rest, g: _groupLabel }));
}

// Yearly's YEARLY_CATS is nested (categories each holding their own fields, field key `k` not
// `key`), not flat like Monthly's PROJ_FIELDS. Flattens it to the shape applyFieldConfig expects
// (each field tagged with its owning category's key as `g`), applies the same config, then
// regroups into the nested {key,label,icon,fields} shape every YEARLY_CATS consumer already
// expects -- so this is a drop-in replacement for YEARLY_CATS at render time, not a new shape
// callers need to learn. `icon` is preserved from whichever category a group's fields most
// commonly came from (first field's original category), since a renamed/merged group has no
// single natural icon of its own.
export function applyCategoryConfig(categories, config) {
  if (!Array.isArray(categories)) return categories;
  if (!config || (!config.fields && !config.groups)) {
    return categories; // unchanged — applyFieldConfig would also no-op, skip the reshape entirely
  }
  const flat = [];
  const iconByOrigKey = {};
  for (const cat of categories) {
    iconByOrigKey[cat.key] = cat.icon;
    for (const f of (cat.fields || [])) flat.push({ ...f, g: cat.key, _origCatKey: cat.key });
  }
  const transformed = applyFieldConfig(flat, config);
  const byGroup = {};
  const groupOrderSeen = [];
  for (const f of transformed) {
    if (!byGroup[f.g]) { byGroup[f.g] = []; groupOrderSeen.push(f.g); }
    byGroup[f.g].push(f);
  }
  return groupOrderSeen.map(label => {
    // Icon comes from this group's first field's ORIGINAL category — correct for a renamed-
    // only group (still one original category) and a reasonable pick for a merged one (first
    // field wins); a group config can still set its own via groups[label].icon if needed later.
    const origKey = byGroup[label][0]._origCatKey;
    return {
      key: label, // the (possibly renamed) group label doubles as this synthesized category's key
      label,
      icon: iconByOrigKey[origKey] || '📋',
      fields: byGroup[label].map(({ _origCatKey, ...f }) => f),
    };
  });
}
