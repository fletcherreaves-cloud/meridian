// @ts-nocheck
import * as React from 'react';
import { dKey, nDK } from '../utils/date.js';
import { isHoliday, HOLIDAY_MAP } from '../utils/holidays.js';
import { lookupMissEvent } from '../engine/why.js';
import { EVENT_TYPES, EVENT_TYPE_GROUPS, STORE_NAMES, STORE_COORDS, sName, sNameC } from '../constants.js';
import { TH } from '../utils/fmt.js';

const {useState, useEffect, useMemo, useRef, useCallback} = React;
const h    = React.createElement;
const div  = (props, ...c) => h('div',    props, ...c);
const span = (props, ...c) => h('span',   props, ...c);
const btn  = (props, ...c) => h('button', props, ...c);
const sel  = (props, ...c) => h('select', props, ...c);
const td   = (props, ...c) => h('td',     props, ...c);
const th   = (props, ...c) => h('th',     props, ...c);
const tr   = (props, ...c) => h('tr',     props, ...c);

// ════════════════════════════════════════════════════════════════════════════════
// CALENDAR MANAGER  (v4.200 — Calendar System)
// ════════════════════════════════════════════════════════════════════════════════
// The proactive hub for managing known future events across the district —
// the piece that converts the event system from reactive (tag what already
// happened) to proactive (know what's coming before it happens). Three parts:
//
//   1. Month-grid view — see tagged events across stores at a glance, click a
//      day to add (reuses the existing EventEntryModal — not rebuilt here).
//   2. Recurring rules — register an annual pattern once (a school district's
//      Thanksgiving break, an annual festival) instead of re-tagging it every
//      year. Rules never auto-write; instances surface for confirmation.
//   3. Proactive search — searchUpcomingEvents() finds school calendars and
//      local events via web search, single-store or batched across all 27.
//      Results land in the same pending-review queue as rule confirmations —
//      one inbox, two sources, nothing trusted until a human approves it.
//
// All writes go through the same mf_events storage and direct-write-then-
// refresh pattern already established by EventEntryModal, so every other
// part of the app (calibrateStore, forecastDay, the backtest engine, the
// Why Engine when it's built) sees these events identically to a manually
// tagged one — no separate code path to keep in sync.
// ─────────────────────────────────────────────────────────────────────────────
function CalendarManagerPanel({stores, ds, settings, userEvents, onUpdate, onClose}) {
  const {useState:uSt, useMemo:uM, useRef:uR} = React;
  const today = new Date();
  const [viewY, setViewY] = uSt(today.getFullYear());
  const [viewM, setViewM] = uSt(today.getMonth()+1); // 1-12
  const [scope, setScope] = uSt('all'); // 'all' | 'ok' | 'fl' | a specific loc
  const [tab,   setTab]   = uSt('grid'); // 'grid' | 'rules' | 'pending'

  const [showAddEvent, setShowAddEvent] = uSt(false);
  const [prefillDate,  setPrefillDate]  = uSt(null);

  const [rules, setRules] = uSt(()=>loadRecurringRules());
  const [showRuleForm, setShowRuleForm] = uSt(false);
  const [ruleDraft, setRuleDraft] = uSt(null); // null = not editing; object = draft

  const [pendingItems, setPendingItems] = uSt([]); // ai-search + rule-confirm candidates
  const [pendingChecks, setPendingChecks] = uSt({}); // {itemKey: {locs:[...], dismissed:bool}}
  const [searching, setSearching] = uSt(false);
  const [searchProg, setSearchProg] = uSt(null); // {done,total,storeName} for batch search
  const cancelSearchRef = uR(false);

  const LOCS = Object.keys(STORE_NAMES).sort((a,b)=>STORE_NAMES[a].localeCompare(STORE_NAMES[b]));
  const okLocs = LOCS.filter(l=>(STORE_COORDS[l]||{}).state!=='FL');
  const flLocs = LOCS.filter(l=>(STORE_COORDS[l]||{}).state==='FL');
  const scopeLocs = scope==='all'?LOCS:scope==='ok'?okLocs:scope==='fl'?flLocs:[scope];

  // ── Pull recurring-rule instances needing confirmation, merge into pending ──
  React.useEffect(()=>{
    const ruleInstances = getRecurringInstancesNeedingConfirm(rules, userEvents||{});
    setPendingItems(prev=>{
      const fromSearch = prev.filter(p=>p.source==='ai_search');
      const fromRules = ruleInstances.map(ri=>({
        source:'recurring_rule', key:'rule_'+ri.ruleId+'_'+dKey(ri.start),
        date:dKey(ri.start), endDate:ri.end>ri.start?dKey(ri.end):null,
        type:ri.type, label:ri.ruleLabel, confidence:null,
        sourceNote:'From recurring rule — confirm this year\'s dates are still correct.',
        suggestedLocs:ri.locs,
      }));
      return [...fromSearch, ...fromRules];
    });
  },[rules,userEvents]);

  // ── Month grid data: events per day, across scope stores ───────────────────
  const monthData = uM(()=>{
    const daysInMonth = new Date(viewY,viewM,0).getDate();
    const cells = {};
    for(let d=1; d<=daysInMonth; d++) cells[d]={events:[]};
    scopeLocs.forEach(loc=>{
      const dkMap = (userEvents||{})[loc];
      if(!dkMap) return;
      Object.entries(dkMap).forEach(([dk,ev])=>{
        const dt = new Date(dk+'T12:00:00');
        if(dt.getFullYear()!==viewY||dt.getMonth()+1!==viewM) return;
        const day = dt.getDate();
        if(!cells[day]) return;
        cells[day].events.push({loc,dk,...ev});
      });
    });
    return cells;
  },[viewY,viewM,scopeLocs,userEvents]);

  const monthLabel = new Date(viewY,viewM-1,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
  const firstDOW = new Date(viewY,viewM-1,1).getDay();
  const daysInMonth = new Date(viewY,viewM,0).getDate();

  const navMonth = (delta) => {
    let m=viewM+delta, y=viewY;
    if(m<1){m=12;y--;} if(m>12){m=1;y++;}
    setViewM(m); setViewY(y);
  };

  // ── Shared writer: tag a date range across a set of stores ──────────────────
  // Same direct-localStorage-write + single-refresh pattern as EventEntryModal,
  // so React state stays in sync without N separate stale-closure updates.
  const applyEventToStores = (locsToTag, startDk, endDk, type, label, note, source) => {
    const cur = (()=>{try{return JSON.parse(localStorage.getItem('mf_events')||'{}');}catch{return {};}})();
    const start = new Date(startDk+'T12:00:00');
    const end   = endDk ? new Date(endDk+'T12:00:00') : start;
    const dates = []; let d=new Date(start);
    while(d<=end){dates.push(new Date(d)); d=new Date(d.getTime()+86400000);}
    const et = EVENT_TYPES[type]||EVENT_TYPES.other;
    dates.forEach((dt,i)=>{
      const dk = dKey(dt);
      const dayLabel = dates.length>1 ? label+' (Day '+(i+1)+' of '+dates.length+')' : label;
      locsToTag.forEach(loc=>{
        if(!cur[loc]) cur[loc]={};
        cur[loc][dk] = {type, note:note||label, label:dayLabel, icon:et.icon,
          source:source||'Calendar Manager',
          ...(dates.length>1?{rangeId:'range_'+startDk+'_'+(endDk||startDk)+'_'+type,rangeDayNum:i+1,rangeTotalDays:dates.length}:{})};
      });
    });
    try{ localStorage.setItem('mf_events', JSON.stringify(cur)); }catch(e){}
    onUpdate(cur);
  };

  // ── Pending queue actions ───────────────────────────────────────────────────
  const getChecks = (item) => pendingChecks[item.key] || {locs: item.suggestedLocs||[], dismissed:false};
  const toggleLoc = (item, loc) => {
    const c = getChecks(item);
    const locs = c.locs.includes(loc) ? c.locs.filter(l=>l!==loc) : [...c.locs, loc];
    setPendingChecks(p=>({...p,[item.key]:{...c,locs}}));
  };
  const approveItem = (item) => {
    const c = getChecks(item);
    if(!c.locs.length){ alert('Select at least one store.'); return; }
    applyEventToStores(c.locs, item.date, item.endDate, item.type, item.label, item.sourceNote,
      item.source==='ai_search'?'AI Search':'Recurring Rule Confirmed');
    setPendingItems(prev=>prev.filter(p=>p.key!==item.key));
  };
  const skipItem = (item) => setPendingItems(prev=>prev.filter(p=>p.key!==item.key));

  // ── Proactive search ─────────────────────────────────────────────────────────
  const runSearch = async (loc) => {
    setSearching(true);
    try{
      const found = await searchUpcomingEvents(loc);
      const newItems = found.map((f,i)=>({
        source:'ai_search', key:'ai_'+loc+'_'+f.date+'_'+f.type+'_'+i,
        date:f.date, endDate:f.endDate, type:f.type, label:f.label,
        confidence:f.confidence, sourceNote:f.sourceNote, suggestedLocs:[loc],
      }));
      setPendingItems(prev=>{
        const existingKeys=new Set(prev.map(p=>p.key));
        return [...prev, ...newItems.filter(n=>!existingKeys.has(n.key))];
      });
      if(newItems.length) setTab('pending');
      return newItems.length;
    }catch(e){
      alert('Search failed: '+e.message);
      return 0;
    }finally{
      setSearching(false);
    }
  };

  const runBatchSearch = async () => {
    if(!window.confirm('Search for upcoming events at all '+LOCS.length+' stores?\n\nThis calls the Anthropic API (with web search) once per store and typically takes 2-4 minutes.')) return;
    cancelSearchRef.current=false;
    setSearching(true);
    let totalFound=0;
    for(let i=0;i<LOCS.length;i++){
      if(cancelSearchRef.current) break;
      setSearchProg({done:i,total:LOCS.length,storeName:STORE_NAMES[LOCS[i]]});
      const n = await runSearch(LOCS[i]).catch(()=>0);
      totalFound+=n||0;
      await new Promise(r=>setTimeout(r,400));
    }
    setSearchProg(null);
    setSearching(false);
    if(!cancelSearchRef.current) alert('Search complete. '+totalFound+' candidate event(s) added to Pending Review.');
  };
  const cancelBatchSearch = () => { cancelSearchRef.current=true; setSearching(false); setSearchProg(null); };

  // ── Recurring rule form ─────────────────────────────────────────────────────
  const newRuleDraft = () => ({id:'rule_'+Date.now(), label:'', type:'school_break',
    locs:[], month:11, day:25, durationDays:5, active:true, source:'manual', createdAt:new Date().toISOString()});

  const saveRule = () => {
    if(!ruleDraft.label.trim()){ alert('Enter a label.'); return; }
    if(!ruleDraft.locs.length){ alert('Select at least one store.'); return; }
    const next = rules.some(r=>r.id===ruleDraft.id)
      ? rules.map(r=>r.id===ruleDraft.id?ruleDraft:r)
      : [...rules, ruleDraft];
    setRules(next); saveRecurringRules(next);
    setShowRuleForm(false); setRuleDraft(null);
  };
  const deleteRule = (id) => {
    if(!window.confirm('Delete this recurring rule? Already-tagged events are not affected.')) return;
    const next = rules.filter(r=>r.id!==id);
    setRules(next); saveRecurringRules(next);
  };
  const toggleRuleActive = (id) => {
    const next = rules.map(r=>r.id===id?{...r,active:r.active===false?true:false}:r);
    setRules(next); saveRecurringRules(next);
  };
  const toggleRuleLoc = (loc) => setRuleDraft(d=>({...d, locs: d.locs.includes(loc)?d.locs.filter(l=>l!==loc):[...d.locs,loc]}));

  const MONTH_NAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DOW_LETTERS=['S','M','T','W','T','F','S'];

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:463,
    display:'flex',alignItems:'flex-start',justifyContent:'center',padding:20,paddingTop:24}},

    showAddEvent&&h(EventEntryModal,{stores,settings,
      onTagEvent:(loc,dk,note,evType,opts)=>{
        if(loc==='_refresh_'&&opts&&opts._refreshState){ onUpdate(opts._refreshState); return; }
      },
      onClose:()=>{setShowAddEvent(false);setPrefillDate(null);}}),

    div({style:{background:'var(--surf)',border:'.5px solid var(--bdr2)',borderRadius:'var(--rl)',
      width:'100%',maxWidth:920,maxHeight:'92vh',display:'flex',flexDirection:'column',
      boxShadow:'0 20px 60px rgba(0,0,0,.5)',overflow:'hidden'}},

      // Header
      div({style:{padding:'12px 16px',borderBottom:'.5px solid var(--bdr)',background:'var(--surf2)',
        display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},
        span({style:{fontSize:'18px'}},'📅'),
        div({style:{flex:1}},
          div({style:{fontSize:'13px',fontWeight:800,color:'var(--text)'}},'Calendar Manager'),
          div({style:{fontSize:'9px',color:'var(--text3)'}},'Proactive event calendar — school dates, local events, recurring rules, feeding every forecast in the system')
        ),
        div({style:{display:'flex',gap:3}},
          ...[['grid','📆 Calendar'],['rules','🔁 Recurring Rules'],['pending','🔔 Pending'+(pendingItems.length?' ('+pendingItems.length+')':'')]].map(([id,l])=>
            btn({key:id,style:{fontSize:'9px',padding:'4px 10px',borderRadius:'var(--r)',
              background:tab===id?'var(--adim)':'transparent',
              color:tab===id?'var(--amber)':(id==='pending'&&pendingItems.length?'#f59e0b':'var(--text3)'),
              border:'.5px solid '+(tab===id?'rgba(245,158,11,.4)':'var(--bdr)'),cursor:'pointer',fontWeight:(id==='pending'&&pendingItems.length)?700:400},
              onClick:()=>setTab(id)},l))
        ),
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'✕')
      ),

      // ════════ GRID TAB ════════
      tab==='grid'&&React.createElement(React.Fragment,null,
        div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
          display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},
          div({style:{display:'flex',alignItems:'center',gap:8}},
            btn({className:'btn btn-sm',onClick:()=>navMonth(-1)},'◀'),
            div({style:{fontSize:'12px',fontWeight:700,color:'var(--text)',minWidth:140,textAlign:'center'}},monthLabel),
            btn({className:'btn btn-sm',onClick:()=>navMonth(1)},'▶'),
            btn({className:'btn btn-sm',style:{fontSize:'8px'},onClick:()=>{setViewY(today.getFullYear());setViewM(today.getMonth()+1);}},'Today')
          ),
          div({style:{display:'flex',gap:2,border:'.5px solid var(--bdr)',borderRadius:'var(--r)',overflow:'hidden'}},
            ...['all','ok','fl'].map(g=>btn({key:g,onClick:()=>setScope(g),
              style:{padding:'3px 8px',border:'none',fontSize:'9px',cursor:'pointer',
                background:scope===g?'var(--amber)':'transparent',color:scope===g?'#000':'var(--text3)'}},
              g==='all'?'All':g==='ok'?'OK':'FL'))
          ),
          h('select',{value:LOCS.includes(scope)?scope:'',onChange:e=>e.target.value&&setScope(e.target.value),
            style:{fontSize:'9px',padding:'4px 6px',background:'var(--surf)',border:'.5px solid var(--bdr)',
              borderRadius:'var(--r)',color:'var(--text)'}},
            h('option',{value:''},'— single store —'),
            LOCS.map(l=>h('option',{key:l,value:l},sNameC(l)))
          ),
          div({style:{marginLeft:'auto',display:'flex',gap:6}},
            btn({className:'btn btn-sm btn-a',style:{fontSize:'9px',fontWeight:700},
              onClick:()=>{setPrefillDate(null);setShowAddEvent(true);}},'➕ Add Event'),
            btn({className:'btn btn-sm',style:{fontSize:'9px'},disabled:searching,
              onClick:()=>{
                const loc=LOCS.includes(scope)?scope:LOCS[0];
                runSearch(loc);
              }},searching&&!searchProg?'⏳ Searching…':'🔍 Search This Store'),
            btn({className:'btn btn-sm',style:{fontSize:'9px',color:'var(--amber)'},disabled:searching,
              onClick:runBatchSearch},'🔍 Search All 27')
          )
        ),
        searchProg&&div({style:{padding:'8px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0}},
          div({style:{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:'9px',color:'var(--text3)'}},
            span(null,'Searching '+searchProg.storeName+' · '+searchProg.done+' of '+searchProg.total),
            btn({style:{fontSize:'8px',color:'#f87171',background:'none',border:'none',cursor:'pointer'},onClick:cancelBatchSearch},'⏹ Cancel')),
          div({style:{height:5,background:'var(--surf2)',borderRadius:99,overflow:'hidden'}},
            div({style:{height:'100%',width:Math.round(searchProg.done/searchProg.total*100)+'%',
              background:'var(--amber)',borderRadius:99,transition:'width .3s'}}))
        ),
        // Legend
        div({style:{padding:'6px 16px',display:'flex',gap:10,flexWrap:'wrap',fontSize:'7.5px',color:'var(--text3)'}},
          ...['holiday','school_break','school_early_release','event','weather','road_closure'].map(t=>
            div({key:t,style:{display:'flex',alignItems:'center',gap:3}},
              span({style:{width:8,height:8,borderRadius:2,background:EVENT_TYPES[t].col,display:'inline-block'}}),
              EVENT_TYPES[t].label))
        ),
        // Month grid
        div({style:{flex:1,overflowY:'auto',padding:'0 16px 16px'}},
          div({style:{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3,marginBottom:4}},
            ...DOW_LETTERS.map((l,i)=>div({key:i,style:{textAlign:'center',fontSize:'8px',
              fontWeight:700,color:'var(--text3)',padding:'2px 0'}},l))
          ),
          div({style:{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3}},
            ...Array.from({length:firstDOW}).map((_,i)=>div({key:'blank'+i})),
            ...Array.from({length:daysInMonth},(_,idx)=>idx+1).map(day=>{
              const cell=monthData[day]||{events:[]};
              const isToday=viewY===today.getFullYear()&&viewM===today.getMonth()+1&&day===today.getDate();
              const uniqueTypes=[...new Set(cell.events.map(e=>e.type))];
              return div({key:day,
                onClick:()=>{setPrefillDate(viewY+'-'+String(viewM).padStart(2,'0')+'-'+String(day).padStart(2,'0'));setShowAddEvent(true);},
                style:{minHeight:54,padding:'4px 5px',borderRadius:6,cursor:'pointer',
                  background:isToday?'rgba(245,158,11,.08)':'var(--surf2)',
                  border:'.5px solid '+(isToday?'rgba(245,158,11,.4)':'var(--bdr)')}},
                div({style:{fontSize:'9px',fontWeight:isToday?800:600,color:isToday?'var(--amber)':'var(--text2)',marginBottom:3}},day),
                div({style:{display:'flex',flexWrap:'wrap',gap:2}},
                  ...uniqueTypes.slice(0,4).map((t,i)=>span({key:i,title:EVENT_TYPES[t]?.label,
                    style:{width:7,height:7,borderRadius:2,background:(EVENT_TYPES[t]||EVENT_TYPES.other).col,display:'inline-block'}})),
                  cell.events.length>4&&span({style:{fontSize:'6.5px',color:'var(--text3)'}},'+'+(cell.events.length-4))
                ),
                cell.events.length>0&&div({style:{fontSize:'6.5px',color:'var(--text3)',marginTop:2}},
                  cell.events.length+' tagged')
              );
            })
          )
        )
      ),

      // ════════ RULES TAB ════════
      tab==='rules'&&div({style:{flex:1,overflowY:'auto',padding:'14px 16px'}},
        div({style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}},
          div({style:{fontSize:'10px',color:'var(--text3)',lineHeight:1.6,maxWidth:480}},
            'A rule fires every year automatically as a pending confirmation — dates are never auto-written, since school calendars shift slightly year to year.'),
          btn({className:'btn btn-sm btn-a',style:{fontWeight:700,fontSize:'9px',flexShrink:0},
            onClick:()=>{setRuleDraft(newRuleDraft());setShowRuleForm(true);}},'➕ New Rule')
        ),
        !rules.length&&div({style:{color:'var(--text3)',textAlign:'center',padding:'40px 20px',fontSize:'11px'}},
          div({style:{fontSize:36,marginBottom:10}},'🔁'),
          div(null,'No recurring rules yet. Add one for an annual school break or local event.')),
        ...rules.map(rule=>{
          const nextSpan=expandRecurringRule(rule, today.getFullYear());
          const et=EVENT_TYPES[rule.type]||EVENT_TYPES.other;
          return div({key:rule.id,style:{border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
            padding:'10px 12px',marginBottom:8,background:'var(--surf2)',opacity:rule.active===false?.5:1}},
            div({style:{display:'flex',alignItems:'center',gap:8}},
              span({style:{fontSize:'14px'}},et.icon),
              div({style:{flex:1}},
                div({style:{fontSize:'10px',fontWeight:700,color:'var(--text)'}},rule.label),
                div({style:{fontSize:'8px',color:'var(--text3)',marginTop:2}},
                  et.label+' · '+MONTH_NAMES[rule.month-1]+' '+rule.day+
                  (rule.durationDays>1?' ('+rule.durationDays+' days)':'')+
                  ' · '+rule.locs.length+' store'+(rule.locs.length!==1?'s':'')+
                  (nextSpan?' · next: '+nextSpan.start.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):''))
              ),
              btn({className:'btn btn-sm',style:{fontSize:'8px'},onClick:()=>toggleRuleActive(rule.id)},
                rule.active===false?'Activate':'Pause'),
              btn({className:'btn btn-sm',style:{fontSize:'8px'},onClick:()=>{setRuleDraft(rule);setShowRuleForm(true);}},'✎ Edit'),
              btn({className:'btn btn-sm btn-red',style:{fontSize:'8px'},onClick:()=>deleteRule(rule.id)},'✕')
            )
          );
        }),

        showRuleForm&&ruleDraft&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',
          zIndex:470,display:'flex',alignItems:'center',justifyContent:'center',padding:16}},
          div({style:{background:'var(--surf)',border:'.5px solid var(--bdr2)',borderRadius:'var(--rl)',
            maxWidth:480,width:'100%',padding:16,display:'flex',flexDirection:'column',gap:10}},
            div({style:{fontSize:'12px',fontWeight:700,color:'var(--text)'}},
              rules.some(r=>r.id===ruleDraft.id)?'Edit Recurring Rule':'New Recurring Rule'),
            h('input',{value:ruleDraft.label,placeholder:'Label — e.g. Ada Public Schools Thanksgiving Break',
              onChange:e=>setRuleDraft(d=>({...d,label:e.target.value})),
              style:{fontSize:'10px',padding:'6px 8px',background:'var(--surf2)',border:'.5px solid var(--bdr)',
                borderRadius:'var(--r)',color:'var(--text)'}}),
            div({style:{display:'flex',gap:8}},
              h('select',{value:ruleDraft.type,onChange:e=>setRuleDraft(d=>({...d,type:e.target.value})),
                style:{flex:1,fontSize:'10px',padding:'6px 8px',background:'var(--surf2)',border:'.5px solid var(--bdr)',
                  borderRadius:'var(--r)',color:'var(--text)'}},
                Object.entries(EVENT_TYPES).map(([k,v])=>h('option',{key:k,value:k},v.icon+' '+v.label))),
            ),
            div({style:{display:'flex',gap:8}},
              h('select',{value:ruleDraft.month,onChange:e=>setRuleDraft(d=>({...d,month:+e.target.value})),
                style:{flex:1,fontSize:'10px',padding:'6px 8px',background:'var(--surf2)',border:'.5px solid var(--bdr)',
                  borderRadius:'var(--r)',color:'var(--text)'}},
                MONTH_NAMES.map((m,i)=>h('option',{key:i,value:i+1},m))),
              h('input',{type:'number',min:1,max:31,value:ruleDraft.day,
                onChange:e=>setRuleDraft(d=>({...d,day:+e.target.value})),
                style:{width:70,fontSize:'10px',padding:'6px 8px',background:'var(--surf2)',border:'.5px solid var(--bdr)',
                  borderRadius:'var(--r)',color:'var(--text)'}}),
              h('input',{type:'number',min:1,max:30,value:ruleDraft.durationDays,
                title:'Duration (days)',placeholder:'Days',
                onChange:e=>setRuleDraft(d=>({...d,durationDays:+e.target.value})),
                style:{width:80,fontSize:'10px',padding:'6px 8px',background:'var(--surf2)',border:'.5px solid var(--bdr)',
                  borderRadius:'var(--r)',color:'var(--text)'}})
            ),
            div(null,
              div({style:{fontSize:'8px',color:'var(--text3)',marginBottom:5}},'Stores'),
              div({style:{display:'flex',gap:5,marginBottom:5}},
                btn({className:'btn btn-sm',style:{fontSize:'8px'},onClick:()=>setRuleDraft(d=>({...d,locs:LOCS}))},'All'),
                btn({className:'btn btn-sm',style:{fontSize:'8px'},onClick:()=>setRuleDraft(d=>({...d,locs:okLocs}))},'OK'),
                btn({className:'btn btn-sm',style:{fontSize:'8px'},onClick:()=>setRuleDraft(d=>({...d,locs:flLocs}))},'FL'),
                btn({className:'btn btn-sm',style:{fontSize:'8px'},onClick:()=>setRuleDraft(d=>({...d,locs:[]}))},'Clear')
              ),
              div({style:{display:'flex',flexWrap:'wrap',gap:3,maxHeight:100,overflowY:'auto'}},
                ...LOCS.map(l=>btn({key:l,onClick:()=>toggleRuleLoc(l),
                  style:{fontSize:'8px',padding:'2px 6px',borderRadius:3,cursor:'pointer',
                    background:ruleDraft.locs.includes(l)?'rgba(165,180,252,.15)':'rgba(255,255,255,.04)',
                    border:'.5px solid '+(ruleDraft.locs.includes(l)?'rgba(165,180,252,.5)':'rgba(255,255,255,.08)'),
                    color:ruleDraft.locs.includes(l)?'#a5b4fc':'var(--text3)'}},
                  (ruleDraft.locs.includes(l)?'☑ ':'☐ ')+sNameC(l)))
              )
            ),
            div({style:{display:'flex',justifyContent:'flex-end',gap:8,marginTop:6}},
              btn({className:'btn btn-sm',onClick:()=>{setShowRuleForm(false);setRuleDraft(null);}},'Cancel'),
              btn({className:'btn btn-a',style:{fontWeight:700},onClick:saveRule},'Save Rule')
            )
          )
        )
      ),

      // ════════ PENDING TAB ════════
      tab==='pending'&&div({style:{flex:1,overflowY:'auto',padding:'14px 16px'}},
        !pendingItems.length&&div({style:{color:'var(--text3)',textAlign:'center',padding:'40px 20px',fontSize:'11px'}},
          div({style:{fontSize:36,marginBottom:10}},'✅'),
          div(null,'Nothing pending. Run a search or check back when a recurring rule comes due.')),
        ...pendingItems.map(item=>{
          const et=EVENT_TYPES[item.type]||EVENT_TYPES.other;
          const c=getChecks(item);
          const confCol=item.confidence==='high'?'#10b981':item.confidence==='low'?'#f87171':'#f59e0b';
          return div({key:item.key,style:{border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
            padding:'10px 12px',marginBottom:8,background:'var(--surf2)'}},
            div({style:{display:'flex',alignItems:'flex-start',gap:8,marginBottom:6}},
              span({style:{fontSize:'14px'}},et.icon),
              div({style:{flex:1}},
                div({style:{display:'flex',gap:6,alignItems:'baseline',flexWrap:'wrap'}},
                  span({style:{fontSize:'10px',fontWeight:700,color:'var(--text)'}},item.label),
                  item.confidence&&span({style:{fontSize:'7px',padding:'1px 6px',borderRadius:99,
                    background:confCol+'22',color:confCol,fontWeight:700}},item.confidence.toUpperCase())
                ),
                div({style:{fontSize:'8px',color:'var(--text3)',marginTop:2}},
                  new Date(item.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})+
                  (item.endDate?' – '+new Date(item.endDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'')+
                  ' · '+(item.source==='ai_search'?'🔍 AI Search':'🔁 Recurring Rule')),
                item.sourceNote&&div({style:{fontSize:'8px',color:'var(--text2)',marginTop:3,lineHeight:1.4}},item.sourceNote)
              )
            ),
            div({style:{display:'flex',flexWrap:'wrap',gap:3,marginBottom:8}},
              ...LOCS.filter(l=>(item.suggestedLocs||[]).includes(l)||c.locs.includes(l)).map(l=>
                btn({key:l,onClick:()=>toggleLoc(item,l),
                  style:{fontSize:'7.5px',padding:'2px 6px',borderRadius:3,cursor:'pointer',
                    background:c.locs.includes(l)?'rgba(245,158,11,.15)':'rgba(255,255,255,.04)',
                    border:'.5px solid '+(c.locs.includes(l)?'rgba(245,158,11,.5)':'rgba(255,255,255,.08)'),
                    color:c.locs.includes(l)?'var(--amber)':'var(--text3)'}},
                  (c.locs.includes(l)?'☑ ':'☐ ')+sNameC(l)))
            ),
            div({style:{display:'flex',gap:6}},
              btn({className:'btn btn-a',style:{fontSize:'9px',fontWeight:700},onClick:()=>approveItem(item)},
                'Apply to '+c.locs.length+' Store'+(c.locs.length!==1?'s':'')),
              btn({className:'btn btn-sm',style:{fontSize:'9px'},onClick:()=>skipItem(item)},'Skip')
            )
          );
        })
      )
    )
  );
}

function EventEntryModal({stores, settings, onTagEvent, onClose}) {
  const [selLocs, setSelLocs] = React.useState([]);
  const [startDate, setStartDate] = React.useState('');
  const [endDate,   setEndDate]   = React.useState('');
  const [isRange,   setIsRange]   = React.useState(false);
  const [selTypes,  setSelTypes]  = React.useState([]);
  const [customNote,setCustomNote]= React.useState('');
  const [saved,     setSaved]     = React.useState(false);
  const [saveCount, setSaveCount] = React.useState(0);

  const toggleLoc  = loc => setSelLocs(p=>p.includes(loc)?p.filter(x=>x!==loc):[...p,loc]);
  const toggleType = k   => setSelTypes(p=>p.includes(k)?p.filter(x=>x!==k):[...p,k]);
  const allLocs    = stores&&stores.map(s=>s.loc)||[];
  const okLocs     = STORE_COORDS?Object.entries(STORE_COORDS).filter(([,v])=>v.org!=='Emerald Arches').map(([k])=>k):[];
  const flLocs     = STORE_COORDS?Object.entries(STORE_COORDS).filter(([,v])=>v.org==='Emerald Arches').map(([k])=>k):[];

  const save = () => {
    if(!selLocs.length) return alert('Select at least one location.');
    if(!startDate)      return alert('Select a start date.');
    if(!selTypes.length&&!customNote.trim()) return alert('Select an event type or enter a custom note.');

    const primaryType = selTypes[0]||'other';
    const et = EVENT_TYPES[primaryType]||EVENT_TYPES.other;
    const tagLabel = selTypes.map(k=>(EVENT_TYPES[k]||{}).label||k).join(' + ')||customNote.slice(0,40);
    const noteText = customNote.trim()||tagLabel;
    const tagsArr  = selTypes.map(k=>({type:k,...(EVENT_TYPES[k]||EVENT_TYPES.other)}));
    if(!tagsArr.length) tagsArr.push({type:'other',...EVENT_TYPES.other});

    const start = new Date(startDate+'T12:00:00Z');
    const end   = isRange&&endDate ? new Date(endDate+'T12:00:00Z') : start;
    if(end < start) return alert('End date must be on or after start date.');

    // Build list of dates in range
    const dates=[]; let d=new Date(start);
    while(d<=end){dates.push(new Date(d));d=new Date(d.getTime()+86400000);}
    const totalDays=dates.length;
    const rangeId=totalDays>1?('range_'+dKey(start)+'_'+dKey(end)+'_'+primaryType):null;
    const rangeLabelBase=totalDays>1?(tagLabel+' '+start.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})+
      '–'+end.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})):null;

    // ── Write all tags directly to localStorage then trigger ONE state refresh ──
    // Avoids React stale-closure bug where looped onTagEvent calls all read the
    // same initial userEvents snapshot, leaving only the last call's tag saved.
    const cur=(()=>{try{return JSON.parse(JSON.stringify(JSON.parse(localStorage.getItem('mf_events')||'{}')));}catch{return {};}})();
    let count=0;
    for(let i=0;i<dates.length;i++){
      const dk=dKey(dates[i]);
      const dayNote=totalDays>1?(noteText+' (Day '+(i+1)+' of '+totalDays+')'):noteText;
      const dayLabel=rangeLabelBase?(rangeLabelBase+' — Day '+(i+1)+' of '+totalDays):tagLabel;
      for(const loc of selLocs){
        if(!cur[loc])cur[loc]={};
        cur[loc][dk]={
          type:primaryType,note:dayNote,label:dayLabel,
          icon:tagsArr.map(t=>t.icon||'📌').join(' '),tags:tagsArr,
          customNote:customNote.trim(),source:'Manual Entry',
          ...(rangeId?{rangeId,rangeDayNum:i+1,rangeTotalDays:totalDays,rangeLabel:rangeLabelBase}:{})
        };
        count++;
      }
    }
    try{localStorage.setItem('mf_events',JSON.stringify(cur));}catch(e){alert('Save error: '+e.message);return;}
    // Single _refresh_ call to sync React state with the updated localStorage
    onTagEvent('_refresh_','_now_','','',{_refreshState:cur});
    setSaveCount(count);
    setSaved(true);
    setTimeout(()=>{setSaved(false);setStartDate('');setEndDate('');setSelTypes([]);setCustomNote('');setIsRange(false);setSelLocs([]);},1800);
  };

  const grpBtn=(loc)=>{
    const sel=selLocs.includes(loc);
    const name=sName(loc);
    return div({key:loc,onClick:()=>toggleLoc(loc),
      style:{cursor:'pointer',padding:'3px 7px',borderRadius:3,fontSize:'9px',
        background:sel?'rgba(165,180,252,.15)':'rgba(255,255,255,.04)',
        border:'.5px solid '+(sel?'rgba(165,180,252,.5)':'rgba(255,255,255,.08)'),
        color:sel?'#a5b4fc':'var(--text2)',userSelect:'none'}},
      sel?'☑ ':'☐ ',name);
  };

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.75)',zIndex:500,
    display:'flex',alignItems:'center',justifyContent:'center',padding:16}},
    div({style:{background:'var(--surf)',border:'.5px solid var(--bdr2)',borderRadius:'var(--rl)',
      maxWidth:700,width:'100%',maxHeight:'90vh',display:'flex',flexDirection:'column'}},
      // Header
      div({style:{padding:'14px 18px',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center',gap:10,flexShrink:0}},
        div(null,
          div({style:{fontSize:'13px',fontWeight:700,color:'var(--text)'}},'➕ Add Event Entry'),
          div({style:{fontSize:'9px',color:'var(--text3)',marginTop:2}},
            'Tag any location and date — no scan required. Supports single days or multi-day ranges.')
        ),
        btn({onClick:onClose,style:{marginLeft:'auto',background:'none',border:'none',color:'var(--text2)',fontSize:22,cursor:'pointer'}},'×')
      ),
      div({style:{overflowY:'auto',padding:'14px 18px',flex:1,display:'flex',flexDirection:'column',gap:14}},

        // Location selector
        div(null,
          div({style:{fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text3)',marginBottom:6}},
            'Locations — Select One or More'),
          div({style:{display:'flex',gap:6,flexWrap:'wrap',marginBottom:5}},
            btn({className:'btn btn-sm',style:{fontSize:'8.5px',padding:'2px 8px'},
              onClick:()=>setSelLocs(allLocs)},selLocs.length===allLocs.length?'☑ All':'☐ All Stores'),
            btn({className:'btn btn-sm',style:{fontSize:'8.5px',padding:'2px 8px'},
              onClick:()=>setSelLocs(p=>p.length===okLocs.length&&okLocs.every(l=>p.includes(l))?p.filter(l=>!okLocs.includes(l)):[...new Set([...p,...okLocs])])},
              'OK Stores'),
            btn({className:'btn btn-sm',style:{fontSize:'8.5px',padding:'2px 8px'},
              onClick:()=>setSelLocs(p=>p.length===flLocs.length&&flLocs.every(l=>p.includes(l))?p.filter(l=>!flLocs.includes(l)):[...new Set([...p,...flLocs])])},
              'FL Stores')
          ),
          div({style:{display:'flex',gap:3,flexWrap:'wrap'}},
            allLocs.map(grpBtn)
          ),
          selLocs.length>0&&div({style:{fontSize:'8px',color:'#a5b4fc',marginTop:4}},
            selLocs.length+' location'+(selLocs.length!==1?'s':'')+' selected')
        ),

        // Date / Range
        div(null,
          div({style:{fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text3)',marginBottom:6}},
            'Date'),
          div({style:{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}},
            div({style:{display:'flex',flexDirection:'column',gap:3}},
              div({style:{fontSize:'8px',color:'var(--text3)'}},'Start Date'),
              h('input',{type:'date',value:startDate,onChange:e=>setStartDate(e.target.value),
                style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
                  padding:'5px 8px',fontSize:'10px',color:'var(--text)',outline:'none'}})
            ),
            div({style:{display:'flex',alignItems:'center',gap:6,marginTop:14}},
              h('input',{type:'checkbox',id:'rangeToggle',checked:isRange,onChange:e=>setIsRange(e.target.checked),
                style:{cursor:'pointer'}}),
              h('label',{htmlFor:'rangeToggle',style:{fontSize:'9px',color:'var(--text2)',cursor:'pointer',userSelect:'none'}},
                'Date Range (multi-day event)')
            ),
            isRange&&div({style:{display:'flex',flexDirection:'column',gap:3}},
              div({style:{fontSize:'8px',color:'var(--text3)'}},'End Date'),
              h('input',{type:'date',value:endDate,min:startDate,onChange:e=>setEndDate(e.target.value),
                style:{background:'var(--surf)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
                  padding:'5px 8px',fontSize:'10px',color:'var(--text)',outline:'none'}})
            )
          ),
          isRange&&startDate&&endDate&&(()=>{
            const days=Math.round((new Date(endDate)-new Date(startDate))/86400000)+1;
            return div({style:{fontSize:'8px',color:'#a5b4fc',marginTop:4}},
              days+' day'+(days!==1?'s':'')+' will be tagged individually with range context');
          })()
        ),

        // Event type groups
        div(null,
          div({style:{fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text3)',marginBottom:6}},
            'Event Type — Select One or More'),
          EVENT_TYPE_GROUPS.map((grp,gi)=>div({key:gi,style:{marginBottom:8}},
            div({style:{fontSize:'7.5px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',color:'var(--text3)',marginBottom:4}},grp.label),
            div({style:{display:'flex',gap:3,flexWrap:'wrap'}},
              grp.items.map(k=>{const et=EVENT_TYPES[k];if(!et)return null;
                const sel=selTypes.includes(k);
                return btn({key:k,onClick:()=>toggleType(k),
                  style:{fontSize:'9px',padding:'3px 9px',
                    background:sel?et.col+'33':'rgba(255,255,255,.04)',
                    color:sel?et.col:'var(--text3)',
                    border:'.5px solid '+(sel?et.col+'88':'rgba(255,255,255,.08)'),
                    borderRadius:4,cursor:'pointer',fontWeight:sel?700:400}},
                  et.icon+' '+et.label+(sel?' ✓':''));}))
          ))
        ),

        // Custom note
        div(null,
          div({style:{fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text3)',marginBottom:4}},
            'Custom Note (Optional)'),
          h('textarea',{value:customNote,onChange:e=>setCustomNote(e.target.value),
            placeholder:'Describe the event — e.g. Road work on Main St caused parking issues; major detour affecting drive-thru access',
            rows:2,style:{width:'100%',background:'var(--surf)',border:'.5px solid var(--bdr)',
              borderRadius:'var(--r)',padding:'6px 8px',fontSize:'9px',color:'var(--text)',
              outline:'none',resize:'vertical',fontFamily:'inherit',lineHeight:1.5}})
        )
      ),

      // Footer
      div({style:{padding:'10px 18px',borderTop:'.5px solid var(--bdr)',flexShrink:0,display:'flex',justifyContent:'space-between',alignItems:'center'}},
        saved
          ? div({style:{fontSize:'10px',color:'#10b981',fontWeight:600}},'✅ Saved '+saveCount+' event entr'+(saveCount!==1?'ies':'y')+'!')
          : div({style:{fontSize:'9px',color:'var(--text3)'}},
              selLocs.length&&startDate&&(selTypes.length||customNote.trim())
                ?(selLocs.length+' location'+(selLocs.length!==1?'s':'')+' · '+(isRange&&endDate?Math.round((new Date(endDate)-new Date(startDate))/86400000+1)+' days':'1 day')+' · '+(selTypes.length?selTypes.map(k=>(EVENT_TYPES[k]||{}).label||k).join(', '):customNote.slice(0,40)))
                :'Complete form to save'
            ),
        div({style:{display:'flex',gap:8}},
          btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'Cancel'),
          btn({className:'btn btn-a',
            disabled:!selLocs.length||!startDate||(isRange&&!endDate)||(!selTypes.length&&!customNote.trim()),
            style:{fontSize:'10px',padding:'5px 16px',fontWeight:700,
              opacity:(!selLocs.length||!startDate||(isRange&&!endDate)||(!selTypes.length&&!customNote.trim()))?.4:1},
            onClick:save},'Save Event'+(selTypes.length>1?' ('+selTypes.length+' types)':''))
        )
      )
    )
  );
}

// GM REVIEW PACK — Phase 3
// Generates a shareable HTML survey for any location/patch/operator.
// GM opens file, fills it out, submits → downloads JSON → you import.
async function generateReviewPack(loc, ds, settings, userEvents, apiKey) {
  // ── Load fresh state from localStorage (never trust stale component state) ──
  const allAnoms=(()=>{try{const s=localStorage.getItem('mf_backtest_results');return s?JSON.parse(s):{};} catch{return {};}})();
  const uev=JSON.parse(JSON.stringify((()=>{try{return JSON.parse(localStorage.getItem('mf_events')||'{}');}catch{return {};}})()));

  if(!allAnoms[loc]||!allAnoms[loc].length){
    alert('No anomaly scan results found for '+(STORE_NAMES[loc]||loc)+'. Run the Anomaly Scanner first.');return;
  }

  // ── Key normalization ──────────────────────────────────────────────────────
  // Cached scan rows may have dKeyStr as full ISO datetime or plain YYYY-MM-DD.
  // nDK() (global) always normalizes to date-only YYYY-MM-DD for consistent lookup.
  const normRow=r=>{
    if(r.dKeyStr) return nDK(String(r.dKeyStr));
    if(r.date) return dKey(new Date(r.date));
    return r.dateStr||'';
  };

  // ── Auto-tag holidays before building the pack ─────────────────────────────
  // Ensures holidays are persisted to localStorage AND excluded from review.
  // Uses HOLIDAY_MAP which covers 2019-2028 (yr-7 to yr+2).
  let autoHolTagged=0;
  for(const row of allAnoms[loc]) {
    const dk=normRow(row);
    if(!dk||(uev[loc]&&uev[loc][dk])) continue;
    const hol=isHoliday(new Date(dk+'T12:00:00'));
    if(hol){
      if(!uev[loc]) uev[loc]={};
      uev[loc][dk]={label:hol.label||String(hol),tagLabel:hol.label||String(hol),
        type:'holiday',source:'Auto-Holiday Scan',aiMatched:false,
        note:'Auto-tagged during Review Pack generation'};
      autoHolTagged++;
    }
  }
  if(autoHolTagged>0){try{localStorage.setItem('mf_events',JSON.stringify(uev));}catch{}}

  // ── Build review rows: exclude all tagged (includes just-tagged holidays) ──
  const rows=(allAnoms[loc]||[]).filter(r=>{
    const dk=normRow(r);
    return!!dk&&!(uev[loc]&&uev[loc][dk]);
  });

  if(!rows.length){
    const msg=autoHolTagged>0
      ?'✅ Auto-tagged '+autoHolTagged+' holiday'+(autoHolTagged!==1?'s':'')+' for '+sNameC(loc)+'. No other untagged anomalies remain — nothing to send out.'
      :'All anomalies for '+(STORE_NAMES[loc]||loc)+' are already tagged. Nothing to review.';
    alert(msg);return;
  }

  const storeName=sName(loc);
  const threshold=settings.anomalyThreshold||8;

  // Optional AI pre-populate (batch, 3 at a time)
  const suggestions={};
  if(apiKey&&rows.length>0){
    for(let i=0;i<Math.min(rows.length,30);i+=3){
      const batch=rows.slice(i,Math.min(i+3,rows.length));
      await Promise.all(batch.map(async r=>{
        try{
          const resp=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
            headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
            body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:120,
              messages:[{role:'user',content:'In 1-2 sentences, what likely caused a McDonald\'s in '+storeName+' to have '+(r.varPct>0?'+':'')+r.varPct.toFixed(1)+'% sales on '+r.dateStr+' ('+r.dow+')? Answer concisely with possible reasons. No intro.'}]})});
          const d=await resp.json();
          const txt=(d.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('').trim();
          suggestions[r.dKeyStr||r.dateStr]=txt;
        }catch{}
      }));
      await new Promise(r=>setTimeout(r,1000));
    }
  }

  const now=new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const rowsHtml=rows.map((r,i)=>{
    const vc=r.varPct>0?'#10b981':'#ef4444';
    const sug=suggestions[r.dKeyStr||r.dateStr]||'';
    return `
    <div class="card" data-idx="${i}" data-dk="${r.dKeyStr||r.dateStr}" data-var="${r.varPct.toFixed(2)}">
      <div class="card-header">
        <div class="date">${r.dateStr} <span class="dow">${r.dow||''}</span></div>
        <div class="variance" style="color:${vc}">${r.varPct>0?'+':''}${r.varPct.toFixed(1)}%</div>
      </div>
      <div class="amounts">Sales: <strong>$${Math.round(r.actual).toLocaleString()}</strong> &nbsp;Baseline: $${Math.round(r.forecast).toLocaleString()}</div>
      ${sug?`<div class="suggestion">💡 ${sug}</div>`:''}
      <div class="form-group">
        <label>What happened? (tap to add your note)</label>
        <textarea placeholder="e.g. Power outage 2pm-6pm, road closed, crew short-staffed, local event..." rows="2" data-field="note" oninput="updateCard(${i},this)"></textarea>
      </div>
      <div class="btn-row">
        <button class="tag-btn" onclick="setTag(${i},'normal','Normal Day')">✓ Normal Day</button>
        <button class="tag-btn" onclick="setTag(${i},'weather','Weather')">⛈ Weather</button>
        <button class="tag-btn" onclick="setTag(${i},'tech','Tech/Power')">💻 Tech/Power</button>
        <button class="tag-btn" onclick="setTag(${i},'staffing','Staffing')">👥 Staffing</button>
        <button class="tag-btn" onclick="setTag(${i},'event','Local Event')">🎪 Local Event</button>
        <button class="tag-btn" onclick="setTag(${i},'other','Other')">📌 Other</button>
      </div>
      <div class="status-row" id="status-${i}"></div>
    </div>`;
  }).join('');

  const html=`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Anomaly Review — ${storeName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f7;color:#1c1c1e;font-size:14px;padding:0 0 80px;}
.header{background:#fff;padding:16px 20px;border-bottom:1px solid #e5e5e5;position:sticky;top:0;z-index:100;}
.header h1{font-size:18px;font-weight:700;margin-bottom:2px;}
.header p{font-size:12px;color:#6e6e73;}
.meta{font-size:11px;color:#6e6e73;padding:8px 20px;background:#f5f5f7;}
.card{background:#fff;margin:10px 16px;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.1);}
.card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}
.date{font-size:15px;font-weight:700;}
.dow{font-size:11px;color:#6e6e73;font-weight:400;margin-left:4px;}
.variance{font-size:16px;font-weight:800;}
.amounts{font-size:12px;color:#6e6e73;margin-bottom:8px;}
.suggestion{font-size:12px;color:#0071e3;background:#f0f7ff;border-radius:6px;padding:8px;margin:6px 0;line-height:1.4;}
.form-group label{font-size:12px;color:#6e6e73;display:block;margin-bottom:4px;}
.form-group textarea{width:100%;border:1px solid #d1d1d6;border-radius:8px;padding:8px;font-size:13px;resize:vertical;font-family:inherit;}
.btn-row{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;}
.tag-btn{border:1.5px solid #d1d1d6;background:#f9f9f9;border-radius:20px;padding:5px 10px;font-size:12px;cursor:pointer;transition:all .15s;}
.tag-btn.active{background:#0071e3;color:#fff;border-color:#0071e3;}
.status-row{min-height:20px;font-size:11px;color:#34c759;font-weight:600;margin-top:4px;}
.footer{position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #e5e5e5;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;}
.submit-btn{background:#0071e3;color:#fff;border:none;border-radius:10px;padding:12px 28px;font-size:15px;font-weight:600;cursor:pointer;}
.submit-btn:disabled{background:#aaa;}
.progress{font-size:12px;color:#6e6e73;}
.complete-banner{background:#34c759;color:#fff;text-align:center;padding:20px;font-size:16px;font-weight:700;border-radius:12px;margin:16px;}
</style></head><body>
<div class="header">
  <h1>📋 Anomaly Review — ${storeName}</h1>
  <p>Review untagged sales anomalies · Tap to add context · Submit when done</p>
</div>
<div class="meta">Generated ${now} · ${rows.length} anomaly${rows.length!==1?'ies':''} to review · Threshold ±${threshold}%</div>
<div id="cards">${rowsHtml}</div>
<div id="complete" class="complete-banner" style="display:none">✅ Review complete! Downloading your responses…</div>
<div class="footer">
  <div class="progress" id="progress">0 of ${rows.length} reviewed</div>
  <button class="submit-btn" id="submitBtn" onclick="submitReview()">Submit Review →</button>
</div>
<script>
var data=${JSON.stringify(rows.map(r=>({dk:r.dKeyStr||r.dateStr,dateStr:r.dateStr,dow:r.dow,varPct:r.varPct,actual:r.actual,forecast:r.forecast})))};
var responses=data.map(function(){return{type:'',note:'',reviewed:false};});
function updateProgress(){var n=responses.filter(function(r){return r.reviewed;}).length;document.getElementById('progress').textContent=n+' of '+data.length+' reviewed';}
function setTag(i,type,label){responses[i].type=type;responses[i].label=label;responses[i].reviewed=true;document.querySelectorAll('.card')[i].querySelectorAll('.tag-btn').forEach(function(b){b.classList.remove('active');});event.target.classList.add('active');document.getElementById('status-'+i).textContent='✓ Tagged: '+label;updateProgress();}
function updateCard(i,el){responses[i].note=el.value;if(!responses[i].reviewed){responses[i].reviewed=el.value.length>3;updateProgress();}}
function submitReview(){
  var result={loc:'${loc}',storeName:'${storeName}',generatedAt:'${new Date().toISOString()}',submittedAt:new Date().toISOString(),responses:data.map(function(d,i){return Object.assign({},d,responses[i]);})};
  var blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'});
  var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;
  a.download='review_${loc}_${new Date().toISOString().slice(0,10)}.json';a.click();URL.revokeObjectURL(url);
  document.getElementById('complete').style.display='block';document.getElementById('submitBtn').disabled=true;
}
<\/script><\/body><\/html>`;

  const blob=new Blob([html],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='review_pack_'+storeName.replace(/[^a-z0-9]/gi,'_').toLowerCase()+'_'+new Date().toISOString().slice(0,10)+'.html';
  document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(url);document.body.removeChild(a);},1000);
}

function EventRegistryModal({stores, userEvents, onTagEvent, onClose}){
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [sortBy, setSortBy] = React.useState('date-desc');

  // Build flat array from userEvents: {loc, dk, date, ...eventData}
  const allEvents = React.useMemo(()=>{
    const evs=[];
    Object.entries(userEvents||{}).forEach(([loc,dkMap])=>{
      Object.entries(dkMap||{}).forEach(([dk,ev])=>{
        if(!ev) return;
        evs.push({loc,dk,date:new Date(dk+'T12:00:00Z'),type:ev.type||'other',
          label:ev.label||ev.tagLabel||(EVENT_TYPES[ev.type]||{}).label||ev.type||'Event',
          note:ev.note||ev.customNote||'',
          icon:(EVENT_TYPES[ev.type]||{}).icon||ev.icon||'🏷',
          source:ev.source||'Manual',
          aiMatched:!!(ev.aiMatched),
          rangeLabel:ev.rangeLabel||null,
          rangeDayNum:ev.rangeDayNum||null,
          rangeTotalDays:ev.rangeTotalDays||null,
        });
      });
    });
    return evs;
  },[userEvents]);

  // Available event types for filter
  const typeOptions = React.useMemo(()=>{
    const types=new Set(allEvents.map(e=>e.type));
    return[...types].sort();
  },[allEvents]);

  // Filter + sort
  const filtered = React.useMemo(()=>{
    let evs=allEvents;
    if(typeFilter!=='all') evs=evs.filter(e=>e.type===typeFilter);
    if(search.trim()){
      const s=search.toLowerCase();
      evs=evs.filter(e=>
        (e.note||'').toLowerCase().includes(s)||
        (e.label||'').toLowerCase().includes(s)||
        (STORE_NAMES[e.loc]||e.loc).toLowerCase().includes(s)||
        e.dk.includes(s)
      );
    }
    evs=[...evs];
    if(sortBy==='date-desc') evs.sort((a,b)=>b.date-a.date);
    else if(sortBy==='date-asc') evs.sort((a,b)=>a.date-b.date);
    else if(sortBy==='loc') evs.sort((a,b)=>(STORE_NAMES[a.loc]||a.loc).localeCompare(STORE_NAMES[b.loc]||b.loc));
    else if(sortBy==='type') evs.sort((a,b)=>a.type.localeCompare(b.type));
    return evs;
  },[allEvents,typeFilter,search,sortBy]);

  const exportCSV=()=>{
    const hdr=['Date','Day','Location','Loc #','Event Type','Label','Note','Source','AI?'];
    const rows=filtered.map(e=>[
      e.dk,
      e.date.toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'}),
      sNameC(e.loc),
      e.loc,
      e.type,
      e.label,
      (e.note||'').split('\n').join(' '),
      e.source,
      e.aiMatched?'Yes':'No'
    ]);
    const csv=[hdr,...rows].map(r=>r.map(v=>'"'+String(v||'').replace(/"/g,'""')+'"').join(',')).join('\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download='event_registry_'+new Date().toISOString().slice(0,10)+'.csv';
    a.click();
  };

  const removeEvent=(loc,dk)=>{
    if(!onTagEvent) return;
    document.dispatchEvent(new CustomEvent('mf_remove_event',{detail:{loc,date:new Date(dk+'T12:00:00Z')}}));
  };

  const storeName=l=>sName(l);
  const thS={fontSize:'8px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',
    color:'var(--text3)',padding:'5px 8px',textAlign:'left',borderBottom:'.5px solid var(--bdr)',
    background:'var(--mid2)',cursor:'pointer',userSelect:'none',whiteSpace:'nowrap'};

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:500,
    display:'flex',alignItems:'center',justifyContent:'center',padding:16}},
    div({style:{background:'var(--surf)',border:'.5px solid var(--bdr2)',borderRadius:'var(--rl)',
      maxWidth:900,width:'100%',maxHeight:'90vh',display:'flex',flexDirection:'column'}},
      // ── Header ──────────────────────────────────────────────────────
      div({style:{padding:'12px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},
        div(null,
          div({style:{fontSize:'13px',fontWeight:700,color:'var(--text)'}},'📋 Event Registry'),
          div({style:{fontSize:'9px',color:'var(--text3)',marginTop:1}},
            allEvents.length+' total tagged events across all locations — independent of scan results')),
        div({style:{marginLeft:'auto',display:'flex',gap:6,alignItems:'center'}},
          btn({className:'btn btn-sm',style:{color:'#10b981',borderColor:'rgba(16,185,129,.3)'},
            onClick:exportCSV},'⬇ Export CSV'),
          btn({className:'btn btn-sm',onClick:onClose},'✕')
        )
      ),
      // ── Controls ───────────────────────────────────────────────────
      div({style:{padding:'8px 16px',borderBottom:'.5px solid var(--bdr)',flexShrink:0,
        display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',background:'var(--surf2)'}},
        h('input',{type:'text',value:search,onChange:e=>setSearch(e.target.value),
          placeholder:'Search location, event type, note…',
          style:{background:'var(--surf3)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
            color:'var(--text)',fontSize:'10px',padding:'4px 8px',minWidth:200,outline:'none'}}),
        h('select',{value:typeFilter,onChange:e=>setTypeFilter(e.target.value),
          style:{background:'var(--surf3)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
            color:'var(--text)',fontSize:'10px',padding:'4px 6px'}},
          h('option',{value:'all'},'All Types ('+allEvents.length+')'),
          typeOptions.map(t=>h('option',{key:t,value:t},
            (EVENT_TYPES[t]||{}).icon+' '+(EVENT_TYPES[t]||{}).label||t+' ('+allEvents.filter(e=>e.type===t).length+')'))
        ),
        h('select',{value:sortBy,onChange:e=>setSortBy(e.target.value),
          style:{background:'var(--surf3)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
            color:'var(--text)',fontSize:'10px',padding:'4px 6px'}},
          h('option',{value:'date-desc'},'Newest first'),
          h('option',{value:'date-asc'},'Oldest first'),
          h('option',{value:'loc'},'By Location'),
          h('option',{value:'type'},'By Event Type')
        ),
        div({style:{fontSize:'9px',color:'var(--text3)',marginLeft:'auto'}},
          filtered.length+' event'+(filtered.length!==1?'s':'')+(search||typeFilter!=='all'?' (filtered)':''))
      ),
      // ── Note about filter ──────────────────────────────────────────
      div({style:{padding:'5px 16px',background:'rgba(96,165,250,.06)',borderBottom:'.5px solid var(--bdr)',
        fontSize:'8.5px',color:'#60a5fa',flexShrink:0}},
        'ℹ️ The scanner "✅ Tagged" filter only shows dates that were both anomalies AND tagged. ' +
        'This registry shows everything you have tagged — use it to verify coverage.'),
      // ── Table ──────────────────────────────────────────────────────
      filtered.length===0
        ?div({style:{padding:32,textAlign:'center',color:'var(--text3)',flex:1}},
            allEvents.length===0?'No events tagged yet. Use "➕ Add Event" or the scanner tag picker.':
              'No events match your search/filter.')
        :div({style:{overflowY:'auto',flex:1}},
          h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'9px'}},
            h('thead',null,h('tr',null,
              ...['Date','Day','Location','Type','Label / Note','Source',''].map((l,i)=>
                th({key:i,style:{...thS,textAlign:i>=5?'center':'left'}},l)))),
            h('tbody',null, filtered.map((e,i)=>{
              const sName=storeName(e.loc);
              const et=EVENT_TYPES[e.type]||{icon:'🏷',label:e.type};
              return tr({key:i,style:{borderBottom:'.5px solid rgba(255,255,255,.04)',
                background:i%2?'rgba(255,255,255,.015)':'transparent'}},
                td({style:{padding:'4px 8px',fontFamily:'var(--mono)',fontSize:'8.5px',fontWeight:600,
                  color:'var(--text)',whiteSpace:'nowrap'}},e.dk),
                td({style:{padding:'4px 8px',fontSize:'8.5px',color:'var(--text3)',whiteSpace:'nowrap'}},
                  e.date.toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'})),
                td({style:{padding:'4px 8px',fontWeight:600,color:'var(--gold)'}},sName),
                td({style:{padding:'4px 8px',whiteSpace:'nowrap'}},
                  span({style:{fontSize:'8px',padding:'1px 6px',borderRadius:3,fontWeight:700,
                    background:(et.col||'#64748b')+'22',color:et.col||'#64748b',
                    border:'.5px solid '+(et.col||'#64748b')+'55'}},et.icon+' '+(et.label||e.type))),
                td({style:{padding:'4px 8px',maxWidth:280,color:'var(--text2)'}},
                  div({style:{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},
                    e.rangeLabel?span({style:{fontSize:'8px',color:'var(--text3)',marginRight:4}},
                      '(Day '+e.rangeDayNum+' of '+e.rangeTotalDays+')'):null,
                    e.note||e.label||'—')),
                td({style:{padding:'4px 8px',fontSize:'8px',color:'var(--text3)',whiteSpace:'nowrap',textAlign:'center'}},
                  e.aiMatched?'🤖 AI':e.source==='Auto-Holiday Scan'?'🎉 Auto':'📌 '+e.source.replace('Manual Entry','Manual').replace('Manual Tag','Manual')),
                td({style:{padding:'4px 8px',textAlign:'center'}},
                  btn({style:{fontSize:'9px',padding:'1px 5px',background:'none',
                    border:'.5px solid rgba(239,68,68,.2)',borderRadius:3,color:'#f87171',cursor:'pointer'},
                    onClick:()=>removeEvent(e.loc,e.dk),title:'Remove this event tag'},'✕'))
              );
            }))
          )
        )
    )
  );
}


// ── Recurring Rules + Proactive Calendar Search ─────────────────────────────
// ════════════════════════════════════════════════════════════════════════════════
// RECURRING EVENTS ENGINE  (v4.200 — Calendar System)
// ════════════════════════════════════════════════════════════════════════════════
// Most disruptive non-holiday events repeat annually — school breaks, early-
// release days, recurring local festivals. Rather than re-tag every instance
// every year, a recurrence RULE is stored once and expanded into dated
// instances on demand. Instances are never auto-written to mf_events — they
// surface as pending confirmations (same review-before-trust principle as the
// rest of the event system) because school-calendar dates shift slightly
// year to year and a wrong auto-applied date would silently corrupt
// calibration rather than just being absent.
//
// Storage: localStorage 'mf_recurring_rules' — array of:
//   {id, label, type (EVENT_TYPES key), locs:[loc,...], month, day,
//    durationDays, active, source:'manual'|'ai_search', createdAt}
// ─────────────────────────────────────────────────────────────────────────────
function loadRecurringRules(){
  try{ return JSON.parse(localStorage.getItem('mf_recurring_rules')||'[]'); }catch{ return []; }
}
function saveRecurringRules(rules){
  try{ localStorage.setItem('mf_recurring_rules', JSON.stringify(rules)); }catch(e){}
}

// Expand one rule into a concrete {start,end} date range for a given year.
function expandRecurringRule(rule, year){
  if(!rule||rule.month==null||rule.day==null) return null;
  const start = new Date(year, rule.month-1, rule.day, 12);
  const dur = Math.max(1, rule.durationDays||1);
  const end = new Date(start.getTime() + (dur-1)*86400000);
  return {start, end};
}

// For every active rule, find instances in [today, today+monthsAhead] that
// are NOT already present in userEvents for ALL of the rule's target stores
// — these are the ones needing confirmation. A rule is considered "applied"
// for a given year+store only if every day in its range is already tagged.
function getRecurringInstancesNeedingConfirm(rules, userEvents, monthsAhead=14){
  const out=[];
  const now=new Date();
  const horizon=new Date(now.getTime()+monthsAhead*30*86400000);
  const thisYear=now.getFullYear();
  (rules||[]).filter(r=>r.active!==false).forEach(rule=>{
    for(const year of [thisYear, thisYear+1]){
      const span=expandRecurringRule(rule, year);
      if(!span) continue;
      if(span.end<now||span.start>horizon) continue;
      const missingLocs=(rule.locs||[]).filter(loc=>{
        let d=new Date(span.start);
        while(d<=span.end){
          const dk=dKey(d);
          if(!(userEvents[loc]&&userEvents[loc][dk])) return true; // at least one day untagged
          d=new Date(d.getTime()+86400000);
        }
        return false;
      });
      if(missingLocs.length) out.push({
        ruleId:rule.id, ruleLabel:rule.label, type:rule.type,
        start:span.start, end:span.end, locs:missingLocs,
      });
    }
  });
  return out;
}

// ════════════════════════════════════════════════════════════════════════════════
// PROACTIVE CALENDAR SEARCH  (v4.200 — Calendar System)
// ════════════════════════════════════════════════════════════════════════════════
// Forward-looking sibling of lookupMissEvent (which searches reactively, tied
// to an already-detected anomaly). This searches BEFORE anything has gone
// wrong — school district academic calendars and major local events are
// public, predictable, and findable months in advance. Same model/tool/auth
// pattern as lookupMissEvent for consistency; output is structured JSON since
// results need to become calendar entries, not a paragraph for a human to read.
// Results are NEVER auto-applied — they return as candidates for the pending
// review queue in CalendarManagerPanel.
// ─────────────────────────────────────────────────────────────────────────────
async function searchUpcomingEvents(loc){
  const apiKey=(()=>{try{return localStorage.getItem('mf_anthropic_key')||'';}catch{return '';}})();
  if(!apiKey) throw new Error('No Anthropic API key set. Add one in Settings → AI & Integrations.');

  const coord=STORE_COORDS[loc]||{};
  const city=coord.city||'';
  const state=coord.state||'OK';
  const stateFull = state==='FL'?'Florida':'Oklahoma';
  const storeName=STORE_NAMES[loc]||loc;

  const prompt='You are a McDonald\'s district analytics assistant building a proactive events calendar.\n\n'+
'Store: '+storeName+', '+city+', '+stateFull+'\n\n'+
'Search for information that could affect this restaurant\'s sales over the next 4 months:\n'+
'1. The academic calendar for the public school district serving '+city+', '+stateFull+' — find early-release days, no-school/teacher in-service days, and the start/end dates of any school breaks (Thanksgiving, winter break, spring break) for the current school year.\n'+
'2. Any major local events, festivals, concerts, or sports tournaments scheduled in or near '+city+' in the next 120 days that could meaningfully draw or divert foot traffic.\n\n'+
'Return ONLY a JSON array, no other text, no markdown code fences, no explanation. Each item must follow this exact shape:\n'+
'{"date":"YYYY-MM-DD","endDate":"YYYY-MM-DD or null","type":"school_early_release|school_no_school|school_break|school_start|school_end|event","label":"short label","confidence":"high|medium|low","sourceNote":"one short sentence on where this came from"}\n\n'+
'If you find nothing reliable, return an empty array: []';

  const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    body:JSON.stringify({
      model:'claude-haiku-4-5-20251001',
      max_tokens:2048,
      tools:[{type:'web_search_20250305',name:'web_search'}],
      messages:[{role:'user',content:prompt}]
    })});
  if(!res.ok){const err=await res.json().catch(()=>({}));throw new Error((err.error&&err.error.message)||'HTTP '+res.status);}
  const data=await res.json();
  const text=(data.content||[]).filter(b=>b.type==='text'&&b.text).map(b=>b.text).join('\n');

  // Defensive JSON extraction — model may wrap in prose or code fences despite instructions
  const first=text.indexOf('['), last=text.lastIndexOf(']');
  if(first===-1||last===-1||last<first) return [];
  let parsed;
  try{ parsed=JSON.parse(text.slice(first,last+1)); }catch(e){ return []; }
  if(!Array.isArray(parsed)) return [];

  // Validate + normalize each candidate; drop anything malformed rather than
  // surfacing garbage into the review queue
  return parsed.filter(c=>c&&c.date&&/^\d{4}-\d{2}-\d{2}$/.test(c.date)&&EVENT_TYPES[c.type]).map(c=>({
    date:c.date, endDate:(c.endDate&&/^\d{4}-\d{2}-\d{2}$/.test(c.endDate))?c.endDate:null,
    type:c.type, label:(c.label||EVENT_TYPES[c.type].label).slice(0,90),
    confidence:['high','medium','low'].includes(c.confidence)?c.confidence:'medium',
    sourceNote:(c.sourceNote||'').slice(0,180),
  }));
}

export { CalendarManagerPanel, EventEntryModal, EventRegistryModal, loadRecurringRules, saveRecurringRules, expandRecurringRule, getRecurringInstancesNeedingConfirm, searchUpcomingEvents };
