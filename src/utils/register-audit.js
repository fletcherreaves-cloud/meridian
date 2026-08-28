// @ts-nocheck
import { STORE_NAMES } from '../constants.js';

// dispatch #200 (Task Group B, 2026-08-28) — the returned employee objects now carry the
// plaintext name as `e.empName`, sourced from `r.emp`. Owner, live: "on the Register Audit
// tab, no need to hide the employee names here. anyone with access to register audit on
// qsrsoft can see names anyway." Measured before changing anything (this repo's standing
// "measure it, don't reason about it" rule): `r.emp` — the raw name — was ALREADY present,
// unredacted, on every row this function receives (audit_rows.emp is a plaintext name column,
// additive alongside emp_token per dispatch #37/5.076; loadAuditRows() in src/lib/supabase.js
// maps it straight through as `emp`). So the identity-vault reveal gate (dispatch #37/#38,
// `RevealName`/`reveal_employee_identity()`) was never actually withholding the name from
// this app's own already-loaded client state — it only withheld it from RENDERING. Dispatch
// #200 removes that display-only gate for Register Audit specifically (see
// src/views/store-analytics.js's RegisterAuditTab/RegisterAuditNarrative); this file just
// stops discarding the name it was already handed. `e.id` (the token, `r.empToken`) is KEPT
// unchanged — it's still the stable grouping/join key used by registerTypeBreakdown() and by
// Security Findings (security-panel.js groups by empToken and reuses `RevealName` there,
// UNCHANGED and out of scope for #200 — that surface's underlying data genuinely has no raw
// name alongside it, a different shape from this one). `.name` below is still the STORE name
// (STORE_NAMES[r.loc]), not personnel data — unrelated field, same name coincidence as before.
// dateKey() -- a caller-agnostic string key for "which calendar day is this row." audit_rows
// callers disagree on the wire type: loadAuditRows() hands back a Date object, loadAuditRowsWindow()
// hands back the raw 'YYYY-MM-DD' string, and this file's own tests use both. Needed at all only
// because of dispatch #59: register_type joined the row grain, so one employee can now have up to
// three rows on ONE calendar day (Cashier/Manager/Preparer), and `days`/`cashOSDays` below count
// DISTINCT DAYS, not rows -- summing dollar/count fields across those rows is still correct
// (separate drawers genuinely sum), only the "how many days" proxy needed fixing.
const dateKey = d => d instanceof Date ? d.toISOString().slice(0, 10) : String(d);

// dispatch #62 -- the accumulate/finalize halves of the per-group pipeline, extracted so
// registerTypeBreakdown() below can reuse the EXACT same math for a per-register-type slice
// instead of hand-rolling a second reducer that could drift from this one.
function newAccumulator(r) {
  // empName is the plaintext employee name (audit_rows.emp) -- identical across every row in
  // this group already, since r.emp is literally part of the grouping key (`r.loc+'::'+r.emp`)
  // analyzeRegisterAudit() builds below. Set once here rather than re-checked in accumulateRow
  // the way empToken is, since (unlike the token, which can be null pre-backfill) it can't vary.
  return {empToken:null,empName:r.emp||null,loc:r.loc,name:STORE_NAMES[r.loc]||('Store '+r.loc),
    _seenDays:new Set(),_cashOSSeenDays:new Set(),days:0,
    totalSales:0,totalGC:0,avgCheck:0,drawerOpens:0,cashOSTotal:0,cashOSDays:0,
    tRedACnt:0,tRedBCnt:0,tRedADollar:0,tRedBDollar:0,
    manualRef:0,posOver:0,posOverAmt:0,
    refundCnt:0,refundCash:0,refundCashless:0,
    promoAmt:0,flags:[]};
}

function accumulateRow(e, r) {
  if(!e.empToken && r.empToken) e.empToken = r.empToken; // first non-null wins across this group's rows
  // `days` counts DISTINCT CALENDAR DAYS (a Set, not a per-row increment) -- dispatch #59: an
  // employee working Cashier AND Manager on the same date must still count as ONE day worked,
  // not two. Pre-#59 this was always one row per day, so the Set and the old e.days++ agree
  // exactly on cashier-only data -- behaviourally identical, not just "close."
  e._seenDays.add(dateKey(r.date));
  e.totalSales=Math.round((e.totalSales+r.drawerSales)*100)/100;e.totalGC+=r.drawerGC;
  e.drawerOpens+=r.drawerOpens;e.cashOSTotal=Math.round((e.cashOSTotal+(r.cashOSDollar||0))*100)/100;
  if(r.cashOSDollar!==0)e._cashOSSeenDays.add(dateKey(r.date));
  e.tRedACnt+=r.tRedACnt;e.tRedBCnt+=r.tRedBCnt;
  e.tRedADollar=Math.round((e.tRedADollar+(r.tRedADollar||0))*100)/100;
  e.tRedBDollar=Math.round((e.tRedBDollar+(r.tRedBDollar||0))*100)/100;
  e.manualRef=Math.round((e.manualRef+(r.manualRefAmt||0))*100)/100;
  e.posOver+=r.posOverCnt;e.posOverAmt=Math.round((e.posOverAmt+(r.posOverAmt||0))*100)/100;
  // refundCnt is a COUNT. It previously added r.refundCashless, which is a DOLLAR amount —
  // its source column is literally 'Refund Cashless $' (parsers/index.js:981) and it renders
  // as '$'+toFixed(2) below. That made "Refunds (total)" show cents, and pushed employees past
  // the >3 / >5 amber thresholds on dollars rather than on refund count. There is no cashless
  // refund COUNT in the source, so the count is cash refunds only; the cashless DOLLARS are
  // carried separately in e.refundCashless and totalled as their own KPI.
  e.refundCnt+=(r.refundCnt||0);
  e.refundCash=Math.round((e.refundCash+(r.refundCash||0))*100)/100;e.refundCashless=Math.round((e.refundCashless+(r.refundCashless||0))*100)/100;
  e.promoAmt=Math.round((e.promoAmt+(r.promoAmt||0))*100)/100;
  return e;
}

function finalizeGroup(e) {
  // Finalize days/cashOSDays from the Sets built above -- DISTINCT calendar days, not rows.
  e.days=e._seenDays.size; e.cashOSDays=e._cashOSSeenDays.size;
  delete e._seenDays; delete e._cashOSSeenDays;
  e.avgCheck       = e.totalGC>0 ? Math.round(e.totalSales/e.totalGC*100)/100 : 0;
  e.avgDrawerOpens = e.days>0 ? Math.round(e.drawerOpens/e.days*10)/10 : 0;
  e.avgCashOS      = e.cashOSDays>0 ? Math.round(e.cashOSTotal/e.cashOSDays*100)/100 : 0;
  e.avgTRedA       = e.days>0 ? Math.round(e.tRedACnt/e.days*10)/10 : 0;
  e.avgTRedB       = e.days>0 ? Math.round(e.tRedBCnt/e.days*10)/10 : 0;
  e.avgTRedADollar = e.days>0 ? Math.round(e.tRedADollar/e.days*100)/100 : 0;
  e.avgPosOver     = e.days>0 ? Math.round(e.posOver/e.days*10)/10 : 0;
  e.avgRefundCnt   = e.days>0 ? Math.round(e.refundCnt/e.days*10)/10 : 0;
  let risk=0;
  if(e.avgDrawerOpens>8){risk+=30;e.flags.push('HIGH drawer opens ('+e.avgDrawerOpens.toFixed(1)+'/day)');}
  else if(e.avgDrawerOpens>5){risk+=15;e.flags.push('Elevated drawer opens');}
  if(e.cashOSTotal<-5){risk+=25;e.flags.push('Consistently short $'+Math.abs(e.cashOSTotal).toFixed(2));}
  if(e.avgTRedA>2){risk+=20;e.flags.push('High T-Red After ('+e.avgTRedA.toFixed(1)+'/day)');}
  if(e.avgTRedB>3){risk+=15;e.flags.push('Elevated T-Red Before ('+e.avgTRedB.toFixed(1)+'/day)');}
  if(e.manualRef>50){risk+=20;e.flags.push('High manual refunds ($'+e.manualRef.toFixed(0)+')');}
  if(e.posOver>10){risk+=10;e.flags.push('High POS overrings ('+e.posOver+')');}
  e.riskScore=Math.min(100,risk);
  e.riskLevel=risk>=60?'critical':risk>=30?'high':risk>=15?'watch':'ok';
  e.cashOS   = e.days>0 ? Math.round((e.cashOSTotal/e.days)*100)/100 : 0;
  e.voids    = e.tRedACnt;
  e.discPct  = e.promoAmt>0&&e.totalSales>0 ? Math.round(e.promoAmt/e.totalSales*10000)/10000 : 0;
  e.txCount  = e.days;
  // The token is the record's identifier now — falls back to 'Unknown' only for rows that
  // predate the identity-vault backfill (dispatch #37); once that runs, this should not fire.
  e.id       = e.empToken||'Unknown';
  return e;
}

function analyzeRegisterAudit(auditRows) {
  const byEmp={};
  for(const r of auditRows){
    const key=r.loc+'::'+r.emp;
    if(!byEmp[key]) byEmp[key]=newAccumulator(r);
    const e=byEmp[key];
    accumulateRow(e, r);
    // dispatch #62 -- which register types this employee's rows span, tracked ALONGSIDE the
    // existing sums (never changes them: totals still correctly sum across types, per #59's
    // audited decision). Finalized into e.registerTypes below so callers can tell a genuinely
    // cashier-only employee from one whose displayed numbers blend more than one authority
    // context -- the gap dispatch #62 exists to close.
    (e._seenTypes ||= new Set()).add(r.registerType || 'cashier');
  }
  const results=Object.values(byEmp).map(e=>{
    e.registerTypes = [...e._seenTypes].sort();
    delete e._seenTypes;
    return finalizeGroup(e);
  });
  const emps = results.sort((a,b)=>b.riskScore-a.riskScore);
  const summary = {
    totalSales:    results.reduce((a,e)=>a+e.totalSales,0),
    totalVoids:    results.reduce((a,e)=>a+e.tRedACnt,0),
    totalManRef:   results.reduce((a,e)=>a+e.manualRef,0),
    totalPosOver:  results.reduce((a,e)=>a+e.posOver,0),
    avgCashOS:     results.length ? results.reduce((a,e)=>a+e.cashOSTotal,0)/results.length : 0,
    highRisk:      results.filter(e=>e.riskScore>=70).length,
    watchCount:    results.filter(e=>e.riskScore>=40&&e.riskScore<70).length,
    employeeCount: results.length,
  };
  return {employees: emps, summary};
}

// dispatch #62 Part A -- a per-register-type breakdown for employees whose rows span MORE THAN
// ONE register_type, so a blended employee's numbers on the Register Audit panel can be split
// back apart instead of only shown as a combined total. Deliberately does NOT touch
// analyzeRegisterAudit's totals (audited under #59, correct for the "everything sums" case) --
// this is an added view over the same rows, keyed loc::empToken (the stable join key, unchanged
// by dispatch #200 -- see this file's own header comment for why the token stays the KEY even
// though each value now also carries empName).
//
// Pre-backfill rows with no token collapse to the literal id 'Unknown' in analyzeRegisterAudit,
// which can silently MERGE two different real employees at the same store if used as a lookup
// key -- so those groups are excluded here rather than risk mislabeling one real person's
// breakdown as another's. That gap is dispatch #37's, not this one's; it should not fire once
// the identity backfill has fully run.
function registerTypeBreakdown(auditRows) {
  const rowsByEmp = {};
  for (const r of auditRows) {
    const key = r.loc+'::'+r.emp;
    (rowsByEmp[key] ||= []).push(r);
  }
  const out = {};
  for (const rows of Object.values(rowsByEmp)) {
    const types = [...new Set(rows.map(r => r.registerType || 'cashier'))];
    if (types.length < 2) continue;
    const token = rows.find(r => r.empToken)?.empToken;
    if (!token) continue; // no safe key to expose without risking a cross-employee merge
    const byType = {};
    for (const type of types) {
      const rowsForType = rows.filter(r => (r.registerType || 'cashier') === type);
      byType[type] = finalizeGroup(rowsForType.reduce(accumulateRow, newAccumulator(rowsForType[0])));
    }
    out[rows[0].loc+'::'+token] = { registerTypes: types.sort(), byType };
  }
  return out;
}

export { analyzeRegisterAudit, registerTypeBreakdown };
