// @ts-nocheck
// ── Targets vs Actual report (2026-11-15, owner request) ────────────────────────────────────
// "a new report that focuses solely on the monthly targets and daily targets (separate tabs)
// that shows clearly what the current target is vs the actual results." Date picker seeded
// with 7/14/21/28-day + MTD presets. Laid out per store (one card each), echoing the per-store
// monthly projections workbook the owner already prints and sends out — a McDonald's-accent
// header band per store, a clean target/actual/variance table underneath, built on ReportShell
// exactly like every other report in this redesign so it gets Print/CSV/Excel/PDF for free.
import * as React from 'react';
import { ReportShell } from '../components/ReportShell.js';
import { DATE_RANGE_PRESETS, MTD_PRESET } from '../components/PanelControls.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC } from '../constants.js';
import { ymKey } from '../engine/monthly-targets-v2.js';
import { computeTargetsVsActual, YEARLY_TARGET_METRICS, FOB_COMPONENT_KEYS, FOB_SUMMARY_KEYS } from '../engine/targets-vs-actual.js';
import { fP, f$, fN } from '../utils/fmt.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);
const td = (p, ...c) => h('td', p, ...c);
const tr = (p, ...c) => h('tr', p, ...c);

// 7/14/28D already live in the shared catalog; 21D is new (owner asked for it specifically, and
// no existing report needed it) so it's defined here rather than added to the shared
// DATE_RANGE_PRESETS list every other report subsets from. MTD is the shared MTD_PRESET
// (PanelControls.js) — additive there too, so this is the first consumer, not a special case.
const DATE_PRESETS = [
  DATE_RANGE_PRESETS.find(p => p.id === '7d'),
  DATE_RANGE_PRESETS.find(p => p.id === '14d'),
  { id: '21d', label: '21D', days: 21 },
  DATE_RANGE_PRESETS.find(p => p.id === '28d'),
  MTD_PRESET,
];

const _STATUS_COLOR = { ok: '#10b981', watch: 'var(--amber)', miss: 'var(--crit)', none: 'var(--text3)' };
const _STATUS_LABEL = { ok: '✓ On Target', watch: '⚠ Watch', miss: '✕ Miss', none: '—' };

function _fmtVal(v, unit) {
  if (v == null) return '—';
  if (unit === 'dollar') return f$(v);
  if (unit === 'pct') return fP(v, 2);
  if (unit === 'sec') return fN(v, 0) + 's';
  return fN(v, unit === 'count' ? 1 : 2);
}
function _fmtDiff(diff, unit) {
  if (diff == null) return '—';
  const sign = diff > 0 ? '+' : '';
  if (unit === 'dollar') return sign + f$(diff);
  if (unit === 'pct') return sign + fP(diff, 2);
  if (unit === 'sec') return sign + fN(diff, 0) + 's';
  return sign + fN(diff, unit === 'count' ? 1 : 2);
}
// Flat text form of the Actual cell for CSV/Excel/PDF/print, where a paced metric's real MTD
// actual and its month-end pace projection both need to show in one cell/line (the on-screen
// StoreWorkbookCard instead renders them as two visually distinct lines — see below).
function _actualText(m) {
  const base = _fmtVal(m.actual, m.unit);
  return m.pace != null ? `${base} (Pace: ${_fmtVal(m.pace, m.unit)})` : base;
}
// Cross-month target blend label (owner request 2026-11-15: a 7/14/21/28D window can cross a
// month boundary, and the Target must never silently read as a single, ordinary month's number
// when it's actually a blend). `m.blend` is null for the common single-month case (nothing
// renders). When populated, every window month is listed — including a missing one, rendered
// distinctly from an actual blend so the label never implies math happened on data that wasn't
// there.
function _monthShort(ym) {
  const [y, mo] = String(ym).split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleString('en-US', { month: 'short' });
}
function _blendLabel(blend) {
  if (!blend) return null;
  const present = blend.filter(b => !b.missing);
  const missing = blend.filter(b => b.missing);
  if (!missing.length) return 'Blended: ' + present.map(b => `${b.days}d ${_monthShort(b.ym)}`).join(' + ');
  if (!present.length) return null; // shouldn't happen (caller already checked a value exists), but never fabricate a label
  return `Covers ${present.map(b => `${b.days}d ${_monthShort(b.ym)}`).join(' + ')} only (${missing.map(b => _monthShort(b.ym)).join('/')} target missing)`;
}
// Yearly tab rollup label (owner follow-up 2026-11-15, same request as the monthly cross-month
// blend above: "fix the targets here as well like we did for monthly"). When the yearly workbook
// itself has no value for a field, targets-vs-actual.js's _yearlyTarget falls back to rolling up
// the Monthly Targets table instead — a DIFFERENT situation from the monthly tab's blend (a
// narrow window straddling two months) and worth a visibly different label so a rolled-up number
// is never mistaken for an on-file annual figure. Deliberately omits day counts (unlike
// _blendLabel) -- the point here is sourcing, not the exact per-month weighting, which the
// targets-vs-actual.js header already documents precisely.
function _yearlyRollupLabel(blend) {
  if (!blend) return null;
  const present = blend.filter(b => !b.missing).map(b => _monthShort(b.ym));
  if (!present.length) return null;
  const missing = blend.filter(b => b.missing).map(b => _monthShort(b.ym));
  const span = present.length > 1 ? `${present[0]}–${present[present.length - 1]}` : present[0];
  return missing.length ? `From Monthly Targets (${span}; ${missing.join('/')} missing)` : `From Monthly Targets (${span})`;
}
// Picks the right blend/rollup label for a metric row, whichever tab/path produced it.
function _targetLabel(m) {
  return m.targetSource === 'monthly-rollup' ? _yearlyRollupLabel(m.blend) : _blendLabel(m.blend);
}
// Flat text form of the Target cell for CSV/Excel/PDF, mirroring _actualText's pattern.
function _targetText(m) {
  const base = _fmtVal(m.target, m.unit);
  const label = _targetLabel(m);
  return label ? `${base} (${label})` : base;
}
const _allStores = Object.keys(STORE_NAMES).map(l => ({ loc: l }));

// FOB component/summary visual grouping (owner follow-up 2026-11-15: "put an outline or shade
// differently to denote FOB components culminating with an even more visual drawing to the FOB
// line"). A soft gold accent marks each of the 8 waste/variance/cost-leg rows as one group; the
// two summary rows they roll up into (FOB Target %, Total Food Cost %) get the full McDonald's-
// gold accent + a bold label, so the eye is drawn from the detail rows up to where they land.
// Shared by the on-screen card and the printed/PDF view so the two never drift apart.
const _FOB_GROUP_KEYS = new Set([...FOB_COMPONENT_KEYS, ...FOB_SUMMARY_KEYS]);
function _fobRowStyle(key) {
  if (FOB_SUMMARY_KEYS.includes(key)) return { accent: '#f5bc00', tint: 'rgba(245,188,0,.10)', bold: true };
  if (FOB_COMPONENT_KEYS.includes(key)) return { accent: 'rgba(245,188,0,.45)', tint: 'rgba(245,188,0,.035)', bold: false };
  return null;
}

// One store's workbook card: a McDonald's-red accent band (the owner's own printed workbook's
// signature touch, meridian.css's now-superseded .proj-print-header skin) over a plain,
// theme-aware table — never a hardcoded dark/light surface, so it reads correctly in both
// themes (CLAUDE.md's light-is-default rule), with the brand accent limited to the one border +
// title, same as every semantic-color literal already used throughout this codebase.
function StoreWorkbookCard({ loc, metrics }) {
  return div({ style: { marginBottom: 16, border: '.5px solid var(--bdr)', borderRadius: 'var(--rl)', overflow: 'hidden', breakInside: 'avoid' } },
    div({ style: { padding: '8px 14px', borderLeft: '3px solid #DA291C', background: 'var(--surf2)', display: 'flex', alignItems: 'baseline', gap: 8 } },
      span({ style: { fontSize: '12px', fontWeight: 800, color: 'var(--text)' } }, sNameC(loc) || loc),
      span({ style: { fontSize: '9px', color: 'var(--text3)' } }, loc),
    ),
    div({ style: { overflowX: 'auto' } },
      h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '10.5px', minWidth: 460 } },
        h('thead', null, tr({ style: { background: 'var(--surf3)' } },
          h('th', { style: _thStyle(false) }, 'Metric'),
          h('th', { style: _thStyle(true) }, 'Target'),
          h('th', { style: _thStyle(true) }, 'Actual'),
          h('th', { style: _thStyle(true) }, 'Variance'),
          h('th', { style: _thStyle(true) }, 'Status'),
        )),
        h('tbody', null, ...(() => {
          const firstFobIdx = metrics.findIndex(m => _FOB_GROUP_KEYS.has(m.key));
          return metrics.map((m, i) => {
            const fob = _fobRowStyle(m.key);
            return tr({
              key: m.key,
              style: {
                borderBottom: '.5px solid var(--bdr)',
                background: fob ? fob.tint : (i % 2 ? 'var(--surf2)' : 'transparent'),
                boxShadow: fob ? `inset 3px 0 0 ${fob.accent}` : undefined,
                borderTop: i === firstFobIdx ? '1px solid rgba(245,188,0,.45)' : undefined,
              },
            },
              td({ style: { ..._tdStyle(false), fontWeight: fob?.bold ? 700 : 400 } }, m.label),
              td({ style: _tdStyle(true) },
                div(null, _fmtVal(m.target, m.unit)),
                _targetLabel(m) && div({ style: { fontSize: '8.5px', color: 'var(--text3)', fontFamily: 'var(--sans)' } }, _targetLabel(m)),
              ),
              td({ style: _tdStyle(true) },
                div(null, _fmtVal(m.actual, m.unit)),
                m.pace != null && div({ style: { fontSize: '8.5px', color: 'var(--text3)', fontFamily: 'var(--sans)' } }, `Pace: ${_fmtVal(m.pace, m.unit)}`),
              ),
              td({ style: { ..._tdStyle(true), color: _STATUS_COLOR[m.status] } }, _fmtDiff(m.diff, m.unit)),
              td({ style: { padding: '4px 10px', textAlign: 'center', fontWeight: 700, fontSize: '9.5px', color: _STATUS_COLOR[m.status] } }, _STATUS_LABEL[m.status]),
            );
          });
        })()),
      ),
    ),
  );
}
const _thStyle = (right) => ({
  padding: '5px 10px', textAlign: right ? 'right' : 'left', fontSize: '9px', textTransform: 'uppercase',
  letterSpacing: '.3px', color: 'var(--text2)', fontWeight: 600, borderBottom: '.5px solid var(--bdr)',
});
const _tdStyle = (right) => ({
  padding: '4px 10px', textAlign: right ? 'right' : 'left', fontFamily: right ? 'var(--mono)' : 'var(--sans)',
  color: 'var(--text)',
});

// Print HTML mirroring StoreWorkbookCard's exact on-screen look (owner request 2026-11-15:
// "make the print view look like the app view, and one page per location") — the McDonald's-red
// accent band + Metric/Target/Actual/Variance/Status table, one store per printed page. Colors
// are hardcoded literals here (never CSS vars) because this is a standalone printed document,
// not the themed app shell — same convention every other hand-rolled print builder in the
// codebase already follows (skills-matrix.js, labor-analysis.js, etc.), including their
// established "one page per X" mechanism: `.store-page{page-break-before:always}` skipped on
// :first-child, rather than tracking "is this the last one" in JS.
const _PRINT_STATUS_COLOR = { ok: '#0f9960', watch: '#b45309', miss: '#c0392b', none: '#999' };
function _escHtml(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function buildPrintHTML({ title, subtitle, rows }) {
  const storeHtml = (r) => `
    <section class="store-page">
      <div class="hdr"><h1>${_escHtml(title)}</h1>${subtitle ? `<div class="sub">${_escHtml(subtitle)}</div>` : ''}</div>
      <div class="card">
        <div class="band"><span class="name">${_escHtml(sNameC(r.loc) || r.loc)}</span><span class="loc">${_escHtml(r.loc)}</span></div>
        <table>
          <thead><tr><th>Metric</th><th class="r">Target</th><th class="r">Actual</th><th class="r">Variance</th><th class="c">Status</th></tr></thead>
          <tbody>${(() => {
            const firstFobIdx = r.metrics.findIndex(m => _FOB_GROUP_KEYS.has(m.key));
            return r.metrics.map((m, i) => {
              const fob = _fobRowStyle(m.key);
              const rowStyle = [
                fob ? `box-shadow:inset 3px 0 0 ${fob.accent}` : '',
                fob ? `background:${fob.tint}` : '',
                i === firstFobIdx ? 'border-top:1px solid rgba(245,188,0,.45)' : '',
              ].filter(Boolean).join(';');
              return `
            <tr${rowStyle ? ` style="${rowStyle}"` : ''}>
              <td${fob?.bold ? ' style="font-weight:700"' : ''}>${_escHtml(m.label)}</td>
              <td class="r">${_escHtml(_fmtVal(m.target, m.unit))}${_targetLabel(m) ? `<div class="pace">${_escHtml(_targetLabel(m))}</div>` : ''}</td>
              <td class="r">${_escHtml(_fmtVal(m.actual, m.unit))}${m.pace != null ? `<div class="pace">Pace: ${_escHtml(_fmtVal(m.pace, m.unit))}</div>` : ''}</td>
              <td class="r" style="color:${_PRINT_STATUS_COLOR[m.status]}">${_escHtml(_fmtDiff(m.diff, m.unit))}</td>
              <td class="c" style="color:${_PRINT_STATUS_COLOR[m.status]}">${_escHtml(_STATUS_LABEL[m.status])}</td>
            </tr>`;
            }).join('');
          })()}
          </tbody>
        </table>
      </div>
    </section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${_escHtml(title)}</title>
    <style>
      @page{margin:0.5in}
      body{font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111;margin:0;font-size:11px}
      .store-page{page-break-before:always;padding:0}
      .store-page:first-child{page-break-before:auto}
      .hdr{border-bottom:2px solid #DA291C;padding-bottom:8px;margin-bottom:14px}
      .hdr h1{margin:0;font-size:16px}
      .hdr .sub{color:#666;font-size:10px;margin-top:2px}
      .card{border:1px solid #ddd;border-radius:4px;overflow:hidden}
      .card .band{padding:8px 14px;border-left:4px solid #DA291C;background:#f8f8f8;display:flex;align-items:baseline;gap:8px}
      .card .band .name{font-size:13px;font-weight:800}
      .card .band .loc{font-size:9px;color:#888}
      table{width:100%;border-collapse:collapse;font-size:10.5px}
      th{background:#f5bc00;color:#111;padding:5px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.3px;font-weight:700}
      th.r{text-align:right} th.c{text-align:center}
      td{padding:4px 10px;border-bottom:1px solid #eee}
      td.r{text-align:right;font-family:ui-monospace,monospace}
      td.c{text-align:center;font-weight:700;font-size:9.5px}
      .pace{font-size:8.5px;color:#888;font-family:-apple-system,Segoe UI,Arial,sans-serif}
      tr:nth-child(even){background:#fafafa}
    </style></head><body>${rows.map(storeHtml).join('')}</body></html>`;
}

// A cheap fingerprint of ds fields this report's actual-value resolvers read, used only to
// detect that a background fetch landed late -- never to source a metric value (deliberately
// excludes the three raw manual-data fields CLAUDE.md's "source data through the shared
// helpers" ratchet, src/__tests__/ratchet-raw-metric-rows.test.js, specifically guards against
// a panel reading directly; the fields used below aren't covered by that ratchet and already
// correlate with the same stream-arrival timing this exists to catch).
// Owner-reported 2026-11-15: on mobile, switching away from and back to the app commonly
// reloads the page mid-startup -- if Run Report is clicked before these streams finish their
// background fetch (FOB's is a slow ~500-day pull), their rows read blank, and nothing ever
// prompted a re-check once the data landed a few seconds later. This fingerprint lets the panel
// notice that lull ending and recompute on its own, instead of leaving a stale, part-blank
// result sitting there until the user happens to run the report again.
function _dsFingerprint(ds) {
  return [
    ds?.opsLaborRows?.length || 0, ds?.qsrFobRows?.length || 0, ds?.ebosRows?.length || 0,
    ds?.allMonthlyTargets ? Object.keys(ds.allMonthlyTargets).length : 0,
    ds?.allYearlyTargets ? Object.keys(ds.allYearlyTargets).length : 0,
  ].join('|');
}

export function TargetsVsActualReportPanel({ ds, stores, onClose }) {
  const { useState, useEffect, useRef } = React;
  const [tab, setTab] = useState('monthly');
  const [result, setResult] = useState(null); // { monthly: [...], daily: [...] } | null
  const [runInfo, setRunInfo] = useState(null); // { range, scope } from the last Run, for export/print subtitles
  const lastRunRef = useRef(null); // { range, locs } from the last Run, for the auto-refresh effect below

  const compute = (dsNow, range, locs) => {
    const rangeEnd = range?.e ? new Date(range.e) : new Date();
    const targetMonthYm = range?.e ? (() => {
      const d = new Date(range.e);
      return d.getFullYear() + '-' + (d.getMonth() + 1);
    })() : ymKey(new Date());
    const targetYear = rangeEnd.getFullYear();
    const allMonthlyTargets = dsNow?.allMonthlyTargets || {};
    const allYearlyTargets = dsNow?.allYearlyTargets || {};
    setResult({
      monthly: computeTargetsVsActual(dsNow, locs, { which: 'monthly', range, allMonthlyTargets, targetMonthYm }),
      daily: computeTargetsVsActual(dsNow, locs, { which: 'daily', range }),
      yearly: computeTargetsVsActual(dsNow, locs, { which: 'yearly', range, allMonthlyTargets, allYearlyTargets, targetYear }),
    });
  };

  const run = async ({ range, locs, scope }) => {
    setRunInfo({ range, scope });
    lastRunRef.current = { range, locs, fingerprint: _dsFingerprint(ds) };
    compute(ds, range, locs);
  };

  // Auto-refresh: if a run already happened and the underlying streams have since grown (a
  // background fetch that was still in flight at Run time has since landed), silently recompute
  // with the SAME params rather than leaving the earlier, part-blank result on screen.
  useEffect(() => {
    const last = lastRunRef.current;
    if (!last) return;
    const fp = _dsFingerprint(ds);
    if (fp === last.fingerprint) return;
    lastRunRef.current = { ...last, fingerprint: fp };
    compute(ds, last.range, last.locs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds?.opsLaborRows?.length, ds?.qsrFobRows?.length, ds?.ebosRows?.length,
      ds?.allMonthlyTargets, ds?.allYearlyTargets]);

  const activeRows = result ? result[tab] : null;
  const _tabTitle = tab === 'daily' ? 'Daily' : tab === 'yearly' ? 'Yearly' : 'Monthly';
  const _title = _tabTitle + ' Targets vs Actual';
  const _subtitle = runInfo ? `${runInfo.scope} · ${runInfo.range?.s} to ${runInfo.range?.e}` : undefined;

  const getExportData = () => ({
    title: _title, subtitle: _subtitle,
    headers: ['Store', 'Metric', 'Target', 'Actual', 'Variance', 'Status'],
    rows: (activeRows || []).flatMap(r => r.metrics.map(m => [
      sNameC(r.loc) || r.loc, m.label, _targetText(m), _actualText(m),
      _fmtDiff(m.diff, m.unit), _STATUS_LABEL[m.status],
    ])),
  });

  const getPrintHTML = () => buildPrintHTML({ title: _title, subtitle: _subtitle, rows: activeRows || [] });

  return h(ReportShell, {
    title: 'Targets vs Actual', icon: '🎯', onBack: onClose,
    subtitlePrefix: _tabTitle + ' targets vs actual results, per store',
    stores: (stores && stores.length) ? stores : _allStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES,
    datePresets: DATE_PRESETS, defaultPresetId: '28d',
    onRun: run, getExportData, getPrintHTML,
  },
    div({ style: { display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' } },
      ['monthly', 'daily', 'yearly'].map(t => btn({
        key: t, className: 'btn btn-sm' + (tab === t ? ' btn-a' : ''), onClick: () => setTab(t),
      }, t === 'monthly' ? '📅 Monthly Targets' : t === 'daily' ? '☀️ Daily Targets' : '📆 Yearly Targets')),
    ),
    div({ style: { fontSize: '10px', color: 'var(--text3)', marginBottom: 12 } },
      tab === 'monthly'
        ? 'Target reads the real monthly override for the selected range\'s month where one has been saved, falling back to the standing default target otherwise — the same target MonthlyTargetManager edits. When a 7/14/21/28D window crosses a month boundary, the Target is a math blend of both months\' real targets — day-weighted for %/rate/sec metrics, day-prorated-and-summed for $ metrics — never a silent read of just one month\'s number; a small "Blended: Xd Mon + Yd Mon" line under the Target makes this explicit, or "Covers Xd Mon only (… target missing)" if one of the two months has no saved target to blend in. Variance and Status always grade off the SAME number, so they can never disagree: for Sales $ mid-month, that\'s the month-end pace projection — this window\'s own actual scaled up by its own day-span vs. the full month, the same run-rate the Projection Workspace\'s Actuals-vs-Target pace table uses for a true MTD window — so a store isn\'t flagged a "miss" on day 3 just because the full-month total hasn\'t arrived yet. The real to-date actual stays fully visible as its own number (with the pace shown as a small "Pace:" line beneath it), it\'s just not what Variance itself subtracts from Target. Pacing only applies within a single month that hasn\'t finished yet — a window crossing a month boundary already has its Target scaled to match its own days, so Variance and Status there both grade off the plain Actual, same as every other metric.'
        : tab === 'yearly'
        ? `Target reads the uploaded yearly targets workbook for the selected range's year first; Sales $ and Crew Labor % fall back to a roll-up of real Monthly Targets when the yearly workbook has no value for that field (a small "From Monthly Targets (…)" line under the Target makes this explicit) — every other yearly-workbook field has no such fallback, since there's no monthly equivalent to roll up from, and reads as blank rather than a guess. Covers the ${YEARLY_TARGET_METRICS.length} yearly-workbook fields with a verified daily/auto actual source; CSAT, Digital, and People (OSAT, turnover, headcount, McDelivery, etc.) aren't wired in yet — see Yearly Projections → Target Categories for those targets on their own. Actual is year-to-date (Jan 1 through the picker's end date), not the narrow 7/14/21/28/MTD window — a flat month's data compared against a full annual target didn't make sense. Variance and Status always grade off the same number, so they can never disagree: for Sales $, that's a pace projection that sums each completed month's real total plus the current month's own pace (shown as a "Pace:" line) — the real to-date actual stays fully visible as its own number, it's just not what Variance subtracts from Target. Crew Labor % and FOB Target % are dollar-weighted across the whole year-to-date span, never an average of monthly percentages.`
        : 'Target is each store\'s standing daily operational target — there is no monthly override for these.'),
    activeRows == null
      ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'Choose a date range and location, then Run Report.')
      : !activeRows.length
        ? div({ style: { textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: '11px' } }, 'No stores in this selection.')
        : div(null, ...activeRows.map(r => h(StoreWorkbookCard, { key: r.loc + tab, loc: r.loc, metrics: r.metrics }))),
  );
}
