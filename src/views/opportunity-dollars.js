// @ts-nocheck
// ── Opportunity $ drill-down (v1) ───────────────────────────────────────────────
// memory/design-opportunity-dollars.md's flagship. Every performance gap (Labor, Food/FOB,
// GC/Sales) converted to recoverable dollars vs each store's own target, ranked biggest-$
// first. MTD / trailing-6mo toggle; reuses the pill-style LocationSelector every other panel
// uses for the All -> State -> Org/Patch -> Store scope. Pure engine + adapter already exist
// (engine/opportunity.js, engine/opportunity-district.js) -- this is presentation only.
import * as React from 'react';
import { ModalShell } from '../components/ModalShell.js';
import { LocationSelector, buildLocationHierarchy, locationSelectorLocs } from '../components/PanelControls.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { f$ } from '../utils/fmt.js';
import { districtOpportunity, mtdRange, trailing6moRange, annualizedFromSixMo } from '../engine/opportunity-district.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const DRIVERS = [
  { key: 'labor$', label: 'Labor', icon: '👥' },
  { key: 'food$', label: 'Food / FOB', icon: '🍟' },
  { key: 'gc$', label: 'GC / Sales', icon: '🚗' },
];
const WINDOWS = [
  { id: 'mtd', label: 'Month to Date' },
  { id: '6mo', label: 'Trailing 6 Months' },
];

function StoreRow({ rank, row, onSelect }) {
  return div({
    key: row.loc, onClick: () => onSelect && onSelect(row.loc),
    'data-testid': 'opportunity-row', 'data-loc': row.loc,
    style: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', borderBottom: '.5px solid var(--bdr)', cursor: onSelect ? 'pointer' : 'default' },
  },
    div({ style: { width: 20, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' } }, rank),
    div({ style: { width: 150, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, sNameC(row.loc) || row.loc),
    div({ style: { flex: 1, fontSize: 9, color: 'var(--text3)' } },
      `Labor ${f$(row.labor$)} · Food ${f$(row.food$)} · GC ${f$(row.gc$)}`),
    div({
      style: { fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 800, minWidth: 84, textAlign: 'right', color: row.total$ > 0 ? 'var(--gold)' : 'var(--text3)' },
    }, f$(row.total$)),
  );
}

export function OpportunityDollars({ stores, ds, onClose, onSelectStore }) {
  const { useState, useMemo } = React;
  const [windowMode, setWindowMode] = useState('mtd');
  const [scope, setScope] = useState({ level: 'all', id: null });

  const tree = useMemo(() => buildLocationHierarchy(stores, INV_ORG_COORDS, STORE_NAMES), [stores]);
  const locs = useMemo(() => locationSelectorLocs(scope, tree), [scope, tree]);
  const range = useMemo(() => (windowMode === 'mtd' ? mtdRange() : trailing6moRange()), [windowMode]);

  const result = useMemo(
    () => districtOpportunity(ds, ds?.qsrFobRows || [], locs, range),
    [ds, locs, range.s, range.e],
  );
  const { district, ranked } = result;
  const annualized = windowMode === '6mo' ? annualizedFromSixMo(district.total$) : null;

  return h(ModalShell, {
    title: '💰 Opportunity $', onClose, maxWidth: 760,
    subtitle: "Performance gaps, converted to recoverable dollars vs each store's own target",
  },
    div({ style: { padding: '8px 14px', borderBottom: '.5px solid var(--bdr)', display: 'flex', gap: 5, alignItems: 'center', background: 'var(--surf2)' } },
      span({ style: { fontSize: 8, color: 'var(--text3)', marginRight: 2 } }, 'Window:'),
      WINDOWS.map(w => btn({
        key: w.id, className: 'btn btn-sm', style: {
          fontSize: 9, padding: '2px 9px',
          background: windowMode === w.id ? 'rgba(245,188,0,.14)' : 'transparent',
          color: windowMode === w.id ? 'var(--gold)' : 'var(--text3)',
          borderColor: windowMode === w.id ? 'rgba(245,188,0,.4)' : 'var(--bdr)',
        },
        onClick: () => setWindowMode(w.id),
      }, w.label))),
    div({ style: { padding: '8px 14px', borderBottom: '.5px solid var(--bdr)' } },
      h(LocationSelector, { stores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, value: scope, onChange: setScope })),
    div({ 'data-testid': 'opportunity-headline', style: { padding: 14, borderBottom: '.5px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' } },
      div(null,
        div({ style: { fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' } },
          windowMode === 'mtd' ? 'Recoverable this month' : 'Recoverable, trailing 6 months'),
        div({ style: { fontSize: 26, fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--mono)' } }, f$(district.total$))),
      annualized != null && div(null,
        div({ style: { fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' } }, 'Annualized'),
        div({ style: { fontSize: 16, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text2)' } }, f$(annualized) + '/yr')),
      ...DRIVERS.map(d => div({ key: d.key },
        div({ style: { fontSize: 9, color: 'var(--text3)' } }, d.icon + ' ' + d.label),
        div({ style: { fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)' } }, f$(district[d.key])))),
    ),
    div({ style: { padding: '2px 14px 8px', fontSize: 9, color: 'var(--text3)', fontStyle: 'italic' } },
      'Each store benchmarked vs its OWN target (Labor/FOB target, sales-to-plan for GC/Sales). '
      + 'Floored at $0 — beating target is $0 opportunity, never a negative "credit."'),
    div({ style: { overflowY: 'auto', flex: 1 } },
      !ranked.length
        ? div({ style: { padding: 20, fontSize: 12, color: 'var(--text3)' } }, 'No stores in this scope have enough data for this window.')
        : [
          div({ key: 'hdr', style: { padding: '8px 14px 2px', fontSize: 9, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' } }, 'By store — biggest $ first'),
          ...ranked.map((row, i) => h(StoreRow, { key: row.loc, rank: i + 1, row, onSelect: onSelectStore })),
        ]),
  );
}
