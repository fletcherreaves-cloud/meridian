// @ts-nocheck
// Customer Complaints browsing panel (dispatch #231 follow-on) — a drill-down/detail view over
// the raw customer_complaints rows the Complaint Contacts/100K review metric already consumes
// (review-engine.js's autoPopulateKPIs). Explicitly out of scope for dispatch #231 itself
// ("this dispatch is metric-wiring only... a separate follow-on, not bundled in here") — this is
// that follow-on. Reads ds.complaintCases (loaded by App.js's T2 stage via
// loadCustomerComplaints(), src/lib/supabase.js) — the SAME array the metric itself filters, so
// this panel and the KPI can never silently disagree on what a "case" is.
//
// Does NOT recompute the /100K rate — that normalization (÷ guest count × 100,000) already lives
// in review-engine.js and is shown per-store/period in Performance Reviews. This panel is for
// browsing and searching the raw cases themselves (store, date, issue, status, the real
// customer-submitted comment text), not a second copy of that KPI.
import * as React from 'react';
import { STORE_NAMES, INV_ORG_COORDS } from '../constants.js';
import { RoutePanelShell } from '../components/ModalShell.js';
import { DateRangeControl, DATE_RANGE_PRESETS, LocationSelector, buildLocationHierarchy, locationSelectorLocs } from '../components/PanelControls.js';
import { withAlpha } from '../utils/fmt.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

// STORE_NAMES keys are unpadded ("3708"); customer_complaints.loc is 5-digit zero-padded
// ("03708", the graded_visits/Propel convention — see supabase/schema-customer-complaints.sql).
// Normalize before any lookup/compare, same pattern as graded-visits.js's locNum.
export const locNum = s => { const n = parseInt(s, 10); return Number.isNaN(n) ? String(s == null ? '' : s) : String(n); };
const storeName = s => STORE_NAMES[locNum(s)] || locNum(s);
const niceDate = iso => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

const STATUS_COLOR = { CLOSED: '#10b981', OPEN: '#f59e0b' };
const statusColor = s => STATUS_COLOR[s] || 'var(--text3)';

// Pure filter predicate, extracted for direct unit testing -- this codebase's suite runs under
// Vitest's `node` environment (no jsdom), so component rendering itself isn't unit-tested
// anywhere in src/ (see components/PanelControls.js's own header comment on this); the logic
// that decides what shows is. scopedLocs is a Set of locNum()-normalized loc strings (from
// LocationSelector's value via locationSelectorLocs()).
export function filterComplaintCases(cases, { scopedLocs, statusFilter, dateRange, q }) {
  const needle = (q || '').trim().toLowerCase();
  return (cases || []).filter(c =>
    (!scopedLocs || scopedLocs.has(locNum(c.loc))) &&
    (!statusFilter || statusFilter === 'all' || c.caseStatus === statusFilter) &&
    (!dateRange || (c.incidentDate && c.incidentDate >= dateRange.s && c.incidentDate <= dateRange.e)) &&
    (!needle || [c.issueCode, c.issueSubCode, c.customerComments].some(x => x && String(x).toLowerCase().includes(needle)))
  ).sort((a, b) => (b.incidentDate || '').localeCompare(a.incidentDate || ''));
}

const card = (label, value, color) => div({ style: { flex: '1 1 100px', minWidth: 100, background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, padding: '9px 12px' } },
  div({ style: { fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 } }, label),
  div({ style: { fontSize: 18, fontWeight: 800, fontFamily: 'var(--mono)', color: color || 'var(--text)' } }, value));

export function CustomerComplaintsPanel({ ds, stores, onClose }) {
  const { useState, useMemo } = React;
  const cases = ds?.complaintCases || [];
  const [scope, setScope] = useState({ level: 'all', id: null });
  const [statusFilter, setStatusFilter] = useState('all');
  // null = All time. Like Graded Visits, complaint cases are sparse relative to daily streams —
  // defaulting to a narrow window would silently hide most of a store's history.
  const [dateRange, setDateRange] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [q, setQ] = useState('');

  const tree = useMemo(() => buildLocationHierarchy(stores, INV_ORG_COORDS, STORE_NAMES), [stores]);
  const scopedLocs = useMemo(() => new Set(locationSelectorLocs(scope, tree).map(locNum)), [scope, tree]);
  const statuses = useMemo(() => [...new Set(cases.map(c => c.caseStatus).filter(Boolean))].sort(), [cases]);

  const filtered = useMemo(() => filterComplaintCases(cases, { scopedLocs, statusFilter, dateRange, q }),
    [cases, scopedLocs, statusFilter, dateRange, q]);

  const stats = useMemo(() => {
    const byStatus = {};
    for (const c of filtered) { const s = c.caseStatus || 'Unknown'; byStatus[s] = (byStatus[s] || 0) + 1; }
    return { n: filtered.length, byStatus };
  }, [filtered]);

  const csvCell = c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"';
  const exportCSV = () => {
    const cols = ['Case #', 'Store', 'NSN', 'Incident Date', 'Received Date', 'Status', 'Issue', 'Sub-Issue', 'Comment'];
    const lines = [cols.map(csvCell).join(',')];
    for (const c of filtered) {
      lines.push([c.childCaseId || '', storeName(c.loc), locNum(c.loc), c.incidentDate || '', c.receivedDate || '', c.caseStatus || '', c.issueCode || '', c.issueSubCode || '', c.customerComments || ''].map(csvCell).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `customer-complaints-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const thS = { padding: '6px 8px', fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text3)', borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap', textAlign: 'left', background: 'var(--surf2)' };
  const tdS = { padding: '6px 8px', fontSize: 11, borderBottom: '.5px solid var(--bdr)', verticalAlign: 'top' };

  return h(RoutePanelShell, {
    icon: '📮',
    title: 'Customer Complaints',
    subtitle: 'Propel Customer Care cases — feeds the Complaint Contacts/100K review metric',
    onBack: onClose,
    headerExtra: div({ style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
      statuses.length > 1 && h('select', { value: statusFilter, onChange: e => setStatusFilter(e.target.value), style: { background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 10, padding: '3px 7px' } },
        h('option', { value: 'all' }, 'All Statuses'),
        statuses.map(s => h('option', { key: s, value: s }, s))),
      div({ style: { display: 'flex', alignItems: 'center', gap: 6 } },
        btn({
          onClick: () => setDateRange(null), title: 'Show every case on file, regardless of date',
          style: { padding: '4px 12px', borderRadius: 'var(--r)', border: '.5px solid ' + (dateRange ? 'var(--bdr)' : 'rgba(245,158,11,.4)'),
            background: dateRange ? 'transparent' : 'var(--adim)', color: dateRange ? 'var(--text2)' : 'var(--amber)',
            fontSize: 10, fontWeight: dateRange ? 400 : 700, cursor: 'pointer' },
        }, 'All'),
        h(DateRangeControl, { presets: DATE_RANGE_PRESETS, value: dateRange, onChange: setDateRange })),
      h('input', {
        type: 'search', placeholder: 'Search issue or comment…', value: q, onChange: e => setQ(e.target.value),
        style: { padding: '4px 9px', borderRadius: 'var(--r)', border: '.5px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text)', fontSize: 11, minWidth: 160 },
      }),
      btn({ onClick: exportCSV, disabled: !filtered.length, title: 'Download CSV', style: { padding: '3px 9px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', fontSize: 11, fontWeight: 600, cursor: filtered.length ? 'pointer' : 'default' } }, '⬇ CSV')),
  },
    div({ style: { display: 'flex', flexDirection: 'column', gap: 12 } },
      h(LocationSelector, { stores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, value: scope, onChange: setScope, mode: 'progressive' }),

      cases.length === 0
        ? div({ style: { textAlign: 'center', padding: '48px 20px', color: 'var(--text3)', fontSize: 12, border: '1px dashed var(--bdr)', borderRadius: 8 } },
            div({ style: { fontSize: 26, marginBottom: 10 } }, '📮'),
            div({ style: { fontWeight: 700, marginBottom: 6 } }, 'No complaint cases captured yet'),
            'Run scripts/browser-complaints-bulk-capture.js against a signed-in propel.mcd.com tab, then scripts/import-complaints-history.mjs, to backfill real case data.')
        : [
            div({ key: 'cards', style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
              card('Cases', String(stats.n)),
              ...Object.entries(stats.byStatus).map(([s, n]) => card(s, String(n), statusColor(s)))),

            filtered.length === 0
              ? div({ key: 'empty', style: { textAlign: 'center', padding: '32px 20px', color: 'var(--text3)', fontSize: 12 } }, 'No cases match these filters.')
              : div({ key: 'tbl', style: { background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, overflowX: 'auto' } },
                  h('table', { style: { width: '100%', borderCollapse: 'collapse', minWidth: 760 } },
                    h('thead', null, h('tr', null,
                      h('th', { style: thS }, 'Case #'),
                      h('th', { style: thS }, 'Store'),
                      h('th', { style: thS }, 'Incident Date'),
                      h('th', { style: thS }, 'Received Date'),
                      h('th', { style: thS }, 'Status'),
                      h('th', { style: thS }, 'Issue'),
                      h('th', { style: thS }, 'Comment'))),
                    h('tbody', null, ...filtered.map((c, i) => {
                      const isOpen = expandedId === c.childCaseId;
                      const comment = c.customerComments || '';
                      return h('tr', {
                        key: c.childCaseId || i, onClick: () => setExpandedId(isOpen ? null : c.childCaseId),
                        title: comment ? 'Click to ' + (isOpen ? 'collapse' : 'expand') + ' the full comment' : undefined,
                        style: { cursor: comment ? 'pointer' : 'default', background: isOpen ? 'rgba(245,188,0,.06)' : 'transparent' },
                      },
                        h('td', { style: { ...tdS, color: 'var(--text3)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' } }, c.childCaseId || '—'),
                        h('td', { style: { ...tdS, fontWeight: 600, whiteSpace: 'nowrap' } },
                          storeName(c.loc), span({ style: { color: 'var(--text3)', fontWeight: 400, fontSize: 9, marginLeft: 5 } }, '#' + locNum(c.loc))),
                        h('td', { style: { ...tdS, color: 'var(--text2)', whiteSpace: 'nowrap' } }, niceDate(c.incidentDate)),
                        h('td', { style: { ...tdS, color: 'var(--text2)', whiteSpace: 'nowrap' } }, niceDate(c.receivedDate)),
                        h('td', { style: tdS },
                          span({ style: { fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: withAlpha(statusColor(c.caseStatus), '22'), color: statusColor(c.caseStatus) } }, c.caseStatus || '—')),
                        h('td', { style: { ...tdS, color: 'var(--text2)' } },
                          c.issueCode || '—', c.issueSubCode && span({ style: { color: 'var(--text3)' } }, ' · ' + c.issueSubCode)),
                        h('td', { style: { ...tdS, color: 'var(--text2)', fontStyle: comment ? 'italic' : 'normal', maxWidth: isOpen ? 'none' : 360, overflow: isOpen ? 'visible' : 'hidden', textOverflow: isOpen ? 'clip' : 'ellipsis', whiteSpace: isOpen ? 'normal' : 'nowrap' } },
                          comment ? '"' + comment + '"' : '—'));
                    })))),
          ]),
    div({ style: { padding: '6px 16px', marginTop: 8, borderTop: '.5px solid var(--bdr)', fontSize: 8, color: 'var(--text3)' } },
      'This is the raw case feed — the per-store/period Complaint Contacts/100K rate (cases ÷ guest count × 100,000) is computed in Performance Reviews, not recomputed here.'));
}
