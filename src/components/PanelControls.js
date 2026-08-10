// @ts-nocheck
// Shared panel controls (issue #126, Spine 1 step 1) — DateRangeControl, LocationSelector,
// ActionMenu(s). Pure addition: nothing in the app imports these yet. Each renderer is a thin
// wrapper around an exported, pure, independently-testable function — this codebase's test
// suite runs under Vitest's `node` environment (no jsdom/testing-library), so component
// rendering itself isn't unit-tested anywhere in src/; the logic that decides WHAT renders is.
//
// Style is copied verbatim from the three reference panels named in the issue
// (MetricCorrelationExplorer / DistrictLensPanel target-pills, store-dash.js's date input),
// not reinvented — that's the entire point of a shared control.
import * as React from 'react';
import { lastClosedBusinessDay } from '../utils/date.js';
import { Z } from './ModalShell.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);
const inp = (p, ...c) => h('input', p, ...c);

// ═══════════════════════════════════════════════════════════════════════════════
// DateRangeControl
// ═══════════════════════════════════════════════════════════════════════════════

// Full catalog a panel subsets from. Covers every value seen across the 7 hand-rolled
// controls the issue lists (30/60/90, 7/14/30/60/90, 7/28/90, 7/14/28/60, 60/90/180, 7/30/90).
export const DATE_RANGE_PRESETS = [
  { id: '7d', label: '7D', days: 7 },
  { id: '14d', label: '14D', days: 14 },
  { id: '28d', label: '28D', days: 28 },
  { id: '30d', label: '30D', days: 30 },
  { id: '60d', label: '60D', days: 60 },
  { id: '90d', label: '90D', days: 90 },
  { id: '180d', label: '180D', days: 180 },
];

const _dstr = (d) => {
  const x = new Date(d);
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
};

// Pure: preset id -> {s,e} ISO date strings, trailing N days ending on the last CLOSED
// business day — never a naive "yesterday" (that misses the 4am ABC cutover: between
// midnight and 4am, yesterday's calendar date is still today's still-filling business day)
// and never literal "today" either (this codebase's standing rule, signature #4 — see
// CLAUDE.md's data-integrity notes). Uses the one shared lastClosedBusinessDay() helper
// (utils/date.js, re-exported from engine/swing-feed.js) rather than re-deriving the
// arithmetic — this bug has already recurred five separate times from hand-copies.
export function resolveDatePreset(presetId, presets = DATE_RANGE_PRESETS, today = new Date()) {
  const preset = presets.find((p) => p.id === presetId);
  if (!preset) return null;
  const e = lastClosedBusinessDay(today);
  const s = new Date(e);
  s.setDate(s.getDate() - (preset.days - 1));
  return { id: presetId, s: _dstr(s), e: _dstr(e) };
}

// Pure: is `value` a valid {s,e} pair with s <= e? Used to gate the custom-range apply button.
export function isValidCustomRange(s, e) {
  if (!s || !e) return false;
  const sd = new Date(s), ed = new Date(e);
  if (isNaN(sd) || isNaN(ed)) return false;
  return sd <= ed;
}

const _pillStyle = (active) => ({
  padding: '4px 12px', borderRadius: 'var(--r)',
  border: '.5px solid ' + (active ? 'rgba(245,158,11,.4)' : 'var(--bdr)'),
  background: active ? 'var(--adim)' : 'transparent',
  color: active ? 'var(--amber)' : 'var(--text2)',
  fontSize: '10px', fontWeight: active ? 700 : 400, cursor: 'pointer',
});

const _dateInputStyle = {
  background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)',
  color: 'var(--text)', fontSize: '11px', padding: '4px 8px',
};

// value: {id, s, e} — id is a preset id, or 'custom' with explicit s/e.
// onChange receives the same shape. `presets` lets each panel pick its own subset (owner
// decision: shared list, per-panel default — see issue #126).
export function DateRangeControl({ presets = DATE_RANGE_PRESETS, value, onChange, allowCustom = true }) {
  const [customOpen, setCustomOpen] = React.useState(value?.id === 'custom');
  const [customS, setCustomS] = React.useState(value?.s || '');
  const [customE, setCustomE] = React.useState(value?.e || '');

  const pickPreset = (id) => {
    setCustomOpen(false);
    const resolved = resolveDatePreset(id, presets);
    if (resolved) onChange?.(resolved);
  };
  const applyCustom = () => {
    if (!isValidCustomRange(customS, customE)) return;
    onChange?.({ id: 'custom', s: customS, e: customE });
  };

  return div({ style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
    ...presets.map((p) => btn({
      key: p.id, style: _pillStyle(value?.id === p.id), onClick: () => pickPreset(p.id),
    }, p.label)),
    allowCustom && btn({
      style: _pillStyle(value?.id === 'custom'),
      onClick: () => setCustomOpen((o) => !o),
    }, 'Custom…'),
    allowCustom && customOpen && div({ style: { display: 'flex', alignItems: 'center', gap: 4 } },
      inp({ type: 'date', value: customS, onChange: (e) => setCustomS(e.target.value), style: _dateInputStyle }),
      span({ style: { fontSize: '10px', color: 'var(--text3)' } }, '–'),
      inp({ type: 'date', value: customE, onChange: (e) => setCustomE(e.target.value), style: _dateInputStyle }),
      btn({
        className: 'btn btn-sm', disabled: !isValidCustomRange(customS, customE), onClick: applyCustom,
      }, 'Apply'),
    ),
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LocationSelector
// ═══════════════════════════════════════════════════════════════════════════════

// Pure: {stores, storeNames} -> {states:[{id,label,locs}], patches:[{id,label,locs}]}, both
// sorted, locs sorted numerically within each group. `stores` items need only a `loc`; state
// and patch come from INV_ORG_COORDS (same source AtAGlance/analytics.js already use for the
// OK/FL split), so a store missing from that map is simply excluded from the State/Patch tiers
// (still reachable via "All" and the flat store list) rather than crashing the selector.
export function buildLocationHierarchy(stores, invOrgCoords, storeNames) {
  const locs = (stores || [])
    .map((s) => String(s.loc))
    .filter((l) => /^\d+$/.test(l))
    .sort((a, b) => Number(a) - Number(b));

  const byState = {};
  const byPatch = {};
  locs.forEach((l) => {
    const meta = invOrgCoords?.[l];
    if (!meta) return;
    (byState[meta.state] ||= []).push(l);
    if (meta.sup) (byPatch[meta.sup] ||= []).push(l);
  });

  const states = Object.keys(byState).sort().map((id) => ({ id, label: id, locs: byState[id] }));
  const patches = Object.keys(byPatch).sort().map((id) => ({ id, label: id, locs: byPatch[id] }));

  return { locs, states, patches, storeLabel: (l) => (storeNames?.[l] ? l + ' — ' + storeNames[l] : l) };
}

// value: {level:'all'|'state'|'patch'|'store', id} — id is null for 'all', else the state/patch/
// store id. onChange receives the same shape.
// mode: 'full' (All → State → Patch → Store, per feedback-selector-ui-standard.md) or
// 'store' (a simple store-only picker — "genuinely single-store panels get a simple store
// picker," issue #126) so a control that never does anything doesn't get shown where it can't
// change what's on screen.
export function LocationSelector({ stores, invOrgCoords, storeNames, value, onChange, mode = 'full' }) {
  const tree = React.useMemo(
    () => buildLocationHierarchy(stores, invOrgCoords, storeNames),
    [stores, invOrgCoords, storeNames],
  );
  const pick = (level, id) => onChange?.({ level, id });

  if (mode === 'store') {
    return div({ style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
      btn({ style: _pillStyle(value?.level === 'all'), onClick: () => pick('all', null) }, 'All Locations'),
      ...tree.locs.map((l) => btn({
        key: l, style: _pillStyle(value?.level === 'store' && value?.id === l), onClick: () => pick('store', l),
      }, tree.storeLabel(l))),
    );
  }

  return div({ style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
    btn({ style: _pillStyle(value?.level === 'all'), onClick: () => pick('all', null) }, 'All Locations'),
    ...tree.states.map((s) => btn({
      key: 'st-' + s.id, style: _pillStyle(value?.level === 'state' && value?.id === s.id), onClick: () => pick('state', s.id),
    }, s.label)),
    ...tree.patches.map((p) => btn({
      key: 'pt-' + p.id, style: _pillStyle(value?.level === 'patch' && value?.id === p.id), onClick: () => pick('patch', p.id),
    }, p.label)),
    ...tree.locs.map((l) => btn({
      key: 'lc-' + l, style: _pillStyle(value?.level === 'store' && value?.id === l), onClick: () => pick('store', l),
    }, tree.storeLabel(l))),
  );
}

// Pure: given a LocationSelector value + hierarchy, which locs are in scope? Kept out of the
// component so a panel migrating in step 2 can compute its filtered store list without also
// re-deriving this switch.
export function locationSelectorLocs(value, tree) {
  if (!value || value.level === 'all') return tree.locs;
  if (value.level === 'state') return (tree.states.find((s) => s.id === value.id) || {}).locs || [];
  if (value.level === 'patch') return (tree.patches.find((p) => p.id === value.id) || {}).locs || [];
  if (value.level === 'store') return value.id ? [value.id] : [];
  return tree.locs;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ActionMenu / ActionMenus — grouped dropdowns (Inventory Control pilot: 14 buttons -> 3 menus)
// ═══════════════════════════════════════════════════════════════════════════════

// Pure: drop groups with no items so a caller can pass a group behind a feature flag / RBAC
// check without the menu bar showing an empty dropdown.
export function nonEmptyActionGroups(groups) {
  return (groups || []).filter((g) => g && Array.isArray(g.items) && g.items.some(Boolean));
}

const _menuStyle = {
  position: 'absolute', top: 'calc(100% + 4px)', left: 0,
  // Above the modal's own body content (Z.modal=300) so the dropdown isn't clipped/hidden
  // behind sibling content in the same band, but below Z.nested=400 so a genuinely nested
  // modal still stacks above an open action menu. Matches ExportDropdown's own menu
  // (store-dash.js), which predates the Z map and hard-codes the same 350 value.
  zIndex: Z.modal + 50,
  background: 'var(--surf)', border: '.5px solid var(--bdr2)', borderRadius: 'var(--rl)',
  boxShadow: '0 8px 28px rgba(0,0,0,.35)', overflow: 'hidden', minWidth: 180,
};
const _itemStyle = {
  display: 'block', width: '100%', textAlign: 'left', padding: '7px 14px',
  background: 'none', border: 'none', fontSize: '11px', cursor: 'pointer', color: 'var(--text)',
  borderBottom: '.5px solid var(--bdr)',
};

// A single grouped dropdown, e.g. {label:'Reports', items:[{label:'Summary', onClick}, ...]}.
// Outside-click-to-close mirrors ExportDropdown (store-dash.js) — same interaction, same code
// shape, so the two feel identical when they sit side by side in a panel's action band.
export function ActionMenu({ label, items }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const shown = (items || []).filter(Boolean);
  if (!shown.length) return null;

  return div({ ref, style: { position: 'relative', display: 'inline-block' } },
    btn({
      className: 'btn btn-sm', style: { display: 'flex', alignItems: 'center', gap: 4 },
      onClick: () => setOpen((o) => !o),
    }, label, span({ style: { fontSize: '9px', color: 'var(--text3)' } }, ' ' + (open ? '▲' : '▼'))),
    open && div({ style: _menuStyle },
      ...shown.map((it, i) => btn({
        key: it.label + i,
        style: { ..._itemStyle, ...(i === shown.length - 1 ? { borderBottom: 'none' } : null) },
        disabled: it.disabled, title: it.title, onClick: () => { setOpen(false); it.onClick?.(); },
      }, it.label)),
    ),
  );
}

// groups: [{label, items:[{label,onClick,disabled}]}] — renders one ActionMenu per non-empty
// group, left to right, matching the issue's worked example (Reports▾ / Scans▾ / Pulls▾).
export function ActionMenus({ groups }) {
  const shown = nonEmptyActionGroups(groups);
  if (!shown.length) return null;
  return div({ style: { display: 'flex', gap: 6 } },
    ...shown.map((g) => h(ActionMenu, { key: g.label, label: g.label, items: g.items })),
  );
}
