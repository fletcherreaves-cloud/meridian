// @ts-nocheck
import * as React from 'react';
import { STORE_NAMES, sName, getKB } from '../constants.js';
import { runWhyEngineScan } from '../engine/why.js';

const h    = React.createElement;
const div  = (props, ...c) => h('div',    props, ...c);
const span = (props, ...c) => h('span',   props, ...c);
const btn  = (props, ...c) => h('button', props, ...c);

// GM COACHING BRIEF  (v185)
// AI-generated plain-language weekly brief designed for the GM, not DM.
// Uses Anthropic API (Claude-in-Meridian) to write the actual content.
// Data: last week's performance → AI generates 5-bullet coaching note.
// ════════════════════════════════════════════════════════════════════════════════
// GM COACHING BRIEF ENGINE  (v4.199 — Engine 3)
// ════════════════════════════════════════════════════════════════════════════════
// Generates AI coaching letters for GMs, either one at a time (Single mode) or
// for the entire district in one pass (Batch mode) — the "force multiplier"
// capability: one supervisor can maintain a consistent, data-grounded coaching
// cadence with all 27 GMs, not just the handful they have time to visit.
//
// Data source: the ALREADY-COMPUTED `store` object from buildStore() — p/p2/p4
// (6wk/4wk/2wk compute6wk snapshots), findings (typed crit/watch/ok strings
// from buildBrief), opsScore/ctrlScore, pSales/pLY. No new computation; this is
// a synthesis + prompt layer, same philosophy as DistrictPriorityBrief.
//
// Trend direction (6wk → 4wk → 2wk) is precomputed here and stated explicitly
// in the prompt rather than left for the model to infer — for metrics where
// "lower is better" (laborPct, oepe) vs "higher is better" (tpph), inferring
// direction wrong would produce a coaching letter praising or scolding the
// wrong trend. Findings strings from buildBrief are fed in near-verbatim since
// they're already specific and root-cause-attributed — the model's job is
// tone and structure, not re-deriving what's wrong.
//
// Every letter is a DRAFT pending human review — editable in place, with an
// explicit "Reviewed" toggle, before copy/print. This is intentional: these
// are coaching artifacts going to real people and a human should see every
// one before it's used, even though the first draft is AI-written.
// ─────────────────────────────────────────────────────────────────────────────
function GMCoachingBrief({stores, ds, settings, userEvents, onClose}) {
  const [mode,      setMode]      = React.useState('single'); // 'single' | 'batch'
  const [selLoc,    setSelLoc]    = React.useState(
    Object.keys(STORE_NAMES).sort((a,b)=>STORE_NAMES[a].localeCompare(STORE_NAMES[b]))[0]
  );
  // Single-mode state
  const [loading,   setLoading]   = React.useState(false);
  const [brief,     setBrief]     = React.useState(null);
  const [editText,  setEditText]  = React.useState(null); // null = not editing
  const [error,     setError]     = React.useState(null);
  const [copied,    setCopied]    = React.useState(false);
  const [reviewed,  setReviewed]  = React.useState(false);

  // Batch-mode state
  const [batchRunning, setBatchRunning] = React.useState(false);
  const [batchProg,    setBatchProg]    = React.useState(null); // {done,total,storeName}
  const [letters,      setLetters]      = React.useState({});  // {loc:{text,edited,reviewed,error,skipped,ctx}}
  const [expandedLoc,  setExpandedLoc]  = React.useState(null);
  const cancelRef = React.useRef(false);

  const LOCS = Object.keys(STORE_NAMES).sort((a,b)=>STORE_NAMES[a].localeCompare(STORE_NAMES[b]));

  // ── Strip severity prefix for cleaner prompt/display text ──────────────────
  const stripPrefix = (msg) => (msg||'')
    .replace(/^CRITICAL\s*—\s*/,'').replace(/^WATCH\s*—\s*/,'')
    .replace(/^STRENGTH\s*—\s*/,'').replace(/^INTEGRITY ALERT\s*—\s*/,'')
    .replace(/^OPPORTUNITY\s*—\s*/,'').replace(/^RECORD\s*—\s*/,'')
    .replace(/^AI FORECAST:\s*/,'');

  // ── Trend direction: 6wk → 4wk → 2wk, with explicit better/worse semantics ──
  const trendOf = (v6,v4,v2,threshold,lowerIsBetter) => {
    if(v6==null||v2==null) return null;
    const delta = v2-v6;
    if(Math.abs(delta) < threshold) return {dir:'stable', delta, v6,v4,v2};
    const better = lowerIsBetter ? delta<0 : delta>0;
    return {dir: better?'improving':'worsening', delta, v6,v4,v2};
  };

  // ── Build the full coaching context for one store from buildStore output ───
  // Pulls only — no recomputation. store.p/p2/p4 are 6wk/2wk/4wk compute6wk()
  // snapshots already attached by buildStore; store.findings are buildBrief()
  // output, already typed and root-cause specific.
  const buildContext = React.useCallback((loc) => {
    const store = (stores||[]).find(s=>s.loc===loc);
    if(!store) return null;
    const {p,p2,p4,t,opsScore,ctrlScore,pSales,pLY,findings=[],gm,operator,sup,city,state} = store;
    const vsLY = pSales>0&&pLY>0 ? (pSales-pLY)/pLY : null;
    const hasEnoughData = (pSales>0) || (p&&(p.laborPct>0||p.tpph>0||p.oepe>0));

    const laborTrend = trendOf(p?.laborPct,p4?.laborPct,p2?.laborPct,0.003,true);
    const tpphTrend   = trendOf(p?.tpph,    p4?.tpph,    p2?.tpph,    0.10, false);
    const oepeTrend   = trendOf(p?.oepe,    p4?.oepe,    p2?.oepe,    5,    true);

    const crits  = findings.filter(f=>f.t==='crit').slice(0,2);
    const watches= findings.filter(f=>f.t==='watch').slice(0,2);
    const oks    = findings.filter(f=>f.t==='ok').slice(0,2);
    const fcLine = findings.find(f=>f.t==='fc');

    const kb = getKB(loc);

    // ── Why Engine: 4-week scan for root-cause specificity ───────────────
    // ~28 forecastDay calls, synchronous, runs once per letter generation.
    // Gives the prompt actual attribution data (weather/ops/event composition,
    // unexplained rate, worst DOW) so the model can write a grounded INSIGHT
    // rather than generic operational commentary.
    const whyScan = ds&&ds.loaded ? runWhyEngineScan(loc, ds, userEvents, settings, 4) : null;

    return{store,loc,storeName:STORE_NAMES[loc]||loc,city,state,gm,operator,sup,
      opsScore,ctrlScore,pSales,pLY,vsLY,hasEnoughData,
      laborTrend,tpphTrend,oepeTrend,t,
      crits,watches,oks,fcLine,kbNote:kb&&(kb.note||kb.notes)||'',
      whyScan};
  },[stores, ds, userEvents, settings]);

  // ── Prompt construction ─────────────────────────────────────────────────────
  const buildPrompt = (ctx) => {
    const fmt$=v=>v?'$'+Math.round(v).toLocaleString():'unknown';
    const fmtP=v=>v!=null?(v*100).toFixed(1)+'%':'unknown';
    const orgLabel = ctx.state==='FL'?'Florida (Emerald Arches)':'Oklahoma (MCDOK)';
    const gmFirst = ctx.gm ? ctx.gm.split(' ')[0] : null;

    const trendLine=(label,tr,fmtFn)=>{
      if(!tr) return null;
      return label+': '+fmtFn(tr.v6)+' (6wk) -> '+fmtFn(tr.v4)+' (4wk) -> '+fmtFn(tr.v2)+' (2wk) -- '+tr.dir.toUpperCase();
    };
    const lines=[
      trendLine('Labor %', ctx.laborTrend, fmtP),
      trendLine('TPPH',    ctx.tpphTrend,  v=>v!=null?v.toFixed(2):'unknown'),
      trendLine('OEPE',    ctx.oepeTrend,  v=>v!=null?Math.round(v)+'s':'unknown'),
    ].filter(Boolean).join('\n');

    const findingsBlock = [
      ...ctx.crits.map(f=>'CRITICAL: '+stripPrefix(f.m)),
      ...ctx.watches.map(f=>'WATCH: '+stripPrefix(f.m)),
      ...ctx.oks.map(f=>'STRENGTH: '+stripPrefix(f.m)),
    ].join('\n') || 'No specific flags this period -- performance is within normal ranges across the board.';

    const hasCritical = ctx.crits.length>0;

    // ── Why Engine accuracy block (when scan ran) ─────────────────────────────
    const DOW_NAMES=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const BUCKET_SHORT={event:'tagged event',regional:'regional pattern',weather:'weather',
      isolated_anomaly:'store anomaly',contributing_factors:'minor factors',unexplained:'unexplained'};
    let accuracyBlock='';
    if(ctx.whyScan&&ctx.whyScan.n>=5){
      const ws=ctx.whyScan;
      const topBucket=Object.entries(ws.bucketCounts).sort((a,b)=>b[1]-a[1])[0];
      const topBucketDesc=topBucket?BUCKET_SHORT[topBucket[0]]||topBucket[0]:'';
      const worstDOW=ws.worstDOW?DOW_NAMES[ws.worstDOW.dow]:null;
      accuracyBlock='\nForecast accuracy (last 4 weeks, '+ws.n+' days):\n'+
        '- MAPE: '+ws.mape+'% ('+(ws.mape<8?'excellent':ws.mape<12?'acceptable':'needs attention')+')\n'+
        '- Misses explained: '+ws.explainedPct+'% (main cause: '+(topBucketDesc||'mixed')+')\n'+
        (ws.bucketCounts.unexplained?' - Unexplained misses: '+ws.bucketCounts.unexplained+' days — no clear cause identified\n':'')+
        (worstDOW?' - Worst day-of-week for forecast accuracy: '+worstDOW+'\n':'')+
        (ws.avgWeatherDollars&&Math.abs(ws.avgWeatherDollars)>20?' - Avg weather adjustment: '+(ws.avgWeatherDollars>0?'+':'')+Math.round(ws.avgWeatherDollars)+'/day\n':'')+
        (ws.avgOpsDollars&&Math.abs(ws.avgOpsDollars)>20?' - Avg ops adjustment: '+(ws.avgOpsDollars>0?'+':'')+Math.round(ws.avgOpsDollars)+'/day\n':'');
    }

    return 'You are writing a weekly performance coaching letter for the General Manager at a McDonald\'s restaurant.\n\n'+
'Store: '+ctx.storeName+' (#'+ctx.loc+'), '+orgLabel+(ctx.city?', '+ctx.city:'')+'\n'+
(gmFirst?'GM: '+gmFirst+'\n':'')+
(ctx.kbNote?'Context: '+ctx.kbNote+'\n':'')+
'\nTrend (most recent 6 weeks, showing trajectory):\n'+
(lines||'Insufficient trend data this period.')+'\n\n'+
'Scores: Ops '+(ctx.opsScore!=null?ctx.opsScore+'/100':'unknown')+' . Controls '+(ctx.ctrlScore!=null?ctx.ctrlScore+'/100':'unknown')+' (0-100 scale, 90+ = elite, 80+ = strong)\n'+
'Sales (4wk): '+fmt$(ctx.pSales)+(ctx.vsLY!=null?' ('+(ctx.vsLY>=0?'+':'')+(ctx.vsLY*100).toFixed(1)+'% vs LY)':'')+'\n\n'+
'Specific findings this period:\n'+findingsBlock+'\n\n'+
(accuracyBlock||'')+
(ctx.fcLine?'Forward signal: '+stripPrefix(ctx.fcLine.m)+'\n':'')+
'\nWrite a coaching letter with exactly 5 short paragraphs, each starting with a bold label in brackets:\n\n'+
'[WIN] One specific, genuine win. Reference an actual strength or trend from the data above. Be precise, not hollow.\n'+
'[FOCUS] The single most important opportunity this week.'+(hasCritical?' A CRITICAL finding is present above -- this section MUST address it directly and specifically. Do not write something generic instead.':' Use the WATCH findings or trend data to identify the sharpest opportunity.')+'\n'+
'[ACTION] One concrete action the GM can take this week. Be specific -- name, time, daypart, or metric.\n'+
'[INSIGHT] One non-obvious insight the GM might not have made themselves. '+(ctx.whyScan&&ctx.whyScan.explainedPct<50?' The forecast accuracy data shows '+(100-ctx.whyScan.explainedPct)+'% of misses have no clear cause -- consider whether the GM is missing event context (untagged closures, local events) or whether a specific pattern (like '+( ctx.whyScan.worstDOW?DOW_NAMES[ctx.whyScan.worstDOW.dow]+' accuracy':'')+') suggests a scheduling or pricing opportunity.':'Link a trend, a metric, and a finding together in a way that reveals something the GM\'s gut-check alone would miss.')+'\n'+
'[NEXT WEEK] What to watch for next week and why, grounded in the forward signal if provided.\n\n'+
'Rules:\n'+
'- Write directly TO the GM'+(gmFirst?' by name ('+gmFirst+')':'')+', as a coach would. Use "you" and "your team."\n'+
'- Ground every claim in the data provided above. Do not invent numbers or events not given.\n'+
'- No corporate jargon, no buzzwords. Plain, direct, human language.\n'+
'- Be honest about gaps. Only celebrate genuine wins.\n'+
'- Each paragraph: 2-3 sentences maximum.\n'+
'- Do not mention Meridian, software, or "the data" explicitly -- sound like a human field coach who knows this store.';
  };

  // ── API call (established app pattern: localStorage key, no server) ────────
  const callClaude = async (prompt) => {
    const resp = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({model:'claude-sonnet-4-6', max_tokens:1000, messages:[{role:'user',content:prompt}]})
    });
    const json = await resp.json();
    if(json.error) throw new Error(json.error.message||'API error');
    return (json.content||[]).map(b=>b.text||'').join('\n').trim();
  };

  // ── Single-store generation ─────────────────────────────────────────────────
  const generateSingle = async () => {
    const ctx = buildContext(selLoc);
    if(!ctx||!ctx.hasEnoughData){
      setError('Not enough data for '+STORE_NAMES[selLoc]+'. Load an Operations Report or Labor Analysis first.');
      return;
    }
    setLoading(true); setError(null); setBrief(null); setEditText(null); setReviewed(false);
    try{
      const text = await callClaude(buildPrompt(ctx));
      setBrief(text);
    }catch(e){
      setError('Could not generate letter: '+e.message+'. Check your network connection and Anthropic API key in Settings.');
    }
    setLoading(false);
  };

  // ── Batch generation: all 27, sequential, paced ─────────────────────────────
  const generateBatch = async () => {
    const candidates = LOCS.map(l=>buildContext(l)).filter(Boolean);
    const eligible = candidates.filter(c=>c.hasEnoughData);
    if(!eligible.length){ alert('No stores have enough data loaded yet.'); return; }
    if(!window.confirm(
      'Generate coaching letters for '+eligible.length+' store'+(eligible.length!==1?'s':'')+'?\n\n'+
      'This calls the Anthropic API once per store and typically takes 1-2 minutes.\n'+
      'Every letter is a draft -- review and edit before sharing with a GM.'
    )) return;

    cancelRef.current=false;
    setBatchRunning(true);
    setLetters({});
    setBatchProg({done:0,total:eligible.length,storeName:'Starting…'});

    const results={};
    // Mark skipped stores immediately so the list shows the full district
    candidates.filter(c=>!c.hasEnoughData).forEach(c=>{results[c.loc]={skipped:true,ctx:c};});
    setLetters({...results});

    for(let i=0;i<eligible.length;i++){
      if(cancelRef.current) break;
      const ctx=eligible[i];
      setBatchProg({done:i,total:eligible.length,storeName:ctx.storeName});
      try{
        const text=await callClaude(buildPrompt(ctx));
        results[ctx.loc]={text,edited:text,reviewed:false,ctx};
      }catch(e){
        results[ctx.loc]={error:e.message,ctx};
      }
      setLetters({...results});
      await new Promise(r=>setTimeout(r,350)); // light client-side pacing between calls
    }
    if(!cancelRef.current) setBatchProg({done:eligible.length,total:eligible.length,storeName:'Done'});
    setBatchRunning(false);
  };

  const cancelBatch = () => { cancelRef.current=true; setBatchRunning(false); };

  const retryOne = async (loc) => {
    const ctx = buildContext(loc);
    if(!ctx) return;
    setLetters(prev=>({...prev,[loc]:{...prev[loc], loading:true, error:null}}));
    try{
      const text=await callClaude(buildPrompt(ctx));
      setLetters(prev=>({...prev,[loc]:{text,edited:text,reviewed:false,ctx,loading:false}}));
    }catch(e){
      setLetters(prev=>({...prev,[loc]:{...prev[loc],error:e.message,loading:false}}));
    }
  };

  // ── Copy / Print (parametrized so batch cards reuse the same logic) ────────
  const doCopy = (loc,text,setCopiedFlag) => {
    navigator.clipboard.writeText('COACHING LETTER — '+(STORE_NAMES[loc]||loc)+'\n\n'+text)
      .then(()=>{setCopiedFlag(true);setTimeout(()=>setCopiedFlag(false),2000);});
  };
  const doPrint = (loc,text) => {
    const storeName=STORE_NAMES[loc]||loc;
    const now=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
    const formatted=text.replace(/\[([A-Z\s]+)\]/g,'<strong style="color:#0f172a;font-size:12px;letter-spacing:.05em;text-transform:uppercase">$1</strong>').replace(/\n\n/g,'</p><p style="margin-top:14px">');
    const html='<!DOCTYPE html><html><head><meta charset="utf-8"><title>Coaching Letter — '+storeName+'</title>'+
'<style>body{font-family:\'Georgia\',serif;max-width:620px;margin:40px auto;color:#111;line-height:1.7;font-size:15px}'+
'h1{font-size:22px;font-weight:800;margin-bottom:4px;font-family:\'Arial Black\',sans-serif}'+
'.meta{color:#6b7280;font-size:12px;margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #000}'+
'.brief{white-space:pre-line}@media print{body{margin:20px}}</style></head><body>'+
'<div class="no-print" style="margin-bottom:20px">'+
'  <button onclick="window.print()" style="background:#0f172a;color:white;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-size:13px">🖨 Print / Save PDF</button>'+
'</div>'+
'<h1>Coaching Letter</h1>'+
'<div class="meta">'+storeName+' · '+now+'</div>'+
'<div class="brief"><p style="margin:0">'+formatted+'</p></div>'+
'</body></html>';
    const w=window.open('','_blank');
    if(w){w.document.write(html);w.document.close();}
  };

  // ── Format brief text with section highlighting ─────────────────────────────
  const formatBrief = (text) => {
    if(!text) return null;
    return text.split('\n\n').map((para,i)=>{
      const m=para.match(/^\[([A-Z\s]+)\](.*)/s);
      if(m) return div({key:i,style:{marginBottom:14,padding:'12px 14px',background:'var(--surf2)',
        borderRadius:'var(--r)',borderLeft:'3px solid var(--amber)'}},
        div({style:{fontSize:'8px',fontWeight:800,letterSpacing:'.06em',color:'var(--amber)',
          textTransform:'uppercase',marginBottom:5}},m[1]),
        div({style:{fontSize:'11px',lineHeight:1.7,color:'var(--text)'}},m[2].trim())
      );
      return div({key:i,style:{marginBottom:10,fontSize:'11px',lineHeight:1.7,color:'var(--text)'}},para);
    });
  };

  // ── No-data guard ────────────────────────────────────────────────────────────
  const hasAnyData = ds&&ds.loaded;
  if(!hasAnyData) return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:461,display:'flex',alignItems:'center',justifyContent:'center'}},
    div({style:{textAlign:'center',color:'var(--text3)',padding:40}},
      div({style:{fontSize:40,marginBottom:12}},'👨‍💼'),
      div({style:{fontSize:'14px',fontWeight:700,color:'var(--text)',marginBottom:8}},'No Data Loaded'),
      div({style:{fontSize:'11px',marginBottom:16,lineHeight:1.6}},'Load an Operations Report or Labor Analysis to generate coaching letters.'),
      btn({className:'btn btn-sm',onClick:onClose},'Close')));

  // ── Batch card (collapsed/expanded list item) ───────────────────────────────
  const BatchCard = ({loc, entry}) => {
    if(!entry) return null;
    const isExp = expandedLoc===loc;
    const ctx = entry.ctx;
    const trendArrow = ctx&&ctx.laborTrend ? (ctx.laborTrend.dir==='worsening'?'📈':ctx.laborTrend.dir==='improving'?'📉':'→') : null;
    const trendCol = ctx&&ctx.laborTrend ? (ctx.laborTrend.dir==='worsening'?'#ef4444':ctx.laborTrend.dir==='improving'?'#10b981':'var(--text3)') : 'var(--text3)';

    if(entry.skipped) return div({style:{padding:'7px 12px',borderRadius:'var(--r)',
      background:'rgba(255,255,255,.02)',border:'.5px solid var(--bdr)',marginBottom:6,
      display:'flex',alignItems:'center',gap:8,opacity:.5}},
      span({style:{fontSize:'9px',fontWeight:600,color:'var(--text3)'}},STORE_NAMES[loc]||loc),
      span({style:{fontSize:'8px',color:'var(--text3)',marginLeft:'auto'}},'— not enough data —'));

    return div({style:{borderRadius:'var(--r)',border:'.5px solid '+(entry.error?'rgba(239,68,68,.3)':entry.reviewed?'rgba(16,185,129,.3)':'var(--bdr)'),
      background:entry.error?'rgba(239,68,68,.04)':'var(--surf2)',marginBottom:6,overflow:'hidden'}},
      div({style:{padding:'8px 12px',display:'flex',alignItems:'center',gap:8,cursor:'pointer'},
        onClick:()=>setExpandedLoc(isExp?null:loc)},
        span({style:{fontSize:'9px',fontWeight:700,color:'var(--amber)'}},STORE_NAMES[loc]||loc),
        ctx&&ctx.gm&&span({style:{fontSize:'8px',color:'var(--text3)'}},'· '+ctx.gm.split(' ')[0]),
        trendArrow&&span({style:{fontSize:'9px',color:trendCol}},trendArrow+' labor'),
        ctx&&ctx.opsScore!=null&&span({style:{fontSize:'8px',color:'var(--text3)'}},'Ops '+ctx.opsScore),
        ctx&&ctx.crits&&ctx.crits.length>0&&span({style:{fontSize:'7px',padding:'1px 6px',borderRadius:99,
          background:'rgba(239,68,68,.15)',color:'#ef4444',fontWeight:700}},'🚨 '+ctx.crits.length),
        entry.loading&&span({style:{fontSize:'8px',color:'var(--text3)'}},'⏳ regenerating…'),
        entry.error&&span({style:{fontSize:'8px',color:'#ef4444'}},'⚠ failed'),
        entry.reviewed&&span({style:{fontSize:'8px',color:'#10b981'}},'✓ reviewed'),
        span({style:{marginLeft:'auto',fontSize:'9px',color:'var(--text3)'}},isExp?'▲':'▼')
      ),
      isExp&&div({style:{padding:'0 12px 12px'}},
        entry.error&&div({style:{padding:'8px 10px',background:'rgba(239,68,68,.08)',borderRadius:'var(--r)',
          fontSize:'9px',color:'#f87171',marginBottom:8}},
          'Generation failed: '+entry.error,
          btn({style:{marginLeft:8,fontSize:'8px',padding:'2px 8px',background:'rgba(239,68,68,.15)',
            border:'.5px solid rgba(239,68,68,.3)',borderRadius:4,color:'#f87171',cursor:'pointer'},
            onClick:()=>retryOne(loc)},'↻ Retry')),
        entry.text&&div(null,
          div({style:{display:'flex',gap:6,marginBottom:8,flexWrap:'wrap'}},
            btn({style:{fontSize:'8px',padding:'3px 9px',borderRadius:4,background:'rgba(245,158,11,.1)',
              border:'.5px solid rgba(245,158,11,.25)',color:'var(--amber)',cursor:'pointer'},
              onClick:()=>setLetters(p=>({...p,[loc]:{...p[loc],editing:!p[loc].editing}}))},
              entry.editing?'✓ Done editing':'✎ Edit'),
            btn({style:{fontSize:'8px',padding:'3px 9px',borderRadius:4,background:'var(--surf3)',
              border:'.5px solid var(--bdr)',color:'var(--text2)',cursor:'pointer'},
              onClick:()=>doCopy(loc,entry.edited||entry.text,(v)=>setLetters(p=>({...p,[loc]:{...p[loc],copied:v}})))},
              entry.copied?'✓ Copied':'📋 Copy'),
            btn({style:{fontSize:'8px',padding:'3px 9px',borderRadius:4,background:'var(--surf3)',
              border:'.5px solid var(--bdr)',color:'var(--text2)',cursor:'pointer'},
              onClick:()=>doPrint(loc,entry.edited||entry.text)},'🖨 Print'),
            h('label',{style:{display:'flex',alignItems:'center',gap:4,fontSize:'8px',color:'var(--text3)',
              marginLeft:'auto',cursor:'pointer'}},
              h('input',{type:'checkbox',checked:!!entry.reviewed,
                onChange:e=>setLetters(p=>({...p,[loc]:{...p[loc],reviewed:e.target.checked}}))}),
              'Mark reviewed')
          ),
          entry.editing
            ? h('textarea',{value:entry.edited!=null?entry.edited:entry.text,
                onChange:e=>setLetters(p=>({...p,[loc]:{...p[loc],edited:e.target.value}})),
                style:{width:'100%',minHeight:200,background:'var(--surf)',border:'.5px solid var(--bdr)',
                  borderRadius:'var(--r)',color:'var(--text)',fontSize:'10px',padding:8,lineHeight:1.6,
                  fontFamily:'inherit',resize:'vertical'}})
            : div(null,...formatBrief(entry.edited||entry.text))
        )
      )
    );
  };

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:461,
    display:'flex',alignItems:'flex-start',justifyContent:'center',padding:20,paddingTop:24}},
    div({style:{background:'var(--surf)',border:'.5px solid var(--bdr2)',borderRadius:'var(--rl)',
      width:'100%',maxWidth:760,maxHeight:'90vh',display:'flex',flexDirection:'column',
      boxShadow:'0 20px 60px rgba(0,0,0,.5)',overflow:'hidden'}},

      // Header
      div({style:{padding:'12px 16px',borderBottom:'.5px solid var(--bdr)',background:'var(--surf2)',
        display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},
        span({style:{fontSize:'18px'}},'👨‍💼'),
        div({style:{flex:1}},
          div({style:{fontSize:'13px',fontWeight:800,color:'var(--text)'}},'GM Coaching Letters'),
          div({style:{fontSize:'9px',color:'var(--text3)'}},'AI-drafted, data-grounded coaching for your GMs — every letter is a draft for your review')
        ),
        div({style:{display:'flex',gap:3}},
          ...[['single','Single Store'],['batch','All 27 (Batch)']].map(([id,l])=>
            btn({key:id,style:{fontSize:'9px',padding:'4px 10px',borderRadius:'var(--r)',
              background:mode===id?'var(--adim)':'transparent',
              color:mode===id?'var(--amber)':'var(--text3)',
              border:'.5px solid '+(mode===id?'rgba(245,158,11,.4)':'var(--bdr)'),cursor:'pointer'},
              onClick:()=>setMode(id)},l))
        ),
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'✕')
      ),

      // ════════ SINGLE MODE ════════
      mode==='single'&&React.createElement(React.Fragment,null,
        div({style:{padding:'14px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
          display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},
          div({style:{flex:1}},
            h('select',{value:selLoc,onChange:e=>{setSelLoc(e.target.value);setBrief(null);setError(null);setEditText(null);setReviewed(false);},
              style:{width:'100%',background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
                color:'var(--text)',fontSize:'11px',padding:'5px 8px'}},
              LOCS.map(l=>h('option',{key:l,value:l},sName(l)))
            )
          ),
          btn({className:'btn btn-sm btn-a',style:{fontWeight:700,padding:'6px 18px'},
            disabled:loading,onClick:generateSingle},
            loading?'⏳ Writing…':'✨ Generate'),
          brief&&btn({className:'btn btn-sm',onClick:()=>setEditText(editText!=null?null:brief)},editText!=null?'✓ Done editing':'✎ Edit'),
          brief&&btn({className:'btn btn-sm',onClick:()=>doCopy(selLoc,editText!=null?editText:brief,setCopied)},copied?'✓ Copied':'📋 Copy'),
          brief&&btn({className:'btn btn-sm',onClick:()=>doPrint(selLoc,editText!=null?editText:brief)},'🖨 Print')
        ),
        (()=>{
          const ctx = buildContext(selLoc);
          return ctx&&ctx.hasEnoughData&&div({style:{padding:'6px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
            fontSize:'8px',color:'var(--text3)',background:'rgba(245,158,11,.04)',display:'flex',gap:10,flexWrap:'wrap'}},
            ctx.laborTrend&&span(null,'Labor '+(ctx.laborTrend.dir==='worsening'?'📈':ctx.laborTrend.dir==='improving'?'📉':'→')+' '+ctx.laborTrend.dir),
            ctx.opsScore!=null&&span(null,'Ops '+ctx.opsScore+'/100'),
            ctx.ctrlScore!=null&&span(null,'Controls '+ctx.ctrlScore+'/100'),
            ctx.crits.length>0&&span({style:{color:'#ef4444',fontWeight:700}},'🚨 '+ctx.crits.length+' critical'),
            ctx.vsLY!=null&&span(null,(ctx.vsLY>=0?'+':'')+(ctx.vsLY*100).toFixed(1)+'% vs LY')
          );
        })(),
        div({style:{flex:1,overflowY:'auto',padding:'14px 16px'}},
          error&&div({style:{padding:'12px',background:'rgba(248,113,113,.1)',border:'.5px solid rgba(248,113,113,.3)',
            borderRadius:'var(--r)',color:'#f87171',fontSize:'10px',lineHeight:1.6}},error),
          !brief&&!loading&&!error&&div({style:{color:'var(--text3)',textAlign:'center',padding:'40px 20px',fontSize:'11px'}},
            div({style:{fontSize:40,marginBottom:12}},'👨‍💼'),
            div({style:{fontWeight:700,color:'var(--text)',marginBottom:6,fontSize:'13px'}},'Ready to Generate'),
            div({style:{lineHeight:1.7}},'Select a store and click Generate. The letter draws on trend direction, scores, and the specific findings already flagged for this store — review and edit before sharing.')
          ),
          loading&&div({style:{color:'var(--text3)',textAlign:'center',padding:'30px',fontSize:'11px'}},
            div({style:{fontSize:'24px',marginBottom:10}},'✨'),
            div(null,'Writing letter for '+STORE_NAMES[selLoc]+'…')
          ),
          brief&&React.createElement(React.Fragment,null,
            div({style:{marginBottom:12,padding:'8px 12px',background:'rgba(16,185,129,.08)',
              borderRadius:'var(--r)',fontSize:'8.5px',color:'#34d399',border:'.5px solid rgba(16,185,129,.2)',
              display:'flex',alignItems:'center',gap:8}},
              span({style:{flex:1}},'✓ Draft generated for '+STORE_NAMES[selLoc]+' · '+new Date().toLocaleString()),
              h('label',{style:{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}},
                h('input',{type:'checkbox',checked:reviewed,onChange:e=>setReviewed(e.target.checked)}),
                'Reviewed')
            ),
            editText!=null
              ? h('textarea',{value:editText,onChange:e=>setEditText(e.target.value),
                  style:{width:'100%',minHeight:280,background:'var(--surf2)',border:'.5px solid var(--bdr)',
                    borderRadius:'var(--r)',color:'var(--text)',fontSize:'11px',padding:10,lineHeight:1.7,
                    fontFamily:'inherit',resize:'vertical'}})
              : div(null,...formatBrief(brief))
          )
        )
      ),

      // ════════ BATCH MODE ════════
      mode==='batch'&&React.createElement(React.Fragment,null,
        div({style:{padding:'12px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
          display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},
          div({style:{flex:1,fontSize:'9px',color:'var(--text3)'}},
            Object.keys(letters).length>0
              ? Object.values(letters).filter(l=>l.text).length+' generated · '+
                Object.values(letters).filter(l=>l.reviewed).length+' reviewed · '+
                Object.values(letters).filter(l=>l.skipped).length+' skipped (no data)'
              : 'Generates a coaching letter for every store with enough loaded data, in one pass.'),
          btn({className:'btn btn-sm btn-a',style:{fontWeight:700,padding:'6px 18px'},
            disabled:batchRunning,onClick:generateBatch},
            batchRunning?'⏳ Generating…':'✨ Generate All 27'),
          batchRunning&&btn({className:'btn btn-sm',style:{color:'#f87171'},onClick:cancelBatch},'⏹ Cancel')
        ),
        // Progress bar
        batchRunning&&batchProg&&div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0}},
          div({style:{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:'9px',color:'var(--text3)'}},
            span(null,'Store '+batchProg.done+' of '+batchProg.total+' · '+batchProg.storeName),
            span(null,Math.round(batchProg.done/batchProg.total*100)+'%')
          ),
          div({style:{height:6,background:'var(--surf2)',borderRadius:99,overflow:'hidden'}},
            div({style:{height:'100%',width:Math.round(batchProg.done/batchProg.total*100)+'%',
              background:'var(--amber)',borderRadius:99,transition:'width .3s'}})
          )
        ),
        div({style:{flex:1,overflowY:'auto',padding:'12px 16px'}},
          Object.keys(letters).length===0&&!batchRunning&&div({style:{color:'var(--text3)',textAlign:'center',padding:'40px 20px',fontSize:'11px'}},
            div({style:{fontSize:40,marginBottom:12}},'📋'),
            div({style:{fontWeight:700,color:'var(--text)',marginBottom:6,fontSize:'13px'}},'No Letters Generated Yet'),
            div({style:{lineHeight:1.7}},'Click "Generate All 27" to draft a coaching letter for every store with enough data. Each one is a draft — review, edit, and mark reviewed before sharing.')
          ),
          ...LOCS.filter(l=>letters[l]).map(l=>h(BatchCard,{key:l,loc:l,entry:letters[l]}))
        )
      )
    )
  );
}


export { GMCoachingBrief };
