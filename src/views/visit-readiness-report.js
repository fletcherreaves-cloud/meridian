// @ts-nocheck
// ── Visit Readiness report (Notes 56 #2, first slice) ────────────────────────────────
// The printable / exportable face of the Visit Readiness panel. Two deliverables, both
// built from the SAME `computeVisitReadiness` result the on-screen panel renders — no
// second calculation path, so the report can never disagree with the screen:
//
//   readinessReportHTML(res, opts)  → print / PDF, workbook aesthetic (matches the
//                                     v4.800 One-Pager print redesign: gold rules,
//                                     dense tables, page-break-inside:avoid sections)
//   readinessAuditCSV(res, opts)    → one flat row per (store × area × metric), the
//                                     whole composite exploded for spreadsheet audit
//
// CALIBRATION IS THE POINT. Per feedback-metric-provenance, nothing here is a bare
// number: every metric prints its actual, the target it was graded against, HOW that
// target was resolved (this store's own DEFAULT_TARGETS entry vs a McDonald's
// standard), the tolerance that turns the gap into a 0-1 score, the source system /
// report / table / feed it came from, how many observations it averages, and its
// as-of date. Every area prints its nominal weight, its effective weight after
// renormalization, and the points it contributed — and those points sum to the
// composite, so a reader can re-derive the score by hand.
//
// Data gaps are printed as gaps. Cleanliness, Health & Safety, cook-temp criticals and
// DFSC have no feed; they are listed as excluded, never back-filled with a placeholder.

import { STORE_NAMES } from '../constants.js';
import { srcMeta } from '../engine/visit-readiness.js';

const sName = loc => STORE_NAMES?.[String(loc)] || ('Store ' + loc);
const esc = t => String(t == null ? '' : t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Shared metric formatter (the on-screen panel imports this too, so a value reads
// identically on screen, in print and in the CSV).
export function fmtMetric(v, unit) {
  if (v == null || isNaN(v)) return '—';
  if (unit === 'pct') { const p = Math.abs(v) <= 1.5 ? v * 100 : v; return p.toFixed(2) + '%'; }
  if (unit === 's') return Math.round(v) + 's';
  if (unit === 'hrs') return v.toFixed(1) + 'h';
  return (Math.round(v * 100) / 100).toString();
}
const pts = v => v == null ? '—' : v.toFixed(2);
const pct2 = v => v == null ? '—' : (v * 100).toFixed(2) + '%';
const sc0 = v => v == null ? '—' : v.toFixed(1);
// Print-safe status colours (dark-theme vars don't exist in the print window).
const P_OK = '#0a7d38', P_WARN = '#b26a00', P_BAD = '#c0261b', P_MUTE = '#888';
const scoreCol = s => s == null ? P_MUTE : s >= 85 ? P_OK : s >= 70 ? P_WARN : P_BAD;
const BAND_L = { ready: 'Ready', watch: 'Watch', 'at-risk': 'At risk' };
const FS_L = { low: 'Low', watch: 'Watch', elevated: 'Elevated', unknown: 'No data' };

// A canonical, self-describing export/print name: what it is · what scope · what date.
// (cleanup-backlog Class 3 — never a bare generic filename.)
export function reportFileBase(scopeLabel, kind) {
  const slug = String(scopeLabel || 'all-stores').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'all-stores';
  return `visit-readiness-${kind}-${slug}-${new Date().toISOString().slice(0, 10)}`;
}

// ── CSV: the composite exploded, one row per metric ──────────────────────────────────
const csvCell = c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"';

export function readinessAuditCSV(res, opts = {}) {
  const scopeLabel = opts.scopeLabel || 'All stores';
  const cols = [
    'Store', 'NSN', 'Store readiness', 'Band', 'Data coverage', 'Food-safety flag',
    'Area', 'Area nominal weight', 'Area effective weight', 'Area score', 'Area contribution (pts)',
    'Metric', 'Actual', 'Target', 'Target basis', 'Target reference', 'Direction',
    'Tolerance', 'Score 0 at', 'Metric score (0-1)',
    'Source system', 'Source report', 'Source table', 'Feed', 'ds field',
    'Observations', 'Window from', 'As of', 'PACE item mapped', 'Note',
  ];
  const lines = [
    // A short provenance preamble so a detached CSV still says what it is.
    [`Visit Readiness (PACE) calibration audit`].map(csvCell).join(','),
    [`Scope`, scopeLabel, `Stores`, (res.stores || []).length, `Generated`, res.method?.generatedAt || new Date().toISOString()].map(csvCell).join(','),
    [`Composite`, res.method?.composite || ''].map(csvCell).join(','),
    [`Metric score`, res.method?.metricScore || ''].map(csvCell).join(','),
    [`Daily window`, res.method?.dailyWindow || ''].map(csvCell).join(','),
    [`Monthly window`, res.method?.monthlyWindow || ''].map(csvCell).join(','),
    '',
    cols.map(csvCell).join(','),
  ];
  for (const s of res.stores || []) {
    const head = [sName(s.loc), s.loc, s.readiness, BAND_L[s.band] || s.band, pct2(s.coverage), FS_L[s.fsFlag] || s.fsFlag];
    for (const a of s.audit || []) {
      const areaCols = [a.label, pct2(a.weight), pct2(a.effWeight), sc0(a.score), pts(a.contribution)];
      if (a.excluded) {
        lines.push([...head, ...areaCols, '(area excluded)', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
          a.pace, 'No metric in this area resolved — area dropped and its weight redistributed'].map(csvCell).join(','));
      }
      for (const d of a.drivers || []) {
        const m = srcMeta(d.source);
        lines.push([...head, ...areaCols,
          d.label, fmtMetric(d.actual, d.unit), fmtMetric(d.target, d.unit),
          d.basis?.label || '', d.basis?.ref || '', d.dir,
          d.toleranceLabel || '', fmtMetric(d.zeroAt, d.unit), d.score == null ? '' : d.score.toFixed(3),
          m.system, m.report, m.table, m.feed, d.source + '.' + d.field,
          d.obs, d.from || '', d.asOf || '', d.pace || '', d.monthly ? 'Monthly metric — latest value on record' : '',
        ].map(csvCell).join(','));
      }
      for (const mi of a.missing || []) {
        lines.push([...head, ...areaCols, mi.label, 'NOT MEASURED', '', '', '', '', '', '', '', '', '', '', '', '', '',
          '', '', mi.pace || '', mi.reason].map(csvCell).join(','));
      }
    }
    // Food-safety proxies ride along, explicitly marked as outside the composite.
    for (const d of s.fsDrivers || []) {
      const m = srcMeta(d.source);
      lines.push([...head, 'Food safety (flag only — NOT in composite)', '', '', sc0(s.fsScore), '',
        d.label, fmtMetric(d.actual, d.unit), fmtMetric(d.target, d.unit),
        d.basis?.label || '', d.basis?.ref || '', d.dir,
        d.toleranceLabel || '', fmtMetric(d.zeroAt, d.unit), d.score == null ? '' : d.score.toFixed(3),
        m.system, m.report, m.table, m.feed, d.source + '.' + d.field,
        d.obs, d.from || '', d.asOf || '', d.pace || '',
        'Directional risk flag — excluded from readiness by design'].map(csvCell).join(','));
    }
  }
  // Declared gaps travel with the export so nobody reads the CSV as full PACE coverage.
  lines.push('', ['Declared coverage gaps (not scored, not estimated)'].map(csvCell).join(','));
  lines.push(['Area', 'PACE item', 'Status', 'Detail'].map(csvCell).join(','));
  for (const g of res.gaps || []) lines.push([g.area, g.pace, g.status, g.detail].map(csvCell).join(','));
  return lines.join('\n');
}

// ── Print / PDF ─────────────────────────────────────────────────────────────────────
function calibrationHtml(cal, stores) {
  if (!cal) return '';
  const nameOf = loc => sName(loc);
  if (!cal.n || cal.n < 3) {
    return `<div class="sect"><h2>Model check — predicted vs actual visits</h2>
      <p class="note">Only ${cal.n || 0} store${cal.n === 1 ? '' : 's'} in this scope has a graded visit on record — not enough to validate the estimate.
      Readiness self-checks against actual CFV / RGRV / EcoSure scores as they land. Until then treat it as an unvalidated early warning.</p>
      ${(cal.rows || []).length ? `<table><tr><th>Store</th><th class="n">Predicted</th><th>Band</th><th class="n">Actual visit</th><th>Type</th><th>Date</th><th>Result</th></tr>
        ${cal.rows.map(r => `<tr><td>${esc(nameOf(r.loc))}</td><td class="n">${sc0(r.predicted)}</td><td>${esc(BAND_L[r.band] || r.band)}</td>
          <td class="n">${r.actual.toFixed(2)}%</td><td>${esc(r.type || 'CFV')}</td><td>${esc(r.dateISO || '')}</td>
          <td class="${r.pass === false ? 'bad' : r.pass ? 'ok' : ''}">${r.pass === false ? 'Fail' : r.pass ? 'Pass' : '—'}</td></tr>`).join('')}</table>` : ''}
    </div>`;
  }
  const rTxt = cal.r == null ? 'Correlation needs more visits.'
    : cal.r >= 0.6 ? 'Strong agreement — stores rated lower really do score lower on their real visits.'
    : cal.r >= 0.3 ? 'Moderate agreement — the estimate leans the right way; keep validating.'
    : cal.r >= 0 ? 'Weak agreement so far — treat as directional only.'
    : 'Estimate is currently INVERTED versus actuals — investigate before trusting it.';
  return `<div class="sect"><h2>Model check — predicted vs actual visits</h2>
    <div class="kpis">
      <div class="kpi"><div class="kv">${cal.r == null ? '—' : cal.r.toFixed(2)}</div><div class="kl">Spearman rank corr${cal.strength ? ' (' + esc(cal.strength) + ')' : ''}</div></div>
      <div class="kpi"><div class="kv">${cal.hitRate == null ? '—' : (cal.hitRate * 100).toFixed(2) + '%'}</div><div class="kl">Direction match (${cal.hits}/${cal.n})</div></div>
      <div class="kpi"><div class="kv">${cal.n}</div><div class="kl">Stores with a visit on record</div></div>
    </div>
    <p class="note">${esc(rTxt)} Rank correlation is used (not Pearson) because predicted readiness (0–100 index) and an actual graded-visit percentage are different scales — only the ORDER is comparable. Direction match = share of stores where "rated Ready" agrees with "scored at or above the group median actual".</p>
    <table><tr><th>Store</th><th class="n">Predicted readiness</th><th>Band</th><th class="n">Actual visit score</th><th>Type</th><th>Date</th><th>Result</th></tr>
      ${cal.rows.map(r => `<tr><td>${esc(nameOf(r.loc))}</td><td class="n">${sc0(r.predicted)}</td><td>${esc(BAND_L[r.band] || r.band)}</td>
        <td class="n">${r.actual.toFixed(2)}%</td><td>${esc(r.type || 'CFV')}</td><td>${esc(r.dateISO || '')}</td>
        <td class="${r.pass === false ? 'bad' : r.pass ? 'ok' : ''}">${r.pass === false ? 'Fail' : r.pass ? 'Pass' : '—'}</td></tr>`).join('')}</table>
  </div>`;
}

// The per-store calibration block: how the composite was built, then every metric with
// its full lineage, then what could not be measured.
function storeAuditHtml(s) {
  const bandCol = s.band === 'ready' ? P_OK : s.band === 'watch' ? P_WARN : P_BAD;
  const areaRows = (s.audit || []).map(a => `<tr${a.excluded ? ' class="dim"' : ''}>
      <td>${esc(a.label)}</td>
      <td class="n">${pct2(a.weight)}</td>
      <td class="n">${a.excluded ? '0.00% <span class="tiny">(dropped)</span>' : pct2(a.effWeight)}</td>
      <td class="n" style="color:${scoreCol(a.score)};font-weight:700">${sc0(a.score)}</td>
      <td class="n"><b>${pts(a.contribution)}</b></td>
      <td class="tiny">${a.excluded ? 'no data — weight redistributed to the other areas' : a.nMetrics + ' metric' + (a.nMetrics === 1 ? '' : 's') + ': ' + esc((a.drivers || []).map(d => d.label.split('(')[0].trim()).join(', '))}</td>
    </tr>`).join('');
  const sumContrib = (s.audit || []).reduce((t, a) => t + (a.contribution || 0), 0);
  const metricRows = (s.audit || []).flatMap(a => (a.drivers || []).map(d => {
    const m = srcMeta(d.source);
    const cls = d.score >= 0.85 ? 'ok' : d.score >= 0.6 ? 'warn' : 'bad';
    return `<tr>
      <td>${esc(a.label)}</td>
      <td>${esc(d.label)}</td>
      <td class="n">${esc(fmtMetric(d.actual, d.unit))}</td>
      <td class="n">${esc(fmtMetric(d.target, d.unit))}</td>
      <td class="tiny">${esc(d.basis?.label || '')}<br><span class="mono">${esc(d.basis?.ref || '')}</span></td>
      <td class="tiny">${esc(d.toleranceLabel || '')}<br>0 at ${esc(fmtMetric(d.zeroAt, d.unit))}</td>
      <td class="n ${cls}">${d.score == null ? '—' : d.score.toFixed(3)}</td>
      <td class="tiny">${esc(m.system)} · ${esc(m.report)}<br><span class="mono">${esc(m.table)}</span> <span class="feed feed-${esc(m.feed)}">${esc(m.feed)}</span></td>
      <td class="tiny n">${d.monthly ? 'latest month' : d.obs + ' day' + (d.obs === 1 ? '' : 's')}<br>${esc(d.asOf || '—')}</td>
    </tr>`;
  })).join('');
  const notMeasured = (s.notMeasured || []).length
    ? `<div class="gapbox"><b>Not measured for this store (${s.notMeasured.length})</b> — dropped from the area means above, never estimated:
        <ul>${s.notMeasured.map(mi => `<li>${esc(mi.label)} — ${esc(mi.reason)}</li>`).join('')}</ul></div>`
    : '';
  const fsRows = (s.fsDrivers || []).length
    ? `<table><tr><th>Food-safety proxy</th><th class="n">Actual</th><th class="n">Target</th><th class="tiny">Target basis</th><th class="n">Score</th><th class="tiny">Source</th></tr>
        ${s.fsDrivers.map(d => { const m = srcMeta(d.source); return `<tr><td>${esc(d.label)}</td><td class="n">${esc(fmtMetric(d.actual, d.unit))}</td>
          <td class="n">${esc(fmtMetric(d.target, d.unit))}</td><td class="tiny mono">${esc(d.basis?.ref || '')}</td>
          <td class="n">${d.score == null ? '—' : d.score.toFixed(3)}</td>
          <td class="tiny">${esc(m.system)} · <span class="mono">${esc(m.table)}</span></td></tr>`; }).join('')}</table>`
    : `<p class="note">No waste / variance data on record for this store — the food-safety flag reads "no data", not "low risk".</p>`;
  const lv = s.lastVisit
    ? `Last actual graded visit: <b>${esc(s.lastVisit.type || 'visit')} ${s.lastVisit.score.toFixed(2)}%</b>${s.lastVisit.pass === false ? ' <span class="bad">(did not pass)</span>' : s.lastVisit.pass ? ' <span class="ok">(pass)</span>' : ''}${s.lastVisit.dateISO ? ' · ' + esc(s.lastVisit.dateISO) : ''}`
    : 'No actual graded visit on record for this store — its readiness has never been checked against a real outcome.';
  return `<div class="store">
    <h2 class="storeh">${esc(sName(s.loc))} <span class="nsn">#${esc(s.loc)}</span>
      <span class="pill" style="background:${bandCol}">${esc(BAND_L[s.band] || s.band)} · ${s.readiness.toFixed(1)}</span>
      <span class="pill2">Data coverage ${pct2(s.coverage)}</span>
      <span class="pill2">Food safety: ${esc(FS_L[s.fsFlag] || s.fsFlag)}${s.fsScore != null ? ' (' + sc0(s.fsScore) + ')' : ''}</span></h2>
    <p class="why"><b>Why:</b> ${esc(s.why || '')}</p>
    <h3>How this score was built</h3>
    <table><tr><th>Area</th><th class="n">Nominal weight</th><th class="n">Effective weight</th><th class="n">Area score</th><th class="n">Contribution</th><th>Measured on</th></tr>
      ${areaRows}
      <tr class="tot"><td colspan="4">Readiness = Σ contributions</td><td class="n"><b>${sumContrib.toFixed(2)}</b></td><td class="tiny">reported readiness ${s.readiness.toFixed(1)} (±0.01 rounding)</td></tr></table>
    <h3>Metric detail — every input, its target and its lineage</h3>
    <table class="detail"><tr><th>Area</th><th>Metric</th><th class="n">Actual</th><th class="n">Target</th><th>Target basis</th><th>Tolerance</th><th class="n">Score</th><th>Source</th><th class="n">Obs / as of</th></tr>
      ${metricRows || '<tr><td colspan="9" class="tiny">No metric resolved for this store.</td></tr>'}</table>
    ${notMeasured}
    <h3>Food-safety risk flag <span class="tiny">— separate from readiness, never folded into the composite</span></h3>
    ${fsRows}
    <p class="note">${lv}</p>
  </div>`;
}

export function readinessReportHTML(res, opts = {}) {
  const scopeLabel = opts.scopeLabel || 'All stores';
  const detail = opts.detail === 'summary' ? 'summary' : 'full';
  const d = res.district;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const stores = res.stores || [];

  const summaryRows = stores.map(s => {
    const by = Object.fromEntries((s.audit || []).map(a => [a.key, a]));
    const cell = k => { const a = by[k]; return a && !a.excluded ? `<td class="n">${pts(a.contribution)}<span class="tiny"> / ${sc0(a.score)}</span></td>` : '<td class="n dim">—</td>'; };
    return `<tr>
      <td>${esc(sName(s.loc))} <span class="nsn">#${esc(s.loc)}</span></td>
      <td class="n" style="color:${scoreCol(s.readiness)};font-weight:800">${s.readiness.toFixed(1)}</td>
      <td>${esc(BAND_L[s.band] || s.band)}</td>
      ${cell('speed')}${cell('accuracy')}${cell('quality')}${cell('leadership')}
      <td class="n">${pct2(s.coverage)}</td>
      <td>${esc(FS_L[s.fsFlag] || s.fsFlag)}</td>
      <td class="tiny">${s.lastVisit ? esc((s.lastVisit.type || 'visit') + ' ' + s.lastVisit.score.toFixed(2) + '%' + (s.lastVisit.pass === false ? ' ✗' : '')) : '—'}</td>
    </tr>`;
  }).join('');

  const weightsHtml = (res.areas || []).map(a => `<tr><td>${esc(a.label)}</td><td class="n">${pct2((res.weights || {})[a.key])}</td>
    <td class="n">${d && d.subs ? sc0(d.subs[a.key]) : '—'}</td><td class="tiny">${esc(a.pace)}</td></tr>`).join('');

  const feeds = (res.sourcesUsed || []).map(k => { const m = srcMeta(k); return { k, ...m }; });
  const manualFeeds = feeds.filter(f => f.feed === 'manual');
  const sourceHtml = feeds.map(f => `<tr><td class="mono">${esc(f.k)}</td><td>${esc(f.system)}</td><td>${esc(f.report)}</td>
    <td class="mono tiny">${esc(f.table)}</td><td><span class="feed feed-${esc(f.feed)}">${esc(f.feed)}</span></td></tr>`).join('');

  const gapsHtml = (res.gaps || []).map(g => `<tr><td><b>${esc(g.area)}</b></td><td class="tiny">${esc(g.pace)}</td>
    <td class="tiny"><b>${esc(g.status)}</b></td><td class="tiny">${esc(g.detail)}</td></tr>`).join('');

  const ecoNote = res.hasEcoSure
    ? ''
    : `<p class="gapline"><b>No EcoSure / third-party food-safety result is loaded.</b> Graded-visit types on record: ${(res.visitTypes || []).length ? esc((res.visitTypes || []).join(', ')) : 'none'}. The readiness estimate has therefore never been validated against a food-safety outcome.</p>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Visit Readiness (PACE) — ${esc(scopeLabel)} — ${new Date().toISOString().slice(0, 10)}</title><style>
    body{font:11.5px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:26px;max-width:1000px;line-height:1.45}
    h1{font-size:18px;margin:0 0 2px}
    .sub{color:#666;font-size:10.5px;margin-bottom:12px}
    h2{font-size:13px;text-transform:uppercase;letter-spacing:.03em;border-bottom:2px solid #f5bc00;padding-bottom:3px;margin:18px 0 7px}
    h3{font-size:11.5px;margin:12px 0 4px;color:#444;text-transform:uppercase;letter-spacing:.03em}
    table{border-collapse:collapse;width:100%;margin:5px 0 8px;font-size:10.5px}
    th{background:#f5bc00;color:#111;text-align:left;padding:4px 7px;font-size:9.5px;text-transform:uppercase;letter-spacing:.03em;vertical-align:bottom}
    td{border-top:.5px solid #ddd;padding:4px 7px;vertical-align:top}
    .n{text-align:right;font-variant-numeric:tabular-nums}
    .tiny{font-size:9px;color:#666;line-height:1.35}
    .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9px}
    .ok{color:${P_OK};font-weight:700}.warn{color:${P_WARN};font-weight:700}.bad{color:${P_BAD};font-weight:700}
    .dim{color:#aaa}
    tr.tot td{border-top:1.5px solid #111;background:#fffaea}
    .kpis{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 10px}
    .kpi{border:1px solid #e2e2e2;border-radius:6px;padding:6px 12px;min-width:104px;background:#fbfbfb}
    .kv{font-size:19px;font-weight:800;font-variant-numeric:tabular-nums}
    .kl{font-size:8.5px;color:#666;text-transform:uppercase;letter-spacing:.04em}
    .store{page-break-inside:avoid;break-inside:avoid;border-top:1px solid #e6e6e6;padding-top:10px;margin-top:14px}
    .storeh{border:none;font-size:13px;text-transform:none;letter-spacing:0;margin:0 0 4px;padding:0}
    .nsn{color:#999;font-weight:400;font-size:10px}
    .pill{display:inline-block;padding:1px 8px;border-radius:4px;color:#fff;font-size:10px;font-weight:700;margin-left:6px;vertical-align:middle}
    .pill2{display:inline-block;padding:1px 8px;border-radius:4px;border:1px solid #ccc;color:#555;font-size:9.5px;font-weight:600;margin-left:4px;vertical-align:middle}
    .why{background:#fff8e1;border:1px solid #f5bc00;border-radius:5px;padding:7px 10px;margin:6px 0;font-size:10.5px}
    .note{font-size:10px;color:#555;margin:5px 0}
    .gapbox{border:1px solid #e0c9a0;background:#fdf7ee;border-radius:5px;padding:7px 10px;margin:7px 0;font-size:10px}
    .gapbox ul{margin:4px 0 0 16px;padding:0}.gapbox li{margin:2px 0}
    .gapline{border-left:3px solid ${P_BAD};background:#fff4f3;padding:6px 10px;font-size:10px;margin:8px 0}
    .feed{display:inline-block;padding:0 5px;border-radius:3px;font-size:8px;font-weight:700;text-transform:uppercase}
    .feed-auto{background:#dcfce7;color:#166534}.feed-emailed{background:#e0f2fe;color:#075985}
    .feed-manual{background:#fef3c7;color:#92400e}.feed-unknown{background:#eee;color:#666}
    .sect{page-break-inside:avoid;break-inside:avoid}
    .foot{color:#888;font-size:9px;margin-top:18px;border-top:1px solid #eee;padding-top:8px;line-height:1.5}
    @media print{body{margin:12px}}
  </style></head><body>
  <h1>Visit Readiness (PACE) — ${esc(scopeLabel)}</h1>
  <div class="sub">Graded-visit readiness &amp; calibration audit · ${stores.length} store${stores.length === 1 ? '' : 's'} in scope · printed ${esc(today)}</div>

  ${!d ? '<p class="note">No operational data resolved for this scope — nothing to report.</p>' : `
  <div class="sect">
    <div class="kpis">
      <div class="kpi"><div class="kv" style="color:${scoreCol(d.readiness)}">${sc0(d.readiness)}</div><div class="kl">Scope readiness</div></div>
      <div class="kpi"><div class="kv" style="color:${d.atRisk ? P_BAD : P_OK}">${d.atRisk}</div><div class="kl">At risk (&lt;70)</div></div>
      <div class="kpi"><div class="kv" style="color:${P_WARN}">${d.watch}</div><div class="kl">Watch (70–84)</div></div>
      <div class="kpi"><div class="kv" style="color:${P_OK}">${d.ready}</div><div class="kl">Ready (85+)</div></div>
      <div class="kpi"><div class="kv" style="color:${d.fsElevated ? P_BAD : P_OK}">${d.fsElevated}</div><div class="kl">Food-safety elevated</div></div>
    </div>
    <p class="note">${esc(res.method?.district || '')}</p>
  </div>

  <div class="sect"><h2>The model — weights and what each area stands in for</h2>
    <table><tr><th>Area</th><th class="n">Weight</th><th class="n">Scope mean score</th><th>PACE items this area is proxying</th></tr>${weightsHtml}</table>
    <p class="note">${esc(res.method?.composite || '')}</p>
    <p class="note">${esc(res.method?.subScore || '')} ${esc(res.method?.metricScore || '')}</p>
  </div>

  <div class="sect"><h2>Scope summary — contribution points / area score</h2>
    <table><tr><th>Store</th><th class="n">Readiness</th><th>Band</th><th class="n">Speed</th><th class="n">Accuracy</th><th class="n">Quality</th><th class="n">Leadership</th><th class="n">Coverage</th><th>Food safety</th><th>Last actual visit</th></tr>${summaryRows}</table>
    <p class="note">Each area cell shows the <b>points that area contributed</b> to the store's readiness, then its raw area score. The four contribution figures add up to the readiness in column 2 — that is the whole composite, nothing hidden.</p>
  </div>

  ${calibrationHtml(res.calibration, stores)}

  ${detail === 'full' ? `<div><h2>Per-store calibration audit</h2>${stores.map(storeAuditHtml).join('')}</div>` : ''}

  <div class="sect"><h2>Where the numbers come from</h2>
    <table><tr><th>ds source</th><th>System</th><th>Report</th><th>Table</th><th>Feed</th></tr>${sourceHtml || '<tr><td colspan="5" class="tiny">No source resolved.</td></tr>'}</table>
    ${manualFeeds.length ? `<p class="gapline"><b>${manualFeeds.length} of these feeds are manual uploads</b> (${esc(manualFeeds.map(f => f.report).join('; '))}). Manual data is only as current as the last upload on the device that made it — treat any metric sourced from them as "as of" the date shown in the metric detail, not as live.</p>` : ''}
    <p class="note">${esc(res.method?.dailyWindow || '')} ${esc(res.method?.monthlyWindow || '')}</p>
  </div>

  <div class="sect"><h2>Declared coverage gaps — what this score does NOT cover</h2>
    <table><tr><th>Area</th><th>PACE item</th><th>Status</th><th>Detail</th></tr>${gapsHtml}</table>
    ${ecoNote}
  </div>`}

  <div class="foot">Meridian · Visit Readiness is a directional early warning built from daily operating metrics — Speed 35% · Accuracy 30% · Quality 20% · Leadership 15%, each metric graded against that store's own target where one exists, otherwise the McDonald's standard. It is <b>not</b> an official predicted visit score and it does not cover Cleanliness, Health &amp; Safety, or food-safety criticals. Generated ${esc(res.method?.generatedAt || '')}.</div>
  </body></html>`;
}
