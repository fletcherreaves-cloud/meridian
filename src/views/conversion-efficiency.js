// @ts-nocheck
// ── Conversion Efficiency Ratio report (owner request 2026-10-19) ────────────────────────────
// "I have a bunch of these reports - Conversion Efficiency Ratio - How can we best pull them
// from my email and store them and begin analyzing the data in app" — this is the "analyze in
// app" piece. Manual-upload-only for now (parsers/conversion-efficiency.js; uploaded via the
// normal file-upload flow in App.js), per CLAUDE.md's "ship manually, then automate" rule.
//
// Data is brand-new and not yet part of ds's load pipeline, so this panel loads straight from
// Supabase on mount (loadConversionEfficiency()) rather than reading ds — same pattern
// pay-rate-history.js uses for its own fresh, not-yet-ds-integrated streams.
//
// Built on ReportShell like every other Reports-redesign panel, but the date-range control here
// filters by the report's own monthly PERIOD (not a daily range) — see engine/conversion-
// efficiency.js's header for why a multi-period range always collapses to each store's single
// latest period rather than summing across periods.
import * as React from 'react';
import { ReportShell } from '../components/ReportShell.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { f$, fN } from '../utils/fmt.js';
import { loadConversionEfficiency } from '../lib/supabase.js';
import { buildConversionEfficiencyReport, itemsForStore } from '../engine/conversion-efficiency.js';
import { useSortedRows, SortTh } from '../components/SortableTh.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const td = (p, ...c) => h('td', p, ...c);
const tr = (p, ...c) => h('tr', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

// financial_opportunity_annual/financial_impact_ytd are already signed $ figures (positive =
// using MORE than target, a real $ loss opportunity; negative = running under target, a $
// credit) — straight f$ with an explicit sign reads clearer here than a bare dollar amount.
function fSigned$(n) {
  if (n == null) return '—';
  return (n < 0 ? '-' : '') + f$(Math.abs(n));
}
function fRatio(n) { return n == null ? '—' : fN(n, 3); }
function fPctChg(n) { return n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }

const _allStores = Object.keys(STORE_NAMES).map(l => ({ loc: l }));

function decisionLine(storeRows) {
  if (!storeRows.length) return null;
  const totalOpp = storeRows.reduce((s, r) => s + (r.totalOpportunityAnnual || 0), 0);
  const worst = storeRows[0]; // already sorted worst-first
  if (totalOpp <= 0 || !worst || (worst.totalOpportunityAnnual || 0) <= 0) {
    return 'What to do: every store in this selection is at or under its food-conversion targets — no action needed right now.';
  }
  return `What to do: ${sNameC(worst.loc) || worst.loc_name} is the biggest opportunity — ${f$(worst.totalOpportunityAnnual)}/yr tied up in ${worst.worstItem || 'one raw item'} alone. Start there.`;
}

export function ConversionEfficiencyPanel({ stores, onClose }) {
  const { useState, useEffect, useMemo } = React;
  const [allRows, setAllRows] = useState(null); // null = still loading
  const [loadErr, setLoadErr] = useState('');
  const [report, setReport] = useState(null); // { storeRows, itemsByLoc }
  const [drillLoc, setDrillLoc] = useState(null);
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(report?.storeRows || null);

  useEffect(() => {
    let cancelled = false;
    loadConversionEfficiency()
      .then(rows => { if (!cancelled) setAllRows(rows || []); })
      .catch(e => { if (!cancelled) { setAllRows([]); setLoadErr(String(e?.message || e)); } });
    return () => { cancelled = true; };
  }, []);

  const run = async ({ locs, range }) => {
    setReport(buildConversionEfficiencyReport(allRows || [], { locs, range }));
    setDrillLoc(null);
  };

  const getExportData = () => ({
    title: 'Conversion Efficiency Ratio',
    headers: ['Store', 'Period', 'Est. Annual $ Opportunity', 'YTD $ Impact vs. 2025', 'Items Tracked', 'Biggest Driver'],
    rows: (report?.storeRows || []).map(r => [
      sNameC(r.loc) || r.loc_name, r.period, fSigned$(r.totalOpportunityAnnual), fSigned$(r.totalImpactYtd),
      String(r.itemCount), r.worstItem || '—',
    ]),
  });

  const drillItems = drillLoc && report ? itemsForStore(report.itemsByLoc, drillLoc) : [];

  return h(ReportShell, {
    title: 'Conversion Efficiency Ratio', icon: '🍟', onBack: onClose,
    subtitlePrefix: 'Food usage vs. target by raw item, from McDonald’s corporate Owner Operator Reports',
    stores: (stores && stores.length) ? stores : _allStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
    onRun: run, getExportData,
  },
    div({ style: { fontSize: '10.5px', color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10, padding: '8px 10px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
      'How to read this: each store’s actual 52-week conversion efficiency (cases used per case of product sold) vs. its target, for 18 fixed raw items. A positive $ Opportunity means the store is using more product than the target calls for — real recoverable food cost. Only ONE period per store counts here even across a wider date range, ',
      'never summed — both $ figures are already annualized/YTD running totals, so summing across months would double-count the same window. Manual upload for now (email automation not yet built); drop a new monthly "Owner_Operator_*.pdf" in via Data Manager to add a period.'),
    allRows == null
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Loading…')
      : loadErr
        ? div({ style: { textAlign: 'center', color: 'var(--bad)', padding: 30, fontSize: '11px' } }, 'Could not load Conversion Efficiency data: ' + loadErr)
        : !allRows.length
          ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'No Conversion Efficiency reports uploaded yet. Upload a monthly "Owner_Operator_*.pdf" via Data Manager to get started.')
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
                      h(SortTh, { label: 'Est. Annual $ Opportunity', colKey: 'totalOpportunityAnnual', sortKey, sortDir, onSort, align: 'right' }),
                      h(SortTh, { label: 'YTD $ Impact vs. 2025', colKey: 'totalImpactYtd', sortKey, sortDir, onSort, align: 'right' }),
                      h(SortTh, { label: 'Biggest Driver', colKey: 'worstItem', sortKey, sortDir, onSort }),
                      h('th', { style: { padding: '5px 8px' } }, ''),
                    )),
                    h('tbody', null, ...sorted.map((r, i) => tr({ key: r.loc, style: { borderBottom: '.5px solid var(--bdr)', background: i % 2 ? 'var(--surf2)' : 'transparent' } },
                      td({ style: { padding: '5px 8px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: i % 2 ? 'var(--surf2)' : 'var(--surf)' } }, sNameC(r.loc) || r.loc_name),
                      td({ style: { padding: '5px 8px', color: 'var(--text2)' } }, r.period),
                      td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: (r.totalOpportunityAnnual || 0) > 0 ? 'var(--bad)' : 'var(--text2)' } }, fSigned$(r.totalOpportunityAnnual)),
                      td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' } }, fSigned$(r.totalImpactYtd)),
                      td({ style: { padding: '5px 8px', color: 'var(--text2)' } }, r.worstItem || '—'),
                      td({ style: { padding: '5px 8px' } }, btn({ className: 'btn btn-sm', onClick: () => setDrillLoc(drillLoc === r.loc ? null : r.loc) }, drillLoc === r.loc ? 'Hide items' : 'Items')),
                    ))),
                  ),
                ),
                drillLoc && div({ style: { marginTop: 14 } },
                  div({ style: { fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginBottom: 6 } }, `${sNameC(drillLoc) || drillLoc} — all 18 raw items (${report.storeRows.find(r => r.loc === drillLoc)?.period || ''})`),
                  div({ style: { overflowX: 'auto' } },
                    h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', minWidth: 1100 } },
                      h('thead', null, h('tr', null,
                        h('th', { style: { padding: '5px 8px', textAlign: 'left' } }, 'Raw Item'),
                        h('th', { style: { padding: '5px 8px', textAlign: 'right' } }, 'Actual (52wk)'),
                        h('th', { style: { padding: '5px 8px', textAlign: 'right' } }, 'Target'),
                        h('th', { style: { padding: '5px 8px', textAlign: 'right' } }, 'Excess Cases/yr'),
                        h('th', { style: { padding: '5px 8px', textAlign: 'right' } }, '$ Opportunity/yr'),
                        h('th', { style: { padding: '5px 8px', textAlign: 'right' } }, '2025 YE'),
                        h('th', { style: { padding: '5px 8px', textAlign: 'right' } }, 'YTD'),
                        h('th', { style: { padding: '5px 8px', textAlign: 'right' } }, '% Chg'),
                        h('th', { style: { padding: '5px 8px', textAlign: 'right' } }, '$ Impact YTD'),
                      )),
                      h('tbody', null, ...drillItems.map((it, i) => tr({ key: it.raw_item, style: { borderBottom: '.5px solid var(--bdr)', background: i % 2 ? 'var(--surf2)' : 'transparent' } },
                        td({ style: { padding: '5px 8px', fontWeight: 600 } }, it.raw_item),
                        td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)' } }, fRatio(it.conv_eff_52wk)),
                        td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' } }, fRatio(it.conv_eff_target)),
                        td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)' } }, it.excess_cases_annual == null ? '—' : it.excess_cases_annual.toLocaleString()),
                        td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: (it.financial_opportunity_annual || 0) > 0 ? 'var(--bad)' : 'var(--text2)' } }, fSigned$(it.financial_opportunity_annual)),
                        td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' } }, fRatio(it.conv_eff_2025_ye)),
                        td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)' } }, fRatio(it.conv_eff_ytd)),
                        td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)' } }, fPctChg(it.conv_eff_pct_chg)),
                        td({ style: { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)' } }, fSigned$(it.financial_impact_ytd)),
                      ))),
                    ),
                  ),
                ),
              ),
  );
}
