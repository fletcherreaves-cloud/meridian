// @ts-nocheck
// ── Target field customization editor (owner-requested 2026-11-04) ───────────────────────────
// Owner, verbatim: "how we can add settings to the targets so they may be customized as needed.
// Need to be able to add or remove metrics and categories on monthly and yearly."
// Shared UI for both Monthly Projections (analytics.js) and Yearly Targets (yearly-
// projections.js) -- built against src/engine/target-field-config.js's config shape
// ({fields:{id:{hidden,label,group,order}}, groups:{groupKey:{label,order}}}). `order` is
// supported by that engine but not exposed here -- hide/relabel/regroup already covers the
// owner's literal ask without the extra UI weight (and risk) of drag-and-drop reordering.
// See memory/plan-target-field-customization-2026-11-04.md for the full design.
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
const CUSTOM_METRIC_GROUP = 'Custom Metrics';

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
  const byGroup = {};
  const groupOrder = [];
  allFields.forEach(f => {
    const g = fc(f.id).group || f.group;
    if (!(g in byGroup)) { byGroup[g] = []; groupOrder.push(g); }
    byGroup[g].push(f);
  });

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

  const reset = () => { setDraft({ fields: {}, groups: {}, customMetrics: [] }); setTypingGroupFor({}); };

  const save = () => {
    const cleanFields = {};
    for (const [id, v] of Object.entries(draft.fields)) {
      const c = {};
      if (v.hidden) c.hidden = true;
      if (v.label) c.label = v.label;
      if (v.group) c.group = v.group;
      if (Object.keys(c).length) cleanFields[id] = c;
    }
    const cleanGroups = {};
    for (const [g, v] of Object.entries(draft.groups)) {
      if (v.label) cleanGroups[g] = { label: v.label };
    }
    const hasFields = Object.keys(cleanFields).length > 0;
    const hasGroups = Object.keys(cleanGroups).length > 0;
    const hasCustomMetrics = draft.customMetrics.length > 0;
    onSave(hasFields || hasGroups || hasCustomMetrics ? { fields: cleanFields, groups: cleanGroups, customMetrics: draft.customMetrics } : null);
    onClose();
  };

  return h(ModalShell, {
    title: title || 'Customize Fields', icon: '⚙️', onClose, maxWidth: 760, scroll: true,
    subtitle: subtitle || 'Hide a metric, rename it, or move it into a different category -- categories empty out automatically when every field leaves them.',
    footer: div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      btn({ onClick: reset, style: { fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 } }, 'Reset to defaults'),
      div({ style: { display: 'flex', gap: 8 } },
        btn({ onClick: onClose, className: 'btn btn-sm' }, 'Cancel'),
        btn({ onClick: save, className: 'btn btn-sm', style: { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' } }, 'Save'),
      ),
    ),
  },
    div({ style: { padding: '4px 18px 16px', display: 'flex', flexDirection: 'column', gap: 14 } },
      ...groupOrder.map(g => div({ key: g, style: { border: '1px solid var(--bdr)', borderRadius: 8, padding: 10 } },
        div({ style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
          span({ style: { fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px', flexShrink: 0 } }, 'Category'),
          origGroups.includes(g)
            ? input({
                value: draft.groups[g]?.label ?? origGroupLabel(g),
                onChange: e => setGroupLabel(g, e.target.value),
                style: { fontSize: 12, fontWeight: 700, color: 'var(--text)', background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 4, padding: '3px 6px', flex: 1, maxWidth: 240 },
              })
            : span({ style: { fontSize: 12, fontWeight: 700, color: 'var(--accent)' } }, g + ' (new)'),
        ),
        ...byGroup[g].map(f => {
          const curGroup = fc(f.id).group || f.group;
          const knownOptions = origGroups.map(og => ({ key: og, label: displayLabel(og) }));
          const isTypingNew = !!typingGroupFor[f.id];
          return div({ key: f.id, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', opacity: fc(f.id).hidden ? 0.45 : 1, flexWrap: 'wrap' } },
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
                  style: { fontSize: 11, width: 140, background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 4, padding: '3px 6px', color: 'var(--text)' },
                },
                  ...knownOptions.map(o => opt({ key: o.key, value: o.key }, o.label)),
                  !knownOptions.some(o => o.key === curGroup) && opt({ key: curGroup, value: curGroup }, curGroup + ' (new)'),
                  opt({ value: NEW_GROUP_SENTINEL }, '+ New category…'),
                ),
            f.isCustom && btn({
              onClick: () => removeCustomMetric(f.id), title: 'Remove this custom metric entirely',
              style: { fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' },
            }, '✕'),
          );
        }),
      )),
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
