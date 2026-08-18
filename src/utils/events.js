// @ts-nocheck
function computeEventFactors(ds, userEvents) {
  if(!ds||!ds.laborRows||!userEvents) return {};
  const factors = {};

  // Index laborRows by loc (all rows, order preserved) and by loc+dow (sales>0
  // rows only, matching the baselines filter's own sales>0 requirement) ONCE
  // per call, instead of re-scanning the full cross-store ds.laborRows array
  // for every single event below. computeEventFactors itself already runs
  // once per weekProjections pass (not 189x — see the call site comment in
  // at-a-glance.js), but its own cost was still O(events x laborRows): two
  // full-array passes (find + filter) per event. With userEvents growing
  // ~15x (the #391 calendar-loss fix stops discarding real events), that
  // per-event cost matters. byLoc preserves original array order so
  // byLoc[loc].find(...) returns the identical first match .find() over the
  // unfiltered array would have (loc-only filtering can't reorder same-loc
  // elements relative to each other); byLocDow narrows further only by the
  // exact same conditions (sales>0, dow) the original filter() already
  // applied, so the resulting baseline set is unchanged.
  const byLoc = {}, byLocDow = {};
  for(const r of ds.laborRows){
    if(!r) continue;
    (byLoc[r.loc]||(byLoc[r.loc]=[])).push(r);
    if(r.sales>0){
      const k=r.loc+'|'+r.date.getDay();
      (byLocDow[k]||(byLocDow[k]=[])).push(r);
    }
  }

  for(const [loc, evMap] of Object.entries(userEvents||{})) {
    if(!evMap) continue;
    const typeImpacts = {};
    const locRows = byLoc[loc]||[];
    for(const [dk, ev] of Object.entries(evMap)) {
      const dateObj = new Date(dk+'T12:00:00Z');
      const laborRow = locRows.find(r=>Math.abs(r.date-dateObj)<86400000*1.5);
      if(!laborRow||!laborRow.sales||laborRow.sales<=0) continue;
      const dow = dateObj.getDay();
      const dowRows = byLocDow[loc+'|'+dow]||[];
      const baselines = dowRows
        .filter(r=>Math.abs(r.date-dateObj)>7*86400000)
        .map(r=>r.sales).sort((a,b)=>a-b);
      if(baselines.length<4) continue;
      const trim=Math.max(1,Math.floor(baselines.length*.1));
      const mean=baselines.slice(trim,baselines.length-trim).reduce((a,b)=>a+b,0)/(baselines.length-2*trim);
      if(mean<=0) continue;
      const impact=(laborRow.sales-mean)/mean;
      const types=(ev.tags&&ev.tags.length)?ev.tags.map(t=>t.type):[ev.type||'other'];
      for(const t of types){
        if(!typeImpacts[t]) typeImpacts[t]=[];
        typeImpacts[t].push(impact);
      }
    }
    factors[loc]={};
    for(const [t,impacts] of Object.entries(typeImpacts)){
      if(impacts.length<2) continue;
      const sorted=[...impacts].sort((a,b)=>a-b);
      const mid=Math.floor(sorted.length/2);
      factors[loc][t]=sorted.length%2===0?(sorted[mid-1]+sorted[mid])/2:sorted[mid];
    }
  }
  return factors;
}

export { computeEventFactors };
