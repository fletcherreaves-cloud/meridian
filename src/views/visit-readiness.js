// @ts-nocheck
// ── Visit Readiness panel ─────────────────────────────────────────────────────
// Per-store readiness for a PACE graded visit (CFV / RGRV / EcoSure), from the
// operational metrics Meridian tracks daily. Ranked most-at-risk first so the owner
// coaches the right stores before the (mostly unannounced) visit. Transparent: every
// score shows its driving metrics (actual vs the store's own target).
import * as React from 'react';
import { computeVisitReadiness, analyzeGradedVisits } from '../engine/visit-readiness.js';
import { STORE_NAMES } from '../constants.js';

const h = React.createElement;
const sName = loc => STORE_NAMES?.[String(loc)] || ('Store ' + loc);
const BAND = { 'ready': { c: '#10b981', l: 'Ready' }, 'watch': { c: '#f59e0b', l: 'Watch' }, 'at-risk': { c: '#ef4444', l: 'At risk' } };
const FS = { low: { c: '#10b981', l: 'FS low' }, watch: { c: '#f59e0b', l: 'FS watch' }, elevated: { c: '#ef4444', l: 'FS elevated' }, unknown: { c: '#6b7280', l: 'FS n/a' } };

const fmt = (v, unit) => {
  if (v == null) return '—';
  if (unit === 'pct') { const p = Math.abs(v) <= 1.5 ? v * 100 : v; return p.toFixed(p < 10 ? 2 : 1) + '%'; }
  if (unit === 's') return Math.round(v) + 's';
  if (unit === 'hrs') return v.toFixed(1) + 'h';
  return (Math.round(v * 10) / 10).toString();
};
const scoreColor = s => s == null ? '#6b7280' : s >= 85 ? '#10b981' : s >= 70 ? '#f59e0b' : '#ef4444';

// ── Actionable per-store coaching report (Notes 23 #10 / Notes 25) ─────────────
// A print/PDF one-pager the owner can send a store: where it stands, WHY, and the
// specific corrections ranked by impact. Matches the app's workbook aesthetic.
function storeReportHTML(s) {
  const esc = t => String(t == null ? '' : t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const b = BAND[s.band], fs = FS[s.fsFlag];
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const subRow = (label, sub) => {
    const sc = sub.score;
    return `<tr><td>${label}</td><td class="n" style="color:${scoreColor(sc)};font-weight:700">${sc == null ? '—' : Math.round(sc)}</td>
      <td>${(sub.drivers || []).map(d => esc(d.label.split('(')[0].trim())).join(', ') || '—'}</td></tr>`;
  };
  const driverRow = d => {
    const good = d.score >= 0.85;
    return `<tr><td>${esc(d.label)}</td><td class="n">${esc(fmt(d.actual, d.unit))}</td><td class="n">${esc(fmt(d.target, d.unit))}</td>
      <td class="${good ? 'ok' : d.score >= 0.6 ? 'warn' : 'bad'}">${good ? 'On target' : d.score >= 0.6 ? 'Close' : 'Off target'}</td></tr>`;
  };
  // Recommended focus = the worst 3 drivers, phrased as actions.
  const focus = (s.topDrivers || []).filter(d => d.score < 0.85).slice(0, 3)
    .map(d => `<li><b>${esc(d.label.split('(')[0].trim())}</b> — currently ${esc(fmt(d.actual, d.unit))}, target ${esc(fmt(d.target, d.unit))}. Close this gap to lift readiness.</li>`).join('');
  const lv = s.lastVisit ? `Last actual visit: ${esc(s.lastVisit.type || 'visit')} ${Math.round(s.lastVisit.score)}%${s.lastVisit.pass === false ? ' (did not pass)' : s.lastVisit.pass ? ' (pass)' : ''}${s.lastVisit.dateISO ? ' · ' + esc(s.lastVisit.dateISO) : ''}` : 'No recent actual graded visit on record.';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(sName(s.loc))} — Visit Readiness</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#111;max-width:760px;margin:32px auto;font-size:12px;line-height:1.5}
    h1{font-size:20px;margin:0 0 2px}.sub{color:#666;font-size:11px;margin-bottom:14px}
    .score{display:inline-block;font-size:34px;font-weight:800;color:${b.c};line-height:1}
    .band{display:inline-block;padding:3px 10px;border-radius:5px;color:#fff;background:${b.c};font-weight:700;font-size:12px;vertical-align:super;margin-left:8px}
    .fs{display:inline-block;padding:2px 8px;border-radius:5px;font-weight:700;font-size:11px;margin-left:6px;border:1px solid ${fs.c};color:${fs.c}}
    .why{background:#fff8e1;border:1px solid #f5bc00;border-radius:6px;padding:10px 12px;margin:12px 0}
    h2{font-size:14px;border-bottom:2px solid #f5bc00;padding-bottom:4px;margin:20px 0 8px}
    table{border-collapse:collapse;width:100%;margin:6px 0}th{background:#f5bc00;color:#111;text-align:left;padding:5px 9px;font-size:11px}
    td{border:1px solid #ddd;padding:5px 9px}.n{text-align:right;font-variant-numeric:tabular-nums}
    td.ok{color:#0a7d38;font-weight:700}td.warn{color:#b26a00;font-weight:700}td.bad{color:#c0261b;font-weight:700}
    ol{margin:6px 0 6px 18px}li{margin:4px 0}.foot{color:#888;font-size:10px;margin-top:18px;border-top:1px solid #eee;padding-top:8px}
    @media print{body{margin:16px}}
  </style></head><body>
    <h1>${esc(sName(s.loc))} <span style="color:#999;font-weight:400;font-size:13px">#${esc(s.loc)}</span></h1>
    <div class="sub">Visit Readiness coaching report · ${date}</div>
    <div><span class="score">${Math.round(s.readiness)}</span><span class="band">${b.l}</span><span class="fs">${fs.l.replace('FS', 'Food safety:')}</span>
      ${s.coverage < 1 ? `<span style="color:#999;font-size:11px;margin-left:8px">${Math.round(s.coverage * 100)}% data coverage</span>` : ''}</div>
    <div class="why"><b>Why:</b> ${esc(s.why || '')}</div>
    <h2>Recommended focus</h2>
    ${focus ? `<ol>${focus}</ol>` : '<p>No material gaps — hold the standard and stay visit-ready.</p>'}
    <h2>Score breakdown</h2>
    <table><tr><th>Area (weight)</th><th>Score</th><th>Measured on</th></tr>
      ${subRow('Speed (35%)', s.subs.speed)}${subRow('Accuracy (30%)', s.subs.accuracy)}${subRow('Quality (20%)', s.subs.quality)}${subRow('Leadership (15%)', s.subs.leadership)}</table>
    <h2>Metric detail (vs your store target)</h2>
    <table><tr><th>Metric</th><th>Actual</th><th>Target</th><th>Status</th></tr>${(s.topDrivers || []).map(driverRow).join('')}</table>
    <p style="margin-top:10px">${lv}</p>
    <div class="foot">Meridian · Readiness is a directional early-warning from daily operating metrics (Speed 35 / Accuracy 30 / Quality 20 / Leadership 15), each scored against this store's own target — not an official predicted visit score. Cleanliness has no daily-data proxy and is excluded.</div>
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
          s.coverage < 1 && h('span', { style: { fontSize: 9, color: 'var(--text3)' } }, Math.round(s.coverage * 100) + '% data'),
          s.lastVisit && h('span', { style: { fontSize: 9, color: 'var(--text3)' } }, `last ${s.lastVisit.type || 'visit'} ${Math.round(s.lastVisit.score)}%${s.lastVisit.pass === false ? ' ✗' : ''}`))),
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
      !s.topDrivers.length && h('div', { style: { fontSize: 11, color: 'var(--text3)' } }, 'No metric data loaded for this store.')));
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
        h('span', { style: { fontSize: 19, fontWeight: 800, fontFamily: 'var(--mono)', color: cal.hitRate >= 0.6 ? '#10b981' : '#f59e0b' } }, Math.round(cal.hitRate * 100) + '%'),
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
function VisitPatterns({ ds }) {
  const { useMemo, useState } = React;
  const [type, setType] = useState('all');
  const [open, setOpen] = useState(false);
  const gv = ds?.gradedVisits || ds?.graded_visits || [];
  const a = useMemo(() => analyzeGradedVisits(gv, { type }), [gv, type]);
  if (!gv.length) return null;
  const pr = v => v == null ? '—' : Math.round(v * 100) + '%';
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

export function VisitReadinessPanel({ ds, onClose }) {
  const { useMemo, useState } = React;
  const res = useMemo(() => computeVisitReadiness(ds), [ds]);
  const [expanded, setExpanded] = useState(null);
  const d = res.district;

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
        h('button', { className: 'btn btn-sm', style: { color: 'var(--text3)' }, onClick: onClose }, '✕')),

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

          h(VisitPatterns, { ds }),

          h('div', { style: { fontSize: 9, color: 'var(--text3)', lineHeight: 1.6, marginTop: 8 } },
            '⚙ ', res.gapNote, ' Scores are a directional early-warning from leading indicators, not a predicted visit percentage. Validate against actual CFV/RGR outcomes as they accumulate (shown per store when available).')))));
}
