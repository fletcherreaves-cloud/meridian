// @ts-nocheck
import { addD, dKey, dowOf } from '../utils/date.js';
import { isHoliday, getHolidayAdj } from '../utils/holidays.js';
import { DEFAULT_TARGETS, DEFAULT_MODEL_ASSIGNMENTS, DEF_SETTINGS, MODEL_ASSIGNMENT_KEY, STORE_NAMES } from '../constants.js';
import { forecastDay, getModelAssignment, saveModelOverride, compute6wk, calcOpsF, getDOWTrend,
  effectivePlusUp, fetchLY, getStoreOrg, getDOWSpecificTrend, getWxAdj } from '../engine/forecast.js';
import { TH } from '../utils/fmt.js';

// CALIBRATE STORE — Per-store grid search for optimal forecast params
// v4.195 rewrite: previously the grid search's evaluation formula was a
// simplified standalone reimplementation that omitted holiday adjustment,
// DOW-specific trend blending, event registry impact, and the plus-up
// factor — all of which the REAL forecastDay pipeline applies. This meant
// "lowest MAPE found by calibration" was never actually lowest MAPE against
// what the app produces in practice; a parameter combo could win the
// simplified search and then score WORSE once routed through the real
// pipeline (this is what surfaced the bug: Dialed-In scored worst of all
// models once the Forecast Accuracy Report started honestly backtesting it
// through forecastDay instead of reading a stale settings snapshot).
// Fix: extend the once-per-row precompute to also capture the missing
// parameter-independent pieces (they don't depend on lyW/opsMult/t2/t6, so
// precomputing them once is still cheap — same strategy as before, just
// more complete), then use one shared evalForecast() for both the grid
// search AND the post-search period-MAPE display (previously a SECOND,
// separately-hand-written formula with its own bug: lyW was applied as
// ly*lyW + ly*(1-lyW), using `ly` on both sides instead of `ly` and
// `distDOWAvg` — making lyW completely inert in the displayed 6W/4W/2W/1W
// numbers. Sharing one formula closes that bug for free.)
// Grid: 30,976 combos (was 540) — empirically benchmarked at 540, ~22K,
// and 446K combos on a representative store; best MAPE converged to the
// SAME value (~7.3-7.9%) at every grid size tested. That's evidence the
// formula fix above drives the accuracy gain, not grid density, so the
// final size favors speed: ~13x denser than the original 540 at near-zero
// added cost (~6s for the full 27-store district, vs ~93s measured at the
// aggressive 446K tier that was tested and rejected). Row thresholds raised
// 45→60 / 40→50 anyway as cheap insurance (no proof this was a real risk on
// synthetic testing, but negligible cost either way).
// detectCleanDataStart (v4.195) — generic, automatic detection of where a
// store's "bad early data" period ends, for stores flagged recentOnly:true
// in DEFAULT_MODEL_ASSIGNMENTS (currently Elgin, Mossy Head, Tishomingo,
// Ponce de Leon). Built because a fixed-day buffer approach was tried first
// and found to be wrong: it conflated "days since history began" with "days
// since bad data ended," producing an incorrect boundary that still left
// contaminated LY-lookback comparisons inside the eval window (confirmed via
// direct testing — see session notes). This generic version works for any
// current or future recentOnly-flagged store with no per-store hardcoded
// date, satisfying the original ask that future anomalous/new locations get
// the same treatment automatically.
//
// Combines two complementary signals, since neither alone is sufficient:
//   1. Within-week coefficient of variation (CV) — catches CHAOTIC bad data
//      (random/wild day-to-day swings unrelated to real DOW patterns).
//   2. Level-shift vs. the presumed-clean recent half's mean — catches
//      SYSTEMATIC bias (smoothly wrong but consistently so, e.g. a different
//      POS system under-reporting by a fixed percentage — confirmed via
//      testing that signal #1 alone completely misses this failure mode).
// Both were individually validated against realistic seasonal+holiday
// volatility (30% sinusoidal swing + periodic spike weeks) to confirm
// neither false-positives on normal retail patterns and incorrectly
// declares healthy data "bad." Returns null — meaning NO restriction is
// applied — whenever detection isn't confident, by design: a missed
// detection just means a recentOnly-flagged store gets the same treatment
// as before (no worse than today), while a false positive could needlessly
// discard genuinely good calibration data. Caller should always treat null
// as "do nothing," never as an error.
function detectCleanDataStart(rows, opts={}){
  const minStableWeeks = opts.minStableWeeks ?? 8; // ~2 months sustained stability required
  const cvThresholdMult = opts.cvThresholdMult ?? 2.5;
  const levelShiftThreshold = opts.levelShiftThreshold ?? 0.35; // 35% off reference mean
  if(!rows||rows.length<minStableWeeks*7*2) return null; // not enough data to assess confidently

  const buckets=[];
  for(let i=0;i+7<=rows.length;i+=7){
    const chunk=rows.slice(i,i+7).map(r=>r.sales);
    const mean=chunk.reduce((a,b)=>a+b,0)/chunk.length;
    const variance=chunk.reduce((a,b)=>a+(b-mean)**2,0)/chunk.length;
    const cv=mean>0?Math.sqrt(variance)/mean:Infinity;
    buckets.push({startIdx:i,startDate:rows[i].date,cv,mean});
  }
  const allCVs=buckets.map(b=>b.cv).filter(v=>isFinite(v)).sort((a,b)=>a-b);
  if(!allCVs.length) return null;
  const medianCV=allCVs[Math.floor(allCVs.length/2)];
  const cvOk=medianCV*cvThresholdMult;

  // Reference mean drawn from the LATER half of history — matches the
  // documented pattern for all currently-flagged stores (bad early, clean
  // recent), not a generic "anomaly anywhere" detector.
  const refBuckets=buckets.slice(Math.floor(buckets.length/2));
  const refMean=refBuckets.length?refBuckets.reduce((a,b)=>a+b.mean,0)/refBuckets.length:0;

  for(let i=0;i<=buckets.length-minStableWeeks;i++){
    const window=buckets.slice(i,i+minStableWeeks);
    const cvPass=window.every(b=>b.cv<=cvOk);
    const levelPass=window.every(b=>refMean>0&&Math.abs(b.mean-refMean)/refMean<=levelShiftThreshold);
    if(cvPass&&levelPass) return {cleanStart:buckets[i].startDate,medianCV,cvOk,refMean,bucketIdx:i};
  }
  return null; // no confident stable point found — apply no restriction
}

// ════════════════════════════════════════════════════════════════════════════════
// MODEL ASSIGNMENT BACKTEST ENGINE  (v4.196)
// ════════════════════════════════════════════════════════════════════════════════
// Standalone, re-runnable function that determines the optimal forecast model
// (DOW, AE, EWMA, DI) for every store × horizon (weekly / monthly / yearly)
// using the live forecastDay pipeline with its 8th-arg forceModel override.
//
// Writing results to MODEL_ASSIGNMENT_KEY (same localStorage key as manual
// overrides). Existing entries with no .backtestDate are treated as user-made
// manual overrides and are left untouched — the user's deliberate choice is
// always preserved over an automated result.
//
// Windows:
//   weekly  = last 12 weeks of actuals   (minN ≥ 14 valid rows)
//   monthly = last 26 weeks of actuals   (minN ≥ 28 valid rows)
//   yearly  = full history, capped at    (minN ≥ 80 valid rows)
//             400 most-recent rows
//
// Exclusions (mirrors calibrateStore): holidays, userEvent-tagged days,
// last 14 days (too recent for clean LY-lookback), zero/negative sales,
// future dates. recentOnly stores get their _windowStart guard applied.
//
// MAPE is a trimmed mean (v4.204) — the worst ~5% of individual-day errors
// are excluded before averaging (min sample guards apply). A single
// contaminated day (data-entry error, unflagged closure, a bad-data period
// recentOnly didn't fully exclude) otherwise blows the average into
// nonsensical territory for every model equally, which isn't a model
// failure and shouldn't decide the winner. Trimming is surfaced in the
// evidence ref whenever it fires — never hidden.
//
// onProgress(info) fires at each yield point:
//   {storesDone, storesTotal, storeName, hz, model, status}
// ─────────────────────────────────────────────────────────────────────────────
async function runModelAssignmentBacktest(ds, settings, userEvents, onProgress) {
  if (!ds || !ds.laborRows || !ds.laborRows.length) return null;

  const LOCS = Object.keys(STORE_NAMES).sort((a,b)=>STORE_NAMES[a].localeCompare(STORE_NAMES[b]));
  const HORIZONS = [
    {id:'weekly',  lookbackWeeks:12,  minN:14,  label:'Weekly'},
    {id:'monthly', lookbackWeeks:26,  minN:28,  label:'Monthly'},
    {id:'yearly',  lookbackWeeks:null,minN:80,  label:'Yearly'},
  ];
  const MODELS_TO_TEST = ['dow','ae','ewma','di'];

  const now        = new Date();
  const cutoff14   = new Date(now.getTime() - 14*864e5);
  const runDateStr = now.toISOString().slice(0,10);

  const allResults = {}; // {loc → {hz → result}}
  const changes    = [];
  let storesDone   = 0;

  for (const loc of LOCS) {
    const storeName = STORE_NAMES[loc] || loc;
    allResults[loc] = {};

    // ── Deduplicated, date-sorted rows for this store ─────────────────────
    const seen = new Set();
    const storeRows = (ds.laborRows||[]).filter(r => {
      if (String(r.loc) !== String(loc) || r.sales <= 0) return false;
      const k = dKey(r.date); if (seen.has(k)) return false; seen.add(k); return true;
    });
    storeRows.sort((a,b) => a.date - b.date);

    const tgt            = (ds.targets && ds.targets[loc]) || DEFAULT_TARGETS[loc] || {};
    const uev            = (userEvents||{})[loc] || {};
    const settingsUev    = {...settings, _userEvents: userEvents||{}};
    const hasDI          = !!(settings.dialedInEnabled && settings.dialedIn && settings.dialedIn[loc]);

    // ── recentOnly window guard (mirrors calibrateStore exactly) ──────────
    const _mAssign    = DEFAULT_MODEL_ASSIGNMENTS[loc];
    const _recentOnly = !!(_mAssign && _mAssign.recentOnly);
    let   _windowStart = null;
    if (_recentOnly && storeRows.length) {
      const _det = detectCleanDataStart(storeRows);
      // Same 385+14-day margin as calibrateStore: keeps LY-lookbacks from any
      // eval row landing in the contaminated early-data zone.
      if (_det) _windowStart = addD(_det.cleanStart, 399);
    }

    for (const hz of HORIZONS) {
      // ── Build date window ───────────────────────────────────────────────
      const windowFloor = hz.lookbackWeeks
        ? new Date(now.getTime() - hz.lookbackWeeks * 7 * 864e5)
        : (storeRows.length ? storeRows[0].date : new Date(now.getTime() - 5*365*864e5));

      const eligibleRows = storeRows.filter(r => {
        if (r.date < windowFloor)            return false;
        if (r.date >= cutoff14)              return false; // too recent for clean LY
        if (isHoliday(r.date))              return false;
        if (uev[dKey(r.date)])              return false; // tagged anomaly / closure
        if (_windowStart && r.date < _windowStart) return false;
        return true;
      });
      // Yearly: cap at 400 most-recent (same as calibrateStore)
      const evalRows = hz.id === 'yearly' ? eligibleRows.slice(-400) : eligibleRows;

      if (evalRows.length < hz.minN) {
        if (onProgress) onProgress({
          storesDone, storesTotal:LOCS.length, storeName,
          hz:hz.id, model:'—', status:`skip (${evalRows.length}<${hz.minN} rows)`
        });
        continue;
      }

      // ── Test each model via forecastDay forceModel ─────────────────────
      const modelMapes = {};
      const modelNs    = {};
      const modelTrims = {};

      for (const model of MODELS_TO_TEST) {
        if (model === 'di' && !hasDI) continue; // DI not calibrated for this store

        if (onProgress) onProgress({
          storesDone, storesTotal:LOCS.length, storeName,
          hz:hz.id, model, status:'running'
        });

        // Collect individual APE values rather than a running sum — needed
        // to trim outliers before averaging. MAPE is well-known to be
        // sensitive to single catastrophic days (data-entry errors,
        // unflagged closures, a contaminated period that recentOnly's
        // detectCleanDataStart didn't fully exclude). A raw mean lets one
        // bad day blow the result into nonsensical territory (300%+) even
        // when every other day is well-forecasted — that's a data-quality
        // artifact, not a model failure, and shouldn't decide the winner.
        const apes = [];

        for (let i = 0; i < evalRows.length; i++) {
          const row = evalRows[i];
          try {
            // forecastDay's 8th arg (forceModel) bypasses getModelAssignment entirely,
            // running the named model through the IDENTICAL pipeline every production
            // forecast uses — no duplicated math that could silently drift over time.
            const fc = forecastDay(loc, row.date, ds, settingsUev, null, tgt, hz.id, model);
            if (fc && fc.forecast > 0 && row.sales > 0) {
              apes.push(Math.abs(row.sales - fc.forecast) / row.sales * 100);
            }
          } catch(e) { /* skip rows where model can't produce a number */ }

          // Yield every 80 rows so the UI stays responsive
          if (i % 80 === 79) await new Promise(r => setTimeout(r, 0));
        }

        const cnt = apes.length;
        // Trim only the worst (highest-error) days — asymmetric on purpose,
        // since legitimate forecast noise on the low end shouldn't be
        // discarded, only catastrophic single-day misses. Minimum sample
        // guards keep small windows (e.g. yearly for a new store) from
        // being trimmed into meaninglessness.
        let trimmedN = 0;
        if (cnt > 0) {
          apes.sort((a,b)=>a-b);
          trimmedN = cnt>=20 ? Math.ceil(cnt*0.05) : (cnt>=10 ? 1 : 0);
        }
        const keptApes = trimmedN>0 ? apes.slice(0, cnt-trimmedN) : apes;
        const sumAPE = keptApes.reduce((a,b)=>a+b,0);

        // Require at least 40 % of minN to have produced valid forecasts
        const minValid = Math.max(6, Math.ceil(hz.minN * 0.40));
        if (cnt >= minValid) {
          modelMapes[model] = +(sumAPE / keptApes.length).toFixed(2);
          modelNs[model]    = cnt;
          modelTrims[model] = trimmedN;
        }

        await new Promise(r => setTimeout(r, 0)); // yield between models
      }

      // ── Pick winner ─────────────────────────────────────────────────────
      const validModels = Object.keys(modelMapes);
      if (!validModels.length) continue;

      const winner     = validModels.reduce((best,m) => modelMapes[m] < modelMapes[best] ? m : best);
      const winnerMape = modelMapes[winner];
      const winnerN    = modelNs[winner];
      const winnerTrim = modelTrims[winner]||0;

      // Human-readable evidence string (top 3 models by MAPE)
      const ranked   = [...validModels].sort((a,b) => modelMapes[a] - modelMapes[b]);
      const refParts = ranked.slice(0,3).map(m => `${m.toUpperCase()} ${modelMapes[m]}%`);
      // Surface trimming transparently — never hide that outlier days were
      // excluded, since a high trim count is itself a data-quality signal
      // worth a human noticing, not something to quietly smooth over.
      const trimNote = winnerTrim>0 ? ` (${winnerTrim} outlier day${winnerTrim!==1?'s':''} excluded)` : '';
      const ref      = `🔄 BT ${runDateStr}: ${refParts.join(' · ')} (n=${winnerN})${trimNote}`;

      allResults[loc][hz.id] = {
        model: winner, mape: winnerMape, ref, n: winnerN, trimmed: winnerTrim,
        modelMapes, backtestDate: runDateStr,
      };
    }

    storesDone++;
    await new Promise(r => setTimeout(r, 0));
    if (onProgress) onProgress({
      storesDone, storesTotal:LOCS.length, storeName,
      hz:'done', model:'—', status:'done'
    });
  }

  // ── Persist results → MODEL_ASSIGNMENT_KEY ─────────────────────────────
  // Rules:
  //   • Entries with no .backtestDate = manual user override → skip (preserve)
  //   • Entries with    .backtestDate = prior backtest result → overwrite
  //   • Entries absent from localStorage = default assignment  → write result
  const existing = (()=>{try{return JSON.parse(localStorage.getItem(MODEL_ASSIGNMENT_KEY)||'{}')}catch{return{}}})();
  const merged   = {...existing};
  let changedCount = 0;

  for (const loc of LOCS) {
    if (!allResults[loc]) continue;
    for (const hz of HORIZONS) {
      const newResult = allResults[loc][hz.id];
      if (!newResult) continue;

      const existingEntry = merged[loc] && merged[loc][hz.id];

      // Preserve deliberate manual overrides (written by saveModelOverride, no backtestDate)
      if (existingEntry && !existingEntry.backtestDate) continue;

      // Track assignment changes for the summary card
      const priorModel =
        (existingEntry && existingEntry.model) ||
        (DEFAULT_MODEL_ASSIGNMENTS[loc] && DEFAULT_MODEL_ASSIGNMENTS[loc][hz.id] && DEFAULT_MODEL_ASSIGNMENTS[loc][hz.id].model) ||
        'dow';
      if (priorModel !== newResult.model) {
        changes.push({
          loc, storeName: STORE_NAMES[loc]||loc,
          hz: hz.id, from: priorModel, to: newResult.model,
          mape: newResult.mape,
        });
        changedCount++;
      }

      if (!merged[loc]) merged[loc] = {};
      merged[loc][hz.id] = newResult;
    }
  }

  try { localStorage.setItem(MODEL_ASSIGNMENT_KEY, JSON.stringify(merged)); _masgnCache=merged; } catch(e) {}

  return { results:allResults, changes, changedCount, runDate:runDateStr };
}

async function calibrateStore(loc, ds, settings, onProgress) {
  try{
  // Phase 1: Gather deduplicated rows
  const seen=new Set();
  const rows=ds.laborRows.filter(r=>{
    if(r.loc!==loc||r.sales<=0)return false;
    const k=dKey(r.date);if(seen.has(k))return false;seen.add(k);return true;
  });
  // CRITICAL FIX (v4.195): rows was never sorted by date before .slice(-400)
  // below — meaning "last 400 rows" actually meant "whatever 400 rows happen
  // to be last in ds.laborRows's array order," which depends on upload order
  // across potentially multiple files, NOT calendar recency. If a store's
  // data was ever uploaded out of chronological order (e.g. a recent month's
  // file loaded before an older historical file), the eval window could
  // silently include old/bad data instead of truly recent data. This is the
  // most likely real explanation for stores showing wildly inflated "Full"
  // MAPE (175%+, 350%+) while their recency-windowed 6W/4W/2W/1W MAPEs look
  // healthy — not that those stores have some special data-quality problem,
  // but that the "recent" window wasn't actually recent. Sorting here fixes
  // every downstream consumer of `rows` in this function, not just the one
  // slice below.
  rows.sort((a,b)=>a.date-b.date);
  if(rows.length<60)return{_why:'rows<60 ('+rows.length+' deduped rows for loc '+loc+' — store needs more history)'};
  const cutoff=new Date(Date.now()-14*864e5);
  // Hoist _uev to outer scope so all inner functions can access it
  const _uev=(settings._userEvents||{})[loc]||{};

  // recentOnly handling (v4.195) — for stores flagged recentOnly:true in
  // DEFAULT_MODEL_ASSIGNMENTS (currently Elgin, Mossy Head, Tishomingo, Ponce
  // de Leon — documented historical data anomalies or brand-new locations
  // with insufficient clean history), restrict the window calibration draws
  // from to start well after the earliest available row. This is NOT the
  // same as just taking the most recent 400 rows (the date-sort fix above):
  // LY lookups inside the eval loop reach back ~364 days from each eval row,
  // so even a "recent" row can pull a bad-period value as its LY comparison.
  // _windowStart pushes the window start far enough past the DETECTED clean-
  // data boundary that LY lookbacks from ANY row in the window land after
  // that boundary too.
  //
  // Uses detectCleanDataStart (defined above calibrateStore) rather than a
  // fixed day-count buffer from the start of history — an earlier version
  // used firstRowDate+399 days, but testing showed this conflates "days
  // since history began" with "days since bad data actually ended," and
  // for a 100-day bad period that left LY-lookback contamination still
  // inside the eval window (confirmed: fetchLY at the computed boundary
  // still returned a bad-period value). Auto-detection works for any
  // current or future recentOnly-flagged store with no per-store hardcoded
  // date; falls back to no restriction if it isn't confident, by design.
  const _modelAssign = DEFAULT_MODEL_ASSIGNMENTS[loc];
  const _isRecentOnly = !!(_modelAssign&&_modelAssign.recentOnly);
  let _windowStart = null;
  let _cleanDataDetection = null;
  if(_isRecentOnly && rows.length){
    _cleanDataDetection = detectCleanDataStart(rows);
    if(_cleanDataDetection){
      // Same 385(widest fetchLY fallback)+14(buffer) day margin as before,
      // now correctly anchored to the DETECTED clean-data start rather than
      // the start of all available history.
      _windowStart = addD(_cleanDataDetection.cleanStart, 385+14);
    }
    // If detection isn't confident (null), _windowStart stays null — no
    // restriction applied, same as a non-recentOnly store. This is the
    // intended fallback, not a bug: a missed detection is far less costly
    // than a false positive that discards good data.
  }

  // Cap at 400 most-recent rows for performance
  const allEvalRows=rows.filter(r=>{
    if(r.date>=cutoff||!r.sales||r.sales<=0) return false;
    if(isHoliday(r.date)) return false;
    if(_windowStart&&r.date<_windowStart) return false;
    const dk=dKey(r.date);
    if(_uev[dk]) return false;
    return true;
  });
  const evalRows=allEvalRows.slice(-400);
  if(evalRows.length<50)return{_why:'evalRows<50 ('+evalRows.length+' after cutoff/cap'+(_windowStart?'; recentOnly window starts '+dKey(_windowStart):(_isRecentOnly?'; recentOnly flagged but no confident clean-data boundary detected':''))+')'};

  const eDt=cutoff;
  const baseOpsF=calcOpsF(compute6wk(loc,ds,settings.weeksBack||6),
    ds.targets&&ds.targets[loc]?ds.targets[loc]:DEFAULT_TARGETS[loc]||{},
    settings.opsMults||DEF_SETTINGS.opsMults);
  const _plusFrac=effectivePlusUp(loc,settings)/100; // parameter-independent, same for every row

  // Precompute every parameter-INDEPENDENT piece once per row — extended
  // (v4.195) to cover what forecastDay's real pipeline applies but the old
  // formula omitted. Only lyW/opsMult/t2/t6 vary per grid combo; everything
  // here is identical across all 446K combos for a given row, so computing
  // it once and reusing it preserves the original "precompute once, evaluate
  // cheaply many times" performance strategy.
  const precomputed=evalRows.map(row=>{
    const lyRaw=fetchLY(ds.laborIdx,ds.laborRows,loc,row.date,settings._userEvents)||0;
    if(lyRaw<=0)return null;
    const _dow=row.date.getDay();
    const _calOrg=getStoreOrg(loc);
    const _distRows=(ds.laborRows||[]).filter(r=>r.loc!==loc&&r.sales>0&&dowOf(r.date)===_dow&&Math.abs(r.date-addD(row.date,-364))<30*864e5&&getStoreOrg(r.loc)===_calOrg);
    const distDOWAvg=_distRows.length?_distRows.reduce((a,r)=>a+r.sales,0)/_distRows.length:lyRaw;
    // DOW-specific trend (was entirely missing from the old formula)
    const dowSpecific=getDOWSpecificTrend(ds.laborIdx,loc,_dow,eDt,settings.weeksBack||6);
    // Holiday LY adjustment (was entirely missing)
    const holidayInfo=isHoliday(row.date);
    const _ly364=addD(row.date,-364);
    const _ly364IsHoliday=!!isHoliday(_ly364);
    const _ly364IsExcluded=_ly364IsHoliday||!!(settings._userEvents&&settings._userEvents[loc]&&settings._userEvents[loc][dKey(_ly364)]);
    const lyHolidayInfo=_ly364IsExcluded?null:isHoliday(_ly364);
    const holidayLyAdj=(()=>{
      if(holidayInfo&&lyHolidayInfo&&holidayInfo.label===lyHolidayInfo.label) return 1;
      if(holidayInfo&&!lyHolidayInfo) return getHolidayAdj(row.date,loc,ds&&ds.laborRows);
      if(!holidayInfo&&lyHolidayInfo) return 1/Math.max(0.3,getHolidayAdj(addD(row.date,-364),loc,ds&&ds.laborRows));
      return 1;
    })();
    // Event registry impact (was entirely missing)
    const _dk=dKey(row.date);
    const _evTag=settings._userEvents&&settings._userEvents[loc]&&settings._userEvents[loc][_dk];
    const evFactor=(()=>{
      if(!_evTag||!settings.useEventRegistry) return 0;
      const factors=settings._eventFactors&&settings._eventFactors[loc];
      if(!factors) return 0;
      const types=(_evTag.tags&&_evTag.tags.length)?_evTag.tags.map(tg=>tg.type):[_evTag.type||'other'];
      const impacts=types.map(tg=>factors[tg]??0).filter(v=>v!==0);
      return impacts.length?impacts.reduce((a,b)=>a+b,0)/impacts.length:0;
    })();
    return {
      actual:row.sales,lyRaw,distDOWAvg,dowSpecific,holidayLyAdj,evFactor,
      t2v:getDOWTrend(ds.laborIdx,loc,row.date,eDt,1,2),
      t4v:getDOWTrend(ds.laborIdx,loc,row.date,eDt,3,4),
      t6v:getDOWTrend(ds.laborIdx,loc,row.date,eDt,5,6),
      wAdj:1+(getWxAdj(ds.weatherIdx,loc,row.date,settings.weather,settings.empiricalWeather,ds)||0),
      opsF:baseOpsF,
    };
  }).filter(Boolean);
  if(precomputed.length<35)return{_why:'precomputed<35 ('+precomputed.length+'/'+evalRows.length+' rows had valid LY — check laborIdx or date parsing)'};

  // Shared evaluation formula (v4.195) — used by BOTH the grid search below
  // and _computePeriodMape further down, so there is exactly one place that
  // can drift from forecastDay's real math, not two. Mirrors forecastDay's
  // actual forecast computation: lyAdjH × opsFactor × (1+wAdj-1) ×
  // (1+trendFactor) × (1+evFactor) × (1+plusFrac), with wTrend blending
  // 65% global / 35% DOW-specific exactly as forecastDay does.
  const evalForecast=(p,lyW,opsMult,t2,t4,t6)=>{
    const globalTrend=p.t2v*t2+p.t4v*t4+p.t6v*t6;
    const wTrend=p.dowSpecific!==null?globalTrend*0.65+p.dowSpecific*0.35:globalTrend;
    const lyAdj=p.lyRaw*lyW+p.distDOWAvg*(1-lyW);
    const lyAdjH=lyAdj*p.holidayLyAdj;
    const opsF=1+((p.opsF-1)*opsMult);
    const trendFactor=Math.max(-0.15,Math.min(0.15,wTrend*0.30));
    // NOTE: p.wAdj is stored PRE-incremented (1+rawAdjustment, see precompute
    // above) so it's used here as a flat multiplier, not (1+p.wAdj). This is
    // mathematically identical to forecastDay's own (1+wAdj) where ITS local
    // wAdj is the raw, non-incremented value from getWxAdj — just a
    // confusing naming inconsistency inherited from the original code, not
    // a bug. Verified during this rewrite; flagging so it doesn't look like
    // a double-application error on a future read.
    return lyAdjH*opsF*p.wAdj*(1+trendFactor)*(1+p.evFactor)*(1+_plusFrac);
  };

  // Grid search: 30,976 raw combos (was 540) — Fletcher's call after seeing
  // real benchmark data: a synthetic test showed IDENTICAL best-MAPE
  // convergence (~7.3-7.9%) across grid sizes from 540 all the way to
  // 445,935 combos, on a single representative store. That's evidence the
  // FORMULA correction above (holiday/event/DOW-specific/plus-up, previously
  // entirely missing) is what actually drives the accuracy improvement —
  // not grid density. This tier still gives ~13x denser coverage than the
  // original 540 (closer step sizes on lyW/opsMult/t2/t6) at near-zero
  // added cost (~6s for the full 27-store district vs ~93s at the
  // aggressive 446K tier, which was tested and rejected as not worth the
  // wait given the flat convergence finding).
  const lyWs=Array.from({length:11},(_,i)=>+(0.50+i*0.05).toFixed(2));      // 0.50–1.00 step .05
  const opsMults=Array.from({length:11},(_,i)=>+(0+i*0.15).toFixed(2));     // 0–1.50 step .15
  const t2s=Array.from({length:16},(_,i)=>+(0+i*0.05).toFixed(3));         // 0–0.75 step .05
  const t6s=Array.from({length:16},(_,i)=>+(0+i*0.05).toFixed(3));         // 0–0.75 step .05
  let bestMape=Infinity,bestParams=null;
  let combo=0;
  const totalCombo=lyWs.length*opsMults.length*t2s.length*t6s.length;
  for(const lyW of lyWs){
    for(const opsMult of opsMults){
      for(const t2 of t2s){
        for(const t6 of t6s){
          if(t2+t6>=0.95){combo++;continue;}
          const t4=+(1-t2-t6).toFixed(3);
          let pSum=0,pCnt=0;
          for(const p of precomputed){
            const fc=evalForecast(p,lyW,opsMult,t2,t4,t6);
            if(fc>0&&p.actual>0){pSum+=Math.abs(p.actual-fc)/p.actual*100;pCnt++;}
          }
          const mape=pCnt?pSum/pCnt:Infinity;
          if(mape<bestMape){bestMape=mape;bestParams={lyW,opsMult,t2,t4,t6};}
          combo++;
          // Yield more often given the much larger combo count, so the UI
          // (progress bar) stays responsive across the ~80s run instead of
          // freezing the tab.
          if(combo%500===0){
            if(onProgress) onProgress(combo,totalCombo);
            await new Promise(r=>setTimeout(r,0));
          }
        }
      }
    }
  }
  if(!bestParams)return{_why:'grid found no best params (all MAPE=NaN, check forecastDay computation)'};

  // Compute period MAPEs (6W, 4W, 2W, 1W) — now uses the SAME evalForecast
  // shared with the grid search above, fixing the lyW-inert typo that
  // existed here previously (old code did ly*lyW + ly*(1-lyW), using `ly`
  // on both sides instead of `ly` and `distDOWAvg` — lyW had zero effect on
  // these displayed numbers regardless of what the grid search found).
  const _computePeriodMape=(weeks)=>{
    const cut=new Date(Date.now()-weeks*7*864e5);
    // Same recentOnly window restriction as the main eval window above —
    // for consistency, and to correctly handle brand-new stores where even
    // a 6-week-back cut could still overlap the LY-lookback-contamination
    // zone near the very start of available history.
    const periodRows=rows.filter(r=>r.date>=cut&&r.sales>0&&!_uev[dKey(r.date)]&&(!_windowStart||r.date>=_windowStart));
    if(!periodRows.length||!bestParams) return null;
    let s=0,c=0;
    for(const row of periodRows){
      const lyRaw=fetchLY(ds.laborIdx,ds.laborRows,loc,row.date,settings._userEvents)||0;
      if(lyRaw<=0) continue;
      const _dow=row.date.getDay();
      const _calOrg=getStoreOrg(loc);
      const _distRows=(ds.laborRows||[]).filter(r=>r.loc!==loc&&r.sales>0&&dowOf(r.date)===_dow&&Math.abs(r.date-addD(row.date,-364))<30*864e5&&getStoreOrg(r.loc)===_calOrg);
      const distDOWAvg=_distRows.length?_distRows.reduce((a,r)=>a+r.sales,0)/_distRows.length:lyRaw;
      const dowSpecific=getDOWSpecificTrend(ds.laborIdx,loc,_dow,cutoff,settings.weeksBack||6);
      const holidayInfo=isHoliday(row.date);
      const _ly364=addD(row.date,-364);
      const _ly364IsHoliday=!!isHoliday(_ly364);
      const _ly364IsExcluded=_ly364IsHoliday||!!(settings._userEvents&&settings._userEvents[loc]&&settings._userEvents[loc][dKey(_ly364)]);
      const lyHolidayInfo=_ly364IsExcluded?null:isHoliday(_ly364);
      const holidayLyAdj=(()=>{
        if(holidayInfo&&lyHolidayInfo&&holidayInfo.label===lyHolidayInfo.label) return 1;
        if(holidayInfo&&!lyHolidayInfo) return getHolidayAdj(row.date,loc,ds&&ds.laborRows);
        if(!holidayInfo&&lyHolidayInfo) return 1/Math.max(0.3,getHolidayAdj(addD(row.date,-364),loc,ds&&ds.laborRows));
        return 1;
      })();
      const _dk=dKey(row.date);
      const _evTag=settings._userEvents&&settings._userEvents[loc]&&settings._userEvents[loc][_dk];
      const evFactor=(()=>{
        if(!_evTag||!settings.useEventRegistry) return 0;
        const factors=settings._eventFactors&&settings._eventFactors[loc];
        if(!factors) return 0;
        const types=(_evTag.tags&&_evTag.tags.length)?_evTag.tags.map(tg=>tg.type):[_evTag.type||'other'];
        const impacts=types.map(tg=>factors[tg]??0).filter(v=>v!==0);
        return impacts.length?impacts.reduce((a,b)=>a+b,0)/impacts.length:0;
      })();
      const p={lyRaw,distDOWAvg,dowSpecific,holidayLyAdj,evFactor,
        t2v:getDOWTrend(ds.laborIdx,loc,row.date,cutoff,1,2),
        t4v:getDOWTrend(ds.laborIdx,loc,row.date,cutoff,3,4),
        t6v:getDOWTrend(ds.laborIdx,loc,row.date,cutoff,5,6),
        wAdj:1+(getWxAdj(ds.weatherIdx,loc,row.date,settings.weather,settings.empiricalWeather,ds)||0),
        opsF:baseOpsF};
      const fc=evalForecast(p,bestParams.lyW,bestParams.opsMult,bestParams.t2,bestParams.t4,bestParams.t6);
      if(fc>0&&row.sales>0){s+=Math.abs(row.sales-fc)/row.sales*100;c++;}
    }
    return c?+(s/c).toFixed(2):null;
  };

  const mape6w=_computePeriodMape(6);
  const mape4w=_computePeriodMape(4);
  const mape2w=_computePeriodMape(2);
  const mape1w=_computePeriodMape(1);
  const _settingsFp=JSON.stringify({lyOutlierThreshold:settings.lyOutlierThreshold,opsNorm:settings.opsNorm});

  return{...bestParams,mape:+bestMape.toFixed(2),mape6w,mape4w,mape2w,mape1w,
    samples:precomputed.length,runDate:new Date().toISOString().slice(0,10),
    settingsFp:_settingsFp,
    // recentOnly detection transparency (v4.195) — visible in results so
    // it's not an invisible internal decision. windowApplied:false for any
    // non-recentOnly store (the vast majority), or for a recentOnly store
    // where detection wasn't confident enough to restrict anything.
    recentOnlyFlag:_isRecentOnly,
    windowApplied:!!_windowStart,
    windowStart:_windowStart?dKey(_windowStart):null,
    cleanDataDetected:_cleanDataDetection?dKey(_cleanDataDetection.cleanStart):null};
  } catch(e) {
    const _em=e.message||String(e);
    console.warn('[McForecast] calibrateStore THROW for',loc,'—',_em);
    return{_why:'thrown: '+_em};
  }
}

export { detectCleanDataStart, runModelAssignmentBacktest, calibrateStore };
