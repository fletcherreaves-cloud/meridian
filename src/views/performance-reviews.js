// @ts-nocheck
import * as React from 'react';
import {
  DEFAULT_REVIEW_CONFIG, getReviewConfig, saveReviewConfig, resetReviewConfig,
  getReviews, upsertReview, deleteReview, blankReview, autoPopulateKPIs,
  rateMetric, ratingColor, ratingBg, computeScores, computeScoreBreakdown,
  transitionReview, REVIEW_STATUSES, reviewSummaryStatus,
  getTemplates, saveTemplates, upsertTemplateInList, removeTemplateFromList, duplicateTemplateInList, validateTemplateWeights, syncTemplatesFromSupabase,
  RATING_LABELS, MONTH_NAMES, qLabel, qMonths,
  CAT_KEYS, CAT_LABELS, ROLE_KEYS, ROLE_LABELS, SHIFT_ATTRIBUTABLE_ROLES,
  // Dispatch #149 — locked auto-populated actuals + reason-required override.
  OVERRIDE_REASONS, OVERRIDE_REASON_LABEL, validateOverrideInput, addReviewOverride,
  getReviewOverrides, syncReviewOverridesFromSupabase, effectiveOverrideFor, applyReviewOverrides,
  // Dispatch #157 (Performance Review continuity, Phase 4b/5b UI) — real Q1-Q4/H1/H2/Year period
  // selector (QUARTER_MONTHS/H1_MONTHS/H2_MONTHS + calendarMonthRange) and segmented-scoring
  // display (computeSegmentedReview, the Phase 5a engine dispatch #154 shipped with no UI yet).
  QUARTER_MONTHS, H1_MONTHS, H2_MONTHS, calendarMonthRange, computeSegmentedReview,
} from '../engine/review-engine.js';
import { STORE_NAMES, sName, getStoreOrg } from '../constants.js';
import { hasPermission, getOrgRoles, canOverrideLockedActual, canApproveDeparture, DEFAULT_ROLES, getRoleById } from '../engine/permissions.js';
// Dispatch #162 (Performance Review continuity, build item #6) — departure/termination handling.
import { applyDepartureAutoFinalize } from '../engine/departure.js';
import { escapeHtml as esc } from '../utils/fmt.js';
import { KPI_REGISTRY, kpiByKey, explainThreshold, makeMetricFromKpi } from '../engine/kpi-registry.js';
import { ModalShell, RoutePanelShell, Z } from '../components/ModalShell.js';
// Targets Editor, moved into Customize as a sub-tab by dispatch #135 item 3 (was its own
// standalone panel-registry nav entry under dispatch #132 — see targets-editor.js's own header).
import { TargetsEditorSection } from './targets-editor.js';
// Performance Calculator, moved into Customize as a sub-tab by dispatch #199 (was its own
// standalone panel-registry optional-panel entry — see performance-calculator.js's own header
// for the scoring-divergence and RBAC notes).
import { PerformanceCalculatorSection } from './performance-calculator.js';

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

// ── Period selector (dispatch #157, Priority 1 item 1) ─────────────────────────
// A review record is a full YEAR now (dispatch #152) — `computeScores`/`computeScoreBreakdown`
// return all of q1/q2/q3/q4/h1/h2/year from one call. This is the ONE place the editor's period
// selector's month/quarter-key/status-half mapping is defined, so KPITab/BehavTab/SummaryTab/the
// print functions/ReviewList all read the SAME definition rather than five different ones drifting
// apart. `statusHalf` says which of `review.periods.h1`/`h2` a given period's approval status maps
// to — null for 'year' (spans both halves; the editor shows both halves' status bars for that
// selection, see StatusActionBar usage in ReviewEditor).
export const PERIOD_ORDER = ['q1','q2','q3','q4','h1','h2','year'];
export const PERIOD_META = {
  q1:   { label:'Q1',              months:QUARTER_MONTHS.q1,               qKeys:['q1'],           statusHalf:'h1' },
  q2:   { label:'Q2',              months:QUARTER_MONTHS.q2,               qKeys:['q2'],           statusHalf:'h1' },
  q3:   { label:'Q3',              months:QUARTER_MONTHS.q3,               qKeys:['q3'],           statusHalf:'h2' },
  q4:   { label:'Q4',              months:QUARTER_MONTHS.q4,               qKeys:['q4'],           statusHalf:'h2' },
  h1:   { label:'H1 (Mid-Year)',   months:H1_MONTHS,                       qKeys:['q1','q2'],       statusHalf:'h1' },
  h2:   { label:'H2 (End of Year)',months:H2_MONTHS,                       qKeys:['q3','q4'],       statusHalf:'h2' },
  year: { label:'Full Year',       months:[...H1_MONTHS,...H2_MONTHS],     qKeys:['q1','q2','q3','q4'], statusHalf:null },
};
// Which half's mid-year/EOY narrative fields (comments.midYear / comments.eoy, devPlan default
// period) a given period selection maps to — quarters/halves map to their own half; 'year' maps to
// 'h2' (the end-of-year summary is the natural "whole year" narrative home, matching how the wage
// section below already treats H2/year as the annual decision point).
const PERIOD_TO_NARRATIVE_HALF = { q1:'h1', q2:'h1', h1:'h1', q3:'h2', q4:'h2', h2:'h2', year:'h2' };

// ── Org / Logo helpers ─────────────────────────────────────────────────────────
const ORG_LABELS = { mcdok:'McDOK', emerald:'Emerald Arches' };
function getOrgLabel(org) { return ORG_LABELS[org] || 'ORG'; }
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
  const col = score>=3.5?'#16a34a':score>=2.5?'#22c55e':score>=1.5?'var(--crit)':'#dc2626';
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

// ── Formatted numeric input (shows $, %, or plain value) ──────────────────────
function FormattedNumInput({value, onChange, placeholder, style={}, disabled, dollar, pct}) {
  const [raw, setRaw] = React.useState('');
  const [focused, setFocused] = React.useState(false);
  const fmt = n => {
    if (n == null || isNaN(parseFloat(n))) return '';
    const v = parseFloat(n);
    if (dollar) return '$' + Math.round(v).toLocaleString('en-US');
    if (pct)    return v.toFixed(2) + '%';
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  };
  const toRaw = n => {
    if (n == null || isNaN(parseFloat(n))) return '';
    const v = parseFloat(n);
    if (dollar) return Math.round(v).toString();
    if (pct)    return v.toFixed(1);
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  };
  return inp({
    type:'text', inputMode: dollar ? 'numeric' : 'decimal',
    value: focused ? raw : (value != null ? fmt(value) : ''),
    placeholder, disabled,
    onFocus: () => { setFocused(true); setRaw(value != null ? toRaw(value) : ''); },
    onBlur: () => {
      setFocused(false);
      const c = raw.replace(/[$,\s%]/g,'');
      if (c===''||c==='-') { onChange(null); return; }
      const n = parseFloat(c);
      onChange(isNaN(n) ? null : n);
    },
    onChange: e => { if (focused) setRaw(e.target.value); },
    style:{width:70,padding:'3px 5px',background:'var(--surf)',border:`1px solid ${BDR}`,
      borderRadius:4,color:TEXT,fontSize:11,textAlign:'center',...style}
  });
}

// ── Help Guide Modal ──────────────────────────────────────────────────────────
function HelpGuideModal({onClose, zIndex = Z.modal}) {
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
      P('Click "Auto-fill from Uploaded Data" in the KPI Results tab to populate every metric marked auto-sourced in the Metric Sources tab (OEPE, R2P, KVS, Sales vs Target, Labor %, FOB %, Voice OSAT, Delivery Wait, Digital App GC/R/D, Delivery GC/R/D, Shift Certified Managers, Headcount, 0-90 Crew Turnover, and Total Profit) from uploaded and cloud-synced data. All other metrics must be entered manually each quarter.')
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
      SRC('Voice OSAT',             'SMG FullScale upload → Overall Satisfaction → 5-star % (auto-filled per month from uploaded FullScale report)'),
      SRC('Delivery Wait (sec)',     'QSRSoft → Reports → Sales → McDelivery 3PO → Restaurant Time (cloud-pulled, dispatch #109)'),
      SRC('McDelivery Star Rating', 'Target auto-fills from the yearly targets workbook ("McDelivery Star Rating"). No actual-data source exists anywhere in the app yet — enter manually if available.'),
      SRC('2nd Side Healthy Usage (%)', 'Auto from KVS Healthy Usage (cloud-first: Daily Glimpse/OpsService/QSR Act Summary; manual Ops upload fallback). Target auto-fills from the yearly targets workbook ("Healthy Use 2nd Side").'),
      SRC('Digital App GC/R/D',     'QSRSoft → Reports → Digital → Digital App → Digital App GC/R/D (cloud-pulled)'),
      SRC('Delivery GC/R/D',        'QSRSoft → Dashboard → Digital Snapshot → McDelivery row → G/R/D column (cloud-pulled)'),
      SRC('Shift Certified Managers','Altametrics → eHR → Active/LOA Employees → count Cert. Swing Mgr (cloud-pulled, dispatch #109)'),
      SRC('Headcount (EOM)',        'Roster Statistics → Roster Active count (cloud-pulled, dispatch #109)'),
      SRC('0-90 Day Crew Turnover', 'QSRSoft → Reports → People → Turnover → 0-90 Day row (cloud-pulled, dispatch #109)'),
      SRC('Total Profit vs Target ($)', 'Derived — Σ(target−actual) across this same category\'s FOB%/Labor%/Op-Supplies (dispatch #109)'),
      SRC('EAP (Experienced A Problem)', 'SMG FullScale upload → Overall section → "Experienced a Problem (Yes)" % (auto-filled per month from uploaded FullScale report, dispatch #145). Target is override-only — set in the Targets editor.'),
      HS('Manual Entry Required'),
      SRC('EPB2B',                  'SMG → Reports & Analytics → Full Scale → same report → Experienced a Problem (Yes) → 1-rating %'),
      SRC('Op Supplies ($)',         'QSR C&I → Purchases → Ops Supplies column total'),
      SRC('Complaint Contacts/100K', 'Contact tracking system (manual)'),
      SRC('FS Audits by Restaurant', 'QSRSoft SimpleThink → Forms → Completed Forms → filter by manager name'),
      SRC('FS Audits by Supervisor', 'QSRSoft SimpleThink → Forms → Completed Forms → filter by supervisor name'),
      SRC('FS EcoSure',             'Refer to actual EcoSure visit reports (check email)'),
      SRC('FS Completion T-60',     'Squaddle or Jolt app'),
      SRC('Digital Execute as Designed','Pace Portal → Select Location'),
      SRC('Voice EAD (Execute As Designed)', 'Target auto-fills from the yearly targets workbook ("Voice Execute As Designed"). No actual-data source exists anywhere in the app yet (would come from Pace Portal, not ingested) — enter manually if available (dispatch #145).'),
      SRC('Shift Verifications by GM','QSRSoft shift verification records (manual) — not currently used by this org'),
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
          [2,'var(--crit)','Below Target','Below expectations. Improvement needed; specific coaching underway.'],
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

  return h(ModalShell,{
    title:'Performance Review — Methodology & User Guide', icon:'📖', onClose, maxWidth:820, zIndex,
    bodyStyle:{padding:'16px 20px'},
    subHeader: div({style:{display:'flex',borderBottom:`1px solid ${BDR}`,flexShrink:0}},
      ...sections.map(s => btn({onClick:()=>setSection(s.key),
        style:{padding:'8px 16px',border:'none',borderBottom:`2px solid ${section===s.key?AMBER:'transparent'}`,
          background:'none',color:section===s.key?AMBER:TEXT2,fontSize:12,
          fontWeight:section===s.key?700:400,cursor:'pointer'}},s.label))
    ),
  },
    content[section]||null,
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
      placeholder: 'e.g. Your Organization Name',
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
function CustomizePanel({cfg, onSave, onReset, ds, initialSection}) {
  const [local, setLocal] = useState(() => JSON.parse(JSON.stringify(cfg)));
  const [section, setSection] = useState(initialSection || 'weights');
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

  // ── Named templates (Phase B) ──────────────────────────────────────────────
  const [templates, setTemplates] = useState(() => getTemplates());
  const [selTpl, setSelTpl] = useState('');
  useEffect(() => { syncTemplatesFromSupabase().then(() => setTemplates(getTemplates())).catch(() => {}); }, []);
  const wv = validateTemplateWeights(local); // hard 100% enforcement
  const dc = (x) => JSON.parse(JSON.stringify(x));

  const save = () => {
    if (!wv.ok) { alert('Weights must total 100% before saving.\n' + wv.errors.map(e => `• ${e.scope}: ${(e.sum * 100).toFixed(2)}%`).join('\n')); return; }
    onSave(local); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const applyTemplate = (id) => {
    setSelTpl(id);
    const t = templates.find(x => x.id === id);
    if (t) setLocal(dc(t.config));
  };
  const saveAsTemplate = () => {
    if (!wv.ok) { alert('Weights must total 100% before saving a template.'); return; }
    const name = (prompt('Template name:', '') || '').trim();
    if (!name) return;
    const { list, id } = upsertTemplateInList(templates, { name, config: dc(local) });
    saveTemplates(list); setTemplates(list); setSelTpl(id);
  };
  const updateTemplate = () => {
    if (!selTpl || !wv.ok) { if (!wv.ok) alert('Weights must total 100% before saving.'); return; }
    const cur = templates.find(x => x.id === selTpl);
    const { list } = upsertTemplateInList(templates, { id: selTpl, name: cur ? cur.name : 'Template', config: dc(local) });
    saveTemplates(list); setTemplates(list);
  };
  const duplicateTpl = () => {
    if (!selTpl) return;
    const cur = templates.find(x => x.id === selTpl);
    const name = (prompt('New template name:', (cur ? cur.name : 'Template') + ' copy') || '').trim();
    if (!name) return;
    const { list, id } = duplicateTemplateInList(templates, selTpl, name);
    saveTemplates(list); setTemplates(list); setSelTpl(id);
  };
  const deleteTpl = () => {
    if (!selTpl) return;
    const cur = templates.find(x => x.id === selTpl);
    if (!confirm(`Delete template "${cur ? cur.name : ''}"?`)) return;
    const list = removeTemplateFromList(templates, selTpl);
    saveTemplates(list); setTemplates(list); setSelTpl('');
  };

  const doReset = () => {
    if (!confirm('Reset all customize settings to defaults?')) return;
    onReset();
    setLocal(JSON.parse(JSON.stringify(DEFAULT_REVIEW_CONFIG)));
  };

  const sections = [
    {key:'org',    label:'Organization'},
    {key:'weights', label:'Weights'},
    {key:'thresholds', label:'Rating Thresholds'},
    // Targets Editor (dispatch #132 item 3), moved in here by dispatch #135 item 3 — "this
    // does not need it's own panel, should be inside Customize on Perf Review dashboard".
    {key:'targets', label:'Targets'},
    {key:'competencies', label:'Competencies'},
    {key:'logos', label:'Logos'},
    // Performance Calculator (formerly store-dash.js's standalone `PerformanceCalculator`,
    // panel-registry id 'perf-calc'), moved in here by dispatch #199, the same "this does not
    // need it's own panel" move #135 item 3 did for Targets Editor above. It is an unrelated
    // what-if throughput calculator (OEPE -> cars/hr -> GC -> sales -> labor -> TPPH), not a
    // review-scoring tool — see performance-calculator.js's header comment.
    {key:'calculator', label:'Calculator'},
  ];

  return div({style:{display:'flex',flexDirection:'column',height:'100%'}},
    // Sub-tab bar
    div({style:{display:'flex',gap:0,borderBottom:`1px solid ${BDR}`}},
      ...sections.map(s =>
        btn({onClick:()=>setSection(s.key),
          style:{padding:'8px 14px',border:'none',borderBottom:`2px solid ${section===s.key?AMBER:'transparent'}`,
            background:'none',color:section===s.key?AMBER:TEXT2,fontSize:11,fontWeight:section===s.key?700:400,cursor:'pointer'}},
          s.label))),
    // Template picker bar (Phase B)
    div({style:{display:'flex',alignItems:'center',gap:8,padding:'8px 16px',
      borderBottom:`1px solid ${BDR}`,background:S2,flexWrap:'wrap'}},
      span({style:{fontSize:11,color:TEXT3,fontWeight:700}},'Template'),
      h('select',{value:selTpl,onChange:e=>applyTemplate(e.target.value),
        style:{background:'var(--surf3)',color:TEXT,border:`1px solid ${BDR}`,borderRadius:6,padding:'4px 8px',fontSize:11,maxWidth:220}},
        h('option',{value:''},'— Working config —'),
        ...templates.map(t=>h('option',{key:t.id,value:t.id},t.name))),
      GhostBtn({onClick:saveAsTemplate,style:{fontSize:11}},'＋ Save as new'),
      selTpl&&GhostBtn({onClick:updateTemplate,style:{fontSize:11}},'Update'),
      selTpl&&GhostBtn({onClick:duplicateTpl,style:{fontSize:11}},'Duplicate'),
      selTpl&&GhostBtn({onClick:deleteTpl,style:{fontSize:11,color:'var(--crit)'}},'Delete'),
      span({style:{marginLeft:'auto',fontSize:11,fontWeight:700,color:wv.ok?'#10b981':'var(--crit)'},
        title:wv.ok?'Every weight group totals 100%':wv.errors.map(e=>`${e.scope}: ${(e.sum*100).toFixed(2)}%`).join(' · ')},
        wv.ok?'✓ Weights 100%':`⚠ ${wv.errors[0].scope} = ${(wv.errors[0].sum*100).toFixed(2)}%`)),
    // Save bar
    div({style:{display:'flex',alignItems:'center',gap:8,padding:'8px 16px',
      borderBottom:`1px solid ${BDR}`,background:S2}},
      PrimaryBtn({onClick:save,style:wv.ok?{}:{opacity:.5}},saved?'Saved!':'Save Changes'),
      GhostBtn({onClick:doReset,style:{fontSize:11,color:TEXT3}},'Reset to Defaults'),
      saved&&span({style:{color:'#10b981',fontSize:11}},'Settings saved'),
      !wv.ok&&span({style:{color:'var(--crit)',fontSize:11}},'Fix weight totals to save')),
    // Content
    div({style:{flex:1,overflowY:'auto',padding:16}},
      section==='org'        && h(OrgSection, {}),
      section==='weights'   && h(WeightsSection, {local, set}),
      section==='thresholds'&& h(ThresholdsSection, {local, set}),
      section==='targets' && h(TargetsEditorSection, {ds}),
      section==='competencies' && h(CompetenciesSection, {local, set, custRole, setCustRole, custCat, setCustCat}),
      section==='logos' && h(LogosSection, {}),
      section==='calculator' && h(PerformanceCalculatorSection, {ds}),
    )
  );
}

function WeightsSection({local, set}) {
  const ov = local.overall;
  // Results-category label resolves from the config (supports custom categories), then CAT_LABELS.
  const catLabelOf = (cat) => local.categoryWeights[cat]?.label || CAT_LABELS[cat] || cat;

  // ── Results category CRUD (Notes 30 #3 — add/remove/edit CATEGORIES) ─────────
  const addResultsCategory = () => {
    const label = (prompt('New results category name (e.g. "Guest Experience"):') || '').trim();
    if (!label) return;
    const key = 'rcat_' + label.toLowerCase().replace(/[^a-z0-9]+/g,'_').slice(0,20) + '_' + Date.now().toString(36);
    set('categoryWeights', { ...local.categoryWeights, [key]: { label, weight: 0 } });
    set('metrics', { ...local.metrics, [key]: [] });
  };
  const renameResultsCategory = (cat) => {
    const label = (prompt('Rename category:', catLabelOf(cat)) || '').trim();
    if (!label) return;
    set(`categoryWeights.${cat}.label`, label);
  };
  const deleteResultsCategory = (cat) => {
    if (!confirm(`Delete results category "${catLabelOf(cat)}"? Its metrics are removed from scoring (review data is kept). Redistribute its weight to the remaining categories to reach 100%.`)) return;
    const cw = { ...local.categoryWeights }; delete cw[cat];
    const mx = { ...local.metrics };         delete mx[cat];
    set('categoryWeights', cw);
    set('metrics', mx);
  };

  // ── KPI directory → dropdown (Notes 30 #3 — select a metric, not free-text) ──
  const addKpiToCategory = (cat, key) => {
    if (!key) return;
    const kpi = kpiByKey(key);
    if (!kpi) return;
    const mets = local.metrics[cat] || [];
    if (mets.some(m => m.key === kpi.key)) { alert(`"${kpi.label}" is already in ${catLabelOf(cat)}.`); return; }
    set(`metrics.${cat}`, [...mets, makeMetricFromKpi(kpi, { weight: 0 })]);
  };

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
          `Total: ${((ov.metrics+ov.behavioral)*100).toFixed(2)}% ${ov.metrics+ov.behavioral!==1?'(must equal 100%)':''}`)
      )
    ),
    // Category weights
    div({style:{marginBottom:20}},
      Row({style:{marginBottom:10,alignItems:'baseline',gap:8}},
        div({style:{fontWeight:700,fontSize:12,color:TEXT}},'Results Category Weights'),
        btn({onClick:addResultsCategory,
          style:{padding:'3px 10px',border:`1px dashed ${BDR}`,borderRadius:R,background:'transparent',color:TEXT3,fontSize:11,cursor:'pointer'}},
          '+ Category')
      ),
      div({style:{display:'grid',gridTemplateColumns:'220px 80px 1fr',gap:'8px 12px',alignItems:'center'}},
        ...Object.entries(local.categoryWeights).flatMap(([key,cw])=>[
          lbl({style:{fontSize:12,color:TEXT2}},cw.label||key),
          Row({style:{gap:4}},
            NumInput({value:Math.round(cw.weight*100), onChange:v=>set(`categoryWeights.${key}.weight`,(v||0)/100), style:{width:55}}),
            span({style:{fontSize:11,color:TEXT3}},'%')
          ),
          Row({style:{gap:6}},
            btn({onClick:()=>renameResultsCategory(key),title:'Rename category',
              style:{background:'none',border:'none',color:TEXT3,cursor:'pointer',fontSize:11}},'✎'),
            btn({onClick:()=>deleteResultsCategory(key),title:'Delete category',
              style:{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:13,lineHeight:1}},'×')
          )
        ]),
        span(null),
        span({style:{fontSize:10,color:
          Math.abs(Object.values(local.categoryWeights).reduce((a,c)=>a+c.weight,0)-1)<0.01?'#10b981':'#ef4444'}},
          `Total: ${(Object.values(local.categoryWeights).reduce((a,c)=>a+c.weight,0)*100).toFixed(2)}%`)
      )
    ),
    // Metric weights per category
    ...Object.entries(local.metrics).map(([cat, mets]) =>
      div({style:{marginBottom:20},key:cat},
        Row({style:{marginBottom:8,alignItems:'baseline',gap:8}},
          div({style:{fontWeight:700,fontSize:12,color:TEXT}},`${catLabelOf(cat)} — Metric Weights`),
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
              if(!confirm(`Remove "${m.label}" from ${catLabelOf(cat)} metrics? This only affects scoring — review data is kept.`)) return;
              const next = mets.filter((_,j)=>j!==i);
              set(`metrics.${cat}`, next);
            }, style:{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:14,padding:'0 4px',lineHeight:1}},'×'),
          ]),
          span(null),
          span({style:{fontSize:10,color:
            Math.abs(mets.reduce((a,m)=>a+m.weight,0)-1)<0.01?'#10b981':'#ef4444'}},
            `Total: ${(mets.reduce((a,m)=>a+m.weight,0)*100).toFixed(2)}%`),
          span(null), span(null)
        ),
        // KPI-directory dropdown: add a metric by selecting it (controls the source, not free-text)
        h(KpiAddPicker, { cat, mets, onAdd:addKpiToCategory })
      )
    )
  );
}

// A dropdown fed from the shared KPI registry — pick a KPI to insert into a category.
// Selecting a KPI seeds its source/unit/direction/default thresholds automatically.
function KpiAddPicker({ cat, mets, onAdd }) {
  const [val, setVal] = useState('');
  const have = new Set((mets || []).map(m => m.key));
  const groups = {};
  for (const k of KPI_REGISTRY) { if (have.has(k.key)) continue; (groups[k.categoryLabel] || (groups[k.categoryLabel] = [])).push(k); }
  return Row({style:{gap:8,marginTop:6,alignItems:'center'}},
    span({style:{fontSize:10,color:TEXT3}},'Add KPI from directory:'),
    sel({value:val, onChange:e=>{ onAdd(cat, e.target.value); setVal(''); },
      style:{background:'var(--surf3)',color:TEXT,border:`1px solid ${BDR}`,borderRadius:6,padding:'4px 8px',fontSize:11,maxWidth:280}},
      opt({value:''}, '— select a KPI —'),
      ...Object.entries(groups).map(([g, ks]) =>
        h('optgroup',{key:g,label:g},
          ...ks.map(k => opt({key:k.key,value:k.key}, k.label))))
    ),
    span({style:{fontSize:10,color:TEXT3,fontStyle:'italic'}},'seeds source + default thresholds (weight starts at 0)')
  );
}

// Plain-English "how it scores" sentence for ANY metric def — reuses the shared
// registry explainer (adapts a review metric def into a registry-shaped kpi).
function plainEnglishThreshold(m) {
  return explainThreshold({ label:m.label, unit:m.unit, better:m.better, defaultT:m.t });
}

function ThresholdsSection({local, set}) {
  const catLabelOf = (cat) => local.categoryWeights[cat]?.label || CAT_LABELS[cat] || cat;
  const explain = (m) => {
    const [t1, t2, t3] = m.t;
    const p = m.unit === 'pct';
    const f = v => p ? `${v>=0?'+':''}${(v*100).toFixed(2)}%` : `${v>=0?'+':''}${v}`;
    if (m.better === 'higher')
      return `4 ≥${f(t1)} · 3 ≥${f(t2)} · 2 ≥${f(t3)} · 1 else  (raise T1 → Exceeds harder; lower T3 → more reach Needs Imp)`;
    return `4 ≤${f(t1)} · 3 ≤${f(t2)} · 2 ≤${f(t3)} · 1 else  (lower T1 → Exceeds harder; raise T3 → more reach Needs Imp)`;
  };
  const [openKey, setOpenKey] = useState(null); // metric whose plain-English panel is expanded
  return div(null,
    div({style:{fontSize:11,color:TEXT3,marginBottom:16,padding:'10px 14px',background:S2,borderRadius:R,border:`1px solid ${BDR}`,lineHeight:1.7}},
      div(null,span({style:{fontWeight:700}},'deviation = actual − target'),
        ' (pct metrics: ÷ |target|)',
        ' · For "pct" metrics, thresholds are fractions (0.05 = 5%). For "abs" metrics, thresholds are in raw units (seconds, dollars, count).'),
      div({style:{marginTop:4}},
        span({style:{fontWeight:700}},'Changing a threshold: '),
        'T1 sets the Exceeds boundary, T2 sets On Target, T3 sets Below. ',
        'Positive threshold = actual must exceed target by that margin. Negative = actual can fall below target by that margin and still earn that rating.'),
      div({style:{marginTop:4,fontStyle:'italic'}},
        'Click the ⓘ next to any metric for a plain-English description of exactly how its 1–4 rating is computed.')
    ),
    ...Object.entries(local.metrics).map(([cat, mets]) =>
      div({style:{marginBottom:24},key:cat},
        div({style:{fontWeight:700,fontSize:12,marginBottom:8,padding:'4px 0',
          borderBottom:`1px solid ${BDR}`,color:TEXT}},catLabelOf(cat)),
        div({style:{display:'grid',gridTemplateColumns:'220px 40px 40px 80px 80px 80px 1fr',
          gap:'6px 8px',alignItems:'center',fontSize:11}},
          span({style:{color:TEXT3,fontWeight:700}},'Metric'),
          span({style:{color:TEXT3,fontWeight:700}},'Dir'),
          span({style:{color:TEXT3,fontWeight:700}},'Unit'),
          span({style:{color:'#10b981',fontWeight:700}},'T1 (→4)'),
          span({style:{color:'#3b82f6',fontWeight:700}},'T2 (→3)'),
          span({style:{color:'#f59e0b',fontWeight:700}},'T3 (→2)'),
          span({style:{color:TEXT3,fontWeight:700}},'Current Meaning (dev from target)'),
          ...mets.flatMap((m,i)=>{
            const rowKey = `${cat}.${i}`;
            const open = openKey === rowKey;
            return [
              Row({style:{gap:5,alignItems:'center'}},
                btn({onClick:()=>setOpenKey(open?null:rowKey),title:'Plain-English: how this metric scores',
                  style:{background:'none',border:'none',color:open?AMBER:TEXT3,cursor:'pointer',fontSize:12,padding:0,lineHeight:1}},'ⓘ'),
                span(null,m.label)),
              span({style:{color:TEXT3}},m.better==='higher'?'▲':'▼'),
              span({style:{color:TEXT3}},m.unit),
              NumInput({value:m.t[0], onChange:v=>set(`metrics.${cat}.${i}.t.0`,v??m.t[0]), style:{width:70}}),
              NumInput({value:m.t[1], onChange:v=>set(`metrics.${cat}.${i}.t.1`,v??m.t[1]), style:{width:70}}),
              NumInput({value:m.t[2], onChange:v=>set(`metrics.${cat}.${i}.t.2`,v??m.t[2]), style:{width:70}}),
              open
                ? div({style:{gridColumn:'1 / -1',fontSize:11,color:TEXT2,lineHeight:1.6,padding:'8px 12px',
                    margin:'2px 0 6px',background:S2,borderRadius:R,border:`1px solid ${BDR}`}},
                    span({style:{fontWeight:700,color:AMBER}},`${m.label}: `), plainEnglishThreshold(m))
                : span({style:{color:TEXT3,fontSize:10}},explain(m)),
            ];
          })
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
function ReviewEditor({review: initReview, cfg, ds, onSave, onBack, userRole='admin', orgRoles, onTransition, dataReady=true}) {
  const [review, setReview]       = useState(() => JSON.parse(JSON.stringify(initReview)));
  const [tab, setTab]             = useState('kpi');
  const [kpiCat, setKpiCat]       = useState('rgr');
  const [bCat, setBCat]           = useState('rgr');
  const [autoFilling, setAutoFilling] = useState(false);
  const [dirty, setDirty]         = useState(false);
  const [checkMonth, setCheckMonth]         = useState(null);
  // Dispatch #157 (Performance Review continuity, Phase 4b UI) — real period selector: a review
  // record spans the whole year now (dispatch #152), so which months/quarters the KPI/Behavioral
  // tabs and header score pill show is UI state, not read off the (now nonexistent) review.half.
  // Defaults to 'year' — the original motivating ask was "how do I see this review in entirety".
  const [period, setPeriod] = useState('year');
  // Dispatch #149 — locked-actual overrides. Loaded per-review (not globally); Supabase is the
  // durable store, localStorage (getReviewOverrides) is the instant-read cache for this device.
  const [overrides, setOverrides] = useState(() => getReviewOverrides(review.id));
  useEffect(() => {
    let alive = true;
    syncReviewOverridesFromSupabase(review.id).then(list => { if (alive) setOverrides(list); }).catch(()=>{});
    return () => { alive = false; };
  }, [review.id]);
  const reviewOrg  = getStoreOrg(initReview.loc);
  const orgLogo    = getOrgLogo(reviewOrg);
  const orgLabel   = getOrgLabel(reviewOrg);

  const mths  = PERIOD_META[period].months;
  const qKeys = PERIOD_META[period].qKeys;
  const activeCheckMonth = checkMonth || mths[mths.length-1];

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

  // Dispatch #157, Priority 1 item 2 — approval status lives per-half now
  // (review.periods.h1.status / review.periods.h2.status, dispatch #152), never a top-level
  // review.status (that field no longer exists on a #152-era review — see this dispatch's PR
  // body finding #2). Read-only gating follows whichever half(s) the CURRENT period selection
  // touches: a single quarter/half maps to exactly one half's lock state; 'year' (spans both)
  // is read-only only once BOTH halves are locked, so viewing the full year never blocks
  // legitimate edits to a still-open half just because its sibling half is already approved.
  const h1Status = review.periods?.h1?.status || 'draft';
  const h2Status = review.periods?.h2?.status || 'draft';
  // Dispatch #162 — 'auto_finalized' locks KPI editing the same as 'approved' (a departure-
  // triggered finalize is still a finalize; only Reopen, gated by canApproveDeparture below in
  // StatusActionBar, unlocks it again).
  const _locked = s => s === 'submitted' || s === 'approved' || s === 'auto_finalized';
  const activeHalf = PERIOD_META[period].statusHalf; // 'h1' | 'h2' | null (year = both)
  const isReadOnly = activeHalf
    ? _locked(activeHalf === 'h1' ? h1Status : h2Status)
    : (_locked(h1Status) && _locked(h2Status));

  const doSave = () => { if (isReadOnly) return; onSave(review); setDirty(false); };

  // Dispatch #157 — fixes the confirmed 3-vs-4-arg bug (dispatch #157 finding #3): the engine's
  // transitionReview(id, half, newStatus, notes) is 4-arg; this now passes `half` explicitly
  // (lowercase 'h1'|'h2', matching review.periods' own keys) instead of silently shifting
  // newStatus into the half slot. Called once per half from StatusActionBar below (rendered
  // once for a quarter/half selection, twice — h1 and h2 — for 'year').
  const doTransition = useCallback((half, newStatus, notes='') => {
    if (onTransition) onTransition(review.id, half, newStatus, notes);
    // Optimistically update local state — same {from,to,notes,at} audit-trail shape
    // transitionReview() itself builds, nested under the correct half.
    setReview(prev => {
      const periods = prev.periods || {};
      const cur = periods[half] || { status: 'draft', statusHistory: [], statusNotes: '' };
      return {
        ...prev,
        periods: {
          ...periods,
          [half]: {
            ...cur,
            status: newStatus,
            statusHistory: [...(cur.statusHistory || []),
              { from: cur.status || 'draft', to: newStatus, notes, at: new Date().toISOString() }],
            statusNotes: notes || '',
          },
        },
      };
    });
  }, [review.id, onTransition]);

  // Dispatch #149 — the RESOLVED review: every src:'auto' actual with an active override shows
  // that override's value instead of the raw auto-populated one. Computed ONCE here and handed
  // to every downstream consumer (scoring, KPIGrid display, print exports) so none of them need
  // their own override-awareness (scope item 3 — "check every call site").
  const resolvedReview = useMemo(() => applyReviewOverrides(review, overrides), [review, overrides]);
  const scores = useMemo(() => computeScores(resolvedReview, cfg), [resolvedReview, cfg]);

  // Dispatch #149 — who (if anyone) may override a locked auto-sourced actual on THIS review:
  // levelsAbove(reviewedRole, callerRole) >= 2 on the org's ladder, PLUS an unconditional
  // admin/owner escape hatch (canOverrideLockedActual, permissions.js). review.role is a
  // review-engine ROLE_KEYS value (GM/AM/DM/SM/AS/OM), not a ladder id.
  const canOverride = canOverrideLockedActual(userRole, review.role, orgRoles || DEFAULT_ROLES);

  const onAddOverride = useCallback((month, metricKey, input) => {
    const previousValue = resolvedReview.kpis?.months?.[month]?.[metricKey] ?? null;
    const record = addReviewOverride(review.id, {
      month, metricKey, value: input.value, reason: input.reason, note: input.note,
      previousValue, overriddenByRole: userRole,
    });
    setOverrides(prev => [...prev, record]);
  }, [review.id, resolvedReview, userRole]);

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
          `${ROLE_LABELS[review.role]||review.role} · ${review.loc||'All Stores'} · ${PERIOD_META[period].label} ${review.year}`)
      ),
      // Dispatch #157, Priority 1 item 1 — the real period selector. Drives mths/qKeys (above)
      // for the KPI tab, Behavioral tab, header score pill, and (via props) the Summary tab and
      // print exports — replaces the dead `halfMonths(review.half)` (review.half is undefined on
      // every #152-era review, so this was permanently stuck on H2's months).
      sel({value:period,onChange:e=>setPeriod(e.target.value),
        style:{fontSize:11,padding:'4px 8px',background:'var(--surf)',border:`1px solid ${BDR}`,
          borderRadius:R,color:TEXT,fontWeight:700,cursor:'pointer'}},
        ...PERIOD_ORDER.map(p=>opt({value:p,key:p},PERIOD_META[p].label))
      ),
      dirty&&span({style:{fontSize:11,color:AMBER}},'Unsaved changes'),
      scores[period]?.overall!=null && (() => {
        const s = scores[period].overall;
        const col = ratingColor(Math.round(s));
        return span({style:{fontSize:11,fontWeight:700,color:col,
          background:col+'22',border:`1px solid ${col}44`,borderRadius:R,
          padding:'3px 8px',whiteSpace:'nowrap'}},
          `${((s/4)*100).toFixed(2)}% overall`);
      })(),
      orgLogo
        ? h('img',{src:orgLogo,alt:orgLabel,style:{height:30,objectFit:'contain',opacity:.9}})
        : span({style:{fontSize:10,color:TEXT3,padding:'3px 8px',border:`1px solid ${BDR}`,borderRadius:R}},orgLabel),
      div({style:{display:'flex',gap:4,alignItems:'center'}},
        sel({value:activeCheckMonth,onChange:e=>setCheckMonth(+e.target.value),
          style:{fontSize:10,padding:'3px 6px',background:'var(--surf)',border:`1px solid ${BDR}`,
            borderRadius:R,color:TEXT,cursor:'pointer'}},
          ...mths.map(mn=>h('option',{value:mn,key:mn},MONTH_NAMES[mn-1]))
        ),
        GhostBtn({onClick:()=>printCheckpoint(resolvedReview,cfg,activeCheckMonth,orgLabel,orgLogo),
          style:{fontSize:11}},'1:1 Checkpoint')
      ),
      // Dispatch #157, Priority 1 item 5 — both print functions now take the selected `period`
      // explicitly instead of reading the broken `review.half` internally.
      GhostBtn({onClick:()=>printBlankForm(review,cfg,orgLabel,orgLogo,period),style:{fontSize:11}},'Blank Form'),
      GhostBtn({onClick:()=>printReview(resolvedReview,cfg,orgLabel,orgLogo,period),style:{fontSize:11}},'Print / PDF'),
      PrimaryBtn({onClick:doSave,disabled:isReadOnly,
        style:{minWidth:80,opacity:isReadOnly?0.45:1,cursor:isReadOnly?'not-allowed':'pointer'}},
        'Save'),
    ),
    // Dispatch #157, Priority 1 item 2 — status action bar(s). A quarter/half selection shows
    // exactly the ONE half it maps to; 'year' shows BOTH h1 and h2 independently (per the owner's
    // own words: "I'd still wanna see... a six month half first half year review and a second
    // six month second half year review" — two real, independent review conversations, not one
    // fabricated year-level status). Each StatusActionBar reads/writes its own
    // review.periods.h1/h2.status via the now-correct 4-arg doTransition(half, newStatus, notes).
    ...(activeHalf ? [activeHalf] : ['h1','h2']).map(half =>
      h(StatusActionBar, {key:half, half, review, userRole, orgRoles, onTransition:doTransition})),
    // Tab bar
    TabBar({tabs, active:tab, onSelect:setTab}),
    // Content
    div({style:{flex:1,overflowY:'auto'}},
      tab==='kpi'     && h(KPITab,     {review, resolvedReview, cfg, mths, qKeys, kpiCat, setKpiCat, setMonthKPI, doAutoFill, autoFilling, ds, dataReady, overrides, canOverride, onAddOverride}),
      tab==='behav'   && h(BehavTab,   {review, cfg, qKeys, bCat, setBCat, setRating, setComment}),
      tab==='devplan' && h(DevPlanTab, {review, setDevPlan, update, activeHalf: PERIOD_TO_NARRATIVE_HALF[period]}),
      tab==='summary' && h(SummaryTab, {review:resolvedReview, cfg, scores, qKeys, mths, update, period,
        ds, assignmentRows: ds?.assignmentRows || []}),
    )
  );
}

// Dispatch #157, Priority 1 item 2 — one half's status badge + Submit/Approve/Return/Reopen
// action bar + its own inline return-notes form. A real, standalone component (not a closure
// inside ReviewEditor) so its `useState` (showReturnForm/returnNotes) is a stable per-half
// instance rather than being redefined every ReviewEditor render — needed because 'year'
// mounts TWO of these side by side (h1 and h2), each with independent local UI state.
function StatusActionBar({half, review, userRole, orgRoles, onTransition}) {
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnNotes, setReturnNotes]       = useState('');
  const periodState = review.periods?.[half] || {status:'draft', statusHistory:[], statusNotes:''};
  const status      = periodState.status || 'draft';
  // Dispatch #162 — 'auto_finalized' is read-only too, same as 'approved' (see ReviewEditor's own
  // _locked for the KPI-tab half of this).
  const isReadOnly  = status === 'submitted' || status === 'approved' || status === 'auto_finalized';
  const halfLabel   = half === 'h1' ? 'H1' : 'H2';
  // Dispatch #162 — Approve/Reopen on an auto-finalized half is gated by decision #4's hierarchy
  // mechanism (canApproveDeparture, permissions.js — the person's normal reviewer or above, PLUS
  // the unconditional Admin/Developer escape hatch), NOT the plain reviews.approve permission a
  // normal Submitted->Approved transition uses. That's the owner's own explicit design: "The
  // approval and potential override should come from a job title code qualified to perform the
  // review or above."
  const canApproveThisDeparture = canApproveDeparture(userRole, review.role, orgRoles || getOrgRoles());

  const fire = (newStatus, notes='') => onTransition(half, newStatus, notes);

  return div({style:{display:'flex',flexDirection:'column'}},
    div({style:{display:'flex',alignItems:'center',gap:10,padding:'7px 16px',
      borderBottom:`1px solid ${BDR}`,background:S2,flexWrap:'wrap'}},
      span({style:{fontSize:10,fontWeight:700,color:TEXT3,minWidth:20}},halfLabel),
      h(StatusBadge,{status}),
      status==='returned'&&periodState.statusNotes&&
        span({style:{fontSize:11,color:'#ef4444',fontStyle:'italic'}},
          `"${periodState.statusNotes}"`),
      // Dispatch #162 — the auto-finalize note itself, surfaced verbatim (departure reason +
      // who can act on it) rather than a generic "read-only" line, so the distinction from a
      // normal human approval is visible in the explanatory text too, not just the badge color.
      status==='auto_finalized'&&periodState.statusNotes&&
        span({style:{fontSize:11,color:'#a855f7',fontStyle:'italic'}},
          periodState.statusNotes),
      isReadOnly&&status!=='auto_finalized'&&span({style:{fontSize:11,color:TEXT3}},
        status==='submitted'?'Read-only while under review':'Approved — use Reopen to edit'),
      div({style:{flex:1}}),
      // Draft: submit
      status==='draft'&&PrimaryBtn({
        onClick:()=>fire('submitted'),
        style:{fontSize:11,padding:'4px 12px'}},
        'Submit for Review'),
      // Returned: resubmit
      status==='returned'&&PrimaryBtn({
        onClick:()=>fire('submitted'),
        style:{fontSize:11,padding:'4px 12px',background:'#f59e0b',color:'#000'}},
        'Resubmit for Review'),
      // Submitted: approve/return (permission-gated)
      status==='submitted'&&hasPermission(userRole,'reviews.approve',orgRoles||getOrgRoles())&&h(React.Fragment,null,
        PrimaryBtn({onClick:()=>fire('approved'),
          style:{fontSize:11,padding:'4px 12px',background:'#16a34a'}},
          'Approve'),
        GhostBtn({onClick:()=>{setShowReturnForm(v=>!v);setReturnNotes('');},
          style:{fontSize:11,padding:'4px 12px',color:'#ef4444',borderColor:'#ef444455'}},
          'Return for Revision'),
      ),
      // Approved: reopen (same permission gate)
      status==='approved'&&hasPermission(userRole,'reviews.approve',orgRoles||getOrgRoles())&&
        GhostBtn({onClick:()=>fire('draft'),style:{fontSize:11,padding:'4px 12px'}},
          'Reopen'),
      // Auto-finalized (dispatch #162): Approve-as-final / Reopen, gated by the hierarchy check
      // (canApproveThisDeparture), NOT the plain reviews.approve permission above.
      status==='auto_finalized'&&canApproveThisDeparture&&h(React.Fragment,null,
        PrimaryBtn({onClick:()=>fire('approved','Confirmed as final by qualified reviewer after auto-finalize.'),
          style:{fontSize:11,padding:'4px 12px',background:'#16a34a'}},
          'Approve as Final'),
        GhostBtn({onClick:()=>fire('draft','Reopened — auto-finalize departure record was reviewed and reversed.'),
          style:{fontSize:11,padding:'4px 12px'}},
          'Reopen'),
      ),
    ),
    showReturnForm&&div({style:{display:'flex',alignItems:'flex-start',gap:8,
      padding:'10px 16px',borderBottom:`1px solid ${BDR}`,background:'#1c0a0a'}},
      ta({value:returnNotes,rows:2,placeholder:'Reason for returning (shown to reviewer)…',
        onChange:e=>setReturnNotes(e.target.value),
        style:{flex:1,padding:'6px 10px',background:'var(--surf)',
          border:'1px solid #ef4444',borderRadius:R,color:TEXT,fontSize:12,
          resize:'none',fontFamily:'var(--sans)'}}),
      div({style:{display:'flex',flexDirection:'column',gap:6}},
        PrimaryBtn({style:{background:'#ef4444',fontSize:11,padding:'4px 12px'},
          onClick:()=>{fire('returned',returnNotes);setShowReturnForm(false);setReturnNotes('');}},
          'Confirm'),
        GhostBtn({onClick:()=>{setShowReturnForm(false);setReturnNotes('');},style:{fontSize:11,padding:'4px 12px'}},
          'Cancel')
      )
    )
  );
}

// ── KPI Results Tab ────────────────────────────────────────────────────────────
function KPITab({review, resolvedReview, cfg, mths, qKeys, kpiCat, setKpiCat, setMonthKPI, doAutoFill, autoFilling, ds, dataReady=true, overrides, canOverride, onAddOverride}) {
  // RAW months (targets + manual actuals are edited against these — direct edits are never
  // clobbered by overrides, which only ever apply to src:'auto' actuals). RESOLVED months are
  // what's actually shown/rated for the "Actual" row of an auto-sourced metric — the effective
  // value with any active override already applied (dispatch #149).
  const months = review.kpis?.months || {};
  const resolvedMonths = resolvedReview?.kpis?.months || months;
  const catMets = cfg.metrics[kpiCat] || [];
  const allCats = [...CAT_KEYS];

  // Dispatch #159, extended (this session) — `ds.loaded` flips true off the local IDB restore
  // alone, well before the Supabase auto/cloud streams autoPopulateKPIs actually reads (App.js's
  // "T1" AND "T2", real network round-trips) have landed. `dataReady` (defaulted true for any
  // caller that hasn't been wired to the real signal, e.g. existing tests / other render paths)
  // is App.js's honest "every auto source autoPopulateKPIs reads has had its chance to load"
  // flag — originally T1-only (qsrActSummaryRows/glimpseRows/opsServiceRows, the OEPE/R2P/KVS/
  // Labor%/Sales chains), widened to also cover T2 (smgFullscale, rosterStats/roleCounts/
  // turnover, digitalApp/mcdelivery, ebos, qsrFob — see App.js's cloudStreamsReady comment).
  // Without this, a click in that window silently resolved every recent month from nothing —
  // falling through past the not-yet-loaded auto sources straight to whatever the already-IDB-
  // resident manual fallback happened to cover, and to nothing at all for months beyond that
  // (root cause of the observed Jan-Jun-populates/Jul-Dec-blank split).
  const canAutoFill = !!ds?.loaded && dataReady;

  return div({style:{padding:16}},
    // Auto-fill button
    div({style:{display:'flex',alignItems:'center',gap:10,marginBottom:16,
      padding:'10px 14px',background:`${AMBER}10`,borderRadius:R,border:`1px solid ${AMBER}30`}},
      btn({onClick:doAutoFill,disabled:!canAutoFill||autoFilling,
        style:{padding:'6px 14px',background:AMBER,color:'#000',border:'none',
          borderRadius:R,fontSize:12,fontWeight:700,cursor:canAutoFill?'pointer':'not-allowed',opacity:canAutoFill?1:.5}},
        autoFilling?'Filling...' : 'Auto-fill from Uploaded Data'),
      span({style:{fontSize:11,color:TEXT3}},
        !ds?.loaded
          ? 'Upload Operations Report, Labor Analysis, and SMG FullScale files to enable auto-fill.'
          : !dataReady
          ? 'Still loading live data from the cloud (OEPE/R2P/KVS/Labor %/Sales, plus OSAT, Digital/Delivery, Headcount, Turnover, and FOB) — wait a moment before auto-filling, or recent months may come back blank.'
          : 'Fills OEPE, R2P, KVS, Sales vs Target, Labor %, FOB, and Voice OSAT from your uploaded Operations/Labor/SMG FullScale reports.')),
    // Category tabs
    div({style:{display:'flex',gap:4,marginBottom:16,flexWrap:'wrap'}},
      ...allCats.map(cat => {
        const cw = cfg.categoryWeights[cat];
        return btn({onClick:()=>setKpiCat(cat),key:cat,
          style:{padding:'5px 12px',border:`1px solid ${kpiCat===cat?AMBER:BDR}`,borderRadius:R,
            background:kpiCat===cat?`${AMBER}20`:'transparent',color:kpiCat===cat?AMBER:TEXT2,
            fontSize:11,fontWeight:kpiCat===cat?700:400,cursor:'pointer'}},
          `${CAT_LABELS[cat]||cat} (${((cw?.weight||0)*100).toFixed(2)}%)`)
      })
    ),
    // KPI grid for selected category
    div({style:{overflowX:'auto'}},
      h(KPIGrid, {metrics:catMets, months:resolvedMonths, rawMonths:months, mths, qKeys, setMonthKPI, cfg,
        overrides, canOverride, onAddOverride})
    ),
    // Dispatch #149 — audit trail for every override on this review, visible somewhere real
    // (owner's own bar: "just don't make the audit trail invisible/inaccessible"). Shows across
    // ALL categories, not just the currently-selected tab, since an override on a metric in
    // another category shouldn't require guessing which tab to click.
    h(OverrideHistorySection, {overrides, cfg})
  );
}

// Exported for targeted testing (dispatch #149's verification bar) — the locked-actual /
// override-affordance / resolved-value behavior is covered directly against this component
// rather than only through the full PerformanceReviewsPanel shell.
export function KPIGrid({metrics, months, rawMonths, mths, qKeys, setMonthKPI, cfg, overrides, canOverride, onAddOverride}) {
  const COL_W = 86; // widened from 78 so the full rating word (e.g. "Needs Improvement") wraps to 2 lines without clipping
  const LABEL_W = 190;
  const [overrideDraft, setOverrideDraft] = useState(null); // {month, metricKey, metric, currentValue} | null

  const qMonthMap = {};
  for (const q of qKeys) qMonthMap[q] = qMonths(q).filter(m=>mths.includes(m));

  const totalWidth = LABEL_W + mths.length * COL_W + qKeys.length * 60 + 4;

  return h(React.Fragment, null,
  div({style:{minWidth:totalWidth, userSelect:'none'}},
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
          const mo = months[mn]||{};           // RESOLVED — override value if one is active
          const rawMo = (rawMonths||months)[mn]||{}; // RAW — last value autoPopulateKPIs wrote
          const actual = mo[m.key];
          const target = mo[m.key+'Tgt'];
          const rating = rateMetric(actual, target, m);
          const bg = rating ? ratingBg(rating) : 'transparent';
          const sc = m.pctInput ? 100 : 1;
          // Dispatch #149 — src:'auto' actuals are read-only by default (locked). An authorized
          // overrider gets a pencil affordance that opens the 3-option reason form; everyone
          // else just sees the resolved (possibly overridden) value, no affordance at all.
          const isAuto = m.src === 'auto';
          const ov = isAuto ? effectiveOverrideFor(overrides, mn, m.key) : null;
          return div({key:mn,style:{width:COL_W,minWidth:COL_W,borderRight:`1px solid ${BDR}`,
            background:bg,display:'flex',flexDirection:'column',gap:2,padding:'4px 2px',alignItems:'center'}},
            isAuto
              ? div({style:{position:'relative',width:COL_W-10}},
                  h(FormattedNumInput,{key:'a',value:actual!=null?actual*sc:null,
                    onChange:()=>{}, disabled:true,
                    placeholder:m.pctInput?'Act %':m.dollar?'Act $':'Act',
                    pct:!!m.pctInput, dollar:!!m.dollar,
                    style:{width:'100%',background:bg||'var(--surf)',opacity:.85,cursor:'not-allowed'}}),
                  canOverride && btn({
                    onClick:()=>setOverrideDraft({month:mn, metricKey:m.key, metric:m,
                      currentValue: rawMo[m.key], overriddenValue: ov ? ov.value : null}),
                    title: ov ? 'Overridden — click to change' : 'Auto-sourced (locked) — click to override',
                    style:{position:'absolute',top:-2,right:-2,width:14,height:14,lineHeight:'14px',
                      padding:0,border:'none',borderRadius:'50%',background:ov?AMBER:S2,
                      color:ov?'#000':TEXT3,fontSize:8,cursor:'pointer'}},
                    '✎')
                )
              : h(FormattedNumInput,{key:'a',value:actual!=null?actual*sc:null,
                  onChange:v=>setMonthKPI(mn,m.key,v!=null?v/sc:null),
                  placeholder:m.pctInput?'Act %':m.dollar?'Act $':'Act',
                  pct:!!m.pctInput, dollar:!!m.dollar,
                  style:{width:COL_W-10,background:bg||'var(--surf)'}}),
            ov && span({title:`Overridden — ${OVERRIDE_REASON_LABEL[ov.reason]||ov.reason}${ov.note?': '+ov.note:''}`,
              style:{fontSize:7,color:AMBER,fontWeight:700}},'★ overridden'),
            h(FormattedNumInput,{key:'t',value:target!=null?target*sc:null,
              onChange:v=>setMonthKPI(mn,m.key+'Tgt',v!=null?v/sc:null),
              placeholder:m.pctInput?'Tgt %':m.dollar?'Tgt $':'Tgt',
              pct:!!m.pctInput, dollar:!!m.dollar,
              style:{width:COL_W-10,fontSize:10,color:TEXT3,background:'transparent',
                border:`1px dashed ${BDR}`}}),
            rating!=null&&span({title:RATING_LABELS[rating]||rating,style:{fontSize:8,lineHeight:1.15,
              color:ratingColor(rating),fontWeight:700,textAlign:'center',width:'100%',
              wordBreak:'break-word'}},
              RATING_LABELS[rating]||rating)
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
  ),
  overrideDraft && h(OverrideFormModal, {
    draft: overrideDraft,
    onClose: () => setOverrideDraft(null),
    onSubmit: (input) => {
      onAddOverride(overrideDraft.month, overrideDraft.metricKey, input);
      setOverrideDraft(null);
    },
  })
  );
}

// ── Override form modal (dispatch #149) ────────────────────────────────────────
// Opened by the pencil affordance on a locked (src:'auto') actual cell. Exactly the 3-option
// reason dropdown the owner specified, in his own words (plan doc decision #4): "a dropdown for
// Inaccurate Data, Incomplete Data, or Something Else (Explanation required)."
function OverrideFormModal({draft, onClose, onSubmit}) {
  const {metric, month, currentValue, overriddenValue} = draft;
  const sc = metric.pctInput ? 100 : 1;
  const fmtCurrent = v => v == null ? '—' : metric.pctInput ? (v*sc).toFixed(2)+'%' : metric.dollar ? '$'+Math.round(v).toLocaleString('en-US') : v;
  const [value, setValue] = useState(overriddenValue != null ? overriddenValue : currentValue);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  const submit = () => {
    const v = validateOverrideInput({reason, note});
    if (!v.ok) { setErr(v.error); return; }
    if (value == null || value === '' || isNaN(parseFloat(value))) { setErr('Enter a numeric value.'); return; }
    onSubmit({ value: parseFloat(value), reason, note: note.trim() });
  };

  return h(ModalShell, {
    title:`Override — ${metric.label} (${MONTH_NAMES[month-1]})`, icon:'✎', onClose, maxWidth:420,
    zIndex: Z.nested,
  },
    Col({style:{padding:'14px 18px',gap:12}},
      div({style:{fontSize:11,color:TEXT2}},
        'Auto-sourced (current) value: ', span({style:{fontWeight:700,color:TEXT}},fmtCurrent(currentValue)),
        overriddenValue!=null && div({style:{marginTop:4}},
          'Currently overridden to: ', span({style:{fontWeight:700,color:AMBER}},fmtCurrent(overriddenValue)))
      ),
      lbl({style:{display:'flex',flexDirection:'column',gap:4,fontSize:11,color:TEXT2,fontWeight:700}},
        'New value',
        inp({type:'number', value: value ?? '', onChange:e=>setValue(e.target.value),
          style:{padding:'6px 10px',background:'var(--surf)',border:`1px solid ${BDR}`,
            borderRadius:R,color:TEXT,fontSize:13}})
      ),
      lbl({style:{display:'flex',flexDirection:'column',gap:4,fontSize:11,color:TEXT2,fontWeight:700}},
        'Reason',
        sel({value:reason, onChange:e=>setReason(e.target.value),
          style:{padding:'6px 10px',background:'var(--surf)',border:`1px solid ${BDR}`,
            borderRadius:R,color:TEXT,fontSize:13,cursor:'pointer'}},
          opt({value:''},'Select a reason…'),
          ...OVERRIDE_REASONS.map(r=>opt({value:r.value,key:r.value},r.label)))
      ),
      reason==='something_else' && lbl({style:{display:'flex',flexDirection:'column',gap:4,fontSize:11,color:TEXT2,fontWeight:700}},
        'Explanation (required)',
        ta({value:note, rows:3, onChange:e=>setNote(e.target.value),
          placeholder:'Explain why this value is being overridden…',
          style:{padding:'6px 10px',background:'var(--surf)',border:`1px solid ${BDR}`,
            borderRadius:R,color:TEXT,fontSize:12,resize:'vertical',fontFamily:'var(--sans)'}})
      ),
      err && div({style:{fontSize:11,color:'#ef4444'}},err),
      Row({style:{gap:8,justifyContent:'flex-end',marginTop:4}},
        GhostBtn({onClick:onClose},'Cancel'),
        PrimaryBtn({onClick:submit},'Submit Override')
      )
    )
  );
}

// ── Override history (dispatch #149) ────────────────────────────────────────────
// A simple, always-accessible audit trail — every override record on this review, newest first.
// Owner's own bar for this dispatch: "even a simple 'Override history' expandable section is
// enough... just don't make the audit trail invisible/inaccessible."
function OverrideHistorySection({overrides, cfg}) {
  const [open, setOpen] = useState(false);
  if (!overrides || !overrides.length) return null;
  const metricLabel = key => {
    for (const mets of Object.values(cfg.metrics||{})) {
      const m = (mets||[]).find(x=>x.key===key);
      if (m) return m.label;
    }
    return key;
  };
  const sorted = [...overrides].sort((a,b)=> new Date(b.overriddenAt) - new Date(a.overriddenAt));
  return div({style:{marginTop:16,border:`1px solid ${BDR}`,borderRadius:R}},
    btn({onClick:()=>setOpen(v=>!v),
      style:{width:'100%',display:'flex',justifyContent:'space-between',alignItems:'center',
        padding:'8px 12px',background:S2,border:'none',borderRadius:R,color:TEXT2,
        fontSize:11,fontWeight:700,cursor:'pointer'}},
      span(null, `Override History (${overrides.length})`),
      span(null, open?'▲':'▼')),
    open && div({style:{padding:'8px 12px',display:'flex',flexDirection:'column',gap:8}},
      ...sorted.map(o =>
        div({key:o.id,style:{padding:'6px 8px',background:'var(--surf)',borderRadius:4,
          border:`1px solid ${BDR}`,fontSize:11,color:TEXT2}},
          div({style:{fontWeight:700,color:TEXT}},
            `${metricLabel(o.metricKey)} — ${MONTH_NAMES[(o.month||1)-1]}`),
          div(null, `New value: `, span({style:{fontWeight:700}},String(o.value)),
            o.previousValue!=null && span(null, ` (was ${o.previousValue})`)),
          div(null, `Reason: ${OVERRIDE_REASON_LABEL[o.reason]||o.reason}`, o.note ? ` — ${o.note}` : ''),
          div({style:{fontSize:10,color:TEXT3}},
            // overriddenByRole is a permissions.js ladder id (e.g. 'om'), NOT a ROLE_KEYS value
            // (e.g. 'OM') — a different taxonomy from the review's own role field, see
            // permissions.js's REVIEW_ROLE_TO_LADDER note.
            `${o.overriddenByRole ? (getRoleById(o.overriddenByRole, DEFAULT_ROLES)?.label || o.overriddenByRole) + ' · ' : ''}${new Date(o.overriddenAt).toLocaleString()}`)
        )
      )
    )
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
// Dispatch #157 — `activeHalf` ('h1'|'h2') comes from the editor's real period selector
// (PERIOD_TO_NARRATIVE_HALF) now, not the dead `review.half` (undefined on every #152-era
// review, which silently pinned this tab to its else-branch — always the EOY/H2 fields).
function DevPlanTab({review, setDevPlan, update, activeHalf}) {
  const plan = review.devPlan || [];
  const half = activeHalf === 'h1' ? 'H1' : 'H2';

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

// ── Monthly 1:1 Checkpoint print ──────────────────────────────────────────────
function printCheckpoint(review, cfg, month, orgLabel, orgLogo) {
  if (!month) return;
  const mo = review.kpis?.months?.[month] || {};
  const monthName = MONTH_NAMES[month-1];
  const today = new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});

  const rLabel = r => r===4?'Exceeds':r===3?'On Target':r===2?'Below':r===1?'Needs Improvement':'—';
  const rCol   = r => r===4?'#10b981':r===3?'#2563eb':r===2?'#d97706':'#dc2626';

  const fmtVal = (v, m) => {
    if (v==null) return '—';
    if (m.dollar)   return '$' + Math.round(v).toLocaleString('en-US');
    if (m.pctInput) return (v*100).toFixed(2)+'%';
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  };

  const fmtDev = (actual, target, unit) => {
    if (actual==null||target==null) return '—';
    const dev = unit==='pct' ? (actual-target)/Math.abs(target||1) : actual-target;
    const sign = dev>=0?'+':'';
    return unit==='pct' ? `${sign}${(dev*100).toFixed(2)}%` : `${sign}${dev.toFixed(1)}`;
  };

  const catSections = CAT_KEYS.map(catKey => {
    const cw = cfg.categoryWeights[catKey];
    const metrics = (cfg.metrics[catKey]||[]).filter(m=>m.scored);
    if (!metrics.length) return '';
    const rows = metrics.map(m => {
      const actual = mo[m.key];
      const target = mo[m.key+'Tgt'];
      const r = rateMetric(actual, target, m);
      const col = r ? rCol(r) : '#9ca3af';
      return `<tr>
        <td>${esc(m.label)}</td>
        <td style="text-align:center">${fmtVal(actual,m)}</td>
        <td style="text-align:center;color:#6b7280">${fmtVal(target,m)}</td>
        <td style="text-align:center">${fmtDev(actual,target,m.unit)}</td>
        <td style="text-align:center;font-weight:700;color:${col}">${r?rLabel(r):'—'}</td>
      </tr>`;
    }).join('');
    return `
      <h3>${esc(cw?.label||catKey)}</h3>
      <table>
        <tr><th>Metric</th><th style="text-align:center">Actual</th><th style="text-align:center">Target</th><th style="text-align:center">vs. Target</th><th style="text-align:center">Rating</th></tr>
        ${rows}
      </table>`;
  }).join('');

  const lines = n => Array(n).fill('<div class="line"></div>').join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>${esc(review.name)} — ${monthName} ${review.year} 1:1 Checkpoint</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:20px;max-width:800px;margin:0 auto}
    h1{font-size:16px;font-weight:700;margin-bottom:2px}
    h2{font-size:13px;font-weight:700;margin:14px 0 6px;padding-bottom:3px;border-bottom:2px solid #111}
    h3{font-size:10px;font-weight:700;margin:8px 0 4px;color:#374151;text-transform:uppercase;letter-spacing:.3px}
    table{width:100%;border-collapse:collapse;margin-bottom:6px;font-size:10px}
    th{background:#f3f4f6;padding:4px 6px;text-align:left;border:1px solid #d1d5db;font-size:9px;text-transform:uppercase;letter-spacing:.3px}
    td{padding:4px 6px;border:1px solid #e5e7eb;vertical-align:top}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;padding-bottom:10px;border-bottom:2px solid #111}
    .label{font-size:9px;font-weight:700;color:#6b7280;letter-spacing:.5px;text-transform:uppercase;margin-bottom:2px}
    .line{border-bottom:1px solid #d1d5db;height:22px;margin-bottom:2px}
    .section{margin-bottom:10px}
    .sig-block{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:16px;padding-top:12px;border-top:2px solid #111}
    .sig-line{border-top:1px solid #111;margin-top:32px;padding-top:3px;font-size:9px;color:#6b7280}
    .ack{background:#f0fdf4;border:1px solid #86efac;border-radius:4px;padding:8px 10px;margin-top:10px;font-size:10px}
    @media print{body{padding:8px}@page{margin:.5in;size:letter}}
  </style></head><body>

  <div class="hdr">
    <div>
      <div class="label">Monthly Performance Checkpoint — 1:1 Meeting</div>
      <h1>${esc(review.name)}</h1>
      <div style="font-size:11px;color:#374151;margin-top:2px">${esc(review.role)} · Store ${esc(review.loc||'—')} · ${monthName} ${review.year}</div>
      <div style="font-size:9px;color:#6b7280;margin-top:2px">Prepared: ${today}</div>
    </div>
    <div style="text-align:right">
      ${orgLogo?`<img src="${esc(orgLogo)}" style="height:28px;object-fit:contain;display:block;margin-bottom:3px">`:''}
      <span style="font-size:10px;color:#6b7280">${esc(orgLabel||'')}</span>
    </div>
  </div>

  <h2>KPI Results — ${monthName} ${review.year}</h2>
  ${catSections}

  <h2>1:1 Discussion Notes</h2>
  <div class="section">
    <div style="font-size:10px;font-weight:700;color:#374151;margin-bottom:4px">What's going well?</div>
    ${lines(3)}
  </div>
  <div class="section">
    <div style="font-size:10px;font-weight:700;color:#374151;margin-bottom:4px">What needs attention / improvement?</div>
    ${lines(3)}
  </div>
  <div class="section">
    <div style="font-size:10px;font-weight:700;color:#374151;margin-bottom:4px">Commitments &amp; action items from this conversation</div>
    ${lines(4)}
  </div>
  <div class="section">
    <div style="font-size:10px;font-weight:700;color:#374151;margin-bottom:4px">Next check-in date / follow-up</div>
    ${lines(1)}
  </div>

  <div class="ack">
    <strong>Acknowledgment of Receipt:</strong> By signing below, <em>${esc(review.name)}</em> confirms this monthly performance checkpoint was received and discussed in a 1:1 meeting with their supervisor. A copy is retained in the performance file.
  </div>

  <div class="sig-block">
    <div><div class="sig-line">${esc(review.name)} — Signature &amp; Date</div></div>
    <div><div class="sig-line">Supervisor — Signature &amp; Date</div></div>
  </div>

  </body></html>`;

  const w = window.open('','_blank','width=900,height=800');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(()=>w.print(), 400);
}

// ── Blank fillable form ────────────────────────────────────────────────────────
// Dispatch #157, Priority 1 item 5 — `period` is now an explicit PARAMETER (a PERIOD_META key:
// q1-q4/h1/h2/year), matching #152's own scope note ("the print functions... need a period-
// selector PARAMETER instead") — no longer read off the nonexistent `review.half`.
function printBlankForm(review, cfg, orgLabel, orgLogo, period='h1') {
  if (!orgLabel) orgLabel = getOrgLabel(getStoreOrg(review.loc));
  const today = new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  const halfLabel = PERIOD_META[period]?.label || period;
  const mths = PERIOD_META[period]?.months || H1_MONTHS;

  const printCatLabel = key => {
    const ex=(cfg.extraCategories||[]).find(c=>c.key===key);
    return ex?ex.label:CAT_LABELS[key]||key;
  };

  const ratingCircles = `<span class="rt">1</span><span class="rt">2</span><span class="rt">3</span><span class="rt">4</span>`;

  // KPI entry tables — one per category
  const kpiSection = CAT_KEYS.map(catKey => {
    const cw = cfg.categoryWeights[catKey];
    const metrics = cfg.metrics[catKey]||[];
    if (!metrics.length) return '';
    const rows = metrics.map(m => {
      const actHint = m.dollar ? '$__________' : m.pctInput ? '_______ %' : '___________';
      const tgtHint = m.dollar ? '$__________' : m.pctInput ? '_______ %' : '___________';
      const autoTag = m.src==='auto' ? `<span style="color:#9ca3af;font-size:8px"> ★auto</span>` : '';
      return `<tr>
        <td>${esc(m.label)}${autoTag}</td>
        <td style="text-align:center;color:#6b7280;font-size:9px">${actHint}</td>
        <td style="text-align:center;color:#6b7280;font-size:9px">${tgtHint}</td>
        <td style="text-align:center">${ratingCircles}</td>
      </tr>`;
    }).join('');
    return `
      <h3>${esc(cw?.label||catKey)} <span style="font-weight:400;font-size:9px;color:#9ca3af">${((cw?.weight||0)*100).toFixed(2)}% of KPI score</span></h3>
      <table>
        <tr>
          <th>Metric</th>
          <th style="text-align:center;width:110px">Actual</th>
          <th style="text-align:center;width:110px">Target</th>
          <th style="text-align:center;width:110px">Rating — circle one</th>
        </tr>
        ${rows}
      </table>`;
  }).join('');

  // Behavioral rating tables — one per competency category
  const extraKeys = (cfg.extraCategories||[]).map(c=>c.key);
  const allCats = [...CAT_KEYS, ...extraKeys, 'admin'];
  const behavSection = allCats.map(catKey => {
    const rawItems = cfg.competencies[review.role]?.[catKey]||[];
    const items = rawItems.map(normItem).filter(it=>it.active);
    if (!items.length) return '';
    const rows = items.map((item,i) => `
      <tr>
        <td>${i+1}. ${esc(item.text)}</td>
        <td style="text-align:center;white-space:nowrap">${ratingCircles}</td>
        <td style="width:180px"></td>
      </tr>`).join('');
    return `
      <h3>${esc(printCatLabel(catKey))}</h3>
      <table>
        <tr><th>Competency</th><th style="text-align:center;width:120px">Rating — circle one</th><th>Notes</th></tr>
        ${rows}
      </table>`;
  }).join('');

  const lines = n => Array(n).fill('<div class="line"></div>').join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>${esc(review.name)} — ${halfLabel} ${review.year} — Blank Entry Form</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:20px;max-width:800px;margin:0 auto}
    h1{font-size:16px;font-weight:700;margin-bottom:2px}
    h2{font-size:13px;font-weight:700;margin:14px 0 6px;padding-bottom:3px;border-bottom:2px solid #111}
    h3{font-size:10px;font-weight:700;margin:8px 0 4px;color:#374151;text-transform:uppercase;letter-spacing:.3px}
    table{width:100%;border-collapse:collapse;margin-bottom:6px;font-size:10px}
    th{background:#f3f4f6;padding:4px 6px;text-align:left;border:1px solid #d1d5db;font-size:9px;text-transform:uppercase;letter-spacing:.3px}
    td{padding:5px 6px;border:1px solid #e5e7eb;vertical-align:middle}
    tr:nth-child(even) td{background:#fafafa}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;padding-bottom:10px;border-bottom:2px solid #111}
    .label{font-size:9px;font-weight:700;color:#6b7280;letter-spacing:.5px;text-transform:uppercase;margin-bottom:2px}
    .line{border-bottom:1px solid #d1d5db;height:22px;margin-bottom:2px}
    .rt{display:inline-block;width:18px;height:18px;border-radius:50%;border:1.5px solid #374151;text-align:center;line-height:16px;font-size:9px;font-weight:700;margin:0 2px}
    .rubric{background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:8px 10px;margin:8px 0 12px;font-size:9px}
    .rubric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:5px}
    .rubric-item{border:1px solid #e5e7eb;border-radius:3px;padding:4px 6px}
    .sig-block{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:14px;padding-top:10px;border-top:2px solid #111}
    .sig-line{border-top:1px solid #111;margin-top:30px;padding-top:3px;font-size:9px;color:#6b7280}
    @media print{body{padding:8px}@page{margin:.5in;size:letter}}
  </style></head><body>

  <div class="hdr">
    <div>
      <div class="label">Performance Review — Manual Entry Form</div>
      <h1>${esc(review.name)}</h1>
      <div style="font-size:11px;color:#374151;margin-top:2px">${esc(review.role)} · Store ${esc(review.loc||'—')} · ${halfLabel} ${review.year}</div>
      <div style="font-size:9px;color:#6b7280;margin-top:2px">Printed: ${today} · Enter completed data into Meridian</div>
    </div>
    <div style="text-align:right">
      ${orgLogo?`<img src="${esc(orgLogo)}" style="height:28px;object-fit:contain;display:block;margin-bottom:3px">`:''}
      <span style="font-size:10px;color:#6b7280">${esc(orgLabel||'')}</span>
    </div>
  </div>

  <div style="margin-bottom:10px;font-size:10px">
    <strong>Month being entered:</strong>&nbsp;
    ${mths.map(mn=>`<label style="margin-right:10px"><span class="rt" style="font-size:8px">&nbsp;</span> ${MONTH_NAMES[mn-1]}</label>`).join('')}
  </div>

  <div class="rubric">
    <strong>Rating Scale</strong>
    <div class="rubric-grid">
      <div class="rubric-item"><strong>① Needs Improvement</strong><br>Significantly below expectations. Active corrective action required.</div>
      <div class="rubric-item"><strong>② Below</strong><br>Partially meets expectations. Improvement plan in place.</div>
      <div class="rubric-item"><strong>③ On Target</strong><br>Meets expectations. Reliable and consistent performance.</div>
      <div class="rubric-item"><strong>④ Exceeds</strong><br>Consistently above expectations. Coaches others independently.</div>
    </div>
    <div style="margin-top:5px;color:#6b7280">★auto = field auto-populates from system data (labor analysis, FOB report, SMG FullScale). Still circle a rating.</div>
  </div>

  <h2>Section 1 — KPI Results</h2>
  ${kpiSection}

  <h2>Section 2 — Behavioral Ratings</h2>
  ${behavSection}

  <h2>Section 3 — Development Plan</h2>
  <table>
    <tr><th>Focus Area</th><th>Action / Development Plan</th><th style="width:90px;text-align:center">Target Date</th><th style="width:80px;text-align:center">Status</th></tr>
    ${Array(3).fill('<tr><td style="height:30px">&nbsp;</td><td></td><td></td><td></td></tr>').join('')}
  </table>

  <h2>Section 4 — Discussion Notes</h2>
  <div style="margin-bottom:8px">
    <div style="font-size:10px;font-weight:700;margin-bottom:3px">What's going well?</div>${lines(2)}
  </div>
  <div style="margin-bottom:8px">
    <div style="font-size:10px;font-weight:700;margin-bottom:3px">What needs attention?</div>${lines(2)}
  </div>
  <div style="margin-bottom:8px">
    <div style="font-size:10px;font-weight:700;margin-bottom:3px">Commitments &amp; action items</div>${lines(2)}
  </div>

  <div class="sig-block">
    <div><div class="sig-line">${esc(review.name)} — Signature &amp; Date</div></div>
    <div><div class="sig-line">Supervisor — Signature &amp; Date</div></div>
  </div>

  </body></html>`;

  const w = window.open('','_blank','width=900,height=800');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(()=>w.print(), 400);
}

// ── Print / PDF export ─────────────────────────────────────────────────────────
// Dispatch #157, Priority 1 item 5 — `period` is now an explicit PARAMETER (any PERIOD_META key)
// instead of the dead `review.half`. `scores[period]` resolves directly against computeScores'
// real {q1,q2,q3,q4,h1,h2,year} shape — for `period==='year'` this naturally prints all four
// quarters (qKeys) plus a true year-total row, not a half.
function printReview(review, cfg, orgLabel, orgLogo, period='year') {
  if (!orgLabel) orgLabel = getOrgLabel(getStoreOrg(review.loc));
  const scores = computeScores(review, cfg);
  const qKeys  = PERIOD_META[period]?.qKeys || ['q1','q2','q3','q4'];
  const mths   = PERIOD_META[period]?.months || [...H1_MONTHS,...H2_MONTHS];
  const halfLabel = PERIOD_META[period]?.label || period;
  const today  = new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  // Annual wage decisions print alongside any period that reaches H2/end-of-year (h2, q3, q4,
  // year) — matches the original H2-only gate, generalized to the new period set.
  const showWage = ['h2','q3','q4','year'].includes(period);
  // Mid-year / EOY narrative sections only print if the selected period actually touches that
  // half — printing a Q1-only export shouldn't surface EOY commentary that hasn't happened yet.
  const showMidYear = ['q1','q2','h1','year'].includes(period);
  const showEoy     = ['q3','q4','h2','year'].includes(period);

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
      <td>${esc(item.area||'—')}</td>
      <td>${esc(item.action||'—')}</td>
      <td style="text-align:center">${esc(item.targetDate||'—')}</td>
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
      return `<tr><td>${i+1}. ${esc(item.text)}</td>${qRatings}</tr>`;
    }).join('');
  };

  const printCatLabel = (key) => {
    const ex=(cfg.extraCategories||[]).find(c=>c.key===key);
    return ex?ex.label:CAT_LABELS[key]||key;
  };

  const wageSection = showWage?`
    <h2>Wage Review</h2>
    <table><tr>
      <th>Current Rate</th><th>Recommended Increase</th><th>Approved Rate</th><th>Effective Date</th>
    </tr><tr>
      <td>$${review.wage?.current||'—'}</td>
      <td>$${review.wage?.recommended||'—'}</td>
      <td>$${review.wage?.approved||'—'}</td>
      <td>${esc(review.wage?.effectiveDate||'—')}</td>
    </tr></table>
    ${review.wage?.notes?`<p><strong>Notes:</strong> ${esc(review.wage.notes)}</p>`:''}`:''

  const extraKeys = (cfg.extraCategories||[]).map(c=>c.key);
  const allCatSections = [...Object.keys(cfg.categoryWeights), ...extraKeys, 'admin'].map(cat=>`
    <h3>${esc(printCatLabel(cat))}</h3>
    <table>
      <tr><th>Competency</th>${qKeys.map(q=>`<th style="text-align:center">${qLabel(q)}</th>`).join('')}</tr>
      ${compRows(cat)}
    </table>
    ${qKeys.map(q=>{
      const c=review.comments?.[q]?.[cat];
      return c?`<p><em>${qLabel(q)} Comments:</em> ${esc(c)}</p>`:'';
    }).join('')}
  `).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>${esc(review.name)} — ${halfLabel} ${review.year} Performance Review</title>
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
      ${orgLogo?`<img src="${esc(orgLogo)}" alt="${esc(orgLabel)}" style="height:52px;object-fit:contain;flex-shrink:0">`:''}
      <div>
        <div style="font-size:10px;font-weight:700;letter-spacing:.5px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">${esc(orgLabel)} · Salaried Management Performance Review</div>
        <h1>${esc(review.name)}</h1>
        <div class="meta">${esc(ROLE_LABELS[review.role]||review.role)} · ${review.loc?`Store ${esc(review.loc)}`:'All Stores'} · ${halfLabel} ${review.year}</div>
      </div>
    </div>
    <div style="text-align:right;font-size:10px;color:#6b7280">
      <div>Review Date: ${today}</div>
      <div>Status: H1 ${esc((review.periods?.h1?.status||'draft').toUpperCase())} · H2 ${esc((review.periods?.h2?.status||'draft').toUpperCase())}</div>
    </div>
  </div>

  <h2>Overall Scores</h2>
  <table>
    <tr><th>Period</th><th style="text-align:center">Metrics (70%)</th><th style="text-align:center">Behavioral (30%)</th><th style="text-align:center">Overall</th><th style="text-align:center">Rating</th></tr>
    ${qKeys.map(q=>scoreRow(qLabel(q),scores[q])).join('')}
    ${scoreRow(halfLabel+' Total',scores[period])}
  </table>
  <p style="font-size:10px;color:#6b7280;margin-bottom:16px">Rating Scale: 4 = Exceeds · 3 = On Target · 2 = Below · 1 = Needs Improvement</p>

  <h2>KPI Results Summary</h2>
  ${Object.entries(cfg.categoryWeights).map(([cat,cw])=>{
    const metrics = (cfg.metrics[cat]||[]).filter(m=>m.scored);
    if(!metrics.length) return '';
    return `<h3>${esc(cw.label||cat)} (${(cw.weight*100).toFixed(2)}% category weight)</h3>
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
        return `<tr><td>${esc(m.label)}</td>${qRatings}</tr>`;
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

  ${showMidYear&&review.comments?.midYear?.summary?`<h3>Mid-Year Summary</h3><div class="narrative">${esc(review.comments.midYear.summary)}</div>`:''}
  ${showMidYear&&review.comments?.midYear?.devPlan?`<h3>Mid-Year Development Plan</h3><div class="narrative">${esc(review.comments.midYear.devPlan)}</div>`:''}
  ${showEoy&&review.comments?.eoy?.summary?`<h3>End of Year Summary</h3><div class="narrative">${esc(review.comments.eoy.summary)}</div>`:''}
  ${showEoy&&review.comments?.eoy?.achievements?`<h3>Achievements</h3><div class="narrative">${esc(review.comments.eoy.achievements)}</div>`:''}
  ${showEoy&&review.comments?.eoy?.nextYear?`<h3>Focus for Next Year</h3><div class="narrative">${esc(review.comments.eoy.nextYear)}</div>`:''}

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
// Dispatch #157 — `period` selects which of computeScoreBreakdown's real {q1,q2,q3,q4,h1,h2,year}
// keys to render. Confirmed broken before this fix, beyond the six numbered dispatch findings:
// this panel called `computeScoreBreakdown(review,cfg)` and read `bd.categories`/`bd.metricsScore`
// etc. directly off the return value — but #152 changed that return shape to
// {q1,...,h1,h2,year}, each holding its OWN {categories,metricsScore,...}. `bd.categories` was
// therefore always `undefined`, `hasData` always false, and this whole "Score Breakdown"
// transparent-math panel silently rendered NOTHING for every #152-era review — same family of
// bug as the six enumerated findings (a stale key read off the new per-period shape), just not
// separately numbered there because it sits one level deeper (SummaryTab's own child).
function ScoreBreakdownPanel({review, cfg, period}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(new Set());
  const bd = useMemo(() => computeScoreBreakdown(review, cfg)[period], [review, cfg, period]);

  const toggleMetric = (key) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const fmtDev = (dev, unit) => {
    if (dev == null) return '—';
    const sign = dev >= 0 ? '+' : '';
    return unit === 'pct'
      ? `${sign}${(dev * 100).toFixed(2)}%`
      : `${sign}${dev.toFixed(1)}`;
  };

  const fmtVal = (v) => {
    if (v == null) return '—';
    if (Math.abs(v) >= 10000) return v.toLocaleString('en-US', {maximumFractionDigits:0});
    if (Math.abs(v) >= 100)   return v.toFixed(0);
    if (Math.abs(v) >= 1)     return v.toFixed(1);
    return (v * 100).toFixed(2) + '%';
  };

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
        `Overall Score  =  (Metrics × ${(bd.mw*100).toFixed(2)}%)  +  (Behavioral × ${(bd.bw*100).toFixed(2)}%)`
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
            span({style:{fontSize:10,color:TEXT3}}, `${(cat.categoryWeight*100).toFixed(2)}% of Metrics`)
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
            ...cat.metrics.map((m, i) => {
              const mKey = `${cat.key}-${m.key}`;
              const isOpen = expanded.has(mKey);
              return div({key:m.key, style:{
                borderBottom: i < cat.metrics.length - 1 ? `1px solid ${BDR}33` : 'none',
                background: i%2===0 ? 'transparent' : 'rgba(255,255,255,.02)',
              }},
                // Summary row (clickable)
                div({
                  onClick: () => toggleMetric(mKey),
                  style:{
                    display:'grid', gridTemplateColumns:'1fr 58px 52px 68px',
                    padding:'6px 10px', alignItems:'center', fontSize:11,
                    cursor:'pointer',
                  },
                },
                  div(null,
                    div({style:{color:TEXT2,display:'flex',alignItems:'center',gap:4}},
                      span({style:{fontSize:9,color:TEXT3,fontFamily:'var(--mono)'}}, isOpen ? '▼' : '▶'),
                      m.label
                    ),
                    m.ratedCount > 0 && m.ratedCount < m.totalMonths &&
                      span({style:{fontSize:9,color:TEXT3,marginLeft:13}},
                        `${m.ratedCount}/${m.totalMonths} months rated`)
                  ),
                  div({style:{textAlign:'center'}},
                    m.avgRating != null
                      ? span({style:{fontWeight:700,fontSize:12,...mono,color:ratingColor(Math.round(m.avgRating))}},
                          m.avgRating.toFixed(2))
                      : span({style:{color:TEXT3}}, '—')
                  ),
                  div({style:{textAlign:'center',color:TEXT3,fontSize:10}},
                    `${(m.weight*100).toFixed(2)}%`),
                  div({style:{textAlign:'right',color:TEXT2,...mono,fontSize:11}},
                    m.contribution != null ? m.contribution.toFixed(3) : '—')
                ),

                // Monthly detail (expanded)
                isOpen && div({style:{
                  margin:'0 10px 8px 22px',
                  border:`1px solid ${BDR}`,
                  borderRadius:R, overflow:'hidden', fontSize:10,
                }},
                  // Monthly header
                  div({style:{
                    display:'grid', gridTemplateColumns:'44px 1fr 1fr 60px 80px',
                    padding:'4px 8px', background:'rgba(255,255,255,.05)',
                    borderBottom:`1px solid ${BDR}`,
                    color:TEXT3, fontWeight:700, fontSize:9,
                  }},
                    span(null,'Month'),
                    span({style:{textAlign:'right'}},'Actual'),
                    span({style:{textAlign:'right'}},'Target'),
                    span({style:{textAlign:'right'}},'Deviation'),
                    span({style:{textAlign:'center'}},'Rating')
                  ),
                  // One row per month
                  ...m.monthlyData.map((d, mi) =>
                    div({key:mi, style:{
                      display:'grid', gridTemplateColumns:'44px 1fr 1fr 60px 80px',
                      padding:'4px 8px',
                      background: mi%2===0?'transparent':'rgba(255,255,255,.02)',
                      borderBottom: mi < m.monthlyData.length-1 ? `1px solid ${BDR}22` : 'none',
                      alignItems:'center',
                    }},
                      span({style:{color:TEXT3,...mono}}, MONTH_NAMES[(d.month||mi+1)-1]),
                      span({style:{textAlign:'right',color:TEXT2,...mono}}, fmtVal(d.actual)),
                      span({style:{textAlign:'right',color:TEXT3,...mono}}, fmtVal(d.target)),
                      span({style:{
                        textAlign:'right',...mono,
                        color: d.dev==null?TEXT3 : d.rating===4?'#16a34a':d.rating===3?'#22c55e':d.rating===2?'var(--crit)':'#dc2626',
                      }}, fmtDev(d.dev, m.unit)),
                      span({style:{textAlign:'center'}},
                        d.rating != null
                          ? span({style:{
                              fontWeight:700, color:ratingColor(d.rating),
                              background:ratingBg(d.rating),
                              padding:'1px 6px', borderRadius:4,...mono,
                            }}, `${d.rating} · ${RATING_LABELS[d.rating]}`)
                          : span({style:{color:TEXT3}}, '— no data')
                      )
                    )
                  ),
                  // Monthly avg footer
                  m.avgRating != null && div({style:{
                    display:'grid', gridTemplateColumns:'44px 1fr 1fr 60px 80px',
                    padding:'4px 8px', borderTop:`1px solid ${BDR}`,
                    background:'rgba(255,255,255,.05)', fontWeight:700, fontSize:9,
                  }},
                    span({style:{color:TEXT3,gridColumn:'1/4'}},'6-month avg'),
                    span({style:{textAlign:'right',...mono,gridColumn:'4/5'}}),
                    span({style:{textAlign:'center',gridColumn:'5/6'}},
                      span({style:{color:ratingColor(Math.round(m.avgRating)),...mono}},
                        `avg ${m.avgRating.toFixed(2)}`))
                  )
                ),

                // "What would change this" hint
                m.nextRating != null && m.gapToNext != null &&
                  div({style:{padding:'1px 10px 5px 22px',fontSize:9,color:'#f59e0b'}},
                    `↑ needs +${m.gapToNext.toFixed(2)} avg pts for ${RATING_LABELS[m.nextRating]} · `,
                    `adds +${(m.gapToNext * m.impactPerPoint).toFixed(3)} to overall`
                  )
              );
            }),

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
                `×${(cat.categoryWeight*100).toFixed(2)}%`),
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
          span(null, `Metrics Score × ${(bd.mw*100).toFixed(2)}%`),
          span(null,
            bd.metricsScore != null
              ? `${bd.metricsScore.toFixed(3)} × ${(bd.mw*100).toFixed(2)}% = ${(bd.metricsScore*bd.mw).toFixed(3)}`
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
          span(null, `Behavioral Score × ${(bd.bw*100).toFixed(2)}%`),
          span(null,
            bd.behavioralScore != null
              ? `${bd.behavioralScore.toFixed(3)} × ${(bd.bw*100).toFixed(2)}% = ${(bd.behavioralScore*bd.bw).toFixed(3)}`
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

// Dispatch #157, Priority 2 — surfaces dispatch #154's segmented-scoring engine
// (computeSegmentedReview), which shipped Phase 5a with NO UI. Renders nothing at all when
// `hasTransitions` is false (the common case — most reviews have no promotion/transfer this
// period): the flat SummaryTab above it is the complete story and this section must not add so
// much as an empty wrapper div, verified by a render test (dispatch #157 scope item 7).
function SegmentedReviewSection({review, cfg, ds, assignmentRows, period, update}) {
  const periodMonths = PERIOD_META[period]?.months || [];
  const periodStart = periodMonths.length ? calendarMonthRange(review.year, periodMonths[0]).s : null;
  const periodEnd   = periodMonths.length ? calendarMonthRange(review.year, periodMonths[periodMonths.length-1]).e : null;

  const result = useMemo(() => {
    if (!periodStart || !periodEnd) return null;
    return computeSegmentedReview(review, cfg, ds, assignmentRows || [], { periodStart, periodEnd });
  }, [review, cfg, ds, assignmentRows, periodStart, periodEnd]);

  if (!result || !result.hasTransitions) return null;

  // comments.segmentRollup is a new sub-object under the review's EXISTING `comments` free-text
  // structure (matching comments.q1..q4/midYear/eoy's own pattern per this dispatch's scope note
  // — "matching the existing comments.* free-text pattern") — no engine/blankReview change
  // needed: ReviewEditor's generic `update(path, val)` creates missing nested objects along the
  // path automatically, so this persists via the existing onSave -> upsertReview round trip with
  // zero new storage plumbing.
  const commentary = review.comments?.segmentRollup?.[period] || '';
  const roleLabel = r => ROLE_LABELS[r] || r || '—';
  const fmtRange = (s, e) => {
    const sd = s ? new Date(s + 'T00:00:00Z') : null;
    const ed = e ? new Date(e + 'T00:00:00Z') : null;
    const mn = d => d ? MONTH_NAMES[d.getUTCMonth()] : '?';
    return (sd && ed) ? `${mn(sd)}–${mn(ed)} ${sd.getUTCFullYear()}` : '—';
  };

  return div({style:{marginTop:16,padding:'14px 16px',background:S2,borderRadius:R,
    border:`1px solid ${AMBER}44`}},
    div({style:{fontSize:11,fontWeight:700,color:AMBER,letterSpacing:'.4px',marginBottom:6}},
      '⚠ ROLE / STORE CHANGE DETECTED THIS PERIOD'),
    div({style:{fontSize:11,color:TEXT3,marginBottom:12}},
      `This person's role and/or store assignment changed during ${PERIOD_META[period]?.label||period} ${review.year}. Each segment below is scored against its OWN role's competency framework and OWN store's targets — not blended.`),
    div({style:{display:'flex',flexDirection:'column',gap:8,marginBottom:12}},
      ...result.segments.map((seg,i) =>
        div({key:i,style:{padding:'10px 12px',background:'var(--surf)',borderRadius:R,border:`1px solid ${BDR}`}},
          div({style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6,flexWrap:'wrap',gap:8}},
            span({style:{fontWeight:700,fontSize:12,color:TEXT}},
              `${fmtRange(seg.start,seg.end)}: ${roleLabel(seg.role)} @ Store ${seg.loc||'—'}`),
            ScorePill({score:seg.overall})
          ),
          Row({style:{gap:16,flexWrap:'wrap'}},
            div(null, span({style:{fontSize:9,color:TEXT3,marginRight:4}},'Metrics (70%)'), ScorePill({score:seg.metrics})),
            div(null, span({style:{fontSize:9,color:TEXT3,marginRight:4}},'Behavioral (30%)'), ScorePill({score:seg.behavioral})),
          ),
          // Dispatch #154's own documented, NOT-fixed-here limitation (autoPopulateKPIs is not
          // segment-aware — targets are correctly re-resolved per segment, actuals are not).
          // Surfaced as a caption per this dispatch's own "note it visibly if cheap" scope note.
          div({style:{fontSize:9,color:TEXT3,marginTop:6,fontStyle:'italic'}},
            'Targets are re-resolved for this segment’s own store; actuals reflect the review’s current auto-populated data (not yet re-sourced per transferred segment — known limitation, dispatch #154).')
        )
      )
    ),
    // Provisional rollup — surfaces the engine's own `note` text verbatim (per dispatch scope:
    // "starting point, not final number") rather than presenting the number as authoritative.
    div({style:{padding:'10px 12px',background:'var(--surf)',borderRadius:R,border:`1px dashed ${AMBER}88`,marginBottom:12}},
      Row({style:{gap:10,alignItems:'center',marginBottom:4}},
        span({style:{fontSize:11,fontWeight:700,color:TEXT}},'Provisional Rollup:'),
        ScorePill({score:result.rollup.value,size:'lg'})
      ),
      div({style:{fontSize:10,color:TEXT3,fontStyle:'italic'}}, result.rollup.note)
    ),
    // Reviewer commentary — free text, not a second computed-override mechanism (per scope: "a
    // human judgment call recorded as text alongside the provisional number").
    div(null,
      div({style:{fontSize:10,fontWeight:700,color:TEXT3,marginBottom:4}},
        'REVIEWER COMMENTARY — YOUR ADJUSTED JUDGMENT ON THIS ROLLUP'),
      ta({rows:3,value:commentary,
        placeholder:'The provisional number above is a starting point, not a final rating — record your own judgment on how this period should actually be scored...',
        onChange:e=>update(`comments.segmentRollup.${period}`,e.target.value),
        style:{width:'100%',padding:'6px 8px',background:'var(--surf)',border:`1px solid ${BDR}`,
          borderRadius:R,color:TEXT,fontSize:12,resize:'vertical',fontFamily:'var(--sans)',boxSizing:'border-box'}})
    )
  );
}

function overallLabel(s) {
  if (s==null) return '';
  return s>=3.5?'Exceeds Expectations':s>=2.5?'Meets Expectations':s>=1.5?'Below Expectations':'Needs Improvement';
}

// Dispatch #157 — `period` (a PERIOD_META key) replaces the dead `review.half`; `scores[period]`
// resolves against computeScores' real {q1,q2,q3,q4,h1,h2,year} shape instead of the nonexistent
// `scores.half` (always undefined on a #152-era review — dispatch finding #2). `ds`/
// `assignmentRows` feed the new segmented-review section (Priority 2).
function SummaryTab({review, cfg, scores, qKeys, mths, update, period, ds, assignmentRows}) {
  const halfLabel = PERIOD_META[period]?.label || period;
  const halfScore = scores[period]?.overall;
  const halfPct   = halfScore!=null ? +((halfScore/4)*100).toFixed(2) : null;
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
      }}, halfPct!=null ? `${halfPct.toFixed(2)}%` : '—'),
      div({style:{flex:1}},
        div({style:{fontSize:14,fontWeight:700,color:TEXT,marginBottom:2}},
          `${halfLabel} Overall Score`),
        div({style:{fontSize:13,color:heroCol,fontWeight:600,marginBottom:8}},
          halfScore!=null ? overallLabel(halfScore) : 'No data yet'),
        div({style:{display:'flex',alignItems:'center',gap:12,fontSize:11,color:TEXT3}},
          span(null, `Results Achieved (70%): `),
          span({style:{fontWeight:700,color:scores[period]?.metrics!=null?ratingColor(Math.round(scores[period].metrics)):'var(--txt3)'}},
            scores[period]?.metrics!=null ? `${((scores[period].metrics/4)*100).toFixed(2)}%` : '—'),
          span(null, ' · '),
          span(null, `Behavioral (30%): `),
          span({style:{fontWeight:700,color:scores[period]?.behavioral!=null?ratingColor(Math.round(scores[period].behavioral)):'var(--txt3)'}},
            scores[period]?.behavioral!=null ? `${((scores[period].behavioral/4)*100).toFixed(2)}%` : '—'),
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
        div({key:cat+'-l',style:{color:TEXT2}},`${cw.label||cat} (${(cw.weight*100).toFixed(2)}%)`),
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
    h(ScoreBreakdownPanel, {review, cfg, period}),
    // Dispatch #157, Priority 2 — segmented review display (dispatch #154's engine, no UI until
    // now). Renders NOTHING when hasTransitions is false (the common case, verified by test) —
    // the flat baseline above is unchanged either way.
    h(SegmentedReviewSection, {review, cfg, ds, assignmentRows, period, update}),
    // Wage section (reaches H2/end-of-year)
    ['h2','q3','q4','year'].includes(period)&&div({style:{marginTop:20,padding:'14px 16px',background:S2,borderRadius:R,
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
          : h(FormattedNumInput,{value:review.wage?.[field], onChange:v=>update(`wage.${field}`,v),
              dollar:true, style:{width:100}})
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
function StatusBadge({status}) {
  const cfg = REVIEW_STATUSES[status] || REVIEW_STATUSES.draft;
  return span({style:{
    fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:10,
    background:cfg.color+'22',border:`1px solid ${cfg.color}55`,
    color:cfg.color,whiteSpace:'nowrap',
  }}, cfg.label);
}

// Dispatch #157 — ReviewList's Status column, showing BOTH halves' real per-half state (e.g.
// "H1: Approved · H2: Draft") instead of the dead single `r.status` (nonexistent on a #152-era
// review — dispatch finding #4).
function HalfStatusSummary({review}) {
  const h1 = review?.periods?.h1?.status || 'draft';
  const h2 = review?.periods?.h2?.status || 'draft';
  return Row({style:{gap:8,flexWrap:'wrap'}},
    Row({style:{gap:4}}, span({style:{fontSize:9,fontWeight:700,color:TEXT3}},'H1'), h(StatusBadge,{status:h1})),
    Row({style:{gap:4}}, span({style:{fontSize:9,fontWeight:700,color:TEXT3}},'H2'), h(StatusBadge,{status:h2})),
  );
}

// Dispatch #157, Priority 1 item 3 — fixes the confirmed dead Period/Score/Half-filter columns
// (finding #4). A review is a full YEAR record now (dispatch #152), so:
//   - "Half filter" is DROPPED — there is no longer a record-level half to filter records BY (a
//     review record inherently spans both halves now); a Status filter over the coarse
//     "furthest-along of h1/h2" summary (reviewSummaryStatus, already shipped by #152 for exactly
//     this "informational coarse filtering" purpose) replaces it.
//   - "Period" column becomes "Year" — a review's only remaining period-scoped identity at the
//     row level is which year it's for (r.year), never r.half (permanently undefined).
//   - "Score" column shows the YEAR overall (computeScores(r,cfg).year.overall) — the review's
//     one full-year headline number.
//   - "Status" column shows BOTH halves' real state side by side (HalfStatusSummary, below) —
//     per the dispatch's own explicit requirement ("must reflect BOTH halves' real state, not one
//     fabricated top-level value").
function ReviewList({reviews, cfg, stores, shiftManagerRows, onOpen, onNew, onDelete}) {
  const [filterRole, setFilterRole]     = useState('all');
  const [filterYear, setFilterYear]     = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showNew, setShowNew]           = useState(false);

  const loadDemos = () => {
    fetch('/populate-demo-reviews.js')
      .then(r => r.text())
      .then(code => { eval(code); onNew(); })
      .catch(e => alert('Could not load demo reviews: ' + e.message));
  };

  const list = Object.values(reviews);
  const years = [...new Set(list.map(r=>r.year))].sort((a,b)=>b-a);

  const filtered = list.filter(r =>
    (filterRole==='all'||r.role===filterRole) &&
    (filterYear==='all'||r.year===parseInt(filterYear)) &&
    (filterStatus==='all'||reviewSummaryStatus(r)===filterStatus)
  ).sort((a,b)=>b.updatedAt?.localeCompare(a.updatedAt)||0);

  const getScore = (r) => computeScores(r, cfg).year?.overall ?? null;

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
      // Status filter — reviewSummaryStatus(r) is the engine's own "furthest along of h1/h2"
      // informational summary (review-engine.js), the documented use for coarse filtering.
      sel({value:filterStatus,onChange:e=>setFilterStatus(e.target.value),
        style:{padding:'4px 8px',background:'var(--surf)',border:`1px solid ${BDR}`,
          borderRadius:R,color:TEXT,fontSize:12}},
        opt({value:'all'},'All Statuses'),
        ...Object.entries(REVIEW_STATUSES).map(([k,v])=>opt({value:k,key:k},v.label))
      ),
      div({style:{flex:1}}),
      GhostBtn({onClick:loadDemos,style:{fontSize:11,opacity:.75}},'📚 Demo Reviews'),
      PrimaryBtn({onClick:()=>setShowNew(true)},'+ New Review')
    ),
    // New review form
    showNew&&h(NewReviewForm,{stores,cfg,shiftManagerRows,onCancel:()=>setShowNew(false),
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
            div({style:{display:'grid',gridTemplateColumns:'200px 120px 120px 70px 90px 200px 80px',
              gap:0,padding:'8px 16px',background:S2,borderBottom:`1px solid ${BDR}`,
              fontSize:10,fontWeight:700,color:TEXT3,textTransform:'uppercase',letterSpacing:'.4px'}},...[
              'Name','Role','Store','Year','Score','Status',''].map((h,i)=>span({key:i},h))
            ),
            ...filtered.map(r => {
              const score = getScore(r);
              return div({key:r.id,
                style:{display:'grid',gridTemplateColumns:'200px 120px 120px 70px 90px 200px 80px',
                  gap:0,padding:'10px 16px',borderBottom:`1px solid ${BDR}`,alignItems:'center',
                  cursor:'pointer',transition:'background .1s'},
                onClick:()=>onOpen(r),
                onMouseEnter:e=>e.currentTarget.style.background=S2,
                onMouseLeave:e=>e.currentTarget.style.background='transparent'},
                span({style:{fontWeight:600,color:TEXT,fontSize:12}},r.name),
                span({style:{fontSize:11,color:TEXT2}},ROLE_LABELS[r.role]||r.role),
                span({style:{fontSize:11,color:TEXT2}},r.loc||'—'),
                span({style:{fontSize:11,color:TEXT3}},String(r.year)),
                div(null,ScorePill({score})),
                h(HalfStatusSummary,{review:r}),
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

// Dispatch #157, Priority 1 item 4 — the dead Period (H1/H2) dropdown is REMOVED, not wired up.
// Per #152's own scope note ("a review is now just person+role+loc+year, no half selection at
// creation") and the plan doc's decision #1: a review record is created once per person-year now
// — there is no per-half choice to make at creation time, so the honest fix is deleting the
// control (and its dead `half`/`setHalf` state) rather than pointing it at something that no
// longer applies.
function NewReviewForm({stores, cfg, shiftManagerRows, onCancel, onCreate}) {
  const [name, setName]   = useState('');
  const [role, setRole]   = useState('GM');
  const [loc,  setLoc]    = useState(stores?.[0]?.loc||'');
  const [year, setYear]   = useState(new Date().getFullYear());
  const [geid, setGeid]   = useState('');   // manager attribution (Notes 33 A#3)

  // Managers with attributed shift data at this store — pick one to attribute a
  // DM/shift review to their own shifts. GMs are always store-total (no picker).
  // Padding-agnostic loc key — ds.storeIds (form loc) and shift_manager_monthly.loc can
  // carry different zero-padding; strip leading zeros on BOTH sides so they match.
  const normLoc = v => String(v == null ? '' : v).replace(/^0+/, '') || String(v == null ? '' : v);
  const managers = useMemo(() => {
    const want = normLoc(loc);
    const m = {};
    for (const r of (shiftManagerRows || [])) {
      if (normLoc(r.loc) !== want || !r.geid) continue;
      if (!m[r.geid] || (r.name && !m[r.geid].name)) m[r.geid] = { geid: r.geid, name: r.name || String(r.geid) };
    }
    return Object.values(m).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [shiftManagerRows, loc]);
  const totalShiftRows = (shiftManagerRows || []).length;
  // Self-diagnosing empty-state: distinguish "no shift-manager data loaded at all"
  // (pull/load/RLS issue) from "loaded, but none matched this store" (loc/attribution).
  const mgrEmptyMsg = totalShiftRows === 0
    ? '— shift-manager data not loaded —'
    : `— no shift-manager data for this store (${totalShiftRows} rows loaded, other stores) —`;
  // Manager attribution shows only for store-level shift roles (Assistant / Department /
  // Shift Manager). GM = whole store; AS/OM are above-store → always store-total.
  const showMgr = SHIFT_ATTRIBUTABLE_ROLES.includes(role);

  // Selecting a manager sets the geid AND the name — ensures correct attribution.
  const pickManager = (g) => {
    setGeid(g);
    const mgr = managers.find(x => String(x.geid) === String(g));
    if (mgr && mgr.name) setName(mgr.name);
  };

  const submit = () => {
    if (!name.trim()) { alert('Name is required'); return; }
    // blankReview(name, role, loc, year, cfg) — 5-arg, per-person-per-YEAR (dispatch #152). No
    // half argument: the freshly-created record already carries `periods.h1`/`periods.h2`, both
    // 'draft', with all 12 months' KPIs and all four quarters' behavioral ratings pre-built.
    const r = blankReview(name.trim(), role, loc, year, cfg);
    r.geid = (showMgr && geid) ? Number(geid) : null;
    onCreate(r);
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
      sel({value:loc,onChange:e=>{setLoc(e.target.value);setGeid('');},style:{...fieldStyle}},
        opt({value:''},'All Stores'),
        ...(stores||[]).map(s=>opt({value:s.loc,key:s.loc},`${s.loc} — ${sName(s.loc)}`)))
    ),
    // Manager attribution (Notes 33 A#3): DM/shift roles can attribute the review to a
    // specific manager's own shifts. GMs are store-total (picker hidden).
    showMgr && div(null,
      div({style:{fontSize:10,color:TEXT3,marginBottom:4}},'Manager (attribution)'),
      managers.length > 0
        ? sel({value:geid,onChange:e=>pickManager(e.target.value),style:{...fieldStyle,minWidth:170}},
            opt({value:''},'— store total —'),
            ...managers.map(m=>opt({value:String(m.geid),key:m.geid},m.name)))
        : sel({value:'',disabled:true,style:{...fieldStyle,minWidth:170,opacity:.6}},
            opt({value:''},mgrEmptyMsg))
    ),
    div(null,
      div({style:{fontSize:10,color:TEXT3,marginBottom:4}},'Year'),
      inp({type:'number',value:year,onChange:e=>setYear(parseInt(e.target.value)),
        style:{...fieldStyle,width:72}})
    ),
    PrimaryBtn({onClick:submit,style:{alignSelf:'flex-end'}},'Create'),
    GhostBtn({onClick:onCancel,style:{alignSelf:'flex-end'}},'Cancel')
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PANEL
// ═══════════════════════════════════════════════════════════════════════════════
export function PerformanceReviewsPanel({stores, ds, settings, onClose, userRole='admin', orgRoles, initialTab, initialCustomizeSection, dataReady=true}) {
  const [tab, setTab]       = useState(initialTab || 'reviews');
  const [cfg, setCfg]       = useState(() => getReviewConfig());
  const [reviews, setReviews] = useState(() => getReviews());
  const [editing, setEditing] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  const refresh = () => setReviews(getReviews());

  // Dispatch #162 (Performance Review continuity, build item #6) — departure/termination
  // handling. "No manual step needed for the routine case" (plan doc, resolved item B) means this
  // runs on its own whenever tenure data is available, not behind a button: for every THIS-YEAR
  // review, detect a departure against ds.tenureRows and auto-finalize its open period(s) via
  // applyDepartureAutoFinalize (which itself calls the existing transitionReview — see that
  // file's own header). Guarded by a ref keyed on the tenureRows array identity so this sweep
  // runs once per fresh load of tenure data, not on every render or every refresh() this same
  // effect's own transitions trigger (ds.tenureRows only changes when a NEW Supabase load lands,
  // not when `reviews` changes) — same reasoning the segmented-review effect below already needs.
  const _tenureSweepRef = React.useRef(null);
  useEffect(() => {
    const tenureRows = ds?.tenureRows;
    if (!tenureRows || !tenureRows.length) return;
    if (_tenureSweepRef.current === tenureRows) return; // already swept this exact snapshot
    _tenureSweepRef.current = tenureRows;
    const thisYear = new Date().getFullYear();
    let anyTransitioned = false;
    for (const review of Object.values(getReviews())) {
      if (review.year !== thisYear) continue; // past-year reviews are already done; not this dispatch's concern
      const result = applyDepartureAutoFinalize(review, tenureRows);
      if (result.transitioned.length) anyTransitioned = true;
    }
    if (anyTransitioned) refresh();
  }, [ds?.tenureRows]);

  const handleSaveCfg = (newCfg) => { saveReviewConfig(newCfg); setCfg(newCfg); };
  const handleResetCfg= () => { resetReviewConfig(); setCfg(JSON.parse(JSON.stringify(DEFAULT_REVIEW_CONFIG))); };

  const handleSaveReview = (r) => {
    upsertReview(r);
    refresh();
    setEditing(rv => rv ? {...rv,...r,updatedAt:new Date().toISOString().slice(0,10)} : rv);
  };

  // Dispatch #157 — fixes the confirmed 3-vs-4-arg bug (finding #3): transitionReview's real
  // signature is (id, half, newStatus, notes). The old 3-arg call here shifted `newStatus` into
  // the `half` parameter slot and `notes` into `newStatus`, so e.g. clicking "Submit for Review"
  // called transitionReview(id, 'submitted', '') — writing to review.periods['submitted'] (a
  // garbage key) instead of periods.h1/h2. ReviewEditor's StatusActionBar now calls
  // onTransition(id, half, newStatus, notes) with `half` in the right position.
  const handleTransition = (id, half, newStatus, notes) => {
    const updated = transitionReview(id, half, newStatus, notes);
    if (updated) setEditing(updated);
    refresh();
  };

  const canCustomize = hasPermission(userRole, 'reviews.customize', orgRoles || getOrgRoles());
  const tabs = [
    {key:'reviews', label:`Reviews (${Object.keys(reviews).length})`},
    ...(canCustomize ? [{key:'customize', label:'Customize'}] : []),
  ];

  return h(RoutePanelShell,{
    title:'Performance Reviews', icon:'📋', onBack:onClose,
    subtitle:'Salaried Management · GM · AM · AS · OM',
    headerExtra: GhostBtn({onClick:()=>setShowHelp(true),style:{fontSize:11}},'? Help'),
    bodyStyle:{display:'flex',flexDirection:'column',overflow:'hidden'},
  },
    TabBar({tabs, active:tab, onSelect:(k)=>{setTab(k);if(k!=='reviews')setEditing(null);}}),
    showHelp && h(HelpGuideModal, {onClose:()=>setShowHelp(false), zIndex:Z.nested}),
    tab==='reviews' && (
      editing
        ? h(ReviewEditor,{review:editing, cfg, ds, stores,
            onSave:handleSaveReview,
            onBack:()=>{refresh();setEditing(null);},
            userRole, orgRoles, dataReady,
            onTransition:handleTransition})
        : h(ReviewList,{reviews, cfg, stores,
            shiftManagerRows: ds?.shiftManagerRows || [],
            onOpen:setEditing,
            onNew:refresh,
            onDelete:refresh})
    ),
    tab==='customize' && div({style:{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}},
      h(CustomizePanel,{cfg, onSave:handleSaveCfg, onReset:handleResetCfg, ds, initialSection:initialCustomizeSection})),
  );
}
