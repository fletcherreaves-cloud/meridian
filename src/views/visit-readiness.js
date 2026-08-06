// @ts-nocheck
// ── Visit Readiness panel ─────────────────────────────────────────────────────
// Per-store readiness for a PACE graded visit (CFV / RGRV / EcoSure), from the
// operational metrics Meridian tracks daily. Ranked most-at-risk first so the owner
// coaches the right stores before the (mostly unannounced) visit. Transparent: every
// score shows its driving metrics (actual vs the store's own target).
import * as React from 'react';
import { computeVisitReadiness, analyzeGradedVisits, srcMeta } from '../engine/visit-readiness.js';
import { readinessReportHTML, readinessAuditCSV, reportFileBase, fmtMetric } from './visit-readiness-report.js';
import { STORE_NAMES, INV_ORG_COORDS, sNameC, supervisorGroups } from '../constants.js';

const h = React.createElement;
const sName = loc => STORE_NAMES?.[String(loc)] || ('Store ' + loc);
const BAND = { 'ready': { c: '#10b981', l: 'Ready' }, 'watch': { c: '#f59e0b', l: 'Watch' }, 'at-risk': { c: '#ef4444', l: 'At risk' } };
const FS = { low: { c: '#10b981', l: 'FS low' }, watch: { c: '#f59e0b', l: 'FS watch' }, elevated: { c: '#ef4444', l: 'FS elevated' }, unknown: { c: '#6b7280', l: 'FS n/a' } };

// One formatter for screen, print and CSV (imported from the report module) so a value
// never reads differently depending on where you looked at it.
const fmt = fmtMetric;
const scoreColor = s => s == null ? '#6b7280' : s >= 85 ? '#10b981' : s >= 70 ? '#f59e0b' : '#ef4444';
const pct2 = v => v == null ? '—' : (v * 100).toFixed(2) + '%';

// Push a built report to the browser: print window for HTML, download for CSV.
function openPrint(html) {
  const win = window.open('', '_blank', 'width=980,height=800');
  if (!win) { alert('Allow pop-ups to print this report.'); return; }
  win.document.write(html); win.document.close(); win.focus();
  setTimeout(() => win.print(), 350);
}
function downloadCsv(text, filename) {
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click(); URL.revokeObjectURL(url);
}

// ── Actionable per-store coaching report (Notes 23 #10 / Notes 25) ─────────────
// A print/PDF one-pager the owner can send a store: where it stands, WHY, and the
// specific corrections ranked by impact. Matches the app's workbook aesthetic.
function storeReportHTML(s) {
  const esc = t => String(t == null ? '' : t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const b = BAND[s.band], fs = FS[s.fsFlag];
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  // Score breakdown doubles as the calibration trail: nominal weight, the effective
  // weight after renormalizing over the areas that had data, and the points contributed.
  const subRow = (a) => `<tr${a.excluded ? ' style="color:#aaa"' : ''}><td>${esc(a.label)}</td>
      <td class="n">${(a.weight * 100).toFixed(2)}%</td>
      <td class="n">${a.excluded ? '0.00% (dropped)' : (a.effWeight * 100).toFixed(2) + '%'}</td>
      <td class="n" style="color:${scoreColor(a.score)};font-weight:700">${a.score == null ? '—' : a.score.toFixed(1)}</td>
      <td class="n"><b>${a.contribution == null ? '—' : a.contribution.toFixed(2)}</b></td>
      <td>${a.excluded ? 'no data — weight redistributed' : esc((a.drivers || []).map(d => d.label.split('(')[0].trim()).join(', '))}</td></tr>`;
  const driverRow = d => {
    const good = d.score >= 0.85;
    const m = srcMeta(d.source);
    return `<tr><td>${esc(d.label)}</td><td class="n">${esc(fmt(d.actual, d.unit))}</td><td class="n">${esc(fmt(d.target, d.unit))}</td>
      <td class="sm">${esc(d.basis?.label || '')} · ${esc(d.basis?.ref || '')}</td>
      <td class="sm">${esc(d.toleranceLabel || '')}, 0 at ${esc(fmt(d.zeroAt, d.unit))}</td>
      <td class="n">${d.score == null ? '—' : d.score.toFixed(3)}</td>
      <td class="sm">${esc(m.system)} · ${esc(m.report)} (${esc(m.feed)})<br>${d.monthly ? 'latest month' : (d.obs + ' days')} · as of ${esc(d.asOf || '—')}</td>
      <td class="${good ? 'ok' : d.score >= 0.6 ? 'warn' : 'bad'}">${good ? 'On target' : d.score >= 0.6 ? 'Close' : 'Off target'}</td></tr>`;
  };
  const contribTotal = (s.audit || []).reduce((t, a) => t + (a.contribution || 0), 0);
  const notMeasured = (s.notMeasured || []).length
    ? `<div class="gap"><b>Not measured (${s.notMeasured.length})</b> — excluded from the area means above, never estimated:
        <ul>${s.notMeasured.map(mi => `<li>${esc(mi.label)} — ${esc(mi.reason)}</li>`).join('')}</ul></div>` : '';
  // Recommended focus = the worst 3 drivers, phrased as actions.
  const focus = (s.topDrivers || []).filter(d => d.score < 0.85).slice(0, 3)
    .map(d => `<li><b>${esc(d.label.split('(')[0].trim())}</b> — currently ${esc(fmt(d.actual, d.unit))}, target ${esc(fmt(d.target, d.unit))}. Close this gap to lift readiness.</li>`).join('');
  const lv = s.lastVisit ? `Last actual visit: ${esc(s.lastVisit.type || 'visit')} ${s.lastVisit.score.toFixed(2)}%${s.lastVisit.pass === false ? ' (did not pass)' : s.lastVisit.pass ? ' (pass)' : ''}${s.lastVisit.dateISO ? ' · ' + esc(s.lastVisit.dateISO) : ''}` : 'No recent actual graded visit on record.';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Visit Readiness coaching report — ${esc(sName(s.loc))} — ${new Date().toISOString().slice(0, 10)}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#111;max-width:860px;margin:32px auto;font-size:12px;line-height:1.5}
    h1{font-size:20px;margin:0 0 2px}.sub{color:#666;font-size:11px;margin-bottom:14px}
    .score{display:inline-block;font-size:34px;font-weight:800;color:${b.c};line-height:1}
    .band{display:inline-block;padding:3px 10px;border-radius:5px;color:#fff;background:${b.c};font-weight:700;font-size:12px;vertical-align:super;margin-left:8px}
    .fs{display:inline-block;padding:2px 8px;border-radius:5px;font-weight:700;font-size:11px;margin-left:6px;border:1px solid ${fs.c};color:${fs.c}}
    .why{background:#fff8e1;border:1px solid #f5bc00;border-radius:6px;padding:10px 12px;margin:12px 0}
    h2{font-size:14px;border-bottom:2px solid #f5bc00;padding-bottom:4px;margin:20px 0 8px}
    table{border-collapse:collapse;width:100%;margin:6px 0}th{background:#f5bc00;color:#111;text-align:left;padding:5px 9px;font-size:11px}
    td{border:1px solid #ddd;padding:5px 9px}.n{text-align:right;font-variant-numeric:tabular-nums}
    td.ok{color:#0a7d38;font-weight:700}td.warn{color:#b26a00;font-weight:700}td.bad{color:#c0261b;font-weight:700}
    td.sm{font-size:9px;color:#666;line-height:1.35}tr.tot td{border-top:1.5px solid #111;background:#fffaea}
    .gap{border:1px solid #e0c9a0;background:#fdf7ee;border-radius:5px;padding:7px 10px;margin:8px 0;font-size:10px}
    .gap ul{margin:4px 0 0 16px;padding:0}
    ol{margin:6px 0 6px 18px}li{margin:4px 0}.foot{color:#888;font-size:10px;margin-top:18px;border-top:1px solid #eee;padding-top:8px}
    @media print{body{margin:16px}}
  </style></head><body>
    <h1>${esc(sName(s.loc))} <span style="color:#999;font-weight:400;font-size:13px">#${esc(s.loc)}</span></h1>
    <div class="sub">Visit Readiness coaching report · ${date}</div>
    <div><span class="score">${Math.round(s.readiness)}</span><span class="band">${b.l}</span><span class="fs">${fs.l.replace('FS', 'Food safety:')}</span>
      ${s.coverage < 1 ? `<span style="color:#999;font-size:11px;margin-left:8px">${(s.coverage * 100).toFixed(2)}% data coverage</span>` : ''}</div>
    <div class="why"><b>Why:</b> ${esc(s.why || '')}</div>
    <h2>Recommended focus</h2>
    ${focus ? `<ol>${focus}</ol>` : '<p>No material gaps — hold the standard and stay visit-ready.</p>'}
    <h2>How this score was built</h2>
    <table><tr><th>Area</th><th>Nominal weight</th><th>Effective weight</th><th>Area score</th><th>Contribution</th><th>Measured on</th></tr>
      ${(s.audit || []).map(subRow).join('')}
      <tr class="tot"><td colspan="4">Readiness = Σ contributions</td><td class="n"><b>${contribTotal.toFixed(2)}</b></td><td class="sm">reported ${s.readiness.toFixed(1)} (±0.01 rounding)</td></tr></table>
    <p style="font-size:10px;color:#666;margin:2px 0 0">Effective weight = nominal weight ÷ the sum of the nominal weights of the areas that had data. Only areas with data are scored; their weight is redistributed, and the data-coverage figure above is that ratio.</p>
    <h2>Metric detail — actual, target, and where each number came from</h2>
    <table><tr><th>Metric</th><th>Actual</th><th>Target</th><th>Target basis</th><th>Tolerance</th><th>Score</th><th>Source / freshness</th><th>Status</th></tr>
      ${(s.audit || []).flatMap(a => (a.drivers || [])).map(driverRow).join('') || '<tr><td colspan="8">No metric resolved for this store.</td></tr>'}</table>
    ${notMeasured}
    <p style="margin-top:10px">${lv}</p>
    <div class="foot">Meridian · Readiness is a directional early-warning from daily operating metrics (Speed 35 / Accuracy 30 / Quality 20 / Leadership 15), each scored against this store's own target where one exists — not an official predicted visit score. Cleanliness, Health &amp; Safety and food-safety criticals have no daily-data proxy and are excluded; the food-safety flag shown above is a waste/holding proxy only. Printed ${new Date().toISOString().slice(0, 10)}.</div>
  </body></html>`;
}
function printStoreReport(s) {
  const win = window.open('', '_blank', 'width=820,height=760');
  if (!win) return;
  win.document.write(storeReportHTML(s));
  win.document.close(); win.focus();
  setTimeout(() => win.print(), 350);
}

function Bar({ score, w = 60 }) {
  return h('div', { style: { width: w, height: 6, borderRadius: 3, background: 'var(--bdr)', overflow: 'hidden', display: 'inline-block', verticalAlign: 'middle' } },
    h('div', { style: { width: (score == null ? 0 : Math.max(2, score)) + '%', height: '100%', background: scoreColor(score) } }));
}

function StoreRow({ s, expanded, onToggle }) {
  const b = BAND[s.band]; const fs = FS[s.fsFlag];
  const sub = (label, sc) => h('div', { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text3)' } },
    h('span', { style: { width: 62, textAlign: 'right' } }, label), h(Bar, { score: sc, w: 54 }),
    h('span', { style: { fontFamily: 'var(--mono)', color: scoreColor(sc), width: 26 } }, sc == null ? '—' : Math.round(sc)));
  return h('div', { style: { borderTop: '.5px solid rgba(255,255,255,.05)' } },
    h('div', { onClick: onToggle, style: { display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', cursor: 'pointer', flexWrap: 'wrap' } },
      h('div', { style: { width: 44, textAlign: 'center' } },
        h('div', { style: { fontSize: 19, fontWeight: 900, fontFamily: 'var(--mono)', color: b.c, lineHeight: 1 } }, Math.round(s.readiness)),
        h('div', { style: { fontSize: 7, color: 'var(--text3)', textTransform: 'uppercase' } }, 'ready')),
      h('div', { style: { flex: 1, minWidth: 150 } },
        h('div', { style: { fontSize: 12, fontWeight: 700 } }, sName(s.loc)),
        h('div', { style: { display: 'flex', gap: 6, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' } },
          h('span', { style: { fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4, color: b.c, background: b.c + '22' } }, b.l),
          h('span', { style: { fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, color: fs.c, background: fs.c + '18' } }, fs.l),
          s.coverage < 1 && h('span', { style: { fontSize: 9, color: 'var(--text3)' } }, (s.coverage * 100).toFixed(2) + '% data'),
          s.lastVisit && h('span', { style: { fontSize: 9, color: 'var(--text3)' } }, `last ${s.lastVisit.type || 'visit'} ${s.lastVisit.score.toFixed(2)}%${s.lastVisit.pass === false ? ' ✗' : ''}`))),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
        sub('Speed', s.subs.speed.score), sub('Accuracy', s.subs.accuracy.score),
        sub('Quality', s.subs.quality.score), sub('Leadership', s.subs.leadership.score)),
      h('span', { style: { color: 'var(--text3)', fontSize: 11 } }, expanded ? '▲' : '▼')),
    expanded && h('div', { style: { padding: '4px 12px 12px 56px' } },
      h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 9 } },
        s.why && h('div', { style: { flex: 1, fontSize: 11, color: 'var(--text)', lineHeight: 1.5, padding: '8px 10px', background: b.c + '10', border: '.5px solid ' + b.c + '33', borderRadius: 6 } },
          h('span', { style: { fontWeight: 700, color: b.c } }, 'Why: '), s.why),
        h('button', { className: 'btn btn-sm', title: 'Print / PDF a coaching one-pager for this store', style: { fontSize: 10, flexShrink: 0, whiteSpace: 'nowrap' }, onClick: (e) => { e.stopPropagation(); printStoreReport(s); } }, '📄 Coaching report')),
      h('div', { style: { fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 } }, 'Top risk drivers (actual vs target)'),
      s.topDrivers.map(d => h('div', { key: d.key, style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '2px 0' } },
        h('span', { style: { flex: 1, color: 'var(--text2)' } }, d.label),
        h('span', { style: { fontFamily: 'var(--mono)', color: scoreColor(d.score * 100) } }, fmt(d.actual, d.unit)),
        h('span', { style: { fontSize: 9, color: 'var(--text3)' } }, 'tgt ' + fmt(d.target, d.unit)),
        h(Bar, { score: d.score * 100, w: 44 }))),
      !s.topDrivers.length && h('div', { style: { fontSize: 11, color: 'var(--text3)' } }, 'No metric data loaded for this store.'),
      h(StoreAudit, { s })));
}

// ── On-screen calibration audit (metric-provenance directive) ─────────────────
// The composite made re-derivable without leaving the panel: per area its nominal
// weight, the effective weight after renormalizing over the areas that had data, the
// area score and the points it contributed (Σ = readiness), then every metric with the
// target it was graded against, HOW that target was resolved, the tolerance, the source
// feed and the as-of date — plus everything that could NOT be measured.
function StoreAudit({ s }) {
  const { useState } = React;
  const [open, setOpen] = useState(false);
  const th = { textAlign: 'left', fontSize: 8.5, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', padding: '3px 6px', fontWeight: 700 };
  const td = { fontSize: 10, padding: '3px 6px', borderTop: '.5px solid var(--bdr)', verticalAlign: 'top' };
  const tdN = { ...td, textAlign: 'right', fontFamily: 'var(--mono)' };
  const total = (s.audit || []).reduce((t, a) => t + (a.contribution || 0), 0);
  return h('div', { style: { marginTop: 10, border: '.5px solid var(--bdr)', borderRadius: 6, overflow: 'hidden' } },
    h('div', { onClick: (e) => { e.stopPropagation(); setOpen(o => !o); },
      style: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 9px', cursor: 'pointer', background: 'var(--surf2)' } },
      h('span', { style: { fontSize: 10, fontWeight: 800, color: 'var(--text2)' } }, '🔬 Calibration — how this score was built'),
      h('span', { style: { flex: 1, fontSize: 9, color: 'var(--text3)' } }, 'weights, contributions, every target + source'),
      h('span', { style: { fontSize: 10, color: 'var(--text3)' } }, open ? '▲' : '▼')),
    open && h('div', { style: { padding: '8px 9px' } },
      h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
        h('tbody', null,
          h('tr', null, h('th', { style: th }, 'Area'), h('th', { style: { ...th, textAlign: 'right' } }, 'Weight'),
            h('th', { style: { ...th, textAlign: 'right' } }, 'Eff. weight'), h('th', { style: { ...th, textAlign: 'right' } }, 'Score'),
            h('th', { style: { ...th, textAlign: 'right' } }, 'Contribution'), h('th', { style: th }, 'Measured on')),
          ...(s.audit || []).map(a => h('tr', { key: a.key, style: a.excluded ? { opacity: .55 } : null },
            h('td', { style: td }, a.label),
            h('td', { style: tdN }, pct2(a.weight)),
            h('td', { style: tdN }, a.excluded ? '0.00%' : pct2(a.effWeight)),
            h('td', { style: { ...tdN, color: scoreColor(a.score), fontWeight: 700 } }, a.score == null ? '—' : a.score.toFixed(1)),
            h('td', { style: { ...tdN, fontWeight: 800 } }, a.contribution == null ? '—' : a.contribution.toFixed(2)),
            h('td', { style: { ...td, fontSize: 9, color: 'var(--text3)' } },
              a.excluded ? 'no data — weight redistributed to the other areas'
                : (a.drivers || []).map(d => d.label.split('(')[0].trim()).join(', ')))),
          h('tr', null,
            h('td', { style: { ...td, borderTop: '1px solid var(--bdr2)', fontWeight: 700 }, colSpan: 4 }, 'Readiness = Σ contributions'),
            h('td', { style: { ...tdN, borderTop: '1px solid var(--bdr2)', fontWeight: 800, color: 'var(--amber)' } }, total.toFixed(2)),
            h('td', { style: { ...td, borderTop: '1px solid var(--bdr2)', fontSize: 9, color: 'var(--text3)' } }, 'reported ' + s.readiness.toFixed(1) + ' (±0.01 rounding)')))),
      h('div', { style: { fontSize: 8.5, color: 'var(--text3)', margin: '6px 0 8px', lineHeight: 1.5 } },
        'Effective weight = nominal weight ÷ the summed nominal weights of the areas that had data. Data coverage (', pct2(s.coverage), ') is that same ratio.'),
      h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
        h('tbody', null,
          h('tr', null, h('th', { style: th }, 'Metric'), h('th', { style: { ...th, textAlign: 'right' } }, 'Actual'),
            h('th', { style: { ...th, textAlign: 'right' } }, 'Target'), h('th', { style: th }, 'Target basis'),
            h('th', { style: th }, 'Tolerance'), h('th', { style: { ...th, textAlign: 'right' } }, 'Score'), h('th', { style: th }, 'Source · as of')),
          ...(s.audit || []).flatMap(a => (a.drivers || []).map(d => {
            const m = srcMeta(d.source);
            return h('tr', { key: a.key + d.key },
              h('td', { style: td }, d.label),
              h('td', { style: tdN }, fmt(d.actual, d.unit)),
              h('td', { style: tdN }, fmt(d.target, d.unit)),
              h('td', { style: { ...td, fontSize: 9, color: 'var(--text3)' } }, d.basis?.label, h('br'), h('span', { style: { fontFamily: 'var(--mono)' } }, d.basis?.ref)),
              h('td', { style: { ...td, fontSize: 9, color: 'var(--text3)' } }, d.toleranceLabel, h('br'), '0 at ' + fmt(d.zeroAt, d.unit)),
              h('td', { style: { ...tdN, color: scoreColor(d.score * 100) } }, d.score.toFixed(3)),
              h('td', { style: { ...td, fontSize: 9, color: 'var(--text3)' } },
                m.system + ' · ' + m.report, h('br'),
                h('span', { style: { fontFamily: 'var(--mono)' } }, m.table),
                h('span', { style: { marginLeft: 4, padding: '0 4px', borderRadius: 3, fontSize: 8, fontWeight: 700, textTransform: 'uppercase', background: m.feed === 'manual' ? 'rgba(245,188,0,.18)' : 'rgba(16,185,129,.16)', color: m.feed === 'manual' ? '#f5bc00' : '#10b981' } }, m.feed),
                h('br'), (d.monthly ? 'latest month' : d.obs + ' days') + ' · as of ' + (d.asOf || '—')));
          })))),
      !!(s.notMeasured || []).length && h('div', { style: { marginTop: 8, padding: '7px 9px', border: '.5px solid rgba(245,188,0,.3)', background: 'rgba(245,188,0,.06)', borderRadius: 6 } },
        h('div', { style: { fontSize: 9.5, fontWeight: 800, color: '#f5bc00', marginBottom: 3 } }, 'Not measured (' + s.notMeasured.length + ') — dropped from the area means, never estimated'),
        s.notMeasured.map(mi => h('div', { key: mi.key + mi.label, style: { fontSize: 9, color: 'var(--text3)', lineHeight: 1.5 } }, '• ', mi.label, ' — ', mi.reason))),
      h('div', { style: { marginTop: 8, fontSize: 9, color: 'var(--text3)', lineHeight: 1.5 } },
        h('b', null, 'Food-safety flag: '), FS[s.fsFlag].l.replace('FS', ''), s.fsScore != null ? ' (' + s.fsScore.toFixed(1) + ')' : '',
        ' — built from ', (s.fsDrivers || []).map(d => d.label + ' ' + fmt(d.actual, d.unit) + ' vs ' + fmt(d.target, d.unit)).join(', ') || 'no data',
        '. Deliberately kept OUT of the readiness composite: cook-temp and pest criticals are not inferable from operating data.')));
}

// Model-check card: does predicted readiness track the ACTUAL graded-visit scores?
// Builds trust by validating the estimate against real outcomes as they accumulate.
function CalibrationCard({ cal }) {
  if (!cal) return null;
  const strengthCol = cal.strength === 'strong' ? '#10b981' : cal.strength === 'moderate' ? '#f59e0b' : '#ef4444';
  if (!cal.n || cal.n < 3) {
    return h('div', { style: { fontSize: 10, color: 'var(--text3)', lineHeight: 1.5, margin: '0 0 12px', padding: '9px 12px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
      h('span', { style: { fontWeight: 700, color: 'var(--text2)' } }, 'Model check: '),
      `only ${cal.n || 0} store${cal.n === 1 ? '' : 's'} with a recent graded visit — not enough yet to validate the estimate. It self-checks against actual CFV/RGR/EcoSure scores as they land.`);
  }
  const rC = cal.r == null ? 'var(--text3)' : cal.r >= 0.3 ? '#10b981' : cal.r <= -0.1 ? '#ef4444' : '#f59e0b';
  return h('div', { style: { margin: '0 0 12px', padding: '10px 12px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
    h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 } },
      h('span', { style: { fontSize: 11, fontWeight: 800, color: 'var(--text)' } }, 'Model check'),
      h('span', { style: { fontSize: 10, color: 'var(--text3)' } }, `predicted readiness vs actual visit score, ${cal.n} stores with a recent visit`)),
    h('div', { style: { display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' } },
      h('div', null,
        h('span', { style: { fontSize: 19, fontWeight: 800, fontFamily: 'var(--mono)', color: rC } }, cal.r == null ? '—' : cal.r.toFixed(2)),
        h('span', { style: { fontSize: 9, color: 'var(--text3)', marginLeft: 5 } }, 'rank corr' + (cal.strength ? ' (' + cal.strength + ')' : ''))),
      cal.hitRate != null && h('div', null,
        h('span', { style: { fontSize: 19, fontWeight: 800, fontFamily: 'var(--mono)', color: cal.hitRate >= 0.6 ? '#10b981' : '#f59e0b' } }, (cal.hitRate * 100).toFixed(2) + '%'),
        h('span', { style: { fontSize: 9, color: 'var(--text3)', marginLeft: 5 } }, `direction match (${cal.hits}/${cal.n})`)),
      h('div', { style: { flex: 1, minWidth: 180, fontSize: 9.5, color: 'var(--text3)', lineHeight: 1.5 } },
        cal.r == null ? 'Correlation needs more visits.'
          : cal.r >= 0.6 ? 'Strong agreement — stores rated lower really do score lower on real visits.'
          : cal.r >= 0.3 ? 'Moderate agreement — the estimate leans the right way; keep validating.'
          : cal.r >= 0 ? 'Weak agreement so far — treat as directional only.'
          : 'Estimate is currently inverted vs actuals — investigate before trusting it.')));
}

// CFV / graded-visit statistic tracker (Notes 25 #2): actual outcomes broken down by
// known variables (day-of-week, daypart, weekpart, channel) + per-store cadence.
function VisitPatterns({ ds, locs }) {
  const { useMemo, useState } = React;
  const [type, setType] = useState('all');
  const [open, setOpen] = useState(false);
  // Scoped to the same store set as the readiness table above, so the pattern counts
  // can't disagree with the scope shown in the header.
  const gv = useMemo(() => {
    const all = ds?.gradedVisits || ds?.graded_visits || [];
    if (!Array.isArray(locs) || !locs.length) return all;
    const want = new Set(locs.map(l => String(l).replace(/^0+/, '')));
    return all.filter(v => want.has(String(v.store ?? v.loc ?? '').replace(/^0+/, '')));
  }, [ds, locs]);
  const a = useMemo(() => analyzeGradedVisits(gv, { type }), [gv, type]);
  if (!gv.length) return null;
  const pr = v => v == null ? '—' : (v * 100).toFixed(2) + '%';
  const prCol = v => v == null ? '#6b7280' : v >= 0.85 ? '#10b981' : v >= 0.6 ? '#f59e0b' : '#ef4444';
  const bar = (v, col) => h('div', { style: { width: 46, height: 5, borderRadius: 3, background: 'var(--bdr)', display: 'inline-block', verticalAlign: 'middle' } },
    h('div', { style: { width: (v == null ? 0 : Math.max(2, v * 100)) + '%', height: '100%', background: col, borderRadius: 3 } }));
  // A labeled breakdown block: rows of {key, n, passRate, avgScore}.
  const block = (title, rows) => rows.length ? h('div', { style: { flex: '1 1 220px', minWidth: 200 } },
    h('div', { style: { fontSize: 9, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 } }, title),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
      ...rows.map(r => h('div', { key: r.key, style: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 10.5 } },
        h('span', { style: { flex: 1, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, r.key),
        h('span', { style: { color: 'var(--text3)', width: 30, textAlign: 'right', fontFamily: 'var(--mono)' } }, 'n' + r.n),
        bar(r.passRate, prCol(r.passRate)),
        h('span', { style: { fontFamily: 'var(--mono)', color: prCol(r.passRate), width: 34, textAlign: 'right' } }, pr(r.passRate)),
        h('span', { style: { fontFamily: 'var(--mono)', color: 'var(--text3)', width: 34, textAlign: 'right' } }, r.avgScore == null ? '—' : r.avgScore))))) : null;
  return h('div', { style: { border: '.5px solid var(--bdr)', borderRadius: 8, marginTop: 14, overflow: 'hidden' } },
    h('div', { onClick: () => setOpen(o => !o), style: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer', background: 'var(--surf2)' } },
      h('span', { style: { fontSize: 13 } }, '📊'),
      h('div', { style: { flex: 1 } },
        h('div', { style: { fontSize: 12, fontWeight: 700 } }, 'Visit Patterns',
          h('span', { style: { fontSize: 10, color: 'var(--text3)', fontWeight: 500, marginLeft: 6 } }, a.overall.n + ' actual visits · ' + pr(a.overall.passRate) + ' pass' + (a.overall.avgScore != null ? ' · avg ' + a.overall.avgScore : ''))),
        h('div', { style: { fontSize: 9, color: 'var(--text3)' } }, 'Actual CFV/RGR outcomes by day-of-week, daypart, channel + per-store cadence')),
      h('span', { style: { color: 'var(--text3)', fontSize: 11 } }, open ? '▲' : '▼')),
    open && h('div', { style: { padding: '10px 12px' } },
      // Type filter
      h('div', { style: { display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' } },
        ...['all', ...a.types].map(t => h('button', { key: t, onClick: () => setType(t),
          style: { padding: '2px 9px', borderRadius: 99, fontSize: 10, fontWeight: 700, cursor: 'pointer',
            border: '1px solid ' + (type === t ? 'var(--amber)' : 'var(--bdr)'),
            background: type === t ? 'rgba(245,188,0,.14)' : 'var(--surf)', color: type === t ? 'var(--amber)' : 'var(--text3)' } },
          t === 'all' ? 'All types' : t))),
      h('div', { style: { fontSize: 8.5, color: 'var(--text3)', marginBottom: 8, fontFamily: 'var(--mono)' } }, 'columns: n · pass-rate · avg-score'),
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 18 } },
        block('Day of week', a.dow), block('Daypart', a.daypart), block('Weekpart', a.weekpart), block('Channel', a.channel)),
      a.freq.length ? h('div', { style: { marginTop: 14 } },
        h('div', { style: { fontSize: 9, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 } }, 'Frequency by store (visits · avg days between · days since last · pass)'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
          ...a.freq.map(f => h('div', { key: f.store, style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5 } },
            h('span', { style: { flex: 1, color: 'var(--text2)' } }, sName(f.store)),
            h('span', { style: { fontFamily: 'var(--mono)', color: 'var(--text3)', width: 24, textAlign: 'right' } }, f.n),
            h('span', { style: { fontFamily: 'var(--mono)', color: 'var(--text3)', width: 42, textAlign: 'right' } }, f.avgGapDays == null ? '—' : f.avgGapDays + 'd'),
            h('span', { style: { fontFamily: 'var(--mono)', color: f.daysSinceLast != null && f.daysSinceLast > 60 ? '#f59e0b' : 'var(--text3)', width: 42, textAlign: 'right' } }, f.daysSinceLast == null ? '—' : f.daysSinceLast + 'd'),
            h('span', { style: { fontFamily: 'var(--mono)', color: prCol(f.passRate), width: 40, textAlign: 'right' } }, pr(f.passRate)))))) : null));
}

// Declared coverage gaps + the source index. Printed identically in the report — the
// point is that the panel never implies PACE coverage it does not have. Nothing here is
// estimated or filled with a placeholder; a gap is shown AS a gap.
function CoverageGaps({ res }) {
  const { useState } = React;
  const [open, setOpen] = useState(false);
  const feeds = (res.sourcesUsed || []).map(k => ({ k, ...srcMeta(k) }));
  const manual = feeds.filter(f => f.feed === 'manual');
  return h('div', { style: { border: '.5px solid var(--bdr)', borderRadius: 8, marginTop: 14, overflow: 'hidden' } },
    h('div', { onClick: () => setOpen(o => !o), style: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer', background: 'var(--surf2)' } },
      h('span', { style: { fontSize: 13 } }, '⚠'),
      h('div', { style: { flex: 1 } },
        h('div', { style: { fontSize: 12, fontWeight: 700 } }, 'Coverage & data gaps',
          h('span', { style: { fontSize: 10, color: 'var(--text3)', fontWeight: 500, marginLeft: 6 } },
            (res.gaps || []).length + ' PACE areas not covered · ' + feeds.length + ' feeds used' + (manual.length ? ' (' + manual.length + ' manual)' : ''))),
        h('div', { style: { fontSize: 9, color: 'var(--text3)' } }, 'What this score does NOT cover, and exactly where every number came from')),
      h('span', { style: { color: 'var(--text3)', fontSize: 11 } }, open ? '▲' : '▼')),
    open && h('div', { style: { padding: '10px 12px' } },
      ...(res.gaps || []).map(g => h('div', { key: g.area, style: { padding: '6px 0', borderTop: '.5px solid var(--bdr)' } },
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' } },
          h('span', { style: { fontSize: 11, fontWeight: 700, color: 'var(--text)' } }, g.area),
          h('span', { style: { fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, color: '#f59e0b', background: 'rgba(245,158,11,.14)' } }, g.status),
          h('span', { style: { fontSize: 9, color: 'var(--text3)' } }, g.pace)),
        h('div', { style: { fontSize: 9.5, color: 'var(--text3)', lineHeight: 1.55, marginTop: 2 } }, g.detail))),
      !res.hasEcoSure && h('div', { style: { marginTop: 8, padding: '7px 9px', borderLeft: '2px solid #ef4444', background: 'rgba(239,68,68,.07)', fontSize: 9.5, color: 'var(--text2)', lineHeight: 1.5 } },
        h('b', null, 'No EcoSure / third-party food-safety result is loaded. '),
        'Graded-visit types on record: ' + ((res.visitTypes || []).join(', ') || 'none') + '. The estimate has never been validated against a food-safety outcome.'),
      h('div', { style: { marginTop: 10, fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 } }, 'Sources resolved this run'),
      ...feeds.map(f => h('div', { key: f.k, style: { display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 9.5, padding: '2px 0', flexWrap: 'wrap' } },
        h('span', { style: { fontFamily: 'var(--mono)', color: 'var(--text2)', minWidth: 108 } }, f.k),
        h('span', { style: { color: 'var(--text3)', flex: 1 } }, f.system + ' · ' + f.report),
        h('span', { style: { fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' } }, f.table),
        h('span', { style: { fontSize: 8, fontWeight: 700, textTransform: 'uppercase', padding: '0 5px', borderRadius: 3, background: f.feed === 'manual' ? 'rgba(245,188,0,.18)' : 'rgba(16,185,129,.16)', color: f.feed === 'manual' ? '#f5bc00' : '#10b981' } }, f.feed))),
      !!manual.length && h('div', { style: { marginTop: 6, fontSize: 9, color: '#f5bc00', lineHeight: 1.5 } },
        '⚠ ' + manual.length + ' of these are manual uploads — only as current as the last upload on the device that made it. Check the per-metric "as of" dates in each store\'s Calibration block before acting.'),
      h('div', { style: { marginTop: 8, fontSize: 8.5, color: 'var(--text3)', lineHeight: 1.55 } },
        res.method?.dailyWindow, ' ', res.method?.monthlyWindow)));
}

export function VisitReadinessPanel({ ds, onClose, initialScope }) {
  const { useMemo, useState } = React;
  // Scope follows the app-wide selector standard (All → State → Patch → Store) and is
  // pushed INTO the engine, so the district rollup, the model check and the exported
  // report are all scoped consistently — never a screen filter over a district number.
  const [scope, setScope] = useState(initialScope || 'all');
  const groups = useMemo(() => { try { return supervisorGroups() || {}; } catch { return {}; } }, []);
  const locs = useMemo(() => {
    if (String(scope).startsWith('grp:')) return (groups[scope.slice(4)] || []).map(l => String(l).replace(/^0+/, ''));
    return Object.keys(STORE_NAMES).filter(l =>
      scope === 'all' ? true : scope === 'ok' ? (INV_ORG_COORDS[l] || {}).state === 'OK'
        : scope === 'fl' ? (INV_ORG_COORDS[l] || {}).state === 'FL' : l === scope);
  }, [scope, groups]);
  const scopeLabel = scope === 'all' ? 'All stores' : scope === 'ok' ? 'Oklahoma' : scope === 'fl' ? 'Florida'
    : String(scope).startsWith('grp:') ? ('Patch ' + scope.slice(4)) : (sNameC(scope) || sName(scope));
  const res = useMemo(() => computeVisitReadiness(ds, { locs }), [ds, locs]);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState('full');   // print: full per-store audit vs summary
  const d = res.district;

  const doPrint = () => openPrint(readinessReportHTML(res, { scopeLabel, detail }));
  const doCsv = () => downloadCsv(readinessAuditCSV(res, { scopeLabel }), reportFileBase(scopeLabel, 'audit') + '.csv');

  const stat = (label, val, col) => h('div', { style: { flex: '1 1 96px', minWidth: 90, background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, padding: '8px 12px' } },
    h('div', { style: { fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 } }, label),
    h('div', { style: { fontSize: 17, fontWeight: 800, fontFamily: 'var(--mono)', color: col || 'var(--text)' } }, val));

  return h('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 460, display: 'flex', flexDirection: 'column', paddingTop: 20 } },
    h('div', { style: { flex: '0 0 20px', cursor: 'pointer' }, onClick: onClose }),
    h('div', { style: { flex: 1, background: 'var(--surf)', maxWidth: 1080, margin: '0 auto', width: 'calc(100% - 24px)', borderRadius: 'var(--rl) var(--rl) 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -8px 40px rgba(0,0,0,.4)' } },
      h('div', { style: { padding: '10px 16px', borderBottom: '.5px solid var(--bdr)', flexShrink: 0, background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        h('span', { style: { fontSize: 18 } }, '🛡️'),
        h('div', { style: { flex: 1, minWidth: 200 } },
          h('div', { style: { fontSize: 14, fontWeight: 800 } }, 'Visit Readiness'),
          h('div', { style: { fontSize: 9, color: 'var(--text3)' } }, 'PACE graded-visit readiness (CFV / RGRV / EcoSure) from daily ops metrics · coach the at-risk stores before the visit')),
        h('button', { className: 'btn btn-sm', title: 'Print / PDF the Visit Readiness calibration report for this scope', style: { fontSize: 10 }, onClick: doPrint }, '🖨 Report'),
        h('button', { className: 'btn btn-sm', title: 'Download the full calibration audit — one row per store × area × metric, with targets, tolerances and sources', style: { fontSize: 10 }, onClick: doCsv }, '⬇ Audit CSV'),
        h('button', { className: 'btn btn-sm', style: { color: 'var(--text3)' }, onClick: onClose }, '✕')),

      // ── Scope + report options ──
      h('div', { style: { padding: '7px 16px', borderBottom: '.5px solid var(--bdr)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        h('div', { style: { display: 'flex', gap: 2, border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', overflow: 'hidden' } },
          ...[['all', 'All'], ['ok', 'OK'], ['fl', 'FL']].map(([v, l]) => h('button', { key: v, onClick: () => setScope(v),
            style: { padding: '3px 10px', border: 'none', fontSize: 10, cursor: 'pointer', background: scope === v ? 'var(--amber)' : 'transparent', color: scope === v ? '#000' : 'var(--text3)', fontWeight: scope === v ? 700 : 400 } }, l))),
        Object.keys(groups).length ? h('select', { value: String(scope).startsWith('grp:') ? scope : '', onChange: e => e.target.value && setScope(e.target.value), title: 'Supervisor patch',
          style: { fontSize: 10, padding: '3px 5px', background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)' } },
          h('option', { value: '' }, '— patch —'), Object.keys(groups).sort().map(g => h('option', { key: g, value: 'grp:' + g }, g))) : null,
        h('select', { value: STORE_NAMES[scope] ? scope : '', onChange: e => e.target.value && setScope(e.target.value), title: 'Single store',
          style: { fontSize: 10, padding: '3px 5px', background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)' } },
          h('option', { value: '' }, '— store —'),
          Object.keys(STORE_NAMES).sort((a, b) => (STORE_NAMES[a] || a).localeCompare(STORE_NAMES[b] || b)).map(l => h('option', { key: l, value: l }, sNameC(l) || sName(l)))),
        h('span', { style: { fontSize: 9.5, color: 'var(--text3)' } }, scopeLabel + ' · ' + (res.stores || []).length + ' with data'),
        h('span', { style: { flex: 1 } }),
        h('span', { style: { fontSize: 9, color: 'var(--text3)' } }, 'Report detail'),
        h('div', { style: { display: 'flex', gap: 2, border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', overflow: 'hidden' } },
          ...[['full', 'Full audit'], ['summary', 'Summary']].map(([v, l]) => h('button', { key: v, onClick: () => setDetail(v),
            style: { padding: '3px 9px', border: 'none', fontSize: 9.5, cursor: 'pointer', background: detail === v ? 'var(--amber)' : 'transparent', color: detail === v ? '#000' : 'var(--text3)', fontWeight: detail === v ? 700 : 400 } }, l)))),

      h('div', { style: { flex: 1, overflowY: 'auto', padding: '14px 16px' } },
        !d ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 } },
          h('div', { style: { fontSize: 26, marginBottom: 10 } }, '🛡️'),
          'No operational data loaded yet. Readiness reads your speed (OEPE/KVS/park), accuracy (SMG/refunds/T-Reds), waste, and labor metrics — sync or upload data and it fills in.')
        : h('div', null,
          h('div', { style: { fontSize: 11, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 14, padding: '10px 12px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
            'Readiness (0–100) is a weighted blend — ', h('b', null, 'Speed 35%'), ' · ', h('b', null, 'Accuracy 30%'), ' · ',
            h('b', null, 'Quality 20%'), ' · ', h('b', null, 'Leadership 15%'), ' — each metric scored against that store\'s own target. ',
            'Weighted toward the areas most heavily graded and most directly measured in your data. Food Safety is a separate risk flag (waste/holding proxies). ',
            h('b', null, 'This is an early-warning estimate, not a predicted score.')),

          h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 } },
            stat('District readiness', Math.round(d.readiness), scoreColor(d.readiness)),
            stat('At risk', d.atRisk, d.atRisk ? '#ef4444' : '#10b981'),
            stat('Watch', d.watch, '#f59e0b'),
            stat('FS elevated', d.fsElevated, d.fsElevated ? '#ef4444' : '#10b981'),
            stat('Speed', Math.round(d.subs.speed || 0), scoreColor(d.subs.speed)),
            stat('Accuracy', Math.round(d.subs.accuracy || 0), scoreColor(d.subs.accuracy))),

          h(CalibrationCard, { cal: res.calibration }),

          h('div', { style: { border: '.5px solid var(--bdr)', borderRadius: 8, overflow: 'hidden' } },
            res.stores.map(s => h(StoreRow, { key: s.loc, s, expanded: expanded === s.loc, onToggle: () => setExpanded(expanded === s.loc ? null : s.loc) }))),

          h(VisitPatterns, { ds, locs }),

          h(CoverageGaps, { res }),

          h('div', { style: { fontSize: 9, color: 'var(--text3)', lineHeight: 1.6, marginTop: 8 } },
            '⚙ ', res.gapNote, ' Scores are a directional early-warning from leading indicators, not a predicted visit percentage. Validate against actual CFV/RGR outcomes as they accumulate (shown per store when available).')))));
}
