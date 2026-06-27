// @ts-nocheck
import * as React from 'react';
import {
  DEFAULT_REVIEW_CONFIG, getReviewConfig, saveReviewConfig, resetReviewConfig,
  getReviews, upsertReview, deleteReview, blankReview, autoPopulateKPIs,
  rateMetric, ratingColor, ratingBg, computeScores,
  RATING_LABELS, MONTH_NAMES, halfMonths, halfQKeys, qLabel, qMonths,
  CAT_KEYS, CAT_LABELS, ROLE_KEYS, ROLE_LABELS,
} from '../engine/review-engine.js';
import { STORE_NAMES, sName } from '../constants.js';

const h   = React.createElement;
const div = (p,...c) => h('div',p,...c);
const span= (p,...c) => h('span',p,...c);
const btn = (p,...c) => h('button',p,...c);
const inp = (p)      => h('input',p);
const ta  = (p)      => h('textarea',p);
const sel = (p,...c) => h('select',p,...c);
const opt = (p,t)    => h('option',p,t);
const lbl = (p,...c) => h('label',p,...c);
const { useState, useEffect, useCallback, useMemo } = React;

const AMBER  = 'var(--amber)';
const S2     = 'var(--surf2)';
const BDR    = 'var(--bdr)';
const TEXT   = 'var(--text)';
const TEXT2  = 'var(--text2)';
const TEXT3  = 'var(--text3)';
const R      = 'var(--r)';

// ── Shared UI helpers ──────────────────────────────────────────────────────────
function Row(p,...c)  { return div({style:{display:'flex',alignItems:'center',gap:8,...(p?.style||{})}},...c); }
function Col(p,...c)  { return div({style:{display:'flex',flexDirection:'column',gap:6,...(p?.style||{})}},...c); }
function Tag({label,color='var(--amber)'}) {
  return span({style:{fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:10,
    background:`${color}20`,color,border:`1px solid ${color}30`,textTransform:'uppercase',letterSpacing:'.4px'}},label);
}
function ScorePill({score,size='sm'}) {
  if (score==null) return span({style:{color:TEXT3,fontSize:10}},'—');
  const col = score>=3.5?'#10b981':score>=2.5?'#3b82f6':score>=1.5?'#f59e0b':'#ef4444';
  const bg  = col+'22';
  const fs  = size==='lg' ? 18 : 13;
  return span({style:{fontWeight:700,fontSize:fs,color:col,background:bg,
    padding:'2px 8px',borderRadius:6,fontFamily:'var(--mono)'}},score.toFixed(2));
}
function RatingDot({r,size=8}) {
  if (!r) return span({style:{width:size,height:size,borderRadius:'50%',background:'var(--bdr2)',display:'inline-block'}});
  return span({style:{width:size,height:size,borderRadius:'50%',background:ratingColor(r),display:'inline-block',
    boxShadow:`0 0 4px ${ratingColor(r)}66`}});
}
function CloseBtn({onClick}) {
  return btn({onClick,style:{background:'none',border:'none',color:TEXT3,fontSize:18,
    cursor:'pointer',padding:'4px 8px',borderRadius:R,lineHeight:1},
    onMouseEnter:e=>e.currentTarget.style.color=TEXT, onMouseLeave:e=>e.currentTarget.style.color=TEXT3},'×');
}
function GhostBtn({onClick,children,style={}}) {
  return btn({onClick,style:{background:'none',border:`1px solid ${BDR}`,color:TEXT2,
    borderRadius:R,padding:'5px 12px',fontSize:12,cursor:'pointer',...style}},children);
}
function PrimaryBtn({onClick,children,style={}}) {
  return btn({onClick,style:{background:AMBER,color:'#000',border:'none',
    borderRadius:R,padding:'5px 12px',fontSize:12,fontWeight:700,cursor:'pointer',...style}},children);
}
function SectionHead({title,right}) {
  return div({style:{display:'flex',alignItems:'center',justifyContent:'space-between',
    padding:'8px 16px',background:S2,borderBottom:`1px solid ${BDR}`,
    fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.6px',color:TEXT3}},
    span(null,title), right||null);
}
function TabBar({tabs,active,onSelect}) {
  return div({style:{display:'flex',borderBottom:`1px solid ${BDR}`,gap:0}},
    ...tabs.map(t =>
      btn({onClick:()=>onSelect(t.key),
        style:{padding:'10px 16px',border:'none',borderBottom:`2px solid ${active===t.key?AMBER:'transparent'}`,
          background:'none',color:active===t.key?AMBER:TEXT2,fontSize:12,fontWeight:active===t.key?700:400,
          cursor:'pointer',whiteSpace:'nowrap',transition:'all .15s'}},t.label)));
}

// ── Rating Buttons: 1-4 selector ──────────────────────────────────────────────
function RatingButtons({value, onChange, disabled}) {
  return div({style:{display:'flex',gap:2}},
    ...[1,2,3,4].map(r =>
      btn({onClick:disabled?null:()=>onChange(value===r?null:r),
        style:{width:26,height:26,border:`1px solid ${value===r?ratingColor(r):BDR}`,
          borderRadius:4,background:value===r?ratingBg(r):'transparent',
          color:value===r?ratingColor(r):TEXT3,fontSize:11,fontWeight:700,
          cursor:disabled?'default':'pointer',transition:'all .1s'}},r)));
}

// ── Numeric input cell ─────────────────────────────────────────────────────────
function NumInput({value, onChange, placeholder, style={}, disabled}) {
  return inp({type:'number',value:value??'',placeholder,disabled,
    onChange:e=>{const v=e.target.value; onChange(v===''?null:parseFloat(v));},
    style:{width:70,padding:'3px 5px',background:'var(--surf)',border:`1px solid ${BDR}`,
      borderRadius:4,color:TEXT,fontSize:11,textAlign:'center',
      appearance:'textfield',...style}});
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMIZE PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function CustomizePanel({cfg, onSave, onReset}) {
  const [local, setLocal] = useState(() => JSON.parse(JSON.stringify(cfg)));
  const [section, setSection] = useState('weights');
  const [custRole, setCustRole] = useState('GM');
  const [custCat, setCustCat]   = useState('rgr');
  const [saved,  setSaved]  = useState(false);

  const set = (path, val) => {
    setLocal(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const parts = path.split('.');
      let cur = next;
      for (let i=0;i<parts.length-1;i++) cur=cur[parts[i]];
      cur[parts[parts.length-1]] = val;
      return next;
    });
  };

  const save = () => { onSave(local); setSaved(true); setTimeout(()=>setSaved(false),2000); };

  const doReset = () => {
    if (!confirm('Reset all customize settings to defaults?')) return;
    onReset();
    setLocal(JSON.parse(JSON.stringify(DEFAULT_REVIEW_CONFIG)));
  };

  const sections = [
    {key:'weights', label:'Weights'},
    {key:'thresholds', label:'Rating Thresholds'},
    {key:'competencies', label:'Competencies'},
  ];

  return div({style:{display:'flex',flexDirection:'column',height:'100%'}},
    // Sub-tab bar
    div({style:{display:'flex',gap:0,borderBottom:`1px solid ${BDR}`}},
      ...sections.map(s =>
        btn({onClick:()=>setSection(s.key),
          style:{padding:'8px 14px',border:'none',borderBottom:`2px solid ${section===s.key?AMBER:'transparent'}`,
            background:'none',color:section===s.key?AMBER:TEXT2,fontSize:11,fontWeight:section===s.key?700:400,cursor:'pointer'}},
          s.label))),
    // Save bar
    div({style:{display:'flex',alignItems:'center',gap:8,padding:'8px 16px',
      borderBottom:`1px solid ${BDR}`,background:S2}},
      PrimaryBtn({onClick:save},saved?'Saved!':'Save Changes'),
      GhostBtn({onClick:doReset,style:{fontSize:11,color:TEXT3}},'Reset to Defaults'),
      saved&&span({style:{color:'#10b981',fontSize:11}},'Settings saved')),
    // Content
    div({style:{flex:1,overflowY:'auto',padding:16}},
      section==='weights'   && h(WeightsSection, {local, set}),
      section==='thresholds'&& h(ThresholdsSection, {local, set}),
      section==='competencies' && h(CompetenciesSection, {local, set, custRole, setCustRole, custCat, setCustCat}),
    )
  );
}

function WeightsSection({local, set}) {
  const ov = local.overall;
  return div(null,
    // Overall split
    div({style:{marginBottom:20}},
      div({style:{fontWeight:700,fontSize:12,marginBottom:10,color:TEXT}},'Overall Score Split'),
      div({style:{display:'grid',gridTemplateColumns:'200px 1fr',gap:12,alignItems:'center'}},
        lbl({style:{fontSize:12,color:TEXT2}},'Results Achieved (Metrics)'),
        Row({style:{gap:8}},
          NumInput({value:Math.round(ov.metrics*100), onChange:v=>set('overall.metrics',(v||0)/100), style:{width:60}}),
          span({style:{fontSize:12,color:TEXT3}},'%')
        ),
        lbl({style:{fontSize:12,color:TEXT2}},'Behavioral Ratings'),
        Row({style:{gap:8}},
          NumInput({value:Math.round(ov.behavioral*100), onChange:v=>set('overall.behavioral',(v||0)/100), style:{width:60}}),
          span({style:{fontSize:12,color:TEXT3}},'%')
        ),
        span(null), span({style:{fontSize:10,color:ov.metrics+ov.behavioral===1?'#10b981':'#ef4444'}},
          `Total: ${Math.round((ov.metrics+ov.behavioral)*100)}% ${ov.metrics+ov.behavioral!==1?'(must equal 100%)':''}`)
      )
    ),
    // Category weights
    div({style:{marginBottom:20}},
      div({style:{fontWeight:700,fontSize:12,marginBottom:10,color:TEXT}},'Results Category Weights'),
      div({style:{display:'grid',gridTemplateColumns:'220px 80px 1fr',gap:'8px 12px',alignItems:'center'}},
        ...Object.entries(local.categoryWeights).flatMap(([key,cw])=>[
          lbl({style:{fontSize:12,color:TEXT2}},cw.label||key),
          Row({style:{gap:4}},
            NumInput({value:Math.round(cw.weight*100), onChange:v=>set(`categoryWeights.${key}.weight`,(v||0)/100), style:{width:55}}),
            span({style:{fontSize:11,color:TEXT3}},'%')
          ),
          span(null)
        ]),
        span(null),
        span({style:{fontSize:10,color:
          Math.abs(Object.values(local.categoryWeights).reduce((a,c)=>a+c.weight,0)-1)<0.01?'#10b981':'#ef4444'}},
          `Total: ${Math.round(Object.values(local.categoryWeights).reduce((a,c)=>a+c.weight,0)*100)}%`)
      )
    ),
    // Metric weights per category
    ...Object.entries(local.metrics).map(([cat, mets]) =>
      div({style:{marginBottom:20},key:cat},
        div({style:{fontWeight:700,fontSize:12,marginBottom:8,color:TEXT}},`${CAT_LABELS[cat]||cat} — Metric Weights`),
        div({style:{display:'grid',gridTemplateColumns:'240px 80px 60px 1fr',gap:'6px 12px',alignItems:'center',fontSize:11}},
          span({style:{color:TEXT3,fontWeight:700}},'Metric'), span({style:{color:TEXT3,fontWeight:700}},'Weight'),
          span({style:{color:TEXT3,fontWeight:700}},'Scored'), span(null),
          ...mets.flatMap((m,i)=>[
            lbl(null, m.label),
            Row({style:{gap:4}},
              NumInput({value:Math.round(m.weight*100), onChange:v=>set(`metrics.${cat}.${i}.weight`,(v||0)/100), style:{width:55}}),
              span({style:{color:TEXT3}},'%')
            ),
            inp({type:'checkbox',checked:m.scored, onChange:e=>set(`metrics.${cat}.${i}.scored`,e.target.checked)}),
            m.note ? span({style:{color:TEXT3,fontSize:10}},m.note) : span(null)
          ]),
          span(null),
          span({style:{fontSize:10,color:
            Math.abs(mets.reduce((a,m)=>a+m.weight,0)-1)<0.01?'#10b981':'#ef4444'}},
            `Total: ${Math.round(mets.reduce((a,m)=>a+m.weight,0)*100)}%`)
        )
      )
    )
  );
}

function ThresholdsSection({local, set}) {
  const dirLabel = (m) => m.better==='higher'
    ? `4 if ≥t1 · 3 if ≥t2 · 2 if ≥t3 · else 1`
    : `4 if ≤t1 · 3 if ≤t2 · 2 if ≤t3 · else 1`;
  return div(null,
    div({style:{fontSize:11,color:TEXT3,marginBottom:16,padding:'8px 12px',background:S2,borderRadius:R,border:`1px solid ${BDR}`}},
      span({style:{fontWeight:700}},'How thresholds work: '),
      'For "pct" unit, thresholds are % deviation from target (0.05 = 5%). ',
      'For "abs" unit, thresholds are in raw units (seconds, count, etc.).',
      ' Deviation = actual − target (pct: divided by |target|).'
    ),
    ...Object.entries(local.metrics).map(([cat, mets]) =>
      div({style:{marginBottom:24},key:cat},
        div({style:{fontWeight:700,fontSize:12,marginBottom:8,padding:'4px 0',
          borderBottom:`1px solid ${BDR}`,color:TEXT}},CAT_LABELS[cat]||cat),
        div({style:{display:'grid',gridTemplateColumns:'200px 40px 40px 80px 80px 80px 1fr',
          gap:'6px 8px',alignItems:'center',fontSize:11}},
          span({style:{color:TEXT3,fontWeight:700}},'Metric'),
          span({style:{color:TEXT3,fontWeight:700}},'Dir'),
          span({style:{color:TEXT3,fontWeight:700}},'Unit'),
          span({style:{color:'#10b981',fontWeight:700}},'T1 (→4)'),
          span({style:{color:'#3b82f6',fontWeight:700}},'T2 (→3)'),
          span({style:{color:'#f59e0b',fontWeight:700}},'T3 (→2)'),
          span({style:{color:TEXT3,fontWeight:700}},'Logic'),
          ...mets.flatMap((m,i)=>[
            span(null,m.label),
            span({style:{color:TEXT3}},m.better==='higher'?'▲':'▼'),
            span({style:{color:TEXT3}},m.unit),
            NumInput({value:m.t[0], onChange:v=>set(`metrics.${cat}.${i}.t.0`,v??m.t[0]), style:{width:70}}),
            NumInput({value:m.t[1], onChange:v=>set(`metrics.${cat}.${i}.t.1`,v??m.t[1]), style:{width:70}}),
            NumInput({value:m.t[2], onChange:v=>set(`metrics.${cat}.${i}.t.2`,v??m.t[2]), style:{width:70}}),
            span({style:{color:TEXT3,fontSize:10}},dirLabel(m)),
          ])
        )
      )
    )
  );
}

function CompetenciesSection({local, set, custRole, setCustRole, custCat, setCustCat}) {
  const comp = local.competencies[custRole]?.[custCat] || [];
  const setItem = (i, val) => set(`competencies.${custRole}.${custCat}.${i}`, val);
  const addItem = () => set(`competencies.${custRole}.${custCat}.${comp.length}`, 'New competency item');
  const removeItem = (i) => {
    const next = comp.filter((_,j)=>j!==i);
    // rebuild as full array assignment
    setItem(-1, null); // trigger re-render trick via direct array rebuild
    // Actually set the whole array:
    set(`competencies.${custRole}.${custCat}`, next);
  };

  const allCats = [...CAT_KEYS,'admin'];

  return div(null,
    // Role + category selector
    Row({style:{gap:8,marginBottom:16,flexWrap:'wrap'}},
      ...ROLE_KEYS.map(r =>
        btn({onClick:()=>setCustRole(r),key:r,
          style:{padding:'5px 12px',border:`1px solid ${custRole===r?AMBER:BDR}`,borderRadius:R,
            background:custRole===r?`${AMBER}20`:'transparent',color:custRole===r?AMBER:TEXT2,
            fontSize:11,fontWeight:custRole===r?700:400,cursor:'pointer'}},
          ROLE_LABELS[r]||r)),
      span({style:{width:1,alignSelf:'stretch',background:BDR}}),
      ...allCats.map(c =>
        btn({onClick:()=>setCustCat(c),key:c,
          style:{padding:'4px 10px',border:`1px solid ${custCat===c?AMBER:BDR}`,borderRadius:R,
            background:custCat===c?`${AMBER}20`:'transparent',color:custCat===c?AMBER:TEXT2,
            fontSize:11,cursor:'pointer'}},
          CAT_LABELS[c]||c))
    ),
    // Item list
    div({style:{display:'flex',flexDirection:'column',gap:6}},
      ...comp.map((item, i) =>
        div({key:i,style:{display:'flex',gap:8,alignItems:'flex-start'}},
          span({style:{color:TEXT3,fontSize:11,minWidth:20,paddingTop:6}},`${i+1}.`),
          ta({value:item,rows:2,
            onChange:e=>setItem(i,e.target.value),
            style:{flex:1,padding:'5px 8px',background:'var(--surf)',border:`1px solid ${BDR}`,
              borderRadius:4,color:TEXT,fontSize:12,resize:'vertical',fontFamily:'var(--sans)'}}),
          btn({onClick:()=>removeItem(i),
            style:{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:14,paddingTop:4}},
            '×')
        )
      ),
      btn({onClick:addItem,
        style:{padding:'6px 12px',background:'none',border:`1px dashed ${BDR}`,borderRadius:R,
          color:TEXT3,fontSize:11,cursor:'pointer',textAlign:'left',marginTop:4}},
        '+ Add item')
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVIEW EDITOR
// ═══════════════════════════════════════════════════════════════════════════════
function ReviewEditor({review: initReview, cfg, ds, onSave, onBack}) {
  const [review, setReview]   = useState(() => JSON.parse(JSON.stringify(initReview)));
  const [tab, setTab]         = useState('kpi');
  const [kpiCat, setKpiCat]   = useState('rgr');
  const [bCat, setBCat]       = useState('rgr');
  const [autoFilling, setAutoFilling] = useState(false);
  const [dirty, setDirty]     = useState(false);

  const mths  = halfMonths(review.half);
  const qKeys = halfQKeys(review.half);

  const update = useCallback((path, val) => {
    setReview(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const parts = path.split('.');
      let cur = next;
      for (let i=0;i<parts.length-1;i++) {
        if (cur[parts[i]] == null) cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length-1]] = val;
      return next;
    });
    setDirty(true);
  }, []);

  const setMonthKPI  = (month, field, val) => update(`kpis.months.${month}.${field}`, val);
  const setRating    = (qKey, cat, idx, val) => update(`behavioralRatings.${qKey}.${cat}.${idx}`, val);
  const setComment   = (period, cat, val) => update(`comments.${period}.${cat}`, val);
  const setDevPlan   = (next) => { setReview(prev=>({...prev,devPlan:next})); setDirty(true); };

  const doAutoFill = () => {
    setAutoFilling(true);
    const filled = autoPopulateKPIs(review, ds);
    setReview(filled);
    setDirty(true);
    setTimeout(()=>setAutoFilling(false), 800);
  };

  const doSave = () => { onSave(review); setDirty(false); };

  const scores = useMemo(() => computeScores(review, cfg), [review, cfg]);

  const tabs = [
    {key:'kpi',    label:'KPI Results'},
    {key:'behav',  label:'Behavioral Ratings'},
    {key:'devplan',label:'Dev Plan'},
    {key:'summary',label:'Summary & Scores'},
  ];

  return div({style:{display:'flex',flexDirection:'column',height:'100%'}},
    // Editor header
    div({style:{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',
      borderBottom:`1px solid ${BDR}`,background:S2}},
      btn({onClick:onBack,style:{background:'none',border:`1px solid ${BDR}`,color:TEXT2,
        borderRadius:R,padding:'4px 10px',fontSize:11,cursor:'pointer'}}, '← Back'),
      div({style:{flex:1}},
        div({style:{fontWeight:700,fontSize:14,color:TEXT}},review.name),
        div({style:{fontSize:11,color:TEXT3}},
          `${ROLE_LABELS[review.role]||review.role} · ${review.loc||'All Stores'} · ${review.half} ${review.year}`)
      ),
      dirty&&span({style:{fontSize:11,color:AMBER}},'Unsaved changes'),
      GhostBtn({onClick:()=>printReview(review,cfg),style:{fontSize:11}},'Print / PDF'),
      PrimaryBtn({onClick:doSave,style:{minWidth:80}},'Save'),
    ),
    // Tab bar
    TabBar({tabs, active:tab, onSelect:setTab}),
    // Content
    div({style:{flex:1,overflowY:'auto'}},
      tab==='kpi'     && h(KPITab,     {review, cfg, mths, qKeys, kpiCat, setKpiCat, setMonthKPI, doAutoFill, autoFilling, ds}),
      tab==='behav'   && h(BehavTab,   {review, cfg, qKeys, bCat, setBCat, setRating, setComment}),
      tab==='devplan' && h(DevPlanTab, {review, setDevPlan, update}),
      tab==='summary' && h(SummaryTab, {review, cfg, scores, qKeys, mths, update}),
    )
  );
}

// ── KPI Results Tab ────────────────────────────────────────────────────────────
function KPITab({review, cfg, mths, qKeys, kpiCat, setKpiCat, setMonthKPI, doAutoFill, autoFilling, ds}) {
  const months = review.kpis?.months || {};
  const catMets = cfg.metrics[kpiCat] || [];
  const allCats = [...CAT_KEYS];

  return div({style:{padding:16}},
    // Auto-fill button
    div({style:{display:'flex',alignItems:'center',gap:10,marginBottom:16,
      padding:'10px 14px',background:`${AMBER}10`,borderRadius:R,border:`1px solid ${AMBER}30`}},
      btn({onClick:doAutoFill,disabled:!ds?.loaded||autoFilling,
        style:{padding:'6px 14px',background:AMBER,color:'#000',border:'none',
          borderRadius:R,fontSize:12,fontWeight:700,cursor:ds?.loaded?'pointer':'not-allowed',opacity:ds?.loaded?1:.5}},
        autoFilling?'Filling...' : 'Auto-fill from Uploaded Data'),
      span({style:{fontSize:11,color:TEXT3}},
        ds?.loaded
          ? 'Fills OEPE, R2P, KVS, Sales vs Target, Labor %, and FOB from your uploaded Operations/Labor reports.'
          : 'Upload Operations Report and Labor Analysis files to enable auto-fill.')),
    // Category tabs
    div({style:{display:'flex',gap:4,marginBottom:16,flexWrap:'wrap'}},
      ...allCats.map(cat => {
        const cw = cfg.categoryWeights[cat];
        return btn({onClick:()=>setKpiCat(cat),key:cat,
          style:{padding:'5px 12px',border:`1px solid ${kpiCat===cat?AMBER:BDR}`,borderRadius:R,
            background:kpiCat===cat?`${AMBER}20`:'transparent',color:kpiCat===cat?AMBER:TEXT2,
            fontSize:11,fontWeight:kpiCat===cat?700:400,cursor:'pointer'}},
          `${CAT_LABELS[cat]||cat} (${Math.round((cw?.weight||0)*100)}%)`)
      })
    ),
    // KPI grid for selected category
    div({style:{overflowX:'auto'}},
      h(KPIGrid, {metrics:catMets, months, mths, qKeys, setMonthKPI, cfg})
    )
  );
}

function KPIGrid({metrics, months, mths, qKeys, setMonthKPI, cfg}) {
  const COL_W = 78;
  const LABEL_W = 190;

  const qMonthMap = {};
  for (const q of qKeys) qMonthMap[q] = qMonths(q).filter(m=>mths.includes(m));

  const totalWidth = LABEL_W + mths.length * COL_W + qKeys.length * 60 + 4;

  return div({style:{minWidth:totalWidth, userSelect:'none'}},
    // Header row
    div({style:{display:'flex',alignItems:'stretch',borderBottom:`2px solid ${BDR}`,
      background:S2,fontSize:10,fontWeight:700,color:TEXT3,letterSpacing:'.3px'}},
      div({style:{width:LABEL_W,minWidth:LABEL_W,padding:'6px 8px',borderRight:`1px solid ${BDR}`}},'Metric'),
      ...mths.map(m =>
        div({key:m,style:{width:COL_W,minWidth:COL_W,textAlign:'center',padding:'6px 2px',
          borderRight:`1px solid ${BDR}`}},MONTH_NAMES[m-1])),
      ...qKeys.map(q =>
        div({key:q,style:{width:60,minWidth:60,textAlign:'center',padding:'6px 2px',
          color:AMBER}},qLabel(q)+' Avg'))
    ),
    // Metric rows
    ...metrics.map(m => {
      const qAvgRatings = {};
      for (const [q, qMths] of Object.entries(qMonthMap)) {
        const rats = qMths.map(mn=>{
          const mo = months[mn]||{};
          return rateMetric(mo[m.key], mo[m.key+'Tgt'], m);
        }).filter(r=>r!=null);
        qAvgRatings[q] = rats.length ? rats.reduce((a,b)=>a+b,0)/rats.length : null;
      }
      return div({key:m.key,style:{display:'flex',alignItems:'stretch',
        borderBottom:`1px solid ${BDR}`}},
        // Label cell
        div({style:{width:LABEL_W,minWidth:LABEL_W,padding:'6px 8px',
          borderRight:`1px solid ${BDR}`,display:'flex',flexDirection:'column',gap:2}},
          span({style:{fontSize:11,color:m.scored?TEXT:TEXT3,fontWeight:m.scored?500:400}},m.label),
          Row({style:{gap:4}},
            span({style:{fontSize:9,color:TEXT3,padding:'1px 4px',background:S2,borderRadius:3}},
              m.better==='higher'?'▲ Higher':'▼ Lower'),
            !m.scored&&span({style:{fontSize:9,color:TEXT3}},'(ref)')
          )
        ),
        // Month cells
        ...mths.map(mn => {
          const mo = months[mn]||{};
          const actual = mo[m.key];
          const target = mo[m.key+'Tgt'];
          const rating = rateMetric(actual, target, m);
          const bg = rating ? ratingBg(rating) : 'transparent';
          return div({key:mn,style:{width:COL_W,minWidth:COL_W,borderRight:`1px solid ${BDR}`,
            background:bg,display:'flex',flexDirection:'column',gap:2,padding:'4px 2px',alignItems:'center'}},
            NumInput({value:actual,
              onChange:v=>setMonthKPI(mn,m.key,v),
              placeholder:'Act',style:{width:COL_W-10,background:bg||'var(--surf)'}}),
            NumInput({value:target,
              onChange:v=>setMonthKPI(mn,m.key+'Tgt',v),
              placeholder:'Tgt',style:{width:COL_W-10,fontSize:10,color:TEXT3,background:'transparent',
                border:`1px dashed ${BDR}`}}),
            rating!=null&&span({style:{fontSize:9,color:ratingColor(rating),fontWeight:700}},
              RATING_LABELS[rating]?.slice(0,3)||rating)
          );
        }),
        // Quarter avg cells
        ...qKeys.map(q => {
          const r = qAvgRatings[q];
          return div({key:q,style:{width:60,minWidth:60,display:'flex',flexDirection:'column',
            alignItems:'center',justifyContent:'center',gap:2,background:r?ratingBg(Math.round(r)):S2}},
            r!=null
              ? div(null,
                  RatingDot({r:Math.round(r),size:10}),
                  span({style:{fontSize:11,fontWeight:700,color:ratingColor(Math.round(r)),display:'block',textAlign:'center'}},
                    r.toFixed(1)))
              : span({style:{color:TEXT3,fontSize:11}},'—')
          );
        })
      );
    })
  );
}

// ── Behavioral Ratings Tab ─────────────────────────────────────────────────────
function BehavTab({review, cfg, qKeys, bCat, setBCat, setRating, setComment}) {
  const comp     = cfg.competencies[review.role]||{};
  const allCats  = [...CAT_KEYS,'admin'];
  const catItems = comp[bCat]||[];

  return div({style:{padding:16}},
    // Category selector
    div({style:{display:'flex',gap:4,marginBottom:16,flexWrap:'wrap'}},
      ...allCats.map(cat =>
        btn({onClick:()=>setBCat(cat),key:cat,
          style:{padding:'5px 12px',border:`1px solid ${bCat===cat?AMBER:BDR}`,borderRadius:R,
            background:bCat===cat?`${AMBER}20`:'transparent',color:bCat===cat?AMBER:TEXT2,
            fontSize:11,cursor:'pointer',fontWeight:bCat===cat?700:400}},
          CAT_LABELS[cat]||cat))
    ),
    // Scale legend
    div({style:{display:'flex',gap:8,marginBottom:12,fontSize:10,color:TEXT3}},
      ...[1,2,3,4].map(r =>
        Row({style:{gap:4},key:r}, RatingDot({r,size:8}), span(null,`${r} = ${RATING_LABELS[r]||r}`)))),
    // Header: competency | Q1 | Q2 | (Q3 | Q4)
    div({style:{display:'grid',
      gridTemplateColumns:`1fr ${'80px '.repeat(qKeys.length)}`,
      gap:0,borderBottom:`2px solid ${BDR}`,paddingBottom:6,marginBottom:4,
      fontSize:10,fontWeight:700,color:TEXT3,textTransform:'uppercase',letterSpacing:'.4px'}},
      span({style:{paddingLeft:8}},'Competency'),
      ...qKeys.map(q => span({key:q,style:{textAlign:'center'}},qLabel(q)))
    ),
    // Competency rows
    ...catItems.map((item, i) =>
      div({key:i,style:{display:'grid',
        gridTemplateColumns:`1fr ${'80px '.repeat(qKeys.length)}`,
        gap:0,borderBottom:`1px solid ${BDR}`,padding:'6px 0',alignItems:'center'}},
        span({style:{fontSize:12,color:TEXT,paddingLeft:8,lineHeight:1.4}},`${i+1}. ${item}`),
        ...qKeys.map(q => {
          const rats = review.behavioralRatings?.[q]?.[bCat];
          const val  = rats?.[i] ?? null;
          return div({key:q,style:{display:'flex',justifyContent:'center'}},
            RatingButtons({value:val, onChange:v=>setRating(q,bCat,i,v)}));
        })
      )
    ),
    // Comments per quarter
    div({style:{marginTop:20}},
      div({style:{fontWeight:700,fontSize:12,color:TEXT,marginBottom:10}},
        `${CAT_LABELS[bCat]||bCat} — Comments`),
      div({style:{display:'grid',gridTemplateColumns:'1fr '.repeat(qKeys.length),gap:12}},
        ...qKeys.map(q => {
          const periodKey = q;
          const val = review.comments?.[periodKey]?.[bCat]||'';
          return div({key:q},
            div({style:{fontSize:10,fontWeight:700,color:TEXT3,marginBottom:4}},qLabel(q)+' Comments'),
            ta({value:val,rows:3,placeholder:'Add comments...',
              onChange:e=>setComment(periodKey,bCat,e.target.value),
              style:{width:'100%',padding:'6px 8px',background:'var(--surf)',
                border:`1px solid ${BDR}`,borderRadius:R,color:TEXT,
                fontSize:12,resize:'vertical',fontFamily:'var(--sans)',boxSizing:'border-box'}})
          );
        })
      )
    )
  );
}

// ── Dev Plan Tab ───────────────────────────────────────────────────────────────
function DevPlanTab({review, setDevPlan, update}) {
  const plan = review.devPlan || [];
  const half = review.half;

  const addItem = () => setDevPlan([...plan, {
    id: Date.now().toString(),
    area:'', action:'', targetDate:'', status:'open',
    period: half==='H1'?'midYear':'eoy', notes:'',
  }]);

  const setField = (i, field, val) =>
    setDevPlan(plan.map((item,j) => j===i ? {...item,[field]:val} : item));

  const remove = (i) => setDevPlan(plan.filter((_,j)=>j!==i));

  const STATUS_OPTS = ['open','in-progress','complete'];
  const STATUS_COLOR = {open:AMBER,'in-progress':'#3b82f6',complete:'#10b981'};

  const fieldStyle = {padding:'5px 8px',background:'var(--surf)',border:`1px solid ${BDR}`,
    borderRadius:4,color:TEXT,fontSize:12,width:'100%',boxSizing:'border-box'};

  return div({style:{padding:16}},
    // Summary narrative fields
    div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:20}},
      div(null,
        div({style:{fontSize:11,fontWeight:700,color:TEXT3,marginBottom:4}},
          half==='H1'?'MID-YEAR DEVELOPMENT SUMMARY':'END OF YEAR SUMMARY'),
        ta({rows:4,value:review.comments?.[half==='H1'?'midYear':'eoy']?.summary||'',
          placeholder:'Overall performance summary and development focus...',
          onChange:e=>update(`comments.${half==='H1'?'midYear':'eoy'}.summary`,e.target.value),
          style:{...fieldStyle,resize:'vertical'}})
      ),
      div(null,
        div({style:{fontSize:11,fontWeight:700,color:TEXT3,marginBottom:4}},
          half==='H1'?'MID-YEAR DEV PLAN NARRATIVE':'EOY ACHIEVEMENTS / NEXT YEAR'),
        ta({rows:4,value:review.comments?.[half==='H1'?'midYear':'eoy']?.[half==='H1'?'devPlan':'achievements']||'',
          placeholder:half==='H1'?'Development plan narrative for second half...':'Key achievements and focus areas for next year...',
          onChange:e=>update(`comments.${half==='H1'?'midYear':'eoy'}.${half==='H1'?'devPlan':'achievements'}`,e.target.value),
          style:{...fieldStyle,resize:'vertical'}})
      )
    ),
    // Action items header
    div({style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}},
      div({style:{fontWeight:700,fontSize:13,color:TEXT}},'Development Action Items'),
      PrimaryBtn({onClick:addItem,style:{fontSize:11}},'+ Add Item')
    ),
    // Column headers
    plan.length>0&&div({style:{display:'grid',
      gridTemplateColumns:'180px 1fr 120px 110px 32px',
      gap:8,padding:'4px 0',fontSize:10,fontWeight:700,color:TEXT3,textTransform:'uppercase',letterSpacing:'.4px',
      borderBottom:`1px solid ${BDR}`,marginBottom:4}},
      span(null,'Focus Area'),span(null,'Action / Plan'),
      span(null,'Target Date'),span(null,'Status'),span(null)
    ),
    // Items
    plan.length===0
      ? div({style:{padding:'32px 0',textAlign:'center',color:TEXT3}},
          div({style:{fontSize:20,marginBottom:6}},'📝'),
          div({style:{fontSize:12}},'No development items yet. Click "+ Add Item" to begin.'))
      : div({style:{display:'flex',flexDirection:'column',gap:6}},
          ...plan.map((item,i) =>
            div({key:item.id||i,style:{display:'grid',
              gridTemplateColumns:'180px 1fr 120px 110px 32px',
              gap:8,alignItems:'flex-start',padding:'8px 0',
              borderBottom:`1px solid ${BDR}`}},
              // Focus area
              inp({type:'text',value:item.area,placeholder:'e.g. OEPE, Staffing...',
                onChange:e=>setField(i,'area',e.target.value),
                style:fieldStyle}),
              // Action
              ta({rows:2,value:item.action,placeholder:'Specific action or development plan...',
                onChange:e=>setField(i,'action',e.target.value),
                style:{...fieldStyle,resize:'vertical'}}),
              // Target date
              inp({type:'date',value:item.targetDate||'',
                onChange:e=>setField(i,'targetDate',e.target.value),
                style:fieldStyle}),
              // Status
              sel({value:item.status,onChange:e=>setField(i,'status',e.target.value),
                style:{...fieldStyle,color:STATUS_COLOR[item.status]||TEXT,fontWeight:600}},
                ...STATUS_OPTS.map(s=>opt({value:s,key:s},
                  s==='in-progress'?'In Progress':s.charAt(0).toUpperCase()+s.slice(1)))),
              // Remove
              btn({onClick:()=>remove(i),
                style:{background:'none',border:'none',color:'#ef4444',cursor:'pointer',
                  fontSize:16,padding:'2px',lineHeight:1,alignSelf:'center'}},'×')
            )
          )
        ),
    // Notes field at bottom
    plan.length>0&&div({style:{marginTop:16}},
      div({style:{fontSize:11,fontWeight:700,color:TEXT3,marginBottom:4}},'GENERAL NOTES / FOLLOW-UP'),
      ta({rows:3,
        value:half==='H1'?(review.comments?.midYear?.devPlan||''):(review.comments?.eoy?.nextYear||''),
        placeholder:'Additional notes, follow-up items, or context for the next review period...',
        onChange:e=>update(half==='H1'?'comments.midYear.devPlan':'comments.eoy.nextYear',e.target.value),
        style:{...fieldStyle,resize:'vertical'}})
    )
  );
}

// ── Print / PDF export ─────────────────────────────────────────────────────────
function printReview(review, cfg) {
  const scores = computeScores(review, cfg);
  const half   = review.half;
  const qKeys  = halfQKeys(half);
  const mths   = halfMonths(half);
  const halfLabel = half==='H1'?'Mid-Year':'End of Year';
  const today  = new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});

  const rLabel = r => r===4?'Exceeds':r===3?'On Target':r===2?'Below':'Needs Improvement';
  const rCol   = r => r===4?'#10b981':r===3?'#2563eb':r===2?'#d97706':'#dc2626';

  const scoreRow = (label, s) => {
    if (!s) return '';
    const o = s.overall;
    const col = o!=null?rCol(Math.round(o)):'#6b7280';
    return `<tr><td>${label}</td>
      <td style="text-align:center">${s.metrics!=null?s.metrics.toFixed(2):'—'}</td>
      <td style="text-align:center">${s.behavioral!=null?s.behavioral.toFixed(2):'—'}</td>
      <td style="text-align:center;font-weight:700;color:${col}">${o!=null?o.toFixed(2):'—'}</td>
      <td style="text-align:center;color:${col};font-weight:600">${o!=null?rLabel(Math.round(o)):'—'}</td></tr>`;
  };

  const devRows = (review.devPlan||[]).map(item=>`
    <tr>
      <td>${item.area||'—'}</td>
      <td>${item.action||'—'}</td>
      <td style="text-align:center">${item.targetDate||'—'}</td>
      <td style="text-align:center;font-weight:600;color:${item.status==='complete'?'#10b981':item.status==='in-progress'?'#2563eb':'#d97706'}">
        ${item.status==='in-progress'?'In Progress':item.status?item.status.charAt(0).toUpperCase()+item.status.slice(1):'Open'}</td>
    </tr>`).join('');

  const compRows = (catKey) => {
    const items = cfg.competencies[review.role]?.[catKey]||[];
    if (!items.length) return '<tr><td colspan="5" style="color:#9ca3af">No items</td></tr>';
    return items.map((item,i)=>{
      const qRatings = qKeys.map(q=>{
        const r = review.behavioralRatings?.[q]?.[catKey]?.[i];
        return r!=null?`<td style="text-align:center;font-weight:700;color:${rCol(r)}">${r}</td>`:'<td style="text-align:center;color:#9ca3af">—</td>';
      }).join('');
      return `<tr><td>${i+1}. ${item}</td>${qRatings}</tr>`;
    }).join('');
  };

  const wageSection = half==='H2'?`
    <h2>Wage Review</h2>
    <table><tr>
      <th>Current Rate</th><th>Recommended Increase</th><th>Approved Rate</th><th>Effective Date</th>
    </tr><tr>
      <td>$${review.wage?.current||'—'}</td>
      <td>$${review.wage?.recommended||'—'}</td>
      <td>$${review.wage?.approved||'—'}</td>
      <td>${review.wage?.effectiveDate||'—'}</td>
    </tr></table>
    ${review.wage?.notes?`<p><strong>Notes:</strong> ${review.wage.notes}</p>`:''}`:''

  const allCatSections = [...Object.keys(cfg.categoryWeights),'admin'].map(cat=>`
    <h3>${CAT_LABELS[cat]||cat}</h3>
    <table>
      <tr><th>Competency</th>${qKeys.map(q=>`<th style="text-align:center">${qLabel(q)}</th>`).join('')}</tr>
      ${compRows(cat)}
    </table>
    ${qKeys.map(q=>{
      const c=review.comments?.[q]?.[cat];
      return c?`<p><em>${qLabel(q)} Comments:</em> ${c}</p>`:'';
    }).join('')}
  `).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>${review.name} — ${halfLabel} ${review.year} Performance Review</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:20px;max-width:900px;margin:0 auto}
    h1{font-size:18px;font-weight:700;margin-bottom:4px}
    h2{font-size:14px;font-weight:700;margin:18px 0 8px;padding-bottom:4px;border-bottom:2px solid #111}
    h3{font-size:12px;font-weight:700;margin:12px 0 6px;color:#374151}
    table{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:11px}
    th{background:#f3f4f6;padding:5px 8px;text-align:left;border:1px solid #d1d5db;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.3px}
    td{padding:5px 8px;border:1px solid #e5e7eb;vertical-align:top}
    tr:nth-child(even) td{background:#fafafa}
    .header-block{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #111}
    .meta{font-size:11px;color:#6b7280;margin-top:4px}
    .score-pill{display:inline-block;padding:2px 8px;border-radius:4px;font-weight:700}
    .sig-block{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:24px}
    .sig-line{border-top:1px solid #111;margin-top:40px;padding-top:4px;font-size:10px;color:#6b7280}
    .narrative{background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:10px;margin:8px 0;font-size:11px;min-height:40px;white-space:pre-wrap}
    @media print{body{padding:10px}@page{margin:.5in}}
  </style></head><body>
  <div class="header-block">
    <div>
      <div style="font-size:10px;font-weight:700;letter-spacing:.5px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">Murphy Family Restaurants · Salaried Management Performance Review</div>
      <h1>${review.name}</h1>
      <div class="meta">${ROLE_LABELS[review.role]||review.role} · ${review.loc?`Store ${review.loc}`:'All Stores'} · ${halfLabel} ${review.year}</div>
    </div>
    <div style="text-align:right;font-size:10px;color:#6b7280">
      <div>Review Date: ${today}</div>
      <div>Status: ${(review.status||'Draft').toUpperCase()}</div>
    </div>
  </div>

  <h2>Overall Scores</h2>
  <table>
    <tr><th>Period</th><th style="text-align:center">Metrics (70%)</th><th style="text-align:center">Behavioral (30%)</th><th style="text-align:center">Overall</th><th style="text-align:center">Rating</th></tr>
    ${qKeys.map(q=>scoreRow(qLabel(q),scores[q])).join('')}
    ${scoreRow(halfLabel+' Total',scores.half)}
  </table>
  <p style="font-size:10px;color:#6b7280;margin-bottom:16px">Rating Scale: 4 = Exceeds · 3 = On Target · 2 = Below · 1 = Needs Improvement</p>

  <h2>KPI Results Summary</h2>
  ${Object.entries(cfg.categoryWeights).map(([cat,cw])=>{
    const metrics = (cfg.metrics[cat]||[]).filter(m=>m.scored);
    if(!metrics.length) return '';
    return `<h3>${cw.label||cat} (${Math.round(cw.weight*100)}% category weight)</h3>
    <table>
      <tr><th>Metric</th>${qKeys.map(q=>`<th style="text-align:center">${qLabel(q)} Avg</th>`).join('')}</tr>
      ${metrics.map(m=>{
        const qRatings = qKeys.map(q=>{
          const qMts = qMonths(q).filter(mn=>mths.includes(mn));
          const rats = qMts.map(mn=>{
            const mo=(review.kpis?.months||{})[mn]||{};
            return rateMetric(mo[m.key],mo[m.key+'Tgt'],m);
          }).filter(r=>r!=null);
          const avg = rats.length?rats.reduce((a,b)=>a+b,0)/rats.length:null;
          return avg!=null
            ?`<td style="text-align:center;font-weight:700;color:${rCol(Math.round(avg))}">${avg.toFixed(1)}</td>`
            :'<td style="text-align:center;color:#9ca3af">—</td>';
        }).join('');
        return `<tr><td>${m.label}</td>${qRatings}</tr>`;
      }).join('')}
    </table>`;
  }).join('')}

  <h2>Behavioral Ratings</h2>
  ${allCatSections}

  <h2>Development Plan</h2>
  ${review.devPlan?.length?`
  <table>
    <tr><th>Focus Area</th><th>Action / Plan</th><th style="text-align:center">Target Date</th><th style="text-align:center">Status</th></tr>
    ${devRows}
  </table>`:'<p style="color:#9ca3af">No development items recorded.</p>'}

  ${review.comments?.midYear?.summary?`<h3>Mid-Year Summary</h3><div class="narrative">${review.comments.midYear.summary}</div>`:''}
  ${review.comments?.midYear?.devPlan?`<h3>Mid-Year Development Plan</h3><div class="narrative">${review.comments.midYear.devPlan}</div>`:''}
  ${review.comments?.eoy?.summary?`<h3>End of Year Summary</h3><div class="narrative">${review.comments.eoy.summary}</div>`:''}
  ${review.comments?.eoy?.achievements?`<h3>Achievements</h3><div class="narrative">${review.comments.eoy.achievements}</div>`:''}
  ${review.comments?.eoy?.nextYear?`<h3>Focus for Next Year</h3><div class="narrative">${review.comments.eoy.nextYear}</div>`:''}

  ${wageSection}

  <div class="sig-block">
    <div>
      <div class="sig-line">Manager Signature &amp; Date</div>
    </div>
    <div>
      <div class="sig-line">Supervisor Signature &amp; Date</div>
    </div>
  </div>
  </body></html>`;

  const w = window.open('','_blank','width=960,height=800');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(()=>w.print(), 400);
}

// ── Summary Tab ────────────────────────────────────────────────────────────────
function SummaryTab({review, cfg, scores, qKeys, mths, update}) {
  const half = review.half;
  const halfLabel = half==='H1' ? 'Mid-Year' : 'End of Year';

  const ScoreCard = ({label,ms,bs,overall,highlight}) =>
    div({style:{padding:'12px 16px',background:S2,borderRadius:R,border:`1px solid ${highlight?AMBER:BDR}`,
      display:'flex',flexDirection:'column',gap:8}},
      div({style:{fontSize:10,fontWeight:700,color:TEXT3,textTransform:'uppercase',letterSpacing:'.5px'}},label),
      Row({style:{gap:16,flexWrap:'wrap'}},
        div(null,
          div({style:{fontSize:9,color:TEXT3,marginBottom:2}},'Metrics (70%)'),
          ScorePill({score:ms})),
        div(null,
          div({style:{fontSize:9,color:TEXT3,marginBottom:2}},'Behavioral (30%)'),
          ScorePill({score:bs})),
        div(null,
          div({style:{fontSize:9,color:TEXT3,marginBottom:2}},'Overall'),
          ScorePill({score:overall,size:'lg'}))
      ),
      overall!=null&&div({style:{height:6,borderRadius:3,background:BDR,overflow:'hidden'}},
        div({style:{height:'100%',width:`${(overall/4)*100}%`,borderRadius:3,
          background:ratingColor(Math.round(overall)),transition:'width .5s'}}))
    );

  return div({style:{padding:16}},
    div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}},
      ...qKeys.map(q => {
        const s = scores[q]||{};
        return h(ScoreCard,{key:q,label:qLabel(q)+' Summary',ms:s.metrics,bs:s.behavioral,overall:s.overall});
      }),
      h(ScoreCard,{label:halfLabel+' Overall',ms:scores.half?.metrics,bs:scores.half?.behavioral,
        overall:scores.half?.overall,highlight:true})
    ),
    // Rating scale reference
    div({style:{padding:'10px 14px',background:S2,borderRadius:R,border:`1px solid ${BDR}`,marginBottom:16}},
      div({style:{fontSize:10,fontWeight:700,color:TEXT3,marginBottom:8}},'RATING SCALE'),
      Row({style:{gap:16,flexWrap:'wrap'}},
        ...[1,2,3,4].map(r =>
          Row({key:r,style:{gap:6}},
            RatingDot({r,size:10}),
            span({style:{fontSize:11,color:TEXT2}},`${r} = ${RATING_LABELS[r]}`)))
      )
    ),
    // Category breakdown
    div({style:{fontWeight:700,fontSize:12,color:TEXT,marginBottom:8}},'Category Breakdown'),
    div({style:{display:'grid',gridTemplateColumns:'1fr '.repeat(qKeys.length+1),gap:8,fontSize:11}},
      div({style:{fontWeight:700,color:TEXT3}},'Category'),
      ...qKeys.map(q => div({key:q,style:{fontWeight:700,color:TEXT3,textAlign:'center'}},qLabel(q))),
      ...Object.entries(cfg.categoryWeights).map(([cat,cw]) => [
        div({key:cat+'-l',style:{color:TEXT2}},`${cw.label||cat} (${Math.round(cw.weight*100)}%)`),
        ...qKeys.map(q => {
          const qMths = qMonths(q).filter(m=>mths.includes(m));
          const moArr = qMths.map(mn=>(review.kpis?.months||{})[mn]).filter(Boolean);
          let wS=0,wT=0;
          for (const m of (cfg.metrics[cat]||[]).filter(m=>m.scored)) {
            const rats = moArr.map(mo=>rateMetric(mo[m.key],mo[m.key+'Tgt'],m)).filter(r=>r!=null);
            if (!rats.length) continue;
            const avg = rats.reduce((a,b)=>a+b,0)/rats.length;
            wS+=avg*m.weight; wT+=m.weight;
          }
          const s = wT>0?wS/wT:null;
          return div({key:cat+'-'+q,style:{textAlign:'center'}},
            s!=null?span({style:{fontWeight:700,color:ratingColor(Math.round(s))}},s.toFixed(2)):span({style:{color:TEXT3}},'—'));
        })
      ]).flat(),
    ),
    // Wage section (EOY only)
    half==='H2'&&div({style:{marginTop:20,padding:'14px 16px',background:S2,borderRadius:R,
      border:`1px solid ${BDR}`}},
      div({style:{fontWeight:700,fontSize:12,color:TEXT,marginBottom:4}},'Wage Review'),
      div({style:{fontSize:11,color:TEXT3,marginBottom:12}},'Annual wage decisions are made at End of Year.'),
      div({style:{display:'grid',gridTemplateColumns:'180px 1fr',gap:'8px 16px',fontSize:12,alignItems:'center'}},...[
        ['Current Rate ($/hr)',       'current',      'number'],
        ['Recommended Increase ($/hr)','recommended', 'number'],
        ['Approved New Rate ($/hr)',  'approved',     'number'],
        ['Effective Date',            'effectiveDate','date'],
      ].flatMap(([label, field, type]) => [
        lbl({style:{color:TEXT2}},label),
        type==='date'
          ? inp({type:'date',value:review.wage?.[field]||'',
              onChange:e=>update(`wage.${field}`,e.target.value),
              style:{padding:'4px 8px',background:'var(--surf)',border:`1px solid ${BDR}`,
                borderRadius:4,color:TEXT,fontSize:12}})
          : NumInput({value:review.wage?.[field], onChange:v=>update(`wage.${field}`,v),
              style:{width:100}})
      ]),
        lbl({style:{color:TEXT2,alignSelf:'flex-start'}},'Notes'),
        ta({rows:2,value:review.wage?.notes||'',
          onChange:e=>update('wage.notes',e.target.value),
          style:{padding:'5px 8px',background:'var(--surf)',border:`1px solid ${BDR}`,
            borderRadius:4,color:TEXT,fontSize:12,resize:'vertical',fontFamily:'var(--sans)'}})
      )
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVIEW LIST
// ═══════════════════════════════════════════════════════════════════════════════
function ReviewList({reviews, cfg, stores, onOpen, onNew, onDelete}) {
  const [filterRole, setFilterRole] = useState('all');
  const [filterYear, setFilterYear] = useState('all');
  const [filterHalf, setFilterHalf] = useState('all');
  const [showNew, setShowNew]       = useState(false);

  const list = Object.values(reviews);
  const years = [...new Set(list.map(r=>r.year))].sort((a,b)=>b-a);

  const filtered = list.filter(r =>
    (filterRole==='all'||r.role===filterRole) &&
    (filterYear==='all'||r.year===parseInt(filterYear)) &&
    (filterHalf==='all'||r.half===filterHalf)
  ).sort((a,b)=>b.updatedAt?.localeCompare(a.updatedAt)||0);

  const getScore = (r) => {
    const s = computeScores(r, cfg);
    return s.half?.overall ?? null;
  };

  return div({style:{display:'flex',flexDirection:'column',height:'100%'}},
    // Toolbar
    div({style:{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',
      borderBottom:`1px solid ${BDR}`,flexWrap:'wrap'}},
      // Role filter
      sel({value:filterRole,onChange:e=>setFilterRole(e.target.value),
        style:{padding:'4px 8px',background:'var(--surf)',border:`1px solid ${BDR}`,
          borderRadius:R,color:TEXT,fontSize:12}},
        opt({value:'all'},'All Roles'),
        ...ROLE_KEYS.map(r=>opt({value:r,key:r},ROLE_LABELS[r]||r))
      ),
      // Year filter
      sel({value:filterYear,onChange:e=>setFilterYear(e.target.value),
        style:{padding:'4px 8px',background:'var(--surf)',border:`1px solid ${BDR}`,
          borderRadius:R,color:TEXT,fontSize:12}},
        opt({value:'all'},'All Years'),
        ...years.map(y=>opt({value:y,key:y},y))
      ),
      // Half filter
      sel({value:filterHalf,onChange:e=>setFilterHalf(e.target.value),
        style:{padding:'4px 8px',background:'var(--surf)',border:`1px solid ${BDR}`,
          borderRadius:R,color:TEXT,fontSize:12}},
        opt({value:'all'},'H1 & H2'),
        opt({value:'H1'},'H1 (Mid-Year)'),
        opt({value:'H2'},'H2 (End of Year)')
      ),
      div({style:{flex:1}}),
      PrimaryBtn({onClick:()=>setShowNew(true)},'+ New Review')
    ),
    // New review form
    showNew&&h(NewReviewForm,{stores,cfg,onCancel:()=>setShowNew(false),
      onCreate:(r)=>{upsertReview(r);setShowNew(false);onNew();}}),
    // List
    div({style:{flex:1,overflowY:'auto'}},
      filtered.length===0
        ? div({style:{padding:40,textAlign:'center',color:TEXT3}},
            div({style:{fontSize:24,marginBottom:8}},'📋'),
            div({style:{fontWeight:600,color:TEXT2,marginBottom:4}},'No reviews yet'),
            div({style:{fontSize:12}},'Create your first performance review using the button above.'))
        : div(null,
            // Table header
            div({style:{display:'grid',gridTemplateColumns:'200px 120px 120px 80px 90px 100px 80px',
              gap:0,padding:'8px 16px',background:S2,borderBottom:`1px solid ${BDR}`,
              fontSize:10,fontWeight:700,color:TEXT3,textTransform:'uppercase',letterSpacing:'.4px'}},...[
              'Name','Role','Store','Period','Score','Status',''].map((h,i)=>span({key:i},h))
            ),
            ...filtered.map(r => {
              const score = getScore(r);
              return div({key:r.id,
                style:{display:'grid',gridTemplateColumns:'200px 120px 120px 80px 90px 100px 80px',
                  gap:0,padding:'10px 16px',borderBottom:`1px solid ${BDR}`,alignItems:'center',
                  cursor:'pointer',transition:'background .1s'},
                onClick:()=>onOpen(r),
                onMouseEnter:e=>e.currentTarget.style.background=S2,
                onMouseLeave:e=>e.currentTarget.style.background='transparent'},
                span({style:{fontWeight:600,color:TEXT,fontSize:12}},r.name),
                span({style:{fontSize:11,color:TEXT2}},ROLE_LABELS[r.role]||r.role),
                span({style:{fontSize:11,color:TEXT2}},r.loc||'—'),
                span({style:{fontSize:11,color:TEXT3}},`${r.half} ${r.year}`),
                div(null,ScorePill({score})),
                Tag({label:r.status||'draft',
                  color:r.status==='final'?'#10b981':r.status==='submitted'?'#3b82f6':AMBER}),
                btn({onClick:e=>{e.stopPropagation();
                  if(confirm(`Delete review for ${r.name}?`)){deleteReview(r.id);onNew();}},
                  style:{background:'none',border:'none',color:'#ef4444',cursor:'pointer',
                    fontSize:12,padding:'4px 8px',borderRadius:R}},
                  'Delete')
              );
            })
          )
    )
  );
}

function NewReviewForm({stores, cfg, onCancel, onCreate}) {
  const [name, setName]   = useState('');
  const [role, setRole]   = useState('GM');
  const [loc,  setLoc]    = useState(stores?.[0]?.loc||'');
  const [year, setYear]   = useState(new Date().getFullYear());
  const [half, setHalf]   = useState('H1');

  const submit = () => {
    if (!name.trim()) { alert('Name is required'); return; }
    onCreate(blankReview(name.trim(), role, loc, year, half, cfg));
  };

  const fieldStyle = {padding:'5px 8px',background:'var(--surf)',border:`1px solid ${BDR}`,
    borderRadius:4,color:TEXT,fontSize:12};

  return div({style:{padding:'14px 16px',background:`${AMBER}10`,
    borderBottom:`1px solid ${AMBER}30`,display:'flex',gap:10,alignItems:'flex-end',flexWrap:'wrap'}},
    div(null,
      div({style:{fontSize:10,color:TEXT3,marginBottom:4}},'Name'),
      inp({type:'text',value:name,onChange:e=>setName(e.target.value),placeholder:'Full name',
        style:{...fieldStyle,width:160}})
    ),
    div(null,
      div({style:{fontSize:10,color:TEXT3,marginBottom:4}},'Role'),
      sel({value:role,onChange:e=>setRole(e.target.value),style:{...fieldStyle}},
        ...ROLE_KEYS.map(r=>opt({value:r,key:r},ROLE_LABELS[r]||r)))
    ),
    div(null,
      div({style:{fontSize:10,color:TEXT3,marginBottom:4}},'Primary Store'),
      sel({value:loc,onChange:e=>setLoc(e.target.value),style:{...fieldStyle}},
        opt({value:''},'All Stores'),
        ...(stores||[]).map(s=>opt({value:s.loc,key:s.loc},`${s.loc} — ${sName(s.loc)}`)))
    ),
    div(null,
      div({style:{fontSize:10,color:TEXT3,marginBottom:4}},'Year'),
      inp({type:'number',value:year,onChange:e=>setYear(parseInt(e.target.value)),
        style:{...fieldStyle,width:72}})
    ),
    div(null,
      div({style:{fontSize:10,color:TEXT3,marginBottom:4}},'Period'),
      sel({value:half,onChange:e=>setHalf(e.target.value),style:{...fieldStyle}},
        opt({value:'H1'},'H1 — Mid-Year'), opt({value:'H2'},'H2 — End of Year'))
    ),
    PrimaryBtn({onClick:submit,style:{alignSelf:'flex-end'}},'Create'),
    GhostBtn({onClick:onCancel,style:{alignSelf:'flex-end'}},'Cancel')
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PANEL
// ═══════════════════════════════════════════════════════════════════════════════
export function PerformanceReviewsPanel({stores, ds, settings, onClose}) {
  const [tab, setTab]       = useState('reviews');
  const [cfg, setCfg]       = useState(() => getReviewConfig());
  const [reviews, setReviews] = useState(() => getReviews());
  const [editing, setEditing] = useState(null);

  const refresh = () => setReviews(getReviews());

  const handleSaveCfg = (newCfg) => { saveReviewConfig(newCfg); setCfg(newCfg); };
  const handleResetCfg= () => { resetReviewConfig(); setCfg(JSON.parse(JSON.stringify(DEFAULT_REVIEW_CONFIG))); };

  const handleSaveReview = (r) => {
    upsertReview(r);
    refresh();
    setEditing(rv => rv ? {...rv,...r,updatedAt:new Date().toISOString().slice(0,10)} : rv);
  };

  const tabs = [
    {key:'reviews', label:`Reviews (${Object.keys(reviews).length})`},
    {key:'customize', label:'Customize'},
  ];

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:200,
    display:'flex',alignItems:'center',justifyContent:'center'}},
    div({style:{width:'min(1200px,97vw)',height:'92vh',background:'var(--surf)',
      borderRadius:R,display:'flex',flexDirection:'column',overflow:'hidden',
      boxShadow:'0 20px 60px rgba(0,0,0,.4)',border:`1px solid ${BDR}`}},
      // Panel header
      div({style:{display:'flex',alignItems:'center',padding:'14px 20px',
        borderBottom:`1px solid ${BDR}`,flexShrink:0}},
        span({style:{fontSize:16,marginRight:10}},'📋'),
        div({style:{flex:1}},
          div({style:{fontWeight:700,fontSize:15,color:TEXT}},'Performance Reviews'),
          div({style:{fontSize:11,color:TEXT3}},'Salaried Management · GM · AM · AS · OM')),
        CloseBtn({onClick:onClose})
      ),
      // Tab bar
      TabBar({tabs, active:tab, onSelect:(k)=>{setTab(k);if(k!=='reviews')setEditing(null);}}),
      // Body
      div({style:{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}},
        tab==='reviews' && (
          editing
            ? h(ReviewEditor,{review:editing, cfg, ds, stores,
                onSave:handleSaveReview,
                onBack:()=>{refresh();setEditing(null);}})
            : h(ReviewList,{reviews, cfg, stores,
                onOpen:setEditing,
                onNew:refresh,
                onDelete:refresh})
        ),
        tab==='customize' && div({style:{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}},
          h(CustomizePanel,{cfg, onSave:handleSaveCfg, onReset:handleResetCfg}))
      )
    )
  );
}
