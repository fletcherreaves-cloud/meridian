// @ts-nocheck
// ── Location Dossier (task #79, Phase 1) ──────────────────────────────────────────────────────
// See src/engine/location-dossier.js for the full design rationale and the owner's own answers
// to this report's open design questions (memory/plan-location-dossier-report-2026-11-04.md §5).
// Built on ReportShell like every other Reports Hub Phase 5 report (Weather Impact, Price Change
// Impact) — single-store focus (locationMode:'store'); patch/operator/state rollup views are a
// planned Phase 4, not built here.
import * as React from 'react';
import { ReportShell } from '../components/ReportShell.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { f$, fP, fN } from '../utils/fmt.js';
import { dossierWindows, buildFactualGrid, topFindings, dossierStoreContext } from '../engine/location-dossier.js';
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

export function fmtDossierVal(v, unit) {
  if (v == null) return '—';
  if (unit === '$') return f$(v);
  if (unit === 'pct') return fP(v, 2);
  if (unit === 'pct3') return fP(v, 3);
  if (unit === 'sec') return Math.round(v) + 's';
  if (unit === 'n2') return fN(v, 2);
  return Math.round(v).toLocaleString();
}

export function LocationDossierPanel({ ds, stores, onClose }) {
  const { useState } = React;
  const [result, setResult] = useState(null);
  const [narrative, setNarrative] = useState('');
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const run = async ({ locValue }) => {
    setNarrative(''); setExpanded(false);
    if (locValue?.level !== 'store') { setResult({ loc: null }); return; }
    const loc = locValue.id;
    const store = (stores || []).find(s => s.loc === loc) || { loc };
    const windows = dossierWindows();
    const grid = buildFactualGrid(ds, loc, windows);
    let demographics = null;
    try {
      const rows = await loadStoreDemographics();
      demographics = rows.find(r => r.loc === loc) || null;
    } catch { /* best-effort -- a dossier without demographics is still a dossier */ }
    setResult({ loc, store, windows, grid, demographics });
  };

  const getExportData = () => {
    if (!result?.loc) return { title: 'Location Dossier', headers: [], rows: [] };
    return {
      title: 'Location Dossier — ' + (sNameC(result.loc) || result.loc),
      headers: ['Metric', ...result.windows.map(w => w.label)],
      rows: result.grid.map(g => [g.label, ...result.windows.map(w => fmtDossierVal(g.values[w.id], g.unit))]),
    };
  };

  const genNarrative = async () => {
    if (!result?.loc || narrativeLoading) return;
    setNarrativeLoading(true);
    try {
      const lines = result.grid.map(g => g.label + ': ' + result.windows.map(w => w.label + '=' + fmtDossierVal(g.values[w.id], g.unit)).join(', '));
      const { headline } = topFindings(result.store.findings || []);
      const prompt = 'You are a McDonald\'s District Manager writing a one-paragraph plain-language summary of ' +
        'this store\'s current state for a busy operator. Store: ' + (sNameC(result.loc) || result.loc) + '.\n\n' +
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
    !result
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Pick a store, then Run Report.')
      : !result.loc
        ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } },
            'Pick a single store from the dropdown above — patch/district rollups are a planned follow-on, not built yet.')
        : div(null,
          div({ style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' } },
            span({ style: { fontSize: 16, fontWeight: 800, color: 'var(--text)' } }, sNameC(result.loc) || result.loc),
            result.store.gm && span({ style: { fontSize: 10, color: 'var(--text2)' } }, 'GM: ', result.store.gm),
            result.store.sup && span({ style: { fontSize: 10, color: 'var(--text2)' } }, 'Sup: ', result.store.sup),
            result.store.operator && span({ style: { fontSize: 10, color: 'var(--text2)' } }, 'Op: ', result.store.operator),
          ),
          dossierStoreContext(result.loc) && div({
            style: { fontSize: 10.5, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 12, padding: '8px 10px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 },
          }, dossierStoreContext(result.loc).notes),
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
          div({ style: { marginBottom: 14 } },
            h('div', { style: { fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 6 } }, '🎯 Top Findings'),
            (() => {
              const { headline, rest } = topFindings(result.store.findings || []);
              if (!headline.length) return div({ style: { fontSize: 10.5, color: 'var(--text3)' } }, 'No findings flagged for this window.');
              const row = f => div({
                key: f.m, style: { fontSize: 10.5, color: 'var(--text2)', padding: '4px 0', borderBottom: '.5px solid var(--bdr)' },
              }, span({ style: { color: FINDING_COLOR[f.t] || 'var(--text2)', fontWeight: 700, marginRight: 6 } }, FINDING_ICON[f.t] || ''), f.m);
              return div(null,
                ...headline.map(row),
                rest.length > 0 && (expanded
                  ? div(null, ...rest.map(row))
                  : btn({ className: 'btn btn-sm', style: { fontSize: 9, marginTop: 6 }, onClick: () => setExpanded(true) }, '+ ' + rest.length + ' more')),
              );
            })(),
          ),
          div({ style: { overflowX: 'auto' } },
            h('table', { style: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '10px' } },
              h('thead', null, h('tr', null,
                h('th', { style: { padding: '5px 8px', textAlign: 'left', color: 'var(--text3)', fontWeight: 600 } }, 'Metric'),
                ...result.windows.map(w => h('th', { key: w.id, style: { padding: '5px 8px', textAlign: 'right', color: 'var(--text3)', fontWeight: 600 } }, w.label)),
              )),
              h('tbody', null, ...result.grid.map((g, i) => tr({ key: g.key, style: { borderBottom: '.5px solid var(--bdr)', background: i % 2 ? 'var(--surf2)' : 'transparent' } },
                td({ style: { padding: '5px 8px', fontWeight: 600, color: 'var(--text)' } }, g.label),
                ...result.windows.map(w => td({ key: w.id, style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' } }, fmtDossierVal(g.values[w.id], g.unit))),
              ))),
            ),
          ),
          result.demographics && div({
            style: { marginTop: 14, padding: '10px 12px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 },
          },
            h('div', { style: { fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 6 } }, '🏘 Trade-Area Demographics (Census tract)'),
            div({ style: { fontSize: 10, color: 'var(--text2)', display: 'flex', gap: 16, flexWrap: 'wrap' } },
              span(null, 'Population: ', result.demographics.population != null ? result.demographics.population.toLocaleString() : '—'),
              span(null, 'Median HH Income: ', result.demographics.medianHouseholdIncome != null ? f$(result.demographics.medianHouseholdIncome) : '—'),
              span(null, 'Median Age: ', result.demographics.medianAge ?? '—'),
              span(null, 'Poverty Rate: ', result.demographics.povertyRate != null ? fP(result.demographics.povertyRate, 1) : '—'),
              span(null, 'Owner-Occupied: ', result.demographics.ownerOccupiedPct != null ? fP(result.demographics.ownerOccupiedPct, 1) : '—'),
              span(null, 'Avg HH Size: ', result.demographics.avgHouseholdSize ?? '—'),
            ),
          ),
        ),
  );
}
