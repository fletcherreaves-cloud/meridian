// @ts-nocheck
// ── Location Dossier (task #79, Phase 1) ──────────────────────────────────────────────────────
// See src/engine/location-dossier.js for the full design rationale and the owner's own answers
// to this report's open design questions (memory/plan-location-dossier-report-2026-11-04.md §5).
// Built on ReportShell like every other Reports Hub Phase 5 report (Weather Impact, Price Change
// Impact) — single-store focus (locationMode:'store'); patch/operator/state rollup views are a
// planned Phase 4, not built here.
//
// Phase 1.5 (owner request, 2026-11-13 — "the initial dream was way more broad in scope...
// overwhelming display... Charts, spark lines, whatever it takes to tell the story in a single
// view"). Added: a sparkline on every factual-grid row, three larger trend charts (Net Sales,
// Labor %, TPPH), a severity-colored Top Findings strip, and a demographics-vs-district-average
// bar. Also fixed a real reactivity bug: `grid`/`sparklines` used to be captured ONCE into
// `result` state at "Run" time, so a metric fed by a slower-loading stream (qsrFobRows/FOB,
// loaded in the app's T2 startup tier, after laborPct/TPPH/etc.'s T1) could be null at the exact
// moment Run fired and then NEVER update even after that stream finished loading seconds later —
// this is what produced the owner's screenshot (FOB %/Prime Cost % permanently blank while every
// other metric was populated). Now `grid`/`sparklines` are derived live from `ds` on every render
// (useMemo keyed on `ds` + the selected store/windows), so they track whatever the app's own
// staged loaders have resolved so far, same as every other reactive panel in this app.
import * as React from 'react';
import { ReportShell } from '../components/ReportShell.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { f$, fP, fN } from '../utils/fmt.js';
import { dossierWindows, buildFactualGrid, dossierSparklineSeries, DOSSIER_METRICS, topFindings, dossierStoreContext } from '../engine/location-dossier.js';
import { loadStoreDemographics } from '../lib/supabase.js';
import { callSageOnce } from '../lib/sage-client.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);
const td = (p, ...c) => h('td', p, ...c);
const tr = (p, ...c) => h('tr', p, ...c);

const FINDING_ICON = { crit: '🔴', watch: '🟡', ok: '🟢' };
const FINDING_COLOR = { crit: 'var(--crit)', watch: 'var(--amber)', ok: '#10b981' };
const FINDING_BG = { crit: 'rgba(239,68,68,.08)', watch: 'rgba(245,158,11,.08)', ok: 'rgba(16,185,129,.08)' };

export function fmtDossierVal(v, unit) {
  if (v == null) return '—';
  if (unit === '$') return f$(v);
  if (unit === 'pct') return fP(v, 2);
  if (unit === 'pct3') return fP(v, 3);
  if (unit === 'sec') return Math.round(v) + 's';
  if (unit === 'n2') return fN(v, 2);
  return Math.round(v).toLocaleString();
}

// Small inline sparkline, one per factual-grid row — same hand-rolled-SVG shape this codebase
// already uses (at-a-glance.js's DrillSparkline, trends.js's TrendSparkline), sized for a table
// cell rather than a modal. `direction` tints the line/dot: a metric whose lower reading is
// better (laborPct, fobPct, labor+FOB, OEPE/KVS seconds, cashOSPct) still just shows its own
// real color — no good/bad judgment is drawn here, that's what Top Findings is for.
function RowSparkline({ points, color }) {
  if (!points?.length || points.length < 2) return div({ style: { fontSize: 9, color: 'var(--text3)' } }, points?.length === 1 ? '1 pt' : 'no trend data');
  const W = 130, H = 30, pad = 3;
  const vals = points.map(p => p.value);
  const minY = Math.min(...vals), maxY = Math.max(...vals);
  const spanY = maxY - minY || 1;
  const xStep = (W - pad * 2) / (points.length - 1);
  const xs = points.map((_, i) => pad + i * xStep);
  const yCoord = v => H - pad - ((v - minY) / spanY) * (H - pad * 2);
  const poly = points.map((p, i) => `${xs[i].toFixed(1)},${yCoord(p.value).toFixed(1)}`).join(' ');
  const lastX = xs[xs.length - 1], lastY = yCoord(vals[vals.length - 1]);
  return h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', style: { display: 'block' } },
    h('polyline', { points: poly, fill: 'none', stroke: color, strokeWidth: 1.5, strokeLinejoin: 'round' }),
    h('circle', { cx: lastX, cy: lastY, r: 2, fill: color }),
  );
}

// Larger trend chart for the handful of metrics an operator actually watches day to day — same
// sparkline mechanics, more room, a light grid and real min/max/date labels so it reads as a
// chart, not a decoration.
function TrendChart({ label, unit, points, color }) {
  const W = 600, H = 140, padL = 44, padR = 12, padT = 10, padB = 20;
  if (!points?.length) {
    return div({ style: { padding: '30px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 10.5 } }, label + ' — no trend data for this window.');
  }
  const vals = points.map(p => p.value);
  const minY = Math.min(...vals), maxY = Math.max(...vals);
  const spanY = (maxY - minY) || Math.abs(maxY) || 1;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xStep = points.length > 1 ? plotW / (points.length - 1) : 0;
  const xs = points.map((_, i) => padL + i * xStep);
  const yCoord = v => padT + plotH - ((v - minY) / spanY) * plotH;
  const poly = points.map((p, i) => `${xs[i].toFixed(1)},${yCoord(p.value).toFixed(1)}`).join(' ');
  const areaPts = `${xs[0].toFixed(1)},${(padT + plotH).toFixed(1)} ${poly} ${xs[xs.length - 1].toFixed(1)},${(padT + plotH).toFixed(1)}`;
  const gridLines = [0, 0.5, 1].map(f => padT + plotH * f);
  return div(null,
    div({ style: { fontSize: 10.5, fontWeight: 700, color: 'var(--text)', marginBottom: 4, display: 'flex', justifyContent: 'space-between' } },
      span(null, label),
      span({ style: { color: 'var(--text3)', fontWeight: 500 } }, fmtDossierVal(vals[vals.length - 1], unit) + ' latest'),
    ),
    h('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', style: { display: 'block', overflow: 'visible' } },
      ...gridLines.map((gy, i) => h('line', { key: i, x1: padL, x2: W - padR, y1: gy, y2: gy, stroke: 'var(--bdr)', strokeWidth: 1 })),
      h('text', { x: padL - 6, y: padT + 3, textAnchor: 'end', fontSize: 9, fill: 'var(--text3)' }, fmtDossierVal(maxY, unit)),
      h('text', { x: padL - 6, y: padT + plotH + 3, textAnchor: 'end', fontSize: 9, fill: 'var(--text3)' }, fmtDossierVal(minY, unit)),
      h('polygon', { points: areaPts, fill: color, opacity: 0.08 }),
      h('polyline', { points: poly, fill: 'none', stroke: color, strokeWidth: 1.75, strokeLinejoin: 'round' }),
      h('circle', { cx: xs[xs.length - 1], cy: yCoord(vals[vals.length - 1]), r: 2.5, fill: color }),
      h('text', { x: padL, y: H - 4, textAnchor: 'start', fontSize: 9, fill: 'var(--text3)' }, points[0].date),
      h('text', { x: W - padR, y: H - 4, textAnchor: 'end', fontSize: 9, fill: 'var(--text3)' }, points[points.length - 1].date),
    ),
  );
}

// The 2-3 metrics worth a full-size chart, not just a row sparkline — the numbers a GM/
// Supervisor actually watches daily. Picked from DOSSIER_METRICS by key so the chart stays in
// sync if the registry ever changes shape.
const TREND_CHART_KEYS = [
  { key: 'sales', color: '#60a5fa' },
  { key: 'laborPct', color: '#f59e0b' },
  { key: 'tpph', color: '#10b981' },
];

export function LocationDossierPanel({ ds, stores, onClose }) {
  const { useState, useMemo } = React;
  const [selection, setSelection] = useState(null); // {loc, store, windows} -- the picked store, NOT the computed values
  const [narrative, setNarrative] = useState('');
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [demographicsRows, setDemographicsRows] = useState(null);

  const run = async ({ locValue }) => {
    setNarrative(''); setExpanded(false);
    if (locValue?.level !== 'store') { setSelection({ loc: null }); return; }
    const loc = locValue.id;
    const store = (stores || []).find(s => s.loc === loc) || { loc };
    const windows = dossierWindows();
    setSelection({ loc, store, windows });
    if (!demographicsRows) {
      try { setDemographicsRows(await loadStoreDemographics()); }
      catch { setDemographicsRows([]); /* best-effort -- a dossier without demographics is still a dossier */ }
    }
  };

  // Live, reactive — recomputed from the CURRENT ds on every render a dependency changes, never
  // a frozen snapshot. See this file's header comment for exactly what bug this fixes.
  const grid = useMemo(() => (selection?.loc ? buildFactualGrid(ds, selection.loc, selection.windows) : null),
    [ds, selection?.loc, selection?.windows]);
  const sparklines = useMemo(() => {
    if (!selection?.loc) return {};
    const out = {};
    for (const spec of DOSSIER_METRICS) out[spec.key] = dossierSparklineSeries(ds, selection.loc, spec, 90);
    return out;
  }, [ds, selection?.loc]);
  const demographics = useMemo(() => {
    if (!selection?.loc || !demographicsRows?.length) return null;
    const mine = demographicsRows.find(r => r.loc === selection.loc);
    if (!mine) return null;
    const withIncome = demographicsRows.filter(r => r.medianHouseholdIncome != null);
    const districtAvgIncome = withIncome.length ? withIncome.reduce((a, r) => a + r.medianHouseholdIncome, 0) / withIncome.length : null;
    return { ...mine, districtAvgIncome };
  }, [selection?.loc, demographicsRows]);

  const getExportData = () => {
    if (!selection?.loc || !grid) return { title: 'Location Dossier', headers: [], rows: [] };
    return {
      title: 'Location Dossier — ' + (sNameC(selection.loc) || selection.loc),
      headers: ['Metric', ...selection.windows.map(w => w.label)],
      rows: grid.map(g => [g.label, ...selection.windows.map(w => fmtDossierVal(g.values[w.id], g.unit))]),
    };
  };

  const genNarrative = async () => {
    if (!selection?.loc || !grid || narrativeLoading) return;
    setNarrativeLoading(true);
    try {
      const lines = grid.map(g => g.label + ': ' + selection.windows.map(w => w.label + '=' + fmtDossierVal(g.values[w.id], g.unit)).join(', '));
      const { headline } = topFindings(selection.store.findings || []);
      const prompt = 'You are a McDonald\'s District Manager writing a one-paragraph plain-language summary of ' +
        'this store\'s current state for a busy operator. Store: ' + (sNameC(selection.loc) || selection.loc) + '.\n\n' +
        'METRICS ACROSS WINDOWS:\n' + lines.join('\n') + '\n\n' +
        'TOP FINDINGS:\n' + (headline.map(f => '- ' + f.m).join('\n') || 'None flagged.') + '\n\n' +
        'Write 1 paragraph, plain language, naming the number AND what to do about it. No bullet points. Maximum 120 words.';
      const text = await callSageOnce([{ role: 'user', content: prompt }]);
      setNarrative(text || 'Unable to generate narrative.');
    } catch (e) { setNarrative('Error: ' + e.message); }
    setNarrativeLoading(false);
  };

  return h(ReportShell, {
    title: 'Location Dossier', icon: '📋', onBack: onClose,
    subtitlePrefix: 'Everything we know about one store, across Current/28-Day/Last Month/L3M/YTD',
    stores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
    locationMode: 'store', onRun: run, getExportData,
  },
    !selection
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Pick a store, then Run Report.')
      : !selection.loc
        ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } },
            'Pick a single store from the dropdown above — patch/district rollups are a planned follow-on, not built yet.')
        : !grid
          ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Loading…')
          : div(null,
          div({ style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' } },
            span({ style: { fontSize: 16, fontWeight: 800, color: 'var(--text)' } }, sNameC(selection.loc) || selection.loc),
            selection.store.gm && span({ style: { fontSize: 10, color: 'var(--text2)' } }, 'GM: ', selection.store.gm),
            selection.store.sup && span({ style: { fontSize: 10, color: 'var(--text2)' } }, 'Sup: ', selection.store.sup),
            selection.store.operator && span({ style: { fontSize: 10, color: 'var(--text2)' } }, 'Op: ', selection.store.operator),
          ),
          dossierStoreContext(selection.loc) && div({
            style: { fontSize: 10.5, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 12, padding: '8px 10px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 },
          }, dossierStoreContext(selection.loc).notes),
          div({ style: { marginBottom: 14 } },
            btn({
              className: 'btn btn-sm',
              style: { fontSize: 9, background: 'rgba(96,165,250,.1)', border: '.5px solid rgba(96,165,250,.3)', color: '#60a5fa' },
              onClick: genNarrative, disabled: narrativeLoading,
            }, narrativeLoading ? 'Generating…' : '🧠 Generate Narrative'),
            narrative && div({
              style: { marginTop: 8, fontSize: 11, lineHeight: 1.6, color: 'var(--text)', padding: '10px 12px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 },
            }, narrative),
          ),
          // ── Top Findings — a severity-colored status strip, not a plain list ────────────
          div({ style: { marginBottom: 16 } },
            h('div', { style: { fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 6 } }, '🎯 Top Findings'),
            (() => {
              const { headline, rest } = topFindings(selection.store.findings || []);
              if (!headline.length) return div({ style: { fontSize: 10.5, color: 'var(--text3)' } }, 'No findings flagged for this window.');
              const chip = f => div({
                key: f.m,
                style: {
                  display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 10.5, color: 'var(--text)',
                  padding: '7px 10px', borderRadius: 8, background: FINDING_BG[f.t] || 'var(--surf2)',
                  border: '.5px solid ' + (FINDING_COLOR[f.t] || 'var(--bdr)'), flex: '1 1 220px', minWidth: 200,
                },
              }, span({ style: { fontSize: 11 } }, FINDING_ICON[f.t] || ''), span(null, f.m));
              return div(null,
                div({ style: { display: 'flex', flexWrap: 'wrap', gap: 8 } }, ...headline.map(chip)),
                rest.length > 0 && (expanded
                  ? div({ style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 } }, ...rest.map(chip))
                  : btn({ className: 'btn btn-sm', style: { fontSize: 9, marginTop: 8 }, onClick: () => setExpanded(true) }, '+ ' + rest.length + ' more')),
              );
            })(),
          ),
          // ── Trend charts — the numbers a GM/Supervisor actually watches daily ───────────
          div({ style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 18 } },
            ...TREND_CHART_KEYS.map(({ key, color }) => {
              const spec = DOSSIER_METRICS.find(m => m.key === key);
              if (!spec) return null;
              return div({ key, style: { padding: '10px 12px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
                h(TrendChart, { label: spec.label, unit: spec.unit, points: sparklines[key], color }));
            }),
          ),
          // ── Factual grid — every metric, every window, plus a 90-day sparkline ──────────
          div({ style: { overflowX: 'auto' } },
            h('table', { style: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '10px' } },
              h('thead', null, h('tr', null,
                h('th', { style: { padding: '5px 8px', textAlign: 'left', color: 'var(--text3)', fontWeight: 600 } }, 'Metric'),
                h('th', { style: { padding: '5px 8px', textAlign: 'left', color: 'var(--text3)', fontWeight: 600 } }, '90-Day Trend'),
                ...selection.windows.map(w => h('th', { key: w.id, style: { padding: '5px 8px', textAlign: 'right', color: 'var(--text3)', fontWeight: 600 } }, w.label)),
              )),
              h('tbody', null, ...grid.map((g, i) => tr({ key: g.key, style: { borderBottom: '.5px solid var(--bdr)', background: i % 2 ? 'var(--surf2)' : 'transparent' } },
                td({ style: { padding: '5px 8px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' } }, g.label),
                td({ style: { padding: '5px 8px' } }, h(RowSparkline, { points: sparklines[g.key], color: TREND_CHART_KEYS.find(t => t.key === g.key)?.color || '#9ca3af' })),
                ...selection.windows.map(w => td({ key: w.id, style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' } }, fmtDossierVal(g.values[w.id], g.unit))),
              ))),
            ),
          ),
          demographics && div({
            style: { marginTop: 14, padding: '10px 12px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 },
          },
            h('div', { style: { fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 6 } }, '🏘 Trade-Area Demographics (Census tract)'),
            div({ style: { fontSize: 10, color: 'var(--text2)', display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: demographics.districtAvgIncome != null ? 10 : 0 } },
              span(null, 'Population: ', demographics.population != null ? demographics.population.toLocaleString() : '—'),
              span(null, 'Median HH Income: ', demographics.medianHouseholdIncome != null ? f$(demographics.medianHouseholdIncome) : '—'),
              span(null, 'Median Age: ', demographics.medianAge ?? '—'),
              span(null, 'Poverty Rate: ', demographics.povertyRate != null ? fP(demographics.povertyRate, 1) : '—'),
              span(null, 'Owner-Occupied: ', demographics.ownerOccupiedPct != null ? fP(demographics.ownerOccupiedPct, 1) : '—'),
              span(null, 'Avg HH Size: ', demographics.avgHouseholdSize ?? '—'),
            ),
            demographics.districtAvgIncome != null && demographics.medianHouseholdIncome != null && (() => {
              const mine = demographics.medianHouseholdIncome, avg = demographics.districtAvgIncome;
              const max = Math.max(mine, avg) * 1.1;
              const bar = (v, color, label) => div({ style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } },
                span({ style: { fontSize: 9, color: 'var(--text3)', width: 90, flexShrink: 0 } }, label),
                div({ style: { flex: 1, height: 10, background: 'var(--bdr)', borderRadius: 4, overflow: 'hidden' } },
                  div({ style: { width: (v / max * 100).toFixed(1) + '%', height: '100%', background: color } })),
                span({ style: { fontSize: 9.5, color: 'var(--text)', fontWeight: 600, width: 64, textAlign: 'right', flexShrink: 0 } }, f$(v)));
              return div(null,
                div({ style: { fontSize: 9.5, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 } }, 'Median HH Income vs. district average'),
                bar(mine, '#60a5fa', 'This store'),
                bar(avg, 'var(--text3)', 'District avg'),
              );
            })(),
          ),
        ),
  );
}
