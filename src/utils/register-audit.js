// @ts-nocheck
import { STORE_NAMES, DEFAULT_TARGETS } from '../constants.js';

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
  // A day is "seen" for cash O/S purposes when a REAL reading exists, whether that reading is
  // a genuine $0.00 balance or a nonzero variance -- `!=null`, not `!==0`. This used to read
  // `!==0`, which was backwards once an auto-pulled row can legitimately carry cashOSDollar:null
  // (the new /data_layer/v1/ Register Audit endpoint doesn't expose this field at all, GH #1314's
  // endpoint migration): `null !== 0` is true, so a NO-DATA day was being counted as "seen" while
  // a real, perfectly-balanced $0.00 day was being excluded -- exactly backwards. See
  // `e.cashOS`/`e.cashOSPctSelf` below, which depend on `cashOSDays` reading correctly.
  if(r.cashOSDollar!=null)e._cashOSSeenDays.add(dateKey(r.date));
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
  // Notes 61 item #11 (owner, 2026-11-14): "the big ones are cash +/-, T-Reds before and after,
  // Refunds and Overrings" -- surfaced as real %-of-sales columns, not buried as raw $/counts.
  // Computed over WHATEVER PERIOD this group's rows span (same totals already summed above, same
  // totalSales denominator analyzeRegisterAudit's callers already display) -- null (not 0) when
  // totalSales<=0, so "no sales to divide by" renders distinctly from "genuinely $0 variance."
  const pctOf = dollar => e.totalSales>0 ? Math.round((dollar/e.totalSales)*10000)/10000 : null;
  // cashOSDays>0 guard (not just totalSales>0): once an auto-pulled row can carry
  // cashOSDollar:null (GH #1314's endpoint migration -- this field is genuinely unavailable
  // from the new Register Audit endpoint), cashOSTotal summing nothing but nulls is
  // indistinguishable from summing a real $0 unless cashOSDays (now correctly counting only
  // REAL readings, see accumulateRow above) is checked too -- without this, "no data" would
  // render as "0.00%, perfectly balanced," a false-clean claim for the one metric named first
  // in the owner's own "cash +/-, T-Reds before and after, Refunds and Overrings" list.
  e.cashOSPctSelf  = e.cashOSDays>0 ? pctOf(e.cashOSTotal) : null;
  e.tRedBPctSelf   = pctOf(e.tRedBDollar);
  e.tRedAPctSelf   = pctOf(e.tRedADollar);
  e.posOverPctSelf = pctOf(e.posOverAmt);
  e.refundPctSelf  = pctOf(e.refundCash + e.refundCashless);
  // Legacy, magic-number, PERIOD-SCOPED risk score -- kept as-is (not removed: still returned,
  // still what registerTypeBreakdown's per-type slices use) for backward compatibility with
  // whatever rows this specific call was handed, since analyzeRegisterAudit has no visibility
  // into the employee's FULL history from inside one call. Notes 61 items #10/#11 (owner,
  // 2026-11-14) replace this as the panel's PRIMARY signal with computeTargetAwareRegisterFlags()
  // below, which is target-relative and recency-weighted rather than a flat magic number, and is
  // fed the employee's full row history separately by the caller. See that function's own header
  // for the design. This block stays as a reasonable fallback for any caller that never wires
  // the new analysis in (e.g. a future direct consumer of analyzeRegisterAudit() alone).
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
  // `e.cashOSDays>0 ? e.avgCashOS : null` -- not `e.days>0 ? cashOSTotal/e.days : 0`. The old
  // denominator (`e.days`, every day WORKED) silently diluted cashOSTotal by every day with no
  // real cash O/S reading, same false-clean failure mode as cashOSPctSelf above; `avgCashOS`
  // (just above) already divides by the correct `cashOSDays` denominator, so this just reuses
  // it rather than recomputing with the wrong one. `null` (not `0`) when no real reading exists
  // at all, so a display layer can show "no data" instead of a fabricated "+0.00."
  e.cashOS   = e.cashOSDays>0 ? e.avgCashOS : null;
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

// ── Target-aware flagging (Notes 61 items #10/#11, owner-approved 2026-11-14) ───────────────────
// Owner's exact framing: "as far as we have data for reference and trends, but realistically the
// recent items are what is acted upon. Flags triggered by variation from target or being highly
// repetitive or egregious... Goal is to identify true opportunities that need to be acted upon."
// And for which metrics to surface as %'s: "the big ones are cash +/-, T-Reds before and after,
// Refunds and Overrings."
//
// This treats all 5 of those named metrics uniformly as a $-over-sales RATIO compared against the
// SAME store's own real DEFAULT_TARGETS %-field (tCashOSPct/tRedBPct/tRedAPct/tPosOverPct/
// tRefundPct, constants.js) -- the identical number used for the self-% columns above, so "here's
// your %" and "here's why it's flagged" are always the same figure, never two different bases.
//
// Judgment calls made here (owner explicitly delegated these -- "maybe research how to best
// handle this" / "open to suggestion"), each with its reasoning:
//   - RECENT_WINDOW_DAYS = 42 (trailing 6 weeks): NOT a fresh number -- reuses the exact window
//     store-cockpit.js's own Cash Controls Cockpit already established for Cash O/S specifically
//     (DAYS_BACK_HEAT, "Cash Over/Short % — trailing 6 weeks"), so this flagging window matches
//     the cadence the owner already signed off on elsewhere rather than inventing a new one.
//   - EGREGIOUS_MULTIPLE = 3: a single day's deviation from target must be at least 3x the
//     target's own magnitude to count as a one-off blowout worth immediate attention -- large
//     enough to rule out the ordinary day-to-day noise a target already has some tolerance for,
//     small enough to still catch a real one-off before it has a chance to repeat.
//   - FLOOR_PCT = 0.005 (0.5% of that day's sales): an absolute minimum deviation before ANY day
//     counts as "over" at all, for either egregious or repetitive purposes. Several store targets
//     here are near-zero (e.g. a store's tPosOverPct can be 0.0003) -- without a floor, a trivial
//     one-cent overring would multiply out to "egregious" against a near-zero target. The floor
//     is expressed as a fixed %-of-sales rather than a dollar amount so it scales with store size.
//   - REPETITIVE_MIN_DAYS = 3 and REPETITIVE_SHARE = 0.5: "repetitive" requires BOTH at least 3
//     notably-over days in the recent window AND at least half of the employee's sales-bearing
//     days in that window being notably over -- the count guards against "1 bad day out of 2
//     worked" reading as a 50% pattern; the share guards against a high RAW count that's actually
//     a small fraction of a high-volume employee's many shifts.
//   - Score weighting: egregious (+25/metric) outweighs repetitive (+15/metric) -- a single
//     blowout needs same-week attention regardless of history; a pattern still needs coaching but
//     is comparatively less urgent. Same 0-100 scale / critical-60/high-30/watch-15 bucket
//     convention the legacy score above already used, so riskLevel reads consistently either way.
//
// Cash O/S is the one SIGNED metric (being too far over OR too far under target both matter --
// extra cash can be as real a problem as short cash); the other 4 only flag for EXCEEDING target
// (running under target on refunds/overrings/voids is never a problem).
const RECENT_WINDOW_DAYS   = 42;
const EGREGIOUS_MULTIPLE   = 3;
const FLOOR_PCT            = 0.005;
const REPETITIVE_MIN_DAYS  = 3;
const REPETITIVE_SHARE     = 0.5;

const TARGET_RATIO_METRICS = [
  { key: 'cashOS',  label: 'Cash O/S',     signed: true,  day: d => d.cashOS,   targetField: 'tCashOSPct' },
  { key: 'tRedB',   label: 'T-Red Before', signed: false, day: d => d.tRedB,    targetField: 'tRedBPct' },
  { key: 'tRedA',   label: 'T-Red After',  signed: false, day: d => d.tRedA,    targetField: 'tRedAPct' },
  { key: 'posOver', label: 'Overring',     signed: false, day: d => d.posOver, targetField: 'tPosOverPct' },
  { key: 'refund',  label: 'Refund',       signed: false, day: d => d.refund,  targetField: 'tRefundPct' },
];

// Collapses an employee's raw rows into one total PER CALENDAR DAY (same distinct-day rationale
// as `days`/`cashOSDays` above -- a blended employee can have >1 row on one date, and a single
// day's deviation-from-target has to be judged on that day's TRUE combined total, not one drawer
// in isolation).
function dailyRowTotals(rows) {
  const byDate = {};
  for (const r of rows) {
    const dk = dateKey(r.date);
    // `cashOS` starts `null`, not `0` -- a day with no real cash-O/S reading on any of its rows
    // (every row, once the auto-pull's GH #1314 endpoint migration lands: that endpoint doesn't
    // expose this field at all) must stay distinguishable from a day that genuinely balanced at
    // $0. Summing `cashOSDollar || 0` unconditionally would silently turn "no data" into "a
    // perfect day," diluting (never inflating) the target-aware flag below into false-clean for
    // the one metric the owner named first. The other 4 metrics stay plain-summed `0` defaults
    // since the new endpoint DOES carry real values for all of them, confirmed live.
    const d = (byDate[dk] ||= { dk, sales: 0, cashOS: null, tRedB: 0, tRedA: 0, posOver: 0, refund: 0 });
    d.sales   += r.drawerSales || 0;
    if (r.cashOSDollar != null) d.cashOS = (d.cashOS ?? 0) + r.cashOSDollar;
    d.tRedB   += r.tRedBDollar || 0;
    d.tRedA   += r.tRedADollar || 0;
    d.posOver += r.posOverAmt || 0;
    d.refund  += (r.refundCash || 0) + (r.refundCashless || 0);
  }
  return Object.values(byDate).sort((a, b) => a.dk.localeCompare(b.dk));
}

function subtractDaysStr(dk, n) {
  const d = new Date(dk + 'T12:00:00');
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// One employee's full row history (ALL dates on file, not just whatever window a caller may
// have filtered to for display elsewhere) -> {riskScore, riskLevel, flags[], metrics{}, fullHistory}.
// `maxDateStr` is the most recent date across the WHOLE dataset (not just this one employee's own
// rows), so "recent" means the same calendar window for every employee being compared, not a
// window that silently slides earlier for someone who hasn't worked in a while.
function targetAwareFlagsForEmployee(rows, maxDateStr) {
  const loc = rows[0]?.loc;
  const target = DEFAULT_TARGETS[loc] || {};
  const days = dailyRowTotals(rows);
  const cutoff = subtractDaysStr(maxDateStr, RECENT_WINDOW_DAYS);
  const recentDays = days.filter(d => d.dk >= cutoff && d.sales > 0);

  const metrics = {};
  const flags = [];
  let risk = 0;

  for (const m of TARGET_RATIO_METRICS) {
    const targetPct = target[m.targetField];
    if (targetPct == null) { metrics[m.key] = null; continue; }
    // Per-metric eligible days, not the shared `recentDays` -- a metric whose field is `null`
    // on a given day (currently only cashOS, since GH #1314's endpoint migration found Cash
    // O/S genuinely unavailable from the new Register Audit API) must not have that day silently
    // read as "0, on target." Using the shared `recentDays.length` as every metric's denominator
    // would dilute cashOS's share/overDays toward "clean" with every no-data day, a false-negative
    // for exactly the metric the owner named first ("cash +/-, T-Reds before and after, Refunds
    // and Overrings"). The other 4 metrics are unaffected -- confirmed live, the new endpoint
    // carries real values for all of them every day.
    const eligibleDays = recentDays.filter(d => m.day(d) != null);
    let overDays = 0, egregiousDays = 0, worst = null;
    for (const d of eligibleDays) {
      const dayPct = m.day(d) / d.sales;
      const deviation = m.signed ? Math.abs(dayPct - targetPct) : Math.max(0, dayPct - targetPct);
      if (deviation < FLOOR_PCT) continue;
      overDays++;
      if (!worst || deviation > worst.deviation) worst = { dk: d.dk, dayPct, deviation };
      if (deviation >= Math.max(EGREGIOUS_MULTIPLE * Math.abs(targetPct), EGREGIOUS_MULTIPLE * FLOOR_PCT)) egregiousDays++;
    }
    const totalRecentDays = eligibleDays.length;
    const share = totalRecentDays > 0 ? overDays / totalRecentDays : 0;
    const isEgregious  = egregiousDays > 0;
    const isRepetitive = overDays >= REPETITIVE_MIN_DAYS && share >= REPETITIVE_SHARE;
    // `unavailable: true` when this metric had NO real-data days in the window at all (e.g.
    // cashOS post-#1314) -- distinct from `isEgregious:false, isRepetitive:false`, which would
    // otherwise read identically to "genuinely clean" even though nothing was actually checked.
    const unavailable = recentDays.length > 0 && totalRecentDays === 0;
    metrics[m.key] = { targetPct, overDays, egregiousDays, totalRecentDays, share: Math.round(share * 1000) / 1000, isEgregious, isRepetitive, unavailable, worst };
    if (isEgregious) { risk += 25; flags.push({ metric: m.key, label: m.label, kind: 'egregious',
      detail: worst ? ('worst day ' + worst.dk + ': ' + (worst.dayPct * 100).toFixed(2) + '% vs target ' + (targetPct * 100).toFixed(2) + '%') : '' }); }
    if (isRepetitive) { risk += 15; flags.push({ metric: m.key, label: m.label, kind: 'repetitive',
      detail: overDays + '/' + totalRecentDays + ' recent days over target' }); }
  }

  // Full-history reference stats (owner: "as far as we have data for reference and trends") --
  // the same ratio, same target, over EVERY day on file for this employee, not just the recent
  // window the flags above are driven by. Context, not an action trigger.
  const fullHistoryPct = {};
  for (const m of TARGET_RATIO_METRICS) {
    // Same null-exclusion as the recent-window loop above: sum sales and the metric's own value
    // ONLY over days this metric actually has a real reading for, so a field that's unavailable
    // on every day (cashOS, post-#1314) resolves to `null` ("no data") rather than `0/totalSales`
    // ("confirmed $0 variance across the employee's whole history").
    const daysWithData = days.filter(d => m.day(d) != null);
    const totalSales = daysWithData.reduce((a, d) => a + d.sales, 0);
    const totalVal = daysWithData.reduce((a, d) => a + m.day(d), 0);
    fullHistoryPct[m.key] = totalSales > 0 ? totalVal / totalSales : null;
  }

  return {
    riskScore: Math.min(100, risk),
    riskLevel: risk >= 60 ? 'critical' : risk >= 30 ? 'high' : risk >= 15 ? 'watch' : 'ok',
    flags, metrics,
    recentWindowDays: RECENT_WINDOW_DAYS,
    recentDaysWithSales: recentDays.length,
    fullHistory: { pct: fullHistoryPct, daysOnFile: days.length, spanStart: days[0]?.dk || null, spanEnd: days[days.length - 1]?.dk || null },
  };
}

// Public entry point -- takes an employee's FULL row history across every date on file for this
// store (e.g. `ds.auditRows` filtered only by loc, NOT by whatever date-range toolbar a panel
// happens to have selected), independent of analyzeRegisterAudit()'s own period-scoped totals.
// Keyed by the SAME `loc::emp` composite key analyzeRegisterAudit groups by internally (not the
// empToken -- that falls back to the colliding literal 'Unknown' for pre-backfill rows, see this
// file's header comment; `loc::emp` never collides between two different real employees).
function computeTargetAwareRegisterFlags(allRows) {
  if (!allRows || !allRows.length) return {};
  const maxDateStr = allRows.reduce((m, r) => { const dk = dateKey(r.date); return (!m || dk > m) ? dk : m; }, null);
  const rowsByEmpKey = {};
  for (const r of allRows) { (rowsByEmpKey[r.loc + '::' + r.emp] ||= []).push(r); }
  const out = {};
  for (const [key, rows] of Object.entries(rowsByEmpKey)) out[key] = targetAwareFlagsForEmployee(rows, maxDateStr);
  return out;
}

export { analyzeRegisterAudit, registerTypeBreakdown, computeTargetAwareRegisterFlags };
