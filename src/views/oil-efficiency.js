// @ts-nocheck
// ── Oil Efficiency report (owner request 2026-10-19) ──────────────────────────────────────────
// "I want to do the same for oil efficiency reports... build out to app." Same architecture as
// conversion-efficiency.js: manual upload (parsers/oil-efficiency.js) + Gmail auto-ingest, this
// panel loads straight from Supabase on mount since the stream isn't part of ds's load pipeline.
import * as React from 'react';
import { ReportShell } from '../components/ReportShell.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { f$ } from '../utils/fmt.js';
import { loadOilEfficiency } from '../lib/supabase.js';
import { buildOilEfficiencyReport, qualityConcernStores } from '../engine/oil-efficiency.js';
import { useSortedRows, SortTh } from '../components/SortableTh.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const td = (p, ...c) => h('td', p, ...c);
const tr = (p, ...c) => h('tr', p, ...c);

function fPct(n) { return n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(0) + '%'; }
function fImpact(dollars, label) {
  if (dollars != null) return f$(dollars);
  if (label) return label;
  return '—';
}

const _allStores = Object.keys(STORE_NAMES).map(l => ({ loc: l }));

function decisionLine(storeRows) {
  if (!storeRows.length) return null;
  const qc = qualityConcernStores(storeRows);
  const worstDollar = storeRows.find(r => r.impact_3mo_dollars != null && r.impact_3mo_dollars > 0);
  if (qc.length) {
    const names = qc.slice(0, 3).map(r => sNameC(r.loc) || r.loc_name).join(', ');
    return `What to do: ${qc.length} store${qc.length === 1 ? '' : 's'} flagged Quality Concern on oil — ${names}${qc.length > 3 ? ', +' + (qc.length - 3) + ' more' : ''}. Check filtration first, not just oil cost.`;
  }
  if (worstDollar) {
    return `What to do: ${sNameC(worstDollar.loc) || worstDollar.loc_name} is the biggest $ opportunity — ${f$(worstDollar.impact_3mo_dollars)}/3mo over target.`;
  }
  return 'What to do: every store in this selection is at or near target — no action needed right now.';
}

export function OilEfficiencyPanel({ stores, onClose }) {
  const { useState, useEffect } = React;
  const [allRows, setAllRows] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [report, setReport] = useState(null);
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(report?.storeRows || null);

  useEffect(() => {
    let cancelled = false;
    loadOilEfficiency()
      .then(rows => { if (!cancelled) setAllRows(rows || []); })
      .catch(e => { if (!cancelled) { setAllRows([]); setLoadErr(String(e?.message || e)); } });
    return () => { cancelled = true; };
  }, []);

  const run = async ({ locs, range }) => {
    setReport(buildOilEfficiencyReport(allRows || [], { locs, range }));
  };

  const getExportData = () => ({
    title: 'Oil Efficiency',
    headers: ['Store', 'Period', 'Oil Use (3mo)', 'Restaurant Impact (3mo)', 'Filtration (3mo)', 'Oil Use (12mo)', 'Filtration (12mo)'],
    rows: (report?.storeRows || []).map(r => [
      sNameC(r.loc) || r.loc_name, r.period, fPct(r.oil_use_3mo_pct),
      fImpact(r.impact_3mo_dollars, r.impact_3mo_label), fPct(r.filtration_3mo_pct),
      fPct(r.oil_use_12mo_pct), fPct(r.filtration_12mo_pct),
    ]),
  });

  return h(ReportShell, {
    title: 'Oil Efficiency', icon: '🛢️', onBack: onClose,
    subtitlePrefix: 'Oil use vs. target and filtration compliance by store, from Cargill’s monthly Oil Management Reports',
    stores: (stores && stores.length) ? stores : _allStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
    onRun: run, getExportData,
  },
    div({ style: { fontSize: '10.5px', color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10, padding: '8px 10px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
      'How to read this: each store’s 3/6/12-month trailing rolling averages for oil use vs. target, the estimated $ impact (or a Quality Concern/Optimized flag when there’s no $ figure), and filtration compliance. Only ONE period per store counts here even across a wider date range, never summed — the figures are already rolling averages. Manual upload for now; drop a new monthly "<operator>_Cargill_food_oil_report_<Mon>_<YYYY>.pdf" in via Data Manager to add a period.'),
    allRows == null
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Loading…')
      : loadErr
        ? div({ style: { textAlign: 'center', color: 'var(--bad)', padding: 30, fontSize: '11px' } }, 'Could not load Oil Efficiency data: ' + loadErr)
        : !allRows.length
          ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'No Oil Efficiency reports uploaded yet. Upload a monthly Cargill oil report via Data Manager to get started.')
          : report == null
            ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Choose a date range and location, then Run Report.')
            : !report.storeRows.length
              ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'No stores matched this selection/date range.')
              : div({},
                decisionLine(report.storeRows) && div({ style: { fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: 12, padding: '8px 10px', background: 'var(--surf2)', borderLeft: '3px solid var(--accent)', borderRadius: 4 } }, decisionLine(report.storeRows)),
                div({ style: { overflowX: 'auto' } },
                  h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '10px', minWidth: 900 } },
                    h('thead', null, h('tr', null,
                      h(SortTh, { label: 'Store', colKey: 'loc', sortKey, sortDir, onSort, style: { position: 'sticky', left: 0, background: 'var(--surf)' } }),
                      h(SortTh, { label: 'Period', colKey: 'period', sortKey, sortDir, onSort }),
                      h(SortTh, { label: 'Oil Use (3mo)', colKey: 'oil_use_3mo_pct', sortKey, sortDir, onSort, align: 'right' }),
                      h(SortTh, { label: 'Restaurant Impact (3mo)', colKey: 'impact_3mo_dollars', sortKey, sortDir, onSort, align: 'right' }),
                      h(SortTh, { label: 'Filtration (3mo)', colKey: 'filtration_3mo_pct', sortKey, sortDir, onSort, align: 'right' }),
                      h(SortTh, { label: 'Oil Use (12mo)', colKey: 'oil_use_12mo_pct', sortKey, sortDir, onSort, align: 'right' }),
                      h(SortTh, { label: 'Filtration (12mo)', colKey: 'filtration_12mo_pct', sortKey, sortDir, onSort, align: 'right' }),
                    )),
                    h('tbody', null, ...sorted.map((r, i) => tr({ key: r.loc, style: { borderBottom: '.5px solid var(--bdr)', background: i % 2 ? 'var(--surf2)' : 'transparent' } },
                      td({ style: { padding: '5px 8px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: i % 2 ? 'var(--surf2)' : 'var(--surf)' } }, sNameC(r.loc) || r.loc_name),
                      td({ style: { padding: '5px 8px', color: 'var(--text2)' } }, r.period),
                      td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: (r.oil_use_3mo_pct || 0) < 0 ? 'var(--warn, #f59e0b)' : 'var(--text2)' } }, fPct(r.oil_use_3mo_pct)),
                      td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: r.impact_3mo_label === 'Quality Concern' ? 'var(--bad)' : (r.impact_3mo_dollars || 0) > 0 ? 'var(--bad)' : 'var(--text2)' } }, fImpact(r.impact_3mo_dollars, r.impact_3mo_label)),
                      td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)' } }, fPct(r.filtration_3mo_pct)),
                      td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' } }, fPct(r.oil_use_12mo_pct)),
                      td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' } }, fPct(r.filtration_12mo_pct)),
                    ))),
                  ),
                ),
              ),
  );
}
