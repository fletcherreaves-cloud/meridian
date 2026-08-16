// @ts-nocheck
// ── Bullseye Tile (#274) ──────────────────────────────────────────────────────
// From Notes 66 — owner, verbatim: "A tile or place to visually show each location based on
// selected metrics and scores... a chart... like a bullseye in style. Inner circle for stores
// beating target or top performers, first circle for those at target and outer band for those
// not meeting target. Scatter plotted using loc# and metric/score result."
//
// DISTRIBUTION GESTALT, not lookup — a sorted bar (the Leaderboard tile) beats a radial layout
// for finding one store; this tile answers "is the district tight around the centre, or
// splattered into the outer band" in one glance, which nothing else in At A Glance does.
//
// Four departures from the owner's original sketch, each with its reason (mirrors the issue's
// own framing of the FIRST three; the fourth is this file's own call, documented where it's made):
//   1. Angle = market/org sector (state, or patch when a state is selected), not loc# — ordering
//      stores by loc number carries no information. This converts a dead dimension into "is one
//      market carrying the other," answered at the same glance.
//   2. Three EQUAL-AREA bands (radius at sqrt(cumulative fraction)), not equal-radius — equal
//      radii give the outer band several times the inner circle's area, crowding top performers
//      while underperformers get a generous field. Backwards.
//   3. Dot colour is REDUNDANT with band membership (both encode above/at/below target) —
//      correct, since identity must never rest on colour alone. Uses the corrected trio
//      (#10b981/#f59e0b/#f43f5e) the issue specifies, as literal hex: the --good/--warn/--crit
//      tokens from #276 step 1 aren't on main yet (separate, still-open PR) and this tile
//      shouldn't depend on it landing first — same corrected values regardless, per the issue.
//   4. Metric list is NOT literally the Leaderboard's inline META (sales/oepe/labor/tred) —
//      it's the same SHAPE (getVal/fmt/higherBetter/label), reused deliberately, but 'sales' is
//      dropped and 'tpph' added. A bullseye radius fundamentally needs a TARGET, and the issue is
//      explicit: reuse DEFAULT_TARGETS/resolveLaborTarget, don't invent a second notion of
//      target. Sales has no static per-store target field (sales targets are monthly/dynamic);
//      OEPE/Labor%/TPPH/T-Red After% all resolve against a real DEFAULT_TARGETS field the rest
//      of the app already trusts (store.t.tOepe / resolveLaborTarget(store.t) / store.t.tTpph /
//      store.t.tRedAPct), via the SAME store.p/store.t objects PatchHeatmap reads (pipeline.js's
//      buildStore/compute6wk, already auto-first sourced) — no new data-sourcing surface.
//
// Radius model: radius = signed % vs the store's OWN target, positive = good, clamped to
// [MIN_BAD, MAX_GOOD]. Mapped onto the three equal-area rings as three linear segments so the
// radius is continuous (no jump at a band boundary) while each ring's total area still matches:
//   beating (pct >= +TOL):  r in [0, r1],  r1 at pct=+TOL,        0 at pct>=MAX_GOOD
//   at target (-TOL..+TOL): r in [r1, r2], linear across the tolerance band
//   below (pct <= -TOL):    r in [r2, maxR], maxR at pct<=MIN_BAD
// r1 = maxR*sqrt(1/3), r2 = maxR*sqrt(2/3) — the three rings (0-r1, r1-r2, r2-maxR) have equal
// area (πr1² each), the equal-AREA requirement from the issue.
//
// Angle model: sector = state (OK/FL) at "all" scope, or patch (supervisorGroups) when a single
// state is selected — "sectors subdivide the same way," per the issue. A patch-level scope has
// nothing left to subdivide into, so it's a single sector spanning the full circle (minus one
// small aesthetic gap). Arc size per sector is proportional to its member count (a 20-store
// sector and a 7-store sector get proportionally different arc widths, not equal halves) with a
// small gap between sectors. Within a sector, stores are spread EVENLY BY RANK — sorted by loc
// (a stable, meaning-free order) and index-spaced across the arc — never by the metric's value,
// which would silently smuggle a second ranking into a dimension the spec reserves for market
// structure only.
//
// Per-dot hover tooltip (required by the issue, not optional): store name, loc, metric value,
// target, Δ, rank. No floating-tooltip component exists anywhere else in this codebase to reuse
// (checked) — built here as a small state-driven card positioned by the dot's own SVG-unit
// coordinates converted to a percentage of the container, so it tracks the dot without a
// mouse-position listener or a getBoundingClientRect() call. A native `title` attribute rides
// alongside as a touch/no-JS fallback.
import * as React from 'react';
import { STORE_NAMES, sNameC, INV_ORG_COORDS, supervisorGroups } from '../constants.js';
import { unpad } from './attention-now.js';
import { resolveLaborTarget } from '../engine/labor-basis.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

// Corrected status trio (#276 step 1's own tokens, used here as literal hex — see header).
const GOOD_COLOR = 'var(--good)';
const WARN_COLOR = 'var(--warn)';
const CRIT_COLOR = 'var(--crit)';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const METRICS = {
  oepe: {
    label: 'OEPE', short: 'OEPE', higherBetter: false,
    getVal: s => (s.p && s.p.oepe > 0) ? s.p.oepe : null,
    getTarget: s => (s.t && s.t.tOepe > 0) ? s.t.tOepe : null,
    fmt: v => Math.round(v) + 's',
  },
  labor: {
    label: 'Labor %', short: 'Labor', higherBetter: false,
    getVal: s => (s.p && s.p.laborPct > 0) ? s.p.laborPct : null,
    getTarget: s => resolveLaborTarget(s.t || {}),
    fmt: v => (v * 100).toFixed(2) + '%',
  },
  tpph: {
    label: 'TPPH', short: 'TPPH', higherBetter: true,
    getVal: s => (s.p && s.p.tpph > 0) ? s.p.tpph : null,
    getTarget: s => (s.t && s.t.tTpph > 0) ? s.t.tTpph : null,
    fmt: v => v.toFixed(2),
  },
  tred: {
    label: 'T-Red After %', short: 'T-Red', higherBetter: false,
    getVal: s => (s.p && s.p.tRedAPct != null) ? s.p.tRedAPct : null,
    getTarget: s => (s.t && s.t.tRedAPct > 0) ? s.t.tRedAPct : null,
    fmt: v => (v * 100).toFixed(2) + '%',
  },
};

// Tolerance + clamp constants for the radius model (see header). A RELATIVE percent, uniform
// across all four metrics, deliberately not store-dash.js's labor-only PERCENTAGE-POINT
// green/yellow thresholds (0.5pp/1.5pp) — those don't generalize to OEPE/TPPH/T-Red in
// relative-% terms, and the issue's own radius spec is explicitly a relative-% model.
const TOL = 0.03;       // within ±3% of target = "at target"
const MAX_GOOD = 0.20;  // 20%+ beating target clamps to dead centre
const MIN_BAD = -0.30;  // 30%+ below target clamps to the outer edge

// Positive = good, for every metric, regardless of higher-is-better or lower-is-better —
// the whole point of normalizing to percent-of-target (issue's own framing: a raw-score
// radius puts good stores on opposite sides depending on which metric is selected).
function signedPct(metric, value, target) {
  if (value == null || !(target > 0)) return null;
  const raw = (value - target) / target;
  return metric.higherBetter ? raw : -raw;
}

function bandKey(pct) {
  if (pct == null) return null;
  if (pct >= TOL) return 'beating';
  if (pct <= -TOL) return 'below';
  return 'at';
}
function bandColor(key) {
  return key === 'beating' ? GOOD_COLOR : key === 'below' ? CRIT_COLOR : key === 'at' ? WARN_COLOR : 'var(--text3)';
}
function bandLabel(key) {
  return key === 'beating' ? 'Beating target' : key === 'below' ? 'Below target' : key === 'at' ? 'At target' : 'No data';
}

// r1/r2 = equal-area ring boundaries (see header maths). Continuous across all three segments.
function radiusFor(pct, maxR) {
  const r1 = maxR * Math.sqrt(1 / 3), r2 = maxR * Math.sqrt(2 / 3);
  if (pct == null) return null;
  if (pct >= TOL) {
    const t = clamp((pct - TOL) / (MAX_GOOD - TOL), 0, 1);
    return r1 * (1 - t);
  }
  if (pct <= -TOL) {
    const t = clamp((-pct - TOL) / (-MIN_BAD - TOL), 0, 1);
    return r2 + (maxR - r2) * t;
  }
  const t = (TOL - pct) / (2 * TOL); // 0 at pct=+TOL, 1 at pct=-TOL
  return r1 + (r2 - r1) * t;
}

const RAD = d => d * Math.PI / 180;

// Even angular spread across an arc, centred spacing so no dot sits exactly on the arc edge.
function spreadAngles(n, start, span) {
  if (n <= 0) return [];
  return Array.from({ length: n }, (_, i) => start + span * (i + 0.5) / n);
}

export function BullseyeTile({ stores, onOpenStore }) {
  const { useMemo, useState } = React;
  const [metricKey, setMetricKey] = useState('oepe');
  const [scope, setScope] = useState({ level: 'all' }); // {level:'all'} | {level:'state',state} | {level:'patch',state,patch}
  const [hoverLoc, setHoverLoc] = useState(null);

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

  const metric = METRICS[metricKey] || METRICS.oepe;

  // One row per store with a resolvable value+target for the selected metric — same store.p /
  // store.t objects PatchHeatmap reads, already auto-first sourced by pipeline.js.
  const allCells = useMemo(() => {
    const all = (stores || []).filter(s => /^\d+$/.test(String(s.loc)));
    return all.map(s => {
      const loc = unpad(s.loc);
      const value = metric.getVal(s);
      const target = metric.getTarget(s);
      const pct = signedPct(metric, value, target);
      return {
        // #282 review (owner, 2026-08-14): defaulting an unmapped store into a real market
        // (the old default was 'OK') is the exact shape of the v4.426 bug -- a store added to
        // STORE_NAMES without a matching INV_ORG_COORDS entry would silently join that
        // market's arc and quietly distort the comparison this tile exists to show. Currently
        // unreachable (all 27 STORE_NAMES entries have a state), but an explicit sentinel that
        // groups into its own "Unassigned" sector fails visibly instead of blending in.
        loc, name: sNameC(loc), state: (INV_ORG_COORDS[loc] || {}).state || 'Unassigned',
        patch: patchByLoc[loc] || null, value, target, pct, band: bandKey(pct),
      };
    });
  }, [stores, metric, patchByLoc]);

  const scopedCells = useMemo(() => {
    if (scope.level === 'state') return allCells.filter(c => c.state === scope.state);
    if (scope.level === 'patch') return allCells.filter(c => c.patch === scope.patch);
    return allCells;
  }, [allCells, scope]);

  // Sector = state at "all" scope, patch within a selected state, or a single sector once a
  // patch itself is selected (nothing left to subdivide into).
  const sectors = useMemo(() => {
    let groups = {};
    if (scope.level === 'patch') {
      groups = { [scope.patch]: scopedCells };
    } else if (scope.level === 'state') {
      for (const c of scopedCells) { if (c.patch) (groups[c.patch] || (groups[c.patch] = [])).push(c); }
    } else {
      for (const c of scopedCells) (groups[c.state] || (groups[c.state] = [])).push(c);
    }
    const keys = Object.keys(groups).sort();
    const total = scopedCells.length || 1;
    const GAP = keys.length > 1 ? 10 : 0; // deg, between sectors — none needed for a single sector
    const usable = 360 - GAP * keys.length;
    let cursor = -90; // start at 12 o'clock
    return keys.map(key => {
      const members = groups[key].slice().sort((a, b) => Number(a.loc) - Number(b.loc));
      const span_ = usable * (members.length / total);
      const start = cursor;
      cursor += span_ + GAP;
      return { key, members, start, span: span_, mid: start + span_ / 2 };
    });
  }, [scopedCells, scope]);

  const cx = 170, cy = 170, maxR = 130;
  const r1 = maxR * Math.sqrt(1 / 3), r2 = maxR * Math.sqrt(2 / 3);

  const dots = useMemo(() => {
    const out = [];
    for (const sec of sectors) {
      const angles = spreadAngles(sec.members.length, sec.start, sec.span);
      sec.members.forEach((c, i) => {
        const r = c.pct != null ? radiusFor(c.pct, maxR) : maxR * 1.12; // no-data: just past the edge
        const a = RAD(angles[i]);
        out.push({ ...c, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), sector: sec.key });
      });
    }
    return out;
  }, [sectors]);

  const ranked = useMemo(() =>
    scopedCells.filter(c => c.pct != null).slice().sort((a, b) => b.pct - a.pct),
    [scopedCells]);

  if (!allCells.length) return null;

  const states = [...new Set(allCells.map(c => c.state))].sort();
  const patchesInState = scope.level !== 'all'
    ? [...new Set(allCells.filter(c => c.state === (scope.state || scope.level === 'state' ? scope.state : null) && c.patch).map(c => c.patch))].sort()
    : [];

  const scopePill = (label, active, onClick) => btn({
    key: label, onClick,
    style: {
      padding: '2px 9px', borderRadius: 20, fontSize: '9px', fontWeight: 600, cursor: 'pointer',
      border: active ? '1px solid var(--amber)' : '.5px solid var(--bdr)',
      background: active ? 'rgba(245,158,11,.15)' : 'transparent',
      color: active ? 'var(--amber)' : 'var(--text3)',
    },
  }, label);

  const hovered = hoverLoc ? dots.find(d => d.loc === hoverLoc) : null;
  const hoveredRank = hovered && hovered.pct != null ? ranked.findIndex(c => c.loc === hovered.loc) + 1 : null;

  return div({ style: { background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 8, overflow: 'hidden' } },
    div({ style: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'var(--surf2)', borderBottom: '.5px solid var(--bdr)' } },
      span(null, '🎯'),
      span({ style: { fontSize: '11px', fontWeight: 700, color: 'var(--text)', flex: 1 } }, 'Bullseye'),
      span({ style: { fontSize: '8.5px', color: 'var(--text3)' } }, 'distribution vs target, not a lookup — see Leaderboard for that'),
    ),
    div({ style: { padding: '10px 12px' } },
      // Metric tabs — same visual convention as the Leaderboard's own metric pills.
      div({ style: { display: 'flex', gap: 3, marginBottom: 6, flexWrap: 'wrap' } },
        ...Object.keys(METRICS).map(k => btn({
          key: k, onClick: () => setMetricKey(k),
          style: {
            fontSize: '9px', padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontWeight: 600, border: 'none',
            background: metricKey === k ? 'var(--amber)' : 'var(--surf3)', // #295 fixed the white-wash; #306 measured --surf2 as strictly worse than --surf3 across all 8 theme x mode combos (--surf3 also beats or nearly matches the original dark-mode value #295 regressed)
            color: metricKey === k ? 'var(--navy)' : 'var(--text3)',
          },
        }, METRICS[k].short))
      ),
      // Scope — All -> State -> Org/Patch, per the standing selector UI. No Store tier: a
      // bullseye of one point isn't the tile's purpose (distribution gestalt needs >1 dot).
      div({ style: { display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' } },
        scopePill('All', scope.level === 'all', () => setScope({ level: 'all' })),
        ...states.map(st => scopePill(st, scope.level !== 'all' && scope.state === st,
          () => setScope({ level: 'state', state: st }))),
        scope.level !== 'all' && patchesInState.map(p => scopePill(p, scope.level === 'patch' && scope.patch === p,
          () => setScope({ level: 'patch', state: scope.state, patch: p }))),
      ),
      div({ style: { position: 'relative', width: '100%', maxWidth: 340, margin: '0 auto' } },
        h('svg', { viewBox: '0 0 340 340', style: { width: '100%', height: 'auto', display: 'block' } },
          // Equal-area ring guides. #295: these were hardcoded rgba(255,255,255,X) -- a
          // white-on-white wash that's invisible against the light theme's own light surface.
          // var(--bdr)/var(--bdr2) are theme-aware and already used for this tile's own card
          // border two lines up in the calling component.
          h('circle', { cx, cy, r: r1, fill: 'none', stroke: 'var(--bdr)', strokeWidth: .75 }),
          h('circle', { cx, cy, r: r2, fill: 'none', stroke: 'var(--bdr)', strokeWidth: .75 }),
          h('circle', { cx, cy, r: maxR, fill: 'none', stroke: 'var(--bdr2)', strokeWidth: .75 }),
          // Ring labels, fixed at the top (12 o'clock) so they never collide with a sector label
          h('text', { x: cx, y: cy - r1 - 4, textAnchor: 'middle', fontSize: 6, fill: GOOD_COLOR, fontWeight: 700 }, 'BEATING'),
          h('text', { x: cx, y: cy - r2 - 4, textAnchor: 'middle', fontSize: 6, fill: WARN_COLOR, fontWeight: 700 }, 'AT TARGET'),
          h('text', { x: cx, y: cy - maxR - 4, textAnchor: 'middle', fontSize: 6, fill: CRIT_COLOR, fontWeight: 700 }, 'BELOW TARGET'),
          // Sector boundary spokes + labels
          ...sectors.flatMap((sec, si) => {
            const midR = maxR * 1.2;
            const lx = cx + midR * Math.cos(RAD(sec.mid)), ly = cy + midR * Math.sin(RAD(sec.mid));
            const ta = lx < cx - 4 ? 'end' : lx > cx + 4 ? 'start' : 'middle';
            return [
              h('text', { key: 'sl' + si, x: lx.toFixed(1), y: ly.toFixed(1), textAnchor: ta, dominantBaseline: 'middle', fontSize: 7.5, fontWeight: 700, fill: 'var(--text2)' }, sec.key + ' (' + sec.members.length + ')'),
            ];
          }),
          // Dots — >=8px diameter (r=5 -> 10px), 2px surface-colour ring so overlaps stay readable
          ...dots.map(d => h('circle', {
            key: d.loc, cx: d.x.toFixed(1), cy: d.y.toFixed(1), r: 5,
            fill: bandColor(d.band), stroke: 'var(--surf)', strokeWidth: 2,
            style: { cursor: 'pointer' },
            title: `${d.name} (${d.loc}) — ${d.value != null ? metric.fmt(d.value) : '—'} vs ${d.target != null ? metric.fmt(d.target) : '—'} target`,
            onMouseEnter: () => setHoverLoc(d.loc),
            onMouseLeave: () => setHoverLoc(sel => sel === d.loc ? null : sel),
            onClick: () => onOpenStore && onOpenStore(d.loc),
          })),
        ),
        // Floating tooltip — positioned by the hovered dot's own SVG-unit coords as a % of the
        // container, so it tracks the dot without mouse-position tracking or a DOM rect read.
        hovered && div({
          style: {
            position: 'absolute', left: (hovered.x / 340 * 100) + '%', top: (hovered.y / 340 * 100) + '%',
            transform: 'translate(-50%, -115%)', pointerEvents: 'none', zIndex: 10,
            background: 'var(--surf3)', border: '.5px solid ' + bandColor(hovered.band), borderRadius: 6,
            padding: '6px 8px', fontSize: '9px', whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(0,0,0,.4)',
          },
        },
          div({ style: { fontWeight: 700, color: 'var(--text)', marginBottom: 2 } }, hovered.name + ' (' + hovered.loc + ')'),
          div({ style: { color: bandColor(hovered.band) } }, bandLabel(hovered.band)),
          div({ style: { color: 'var(--text2)' } },
            metric.label + ': ' + (hovered.value != null ? metric.fmt(hovered.value) : '—') +
            '  ·  Target: ' + (hovered.target != null ? metric.fmt(hovered.target) : '—')),
          hovered.pct != null && div({ style: { color: 'var(--text2)' } },
            'Δ ' + (hovered.pct >= 0 ? '+' : '') + (hovered.pct * 100).toFixed(1) + '%' +
            (hoveredRank ? '  ·  rank ' + hoveredRank + ' of ' + ranked.length : '')),
        ),
      ),
    ),
  );
}
