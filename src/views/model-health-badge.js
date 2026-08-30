// @ts-nocheck
// #232: split out of analytics.js. store-dash.js is statically imported by App.js (Finding 3 —
// it's a grab-bag that needs its own split before it can go lazy), and it only needed this one
// small badge component from analytics.js's 316 KB. A static importer reaching even one export
// of a module pins the WHOLE module in the entry chunk regardless of which export is used — same
// mechanism #230's header documents for changelog-data.js — so this one component was the thing
// anchoring all of analytics.js in place. store-analytics.js (already lazy) also switched to this
// file so nothing outside analytics.js reaches it for ModelHealthBadge anymore.
import * as React from 'react';
import { computeModelHealth } from '../engine/forecast.js';
// #368 — health.gradeColor can be a hex literal (green) or a CSS var() reference (warn/crit,
// per computeModelHealth's own gradeColor formula in forecast.js). withAlpha (moved to
// utils/fmt.js under #368, alongside patch-heatmap.js's identical #351 fix) normalizes both:
// concatenating a hex alpha suffix directly onto a var() reference (the old `+'22'`/`+'66'`
// below) produces the literal invalid CSS string "var(--warn)22", silently dropped by the
// browser with no console error — so any store graded below "excellent" (var(--warn) or
// var(--crit)) lost its score-pill tint and border entirely. Imported from utils/fmt.js, not
// patch-heatmap.js, so this file — split out of analytics.js specifically to stay small in the
// eager bundle (see below) — never statically imports a large view module for one function.
import { withAlpha } from '../utils/fmt.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

// Health score badge — compact, for use anywhere
export function ModelHealthBadge({loc, settings, ds, showDetail}) {
  const health = computeModelHealth(loc, settings, ds);
  const [open, setOpen] = React.useState(false);

  return div({style:{display:'inline-flex',flexDirection:'column',alignItems:'flex-start',gap:2}},
    div({style:{display:'flex',alignItems:'center',gap:5,cursor:'pointer'},
      onClick:()=>setOpen(o=>!o),
      title:'Model Health Score — '+health.statement},
      // Score pill
      div({style:{display:'flex',alignItems:'center',gap:3,padding:'2px 7px',borderRadius:10,
        background:withAlpha(health.gradeColor,'22'),border:'.5px solid '+withAlpha(health.gradeColor,'66')}},
        div({style:{width:6,height:6,borderRadius:'50%',background:health.gradeColor,flexShrink:0}}),
        health.total!=null&&span({style:{fontWeight:700,fontSize:'9px',color:health.gradeColor}},health.total),
        span({style:{fontSize:'8px',color:health.gradeColor}},' '+health.gradeLabel)
      ),
      showDetail&&span({style:{fontSize:'8px',color:'var(--text3)',marginLeft:2}},open?'▲':'▼')
    ),
    // Detail panel — only shows when open
    open&&showDetail&&div({style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',
      borderRadius:'var(--r)',padding:'8px 10px',minWidth:220,fontSize:'9px',zIndex:10,
      boxShadow:'0 4px 12px rgba(0,0,0,.3)'}},
      div({style:{fontWeight:700,marginBottom:6,color:'var(--text)'}},
        'Model Health: '+health.total+'/100 — '+health.gradeLabel),
      div({style:{marginBottom:8,color:'var(--text2)',lineHeight:1.5}},health.statement),
      [
        {l:'Calibration', s:health.components.cal, max:30, n:health.notes.cal},
        {l:'Data Freshness', s:health.components.fresh, max:25, n:health.notes.fresh},
        {l:'MAPE Stability', s:health.components.mape, max:25, n:health.notes.mape},
        {l:'Sample Size', s:health.components.sample, max:20, n:health.notes.sample},
      ].map((c,i)=>div({key:i,style:{marginBottom:5}},
        div({style:{display:'flex',justifyContent:'space-between',marginBottom:2}},
          span({style:{color:'var(--text2)'}},[c.l]),
          span({style:{fontWeight:600,color:c.s/c.max>=.8?'#10b981':c.s/c.max>=.5?'var(--warn)':'var(--crit)'}},
            [c.s+'/'+c.max])
        ),
        div({style:{height:3,background:'var(--bdr)',borderRadius:2}},
          div({style:{height:'100%',borderRadius:2,width:(c.s/c.max*100)+'%',
            background:c.s/c.max>=.8?'#10b981':c.s/c.max>=.5?'var(--warn)':'var(--crit)',
            transition:'width .3s'}})),
        div({style:{fontSize:'8px',color:'var(--text3)',marginTop:1}},[c.n])
      ))
    )
  );
}
