// @ts-nocheck
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import * as XLSX from 'xlsx'
import { Chart } from 'chart.js/auto'
import '../meridian.css'

const ReactDOM = { createRoot }

import { addD, addDR, dKey, nDK, dowOf, sodOf, eodOf, setWeekStartDay, mwStart, nwStart, fmtDI, fmtRng, nDays, rngMode, dFmt, dFmtShort, dFmtDow, thisWeek } from '../utils/date.js';
import { isHoliday, getHolidayAdj, autoTagHolidays, buildHolidays, HOLIDAY_MAP } from '../utils/holidays.js';
import { DEFAULT_TARGETS, DEFAULT_MODEL_ASSIGNMENTS, MODEL_ASSIGNMENT_KEY, DEF_SETTINGS, AE_DI_PARAMS, MODEL_CODE_LABELS, STORE_COORDS, STORE_NAMES, sName, sNameC, DOW_BASE, STORE_KB, STORE_KB_EDIT_KEY, getKBEdits, saveKBEdits, getKB, EVENT_TYPES, EVENT_TYPE_GROUPS, INV_ORG_COORDS } from '../constants.js';
import { _masgnInvalidate, getModelAssignment, saveModelOverride, computeMAPEDrift, computeStoreSigma, getStoreOrg, getWeatherNote, isWeatherExtreme, calibrateWeather, forecastEWMA, forecastAdaptiveDI, forecastAdaptiveEnsemble, _wxCache, getForecastWeather, fetchRow, fetchWx, fetchLY, fetchLYDate, storeAgeDays, fetchRampSales, getDOWTrend, getDOWSpecificTrend, forecastDayparts, getWxAdj, modelHealthScore, compute6wk, calcOpsF, forecastDay, forecastRange, forecastRangeAsync, effectivePlusUp, forecastModels, modelAccuracy, getDIRecommendation, computeModelHealth, bLocIdx, locRows, avg6, gcCrossCheck, KnowledgeBasePanel, InfoIcon } from '../engine/forecast.js';
import { idbDateKey, idbPutRows, idbGetAllRows, idbGetMeta, idbSetMeta, idbClearAll, coverageFromLoadedRows, withTimeout, idbQuickSessionCheck, loadDsFromIDB, opfsSave } from '../db/index.js';
import { crossStoreCheck, lookupMissEvent, diagnoseMiss, computeForecastComposition, classifyMissCauses, runWhyEngineScan, runWhyEngineDistrict } from '../engine/why.js';
import { GMCoachingBrief } from '../engine/coaching.js';
import { LifelenzGapPanel, LifeLenzBridgePanel } from '../features/lifelenz.js';
import { CalendarManagerPanel, EventEntryModal, EventRegistryModal } from '../features/calendar.js';
import { detectCleanDataStart, runModelAssignmentBacktest, calibrateStore } from '../engine/backtest.js';
import { computeEventFactors } from '../utils/events.js';
import { analyzeRegisterAudit } from '../utils/register-audit.js';
import { parseInventoryData, InventoryIntelligence } from '../views/inventory.js';
import { computeSmartTargets, SmartTargetPanel } from '../features/smart-targets.js';
import { DARDaypartPanel, ProductMixPanel, LaborAnalyticsPanel, OperatorSummaryPanel, ModelAssignmentPanel, StoreKBEditor } from '../views/labor-tools.js';
import { loadLockedProjections, saveLockedProjections, getLockedAmount, lockProjectionWeek, ProjectionWorkflow, PreForecastBrief } from '../features/projections.js';
import { AnomalyPanel, ShiftAnalysisTab, ModelComparisonPanel, RevenueIntelligence, RegisterAuditTab, StoreDash, StoreRecordsTab, MultiStoreComparison, AIInsightsLog, DevDashboard } from '../views/store-analytics.js';
import { AIInsightsTab, MetricCorrelationExplorer, WhyEnginePanel, FOBAnalysisPanel, ForecastAccuracyPanel, AIBacktestScanner, DialedInPanel, DateRangeReport, ForecastAudit, LocationBrief, ProjectionVsActualsReport, DialedInComparisonReport, DistrictPriorityBrief, AttentionPanel, AtAGlance, DataManagerPanel, StoreOnePager } from '../views/analytics.js';
import { Settings } from '../views/management.js';
import { DatePicker, AppSidebar, AppTopbar } from '../app/shell.js';
import { LocationIntelligence } from '../features/location-intel.js';
import { TH, f$, fPct, fP, fN, grade, gLbl, gCol, gBg, gBdr } from '../utils/fmt.js';
import { MorningBriefPanel, exportBriefHTML, getReportRecipients, storeDistance, regionalRadius, STORE_STAFF, CONTACTS } from '../features/morning-brief.js';
import { loadRecurringRules, saveRecurringRules, expandRecurringRule, getRecurringInstancesNeedingConfirm, searchUpcomingEvents } from '../features/calendar.js';
import { ErrorBoundary, mfExportSession, mfRestoreSession, mfIDBLoad, mfIDBSave, mfIDBClear, _mfOpenDB, _mfSerDS, _mfDeserDS, _mfSessionMeta, SessionBanner } from '../features/session.js';
import { buildDS, mergeDS, buildStore, buildBrief, normalizeScores } from '../engine/pipeline.js';
import { detectType } from '../parsers/index.js';
import {
  fetchForecastWeather,
  ymKey, loadTargetsV2, saveTargetsV2, getMonthTargets, getTargetsForDate, setMonthTargets,
  getYearlyStorageKey, loadYearlyTargets, saveYearlyTargets, setYearlyTarget, getYearlyTarget, exportYearlyTargets,
  copyMonthTargets, toggleMonthLock, exportTargetsV2, getTargetMonths, migrateTargetsToV2,
  PEAK_SLICES, normSlice, analyzePeaks,
  mdToNodes,
  useChart, TT, AX, LEG, SalesChart, OpsRadar, TrendChart,
  wxIcon, ForecastRow, ForecastTable,
  Brief, OpsScorecard, CtrlScorecard, AITabInsight, PeaksTab, generatePlan, ActionPlanTab,
  StoreCard, DistrictGrid, OrgView, ExportDropdown, RankingView, PerformanceCalculator,
  UnifiedTargetsPanel, MonthlyTargetManager, EventCalendar,
  OpsBarChart, CompareRadarChart, CompareLineChart,
} from '../views/store-dash.js';

const { useState, useEffect, useRef, useMemo, useCallback } = React;
const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

// ── Meridian version + changelog ─────────────────────────────────────────────
const MERIDIAN_VERSION    = '4.216';
const MERIDIAN_BUILD_DATE = '2026-06-19';
const MERIDIAN_CHANGELOG  = [
  {version:'4.216', date:'2026-06-19', changes:[
    'Fixed the triple-redundant read found while reviewing the restore path: performFullIDBRestore() was reading the same large stores from IndexedDB up to 3 times — once in loadDsFromIDB(), again in idbGetCoverage() just for date ranges, a third time for the weather cache bridge',
    'Added coverageFromLoadedRows() — computes the identical coverage stats from data already in memory, zero additional IndexedDB reads. Weather cache now reuses the already-loaded weather array directly',
    'Net effect: Restore Session now reads your data once instead of up to three times',
  ]},
  {version:'4.215', date:'2026-06-19', changes:[
    'Stopped patching the restore mechanism and fixed the actual design flaw: session restore was automatic and blocking — if it hung for any reason, the app gave you no way to interact with anything, including closing a stuck modal',
    'Session restore is now opt-in. The app loads instantly and empty on every load. A lightweight, hard-timeout-bounded check (count() only, 3-second cap, cannot block the shell no matter what) detects a previous session and shows a dismissible banner — you click Restore Session when ready, instead of it happening automatically before you can do anything else',
    'Added a universal Escape-key handler that closes every modal in the app unconditionally — does not depend on diagnosing why something got stuck, just guarantees a way out',
    'This directly resolves the stuck Dialed-In Comparison modal — that flag (showDICompare) is included in the Escape handler',
    'All prior fixes this session (compute6wk indexing, getModelAssignment caching, AtAGlance/StoreDash/OrgView modal-gating, the IDB schema and race-condition fixes) remain in place — none of that work is lost, this addresses the structural risk sitting on top of it',
  ]},
  {version:'4.214', date:'2026-06-19', changes:[
    'Critical finding: fully quitting Chrome (not just closing tabs) and the freeze STILL happened in the regular profile — that ruled out every stale-tab/blocked-connection theory, since nothing could survive a full quit',
    'Re-examined every Incognito test with that ruled out: Incognito ALWAYS starts with empty IndexedDB, meaning every "fast in Incognito" result was also a "nothing to restore" result — the same confound from the very first extension test, missed a second time',
    'Found the real bug: openIDB() only cached the RESOLVED value, not the in-flight request. loadDsFromIDB() fires 8 idbGetAllRows() calls simultaneously via Promise.all — every one of them called openIDB() before any had resolved, so all 8 independently fired their own indexedDB.open() against the same database instead of sharing one connection',
    'This is a within-tab, within-session bug — explains why it persisted through a full Chrome quit, and why it only manifests with substantial existing data (Incognito\'s always-empty DB has nothing for 8 racing connections to meaningfully contend over)',
    'Fixed: cache the in-flight promise itself, not just the eventual value — every concurrent caller now awaits the same single open() instead of starting 8 redundant ones',
  ]},
  {version:'4.213', date:'2026-06-19', changes:[
    'Different symptom this time: freeze on INITIAL load with zero data loaded — ruled out the AtAGlance fix as the cause, since there was nothing to compute',
    'Found a real gap: openIDB() had no onblocked handler. If another open tab/window holds an older-version connection to MeridianDB, a version-change request just hangs forever — never firing onerror, onsuccess, or onupgradeneeded. No heavy CPU, nothing to catch in a Performance trace — just a promise that never settles',
    'Given how many file versions have been opened back-to-back across this session\'s testing, a stale older-version tab is a very plausible explanation',
    'Fixed: added onblocked to both IndexedDB connections (MeridianDB and the separate McForecastPro_Sessions backup) — now rejects cleanly into the existing try/catch instead of hanging silently',
    'Practical step alongside this fix: close any other open Meridian tabs/windows before reloading, since that\'s the actual trigger condition if this theory is right',
  ]},
  {version:'4.212', date:'2026-06-19', changes:[
    'Found the actual root cause via a Chrome Performance recording (console-level instrumentation had ruled out everything it could see — this needed a real profiler)',
    'AtAGlance — the main dashboard, a 1600-line component — was rendering and fully recomputing every time ANY of 53 separate modal flags opened, even though it was 100% visually hidden behind the full-screen overlay the entire time',
    'Confirmed directly in the profile: AtAGlance\'s own render function was the dominant cost in a 177-second interaction, not Priority Brief, not buildStore, not React itself',
    'Fixed: added a single anyModalOpen check (OR of every modal-visibility flag in App\'s own scope — 7 candidates were excluded after verifying they\'re declared in other components, which would have caused an immediate crash) and gated AtAGlance, StoreDash, and OrgView on it — none of them render while a modal covers them',
    'Tradeoff worth knowing: these views fully unmount while hidden rather than just visually hiding, so local UI state (like scroll position) resets when a modal closes. Worth it given the alternative was multi-minute freezes.',
  ]},
  {version:'4.211', date:'2026-06-19', changes:[
    'Incognito test confirmed the freeze was a Chrome extension — \'message\' handler violation dropped from 174,745ms to 242ms with extensions disabled. That variable is resolved.',
    'Found the real cause of the remaining IDB error: weatherRows was never in IDB_STORES at all — not a stale-version gap like darRows/pmixRows, a flat-out missing entry from day one',
    'Pinpointed via the exact failure location: Promise.all index 7 in loadDsFromIDB maps directly to idbGetAllRows(\'weatherRows\') — confirmed reproducible even in a guaranteed-fresh Incognito IndexedDB, which ruled out versioning as the cause for this specific store',
    'Fixed: weatherRows added to IDB_STORES. IDB_VERSION bumped 3→4 so a re-download to the same exact filename still gets the store created correctly',
    'Swept every idbGetAllRows/idbPutRows call site in the codebase — all 9 distinct store names now present in the schema, no other mismatches found',
  ]},
  {version:'4.210', date:'2026-06-19', changes:[
    'Found via real console data: the [PERF] instrumentation proved Priority Brief\'s own code is fast (rawStores 418ms, tiered/pulse/render-body all under 1ms) — the freeze was NOT in this code path',
    'Real culprit: IndexedDB schema mismatch. IDB_VERSION was never bumped when IDB_STORES grew (darRows/pmixRows/peaksRows added later) — onupgradeneeded only fires on a version increase, so existing browsers never got those object stores created',
    'Every read/write against a missing store threw "object store not found" — repeatedly, including 16x on a single auto-save, visible directly in console output',
    'Fixed: IDB_VERSION bumped 2→3. The upgrade handler is purely additive (only creates missing stores) so this is safe regardless of how outdated any browser\'s existing copy is',
    'Flagged but not fixed: "listener indicated an asynchronous response" errors in the console are a near-textbook Chrome extension signature, not page code — Meridian has no chrome.runtime API usage. Worth testing in Incognito to rule in/out extension involvement in the remaining freeze time',
  ]},
  {version:'4.209', date:'2026-06-19', changes:[
    'Diagnostic instrumentation (temporary) — Priority Brief still hard-freezing the browser despite two rounds of targeted fixes means something is being missed, not guessed around',
    'Console timing added at: rawStores (all 27 buildStore calls, broken down into compute6wk vs buildBrief time), and DistrictPriorityBrief\'s own mount/tiered/pulse computations',
    'Open the browser console before clicking Priority Brief — the [PERF] log lines will show exactly where the time goes on the next freeze, replacing speculation with real numbers from the actual session',
  ]},
  {version:'4.208', date:'2026-06-19', changes:[
    'Performance: found a second hot-path issue — getModelAssignment() re-parsed the full localStorage assignment blob on every single call, with no caching',
    'Called directly from forecastDay() — the single most-invoked function in the app. A Why Engine district scan alone makes 1,500+ forecastDay calls, each independently re-parsing the same JSON',
    'Also called once per store inside District Priority Brief\'s tiered computation — 27 full re-parses on every filter-pill click',
    'Added a module-level cache, invalidated explicitly on all 3 write paths (saveModelOverride, clearOvr, the backtest engine) — parse once, never silently stale',
    'Confirmed via real data: the LY fix (v4.205) is working correctly — District Priority Brief now shows properly differentiated 4W vs LY per store (e.g. Elgin +12.3%, Chickasha -6.9%) instead of uniform ~-93%',
  ]},
  {version:'4.207', date:'2026-06-19', changes:[
    'Fixed runtime crash: GM Coaching Letters threw "userEvents is not defined" — Why Engine cross-wiring (v4.203) referenced userEvents inside buildContext but never added it to the component\'s props or the call site',
    'GMCoachingBrief now correctly receives userEvents — isolated to this one component; DistrictPriorityBrief and LifeLenzBridgePanel were already wired correctly from their original construction',
    'Swept the rest of the codebase for the same pattern (referencing a variable without receiving it as a prop) — no other instances found',
  ]},
  {version:'4.206', date:'2026-06-19', changes:[
    'Performance: found the actual cause of recurring slowness — compute6wk() makes ~28 avg6() calls per invocation, each independently re-scanning the FULL multi-year, all-27-store array for one field',
    'Runs 3x per store (p/p2/p4 windows) x 27 stores = 2,000+ full array passes every time the store list recomputes — on load, on settings save, on Dialed-In calibration',
    'Added a per-store row index (laborByLoc/opsByLoc/ctrlByLoc/darByLoc), built once at every data-load and session-restore path — same 5 places the existing per-day index already gets built',
    'compute6wk and buildStore\'s pSales/pLY loop now operate on the pre-filtered per-store slice instead of the full district-wide array — identical math, identical semantics, far less to scan',
    'Fixed the most common load path too (App startup IndexedDB restore) — confirmed via existing code comments to be more frequent in practice than fresh Excel upload',
  ]},
  {version:'4.205', date:'2026-06-19', changes:[
    'Critical fix: buildStore\'s pLY (4-week LY comparison) was missing an upper date bound — summed ~392 days of LY sales against pSales\'s 28 days',
    'Caused a uniform ~92-93% "decline vs LY" on every single store regardless of actual performance — first surfaced via District Priority Brief\'s aggregate, but affected every consumer of store.pSales/store.pLY',
    'Also silently affected GM Coaching Letters\' "Sales (4wk) vs LY" line — every letter generated before this fix would have shown a false catastrophic decline',
    'Fixed at the source in buildStore — cascades correctly to District Priority Brief, GM Coaching Letters, and all other vsLY consumers with no per-feature changes needed',
  ]},
  {version:'4.204', date:'2026-06-19', changes:[
    'Model Assignment Backtest — first real-data run: 65 of 81 store×horizon assignments updated, all known problem stores (Elgin, Sulphur, Madill, Tishomingo) resolved correctly per their existing notes',
    'Found + fixed: Mossy Head yearly horizon showed 355%+ MAPE across all models — one contaminated period the recentOnly window didn\'t fully exclude was dominating the average',
    'Backtest MAPE is now a trimmed mean — worst ~5% of individual-day errors excluded before averaging (min sample guards apply), so one bad data day can\'t decide the model winner',
    'Trimming is always surfaced in the evidence ref ("N outlier days excluded") — never silently hidden, since a high trim count is itself a data-quality signal worth noticing',
  ]},
  {version:'4.203', date:'2026-06-18', changes:[
    'Engine cross-wiring: Why Engine ↔ GM Coaching Letters, Priority Brief, LifeLenz Bridge',
    'GM Coaching Letters: buildContext() now runs a 4-week Why Engine scan per store — accuracy + attribution injected into the prompt',
    'GM Coaching Letters: INSIGHT instruction is now specific (low explained% → surfaces missing event context or worst-DOW pattern as the coaching insight)',
    'Priority Brief: calibration gap detection via stored model MAPE — green stores with MAPE >12% promoted to amber with a 🔬 badge (zero recomputation)',
    'LifeLenz Bridge: each DOW bias stat now shows why LifeLenz is biased (weather-driven vs model gap vs situational) — changes how confidently to make the adjustment',
  ]},
  {version:'4.202', date:'2026-06-18', changes:[
    'LifeLenz Bridge — complementary to LifeLenz scheduling, not competing with it (no API, manual entry only)',
    'LEVEL: forward adjustment % per store/day — direct comparison when LifeLenz\'s own "Projected Sales" exists for that date in the loaded file, historical DOW-bias pattern fallback when it doesn\'t',
    'SHAPE: hourly distribution curves built from real darRows history, flagged for deviation when a tagged Calendar event (school release, local event, weather) suggests the normal hourly shape won\'t hold',
    'Single-store 14-day forward view + district-wide ranked scan, Copy Table for fast manual entry',
    'Every adjustment is labeled Direct or Pattern-based — no false confidence when LifeLenz\'s own forward number isn\'t in the loaded file',
  ]},
  {version:'4.201', date:'2026-06-18', changes:[
    'Why Engine — systematic miss attribution, the answer to "why did we miss" across every day, not one click at a time',
    'diagnoseMiss/crossStoreCheck extracted from ForecastTable closures to top-level functions — reused, not duplicated',
    'New: dollar-quantified forecast composition (weather/ops/trend/event $ contribution) via exact algebra on the known forecast formula',
    'Single-store scan: MAPE, explained-vs-unexplained miss rate, DOW miss pattern, worst misses each with full diagnosis',
    'District scan: ranks all 27 stores by MAPE and explained%, surfaces calibration candidates (high MAPE + low explained = model gap, not missing event data)',
    'Every miss card can tag an event directly, closing the loop back into calibration',
  ]},
  {version:'4.200', date:'2026-06-18', changes:[
    'Calendar Manager — proactive event calendar, converts event system from reactive to forward-looking',
    'School calendar event types added (early release, no-school, breaks, year start/end)',
    'Recurring rules engine — register an annual pattern once instead of re-tagging every year',
    'Proactive AI search — finds school district calendars + local events via web search, single-store or all-27 batch',
    'Unified Pending Review queue — AI-search and recurring-rule instances both require human approval before writing',
    'Month-grid calendar view with District/OK/FL/single-store scope, reuses existing EventEntryModal for entry',
    'Every write goes through the same mf_events storage — no separate code path, every existing system sees these identically',
  ]},
  {version:'4.199', date:'2026-06-18', changes:[
    'GM Coaching Letters — evolved from single-store on-demand to district-wide batch engine',
    'Batch mode: "Generate All 27" — one supervisor can maintain a coaching cadence with every GM',
    'Data source upgraded — now pulls buildStore\'s findings/opsScore/ctrlScore/trend instead of raw rows',
    '6wk→4wk→2wk trend direction precomputed and stated explicitly (was previously absent entirely)',
    'Critical findings now force the letter\'s FOCUS section to address them directly, not generically',
    'Every letter is an editable draft with a Reviewed checkbox — human review before copy/print',
  ]},
  {version:'4.198', date:'2026-06-18', changes:[
    'District Priority Brief — tiered (Action Required / Watch Closely / Running Well) above-store view',
    'Synthesizes existing store findings/scores — no new computation, pure intelligence layer',
    '"This Week\'s Focus" — auto-derived from most common issue type district-wide',
    'Filterable by org (OK/FL) and supervisor patch · linked from sidebar and AtAGlance',
  ]},
  {version:'4.197', date:'2026-06-18', changes:[
    'Structural audit complete — DevDashboard Engine Trace now wires _userEvents into forecastDay',
    'ShiftAnalysisTab reviewed — pure historical display, no forecast pipeline calls, no wiring needed',
    'Labor Analytics ⚡ Insights tab — 10-rule engine, ranked findings with $ impact estimates',
  ]},
  {version:'4.196', date:'2026-06-18', changes:[
    'Model Assignment Backtest Engine — re-runnable, tests DOW/AE/EWMA/DI per store × horizon',
    'Uses forecastDay\'s forceModel param — same pipeline as production, zero duplicated math',
    'Model Assignment panel — Re-run Backtest button, live progress, change summary, preserves manual overrides',
  ]},
  {version:'4.195', date:'2026-06-17', changes:[
    'calibrateStore full rewrite — holiday/event/DOW-specific/plus-up now in the evaluation formula',
    'ds.laborRows date-sort fix before .slice(-400) — root cause of inflated historical anomaly MAPEs',
    '_userEvents wired to every calibrateStore/forecastDay/forecastModels call site (was silently empty in many)',
    'detectCleanDataStart — automatic bad-data-period detection for Tishomingo/Elgin/Mossy Head/Ponce de Leon',
    'Holiday model redesign — fullClosure/partialClosure flags, real prior-year per-store holiday data',
    'autoTagHolidays — now runs automatically on every data load (Excel upload and IDB restore)',
  ]},
  {version:'4.192', date:'2026-06-10', changes:[
    'Morning Intelligence Brief — 9 correlation rules, 27 stores sorted by priority',
    'June 2026 projections — embedded all 27 stores, drag-and-drop parser for future months',
    'Projected/VS Proj in brief — falls back to June monthly target ÷ 30',
    'TPPH/Labor% in brief — ctrl row + June target fallbacks',
    'Inventory Excess Cases — fixed for Display as Each format (÷ caseSize)',
    'About/Changelog modal (this screen)',
  ]},
  {version:'4.191', date:'2026-06-01', changes:[
    'Open-Meteo weather API — all 27 stores including FL, 2022–present, IDB-persistent',
    'LFZ Gap panel corrected — honest 9.29% AE vs 9.51% LFZ same-period comparison',
    'Weather notes on anomaly detection, isWeatherExtreme in AE calibration',
    'STORE_COORDS — all 27 locations for weather API (coord.lng→.lon fix)',
  ]},
  {version:'4.190', date:'2026-05-28', changes:[
    'Adaptive Ensemble (AE) model — default weekly, 40,262 rows walk-forward validated',
    'AE auto-recalibration on data load from Sep 2025–May 2026 window',
    'Model Assignment Panel, IndexedDB persistent storage',
  ]},
  {version:'4.18x', date:'2026-05-15', changes:[
    'Florida stores — all 7 Emerald Arches locations integrated',
    'Lifelenz Gap panel, DAR daypart panel, Product Mix panel',
    'Mobile v2 — Convention Demo Mode, Beat LFZ badges, head-to-head hero card',
  ]},
];

function App() {
  const [ds, setDs]               = useState(null);
  const [view, setView]           = useState('command'); // command | district | store | org
  const [selStore, setSelStore]   = useState(null);
  const [locScope,   setLocScope]   = useState('all');
  const [dateRange, setDateRange] = useState(()=>thisWeek());
  const [settings, setSettings]   = useState(()=>{
    try{
      const s=localStorage.getItem('mf_settings');
      const saved=s?JSON.parse(s):{};
      // Deep merge: user prefs override DEF_SETTINGS, but new operators/supervisors added in code are always included
      const merged={...DEF_SETTINGS,...saved};
      // Merge operators — add any new ones from DEF_SETTINGS not in saved
      merged.operators={...DEF_SETTINGS.operators,...(saved.operators||{})};
      merged.supervisorGroups={...DEF_SETTINGS.supervisorGroups,...(saved.supervisorGroups||{})};
      // Auto-apply stored calibrations silently on every startup — fixes 0/27 on open
      try{
        const di=localStorage.getItem('mf_dialed_in');
        if(di){
          const diObj=JSON.parse(di);
          if(diObj&&Object.keys(diObj).length>0){
            merged.dialedIn={...diObj,...(merged.dialedIn||{})};
            merged.dialedInEnabled=true;
          }
        }
      }catch{}
      return merged;
    }catch{return DEF_SETTINGS;}
  });
  const [userEvents, setUserEvents]= useState(()=>{try{return JSON.parse(localStorage.getItem('mf_events')||'{}');}catch{return {};}});
  const [showSettings, setShowSettings]= useState(false);
  const [showRanking, setShowRanking]  = useState(false);
  const [rankingDefault, setRankingDefault] = useState('score');
  const [showTargets, setShowTargets]  = useState(false);
  const [showUnifiedTargets, setShowUnifiedTargets] = useState(false);
  const [showPerfCalc,    setShowPerfCalc]    = useState(false);
  const [showCorrExplorer,setShowCorrExplorer]= useState(false);
  const [showModelAssign, setShowModelAssign] = useState(false);
  const [showOnePager,    setShowOnePager]    = useState(false);
  const [showGMBrief,     setShowGMBrief]     = useState(false);
  const [idbCoverage,     setIdbCoverage]     = useState(null);
  const [showDataManager, setShowDataManager] = useState(false);
  const [showLFZGap,      setShowLFZGap]      = useState(false);
  const [showDARDaypart,  setShowDARDaypart]  = useState(false);
  const [showPMix,        setShowPMix]        = useState(false);
  const [showEvents, setShowEvents]    = useState(false);
  const [showCalendarManager, setShowCalendarManager] = useState(false);
  const [showWhyEngine, setShowWhyEngine] = useState(false);
  const [showLifeLenzBridge, setShowLifeLenzBridge] = useState(false);
  const [showCompare, setShowCompare]  = useState(false);
  const [showInsights,setShowInsights] = useState(false);
  const [showDev, setShowDev]          = useState(false);
  const [showRevIntel,setShowRevIntel] = useState(false);
  const [showAnoms, setShowAnoms]      = useState(false);
  const [showAIScan, setShowAIScan]    = useState(false);
  const [showDialedIn, setShowDialedIn]= useState(false);
  const [showReport,   setShowReport]  = useState(false);
  const [showProj,     setShowProj]    = useState(false);
  const [showProjBriefSA, setShowProjBriefSA] = useState(false); // standalone Pre-Forecast Brief
  const [sessionBanner,   setSessionBanner]   = useState(null);  // IDB restore prompt
  const [showAudit,    setShowAudit]   = useState(false);
  const [showBrief,    setShowBrief]   = useState(false);
  const [showMorningBrief, setShowMorningBrief] = useState(false); // Morning Brief panel
  const [showAbout, setShowAbout] = useState(false); // About/Changelog modal
  const [showPVSA,     setShowPVSA]    = useState(false);
  const [showDICompare,setShowDICompare]= useState(false);
  const [showHelp,     setShowHelp]    = useState(false);
  const [briefScope,   setBriefScope]  = useState({scope:'district',label:'District'});
  const [lockedProjections, setLockedProjections] = useState(()=>{
    try{return JSON.parse(localStorage.getItem('mf_locked_projections')||'{}');}catch{return {};}
  });
  const saveLockedProjections = useCallback((next)=>{
    setLockedProjections(next);
    try{localStorage.setItem('mf_locked_projections',JSON.stringify(next));}catch{}
  },[]);
  const [anomFilter, setAnomFilter]    = useState('all');
  const [showAttention, setShowAttention] = useState(false);
  const [showKB, setShowKB] = useState(false);
  const [showSmartTargets, setShowSmartTargets] = useState(false);
  const [showLocIntel,     setShowLocIntel]     = useState(false);
  const [showInventory,    setShowInventory]    = useState(false);
  const [showFOB,             setShowFOB]             = useState(false);
  const [showLaborAnalytics,  setShowLaborAnalytics]  = useState(false);
  const [showOperatorSummary, setShowOperatorSummary] = useState(false);
  const [showPriorityBrief,   setShowPriorityBrief]   = useState(false);
  const [showStoreKB,         setShowStoreKB]         = useState(false);
  const [showFcstAccuracy, setShowFcstAccuracy] = useState(false);
  const [userTargets, setUserTargets]  = useState(()=>{try{return JSON.parse(localStorage.getItem('mf_targets')||'{}');}catch{return {};}});
  const [loadMsg, setLoadMsg]          = useState(null);
  const [sessionRestoring, setSessionRestoring] = useState(false);

  // Auto-migrate flat targets → v2 on startup

  const performFullIDBRestore = async () => {
    setSessionRestoring(true);
    setLoadMsg('⏳ Loading stored data...');
    try{
      const {labor,ops,ctrl,fob,audit,peaks,dar,weather,pmix} = await loadDsFromIDB();
      await new Promise(r=>setTimeout(r,0)); // yield — break IDB message-handler chain
      const total = labor.length+ops.length+ctrl.length;
      if(total>0){
        const bIdx=(rows)=>{const idx={};for(const r of rows){if(!r.loc||!r.date)continue;const k=r.loc+'_'+dKey(r.date);if(!idx[k])idx[k]=[];idx[k].push(r);}return idx;};
        const lastAct={};
        for(const r of labor){if(r.sales>0){if(!lastAct[r.loc]||r.date>lastAct[r.loc])lastAct[r.loc]=r.date;}}
        const restoredDs={
          laborRows:labor, opsRows:ops, ctrlRows:ctrl,
          fobRows:fob, auditRows:audit,
          peaksSvcRows:peaks.filter(r=>r._peakSvc===true||r.svcType), peaksSalesRows:peaks.filter(r=>r._peakSvc===false&&!r.svcType),
          darRows:dar,
          pmixData:pmix||{}, weatherRows:weather||[], trendsRows:[], inventoryRows:[], records:{},
          targets:{}, loaded:labor.length>0,
          laborIdx:bIdx(labor), opsIdx:bIdx(ops), ctrlIdx:bIdx(ctrl),
          laborByLoc:bLocIdx(labor), opsByLoc:bLocIdx(ops), ctrlByLoc:bLocIdx(ctrl), darByLoc:bLocIdx(dar),
          weatherIdx:{}, wxByDate:{},
          storeIds:[...new Set(labor.map(r=>r.loc))].sort(),
          lastActual:lastAct,
        };
        if(audit.length>0) try{restoredDs.empRisk=analyzeRegisterAudit(audit);}catch(e){}
        setDs(restoredDs);
        try{
          const _existingEvents=JSON.parse(localStorage.getItem('mf_events')||'{}');
          const {events:_taggedEvents,tagged:_autoTaggedCount}=autoTagHolidays(restoredDs.laborRows,_existingEvents);
          if(_autoTaggedCount>0){
            localStorage.setItem('mf_events',JSON.stringify(_taggedEvents));
            setUserEvents(_taggedEvents);
          }
        }catch(e){console.warn('Auto-holiday-tag on IDB restore failed:',e);}
        // coverage and wx cache from data already in memory — no second IDB read
        const cov = coverageFromLoadedRows(labor, ops, ctrl, fob, audit, peaks, dar, weather);
        setIdbCoverage(cov);
        (weather||[]).forEach(r=>{if(!r.loc||!r.date)return;
          const _wk=String(r.loc)+'_'+dKey(r.date instanceof Date?r.date:new Date(r.date));
          if(!_wxCache[_wk])_wxCache[_wk]={tmax:r.tmax,tmin:r.tmin,rain:r.rain,wmax:r.wmax||r.wspd||0,source:r.source||'idb'};
        });
        const labCov=cov.laborRows;
        const msg = labCov?.count>0
          ? `💾 Stored data loaded · ${labCov.count.toLocaleString()} labor rows · ${labCov.from} → ${labCov.to}`
          : '💾 Stored data loaded from IndexedDB';
        setLoadMsg(msg);
        setTimeout(()=>setLoadMsg(null),6000);
      } else {
        setLoadMsg(null);
      }
    }catch(e){
      console.warn('IDB restore failed:',e);
      setLoadMsg('❌ Auto-restore failed — load data via Upload');
      setTimeout(()=>setLoadMsg(null),8000);
    }
    setSessionRestoring(false);
  };

  React.useEffect(()=>{ performFullIDBRestore(); },[]);

  React.useEffect(()=>{
    const existing=userTargets;
    if(existing&&Object.keys(existing).length>0){
      migrateTargetsToV2(existing, ymKey(new Date()));
    }
  },[]);

  const saveUserEvents = useCallback((next)=>{setUserEvents(next);try{localStorage.setItem('mf_events',JSON.stringify(next));}catch{}}, []);
  // ── One-time migration: normalize legacy Date.toString() tag keys → YYYY-MM-DD ──
  // Tags saved before v4_164 used Date.toString() keys like "Thu Jan 23 2026 06:00:00 GMT-0600"
  // which nDK() can't match against ISO "2026-01-23". This runs once on mount and fixes them.
  React.useEffect(()=>{
    try{
      const raw=localStorage.getItem('mf_events');
      if(!raw)return;
      const evs=JSON.parse(raw);
      let changed=false;
      for(const loc of Object.keys(evs)){
        const locEvs=evs[loc];
        for(const dk of Object.keys(locEvs)){
          // Check if this looks like a Date.toString() format (contains day-of-week name)
          const normalized=nDK(dk);
          if(normalized&&normalized!==dk&&/^\d{4}-\d{2}-\d{2}$/.test(normalized)){
            locEvs[normalized]=locEvs[dk];
            delete locEvs[dk];
            changed=true;
          }
        }
      }
      if(changed){
        localStorage.setItem('mf_events',JSON.stringify(evs));
        setUserEvents(evs);
        console.log('[McForecast] Migrated legacy tag keys to ISO format');
      }
    }catch(e){console.warn('[McForecast] Tag key migration error:',e);}
  },[]);
  const saveUserTargets= useCallback((next)=>{setUserTargets(next);try{localStorage.setItem('mf_targets',JSON.stringify(next));}catch{}}, []);

  // mfIDBSave (blob write) removed from auto-save — data already persisted
  // row-by-row via idbPutRows (Dexie per-store tables), which is the restore
  // path used by performFullIDBRestore. Writing the entire DS as a single
  // structured-clone blob (123k rows) was the source of the 146-second
  // 'message' handler violation after every restore or file load.
  // mfIDBSave is still available for the manual Save Session button.

  // Old mfIDBLoad/mfIDBClear startup removed — both reading AND deleting the
  // 123k-row session blob from McForecastSession IDB caused 143-second violations
  // (read triggers structured-clone deserialization; delete triggers IDB compaction).
  // The sessionAvailable banner from idbQuickSessionCheck handles restore instead.
  // The old McForecastSession database remains in place but is never touched.
  const saveSettings = useCallback((next) => {
    // Accepts plain object only (DI panel now passes plain objects, not functional updates)
    setSettings(next);
    try { localStorage.setItem('mf_settings', JSON.stringify(next)); } catch {}
    if(next.weekStartDay !== undefined) setWeekStartDay(next.weekStartDay);
  }, []);

  // Session Save / Restore handlers
  const handleSaveSession = useCallback(()=>{
    mfExportSession(ds,setLoadMsg);      // file download (portable)
    mfIDBSave(ds);                       // also refresh IDB (belt-and-suspenders)
    setTimeout(()=>setLoadMsg(null),5000);
  },[ds]);
  const handleRestoreSession = useCallback(()=>{
    document.getElementById('session-restore-input')&&document.getElementById('session-restore-input').click();
  },[]);
  const handleClearSession = useCallback(async()=>{
    if(!confirm('Clear the auto-saved session from IndexedDB? You can still load a .json session file manually.'))return;
    await mfIDBClear();
    setSessionBanner(null);
    setLoadMsg('✓ Auto-saved session cleared');
    setTimeout(()=>setLoadMsg(null),3000);
  },[]);

  // Initialize weekStartDay from persisted settings
  React.useEffect(()=>{setWeekStartDay(settings.weekStartDay!==undefined?settings.weekStartDay:3);},[]);

  // Expose DS globally for calibration
  // Apply theme + color mode to <html> element whenever settings change
  useEffect(()=>{
    const theme = settings.theme||'command';
    const mode  = settings.colorMode||'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-mode',  mode);
  },[settings.theme, settings.colorMode]);

    useEffect(()=>{window._mfDS=ds;},[ds]);
    useEffect(()=>{window._mfSettings=settings;},[settings]);
    // KB panel bridge — allows StoreDash to open a specific KB article
    React.useEffect(()=>{
      window._openKB=(articleKey)=>{setShowKB(true);};
    },[]);

  // Event tag listeners (mf_tag_event, mf_tag_event_multi, mf_remove_event)
  useEffect(()=>{
    const tag=(e)=>{
      const{loc:sLoc,locs,date,type,note}=e.detail;
      const tagLocs=locs||[sLoc];
      const dk=dKey(date),et=EVENT_TYPES[type]||EVENT_TYPES.other;
      setUserEvents(prev=>{
        const next=JSON.parse(JSON.stringify(prev));
        tagLocs.forEach(l=>{if(!next[l])next[l]={};next[l][dk]={type,note,icon:et.icon,label:et.label};});
        try{localStorage.setItem('mf_events',JSON.stringify(next));}catch{}
        return next;
      });
    };
    const remove=(e)=>{
      const{loc,date}=e.detail;const dk=dKey(date);
      setUserEvents(prev=>{
        const next=JSON.parse(JSON.stringify(prev));
        if(next[loc]){delete next[loc][dk];if(!Object.keys(next[loc]).length)delete next[loc];}
        try{localStorage.setItem('mf_events',JSON.stringify(next));}catch{}
        return next;
      });
    };
    document.addEventListener('mf_tag_event',tag);
    document.addEventListener('mf_tag_event_multi',tag);
    document.addEventListener('mf_remove_event',remove);
    return()=>{
      document.removeEventListener('mf_tag_event',tag);
      document.removeEventListener('mf_tag_event_multi',tag);
      document.removeEventListener('mf_remove_event',remove);
    };
  },[userEvents,saveUserEvents]);

  const mergedTargets = useMemo(()=>{
    const merged={};
    const locs = ds?ds.storeIds:Object.keys(DEFAULT_TARGETS);
    const curYm=ymKey(new Date());
    const v2=loadTargetsV2();
    const v2cur=v2[curYm]||{};
    locs.forEach(loc=>{
      // Priority: v2 monthly override > user flat override > ds.targets > DEFAULT_TARGETS
      merged[loc]={...DEFAULT_TARGETS[loc],...(ds&&ds.targets[loc]||{}),...(userTargets[loc]||{}),...(v2cur[loc]||{})};
    });
    return merged;
  },[ds,userTargets]);

  const rawStores = useMemo(()=>{
    if(!ds) return [];
    return ds.storeIds.filter(loc=>/^\d+$/.test(loc)).sort((a,b)=>+a-+b).map(loc=>buildStore(loc,ds,{...settings,targets:mergedTargets}));
  },[ds,settings,mergedTargets]);

  const stores = useMemo(()=>normalizeScores(rawStores,settings.scoringMode||'absolute'),[rawStores,settings.scoringMode]);

  const goStore=(s)=>{setSelStore(s&&s.loc?s.loc:s);setView('store');};
  const critCount = stores.reduce((a,s)=>a+s.findings.filter(f=>f.t==='crit').length,0);

  const dsRef = useRef(ds);
  useEffect(()=>{dsRef.current=ds;},[ds]);

  const handleFiles = useCallback(async(files)=>{
    if(!files||!files.length) return;
    const fileArr=Array.from(files);
    setLoadMsg('⏳ Reading '+fileArr.length+' file'+(fileArr.length>1?'s…':'…'));
    let currentDS=dsRef.current||buildDS([]);
    const loaded=[];
    for(const file of fileArr){
      try{
        setLoadMsg('⏳ Parsing '+file.name+'…');
        const ab=await file.arrayBuffer();
        const wb=XLSX.read(ab,{type:'array'});
        const type=detectType(file.name,wb);
        currentDS=mergeDS(currentDS,wb,type,file.name);
        loaded.push({name:file.name,type});
      }catch(e){
        console.error('File parse error:',file.name,e);
        setLoadMsg('⚠ Error reading '+file.name);
      }
    }
    setDs(currentDS);
    // Re-sync userEvents from localStorage (v4.195) — autoTagHolidays runs
    // synchronously inside the parsing pipeline (mergeDS → buildDS) and
    // writes any newly-tagged holidays directly to localStorage, since it's
    // a plain function with no access to React's setUserEvents callback.
    // Without this re-sync, the in-memory userEvents state would silently
    // diverge from what's actually persisted until a manual page reload —
    // meaning calibration calls made later in THIS session (which read
    // userEvents from React state, not localStorage directly) could still
    // miss the auto-tagged holidays from the load that just happened.
    try{
      const _refreshedEvents=JSON.parse(localStorage.getItem('mf_events')||'{}');
      setUserEvents(_refreshedEvents);
    }catch(e){console.warn('userEvents re-sync after load failed:',e);}
    const names=loaded.map(f=>f.name.replace(/\.[^.]+$/,'').split(' ').slice(0,3).join(' ')).join(', ');
    setLoadMsg('✓ '+names+' loaded · '+currentDS.storeIds.length+' stores');
    // ── Persist to IndexedDB (survives refresh) ──────────────────────────
    (async()=>{
      try{
        const ds=currentDS;
        setLoadMsg('💾 Saving to database...');
        await opfsSave(ds);
        await idbSetMeta('lastFile',{names,ts:Date.now()});
        // Auto-recalibrate AE model params when new data loads
        // (runs async in background — yields between stores to stay non-blocking)
        (async()=>{
          try{
            const _aeT0=performance.now();
            console.log('[AE] recalibration starting');
            const recalib={};
            const locList=currentDS.storeIds||[];
            for(const loc of locList){
              const lRows=(currentDS.laborRows||[]).filter(r=>String(r.loc)===String(loc)&&r.sales>0);
              if(lRows.length<60) continue;
              await new Promise(r=>setTimeout(r,0)); // yield only when doing real work
              const byDate={};
              lRows.forEach(r=>{byDate[dKey(r.date)]=r.sales;});
              // Recency-weighted grid search — last 52 dates, 18 combinations
              // Yields between every alpha to keep the UI responsive (<300ms blocks)
              const evalDates=Object.keys(byDate).sort().slice(-52);
              let bestWMAPE=999,bestP=AE_DI_PARAMS[loc]||{w2:0.4,w4:0.35,w6:0.25,alpha:0.20};
              for(const w2 of [0.6,0.4,0.33])for(const w4 of [0.3,0.25]){
                const w6=Math.round((1-w2-w4)*100)/100;
                if(w6<0.05) continue;
                for(const alpha of [0.15,0.25,0.35]){
                  await new Promise(r=>setTimeout(r,0)); // yield — keep UI responsive
                  const errs=[],wts=[];
                  for(let i=20;i<evalDates.length;i++){
                    const fd=new Date(evalDates[i]+'T00:00:00');
                    const actual=byDate[evalDates[i]];
                    if(!actual||actual<100) continue;
                    if(isWeatherExtreme(loc,fd,currentDS)) continue;
                    const fcst=forecastAdaptiveDI(lRows,currentDS.laborIdx,loc,fd,{w2,w4,w6,alpha});
                    if(!fcst) continue;
                    const dayAge=(evalDates.length-1-i);
                    const wt=Math.pow(0.98,dayAge);
                    errs.push(Math.abs(actual-fcst)/actual*wt);
                    wts.push(wt);
                  }
                  if(!errs.length) continue;
                  const wmape=errs.reduce((a,b)=>a+b)/wts.reduce((a,b)=>a+b)*100;
                  if(wmape<bestWMAPE){bestWMAPE=wmape;bestP={w2,w4,w6,alpha};}
                }
              }
              recalib[loc]=bestP;
            }
            // Store recalibrated params
            try{localStorage.setItem('mf_ae_params',JSON.stringify({params:recalib,ts:Date.now()}));}catch{}
            console.log('[AE] complete:', Object.keys(recalib).length,'stores in',(performance.now()-_aeT0).toFixed(0)+'ms');
          }catch(e){console.warn('AE recalibration failed:',e);}
        })();
        // Use in-memory data for coverage — avoids re-reading 123k rows from IDB
        const cov=coverageFromLoadedRows(currentDS.laborRows,currentDS.opsRows,currentDS.ctrlRows,currentDS.fobRows,currentDS.auditRows,[...(currentDS.peaksSvcRows||[]),...(currentDS.peaksSalesRows||[])],currentDS.darRows,currentDS.weatherRows);
        setIdbCoverage(cov);
        const labCov=cov.laborRows;
        setLoadMsg('✓ Saved · '+names+' · '+(labCov?.count||0).toLocaleString()+' labor rows stored');
        setTimeout(()=>setLoadMsg(null),6000);
      }catch(e){
        console.warn('IDB persist error:',e);
        setLoadMsg('❌ Database save failed — data is loaded but will not persist after refresh');
        setTimeout(()=>setLoadMsg(null),10000);
      }
    })();
  },[]);

  // Drag-drop
  useEffect(()=>{
    const prevent=(e)=>{e.preventDefault();e.stopPropagation();};
    const drop=(e)=>{e.preventDefault();e.stopPropagation();const files=e.dataTransfer&&e.dataTransfer.files;if(files&&files.length)handleFiles(files);};
    document.addEventListener('dragover',prevent);document.addEventListener('drop',drop);
    return()=>{document.removeEventListener('dragover',prevent);document.removeEventListener('drop',drop);};
  },[handleFiles]);

  // Render
  // ── anyModalOpen  (v4.212 — performance) ────────────────────────────────
  // AtAGlance (and any other background view) was rendering — and fully
  // re-running its own internal computation — even while completely hidden
  // behind a full-screen modal. Confirmed via a Chrome Performance recording:
  // clicking to open Priority Brief showed AtAGlance's own render function
  // consuming the dominant share of a 177-second interaction, despite being
  // invisible the entire time. Every modal in this app is a full-screen
  // fixed-position overlay, so there's no visual reason for the view behind
  // it to keep computing. This OR's together every modal-visibility flag —
  // safe to be over-inclusive here (pausing AtAGlance during a small popup
  // that doesn't fully cover it costs nothing, since it's instant to resume).
  // New panels: add their show-flag here, or they'll silently reintroduce
  // this exact bug for themselves.
  const anyModalOpen = showAIScan||showAbout||showAnoms||showAttention||showAudit||showBrief||
    showCalendarManager||showCompare||showCorrExplorer||showDARDaypart||
    showDICompare||showDataManager||showDev||showDialedIn||showEvents||showFOB||showFcstAccuracy||
    showGMBrief||showHelp||showInsights||showInventory||showKB||showLFZGap||showLaborAnalytics||
    showLifeLenzBridge||showLocIntel||showModelAssign||
    showMorningBrief||showOnePager||showOperatorSummary||showPMix||showPVSA||
    showPerfCalc||showPriorityBrief||showProj||showProjBriefSA||showRanking||
    showReport||showRevIntel||showSettings||showSmartTargets||showStoreKB||
    showTargets||showUnifiedTargets||showWhyEngine;

  // ── Universal Escape hatch  (v4.215) ────────────────────────────────────
  // Whatever caused this specific freeze, the deeper problem was that a
  // stuck modal had no way out at all. This doesn't depend on understanding
  // why something got stuck — Escape always closes every modal, full stop.
  React.useEffect(()=>{
    const onKey = (e) => {
      if(e.key!=='Escape') return;
      setShowAIScan(false);setShowAbout(false);setShowAnoms(false);setShowAttention(false);
      setShowAudit(false);setShowBrief(false);setShowCalendarManager(false);setShowCompare(false);
      setShowCorrExplorer(false);setShowDARDaypart(false);setShowDICompare(false);
      setShowDataManager(false);setShowDev(false);setShowDialedIn(false);setShowEvents(false);
      setShowFOB(false);setShowFcstAccuracy(false);setShowGMBrief(false);setShowHelp(false);
      setShowInsights(false);setShowInventory(false);setShowKB(false);setShowLFZGap(false);
      setShowLaborAnalytics(false);setShowLifeLenzBridge(false);setShowLocIntel(false);
      setShowModelAssign(false);setShowMorningBrief(false);setShowOnePager(false);
      setShowOperatorSummary(false);setShowPMix(false);setShowPVSA(false);setShowPerfCalc(false);
      setShowPriorityBrief(false);setShowProj(false);setShowProjBriefSA(false);setShowRanking(false);
      setShowReport(false);setShowRevIntel(false);setShowSettings(false);setShowSmartTargets(false);
      setShowStoreKB(false);setShowTargets(false);setShowUnifiedTargets(false);setShowWhyEngine(false);
    };
    document.addEventListener('keydown', onKey);
    return ()=>document.removeEventListener('keydown', onKey);
  },[]);

  return div({style:{height:'100vh',display:'flex',background:'var(--bg)',color:'var(--text)',fontFamily:'var(--sans)',overflow:'hidden'}},

    // ── LEFT SIDEBAR ─────────────────────────────────────────────
    h(AppSidebar,{
      view, setView,
      selStore,
      stores, ds, settings,
      loadMsg,
      onLoadFiles: () => document.getElementById('file-input-main')&&document.getElementById('file-input-main').click(),
      onSaveSession: handleSaveSession,
      onRestoreSession: handleRestoreSession,
      onOpenModal: (modal) => {
        if(modal==='ranking'||modal.startsWith('ranking:')){
          setShowRanking(true);
          setRankingDefault(modal.includes(':')?modal.split(':')[1]:'score');
        }
        if(modal==='aiscan')    setShowAIScan(p=>!p);
        if(modal==='revintel')  setShowRevIntel(true);
        if(modal==='compare')   setShowCompare(true);
        if(modal==='proj')      setShowProj(true);
        if(modal==='proj-brief') setShowProjBriefSA(true);
        if(modal==='dialedin')  setShowDialedIn(true);
        if(modal==='pvsa')      setShowPVSA(true);
        if(modal==='dicompare') setShowDICompare(true);
        if(modal==='report')    setShowReport(true);
        if(modal==='morning-brief') setShowMorningBrief(true);
        if(modal==='about') setShowAbout(true);
        if(modal==='brief')     {
          if(selStore) setBriefScope({scope:'store',label:sNameC(selStore),locs:[selStore]});
          else setBriefScope({scope:'district',label:settings.districtNameShort||'District',locs:null});
          setShowBrief(true);
        }
        if(modal==='targets')   setShowTargets(true);
        if(modal==='events')    setShowEvents(true);
        if(modal==='settings')  setShowSettings(true);
        if(modal==='help')      setShowHelp(true);
        if(modal==='kb')        setShowKB(true);
        if(modal==='smart-targets') setShowSmartTargets(true);
        if(modal==='loc-intel')     setShowLocIntel(true);
        if(modal==='inventory')     setShowInventory(true);
        if(modal==='fob-analysis')        setShowFOB(true);
        if(modal==='labor-analytics')     setShowLaborAnalytics(true);
        if(modal==='operator-summary')    setShowOperatorSummary(true);
        if(modal==='priority-brief')      setShowPriorityBrief(true);
        if(modal==='store-kb')            setShowStoreKB(true);
        if(modal==='model-assign')        setShowModelAssign(true);
        if(modal==='one-pager')            setShowOnePager(true);
        if(modal==='gm-brief')             setShowGMBrief(true);
        if(modal==='calendar-manager')     setShowCalendarManager(true);
        if(modal==='why-engine')           setShowWhyEngine(true);
        if(modal==='lifelenz-bridge')      setShowLifeLenzBridge(true);
        if(modal==='dar-daypart')          setShowDARDaypart(true);
        if(modal==='pmix')                 setShowPMix(true);
        if(modal==='data-manager')         setShowDataManager(true);
        if(modal==='lfz-gap')              setShowLFZGap(true);
        if(modal==='perf-calc')           setShowPerfCalc(true);
        if(modal==='corr-explorer')       setShowCorrExplorer(true);
        if(modal==='unified-targets')     setShowUnifiedTargets(true);
        if(modal==='fcst-accuracy')   setShowFcstAccuracy(true);
        if(modal==='attention') setShowAttention(true);
      }
    }),

    // ── RIGHT MAIN AREA ────────────────────────────────────────────
    div({style:{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}},

      // Slim topbar
      h(AppTopbar,{
        view, setView, selStore, stores, ds, settings,
        dateRange, onDateChange: setDateRange,
        locScope, onScopeChange: setLocScope,
        loadMsg,
        onLoadFiles: () => document.getElementById('file-input-main')&&document.getElementById('file-input-main').click(),
        onSaveSession: handleSaveSession,
        sessionBanner,
        onClearSession: handleClearSession,
        onOpenModal: (modal) => {
          if(modal==='settings')   setShowSettings(true);
          if(modal==='help')       setShowHelp(true);
          if(modal==='proj-brief') setShowProjBriefSA(true);
        }
      }),

      // Hidden file input wired to the sidebar Load button
      h('input',{id:'file-input-main',type:'file',multiple:true,accept:'.xlsx,.xlsm,.xls,.csv',
        style:{display:'none'},
        onChange:e=>handleFiles(Array.from(e.target.files||[]))}),
      // Hidden file input for session restore
      h('input',{id:'session-restore-input',type:'file',accept:'.json',
        style:{display:'none'},
        onChange:e=>{
          const f=e.target.files&&e.target.files[0];
          e.target.value='';
          if(!f)return;
          setLoadMsg('⏳ Restoring session…');
          mfRestoreSession(f,setDs,saveSettings,(msg)=>{setLoadMsg(msg);setTimeout(()=>setLoadMsg(null),5000);});
        }}),

          // Main content — fills right panel, scrollable
      div({style:{flex:1,overflowY:'auto',padding:'0 16px 32px'}},
      // ── Session restore banner (shown on startup if IDB session found) ────
      sessionBanner&&h(SessionBanner,{
        session:sessionBanner,
        onDismiss:()=>setSessionBanner(null),
        onRestore:async()=>{
          setSessionBanner(null);
          await performFullIDBRestore();
        }
      }),
      view==='command'&&h(AtAGlance,{stores:locScope==='ok'?stores.filter(s=>INV_ORG_COORDS[s.loc]&&INV_ORG_COORDS[s.loc].state==='OK'):locScope==='fl'?stores.filter(s=>INV_ORG_COORDS[s.loc]&&INV_ORG_COORDS[s.loc].state==='FL'):stores,ds,settings,userEvents,lockedProjections,dateRange,
        onOpenStore:s=>{goStore(s);},
        onOpenProjections:()=>setShowProj(true),
        onOpenPVSA:()=>setShowPVSA(true),
        onOpenBrief:()=>setShowBrief(true),
        onNav:v=>setView(v),
        onOpenModal:(modal)=>{
          if(modal==='ranking'||modal.startsWith('ranking:')){
            setShowRanking(true);
            setRankingDefault(modal.includes(':')?modal.split(':')[1]:'score');
          }
          else if(modal==='settings')setShowSettings&&setShowSettings(true);
        }}),
      view==='district'&&!selStore&&h(DistrictGrid,{stores,ds,settings,dateRange,userEvents,onSelectStore:goStore}),
      view==='store'&&selStore&&h(StoreDash,{store:stores.find(s=>s.loc===selStore)||stores[0],ds,settings,allStores:stores,onBack:()=>{setView('district');setSelStore(null);},onNav:goStore,dateRange,userEvents}),
      view==='patch'&&h(OrgView,{stores,settings,onSelectStore:goStore,groupBy:'patch'}),
      view==='org'&&h(OrgView,{stores,settings,onSelectStore:goStore,groupBy:'operator'})
    )  // close main content scroll area
    )  // close right panel flex-col

  , // Modals rendered at root of the flex layout (position:fixed, so location in tree doesn't matter)
    showSettings &&h(Settings, {settings,onUpdate:saveSettings,onClose:()=>setShowSettings(false)}),
    showRanking  &&h(RankingView,{stores,ds,settings,dateRange,onDateChange:setDateRange,defaultMetric:rankingDefault,onSelectStore:s=>{goStore(s);setShowRanking(false);},onClose:()=>setShowRanking(false)}),
    showTargets  &&h(MonthlyTargetManager,{userTargets,mergedTargets,onUpdate:saveUserTargets,onClose:()=>setShowTargets(false),ds}),
    showUnifiedTargets&&h(UnifiedTargetsPanel,{stores,ds,settings,onClose:()=>setShowUnifiedTargets(false)}),
    showPerfCalc&&h(PerformanceCalculator,{stores,ds,settings,onClose:()=>setShowPerfCalc(false)}),
    showCorrExplorer&&h(MetricCorrelationExplorer,{stores,ds,settings,onClose:()=>setShowCorrExplorer(false)}),
    showModelAssign&&h(ModelAssignmentPanel,{stores,ds,settings,userEvents,onClose:()=>setShowModelAssign(false)}),
    showOnePager&&h(StoreOnePager,{stores,ds,settings,onClose:()=>setShowOnePager(false)}),
    showGMBrief&&h(GMCoachingBrief,{stores,ds,settings,userEvents,onClose:()=>setShowGMBrief(false)}),
    showDARDaypart&&h(DARDaypartPanel,{stores,ds,settings,onClose:()=>setShowDARDaypart(false)}),
    showDataManager&&h(DataManagerPanel,{ds,idbCoverage,onClose:()=>setShowDataManager(false)}),
    showLFZGap&&h(LifelenzGapPanel,{ds,settings,onClose:()=>setShowLFZGap(false)}),
    showPMix&&h(ProductMixPanel,{stores,ds,settings,onClose:()=>setShowPMix(false)}),
    showEvents   &&h(EventCalendar,{userEvents,onUpdate:saveUserEvents,onClose:()=>setShowEvents(false),stores}),
    showCalendarManager&&h(CalendarManagerPanel,{stores,ds,settings,userEvents,onUpdate:saveUserEvents,onClose:()=>setShowCalendarManager(false)}),
    showWhyEngine&&h(WhyEnginePanel,{stores,ds,settings,userEvents,onUpdate:saveUserEvents,onClose:()=>setShowWhyEngine(false)}),
    showLifeLenzBridge&&h(LifeLenzBridgePanel,{stores,ds,settings,userEvents,onClose:()=>setShowLifeLenzBridge(false)}),
    showCompare  &&h(MultiStoreComparison,{stores,ds,settings,onSelectStore:s=>{goStore(s);setShowCompare(false);},onClose:()=>setShowCompare(false)}),
    showInsights &&h(AIInsightsLog,{stores,settings,onClose:()=>setShowInsights(false)}),
    showRevIntel &&h(RevenueIntelligence,{stores,ds,settings,userEvents,onSelectStore:s=>{goStore(s);setShowRevIntel(false);},onClose:()=>setShowRevIntel(false)}),
    showDev      &&h(DevDashboard,{ds,settings,stores,userEvents,onClose:()=>setShowDev(false)}),
    showKB&&h(KnowledgeBasePanel,{onClose:()=>setShowKB(false)}),
    showSmartTargets&&h(SmartTargetPanel,{stores,ds,settings,onClose:()=>setShowSmartTargets(false)}),
    showLocIntel&&h(LocationIntelligence,{allStores:stores,ds,settings,scope:'district',onClose:()=>setShowLocIntel(false)}),
    showInventory&&h(InventoryIntelligence,{stores,ds,settings,onClose:()=>setShowInventory(false)}),
    showFOB&&h(FOBAnalysisPanel,{stores,ds,settings,onClose:()=>setShowFOB(false)}),
    showLaborAnalytics&&h(LaborAnalyticsPanel,{stores,ds,settings,onClose:()=>setShowLaborAnalytics(false)}),
    showPriorityBrief&&h(DistrictPriorityBrief,{stores,ds,settings,userEvents,onSelectStore:s=>{goStore(s);setShowPriorityBrief(false);},onClose:()=>setShowPriorityBrief(false)}),
    showOperatorSummary&&h(OperatorSummaryPanel,{stores,ds,settings,onClose:()=>setShowOperatorSummary(false)}),
    showStoreKB&&h(StoreKBEditor,{onClose:()=>setShowStoreKB(false)}),
    showFcstAccuracy&&h(ForecastAccuracyPanel,{stores,ds,settings,userEvents,onClose:()=>setShowFcstAccuracy(false)}),
    showAttention&&h(AttentionPanel,{stores,onSelectStore:s=>{goStore(s);setShowAttention(false);},onClose:()=>setShowAttention(false)}),
    showAnoms    &&h(AnomalyPanel,{ds,stores,userEvents,initFilter:anomFilter,onSelectStore:s=>{goStore(s);setShowAnoms(false);setAnomFilter('all');},onClose:()=>{setShowAnoms(false);setAnomFilter('all');}}),
    showAIScan&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.75)',zIndex:300,overflowY:'auto',padding:20}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',maxWidth:940,margin:'0 auto'}},
        div({style:{padding:'12px 16px',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center'}},
          div({style:{fontSize:'13px',fontWeight:700}},'🔍 Historical Sales Anomaly Scan'),
          btn({onClick:()=>setShowAIScan(false),style:{marginLeft:'auto',background:'none',border:'none',color:'var(--text2)',fontSize:20,cursor:'pointer'}},'×')
        ),
        div({style:{padding:'16px'}},h(AIBacktestScanner,{stores,ds,settings,userEvents,onTagEvent:(loc,dk,note,evType,opts)=>{
          // Handle _refresh_ signal from EventEntryModal — receives complete new state
          // already written to localStorage; just sync React state with it.
          if(loc==='_refresh_'&&opts&&opts._refreshState){
            saveUserEvents(opts._refreshState);
            return;
          }
          setUserEvents(prev=>{
            const next=JSON.parse(JSON.stringify(prev));
            if(!next[loc])next[loc]={};
            const et=EVENT_TYPES[evType||'other']||EVENT_TYPES.other;
            const tagsArr=opts&&opts.tags&&opts.tags.length?opts.tags:[{type:evType||'other',...et}];
            const labelStr=opts&&opts.tagLabel?opts.tagLabel:(tagsArr.map(t=>t.label).join(' + ')||et.label);
            const iconStr=tagsArr.map(t=>t.icon||'📌').join(' ');
            next[loc][dk]={
              type:evType||'other',
              note:note||'Anomaly flagged from backtest scan',
              icon:iconStr,label:labelStr,
              tags:tagsArr,
              customNote:opts&&opts.customNote?opts.customNote:'',
              aiNote:opts&&opts.aiNote?opts.aiNote:'',
              ...(opts&&opts.aiMatched?{aiMatched:true,aiConfidence:opts.aiConfidence,source:'AI Batch Scan'}:{source:'Manual'})
            };
            try{localStorage.setItem('mf_events',JSON.stringify(next));}catch{}
            return next;
          });}}))
      )
    ),
    showProj&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',zIndex:300,overflowY:'auto',padding:20}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',width:'96vw',maxWidth:1700,margin:'0 auto',maxHeight:'92vh',display:'flex',flexDirection:'column'}},
        h(ProjectionWorkflow,{stores,ds,settings,userEvents,lockedProjections,onSaveLocked:saveLockedProjections,onClose:()=>setShowProj(false)})
      )
    ),
    // ── Standalone Pre-Forecast Brief (from topbar shortcut or nav) ──────
    showProjBriefSA&&h(PreForecastBrief,{
      stores,ds,settings,userEvents,
      weekStart:(()=>{const d=new Date();const wsd=settings.weekStartDay!=null?settings.weekStartDay:3;const diff=(wsd-d.getDay()+7)%7||7;const w=new Date(d);w.setDate(d.getDate()+diff);return dKey(w);})(),
      projPeriod:'week',lockedProjections,
      onRun:()=>{setShowProjBriefSA(false);setShowProj(true);},
      onClose:()=>setShowProjBriefSA(false)
    }),
    showReport&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',zIndex:300,overflowY:'auto',padding:20}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',maxWidth:1100,margin:'0 auto',maxHeight:'92vh',display:'flex',flexDirection:'column'}},
        h(DateRangeReport,{stores,ds,settings,userEvents,onClose:()=>setShowReport(false)})
      )
    ),
    showDICompare&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:370,display:'flex',alignItems:'center',justifyContent:'center',padding:20}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',
        width:'100%',maxWidth:1100,display:'flex',flexDirection:'column',maxHeight:'94vh'}},
        h(DialedInComparisonReport,{stores,ds,settings,userEvents,onClose:()=>setShowDICompare(false)})
      )
    ),
    showPVSA&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:360,display:'flex',alignItems:'center',justifyContent:'center',padding:20}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',
        width:'100%',maxWidth:1100,display:'flex',flexDirection:'column',maxHeight:'94vh'}},
        h(ProjectionVsActualsReport,{stores,ds,settings,userEvents,onClose:()=>setShowPVSA(false)})
      )
    ),
    showHelp&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:400,
      display:'flex',alignItems:'center',justifyContent:'center',padding:20}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',
        width:'100%',maxWidth:800,maxHeight:'94vh',display:'flex',flexDirection:'column'}},
        // Help header
        div({style:{padding:'14px 18px',borderBottom:'.5px solid var(--bdr)',
          display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}},
          div({style:{fontSize:'16px',fontWeight:800}},'📖 Meridian — Workflow Guide'),
          btn({onClick:()=>setShowHelp(false),style:{background:'none',border:'none',
            color:'var(--text2)',fontSize:22,cursor:'pointer'}},'×')
        ),
        // Help content
        div({style:{overflowY:'auto',padding:'16px 20px',fontSize:'11px',lineHeight:1.7}},
          ...[
            {day:'DAILY (Every day you open the app)',color:'#10b981',items:[
              {t:'1. Load fresh data',d:'Upload the latest QSRSoft Operations Report and Register Audit. The Data Status panel on the Home screen shows how old your current data is. Red = needs immediate refresh. Target: data no older than 3 days.'},
              {t:'2. Check the Home Command Center',d:'Review Signals Feed for any red/yellow alerts. Check the Projection Pulse to see next-7-day district forecast vs LY. Click any store showing red to investigate.'},
              {t:'3. Review Needs Attention',d:'The ⚠ button in the toolbar shows any stores with active alerts (integrity issues, scheduling problems, critical metrics). Address red items first.'},
              {t:'4. Spot-check a store',d:'Click any store in the district grid to open its dashboard. Review OEPE, TPPH, Labor%, and Cash O/S against targets. The Model Health Score tells you whether you can trust its forecast.'},
            ]},
            {day:'WEEKLY (Every Wednesday — start of work week)',color:'#f59e0b',items:[
              {t:'1. Lock the weekly projection',d:'Open Projections (📋 button). The workspace shows all 27 stores with AI-generated forecasts. Review any stores with high MAPE (the ±% next to store name). Double-click any cell to override if you have specific knowledge. Lock all rows when satisfied. Deadline: 10 days before week start.'},
              {t:'2. Run Projection vs Actuals report',d:'Click 📊 Proj vs Act and run a 2-4 week backtest. This shows how accurate the prior week AI forecasts were vs actual results. Click any cell to see day-by-day breakdown. Look for stores that are consistently missing — those need recalibration.'},
              {t:'3. Check Dialed-In for drifting stores',d:'Go to any store dashboard → Dialed-In. Look for the ⚠ drift warning. Stores with 2W MAPE significantly worse than 6W MAPE are drifting. Run ↺ Recalibrate on those stores.'},
              {t:'4. Generate Intelligence Brief',d:'Click 🧠 Brief from a store or from the district view. For your Monday morning review, run a District brief to get a plain-English summary of where things stand and what needs attention.'},
            ]},
            {day:'MONTHLY (By the 15th of prior month)',color:'#f87171',items:[
              {t:'1. Lock the monthly projection',d:'Open Projections → set Period to Month. Review all stores monthly totals. The system shows weekly sub-totals within the month. Approve all stores. Deadline: 15th of the prior month.'},
              {t:'2. Run full backtest and recalibrate all stores',d:'Dialed-In panel → Calibrate All. This updates the model for every store using the latest 6+ weeks of actual data. Run this monthly to keep the model sharp. Takes about 10-15 seconds for all 27 stores.'},
              {t:'3. Review model health for all stores',d:'Check the Home Command Center Model Health grid. Any stores in yellow or red should have their Dialed-In re-run. Target: 20+ stores green before committing monthly projections.'},
              {t:'4. Intelligence Brief — Operator roll-ups',d:'Generate a brief for each operator (Ryan, Gary, Rick/Kathy, Jacob). These are the right reports to share with each operator at the monthly review meeting.'},
            ]},
            {day:'ANNUAL (1 month before year start)',color:'#818cf8',items:[
              {t:'1. Lock the annual projection',d:'This is a district-level aggregate based on monthly projections. Work week by week through the full year using the monthly projection workflow. Deadline: approximately December 1 for the following year.'},
              {t:'2. Review and update targets',d:'Go to Settings → Targets and review each store OEPE, TPPH, Labor%, and growth targets. Annual target reviews should reflect changes in store capacity, staffing, or business mix.'},
              {t:'3. Reset and recalibrate all models',d:'After updating targets, run Calibrate All in Dialed-In. New targets change the ops factor calculations, so a fresh calibration ensures the model adapts.'},
            ]},
            {day:'AS NEEDED — Automation Candidates',color:'#94a3b8',items:[
              {t:'Auto-actions currently handled',d:'• Data loading: manual (drag-drop weekly) · • Calibration: auto when 10+ new points · • Signals: refresh on load · • Deadline alerts: live calculated'},
              {t:'Future automation candidates',d:'• Weekly brief email Wednesdays · • Auto-lock reminder Sundays (T-10 days) · • Monthly alert on the 10th · • MAPE alert when accuracy drops >3 points week-over-week'},
            ]},
          ].map((section,si)=>div({key:si,style:{marginBottom:20}},
            div({style:{display:'flex',alignItems:'center',gap:8,marginBottom:10,
              padding:'6px 10px',background:section.color+'15',borderRadius:'var(--r)',
              borderLeft:'3px solid '+section.color}},
              div({style:{fontWeight:800,fontSize:'12px',color:section.color}},section.day)
            ),
            div({style:{paddingLeft:12}},
              ...section.items.map((item,ii)=>div({key:ii,style:{marginBottom:12}},
                div({style:{fontWeight:700,fontSize:'11px',color:'var(--text)',marginBottom:3}},
                  item.t),
                div({style:{color:'var(--text2)',fontSize:'10px',lineHeight:1.6,
                  whiteSpace:'pre-line'}},item.d)
              ))
            )
          ))
        )
      )
    ),
    showBrief&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:350,display:'flex',alignItems:'center',justifyContent:'center',padding:20}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',
        width:'100%',maxWidth:720,display:'flex',flexDirection:'column',maxHeight:'92vh'}},
        h(LocationBrief,{
          stores:briefScope.locs?stores.filter(s=>briefScope.locs.includes(s.loc)):stores,
          ds,settings,
          scope:briefScope.scope,
          scopeLabel:briefScope.label,
          onClose:()=>setShowBrief(false)
        })
      )
    ),
    showAbout&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.88)',zIndex:370,
      display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'16px',overflowY:'auto'}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',
        width:'100%',maxWidth:720,position:'relative'}},
        h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',
          padding:'14px 18px',borderBottom:'.5px solid var(--bdr2)',position:'sticky',top:0,
          background:'var(--surf)',zIndex:10}},
          h('div',null,
            h('div',{style:{fontFamily:"'Syne',sans-serif",fontSize:'16px',fontWeight:800}},
              'Meridian. v'+MERIDIAN_VERSION),
            h('div',{style:{fontSize:'11px',color:'var(--text3)',marginTop:'2px'}},
              'QSR Forecasting & Intelligence · MCDOK & Emerald Arches · 27 Locations · Build '+MERIDIAN_BUILD_DATE)),
          h('button',{onClick:()=>setShowAbout(false),
            style:{background:'none',border:'none',color:'var(--text3)',fontSize:'20px',cursor:'pointer'}},'✕')),
        div({style:{padding:'20px 24px',overflowY:'auto',maxHeight:'80vh'}},
          // Stats row
          div({style:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'24px'}},
            [['27','Stores'],['5','Forecast Models'],['40,262','Rows Validated'],['9','Correlation Rules']]
              .map(([v,l])=>div({style:{background:'rgba(245,158,11,.06)',border:'1px solid rgba(245,158,11,.15)',
                borderRadius:'8px',padding:'12px',textAlign:'center'}},
                div({style:{fontFamily:"'Syne',sans-serif",fontSize:'22px',fontWeight:800,color:'var(--amber)'}},v),
                div({style:{fontSize:'10px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginTop:'2px'}},l)))
          ),
          // Changelog
          h('div',{style:{fontFamily:"'Syne',sans-serif",fontSize:'14px',fontWeight:800,
            marginBottom:'14px',color:'var(--text)'}},'Changelog'),
          ...MERIDIAN_CHANGELOG.map(entry=>
            div({style:{borderLeft:'2px solid rgba(245,158,11,.3)',paddingLeft:'16px',marginBottom:'20px'}},
              div({style:{display:'flex',gap:'10px',alignItems:'center',marginBottom:'8px'}},
                div({style:{fontFamily:"'Syne',sans-serif",fontSize:'13px',fontWeight:800,color:'var(--amber)'}},
                  'v'+entry.version),
                div({style:{fontSize:'11px',color:'var(--text3)'}},'·'),
                div({style:{fontSize:'11px',color:'var(--text3)'}},' '+entry.date)),
              h('ul',{style:{paddingLeft:'16px',display:'flex',flexDirection:'column',gap:'5px'}},
                entry.changes.map((c,i)=>
                  h('li',{key:i,style:{fontSize:'12px',color:'var(--text2)',lineHeight:'1.6'}},c)))
            )
          ),
          // Data sources info
          div({style:{borderTop:'.5px solid var(--bdr)',paddingTop:'16px',marginTop:'8px'}},
            div({style:{fontSize:'11px',color:'var(--text3)',lineHeight:'1.8'}},
              '⚡ Architecture: Single-file HTML · React 18 UMD · IndexedDB storage · Open-Meteo weather API'),
            div({style:{fontSize:'11px',color:'var(--text3)',lineHeight:'1.8',marginTop:'4px'}},
              '📊 Data sources: QSRSoft (manual export) · Lifelenz (Labor Analysis) · 3 Peaks · Register Audit · FOB · Inventory'),
            div({style:{fontSize:'11px',color:'var(--text3)',lineHeight:'1.8',marginTop:'4px'}},
              '🔒 All data stored locally in your browser · No cloud upload · No external data transmission')
          )
        )
      )
    ),
        showMorningBrief&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.88)',zIndex:360,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'16px',overflowY:'auto'}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',width:'100%',maxWidth:920,position:'relative'}},
        h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 18px',borderBottom:'.5px solid var(--bdr2)',position:'sticky',top:0,background:'var(--surf)',zIndex:10}},
          h('div',null,
            h('div',{style:{fontFamily:"'Syne',sans-serif",fontSize:'16px',fontWeight:800,letterSpacing:'-.02em'}},'☀️ Morning Intelligence Brief'),
            h('div',{style:{fontSize:'11px',color:'var(--text3)',marginTop:'2px'}},'Correlation engine · 9 rules · 27 stores · Sorted by priority')),
          h('button',{onClick:()=>setShowMorningBrief(false),style:{background:'none',border:'none',color:'var(--text3)',fontSize:'20px',cursor:'pointer',lineHeight:1,padding:'0 4px'}},'✕')),
        div({style:{overflowY:'auto',maxHeight:'88vh'}},
          h(MorningBriefPanel,{ds,settings}))
      )
    ),
        showAudit&&selStore&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',zIndex:300,overflowY:'auto',padding:20}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',maxWidth:980,margin:'0 auto',maxHeight:'92vh',display:'flex',flexDirection:'column'}},
        h(ForecastAudit,{
          store:stores.find(s=>s.loc===(selStore&&selStore.loc?selStore.loc:selStore))||null,
          ds,settings,userEvents,dateRange,
          onClose:()=>setShowAudit(false)
        })
      )
    ),
    showDialedIn&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',zIndex:300,overflowY:'auto',padding:20}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',maxWidth:1100,margin:'0 auto',maxHeight:'90vh',display:'flex',flexDirection:'column'}},
        h(DialedInPanel,{stores,ds,settings,userEvents,onUpdateSettings:saveSettings,onClose:()=>setShowDialedIn(false)})
      )
    )
  );
}

export default App;
