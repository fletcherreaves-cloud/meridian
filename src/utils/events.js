// @ts-nocheck
function computeEventFactors(ds, userEvents) {
  if(!ds||!ds.laborRows||!userEvents) return {};
  const factors = {};
  for(const [loc, evMap] of Object.entries(userEvents||{})) {
    if(!evMap) continue;
    const typeImpacts = {};
    for(const [dk, ev] of Object.entries(evMap)) {
      const dateObj = new Date(dk+'T12:00:00Z');
      const laborRow = ds.laborRows.find(r=>r.loc===loc&&Math.abs(r.date-dateObj)<86400000*1.5);
      if(!laborRow||!laborRow.sales||laborRow.sales<=0) continue;
      const dow = dateObj.getDay();
      const baselines = ds.laborRows
        .filter(r=>r.loc===loc&&r.sales>0&&r.date.getDay()===dow&&Math.abs(r.date-dateObj)>7*86400000)
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
