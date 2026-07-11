// @ts-nocheck
import * as React from 'react';
import { Chart } from 'chart.js/auto';
import { loadDtHistory } from '../lib/supabase.js';
import { STORE_NAMES, sNameC, getStoreOrg, DEF_SETTINGS } from '../constants.js';

const h = React.createElement;
const div  = (p,...c) => h('div',  p, ...c);
const span = (p,...c) => h('span', p, ...c);
const btn  = (p,...c) => h('button', p, ...c);

const DT_GREEN = 200; // seconds — on target
const DT_AMB   = 240; // seconds — caution

const fmtDT = (s) => s == null || isNaN(s) ? '—' : Math.round(s) + 's';

const dtColor = (s) =>
  s == null ? 'var(--text3)' : s < DT_GREEN ? '#10b981' : s < DT_AMB ? '#f59e0b' : '#ef4444';

const dtBg = (s) =>
  s == null ? 'transparent' : s < DT_GREEN ? 'rgba(16,185,129,.08)' : s < DT_AMB ? 'rgba(245,158,11,.08)' : 'rgba(239,68,68,.08)';

const ALL_LOCS = Object.keys(STORE_NAMES);
const FL_LOCS  = new Set(ALL_LOCS.filter(l => getStoreOrg(l) === 'emerald'));

const HOUR_LABELS = {
  '05:00':'5am','06:00':'6am','07:00':'7am','08:00':'8am','09:00':'9am','10:00':'10am',
  '11:00':'11am','12:00':'12pm','13:00':'1pm','14:00':'2pm','15:00':'3pm','16:00':'4pm',
  '17:00':'5pm','18:00':'6pm','19:00':'7pm','20:00':'8pm','21:00':'9pm','22:00':'10pm',
  '23:00':'11pm','00:00':'12am','01:00':'1am','02:00':'2am',
};

// Daypart buckets (inclusive of start hour slot, exclusive of end)
const DAYPARTS = [
  { id:'breakfast', label:'Breakfast', hours:['05:00','06:00','07:00','08:00','09:00','10:00'] },
  { id:'lunch',     label:'Lunch',     hours:['11:00','12:00','13:00'] },
  { id:'pm',        label:'PM',        hours:['14:00','15:00','16:00'] },
  { id:'dinner',    label:'Dinner',    hours:['17:00','18:00','19:00','20:00'] },
  { id:'late',      label:'Late Night',hours:['21:00','22:00','23:00','00:00'] },
];

const PERIODS = [
  { id: '30d',  label: '30 Days',  days: 30  },
  { id: '60d',  label: '60 Days',  days: 60  },
  { id: '90d',  label: '90 Days',  days: 90  },
];

// ── Chart.js helpers ─────────────────────────────────────────────────────────
const TT = { backgroundColor:'#1a2332', titleColor:'#e2e8f0', bodyColor:'#94a3b8',
              borderColor:'#1e2d3d', borderWidth:1 };
const AX = { ticks:{ color:'#64748b', font:{ size:9 }}, grid:{ color:'rgba(255,255,255,.04)' }};

function useChart(canvasRef, buildFn, deps) {
  const chartRef = React.useRef(null);
  React.useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    try { chartRef.current = buildFn(canvasRef.current); }
    catch(e) { console.warn('Chart error:', e); }
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, deps); // eslint-disable-line
}

// ── Trend chart (weekly aggregation) ─────────────────────────────────────────
function DtTrendChart({ rows, activeLocs, label }) {
  const ref = React.useRef(null);

  const weeklyData = React.useMemo(() => {
    const map = {};
    for (const r of rows) {
      const loc = String(parseInt(r.loc, 10));
      if (!activeLocs.includes(loc)) continue;
      if (!r.dt || !r.dt_trans_cnt) continue;
      // Truncate to Monday of week
      const d = new Date(r.dt + 'T00:00:00');
      const day = d.getDay();
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      const wk = d.toISOString().slice(0, 10);
      if (!map[wk]) map[wk] = { totalUs: 0, totalCnt: 0, date: new Date(d) };
      map[wk].totalUs  += r.dt_untilserve || 0;
      map[wk].totalCnt += r.dt_trans_cnt  || 0;
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, d]) => ({ date: d.date, avg: d.totalCnt > 0 ? d.totalUs / d.totalCnt / 1000 : null }))
      .filter(r => r.avg != null);
  }, [rows, activeLocs.join(',')]);

  useChart(ref, canvas => {
    if (!weeklyData.length) return null;
    const labels = weeklyData.map(r => r.date.toLocaleDateString('en-US', { month:'short', day:'numeric' }));
    const data   = weeklyData.map(r => Math.round(r.avg * 10) / 10);
    const ptColors = data.map(v => v < DT_GREEN ? '#10b981' : v < DT_AMB ? '#f59e0b' : '#ef4444');
    // Reference lines as flat datasets (no annotation plugin needed)
    const refLine = (val, color, lbl) => ({
      label: lbl, data: labels.map(() => val),
      borderColor: color, borderWidth: 1, borderDash: [4, 4],
      pointRadius: 0, fill: false, tension: 0,
    });
    return new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          refLine(DT_GREEN, 'rgba(16,185,129,.4)', '🟢 200s target'),
          refLine(DT_AMB,   'rgba(239,68,68,.35)',  '🔴 240s caution'),
          {
            label: 'Avg DT',
            data,
            borderColor: '#60a5fa',
            backgroundColor: 'rgba(96,165,250,.08)',
            borderWidth: 2.5,
            tension: 0.35,
            fill: true,
            pointBackgroundColor: ptColors,
            pointBorderColor: ptColors,
            pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { ...TT, callbacks: {
            label: c => c.datasetIndex === 2 ? `${label}: ${c.raw}s` : c.dataset.label,
          }},
        },
        scales: {
          x: { ...AX },
          y: { ...AX, min: 0, suggestedMax: 300,
               ticks: { ...AX.ticks, callback: v => v + 's' }},
        },
      },
    });
  }, [weeklyData]);

  if (!weeklyData.length) return null;
  return div({ style:{ height:160 }}, h('canvas', { ref }));
}

// ── Daypart bar chart ─────────────────────────────────────────────────────────
function DtDaypartChart({ daypartData }) {
  const ref = React.useRef(null);
  useChart(ref, canvas => {
    if (!daypartData.length) return null;
    const labels = daypartData.map(d => d.label);
    const data   = daypartData.map(d => d.avg != null ? Math.round(d.avg * 10) / 10 : null);
    const colors = data.map(v => v < DT_GREEN ? 'rgba(16,185,129,.7)' : v < DT_AMB ? 'rgba(245,158,11,.7)' : 'rgba(239,68,68,.7)');
    return new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Avg DT by daypart',
          data,
          backgroundColor: colors,
          borderRadius: 3,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { ...TT, callbacks: { label: c => `Avg DT: ${c.raw}s` }},
        },
        scales: {
          x: { ...AX },
          y: { ...AX, min: 0, suggestedMax: 300, ticks: { ...AX.ticks, callback: v => v + 's' }},
        },
      },
    });
  }, [daypartData]);
  if (!daypartData.length) return null;
  return div({ style:{ height:130 }}, h('canvas', { ref }));
}

// ── Sub-components ───────────────────────────────────────────────────────────
function SummaryCard({ label, value, sub, color }) {
  return div({ style:{ background:'var(--surf2)', border:'.5px solid var(--bdr)', borderRadius:'var(--r)',
    padding:'10px 14px', minWidth:130 }},
    div({ style:{ fontSize:'7.5px', color:'var(--text3)', textTransform:'uppercase',
      letterSpacing:'.5px', fontWeight:700, marginBottom:4 }}, label),
    div({ style:{ fontSize:'22px', fontWeight:800, color: color || 'var(--text)', lineHeight:1 }}, value),
    sub && div({ style:{ fontSize:'8px', color:'var(--text3)', marginTop:3 }}, sub),
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────
export function DTSpeedOfServicePanel({ stores, onClose }) {
  const [period,    setPeriod]    = React.useState('90d');
  const [orgFilter, setOrgFilter] = React.useState('all');
  const [sortCol,   setSortCol]   = React.useState('avg');
  const [sortDir,   setSortDir]   = React.useState(1); // 1=asc (fast first), -1=desc
  const [loading,   setLoading]   = React.useState(true);
  const [rows,      setRows]      = React.useState([]);

  const days = PERIODS.find(p => p.id === period)?.days || 90;

  React.useEffect(() => {
    setLoading(true);
    loadDtHistory(days).then(data => {
      setRows(data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [days]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const activeLocs = React.useMemo(() => {
    const storeLocs = new Set((stores || []).map(s => String(s.loc)));
    const base = ALL_LOCS.filter(l => storeLocs.has(l) || storeLocs.size === 0);
    if (orgFilter === 'fl') return base.filter(l =>  FL_LOCS.has(l));
    if (orgFilter === 'ok') return base.filter(l => !FL_LOCS.has(l));
    if (orgFilter.startsWith('__patch__')) {
      const patchName = orgFilter.slice(9);
      const patchLocs = new Set((DEF_SETTINGS.supervisorGroups?.[patchName] || []).map(String));
      return base.filter(l => patchLocs.has(l));
    }
    if (orgFilter !== 'all') return base.filter(l => l === orgFilter);
    return base;
  }, [stores, orgFilter]);

  const midDt = React.useMemo(() => {
    return new Date(Date.now() - (days / 2) * 86400000).toISOString().slice(0, 10);
  }, [days]);

  const storeData = React.useMemo(() => {
    const map = {};
    for (const r of rows) {
      const loc = String(parseInt(r.loc, 10));
      if (!activeLocs.includes(loc)) continue;
      if (!map[loc]) map[loc] = { totalUs: 0, totalCnt: 0, earlyUs: 0, earlyCnt: 0, lateUs: 0, lateCnt: 0 };
      map[loc].totalUs  += r.dt_untilserve || 0;
      map[loc].totalCnt += r.dt_trans_cnt  || 0;
      if (r.dt < midDt) { map[loc].earlyUs += r.dt_untilserve || 0; map[loc].earlyCnt += r.dt_trans_cnt || 0; }
      else              { map[loc].lateUs  += r.dt_untilserve || 0; map[loc].lateCnt  += r.dt_trans_cnt || 0; }
    }
    return Object.entries(map).map(([loc, d]) => {
      const avg   = d.totalCnt > 0 ? d.totalUs  / d.totalCnt  / 1000 : null;
      const early = d.earlyCnt > 0 ? d.earlyUs  / d.earlyCnt  / 1000 : null;
      const late  = d.lateCnt  > 0 ? d.lateUs   / d.lateCnt   / 1000 : null;
      const trend = (early != null && late != null) ? late - early : null; // negative = improving
      return { loc, avg, trans: d.totalCnt, trend };
    });
  }, [rows, activeLocs, midDt]);

  const hourData = React.useMemo(() => {
    const map = {};
    for (const r of rows) {
      const loc = String(parseInt(r.loc, 10));
      if (!activeLocs.includes(loc)) continue;
      const slot = r.hour_slot;
      if (!map[slot]) map[slot] = { totalUs: 0, totalCnt: 0 };
      map[slot].totalUs  += r.dt_untilserve || 0;
      map[slot].totalCnt += r.dt_trans_cnt  || 0;
    }
    return Object.entries(map)
      .map(([slot, d]) => ({
        slot,
        label: HOUR_LABELS[slot] || slot,
        avg: d.totalCnt > 0 ? d.totalUs / d.totalCnt / 1000 : null,
        trans: d.totalCnt,
      }))
      .filter(r => r.avg != null)
      .sort((a, b) => a.slot.localeCompare(b.slot));
  }, [rows, activeLocs]);

  // Daypart aggregation (Breakfast / Lunch / PM / Dinner / Late Night)
  const daypartData = React.useMemo(() => {
    const hourMap = {};
    for (const r of hourData) hourMap[r.slot] = r;
    return DAYPARTS.map(dp => {
      const matching = dp.hours.map(h => hourMap[h]).filter(Boolean);
      const totalUs  = matching.reduce((a, r) => a + r.avg * r.trans, 0);
      const totalCnt = matching.reduce((a, r) => a + r.trans, 0);
      return { ...dp, avg: totalCnt > 0 ? totalUs / totalCnt : null, trans: totalCnt };
    });
  }, [hourData]);

  // District summary
  const districtAvg = React.useMemo(() => {
    const total = storeData.reduce((a, s) => a + (s.avg != null ? s.avg * s.trans : 0), 0);
    const cnt   = storeData.reduce((a, s) => a + s.trans, 0);
    return cnt > 0 ? total / cnt : null;
  }, [storeData]);

  const totalTrans  = storeData.reduce((a, s) => a + s.trans, 0);
  const validStores = storeData.filter(s => s.avg != null);
  const bestStore   = validStores.length ? validStores.reduce((a, b) => a.avg < b.avg ? a : b) : null;
  const worstStore  = validStores.length ? validStores.reduce((a, b) => a.avg > b.avg ? a : b) : null;
  const bestDp      = daypartData.filter(d => d.avg != null).reduce((a, b) => (!a || b.avg < a.avg) ? b : a, null);
  const worstDp     = daypartData.filter(d => d.avg != null).reduce((a, b) => (!a || b.avg > a.avg) ? b : a, null);

  // Sorted store list
  const sorted = [...storeData].sort((a, b) => {
    const va = sortCol === 'trans' ? a.trans : sortCol === 'trend' ? (a.trend ?? 999) : (a.avg ?? 999);
    const vb = sortCol === 'trans' ? b.trans : sortCol === 'trend' ? (b.trend ?? 999) : (b.avg ?? 999);
    return (va - vb) * sortDir;
  });

  const thClick = col => { if (sortCol === col) setSortDir(d => -d); else { setSortCol(col); setSortDir(1); } };
  const thS = col => ({
    fontSize:'7.5px', fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px',
    color: sortCol === col ? 'var(--accent)' : 'var(--text3)',
    padding:'5px 10px', textAlign:'right', borderBottom:'.5px solid var(--bdr)',
    background:'var(--surf2)', whiteSpace:'nowrap', cursor:'pointer', userSelect:'none',
  });

  const selStyle = { fontSize:'9px', padding:'2px 7px', background:'var(--surf2)',
    border:'.5px solid var(--bdr)', borderRadius:'var(--r)', color:'var(--text)', colorScheme:'dark', cursor:'pointer' };

  const maxTrans = Math.max(1, ...hourData.map(r => r.trans));

  // Label for trend chart tooltip
  const trendLabel = orgFilter === 'all' ? 'District avg'
    : orgFilter === 'fl' ? 'Florida avg'
    : orgFilter === 'ok' ? 'Oklahoma avg'
    : orgFilter.startsWith('__patch__') ? orgFilter.slice(9).split(' ')[0] + ' Patch'
    : (STORE_NAMES[orgFilter] || orgFilter);

  return div({ style:{ position:'fixed', inset:0, background:'rgba(0,0,0,.82)', zIndex:460,
    display:'flex', flexDirection:'column', paddingTop:20 }},
    div({ style:{ flex:'0 0 20px', cursor:'pointer' }, onClick:onClose }),
    div({ style:{ flex:1, background:'var(--surf)', maxWidth:1020, margin:'0 auto',
      width:'calc(100% - 32px)', borderRadius:'var(--rl) var(--rl) 0 0',
      display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 -8px 40px rgba(0,0,0,.4)' }},

      // Header
      div({ style:{ padding:'10px 16px', borderBottom:'.5px solid var(--bdr)', flexShrink:0,
        background:'var(--surf2)', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }},
        span({ style:{ fontSize:'18px' }}, '🚗'),
        div({ style:{ flex:1 }},
          div({ style:{ fontSize:'14px', fontWeight:800, color:'var(--text)' }}, 'DT Speed of Service'),
          div({ style:{ fontSize:'9px', color:'var(--text3)' }},
            'Drive-through serve time analytics · from qsr_daily_activity · green <200s · amber <240s · red ≥240s'),
        ),
        h('select', { value:period, onChange:e=>setPeriod(e.target.value), style:selStyle },
          ...PERIODS.map(p => h('option', { key:p.id, value:p.id }, p.label))),
        h('select', { value:orgFilter, onChange:e=>setOrgFilter(e.target.value), style:selStyle },
          h('option', { value:'all' }, 'All Stores'),
          h('option', { value:'fl'  }, 'Florida'),
          h('option', { value:'ok'  }, 'Oklahoma'),
          h('optgroup', { label:'— Patches —' },
            ...Object.entries(DEF_SETTINGS.supervisorGroups || {}).map(([name, locs]) =>
              h('option', { key:name, value:'__patch__'+name },
                name.split(' ')[0] + ' Patch (' + locs.length + ' stores)'))),
          h('optgroup', { label:'— Florida —' },
            ...ALL_LOCS.filter(l =>  FL_LOCS.has(l)).sort((a,b)=>STORE_NAMES[a].localeCompare(STORE_NAMES[b]))
              .map(l => h('option', { key:l, value:l }, STORE_NAMES[l]))),
          h('optgroup', { label:'— Oklahoma —' },
            ...ALL_LOCS.filter(l => !FL_LOCS.has(l)).sort((a,b)=>STORE_NAMES[a].localeCompare(STORE_NAMES[b]))
              .map(l => h('option', { key:l, value:l }, STORE_NAMES[l]))),
        ),
        btn({ className:'btn btn-sm', style:{ color:'var(--text3)' }, onClick:onClose }, '✕'),
      ),

      // Content
      loading
        ? div({ style:{ flex:1, display:'flex', alignItems:'center', justifyContent:'center',
            color:'var(--text3)', fontSize:'11px' }}, 'Loading DT history…')
        : rows.length === 0
        ? div({ style:{ flex:1, display:'flex', alignItems:'center', justifyContent:'center',
            color:'var(--text3)', fontSize:'11px' }},
            'No DT data found — check qsr_daily_activity has dt_trans_cnt > 0 rows')
        : div({ style:{ flex:1, overflowY:'auto', padding:'12px 16px', display:'flex',
            flexDirection:'column', gap:14 }},

            // ── Summary cards ─────────────────────────────────────
            div({ style:{ display:'flex', gap:10, flexWrap:'wrap' }},
              h(SummaryCard, { label:'District Avg DT', value:fmtDT(districtAvg),
                color:dtColor(districtAvg), sub:`${totalTrans.toLocaleString()} transactions` }),
              bestStore  && h(SummaryCard, { label:'Fastest Store',  value:sNameC(bestStore.loc),  color:'#10b981', sub:fmtDT(bestStore.avg)  }),
              worstStore && h(SummaryCard, { label:'Needs Attention', value:sNameC(worstStore.loc), color:'#ef4444', sub:fmtDT(worstStore.avg) }),
              bestDp     && h(SummaryCard, { label:'Fastest Daypart', value:bestDp.label,           color:'#10b981', sub:fmtDT(bestDp.avg)     }),
              worstDp    && h(SummaryCard, { label:'Slowest Daypart', value:worstDp.label,          color:'#ef4444', sub:fmtDT(worstDp.avg)    }),
            ),

            // ── Weekly trend chart ────────────────────────────────
            div({ style:{ background:'var(--surf2)', border:'.5px solid var(--bdr)', borderRadius:'var(--r)',
              padding:'10px 12px' }},
              div({ style:{ fontSize:'10px', fontWeight:800, color:'var(--text)', marginBottom:6 }},
                `Weekly Trend — ${trendLabel} avg DT (${period})`),
              h(DtTrendChart, { rows, activeLocs, label: trendLabel }),
            ),

            // ── Daypart bar chart ─────────────────────────────────
            div({ style:{ background:'var(--surf2)', border:'.5px solid var(--bdr)', borderRadius:'var(--r)',
              padding:'10px 12px' }},
              div({ style:{ fontSize:'10px', fontWeight:800, color:'var(--text)', marginBottom:6 }},
                'Avg DT by Daypart'),
              h(DtDaypartChart, { daypartData }),
            ),

            // ── Store table + Hour breakdown ──────────────────────
            div({ style:{ display:'flex', gap:12, alignItems:'flex-start', flexWrap:'wrap' }},

              // Store ranking table
              div({ style:{ flex:'2 1 400px', background:'var(--surf2)', border:'.5px solid var(--bdr)',
                borderRadius:'var(--r)', overflow:'hidden' }},
                div({ style:{ padding:'8px 12px', borderBottom:'.5px solid var(--bdr)',
                  fontSize:'10px', fontWeight:800, color:'var(--text)' }},
                  `Store Ranking — ${sorted.length} stores`),
                h('table', { style:{ width:'100%', borderCollapse:'collapse' }},
                  h('thead', null,
                    h('tr', null,
                      h('th', { style:{ ...thS('name'), textAlign:'left', cursor:'default' }}, 'Store'),
                      h('th', { style:thS('avg'),   onClick:()=>thClick('avg')   },
                        'Avg DT ' + (sortCol==='avg'   ? (sortDir===1?'↑':'↓') : '')),
                      h('th', { style:thS('trans'), onClick:()=>thClick('trans') },
                        'Trans '  + (sortCol==='trans' ? (sortDir===1?'↑':'↓') : '')),
                      h('th', { style:thS('trend'), onClick:()=>thClick('trend') },
                        'Trend '  + (sortCol==='trend' ? (sortDir===1?'↑':'↓') : '')),
                    )
                  ),
                  h('tbody', null,
                    ...sorted.map(s => {
                      const trendStr = s.trend == null ? '—'
                        : (s.trend < 0 ? '▲ ' : '▼ ') + Math.abs(s.trend).toFixed(1) + 's';
                      const trendColor = s.trend == null ? 'var(--text3)'
                        : s.trend < -5 ? '#10b981' : s.trend > 5 ? '#ef4444' : 'var(--text3)';
                      const trendTitle = s.trend == null ? '' : s.trend < 0
                        ? `${Math.abs(s.trend).toFixed(1)}s faster vs first half of period`
                        : `${Math.abs(s.trend).toFixed(1)}s slower vs first half of period`;
                      return h('tr', { key:s.loc, style:{ borderTop:'.5px solid var(--bdr)', background:dtBg(s.avg) }},
                        h('td', { style:{ padding:'5px 10px', fontSize:'10px', color:'var(--text)', fontWeight:600 }},
                          sNameC(s.loc)),
                        h('td', { style:{ padding:'5px 10px', fontSize:'10px', textAlign:'right',
                          fontWeight:700, color:dtColor(s.avg), fontVariantNumeric:'tabular-nums' }},
                          fmtDT(s.avg)),
                        h('td', { style:{ padding:'5px 10px', fontSize:'9px', textAlign:'right',
                          color:'var(--text3)' }}, s.trans.toLocaleString()),
                        h('td', { style:{ padding:'5px 10px', fontSize:'9px', textAlign:'right',
                          color:trendColor }, title:trendTitle }, trendStr),
                      );
                    })
                  )
                )
              ),

              // Hour-of-day breakdown
              div({ style:{ flex:'1 1 220px', background:'var(--surf2)', border:'.5px solid var(--bdr)',
                borderRadius:'var(--r)', overflow:'hidden' }},
                div({ style:{ padding:'8px 12px', borderBottom:'.5px solid var(--bdr)',
                  fontSize:'10px', fontWeight:800, color:'var(--text)' }}, 'By Hour — ' + trendLabel),
                h('table', { style:{ width:'100%', borderCollapse:'collapse' }},
                  h('thead', null,
                    h('tr', null,
                      h('th', { style:{ ...thS('hour'), textAlign:'left', cursor:'default' }}, 'Hour'),
                      h('th', { style:thS('hour_avg') }, 'Avg DT'),
                      h('th', { style:thS('hour_cnt') }, 'Trans'),
                    )
                  ),
                  h('tbody', null,
                    ...hourData.map(r =>
                      h('tr', { key:r.slot, style:{ borderTop:'.5px solid var(--bdr)' }},
                        h('td', { style:{ padding:'4px 10px', fontSize:'9px', color:'var(--text3)' }}, r.label),
                        h('td', { style:{ padding:'4px 10px', fontSize:'9px', textAlign:'right',
                          fontWeight:700, color:dtColor(r.avg), fontVariantNumeric:'tabular-nums' }},
                          fmtDT(r.avg)),
                        h('td', { style:{ padding:'4px 6px 4px 0', fontSize:'8px', textAlign:'right' }},
                          div({ style:{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4 }},
                            span({ style:{ color:'var(--text3)' }}, r.trans.toLocaleString()),
                            div({ style:{ height:6, width:Math.round(r.trans / maxTrans * 60),
                              background:dtColor(r.avg)+'66', borderRadius:2, flexShrink:0 }}),
                          )
                        ),
                      )
                    )
                  )
                )
              ),
            ),

            // Footer note
            div({ style:{ fontSize:'7.5px', color:'var(--text3)', paddingTop:4 }},
              `DT Until Serve = cumulative time from order at speaker to food delivery. ` +
              `Avg = sum(dt_untilserve) / sum(dt_trans_cnt) / 1000 seconds. ` +
              `Weekly trend aggregates Mon–Sun. Store trend = 2nd half of period vs 1st half (▲ faster, ▼ slower).`
            ),
          )
    )
  );
}
