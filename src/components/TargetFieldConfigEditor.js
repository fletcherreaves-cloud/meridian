// @ts-nocheck
// ── Target field customization editor (owner-requested 2026-11-04) ───────────────────────────
// Owner, verbatim: "how we can add settings to the targets so they may be customized as needed.
// Need to be able to add or remove metrics and categories on monthly and yearly."
// Shared UI for both Monthly Projections (analytics.js) and Yearly Targets (yearly-
// projections.js) -- built against src/engine/target-field-config.js's config shape
// ({fields:{id:{hidden,label,group,order}}, groups:{groupKey:{label,order}}}).
//
// Tier 2 (owner-requested 2026-11-05, task #93) -- "add or remove metrics", not just hide/
// relabel/regroup the EXISTING ones. `config.customMetrics`: [{id, label, group}], the as-added
// identity of each genuinely new metric (same role `fields` plays for built-ins) -- separate from
// `config.fields`/`config.groups`, which still carry any later hide/rename/regroup drafts for a
// custom metric exactly like they do for a built-in one (a custom field's id is just another id
// once added, so the entire existing per-row UI below -- checkbox/label/category dropdown --
// applies to it unmodified). `customMetricOptions`: [{key,label}] the owner can pick a new metric
// FROM (engine/top-bottom-performers.js's PERFORMER_METRICS at both real call sites) -- omitted
// or empty hides the "+ Add a metric" section entirely, so this component stays usable anywhere
// Tier 1 alone is wanted.
//
// Reorder + explicit category add/remove (owner-requested, task #89, 2026-11-06). `order` was
// always SUPPORTED by target-field-config.js's engine (applyFieldConfig/applyCategoryConfig
// already sort on fields[id].order / groups[g].order -- see that file's own tests) but never
// exposed here, deliberately, at build time. This pass wires it in:
//   - Up/down buttons reorder a field within its category, or a category among its siblings --
//     each move renumbers every sibling's `order` sequentially (0..n-1) rather than juggling
//     fractional values, so the stored config always stays a clean, explicit ranking.
//   - A category is no longer only implicit. "+ Add category" creates a real, empty, named group
//     (persisted as a `groups[key]` entry with zero fields pointing to it yet -- the engine
//     already treats an unreferenced group key as perfectly valid, inert config; see
//     applyFieldConfig's per-field `groupCfg[group]` lookup, which simply never fires for a key
//     no field carries). "Retire category" bulk-moves every field currently in a non-empty
//     category to another category (or hides all of them) in one click, instead of the
//     field-by-dropdown dance the previous version required -- the category then empties out and
//     disappears from the rendered list exactly as it always has (the engine was already dropping
//     empty groups; this just makes clearing one deliberate and one click instead of N).
//   - The per-field category dropdown now offers every REAL known category (original, custom, or
//     currently-empty) as a destination, not just the originals -- previously the only way to
//     move a field into an existing custom category was to retype its exact name via
//     "+ New category...". A strict usability improvement bundled into the same pass since it's
//     the same underlying "what categories exist" list this work had to build anyway.
// See memory/plan-target-field-customization-2026-11-04.md for the Tier 1/2 design; items 4
// (a picker for metrics never in PROJ_FIELDS/YEARLY_CATS at all) and 5 (daypart-split targets)
// from task #89's own scope note are explicitly NOT built here -- real new capabilities, the
// second likely needing the owner's own schema decision, tracked as a follow-up.
import React from 'react';
import { ModalShell } from './ModalShell.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);
const input = (p) => h('input', p);
const sel = (p, ...c) => h('select', p, ...c);
const opt = (p, ...c) => h('option', p, ...c);
const { useState } = React;

const NEW_GROUP_SENTINEL = '__tfc_new__';
const HIDE_SENTINEL = '__tfc_hide__';
const CUSTOM_METRIC_GROUP = 'Custom Metrics';

// Swap `ids[idx]` with its neighbor in direction `dir` (-1 up, +1 down). Returns the SAME array
// identity when the move is out of bounds, so a caller can cheaply no-op on a boundary click.
function _swapNeighbor(ids, idx, dir) {
  const j = idx + dir;
  if (idx < 0 || j < 0 || j >= ids.length) return ids;
  const next = ids.slice();
  [next[idx], next[j]] = [next[j], next[idx]];
  return next;
}

const _moveBtnStyle = (disabled) => ({
  fontSize: 9, lineHeight: 1, padding: '2px 4px', background: 'none', border: 'none',
  cursor: disabled ? 'default' : 'pointer', color: disabled ? 'var(--bdr2)' : 'var(--text3)',
});

// `fields`: [{id, label, group, groupLabel}] -- id/label/group are the ORIGINAL (unconfigured)
// identity; groupLabel is that group's own display label (same as `group` for Monthly, whose
// groups have no separate key/label split). `config`: the existing {fields,groups,customMetrics}
// object this field set already carries, or null/undefined for "never customized".
export function TargetFieldConfigEditor({ title, subtitle, fields, config, customMetricOptions, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({
    fields: Object.fromEntries(Object.entries(config?.fields || {}).map(([k, v]) => [k, { ...v }])),
    groups: Object.fromEntries(Object.entries(config?.groups || {}).map(([k, v]) => [k, { ...v }])),
    customMetrics: (config?.customMetrics || []).map(cm => ({ ...cm })),
  }));
  // Fields currently showing a free-text "new category" input instead of the group dropdown.
  const [typingGroupFor, setTypingGroupFor] = useState({});
  const [addMetricKey, setAddMetricKey] = useState('');
  const [newCatName, setNewCatName] = useState('');
  // Which category is mid-"Retire" (showing its destination picker) and what's picked so far.
  const [retiringGroup, setRetiringGroup] = useState(null);
  const [retireTarget, setRetireTarget] = useState('');

  const fc = (id) => draft.fields[id] || {};
  const setField = (id, patch) => setDraft(d => ({ ...d, fields: { ...d.fields, [id]: { ...d.fields[id], ...patch } } }));
  const setGroupLabel = (origGroup, lbl) => setDraft(d => ({ ...d, groups: { ...d.groups, [origGroup]: { ...d.groups[origGroup], label: lbl || undefined } } }));

  // allFields = the built-ins this field set has always had, PLUS whatever custom metrics this
  // session's draft currently holds (freshly added ones included) -- synthesized into the SAME
  // {id,label,group,groupLabel} shape so every bit of logic below (origGroups/byGroup/the row
  // renderer) treats a custom metric exactly like a built-in one, with zero branching.
  const allFields = fields.concat(draft.customMetrics.map(cm => ({ id: cm.id, label: cm.label, group: cm.group || CUSTOM_METRIC_GROUP, groupLabel: cm.group || CUSTOM_METRIC_GROUP, isCustom: true })));

  // Original groups, first-seen order -- each always gets a rename box, even if every one of
  // its fields has since been moved elsewhere (a field can always move back).
  const origGroups = [];
  allFields.forEach(f => { if (!origGroups.includes(f.group)) origGroups.push(f.group); });
  const origGroupLabel = (g) => (allFields.find(f => f.group === g) || {}).groupLabel || g;
  const displayLabel = (g) => (draft.groups[g] && draft.groups[g].label) || origGroupLabel(g);

  // Live effective grouping, reflecting every draft override, so the owner sees the real
  // resulting layout (same grouping applyFieldConfig/applyCategoryConfig would produce).
  const byGroupUnsorted = {};
  const groupOrder = [];
  allFields.forEach(f => {
    const g = fc(f.id).group || f.group;
    if (!(g in byGroupUnsorted)) { byGroupUnsorted[g] = []; groupOrder.push(g); }
    byGroupUnsorted[g].push(f);
  });
  // Sort each group's fields by effective order (explicit draft order, else original position
  // within allFields) -- same stable-fallback semantics as applyFieldConfig's own sort, so the
  // editor shows the layout the engine will actually produce, not just insertion order.
  const fieldIdx = {};
  allFields.forEach((f, i) => { fieldIdx[f.id] = i; });
  const fieldOrderOf = (id) => { const o = fc(id).order; return typeof o === 'number' ? o : fieldIdx[id]; };
  const byGroup = {};
  for (const g of groupOrder) byGroup[g] = byGroupUnsorted[g].slice().sort((a, b) => fieldOrderOf(a.id) - fieldOrderOf(b.id));

  // Categories that exist in config (an explicit "+ Add category", or a lingering label/order
  // override) but currently have zero fields assigned -- still real, still selectable as a
  // destination, just not populated yet. Distinct from a category that was never explicitly
  // created and simply has no fields: those don't appear anywhere, same as before this pass.
  const emptyGroupKeys = Object.keys(draft.groups).filter(g => !groupOrder.includes(g));

  // The full, ordered list of category boxes to render: every populated group plus every
  // explicitly-created-but-still-empty one, sorted by effective group order (explicit
  // draft.groups[g].order, else first-seen position in this combined list).
  const allRenderedGroups = [...groupOrder, ...emptyGroupKeys];
  const groupIdx = {};
  allRenderedGroups.forEach((g, i) => { if (!(g in groupIdx)) groupIdx[g] = i; });
  const groupOrderOf = (g) => { const o = draft.groups[g]?.order; return typeof o === 'number' ? o : groupIdx[g]; };
  const sortedGroupKeys = allRenderedGroups.slice().sort((a, b) => groupOrderOf(a) - groupOrderOf(b));

  // Every real category a field (or a retiring category's fields) could be moved INTO --
  // original, currently-populated-custom, or currently-empty. Superset of the old
  // origGroups-only list, so a field can land directly in an existing custom/empty category
  // instead of having to retype its name via "+ New category...".
  const allKnownGroups = Array.from(new Set([...origGroups, ...allRenderedGroups]))
    .map(g => ({ key: g, label: displayLabel(g) }));

  const addedIds = new Set(allFields.map(f => f.id));
  const availableToAdd = (customMetricOptions || []).filter(m => !addedIds.has(m.key));

  const addMetric = () => {
    const m = availableToAdd.find(m => m.key === addMetricKey) || availableToAdd[0];
    if (!m) return;
    setDraft(d => ({ ...d, customMetrics: [...d.customMetrics, { id: m.key, label: m.label, group: CUSTOM_METRIC_GROUP }] }));
    setAddMetricKey('');
  };
  const removeCustomMetric = (id) => setDraft(d => ({
    ...d,
    customMetrics: d.customMetrics.filter(cm => cm.id !== id),
    fields: Object.fromEntries(Object.entries(d.fields).filter(([k]) => k !== id)), // drop any hide/rename/regroup draft on it too
  }));

  // Move field `id` up/down within its CURRENT group, renumbering every sibling in that group
  // to a clean sequential order (0..n-1) -- never leaves a fractional/duplicate order behind.
  const moveField = (groupKey, id, dir) => {
    const ids = (byGroup[groupKey] || []).map(f => f.id);
    const idx = ids.indexOf(id);
    const next = _swapNeighbor(ids, idx, dir);
    if (next === ids) return;
    setDraft(d => {
      const fieldsNext = { ...d.fields };
      next.forEach((fid, i) => { fieldsNext[fid] = { ...fieldsNext[fid], order: i }; });
      return { ...d, fields: fieldsNext };
    });
  };

  // Move category `g` up/down among all currently-rendered categories, same renumber-everyone
  // approach as moveField.
  const moveGroup = (g, dir) => {
    const idx = sortedGroupKeys.indexOf(g);
    const next = _swapNeighbor(sortedGroupKeys, idx, dir);
    if (next === sortedGroupKeys) return;
    setDraft(d => {
      const groupsNext = { ...d.groups };
      next.forEach((gk, i) => { groupsNext[gk] = { ...groupsNext[gk], order: i }; });
      return { ...d, groups: groupsNext };
    });
  };

  // "+ Add category" -- a real, empty, named group. Slugs the name into a stable key, de-duped
  // against every key already in use (original or custom) so two categories can share a display
  // label without colliding on identity.
  const addCategory = () => {
    const name = newCatName.trim();
    if (!name) return;
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'category';
    const taken = new Set([...origGroups, ...allRenderedGroups]);
    let key = base, n = 2;
    while (taken.has(key)) { key = base + '_' + n; n++; }
    setDraft(d => ({ ...d, groups: { ...d.groups, [key]: { label: name } } }));
    setNewCatName('');
  };

  // Remove a category that currently has zero fields -- nothing to reassign, so this is always
  // safe. (A populated category goes through "Retire" below instead, which moves its fields
  // first.)
  const removeEmptyCategory = (g) => setDraft(d => {
    const groups = { ...d.groups };
    delete groups[g];
    return { ...d, groups };
  });

  const startRetire = (g) => { setRetiringGroup(g); setRetireTarget(''); };
  const cancelRetire = () => { setRetiringGroup(null); setRetireTarget(''); };
  // Bulk-moves (or hides) every field currently in `g`, in one click, instead of the
  // field-by-field dropdown dance. The category itself needs no separate deletion -- once no
  // field points to it, it drops out of groupOrder/allRenderedGroups the same way it always has.
  const confirmRetire = (g) => {
    const ids = (byGroup[g] || []).map(f => f.id);
    const target = retireTarget;
    if (!target) return;
    setDraft(d => {
      const fieldsNext = { ...d.fields };
      ids.forEach(id => {
        const orig = allFields.find(f => f.id === id);
        if (target === HIDE_SENTINEL) fieldsNext[id] = { ...fieldsNext[id], hidden: true };
        else fieldsNext[id] = { ...fieldsNext[id], group: target === orig?.group ? undefined : target };
      });
      return { ...d, fields: fieldsNext };
    });
    setRetiringGroup(null); setRetireTarget('');
  };

  const reset = () => { setDraft({ fields: {}, groups: {}, customMetrics: [] }); setTypingGroupFor({}); cancelRetire(); };

  const save = () => {
    const cleanFields = {};
    for (const [id, v] of Object.entries(draft.fields)) {
      const c = {};
      if (v.hidden) c.hidden = true;
      if (v.label) c.label = v.label;
      if (v.group) c.group = v.group;
      if (typeof v.order === 'number') c.order = v.order;
      if (Object.keys(c).length) cleanFields[id] = c;
    }
    const cleanGroups = {};
    for (const [g, v] of Object.entries(draft.groups)) {
      const c = {};
      if (v.label) c.label = v.label;
      if (typeof v.order === 'number') c.order = v.order;
      if (Object.keys(c).length) cleanGroups[g] = c;
    }
    const hasFields = Object.keys(cleanFields).length > 0;
    const hasGroups = Object.keys(cleanGroups).length > 0;
    const hasCustomMetrics = draft.customMetrics.length > 0;
    onSave(hasFields || hasGroups || hasCustomMetrics ? { fields: cleanFields, groups: cleanGroups, customMetrics: draft.customMetrics } : null);
    onClose();
  };

  return h(ModalShell, {
    title: title || 'Customize Fields', icon: '⚙️', onClose, maxWidth: 760, scroll: true,
    subtitle: subtitle || 'Hide a metric, rename it, reorder it, or move it into a different category. Add a category up front, or retire one in a click -- categories still empty out automatically once every field leaves them.',
    footer: div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      btn({ onClick: reset, style: { fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 } }, 'Reset to defaults'),
      div({ style: { display: 'flex', gap: 8 } },
        btn({ onClick: onClose, className: 'btn btn-sm' }, 'Cancel'),
        btn({ onClick: save, className: 'btn btn-sm', style: { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' } }, 'Save'),
      ),
    ),
  },
    div({ style: { padding: '4px 18px 16px', display: 'flex', flexDirection: 'column', gap: 14 } },
      ...sortedGroupKeys.map((g, gIdx) => {
        const isEmpty = !groupOrder.includes(g);
        const fieldsInGroup = byGroup[g] || [];
        return div({ key: g, style: { border: '1px solid var(--bdr)', borderRadius: 8, padding: 10, opacity: isEmpty ? 0.75 : 1 } },
          div({ style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 } },
            span({ style: { fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px', flexShrink: 0 } }, 'Category'),
            div({ style: { display: 'flex', flexDirection: 'column' } },
              btn({ disabled: gIdx === 0, onClick: () => moveGroup(g, -1), style: _moveBtnStyle(gIdx === 0), title: 'Move category up' }, '▲'),
              btn({ disabled: gIdx === sortedGroupKeys.length - 1, onClick: () => moveGroup(g, 1), style: _moveBtnStyle(gIdx === sortedGroupKeys.length - 1), title: 'Move category down' }, '▼'),
            ),
            (origGroups.includes(g) || isEmpty)
              ? input({
                  value: draft.groups[g]?.label ?? (origGroups.includes(g) ? origGroupLabel(g) : g),
                  onChange: e => setGroupLabel(g, e.target.value),
                  style: { fontSize: 12, fontWeight: 700, color: 'var(--text)', background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 4, padding: '3px 6px', flex: 1, maxWidth: 240 },
                })
              : span({ style: { fontSize: 12, fontWeight: 700, color: 'var(--accent)' } }, g + ' (new)'),
            isEmpty && span({ style: { fontSize: 10, color: 'var(--text3)', fontStyle: 'italic' } }, 'empty — move a field here, or remove it'),
            div({ style: { flex: 1 } }),
            isEmpty
              ? btn({
                  onClick: () => removeEmptyCategory(g), title: 'Remove this empty category',
                  style: { fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' },
                }, '✕ Remove')
              : (retiringGroup === g
                  ? null // destination picker renders below, in place of the Retire button
                  : btn({
                      onClick: () => startRetire(g), title: 'Move every field in this category elsewhere (or hide them), in one step',
                      style: { fontSize: 10, color: 'var(--text3)', background: 'none', border: '1px solid var(--bdr)', borderRadius: 4, cursor: 'pointer', padding: '2px 6px' },
                    }, 'Retire category')),
          ),
          retiringGroup === g && div({ style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8, padding: 6, background: 'var(--surf2)', borderRadius: 6 } },
            span({ style: { fontSize: 11, color: 'var(--text2)' } }, `Move ${fieldsInGroup.length} field${fieldsInGroup.length === 1 ? '' : 's'} to:`),
            sel({
              value: retireTarget, onChange: e => setRetireTarget(e.target.value),
              style: { fontSize: 11, width: 160, background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 4, padding: '3px 6px', color: 'var(--text)' },
            },
              opt({ value: '' }, 'Choose…'),
              ...allKnownGroups.filter(o => o.key !== g).map(o => opt({ key: o.key, value: o.key }, o.label)),
              opt({ value: HIDE_SENTINEL }, '(hide them instead)'),
            ),
            btn({ disabled: !retireTarget, onClick: () => confirmRetire(g), className: 'btn btn-sm' }, 'Confirm'),
            btn({ onClick: cancelRetire, style: { fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer' } }, 'Cancel'),
          ),
          ...fieldsInGroup.map((f, fIdx) => {
            const curGroup = fc(f.id).group || f.group;
            const isTypingNew = !!typingGroupFor[f.id];
            return div({ key: f.id, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', opacity: fc(f.id).hidden ? 0.45 : 1, flexWrap: 'wrap' } },
              div({ style: { display: 'flex', flexDirection: 'column' } },
                btn({ disabled: fIdx === 0, onClick: () => moveField(g, f.id, -1), style: _moveBtnStyle(fIdx === 0), title: 'Move up' }, '▲'),
                btn({ disabled: fIdx === fieldsInGroup.length - 1, onClick: () => moveField(g, f.id, 1), style: _moveBtnStyle(fIdx === fieldsInGroup.length - 1), title: 'Move down' }, '▼'),
              ),
              input({
                type: 'checkbox', checked: !fc(f.id).hidden, title: 'Show/hide this metric',
                onChange: e => setField(f.id, { hidden: !e.target.checked }),
              }),
              input({
                value: fc(f.id).label ?? f.label,
                onChange: e => setField(f.id, { label: e.target.value }),
                style: { fontSize: 11, flex: 1, minWidth: 110, maxWidth: 180, background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 4, padding: '3px 6px', color: 'var(--text)' },
              }),
              span({ style: { fontSize: 9, color: 'var(--text3)', whiteSpace: 'nowrap' } }, '→ category'),
              isTypingNew
                ? input({
                    autoFocus: true, placeholder: 'New category name',
                    value: curGroup === f.group ? '' : curGroup,
                    onChange: e => setField(f.id, { group: e.target.value || undefined }),
                    onBlur: () => { if (!(fc(f.id).group)) setTypingGroupFor(s => ({ ...s, [f.id]: false })); },
                    style: { fontSize: 11, width: 140, background: 'var(--surf2)', border: '1px solid var(--amber)', borderRadius: 4, padding: '3px 6px', color: 'var(--text)' },
                  })
                : sel({
                    value: curGroup,
                    onChange: e => {
                      if (e.target.value === NEW_GROUP_SENTINEL) { setTypingGroupFor(s => ({ ...s, [f.id]: true })); setField(f.id, { group: undefined }); }
                      else setField(f.id, { group: e.target.value === f.group ? undefined : e.target.value });
                    },
                    style: { fontSize: 11, width: 150, background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 4, padding: '3px 6px', color: 'var(--text)' },
                  },
                    ...allKnownGroups.map(o => opt({ key: o.key, value: o.key }, o.label)),
                    !allKnownGroups.some(o => o.key === curGroup) && opt({ key: curGroup, value: curGroup }, curGroup + ' (new)'),
                    opt({ value: NEW_GROUP_SENTINEL }, '+ New category…'),
                  ),
              f.isCustom && btn({
                onClick: () => removeCustomMetric(f.id), title: 'Remove this custom metric entirely',
                style: { fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' },
              }, '✕'),
            );
          }),
        );
      }),
      div({ style: { border: '1px dashed var(--bdr)', borderRadius: 8, padding: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        span({ style: { fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px', flexShrink: 0 } }, '+ Add category'),
        input({
          value: newCatName, placeholder: 'Category name', onChange: e => setNewCatName(e.target.value),
          onKeyDown: e => { if (e.key === 'Enter') addCategory(); },
          style: { fontSize: 11, width: 180, background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 4, padding: '3px 6px', color: 'var(--text)' },
        }),
        // Labeled distinctly from the "+ Add a metric" section's own 'Add' button below (not
        // just 'Add') so the two are never ambiguous to a reader or a test driving the DOM by
        // button text.
        btn({ onClick: addCategory, disabled: !newCatName.trim(), className: 'btn btn-sm' }, 'Add category'),
      ),
      customMetricOptions && customMetricOptions.length > 0 && div({ style: { border: '1px dashed var(--bdr)', borderRadius: 8, padding: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        span({ style: { fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px', flexShrink: 0 } }, '+ Add a metric'),
        availableToAdd.length > 0
          ? [
              sel({
                key: 'pick', value: addMetricKey || availableToAdd[0].key, onChange: e => setAddMetricKey(e.target.value),
                style: { fontSize: 11, width: 200, background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 4, padding: '3px 6px', color: 'var(--text)' },
              }, ...availableToAdd.map(m => opt({ key: m.key, value: m.key }, m.label))),
              btn({ key: 'add', onClick: addMetric, className: 'btn btn-sm' }, 'Add'),
            ]
          : span({ style: { fontSize: 11, color: 'var(--text3)' } }, 'Every available metric is already on this grid.'),
      ),
    ),
  );
}
