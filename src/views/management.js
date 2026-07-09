// @ts-nocheck
import * as React from 'react';
import { DEF_SETTINGS, sName, sNameC, STORE_NAMES } from '../constants.js';
import { InfoIcon, calibrateWeather } from '../engine/forecast.js';

const h=React.createElement;
const div=(p,...c)=>h('div',p,...c);
const span=(p,...c)=>h('span',p,...c);
const btn=(p,...c)=>h('button',p,...c);
const inp=(p,...c)=>h('input',p,...c);
const sel=(p,...c)=>h('select',p,...c);
const opt=(p,...c)=>h('option',p,...c);
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ── Developer Dashboard ───────────────────────────────────────────────────────
const DEV_LINKS_KEY = 'mf_dev_links_v1';
const DEV_LINK_DEFAULTS = {
  supabaseUrl:       '',
  supabaseAnonKey:   '',
  netlifyUrl:        '',
  githubRepo:        '',
  appsScriptUrl:     '',
  netlifyAdminUrl:   'https://app.netlify.com',
};

function DevDashboard({settings, onUpdate}) {
  const [links, setLinks] = useState(() => {
    try { return { ...DEV_LINK_DEFAULTS, ...JSON.parse(localStorage.getItem(DEV_LINKS_KEY)||'{}') }; }
    catch { return { ...DEV_LINK_DEFAULTS }; }
  });
  const [sbStatus, setSbStatus] = useState(null); // null|'checking'|'ok'|'error'
  const [sbMsg,    setSbMsg]    = useState('');
  const [lsSize,   setLsSize]   = useState(null);
  const [copied,   setCopied]   = useState('');

  useEffect(() => {
    // Measure localStorage usage
    try {
      let bytes = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        bytes += (localStorage.getItem(k)||'').length * 2;
      }
      setLsSize((bytes/1024).toFixed(1));
    } catch {}
  }, []);

  const saveLinks = (next) => {
    setLinks(next);
    try { localStorage.setItem(DEV_LINKS_KEY, JSON.stringify(next)); } catch {}
  };

  const linkInp = (label, key, placeholder, isKey=false) =>
    div({style:{marginBottom:10}},
      div({style:{fontSize:'10px',fontWeight:600,color:'var(--text2)',marginBottom:3}}, label),
      div({style:{display:'flex',gap:4}},
        inp({
          type: isKey ? 'password' : 'text',
          value: links[key]||'',
          placeholder,
          onChange: e => saveLinks({...links, [key]: e.target.value}),
          style:{flex:1,background:'var(--surf2)',border:'.5px solid var(--bdr)',
            borderRadius:3,padding:'5px 8px',fontSize:11,color:'var(--text)',
            fontFamily: isKey ? 'var(--mono)' : 'inherit'}
        }),
        links[key] && !isKey && h('a', {
          href: links[key].startsWith('http') ? links[key] : 'https://'+links[key],
          target:'_blank', rel:'noopener',
          style:{padding:'4px 8px',background:'var(--surf2)',border:'.5px solid var(--bdr)',
            borderRadius:3,fontSize:11,color:'var(--accent)',textDecoration:'none',
            display:'flex',alignItems:'center'}
        }, '↗')
      )
    );

  const checkSupabase = async () => {
    setSbStatus('checking'); setSbMsg('');
    const url = links.supabaseUrl || (()=>{try{return JSON.parse(localStorage.getItem('mf_supabase')||'{}').url;}catch{return '';}})();
    if (!url) { setSbStatus('error'); setSbMsg('No Supabase URL configured'); return; }
    try {
      const res = await fetch(url+'/rest/v1/', { headers:{ apikey: links.supabaseAnonKey||'' }, signal: AbortSignal.timeout(5000) });
      if (res.ok || res.status===400 || res.status===401) {
        setSbStatus('ok'); setSbMsg('Reachable ('+res.status+')');
      } else {
        setSbStatus('error'); setSbMsg('HTTP '+res.status);
      }
    } catch(e) { setSbStatus('error'); setSbMsg(e.message); }
  };

  const statusDot = (st) => {
    const col = st==='ok'?'#10b981':st==='error'?'#ef4444':st==='checking'?'#f59e0b':'#475569';
    return div({style:{width:8,height:8,borderRadius:'50%',background:col,flexShrink:0}});
  };

  const card = (children) => div({style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',
    borderRadius:6,padding:'12px 14px',marginBottom:12}}, children);

  const sectionHead = (label) => div({style:{fontSize:'9px',fontWeight:700,letterSpacing:'.7px',
    textTransform:'uppercase',color:'var(--text3)',marginBottom:8}}, label);

  // Get version from window (set by App.js via global)
  const version = (typeof window !== 'undefined' && window.__MERIDIAN_VERSION__) || '—';

  return div({style:{display:'flex',flexDirection:'column',gap:0,padding:'2px 0'}},

    // ── Status bar
    card(
      div(null,
        sectionHead('System Status'),
        div({style:{display:'flex',gap:16,flexWrap:'wrap'}},
          div({style:{display:'flex',alignItems:'center',gap:6}},
            statusDot(sbStatus==='ok'?'ok':sbStatus==='error'?'error':sbStatus==='checking'?'checking':null),
            span({style:{fontSize:11,color:'var(--text2)'}},'Supabase'),
            sbMsg&&span({style:{fontSize:10,color:'var(--text3)'}}, sbMsg),
            btn({onClick:checkSupabase,style:{fontSize:9,padding:'2px 6px',marginLeft:4,
              background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:3,cursor:'pointer',color:'var(--text3)'}},
              sbStatus==='checking'?'…':'Ping')
          ),
          div({style:{display:'flex',alignItems:'center',gap:6}},
            statusDot('ok'),
            span({style:{fontSize:11,color:'var(--text2)'}},'LocalStorage'),
            span({style:{fontSize:10,color:'var(--text3)'}}, lsSize ? lsSize+'KB used' : '…')
          ),
          div({style:{display:'flex',alignItems:'center',gap:6}},
            statusDot(navigator.onLine?'ok':'error'),
            span({style:{fontSize:11,color:'var(--text2)'}},'Network'),
            span({style:{fontSize:10,color:'var(--text3)'}}, navigator.onLine?'Online':'Offline')
          )
        )
      )
    ),

    // ── Quick links
    card(
      div(null,
        sectionHead('Quick Links'),
        div({style:{display:'flex',flexWrap:'wrap',gap:6}},
          ...[
            ['Supabase Dashboard', links.supabaseUrl ? links.supabaseUrl.replace('.supabase.co','.supabase.co/project/default') : 'https://supabase.com/dashboard'],
            ['Netlify Admin', links.netlifyAdminUrl||'https://app.netlify.com'],
            ['GitHub Repo', links.githubRepo||null],
            ['Apps Script', links.appsScriptUrl||null],
          ].filter(([,u])=>u).map(([label, url]) =>
            h('a', {key:label, href:url, target:'_blank', rel:'noopener',
              style:{fontSize:10,padding:'4px 10px',background:'var(--surf)',
                border:'.5px solid var(--bdr)',borderRadius:20,color:'var(--accent)',
                textDecoration:'none',fontWeight:600}}, label)
          )
        )
      )
    ),

    // ── Config fields
    card(
      div(null,
        sectionHead('Infrastructure Config'),
        linkInp('Supabase Project URL', 'supabaseUrl', 'https://xxxx.supabase.co'),
        linkInp('Supabase Anon Key', 'supabaseAnonKey', 'eyJhbGci…', true),
        linkInp('Netlify Site URL', 'netlifyUrl', 'https://your-site.netlify.app'),
        linkInp('GitHub Repo URL', 'githubRepo', 'https://github.com/org/repo'),
        linkInp('Apps Script Webhook URL', 'appsScriptUrl', 'https://script.google.com/macros/s/…/exec'),
      )
    ),

    // ── Settings data tools
    card(
      div(null,
        sectionHead('Settings Data'),
        div({style:{display:'flex',gap:6,flexWrap:'wrap'}},
          btn({className:'btn',style:{fontSize:11,padding:'5px 10px'},
            onClick:()=>{try{localStorage.setItem('mf_settings',JSON.stringify(settings));
              alert('Settings saved to browser storage.');}catch(e){alert('Failed: '+e.message);}}},
            '💾 Save to Browser'),
          btn({className:'btn',style:{fontSize:11,padding:'5px 10px'},
            onClick:()=>{
              navigator.clipboard&&navigator.clipboard.writeText(JSON.stringify(settings,null,2))
                .then(()=>{setCopied('settings');setTimeout(()=>setCopied(''),2000);});
            }},
            copied==='settings'?'✓ Copied!':'📤 Export JSON'),
          btn({className:'btn',style:{fontSize:11,padding:'5px 10px'},
            onClick:()=>{const s=prompt('Paste settings JSON:');
              if(s)try{onUpdate(JSON.parse(s));alert('Imported!');}catch(e){alert('Invalid JSON');}}},
            '📋 Import JSON'),
          btn({className:'btn',style:{fontSize:11,padding:'5px 10px',color:'#ef4444',borderColor:'rgba(239,68,68,.3)'},
            onClick:()=>{if(confirm('Reset ALL settings to factory defaults?'))onUpdate(DEF_SETTINGS);}},
            '↺ Reset Defaults')
        )
      )
    ),

    // ── Version / build info
    div({style:{fontSize:9,color:'var(--text3)',textAlign:'center',paddingTop:4}},
      'Meridian · Built on Vite + React · Supabase · Netlify')
  );
}

function Settings({settings, onUpdate, onClose, userRole, onClearAll, onOpenStoreNotes}) {
  const S=settings;
  const [activeSection, setActiveSection] = useState('identity');
  const set=(path,val)=>{const keys=path.split('.');const next=JSON.parse(JSON.stringify(S));let cur=next;keys.slice(0,-1).forEach(k=>{if(!cur[k])cur[k]={};cur=cur[k];});cur[keys[keys.length-1]]=val;onUpdate(next);};
  const inp2=({path,...rest})=>inp({...rest,value:S[path]??'',onChange:e=>set(path,isNaN(e.target.value)?e.target.value:+e.target.value)});
  const Toggle=({label,path,options})=>div({className:'set-row'},div({className:'set-lbl'},label),div({style:{display:'flex',gap:4}},options.map(([l,v])=>btn({key:String(l),className:'sbtn'+(S[path]===v?' on':''),onClick:()=>set(path,v),style:{fontSize:'10px',padding:'2px 8px'}},l))));

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:300,overflowY:'auto',display:'flex',justifyContent:'flex-start',padding:'20px 20px 20px 8px'}},
    div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',width:'100%',maxWidth:640,height:'fit-content'}},
      div({style:{padding:'14px 18px',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center',gap:10}},
        div({style:{fontSize:'15px',fontWeight:700}},'⚙ Settings'),
        btn({onClick:onClose,style:{marginLeft:'auto',background:'none',border:'none',color:'var(--text2)',fontSize:20,cursor:'pointer'}},'×')
      ),
      div({style:{display:'flex',flex:1,overflow:'hidden'}},
        // ── Sidebar menu
        div({style:{width:140,flexShrink:0,borderRight:'.5px solid var(--bdr)',
          background:'var(--surf2)',padding:'8px 0',overflowY:'auto'}},
          ...[['identity','👤 Identity'],['forecast','📐 Forecast'],['labor','👥 Labor'],
              ['appearance','🎨 Theme'],['metrics','📊 Metrics'],['operators','🏢 Operators'],['supervisors','🗂 Patches'],
              ['ai','🤖 AI'],['store-notes','📍 Store Notes'],
              ...(userRole==='developer'?[['dev','🛠 Dev']]:[]),
              ...(userRole==='admin'||userRole==='developer'?[['data','🗄 Data']]:[])]
          .map(([k,l])=>div({key:k,
            onClick:()=>setActiveSection(k),
            style:{padding:'8px 14px',fontSize:'10px',fontWeight:activeSection===k?700:400,
              color:activeSection===k?'var(--amber)':'var(--text2)',
              background:activeSection===k?'rgba(245,158,11,.08)':'transparent',
              cursor:'pointer',borderLeft:activeSection===k?'2px solid var(--amber)':'2px solid transparent'}
          },l))
        ),
        // ── Section content
        div({style:{flex:1,overflowY:'auto',padding:'14px 18px'}},

        activeSection==='ai'&&div({className:'set-sec'},
          div({className:'set-sec-t'},'🤖 AI & Integrations'),
          div({className:'set-sec-t'},'AI & Integrations'),
          div({className:'set-note'},'Anthropic API key enables AI Lookup in Backtest and Anomaly panels. Stored locally in your browser.'),
          div({className:'set-row'},
            div({className:'set-lbl'},'Anthropic API Key',h('a',{href:'https://console.anthropic.com',target:'_blank',style:{fontSize:'9px',color:'#818cf8',marginLeft:6}},'Get key →')),
            inp({className:'set-inp',type:'password',defaultValue:(()=>{try{return localStorage.getItem('mf_anthropic_key')||'';}catch{return '';}})(),placeholder:'sk-ant-…',onBlur:e=>{try{if(e.target.value.trim())localStorage.setItem('mf_anthropic_key',e.target.value.trim());else localStorage.removeItem('mf_anthropic_key');}catch{}},style:{fontFamily:'var(--mono)',fontSize:'11px'}})
          )
        ),

        activeSection==='identity'&&div({className:'set-sec'},
          div({className:'set-sec-t'},'Identity'),
          div({className:'set-row'},div({className:'set-lbl'},'Your Name'),inp({className:'set-inp',defaultValue:S.userName||'',onBlur:e=>set('userName',e.target.value),placeholder:'e.g. Fletcher',title:'Used in the At a Glance welcome greeting'})),
          div({className:'set-row'},div({className:'set-lbl'},'District Name'),inp({className:'set-inp',defaultValue:S.districtName||'',onBlur:e=>set('districtName',e.target.value),placeholder:'e.g. McDOK'})),
          div({className:'set-note'},'Appears in report headers, file exports, and email subjects. Update if your district or operating company name changes. Stays editable.'),
          div({className:'set-row'},div({className:'set-lbl'},'Operator Name'),inp({className:'set-inp',defaultValue:S.operatorName||'',onBlur:e=>set('operatorName',e.target.value),placeholder:'e.g. Ryan Thorley'})),
          div({style:{marginTop:18,paddingTop:14,borderTop:'1px solid var(--bdr)'}},
            div({style:{fontSize:'10px',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--text2)',marginBottom:8}},'Data Policy'),
            div({className:'set-note',style:{lineHeight:1.7}},
              h('strong',{style:{color:'var(--text)'}},'Data Notice: '),
              'This tool processes McDonald\'s operational data (sales, labor, food cost, customer satisfaction). ' +
              'Data is stored in Supabase (PostgreSQL) and accessed only by authorized users. ' +
              'No data is shared with third parties. For questions, contact fletcher.reaves@mcreaves.com.'
            )
          )
        ),
        activeSection==='forecast'&&div({className:'set-sec'},
          div({className:'set-sec-t'},'Forecast Parameters'),
          div({className:'set-row'},div({className:'set-lbl'},'Weeks Back (trend)'),inp2({className:'set-inp',path:'weeksBack',type:'number',min:2,max:12})),
          div({className:'set-note'},'How many weeks of rolling data to use when computing the 6-week ops/labor averages shown on store dashboards. Default 6. Increase to 12 for very volatile stores; decrease to 2–3 for stores that changed recently (new manager, remodel, etc).'),
          div({className:'set-row'},div({className:'set-lbl'},'Week Start Day'),
            h('select',{className:'set-inp',value:S.weekStartDay!==undefined?S.weekStartDay:3,
              onChange:e=>set('weekStartDay',+e.target.value)},
              h('option',{value:0},'Sunday'),
              h('option',{value:1},'Monday'),
              h('option',{value:3},'Wednesday (McDonald\'s)'),
              h('option',{value:4},'Thursday'),
              h('option',{value:5},'Friday')
            )
          ),
          div({className:'set-row'},div({className:'set-lbl'},'Tolerance % (pass/miss)'),inp2({className:'set-inp',path:'tolerance',type:'number',min:1,max:15})),
          div({className:'set-note'},'The ± percentage band that defines Pass vs Miss on scorecards and in reports. A store within this range of its target counts as passing. Default 3%. Tighter = higher standards; wider = more tolerance for variance.'),
          div({className:'set-note'},'LY Method: Each projected day compares to the actual same day of week, 52 weeks prior (e.g., Monday Jun 1, 2026 → actual Monday Jun 2, 2025). Holidays and tagged events are skipped to the next clean comparable week. No synthetic blending is applied — LY always reflects real historical data you can verify.'),
          div({className:'set-note'},'If a LY date had an unusual result (event, closure, weather), tag it in Events. The engine automatically skips tagged dates and uses the next clean comparable week instead.'),
          div({className:'set-row'},div({className:'set-lbl'},'Plus-Up %'),inp2({className:'set-inp',path:'plusUp',type:'number',min:-10,max:20})),
          div({className:'set-note'},'+2% means the model adds 2% on top of its calculation. Management judgment override — applied directly to every forecast day. Use when model consistently under- or over-calls. Per-store override available in store settings.'),
          h(Toggle,{label:'Cascade',path:'cascade',options:[['On',true],['Off',false]]}),
          div({className:'set-note'},'Cascade: each week forecast anchors to the prior week projected sales. Best OFF for most stores.'),
          div({className:'set-note'},'Each week\'s forecast anchors to the prior week\'s projected sales instead of last year\'s actual. Best OFF for most stores — ON can compound errors over long projection windows.'),
          div({className:'set-row'},
            div({className:'set-lbl'},'Trend Weights (T2/T4/T6)'),
            div({style:{display:'flex',gap:4}},
              ['t2','t4','t6'].map(k=>inp({key:k,className:'set-inp',defaultValue:S.trendWeights?S.trendWeights[k]:'',type:'number',min:0,max:1,step:.05,style:{width:52},onBlur:e=>set('trendWeights.'+k,+e.target.value),placeholder:k==='t2'?.5:k==='t4'?.3:.2}))
            )
          )
        ),
        activeSection==='labor'&&div({className:'set-sec'},
          div({className:'set-sec-t'},'Labor % Thresholds'),
          div({className:'set-row'},div({className:'set-lbl'},'Green threshold (±%)'),inp2({className:'set-inp',path:'laborGreenPct',type:'number',min:.1,max:2,step:.1})),
          div({className:'set-note'},'Labor% within this many points of target shows green on scorecards. Default ±0.3%. This is your acceptable operating range — tighter for high-volume stores, slightly wider for smaller stores.'),
          div({className:'set-row'},div({className:'set-lbl'},'Yellow threshold (±%)'),inp2({className:'set-inp',path:'laborYellowPct',type:'number',min:.5,max:5,step:.1}))
        ),
        activeSection==='appearance'&&div({className:'set-sec'},
          div({className:'set-sec-t'},'🎨 Appearance'),
          div({className:'set-note'},'Choose a color theme and display mode. Each theme reflects a different visual identity — all data and functionality are identical across themes.'),
          // Theme picker
          div({style:{marginBottom:10}},
            div({style:{fontSize:'10px',color:'var(--text2)',marginBottom:6,fontWeight:600}},'Color Theme'),
            div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}},
              [
                {id:'command',label:'Command Center',desc:'Navy + Gold (QSRSoft-inspired)'},
                {id:'golden', label:'Golden Standard',desc:'Warm charcoal + McD Gold'},
                {id:'dualbrand',label:'Dual Brand',desc:'MCDOK Red vs EA Teal - two orgs'},
                {id:'refined', label:'Refined Dark',desc:'Minimal premium — Bloomberg style'},
              ].map(({id,label,desc})=>
                div({key:id,
                  style:{border:'.5px solid '+(S.theme===id?'var(--acc1)':'var(--bdr)'),
                    borderRadius:'var(--r)',padding:'8px 10px',cursor:'pointer',
                    background:S.theme===id?'var(--adim)':'transparent',
                    transition:'all .15s'},
                  onClick:()=>set('theme',id)},
                  div({style:{display:'flex',alignItems:'center',gap:6}},
                    div({style:{width:10,height:10,borderRadius:'50%',
                      background:id==='command'?'#FFBC0D':id==='golden'?'#FFC72C':id==='dualbrand'?'#DA291C':'#FFB700'}}),
                    div({style:{fontWeight:600,fontSize:'10px'}},label),
                    S.theme===id&&span({style:{marginLeft:'auto',color:'var(--acc1)',fontSize:'9px'}},'✓ Active')
                  ),
                  div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},desc)
                )
              )
            )
          ),
          // Light / Dark toggle
          div({style:{display:'flex',alignItems:'center',gap:10,marginBottom:6}},
            div({style:{fontSize:'10px',color:'var(--text2)',fontWeight:600}},'Display Mode'),
            div({style:{display:'flex',gap:4}},
              ['light','dark'].map(mode=>
                btn({key:mode,
                  className:'btn btn-sm'+(S.colorMode===mode?' btn-a':''),
                  style:{padding:'3px 12px',fontSize:'10px'},
                  onClick:()=>set('colorMode',mode)},
                  mode==='light'?'☀ Light':'🌙 Dark'
                )
              )
            )
          ),
          div({className:'set-note'},'System preference is the default. Override here sticks across sessions.')
        ),
        activeSection==='metrics'&&div({className:'set-sec'},
          div({style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}},
            div({className:'set-sec-t',style:{margin:0}},'Scoring Weights '),
            h(InfoIcon,{articleKey:'model_health'})
          ),
          div({className:'set-note',style:{marginBottom:10}},'Adjust how Ops and Controls metrics are weighted in the combined score. Default 70/30. These weights affect ALL store scorecards — calibrate to reflect your district\'s priorities.'),
          h(Toggle,{label:'Scoring Mode',path:'scoringMode',options:[['Absolute','absolute'],['Relative','relative'],['Optimistic','optimistic']]}),
          div({className:'set-row'},div({className:'set-lbl'},'Controls Weight %'),inp2({className:'set-inp',path:'ctrlWeight',type:'number',min:0,max:80})),
          div({className:'set-note'},'Controls Weight: % of Ops Score from Controls scorecard vs Operations scorecard. Default 30%. Affects score display only — does not affect forecasts.')
        ),
        activeSection==='metrics'&&div({className:'set-sec'},
          div({className:'set-sec-t'},'Active Metrics'),
          div({className:'set-note'},'Toggle metrics off to exclude them from scoring.'),
          div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,marginTop:4}},
            Object.entries({oepe:'OEPE',kvst:'KVS Time',kvsu:'KVS Usage',park:'DT Parked%',tpph:'TPPH',labor:'Labor%',r2p:'R2P',cashOS:'Cash O/S',tRedA:'T-Red After',ot:'OT Hours',refund:'Refunds',disc:'Discounts'}).map(([key,label])=>{
              const active=(S.metricActive||{})[key]!==false;
              return div({key,style:{display:'flex',alignItems:'center',gap:6,padding:'3px 6px',background:active?'rgba(16,185,129,.06)':'rgba(239,68,68,.06)',border:`.5px solid ${active?'rgba(16,185,129,.2)':'rgba(239,68,68,.2)'}`,borderRadius:'var(--r)',cursor:'pointer'},onClick:()=>{const next=JSON.parse(JSON.stringify(S.metricActive||{}));next[key]=!active;set('metricActive',next);}},
                span({style:{fontSize:'10px'}}),active?'✓':'✗',
                span({style:{fontSize:'10px',color:active?'var(--text)':'var(--text3)',marginLeft:4}},label)
              );
            })
          )
        ),
        activeSection==='forecast'&&div({className:'set-sec'},
          div({className:'set-sec-t'},'Forecast Model — Enhancement Toggles'),
          div({className:'set-note'},'Control which forecast enhancements are active. Changes take effect immediately. Toggle off if you suspect an enhancement is affecting accuracy negatively.'),
          div({style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}},
            ...([
              ['useTrendInForecast','Trend Integration','Blend recent trend into the primary forecast formula. Alpha controls how strongly trend moves the number.',true],
              ['useGCAModel','GC × Avg Check Model (primary)','When ON, forecast = Forecast Guest Count × LY Avg Check. Computes alongside LY model — compare both.',false],
              ['showGCAComparison','Show Both Models in Projection','Show LY model and GCA model side-by-side in the Projection Workflow table.',true],
              ['useEventRegistry','Event Registry Adjustment','Apply learned historical impact from tagged events to matching future forecast dates.',true],
              ['showDaypartSupplement','Daypart Supplement','Show B/L/D breakdown under projection rows (requires 3 Peaks data).',true],
            ].map(([key,label,note,def])=>div({key,style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',padding:'8px 10px'}},
              div({style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}},
                div({style:{fontSize:'10px',fontWeight:600,color:'var(--text)'}},(S[key]!==undefined?S[key]:def)?'🟢 '+label:'⚫ '+label),
                h('select',{className:'set-inp',style:{width:60,fontSize:'9px'},
                  value:(S[key]!==undefined?S[key]:def)?'on':'off',
                  onChange:e=>set(key,e.target.value==='on')},
                  h('option',{value:'on'},'On'),h('option',{value:'off'},'Off'))
              ),
              div({style:{fontSize:'8px',color:'var(--text3)',lineHeight:1.4}},note)
            )))
          ),
          S.useTrendInForecast!==false&&div({className:'set-row',style:{marginBottom:10}},
            div({className:'set-lbl'},'Trend Alpha (blend weight)'),
            div({style:{display:'flex',alignItems:'center',gap:8}},
              h('input',{type:'range',min:0,max:0.6,step:0.05,
                value:S.trendAlpha??0.30,
                onChange:e=>set('trendAlpha',+e.target.value),
                style:{width:120}}),
              div({style:{fontSize:'11px',fontFamily:'var(--mono)',color:'var(--amber)',fontWeight:700,minWidth:30}},
                (((S.trendAlpha??0.30)*100).toFixed(0))+'%'),
              div({style:{fontSize:'9px',color:'var(--text3)'}},
                '0% = ignore trend · 30% = moderate · 60% = strong trend following')
            )
          ),
          div({className:'set-sec-t',style:{marginTop:8}},'Empirical Weather Calibration'),
          div({className:'set-note'},'Calculates per-store rain/heat/cold coefficients from loaded Mesonet data. More accurate than global sliders. Requires 12+ months of Mesonet weather data loaded. When OFF, uses global weather sliders. Tied directly to forecast weather adjustment (wAdj).'),
          h(Toggle,{label:'Use Empirical Coefficients',path:'useEmpirical',options:[['Off',false],['On',true]]}),
          div({className:'set-row',style:{marginTop:8}},
            div({className:'set-lbl'},'Ops Normalization'),
            h('select',{className:'set-inp',value:S.opsNorm?'on':'off',
              onChange:e=>set('opsNorm',e.target.value==='on')},
              h('option',{value:'off'},'Off — use targets as baseline'),
              h('option',{value:'on'},'On — use store\'s own history as baseline')
            )
          ),
          S.opsNorm&&div({className:'set-note',style:{marginTop:4}},
            'When enabled, ops metrics (OEPE, TPPH, etc.) are evaluated against each store\'s own rolling average rather than targets. Prevents double-penalizing stores whose LY data already reflects their consistent performance level. Per-store override available in store settings.'),
          S.useEmpirical&&div({style:{marginTop:6}},
            btn({className:'btn btn-a',style:{fontSize:'11px',padding:'5px 12px'},onClick:()=>{const emp=calibrateWeather(window._mfDS||{});const n=Object.keys(emp).length;if(n>0){set('empiricalWeather',emp);alert('Calibrated '+n+' stores.');}else alert('Load Mesonet data first.');}},
              '⚡ Run Calibration Now'),
            Object.keys(S.empiricalWeather||{}).length>0&&div({style:{marginTop:5,fontSize:'10px',color:'var(--text3)'}},Object.keys(S.empiricalWeather).length+' stores calibrated')
          )
        ),
        activeSection==='operators'&&div({className:'set-sec'},
          div({className:'set-sec-t'},'Operator Groups'),
          div({className:'set-note'},'Edit operators and their store numbers. If you see duplicates, click Reset below to pull the latest structure from the app.'),
          div({style:{marginBottom:8}},
            btn({className:'btn btn-sm',onClick:()=>{
              const n={...S,operators:{...DEF_SETTINGS.operators},supervisorGroups:{...DEF_SETTINGS.supervisorGroups}};
              onUpdate(n);
            }},'↺ Sync operators & supervisors from defaults')
          ),
          Object.entries(S.operators||{}).map(([name,ids])=>div({key:name,className:'set-row'},
            div({style:{display:'flex',gap:6,alignItems:'center',marginBottom:3}},
              div({className:'set-lbl',style:{margin:0,fontWeight:600}},name),
              btn({className:'btn btn-sm btn-red',style:{padding:'1px 6px',fontSize:'9px'},onClick:()=>{if(confirm('Remove '+name+'?')){const next=JSON.parse(JSON.stringify(S));delete next.operators[name];onUpdate(next);}}},'✕')
            ),
            inp({className:'set-inp',defaultValue:ids.join(','),key:name+ids.join(','),onBlur:e=>set('operators.'+name,e.target.value.split(',').map(s=>s.trim()).filter(Boolean))})
          )),
          div({className:'set-row'},
            div({className:'set-lbl',style:{marginBottom:6}},'Add Operator'),
            div({style:{display:'flex',gap:6}},
              inp({id:'new-op',className:'set-inp',placeholder:'Name',style:{flex:1}}),
              btn({className:'btn btn-sm btn-a',onClick:()=>{const n=document.getElementById('new-op').value.trim();if(n){const next=JSON.parse(JSON.stringify(S));if(!next.operators)next.operators={};next.operators[n]=[];onUpdate(next);document.getElementById('new-op').value='';}}},' +')
            )
          )
        ),
        activeSection==='supervisors'&&div({className:'set-sec'},
          div({className:'set-sec-t'},'Supervisor Patches'),
          Object.entries(S.supervisorGroups||{}).map(([name,ids])=>div({key:name,className:'set-row'},
            div({style:{display:'flex',gap:6,alignItems:'center',marginBottom:3}},
              div({className:'set-lbl',style:{margin:0,fontWeight:600}},name),
              btn({className:'btn btn-sm btn-red',style:{padding:'1px 6px',fontSize:'9px'},onClick:()=>{if(confirm('Remove '+name+'?')){const next=JSON.parse(JSON.stringify(S));delete next.supervisorGroups[name];onUpdate(next);}}},'✕')
            ),
            inp({className:'set-inp',defaultValue:ids.join(','),key:name+ids.join(','),onBlur:e=>set('supervisorGroups.'+name,e.target.value.split(',').map(s=>s.trim()).filter(Boolean))})
          )),
          div({className:'set-row'},
            div({className:'set-lbl',style:{marginBottom:6}},'Add Supervisor Patch'),
            div({style:{display:'flex',gap:6}},
              inp({id:'new-sup',className:'set-inp',placeholder:'Supervisor Name',style:{flex:1}}),
              btn({className:'btn btn-sm btn-a',onClick:()=>{const n=document.getElementById('new-sup').value.trim();if(n){const next=JSON.parse(JSON.stringify(S));if(!next.supervisorGroups)next.supervisorGroups={};next.supervisorGroups[n]=[];onUpdate(next);document.getElementById('new-sup').value='';}}},'+')
            )
          )
        ),
        activeSection==='dev'&&React.createElement(DevDashboard, {settings, onUpdate}),

        activeSection==='store-notes'&&div({className:'set-sec'},
          div({className:'set-sec-t'},'📍 Store Notes'),
          div({className:'set-note'},'Per-store knowledge base: operational notes, context, tags, and flags for each location. Notes are saved locally and inform SAGE and coaching views.'),
          div({style:{marginTop:12}},
            btn({
              className:'btn btn-sm',
              style:{fontWeight:600,padding:'8px 18px'},
              onClick:()=>{ onClose&&onClose(); onOpenStoreNotes&&onOpenStoreNotes(); }
            },'📍 Open Store Notes Editor')
          )
        ),

        activeSection==='data'&&div({className:'set-sec'},
          div({className:'set-sec-t'},'🗄 Data Management'),
          div({className:'set-note'},'Admin-only. These actions affect data stored on this device.'),
          div({style:{background:'rgba(239,68,68,.06)',border:'.5px solid rgba(239,68,68,.25)',borderRadius:'var(--r)',padding:'12px 14px',marginTop:12}},
            div({style:{fontWeight:700,fontSize:'11px',color:'#f87171',marginBottom:6}},'Clear All Stored Data'),
            div({style:{fontSize:'9px',color:'var(--text3)',marginBottom:10,lineHeight:1.5}},'Removes all uploaded report data from this device (IndexedDB + OPFS). Data in Supabase — Monthly Targets, SMG FullScale, Performance Reviews — is not affected. You will need to re-upload files on next launch.'),
            btn({
              className:'btn btn-sm',
              style:{color:'#f87171',border:'.5px solid rgba(239,68,68,.3)',background:'rgba(239,68,68,.06)',fontWeight:700},
              onClick:()=>{
                const confirmed=window.prompt('Type DELETE (all caps) to confirm clearing all stored report data:');
                if(confirmed==='DELETE') onClearAll&&onClearAll();
              }
            },'🗑 Clear All Stored Data')
          )
        )
      )// close content div
    )// close flex row (sidebar+content)
  )// close inner panel
);
}

export { Settings };
