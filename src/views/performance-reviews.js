// @ts-nocheck
import * as React from 'react';
import {
  DEFAULT_REVIEW_CONFIG, getReviewConfig, saveReviewConfig, resetReviewConfig,
  getReviews, upsertReview, deleteReview, blankReview, autoPopulateKPIs,
  rateMetric, ratingColor, ratingBg, computeScores, computeScoreBreakdown,
  RATING_LABELS, MONTH_NAMES, halfMonths, halfQKeys, qLabel, qMonths,
  CAT_KEYS, CAT_LABELS, ROLE_KEYS, ROLE_LABELS,
} from '../engine/review-engine.js';
import { STORE_NAMES, sName, getStoreOrg } from '../constants.js';

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

// ── Org / Logo helpers ─────────────────────────────────────────────────────────
const ORG_LABELS = { mcdok:'McDOK', emerald:'Emerald Arches' };
const ORG_FULL   = { mcdok:'McDOK — Thorley/Mornhinweg Families', emerald:'Emerald Arches' };
function getOrgLabel(org) { return ORG_LABELS[org] || 'ORG'; }
function getOrgFull(org)  { try{return ORG_FULL[org]||localStorage.getItem('mf_org_name')||'The Organization';}catch{return 'The Organization';} }
function getOrgLogo(org)  { try{return localStorage.getItem('mf_logo_'+org)||null;}catch{return null;} }
function clearOrgLogo(org){ try{localStorage.removeItem('mf_logo_'+org);}catch{} }
// Normalize competency items — stored as strings (legacy) or {text,active} objects
const normItem = item => typeof item === 'string' ? {text:item, active:true} : (item || {text:'', active:true});

// ── Shared UI helpers ──────────────────────────────────────────────────────────
function Row(p,...c)  { return div({style:{display:'flex',alignItems:'center',gap:8,...(p?.style||{})}},...c); }
function Col(p,...c)  { return div({style:{display:'flex',flexDirection:'column',gap:6,...(p?.style||{})}},...c); }
function Tag({label,color='var(--amber)'}) {
  return span({style:{fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:10,
    background:`${color}20`,color,border:`1px solid ${color}30`,textTransform:'uppercase',letterSpacing:'.4px'}},label);
}
function ScorePill({score,size='sm'}) {
  if (score==null) return span({style:{color:TEXT3,fontSize:10}},'—');
  const col = score>=3.5?'#16a34a':score>=2.5?'#22c55e':score>=1.5?'#f87171':'#dc2626';
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
function GhostBtn({onClick,style={}}, children) {
  return btn({onClick,style:{background:'none',border:`1px solid ${BDR}`,color:TEXT2,
    borderRadius:R,padding:'5px 12px',fontSize:12,cursor:'pointer',...style}},children);
}
function PrimaryBtn({onClick,style={}}, children) {
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

// ── Help Guide Modal ──────────────────────────────────────────────────────────
function HelpGuideModal({onClose}) {
  const [section, setSection] = useState('overview');
  const sections = [
    {key:'overview',    label:'Overview'},
    {key:'scoring',     label:'Scoring'},
    {key:'metrics',     label:'KPI Sources'},
    {key:'behavioral',  label:'Behavioral'},
  ];
  const HS = (t) => div({style:{fontSize:13,fontWeight:700,color:TEXT,marginBottom:6,marginTop:16,
    paddingBottom:4,borderBottom:`1px solid ${BDR}`}},t);
  const P  = (t) => div({style:{fontSize:12,color:TEXT2,lineHeight:1.6,marginBottom:8}},t);
  const SRC= (label,src) => div({style:{display:'grid',gridTemplateColumns:'180px 1fr',gap:8,
    padding:'6px 0',borderBottom:`1px solid ${BDR}`,fontSize:11}},
    span({style:{color:TEXT,fontWeight:600}},label),
    span({style:{color:TEXT3}},src));

  const content = {
    overview: div(null,
      HS('What is the Performance Review System?'),
      P('A structured semi-annual review system for salaried management (GM, AM, AS, OM). Reviews are split into H1 (Mid-Year, Q1+Q2) and H2 (End of Year, Q3+Q4).'),
      HS('Rating Scale'),
      div({style:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:12}},
        ...[4,3,2,1].map(r => div({style:{padding:'10px',borderRadius:R,background:ratingBg(r),
          border:`1px solid ${ratingColor(r)}44`,textAlign:'center'}},
          div({style:{fontSize:20,fontWeight:800,color:ratingColor(r),fontFamily:'var(--mono)'}},''+r),
          div({style:{fontSize:11,fontWeight:700,color:ratingColor(r),marginTop:2}},RATING_LABELS[r])))),
      HS('Review Status Flow'),
      P('Draft → In Progress → Submitted → Final. Update status from the review card. Final reviews are locked from accidental edits.'),
      HS('Auto-fill vs Manual Entry'),
      P('Click "Auto-fill from Uploaded Data" in the KPI Results tab to populate OEPE, R2P, KVS, Sales vs Target, Labor %, and FOB % from uploaded Operations and Labor files. All other metrics must be entered manually each quarter.')
    ),
    scoring: div(null,
      HS('Overall Score Formula'),
      P('Overall = (Results Achieved × 70%) + (Behavioral × 30%)'),
      div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}},
        div({style:{padding:12,background:S2,borderRadius:R,border:`1px solid ${BDR}`}},
          div({style:{fontWeight:700,fontSize:12,color:AMBER,marginBottom:8}},'Results Achieved — 70%'),
          P('Average of four category scores, each weighted:'),
          ...[
            ['Running Great Restaurants','32.5%'],
            ['Sales Drivers','10.0%'],
            ['Profitability','32.5%'],
            ['People Staffing & Retention','25.0%'],
          ].map(([l,w])=>div({style:{display:'flex',justifyContent:'space-between',fontSize:11,
            color:TEXT2,padding:'3px 0',borderBottom:`1px solid ${BDR}`}},span(null,l),span({style:{fontWeight:700}},w)))
        ),
        div({style:{padding:12,background:S2,borderRadius:R,border:`1px solid ${BDR}`}},
          div({style:{fontWeight:700,fontSize:12,color:AMBER,marginBottom:8}},'Behavioral — 30%'),
          P('Competency ratings (1–4) averaged across all items and quarters.'),
          P('Five categories: RGR, Sales, Profit, People, Admin. Item count varies by role (GM has 6+4+5+14+6 = 35 items).')
        )
      ),
      HS('Metric Rating Logic'),
      P('Each metric is compared against its target:'),
      div({style:{fontSize:11,color:TEXT2,lineHeight:1.8}},
        div(null,'• "Higher is better" metric: 4 if ≥ T1, 3 if ≥ T2, 2 if ≥ T3, else 1'),
        div(null,'• "Lower is better" metric: 4 if ≤ T1, 3 if ≤ T2, 2 if ≤ T3, else 1'),
        div(null,'• "Pct" unit: thresholds are % deviation from target (0.05 = 5%)'),
        div(null,'• "Abs" unit: thresholds are in raw units (seconds, count, $)')
      ),
      HS('Score Display'),
      P('Scores are shown on a 1.00–4.00 scale. The percentage display is score÷4×100. Example: 3.25 → 81%.')
    ),
    metrics: div(null,
      HS('Auto-Populated from Uploaded Data'),
      SRC('OEPE (Peaks, sec)',      'QSRSoft → Reports → Shift → Operations Report (ops data upload)'),
      SRC('KVS Time (sec)',         'QSRSoft → Reports → Shift → Operations Report (ops data upload)'),
      SRC('R2P Front Counter (sec)','QSRSoft → Reports → Shift → Operations Report (ops data upload)'),
      SRC('Sales vs. Target',       'QSRSoft → Reports → Shift → Operations Report → Product Sales'),
      SRC('Labor %',                'QSRSoft → Operations Report → Controls → Crew Labor %'),
      SRC('Food Over Base % (FOB)', 'QSRSoft → Operations Report → FOB Section → FOB %'),
      HS('Manual Entry Required'),
      SRC('Voice OSAT',             'SMG → Reports & Analytics → Full Scale → Overall Satisfaction → 5-star % column'),
      SRC('EPB2B',                  'SMG → same report → Experienced a Problem (Yes) → 1-rating %'),
      SRC('Delivery Wait (sec)',     'QSRSoft → Reports → Sales → McDelivery 3PO → Restaurant Time'),
      SRC('Digital App GC/R/D',     'QSRSoft → Reports → Digital → Digital App → Digital App GC/R/D'),
      SRC('Delivery GC/R/D',        'QSRSoft → Dashboard → Digital Snapshot → McDelivery row → G/R/D column'),
      SRC('Op Supplies ($)',         'QSR C&I → Purchases → Ops Supplies column total'),
      SRC('Complaint Contacts/100K', 'Contact tracking system (manual)'),
      SRC('FS Audits by Restaurant', 'QSRSoft SimpleThink → Forms → Completed Forms → filter by manager name'),
      SRC('FS Audits by Supervisor', 'QSRSoft SimpleThink → Forms → Completed Forms → filter by supervisor name'),
      SRC('FS EcoSure',             'Refer to actual EcoSure visit reports (check email)'),
      SRC('FS Completion T-60',     'Squaddle or Jolt app'),
      SRC('Digital Execute as Designed','Pace Portal → Select Location'),
      SRC('Shift Certified Managers','Altametrics → eHR → Active/LOA Employees → count Cert. Swing Mgr'),
      SRC('Shift Verifications by GM','QSRSoft shift verification records (manual)'),
      SRC('Headcount (EOM)',        'Last emailed headcount report from Val each month'),
      SRC('0-90 Day Crew Turnover', 'QSRSoft → Reports → People → Turnover → 3-Month Turnover row'),
      SRC('Retention Program Exec.','Select Y/N based on observed execution (manual)'),
    ),
    behavioral: div(null,
      HS('How Behavioral Ratings Work'),
      P('Each competency item is rated 1–4 for each quarter (Q1, Q2 for H1; Q3, Q4 for H2). Ratings are averaged across items within each category, then weighted equally across categories.'),
      P('For H1 reviews: rate each item for Q1 and Q2 separately. The average of Q1 and Q2 becomes the H1 behavioral score.'),
      HS('Rating Guidelines'),
      div({style:{display:'flex',flexDirection:'column',gap:6}},
        ...[
          [4,'#16a34a','Exceeds Expectations','Consistently exceeds the standard. Model behavior — others should emulate this.'],
          [3,'#22c55e','On Target / Meets','Meets expectations consistently. Solid, reliable performance at standard.'],
          [2,'#f87171','Below Target','Below expectations. Improvement needed; specific coaching underway.'],
          [1,'#dc2626','Needs Improvement','Significantly below expectations. Active performance plan required.'],
        ].map(([r,col,lbl,desc])=>div({style:{display:'grid',gridTemplateColumns:'32px 120px 1fr',
          gap:8,padding:8,background:ratingBg(r),borderRadius:R,border:`1px solid ${col}33`,
          alignItems:'start'}},
          div({style:{fontWeight:800,fontSize:16,color:col,fontFamily:'var(--mono)',textAlign:'center'}},''+r),
          div({style:{fontWeight:700,fontSize:11,color:col}},lbl),
          div({style:{fontSize:11,color:TEXT2}},desc)))
      ),
      HS('Competency Categories'),
      P('Competency items are organized into 5 categories. Item counts vary by role. GM: RGR(6), Sales(4), Profit(5), People(14), Admin(6) = 35 total items. Customize items in Customize → Competencies.')
    ),
  };

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',zIndex:300,
    display:'flex',alignItems:'center',justifyContent:'center'}},
    div({style:{width:'min(820px,96vw)',height:'88vh',background:'var(--surf)',
      borderRadius:R,display:'flex',flexDirection:'column',overflow:'hidden',
      boxShadow:'0 20px 60px rgba(0,0,0,.5)',border:`1px solid ${BDR}`}},
      div({style:{display:'flex',alignItems:'center',padding:'12px 20px',
        borderBottom:`1px solid ${BDR}`,flexShrink:0}},
        span({style:{fontSize:15,marginRight:8}},'📖'),
        div({style:{flex:1,fontWeight:700,fontSize:14,color:TEXT}},'Performance Review — Methodology & User Guide'),
        CloseBtn({onClick:onClose})
      ),
      div({style:{display:'flex',borderBottom:`1px solid ${BDR}`,flexShrink:0}},
        ...sections.map(s => btn({onClick:()=>setSection(s.key),
          style:{padding:'8px 16px',border:'none',borderBottom:`2px solid ${section===s.key?AMBER:'transparent'}`,
            background:'none',color:section===s.key?AMBER:TEXT2,fontSize:12,
            fontWeight:section===s.key?700:400,cursor:'pointer'}},s.label))
      ),
      div({style:{flex:1,overflowY:'auto',padding:'16px 20px'}}, content[section]||null)
    )
  );
}

// ── Org Logo Upload UI ────────────────────────────────────────────────────────
function OrgLogoUploader({org, label, logo, onUpload, onClear}) {
  const [hov, setHov] = useState(false);
  const pick = () => {
    const fi = document.createElement('input');
    fi.type='file'; fi.accept='image/*';
    fi.onchange = e => { if(e.target.files[0]) onUpload(e.target.files[0]); };
    fi.click();
  };
  return div({style:{border:`1px solid ${BDR}`,borderRadius:R,padding:16,display:'flex',
    flexDirection:'column',gap:10}},
    div({style:{fontWeight:700,fontSize:12,color:TEXT}},label),
    logo
      ? div({style:{display:'flex',flexDirection:'column',gap:8,alignItems:'flex-start'}},
          h('img',{src:logo,alt:label,style:{maxWidth:200,maxHeight:80,objectFit:'contain',
            borderRadius:4,border:`1px solid ${BDR}`,padding:4,background:'white'}}),
          Row({style:{gap:8}},
            GhostBtn({onClick:pick,style:{fontSize:11}},'Replace'),
            btn({onClick:onClear,style:{background:'none',border:`1px solid #ef444444`,color:'#ef4444',
              borderRadius:R,padding:'4px 10px',fontSize:11,cursor:'pointer'}},'Remove')
          ))
      : div({style:{border:`2px dashed ${BDR}`,borderRadius:R,padding:'24px 16px',
          textAlign:'center',cursor:'pointer',color:TEXT3,fontSize:12,
          background:hov?S2:'transparent',transition:'background .15s'},
          onMouseEnter:()=>setHov(true),onMouseLeave:()=>setHov(false),onClick:pick},
          div({style:{fontSize:26,marginBottom:6}},'🖼'),
          div({style:{fontWeight:600,color:TEXT2}},'Click to upload logo'),
          div({style:{fontSize:10,marginTop:4,color:TEXT3}},'PNG or JPG recommended · Will appear in print/PDF output'))
  );
}

function OrgSection() {
  const [orgName, setOrgName] = useState(() => { try{return localStorage.getItem('mf_org_name')||'';}catch{return '';} });
  const [saved, setSaved] = useState(false);

  const save = () => {
    try { localStorage.setItem('mf_org_name', orgName.trim()); } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return div({style:{padding:4}},
    h(SectionHead, {title:'Organization Name', right: null}),
    div({style:{fontSize:11,color:TEXT3,marginBottom:16,padding:'8px 12px',
      background:S2,borderRadius:R,border:`1px solid ${BDR}`}},
      'This name appears on the login screen and in printed review headers. Set it once per deployment.'),
    div({style:{display:'flex',gap:10,alignItems:'center',marginBottom:8}}),
    lbl({style:{fontSize:11,color:TEXT2,display:'block',marginBottom:6}}, 'Organization Name'),
    div({style:{display:'flex',gap:8,alignItems:'center'}}),
    inp({
      type:'text',
      value: orgName,
      onChange: e => setOrgName(e.target.value),
      placeholder: 'e.g. Murphy Family Restaurants',
      style:{
        flex:1, padding:'6px 10px', background:'var(--surf)', border:`1px solid ${BDR}`,
        borderRadius:R, color:TEXT, fontSize:12, width:'100%', maxWidth:360,
      },
    }),
    div({style:{marginTop:12,display:'flex',gap:8,alignItems:'center'}}),
    PrimaryBtn({onClick:save, style:{marginTop:12}}, saved ? 'Saved!' : 'Save'),
    saved && span({style:{fontSize:11,color:'#10b981',marginTop:12,marginLeft:8}}, 'Saved — takes effect on next page load')
  );
}

function LogosSection() {
  const [logos, setLogos] = useState({
    mcdok:   getOrgLogo('mcdok'),
    emerald: getOrgLogo('emerald'),
  });
  const handleUpload = (org, file) => {
    const reader = new FileReader();
    reader.onload = e => {
      const b64 = e.target.result;
      try { localStorage.setItem('mf_logo_'+org, b64); } catch {}
      setLogos(prev => ({...prev, [org]: b64}));
    };
    reader.readAsDataURL(file);
  };
  const handleClear = (org) => { clearOrgLogo(org); setLogos(prev=>({...prev,[org]:null})); };

  return div({style:{padding:4}},
    div({style:{fontSize:11,color:TEXT3,marginBottom:16,padding:'8px 12px',
      background:S2,borderRadius:R,border:`1px solid ${BDR}`}},
      'Logos appear in the printed/PDF review header. Store logos here once — they persist across reviews.'),
    div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}},
      OrgLogoUploader({org:'mcdok', label:'McDOK — Oklahoma', logo:logos.mcdok,
        onUpload:f=>handleUpload('mcdok',f), onClear:()=>handleClear('mcdok')}),
      OrgLogoUploader({org:'emerald', label:'Emerald Arches — Florida', logo:logos.emerald,
        onUpload:f=>handleUpload('emerald',f), onClear:()=>handleClear('emerald')}),
    )
  );
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
    {key:'org',    label:'Organization'},
    {key:'weights', label:'Weights'},
    {key:'thresholds', label:'Rating Thresholds'},
    {key:'competencies', label:'Competencies'},
    {key:'logos', label:'Logos'},
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
      section==='org'        && h(OrgSection, {}),
      section==='weights'   && h(WeightsSection, {local, set}),
      section==='thresholds'&& h(ThresholdsSection, {local, set}),
      section==='competencies' && h(CompetenciesSection, {local, set, custRole, setCustRole, custCat, setCustCat}),
      section==='logos' && h(LogosSection, {}),
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
        Row({style:{marginBottom:8,alignItems:'baseline',gap:8}},
          div({style:{fontWeight:700,fontSize:12,color:TEXT}},`${CAT_LABELS[cat]||cat} — Metric Weights`),
          span({style:{fontSize:10,color:TEXT3}},'(uncheck Active to exclude a metric from scoring this period)')
        ),
        div({style:{display:'grid',gridTemplateColumns:'240px 80px 70px 1fr 28px',gap:'6px 12px',alignItems:'center',fontSize:11}},
          span({style:{color:TEXT3,fontWeight:700}},'Metric'),
          span({style:{color:TEXT3,fontWeight:700}},'Weight'),
          span({style:{color:TEXT3,fontWeight:700,title:'Uncheck to exclude from scoring for this review period'}},'Active'),
          span(null),
          span(null),
          ...mets.flatMap((m,i)=>[
            lbl({style:{color:m.scored?TEXT:TEXT3}}, m.label),
            Row({style:{gap:4}},
              NumInput({value:Math.round(m.weight*100), onChange:v=>set(`metrics.${cat}.${i}.weight`,(v||0)/100), style:{width:55}}),
              span({style:{color:TEXT3}},'%')
            ),
            inp({type:'checkbox',checked:m.scored, onChange:e=>set(`metrics.${cat}.${i}.scored`,e.target.checked)}),
            m.note ? span({style:{color:TEXT3,fontSize:10}},m.note) : span(null),
            btn({onClick:()=>{
              if(!confirm(`Remove "${m.label}" from ${CAT_LABELS[cat]||cat} metrics? This only affects scoring — review data is kept.`)) return;
              const next = mets.filter((_,j)=>j!==i);
              set(`metrics.${cat}`, next);
            }, style:{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:14,padding:'0 4px',lineHeight:1}},'×'),
          ]),
          span(null),
          span({style:{fontSize:10,color:
            Math.abs(mets.reduce((a,m)=>a+m.weight,0)-1)<0.01?'#10b981':'#ef4444'}},
            `Total: ${Math.round(mets.reduce((a,m)=>a+m.weight,0)*100)}%`),
          span(null), span(null)
        )
      )
    )
  );
}

function ThresholdsSection({local, set}) {
  const explain = (m) => {
    const [t1, t2, t3] = m.t;
    const p = m.unit === 'pct';
    const f = v => p ? `${v>=0?'+':''}${Math.round(v*100)}%` : `${v>=0?'+':''}${v}`;
    if (m.better === 'higher')
      return `4 ≥${f(t1)} · 3 ≥${f(t2)} · 2 ≥${f(t3)} · 1 else  (raise T1 → Exceeds harder; lower T3 → more reach Needs Imp)`;
    return `4 ≤${f(t1)} · 3 ≤${f(t2)} · 2 ≤${f(t3)} · 1 else  (lower T1 → Exceeds harder; raise T3 → more reach Needs Imp)`;
  };
  return div(null,
    div({style:{fontSize:11,color:TEXT3,marginBottom:16,padding:'10px 14px',background:S2,borderRadius:R,border:`1px solid ${BDR}`,lineHeight:1.7}},
      div(null,span({style:{fontWeight:700}},'deviation = actual − target'),
        m.unit==='pct'?' divided by |target|':'',
        ' · For "pct" metrics, thresholds are fractions (0.05 = 5%). For "abs" metrics, thresholds are in raw units (seconds, dollars, count).'),
      div({style:{marginTop:4}},
        span({style:{fontWeight:700}},'Changing a threshold: '),
        'T1 sets the Exceeds boundary, T2 sets On Target, T3 sets Below. ',
        'Positive threshold = actual must exceed target by that margin. Negative = actual can fall below target by that margin and still earn that rating.')
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
          span({style:{color:TEXT3,fontWeight:700}},'Current Meaning (dev from target)'),
          ...mets.flatMap((m,i)=>[
            span(null,m.label),
            span({style:{color:TEXT3}},m.better==='higher'?'▲':'▼'),
            span({style:{color:TEXT3}},m.unit),
            NumInput({value:m.t[0], onChange:v=>set(`metrics.${cat}.${i}.t.0`,v??m.t[0]), style:{width:70}}),
            NumInput({value:m.t[1], onChange:v=>set(`metrics.${cat}.${i}.t.1`,v??m.t[1]), style:{width:70}}),
            NumInput({value:m.t[2], onChange:v=>set(`metrics.${cat}.${i}.t.2`,v??m.t[2]), style:{width:70}}),
            span({style:{color:TEXT3,fontSize:10}},explain(m)),
          ])
        )
      )
    )
  );
}

function CompetenciesSection({local, set, custRole, setCustRole, custCat, setCustCat}) {
  const extras = local.extraCategories || [];
  const rawComp = local.competencies[custRole]?.[custCat] || [];
  const comp = rawComp.map(normItem);

  const setComp = (next) => set(`competencies.${custRole}.${custCat}`, next);
  const setItemText   = (i, text)   => setComp(comp.map((it,j)=>j===i?{...it,text}:it));
  const setItemActive = (i, active) => setComp(comp.map((it,j)=>j===i?{...it,active}:it));
  const removeItem    = (i) => setComp(comp.filter((_,j)=>j!==i));
  const addItem       = () => setComp([...comp, {text:'New competency item', active:true}]);

  const addCategory = () => {
    const label = prompt('New category name:');
    if (!label) return;
    const key = 'cat_' + label.toLowerCase().replace(/[^a-z0-9]+/g,'_').slice(0,20) + '_' + Date.now().toString(36);
    set('extraCategories', [...extras, {key, label}]);
    setCustCat(key);
  };
  const renameCategory = (idx) => {
    const label = prompt('Rename category:', extras[idx].label);
    if (!label) return;
    set('extraCategories', extras.map((c,j)=>j===idx?{...c,label}:c));
  };
  const deleteCategory = (idx) => {
    if (!confirm(`Delete category "${extras[idx].label}"? Competency items in this category will also be removed.`)) return;
    const key = extras[idx].key;
    set('extraCategories', extras.filter((_,j)=>j!==idx));
    if (custCat === key) setCustCat('rgr');
  };

  const builtinCats = [...CAT_KEYS,'admin'];
  const catLabel = (key) => {
    const ex = extras.find(c=>c.key===key);
    if (ex) return ex.label;
    return CAT_LABELS[key]||key;
  };

  return div(null,
    // Role selector
    Row({style:{gap:6,marginBottom:12,flexWrap:'wrap'}},
      ...ROLE_KEYS.map(r =>
        btn({onClick:()=>setCustRole(r),key:r,
          style:{padding:'5px 12px',border:`1px solid ${custRole===r?AMBER:BDR}`,borderRadius:R,
            background:custRole===r?`${AMBER}20`:'transparent',color:custRole===r?AMBER:TEXT2,
            fontSize:11,fontWeight:custRole===r?700:400,cursor:'pointer'}},
          ROLE_LABELS[r]||r))
    ),
    // Category selector — built-in + extra + add button
    div({style:{display:'flex',gap:4,marginBottom:16,flexWrap:'wrap',alignItems:'center'}},
      ...builtinCats.map(c =>
        btn({onClick:()=>setCustCat(c),key:c,
          style:{padding:'4px 10px',border:`1px solid ${custCat===c?AMBER:BDR}`,borderRadius:R,
            background:custCat===c?`${AMBER}20`:'transparent',color:custCat===c?AMBER:TEXT2,
            fontSize:11,cursor:'pointer'}},
          catLabel(c))),
      extras.length > 0 && span({style:{width:1,height:20,background:BDR,alignSelf:'center'}}),
      ...extras.map((ec, idx) =>
        div({key:ec.key, style:{display:'flex',alignItems:'center',gap:0}},
          btn({onClick:()=>setCustCat(ec.key),
            style:{padding:'4px 10px',border:`1px solid ${custCat===ec.key?AMBER:BDR}`,borderRadius:'4px 0 0 4px',
              background:custCat===ec.key?`${AMBER}20`:'transparent',color:custCat===ec.key?AMBER:TEXT2,
              fontSize:11,cursor:'pointer'}},
            ec.label),
          btn({onClick:()=>renameCategory(idx),title:'Rename',
            style:{padding:'4px 5px',border:`1px solid ${BDR}`,borderLeft:'none',background:'transparent',
              color:TEXT3,fontSize:10,cursor:'pointer'}},
            '✎'),
          btn({onClick:()=>deleteCategory(idx),title:'Delete category',
            style:{padding:'4px 5px',border:`1px solid ${BDR}`,borderLeft:'none',borderRadius:'0 4px 4px 0',background:'transparent',
              color:'#ef4444',fontSize:11,cursor:'pointer'}},
            '×')
        )
      ),
      btn({onClick:addCategory,
        style:{padding:'4px 10px',border:`1px dashed ${BDR}`,borderRadius:R,
          background:'transparent',color:TEXT3,fontSize:11,cursor:'pointer'}},
        '+ Category')
    ),
    // Help note
    div({style:{fontSize:10,color:TEXT3,marginBottom:10}},
      'Uncheck the toggle to mark an item inactive — it will be hidden from the review and excluded from behavioral scoring. Inactive items keep their index so existing ratings are preserved.'),
    // Item list
    div({style:{display:'flex',flexDirection:'column',gap:6}},
      ...comp.map((item, i) =>
        div({key:i,style:{display:'flex',gap:8,alignItems:'flex-start',opacity:item.active?1:0.45}},
          div({style:{paddingTop:6,display:'flex',flexDirection:'column',alignItems:'center',gap:3}},
            span({style:{color:TEXT3,fontSize:10,minWidth:20,textAlign:'center'}},`${i+1}`),
            inp({type:'checkbox',checked:item.active,title:item.active?'Active — click to deactivate':'Inactive — click to reactivate',
              onChange:e=>setItemActive(i,e.target.checked),style:{cursor:'pointer'}})
          ),
          ta({value:item.text,rows:2,
            onChange:e=>setItemText(i,e.target.value),
            style:{flex:1,padding:'5px 8px',background:'var(--surf)',border:`1px solid ${BDR}`,
              borderRadius:4,color:item.active?TEXT:TEXT3,fontSize:12,resize:'vertical',fontFamily:'var(--sans)'}}),
          btn({onClick:()=>{if(confirm('Remove this item? Any existing ratings for it will become misaligned — only delete items added by mistake.'))removeItem(i);},
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
  const reviewOrg  = getStoreOrg(initReview.loc);
  const orgLogo    = getOrgLogo(reviewOrg);
  const orgLabel   = getOrgLabel(reviewOrg);

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
      scores.half?.overall!=null && (() => {
        const s = scores.half.overall;
        const col = ratingColor(Math.round(s));
        return span({style:{fontSize:11,fontWeight:700,color:col,
          background:col+'22',border:`1px solid ${col}44`,borderRadius:R,
          padding:'3px 8px',whiteSpace:'nowrap'}},
          `${Math.round((s/4)*100)}% overall`);
      })(),
      orgLogo
        ? h('img',{src:orgLogo,alt:orgLabel,style:{height:30,objectFit:'contain',opacity:.9}})
        : span({style:{fontSize:10,color:TEXT3,padding:'3px 8px',border:`1px solid ${BDR}`,borderRadius:R}},orgLabel),
      GhostBtn({onClick:()=>printReview(review,cfg,orgLabel,orgLogo),style:{fontSize:11}},'Print / PDF'),
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
  const extras   = cfg.extraCategories || [];
  const allCats  = [...CAT_KEYS, ...extras.map(c=>c.key), 'admin'];
  const catLabel = (key) => { const ex=extras.find(c=>c.key===key); return ex?ex.label:CAT_LABELS[key]||key; };
  const catItems = (comp[bCat]||[]).map(normItem);

  return div({style:{padding:16}},
    // Category selector
    div({style:{display:'flex',gap:4,marginBottom:16,flexWrap:'wrap'}},
      ...allCats.map(cat =>
        btn({onClick:()=>setBCat(cat),key:cat,
          style:{padding:'5px 12px',border:`1px solid ${bCat===cat?AMBER:BDR}`,borderRadius:R,
            background:bCat===cat?`${AMBER}20`:'transparent',color:bCat===cat?AMBER:TEXT2,
            fontSize:11,cursor:'pointer',fontWeight:bCat===cat?700:400}},
          catLabel(cat)))
    ),
    // Scale legend
    div({style:{display:'flex',gap:8,marginBottom:12,fontSize:10,color:TEXT3}},
      ...[1,2,3,4].map(r =>
        Row({style:{gap:4},key:r}, RatingDot({r,size:8}), span(null,`${r} = ${RATING_LABELS[r]||r}`)))),
    // Header: competency | Q1 | Q2 | (Q3 | Q4)
    div({style:{display:'grid',
      gridTemplateColumns:`1fr ${'115px '.repeat(qKeys.length)}`,
      gap:0,borderBottom:`2px solid ${BDR}`,paddingBottom:6,marginBottom:4,
      fontSize:10,fontWeight:700,color:TEXT3,textTransform:'uppercase',letterSpacing:'.4px'}},
      span({style:{paddingLeft:8}},'Competency'),
      ...qKeys.map(q => span({key:q,style:{textAlign:'center'}},qLabel(q)))
    ),
    // Competency rows — skip inactive items but preserve indices
    ...catItems.map((item, i) => {
      if (!item.active) return null;
      return div({key:i,style:{display:'grid',
        gridTemplateColumns:`1fr ${'115px '.repeat(qKeys.length)}`,
        gap:0,borderBottom:`1px solid ${BDR}`,padding:'6px 0',alignItems:'center'}},
        span({style:{fontSize:12,color:TEXT,paddingLeft:8,lineHeight:1.4}},`${i+1}. ${item.text}`),
        ...qKeys.map(q => {
          const rats = review.behavioralRatings?.[q]?.[bCat];
          const val  = rats?.[i] ?? null;
          return div({key:q,style:{display:'flex',justifyContent:'center'}},
            RatingButtons({value:val, onChange:v=>setRating(q,bCat,i,v)}));
        })
      );
    }),
    catItems.filter(it=>!it.active).length > 0 && div({style:{padding:'6px 8px',fontSize:10,color:TEXT3,fontStyle:'italic'}},
      `${catItems.filter(it=>!it.active).length} inactive item(s) hidden — toggle in Customize → Competencies`),
    // Comments per quarter
    div({style:{marginTop:20}},
      div({style:{fontWeight:700,fontSize:12,color:TEXT,marginBottom:10}},
        `${catLabel(bCat)} — Comments`),
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
function printReview(review, cfg, orgLabel, orgLogo) {
  if (!orgLabel) orgLabel = getOrgLabel(getStoreOrg(review.loc));
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
    const rawItems = cfg.competencies[review.role]?.[catKey]||[];
    const items = rawItems.map(normItem);
    const active = items.filter(it=>it.active);
    if (!active.length) return '<tr><td colspan="5" style="color:#9ca3af">No items</td></tr>';
    return items.map((item,i)=>{
      if (!item.active) return '';
      const qRatings = qKeys.map(q=>{
        const r = review.behavioralRatings?.[q]?.[catKey]?.[i];
        return r!=null?`<td style="text-align:center;font-weight:700;color:${rCol(r)}">${r}</td>`:'<td style="text-align:center;color:#9ca3af">—</td>';
      }).join('');
      return `<tr><td>${i+1}. ${item.text}</td>${qRatings}</tr>`;
    }).join('');
  };

  const printCatLabel = (key) => {
    const ex=(cfg.extraCategories||[]).find(c=>c.key===key);
    return ex?ex.label:CAT_LABELS[key]||key;
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

  const extraKeys = (cfg.extraCategories||[]).map(c=>c.key);
  const allCatSections = [...Object.keys(cfg.categoryWeights), ...extraKeys, 'admin'].map(cat=>`
    <h3>${printCatLabel(cat)}</h3>
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
    <div style="display:flex;align-items:center;gap:14px">
      ${orgLogo?`<img src="${orgLogo}" alt="${orgLabel}" style="height:52px;object-fit:contain;flex-shrink:0">`:''}
      <div>
        <div style="font-size:10px;font-weight:700;letter-spacing:.5px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">${orgLabel} · Salaried Management Performance Review</div>
        <h1>${review.name}</h1>
        <div class="meta">${ROLE_LABELS[review.role]||review.role} · ${review.loc?`Store ${review.loc}`:'All Stores'} · ${halfLabel} ${review.year}</div>
      </div>
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
// ── Score Breakdown Panel ──────────────────────────────────────────────────────
function ScoreBreakdownPanel({review, cfg}) {
  const [open, setOpen] = useState(false);
  const bd = useMemo(() => computeScoreBreakdown(review, cfg), [review, cfg]);

  const hasData = bd.metricsScore != null || bd.behavioralScore != null;
  if (!hasData) return null;

  const mono = {fontFamily:'var(--mono)'};

  return div({style:{marginTop:16}},
    // Toggle header
    div({
      onClick: () => setOpen(o => !o),
      style:{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'9px 14px',
        background: open ? S2 : 'var(--surf)',
        borderRadius: open ? `${R} ${R} 0 0` : R,
        border:`1px solid ${BDR}`,
        cursor:'pointer', userSelect:'none',
      },
    },
      span({style:{fontSize:11,fontWeight:700,color:TEXT,letterSpacing:'.4px'}},
        'SCORE BREAKDOWN'),
      span({style:{fontSize:10,color:TEXT3}}, open ? '▲ Hide' : '▼ Show — how this score is calculated')
    ),

    open && div({style:{
      padding:16, background:S2,
      borderRadius:`0 0 ${R} ${R}`,
      border:`1px solid ${BDR}`, borderTop:'none',
    }},

      // Formula banner
      div({style:{
        padding:'8px 12px', background:'var(--surf)', borderRadius:R,
        border:`1px solid ${BDR}`, marginBottom:16,
        fontSize:11, color:TEXT2, ...mono,
      }},
        `Overall Score  =  (Metrics × ${Math.round(bd.mw*100)}%)  +  (Behavioral × ${Math.round(bd.bw*100)}%)`
      ),

      // Category sections
      ...bd.categories.map(cat =>
        div({key: cat.key, style:{marginBottom:14}},

          // Category header
          div({style:{
            display:'flex', justifyContent:'space-between', alignItems:'center',
            padding:'6px 10px',
            background:'var(--surf)', borderRadius:`${R} ${R} 0 0`,
            border:`1px solid ${BDR}`, borderBottom:'none',
          }},
            span({style:{fontSize:11,fontWeight:700,color:AMBER}}, cat.label),
            span({style:{fontSize:10,color:TEXT3}}, `${Math.round(cat.categoryWeight*100)}% of Metrics`)
          ),

          // Metrics table
          div({style:{border:`1px solid ${BDR}`, borderRadius:`0 0 ${R} ${R}`, overflow:'hidden'}},

            // Column headers
            div({style:{
              display:'grid', gridTemplateColumns:'1fr 58px 52px 68px',
              padding:'4px 10px',
              background:'rgba(255,255,255,.03)',
              borderBottom:`1px solid ${BDR}`,
              fontSize:10, color:TEXT3, fontWeight:700,
            }},
              span(null,'Metric'),
              span({style:{textAlign:'center'}},'Avg Rtg'),
              span({style:{textAlign:'center'}},'Wt'),
              span({style:{textAlign:'right'}},'Contrib')
            ),

            // Metric rows
            ...cat.metrics.map((m, i) =>
              div({key:m.key, style:{
                borderBottom: i < cat.metrics.length - 1 ? `1px solid ${BDR}33` : 'none',
                background: i%2===0 ? 'transparent' : 'rgba(255,255,255,.02)',
              }},
                div({style:{
                  display:'grid', gridTemplateColumns:'1fr 58px 52px 68px',
                  padding:'6px 10px', alignItems:'center', fontSize:11,
                }},
                  div(null,
                    div({style:{color:TEXT2}}, m.label),
                    m.ratedCount < m.totalMonths && m.ratedCount > 0 &&
                      span({style:{fontSize:9,color:TEXT3}},
                        ` ${m.ratedCount}/${m.totalMonths} months rated`)
                  ),
                  div({style:{textAlign:'center'}},
                    m.avgRating != null
                      ? span({style:{
                          fontWeight:700, fontSize:12, ...mono,
                          color: ratingColor(Math.round(m.avgRating)),
                        }}, m.avgRating.toFixed(2))
                      : span({style:{color:TEXT3}}, '—')
                  ),
                  div({style:{textAlign:'center', color:TEXT3, fontSize:10}},
                    `${Math.round(m.weight*100)}%`
                  ),
                  div({style:{textAlign:'right', color:TEXT2, ...mono, fontSize:11}},
                    m.contribution != null ? m.contribution.toFixed(3) : '—'
                  )
                ),
                // "What would change this" hint
                m.nextRating != null && m.gapToNext != null &&
                  div({style:{
                    padding:'2px 10px 5px 10px',
                    fontSize:9, color:'#f59e0b',
                  }},
                    `↑ avg rating needs +${m.gapToNext.toFixed(2)} pts for ${RATING_LABELS[m.nextRating]} · `,
                    `would add +${(m.gapToNext * m.impactPerPoint).toFixed(3)} to overall`
                  )
              )
            ),

            // Category subtotal
            div({style:{
              display:'grid', gridTemplateColumns:'1fr 58px 52px 68px',
              padding:'7px 10px',
              background:'rgba(255,255,255,.05)',
              borderTop:`1px solid ${BDR}`,
              fontSize:11, fontWeight:700,
            }},
              span({style:{color:TEXT2}}, `Category Score`),
              span({style:{textAlign:'center'}},
                cat.categoryScore != null
                  ? span({style:{...mono, color:ratingColor(Math.round(cat.categoryScore))}},
                      cat.categoryScore.toFixed(2))
                  : span({style:{color:TEXT3}}, '—')
              ),
              span({style:{textAlign:'center', color:TEXT3, fontSize:10}},
                `×${Math.round(cat.categoryWeight*100)}%`),
              span({style:{textAlign:'right', ...mono, color: cat.categoryContrib != null ? AMBER : TEXT3}},
                cat.categoryContrib != null ? `${cat.categoryContrib.toFixed(3)}` : '—'
              )
            )
          )
        )
      ),

      // Final formula
      div({style:{
        padding:'12px 14px',
        background:'var(--surf)',
        borderRadius:R,
        border:`1px solid ${AMBER}44`,
        marginTop:4, ...mono, fontSize:11,
      }},
        div({style:{display:'flex',justifyContent:'space-between',color:TEXT2,marginBottom:3}},
          span(null, `Metrics Score × ${Math.round(bd.mw*100)}%`),
          span(null,
            bd.metricsScore != null
              ? `${bd.metricsScore.toFixed(3)} × ${Math.round(bd.mw*100)}% = ${(bd.metricsScore*bd.mw).toFixed(3)}`
              : '—')
        ),
        // Per-quarter behavioral detail
        ...bd.qKeys.map(q =>
          div({key:q, style:{display:'flex',justifyContent:'space-between',fontSize:9,color:TEXT3,marginBottom:1}},
            span(null, `  ${qLabel(q)} Behavioral avg`),
            span(null, bd.behavQScores[q] != null ? bd.behavQScores[q].toFixed(2) : '—')
          )
        ),
        div({style:{display:'flex',justifyContent:'space-between',color:TEXT2,marginBottom:3}},
          span(null, `Behavioral Score × ${Math.round(bd.bw*100)}%`),
          span(null,
            bd.behavioralScore != null
              ? `${bd.behavioralScore.toFixed(3)} × ${Math.round(bd.bw*100)}% = ${(bd.behavioralScore*bd.bw).toFixed(3)}`
              : '—')
        ),
        div({style:{borderTop:`1px solid ${BDR}`,margin:'8px 0'}}),
        div({style:{display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:700}},
          span({style:{color:TEXT}}, 'Overall Score'),
          span({style:{color: bd.overall!=null ? ratingColor(Math.round(bd.overall)) : TEXT3}},
            bd.overall != null
              ? `${(bd.metricsScore*bd.mw).toFixed(3)} + ${(bd.behavioralScore*bd.bw).toFixed(3)} = ${bd.overall.toFixed(3)} / 4.000`
              : '—')
        )
      )
    )
  );
}

function overallLabel(s) {
  if (s==null) return '';
  return s>=3.5?'Exceeds Expectations':s>=2.5?'Meets Expectations':s>=1.5?'Below Expectations':'Needs Improvement';
}

function SummaryTab({review, cfg, scores, qKeys, mths, update}) {
  const half = review.half;
  const halfLabel = half==='H1' ? 'Mid-Year' : 'End of Year';
  const halfScore = scores.half?.overall;
  const halfPct   = halfScore!=null ? Math.round((halfScore/4)*100) : null;
  const heroCol   = halfScore!=null ? ratingColor(Math.round(halfScore)) : 'var(--txt3)';

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
    // ── Overall score hero ──────────────────────────────────────────
    div({style:{
      display:'flex',alignItems:'center',gap:24,padding:'18px 20px',
      background:S2,borderRadius:R,border:`2px solid ${heroCol}33`,
      marginBottom:16,
    }},
      div({style:{
        fontSize:56,fontWeight:800,color:heroCol,lineHeight:1,
        fontFamily:'var(--mono)',letterSpacing:-1,
      }}, halfPct!=null ? `${halfPct}%` : '—'),
      div({style:{flex:1}},
        div({style:{fontSize:14,fontWeight:700,color:TEXT,marginBottom:2}},
          `${halfLabel} Overall Score`),
        div({style:{fontSize:13,color:heroCol,fontWeight:600,marginBottom:8}},
          halfScore!=null ? overallLabel(halfScore) : 'No data yet'),
        div({style:{display:'flex',alignItems:'center',gap:12,fontSize:11,color:TEXT3}},
          span(null, `Results Achieved (70%): `),
          span({style:{fontWeight:700,color:scores.half?.metrics!=null?ratingColor(Math.round(scores.half.metrics)):'var(--txt3)'}},
            scores.half?.metrics!=null ? `${Math.round((scores.half.metrics/4)*100)}%` : '—'),
          span(null, ' · '),
          span(null, `Behavioral (30%): `),
          span({style:{fontWeight:700,color:scores.half?.behavioral!=null?ratingColor(Math.round(scores.half.behavioral)):'var(--txt3)'}},
            scores.half?.behavioral!=null ? `${Math.round((scores.half.behavioral/4)*100)}%` : '—'),
        ),
        halfPct!=null && div({style:{marginTop:8,height:6,borderRadius:3,background:'var(--bdr)',overflow:'hidden'}},
          div({style:{height:'100%',width:`${halfPct}%`,borderRadius:3,background:heroCol,transition:'width .6s'}})),
      ),
      div({style:{textAlign:'right',fontSize:11,color:TEXT3}},
        div(null, 'Raw score'),
        div({style:{fontSize:20,fontWeight:700,color:heroCol,fontFamily:'var(--mono)'}},
          halfScore!=null ? `${halfScore.toFixed(2)} / 4.00` : '—'),
        div({style:{marginTop:4}},
          ...[4,3,2,1].map(r =>
            span({key:r,style:{display:'inline-block',width:8,height:8,borderRadius:'50%',
              background:ratingColor(r),margin:'0 2px',
              opacity: halfScore!=null&&Math.round(halfScore)===r ? 1 : .25}})))
      ),
    ),
    div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}},
      ...qKeys.map(q => {
        const s = scores[q]||{};
        return h(ScoreCard,{key:q,label:qLabel(q)+' Summary',ms:s.metrics,bs:s.behavioral,overall:s.overall});
      }),
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
    // Score breakdown (transparent math)
    h(ScoreBreakdownPanel, {review, cfg}),
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

  const loadDemos = () => {
    fetch('/meridian/populate-demo-reviews.js')
      .then(r => r.text())
      .then(code => { eval(code); onNew(); })
      .catch(e => alert('Could not load demo reviews: ' + e.message));
  };

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
      GhostBtn({onClick:loadDemos,style:{fontSize:11,opacity:.75}},'📚 Demo Reviews'),
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
  const [showHelp, setShowHelp] = useState(false);

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
    showHelp && h(HelpGuideModal, {onClose:()=>setShowHelp(false)}),
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
        GhostBtn({onClick:()=>setShowHelp(true),style:{fontSize:11,marginRight:8}},'? Help'),
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
