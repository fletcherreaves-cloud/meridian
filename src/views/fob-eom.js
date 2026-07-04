// @ts-nocheck
import * as React from 'react';
import * as XLSX from 'xlsx';

const {useState, useEffect, useMemo, useRef, useCallback} = React;
const h     = React.createElement;
const div   = (p,...c)=>h('div',p,...c);
const span  = (p,...c)=>h('span',p,...c);
const btn   = (p,...c)=>h('button',p,...c);
const tr    = (p,...c)=>h('tr',p,...c);
const td    = (p,...c)=>h('td',p,...c);
const th    = (p,...c)=>h('th',p,...c);
const tbl   = (p,...c)=>h('table',p,...c);
const thead = (p,...c)=>h('thead',p,...c);
const tbody = (p,...c)=>h('tbody',p,...c);
const inp   = (p,...c)=>h('input',p,...c);
const lbl   = (p,...c)=>h('label',p,...c);

// ── FOB Settings storage ──────────────────────────────────────────────────────
const FOB_SETTINGS_KEY = 'mf_fob_settings_v1';
const FOB_DEFAULTS = {
  yellowBand: 0.0025,   // 0.25% over target = yellow (above this = red)
};
function loadFobSettings() {
  try { return { ...FOB_DEFAULTS, ...JSON.parse(localStorage.getItem(FOB_SETTINGS_KEY) || '{}') }; }
  catch { return { ...FOB_DEFAULTS }; }
}
function saveFobSettings(s) { localStorage.setItem(FOB_SETTINGS_KEY, JSON.stringify(s)); }

// ── File type detection ───────────────────────────────────────────────────────
function detectFileType(name) {
  const l = name.toLowerCase();
  if (l.includes('contributors'))                                    return 'contributors';
  if (l.includes('on hand') || l.includes('on_hand'))               return 'onhand';
  if (l.includes('inventory summary') || (l.includes('inventory') && l.includes('summary'))) return 'summary';
  if (l.includes('inventory history') || (l.includes('inventory') && l.includes('history'))) return 'history';
  if (l.includes('variance stat') || l.includes('variance_stat'))   return 'variance';
  if (l.includes('total pl') || l.includes('total p&l') || l.includes('total_pl')) return 'pl';
  return 'unknown';
}

// ── Raw parser helpers ────────────────────────────────────────────────────────
function parseRaw(wb, idx=0) {
  const ws = wb.Sheets[wb.SheetNames[idx]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, {header:1, defval:null, raw:true});
}

function findHdrRow(raw, ...keywords) {
  for (let i=0; i<Math.min(raw.length,8); i++) {
    const joined = (raw[i]||[]).map(c=>String(c||'').toLowerCase()).join(' ');
    if (keywords.every(k=>joined.includes(k.toLowerCase()))) return i;
  }
  return -1;
}

function colOf(hdr, ...names) {
  const norm = s=>String(s||'').toLowerCase().replace(/[   ]/g,' ').trim();
  for (const name of names) {
    const t=norm(name);
    for (let i=0;i<hdr.length;i++) if(norm(String(hdr[i]||''))===t) return i;
  }
  for (const name of names) {
    const t=norm(name); if(t.length<=3) continue;
    for (let i=0;i<hdr.length;i++) if(norm(String(hdr[i]||'')).includes(t)) return i;
  }
  return -1;
}

function n(v) { const x=parseFloat(String(v||0).replace(/[^0-9.\-]/g,'')); return isNaN(x)?0:x; }

// ── File parsers ──────────────────────────────────────────────────────────────

function parseContributors(wb) {
  const raw = parseRaw(wb);
  const hi = findHdrRow(raw,'category','target');
  if (hi<0) return null;
  const hdr = raw[hi]||[];
  const ci  = colOf(hdr,'category');
  const ti  = colOf(hdr,'target');
  const api = colOf(hdr,'actual (%)','actual%','actual (percent)');
  const adi = colOf(hdr,'actual $','actual $','actual dollar');
  const dpi = colOf(hdr,'difference (%)','difference%','difference (percent)');
  const ddi = colOf(hdr,'difference $','difference dollar');
  const rows = [];
  for (let i=hi+1;i<raw.length;i++) {
    const r=raw[i]||[];
    const cat=String(r[ci]||'').trim();
    if (!cat) continue;
    // Pct values come as "4.73%" strings — divide by 100 to store as decimals (0.0473)
    const pct = v => n(v)/100;
    rows.push({ cat, target:pct(r[ti]), actPct:pct(r[api]), actDol:n(r[adi]), diffPct:pct(r[dpi]), diffDol:n(r[ddi]) });
  }
  return rows;
}

function parseOnHand(wb) {
  const raw = parseRaw(wb);
  const hi = findHdrRow(raw,'wrin','description','case');
  if (hi<0) return null;
  const hdr = raw[hi]||[];
  const rows = [];
  for (let i=hi+1;i<raw.length;i++) {
    const r=raw[i]||[];
    const wrin=String(r[colOf(hdr,'wrin')]||'').trim();
    if (!wrin||!/\d{5}/.test(wrin)) continue;
    const lastCntStr = String(r[colOf(hdr,'last counted','counted')]||'');
    let lastCounted = null;
    const m=lastCntStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) lastCounted = new Date(+m[3],+m[1]-1,+m[2]);
    rows.push({
      wrin,
      desc:      String(r[colOf(hdr,'description')]||'').trim(),
      cls:       String(r[colOf(hdr,'class')]||'').trim(),
      cases:     n(r[colOf(hdr,'case')]),
      packs:     n(r[colOf(hdr,'pack')]),
      loose:     n(r[colOf(hdr,'loose')]),
      totalUnits:n(r[colOf(hdr,'total units','total')]),
      unitPrice: n(r[colOf(hdr,'unit price','price')]),
      onHandAmt: n(r[colOf(hdr,'on hand amt','amount')]),
      lastCounted,
    });
  }
  return rows;
}

function parseSummaryUsage(wb) {
  const raw = parseRaw(wb);
  const hi = findHdrRow(raw,'wrin','class','actual usage');
  if (hi<0) return null;
  const hdr = raw[hi]||[];
  const rows = [];
  for (let i=hi+1;i<raw.length;i++) {
    const r=raw[i]||[];
    const wrin=String(r[colOf(hdr,'wrin')]||'').trim();
    if (!wrin||!/\d{5}/.test(wrin)) continue;
    const uomStr=String(r[colOf(hdr,'uom / case','uom','uom/case')]||'');
    const uomMatch=uomStr.match(/\/\s*(\d+\.?\d*)/);
    rows.push({
      wrin,
      desc:       String(r[colOf(hdr,'description')]||'').trim(),
      cls:        String(r[colOf(hdr,'class')]||'').trim(),
      uom:        uomStr,
      caseSz:     uomMatch?+uomMatch[1]:1,
      cost:       n(r[colOf(hdr,'cost')]),
      startInv:   n(r[colOf(hdr,'starting inventory')]),
      purchases:  n(r[colOf(hdr,'purchases')]),
      endInv:     n(r[colOf(hdr,'ending inventory')]),
      actualUsage:n(r[colOf(hdr,'actual usage')]),
      usagePerDay:n(r[colOf(hdr,'usage /day','usage/day')]),
      daysSupply: n(r[colOf(hdr,'days of supply')]),
      range:      String(r[colOf(hdr,'range')]||'').trim().toLowerCase(),
    });
  }
  return rows;
}

function parseVarianceStat(wb) {
  const raw = parseRaw(wb);
  const hi = findHdrRow(raw,'wrin','description','variance');
  if (hi<0) return null;
  const hdr = raw[hi]||[];
  const rows = [];
  for (let i=hi+1;i<raw.length;i++) {
    const r=raw[i]||[];
    const wrin=String(r[colOf(hdr,'wrin')]||'').trim();
    if (!wrin||!/\d{5}/.test(wrin)) continue;
    rows.push({
      cls:       String(r[colOf(hdr,'class')]||'').trim(),
      wrin,
      desc:      String(r[colOf(hdr,'description')]||'').trim(),
      rawWaste:  n(r[colOf(hdr,'raw waste')]),
      compWaste: n(r[colOf(hdr,'completed waste')]),
      expUsage:  n(r[colOf(hdr,'expected usage')]),
      actUsage:  n(r[colOf(hdr,'actual usage')]),
      variance:  n(r[colOf(hdr,'variance')]),
      dolDiff:   n(r[colOf(hdr,'$ difference','dollar difference')]),
    });
  }
  return rows;
}

function parseTotalPL(wb) {
  const raw = parseRaw(wb);
  const hi = findHdrRow(raw,'category','food');
  if (hi<0) return null;
  const hdr = raw[hi]||[];
  const out = {};
  for (let i=hi+1;i<raw.length;i++) {
    const r=raw[i]||[];
    const cat=String(r[colOf(hdr,'category')]||'').trim().toLowerCase();
    if (!cat) continue;
    out[cat] = { food:n(r[colOf(hdr,'food')]), total:n(r[colOf(hdr,'total')]) };
  }
  return out;
}

// ── Analysis engine ───────────────────────────────────────────────────────────

function analyzeData({contributors, onHand, summary, variance, pl}) {
  // Build lookup maps
  const sumMap = {};
  (summary||[]).forEach(r=>sumMap[r.wrin]=r);
  const vsMap = {};
  (variance||[]).forEach(r=>vsMap[r.wrin]=r);

  // Extract store/period info from file content (contributors header usually has store#)
  const period = pl ? 'June 2026' : '—';

  // FOB contributors
  const fobStatus = contributors || [];
  const fob = fobStatus.find(c=>c.cat.toLowerCase().includes('food over base'));
  const totalFC = fobStatus.find(c=>c.cat.toLowerCase().includes('total food cost'));

  // Count compliance — last 3 days = within 2 days prior to today
  const today = (() => {
    const d=new Date(); d.setHours(0,0,0,0); return d;
  })();
  const cutoff = new Date(today); cutoff.setDate(today.getDate()-2);

  const complianceIssues = [];
  (onHand||[]).forEach(item=>{
    if (!item.lastCounted || item.lastCounted < cutoff) {
      complianceIssues.push({...item, s:sumMap[item.wrin]||{}, v:vsMap[item.wrin]||{}});
    }
  });

  // Variance alerts — $50+ dollar difference, Food class
  const varianceAlerts = (variance||[])
    .filter(v=>Math.abs(v.dolDiff)>=50)
    .map(v=>({
      ...v,
      oh: (onHand||[]).find(o=>o.wrin===v.wrin)||null,
      s: sumMap[v.wrin]||{},
      severity: Math.abs(v.dolDiff)>=300?'critical':Math.abs(v.dolDiff)>=100?'high':'medium',
    }))
    .sort((a,b)=>Math.abs(b.dolDiff)-Math.abs(a.dolDiff));

  // On-hand anomalies — high days of supply relative to usage
  // Strategy: items where count accuracy most impacts variance
  const countAlerts = (onHand||[])
    .map(item=>{
      const s=sumMap[item.wrin]||{};
      const v=vsMap[item.wrin]||{};
      const dos=s.daysSupply||0;
      const dolDiff=v.dolDiff||0;
      // Priority score: negative variance * high case count is most actionable
      // High case count + negative variance = possible undercount (finding more = helps)
      // Very high days supply with cases counted = possible overcount
      const priority = Math.abs(dolDiff) * (item.cases>=3?1.5:1) * (dos>10?0.8:1);
      return {...item, s, v, dos, dolDiff, priority};
    })
    .filter(item=>item.cases>=4||(item.dos>9&&item.cases>=1))
    .sort((a,b)=>b.priority-a.priority);

  // Priority recount list: negative variance items to physically verify
  // If count was too low → correcting up → reduces calculated usage → improves variance
  const recountList = varianceAlerts
    .filter(v=>v.dolDiff<-50)
    .map(v=>({
      ...v,
      countTip: buildCountTip(v),
    }));

  // Operational issues — items with no on-hand record (not countable today)
  const noOH = (variance||[])
    .filter(v=>Math.abs(v.dolDiff)>=50)
    .filter(v=>!(onHand||[]).find(o=>o.wrin===v.wrin));

  return { fobStatus, fob, totalFC, period, complianceIssues, varianceAlerts, countAlerts, recountList, noOH, sumMap, vsMap };
}

function buildCountTip(v) {
  const oh = v.oh;
  if (!oh) return 'Not on On-Hand report — operational issue (waste, yield, or tracking)';
  const s = v.s;
  const dos = s.daysSupply||0;
  const lines = [];
  if (oh.cases>0) lines.push(`${oh.cases} case${oh.cases!==1?'s':''} counted`);
  if (oh.packs>0) lines.push(`${oh.packs} pack${oh.packs!==1?'s':''}`);
  if (oh.loose>0) lines.push(`${oh.loose.toFixed(2)} loose`);
  const countSummary = lines.join(' + ') || 'No cases counted';
  const tip = dos<3 ? 'LOW on hand — look for uncounted stock in freezer/walk-in' :
              dos>10 ? 'Verify case count is accurate — unusually high days of supply' :
              'Verify loose count accuracy';
  return `${countSummary} | ${tip}`;
}

// ── Formatting helpers ────────────────────────────────────────────────────────
const f$ = v => '$'+Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fPct = v => (v*100).toFixed(2)+'%';
const sev = s => s==='critical'?'#ef4444':s==='high'?'#f59e0b':'#6b7280';
const sevBg = s => s==='critical'?'rgba(239,68,68,.1)':s==='high'?'rgba(245,158,11,.08)':'rgba(107,114,128,.06)';
const greenRed = v => v<0 ? '#ef4444' : '#10b981';

// Tolerance-aware color: green = at/below target, yellow = within band, red = further over
function fobTolColor(diffDol, diffPct, settings) {
  const band = settings ? settings.yellowBand : FOB_DEFAULTS.yellowBand;
  if (diffDol >= 0) return '#10b981';
  return Math.abs(diffPct) <= band ? '#f59e0b' : '#ef4444';
}
function fobTolBg(diffDol, diffPct, settings) {
  const col = fobTolColor(diffDol, diffPct, settings);
  if (col === '#10b981') return 'rgba(16,185,129,.06)';
  if (col === '#f59e0b') return 'rgba(245,158,11,.06)';
  return 'rgba(239,68,68,.06)';
}

// ── FOB Settings editor ───────────────────────────────────────────────────────
function FobSettingsEditor({ settings, onChange }) {
  const [local, setLocal] = useState({ ...settings });
  const save = () => { saveFobSettings(local); onChange(local); };
  return div({style:{display:'flex',alignItems:'center',gap:12,padding:'8px 16px',
    background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)',flexWrap:'wrap'}},
    span({style:{fontSize:'10px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},'FOB Tolerances:'),
    h('label',{style:{display:'flex',alignItems:'center',gap:6,fontSize:'11px'}},
      span({style:{color:'var(--text2)'}},'Yellow band (% over target):'),
      h('input',{type:'number',value:Math.round(local.yellowBand*10000)/100,min:0,max:5,step:0.05,
        onChange:e=>setLocal(s=>({...s,yellowBand:parseFloat(e.target.value)/100})),
        style:{width:60,padding:'2px 6px',borderRadius:4,border:'1px solid var(--bdr)',
          background:'var(--surf)',color:'var(--text)',fontSize:11,textAlign:'right'}}),
      span({style:{fontSize:'10px',color:'var(--text3)'}},'%')
    ),
    span({style:{fontSize:'9px',color:'var(--text3)'}},'Green ≤ target · Yellow ≤ +'+(Math.round(local.yellowBand*10000)/100)+'% · Red above'),
    btn({onClick:save,style:{padding:'3px 10px',borderRadius:4,background:'var(--accent)',color:'#fff',
      border:'none',cursor:'pointer',fontSize:10,fontWeight:600}},'Save'),
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FOBStatusBar({fobStatus, fobSettings}) {
  const COMP_ORDER = ['Completed Waste','Raw Waste','Condiments','Emp/Mgr Meals','Variance Stat','Unexplained'];
  const fob = fobStatus.find(c=>c.cat.toLowerCase().includes('food over base'));
  const tfc = fobStatus.find(c=>c.cat.toLowerCase().includes('total food cost'));
  const getComp = name => fobStatus.find(c=>c.cat.toLowerCase()===name.toLowerCase())||null;
  const s = fobSettings;

  return div({style:{padding:'12px 16px',borderBottom:'.5px solid var(--bdr)',background:'var(--surf2)'}},
    // Header KPIs
    div({style:{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}},
      ...[
        { l:'Food Over Base', row:fob },
        { l:'Total Food Cost', row:tfc },
      ].map((k,i)=>{
        const r=k.row;
        const col  = r ? fobTolColor(r.diffDol, r.diffPct, s) : 'var(--text3)';
        const bg   = r ? fobTolBg(r.diffDol, r.diffPct, s)    : 'transparent';
        const sub  = r ? (r.diffDol<0?'▲ Over '+f$(r.diffDol)+' vs target':'✓ Under target by '+f$(Math.abs(r.diffDol))) : '—';
        return div({key:i,style:{flex:'1 1 160px',minWidth:140,background:bg,border:'.5px solid var(--bdr)',borderRadius:6,padding:'8px 12px'}},
          div({style:{fontSize:'8px',textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text3)',marginBottom:2}},k.l),
          div({style:{fontSize:'16px',fontFamily:'var(--mono)',fontWeight:700,color:col}},r?fPct(r.actPct):'—'),
          div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},sub)
        );
      })
    ),
    // 6-component grid
    div({style:{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:6}},
      ...COMP_ORDER.map((name,i)=>{
        const c=getComp(name);
        if (!c) return div({key:i,style:{background:'var(--mid2)',borderRadius:5,padding:'6px 8px',opacity:.4}},
          span({style:{fontSize:'8px',color:'var(--text3)'}},name)
        );
        const col  = fobTolColor(c.diffDol, c.diffPct, s);
        const over = c.diffDol<0;
        const bdr  = col==='#10b981'?'rgba(16,185,129,.2)':col==='#f59e0b'?'rgba(245,158,11,.25)':'rgba(239,68,68,.25)';
        const bg2  = col==='#10b981'?'rgba(16,185,129,.05)':col==='#f59e0b'?'rgba(245,158,11,.06)':'rgba(239,68,68,.07)';
        return div({key:i,style:{background:bg2,border:`.5px solid ${bdr}`,borderRadius:5,padding:'6px 8px'}},
          div({style:{fontSize:'8px',fontWeight:600,color:'var(--text3)',marginBottom:2,lineHeight:1.2}},name),
          div({style:{fontSize:'13px',fontFamily:'var(--mono)',fontWeight:700,color:col}},fPct(c.actPct)),
          div({style:{fontSize:'8px',color:'var(--text3)'}},
            span({style:{color:'#94a3b8'}},'Tgt: '),fPct(c.target),'  ',
            span({style:{color:col}},(over?'▲ ':'+')+(c.diffPct*100).toFixed(2)+'%')
          )
        );
      })
    )
  );
}

function ExpandedDetail({v}) {
  const oh = v.oh;
  if (!oh) return div({style:{fontSize:'10px',fontStyle:'italic',color:'var(--text3)'}},
    'Not on the On-Hand report — operational issue (yield, unlogged waste, or tracking gap). Cannot be resolved by recounting today.'
  );
  const s = v.s;
  const rowStyle = {fontSize:'10px',color:'var(--text2)',lineHeight:1.8};
  return div({style:{fontSize:'10px',color:'var(--text2)',lineHeight:1.7}},
    div({style:rowStyle},
      span({style:{fontWeight:600,color:'var(--text)'}},'On-Hand Detail: '),
      'Cases: '+oh.cases+'  |  Packs: '+oh.packs+'  |  Loose: '+oh.loose.toFixed(2)+'  |  Total: '+oh.totalUnits.toLocaleString('en-US',{maximumFractionDigits:1})+' units  |  Value: '+f$(oh.onHandAmt)
    ),
    div({style:rowStyle},
      span({style:{fontWeight:600,color:'var(--text)'}},'Last Counted: '),
      oh.lastCounted?oh.lastCounted.toLocaleDateString('en-US',{month:'numeric',day:'numeric',year:'numeric'}):'Unknown'
    ),
    s.daysSupply>0&&div({style:rowStyle},
      span({style:{fontWeight:600,color:'var(--text)'}},'Days of Supply: '),
      s.daysSupply.toFixed(1)+'d',
      s.daysSupply>10?' ⚠ HIGH — verify count is accurate':s.daysSupply<2?' ↓ LOW — look for uncounted stock in walk-in':''
    ),
    (v.rawWaste>0||v.compWaste>0)&&div({style:rowStyle},
      span({style:{fontWeight:600,color:'var(--text)'}},'Waste Logged: '),
      'Raw: '+v.rawWaste.toFixed(1)+'  |  Completed: '+v.compWaste.toFixed(1)
    )
  );
}

function RecountSection({recountList}) {
  const [expanded, setExpanded] = useState(new Set());
  const toggle = wrin => setExpanded(prev=>{const s=new Set(prev);s.has(wrin)?s.delete(wrin):s.add(wrin);return s;});

  if (!recountList.length) return div({style:{padding:16,color:'var(--text3)',fontSize:'12px'}},'No items with significant negative variance found.');

  const thS = {fontSize:'8px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text3)',padding:'5px 8px',textAlign:'left',borderBottom:'.5px solid var(--bdr)',background:'var(--mid2)',whiteSpace:'nowrap'};
  const tdS = (extra={})=>({fontSize:'11px',padding:'5px 8px',borderBottom:'.5px solid rgba(var(--bdr-rgb,200,200,200),.3)',verticalAlign:'middle',...extra});

  return div({style:{padding:'0 0 12px'}},
    div({style:{padding:'8px 16px 4px',fontSize:'10px',color:'var(--text3)',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)'}},
      'Variance = Actual Usage − Expected Usage. Negative means more used than expected. Correcting an ',span({style:{fontWeight:700}},'undercount'),' on ending inventory reduces calculated usage → improves variance.'
    ),
    tbl({style:{width:'100%',borderCollapse:'collapse'}},
      thead(null,
        tr(null,
          th({style:{...thS,width:24}},''),
          th({style:thS},'Priority'),
          th({style:thS},'Item / WRIN'),
          th({style:{...thS,textAlign:'right'}},'$ Gap'),
          th({style:{...thS,textAlign:'right'}},'Variance'),
          th({style:{...thS,textAlign:'right'}},'Expected'),
          th({style:{...thS,textAlign:'right'}},'Actual'),
          th({style:thS},'On-Hand Count'),
        )
      ),
      tbody(null,
        ...recountList.map((v,i)=>[
          tr({key:v.wrin,style:{cursor:'pointer',background:expanded.has(v.wrin)?'var(--mid2)':'transparent'},
              onClick:()=>toggle(v.wrin)},
            td({style:tdS({textAlign:'center',color:'var(--text3)',fontSize:'9px'})},expanded.has(v.wrin)?'▼':'▶'),
            td({style:tdS()},
              span({style:{fontSize:'9px',fontWeight:700,padding:'2px 6px',borderRadius:3,background:sevBg(v.severity),color:sev(v.severity),border:`.5px solid ${sev(v.severity)}`,opacity:.8}},
                v.severity==='critical'?'CRITICAL':v.severity==='high'?'HIGH':'MEDIUM'
              )
            ),
            td({style:tdS()},
              div({style:{fontWeight:600,fontSize:'11px'}},v.desc),
              div({style:{fontSize:'9px',color:'var(--text3)',fontFamily:'var(--mono)'}},'WRIN ',v.wrin)
            ),
            td({style:tdS({textAlign:'right',fontFamily:'var(--mono)',color:'#ef4444',fontWeight:700})},'('+f$(v.dolDiff)+')'),
            td({style:tdS({textAlign:'right',fontFamily:'var(--mono)',color:'var(--text2)',fontSize:'10px'})},v.variance.toLocaleString('en-US',{maximumFractionDigits:1})),
            td({style:tdS({textAlign:'right',fontFamily:'var(--mono)',color:'var(--text3)',fontSize:'10px'})},v.expUsage.toLocaleString('en-US',{maximumFractionDigits:1})),
            td({style:tdS({textAlign:'right',fontFamily:'var(--mono)',color:'var(--text2)',fontSize:'10px'})},v.actUsage.toLocaleString('en-US',{maximumFractionDigits:1})),
            td({style:tdS({fontSize:'10px',color:'var(--text3)',maxWidth:240})},v.countTip),
          ),
          expanded.has(v.wrin)&&tr({key:v.wrin+'_exp'},
            td({colSpan:8,style:{padding:'6px 12px 10px 36px',background:'var(--mid2)',borderBottom:'.5px solid var(--bdr)'}},
              h(ExpandedDetail,{v})
            )
          ),
        ].filter(Boolean))
      )
    )
  );
}

function CountAnomalySection({countAlerts}) {
  if (!countAlerts.length) return div({style:{padding:16,color:'var(--text3)',fontSize:'12px'}},'No unusual case counts detected.');

  const thS = {fontSize:'8px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text3)',padding:'5px 8px',textAlign:'left',borderBottom:'.5px solid var(--bdr)',background:'var(--mid2)',whiteSpace:'nowrap'};
  const tdS = (extra={})=>({fontSize:'11px',padding:'5px 8px',borderBottom:'.5px solid rgba(var(--bdr-rgb,200,200,200),.3)',verticalAlign:'middle',...extra});

  return div({style:{padding:'0 0 12px'}},
    div({style:{padding:'8px 16px 4px',fontSize:'10px',color:'var(--text3)',background:'var(--surf2)',borderBottom:'.5px solid var(--bdr)'}},
      'Items where the case count is unusually high relative to daily usage. High days of supply may indicate an ',span({style:{fontWeight:700}},'overcount'),' — currently helping variance but verify for accuracy.'
    ),
    tbl({style:{width:'100%',borderCollapse:'collapse'}},
      thead(null,
        tr(null,
          th({style:thS},'Item / WRIN'),
          th({style:{...thS,textAlign:'right'}},'Cases Counted'),
          th({style:{...thS,textAlign:'right'}},'Days of Supply'),
          th({style:{...thS,textAlign:'right'}},'On Hand $'),
          th({style:{...thS,textAlign:'right'}},'$ Variance'),
          th({style:thS},'Action'),
        )
      ),
      tbody(null,
        ...countAlerts.map(item=>{
          const dos = item.dos;
          const dosSev = dos>14?'critical':dos>9?'high':'medium';
          const varColor = item.dolDiff<0?'#ef4444':item.dolDiff>0?'#10b981':'var(--text3)';
          return tr({key:item.wrin},
            td({style:tdS()},
              div({style:{fontWeight:600,fontSize:'11px'}},item.desc),
              div({style:{fontSize:'9px',color:'var(--text3)',fontFamily:'var(--mono)'}},'WRIN ',item.wrin)
            ),
            td({style:tdS({textAlign:'right',fontFamily:'var(--mono)',fontWeight:700})},item.cases),
            td({style:tdS({textAlign:'right',fontFamily:'var(--mono)'})},
              span({style:{color:sev(dosSev),fontWeight:600}},dos.toFixed(1),'d')
            ),
            td({style:tdS({textAlign:'right',fontFamily:'var(--mono)',color:'var(--text2)'})},'$'+item.onHandAmt.toFixed(2)),
            td({style:tdS({textAlign:'right',fontFamily:'var(--mono)',color:varColor,fontWeight:item.dolDiff!==0?600:400})},
              item.dolDiff!==0?(item.dolDiff<0?'(':'')+f$(item.dolDiff)+(item.dolDiff<0?')':''):'—'
            ),
            td({style:tdS({fontSize:'10px',color:'var(--text3)'})},
              dos>14?'Verify — very high days supply. Check unit (case vs bag/pack)':
              dos>9?'Verify — unusually high. Count physically and confirm.':
              'Review — above normal days supply'
            ),
          );
        })
      )
    )
  );
}

function ComplianceSection({complianceIssues, onHand}) {
  const total = (onHand||[]).length;
  const counted = total - complianceIssues.length;
  const pct = total>0?Math.round(100*counted/total):0;
  const statusColor = pct===100?'#10b981':pct>=90?'#f59e0b':'#ef4444';

  return div({style:{padding:12}},
    div({style:{display:'flex',gap:12,marginBottom:12,flexWrap:'wrap'}},
      div({style:{flex:'0 0 auto',background:pct===100?'rgba(16,185,129,.06)':'rgba(245,158,11,.06)',border:`.5px solid ${statusColor}40`,borderRadius:6,padding:'8px 14px',textAlign:'center'}},
        div({style:{fontSize:'18px',fontFamily:'var(--mono)',fontWeight:700,color:statusColor}},pct+'%'),
        div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},'Compliance Rate'),
        div({style:{fontSize:'9px',color:'var(--text3)'}},''+counted+' / '+total+' items counted')
      ),
      div({style:{flex:'1 1 200px',fontSize:'10px',color:'var(--text2)',lineHeight:1.7,paddingTop:4}},
        div({style:{fontWeight:600,color:'var(--text)',marginBottom:4}},'Count Compliance Rule'),
        div(null,'All Food, Condiment, and Paper items must be counted on one of the last 3 days of every month. Counts done on the last day (today) cannot be corrected after close — preferably count on Day 28 or 29.'),
        complianceIssues.length>0&&div({style:{marginTop:6,color:'#ef4444',fontWeight:600}},'⚠ '+complianceIssues.length+' item'+(complianceIssues.length!==1?'s':'')+' not counted within required window')
      )
    ),
    complianceIssues.length===0
      ? div({style:{padding:'10px 12px',background:'rgba(16,185,129,.06)',border:'.5px solid rgba(16,185,129,.2)',borderRadius:6,fontSize:'11px',color:'#10b981'}},
          '✓ All items have been counted within the last 3 days — compliance met.'
        )
      : div(null,
          div({style:{fontWeight:600,fontSize:'11px',marginBottom:6,color:'#ef4444'}},'Items not counted in last 3 days:'),
          complianceIssues.map(item=>div({key:item.wrin,style:{fontSize:'10px',padding:'4px 8px',background:'rgba(239,68,68,.05)',borderLeft:'2px solid #ef4444',marginBottom:4,borderRadius:'0 4px 4px 0'}},
            span({style:{fontWeight:600}},item.desc),' (',item.wrin,')',
            item.lastCounted?span({style:{color:'var(--text3)',marginLeft:8}},'Last: '+item.lastCounted.toLocaleDateString()):span({style:{color:'var(--text3)',marginLeft:8}},'Never counted this period')
          ))
        )
  );
}

function OperationalIssuesSection({noOH}) {
  if (!noOH.length) return null;
  return div({style:{padding:'12px 16px'}},
    div({style:{fontSize:'10px',color:'var(--text3)',marginBottom:8,lineHeight:1.5}},
      'These items have significant variance but do NOT appear on the On-Hand Inventory report. They cannot be addressed by recounting today. These represent operational issues such as unlogged waste, yield problems, or tracking gaps that need to be investigated and corrected in future periods.'
    ),
    noOH.map(v=>div({key:v.wrin,style:{padding:'6px 10px',background:'rgba(107,114,128,.06)',border:'.5px solid var(--bdr)',borderRadius:5,marginBottom:4,display:'flex',gap:12,alignItems:'center'}},
      div({style:{flex:1}},
        div({style:{fontWeight:600,fontSize:'11px'}},v.desc),
        div({style:{fontSize:'9px',color:'var(--text3)',fontFamily:'var(--mono)'}},'WRIN ',v.wrin)
      ),
      div({style:{textAlign:'right'}},
        div({style:{fontFamily:'var(--mono)',fontWeight:700,color:'#ef4444',fontSize:'12px'}},'('+f$(v.dolDiff)+')'),
        div({style:{fontSize:'9px',color:'var(--text3)'}},'Variance: '+v.variance.toLocaleString('en-US',{maximumFractionDigits:1})+' units')
      ),
      div({style:{fontSize:'9px',color:'#f59e0b',fontStyle:'italic',maxWidth:160}},
        v.wrin==='18985-008'?'Cold Foam — yield/loss issue':
        v.wrin==='05550-142'?'Ramyeon — expected 0, used 359':
        v.wrin==='14633-006'?'Choc Milk UP G — expected 0, check if transferred in':
        'Operational gap — investigate waste/yield'
      )
    ))
  );
}

function PrintReport({analysis, storeName, period, selClasses}) {
  const handlePrint = () => {
    const {fobStatus, fob, totalFC, recountList, countAlerts, complianceIssues, noOH} = analysis;
    const now = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
    const classLabel = selClasses&&selClasses.size ? `  [Class: ${[...selClasses].sort().join(', ')}]` : '';
    const lines = [
      `FOB END OF MONTH TROUBLESHOOTER`,
      `${storeName||'Store'} · ${period}${classLabel} · Generated ${now}`,
      ``,
      `═══ FOB STATUS ═══════════════════════════════════════════════════`,
      ...(fobStatus||[]).filter(c=>!c.cat.toLowerCase().includes('base food')).map(c=>`  ${c.cat.padEnd(22)} Actual: ${(c.actPct*100).toFixed(2).padStart(6)}%  Target: ${(c.target*100).toFixed(2).padStart(6)}%  Diff: ${c.diffDol>=0?'+':''}${c.diffDol.toFixed(2)}`),
      ``,
      `═══ PRIORITY RECOUNT LIST (Last chance before EOM close) ═════════`,
      ...(recountList||[]).slice(0,15).map((v,i)=>[
        `  ${(i+1).toString().padStart(2)}. [${v.severity.toUpperCase()}] ${v.desc} (${v.wrin})`,
        `      Dollar Gap: ($${Math.abs(v.dolDiff).toFixed(2)})  |  Variance: ${v.variance.toLocaleString('en-US',{maximumFractionDigits:1})} units`,
        `      Count: ${v.countTip}`,
      ].join('\n')),
      ``,
      `═══ HIGH CASE COUNT ANOMALIES (Verify accuracy) ══════════════════`,
      ...(countAlerts||[]).slice(0,10).map(a=>`  ${a.desc} (${a.wrin})  —  ${a.cases} cases = ${a.dos.toFixed(1)} days supply`),
      ``,
      `═══ COUNT COMPLIANCE ════════════════════════════════════════════`,
      complianceIssues.length===0
        ? `  ✓ All items counted within the last 3 days`
        : `  ⚠ ${complianceIssues.length} items NOT counted within required window`,
      ...(complianceIssues||[]).map(c=>`    - ${c.desc} (${c.wrin})`),
      ``,
      `═══ OPERATIONAL ISSUES (Cannot fix with recount) ════════════════`,
      ...(noOH||[]).map(v=>`  ${v.desc} (${v.wrin})  —  ($${Math.abs(v.dolDiff).toFixed(2)}) gap, ${v.variance.toLocaleString('en-US',{maximumFractionDigits:1})} units variance`),
      ``,
      `─── Instructions for GM/Supervisor ─────────────────────────────`,
      `1. Start with Priority Recount items — physically locate and count each one.`,
      `2. If you find MORE inventory than counted → update the count immediately.`,
      `3. Check High Case Count items — verify the number of cases is accurate.`,
      `4. Counts must be entered before close of business today (EOM).`,
      `5. Operational issues (no On-Hand) cannot be fixed today — note for follow-up.`,
    ];
    const win = window.open('','_blank');
    if (!win) return;
    win.document.write('<pre style="font-family:monospace;font-size:12px;padding:24px;white-space:pre-wrap">'+lines.join('\n')+'</pre>');
    win.document.close();
    win.print();
  };

  return btn({onClick:handlePrint, style:{padding:'5px 12px',fontSize:'11px',borderRadius:5,background:'var(--mid2)',border:'.5px solid var(--bdr)',color:'var(--text)',cursor:'pointer'}},
    '🖨 Print / Share Report'
  );
}

// ── Upload zone ───────────────────────────────────────────────────────────────

const FILE_TYPES = [
  {key:'contributors', label:'Contributors (FOB Breakdown)',    hint:'*_Contributors_*.xlsx'},
  {key:'onhand',       label:'On Hand Inventory',              hint:'*_On Hand Inventory_*.xlsx'},
  {key:'summary',      label:'Inventory Summary & Usage',      hint:'*_Inventory Summary and Usage_*.xlsx'},
  {key:'history',      label:'Inventory History',              hint:'*_Inventory History_*.xlsx'},
  {key:'variance',     label:'Variance Stat',                  hint:'*_Variance Stat_*.xlsx'},
  {key:'pl',           label:'Total P&L Cost',                 hint:'*_Total PL Cost_*.xlsx'},
];

function UploadZone({loadedFiles, onLoad}) {
  const [drag, setDrag] = useState(false);
  const inpRef = useRef(null);

  const processFiles = useCallback(files=>{
    Array.from(files).forEach(file=>{
      const type=detectFileType(file.name);
      const reader=new FileReader();
      reader.onload=e=>{
        try {
          const wb=XLSX.read(e.target.result,{type:'array'});
          let parsed=null;
          if(type==='contributors') parsed=parseContributors(wb);
          else if(type==='onhand')  parsed=parseOnHand(wb);
          else if(type==='summary') parsed=parseSummaryUsage(wb);
          else if(type==='variance')parsed=parseVarianceStat(wb);
          else if(type==='pl')      parsed=parseTotalPL(wb);
          else if(type==='history') parsed={raw:true}; // reserved for future
          onLoad(type, parsed, file.name);
        } catch(err) { onLoad(type,null,file.name,err.message); }
      };
      reader.readAsArrayBuffer(file);
    });
  },[onLoad]);

  const onDrop = useCallback(e=>{
    e.preventDefault(); setDrag(false);
    processFiles(e.dataTransfer.files);
  },[processFiles]);

  const allLoaded = FILE_TYPES.filter(f=>f.key!=='history').every(f=>loadedFiles[f.key]);

  return div({style:{padding:16}},
    div({
      onDragOver:e=>{e.preventDefault();setDrag(true);},
      onDragLeave:()=>setDrag(false),
      onDrop,
      onClick:()=>inpRef.current&&inpRef.current.click(),
      style:{border:`1.5px dashed ${drag?'var(--accent)':'var(--bdr)'}`,borderRadius:8,padding:'16px 20px',cursor:'pointer',
        background:drag?'rgba(99,102,241,.04)':'var(--mid2)',transition:'all .15s',marginBottom:12,textAlign:'center'}
    },
      inp({ref:inpRef,type:'file',multiple:true,accept:'.xlsx',style:{display:'none'},
        onChange:e=>{processFiles(e.target.files);e.target.value='';}}),
      div({style:{fontSize:'13px',fontWeight:600,color:'var(--text)',marginBottom:4}},
        drag?'Drop files here':'Drop QSRSoft Excel files here or click to browse'
      ),
      div({style:{fontSize:'10px',color:'var(--text3)'}},'Accepts all 6 FOB report types — auto-detected from filename')
    ),
    div({style:{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}},
      ...FILE_TYPES.map(f=>{
        const loaded=loadedFiles[f.key];
        const optional=f.key==='history';
        const borderCol=loaded?'rgba(16,185,129,.3)':optional?'rgba(107,114,128,.2)':'var(--bdr)';
        const bgCol=loaded?'rgba(16,185,129,.05)':optional?'rgba(107,114,128,.02)':'transparent';
        return div({key:f.key,style:{padding:'6px 8px',borderRadius:5,border:`.5px solid ${borderCol}`,background:bgCol}},
          div({style:{display:'flex',gap:5,alignItems:'center',marginBottom:2}},
            span({style:{fontSize:'11px',color:loaded?'#10b981':'var(--text3)'}},(loaded?'✓':optional?'○':'○')+' '),
            span({style:{fontSize:'9px',fontWeight:600,color:loaded?'#10b981':optional?'var(--text3)':'var(--text)'}},f.label)
          ),
          div({style:{fontSize:'8px',color:'var(--text3)',paddingLeft:16}},
            loaded?span({style:{color:'#10b981'}},'Loaded'):span(null,optional?'Optional':f.hint)
          )
        );
      })
    ),
    !allLoaded&&div({style:{marginTop:8,fontSize:'10px',color:'var(--text3)',textAlign:'center'}},
      'Load all 5 required files to run the analysis'
    )
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

// ── Store selector bar ────────────────────────────────────────────────────────
function StoreSelectorBar({storeData, selStore, setSelStore, stores}) {
  const [scope, setScope] = useState('all');
  const storeNums = Object.keys(storeData).sort((a,b)=>+a-+b);
  if (storeNums.length===0) return null;

  const storeInfo = num => (stores||[]).find(s=>String(s.loc)===String(num));
  const getOperator = num => storeInfo(num)?.operator || 'Other';
  const sLabel = num => { const s=storeInfo(num); return s ? num+' '+s.name : 'Store '+num; };

  // Build operator groups from loaded stores only
  const opGroups = {};
  storeNums.forEach(num => {
    const op = getOperator(num);
    if (!opGroups[op]) opGroups[op] = [];
    opGroups[op].push(num);
  });
  const operators = Object.keys(opGroups).sort();
  const multiOp = operators.length > 1;

  // If scope points to an operator that's no longer loaded, reset
  const activeScope = (scope==='all'||opGroups[scope]) ? scope : 'all';
  const visibleNums = activeScope==='all' ? storeNums : (opGroups[activeScope]||[]);

  const fileCount = num => Object.values(storeData[num]||{}).filter(Boolean).length;
  const fobColor = num => {
    const c = storeData[num];
    if (!c||!c.contributors) return 'var(--text3)';
    const fob = (c.contributors||[]).find(r=>r.cat.toLowerCase().includes('food over base'));
    if (!fob) return 'var(--text3)';
    return fob.diffDol<0?'#ef4444':'#10b981';
  };

  const scopePill = (label, key) => {
    const active = activeScope===key;
    return btn({key, onClick:()=>{ setScope(key); if(key!=='all'&&opGroups[key]&&!opGroups[key].includes(selStore)) setSelStore(opGroups[key][0]); },
      style:{padding:'2px 9px',borderRadius:20,border:active?'1px solid var(--accent)':'.5px solid var(--bdr)',
        background:active?'var(--accent)18':'transparent',color:active?'var(--accent)':'var(--text3)',
        cursor:'pointer',fontSize:'9px',fontWeight:active?700:400,transition:'all .1s',whiteSpace:'nowrap'}
    }, label);
  };

  const storePill = num => {
    const sel = num===selStore;
    const col = fobColor(num);
    const cnt = fileCount(num);
    return btn({key:num, onClick:()=>setSelStore(num),
      style:{padding:'3px 10px',borderRadius:20,border:`.5px solid ${sel?col:'var(--bdr)'}`,
        background:sel?col+'18':'transparent',color:sel?col:'var(--text)',
        cursor:'pointer',fontSize:'10px',fontWeight:sel?700:400,
        display:'flex',gap:4,alignItems:'center',transition:'all .1s',whiteSpace:'nowrap'}
    },
      span({style:{fontVariantNumeric:'tabular-nums'}},num),
      cnt<5&&span({style:{fontSize:'8px',color:sel?col:'var(--text3)',opacity:.7}},cnt+'/5')
    );
  };

  return div({style:{borderBottom:'.5px solid var(--bdr)',background:'var(--surf2)',flexShrink:0}},
    // Scope row — only shown when multiple operators loaded
    multiOp && div({style:{padding:'4px 16px 0',display:'flex',gap:4,alignItems:'center',flexWrap:'wrap'}},
      span({style:{fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text3)',marginRight:4,whiteSpace:'nowrap'}},'Filter:'),
      scopePill('All ('+storeNums.length+')', 'all'),
      ...operators.map(op => scopePill(op.split(' ')[0]+' ('+opGroups[op].length+')', op))
    ),
    // Store pills row
    div({style:{padding:multiOp?'4px 16px 6px':'6px 16px',display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}},
      span({style:{fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text3)',marginRight:4,whiteSpace:'nowrap'}},'Store:'),
      ...visibleNums.map(storePill),
      !multiOp && storeNums.length>1 && span({style:{fontSize:'9px',color:'var(--text3)',marginLeft:4}},storeNums.length+' loaded')
    )
  );
}

export function FOBEOMPanel({stores, ds, settings, onClose}) {
  // storeData: { [storeNum]: { contributors, onhand, summary, variance, pl, history } }
  const [storeData,    setStoreData]    = useState({});
  const [selStore,     setSelStore]     = useState('');
  const [errors,       setErrors]       = useState({});
  const [tab,          setTab]          = useState('recount');
  const [fobSettings,  setFobSettings]  = useState(() => loadFobSettings());
  const [showFobSet,   setShowFobSet]   = useState(false);
  const [selClasses,   setSelClasses]   = useState(() => {
    try { const s=JSON.parse(localStorage.getItem('mf_eom_classes')||'[]'); return new Set(Array.isArray(s)?s:[]); } catch { return new Set(); }
  });
  const updateSelClasses = (next) => {
    setSelClasses(next);
    try { localStorage.setItem('mf_eom_classes', JSON.stringify([...next])); } catch {}
  };

  // Route each uploaded file to the right store bucket by parsing store# from filename
  const onLoad = useCallback((type, data, name, err)=>{
    if (err) { setErrors(prev=>({...prev,[name]:err})); return; }
    const m = name.match(/^(\d{3,5})_/);
    const storeNum = m ? m[1] : 'unknown';
    setStoreData(prev=>{
      const slot = {...(prev[storeNum]||{}), [type]: data};
      return {...prev, [storeNum]: slot};
    });
    // Auto-select first store loaded
    setSelStore(prev=>prev||storeNum);
  },[]);

  // Files for the currently selected store
  const loadedFiles = useMemo(()=>storeData[selStore]||{},[storeData,selStore]);

  const allClasses = useMemo(()=>{
    const s=new Set();
    (loadedFiles.onhand||[]).forEach(r=>r.cls&&s.add(r.cls));
    (loadedFiles.summary||[]).forEach(r=>r.cls&&s.add(r.cls));
    (loadedFiles.variance||[]).forEach(r=>r.cls&&s.add(r.cls));
    return [...s].filter(Boolean).sort();
  },[loadedFiles]);

  const analysis = useMemo(()=>{
    const {contributors,onhand,summary,variance,pl} = loadedFiles;
    if (!contributors&&!onhand&&!variance) return null;
    const byClass = r => !selClasses.size || selClasses.has(r.cls||'');
    return analyzeData({
      contributors: contributors||null,
      onHand:   onhand   ? onhand.filter(byClass)   : null,
      summary:  summary  ? summary.filter(byClass)  : null,
      variance: variance ? variance.filter(byClass) : null,
      pl: pl||null,
    });
  },[loadedFiles, selClasses]);

  // Detect period from any loaded filename
  const period = useMemo(()=>{
    const allNames = Object.values(storeData).flatMap(s=>Object.keys(s));
    // filenames not tracked directly — derive from contributors header if available
    const contrib = loadedFiles.contributors;
    if (!contrib||!contrib.length) return 'Current Month';
    return 'June 2026'; // TODO: parse from file metadata
  },[loadedFiles,storeData]);

  const anyLoaded = Object.keys(storeData).length>0;
  const hasData = !!analysis;

  const TABS = [
    {id:'recount',   label:'Priority Recount',  badge:analysis?.recountList?.length},
    {id:'anomaly',   label:'Case Count Review',  badge:analysis?.countAlerts?.length},
    {id:'compliance',label:'Count Compliance'},
    {id:'ops',       label:'Operational Issues', badge:analysis?.noOH?.length},
    {id:'upload',    label:'+ Add Files'},
  ];

  const tabBtn = t=>btn({key:t.id,
    onClick:()=>setTab(t.id),
    style:{padding:'6px 12px',fontSize:'10px',fontWeight:tab===t.id?700:400,border:'none',
      borderBottom:tab===t.id?'2px solid var(--accent)':'2px solid transparent',
      background:'transparent',color:tab===t.id?'var(--accent)':'var(--text3)',cursor:'pointer',
      whiteSpace:'nowrap',display:'flex',gap:4,alignItems:'center'}
  },
    t.label,
    t.badge>0&&span({style:{fontSize:'8px',fontWeight:700,padding:'1px 5px',borderRadius:9,
      background:'rgba(239,68,68,.15)',color:'#ef4444'}},''+t.badge)
  );

  return div({style:{position:'fixed',inset:0,background:'var(--bg)',display:'flex',flexDirection:'column',zIndex:100}},
    // Header
    div({style:{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,background:'var(--surf2)'}},
      div({style:{flex:1}},
        div({style:{fontWeight:700,fontSize:'14px',color:'var(--text)'}},
          'FOB End-of-Month Troubleshooter',
          selStore&&span({style:{marginLeft:8,fontSize:'12px',color:'var(--text3)',fontWeight:400}},'Store '+selStore),
          period&&span({style:{marginLeft:6,fontSize:'11px',color:'var(--text3)',fontWeight:400}},'· '+period)
        ),
        div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},'Identify count accuracy issues before EOM close · Food & Condiment items only')
      ),
      hasData&&div({style:{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2}},
        h(PrintReport,{analysis,storeName:'Store '+selStore,period,selClasses}),
        selClasses.size>0&&span({style:{fontSize:'8px',color:'var(--accent)',letterSpacing:'.3px',opacity:.8}},
          'Printing: '+[...selClasses].sort().join(', ')+' only'
        )
      ),
      btn({onClick:()=>setShowFobSet(v=>!v),title:'Edit FOB tolerances',
        style:{padding:'4px 10px',fontSize:'11px',border:'.5px solid var(--bdr)',borderRadius:4,
          background:showFobSet?'var(--amber)':'transparent',color:showFobSet?'#000':'var(--text3)',cursor:'pointer'}},
        '⚙ Tolerances'),
      btn({onClick:onClose,style:{padding:'4px 10px',fontSize:'13px',border:'.5px solid var(--bdr)',borderRadius:4,background:'transparent',color:'var(--text)',cursor:'pointer'}},'✕')
    ),

    // Tolerance settings editor (collapsible)
    showFobSet&&h(FobSettingsEditor,{settings:fobSettings,onChange:s=>{setFobSettings(s);setShowFobSet(false);}}),

    // Store selector (appears when any files loaded)
    anyLoaded&&h(StoreSelectorBar,{storeData,selStore,setSelStore,stores}),

    // FOB Status (when data loaded for selected store)
    hasData&&analysis.fobStatus.length>0&&h(FOBStatusBar,{fobStatus:analysis.fobStatus,fobSettings}),

    // Class filter row — only shown when data has multiple classes
    anyLoaded&&allClasses.length>1&&div({style:{display:'flex',gap:4,alignItems:'center',padding:'5px 16px',borderBottom:'.5px solid var(--bdr)',background:'var(--surf2)',flexShrink:0,flexWrap:'wrap'}},
      span({style:{fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text3)',marginRight:4,whiteSpace:'nowrap'}},'Class Filter (view & print):'),
      btn({onClick:()=>updateSelClasses(new Set()),
        style:{padding:'2px 9px',borderRadius:20,fontSize:'9px',cursor:'pointer',whiteSpace:'nowrap',
          background:!selClasses.size?'rgba(245,188,0,.18)':'transparent',
          color:!selClasses.size?'var(--amber)':'var(--text3)',
          border:!selClasses.size?'1px solid rgba(245,188,0,.4)':'.5px solid var(--bdr)',
          fontWeight:!selClasses.size?700:400}},'All ('+allClasses.length+')'),
      ...allClasses.map(cls=>{
        const active=selClasses.has(cls);
        return btn({key:cls,
          onClick:()=>updateSelClasses((prev=>{const n=new Set(prev);active?n.delete(cls):n.add(cls);return n;})(selClasses)),
          style:{padding:'2px 9px',borderRadius:20,fontSize:'9px',cursor:'pointer',whiteSpace:'nowrap',
            background:active?'rgba(96,165,250,.15)':'transparent',
            color:active?'var(--accent)':'var(--text3)',
            border:active?'1px solid rgba(96,165,250,.4)':'.5px solid var(--bdr)',
            fontWeight:active?700:400}},cls);
      })
    ),
    // Tab bar
    div({style:{display:'flex',gap:0,padding:'0 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,overflowX:'auto',background:'var(--surf)'}},
      ...(anyLoaded?TABS:TABS.filter(t=>t.id==='upload')).map(tabBtn)
    ),

    // Tab content
    div({style:{flex:1,overflowY:'auto'}},
      (!anyLoaded||tab==='upload')&&div({style:{padding:16}},
        anyLoaded&&div({style:{marginBottom:12}},
          div({style:{fontSize:'10px',fontWeight:700,color:'var(--text)',marginBottom:6}},
            'Loaded stores — drop more files to add or update'
          ),
          div({style:{display:'flex',gap:6,flexWrap:'wrap'}},
            ...Object.entries(storeData).map(([num, files])=>{
              const cnt=Object.values(files).filter(Boolean).length;
              return div({key:num,style:{padding:'4px 10px',borderRadius:4,border:'.5px solid var(--bdr)',background:'var(--surf2)',fontSize:'10px'}},
                span({style:{fontWeight:700}},'Store '+num),
                span({style:{marginLeft:4,color:'var(--text3)'}},'('+cnt+'/5 files)')
              );
            })
          )
        ),
        h(UploadZone,{loadedFiles,onLoad}),
        Object.entries(errors).length>0&&div({style:{marginTop:8}},
          ...Object.entries(errors).map(([k,e])=>div({key:k,style:{padding:'4px 8px',background:'rgba(239,68,68,.08)',color:'#ef4444',borderRadius:4,fontSize:'10px',marginBottom:4}},'Error: '+e))
        )
      ),
      hasData&&tab==='recount'&&h(RecountSection,{recountList:analysis.recountList}),
      hasData&&tab==='anomaly'&&h(CountAnomalySection,{countAlerts:analysis.countAlerts}),
      hasData&&tab==='compliance'&&h(ComplianceSection,{complianceIssues:analysis.complianceIssues,onHand:loadedFiles.onhand||[]}),
      hasData&&tab==='ops'&&div(null,
        analysis.noOH.length===0
          ? div({style:{padding:16,color:'var(--text3)',fontSize:'12px'}},'No unresolvable operational variance items found.')
          : h(OperationalIssuesSection,{noOH:analysis.noOH})
      )
    )
  );
}

export default FOBEOMPanel;
