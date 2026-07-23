// @ts-nocheck
// ── Pace to Target panel ─────────────────────────────────────────────────────
// A direct front door for the current-month "actual vs official projection" pace
// view. The heavy lifting (MTD actual sourcing, run-rate pace, % vs target) is the
// already-tested `CurrentMonthPaceSection` (in analytics.js) — previously reachable
// only inside the heavy Projection Workflow modal. This surfaces it on its own so
// the owner can answer "are we pacing to plan this month?" in one click, against
// the official monthly_targets (tProdSales) that Smart Targets' "Apply as Official"
// writes. A group toggle (Store / Patch / Operator) drives the rollup.
import * as React from 'react';
import { CurrentMonthPaceSection } from './analytics.js';
import { STORE_NAMES } from '../constants.js';

const h = React.createElement;
const ALL_LOCS = Object.keys(STORE_NAMES);

export function PaceToTargetPanel({ ds, stores, settings, onClose }) {
  const { useState } = React;
  const [groupView, setGroupView] = useState('flat');
  const seg = (val, label) => h('button', { key: val, onClick: () => setGroupView(val), style: { padding: '3px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, border: '1px solid ' + (groupView === val ? 'var(--amber)' : 'var(--bdr)'), background: groupView === val ? 'rgba(245,188,0,.14)' : 'var(--surf)', color: groupView === val ? 'var(--amber)' : 'var(--text2)' } }, label);

  return h('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 460, display: 'flex', flexDirection: 'column', paddingTop: 20 } },
    h('div', { style: { flex: '0 0 20px', cursor: 'pointer' }, onClick: onClose }),
    h('div', { style: { flex: 1, background: 'var(--surf)', maxWidth: 1080, margin: '0 auto', width: 'calc(100% - 24px)', borderRadius: 'var(--rl) var(--rl) 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -8px 40px rgba(0,0,0,.4)' } },
      // Header
      h('div', { style: { padding: '10px 16px', borderBottom: '.5px solid var(--bdr)', flexShrink: 0, background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        h('span', { style: { fontSize: 18 } }, '🏁'),
        h('div', { style: { flex: 1, minWidth: 180 } },
          h('div', { style: { fontSize: 14, fontWeight: 800, color: 'var(--text)' } }, 'Pace to Target'),
          h('div', { style: { fontSize: 9, color: 'var(--text3)' } }, 'Current-month actual sales vs the official monthly projection (tProdSales) · pace = MTD ÷ days elapsed × month. Set targets in Smart Targets → “Apply as Official”.')),
        h('span', { style: { fontSize: 9, fontWeight: 700, color: 'var(--text3)' } }, 'Group'),
        seg('flat', 'Store'), seg('supervisor', 'Patch'), seg('operator', 'Operator'),
        h('button', { className: 'btn btn-sm', style: { color: 'var(--text3)' }, onClick: onClose }, '✕')),
      // Body — the existing, tested pace section
      h('div', { style: { flex: 1, overflowY: 'auto', padding: '12px 16px' } },
        h(CurrentMonthPaceSection, { ds, stores, settings, mt: ds && ds.monthlyTargets, locs: ALL_LOCS, groupView }))));
}
