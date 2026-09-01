// @ts-nocheck
// ── Pricing Engine panel, first slice: per-item margin (dispatch #212, 2026-08-29) ──
// Static cost-vs-price snapshot/ranking off qsr_product_mix (the same auto-pulled stream
// ProductMixPanel's Cloud tab already lazy-fills, src/views/labor-tools.js) — reuses its
// lazy-fill/wide-range plumbing rather than a second ds.pmixRows fetch path. Math lives
// in src/engine/pricing-engine.js (computeItemMargins) — this file is presentation only.
// Elasticity/what-if simulation and multi-month margin TREND charting are still out of
// scope for this panel — see memory/dispatch-212.md.
//
// ── Waste/comp/promo enrichment (dispatch #220, 2026-08-30) ────────────────────
// qsr_menu_item_activity is a SEPARATE, tiny, fast-moving stream (27/27 stores, but only
// 2 calendar days deep as of this dispatch, growing by one day/night) — deliberately NOT
// folded into the pmixRows lazy-fill/wide-range machinery above, which is sized for a
// multi-million-row table and re-fetches per range TIER, not per location scope. This
// panel instead loads menu-item-activity rows directly (loadQsrMenuItemActivity(),
// src/lib/supabase.js) keyed only to the same dateRange already computed for margins —
// NOT re-fetched on location-scope changes, since enrichItemMargins() joins purely on
// (loc, item_number) already present in marginRows; an unfiltered-by-loc activity fetch
// still only ever matches the locs actually in scope. Own local loading state, same
// idle/loading/loaded/error convention src/views/security-panel.js already uses for a
// panel-local (non-ds) Supabase read.
import * as React from 'react';
import { RoutePanelShell } from '../components/ModalShell.js';
import { LocationSelector, buildLocationHierarchy, locationSelectorLocs } from '../components/PanelControls.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { normLoc } from '../engine/insights.js';
import { lastClosedBusinessDay } from '../utils/date.js';
import { computeItemMargins, enrichItemMargins, clampToLastClosedDay } from '../engine/pricing-engine.js';
import { loadQsrMenuItemActivity } from '../lib/supabase.js';
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
// Dispatch #220 — waste/comp/promo dollars are already real $ amounts (unlike
// marginPct, which needs a dollar-weighted blend to avoid averaging averages), so
// summing them across stores is exact, not an approximation. The *PctOfActivity fields
// are rates, though, and get the SAME dollar-weighting treatment marginPct already gets
// below: Σwaste / Σactivity (via activityUnits), never a plain mean of each store's own
// pct. hasActivity distinguishes "every store row was null (no activity data at all for
// this item in scope)" from "summed to a real zero" — same null-vs-0 distinction
// enrichItemMargins() itself makes at the single-store grain.
function aggregateAcrossStores(rows) {
  const byItem = new Map();
  for (const r of rows) {
    let a = byItem.get(r.itemNumber);
    if (!a) {
      a = {
        itemNumber: r.itemNumber, descr: r.descr, volume: 0, totalContrib: 0,
        revenue: 0, priceRevenue: 0, foodCostVol: 0, paperCostVol: 0, storeRows: [],
        wasteUnits: 0, wasteDollars: 0, compUnits: 0, compDollars: 0,
        promoUnits: 0, promoDollars: 0, activityUnits: 0, hasActivity: false,
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
    if (r.wasteUnits != null) {
      a.hasActivity = true;
      a.wasteUnits += r.wasteUnits; a.wasteDollars += r.wasteDollars;
      a.compUnits += r.compUnits;   a.compDollars += r.compDollars;
      a.promoUnits += r.promoUnits; a.promoDollars += r.promoDollars;
      a.activityUnits += r.activityUnits || 0;
    }
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
      wasteUnits: a.hasActivity ? a.wasteUnits : null, wasteDollars: a.hasActivity ? a.wasteDollars : null,
      compUnits: a.hasActivity ? a.compUnits : null, compDollars: a.hasActivity ? a.compDollars : null,
      promoUnits: a.hasActivity ? a.promoUnits : null, promoDollars: a.hasActivity ? a.promoDollars : null,
      activityUnits: a.hasActivity ? a.activityUnits : null,
      wastePctOfActivity: a.hasActivity && a.activityUnits > 0 ? a.wasteUnits / a.activityUnits : null,
      compPctOfActivity:  a.hasActivity && a.activityUnits > 0 ? a.compUnits  / a.activityUnits : null,
      promoPctOfActivity: a.hasActivity && a.activityUnits > 0 ? a.promoUnits / a.activityUnits : null,
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
      // MI# leads (owner-stated 2026-09-01: "list it first" -- multiple Menu Item #s can
      // exist for what looks like the same product, e.g. promo-pricing variants, so the
      // number is the real identifying key, not the description).
      td({ style: { padding: '6px 10px', fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--gold)' } },
        (wide ? (expanded ? '▾ ' : '▸ ') : '') + '#' + row.itemNumber),
      td({ style: { padding: '6px 10px', fontSize: 11, color: 'var(--text2)' } }, row.descr || '—'),
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

const HEAD_COLS = ['MI #', 'Item', 'Store', 'Price', 'Food+Paper', 'Margin $', 'Margin %', 'Volume', '$ Contrib'];

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

// ── Waste/comp/promo drain table (dispatch #220) ────────────────────────────────────
// A separate row/table component rather than reusing ItemRow/RankedTable's fixed
// HEAD_COLS -- the columns this table needs (Waste $, Waste %, Comp $, Promo $,
// Activity) don't overlap with the margin tables' Price/Food+Paper/Margin columns, and
// bolting an optional column set onto ItemRow would make both harder to read. Same
// wide/expand-to-per-store-rows interaction as ItemRow, though, for a consistent feel.
const DRAIN_HEAD_COLS = ['MI #', 'Item', 'Store', 'Waste $', 'Waste %', 'Comp $', 'Promo $ (cost basis)', 'Activity'];

function DrainRow({ row, wide, expanded, onToggle }) {
  return [
    tr({
      key: row.itemNumber, onClick: wide ? onToggle : undefined,
      style: { borderBottom: '.5px solid var(--bdr)', cursor: wide ? 'pointer' : 'default' },
    },
      // MI# leads -- see the identical comment on ItemRow above.
      td({ style: { padding: '6px 10px', fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--gold)' } },
        (wide ? (expanded ? '▾ ' : '▸ ') : '') + '#' + row.itemNumber),
      td({ style: { padding: '6px 10px', fontSize: 11, color: 'var(--text2)' } }, row.descr || '—'),
      td({ style: { padding: '6px 10px', fontSize: 9, color: 'var(--text3)' } },
        wide ? 'All stores' : sNameC(row.loc) || row.loc),
      td({ style: { padding: '6px 10px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--crit)' } }, f$0(row.wasteDollars)),
      td({ style: { padding: '6px 10px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' } }, fPc(row.wastePctOfActivity)),
      td({ style: { padding: '6px 10px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 } }, f$0(row.compDollars)),
      td({ style: { padding: '6px 10px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' } }, f$0(row.promoDollars)),
      td({ style: { padding: '6px 10px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' } }, fN0(row.activityUnits)),
    ),
    wide && expanded && row.storeRows && row.storeRows.map(sr => tr({
      key: row.itemNumber + '|' + sr.loc, style: { borderBottom: '.5px solid var(--bdr)', background: 'var(--surf2)' },
    },
      td({ style: { padding: '4px 10px 4px 28px', fontSize: 10, color: 'var(--text3)' }, colSpan: 3 }, sNameC(sr.loc) || sr.loc),
      td({ style: { padding: '4px 10px', fontSize: 10, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' } }, f$0(sr.wasteDollars)),
      td({ style: { padding: '4px 10px', fontSize: 10, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' } }, fPc(sr.wastePctOfActivity)),
      td({ style: { padding: '4px 10px', fontSize: 10, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' } }, f$0(sr.compDollars)),
      td({ style: { padding: '4px 10px', fontSize: 10, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' } }, f$0(sr.promoDollars)),
      td({ style: { padding: '4px 10px', fontSize: 10, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' } }, fN0(sr.activityUnits)),
    )),
  ];
}

function DrainTable({ title, subtitle, rows, wide, expandedSet, onToggle }) {
  return div(null,
    div({ style: { padding: '10px 14px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' } }, title),
    subtitle && div({ style: { padding: '0 14px 6px', fontSize: 9, color: 'var(--text3)' } }, subtitle),
    div({ style: { overflowX: 'auto' } },
      table({ style: { width: '100%', borderCollapse: 'collapse', minWidth: 640 } },
        thead(null, tr(null, ...DRAIN_HEAD_COLS.map((c, i) => th({
          key: c, style: { padding: '4px 10px', fontSize: 8.5, color: 'var(--text3)', textAlign: i >= 3 ? 'right' : 'left', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '.5px solid var(--bdr2)' },
        }, c)))),
        tbody(null,
          !rows.length
            ? tr(null, td({ colSpan: DRAIN_HEAD_COLS.length, style: { padding: 16, fontSize: 11, color: 'var(--text3)', textAlign: 'center' } },
              'No waste/comp/promo activity data for this scope/range yet — qsr_menu_item_activity is a new stream, still shallow (a couple of days deep as of this feature) and growing daily.'))
            : rows.map(row => h(DrainRow, {
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

  // Owner-reported 2026-09-01: "I am not sure the Price you are populating is the correct
  // price on a lot of items, making the margins seem way off." See clampToLastClosedDay()'s
  // own header (src/engine/pricing-engine.js) for the live-measured root cause and evidence
  // -- this clamps the raw data max to the last CLOSED business day, so an in-progress day
  // never silently understates a "current" menu price.
  const maxDate = uM(() => {
    let max = null;
    (ds.pmixRows || []).forEach(r => { const d = pmixDate(r); if (!isNaN(d) && (!max || d > max)) max = d; });
    return clampToLastClosedDay(max, lastClosedBusinessDay());
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

  // ── Menu-item-activity load (dispatch #220) — keyed to dateRange ONLY, not
  // locFilterKey/scope: enrichItemMargins() joins purely on (loc, item_number) already
  // present in itemRows, so an unfiltered-by-loc activity fetch still only ever matches
  // whatever's in scope. This means switching the LocationSelector re-filters instantly
  // client-side instead of re-hitting Supabase, the same "fetch by window, filter loc in
  // memory" shape the pmixRows lazy-fill above already uses.
  const [activityState, setActivityState] = uSt('idle'); // idle | loading | loaded | error
  const [activityRows, setActivityRows] = uSt([]);
  uE(() => {
    let cancelled = false;
    setActivityState('loading');
    loadQsrMenuItemActivity({ dateRange }).then(rows => {
      if (cancelled) return;
      setActivityRows(rows || []);
      setActivityState('loaded');
    }).catch(() => {
      if (cancelled) return;
      setActivityState('error');
    });
    return () => { cancelled = true; };
  }, [dateRange]);

  const enrichedItemRows = uM(
    () => enrichItemMargins(itemRows, activityRows, { dateRange }),
    [itemRows, activityRows, dateRange],
  );

  const displayRows = uM(() => (wide ? aggregateAcrossStores(enrichedItemRows) : enrichedItemRows), [enrichedItemRows, wide]);

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

  // Dispatch #220 — ranked by wasteDollars + compDollars ONLY. promo is shown as its own
  // column but deliberately left OUT of this sort key: its $ figure is the food-cost
  // basis of promo'd units (a different kind of dollar figure than a true loss), and
  // folding it into the same ranking would blur "what's actually getting thrown away or
  // given away" against "what got sold at a discount but still generated real revenue."
  const byDrain = uM(() => displayRows
    .filter(r => r.wasteDollars != null || r.compDollars != null)
    .slice()
    .sort((a, b) => ((b.wasteDollars || 0) + (b.compDollars || 0)) - ((a.wasteDollars || 0) + (a.compDollars || 0)))
    .slice(0, 15), [displayRows]);

  const scopeLabel = scope.level === 'all' ? 'District' : scope.level === 'store'
    ? (sNameC(scope.id) || scope.id) : (tree.storeLabel ? scope.id : scope.id);

  const heroLine = scopeTotals.blendedPct == null ? null
    : `${scopeLabel} blended margin ${fPc(scopeTotals.blendedPct)} — ${scopeTotals.belowThreshold ? scopeTotals.belowThreshold + ' item' + (scopeTotals.belowThreshold === 1 ? '' : 's') + ` below ${Math.round(MARGIN_CONCERN_PCT * 100)}%, chase those first` : `no items below ${Math.round(MARGIN_CONCERN_PCT * 100)}%, margins look healthy`}`;

  // Say the number AND the decision (standing UI-voice rule) -- not a bare dollar figure.
  const drainHeroLine = uM(() => {
    const top = byDrain[0];
    if (!top) return null;
    const drain = (top.wasteDollars || 0) + (top.compDollars || 0);
    if (drain <= 0) return null;
    const wasteShare = top.wastePctOfActivity != null ? `, ${fPc(top.wastePctOfActivity)} of its own activity is waste` : '';
    return `${top.descr || ('#' + top.itemNumber)}: ${f$0(drain)} in waste + comp this window${wasteShare} — check holding times / comp discipline.`;
  }, [byDrain]);

  const drainSubtitle = activityState === 'loading'
    ? 'Loading waste/comp/promo activity…'
    : activityState === 'error'
      ? 'Could not load waste/comp/promo activity for this window — try reopening this panel.'
      : 'Ranked by waste $ + comp $. Promo $ is the FOOD-COST basis of promo\'d units (cost, not the discount given) — a different kind of dollar figure, shown separately, not folded into this ranking. qsr_menu_item_activity is a new stream, still shallow (a couple of days deep as of this feature) and growing daily.';

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
        drainHeroLine && div({ style: { padding: '12px 14px', margin: '14px 14px 0', borderTop: '.5px solid var(--bdr)', background: 'var(--surf2)' } },
          div({ style: { fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 } }, 'Biggest waste/comp/promo drain, this scope/range'),
          div({ style: { fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 } }, drainHeroLine),
        ),
        h(DrainTable, {
          title: 'Waste / Comp / Promo Dollar Drains',
          subtitle: drainSubtitle,
          rows: byDrain, wide, expandedSet, onToggle: toggleExpand,
        }),
      );

  return h(RoutePanelShell, {
    title: '💲 Pricing Engine', onBack: onClose,
    subtitle: 'Per-item margin (menu price vs. food + paper cost) — qsr_product_mix, auto-pulled',
    bodyStyle: { padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
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
