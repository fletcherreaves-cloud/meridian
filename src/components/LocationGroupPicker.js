// @ts-nocheck
// Create/edit a saved custom location group — owner req (2026-11-01), modeled on the QSRSoft
// screenshots shown: a "Locations" tab (individual checkboxes + search + an "All" toggle) and a
// "Patches" tab (existing supervisor patches, each one checkbox that toggles every store in it at
// once), a running "N Locations selected" count, and Cancel/Save. This modal only EDITS the
// selection + name and hands the result to onSave — src/engine/location-groups.js owns the
// actual add/update/remove CRUD, src/lib/supabase.js owns persisting it.
import * as React from 'react';
import { ModalShell } from './ModalShell.js';
import { buildLocationHierarchy } from './PanelControls.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);
const inp = (p, ...c) => h('input', p, ...c);
const lbl = (p, ...c) => h('label', p, ...c);

const _tabStyle = (active) => ({
  padding: '6px 14px', borderRadius: 'var(--r)', border: '.5px solid ' + (active ? 'rgba(245,158,11,.4)' : 'var(--bdr)'),
  background: active ? 'var(--adim)' : 'transparent', color: active ? 'var(--amber)' : 'var(--text2)',
  fontSize: '11px', fontWeight: active ? 700 : 400, cursor: 'pointer',
});
const _rowStyle = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 'var(--r)', cursor: 'pointer', fontSize: '11px' };

// editGroup: existing {id,name,locs} to prefill when editing a saved group; omit/null to create new.
export function LocationGroupPicker({ stores, invOrgCoords, storeNames, onSave, onClose, editGroup }) {
  const [tab, setTab] = React.useState('locations'); // 'locations' | 'patches'
  const [search, setSearch] = React.useState('');
  const [name, setName] = React.useState(editGroup?.name || '');
  const [selected, setSelected] = React.useState(() => new Set((editGroup?.locs || []).map(String)));

  const tree = React.useMemo(() => buildLocationHierarchy(stores, invOrgCoords, storeNames), [stores, invOrgCoords, storeNames]);

  const toggle = (loc) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(loc)) next.delete(loc); else next.add(loc);
    return next;
  });
  const toggleAll = () => setSelected((prev) => (prev.size === tree.locs.length ? new Set() : new Set(tree.locs)));
  const togglePatch = (patch) => setSelected((prev) => {
    const allIn = patch.locs.every((l) => prev.has(l));
    const next = new Set(prev);
    patch.locs.forEach((l) => (allIn ? next.delete(l) : next.add(l)));
    return next;
  });

  const filteredLocs = search
    ? tree.locs.filter((l) => tree.storeLabel(l).toLowerCase().includes(search.toLowerCase()) || l.includes(search))
    : tree.locs;

  const canSave = name.trim().length > 0 && selected.size > 0;

  return h(ModalShell, {
    title: editGroup ? 'Edit Group' : 'New Custom Group',
    subtitle: 'Select any set of locations and save it for reuse',
    icon: '🔧',
    onClose,
    maxWidth: 480,
    footer: div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' } },
      span({ style: { fontSize: '10px', color: 'var(--text3)' } }, selected.size + ' Location' + (selected.size === 1 ? '' : 's') + ' selected'),
      div({ style: { display: 'flex', gap: 8 } },
        btn({ className: 'btn btn-sm', onClick: onClose }, '✕ Cancel'),
        btn({
          className: 'btn btn-sm btn-primary', disabled: !canSave,
          onClick: () => canSave && onSave?.({ id: editGroup?.id, name: name.trim(), locs: [...selected] }),
        }, '✓ Save Group'),
      ),
    ),
  },
    div({ style: { display: 'flex', flexDirection: 'column', gap: 12 } },
      inp({
        placeholder: 'Group name (e.g. "MRG Restaurants")', value: name,
        onChange: (e) => setName(e.target.value),
        style: { background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: '12px', padding: '7px 10px' },
      }),
      div({ style: { display: 'flex', gap: 6 } },
        btn({ style: _tabStyle(tab === 'locations'), onClick: () => setTab('locations') }, '📍 Locations'),
        btn({ style: _tabStyle(tab === 'patches'), onClick: () => setTab('patches') }, '🌀 Patches'),
      ),
      tab === 'locations' && div({ style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        inp({
          placeholder: 'Search…', value: search, onChange: (e) => setSearch(e.target.value),
          style: { background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: '11px', padding: '6px 10px' },
        }),
        lbl({ style: { ..._rowStyle, fontWeight: 700 } },
          inp({ type: 'checkbox', checked: selected.size === tree.locs.length && tree.locs.length > 0, onChange: toggleAll }),
          'All'),
        div({ style: { maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 } },
          filteredLocs.map((l) => lbl({ key: l, style: _rowStyle },
            inp({ type: 'checkbox', checked: selected.has(l), onChange: () => toggle(l) }),
            tree.storeLabel(l))),
        ),
      ),
      tab === 'patches' && div({ style: { maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 } },
        tree.patches.length ? tree.patches.map((p) => {
          const allIn = p.locs.length > 0 && p.locs.every((l) => selected.has(l));
          return lbl({ key: p.id, style: _rowStyle },
            inp({ type: 'checkbox', checked: allIn, onChange: () => togglePatch(p) }),
            p.label + ' (' + p.locs.length + ')');
        }) : div({ style: { fontSize: '10px', color: 'var(--text3)', padding: '6px 8px' } }, 'No patches configured.'),
      ),
    ),
  );
}
