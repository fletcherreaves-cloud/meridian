// @ts-nocheck
import * as React from 'react';
import { sName } from '../constants.js';
import { dKey } from '../utils/date.js';
import { f$, fN } from '../utils/fmt.js';

const h       = React.createElement;
const { useState, useMemo } = React;
const div     = (p,...c) => h('div', p, ...c);
const span    = (p,...c) => h('span', p, ...c);
const table   = (p,...c) => h('table', p, ...c);
const thead   = (p,...c) => h('thead', p, ...c);
const tbody   = (p,...c) => h('tbody', p, ...c);
const tr      = (p,...c) => h('tr', p, ...c);
const th      = (p,...c) => h('th', p, ...c);
const td      = (p,...c) => h('td', p, ...c);

// ── Helpers ───────────────────────────────────────────────────────────────────

function fDate(dk) {
  if (!dk) return '—';
  const d = new Date(dk + 'T00:00:00');
  return d.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric', year:'numeric'});
}

function fDateShort(dk) {
  if (!dk) return '—';
  const d = new Date(dk + 'T00:00:00');
  return d.toLocaleDateString('en-US', {month:'short', day:'numeric'});
}

function fMonthLabel(ym) {
  if (!ym) return '—';
  const [y, m] = ym.split('-');
  const d = new Date(+y, +m - 1, 1);
  return d.toLocaleDateString('en-US', {month:'short', year:'numeric'});
}

function fWeekLabel(wdk) {
  if (!wdk) return '—';
  const d = new Date(wdk + 'T00:00:00');
  const end = new Date(d); end.setDate(d.getDate() + 6);
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' – ' +
         end.toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

// ── Core computation ──────────────────────────────────────────────────────────

function computeRecords(ds, windowDays) {
  if (!ds?.loaded || !ds.laborRows?.length) return null;

  // Find most recent date in dataset (use as reference for "recent" window)
  let dataEnd = null;
  for (const r of ds.laborRows) {
    if (r.date && (!dataEnd || r.date > dataEnd)) dataEnd = r.date;
  }
  const windowStart = new Date(dataEnd.getTime() - windowDays * 86400000);

  // ── Build daily aggregates per store ──────────────────────────────
  const dayMap = {}; // "loc_dk" → { loc, dk, date, sales, gc, oepeVals[] }
  for (const r of ds.laborRows) {
    if (!r.loc || !r.date) continue;
    const dk = dKey(r.date);
    const k = r.loc + '_' + dk;
    if (!dayMap[k]) dayMap[k] = { loc:r.loc, dk, date:r.date, sales:0, gc:0, oepeVals:[] };
    dayMap[k].sales += r.sales || 0;
    dayMap[k].gc += (r.inStoreGC || 0) + (r.dtGC || 0);
  }
  for (const r of ds.opsRows || []) {
    if (!r.loc || !r.date || !r.oepe) continue;
    const dk = dKey(r.date);
    const k = r.loc + '_' + dk;
    if (dayMap[k]) dayMap[k].oepeVals.push(r.oepe);
  }

  const days = Object.values(dayMap).map(d => ({
    ...d,
    oepe: d.oepeVals.length ? d.oepeVals.reduce((a,b)=>a+b,0) / d.oepeVals.length : null,
  })).filter(d => d.sales > 0);

  // ── Weekly aggregates ──────────────────────────────────────────────
  const weekMap = {};
  for (const d of days) {
    const dt = d.date instanceof Date ? d.date : new Date(d.dk + 'T00:00:00');
    const dow = dt.getDay();
    const ws = new Date(dt); ws.setDate(dt.getDate() - dow);
    const wdk = dKey(ws);
    const k = d.loc + '_' + wdk;
    if (!weekMap[k]) weekMap[k] = { loc:d.loc, wdk, sales:0 };
    weekMap[k].sales += d.sales;
  }

  // ── Monthly aggregates ─────────────────────────────────────────────
  const monthMap = {};
  for (const d of days) {
    const ym = d.dk.slice(0,7);
    const k = d.loc + '_' + ym;
    if (!monthMap[k]) monthMap[k] = { loc:d.loc, ym, sales:0 };
    monthMap[k].sales += d.sales;
  }

  // ── Chronological record scanning per store ────────────────────────
  const locDays = {};
  for (const d of days) {
    if (!locDays[d.loc]) locDays[d.loc] = [];
    locDays[d.loc].push(d);
  }
  for (const arr of Object.values(locDays)) {
    arr.sort((a,b) => a.dk.localeCompare(b.dk));
  }

  // All-time records + history of record breaks
  const storeRec = {}; // loc → { day, gc, oepe, week, month }
  const recentBreakers = [];

  for (const [loc, arr] of Object.entries(locDays)) {
    let salesMax = 0, gcMax = 0, oepeBest = Infinity;
    storeRec[loc] = { day:{val:0,dk:null}, gc:{val:0,dk:null}, oepe:{val:null,dk:null} };

    for (const d of arr) {
      if (d.sales > salesMax) {
        const prev = salesMax > 0 ? salesMax : null;
        salesMax = d.sales;
        storeRec[loc].day = { val:d.sales, dk:d.dk };
        const dt = new Date(d.dk + 'T00:00:00');
        if (dt >= windowStart) {
          recentBreakers.push({ loc, dk:d.dk, type:'Sales Day', val:d.sales, prev, isLow:false });
        }
      }
      if (d.gc > gcMax) {
        gcMax = d.gc;
        storeRec[loc].gc = { val:d.gc, dk:d.dk };
      }
      if (d.oepe != null && d.oepe < oepeBest) {
        const prev = oepeBest < Infinity ? oepeBest : null;
        oepeBest = d.oepe;
        storeRec[loc].oepe = { val:d.oepe, dk:d.dk };
        const dt = new Date(d.dk + 'T00:00:00');
        if (dt >= windowStart) {
          recentBreakers.push({ loc, dk:d.dk, type:'OEPE Best', val:d.oepe, prev, isLow:true });
        }
      }
    }
  }

  // Weekly + monthly all-time records per store
  const weekRec = {}, monthRec = {};
  for (const w of Object.values(weekMap)) {
    if (!weekRec[w.loc] || w.sales > weekRec[w.loc].val) weekRec[w.loc] = { val:w.sales, wdk:w.wdk };
  }
  for (const m of Object.values(monthMap)) {
    if (!monthRec[m.loc] || m.sales > monthRec[m.loc].val) monthRec[m.loc] = { val:m.sales, ym:m.ym };
  }

  // Add recent weekly record breakers
  const locWeeks = {};
  for (const w of Object.values(weekMap)) {
    if (!locWeeks[w.loc]) locWeeks[w.loc] = [];
    locWeeks[w.loc].push(w);
  }
  for (const arr of Object.values(locWeeks)) arr.sort((a,b)=>a.wdk.localeCompare(b.wdk));
  for (const [loc, arr] of Object.entries(locWeeks)) {
    let weekMax = 0;
    for (const w of arr) {
      if (w.sales > weekMax) {
        const prev = weekMax > 0 ? weekMax : null;
        weekMax = w.sales;
        const dt = new Date(w.wdk + 'T00:00:00');
        if (dt >= windowStart) {
          recentBreakers.push({ loc, dk:w.wdk, type:'Sales Week', val:w.sales, prev, isLow:false });
        }
      }
    }
  }

  recentBreakers.sort((a,b) => b.dk.localeCompare(a.dk));

  // District top 15 days
  const topDays = [...days].sort((a,b) => b.sales - a.sales).slice(0, 15);

  // District-level bests
  let distBestDay = { val:0, loc:null, dk:null };
  for (const [loc, r] of Object.entries(storeRec)) {
    if (r.day.val > distBestDay.val) distBestDay = { val:r.day.val, loc, dk:r.day.dk };
  }
  let distBestWeek = { val:0, loc:null, wdk:null };
  for (const [loc, r] of Object.entries(weekRec)) {
    if (r.val > distBestWeek.val) distBestWeek = { val:r.val, loc, wdk:r.wdk };
  }
  let distBestMonth = { val:0, loc:null, ym:null };
  for (const [loc, r] of Object.entries(monthRec)) {
    if (r.val > distBestMonth.val) distBestMonth = { val:r.val, loc, ym:r.ym };
  }

  return {
    storeRec, weekRec, monthRec, recentBreakers, topDays,
    distBestDay, distBestWeek, distBestMonth,
    dataEnd, windowDays, totalStores: Object.keys(storeRec).length,
  };
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  overlay: {
    position:'fixed', inset:0, background:'rgba(0,0,0,.75)', zIndex:400,
    display:'flex', flexDirection:'column', padding:20, overflow:'hidden',
  },
  panel: {
    background:'var(--surf)', borderRadius:'var(--rl)', border:'.5px solid var(--bdr2)',
    display:'flex', flexDirection:'column', flex:1, maxWidth:1200,
    margin:'0 auto', width:'100%', overflow:'hidden',
  },
  hdr: {
    display:'flex', alignItems:'center', gap:12, padding:'14px 20px',
    borderBottom:'.5px solid var(--bdr)', flexShrink:0,
  },
  body: { flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:24 },
  card: {
    background:'var(--surf2)', border:'.5px solid var(--bdr)', borderRadius:'var(--rm)',
    padding:'14px 18px',
  },
  sectionLabel: { fontSize:11, fontWeight:700, letterSpacing:.8, color:'var(--txt3)', textTransform:'uppercase', marginBottom:12 },
  heroGrid: { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 },
  heroCard: {
    background:'var(--surf2)', border:'.5px solid var(--bdr)', borderRadius:'var(--rm)',
    padding:'16px 18px',
  },
  heroVal: { fontSize:22, fontWeight:700, color:'var(--acc)', lineHeight:1.1, marginBottom:4 },
  heroSub: { fontSize:12, color:'var(--txt3)' },
  badge: (color, bg) => ({
    display:'inline-block', fontSize:10, fontWeight:700, letterSpacing:.6,
    color, background:bg, border:`1px solid ${color}`, borderRadius:4,
    padding:'2px 6px', textTransform:'uppercase',
  }),
  tblWrap: { overflowX:'auto', borderRadius:'var(--rm)', border:'.5px solid var(--bdr)' },
  tbl: { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th: {
    padding:'8px 12px', textAlign:'left', background:'var(--surf3)',
    borderBottom:'.5px solid var(--bdr)', color:'var(--txt2)', fontWeight:600,
    fontSize:11, whiteSpace:'nowrap',
  },
  td: { padding:'8px 12px', borderBottom:'.5px solid var(--bdr)', color:'var(--txt)' },
  tdMuted: { padding:'8px 12px', borderBottom:'.5px solid var(--bdr)', color:'var(--txt3)', fontSize:12 },
  filterBar: { display:'flex', alignItems:'center', gap:12, marginBottom:14 },
  select: {
    padding:'5px 10px', borderRadius:'var(--rs)', border:'.5px solid var(--bdr2)',
    background:'var(--surf2)', color:'var(--txt)', fontSize:13, cursor:'pointer',
  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function HeroCards({ data }) {
  const { distBestDay, distBestWeek, distBestMonth, recentBreakers, windowDays } = data;
  const recentCount = recentBreakers.length;
  const mostRecent = recentBreakers[0];

  return div({ style:S.heroGrid },
    div({ style:S.heroCard },
      div({ style:{ fontSize:11, fontWeight:700, letterSpacing:.8, color:'var(--txt3)', textTransform:'uppercase', marginBottom:8 } }, '🏆 District Best Day'),
      div({ style:S.heroVal }, distBestDay.val ? f$(distBestDay.val) : '—'),
      div({ style:S.heroSub }, distBestDay.loc
        ? `${sName(distBestDay.loc)} · ${fDate(distBestDay.dk)}`
        : 'No data'),
    ),
    div({ style:S.heroCard },
      div({ style:{ fontSize:11, fontWeight:700, letterSpacing:.8, color:'var(--txt3)', textTransform:'uppercase', marginBottom:8 } }, '📅 Best Week Ever'),
      div({ style:S.heroVal }, distBestWeek.val ? f$(distBestWeek.val) : '—'),
      div({ style:S.heroSub }, distBestWeek.loc
        ? `${sName(distBestWeek.loc)} · ${fWeekLabel(distBestWeek.wdk)}`
        : 'No data'),
    ),
    div({ style:S.heroCard },
      div({ style:{ fontSize:11, fontWeight:700, letterSpacing:.8, color:'var(--txt3)', textTransform:'uppercase', marginBottom:8 } }, '📊 Best Month Ever'),
      div({ style:S.heroVal }, distBestMonth.val ? f$(distBestMonth.val) : '—'),
      div({ style:S.heroSub }, distBestMonth.loc
        ? `${sName(distBestMonth.loc)} · ${fMonthLabel(distBestMonth.ym)}`
        : 'No data'),
    ),
  );
}

function RecentBreakers({ data, windowDays, onWindowChange }) {
  const { recentBreakers } = data;

  return div({ style:{} },
    div({ style:S.filterBar },
      div({ style:S.sectionLabel }, `Recent Record Breakers`),
      div({ style:{ flex:1 } }),
      span({ style:{ fontSize:12, color:'var(--txt3)' } }, 'Window:'),
      h('select', {
        style:S.select,
        value:windowDays,
        onChange:e => onWindowChange(+e.target.value),
      },
        h('option', { value:30 }, 'Last 30 days'),
        h('option', { value:60 }, 'Last 60 days'),
        h('option', { value:90 }, 'Last 90 days'),
        h('option', { value:180 }, 'Last 180 days'),
      ),
    ),
    recentBreakers.length === 0
      ? div({ style:{ ...S.card, color:'var(--txt3)', fontSize:13, textAlign:'center', padding:'24px' } },
          `No records broken in the last ${windowDays} days of data`)
      : div({ style:S.tblWrap },
          table({ style:S.tbl },
            thead({},
              tr({},
                th({ style:S.th }, 'Store'),
                th({ style:S.th }, 'Date'),
                th({ style:S.th }, 'Record Type'),
                th({ style:{...S.th, textAlign:'right'} }, 'New Record'),
                th({ style:{...S.th, textAlign:'right'} }, 'Previous Best'),
                th({ style:{...S.th, textAlign:'right'} }, 'Improvement'),
              ),
            ),
            tbody({},
              ...recentBreakers.map((b, i) => {
                const improvement = b.prev != null
                  ? (b.isLow
                      ? ((b.prev - b.val) / b.prev * 100)
                      : ((b.val - b.prev) / b.prev * 100))
                  : null;
                const isFirst = i === 0;
                return tr({ key:i, style:{ background: isFirst ? 'rgba(16,185,129,.04)' : '' } },
                  td({ style:S.td }, sName(b.loc)),
                  td({ style:S.td },
                    div({ style:{ display:'flex', alignItems:'center', gap:8 } },
                      b.type === 'Sales Day' ? fDate(b.dk)
                        : b.type === 'Sales Week' ? fWeekLabel(b.dk)
                        : fDate(b.dk),
                    ),
                  ),
                  td({ style:S.td },
                    span({ style:S.badge(
                      b.isLow ? '#06b6d4' : b.type.includes('Week') ? '#8b5cf6' : '#10b981',
                      b.isLow ? 'rgba(6,182,212,.1)' : b.type.includes('Week') ? 'rgba(139,92,246,.1)' : 'rgba(16,185,129,.1)',
                    ) }, b.type),
                  ),
                  td({ style:{...S.td, textAlign:'right', fontWeight:600, color:'var(--acc)' } },
                    b.isLow ? fN(b.val) + 's' : f$(b.val),
                  ),
                  td({ style:{...S.td, textAlign:'right', color:'var(--txt3)' } },
                    b.prev != null ? (b.isLow ? fN(b.prev) + 's' : f$(b.prev)) : '(first record)',
                  ),
                  td({ style:{...S.td, textAlign:'right', color: improvement != null ? '#10b981' : 'var(--txt3)' } },
                    improvement != null ? `+${improvement.toFixed(1)}%` : '—',
                  ),
                );
              }),
            ),
          ),
        ),
  );
}

function StoreRecordsTable({ data }) {
  const [sortKey, setSortKey] = useState('day');
  const { storeRec, weekRec, monthRec } = data;

  const locs = Object.keys(storeRec);
  const sorted = [...locs].sort((a, b) => {
    if (sortKey === 'day')   return (storeRec[b]?.day?.val||0) - (storeRec[a]?.day?.val||0);
    if (sortKey === 'week')  return (weekRec[b]?.val||0) - (weekRec[a]?.val||0);
    if (sortKey === 'month') return (monthRec[b]?.val||0) - (monthRec[a]?.val||0);
    if (sortKey === 'oepe')  return (storeRec[a]?.oepe?.val||Infinity) - (storeRec[b]?.oepe?.val||Infinity);
    return 0;
  });

  const SortTH = ({ sk, label, right }) => {
    const active = sortKey === sk;
    return th({
      style:{ ...S.th, textAlign:right?'right':'left', cursor:'pointer',
              color: active ? 'var(--acc)' : 'var(--txt2)',
              userSelect:'none' },
      onClick:()=>setSortKey(sk),
    }, label + (active ? ' ▾' : ''));
  };

  return div({},
    div({ style:S.sectionLabel }, 'All-Time Records by Store'),
    div({ style:S.tblWrap },
      table({ style:S.tbl },
        thead({},
          tr({},
            th({ style:S.th }, 'Store'),
            h(SortTH, { sk:'day',   label:'Best Day',   right:true }),
            th({ style:{...S.th, textAlign:'right', fontWeight:400, color:'var(--txt3)' } }, 'Set On'),
            h(SortTH, { sk:'week',  label:'Best Week',  right:true }),
            h(SortTH, { sk:'month', label:'Best Month', right:true }),
            h(SortTH, { sk:'oepe',  label:'Best OEPE',  right:true }),
          ),
        ),
        tbody({},
          ...sorted.map((loc, i) => {
            const r = storeRec[loc];
            const wr = weekRec[loc];
            const mr = monthRec[loc];
            return tr({ key:loc, style:{ background: i%2===0?'':'rgba(255,255,255,.02)' } },
              td({ style:{...S.td, fontWeight:500} }, sName(loc)),
              td({ style:{...S.td, textAlign:'right', fontWeight:600, color: sortKey==='day'?'var(--acc)':'var(--txt)' } },
                r.day.val > 0 ? f$(r.day.val) : '—'),
              td({ style:{...S.tdMuted, textAlign:'right' } }, fDateShort(r.day.dk)),
              td({ style:{...S.td, textAlign:'right', color: sortKey==='week'?'var(--acc)':'var(--txt)' } },
                wr ? f$(wr.val) : '—'),
              td({ style:{...S.td, textAlign:'right', color: sortKey==='month'?'var(--acc)':'var(--txt)' } },
                mr ? f$(mr.val) : '—'),
              td({ style:{...S.td, textAlign:'right', color: sortKey==='oepe'?'var(--acc)':'var(--txt)' } },
                r.oepe?.val != null ? fN(r.oepe.val) + 's' : '—'),
            );
          }),
        ),
      ),
    ),
  );
}

function TopDaysTable({ data }) {
  const [expanded, setExpanded] = useState(false);
  const { topDays } = data;
  const shown = expanded ? topDays : topDays.slice(0,5);

  return div({},
    div({ style:{ display:'flex', alignItems:'center', gap:12, marginBottom:12 } },
      div({ style:S.sectionLabel }, 'District Top Days — All Time'),
      div({ style:{ flex:1 } }),
      h('button', {
        style:{ background:'none', border:'none', color:'var(--acc)', fontSize:12, cursor:'pointer', padding:'4px 8px' },
        onClick:()=>setExpanded(v=>!v),
      }, expanded ? 'Show less ▲' : `Show all ${topDays.length} ▾`),
    ),
    div({ style:S.tblWrap },
      table({ style:S.tbl },
        thead({},
          tr({},
            th({ style:{...S.th, width:40 } }, '#'),
            th({ style:S.th }, 'Store'),
            th({ style:S.th }, 'Date'),
            th({ style:{...S.th, textAlign:'right'} }, 'Sales'),
          ),
        ),
        tbody({},
          ...shown.map((d, i) =>
            tr({ key:d.loc+d.dk },
              td({ style:{...S.tdMuted, fontWeight:700, color: i<3?'var(--acc)':'var(--txt3)' } }, i + 1),
              td({ style:S.td }, sName(d.loc)),
              td({ style:S.td }, fDate(d.dk)),
              td({ style:{...S.td, textAlign:'right', fontWeight:600 } }, f$(d.sales)),
            ),
          ),
        ),
      ),
    ),
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function RecordDayPanel({ stores, ds, onClose }) {
  const [windowDays, setWindowDays] = useState(60);

  const data = useMemo(() => computeRecords(ds, windowDays), [ds, windowDays]);

  const closeOnBg = e => { if (e.target === e.currentTarget) onClose(); };

  return div({ style:S.overlay, onClick:closeOnBg },
    div({ style:S.panel },
      // Header
      div({ style:S.hdr },
        span({ style:{ fontSize:18 } }, '🏆'),
        div({ style:{ flex:1 } },
          div({ style:{ fontWeight:700, fontSize:16 } }, 'Record Day Intelligence'),
          div({ style:{ fontSize:12, color:'var(--txt3)' } },
            data
              ? `${data.totalStores} stores · data through ${fDate(dKey(data.dataEnd))}`
              : 'Upload sales data to view records',
          ),
        ),
        h('button', {
          onClick:onClose,
          style:{ background:'none', border:'none', color:'var(--txt3)', fontSize:20, cursor:'pointer', padding:'4px 8px' },
        }, '✕'),
      ),

      // Body
      !data
        ? div({ style:{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--txt3)', fontSize:14 } },
            'No sales data loaded. Upload your data to see records.')
        : div({ style:S.body },
            h(HeroCards, { data }),
            h(RecentBreakers, { data, windowDays, onWindowChange:setWindowDays }),
            h(StoreRecordsTable, { data }),
            h(TopDaysTable, { data }),
          ),
    ),
  );
}
