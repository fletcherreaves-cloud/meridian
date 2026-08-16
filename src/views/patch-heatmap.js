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
// ⚠️ #231 — NONE of these 5 dimensions are scoped to At A Glance's page-level date-range
// selector. This grid does NOT accept a dateRange prop (removed, was accepted-and-dropped —
// see below). Each dimension is a FIXED rolling-window "how healthy is this store RIGHT NOW"
// read, on its own window, always relative to "now"/lastClosedBusinessDay():
//   Sales             — matched-day, trailing 28 days (pipeline.js buildStore's cut4/now4)
//   FOB               — latest snapshot only (fobByStoreLatest below), not a window at all
//   Labor/Speed/Ctrl  — pipeline.js buildStore's compute6wk(), trailing settings.weeksBack
//                       weeks (default 6) — the same rolling window StoreCard/RankingView use
// This is deliberate, not an oversight: per the design above, this grid answers "how is this
// store doing overall," an absolute rolling-health question — not "how did this store do in
// the period I picked," a different question the page's date-range selector answers for
// OTHER panels. Measured 2026-08-12 (owner-reported, #231): a component here previously
// destructured a `dateRange` prop and never referenced it again in the file — at-a-glance.js
// passed it faithfully, the grid silently dropped it, and an 8-day window vs a 32-day window
// produced byte-identical output on every store, because `stores` (built once per data-load
// via pipeline.js's buildStore/compute6wk) was never a function of the page's selector to
// begin with. The fix is not to wire it through — that would mean re-parameterizing
// buildStore/compute6wk's core pipeline (dozens of other consumers) for a widget whose own
// design intent was never period-comparison — the fix is to stop implying it responds to a
// control it never could. See the subtitle text below and the 4 empty-state strings, all of
// which used to falsely claim period-scoping in their copy.
//
// No charting library (CSS grid + colored cells), no animation (owner declined it —
// draws the eye to what is live rather than what is important), colorblind-safe (color
// is always paired with a glyph and the dimension's name, never color alone).
import * as React from 'react';
import { STORE_NAMES, sNameC, INV_ORG_COORDS, supervisorGroups } from '../constants.js';
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
const CRIT_COLOR = 'var(--crit)';      // matches SEV_META.crit
const UNKNOWN_COLOR = 'var(--text3)';

// #dispatch11 — CRIT_COLOR/UNKNOWN_COLOR are CSS var() references, but every call site below
// alpha-tints a status color by string-concatenating a 2-digit hex suffix onto it (e.g.
// status.color+'18'). That only produces valid CSS when the color is a hex literal —
// concatenating onto var(--crit) yields the literal invalid string "var(--crit)18", which the
// browser silently drops, so critical cells lost their tinted background/border outright
// (v5.023's hex->var(--crit) conversion regressed this; UNKNOWN_COLOR has had the same flaw,
// border-only, since v4.984 — status.color was always var(--text3) for the 'unknown' case).
// Normalizes both forms: a hex literal keeps the old suffix-concat behavior unchanged; a var()
// reference goes through color-mix() instead, since a custom property can't be alpha-blended
// by string concatenation (and reading its resolved value needs a DOM query these plain style
// objects don't have access to).
export const withAlpha = (color, hexSuffix) => {
  if (!color || !color.startsWith('var(')) return color + hexSuffix;
  const pct = Math.round((parseInt(hexSuffix, 16) / 255) * 100);
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
};

// Converts a "gap past target" into a 0-100 health band: 100 at/better than target,
// linearly down to 0 once the gap reaches badAt (in the SAME unit as gap — pp or %).
// A negative gap (better than target) always bands to 100, never above.
export function bandFromGap(gap, badAt) {
  if (gap == null || !(badAt > 0)) return null;
  return Math.max(0, Math.min(100, 100 * (1 - Math.max(0, gap) / badAt)));
}

// #219 — badAt calibration. band = 100*(1-gap/badAt) with clean>=80 / watch>=50 means WATCH
// fires at 0.2*badAt and CRITICAL fires at 0.5*badAt, not at badAt itself — a structural fact
// the original v4.985/986 constants (chosen, not derived) missed entirely, which is why the
// first production look flagged 26 of 27 stores the same day the rest of the dashboard read
// 25 of 27 as trusted-healthy. Measured 2026-08-11 (owner, scripts/measure-patch-heatmap-bands.mjs
// against live production): badAt below = 2 x each dimension's over-target p90, so CRITICAL
// anchors to "worse than 90% of over-target days" as intended, not p90 itself. Sales and Labor
// were far too tight (Labor 3->8.8, ~2.9x; Speed 20->73, ~3.7x — Speed did most of the damage);
// FOB was the opposite, genuinely loose at 2% critical (3->1.9, tighter). Expected result on the
// measured distribution: ~6 critical / 14 watch / 7 clean, vs the original 18/8/1. Controls is a
// composite score (computeOpsScore), not a raw gap-to-target — correctly left uncalibrated here.
export function storeDimensions(store, fobRow) {
  const dims = [];
  const t = store.t || {};

  if (store.pSales > 0 && store.pLY > 0) {
    const pct = (store.pSales - store.pLY) / store.pLY * 100; // negative = behind LY
    dims.push({ label: 'Sales', band: bandFromGap(-pct, 27), detail: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs LY` });
  }
  if (fobRow && fobRow.fobPct != null && t.tFOBTarget != null) {
    const overPp = (fobRow.fobPct - t.tFOBTarget) * 100;
    dims.push({ label: 'FOB', band: bandFromGap(overPp, 1.9), detail: `${(fobRow.fobPct * 100).toFixed(2)}% vs ${(t.tFOBTarget * 100).toFixed(2)}% target` });
  }
  const laborTarget = resolveLaborTarget(t);
  if (store.p && store.p.laborPct > 0 && laborTarget > 0) {
    const overPp = (store.p.laborPct - laborTarget) * 100;
    dims.push({ label: 'Labor', band: bandFromGap(overPp, 8.8), detail: `${(store.p.laborPct * 100).toFixed(2)}% vs ${(laborTarget * 100).toFixed(2)}% target` });
  }
  if (store.p && store.p.oepe > 0 && t.tOepe > 0) {
    const overPct = (store.p.oepe - t.tOepe) / t.tOepe * 100;
    dims.push({ label: 'Speed', band: bandFromGap(overPct, 73), detail: `${Math.round(store.p.oepe)}s vs ${Math.round(t.tOepe)}s target` });
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

// Worst-of-N, factored out so both a single store's dims (storeDimensions) and a whole
// patch's AGGREGATED dims (patchDimensions, #220) go through the identical rule: excluded
// (null-band) dimensions never count as good or bad, and zero real dimensions is "unknown"
// (gray ?), never green.
function statusFromDims(dims) {
  const real = (dims || []).filter(d => d.band != null);
  if (!real.length) return { key: 'unknown', glyph: '?', color: UNKNOWN_COLOR, label: null, dims: [] };
  const worst = real.reduce((a, b) => b.band < a.band ? b : a);
  const color = bandColor(worst.band);
  const key = color === CLEAN_COLOR ? 'clean' : color === WATCH_COLOR ? 'warn' : 'crit';
  const glyph = key === 'clean' ? '✓' : key === 'warn' ? '•' : '!';
  return { key, glyph, color, label: key === 'clean' ? null : worst.label, dims: real, worst };
}

function cellStatus(store, fobRow) {
  return statusFromDims(storeDimensions(store, fobRow));
}

// #220 — patch-level rollup. AGGREGATE the underlying raw numbers across the patch's member
// stores FIRST (dollar/sales-weighted sums), THEN derive each dimension from the aggregate —
// never average the per-store PERCENTAGES or bands, and never colour a patch by its worst
// store (that tile is just the worst store again wearing a bigger badge: zero new
// information, and it goes red the moment any single store struggles — on the pre-#219 bands
// every patch would have been red). Same worst-of-N rule as a single store, via
// statusFromDims — a patch missing every dimension's inputs is "unknown," never green.
//
// Controls (ctrlScore) is deliberately excluded here, same reasoning as #219: it's a
// composite computeOpsScore builds from several inputs, not a raw gap-to-target this function
// can aggregate honestly without re-deriving that scoring logic per patch — a real follow-up,
// not solved here.
//
// Labor and Speed have no raw labor-$ or car-count figure surviving this far upstream, so
// both use SALES-weighted averages of the per-store percentage/seconds value — the same
// convention labor-tools.js's own district rollup already uses for labor% (not a new
// invention), and honestly a size-proxy rather than literal car-weighting for Speed (OEPE has
// no car-count weight anywhere else in this app either — see attention-now.js's dtRows
// comment). Sales and FOB DO have real dollar figures this far upstream (store.pSales/pLY,
// fobRow.sales/fob), so those sum raw dollars directly — a true dollar-weighted aggregate,
// not a proxy.
export function patchDimensions(members) { // members: [{store, fobRow}]
  const dims = [];

  const salesM = (members || []).filter(m => m.store.pSales > 0 && m.store.pLY > 0);
  if (salesM.length) {
    const pSales = salesM.reduce((a, m) => a + m.store.pSales, 0);
    const pLY = salesM.reduce((a, m) => a + m.store.pLY, 0);
    const pct = (pSales - pLY) / pLY * 100;
    dims.push({ label: 'Sales', band: bandFromGap(-pct, 27),
      detail: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs LY (${salesM.length} store${salesM.length !== 1 ? 's' : ''})` });
  }

  const fobM = (members || []).filter(m => m.fobRow && m.fobRow.fobPct != null && m.fobRow.sales > 0 && m.store.t && m.store.t.tFOBTarget != null);
  if (fobM.length) {
    const fSales = fobM.reduce((a, m) => a + m.fobRow.sales, 0);
    const fDollars = fobM.reduce((a, m) => a + m.fobRow.fob, 0);
    const fobPct = fDollars / fSales;
    const wTgt = fobM.reduce((a, m) => a + m.store.t.tFOBTarget * m.fobRow.sales, 0) / fSales;
    const overPp = (fobPct - wTgt) * 100;
    dims.push({ label: 'FOB', band: bandFromGap(overPp, 1.9),
      detail: `${(fobPct * 100).toFixed(2)}% vs ${(wTgt * 100).toFixed(2)}% target (${fobM.length} store${fobM.length !== 1 ? 's' : ''})` });
  }

  const laborM = (members || []).filter(m => m.store.p && m.store.p.laborPct > 0 && m.store.pSales > 0 && resolveLaborTarget(m.store.t || {}) > 0);
  if (laborM.length) {
    const wSales = laborM.reduce((a, m) => a + m.store.pSales, 0);
    const laborPct = laborM.reduce((a, m) => a + m.store.p.laborPct * m.store.pSales, 0) / wSales;
    const laborTgt = laborM.reduce((a, m) => a + resolveLaborTarget(m.store.t || {}) * m.store.pSales, 0) / wSales;
    const overPp = (laborPct - laborTgt) * 100;
    dims.push({ label: 'Labor', band: bandFromGap(overPp, 8.8),
      detail: `${(laborPct * 100).toFixed(2)}% vs ${(laborTgt * 100).toFixed(2)}% target (${laborM.length} store${laborM.length !== 1 ? 's' : ''})` });
  }

  const speedM = (members || []).filter(m => m.store.p && m.store.p.oepe > 0 && m.store.pSales > 0 && m.store.t && m.store.t.tOepe > 0);
  if (speedM.length) {
    const wSales = speedM.reduce((a, m) => a + m.store.pSales, 0);
    const oepe = speedM.reduce((a, m) => a + m.store.p.oepe * m.store.pSales, 0) / wSales;
    const tOepe = speedM.reduce((a, m) => a + m.store.t.tOepe * m.store.pSales, 0) / wSales;
    const overPct = (oepe - tOepe) / tOepe * 100;
    dims.push({ label: 'Speed', band: bandFromGap(overPct, 73),
      detail: `${Math.round(oepe)}s vs ${Math.round(tOepe)}s target (${speedM.length} store${speedM.length !== 1 ? 's' : ''})` });
  }

  return dims;
}

export function PatchHeatmap({ ds, stores, onOpenStore, onCoachingSaved }) {
  const { useMemo, useState } = React;
  const [selected, setSelected] = useState(null); // loc of the expanded detail cell
  const [selectedPatch, setSelectedPatch] = useState(null); // #220 — expanded patch tile
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

  // #220 — loc -> patch (supervisor), from the LIVE org (supervisorGroups(), kept in sync by
  // App.js on every settings load) rather than the frozen INV_ORG_COORDS.sup snapshot, so a
  // patch reassignment in Management shows up here without a code change. First-writer-wins
  // guards the "don't double-count a store in two patches" requirement even though a clean
  // partition shouldn't produce that in practice.
  const patchByLoc = useMemo(() => {
    let groups = {};
    try { groups = supervisorGroups() || {}; } catch { groups = {}; }
    const map = {};
    for (const patch of Object.keys(groups)) {
      for (const rawLoc of (groups[patch] || [])) {
        const loc = unpad(rawLoc);
        if (!map[loc]) map[loc] = patch;
      }
    }
    return map;
  }, []);

  const patches = useMemo(() => {
    const byPatch = {};
    for (const c of cells) {
      const patch = patchByLoc[c.loc];
      if (!patch) continue;
      (byPatch[patch] || (byPatch[patch] = [])).push({ store: c.store, fobRow: fobByLoc[c.loc] });
    }
    return Object.keys(byPatch).sort().map(patch => {
      const members = byPatch[patch];
      const status = statusFromDims(patchDimensions(members));
      return { patch, storeCount: members.length, status };
    });
  }, [cells, patchByLoc, fobByLoc]);

  if (!cells.length) return null;

  const selectedCell = selected ? cells.find(c => c.loc === selected) : null;
  const selectedPatchRow = selectedPatch ? patches.find(p => p.patch === selectedPatch) : null;
  const countsByStatus = cells.reduce((acc, c) => { acc[c.status.key] = (acc[c.status.key] || 0) + 1; return acc; }, {});

  return div({ style: { background: 'var(--surf)', borderBottom: '.5px solid var(--bdr)', padding: '10px 24px 12px', flexShrink: 0 } },
    div({ style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' } },
      span({ style: { fontSize: '11px', fontWeight: 800, color: 'var(--text)' } }, '🗺 Patch Heatmap'),
      span({ style: { fontSize: '8.5px', color: 'var(--text3)' } }, 'worst dimension vs each store\'s own targets, rolling ~4-6wk window (not the date range above) · click a store or patch for why'),
      div({ style: { display: 'flex', gap: 8, marginLeft: 'auto', fontSize: '8.5px', color: 'var(--text3)' } },
        countsByStatus.crit ? span({ style: { color: CRIT_COLOR } }, '! ' + countsByStatus.crit + ' critical') : null,
        countsByStatus.warn ? span({ style: { color: WATCH_COLOR } }, '• ' + countsByStatus.warn + ' watch') : null,
        span({ style: { color: CLEAN_COLOR } }, '✓ ' + (countsByStatus.clean || 0) + ' clean'),
        countsByStatus.unknown ? span({ style: { color: UNKNOWN_COLOR } }, '? ' + countsByStatus.unknown + ' unknown') : null,
      )
    ),
    // #220 — a patch row above the store grid: a genuinely different question (aggregate
    // patch health, dollar-weighted) from the store tiles below it, so it's laid out as its
    // own row rather than mixed into one grid with them.
    patches.length > 0 && div({ style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, paddingBottom: 8, borderBottom: '.5px solid var(--bdr)' } },
      ...patches.map(p => div({
        key: p.patch,
        onClick: () => setSelectedPatch(sel => sel === p.patch ? null : p.patch),
        title: p.status.key === 'unknown' ? 'No data available' : p.status.label ? `Worst: ${p.status.label}` : 'All dimensions healthy',
        style: {
          cursor: 'pointer', borderRadius: 6, padding: '7px 10px', fontSize: '9.5px', minWidth: 130,
          background: p.status.key === 'clean' ? 'rgba(52,211,153,.08)' : p.status.key === 'unknown' ? 'rgba(148,163,184,.06)' : withAlpha(p.status.color, '18'),
          border: '1.5px solid ' + (selectedPatch === p.patch ? p.status.color : withAlpha(p.status.color, '45')),
          display: 'flex', flexDirection: 'column', gap: 2,
        },
      },
        div({ style: { display: 'flex', alignItems: 'center', gap: 4 } },
          span({ style: { color: p.status.color, fontWeight: 800, fontSize: '11px' } }, p.status.glyph),
          span({ style: { color: 'var(--text)', fontWeight: 700, fontSize: '9.5px' } }, p.patch),
          p.status.label ? span({ style: { color: p.status.color, fontWeight: 700, fontSize: '8px', marginLeft: 'auto' } }, p.status.label) : null,
        ),
        span({ style: { color: 'var(--text3)', fontSize: '8px' } }, p.storeCount + ' store' + (p.storeCount !== 1 ? 's' : ''))
      )),
    ),
    selectedPatchRow && div({ style: {
      marginBottom: 8, padding: '8px 10px', borderRadius: 6, background: 'var(--surf2)',
      border: '.5px solid ' + withAlpha(selectedPatchRow.status.color, '40'), fontSize: '10px',
    } },
      div({ style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } },
        span({ style: { fontWeight: 800, color: 'var(--text)' } }, selectedPatchRow.patch + ' patch'),
        span({ style: { color: selectedPatchRow.status.color, fontSize: '9px', fontWeight: 700 } },
          selectedPatchRow.status.key === 'crit' ? 'Critical' : selectedPatchRow.status.key === 'warn' ? 'Watch' : selectedPatchRow.status.key === 'unknown' ? 'No data' : 'Clean'),
      ),
      selectedPatchRow.status.dims.length
        ? div({ style: { display: 'flex', flexDirection: 'column', gap: 3 } },
          ...selectedPatchRow.status.dims
            .slice()
            .sort((a, b) => a.band - b.band)
            .map(d => div({ key: d.label, style: { display: 'flex', gap: 6, alignItems: 'baseline' } },
              span({ style: { color: bandColor(d.band), fontWeight: 700, fontSize: '9px', minWidth: 44 } }, d.label),
              span({ style: { color: 'var(--text2)' } }, d.detail))))
        : div({ style: { color: 'var(--text3)' } }, 'No auto/emailed data landed for this patch yet.')
    ),
    div({ style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 5 } },
      ...cells.map(c => div({
        key: c.loc,
        onClick: () => setSelected(sel => sel === c.loc ? null : c.loc),
        title: c.status.key === 'unknown' ? 'No data available' : c.status.label ? `Worst: ${c.status.label}` : 'All dimensions healthy',
        style: {
          cursor: 'pointer', borderRadius: 5, padding: '6px 7px', fontSize: '9.5px',
          background: c.status.key === 'clean' ? 'rgba(52,211,153,.08)' : c.status.key === 'unknown' ? 'rgba(148,163,184,.06)' : withAlpha(c.status.color, '18'),
          border: '1px solid ' + (selected === c.loc ? c.status.color : withAlpha(c.status.color, '35')),
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
      border: '.5px solid ' + withAlpha(selectedCell.status.color, '40'), fontSize: '10px',
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
        : div({ style: { color: 'var(--text3)' } }, 'No auto/emailed data landed for this store yet.')
    ),
    coachTarget && h(CoachingModal, {
      mode: 'start', loc: coachTarget.loc, metricKey: coachTarget.metricKey, ds,
      onClose: () => setCoachTarget(null),
      onSaved: onCoachingSaved,
    })
  );
}
