// @ts-nocheck
// ── Pricing Engine panel, first slice: per-item margin (dispatch #212, 2026-08-29) ──
// Static cost-vs-price snapshot/ranking off qsr_product_mix (the same auto-pulled stream
// ProductMixPanel's Cloud tab already lazy-fills, src/views/labor-tools.js) — reuses its
// lazy-fill/wide-range plumbing rather than a second ds.pmixRows fetch path. Math lives
// in src/engine/pricing-engine.js (computeItemMargins) — this file is presentation only.
// Elasticity/what-if simulation, multi-month margin TREND charting, and the
// qsr_menu_item_activity waste/emp-meal enrichment are explicitly out of scope for this
// slice — see memory/dispatch-212.md.
import * as React from 'react';
import { ModalShell } from '../components/ModalShell.js';
import { LocationSelector, buildLocationHierarchy, locationSelectorLocs } from '../components/PanelControls.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { normLoc } from '../engine/insights.js';
import { computeItemMargins } from '../engine/pricing-engine.js';
import {
  ensureLazyFill, isLazyFillPending, isLazyFillError,
  ensureLazyFillWide, isLazyFillWidePending, isLazyFillWideError, isLazyFillWideLoaded,
} from '../engine/metric-source.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);
const table = (p, ...c) => h('table', p, ...c);
const thead = (p, ...c) => h('thead', p, ...c);
const tbody = (p, ...c) => h('tbody', p, ...c);
const tr = (p, ...c) => h('tr', p, ...c);
const th = (p, ...c) => h('th', p, ...c);
const td = (p, ...c) => h('td', p, ...c);

const f$2  = n => (n == null ? '—' : (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2));
const f$0  = n => (n == null ? '—' : '$' + Math.round(n).toLocaleString());
const fPc  = n => (n == null ? '—' : (n * 100).toFixed(1) + '%');
const fN0  = n => (n == null ? '—' : Math.round(n).toLocaleString());

const RANGES = ['7', '30', '90', '180', 'all'];
const WIDE_RANGES = ['90', '180', 'all'];
// Not data-derived -- a working default so the hero line has something concrete to say
// ("chase these first") on first open. Adjustable in a future pass once the owner has
// looked at real numbers; nothing else in this panel depends on this exact value.
const MARGIN_CONCERN_PCT = 0.40;

const pmixDate = r => (r.date instanceof Date ? r.date : new Date(r.date));

// Roll a scope's worth of per-(loc,item) rows (from computeItemMargins) up to one row
// per item_number when more than one store is in view. Dollar-weighted, never an
// average of averages (CLAUDE.md standing rule): marginPct here is
// (Σ totalContrib) / (Σ menuPrice*volume), NOT a plain mean of each store's marginPct
// -- a store selling 5x the volume of another must not count equally toward the blend.
// menuPrice/foodCost/paperCost shown for the aggregate row are volume-weighted means,
// for display only; marginDollars/marginPct are derived from the summed dollars, not
// from those displayed weighted-mean inputs (so they stay exact even though the
// displayed unit price is a weighted approximation across stores that may differ
// slightly on price).
function aggregateAcrossStores(rows) {
  const byItem = new Map();
  for (const r of rows) {
    let a = byItem.get(r.itemNumber);
    if (!a) {
      a = {
        itemNumber: r.itemNumber, descr: r.descr, volume: 0, totalContrib: 0,
        revenue: 0, priceRevenue: 0, foodCostVol: 0, paperCostVol: 0, storeRows: [],
      };
      byItem.set(r.itemNumber, a);
    }
    if (!a.descr && r.descr) a.descr = r.descr;
    a.volume += r.volume;
    a.totalContrib += r.totalContrib;
    a.revenue += r.menuPrice * r.volume;
    a.foodCostVol += r.foodCost * r.volume;
    a.paperCostVol += r.paperCost * r.volume;
    a.storeRows.push(r);
  }
  const out = [];
  for (const a of byItem.values()) {
    const menuPrice = a.volume > 0 ? a.revenue / a.volume : 0;
    const foodCost = a.volume > 0 ? a.foodCostVol / a.volume : 0;
    const paperCost = a.volume > 0 ? a.paperCostVol / a.volume : 0;
    out.push({
      loc: null, itemNumber: a.itemNumber, descr: a.descr,
      menuPrice, foodCost, paperCost,
      marginDollars: menuPrice - foodCost - paperCost, // display-only, weighted-mean basis
      marginPct: a.revenue > 0 ? a.totalContrib / a.revenue : null, // dollar-weighted, exact
      volume: a.volume, totalContrib: a.totalContrib,
      storeRows: a.storeRows.sort((x, y) => y.totalContrib - x.totalContrib),
    });
  }
  return out;
}

function ItemRow({ row, wide, expanded, onToggle }) {
  return [
    tr({
      key: row.itemNumber, onClick: wide ? onToggle : undefined,
      style: { borderBottom: '.5px solid var(--bdr)', cursor: wide ? 'pointer' : 'default' },
    },
      td({ style: { padding: '6px 10px', fontSize: 11, fontWeight: 600 } },
        (wide ? (expanded ? '▾ ' : '▸ ') : '') + (row.descr || ('#' + row.itemNumber))),
      td({ style: { padding: '6px 10px', fontSize: 9, color: 'var(--text3)' } }, '#' + row.itemNumber),
      td({ style: { padding: '6px 10px', fontSize: 9, color: 'var(--text3)' } },
        wide ? 'All stores' : sNameC(row.loc) || row.loc),
      td({ style: { padding: '6px 10px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--mono)' } }, f$2(row.menuPrice)),
      td({ style: { padding: '6px 10px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' } },
        f$2(row.foodCost + row.paperCost)),
      td({ style: { padding: '6px 10px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 } }, f$2(row.marginDollars)),
      td({
        style: {
          padding: '6px 10px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700,
          color: row.marginPct == null ? 'var(--text3)' : row.marginPct < MARGIN_CONCERN_PCT ? 'var(--crit)' : 'var(--text)',
        },
      }, fPc(row.marginPct)),
      td({ style: { padding: '6px 10px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--mono)' } }, fN0(row.volume)),
      td({ style: { padding: '6px 10px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gold)' } }, f$0(row.totalContrib)),
    ),
    wide && expanded && row.storeRows && row.storeRows.map(sr => tr({
      key: row.itemNumber + '|' + sr.loc, style: { borderBottom: '.5px solid var(--bdr)', background: 'var(--surf2)' },
    },
      td({ style: { padding: '4px 10px 4px 28px', fontSize: 10, color: 'var(--text3)' }, colSpan: 3 }, sNameC(sr.loc) || sr.loc),
      td({ style: { padding: '4px 10px', fontSize: 10, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' } }, f$2(sr.menuPrice)),
      td({ style: { padding: '4px 10px', fontSize: 10, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' } }, f$2(sr.foodCost + sr.paperCost)),
      td({ style: { padding: '4px 10px', fontSize: 10, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' } }, f$2(sr.marginDollars)),
      td({ style: { padding: '4px 10px', fontSize: 10, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' } }, fPc(sr.marginPct)),
      td({ style: { padding: '4px 10px', fontSize: 10, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' } }, fN0(sr.volume)),
      td({ style: { padding: '4px 10px', fontSize: 10, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' } }, f$0(sr.totalContrib)),
    )),
  ];
}

const HEAD_COLS = ['Item', '#', 'Store', 'Price', 'Food+Paper', 'Margin $', 'Margin %', 'Volume', '$ Contrib'];

function RankedTable({ title, subtitle, rows, wide, expandedSet, onToggle }) {
  return div(null,
    div({ style: { padding: '10px 14px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' } }, title),
    subtitle && div({ style: { padding: '0 14px 6px', fontSize: 9, color: 'var(--text3)' } }, subtitle),
    div({ style: { overflowX: 'auto' } },
      table({ style: { width: '100%', borderCollapse: 'collapse', minWidth: 640 } },
        thead(null, tr(null, ...HEAD_COLS.map((c, i) => th({
          key: c, style: { padding: '4px 10px', fontSize: 8.5, color: 'var(--text3)', textAlign: i >= 3 ? 'right' : 'left', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '.5px solid var(--bdr2)' },
        }, c)))),
        tbody(null,
          !rows.length
            ? tr(null, td({ colSpan: HEAD_COLS.length, style: { padding: 16, fontSize: 11, color: 'var(--text3)', textAlign: 'center' } }, 'No items in this scope/range.'))
            : rows.map(row => h(ItemRow, {
              key: row.itemNumber, row, wide,
              expanded: expandedSet.has(row.itemNumber),
              onToggle: () => onToggle(row.itemNumber),
            })),
        ),
      ),
    ),
  );
}

export function PricingEnginePanel({ stores, ds, onClose }) {
  const { useState: uSt, useMemo: uM, useEffect: uE } = React;

  // ── Cloud lazy-fill (identical contract to ProductMixPanel, src/views/labor-tools.js) ──
  const [pending, setPending] = uSt(true);
  const [failed, setFailed] = uSt(false);
  uE(() => {
    const stillPending = ensureLazyFill('pmixRows');
    setPending(stillPending);
    if (!stillPending) { setFailed(isLazyFillError('pmixRows')); return; }
    const id = setInterval(() => {
      if (!isLazyFillPending('pmixRows')) { setPending(false); setFailed(isLazyFillError('pmixRows')); clearInterval(id); }
    }, 300);
    return () => clearInterval(id);
  }, []);
  const hasCloudPMix = !!(ds.pmixRows && ds.pmixRows.length);

  const [range, setRange] = uSt('30');
  const [wideState, setWideState] = uSt(isLazyFillWideLoaded('pmixRows') ? 'loaded' : 'idle');
  uE(() => {
    if (!WIDE_RANGES.includes(range)) return;
    if (isLazyFillWideLoaded('pmixRows')) { setWideState('loaded'); return; }
    const stillPending = ensureLazyFillWide('pmixRows');
    if (!stillPending) { setWideState(isLazyFillWideError('pmixRows') ? 'error' : 'loaded'); return; }
    setWideState('pending');
    const id = setInterval(() => {
      if (!isLazyFillWidePending('pmixRows')) { setWideState(isLazyFillWideError('pmixRows') ? 'error' : 'loaded'); clearInterval(id); }
    }, 300);
    return () => clearInterval(id);
  }, [range]);
  const wideNeededAndNotReady = WIDE_RANGES.includes(range) && wideState !== 'loaded';

  const [scope, setScope] = uSt({ level: 'all', id: null });
  const [sortMode, setSortMode] = uSt('high'); // 'high' | 'low' -- $ Contrib table direction
  const [expandedSet, setExpandedSet] = uSt(() => new Set());
  const toggleExpand = itemNumber => setExpandedSet(s => {
    const n = new Set(s); n.has(itemNumber) ? n.delete(itemNumber) : n.add(itemNumber); return n;
  });

  const tree = uM(() => buildLocationHierarchy(stores, INV_ORG_COORDS, STORE_NAMES), [stores]);
  const scopedLocs = uM(() => locationSelectorLocs(scope, tree), [scope, tree]);
  const wide = scopedLocs.length !== 1;
  const locFilterKey = scopedLocs.join(',');

  const maxDate = uM(() => {
    let max = null;
    (ds.pmixRows || []).forEach(r => { const d = pmixDate(r); if (!isNaN(d) && (!max || d > max)) max = d; });
    return max;
  }, [ds.pmixRows]);

  const dateRange = uM(() => {
    if (range === 'all' || !maxDate) return null;
    const cutoff = new Date(maxDate); cutoff.setDate(cutoff.getDate() - parseInt(range, 10));
    return { start: cutoff, end: maxDate };
  }, [range, maxDate]);

  const itemRows = uM(() => {
    if (wideNeededAndNotReady) return [];
    return computeItemMargins(ds.pmixRows || [], { locFilter: scopedLocs, dateRange });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds.pmixRows, locFilterKey, dateRange, wideNeededAndNotReady]);

  const displayRows = uM(() => (wide ? aggregateAcrossStores(itemRows) : itemRows), [itemRows, wide]);

  const scopeTotals = uM(() => {
    let contrib = 0, revenue = 0;
    displayRows.forEach(r => { contrib += r.totalContrib; revenue += r.menuPrice * r.volume; });
    return {
      blendedPct: revenue > 0 ? contrib / revenue : null,
      belowThreshold: displayRows.filter(r => r.marginPct != null && r.marginPct < MARGIN_CONCERN_PCT).length,
    };
  }, [displayRows]);

  const byMarginPct = uM(() => displayRows
    .filter(r => r.marginPct != null)
    .slice()
    .sort((a, b) => a.marginPct - b.marginPct)
    .slice(0, 15), [displayRows]);

  const byContrib = uM(() => displayRows
    .slice()
    .sort((a, b) => sortMode === 'high' ? b.totalContrib - a.totalContrib : a.totalContrib - b.totalContrib)
    .slice(0, 15), [displayRows, sortMode]);

  const scopeLabel = scope.level === 'all' ? 'District' : scope.level === 'store'
    ? (sNameC(scope.id) || scope.id) : (tree.storeLabel ? scope.id : scope.id);

  const heroLine = scopeTotals.blendedPct == null ? null
    : `${scopeLabel} blended margin ${fPc(scopeTotals.blendedPct)} — ${scopeTotals.belowThreshold ? scopeTotals.belowThreshold + ' item' + (scopeTotals.belowThreshold === 1 ? '' : 's') + ` below ${Math.round(MARGIN_CONCERN_PCT * 100)}%, chase those first` : `no items below ${Math.round(MARGIN_CONCERN_PCT * 100)}%, margins look healthy`}`;

  const body = (!hasCloudPMix && !pending)
    ? div({ style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--text3)', padding: 40 } },
      div({ style: { fontSize: 36 } }, '💲'),
      div({ style: { fontSize: 13, fontWeight: 700, color: 'var(--text)' } }, 'No Product Mix Data'),
      div({ style: { fontSize: 10, textAlign: 'center', maxWidth: 380, lineHeight: 1.7 } },
        failed
          ? 'The cloud read failed. Try reopening this panel, or check Data Manager for the pull\'s sync status.'
          : 'The auto-pull hasn\'t landed any qsr_product_mix rows yet. Check Data Manager for the pull\'s sync status.'))
    : (pending || wideNeededAndNotReady)
      ? div({ style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--text3)', padding: 40 } },
        div({ style: { fontSize: 36 } }, '☁'),
        div({ style: { fontSize: 13, fontWeight: 700, color: 'var(--text)' } }, pending ? 'Loading Product Mix…' : (wideState === 'error' ? 'Full-History Load Failed' : 'Loading Full History…')),
        div({ style: { fontSize: 10, textAlign: 'center', maxWidth: 380, lineHeight: 1.7 } },
          pending ? 'Pulling qsr_product_mix from Supabase (loaded on open, not at startup).'
            : wideState === 'error' ? 'Try a narrower range (7D/30D), or reopen this panel to retry.'
              : (range === 'all' ? 'All Time' : range + 'D') + ' pulls real historical breadth from Supabase — this can take longer than the default 30D view.'))
      : div({ style: { flex: 1, overflowY: 'auto' } },
        div({ style: { padding: '12px 14px', borderBottom: '.5px solid var(--bdr)', background: 'var(--surf2)' } },
          div({ style: { fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 } }, 'Blended margin, this scope/range'),
          div({ style: { fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 } }, heroLine || 'No margin data for this scope/range.'),
        ),
        h(RankedTable, {
          title: 'Lowest Margin % — rate concern',
          subtitle: 'Someone\'s pricing this wrong or costs moved. Not volume-weighted — a low-volume item can rank here.',
          rows: byMarginPct, wide, expandedSet, onToggle: toggleExpand,
        }),
        div({ style: { padding: '14px 14px 4px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
          div({ style: { fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' } }, '$ Contribution — volume-weighted P&L impact'),
          span({ style: { fontSize: 8, color: 'var(--text3)' } }, 'Sort:'),
          ...[{ id: 'high', label: 'Winners' }, { id: 'low', label: 'Losers' }].map(m => btn({
            key: m.id, className: 'btn btn-sm',
            style: { fontSize: 8.5, background: sortMode === m.id ? 'var(--adim)' : 'transparent', color: sortMode === m.id ? 'var(--amber)' : 'var(--text3)' },
            onClick: () => setSortMode(m.id),
          }, m.label)),
        ),
        h(RankedTable, {
          title: '', subtitle: 'What actually moves the P&L — margin $ x volume. A thin-%-high-volume item can outrank a high-%-low-volume one here.',
          rows: byContrib, wide, expandedSet, onToggle: toggleExpand,
        }),
      );

  return h(ModalShell, {
    title: '💲 Pricing Engine', onClose, maxWidth: 900,
    subtitle: 'Per-item margin (menu price vs. food + paper cost) — qsr_product_mix, auto-pulled',
  },
    div({ style: { padding: '8px 14px', borderBottom: '.5px solid var(--bdr)', display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' } },
      span({ style: { fontSize: 8, color: 'var(--text3)', marginRight: 2 } }, 'Range:'),
      ...RANGES.map(r => btn({
        key: r, className: 'btn btn-sm',
        style: { fontSize: 8.5, background: range === r ? 'var(--adim)' : 'transparent', color: range === r ? 'var(--amber)' : 'var(--text3)' },
        onClick: () => setRange(r),
      }, r === 'all' ? 'All' : r + 'D')),
      maxDate && span({ style: { fontSize: 8, color: 'var(--text3)', marginLeft: 'auto' } },
        'Through ' + maxDate.toISOString().slice(0, 10)),
    ),
    div({ style: { padding: '8px 14px', borderBottom: '.5px solid var(--bdr)' } },
      h(LocationSelector, { stores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, value: scope, onChange: setScope })),
    body,
  );
}
