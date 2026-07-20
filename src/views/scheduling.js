// @ts-nocheck
import * as React from 'react';
import { STORE_NAMES, DEFAULT_TARGETS } from '../constants.js';
import { generateSlideDeckHTML } from './scheduling-deck.js';

const { useState, useMemo, useCallback } = React;

// ── Time & Attendance data — Jun 1–28, 2026 ─────────────────────────────────
// Update by uploading a new T&A report from LifeLenz
const TA_DATA = {
  '3708': {empCount:487, attendRating:0.8053, onTimeRating:0.5979, daysOnSched:945,  missedShifts:184, punchInLate:306},
  '5183': {empCount:547, attendRating:0.8848, onTimeRating:0.8312, daysOnSched:1172, missedShifts:135, punchInLate:175},
  '5985': {empCount:572, attendRating:0.9198, onTimeRating:0.8849, daysOnSched:1322, missedShifts:106, punchInLate:140},
  '6178': {empCount:310, attendRating:0.9078, onTimeRating:0.8130, daysOnSched:748,  missedShifts:69,  punchInLate:127},
  '6838': {empCount:409, attendRating:0.8978, onTimeRating:0.8266, daysOnSched:861,  missedShifts:88,  punchInLate:134},
  '6972': {empCount:640, attendRating:0.8618, onTimeRating:0.7579, daysOnSched:1534, missedShifts:212, punchInLate:320},
  '10034':{empCount:355, attendRating:0.9200, onTimeRating:0.7420, daysOnSched:750,  missedShifts:60,  punchInLate:178},
  '10422':{empCount:413, attendRating:0.8844, onTimeRating:0.7546, daysOnSched:926,  missedShifts:107, punchInLate:201},
  '10915':{empCount:471, attendRating:0.9255, onTimeRating:0.8303, daysOnSched:1114, missedShifts:83,  punchInLate:175},
  '11657':{empCount:347, attendRating:0.9337, onTimeRating:0.7158, daysOnSched:829,  missedShifts:55,  punchInLate:220},
  '13113':{empCount:400, attendRating:0.8233, onTimeRating:0.4842, daysOnSched:883,  missedShifts:156, punchInLate:375},
  '18213':{empCount:221, attendRating:0.9218, onTimeRating:0.8032, daysOnSched:601,  missedShifts:47,  punchInLate:109},
  '20475':{empCount:421, attendRating:0.8790, onTimeRating:0.7313, daysOnSched:851,  missedShifts:103, punchInLate:201},
  '24471':{empCount:397, attendRating:0.9010, onTimeRating:0.7503, daysOnSched:818,  missedShifts:81,  punchInLate:184},
  '29760':{empCount:642, attendRating:0.9589, onTimeRating:0.8715, daysOnSched:1388, missedShifts:57,  punchInLate:171},
  '31357':{empCount:260, attendRating:0.9460, onTimeRating:0.7252, daysOnSched:704,  missedShifts:38,  punchInLate:183},
  '32525':{empCount:267, attendRating:0.8790, onTimeRating:0.8489, daysOnSched:595,  missedShifts:72,  punchInLate:79},
  '33109':{empCount:324, attendRating:0.8992, onTimeRating:0.6232, daysOnSched:605,  missedShifts:61,  punchInLate:205},
  '33222':{empCount:342, attendRating:0.9208, onTimeRating:0.8388, daysOnSched:795,  missedShifts:63,  punchInLate:118},
  '33704':{empCount:346, attendRating:0.9164, onTimeRating:0.9012, daysOnSched:718,  missedShifts:60,  punchInLate:65},
  '34222':{empCount:357, attendRating:0.9014, onTimeRating:0.9176, daysOnSched:781,  missedShifts:77,  punchInLate:58},
  '35064':{empCount:281, attendRating:0.9301, onTimeRating:0.7684, daysOnSched:715,  missedShifts:50,  punchInLate:154},
  '35242':{empCount:343, attendRating:0.8123, onTimeRating:0.7484, daysOnSched:778,  missedShifts:146, punchInLate:159},
  '37566':{empCount:405, attendRating:0.8741, onTimeRating:0.8441, daysOnSched:866,  missedShifts:109, punchInLate:118},
  '38609':{empCount:346, attendRating:0.9030, onTimeRating:0.8801, daysOnSched:794,  missedShifts:77,  punchInLate:86},
  '43380':{empCount:219, attendRating:0.8943, onTimeRating:0.8000, daysOnSched:492,  missedShifts:52,  punchInLate:88},
  '43701':{empCount:343, attendRating:0.8374, onTimeRating:0.7368, daysOnSched:658,  missedShifts:107, punchInLate:145},
};
const TA_PERIOD = 'Jun 1–28, 2026';
const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);

const SURF   = 'var(--surf,#10172a)';
const SURF2  = 'var(--surf2,#141d2e)';
const TEXT   = 'var(--text,#e2e8f0)';
const TEXT2  = 'var(--text2,#94a3b8)';
const TEXT3  = 'var(--text3,#475569)';
const BDR    = 'var(--bdr,#1e293b)';
const R      = 'var(--r,6px)';
const AMBER  = '#f59e0b';
const GREEN  = '#22c55e';
const RED    = '#ef4444';
const BLUE   = '#3b82f6';

// loc helpers
const sName    = loc => (STORE_NAMES && STORE_NAMES[loc] && STORE_NAMES[loc] !== loc) ? STORE_NAMES[loc] : null;
const shortLoc = loc => String(parseInt(loc, 10) || loc);

function fmt$(v) { return '$' + (v||0).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function fmtN(v, dec=1) { return (v||0).toFixed(dec); }
function fmtPct(v) { return (v||0).toFixed(1) + '%'; }

function colorForLaborPct(v) {
  if(!v) return TEXT3;
  if(v < 19) return GREEN;
  if(v < 22) return AMBER;
  return RED;
}
function colorForTPMH(v) {
  if(!v) return TEXT3;
  if(v >= 6.0) return GREEN;
  if(v >= 5.0) return AMBER;
  return RED;
}
function colorForHrsDiff(diff) {
  if(Math.abs(diff) < 5) return TEXT2;
  return diff > 0 ? RED : GREEN;
}

// ISO date string for <input type="date">
function toInputDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}
// Previous Sunday / Saturday relative to a date
function weekBounds(anchor) {
  const d = new Date(anchor);
  const day = d.getDay(); // 0=Sun
  const sun = new Date(d); sun.setDate(d.getDate() - day);
  const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
  return { sun, sat };
}

function MetricCard({ label, value, sub, color }) {
  return div({
    style: { background: SURF2, border: `1px solid ${BDR}`, borderRadius: R, padding: '14px 16px', minWidth: 120, flex: '1 1 120px' }
  },
    div({ style: { fontSize: 10, color: TEXT3, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 } }, label),
    div({ style: { fontSize: 22, fontWeight: 700, color: color || TEXT, lineHeight: 1 } }, value),
    sub && div({ style: { fontSize: 11, color: TEXT3, marginTop: 4 } }, sub)
  );
}

function StoreScheduleTable({ rows }) {
  if(!rows.length) return null;
  const sorted = [...rows].sort((a,b) => a.date - b.date);
  const cols = [
    { key: 'date',     label: 'Date',      w: 90,  left: true },
    { key: 'sales',    label: 'Sales',     w: 80 },
    { key: 'tcs',      label: 'TCs',       w: 55 },
    { key: 'laborPct', label: 'Labor %',   w: 65 },
    { key: 'schVLH',   label: 'Sch VLH',  w: 65 },
    { key: 'needVLH',  label: 'Need VLH', w: 68 },
    { key: 'vlhOver',  label: 'Sch−Need', w: 68 },
    { key: 'schFix',   label: 'Fix Hrs',  w: 58 },
    { key: 'crewHrs',  label: 'Crew Hrs', w: 65 },
    { key: 'ideal',    label: '+/− Ideal', w: 65 },
    { key: 'tpmh',     label: 'TPMH',     w: 55 },
  ];
  const thS = (left) => ({ padding: '6px 8px', fontSize: 10, color: TEXT3, textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 600, borderBottom: `1px solid ${BDR}`, whiteSpace: 'nowrap', textAlign: left ? 'left' : 'right' });
  const tdS = (color, left) => ({ padding: '6px 8px', fontSize: 12, color: color || TEXT2, textAlign: left ? 'left' : 'right', borderBottom: `1px solid ${BDR}` });

  return h('div', { style: { overflowX: 'auto', borderRadius: R, border: `1px solid ${BDR}` } },
    h('table', { style: { width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' } },
      h('thead', null,
        h('tr', null, ...cols.map(c => h('th', { key: c.key, style: { ...thS(c.left), minWidth: c.w } }, c.label)))
      ),
      h('tbody', null,
        sorted.map((r, i) => {
          const vlhOver   = r.schVLHOverNeed;
          const idealDiff = r.schVsIdealDiff;
          const dayLabel  = r.date.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
          const fixLabel  = r.fixGuideHrs > 0 ? fmtN(r.schFixHrs) + '/' + fmtN(r.fixGuideHrs) : fmtN(r.schFixHrs);
          return h('tr', { key: i, style: { background: i%2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)' } },
            h('td', { style: tdS(TEXT2, true) }, dayLabel),
            h('td', { style: tdS(TEXT) }, fmt$(r.sales)),
            h('td', { style: tdS(TEXT2) }, (r.tcs||0).toLocaleString()),
            h('td', { style: tdS(colorForLaborPct(r.laborPct)) }, fmtPct(r.laborPct)),
            h('td', { style: tdS(TEXT2) }, fmtN(r.schVLH)),
            h('td', { style: tdS(TEXT2) }, fmtN(r.needVLH)),
            h('td', { style: tdS(colorForHrsDiff(vlhOver)) }, vlhOver > 0 ? '+'+fmtN(vlhOver) : fmtN(vlhOver)),
            h('td', { style: tdS(r.fixGuideHrs > 0 ? TEXT2 : TEXT3) }, fixLabel),
            h('td', { style: tdS(TEXT2) }, fmtN(r.crewHrs)),
            h('td', { style: tdS(colorForHrsDiff(idealDiff)) }, idealDiff > 0 ? '+'+fmtN(idealDiff) : fmtN(idealDiff)),
            h('td', { style: tdS(colorForTPMH(r.tpmh)) }, fmtN(r.tpmh, 2))
          );
        })
      )
    )
  );
}

function StoreSection({ loc, rows }) {
  const sorted      = [...rows].sort((a,b) => a.date - b.date);
  const avgLaborPct = rows.reduce((s,r) => s + (r.laborPct||0), 0) / rows.length;
  const avgTPMH     = rows.reduce((s,r) => s + (r.tpmh||0), 0) / rows.length;
  const totalHrsOver = rows.reduce((s,r) => s + (r.schVsIdealDiff||0), 0);
  const totalVLHOver = rows.reduce((s,r) => s + Math.max(0, r.schVLHOverNeed||0), 0);
  const noGuide      = rows.every(r => (r.fixGuideHrs||0) === 0);
  const name         = sName(loc);

  return div({ style: { marginBottom: 28 } },
    div({ style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 } },
      div({ style: { fontSize: 15, fontWeight: 700, color: TEXT } },
        shortLoc(loc),
        name && h('span', { style: { color: TEXT3, fontWeight: 400, marginLeft: 8, fontSize: 13 } }, name)
      ),
      div({ style: { fontSize: 11, color: TEXT3 } }, rows.length + ' days')
    ),
    div({ style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 } },
      h(MetricCard, { label: 'Avg Labor %',    value: fmtPct(avgLaborPct),  color: colorForLaborPct(avgLaborPct) }),
      h(MetricCard, { label: 'Avg TPMH',       value: fmtN(avgTPMH, 2),     color: colorForTPMH(avgTPMH) }),
      h(MetricCard, { label: 'VLH Over-Sched', value: '+'+fmtN(totalVLHOver,0)+' hrs',
        sub: fmtN(totalVLHOver/rows.length,1)+' hrs/day avg', color: totalVLHOver > 0 ? RED : GREEN }),
      h(MetricCard, { label: 'Crew vs Ideal',  value: (totalHrsOver>0?'+':'')+fmtN(totalHrsOver,0)+' hrs',
        sub: fmtN(totalHrsOver/rows.length,1)+' hrs/day avg', color: colorForHrsDiff(totalHrsOver/rows.length) }),
    ),
    noGuide && div({
      style: { background: 'rgba(245,158,11,.08)', border: `1px solid rgba(245,158,11,.2)`, borderRadius: R,
               padding: '8px 12px', fontSize: 11, color: AMBER, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }
    },
      h('span', { style: { fontSize: 14 } }, '⚠'),
      'Fixed Hours Guide not configured (Fix.Guide.Hrs = 0). Fixed hours cannot be benchmarked until the guide is set up in LifeLenz — training priority.'
    ),
    h(StoreScheduleTable, { rows: sorted })
  );
}

function DistrictSummary({ schedRows }) {
  const byLoc = {};
  for(const r of schedRows) { if(!byLoc[r.loc]) byLoc[r.loc]=[]; byLoc[r.loc].push(r); }
  const locs = Object.keys(byLoc).sort();

  const totalDays    = schedRows.length;
  const avgLabor     = schedRows.reduce((s,r) => s+(r.laborPct||0),0) / totalDays;
  const avgTPMH      = schedRows.reduce((s,r) => s+(r.tpmh||0),0)     / totalDays;
  const totalVLHOver = schedRows.reduce((s,r) => s+Math.max(0,r.schVLHOverNeed||0),0);
  const totalHrsOver = schedRows.reduce((s,r) => s+Math.max(0,r.schVsIdealDiff||0),0);

  return div({ style: { marginBottom: 24 } },
    div({ style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 } },
      h(MetricCard, { label: 'Stores Loaded',       value: locs.length,                           sub: totalDays+' store-days',         color: BLUE }),
      h(MetricCard, { label: 'Avg Labor %',          value: fmtPct(avgLabor),                      color: colorForLaborPct(avgLabor) }),
      h(MetricCard, { label: 'Avg TPMH',             value: fmtN(avgTPMH,2),                       color: colorForTPMH(avgTPMH) }),
      h(MetricCard, { label: 'Total VLH Over',       value: '+'+fmtN(totalVLHOver,0)+' hrs',       sub: 'scheduled above need',           color: RED }),
      h(MetricCard, { label: 'Total Crew Over Ideal',value: '+'+fmtN(totalHrsOver,0)+' hrs',       sub: 'across all store-days',          color: RED }),
    ),
    div({ style: { overflowX: 'auto', borderRadius: R, border: `1px solid ${BDR}` } },
      h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
        h('thead', null,
          h('tr', null,
            ...['Store','Days','Avg Labor%','Avg TPMH','VLH Over (total)','Crew/Ideal (avg/day)'].map(l =>
              h('th', { key: l, style: { padding: '6px 10px', fontSize: 10, color: TEXT3, textTransform: 'uppercase', letterSpacing: '.5px', textAlign: l==='Store'?'left':'right', borderBottom:`1px solid ${BDR}`, fontWeight: 600 } }, l)
            )
          )
        ),
        h('tbody', null,
          locs.map((loc, i) => {
            const rows = byLoc[loc];
            const aLab  = rows.reduce((s,r) => s+(r.laborPct||0),0) / rows.length;
            const aTpmh = rows.reduce((s,r) => s+(r.tpmh||0),0)     / rows.length;
            const vOver = rows.reduce((s,r) => s+Math.max(0,r.schVLHOverNeed||0),0);
            const cDiff = rows.reduce((s,r) => s+(r.schVsIdealDiff||0),0) / rows.length;
            const name  = sName(loc);
            const td = (val, color) => h('td', { style: { padding:'6px 10px', fontSize:12, color:color||TEXT2, textAlign:'right', borderBottom:`1px solid ${BDR}` } }, val);
            return h('tr', { key: loc, style: { background: i%2===0?'transparent':'rgba(255,255,255,.02)' } },
              h('td', { style: { padding:'6px 10px', fontSize:12, color:TEXT, textAlign:'left', borderBottom:`1px solid ${BDR}` } },
                h('span', { style: { fontWeight:600 } }, shortLoc(loc)),
                name && h('span', { style: { color:TEXT3, marginLeft:6, fontSize:11 } }, name)
              ),
              td(rows.length),
              td(fmtPct(aLab),  colorForLaborPct(aLab)),
              td(fmtN(aTpmh,2), colorForTPMH(aTpmh)),
              td('+'+fmtN(vOver,0), vOver>10 ? RED : AMBER),
              td((cDiff>0?'+':'')+fmtN(cDiff,1)+' hrs', colorForHrsDiff(cDiff))
            );
          })
        )
      )
    )
  );
}

// ── Date range picker + sync command generator ────────────────────────────────
// ── Opportunity Report ───────────────────────────────────────────────────────
const LABOR_BUFFER  = 0.02;
// FL Panhandle stores under Emerald Arches / Jacob Thorley + Brad Denley supervision
const EMERALD_LOCS  = ['6178','6838','10034','35242','37566','38609','43701'];
const DIST_AVG_RATE = 12.97;
// Jun 17-23 avg hourly rates from LifeLenz Labor Analysis — update quarterly
const AVG_RATES = {
  '3708':12.75,'5183':11.77,'5985':12.98,'6178':15.63,'6838':15.48,'6972':11.79,
  '10034':15.41,'10422':12.32,'10915':11.64,'11657':12.67,'13113':12.56,'18213':11.76,
  '20475':12.17,'24471':12.62,'29760':11.80,'31357':14.48,'32525':12.72,'33109':12.78,
  '33222':10.92,'33704':11.64,'34222':11.62,'35064':10.47,'35242':15.63,'37566':15.73,
  '38609':15.68,'43380':11.47,'43701':15.54,
};

function normLoc(loc) { return String(parseInt(loc,10) || loc); }
function weekWednesday(d) { const s=new Date(d); s.setDate(d.getDate()-((d.getDay()-3+7)%7)); s.setHours(0,0,0,0); return s; }
function weekKey(wed) { return wed.toISOString().slice(0,10); }
function weekLabel(wed) {
  const tue=new Date(wed); tue.setDate(wed.getDate()+6);
  const fmt=d=>d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  return fmt(wed)+'–'+fmt(tue);
}

function OpportunityReport({ schedRows, laborRows, ctrlRows, glimpseRows, qsrActRows, settings,
  selWeek: extSelWeek, setSelWeek: extSetSelWeek, weeks: extWeeks }) {
  // ── QSR actual-labor cross-reference, keyed loc+dateStr.
  // Sourced auto/emailed-first, freshest-wins (per the data-refresh design):
  //   • QSR Labor %  ← Daily Glimpse (emailed → Supabase, cloud-fresh)
  //   • QSR Hours    ← DAR qsr_daily_activity summed punched hours (auto-pulled)
  // The manual Labor Analysis Excel (laborRows) and Operations Report control
  // sheet (ctrlRows) are only a LAST-RESORT fill for a loc/date the cloud streams
  // don't cover yet — they never override auto/emailed data. Because the cloud
  // streams load 60 days deep on every device, the columns populate back into
  // June regardless of which manual reports happened to be uploaded.
  const laborIdx = useMemo(() => {
    const pctIdx = {}, hrsIdx = {};
    const toDateStr = r => {
      if(!r.date || !r.loc) return null;
      const dt = r.date instanceof Date ? r.date : new Date(r.date);
      return isNaN(dt) ? null : normLoc(r.loc) + '|' + dt.toISOString().slice(0,10);
    };
    // laborPct is stored as a 0-1 fraction (parsePct) across all these sources;
    // normalize to 0-100 to match the panel's fmtPct and LifeLenz % column.
    const norm = v => (v && Math.abs(v) < 1.5) ? v * 100 : v;
    // ── Labor % — Glimpse (emailed) primary, manual fill only where absent ──
    for(const r of (glimpseRows||[])) { const k=toDateStr(r); if(k && r.laborPct) pctIdx[k]={pct:norm(r.laborPct),src:'glimpse'}; }
    for(const r of (ctrlRows||[]))    { const k=toDateStr(r); if(k && !pctIdx[k] && r.laborPct) pctIdx[k]={pct:norm(r.laborPct),src:'ctrl'}; }
    for(const r of (laborRows||[]))   { const k=toDateStr(r); if(k && !pctIdx[k] && r.laborPct) pctIdx[k]={pct:norm(r.laborPct),src:'labor'}; }
    // ── Hours — DAR (auto-pulled) primary, manual fill only where absent ──
    for(const r of (qsrActRows||[]))  { const k=toDateStr(r); if(k && r.actHrs) hrsIdx[k]={hrs:r.actHrs,src:'dar'}; }
    for(const r of (ctrlRows||[]))    { const k=toDateStr(r); if(k && !hrsIdx[k] && r.actHrs) hrsIdx[k]={hrs:r.actHrs,src:'ctrl'}; }
    for(const r of (laborRows||[]))   { const k=toDateStr(r); if(k && !hrsIdx[k] && r.actHrs) hrsIdx[k]={hrs:r.actHrs,src:'labor'}; }
    return { pctIdx, hrsIdx };
  }, [glimpseRows, qsrActRows, ctrlRows, laborRows]);

  // ── Scope options from settings (supervisorGroups + operators)
  const scopeOptions = useMemo(() => {
    const allLocs = Object.keys(DEFAULT_TARGETS);
    const okLocs  = allLocs.filter(l => !EMERALD_LOCS.includes(l));
    const opts = [
      { value:'all', label:'All Stores', locs: null },
      { value:'ok',  label:`Oklahoma — MCDOK (${okLocs.length})`, locs: okLocs },
      { value:'fl',  label:`Florida — Emerald Arches (${EMERALD_LOCS.length})`, locs: EMERALD_LOCS },
    ];
    const ops = (settings && settings.operators) || {};
    const sups = (settings && settings.supervisorGroups) || {};
    if(Object.keys(ops).length) {
      opts.push({ value:'__sep_op', label:'— By Operator —', disabled: true });
      Object.entries(ops).forEach(([name, locs]) =>
        opts.push({ value:'op|'+name, label: name + ' (' + locs.length + ')', locs })
      );
    }
    if(Object.keys(sups).length) {
      opts.push({ value:'__sep_sv', label:'— By Supervisor —', disabled: true });
      Object.entries(sups).forEach(([name, locs]) =>
        opts.push({ value:'sv|'+name, label: name + ' (' + locs.length + ')', locs })
      );
    }
    return opts;
  }, [settings]);

  // ── Week selector — defer to panel-level props when available
  // When panel provides selWeek/weeks, schedRows is already filtered to that week
  const panelManaged = Boolean(extWeeks);

  const internalWeeks = useMemo(() => {
    if(panelManaged) return extWeeks;
    const sunMap = {};
    for(const r of schedRows) {
      if(!r.date) continue;
      const sun = weekWednesday(r.date);
      const k = weekKey(sun);
      if(!sunMap[k]) sunMap[k] = sun;
    }
    return Object.entries(sunMap)
      .sort((a,b) => b[0].localeCompare(a[0]))
      .map(([k, sun]) => ({ k, sun, label: weekLabel(sun) }));
  }, [schedRows, panelManaged, extWeeks]);

  const weeks = internalWeeks;

  const [intSelWeek, setIntSelWeek] = useState(null);
  const [scope,   setScope]   = useState('all');
  const [expanded, setExpanded] = useState({});
  const toggleExp = loc => setExpanded(e => ({ ...e, [loc]: !e[loc] }));

  const selWeek    = panelManaged ? extSelWeek    : intSelWeek;
  const setSelWeek = panelManaged ? extSetSelWeek : setIntSelWeek;
  const activeWeek = selWeek || (weeks.length ? weeks[0].k : null);

  // When panel-managed, schedRows are pre-filtered; skip internal week filter
  const weekRows = useMemo(() => {
    if(panelManaged) return schedRows;
    if(!activeWeek) return schedRows;
    return schedRows.filter(r => r.date && weekKey(weekWednesday(r.date)) === activeWeek);
  }, [schedRows, activeWeek, panelManaged]);

  const scopeRows = useMemo(() => {
    if(scope === 'all') return weekRows;
    const opt = scopeOptions.find(o => o.value === scope);
    if(opt && opt.locs) {
      const locSet = new Set(opt.locs.map(String));
      return weekRows.filter(r => locSet.has(normLoc(r.loc)));
    }
    return weekRows;
  }, [weekRows, scope, scopeOptions]);

  // Three-layer analysis per store
  const analysis = useMemo(() => {
    const byLoc = {};
    for(const r of scopeRows) {
      const loc = normLoc(r.loc);
      if(!byLoc[loc]) byLoc[loc] = [];
      byLoc[loc].push(r);
    }
    return Object.entries(byLoc).map(([loc, rows]) => {
      const t    = DEFAULT_TARGETS[loc] || {};
      const rate = AVG_RATES[loc] || DIST_AVG_RATE;
      const tgt  = t.tJuneLaborPct || t.tLabor || 0.22;
      const buf  = tgt + LABOR_BUFFER;
      const ta   = TA_DATA[loc] || {};

      const days = [...rows].sort((a,b) => a.date - b.date).map(r => {
        const needHrs  = (r.needVLH || 0) + (r.fixGuideHrs || 0);
        const schedHrs = (r.schVLH  || 0) + (r.schFixHrs   || 0);
        const crewHrs  = r.crewHrs || 0;
        const sales    = r.sales   || 0;
        const tgtHrs   = tgt * sales / rate;
        const controlled  = Math.max(0, schedHrs - crewHrs);
        const excessVsTgt = schedHrs - tgtHrs;
        const laborPct    = r.laborPct || 0; // LifeLenz punched %
        // QSR cross-reference — cloud-first (Glimpse labor %, DAR hours),
        // already scale-normalized when the indexes were built.
        const dateStr = r.date.toISOString().slice(0,10);
        const qkey = loc + '|' + dateStr;
        const qsrLaborPct = laborIdx.pctIdx[qkey] ? laborIdx.pctIdx[qkey].pct : null;
        const qsrActHrs   = laborIdx.hrsIdx[qkey] ? laborIdx.hrsIdx[qkey].hrs : null;
        return { date: r.date, sales, needHrs, schedHrs, crewHrs, tgtHrs, controlled, excessVsTgt, laborPct, qsrLaborPct, qsrActHrs };
      });

      const tot = days.reduce((a,d) => ({
        sales: a.sales + d.sales, needHrs: a.needHrs + d.needHrs,
        schedHrs: a.schedHrs + d.schedHrs, crewHrs: a.crewHrs + d.crewHrs,
        tgtHrs: a.tgtHrs + d.tgtHrs, controlled: a.controlled + d.controlled,
        excessVsTgt: a.excessVsTgt + d.excessVsTgt,
      }), { sales:0, needHrs:0, schedHrs:0, crewHrs:0, tgtHrs:0, controlled:0, excessVsTgt:0 });

      const avgLaborPct = days.reduce((s,d) => s + d.laborPct, 0) / (days.length || 1);
      const excessCost  = tot.excessVsTgt * rate;
      const controlCost = tot.controlled * rate;
      const actLaborPct = tot.sales > 0 ? (tot.crewHrs * rate / tot.sales * 100) : 0;

      return { loc, name: STORE_NAMES[loc]||loc, days, tot, ta, rate, tgt, buf, avgLaborPct, actLaborPct, excessCost, controlCost };
    }).sort((a,b) => b.tot.excessVsTgt - a.tot.excessVsTgt);
  }, [scopeRows]);

  const distTot = useMemo(() => {
    return analysis.reduce((a,s) => ({
      sales: a.sales + s.tot.sales, needHrs: a.needHrs + s.tot.needHrs,
      schedHrs: a.schedHrs + s.tot.schedHrs, crewHrs: a.crewHrs + s.tot.crewHrs,
      controlled: a.controlled + s.tot.controlled,
      excessCost: a.excessCost + s.excessCost, controlCost: a.controlCost + s.controlCost,
    }), { sales:0, needHrs:0, schedHrs:0, crewHrs:0, controlled:0, excessCost:0, controlCost:0 });
  }, [analysis]);

  const totalMissed = Object.values(TA_DATA).reduce((s,d) => s + d.missedShifts, 0);
  const noData = scopeRows.length === 0;
  const weekInfo = weeks.find(w => w.k === activeWeek);
  const overTgt = analysis.filter(s => s.tot.excessVsTgt > 1);

  // ── Styles ──
  const pillBtn = (active) => ({
    background: active ? 'rgba(245,158,11,.18)' : 'rgba(255,255,255,.04)',
    border: `1px solid ${active ? AMBER : BDR}`,
    color: active ? AMBER : TEXT3, borderRadius: 20,
    padding: '3px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  });
  const thS = (left) => ({ padding:'6px 10px', fontSize:9.5, color:TEXT3, textTransform:'uppercase', letterSpacing:'.5px', fontWeight:600, borderBottom:`1px solid ${BDR}`, whiteSpace:'nowrap', textAlign:left?'left':'right' });
  const tdS = (color, left) => ({ padding:'5px 10px', fontSize:11.5, color:color||TEXT2, textAlign:left?'left':'right', borderBottom:`1px solid ${BDR}`, whiteSpace:'nowrap' });
  const tdDay = (color, left) => ({ padding:'4px 10px', fontSize:11, color:color||TEXT3, textAlign:left?'left':'right', borderBottom:`1px solid rgba(255,255,255,.04)`, whiteSpace:'nowrap' });

  const pluSign = v => (v > 0 ? '+' : '') + v.toFixed(1);
  const hrColor = diff => diff > 5 ? RED : diff > 0 ? AMBER : diff < -5 ? GREEN : TEXT2;

  return div({ style: { display:'flex', flexDirection:'column', gap:16 } },

    // ── Controls ────────────────────────────────────────────────────────────
    div({ style: { display:'flex', flexDirection:'column', gap:10 } },
      // Week pills — hidden when panel header manages week selection
      !panelManaged && weeks.length > 0 && div({ style: { display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' } },
        div({ style: { fontSize:10, color:TEXT3, textTransform:'uppercase', letterSpacing:'.5px', marginRight:4, flexShrink:0 } }, 'Week:'),
        ...weeks.map(w => h('button', {
          key: w.k, onClick: () => setSelWeek(w.k), style: pillBtn(w.k === activeWeek)
        }, w.label))
      ),
      // Scope + T&A note
      div({ style: { display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' } },
        div({ style: { fontSize:10, color:TEXT3, textTransform:'uppercase', letterSpacing:'.5px', flexShrink:0 } }, 'Scope:'),
        h('select', {
          value: scope,
          onChange: e => setScope(e.target.value),
          style: { background:SURF2, border:`1px solid ${BDR}`, color:TEXT, borderRadius:4, padding:'4px 10px', fontSize:12, cursor:'pointer', colorScheme:'dark', maxWidth:240 }
        },
          scopeOptions.map(o => h('option', { key:o.value, value:o.value, disabled:o.disabled, style:{ color: o.disabled ? TEXT3 : TEXT } }, o.label))
        ),
        div({ style: { flex:1 } }),
        (laborRows && laborRows.length > 0) && div({ style: { fontSize:10, color:BLUE } }, `✓ QSR ops data loaded — cross-reference enabled`),
        div({ style: { fontSize:10, color:TEXT3 } }, `T&A: ${TA_PERIOD} (monthly)`)
      )
    ),

    // ── No data state ───────────────────────────────────────────────────────
    noData && div({
      style: { background:'rgba(245,158,11,.08)', border:`1px solid rgba(245,158,11,.2)`, borderRadius:R, padding:'10px 14px', fontSize:11, color:AMBER }
    }, '⚠ No scheduling data for this period. Drop LifeLenz Labor Analysis Summary Report CSVs onto the main Meridian screen, then select a week above.'),

    // ── Three-layer district story ──────────────────────────────────────────
    !noData && div({
      style: { background:SURF2, border:`1px solid ${BDR}`, borderRadius:R, padding:'16px 20px' }
    },
      div({ style: { fontSize:11, fontWeight:700, color:TEXT3, textTransform:'uppercase', letterSpacing:'.6px', marginBottom:12 } },
        weekInfo ? `District story · ${weekInfo.label}` : 'District story'
      ),
      // Three columns
      div({ style: { display:'flex', gap:0, alignItems:'stretch', marginBottom:14 } },
        // Layer 1: Forecast
        div({ style: { flex:1, padding:'12px 16px', background:'rgba(59,130,246,.07)', borderRadius:`${R} 0 0 ${R}`, border:`1px solid rgba(59,130,246,.2)` } },
          div({ style: { fontSize:9, color:BLUE, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6, fontWeight:700 } }, '① LifeLenz Forecast'),
          div({ style: { fontSize:26, fontWeight:800, color:TEXT, lineHeight:1 } }, fmtN(distTot.needHrs,0)),
          div({ style: { fontSize:10, color:TEXT3, marginTop:3 } }, 'hours projected needed'),
          div({ style: { fontSize:10, color:TEXT3, marginTop:8 } }, 'What the system said to schedule based on forecasted volume')
        ),
        div({ style: { width:28, display:'flex', alignItems:'center', justifyContent:'center', color:TEXT3, fontSize:16, flexShrink:0, zIndex:1 } }, '→'),
        // Layer 2: Scheduled
        div({ style: { flex:1, padding:'12px 16px', background:`rgba(245,158,11,.07)`, border:`1px solid rgba(245,158,11,.2)` } },
          div({ style: { fontSize:9, color:AMBER, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6, fontWeight:700 } }, '② Scheduled'),
          div({ style: { fontSize:26, fontWeight:800, color:TEXT, lineHeight:1 } }, fmtN(distTot.schedHrs,0)),
          div({ style: { fontSize:10, color:TEXT3, marginTop:3 } }, 'hours put on schedule'),
          div({ style: { fontSize:13, fontWeight:700, color: distTot.schedHrs - distTot.needHrs > 0 ? RED : GREEN, marginTop:8 } },
            (distTot.schedHrs - distTot.needHrs > 0 ? '+' : '') + fmtN(distTot.schedHrs - distTot.needHrs, 1) + ' vs forecast'
          )
        ),
        div({ style: { width:28, display:'flex', alignItems:'center', justifyContent:'center', color:TEXT3, fontSize:16, flexShrink:0 } }, '→'),
        // Layer 3: Actual
        div({ style: { flex:1, padding:'12px 16px', background:'rgba(34,197,94,.07)', borderRadius:`0 ${R} ${R} 0`, border:`1px solid rgba(34,197,94,.2)` } },
          div({ style: { fontSize:9, color:GREEN, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6, fontWeight:700 } }, '③ Actually Worked'),
          div({ style: { fontSize:26, fontWeight:800, color:TEXT, lineHeight:1 } }, fmtN(distTot.crewHrs,0)),
          div({ style: { fontSize:10, color:TEXT3, marginTop:3 } }, 'hours punched (timeclock)'),
          div({ style: { fontSize:13, fontWeight:700, color: distTot.controlled > 10 ? AMBER : GREEN, marginTop:8 } },
            '−' + fmtN(distTot.controlled,1) + ' hrs controlled back'
          )
        )
      ),
      // Impact row
      div({ style: { display:'flex', gap:10, flexWrap:'wrap' } },
        h(MetricCard, { label:'Sched vs Target $',  value: (distTot.excessCost > 0 ? '+' : '−') + fmt$(Math.abs(distTot.excessCost)),  sub: fmtN(analysis.reduce((s,a)=>s+Math.max(0,a.tot.excessVsTgt),0),1)+' hrs over-scheduled', color: distTot.excessCost > 0 ? RED : GREEN }),
        h(MetricCard, { label:'Labor "Controlled" Back', value: fmt$(distTot.controlCost), sub: fmtN(distTot.controlled,1)+' hrs sched but not worked', color: AMBER }),
        h(MetricCard, { label:'Stores Over Target', value: overTgt.length, sub: 'scheduled above actual target', color: overTgt.length > 0 ? RED : GREEN }),
        h(MetricCard, { label:'Missed Shifts', value: totalMissed.toLocaleString(), sub: TA_PERIOD+' (monthly)', color: RED }),
      )
    ),

    // ── Store-by-store table ────────────────────────────────────────────────
    !noData && div({ style: { overflowX:'auto', borderRadius:R, border:`1px solid ${BDR}` } },
      h('table', { style: { width:'100%', borderCollapse:'collapse' } },
        h('thead', null,
          h('tr', null,
            h('th', { style: { ...thS(true), paddingLeft:8 } }, 'Store'),
            h('th', { colSpan:3, style: { ...thS(false), textAlign:'center', borderLeft:`1px solid ${BDR}`, borderRight:`1px solid ${BDR}`, background:'rgba(59,130,246,.04)', color:BLUE } }, 'HOURS: Need → Sched → Worked'),
            h('th', { style: thS(false) }, 'Sched vs Need'),
            h('th', { style: thS(false) }, 'Controlled'),
            h('th', { style: thS(false) }, 'Labor %'),
            h('th', { style: thS(false) }, 'vs Target'),
            h('th', { style: thS(false) }, 'Sched vs Tgt $'),
            h('th', { style: thS(false) }, 'Missed Shifts'),
            h('th', { style: { ...thS(false), paddingRight:10 } }, ''),
          )
        ),
        h('tbody', null,
          analysis.map((s, i) => {
            const isExp = expanded[s.loc];
            const schedVsNeed = s.tot.schedHrs - s.tot.needHrs;
            const avgPunched  = s.avgLaborPct;
            const vsTarget    = avgPunched / 100 - s.tgt;
            const tCol = vsTarget > 0.01 ? RED : vsTarget > -0.005 ? AMBER : GREEN;
            const excessCol   = s.excessCost > 0 ? RED : GREEN;
            const dayFmt = d => d.date.toLocaleDateString('en-US', { weekday:'short', month:'numeric', day:'numeric' });

            return [
              h('tr', {
                key: s.loc,
                onClick: () => toggleExp(s.loc),
                style: { background: i%2===0?'transparent':'rgba(255,255,255,.015)', cursor:'pointer' }
              },
                h('td', { style: { ...tdS(TEXT, true), paddingLeft:8 } },
                  h('span', { style: { fontWeight:700 } }, s.loc),
                  h('span', { style: { color:TEXT3, marginLeft:6, fontSize:10.5 } }, s.name)
                ),
                h('td', { style: { ...tdS(TEXT2), borderLeft:`1px solid ${BDR}`, background:'rgba(59,130,246,.03)' } }, fmtN(s.tot.needHrs,0)),
                h('td', { style: { ...tdS(hrColor(schedVsNeed)), background:'rgba(59,130,246,.03)' } }, fmtN(s.tot.schedHrs,0)),
                h('td', { style: { ...tdS(TEXT2), borderRight:`1px solid ${BDR}`, background:'rgba(59,130,246,.03)' } }, fmtN(s.tot.crewHrs,0)),
                h('td', { style: tdS(hrColor(schedVsNeed)) }, pluSign(schedVsNeed) + ' hrs'),
                h('td', { style: tdS(s.tot.controlled > 5 ? AMBER : TEXT3) }, s.tot.controlled > 0.5 ? '−'+fmtN(s.tot.controlled,1)+' hrs' : '—'),
                h('td', { style: tdS(colorForLaborPct(avgPunched)) }, fmtPct(avgPunched)),
                h('td', { style: { ...tdS(tCol), fontWeight: Math.abs(vsTarget) > 0.01 ? 700 : 400 } }, (vsTarget > 0 ? '+' : '') + (vsTarget*100).toFixed(1) + '%'),
                h('td', { style: tdS(excessCol) }, Math.abs(s.excessCost) > 10 ? (s.excessCost > 0 ? '+' : '−') + fmt$(Math.abs(s.excessCost)) : '—'),
                h('td', { style: tdS(s.ta.missedShifts > 150 ? RED : s.ta.missedShifts > 90 ? AMBER : GREEN) }, s.ta.missedShifts || '—'),
                h('td', { style: { ...tdS(TEXT3), paddingRight:10 } }, isExp ? '▲' : '▼'),
              ),
              // ── Expanded day-by-day ──
              isExp && h('tr', { key: s.loc+'_exp' },
                h('td', { colSpan:11, style: { padding:'0 0 0 24px', borderBottom:`2px solid ${BDR}` } },
                  div({ style: { padding:'10px 0 14px', overflowX:'auto' } },
                    // Story callout for this store
                    div({ style: { fontSize:11, color:TEXT2, lineHeight:1.7, marginBottom:10, padding:'8px 12px', background:'rgba(255,255,255,.03)', borderRadius:R, borderLeft:`3px solid ${AMBER}` } },
                      `LifeLenz forecast `,
                      h('strong', null, fmtN(s.tot.needHrs,1)+' hrs'),
                      `. GM scheduled `,
                      h('strong', { style: { color: hrColor(s.tot.schedHrs-s.tot.needHrs) } }, fmtN(s.tot.schedHrs,1)+' hrs'),
                      ` (${pluSign(s.tot.schedHrs-s.tot.needHrs)} vs forecast). Crew actually worked `,
                      h('strong', null, fmtN(s.tot.crewHrs,1)+' hrs'),
                      ` — `,
                      h('strong', { style: { color:AMBER } }, fmtN(s.tot.controlled,1)+' hrs'),
                      ` were scheduled but not used (sent home early / missed & not backfilled). `,
                      Math.abs(s.excessCost) > 10 ? h('span', { style: { color: s.excessCost > 0 ? RED : GREEN } },
                        `Scheduled labor ${fmt$(s.tot.schedHrs * s.rate)} vs ${fmt$(s.tot.tgtHrs * s.rate)} target = ${s.excessCost > 0 ? '+' : '−'}${fmt$(Math.abs(s.excessCost))} vs target.`
                      ) : h('span', { style: { color:GREEN } }, `Scheduled labor at target.`)
                    ),
                    // Day table
                    (() => {
                      const hasQsr = s.days.some(d => d.qsrLaborPct != null);
                      const cols = ['Day','Sales','Fcst hrs','Sched hrs','+vs Fcst','LifeLenz %','Controlled hrs'];
                      if(hasQsr) { cols.push('QSR Labor %', 'QSR Hrs', 'LZ vs QSR'); }
                      cols.push('vs Target');
                      return h('table', { style: { borderCollapse:'collapse', fontSize:11, width:'auto' } },
                        h('thead', null,
                          h('tr', null,
                            cols.map((l,j) => h('th', { key:j, style: { ...thS(j===0), fontSize:9, padding:'4px 10px', color: (l.startsWith('QSR')) ? BLUE : TEXT3 } }, l))
                          )
                        ),
                        h('tbody', null,
                          s.days.map((d, j) => {
                            const svn = d.schedHrs - d.needHrs;
                            const vst = d.laborPct/100 - s.tgt;
                            const qsrDiff = (d.qsrLaborPct != null && d.laborPct) ? d.laborPct - d.qsrLaborPct : null;
                            const tds = [
                              h('td', { key:'day', style: tdDay(TEXT2, true) }, dayFmt(d)),
                              h('td', { key:'sales', style: tdDay() }, fmt$(d.sales)),
                              h('td', { key:'need', style: tdDay(BLUE) }, fmtN(d.needHrs,1)),
                              h('td', { key:'sched', style: tdDay(hrColor(svn)) }, fmtN(d.schedHrs,1)),
                              h('td', { key:'svn', style: tdDay(hrColor(svn)) }, pluSign(svn)),
                              h('td', { key:'lzpct', style: tdDay(colorForLaborPct(d.laborPct)) }, fmtPct(d.laborPct)),
                              h('td', { key:'ctrl', style: tdDay(d.controlled > 2 ? AMBER : TEXT3) }, d.controlled > 0.5 ? '−'+fmtN(d.controlled,1) : '—'),
                            ];
                            if(hasQsr) {
                              const qc = d.qsrLaborPct != null ? colorForLaborPct(d.qsrLaborPct) : TEXT3;
                              const diffCol = qsrDiff == null ? TEXT3 : Math.abs(qsrDiff) < 0.5 ? GREEN : Math.abs(qsrDiff) < 2 ? AMBER : RED;
                              tds.push(
                                h('td', { key:'qsrpct', style: { ...tdDay(qc), borderLeft:`1px solid rgba(59,130,246,.2)` } }, d.qsrLaborPct != null ? fmtPct(d.qsrLaborPct) : '—'),
                                h('td', { key:'qsrhrs', style: tdDay(TEXT3) }, d.qsrActHrs ? fmtN(d.qsrActHrs,1) : '—'),
                                h('td', { key:'diff', style: { ...tdDay(diffCol), borderRight:`1px solid rgba(59,130,246,.2)` } }, qsrDiff != null ? (qsrDiff > 0 ? '+' : '') + fmtN(qsrDiff,1) + '%' : '—'),
                              );
                            }
                            tds.push(h('td', { key:'vst', style: tdDay(vst > 0.01 ? RED : vst > -0.005 ? AMBER : GREEN) }, (vst>0?'+':'')+(vst*100).toFixed(1)+'%'));
                            return h('tr', { key:j }, ...tds);
                          })
                        )
                      );
                    })()
                  )
                )
              )
            ];
          })
        )
      )
    ),

    // ── Generate Presentation ────────────────────────────────────────────────
    div({ style: { display:'flex', justifyContent:'flex-end', gap:8 } },
      !noData && h('button', {
        onClick: () => {
          const html = generateOpportunityHTML(analysis, weekInfo, distTot, totalMissed);
          const blob = new Blob([html], { type: 'text/html' });
          window.open(URL.createObjectURL(blob), '_blank');
        },
        style: { background:'rgba(245,158,11,.12)', border:`1px solid ${AMBER}`, color:AMBER, borderRadius:R, padding:'7px 16px', fontSize:11, fontWeight:600, cursor:'pointer' }
      }, '📊 Generate Full Presentation'),
      !noData && h('button', {
        onClick: () => {
          const scopeLabel = scopeOptions.find(o => o.value === scope)?.label || scope;
          const html = generateSlideDeckHTML(analysis, distTot, weekInfo, scopeLabel);
          const blob = new Blob([html], { type: 'text/html' });
          window.open(URL.createObjectURL(blob), '_blank');
        },
        style: { background:'rgba(68,114,202,.12)', border:'1px solid #4472ca', color:'#4472ca', borderRadius:R, padding:'7px 16px', fontSize:11, fontWeight:600, cursor:'pointer' }
      }, '🎞 Slide Deck')
    )
  );
}

function generateOpportunityHTML(analysis, weekInfo, distTot, totalMissed) {
  const period = weekInfo ? weekInfo.label + ', 2026' : 'Selected Period';
  const overTgt = analysis.filter(s => s.tot.excessVsTgt > 1);
  const fmt$ = v => '$' + Math.round(v||0).toLocaleString();
  const fmtN = (v,d=1) => (v||0).toFixed(d);
  const pct  = v => (v||0).toFixed(1) + '%';
  const plu  = v => (v>0?'+':'')+v.toFixed(1);

  const storeRows = analysis.map((s, idx) => {
    const schedVsNeed    = s.tot.schedHrs - s.tot.needHrs;
    const vsTarget       = s.avgLaborPct / 100 - s.tgt;
    const schedLaborPct  = s.tot.sales > 0 ? s.tot.schedHrs * s.rate / s.tot.sales * 100 : 0;
    const schedVsTgt     = schedLaborPct / 100 - s.tgt;
    const tCol    = vsTarget  > 0.01 ? '#ef4444' : vsTarget  > -0.005 ? '#f59e0b' : '#22c55e';
    const sLCol   = schedVsTgt > 0.01 ? '#ef4444' : schedVsTgt > -0.005 ? '#f59e0b' : '#22c55e';
    const svnCol  = schedVsNeed > 0 ? '#ef4444' : '#22c55e';
    const dayRows = s.days.map(d => {
      const svn = d.schedHrs - d.needHrs;
      const vst = d.laborPct/100 - s.tgt;
      const dSchedPct  = d.sales > 0 ? d.schedHrs * s.rate / d.sales * 100 : 0;
      const dSchedVsTgt = dSchedPct / 100 - s.tgt;
      const lc = d.laborPct < 19 ? '#22c55e' : d.laborPct < 22 ? '#f59e0b' : '#ef4444';
      const sc = dSchedVsTgt > 0.01 ? '#ef4444' : dSchedVsTgt > -0.005 ? '#f59e0b' : '#22c55e';
      const vc = vst > 0.01 ? '#ef4444' : vst > -0.005 ? '#f59e0b' : '#22c55e';
      const dayLabel = d.date.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
      return `<tr>
        <td style="color:#94a3b8">${dayLabel}</td>
        <td>$${Math.round(d.sales).toLocaleString()}</td>
        <td style="color:#60a5fa">${fmtN(d.needHrs)}</td>
        <td style="color:${svn>0?'#f59e0b':'#94a3b8'}">${fmtN(d.schedHrs)}</td>
        <td style="color:${sc};font-weight:600">${pct(dSchedPct)}</td>
        <td style="color:${svnCol};font-weight:${Math.abs(svn)>5?700:400}">${plu(svn)}</td>
        <td>${fmtN(d.crewHrs)}</td>
        <td style="color:${d.controlled>2?'#f59e0b':'#475569'}">${d.controlled>0.5?'−'+fmtN(d.controlled):'—'}</td>
        <td style="color:${lc};font-weight:600">${pct(d.laborPct)}</td>
        <td style="color:${vc};font-weight:${Math.abs(vst)>0.01?700:400}">${(vst>0?'+':'')+(vst*100).toFixed(1)}%</td>
      </tr>`;
    }).join('');
    return `
    <div class="store-block${idx > 0 && idx % 2 === 0 ? ' pg-break' : ''}">
      <div class="store-header">
        <span class="store-id">${s.loc}</span>
        <span class="store-name">${s.name}</span>
        <div class="store-tags">
          ${Math.abs(s.excessCost) > 10 ? `<span class="tag ${s.excessCost > 0 ? 'red' : 'green'}">${s.excessCost > 0 ? '+' : '−'}${fmt$(Math.abs(s.excessCost))} vs target</span>` : '<span class="tag green">At target</span>'}
          ${s.tot.controlled > 5 ? `<span class="tag amber">−${fmtN(s.tot.controlled,0)} hrs controlled</span>` : ''}
          ${s.ta.missedShifts > 28 ? `<span class="tag red">~${Math.round(s.ta.missedShifts/4)} missed shifts/wk</span>` : ''}
        </div>
      </div>
      <div class="story-bar">
        LifeLenz forecast <strong>${fmtN(s.tot.needHrs,0)} hrs</strong> →
        GM scheduled <strong style="color:${svnCol}">${fmtN(s.tot.schedHrs,0)} hrs</strong> (${plu(schedVsNeed)} vs forecast) →
        Crew worked <strong>${fmtN(s.tot.crewHrs,0)} hrs</strong>
        ${s.tot.controlled > 1 ? `· <span style="color:#f59e0b">${fmtN(s.tot.controlled,1)} hrs controlled back</span>` : ''}
        · Sched labor <span style="color:${sLCol};font-weight:700">${pct(schedLaborPct)}</span>
        → Actual <span style="color:${tCol};font-weight:700">${pct(s.avgLaborPct)}</span>
        · target <span style="color:#94a3b8">${pct(s.tgt*100)}</span>
      </div>
      <div style="overflow-x:auto">
      <table class="day-table"><thead><tr>
        <th>Day</th><th>Sales</th><th>Forecast</th><th>Scheduled</th><th>Sched%</th><th>+vs Fcst</th><th>Worked</th><th>Controlled</th><th>Labor%</th><th>vs Target</th>
      </tr></thead><tbody>${dayRows}</tbody></table>
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Scheduling Opportunity · ${period}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1526;color:#e2e8f0;padding:32px 40px;line-height:1.5}
.wrap{max-width:1200px;margin:0 auto}
h1{font-size:30px;font-weight:800;color:#fff;letter-spacing:-.02em}
.sub{font-size:13px;color:#475569;margin-top:4px;margin-bottom:28px}
.kpis{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:32px}
.kpi{background:#111d35;border:1px solid #1e293b;border-radius:10px;padding:16px 20px;min-width:160px}
.kpi-l{font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;font-weight:600}
.kpi-n{font-size:28px;font-weight:800;line-height:1}.kpi-s{font-size:10px;color:#475569;margin-top:4px}
.three-layer{display:grid;grid-template-columns:1fr 24px 1fr 24px 1fr;gap:0;margin-bottom:32px;border:1px solid #1e293b;border-radius:10px;overflow:hidden}
.layer{padding:16px 20px}.layer-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px}
.layer-hrs{font-size:32px;font-weight:800;line-height:1}.layer-sub{font-size:11px;color:#475569;margin-top:4px}
.layer-delta{font-size:14px;font-weight:700;margin-top:10px}
.arrow{display:flex;align-items:center;justify-content:center;color:#334155;font-size:20px;background:#080f1e}
.red{color:#ef4444}.amber{color:#f59e0b}.green{color:#22c55e}.blue{color:#60a5fa}.gray{color:#475569}
.store-block{margin-bottom:32px;border:1px solid #1e293b;border-radius:10px;overflow:hidden}
.store-header{display:flex;align-items:center;gap:10px;padding:14px 18px;background:#111d35;flex-wrap:wrap}
.store-id{font-size:16px;font-weight:800;color:#fff}.store-name{font-size:13px;color:#475569;flex:1}
.store-tags{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}
.tag{font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px}
.tag.red{background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.3)}
.tag.amber{background:rgba(245,158,11,.15);color:#f59e0b;border:1px solid rgba(245,158,11,.3)}
.tag.green{background:rgba(34,197,94,.1);color:#22c55e;border:1px solid rgba(34,197,94,.25)}
.story-bar{padding:10px 18px;font-size:12px;color:#94a3b8;background:#0d1a2d;border-bottom:1px solid #1e293b;line-height:1.8}
.day-table{width:100%;border-collapse:collapse;font-size:11.5px}
.day-table th{padding:7px 12px;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.05em;text-align:right;border-bottom:1px solid #1e293b;background:#0a1424;font-weight:600}
.day-table th:first-child{text-align:left}.day-table td{padding:6px 12px;color:#94a3b8;text-align:right;border-bottom:1px solid rgba(255,255,255,.04)}
.day-table td:first-child{text-align:left}.day-table tr:last-child td{border-bottom:none}
.day-table tr:hover td{background:rgba(255,255,255,.02)}

@media print {
  @page { size: letter portrait; margin: 0.5in }
  body { background:#fff !important; color:#1e293b !important; padding:0 !important }
  .wrap { max-width:100% }
  h1 { color:#1e293b !important }
  .sub { color:#475569 !important }
  .kpis { page-break-inside:avoid }
  .kpi { background:#f8fafc !important; border-color:#e2e8f0 !important }
  .kpi-l { color:#64748b !important }
  .kpi-n { color:#1e293b !important }
  .kpi-n.red { color:#dc2626 !important }
  .kpi-n.amber { color:#d97706 !important }
  .kpi-s { color:#64748b !important }
  .three-layer { page-break-inside:avoid; border-color:#e2e8f0 !important }
  .layer { background:#f8fafc !important }
  .layer-hrs { color:#1e293b !important }
  .layer-sub,.layer-delta { color:#64748b !important }
  .layer-delta.red { color:#dc2626 !important }
  .layer-delta.amber { color:#d97706 !important }
  .layer-delta.green { color:#16a34a !important }
  .arrow { background:#f1f5f9 !important; color:#94a3b8 !important }
  .store-block { page-break-inside:avoid; border-color:#e2e8f0 !important; border-radius:0; margin-bottom:16px }
  .pg-break { page-break-before:always }
  .store-header { background:#f1f5f9 !important }
  .store-id { color:#1e293b !important }
  .store-name { color:#64748b !important }
  .tag.red { background:rgba(220,38,38,.08) !important; color:#dc2626 !important; border-color:rgba(220,38,38,.25) !important }
  .tag.amber { background:rgba(217,119,6,.08) !important; color:#d97706 !important; border-color:rgba(217,119,6,.25) !important }
  .tag.green { background:rgba(22,163,74,.08) !important; color:#16a34a !important; border-color:rgba(22,163,74,.25) !important }
  .story-bar { background:#f8fafc !important; color:#475569 !important; border-color:#e2e8f0 !important }
  .story-bar strong { color:#1e293b !important }
  .day-table th { background:#f1f5f9 !important; color:#64748b !important; border-color:#e2e8f0 !important }
  .day-table td { color:#334155 !important; border-color:#f1f5f9 !important }
  .day-table tr:hover td { background:none !important }
  .red { color:#dc2626 !important }
  .amber { color:#d97706 !important }
  .green { color:#16a34a !important }
  .blue { color:#2563eb !important }
  .gray { color:#64748b !important }
}
</style></head><body><div class="wrap">
<h1>Scheduling Opportunity Report</h1>
<div class="sub">Week of ${period} · ${analysis.length} stores · Generated ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div>

<div class="kpis">
  <div class="kpi"><div class="kpi-l">Stores Over Target</div><div class="kpi-n red">${overTgt.length}</div><div class="kpi-s">of ${analysis.length} with scheduling data</div></div>
  <div class="kpi"><div class="kpi-l">Total Excess Cost</div><div class="kpi-n red">${fmt$(distTot.excessCost)}</div><div class="kpi-s">hrs over-scheduled vs target</div></div>
  <div class="kpi"><div class="kpi-l">Hours "Controlled" Back</div><div class="kpi-n amber">${fmtN(distTot.controlled,0)}</div><div class="kpi-s">${fmt$(distTot.controlCost)} on schedule, not used</div></div>
  <div class="kpi"><div class="kpi-l">Missed Shifts (Jun 1–28)</div><div class="kpi-n red">${totalMissed.toLocaleString()}</div><div class="kpi-s">monthly T&A data</div></div>
</div>

<div class="three-layer">
  <div class="layer" style="background:rgba(59,130,246,.06);border-right:1px solid #1e293b">
    <div class="layer-label blue">① LifeLenz Forecast</div>
    <div class="layer-hrs">${fmtN(distTot.needHrs,0)}</div>
    <div class="layer-sub">hours projected needed</div>
    <div class="layer-delta gray" style="margin-top:10px;font-size:12px">What the system said to schedule based on forecasted volume</div>
  </div>
  <div class="arrow">→</div>
  <div class="layer" style="background:rgba(245,158,11,.06);border-right:1px solid #1e293b">
    <div class="layer-label amber">② Scheduled</div>
    <div class="layer-hrs">${fmtN(distTot.schedHrs,0)}</div>
    <div class="layer-sub">hours put on the schedule</div>
    <div class="layer-delta ${distTot.schedHrs-distTot.needHrs>0?'red':'green'}">${plu(distTot.schedHrs-distTot.needHrs)} hrs vs forecast</div>
  </div>
  <div class="arrow">→</div>
  <div class="layer" style="background:rgba(34,197,94,.06)">
    <div class="layer-label green">③ Actually Worked</div>
    <div class="layer-hrs">${fmtN(distTot.crewHrs,0)}</div>
    <div class="layer-sub">hours punched (timeclock)</div>
    <div class="layer-delta amber">−${fmtN(distTot.controlled,1)} hrs controlled back</div>
  </div>
</div>

${storeRows}
</div></body></html>`;
}

// Returns the last N weeks (Sun–Sat) that should have data, oldest first.
function recentWeeks(n = 4) {
  const out = [];
  const now = new Date();
  // Start from the most recently completed week
  let ref = new Date(now);
  ref.setDate(ref.getDate() - 7); // last week
  for(let i = 0; i < n; i++) {
    const { sun, sat } = weekBounds(ref);
    const k = weekKey(weekWednesday(sun));
    out.unshift({ k, sun, sat,
      label: sun.toLocaleDateString('en-US', { month:'short', day:'numeric' }) + ' – ' +
             sat.toLocaleDateString('en-US', { month:'short', day:'numeric' }) });
    ref = new Date(ref);
    ref.setDate(ref.getDate() - 7);
  }
  return out;
}

function SyncPanel({ schedRows }) {
  const loaded = useMemo(() => {
    const s = new Set();
    for(const r of (schedRows||[])) {
      if(r.date) s.add(weekKey(weekWednesday(r.date)));
    }
    return s;
  }, [schedRows]);

  const missing = useMemo(() => recentWeeks(4).filter(w => !loaded.has(w.k)), [loaded]);

  const { sun: defSun, sat: defSat } = weekBounds(new Date(Date.now() - 7*86400000));
  const [start, setStart] = useState(toInputDate(defSun));
  const [end,   setEnd]   = useState(toInputDate(defSat));
  const [copied, setCopied] = useState(false);

  const setWeek = useCallback(w => {
    setStart(toInputDate(w.sun));
    setEnd(toInputDate(w.sat));
  }, []);

  const cmd = `node /tmp/lifelenz-sync.mjs "YOUR-TOKEN" ${start} ${end}`;

  const copy = useCallback(() => {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [cmd]);

  const inputStyle = {
    background: 'rgba(255,255,255,.06)', border: `1px solid ${BDR}`, borderRadius: 4,
    color: TEXT, fontSize: 12, padding: '4px 8px', cursor: 'pointer', colorScheme: 'dark',
  };
  const labelStyle = { fontSize: 11, color: TEXT3, marginBottom: 3 };

  return div({
    style: { background: 'rgba(255,255,255,.03)', border: `1px solid ${BDR}`, borderRadius: R,
             padding: '14px 16px', marginBottom: 20 }
  },
    div({ style: { fontSize: 11, fontWeight: 600, color: TEXT2, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.5px' } },
      'Download Scheduling Data'
    ),

    // ── Missing weeks quick-select ─────────────────────────────────────────
    missing.length > 0 && div({
      style: { background: 'rgba(239,68,68,.07)', border: '1px solid rgba(239,68,68,.2)',
               borderRadius: 6, padding: '10px 12px', marginBottom: 14 }
    },
      div({ style: { display:'flex', alignItems:'center', gap:6, marginBottom:8 } },
        div({ style: { fontSize:10, color:'#ef4444', fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px' } },
          `⚠ ${missing.length} week${missing.length>1?'s':''} missing — click to pre-fill dates`
        )
      ),
      div({ style: { display:'flex', gap:6, flexWrap:'wrap' } },
        ...missing.map(w => h('button', {
          key: w.k,
          onClick: () => setWeek(w),
          style: { background:'rgba(239,68,68,.12)', border:'1px solid rgba(239,68,68,.3)',
                   color:'#fca5a5', borderRadius:20, padding:'3px 11px', fontSize:11, cursor:'pointer' }
        }, w.label))
      ),
      div({ style: { fontSize:10, color:'rgba(239,68,68,.7)', marginTop:8 } },
        'Click a week above → copy the command → run in terminal → upload the CSV files to Meridian.'
      )
    ),

    div({ style: { display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' } },
      div(null,
        div({ style: labelStyle }, 'Start Date'),
        h('input', { type: 'date', value: start, onChange: e => setStart(e.target.value), style: inputStyle })
      ),
      div(null,
        div({ style: labelStyle }, 'End Date'),
        h('input', { type: 'date', value: end, onChange: e => setEnd(e.target.value), style: inputStyle })
      ),
    ),
    div({ style: { marginTop: 12 } },
      div({ style: labelStyle }, 'Terminal command — replace YOUR-TOKEN with the X-Auth-Token from DevTools → Network → any LifeLenz request'),
      div({ style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 } },
        h('code', {
          style: { flex: 1, background: 'rgba(0,0,0,.4)', border: `1px solid ${BDR}`, borderRadius: 4,
                   padding: '6px 10px', fontSize: 11, color: AMBER, fontFamily: 'monospace', overflowX: 'auto',
                   whiteSpace: 'nowrap', display: 'block' }
        }, cmd),
        h('button', {
          onClick: copy,
          style: { background: copied ? 'rgba(34,197,94,.15)' : 'rgba(255,255,255,.07)',
                   border: `1px solid ${copied ? GREEN : BDR}`, color: copied ? GREEN : TEXT2,
                   borderRadius: 4, padding: '5px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }
        }, copied ? '✓ Copied' : 'Copy')
      )
    )
  );
}

export function SchedulingPanel({ ds, settings, onClose }) {
  const schedRows = (ds && ds.schedRows) || [];
  const [activeTab,  setActiveTab]  = useState('opportunity');
  const [showSync,   setShowSync]   = useState(false);

  // ── Panel-level week selector (controls ALL tabs) ─────────────────────────
  // Compute available weeks from loaded data
  const availableWeeks = useMemo(() => {
    const sunMap = {};
    for(const r of schedRows) {
      if(!r.date) continue;
      const sun = weekWednesday(r.date);
      const k = weekKey(sun);
      if(!sunMap[k]) sunMap[k] = sun;
    }
    return Object.entries(sunMap)
      .sort((a,b) => b[0].localeCompare(a[0]))
      .map(([k, sun]) => ({ k, sun, label: weekLabel(sun), hasData: true }));
  }, [schedRows]);

  const [selWeek, setSelWeek] = useState(null);
  const [manualWeekDate, setManualWeekDate] = useState('');

  // Active week key — default to most-recent loaded week
  const activeWeekKey = useMemo(() => {
    if(selWeek) return selWeek;
    return availableWeeks.length ? availableWeeks[0].k : null;
  }, [selWeek, availableWeeks]);

  // Filter schedRows to selected week
  const weekRows = useMemo(() => {
    if(!activeWeekKey) return schedRows;
    return schedRows.filter(r => r.date && weekKey(weekWednesday(r.date)) === activeWeekKey);
  }, [schedRows, activeWeekKey]);

  const activeWeekSun = useMemo(() => {
    const w = availableWeeks.find(w => w.k === activeWeekKey);
    if(w) return w.sun;
    if(activeWeekKey) {
      const [yr,mo,dy] = activeWeekKey.split('-').map(Number);
      return new Date(yr, mo-1, dy, 12);
    }
    return null;
  }, [activeWeekKey, availableWeeks]);

  const navigateWeek = (dir) => {
    // dir: -1 = prev, +1 = next
    const cur = activeWeekSun || new Date();
    const next = new Date(cur.getTime() + dir * 7 * 86400000);
    setSelWeek(weekKey(next));
  };

  const manualPickWeek = () => {
    if(!manualWeekDate) return;
    const d = new Date(manualWeekDate + 'T12:00:00');
    setSelWeek(weekKey(weekWednesday(d)));
    setManualWeekDate('');
  };

  const weekHasData = activeWeekKey && availableWeeks.some(w => w.k === activeWeekKey);

  const byLoc = useMemo(() => {
    const m = {};
    for(const r of weekRows) { if(!m[r.loc]) m[r.loc]=[]; m[r.loc].push(r); }
    return m;
  }, [weekRows]);
  const locs = Object.keys(byLoc).sort();

  // Date range from all loaded data (for header subtitle)
  const dateRange = useMemo(() => {
    const dates = schedRows.map(r => r.date).filter(Boolean).sort((a,b) => a-b);
    if(!dates.length) return null;
    const fmt = d => d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    const fmtY = d => d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    const first = dates[0], last = dates[dates.length-1];
    return first.getFullYear() === last.getFullYear()
      ? fmt(first) + ' – ' + fmtY(last)
      : fmtY(first) + ' – ' + fmtY(last);
  }, [schedRows]);

  const overlayStyle = { position:'fixed', inset:0, background:'rgba(0,0,0,.7)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:9000, padding:'24px 16px', overflowY:'auto' };
  const panelStyle   = { background:SURF, border:`1px solid ${BDR}`, borderRadius:12, width:'100%', maxWidth:1100, padding:'24px 28px', boxShadow:'0 24px 64px rgba(0,0,0,.6)' };

  const btnStyle = (active) => ({
    background: 'none', border: 'none',
    color: active ? AMBER : TEXT3,
    fontSize: 11, fontWeight: 600,
    padding: '6px 10px',
    cursor: 'pointer',
    borderBottom: `2px solid ${active ? AMBER : 'transparent'}`,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  });

  const pillBtn = (active) => ({
    background: active ? 'rgba(245,158,11,.18)' : 'rgba(255,255,255,.04)',
    border: `1px solid ${active ? AMBER : BDR}`,
    color: active ? AMBER : TEXT3, borderRadius: 20,
    padding: '3px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  });

  // Missing-week count for the Get Data badge
  const loadedWeekKeys = useMemo(() => {
    const s = new Set();
    for(const r of schedRows) { if(r.date) s.add(weekKey(weekWednesday(r.date))); }
    return s;
  }, [schedRows]);
  const missingCount = useMemo(() => recentWeeks(4).filter(w => !loadedWeekKeys.has(w.k)).length, [loadedWeekKeys]);

  return div({ style: overlayStyle, onClick: e => { if(e.target===e.currentTarget) onClose(); } },
    div({ style: panelStyle },

      // ── Header ──────────────────────────────────────────────────────────────
      div({ style: { display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 } },
        div(null,
          div({ style: { fontSize:18, fontWeight:700, color:TEXT, letterSpacing:'-.02em' } }, 'Scheduling Intelligence'),
          div({ style: { fontSize:11, color:TEXT3, marginTop:2 } },
            'LifeLenz Labor Analysis — VLH, Fixed Hours, TPMH, Labor %',
            dateRange && h('span', { style: { color: TEXT2, marginLeft: 8 } }, '· ' + dateRange)
          )
        ),
        div({ style: { display:'flex', gap:8, alignItems:'center', flexShrink:0, marginLeft:16 } },
          div({ style: { position:'relative', display:'inline-flex' } },
            h('button', {
              onClick: () => setShowSync(s => !s),
              style: { background: showSync ? 'rgba(59,130,246,.15)' : 'rgba(255,255,255,.06)',
                       border: `1px solid ${showSync ? BLUE : missingCount ? 'rgba(239,68,68,.5)' : BDR}`,
                       color: showSync ? BLUE : missingCount ? '#fca5a5' : TEXT2,
                       borderRadius: R, padding:'5px 11px', fontSize:11, cursor:'pointer', whiteSpace:'nowrap' }
            }, '⬇ Get Data'),
            missingCount > 0 && !showSync && div({
              style: { position:'absolute', top:-6, right:-6, background:'#ef4444', color:'#fff',
                borderRadius:10, fontSize:9, fontWeight:700, padding:'1px 5px', lineHeight:1.4,
                pointerEvents:'none' }
            }, missingCount)
          ),
          h('button', {
            onClick: onClose,
            style: { background:'none', border:`1px solid ${BDR}`, color:TEXT3, borderRadius:R, padding:'5px 12px', fontSize:12, cursor:'pointer' }
          }, 'Close')
        )
      ),

      // ── Week navigator (panel-level — controls all tabs) ─────────────────────
      div({ style: { display:'flex', alignItems:'center', gap:8, marginBottom: showSync ? 12 : 16,
        padding:'8px 12px', background:'rgba(255,255,255,.03)', border:`1px solid ${BDR}`,
        borderRadius:R, flexWrap:'wrap' } },
        div({ style: { fontSize:10, color:TEXT3, textTransform:'uppercase', letterSpacing:'.5px', flexShrink:0 } }, 'Week:'),
        h('button', { onClick:()=>navigateWeek(-1),
          style:{...pillBtn(false), padding:'3px 8px', fontSize:11} }, '←'),
        div({ style: { display:'flex', gap:4, flexWrap:'wrap', flex:1 } },
          ...availableWeeks.slice(0,8).map(w => h('button', {
            key: w.k,
            onClick: () => setSelWeek(w.k),
            style: pillBtn(w.k === activeWeekKey)
          }, w.label)),
          availableWeeks.length === 0 && div({ style:{fontSize:11,color:TEXT3} }, 'No data loaded — select any week below')
        ),
        h('button', { onClick:()=>navigateWeek(+1),
          style:{...pillBtn(false), padding:'3px 8px', fontSize:11} }, '→'),
        // Manual date picker for any week
        div({ style: { display:'flex', gap:4, alignItems:'center', borderLeft:`1px solid ${BDR}`, paddingLeft:8 } },
          h('input', { type:'date', value:manualWeekDate, onChange:e=>setManualWeekDate(e.target.value),
            title:'Jump to week containing this date',
            style:{background:'rgba(255,255,255,.06)',border:`1px solid ${BDR}`,borderRadius:4,
              color:TEXT,fontSize:11,padding:'3px 6px',cursor:'pointer',colorScheme:'dark'} }),
          h('button', { onClick:manualPickWeek, disabled:!manualWeekDate,
            style:{background:'rgba(255,255,255,.07)',border:`1px solid ${BDR}`,color:TEXT2,
              borderRadius:4,padding:'3px 8px',fontSize:11,cursor:'pointer'} }, 'Go')
        ),
        // Data availability badge
        activeWeekKey && div({ style: {
          fontSize:9, padding:'2px 7px', borderRadius:10, fontWeight:700,
          background: weekHasData ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)',
          color: weekHasData ? '#10b981' : '#ef4444',
          border: weekHasData ? '.5px solid rgba(16,185,129,.2)' : '.5px solid rgba(239,68,68,.2)',
          flexShrink:0
        } }, weekHasData ? 'Data loaded' : 'No data for this week')
      ),

      // ── Sync panel (collapsed by default) ───────────────────────────────────
      showSync && h(SyncPanel, { schedRows }),

      // ── No data for selected week notice ─────────────────────────────────────
      !weekHasData && activeWeekKey && schedRows.length > 0 && div({
        style:{padding:'20px',textAlign:'center',color:TEXT3,
          background:'rgba(255,255,255,.02)',border:`1px solid ${BDR}`,borderRadius:R,marginBottom:16}
      },
        div({style:{fontSize:20,marginBottom:8}},'📅'),
        div({style:{fontWeight:600,color:TEXT2,marginBottom:4}},'No scheduling data for this week'),
        div({style:{fontSize:11}},'Use ⬇ Get Data to download this week from LifeLenz, then re-upload the file.')
      ),

      // ── Empty state ──────────────────────────────────────────────────────────
      schedRows.length === 0 ? (
        div(null,
          div({
            style: { display:'flex', overflowX:'auto', marginBottom:20, borderBottom:`1px solid ${BDR}`, gap:0 }
          },
            h('button', { onClick: () => setActiveTab('opportunity'), style: btnStyle(activeTab==='opportunity') }, '📊 Opportunity')
          ),
          activeTab === 'opportunity'
            ? h(OpportunityReport, { schedRows:weekRows, laborRows: (ds&&ds.laborRows)||[], ctrlRows: (ds&&ds.ctrlRows)||[], glimpseRows: (ds&&ds.glimpseRows)||[], qsrActRows: (ds&&ds.qsrActSummaryRows)||[], settings,
                selWeek:activeWeekKey, setSelWeek, weeks:availableWeeks })
            : div({ style: { textAlign:'center', padding:'60px 20px', color:TEXT3 } },
                div({ style: { fontSize:32, marginBottom:12 } }, '📋'),
                div({ style: { fontSize:15, fontWeight:600, color:TEXT2, marginBottom:8 } }, 'No Scheduling Data Loaded'),
                div({ style: { fontSize:12, lineHeight:1.7 } },
                  'Use ⬇ Get Data above to generate a download command, or drop LifeLenz "Labor Analysis Summary Report" CSVs onto the main Meridian screen.',
                  h('br'),
                  'In LifeLenz: Download Reports → Labor Analysis Summary Report → Download.'
                )
              )
        )
      ) : (
        div(null,

          // ── Tab bar ─────────────────────────────────────────────────────────
          div({
            style: { display:'flex', overflowX:'auto', marginBottom:20,
                     borderBottom:`1px solid ${BDR}`, gap:0,
                     scrollbarWidth:'thin', scrollbarColor:`${BDR} transparent` }
          },
            h('button', { onClick: () => setActiveTab('opportunity'), style: btnStyle(activeTab==='opportunity') }, '📊 Opportunity'),
            locs.length > 1 && h('button', { onClick: () => setActiveTab('district'), style: btnStyle(activeTab==='district') }, 'District'),
            ...locs.map(loc =>
              h('button', { key: loc, onClick: () => setActiveTab(loc), style: btnStyle(activeTab===loc) }, shortLoc(loc))
            )
          ),

          // ── Content ─────────────────────────────────────────────────────────
          activeTab === 'opportunity' && h(OpportunityReport, { schedRows: weekRows, laborRows: (ds&&ds.laborRows)||[], ctrlRows: (ds&&ds.ctrlRows)||[], glimpseRows: (ds&&ds.glimpseRows)||[], qsrActRows: (ds&&ds.qsrActSummaryRows)||[], settings,
            selWeek: activeWeekKey, setSelWeek, weeks: availableWeeks }),
          (locs.length > 1 && activeTab === 'district') && h(DistrictSummary, { schedRows: weekRows }),

          ...(locs.length === 1
            ? locs.map(loc => h(StoreSection, { key: loc, loc, rows: byLoc[loc] }))
            : locs.filter(loc => loc === activeTab).map(loc => h(StoreSection, { key: loc, loc, rows: byLoc[loc] }))
          )
        )
      )
    )
  );
}
