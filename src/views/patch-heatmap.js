// @ts-nocheck
// ── Patch Heatmap (#201) ────────────────────────────────────────────────────────
// All 27 stores as a colored status grid at the top of At A Glance — "which store needs
// me today?" answered spatially instead of by reading a tile strip and a list.
//
// Color = "how is this store doing overall," via worst-of-N — per store, evaluate N
// dimensions against THAT STORE'S OWN targets, color by the worst one, and name it
// (e.g. "Ardmore-Broadway 🔴 FOB"). Within-store and absolute, never a cross-store
// ranking: a store's color depends only on its own numbers vs its own targets, never on
// how any other store is doing. All healthy -> nothing red; all bad -> all 27 red — the
// grid must never manufacture a worst store on a good day.
//
// This is a correction (v4.986) of the first cut (v4.985), which colored by Needs
// Attention severity — a district-relative "who needs me right now" ranking. That
// matched the issue's ORIGINAL body text, but the actual owner decision (recorded live
// in conversation, not written back to the issue at the time) was worst-of-N absolute
// health, per the owner verbatim: "I believe how the store is doing overall… green is
// good and red is bad for analysis, therefore we would be drawn to red needing
// attention" -> "I'm good with worst of n." The issue body has since been corrected to
// match. groupAttentionByStore (engine/attention-feed.js) is deliberately NOT used here
// — it's the right answer to "who needs me right now," a different question, and the
// issue is explicit the two must not be blended into this grid.
//
// Dimensions (each normalized to a common 0-100 "health band" before comparing — Ops
// data is 0-100 already, FOB/Labor gaps are percentage points, Sales/Speed gaps are
// percent, so a raw min() across them would compare 3pp against 12% and pick a wrong
// worst; band() below converts all of them to the same units first):
//   Sales    — matched-day actual vs LY (store.pSales / store.pLY, already computed)
//   FOB      — store's own FOB% vs its own target (t.tFOBTarget), percentage points over
//   Labor    — labor% vs the resolved approved target (resolveLaborTarget), pp over
//   Speed    — OEPE vs target (t.tOepe), percent over
//   Controls — ctrlScore (already 0-100, used directly — no unit conversion needed)
// Any dimension missing its inputs for a store is skipped for that store, not scored as
// good or bad. If EVERY dimension is missing (no period data at all), the store is
// "unknown" (gray ?), never green — the exact failure class the FOB Report false-all-clear
// fix (v4.976, earlier this session) addressed.
//
// No charting library (CSS grid + colored cells), no animation (owner declined it —
// draws the eye to what is live rather than what is important), colorblind-safe (color
// is always paired with a glyph and the dimension's name, never color alone).
import * as React from 'react';
import { STORE_NAMES, sNameC, INV_ORG_COORDS } from '../constants.js';
import { unpad, fobByStoreLatest } from './attention-now.js';
import { resolveLaborTarget } from '../engine/labor-basis.js';
import { CoachingModal } from './coaching-modal.js';

// #208 — which of this grid's dimensions have a coaching-loop metric behind them. Food cost
// and labor only, per the issue's own scope discipline — Sales/Speed/Controls have no
// COACHING_METRICS entry and get no "Coach this" button.
const COACH_METRIC_BY_DIM = { FOB: 'fob_total_pct', Labor: 'labor_pct' };

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

const CLEAN_COLOR = '#34d399';     // established "good" green (session.js/projections.js/AuthGate.js)
const WATCH_COLOR = '#f5bc00';     // matches SEV_META.warn — kept visually consistent app-wide
const CRIT_COLOR = '#f87171';      // matches SEV_META.crit
const UNKNOWN_COLOR = 'var(--text3)';

// Converts a "gap past target" into a 0-100 health band: 100 at/better than target,
// linearly down to 0 once the gap reaches badAt (in the SAME unit as gap — pp or %).
// A negative gap (better than target) always bands to 100, never above.
function bandFromGap(gap, badAt) {
  if (gap == null || !(badAt > 0)) return null;
  return Math.max(0, Math.min(100, 100 * (1 - Math.max(0, gap) / badAt)));
}

// Builds this store's N dimensions, each {label, band, detail}. `band` is null (and the
// dimension excluded from worst-of-N) when the store lacks the inputs for it — never
// defaulted to a fabricated "good" or "bad" value.
function storeDimensions(store, fobRow) {
  const dims = [];
  const t = store.t || {};

  if (store.pSales > 0 && store.pLY > 0) {
    const pct = (store.pSales - store.pLY) / store.pLY * 100; // negative = behind LY
    dims.push({ label: 'Sales', band: bandFromGap(-pct, 15), detail: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs LY` });
  }
  if (fobRow && fobRow.fobPct != null && t.tFOBTarget != null) {
    const overPp = (fobRow.fobPct - t.tFOBTarget) * 100;
    dims.push({ label: 'FOB', band: bandFromGap(overPp, 3), detail: `${(fobRow.fobPct * 100).toFixed(2)}% vs ${(t.tFOBTarget * 100).toFixed(2)}% target` });
  }
  const laborTarget = resolveLaborTarget(t);
  if (store.p && store.p.laborPct > 0 && laborTarget > 0) {
    const overPp = (store.p.laborPct - laborTarget) * 100;
    dims.push({ label: 'Labor', band: bandFromGap(overPp, 3), detail: `${(store.p.laborPct * 100).toFixed(2)}% vs ${(laborTarget * 100).toFixed(2)}% target` });
  }
  if (store.p && store.p.oepe > 0 && t.tOepe > 0) {
    const overPct = (store.p.oepe - t.tOepe) / t.tOepe * 100;
    dims.push({ label: 'Speed', band: bandFromGap(overPct, 20), detail: `${Math.round(store.p.oepe)}s vs ${Math.round(t.tOepe)}s target` });
  }
  if (typeof store.ctrlScore === 'number') {
    dims.push({ label: 'Controls', band: Math.max(0, Math.min(100, store.ctrlScore)), detail: `${store.ctrlScore.toFixed(0)} score` });
  }
  return dims;
}

function bandColor(band) {
  if (band >= 80) return CLEAN_COLOR;
  if (band >= 50) return WATCH_COLOR;
  return CRIT_COLOR;
}

function cellStatus(store, fobRow) {
  const dims = storeDimensions(store, fobRow).filter(d => d.band != null);
  if (!dims.length) return { key: 'unknown', glyph: '?', color: UNKNOWN_COLOR, label: null, dims: [] };
  const worst = dims.reduce((a, b) => b.band < a.band ? b : a);
  const color = bandColor(worst.band);
  const key = color === CLEAN_COLOR ? 'clean' : color === WATCH_COLOR ? 'warn' : 'crit';
  const glyph = key === 'clean' ? '✓' : key === 'warn' ? '•' : '!';
  return { key, glyph, color, label: key === 'clean' ? null : worst.label, dims, worst };
}

export function PatchHeatmap({ ds, stores, dateRange, onOpenStore, onCoachingSaved }) {
  const { useMemo, useState } = React;
  const [selected, setSelected] = useState(null); // loc of the expanded detail cell
  const [coachTarget, setCoachTarget] = useState(null); // {loc, metricKey} or null

  const fobByLoc = useMemo(() => fobByStoreLatest(ds?.qsrFobRows || []), [ds]);

  const cells = useMemo(() => {
    const all = (stores || []).filter(s => /^\d+$/.test(String(s.loc)));
    return all.map(store => {
      const loc = unpad(store.loc);
      const status = cellStatus(store, fobByLoc[loc]);
      const state = (INV_ORG_COORDS[loc] || {}).state || 'OK';
      return { loc, store, state, status };
    }).sort((a, b) => a.state !== b.state ? a.state.localeCompare(b.state) : sNameC(a.loc).localeCompare(sNameC(b.loc)));
  }, [stores, fobByLoc]);

  if (!cells.length) return null;

  const selectedCell = selected ? cells.find(c => c.loc === selected) : null;
  const countsByStatus = cells.reduce((acc, c) => { acc[c.status.key] = (acc[c.status.key] || 0) + 1; return acc; }, {});

  return div({ style: { background: 'var(--surf)', borderBottom: '.5px solid var(--bdr)', padding: '10px 24px 12px', flexShrink: 0 } },
    div({ style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' } },
      span({ style: { fontSize: '11px', fontWeight: 800, color: 'var(--text)' } }, '🗺 Patch Heatmap'),
      span({ style: { fontSize: '8.5px', color: 'var(--text3)' } }, 'worst dimension vs each store\'s own targets · click a store for why'),
      div({ style: { display: 'flex', gap: 8, marginLeft: 'auto', fontSize: '8.5px', color: 'var(--text3)' } },
        countsByStatus.crit ? span({ style: { color: CRIT_COLOR } }, '! ' + countsByStatus.crit + ' critical') : null,
        countsByStatus.warn ? span({ style: { color: WATCH_COLOR } }, '• ' + countsByStatus.warn + ' watch') : null,
        span({ style: { color: CLEAN_COLOR } }, '✓ ' + (countsByStatus.clean || 0) + ' clean'),
        countsByStatus.unknown ? span({ style: { color: UNKNOWN_COLOR } }, '? ' + countsByStatus.unknown + ' unknown') : null,
      )
    ),
    div({ style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 5 } },
      ...cells.map(c => div({
        key: c.loc,
        onClick: () => setSelected(sel => sel === c.loc ? null : c.loc),
        title: c.status.key === 'unknown' ? 'No data this period' : c.status.label ? `Worst: ${c.status.label}` : 'All dimensions healthy',
        style: {
          cursor: 'pointer', borderRadius: 5, padding: '6px 7px', fontSize: '9.5px',
          background: c.status.key === 'clean' ? 'rgba(52,211,153,.08)' : c.status.key === 'unknown' ? 'rgba(148,163,184,.06)' : c.status.color + '18',
          border: '1px solid ' + (selected === c.loc ? c.status.color : c.status.color + '35'),
          display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
        },
      },
        div({ style: { display: 'flex', alignItems: 'center', gap: 4 } },
          span({ style: { color: c.status.color, fontWeight: 800, fontSize: '10px' } }, c.status.glyph),
          c.status.label ? span({ style: { color: c.status.color, fontWeight: 700, fontSize: '8.5px' } }, c.status.label) : null,
        ),
        span({ style: { color: 'var(--text2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          sNameC(c.loc).split(',')[0].trim())
      ))
    ),
    selectedCell && div({ style: {
      marginTop: 8, padding: '8px 10px', borderRadius: 6, background: 'var(--surf2)',
      border: '.5px solid ' + selectedCell.status.color + '40', fontSize: '10px',
    } },
      div({ style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } },
        span({ style: { fontWeight: 800, color: 'var(--text)' } }, sNameC(selectedCell.loc)),
        span({ style: { color: selectedCell.status.color, fontSize: '9px', fontWeight: 700 } },
          selectedCell.status.key === 'crit' ? 'Critical' : selectedCell.status.key === 'warn' ? 'Watch' : selectedCell.status.key === 'unknown' ? 'No data' : 'Clean'),
        h('button', {
          onClick: () => onOpenStore && onOpenStore(selectedCell.loc),
          style: { marginLeft: 'auto', fontSize: '9px', padding: '2px 8px', borderRadius: 4, background: 'transparent', color: 'var(--amber)', border: '.5px solid rgba(245,188,0,.4)', cursor: 'pointer' },
        }, 'Open store →'),
      ),
      selectedCell.status.dims.length
        ? div({ style: { display: 'flex', flexDirection: 'column', gap: 3 } },
          ...selectedCell.status.dims
            .slice()
            .sort((a, b) => a.band - b.band)
            .map((d, i) => div({ key: d.label, style: { display: 'flex', gap: 6, alignItems: 'baseline' } },
              span({ style: { color: bandColor(d.band), fontWeight: 700, fontSize: '9px', minWidth: 44 } }, d.label),
              span({ style: { color: 'var(--text2)', flex: 1 } }, d.detail),
              COACH_METRIC_BY_DIM[d.label] && h('button', {
                onClick: () => setCoachTarget({ loc: selectedCell.loc, metricKey: COACH_METRIC_BY_DIM[d.label] }),
                title: 'Start a coaching cycle for this store + metric (#208)',
                style: { fontSize: '8px', padding: '1px 6px', borderRadius: 3, background: 'transparent', color: 'var(--text3)', border: '.5px solid var(--bdr)', cursor: 'pointer', flexShrink: 0 },
              }, '🎯 Coach'))))
        : div({ style: { color: 'var(--text3)' } }, 'No auto/emailed data landed for this store in the selected period.')
    ),
    coachTarget && h(CoachingModal, {
      mode: 'start', loc: coachTarget.loc, metricKey: coachTarget.metricKey, ds,
      onClose: () => setCoachTarget(null),
      onSaved: onCoachingSaved,
    })
  );
}
