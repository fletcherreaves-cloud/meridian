// @ts-nocheck
import * as React from 'react';
import { STORE_NAMES, sNameC, getStoreOrg, DEF_SETTINGS } from '../constants.js';
import { parseGradedVisit } from '../parsers/graded-visits.js';
import { loadGradedVisits, saveGradedVisits, loadVisitDAR } from '../lib/supabase.js';

const h = React.createElement;
const ALL_LOCS = Object.keys(STORE_NAMES);
const FL_LOCS = new Set(ALL_LOCS.filter(l => getStoreOrg(l) === 'emerald')); // 7 FL panhandle stores
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const PASS = 80; // CFV pass threshold (%)
const scoreColor = s => s == null ? 'var(--text3)' : s >= PASS ? '#10b981' : s >= 70 ? '#f59e0b' : '#ef4444';
const fmtPct = v => v == null ? '—' : (Math.round(v * 10) / 10) + '%';
const niceDate = iso => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
// DAR timing is Σuntilserve/Σtrans/1000 seconds.
const secOf = (us, cnt) => cnt > 0 ? Math.round(us / cnt / 1000) : null;
const fmtSec = v => v == null ? '—' : v + 's';
const hourLabel = slot => { const end = parseInt(slot, 10); if (isNaN(end)) return slot; const start = (end - 1 + 24) % 24; const f = h => h === 0 ? '12a' : h <= 11 ? h + 'a' : h === 12 ? '12p' : (h - 12) + 'p'; return f(start) + '–' + f(end); };
// visit completion "01:05 PM" → ending hour_slot number (e.g. 13)
const completionHour = t => { if (!t) return null; const m = String(t).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i); if (!m) return null; let h = +m[1] % 12; if (/pm/i.test(m[3] || '')) h += 12; return h + 1; };

// Primary (non-Counter) module score for the compact table column.
const primaryModule = v => {
  const e = Object.entries(v.modules || {}).find(([k]) => k.toLowerCase() !== 'behind the counter');
  return e ? { name: e[0], pct: e[1].pct } : null;
};
const counterModule = v => {
  const e = Object.entries(v.modules || {}).find(([k]) => k.toLowerCase() === 'behind the counter');
  return e ? e[1].pct : null;
};

export function GradedVisitsPanel({ ds, onClose }) {
  const { useState, useEffect, useMemo, useRef } = React;
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selLoc, setSelLoc] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [skipList, setSkipList] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState(null);   // visit id whose context is open
  const [ctx, setCtx] = useState({});               // { [id]: {loading, hours, glimpse} }
  const fileRef = useRef(null);
  const dirRef = useRef(null);

  const toggleContext = (v) => {
    if (expanded === v.id) { setExpanded(null); return; }
    setExpanded(v.id);
    if (!ctx[v.id]) {
      setCtx(c => ({ ...c, [v.id]: { loading: true } }));
      loadVisitDAR(v.store, v.dateISO).then(r => setCtx(c => ({ ...c, [v.id]: { loading: false, ...r } })))
        .catch(() => setCtx(c => ({ ...c, [v.id]: { loading: false, hours: [], glimpse: null } })));
    }
  };

  const refresh = () => { setLoading(true); loadGradedVisits().then(v => { setVisits(v); setLoading(false); }).catch(() => setLoading(false)); };
  useEffect(() => { refresh(); }, []);

  const onFiles = async (fileList) => {
    const all = Array.from(fileList || []);
    const htmls = all.filter(f => /\.html?$/i.test(f.name));
    const notHtml = all.length - htmls.length;
    if (!htmls.length) { setMsg({ t: 'err', x: `No .html files (got ${all.length}). Export the visit as HTML, not PDF.` }); return; }
    setBusy(true); setMsg(null); setSkipList([]);
    const parsed = [], skipped = [];
    for (const f of htmls) {
      try {
        const v = parseGradedVisit(await f.text(), { passThreshold: PASS });
        if (v.store && v.dateISO) { v._file = f.name; parsed.push(v); }
        else skipped.push(f.name + (v.store ? ' — no date found' : ' — unrecognized format (no store id)'));
      } catch (e) { skipped.push(f.name + ' — parse error'); }
    }
    // Key collisions = the parser read the same store+date for different files.
    const keys = parsed.map(v => String(v.store) + '|' + v.dateISO + '|' + (v.reportType || 'CFV'));
    const uniqueKeys = new Set(keys).size;
    const collisions = {};
    keys.forEach((k, i) => { (collisions[k] = collisions[k] || []).push(parsed[i]); });
    const collided = Object.entries(collisions).filter(([, arr]) => arr.length > 1)
      .map(([k, arr]) => `${arr.length}× same key ${k}  → e.g. ${arr[0]._file || ''} / ${arr[1]._file || ''}`);
    console.log('[graded-visits] selected', all.length, '· HTML', htmls.length, '· parsed', parsed.length, '· unique keys', uniqueKeys, '· skipped', skipped.length, keys, all.map(f => f.name));
    if (fileRef.current) fileRef.current.value = ''; // allow re-selecting the same files
    const res = parsed.length ? await saveGradedVisits(parsed) : { saved: 0, errors: [] };
    setBusy(false);
    setSkipList(skipped.concat(collided.length ? ['— key collisions (parser read same store+date for different files):', ...collided] : []));
    if (res.errors.length) { setMsg({ t: 'err', x: 'Save error: ' + res.errors[0] }); return; }
    const dupN = parsed.length - uniqueKeys;
    const bits = [`Selected ${all.length}`];
    if (notHtml) bits.push(`${htmls.length} HTML (${notHtml} non-HTML ignored)`);
    bits.push(`parsed ${parsed.length}`, `saved ${res.saved}`);
    if (dupN > 0) bits.push(`${dupN} collapsed on duplicate store+date`);
    if (skipped.length) bits.push(`${skipped.length} skipped`);
    setMsg({ t: (notHtml || skipped.length || dupN > 0) ? 'warn' : 'ok', x: bits.join(' · ') });
    if (res.saved) refresh();
  };

  // Standardized location scope (All → State → Patch → Store), matching the rest
  // of the app. null = all stores.
  const activeLocs = useMemo(() => {
    if (selLoc === 'all') return null;
    if (selLoc === 'fl') return new Set(ALL_LOCS.filter(l => FL_LOCS.has(l)));
    if (selLoc === 'ok') return new Set(ALL_LOCS.filter(l => !FL_LOCS.has(l)));
    if (selLoc.startsWith('__patch__')) return new Set(((DEF_SETTINGS.supervisorGroups || {})[selLoc.slice(9)] || []).map(String));
    return new Set([String(selLoc)]);
  }, [selLoc]);
  const filtered = useMemo(() => visits.filter(v =>
    (activeLocs === null || activeLocs.has(String(v.store))) &&
    (typeFilter === 'all' || (v.reportType || 'CFV') === typeFilter)
  ), [visits, activeLocs, typeFilter]);
  const types = useMemo(() => [...new Set(visits.map(v => v.reportType || 'CFV'))], [visits]);
  const stats = useMemo(() => {
    const scored = filtered.filter(v => v.score != null);
    const passes = scored.filter(v => v.score >= PASS).length;
    const app = filtered.filter(v => v.mobileApp === true).length;
    const trad = filtered.filter(v => v.mobileApp === false).length;
    const avg = scored.length ? scored.reduce((a, v) => a + v.score, 0) / scored.length : null;
    return { n: filtered.length, passes, passRate: scored.length ? passes / scored.length * 100 : null, app, trad, avg };
  }, [filtered]);
  const storesWithData = useMemo(() => [...new Set(visits.map(v => String(v.store)))].sort(), [visits]);
  const scopeLabel = selLoc === 'all' ? 'All Stores' : selLoc === 'fl' ? 'Florida' : selLoc === 'ok' ? 'Oklahoma'
    : selLoc.startsWith('__patch__') ? selLoc.slice(9) : sNameC(String(selLoc));

  const csvCell = c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"';
  const exportCSV = () => {
    const cols = ['Type', 'Store', 'NSN', 'Date', 'Daypart', 'Channel', 'Order', 'Score', 'Result', 'Status', 'Modules'];
    const lines = [cols.map(csvCell).join(',')];
    for (const v of filtered) {
      const mods = Object.entries(v.modules || {}).map(([k, m]) => `${k} ${fmtPct(m.pct)}`).join('; ');
      lines.push([v.reportType || 'CFV', sNameC(String(v.store)), v.store, v.dateISO || '', v.daypart || '',
        v.channel || '', v.mobileApp == null ? '' : (v.mobileApp ? 'App' : 'Traditional'),
        v.score == null ? '' : v.score, v.pass == null ? '' : (v.pass ? 'Pass' : 'Fail'), v.status || '', mods].map(csvCell).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `graded-visits-${scopeLabel.replace(/\s+/g, '_')}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };
  const printReport = () => {
    const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const rows = filtered.map(v => {
      const mods = Object.entries(v.modules || {}).map(([k, m]) => `${esc(k)} ${fmtPct(m.pct)}`).join(' · ');
      const order = v.mobileApp == null ? '—' : (v.mobileApp ? 'App' : 'Traditional');
      const res = v.pass == null ? '—' : (v.pass ? 'PASS' : 'FAIL');
      return `<tr><td>${esc(v.reportType || 'CFV')}</td><td>${esc(sNameC(String(v.store)))}</td><td>${esc(niceDate(v.dateISO))}</td><td>${esc(v.channel || v.status || '')}</td><td>${order}</td><td class="n">${v.score == null ? '—' : fmtPct(v.score)}</td><td class="${v.pass ? 'pass' : 'fail'}">${res}</td><td class="mods">${mods}</td></tr>`;
    }).join('');
    const scored = filtered.filter(v => v.score != null);
    const passN = scored.filter(v => v.score >= PASS).length;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Graded Visits — ${esc(scopeLabel)}</title>
      <style>
        body{font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111;margin:28px;font-size:12px}
        h1{font-size:18px;margin:0 0 2px} .sub{color:#666;font-size:11px;margin-bottom:14px}
        .kpis{display:flex;gap:24px;margin-bottom:16px} .kpi b{font-size:18px} .kpi span{color:#666;font-size:10px;display:block;text-transform:uppercase;letter-spacing:.5px}
        table{width:100%;border-collapse:collapse} th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#666;border-bottom:2px solid #f5bc00;padding:6px 8px}
        td{padding:5px 8px;border-bottom:1px solid #eee} td.n{text-align:right;font-variant-numeric:tabular-nums;font-weight:700} td.mods{color:#666;font-size:10px}
        td.pass{color:#158a3a;font-weight:700} td.fail{color:#c0392b;font-weight:700}
        @media print{body{margin:0}}
      </style></head><body>
      <h1>Graded Visits — ${esc(scopeLabel)}</h1>
      <div class="sub">${filtered.length} visit(s) · pass ≥ ${PASS}% · generated ${esc(niceDate(new Date().toISOString().slice(0, 10)))}</div>
      <div class="kpis">
        <div class="kpi"><b>${filtered.length}</b><span>Visits</span></div>
        <div class="kpi"><b>${scored.length ? Math.round(passN / scored.length * 100) : '—'}%</b><span>Pass Rate</span></div>
        <div class="kpi"><b>${scored.length ? fmtPct(scored.reduce((a, v) => a + v.score, 0) / scored.length) : '—'}</b><span>Avg Score</span></div>
      </div>
      <table><thead><tr><th>Type</th><th>Store</th><th>Date</th><th>Channel / Status</th><th>Order</th><th style="text-align:right">Score</th><th>Result</th><th>Modules</th></tr></thead><tbody>${rows}</tbody></table>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { setMsg({ t: 'err', x: 'Pop-up blocked — allow pop-ups to print.' }); return; }
    w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 250);
  };

  const card = (label, value, color) => div({ style: { flex: '1 1 120px', minWidth: 120, background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, padding: '9px 12px' } },
    div({ style: { fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 } }, label),
    div({ style: { fontSize: 18, fontWeight: 800, fontFamily: 'var(--mono)', color: color || 'var(--text)' } }, value));

  const thS = { padding: '6px 8px', fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text3)', borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap', textAlign: 'right', background: 'var(--surf2)' };
  const tdS = { padding: '6px 8px', fontSize: 11, borderBottom: '.5px solid rgba(255,255,255,.04)', whiteSpace: 'nowrap', textAlign: 'right' };

  // Operational context for a visit's store on its date — the restaurant's state
  // at the time of the visit. Hourly DAR when present; otherwise (and alongside)
  // daily totals/averages pulled from whatever auto/manual sources cover the date
  // (Daily Glimpse, DAR summary, Operations/Controls/Labor), plus Peaks dayparts.
  const _sameLoc = (r, store) => String(parseInt(r.loc, 10)) === String(parseInt(store, 10));
  const _sameDay = (r, iso) => { const d = r.date instanceof Date ? r.date : new Date(r.date); return d && !isNaN(d) && d.toISOString().slice(0, 10) === iso; };
  const _pickDay = (arr, v) => (arr || []).filter(r => r && r.loc && r.date && _sameLoc(r, v.store) && _sameDay(r, v.dateISO));
  const _num = (...xs) => { for (const x of xs) if (typeof x === 'number' && !isNaN(x)) return x; return null; };

  const renderContext = (v) => {
    const c = ctx[v.id];
    if (!c || c.loading) return div({ style: { padding: '10px 14px', color: 'var(--text3)', fontSize: 11 } }, 'Loading operational context…');
    const cutoff = completionHour(v.completionTime);
    const hrs = (c.hours || []).filter(x => (x.dt_trans_cnt || 0) > 0 || (x.product_sales || 0) > 0 || (x.actual_punched_hours || 0) > 0);
    const g = c.glimpse;                                   // raw daily_glimpse row for the date (any date)
    const ops = _pickDay(ds?.opsRows, v)[0] || null;
    const ctrl = _pickDay(ds?.ctrlRows, v)[0] || null;
    const lab = _pickDay(ds?.laborRows, v)[0] || null;
    const qsr = _pickDay(ds?.qsrActSummaryRows, v)[0] || null;
    const psvc = _pickDay(ds?.peaksSvcRows, v);
    const psale = _pickDay(ds?.peaksSalesRows, v);
    // Merged daily metrics — best available source wins.
    const daily = {
      oepe:   _num(g && g.oepe, ops && ops.oepe),
      kvst:   _num(g && g.kvst, ops && ops.kvst),
      kvsH:   _num(g && g.kvs_healthy, ops && ops.kvsHealthy),      // 0-1
      r2p:    _num(ops && ops.r2p, psvc.length ? psvc.reduce((a, r) => a + (r.r2p || 0), 0) / psvc.filter(r => r.r2p).length : null),
      laborPct: _num(g && g.labor_pct, ctrl && ctrl.laborPct, lab && lab.laborPct),  // fraction
      parked: _num(g && g.parked_pct, ops && ops.park),            // fraction
      tpph:   _num(ctrl && ctrl.tpph, lab && lab.tpph),
      sales:  _num(qsr && qsr.sales, lab && lab.sales, g && g.all_net_sales),
      gc:     _num(qsr && qsr.gc, lab && lab.gc, g && g.gc),
    };
    const hasDaily = Object.values(daily).some(x => x != null);
    if (!hrs.length && !hasDaily && !psvc.length) return div({ style: { padding: '10px 14px', color: 'var(--text3)', fontSize: 11, lineHeight: 1.6 } },
      'No operational data found for ' + niceDate(v.dateISO) + ' in any source (DAR, Glimpse, Ops/Controls/Labor, Peaks). If the visit predates your DAR history, run the backfill for that window.');
    const chip = (l, val) => val == null ? null : div({ style: { display: 'flex', flexDirection: 'column', minWidth: 62 } },
      div({ style: { fontSize: 8, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px' } }, l),
      div({ style: { fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text)' } }, val));
    const th2 = { padding: '4px 7px', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', color: 'var(--text3)', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '.5px solid var(--bdr)' };
    const td2 = { padding: '4px 7px', fontSize: 10.5, textAlign: 'right', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' };
    return div({ style: { padding: '10px 14px', background: 'rgba(255,255,255,.02)' } },
      div({ style: { fontSize: 9, fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 } }, 'Operational context — ' + niceDate(v.dateISO) + (v.daypart ? ' · ' + v.daypart : '')),
      // Daily summary chips (from whichever source covers the date)
      hasDaily && div({ style: { display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10, paddingBottom: 8, borderBottom: '.5px solid var(--bdr)' } },
        chip('OEPE', daily.oepe != null ? Math.round(daily.oepe) + 's' : null),
        chip('R2P', daily.r2p != null ? Math.round(daily.r2p) + 's' : null),
        chip('KVS Time', daily.kvst != null ? Math.round(daily.kvst) + 's' : null),
        chip('KVS Healthy', daily.kvsH != null ? Math.round(daily.kvsH * 100) + '%' : null),
        chip('Labor %', daily.laborPct != null ? (daily.laborPct * 100).toFixed(1) + '%' : null),
        chip('DT Parked', daily.parked != null ? (daily.parked * 100).toFixed(1) + '%' : null),
        chip('TPPH', daily.tpph != null ? daily.tpph.toFixed(1) : null),
        chip('Sales', daily.sales != null ? '$' + Math.round(daily.sales).toLocaleString() : null),
        chip('Guests', daily.gc != null ? Math.round(daily.gc).toLocaleString() : null)),
      // Peaks by daypart (segment view) when available
      psvc.length > 0 && div({ style: { marginBottom: 10 } },
        div({ style: { fontSize: 8.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 } }, 'By Daypart (3 Peaks)'),
        h('table', { style: { borderCollapse: 'collapse' } },
          h('thead', null, h('tr', null, ...['Daypart', 'Sales', 'OEPE', 'R2P'].map((l, i) => h('th', { key: i, style: { ...th2, textAlign: i === 0 ? 'left' : 'right', padding: '3px 12px 3px 0' } }, l)))),
          h('tbody', null, ...psvc.map((r, i) => {
            const sale = psale.find(s => s.slice === r.slice);
            return h('tr', { key: i },
              h('td', { style: { ...td2, textAlign: 'left', color: 'var(--text2)', paddingRight: 12 } }, r.slice || '—'),
              h('td', { style: { ...td2, paddingRight: 12 } }, sale && sale.netSales ? '$' + Math.round(sale.netSales).toLocaleString() : '—'),
              h('td', { style: { ...td2, paddingRight: 12 } }, r.oepe ? Math.round(r.oepe) + 's' : '—'),
              h('td', { style: { ...td2, paddingRight: 12 } }, r.r2p ? Math.round(r.r2p) + 's' : '—'));
          })))),
      // Hourly DAR table (most granular) when present
      hrs.length > 0 && div({ style: { overflowX: 'auto' } },
        div({ style: { fontSize: 8.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 } }, 'Hourly (DAR)'),
        h('table', { style: { width: '100%', borderCollapse: 'collapse', minWidth: 660 } },
          h('thead', null, h('tr', null,
            ...['Hour', 'Sales', 'DT', 'Front Ctr', 'Kitchen', 'Bev', 'Punch', 'Need', 'Sched', 'vs Need', 'KVS OK'].map((l, i) => h('th', { key: i, style: { ...th2, textAlign: i === 0 ? 'left' : 'right' } }, l)))),
          h('tbody', null, ...hrs.map((x, i) => {
            const dt = secOf(x.dt_untilserve, x.dt_trans_cnt), fc = secOf(x.fc_untilserve, x.fc_trans_cnt);
            const kit = secOf((x.mfy1_untilserve || 0) + (x.mfy2_untilserve || 0), (x.mfy1_trans_cnt || 0) + (x.mfy2_trans_cnt || 0));
            const bev = secOf(x.bev_untilserve, x.bev_trans_cnt);
            const punch = x.actual_punched_hours, need = x.total_needed_hours, sched = x.total_scheduled_hours;
            const gap = (punch != null && need != null) ? punch - need : null;
            const kvs = (x.healthy_count + x.unhealthy_count) > 0 ? x.healthy_count / (x.healthy_count + x.unhealthy_count) * 100 : null;
            const visitHr = cutoff && parseInt(x.hour_slot, 10) === cutoff;
            return h('tr', { key: i, style: { borderBottom: '.5px solid rgba(255,255,255,.03)', background: visitHr ? 'rgba(245,188,0,.12)' : 'transparent' } },
              h('td', { style: { ...td2, textAlign: 'left', color: 'var(--text2)' } }, hourLabel(x.hour_slot) + (visitHr ? ' ◂ visit' : '')),
              h('td', { style: td2 }, x.product_sales ? '$' + Math.round(x.product_sales).toLocaleString() : '—'),
              h('td', { style: { ...td2, fontWeight: dt != null && dt > 240 ? 700 : 400, color: dt != null && dt > 240 ? '#ef4444' : 'var(--text)' } }, fmtSec(dt)),
              h('td', { style: td2 }, fmtSec(fc)),
              h('td', { style: td2 }, fmtSec(kit)),
              h('td', { style: td2 }, fmtSec(bev)),
              h('td', { style: td2 }, punch != null ? punch.toFixed(1) : '—'),
              h('td', { style: td2 }, need != null ? need.toFixed(1) : '—'),
              h('td', { style: td2 }, sched != null ? sched.toFixed(1) : '—'),
              h('td', { style: { ...td2, fontWeight: gap != null && gap <= -1 ? 700 : 400, color: gap == null ? 'var(--text3)' : gap <= -1 ? '#ef4444' : gap > 1.5 ? '#f59e0b' : '#10b981' } }, gap == null ? '—' : (gap > 0 ? '+' : '') + gap.toFixed(1)),
              h('td', { style: { ...td2, color: kvs == null ? 'var(--text3)' : kvs >= 90 ? '#10b981' : '#f59e0b' } }, kvs == null ? '—' : Math.round(kvs) + '%'));
          })))),
      div({ style: { fontSize: 8, color: 'var(--text3)', marginTop: 6 } }, 'Daily = best available of Glimpse / DAR summary / Ops / Controls / Labor. Hourly = qsr_daily_activity (DT/FC/Kitchen/Bev serve, punched vs needed vs scheduled, KVS). Dayparts = 3 Peaks.'));
  };

  return div({ style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 460, display: 'flex', flexDirection: 'column', paddingTop: 20 } },
    div({ style: { flex: '0 0 20px', cursor: 'pointer' }, onClick: onClose }),
    div({ style: { flex: 1, background: 'var(--surf)', maxWidth: 1080, margin: '0 auto', width: 'calc(100% - 32px)', borderRadius: 'var(--rl) var(--rl) 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -8px 40px rgba(0,0,0,.4)' } },

      // Header
      div({ style: { padding: '10px 16px', borderBottom: '.5px solid var(--bdr)', flexShrink: 0, background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        span({ style: { fontSize: 18 } }, '📋'),
        div({ style: { flex: 1 } },
          div({ style: { fontSize: 14, fontWeight: 800, color: 'var(--text)' } }, 'Graded Visits'),
          div({ style: { fontSize: 9, color: 'var(--text3)' } }, 'CFV (channel · app) & RGR (whole-restaurant, component-scored) · pass ≥ ' + PASS + '% · Ecosure slots in once uploaded')),
        types.length > 1 && h('select', { value: typeFilter, onChange: e => setTypeFilter(e.target.value), style: { background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 10, padding: '3px 7px' } },
          h('option', { value: 'all' }, 'All Types'),
          types.map(t => h('option', { key: t, value: t }, t))),
        h('select', { value: selLoc, onChange: e => setSelLoc(e.target.value), style: { background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 10, padding: '3px 7px', colorScheme: 'dark' } },
          h('option', { value: 'all' }, 'All Stores'),
          h('option', { value: 'fl' }, 'Florida'),
          h('option', { value: 'ok' }, 'Oklahoma'),
          h('optgroup', { label: '— Patches —' },
            ...Object.entries(DEF_SETTINGS.supervisorGroups || {}).map(([name, locs]) =>
              h('option', { key: name, value: '__patch__' + name }, name.split(' ')[0] + ' Patch (' + locs.length + ')'))),
          h('optgroup', { label: '— Florida —' },
            ...ALL_LOCS.filter(l => FL_LOCS.has(l)).sort((a, b) => STORE_NAMES[a].localeCompare(STORE_NAMES[b])).map(l => h('option', { key: l, value: l }, STORE_NAMES[l]))),
          h('optgroup', { label: '— Oklahoma —' },
            ...ALL_LOCS.filter(l => !FL_LOCS.has(l)).sort((a, b) => STORE_NAMES[a].localeCompare(STORE_NAMES[b])).map(l => h('option', { key: l, value: l }, STORE_NAMES[l])))),
        btn({ onClick: exportCSV, disabled: !filtered.length, title: 'Download CSV', style: { padding: '3px 9px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', fontSize: 11, fontWeight: 600, cursor: filtered.length ? 'pointer' : 'default' } }, '⬇ CSV'),
        btn({ onClick: printReport, disabled: !filtered.length, title: 'Print / PDF', style: { padding: '3px 9px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', fontSize: 11, fontWeight: 600, cursor: filtered.length ? 'pointer' : 'default' } }, '🖨 Print'),
        btn({ className: 'btn btn-sm', style: { color: 'var(--text3)' }, onClick: onClose }, '✕')),

      // Body
      div({ style: { flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 } },

        // Upload / drop zone
        div({
          onDragOver: e => { e.preventDefault(); if (!dragOver) setDragOver(true); },
          onDragLeave: e => { e.preventDefault(); setDragOver(false); },
          onDrop: e => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); },
          style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px', background: dragOver ? 'rgba(245,188,0,.16)' : 'rgba(245,188,0,.05)', border: `1px dashed rgba(245,188,0,${dragOver ? '.75' : '.3'})`, borderRadius: 8, transition: 'background .1s' } },
          btn({ onClick: () => fileRef.current && fileRef.current.click(), disabled: busy,
            style: { padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(245,158,11,.4)', background: 'rgba(245,158,11,.1)', color: 'var(--amber)', fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer' } },
            busy ? 'Importing…' : '＋ Upload files'),
          btn({ onClick: () => dirRef.current && dirRef.current.click(), disabled: busy,
            style: { padding: '5px 12px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer' } },
            '📁 Upload folder'),
          h('input', { ref: fileRef, type: 'file', multiple: true, style: { display: 'none' }, onChange: e => onFiles(e.target.files) }),
          h('input', { ref: dirRef, type: 'file', webkitdirectory: '', directory: '', multiple: true, style: { display: 'none' }, onChange: e => onFiles(e.target.files) }),
          span({ style: { fontSize: 10, color: dragOver ? 'var(--amber)' : 'var(--text3)' } }, dragOver ? 'Drop to import' : 'Drag files or a whole folder here (or use the buttons). CFV & RGR HTML. Re-import overwrites same store+date.'),
          msg && span({ style: { fontSize: 11, fontWeight: 600, marginLeft: 'auto', color: msg.t === 'ok' ? '#10b981' : msg.t === 'warn' ? '#f59e0b' : '#ef4444' } }, msg.x)),

        // Skipped files — so you can see exactly which didn't import and why.
        skipList.length > 0 && div({ style: { padding: '8px 12px', background: 'rgba(239,68,68,.05)', border: '.5px solid rgba(239,68,68,.2)', borderRadius: 8, fontSize: 10, color: 'var(--text2)' } },
          div({ style: { fontWeight: 700, color: '#f59e0b', marginBottom: 4 } }, `Skipped ${skipList.length} file${skipList.length > 1 ? 's' : ''} (send me one and I'll add its format):`),
          div({ style: { display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 120, overflowY: 'auto', fontFamily: 'var(--mono)', fontSize: 9 } },
            skipList.map((s, i) => div({ key: i, style: { color: 'var(--text3)' } }, '• ' + s)))),

        loading ? div({ style: { textAlign: 'center', padding: '40px', color: 'var(--text3)', fontSize: 12 } }, 'Loading visits…')
          : visits.length === 0 ? div({ style: { textAlign: 'center', padding: '48px 20px', color: 'var(--text3)', fontSize: 12, border: '1px dashed var(--bdr)', borderRadius: 8 } },
            div({ style: { fontSize: 26, marginBottom: 10 } }, '📋'),
            div({ style: { fontWeight: 700, marginBottom: 6 } }, 'No graded visits yet'),
            'Upload your visit report HTML exports (CFV or RGR) above to get started.')
            : [
              // Summary cards
              div({ key: 'cards', style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
                card('Visits', String(stats.n)),
                card('Pass Rate', stats.passRate != null ? Math.round(stats.passRate) + '%' : '—', scoreColor(stats.passRate)),
                card('Avg Score', stats.avg != null ? fmtPct(stats.avg) : '—', scoreColor(stats.avg)),
                card('App / Traditional', stats.app + ' / ' + stats.trad)),

              // Visits table
              div({ key: 'tbl', style: { background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, overflow: 'auto' } },
                h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
                  h('thead', null, h('tr', null,
                    h('th', { style: { ...thS, textAlign: 'left' } }, 'Type'),
                    h('th', { style: { ...thS, textAlign: 'left' } }, 'Store'),
                    h('th', { style: { ...thS, textAlign: 'left' } }, 'Date'),
                    h('th', { style: { ...thS, textAlign: 'left' } }, 'Detail'),
                    h('th', { style: thS }, 'Score'),
                    h('th', { style: thS }, 'Result'),
                    h('th', { style: { ...thS, width: 20 } }, ''))),
                  h('tbody', null, ...filtered.map((v, i) => {
                    const isRGR = (v.reportType || 'CFV') === 'RGR';
                    const isOpen = expanded === v.id;
                    const compTip = Object.entries(v.modules || {}).map(([k, m]) => `${k}: ${fmtPct(m.pct)}`).join('  ·  ');
                    const belowN = Object.values(v.modules || {}).filter(m => m.pct < 80).length;
                    const detail = isRGR
                      ? span({ title: compTip },
                          v.status ? span({ style: { fontWeight: 600, color: 'var(--text2)' } }, v.status) : null,
                          span({ style: { marginLeft: v.status ? 6 : 0, color: belowN ? '#f59e0b' : 'var(--text3)' } }, belowN + ' comp <80'))
                      : span(null,
                          span({ style: { color: 'var(--text2)' } }, v.channel || '—'),
                          v.mobileApp != null ? span({ style: { marginLeft: 6, color: v.mobileApp ? '#60a5fa' : 'var(--text3)', fontWeight: v.mobileApp ? 700 : 400 } }, v.mobileApp ? '📱 App' : 'Traditional') : null);
                    return h(React.Fragment, { key: v.id || i },
                      h('tr', { onClick: () => toggleContext(v), title: 'Show operational context at time of visit', style: { cursor: 'pointer', background: isOpen ? 'rgba(245,188,0,.06)' : 'transparent' } },
                        h('td', { style: { ...tdS, textAlign: 'left' } }, span({ style: { fontSize: 8.5, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: (isRGR ? '#a78bfa' : '#60a5fa') + '22', color: isRGR ? '#a78bfa' : '#60a5fa' } }, v.reportType || 'CFV')),
                        h('td', { style: { ...tdS, textAlign: 'left', fontWeight: 600 } }, sNameC(String(v.store))),
                        h('td', { style: { ...tdS, textAlign: 'left', color: 'var(--text2)' } }, niceDate(v.dateISO)),
                        h('td', { style: { ...tdS, textAlign: 'left', fontSize: 10 } }, detail),
                        h('td', { style: { ...tdS, fontFamily: 'var(--mono)', fontWeight: 800, color: scoreColor(v.score) } }, v.score != null ? fmtPct(v.score) : '—'),
                        h('td', { style: tdS }, v.pass == null ? '—' : span({ style: { fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: (v.pass ? '#10b981' : '#ef4444') + '22', color: v.pass ? '#10b981' : '#ef4444' } }, v.pass ? '✓ Pass' : '✗ Fail')),
                        h('td', { style: { ...tdS, color: 'var(--text3)', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' } }, '›')),
                      isOpen && h('tr', null, h('td', { colSpan: 7, style: { padding: 0 } }, renderContext(v))));
                  })))),
            ]),

      // Footer
      div({ style: { padding: '6px 16px', borderTop: '.5px solid var(--bdr)', flexShrink: 0, fontSize: 8, color: 'var(--text3)', background: 'var(--surf2)' } },
        'Channel = primary scored module (Drive Thru / Curbside / Front Counter / Delivery). App = Curbside (mobile by nature) or the DT “using your McDonald’s App” question. Foundation for the Graded-Visit Predictor.')
    ));
}
