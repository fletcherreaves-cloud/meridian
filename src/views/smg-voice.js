// @ts-nocheck
// SMG VOICE Customer Comment Panel
// Data source: ds.smgRows[] — parsed from SMG VOICE PDF comment reports
// Row shape: { loc, storeName, reportStart, reportEnd, commentDate, visitDate, nsn, text, satisfactionLabel, score }
import * as React from 'react';
import { INV_ORG_COORDS } from '../constants';
import { rankCommentOpportunities, MIN_N } from '../engine/csat-opportunities';

const h = React.createElement;

// Narrow-viewport flag so the panel can go full-screen + stack on phones.
function useIsMobile(bp = 700) {
  const [m, setM] = React.useState(() => typeof window !== 'undefined' && window.innerWidth < bp);
  React.useEffect(() => {
    const on = () => setM(window.innerWidth < bp);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [bp]);
  return m;
}

// ── Location scope + grouping (matches the app-standard filter: analytics.js
// District Priority Brief). Filter chain: All / 🟠 OK / 🔵 FL / supervisor
// patch, plus a Store dropdown. Org data from INV_ORG_COORDS (keyed un-padded);
// VOICE rows carry zero-padded NSNs, so normalize both to the integer form.
const _normLoc = loc => String(parseInt(loc, 10) || loc);
const _orgOf   = loc => INV_ORG_COORDS[_normLoc(loc)] || {};

// orgFilter: 'all' | 'ok' | 'fl' | <supervisor patch name>
function orgMatch(orgFilter, loc) {
  if (!orgFilter || orgFilter === 'all') return true;
  const o = _orgOf(loc);
  if (orgFilter === 'ok') return o.state === 'OK';
  if (orgFilter === 'fl') return o.state === 'FL';
  return (o.sup || '') === orgFilter; // supervisor patch
}
function orgDesc(orgFilter, storeSel, nameOf) {
  if (storeSel && storeSel !== 'all') return (nameOf && nameOf(storeSel)) || ('Store ' + storeSel);
  if (!orgFilter || orgFilter === 'all') return 'All Locations';
  if (orgFilter === 'ok') return 'Oklahoma';
  if (orgFilter === 'fl') return 'Florida';
  return orgFilter; // patch (supervisor)
}

// App-standard filter bar: All / OK / FL / patch pills (amber, per analytics)
// + a Store dropdown. `locs` = every loc in the active tab's data.
function VoiceFilterBar({ locs, orgFilter, setOrgFilter, storeSel, setStoreSel, nameOf }) {
  const present = [...new Set((locs || []).map(_normLoc))];
  if (present.length <= 1) return null;
  const hasOK = present.some(l => _orgOf(l).state === 'OK');
  const hasFL = present.some(l => _orgOf(l).state === 'FL');
  const patches = [...new Set(present.map(l => _orgOf(l).sup).filter(Boolean))].sort();
  const filters = ['all', ...(hasOK ? ['ok'] : []), ...(hasFL ? ['fl'] : []), ...patches];
  const storeOpts = present.filter(l => orgMatch(orgFilter, l)).sort((a, b) => +a - +b);

  const fLabel = f => f === 'all' ? 'All' : f === 'ok' ? '🟠 OK' : f === 'fl' ? '🔵 FL' : f.split(' ').slice(-1)[0];
  const pill = f => h('button', { key: f, onClick: () => { setOrgFilter(f); if (storeSel !== 'all' && !orgMatch(f, storeSel)) setStoreSel('all'); },
    style: { padding: '3px 9px', borderRadius: 99, fontSize: 9, cursor: 'pointer',
      border: '.5px solid ' + (orgFilter === f ? 'rgba(245,158,11,.4)' : 'var(--bdr)'),
      background: orgFilter === f ? 'var(--adim,rgba(245,158,11,.12))' : 'transparent',
      color: orgFilter === f ? 'var(--amber,#f59e0b)' : 'var(--text2)', whiteSpace: 'nowrap' } }, fLabel(f));

  return h('div', { style: { padding: '6px 16px', borderBottom: '1px solid var(--bdr)', background: 'var(--surf2)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 } },
    h('span', { style: { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--text3)' } }, 'Filter:'),
    ...filters.map(pill),
    h('select', { value: storeSel, onChange: e => setStoreSel(e.target.value),
      style: { marginLeft: 4, fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer' } },
      h('option', { value: 'all' }, `All stores (${storeOpts.length})`),
      storeOpts.map(l => h('option', { key: l, value: l }, `${l} — ${nameOf ? nameOf(l) : l}`)),
    ),
  );
}

// ── CSV export + print (shared) ─────────────────────────────────────────────
const _csvCell = v => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
function exportCSV(filename, headers, rows) {
  const lines = [headers.map(_csvCell).join(','), ...rows.map(r => r.map(_csvCell).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function printReport(title, subtitle, headers, rows) {
  const th = headers.map(x => `<th>${x}</th>`).join('');
  const trs = rows.map(r => `<tr>${r.map(c => `<td>${c == null ? '' : c}</td>`).join('')}</tr>`).join('');
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${title}</title><style>
    body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:24px;color:#111}
    h1{font-size:18px;margin:0 0 2px} .sub{color:#666;font-size:12px;margin-bottom:14px}
    table{border-collapse:collapse;width:100%;font-size:11px}
    th,td{border:1px solid #ccc;padding:4px 7px;text-align:center}
    th{background:#f3f4f6;text-transform:uppercase;font-size:9px;letter-spacing:.4px}
    td:first-child,th:first-child{text-align:left}
    </style></head><body><h1>${title}</h1><div class="sub">${subtitle}</div>
    <table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => w.print(), 300);
}
// Small toolbar of Export/Print buttons; caller supplies the data builders.
function ExportButtons({ onCsv, onPrint }) {
  const s = { padding: '4px 9px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text3)', cursor: 'pointer', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' };
  return h('div', { style: { display: 'flex', gap: 6 } },
    h('button', { onClick: onCsv, style: s, title: 'Export current view to CSV' }, '⬇ CSV'),
    h('button', { onClick: onPrint, style: s, title: 'Print current view' }, '🖨 Print'),
  );
}

// ── Settings storage ───────────────────────────────────────────────────────────
const SMG_SETTINGS_KEY = 'mf_smg_settings_v2';

const SMG_DEFAULTS = {
  // Higher-is-better metrics (OSAT, Top-2, OSAT B2B) — stored as 0–1 decimals
  osatStd:       0.90,   // McDonald's standard: OSAT / Top-2 / OSAT B2B ≥ 90%
  osatYellow:    0.05,   // yellow band: within this many pp below standard
  accStd:        0.95,   // McDonald's standard: Accuracy B2B ≥ 95%
  accYellow:     0.03,
  // Lower-is-better metrics (problem rates)
  dtProbStd:     0.10,   // McDonald's standard: DT Problem rate ≤ 10%
  dtProbYellow:  0.05,   // yellow band: within this many pp above standard
  ovProbStd:     0.10,   // McDonald's standard: Any Problem rate ≤ 10%
  ovProbYellow:  0.05,
  // OSAT avg (1–5 scale)
  avgStd:        4.5,
  avgYellow:     0.3,
};

// ── Smart target calibration ───────────────────────────────────────────────────
// Computes recommended thresholds from historical FullScale data.
// Higher-better: p75 = green standard, (p75 - p50) spread = yellow band.
// Lower-better:  p25 = green standard, (p50 - p25) spread = yellow band.
function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a,b)=>a-b);
  const idx = (p/100)*(s.length-1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return s[lo] + (s[hi]-s[lo])*(idx-lo);
}

function computeSmgSmartTargets(fsRows) {
  if (!fsRows || fsRows.length < 4) return null;

  const get = key => fsRows.map(r => r[key]).filter(v => v != null && !isNaN(v));

  const top2  = get('osatTop2');
  const osat5 = get('osat5');
  const b2b   = get('osatB2B');
  const acc   = get('accuracyB2B');
  const dtP   = get('dtProblem');
  const ovP   = get('overallProblem');
  const avg   = get('osatAvg');

  const higher = (vals) => {
    if (vals.length < 4) return null;
    const std    = pct(vals, 75);  // top-25% performance = standard
    const yellow = Math.max(0.01, Math.round((pct(vals, 75) - pct(vals, 50)) * 100) / 100);
    return { std: Math.round(std*1000)/1000, yellow };
  };
  const lower = (vals) => {
    if (vals.length < 4) return null;
    const std    = pct(vals, 25);  // bottom-25% (best) = standard
    const yellow = Math.max(0.01, Math.round((pct(vals, 50) - pct(vals, 25)) * 100) / 100);
    return { std: Math.round(std*1000)/1000, yellow };
  };

  const osat   = higher(top2);
  const accR   = higher(acc);
  const dtPr   = lower(dtP);
  const ovPr   = lower(ovP);
  const avgR   = avg.length >= 4 ? { std: Math.round(pct(avg, 75)*100)/100, yellow: Math.max(0.1, Math.round((pct(avg,75)-pct(avg,50))*100)/100) } : null;

  return {
    osatStd:    osat?.std    ?? SMG_DEFAULTS.osatStd,
    osatYellow: osat?.yellow ?? SMG_DEFAULTS.osatYellow,
    accStd:     accR?.std    ?? SMG_DEFAULTS.accStd,
    accYellow:  accR?.yellow ?? SMG_DEFAULTS.accYellow,
    dtProbStd:     dtPr?.std    ?? SMG_DEFAULTS.dtProbStd,
    dtProbYellow:  dtPr?.yellow ?? SMG_DEFAULTS.dtProbYellow,
    ovProbStd:     ovPr?.std    ?? SMG_DEFAULTS.ovProbStd,
    ovProbYellow:  ovPr?.yellow ?? SMG_DEFAULTS.ovProbYellow,
    avgStd:    avgR?.std    ?? SMG_DEFAULTS.avgStd,
    avgYellow: avgR?.yellow ?? SMG_DEFAULTS.avgYellow,
    _calibrated: true,
    _n: fsRows.length,
    _months: [...new Set(fsRows.map(r => `${r.year}-${r.month}`))].length,
  };
}

function loadSmgSettings() {
  try { return { ...SMG_DEFAULTS, ...JSON.parse(localStorage.getItem(SMG_SETTINGS_KEY) || '{}') }; }
  catch { return { ...SMG_DEFAULTS }; }
}
function saveSmgSettings(s) {
  localStorage.setItem(SMG_SETTINGS_KEY, JSON.stringify(s));
}

// Build FS_METRICS array driven by current settings
function buildFsMetrics(s) {
  return [
    { key:'osat5',         label:'OSAT (5★)',    fmt:p=>p!=null?(p*100).toFixed(1)+'%':'—', better:'higher', std:s.osatStd,    yellow:s.osatYellow,   unit:'pct' },
    { key:'osatTop2',      label:'Top-2 Box',    fmt:p=>p!=null?(p*100).toFixed(1)+'%':'—', better:'higher', std:s.osatStd,    yellow:s.osatYellow,   unit:'pct' },
    { key:'osatAvg',       label:'OSAT Avg',     fmt:v=>v!=null?v.toFixed(2):'—',           better:'higher', std:s.avgStd,     yellow:s.avgYellow,    unit:'raw' },
    { key:'osatB2B',       label:'OSAT B2B',     fmt:p=>p!=null?(p*100).toFixed(1)+'%':'—', better:'higher', std:s.osatStd,    yellow:s.osatYellow,   unit:'pct' },
    { key:'accuracyB2B',   label:'Accuracy B2B', fmt:p=>p!=null?(p*100).toFixed(1)+'%':'—', better:'higher', std:s.accStd,     yellow:s.accYellow,    unit:'pct' },
    { key:'dtProblem',     label:'DT Problem',   fmt:p=>p!=null?(p*100).toFixed(1)+'%':'—', better:'lower',  std:s.dtProbStd,  yellow:s.dtProbYellow, unit:'pct' },
    { key:'overallProblem',label:'Any Problem',  fmt:p=>p!=null?(p*100).toFixed(1)+'%':'—', better:'lower',  std:s.ovProbStd,  yellow:s.ovProbYellow, unit:'pct' },
  ];
}

function metricColor(val, m) {
  if (val == null) return 'var(--text3)';
  if (m.better === 'higher') {
    return val >= m.std ? '#10b981' : val >= (m.std - m.yellow) ? '#f59e0b' : '#ef4444';
  }
  return val <= m.std ? '#10b981' : val <= (m.std + m.yellow) ? '#f59e0b' : '#ef4444';
}

function metricBg(val, m) {
  const col = metricColor(val, m);
  if (col === 'var(--text3)') return 'transparent';
  return col + '18';
}

// ── Comment display helpers ────────────────────────────────────────────────────
const SCORE_COLORS = {
  'highly satisfied':    { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  'satisfied':           { bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc' },
  'neutral':             { bg: '#fef9c3', text: '#92400e', border: '#fde047' },
  'dissatisfied':        { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  'highly dissatisfied': { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },
};
const SCORE_LABEL_SHORT = {
  'highly satisfied':    '😊 Highly Satisfied',
  'satisfied':           '🙂 Satisfied',
  'neutral':             '😐 Neutral',
  'dissatisfied':        '😟 Dissatisfied',
  'highly dissatisfied': '😠 Highly Dissatisfied',
};
const ALL_LABELS = ['highly satisfied','satisfied','neutral','dissatisfied','highly dissatisfied'];

function scoreColor(label) {
  return SCORE_COLORS[(label||'').toLowerCase()] || { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
}

function ScoreBadge({ label }) {
  const c = scoreColor(label);
  return h('span', {
    style: {
      display: 'inline-block', padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 600, background: c.bg, color: c.text,
      border: `1px solid ${c.border}`, whiteSpace: 'nowrap',
    }
  }, SCORE_LABEL_SHORT[(label||'').toLowerCase()] || label || '—');
}

function StarBar({ score, max = 5 }) {
  const filled = Math.round(score || 0);
  return h('span', { style: { fontSize: 13, letterSpacing: 1 } },
    ...Array.from({ length: max }, (_, i) =>
      h('span', { key: i, style: { color: i < filled ? '#f59e0b' : '#d1d5db' } }, '★')
    )
  );
}

function DistScoreBadge({ score }) {
  const col = score >= 4.5 ? '#28a870' : score >= 3.5 ? '#e8a040' : '#d94f4f';
  return h('span', { style: { fontSize: 28, fontWeight: 800, color: col } }, score.toFixed(2));
}

function ScoreDistBar({ rows }) {
  const total = rows.length;
  if (!total) return null;
  const counts = {};
  ALL_LABELS.forEach(l => { counts[l] = 0; });
  rows.forEach(r => { const k = (r.satisfactionLabel||'').toLowerCase(); if (counts[k] !== undefined) counts[k]++; });
  return h('div', { style: { display: 'flex', gap: 4, height: 8, borderRadius: 4, overflow: 'hidden', width: '100%' } },
    ALL_LABELS.map(l => {
      const pct = (counts[l] / total) * 100;
      if (!pct) return null;
      return h('div', { key: l, title: `${SCORE_LABEL_SHORT[l]}: ${counts[l]}`, style: { width: pct + '%', background: scoreColor(l).border, transition: 'width .3s' } });
    })
  );
}

// ── Settings editor ────────────────────────────────────────────────────────────
function SmgSettingsEditor({ settings, onChange, fsRows }) {
  const { useState } = React;
  const [local, setLocal] = useState({ ...settings });
  const [calibMsg, setCalibMsg] = useState(null);

  const upd = (k, v) => setLocal(s => ({ ...s, [k]: v }));
  const pctIn = (k, label, step=0.01) => h('label', { style: { display:'flex', alignItems:'center', gap:8, fontSize:11 } },
    h('span', { style: { width: 130, color: 'var(--text2)', flexShrink:0 } }, label),
    h('input', { type:'number', value: Math.round(local[k]*100*10)/10, min:0, max:100, step: step*100,
      onChange: e => upd(k, parseFloat(e.target.value)/100),
      style: { width: 64, padding: '3px 6px', borderRadius:4, border:'1px solid var(--bdr)',
        background:'var(--surf)', color:'var(--text)', fontSize:11, textAlign:'right' } }),
    h('span', { style: { fontSize:10, color:'var(--text3)' } }, '%')
  );
  const rawIn = (k, label) => h('label', { style: { display:'flex', alignItems:'center', gap:8, fontSize:11 } },
    h('span', { style: { width: 130, color: 'var(--text2)', flexShrink:0 } }, label),
    h('input', { type:'number', value: local[k], min:0, max:5, step:0.1,
      onChange: e => upd(k, parseFloat(e.target.value)),
      style: { width: 64, padding: '3px 6px', borderRadius:4, border:'1px solid var(--bdr)',
        background:'var(--surf)', color:'var(--text)', fontSize:11, textAlign:'right' } }),
    h('span', { style: { fontSize:10, color:'var(--text3)' } }, '/ 5.0')
  );

  const save = () => { saveSmgSettings(local); onChange(local); };

  const autoCalibrate = () => {
    const suggested = computeSmgSmartTargets(fsRows || []);
    if (!suggested) {
      setCalibMsg({ ok: false, text: 'Need at least 4 store-month records to calibrate. Upload more FullScale reports.' });
      return;
    }
    const { _n, _months, ...vals } = suggested;
    setLocal(s => ({ ...s, ...vals }));
    setCalibMsg({ ok: true, text: `Calibrated from ${_n} store-months across ${_months} periods. Review thresholds below, then Save.` });
  };

  return h('div', { style: { borderBottom:'1px solid var(--bdr)', background:'var(--surf2)' } },

    // Auto-calibrate banner
    h('div', { style: { padding:'10px 20px', borderBottom:'.5px solid var(--bdr)',
      display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' } },
      h('div', { style: { flex:1 } },
        h('div', { style: { fontSize:10, fontWeight:700, color:'var(--text)', marginBottom:2 } },
          'Smart Target Calibration'),
        h('div', { style: { fontSize:9, color:'var(--text3)', lineHeight:1.4 } },
          'Auto-sets thresholds from your data: p75 of historical performance = green standard (top-quartile bar). ',
          'Yellow zone = gap between p75 and p50. ',
          (fsRows && fsRows.length >= 4)
            ? `${fsRows.length} store-month records available.`
            : 'Upload FullScale reports to enable.')
      ),
      h('button', {
        onClick: autoCalibrate,
        disabled: !(fsRows && fsRows.length >= 4),
        style: {
          padding:'6px 14px', borderRadius:5, cursor: (fsRows && fsRows.length >= 4) ? 'pointer' : 'default',
          background: (fsRows && fsRows.length >= 4) ? '#6366f1' : 'var(--surf)',
          color: (fsRows && fsRows.length >= 4) ? '#fff' : 'var(--text3)',
          border: 'none', fontSize:11, fontWeight:600, whiteSpace:'nowrap', flexShrink:0
        }
      }, '✦ Auto-calibrate from data'),
      calibMsg && h('div', { style: {
        width:'100%', padding:'6px 10px', borderRadius:5, fontSize:10,
        background: calibMsg.ok ? 'rgba(16,185,129,.12)' : 'rgba(248,113,113,.12)',
        color: calibMsg.ok ? '#10b981' : '#ef4444',
        border: `1px solid ${calibMsg.ok ? 'rgba(16,185,129,.3)' : 'rgba(248,113,113,.3)'}`
      } }, calibMsg.text)
    ),

    // Manual threshold inputs
    h('div', { style: { padding:'14px 20px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 } },

      h('div', { style: { display:'flex', flexDirection:'column', gap:8 } },
        h('div', { style: { fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase',
          letterSpacing:'.5px', marginBottom:4 } }, 'OSAT / Top-2 / B2B'),
        pctIn('osatStd',    'Standard (green ≥)'),
        pctIn('osatYellow', 'Yellow band (pp)'),
        h('div', { style: { fontSize:9, color:'var(--text3)', marginTop:2 } },
          `Green ≥ ${(local.osatStd*100).toFixed(0)}% · Yellow ≥ ${((local.osatStd-local.osatYellow)*100).toFixed(0)}% · Red below`)
      ),

      h('div', { style: { display:'flex', flexDirection:'column', gap:8 } },
        h('div', { style: { fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase',
          letterSpacing:'.5px', marginBottom:4 } }, 'Problem Rates'),
        pctIn('dtProbStd',    'DT Problem (green ≤)'),
        pctIn('dtProbYellow', 'Yellow band (pp)'),
        pctIn('ovProbStd',    'Any Problem (green ≤)'),
        pctIn('ovProbYellow', 'Yellow band (pp)'),
        h('div', { style: { fontSize:9, color:'var(--text3)', marginTop:2 } },
          `DT: ≤${(local.dtProbStd*100).toFixed(0)}% green · >${((local.dtProbStd+local.dtProbYellow)*100).toFixed(0)}% red`)
      ),

      h('div', { style: { display:'flex', flexDirection:'column', gap:8 } },
        h('div', { style: { fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase',
          letterSpacing:'.5px', marginBottom:4 } }, 'Accuracy B2B / OSAT Avg'),
        pctIn('accStd',    'Accuracy B2B std'),
        pctIn('accYellow', 'Yellow band (pp)'),
        rawIn('avgStd',    'OSAT Avg standard'),
        h('div', { style: { fontSize:9, color:'var(--text3)', marginTop:4, gridColumn:'1/-1' } },
          'Thresholds apply org-wide. Auto-calibrate sets these from your p75 historical results.'),
        h('div', { style: { display:'flex', gap:8, marginTop:8 } },
          h('button', { onClick: save, style: { padding:'5px 14px', borderRadius:5, cursor:'pointer',
            background:'var(--accent)', color:'#fff', border:'none', fontSize:11, fontWeight:600 } },
            'Save Thresholds'),
          h('button', { onClick: () => { setLocal({...SMG_DEFAULTS}); setCalibMsg(null); },
            style: { padding:'5px 14px', borderRadius:5, cursor:'pointer',
              background:'transparent', color:'var(--text3)', border:'1px solid var(--bdr)', fontSize:11 } },
            'Reset to defaults')
        )
      ),
    )
  );
}

// ── FullScale score table ──────────────────────────────────────────────────────
function FullScalePanel({ fsRows, stores, inScope, storeSel }) {
  const { useState, useMemo } = React;
  const [settings, setSettings] = useState(() => loadSmgSettings());
  const [showSettings, setShowSettings] = useState(false);

  const FS_METRICS = useMemo(() => buildFsMetrics(settings), [settings]);
  const scoped = useMemo(() => fsRows.filter(r => (!inScope || inScope(r.loc)) && (!storeSel || storeSel === 'all' || _normLoc(r.loc) === _normLoc(storeSel))), [fsRows, inScope, storeSel]);

  // Group by year-month
  const periods = useMemo(() => {
    const seen = new Set();
    return scoped
      .map(r => ({ key:`${r.year}-${String(r.month).padStart(2,'0')}`, year:r.year, month:r.month, label: new Date(r.year, r.month-1).toLocaleDateString('en-US',{month:'long',year:'numeric'}) }))
      .filter(p => { if(seen.has(p.key)) return false; seen.add(p.key); return true; })
      .sort((a,b) => b.key.localeCompare(a.key));
  }, [scoped]);

  const [selPeriod, setSelPeriod] = useState('');
  // Always resolve to a valid period even when data loads after mount
  const activePeriod = useMemo(() => {
    if(selPeriod && periods.some(p => p.key === selPeriod)) return selPeriod;
    return periods[0]?.key || '';
  }, [selPeriod, periods]);

  const periodRows = useMemo(() => {
    const [yr, mo] = (activePeriod||'').split('-').map(Number);
    return scoped.filter(r => r.year===yr && r.month===mo);
  }, [scoped, activePeriod]);

  const sorted = useMemo(() => [...periodRows].sort((a,b) => (b.osatTop2||0) - (a.osatTop2||0)), [periodRows]);

  const distAvg = useMemo(() => {
    const out = {};
    FS_METRICS.forEach(m => {
      const vals = periodRows.map(r => r[m.key]).filter(v => v != null);
      out[m.key] = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
    });
    return out;
  }, [periodRows, FS_METRICS]);

  const sName = loc => {
    const s = (stores||[]).find(s => String(s.loc)===String(loc));
    return s ? (s.name||s.loc) : loc;
  };

  if (!scoped.length) return h('div', {style:{padding:40,textAlign:'center',color:'var(--text3)'}},
    h('div',{style:{fontSize:32,marginBottom:12}},'📊'),
    h('div',{style:{fontWeight:700,fontSize:14,marginBottom:8,color:'var(--text)'}}, fsRows.length ? 'No FullScale Data In Scope' : 'No FullScale Data Loaded'),
    h('div',{style:{fontSize:12,lineHeight:1.6}}, fsRows.length ? 'No stores in the selected scope have FullScale scores.' : 'Drop a FullScale_Report.xlsx file onto Meridian to load aggregate SMG scores.')
  );

  if (!sorted.length) return h('div',{style:{padding:40,textAlign:'center',color:'var(--text3)'}},'No data for selected period.');

  const tdStyle = (val, m) => ({
    padding:'6px 8px', textAlign:'center', fontSize:11, fontWeight:700,
    color: metricColor(val, m), background: metricBg(val, m),
    borderRight:'1px solid var(--bdr)',
  });

  const stdPct = Math.round(settings.osatStd * 100);

  return h('div', {style:{overflowY:'auto',flex:1,display:'flex',flexDirection:'column'}},

    // Settings editor (collapsible)
    showSettings && h(SmgSettingsEditor, { settings, onChange: s => { setSettings(s); setShowSettings(false); }, fsRows }),

    h('div', {style:{overflowY:'auto',flex:1,padding:16}},
      // Toolbar row: period selector + settings toggle
      h('div', {style:{display:'flex',alignItems:'center',gap:8,marginBottom:12,flexWrap:'wrap'}},
        periods.length >= 1 && h('div', {style:{display:'flex',gap:6,alignItems:'center',flex:1}},
          h('span',{style:{fontSize:10,fontWeight:700,color:'var(--text3)',marginRight:4}},'PERIOD:'),
          h('select', { value: activePeriod, onChange: e => setSelPeriod(e.target.value),
            style:{padding:'4px 8px',borderRadius:6,border:'.5px solid var(--bdr)',background:'var(--bg)',color:'var(--text)',fontSize:11,cursor:'pointer',fontWeight:700}},
            periods.map(p => h('option', { key:p.key, value:p.key }, p.label)))
        ),
        h('div', { style:{ display:'flex', gap:6, alignItems:'center', marginLeft:'auto' } },
          h(ExportButtons, {
            onCsv: () => {
              const headers = ['Rank', 'Store', 'NSN', ...FS_METRICS.map(m => m.label)];
              const body = sorted.map((r, i) => [i + 1, sName(r.loc), r.loc, ...FS_METRICS.map(m => m.fmt(r[m.key]))]);
              body.unshift(['', 'District Average', '', ...FS_METRICS.map(m => m.fmt(distAvg[m.key]))]);
              exportCSV(`VOICE_Scorecard_${activePeriod}.csv`, headers, body);
            },
            onPrint: () => {
              const headers = ['Rank', 'Store', ...FS_METRICS.map(m => m.label)];
              const body = sorted.map((r, i) => [i + 1, sName(r.loc), ...FS_METRICS.map(m => m.fmt(r[m.key]))]);
              body.unshift(['', 'District Average', ...FS_METRICS.map(m => m.fmt(distAvg[m.key]))]);
              printReport('VOICE Scorecard (FullScale)', `${periods.find(p => p.key === activePeriod)?.label || activePeriod} · ${sorted.length} stores`, headers, body);
            },
          }),
          h('button', { onClick:()=>setShowSettings(v=>!v),
            title:'Edit score thresholds',
            style:{padding:'4px 10px',borderRadius:6,border:'1px solid var(--bdr)',
              background:showSettings?'var(--amber)':'var(--surf)',
              color:showSettings?'#000':'var(--text3)',cursor:'pointer',fontSize:11}},
            '⚙ Thresholds')
        )
      ),

      // Legend
      h('div',{style:{display:'flex',gap:12,marginBottom:10,fontSize:9,alignItems:'center',flexWrap:'wrap'}},
        h('span',{style:{color:'var(--text3)'}},'Rating:'),
        h('span',{style:{color:'#10b981',fontWeight:700}},'● At/above standard'),
        h('span',{style:{color:'#f59e0b',fontWeight:700}},'● Watch zone'),
        h('span',{style:{color:'#ef4444',fontWeight:700}},'● Below standard'),
        h('span',{style:{color:'var(--text3)',marginLeft:8}},`Standard: ${stdPct}% (customizable via ⚙)`),
      ),

      // Table
      h('div',{style:{overflowX:'auto'}},
        h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:11}},
          h('thead',null,
            h('tr',{style:{background:'var(--surf2)',fontSize:9,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.3px'}},
              h('th',{style:{padding:'8px 10px',textAlign:'left',borderRight:'1px solid var(--bdr)',borderBottom:'2px solid var(--bdr)',minWidth:160}},'Store'),
              ...FS_METRICS.map(m=>h('th',{key:m.key,style:{padding:'8px 6px',textAlign:'center',borderRight:'1px solid var(--bdr)',borderBottom:'2px solid var(--bdr)',minWidth:80}},
                m.label,
                h('br'),
                h('span',{style:{fontSize:8,fontWeight:400,opacity:.7}},
                  m.better==='higher'
                    ? `↑ std ${m.unit==='pct'?Math.round(m.std*100)+'%':m.std.toFixed(1)}`
                    : `↓ std ${Math.round(m.std*100)}%`)
              ))
            ),
            // District avg row
            h('tr',{style:{background:'rgba(99,102,241,.08)',borderBottom:'1px solid var(--bdr)'}},
              h('td',{style:{padding:'5px 10px',fontSize:11,fontWeight:700,color:'var(--text)',borderRight:'1px solid var(--bdr)'}},'District Average'),
              ...FS_METRICS.map(m=>h('td',{key:m.key,style:tdStyle(distAvg[m.key],m)},m.fmt(distAvg[m.key])))
            )
          ),
          h('tbody',null,
            sorted.map((r,i)=>h('tr',{key:r.loc,style:{background:i%2===0?'transparent':'rgba(255,255,255,.015)',borderBottom:'1px solid var(--bdr)'}},
              h('td',{style:{padding:'5px 10px',borderRight:'1px solid var(--bdr)',fontSize:11}},
                h('span',{style:{fontWeight:600,color:'var(--text)'}},'#'+(i+1)+' '),
                h('span',{style:{color:'var(--text2)'}},'Store '+r.loc),
                h('br'),
                h('span',{style:{fontSize:9,color:'var(--text3)'}},sName(r.loc))
              ),
              ...FS_METRICS.map(m=>h('td',{key:m.key,style:tdStyle(r[m.key],m)},m.fmt(r[m.key])))
            ))
          )
        )
      )
    )
  );
}

// ── VOICE Performance Panel ────────────────────────────────────────────────────
// Displays data parsed from McDonalds_VOICE_Operator_Performance_*.PDF
// Row shape: { period, report_type, operator_id, operator_name, loc, loc_name,
//              dt_sat, dt_dissat, ir_sat, ir_sat, ir_dissat, accuracy_b2b,
//              quality_b2b, fries_b2b, snack_wrap_b2b }

const VP_METRICS = [
  { key: 'dt_sat',         label: 'DT Overall Sat',   better: 'higher', redBelow: 75, yellowBelow: 85 },
  { key: 'dt_dissat',      label: 'DT Dissat',        better: 'lower',  redAbove: 15, yellowAbove: 8  },
  { key: 'ir_sat',         label: 'IRS Sat',          better: 'higher', redBelow: 75, yellowBelow: 85 },
  { key: 'ir_dissat',      label: 'IRS Dissat',       better: 'lower',  redAbove: 10, yellowAbove: 5  },
  { key: 'accuracy_b2b',   label: 'Accuracy B2B',     better: 'lower',  redAbove: 8,  yellowAbove: 4  },
  { key: 'quality_b2b',    label: 'Quality B2B',      better: 'lower',  redAbove: 8,  yellowAbove: 4  },
  { key: 'fries_b2b',      label: 'Fries B2B',        better: 'lower',  redAbove: 15, yellowAbove: 8  },
  { key: 'snack_wrap_b2b', label: 'SW Quality B2B',   better: 'lower',  redAbove: 10, yellowAbove: 5  },
];

function vpColor(val, m) {
  if (val == null) return 'var(--text3)';
  if (m.better === 'higher') {
    return val >= (m.yellowBelow || 85) ? '#10b981' : val >= (m.redBelow || 75) ? '#f59e0b' : '#ef4444';
  }
  return val <= (m.yellowAbove || 5) ? '#10b981' : val <= (m.redAbove || 10) ? '#f59e0b' : '#ef4444';
}

function VoicePerfPanel({ rows, stores, inScope, storeSel }) {
  const { useState, useMemo } = React;
  const scoped = rows.filter(r => (!inScope || inScope(r.loc)) && (!storeSel || storeSel === 'all' || _normLoc(r.loc) === _normLoc(storeSel)));

  // Available periods
  const periods = useMemo(() => {
    const seen = new Set();
    return scoped.map(r => r.period).filter(p => { if (seen.has(p)) return false; seen.add(p); return true; }).sort().reverse();
  }, [scoped]);

  const [selPeriod, setSelPeriod]   = useState('');
  const [selType, setSelType]       = useState('monthly');
  const [sortMetric, setSortMetric] = useState('dt_sat');

  const activePeriod = selPeriod && periods.includes(selPeriod) ? selPeriod : (periods[0] || '');

  // One physical store can appear 2–3× in a period: it's covered by multiple
  // operator reports (THORLEY / LOPEZ-THORLEY / MORNHINWEG overlap stores), and
  // a re-uploaded month lands new rows if the filename → operator_id differs.
  // Collapse to one row per store, keeping the most-populated (dupes are often
  // all-dashes). Metric fill count breaks ties; operator_name is preserved.
  const filtered = useMemo(() => {
    const byLoc = {};
    for (const r of scoped) {
      if (r.period !== activePeriod || r.report_type !== selType) continue;
      const k = String(parseInt(r.loc, 10) || r.loc);
      const score = VP_METRICS.reduce((n, m) => n + (r[m.key] != null ? 1 : 0), 0);
      if (!byLoc[k] || score > byLoc[k]._score) byLoc[k] = { ...r, _score: score };
    }
    return Object.values(byLoc);
  }, [scoped, activePeriod, selType]);

  const sorted = useMemo(() => {
    const m = VP_METRICS.find(x => x.key === sortMetric);
    if (!m) return [...filtered];
    const dir = m.better === 'higher' ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const av = a[sortMetric], bv = b[sortMetric];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return dir * (av - bv);
    });
  }, [filtered, sortMetric]);

  const distAvg = useMemo(() => {
    const out = {};
    VP_METRICS.forEach(m => {
      const vals = filtered.map(r => r[m.key]).filter(v => v != null);
      out[m.key] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    });
    return out;
  }, [filtered]);

  const sName = loc => {
    // VOICE rows carry zero-padded NSNs ('03708'); the store list is keyed '3708'.
    // Normalize both to the integer form so leading-zero stores resolve instead of
    // showing the raw NSN, then fall back to the report's own store name.
    const norm = String(parseInt(loc, 10) || loc);
    const s = (stores || []).find(s => String(parseInt(s.loc, 10) || s.loc) === norm);
    if (s && s.name) return s.name;
    const row = rows.find(r => String(r.loc) === String(loc) && r.loc_name);
    return (row && row.loc_name) || loc;
  };

  const periodFmt = p => {
    if (!p) return '';
    const [y, m] = p.split('-');
    return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  if (!rows.length) return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text3)' } },
    h('div', { style: { fontSize: 32, marginBottom: 12 } }, '📋'),
    h('div', { style: { fontWeight: 700, fontSize: 14, marginBottom: 8, color: 'var(--text)' } }, 'No Performance Reports Loaded'),
    h('div', { style: { fontSize: 12, lineHeight: 1.6 } },
      'Monthly VOICE Performance PDFs are auto-ingested from the Gmail poller (SMGMailMgr@whysmg.com).',
      h('br'), 'Or upload a McDonalds_VOICE_Operator_Performance_*.PDF file manually.'
    )
  );

  const thStyle = { padding: '7px 6px', textAlign: 'center', fontSize: 9, fontWeight: 700,
    color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.3px',
    borderRight: '1px solid var(--bdr)', borderBottom: '2px solid var(--bdr)', cursor: 'pointer', whiteSpace: 'nowrap' };
  const tdNum = (val, m) => h('td', {
    style: { padding: '5px 6px', textAlign: 'center', fontSize: 11, fontWeight: 700,
      color: vpColor(val, m), background: vpColor(val, m) === 'var(--text3)' ? 'transparent' : vpColor(val, m) + '18',
      borderRight: '1px solid var(--bdr)' }
  }, val != null ? val + '%' : '—');

  const TYPE_LABELS = { monthly: 'Monthly', trailing90: 'Trailing 90d', ytd: 'Year-to-Date' };

  return h('div', { style: { display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' } },
    // Toolbar
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--bdr)', flexShrink: 0, flexWrap: 'wrap' } },
      h('span', { style: { fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' } }, 'Period:'),
      h('select', { value: activePeriod, onChange: e => setSelPeriod(e.target.value),
          style: { padding: '4px 8px', borderRadius: 6, border: '.5px solid var(--bdr)', background: 'var(--bg)', color: 'var(--text)', fontSize: 11, cursor: 'pointer', fontWeight: 700 } },
          periods.map(p => h('option', { key: p, value: p }, periodFmt(p)))),
      h('div', { style: { display: 'flex', gap: 2, marginLeft: 8, border: '1px solid var(--bdr)', borderRadius: 8, padding: 2, background: 'var(--surf2)' } },
        Object.entries(TYPE_LABELS).map(([t, label]) =>
          h('button', { key: t, onClick: () => setSelType(t), style: {
            padding: '3px 10px', border: 'none', borderRadius: 6, fontSize: 10, fontWeight: selType === t ? 700 : 400, cursor: 'pointer',
            background: selType === t ? 'var(--accent)' : 'transparent', color: selType === t ? '#fff' : 'var(--text2)' } }, label)
        )
      ),
      h('span', { style: { marginLeft: 'auto', fontSize: 10, color: 'var(--text3)' } }, `${filtered.length} stores · ${activePeriod}`),
      h(ExportButtons, {
        onCsv: () => {
          const headers = ['Store', 'NSN', 'Operator', ...VP_METRICS.map(m => m.label)];
          const body = sorted.map(r => [sName(r.loc), r.loc, r.operator_name || '', ...VP_METRICS.map(m => r[m.key] != null ? r[m.key] + '%' : '')]);
          body.unshift(['District Average', '', '', ...VP_METRICS.map(m => distAvg[m.key] != null ? distAvg[m.key] + '%' : '')]);
          exportCSV(`VOICE_Performance_${activePeriod}_${selType}.csv`, headers, body);
        },
        onPrint: () => {
          const headers = ['Store', ...VP_METRICS.map(m => m.label)];
          const body = sorted.map(r => [sName(r.loc), ...VP_METRICS.map(m => m && r[m.key] != null ? r[m.key] + '%' : '—')]);
          body.unshift(['District Average', ...VP_METRICS.map(m => distAvg[m.key] != null ? distAvg[m.key] + '%' : '—')]);
          printReport(`VOICE Performance — ${TYPE_LABELS[selType]}`, `${periodFmt(activePeriod)} · ${filtered.length} stores`, headers, body);
        },
      }),
    ),
    // Table
    h('div', { style: { overflowY: 'auto', flex: 1, padding: '0 16px 16px' } },
      !filtered.length
        ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text3)' } }, `No data for ${periodFmt(activePeriod)} — ${TYPE_LABELS[selType]}`)
        : h('div', { style: { overflowX: 'auto', marginTop: 12 } },
          h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11 } },
            h('thead', null,
              h('tr', { style: { background: 'var(--surf2)' } },
                h('th', { style: { ...thStyle, textAlign: 'left', minWidth: 160, cursor: 'default' } }, 'Store'),
                ...VP_METRICS.map(m => h('th', { key: m.key, style: { ...thStyle, minWidth: 72, color: sortMetric === m.key ? 'var(--accent)' : 'var(--text3)' },
                  onClick: () => setSortMetric(m.key) },
                  m.label, h('br'), h('span', { style: { fontSize: 7, fontWeight: 400 } }, m.better === 'higher' ? '↑ higher' : '↓ lower')
                ))
              ),
              h('tr', { style: { background: 'rgba(99,102,241,.08)', borderBottom: '1px solid var(--bdr)' } },
                h('td', { style: { padding: '5px 10px', fontSize: 11, fontWeight: 700, borderRight: '1px solid var(--bdr)' } }, 'District Average'),
                ...VP_METRICS.map(m => tdNum(distAvg[m.key], m))
              )
            ),
            h('tbody', null,
              sorted.map((r, i) => h('tr', { key: r.loc + i, style: { background: i % 2 ? 'rgba(255,255,255,.015)' : 'transparent', borderBottom: '1px solid var(--bdr)' } },
                h('td', { style: { padding: '5px 10px', borderRight: '1px solid var(--bdr)' } },
                  h('div', { style: { fontWeight: 600, fontSize: 11 } }, sName(r.loc)),
                  h('div', { style: { fontSize: 9, color: 'var(--text3)' } }, r.loc + (r.operator_name ? ' · ' + r.operator_name : ''))
                ),
                ...VP_METRICS.map(m => tdNum(r[m.key], m))
              ))
            )
          )
        )
    )
  );
}

// ── Opportunities Panel ─────────────────────────────────────────────────────
// Ranks stores by biggest CSAT opportunity (absolute detractors), with per-store
// top themes and a district theme roll-up. Data = the scoped comment rows.
function OpportunitiesPanel({ result, scopeText }) {
  const { stores, district } = result;
  if (!stores.length) return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text3)' } },
    h('div', { style: { fontSize: 32, marginBottom: 12 } }, '🎯'),
    h('div', { style: { fontWeight: 700, fontSize: 14, marginBottom: 8, color: 'var(--text)' } }, 'No Comments In Scope'),
    h('div', { style: { fontSize: 12, lineHeight: 1.6 } }, 'Load or backfill guest comments to rank store opportunities.')
  );

  const th = { padding: '7px 8px', textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: '.3px', borderBottom: '2px solid var(--bdr)', whiteSpace: 'nowrap' };
  const chip = (label, tone) => h('span', { key: label, style: {
    fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap',
    background: (tone || '#ef4444') + '1f', color: tone || '#ef4444' } }, label);

  return h('div', { style: { overflowY: 'auto', flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 } },
    // District summary
    h('div', { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' } },
      h('div', { style: { display: 'flex', flexDirection: 'column' } },
        h('div', { style: { fontSize: 22, fontWeight: 800, color: '#ef4444', lineHeight: 1 } }, district.neg),
        h('div', { style: { fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px' } }, 'Detractors'),
      ),
      h('div', { style: { fontSize: 11, color: 'var(--text2)', maxWidth: 320, lineHeight: 1.5 } },
        `${district.neg} unhappy of ${district.total} comments (${Math.round(district.negRate * 100)}%) across ${stores.length} stores in ${scopeText}. `,
        'Ranked by detractors — the most real guests to win back first.'),
      district.themes.length ? h('div', { style: { marginLeft: 'auto', display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', maxWidth: 380, justifyContent: 'flex-end' } },
        h('span', { style: { fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 700 } }, 'Top issues:'),
        ...district.themes.slice(0, 5).map(t => chip(`${t.label} ${t.count}`))) : null,
    ),
    // Ranking table
    h('div', { style: { overflowX: 'auto' } },
      h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11 } },
        h('thead', null, h('tr', { style: { background: 'var(--surf2)' } },
          h('th', { style: { ...th, textAlign: 'left', minWidth: 150 } }, 'Store'),
          h('th', { style: th }, 'Comments'),
          h('th', { style: th }, 'Detractors'),
          h('th', { style: th }, 'Neg %'),
          h('th', { style: th }, 'Avg'),
          h('th', { style: { ...th, textAlign: 'left', minWidth: 220 } }, 'Top Issues (in negative comments)'),
        )),
        h('tbody', null, stores.map((s, i) => h('tr', { key: s.loc, style: { borderBottom: '1px solid var(--bdr)', background: i % 2 ? 'rgba(255,255,255,.015)' : 'transparent' } },
          h('td', { style: { padding: '6px 8px' } },
            h('span', { style: { fontWeight: 700, color: 'var(--text3)', marginRight: 4 } }, '#' + (i + 1)),
            h('span', { style: { fontWeight: 600 } }, s.name),
          ),
          h('td', { style: { padding: '6px 8px', textAlign: 'center', color: 'var(--text2)' } }, s.total),
          h('td', { style: { padding: '6px 8px', textAlign: 'center', fontWeight: 800, color: s.neg ? '#ef4444' : 'var(--text3)' } }, s.neg),
          h('td', { style: { padding: '6px 8px', textAlign: 'center', color: s.negRate >= 0.1 ? '#ef4444' : s.negRate >= 0.05 ? '#f59e0b' : 'var(--text2)', fontWeight: 700 } },
            `${Math.round(s.negRate * 100)}%`,
            s.thin ? h('span', { title: `Thin sample (< ${MIN_N} comments) — rate is noisy`, style: { fontSize: 8, color: 'var(--text3)', marginLeft: 3 } }, '⚠') : null),
          h('td', { style: { padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: s.avgScore >= 4.5 ? '#28a870' : s.avgScore >= 3.5 ? '#e8a040' : '#d94f4f' } }, s.avgScore != null ? s.avgScore.toFixed(2) : '—'),
          h('td', { style: { padding: '6px 8px' } },
            s.topThemes.length
              ? h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } }, s.topThemes.slice(0, 4).map(t => chip(`${t.label} ${t.count}`)))
              : h('span', { style: { color: 'var(--text3)', fontSize: 10 } }, s.neg ? 'No themed pattern' : '—')),
        ))),
      ),
    ),
    h('div', { style: { fontSize: 9, color: 'var(--text3)', lineHeight: 1.5 } },
      `Detractors = Dissatisfied + Highly Dissatisfied comments. Ranked by absolute detractors so a high-volume store outranks a 1-of-1. ⚠ flags stores with < ${MIN_N} comments (rate is noisy). Themes are keyword clusters over the negative comments.`),
  );
}

// ── Daypart (Time-of-Day) heatmap ───────────────────────────────────────────
// Per-store CSAT broken out by daypart. Reuses VP_METRICS (same 8 metrics +
// good/bad thresholds). storeSel picks the store; 'all' averages across the
// in-scope stores (mean of store %s — no response-count denominators exist in
// this report, same caveat as the Performance tab, labelled honestly).
const DAYPARTS_ORDER = ['5am-11am', '11am-2pm', '2pm-4pm', '4pm-9pm', '9pm-12am', '12am-5am'];
const DAYPART_LABEL = { '5am-11am': 'Breakfast', '11am-2pm': 'Lunch', '2pm-4pm': 'Afternoon', '4pm-9pm': 'Dinner', '9pm-12am': 'Late Eve', '12am-5am': 'Overnight' };
function DaypartPanel({ rows, stores, inScope, storeSel, nameOf }) {
  const { useState, useMemo } = React;
  const scoped = useMemo(() => (rows || []).filter(r => (!inScope || inScope(r.loc))), [rows, inScope]);
  const [selType, setSelType] = useState('monthly');
  const [selPeriod, setSelPeriod] = useState('');

  const periods = useMemo(() => [...new Set(scoped.map(r => r.period).filter(Boolean))].sort().reverse(), [scoped]);
  const activePeriod = selPeriod && periods.includes(selPeriod) ? selPeriod : (periods[0] || '');

  // Rows for the active window; if a store is picked, just that store, else all in scope.
  const windowRows = useMemo(() => scoped.filter(r =>
    r.report_type === selType && r.period === activePeriod &&
    (!storeSel || storeSel === 'all' || String(parseInt(r.loc, 10) || r.loc) === String(parseInt(storeSel, 10) || storeSel))
  ), [scoped, selType, activePeriod, storeSel]);

  const storeCount = useMemo(() => new Set(windowRows.map(r => String(parseInt(r.loc, 10) || r.loc))).size, [windowRows]);

  // metric × daypart → value (single store: the value; all: mean of store values).
  const grid = useMemo(() => {
    const g = {};
    for (const m of VP_METRICS) {
      g[m.key] = {};
      for (const dp of DAYPARTS_ORDER) {
        const vals = windowRows.filter(r => r.daypart === dp && Number.isFinite(r[m.key])).map(r => r[m.key]);
        g[m.key][dp] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
      }
    }
    return g;
  }, [windowRows]);

  const TYPE_LABELS = { monthly: 'Monthly', trailing90: 'Trailing 90d', ytd: 'Year-to-Date' };
  const titleStore = storeSel && storeSel !== 'all' ? (nameOf ? nameOf(storeSel) : storeSel) : `District avg · ${storeCount} store${storeCount === 1 ? '' : 's'}`;

  if (!rows || !rows.length) return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text3)' } },
    h('div', { style: { fontSize: 32, marginBottom: 12 } }, '🕐'),
    h('div', { style: { fontWeight: 700, fontSize: 14, marginBottom: 8, color: 'var(--text)' } }, 'No Daypart Data Loaded'),
    h('div', { style: { fontSize: 12, lineHeight: 1.6 } }, 'Upload a per-store VOICE Performance PDF (the one with a "Time of Day Performance" grid) to see satisfaction by daypart.')
  );

  const th = { padding: '7px 8px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text3)', borderBottom: '2px solid var(--bdr)', whiteSpace: 'nowrap' };
  // Key by (metric, daypart) — NOT by value — so repeated %s across dayparts
  // don't collide into stray duplicate cells past the 6 columns.
  const cell = (val, m, d) => {
    const col = vpColor(val, m);
    return h('td', { key: m.key + '|' + d, style: { padding: '7px 8px', textAlign: 'center', fontSize: 12, fontWeight: 700,
      color: col, background: col === 'var(--text3)' ? 'transparent' : col + '22', borderRight: '1px solid var(--bdr)' } },
      val != null ? val + '%' : '—');
  };
  const pfmt = p => { if (!p) return ''; const [y, m] = p.split('-'); return new Date(+y, +m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); };

  return h('div', { style: { display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--bdr)', flexShrink: 0, flexWrap: 'wrap' } },
      h('span', { style: { fontSize: 12, fontWeight: 700 } }, titleStore),
      h('div', { style: { display: 'flex', gap: 2, marginLeft: 8, border: '1px solid var(--bdr)', borderRadius: 8, padding: 2, background: 'var(--surf2)' } },
        Object.entries(TYPE_LABELS).map(([t, label]) => h('button', { key: t, onClick: () => setSelType(t),
          style: { padding: '3px 10px', border: 'none', borderRadius: 6, fontSize: 10, fontWeight: selType === t ? 700 : 400, cursor: 'pointer',
            background: selType === t ? 'var(--accent)' : 'transparent', color: selType === t ? '#fff' : 'var(--text2)' } }, label))),
      periods.length > 0 && h('select', { value: activePeriod, onChange: e => setSelPeriod(e.target.value),
        style: { padding: '4px 8px', borderRadius: 6, border: '.5px solid var(--bdr)', background: 'var(--bg)', color: 'var(--text)', fontSize: 11, cursor: 'pointer', fontWeight: 700 } },
        periods.map(p => h('option', { key: p, value: p }, pfmt(p)))),
      storeSel === 'all' && h('span', { style: { fontSize: 9, color: 'var(--text3)' } }, 'Pick a store in the filter bar to drill in'),
      h('div', { style: { marginLeft: 'auto' } }, h(ExportButtons, {
        onCsv: () => exportCSV(`VOICE_Daypart_${(titleStore).replace(/[^a-z0-9]+/gi, '_')}_${activePeriod}.csv`,
          ['Metric', ...DAYPARTS_ORDER.map(d => `${DAYPART_LABEL[d]} (${d})`)],
          VP_METRICS.map(m => [m.label, ...DAYPARTS_ORDER.map(d => grid[m.key][d] != null ? grid[m.key][d] + '%' : '')])),
        onPrint: () => printReport(`VOICE Dayparts — ${titleStore}`, `${TYPE_LABELS[selType]} · ${activePeriod}`,
          ['Metric', ...DAYPARTS_ORDER.map(d => DAYPART_LABEL[d])],
          VP_METRICS.map(m => [m.label, ...DAYPARTS_ORDER.map(d => grid[m.key][d] != null ? grid[m.key][d] + '%' : '—')])),
      })),
    ),
    h('div', { style: { overflow: 'auto', flex: 1, padding: 16 } },
      !windowRows.length
        ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text3)' } }, `No daypart data for ${TYPE_LABELS[selType]} · ${activePeriod || '—'}.`)
        : h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
          h('thead', null, h('tr', { style: { background: 'var(--surf2)' } },
            h('th', { style: { ...th, textAlign: 'left', minWidth: 150 } }, 'Metric'),
            ...DAYPARTS_ORDER.map(d => h('th', { key: d, style: th }, DAYPART_LABEL[d], h('br'), h('span', { style: { fontSize: 8, fontWeight: 400, opacity: .7 } }, d))))),
          h('tbody', null, VP_METRICS.map(m => h('tr', { key: m.key, style: { borderBottom: '1px solid var(--bdr)' } },
            h('td', { style: { padding: '7px 8px', fontSize: 11, fontWeight: 600, borderRight: '1px solid var(--bdr)' } },
              m.label, h('span', { style: { fontSize: 8, color: 'var(--text3)', marginLeft: 4 } }, m.better === 'higher' ? '↑' : '↓')),
            ...DAYPARTS_ORDER.map(d => cell(grid[m.key][d], m, d))))),
        ),
      h('div', { style: { fontSize: 9, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 } },
        'Green = at/above standard, amber = watch, red = below. ↑ = higher is better, ↓ = lower is better. ' +
        (storeSel === 'all' ? 'District view averages each daypart across the in-scope stores (no response-count weighting available in this report).' : '')),
    ),
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export function SMGVoicePanel({ ds, stores, voicePerf, voiceDaypart, onBackfillComments, onClose }) {
  const isMobile = useIsMobile();
  const rows = (ds && ds.smgRows) || [];
  const [bf, setBf] = React.useState(null); // {running} | {found,comments,saved}
  const runBackfill = async () => {
    if (!onBackfillComments || (bf && bf.running)) return;
    setBf({ running: true });
    try { setBf(await onBackfillComments()); }
    catch (e) { setBf({ error: String(e) }); }
  };
  const fsRows = (ds && ds.smgFullscale) || [];
  const vpRows = voicePerf || [];
  const dpRows = voiceDaypart || [];
  // Default to performance tab if available, then fullscale, then comments
  const [tab, setTab] = React.useState(() => vpRows.length > 0 ? 'performance' : fsRows.length > 0 ? 'fullscale' : 'comments');
  React.useEffect(() => {
    if (vpRows.length > 0) setTab(t => t === 'comments' && !rows.length ? 'performance' : t);
    else if (fsRows.length > 0) setTab(t => t === 'comments' && rows.length === 0 ? 'fullscale' : t);
  }, [vpRows.length, fsRows.length]);
  const [filterLabel, setFilterLabel] = React.useState('__all__');
  const [sortBy, setSortBy] = React.useState('date-desc');

  // ── Location filter (app-standard: All / OK / FL / patch + store dropdown) ───
  const [orgFilter, setOrgFilter] = React.useState('all');
  const [storeSel, setStoreSel]   = React.useState('all'); // 'all' | normalized loc
  const inScope = React.useCallback(loc => orgMatch(orgFilter, loc), [orgFilter]);
  const nameOf = React.useCallback(loc => {
    const n = String(parseInt(loc, 10) || loc);
    const s = (stores || []).find(x => String(parseInt(x.loc, 10) || x.loc) === n);
    if (s && s.name) return s.name;
    const r = rows.find(r => String(parseInt(r.loc, 10) || r.loc) === n && r.storeName);
    return (r && r.storeName) || loc;
  }, [stores, rows]);
  // Comments in the active org scope — every comment-tab aggregate derives from
  // this so the district average recomputes for the filtered level. The store
  // dropdown (storeSel) narrows the comment FEED only, not the district roll-up.
  const scopedRows = React.useMemo(() => rows.filter(r => inScope(r.loc)), [rows, inScope]);
  // Loc universe feeding the scope bar depends on the active tab's dataset.
  const scopeLocs = React.useMemo(() => {
    const src = tab === 'performance' ? vpRows : tab === 'fullscale' ? fsRows : tab === 'daypart' ? dpRows : rows;
    return [...new Set(src.map(r => r.loc))];
  }, [tab, vpRows, fsRows, dpRows, rows]);
  // Opportunity ranking (org-scoped comments) — computed only when the tab is open.
  const oppResult = React.useMemo(() =>
    tab === 'opportunities' ? rankCommentOpportunities(scopedRows, { storeName: nameOf }) : null,
    [tab, scopedRows, nameOf]);

  // Build per-store aggregates (scoped — District Average recomputes for scope)
  const storeMap = React.useMemo(() => {
    const m = {};
    scopedRows.forEach(r => {
      const k = String(parseInt(r.loc, 10) || r.loc);
      if (!m[k]) m[k] = { loc: k, name: r.storeName || r.loc, rows: [], scoreSum: 0, scoreCount: 0 };
      m[k].rows.push(r);
      if (Number.isFinite(r.score)) { m[k].scoreSum += r.score; m[k].scoreCount++; }
    });
    Object.values(m).forEach(s => { s.avgScore = s.scoreCount ? s.scoreSum / s.scoreCount : null; });
    return m;
  }, [scopedRows]);

  const storeList = React.useMemo(() =>
    Object.values(storeMap).sort((a, b) => (a.avgScore||0) - (b.avgScore||0)),
    [storeMap]
  );

  // Count-weighted (per-comment) district mean — never an average of store means.
  const distScore = scopedRows.filter(r => Number.isFinite(r.score));
  const distAvg   = distScore.length ? distScore.reduce((s,r) => s + r.score, 0) / distScore.length : null;

  const allDates = scopedRows.map(r => r.reportStart).filter(Boolean);
  const periodLabel = allDates.length
    ? [...new Set(allDates)].sort().slice(0, 1)[0] + ' – ' + [...new Set(scopedRows.map(r => r.reportEnd).filter(Boolean))].sort().slice(-1)[0]
    : null;

  const visibleRows = React.useMemo(() => {
    let r = storeSel === 'all' ? scopedRows : (storeMap[storeSel]?.rows || []);
    if (filterLabel !== '__all__') r = r.filter(x => (x.satisfactionLabel||'').toLowerCase() === filterLabel);
    r = [...r];
    // Coerce to String — cloud-loaded rows can return visit_date as a non-string
    // (Date/number), and localeCompare only exists on strings.
    if (sortBy === 'date-desc') r.sort((a,b) => String(b.visitDate||'').localeCompare(String(a.visitDate||'')));
    else if (sortBy === 'date-asc') r.sort((a,b) => String(a.visitDate||'').localeCompare(String(b.visitDate||'')));
    else if (sortBy === 'score-asc') r.sort((a,b) => (a.score||0) - (b.score||0));
    else if (sortBy === 'score-desc') r.sort((a,b) => (b.score||0) - (a.score||0));
    return r;
  }, [scopedRows, storeSel, filterLabel, sortBy, storeMap]);

  const labelCounts = React.useMemo(() => {
    const src = storeSel === 'all' ? scopedRows : (storeMap[storeSel]?.rows || []);
    const c = {};
    ALL_LABELS.forEach(l => { c[l] = 0; });
    src.forEach(r => { const k = (r.satisfactionLabel||'').toLowerCase(); if (c[k] !== undefined) c[k]++; });
    return c;
  }, [scopedRows, storeSel, storeMap]);

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!rows.length && !fsRows.length && !vpRows.length && !dpRows.length) return h('div', {
    style: { position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
    onClick: e => { if (e.target === e.currentTarget) onClose(); }
  },
    h('div', { style: { background: 'var(--bg)', border: '1px solid var(--bdr)', borderRadius: 14, width: '100%', maxWidth: 540, padding: 40, textAlign: 'center' } },
      h('div', { style: { fontSize: 40, marginBottom: 12 } }, '💬'),
      h('div', { style: { fontWeight: 700, fontSize: 16, marginBottom: 8 } }, 'No SMG Data Loaded'),
      h('div', { style: { fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 8 } },
        'Drop a FullScale_Report.xlsx for aggregate scores, or an SMG VOICE PDF for customer comments.'
      ),
      h('button', { onClick: onClose, style: { padding: '8px 20px', borderRadius: 8, border: '1px solid var(--bdr)', background: 'var(--bg)', cursor: 'pointer', fontSize: 13 } }, 'Close')
    )
  );

  // ── Main panel ─────────────────────────────────────────────────────────────
  return h('div', {
    style: { position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 },
    onClick: e => { if (e.target === e.currentTarget) onClose(); }
  },
    h('div', {
      style: { background: 'var(--bg)', border: isMobile ? 'none' : '1px solid var(--bdr)', borderRadius: isMobile ? 0 : 14, width: '100%', maxWidth: isMobile ? '100%' : 1060, height: isMobile ? '100dvh' : 'auto', maxHeight: isMobile ? '100dvh' : '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    },

      // ── Header ──────────────────────────────────────────────────────────────
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '10px 12px' : '14px 20px', borderBottom: '1px solid var(--bdr)', flexShrink: 0, flexWrap: 'wrap', gap: 8 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0, flex: isMobile ? '1 1 100%' : 'initial' } },
          h('span', { style: { fontSize: 20 } }, '💬'),
          h('div', null,
            h('span', { style: { fontWeight: 700, fontSize: 16 } }, 'SMG VOICE'),
            periodLabel && !isMobile && h('span', { style: { fontSize: 11, color: 'var(--text3)', marginLeft: 10 } }, periodLabel),
          ),
          h('div', { style: { display: 'flex', gap: 2, marginLeft: isMobile ? 0 : 16, border: '1px solid var(--bdr)', borderRadius: 8, padding: 2, background: 'var(--surf2)', overflowX: 'auto', maxWidth: '100%', WebkitOverflowScrolling: 'touch' } },
            [['performance','📋 Performance'], ['fullscale','📊 Scorecard'], ['comments','💬 Comments'], ['opportunities','🎯 Opportunities'], ['daypart','🕐 Dayparts']].map(([t, label]) =>
              h('button', { key: t, onClick: () => setTab(t), style: {
                padding: '4px 12px', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: tab===t ? 700 : 400,
                background: tab===t ? 'var(--accent)' : 'transparent',
                color: tab===t ? '#fff' : 'var(--text2)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}, label)
            )
          ),
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          onBackfillComments && h('button', {
            onClick: runBackfill, disabled: !!(bf && bf.running),
            title: 'Pull every comment PDF the poller stored in Supabase, parse, and cloud-persist',
            style: { padding: '5px 12px', borderRadius: 6, border: '1px solid var(--amber,#f59e0b)', background: 'rgba(245,158,11,.10)', cursor: (bf && bf.running) ? 'default' : 'pointer', fontSize: 12, color: 'var(--amber,#f59e0b)', fontWeight: 700 }
          }, bf && bf.running ? '⟳ Backfilling…' : bf && bf.saved != null ? `✓ ${bf.saved} saved` : '⟳ Backfill from storage'),
          h('button', { onClick: onClose, style: { padding: '5px 12px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--bg)', cursor: 'pointer', fontSize: 13, color: 'var(--text)' } }, '✕'),
        ),
      ),
      bf && !bf.running && bf.saved != null && h('div', { style: { padding: '6px 16px', fontSize: 11, color: bf.error ? '#f87171' : 'var(--text3)', borderBottom: '1px solid var(--bdr)' } },
        `Backfill: ${bf.found} report file${bf.found !== 1 ? 's' : ''} in storage → ${bf.comments} comments parsed → ${bf.saved} saved to cloud.${bf.found === 0 ? ' (No eu### comment files found in the bucket.)' : ''}`,
        bf.error ? ` · save error: ${bf.error}` : ''),

      // ── Shared filter bar (All / OK / FL / patch + store dropdown) ───────────
      h(VoiceFilterBar, { locs: scopeLocs, orgFilter, setOrgFilter, storeSel, setStoreSel, nameOf }),

      // ── Body: Performance tab ────────────────────────────────────────────────
      tab === 'performance' && h('div', { style: { display: 'flex', flex: 1, overflow: 'hidden', flexDirection: 'column' } },
        h(VoicePerfPanel, { rows: vpRows, stores, inScope, storeSel })
      ),

      // ── Body: FullScale tab ──────────────────────────────────────────────────
      tab === 'fullscale' && h('div', { style: { display: 'flex', flex: 1, overflow: 'hidden', flexDirection: 'column' } },
        h(FullScalePanel, { fsRows, stores, inScope, storeSel })
      ),

      // ── Body: Opportunities tab ──────────────────────────────────────────────
      tab === 'opportunities' && oppResult && h('div', { style: { display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--bdr)', flexShrink: 0 } },
          h('span', { style: { fontSize: 11, color: 'var(--text3)' } }, `${oppResult.stores.length} stores · ranked by detractors`),
          h('div', { style: { marginLeft: 'auto' } }, h(ExportButtons, {
            onCsv: () => exportCSV(`VOICE_Opportunities_${orgDesc(orgFilter, storeSel, nameOf).replace(/[^a-z0-9]+/gi, '_')}.csv`,
              ['Rank', 'Store', 'NSN', 'Comments', 'Detractors', 'Neg %', 'Avg', 'Top Issues'],
              oppResult.stores.map((s, i) => [i + 1, s.name, s.loc, s.total, s.neg, Math.round(s.negRate * 100) + '%', s.avgScore != null ? s.avgScore.toFixed(2) : '', s.topThemes.slice(0, 4).map(t => `${t.label}(${t.count})`).join('; ')])),
            onPrint: () => printReport('VOICE Store Opportunities', `${orgDesc(orgFilter, storeSel, nameOf)} · ${oppResult.stores.length} stores`,
              ['Rank', 'Store', 'Comments', 'Detractors', 'Neg %', 'Avg', 'Top Issues'],
              oppResult.stores.map((s, i) => [i + 1, s.name, s.total, s.neg, Math.round(s.negRate * 100) + '%', s.avgScore != null ? s.avgScore.toFixed(2) : '', s.topThemes.slice(0, 4).map(t => `${t.label}(${t.count})`).join('; ')])),
          })),
        ),
        h(OpportunitiesPanel, { result: oppResult, scopeText: orgDesc(orgFilter, storeSel, nameOf) }),
      ),

      // ── Body: Daypart tab ────────────────────────────────────────────────────
      tab === 'daypart' && h('div', { style: { display: 'flex', flex: 1, overflow: 'hidden', flexDirection: 'column' } },
        h(DaypartPanel, { rows: dpRows, stores, inScope, storeSel, nameOf })
      ),

      // ── Body: Comments tab ───────────────────────────────────────────────────
      tab === 'comments' && h('div', { style: { display: 'flex', flex: 1, overflow: 'hidden' } },

        // The per-store "By Store" rail is desktop-only; on mobile it would eat
        // half a narrow screen, and the filter-bar store dropdown covers the
        // same drill-in. Feed takes the full width instead.
        !isMobile && h('div', { style: { width: 240, flexShrink: 0, borderRight: '1px solid var(--bdr)', overflowY: 'auto', padding: '12px 0' } },
          h('div', { style: { padding: '8px 16px 14px', borderBottom: '1px solid var(--bdr)', marginBottom: 8 } },
            h('div', { style: { fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 } }, 'District Average'),
            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 } },
              distAvg != null && h(DistScoreBadge, { score: distAvg }),
              h('span', { style: { fontSize: 11, color: 'var(--text3)' } }, '/ 5.0'),
            ),
            h(ScoreDistBar, { rows: scopedRows }),
            h('div', { style: { fontSize: 10, color: 'var(--text3)', marginTop: 4 } }, `${scopedRows.length} total comments · ${storeList.length} stores`),
          ),
          h('div', { style: { fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 16px 6px' } }, 'By Store — Best → Worst'),
          [...storeList].reverse().map(s => {
            const active = storeSel === s.loc;
            const col = s.avgScore >= 4.5 ? '#28a870' : s.avgScore >= 3.5 ? '#e8a040' : '#d94f4f';
            return h('div', {
              key: s.loc,
              onClick: () => { setStoreSel(active ? 'all' : s.loc); setFilterLabel('__all__'); },
              style: { padding: '8px 16px', cursor: 'pointer', borderLeft: active ? `3px solid var(--accent)` : '3px solid transparent',
                background: active ? 'var(--hover)' : 'transparent', transition: 'background .15s' }
            },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                h('span', { style: { fontSize: 12, fontWeight: active ? 600 : 400, color: 'var(--text)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.name),
                h('span', { style: { fontSize: 12, fontWeight: 700, color: col, flexShrink: 0, marginLeft: 4 } }, s.avgScore != null ? s.avgScore.toFixed(2) : '—'),
              ),
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 } },
                h(StarBar, { score: s.avgScore || 0 }),
                h('span', { style: { fontSize: 10, color: 'var(--text3)' } }, `${s.rows.length} comments`),
              ),
            );
          }),
        ),

        h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--bdr)', flexShrink: 0, flexWrap: 'wrap' } },
            h('span', { style: { fontSize: 11, color: 'var(--text3)', marginRight: 2 } }, 'Filter:'),
            [['__all__', `All (${(storeSel==='all' ? scopedRows : (storeMap[storeSel]?.rows||[])).length})`],
             ...ALL_LABELS.map(l => [l, `${SCORE_LABEL_SHORT[l].split(' ').slice(1).join(' ')} (${labelCounts[l]})`])
            ].map(([val, lbl]) =>
              h('button', { key: val, onClick: () => setFilterLabel(val),
                style: { padding: '3px 10px', borderRadius: 99, fontSize: 11, cursor: 'pointer',
                  border: filterLabel === val ? '1.5px solid var(--accent)' : '1px solid var(--bdr)',
                  background: filterLabel === val ? 'var(--accent)' : 'var(--bg)',
                  color: filterLabel === val ? '#fff' : 'var(--text)',
                  fontWeight: filterLabel === val ? 600 : 400 } }, lbl)
            ),
            h('div', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 } },
              h('span', { style: { fontSize: 11, color: 'var(--text3)' } }, 'Sort:'),
              h('select', { value: sortBy, onChange: e => setSortBy(e.target.value),
                style: { fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer' } },
                h('option', { value: 'date-desc' }, 'Newest first'),
                h('option', { value: 'date-asc' }, 'Oldest first'),
                h('option', { value: 'score-asc' }, 'Worst first'),
                h('option', { value: 'score-desc' }, 'Best first'),
              ),
              h(ExportButtons, {
                onCsv: () => exportCSV(`VOICE_Comments_${orgDesc(orgFilter, storeSel, nameOf).replace(/[^a-z0-9]+/gi,'_')}.csv`,
                  ['Store', 'NSN', 'Visit Date', 'Comment Date', 'Satisfaction', 'Score', 'Comment'],
                  visibleRows.map(r => [nameOf(r.loc), r.loc, r.visitDate || '', r.commentDate || '', r.satisfactionLabel || '', Number.isFinite(r.score) ? r.score : '', r.text || ''])),
                onPrint: () => printReport('VOICE Guest Comments', `${orgDesc(orgFilter, storeSel, nameOf)} · ${visibleRows.length} comments`,
                  ['Store', 'Visit', 'Satisfaction', 'Comment'],
                  visibleRows.map(r => [nameOf(r.loc), r.visitDate || '', r.satisfactionLabel || '', r.text || ''])),
              }),
            ),
          ),
          h('div', { style: { padding: '8px 16px', borderBottom: '1px solid var(--bdr)', flexShrink: 0 } },
            h(ScoreDistBar, { rows: storeSel === 'all' ? scopedRows : (storeMap[storeSel]?.rows||[]) }),
            h('div', { style: { display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' } },
              ALL_LABELS.map(l => {
                const c = labelCounts[l];
                const total = (storeSel === 'all' ? scopedRows : (storeMap[storeSel]?.rows||[])).length;
                if (!c) return null;
                return h('span', { key: l, style: { fontSize: 10, color: scoreColor(l).text } },
                  `${SCORE_LABEL_SHORT[l].split(' ').slice(1).join(' ')}: ${c} (${Math.round(c/total*100)}%)`
                );
              })
            ),
          ),
          h('div', { style: { overflowY: 'auto', flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 } },
            visibleRows.length === 0
              ? h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text3)', fontSize: 13 } }, 'No comments match the current filter.')
              : visibleRows.map((r, i) => {
                  const c = scoreColor(r.satisfactionLabel);
                  return h('div', { key: i,
                    style: { border: `1px solid ${c.border}`, borderLeft: `4px solid ${c.border}`,
                      borderRadius: 8, padding: '10px 14px', background: c.bg + '55' } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' } },
                      h(ScoreBadge, { label: r.satisfactionLabel }),
                      storeSel === 'all' && h('span', { style: { fontSize: 11, fontWeight: 600, color: 'var(--text2)' } }, r.storeName || r.loc),
                      h('span', { style: { fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' } },
                        r.visitDate ? `Visit: ${r.visitDate}` : '',
                        r.commentDate && r.commentDate !== r.visitDate ? ` · Comment: ${r.commentDate}` : '',
                      ),
                    ),
                    r.text
                      ? h('div', { style: { fontSize: 13, color: 'var(--text)', lineHeight: 1.55 } }, r.text)
                      : h('div', { style: { fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' } }, 'No comment text recorded.'),
                  );
                })
          ),
        ),
      ),
    ),
  );
}
