// @ts-nocheck
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import * as XLSX from 'xlsx'
import { Chart } from 'chart.js/auto'
import '../meridian.css'

const ReactDOM = { createRoot }

import { addD, addDR, dKey, nDK, dowOf, sodOf, eodOf, setWeekStartDay, mwStart, nwStart, fmtDI, fmtRng, nDays, rngMode, dFmt, dFmtShort, dFmtDow, thisWeek } from '../utils/date.js';
import { isHoliday, getHolidayAdj, autoTagHolidays, buildHolidays, HOLIDAY_MAP } from '../utils/holidays.js';
import { DEFAULT_TARGETS, DEFAULT_MODEL_ASSIGNMENTS, MODEL_ASSIGNMENT_KEY, DEF_SETTINGS, setLiveSupervisorGroups, setLiveAssignments, seedAssignmentsFromGroups, AE_DI_PARAMS, MODEL_CODE_LABELS, STORE_COORDS, STORE_NAMES, sName, sNameC, DOW_BASE, STORE_KB, STORE_KB_EDIT_KEY, getKBEdits, saveKBEdits, getKB, EVENT_TYPES, EVENT_TYPE_GROUPS, INV_ORG_COORDS, fetchOpenMeteoWeather, OPTIONAL_PANELS, loadPanelVis, savePanelVis } from '../constants.js';
import { _masgnInvalidate, getModelAssignment, saveModelOverride, computeMAPEDrift, computeStoreSigma, getStoreOrg, getWeatherNote, isWeatherExtreme, calibrateWeather, forecastEWMA, forecastAdaptiveDI, forecastAdaptiveEnsemble, _wxCache, getForecastWeather, fetchRow, fetchWx, fetchLY, fetchLYDate, storeAgeDays, fetchRampSales, getDOWTrend, getDOWSpecificTrend, forecastDayparts, getWxAdj, modelHealthScore, compute6wk, calcOpsF, forecastDay, forecastRange, forecastRangeAsync, effectivePlusUp, forecastModels, modelAccuracy, getDIRecommendation, computeModelHealth, bLocIdx, locRows, avg6, gcCrossCheck, KnowledgeBasePanel, InfoIcon } from '../engine/forecast.js';
import { idbDateKey, idbPutRows, idbGetAllRows, idbGetMeta, idbSetMeta, idbClearAll, coverageFromLoadedRows, withTimeout, idbQuickSessionCheck, loadDsFromIDB, opfsSave, opfsClear } from '../db/index.js';
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
import { AIInsightsTab, MetricCorrelationExplorer, DistrictLensPanel, WhyEnginePanel, FOBAnalysisPanel, ForecastAccuracyPanel, AIBacktestScanner, DialedInPanel, DateRangeReport, ForecastAudit, LocationBrief, ProjectionVsActualsReport, DialedInComparisonReport, DistrictPriorityBrief, AttentionPanel, AtAGlance, DataManagerPanel, StoreOnePager, ChannelIntelligencePanel, MonthlyProjectionsPanel, StoreVlhConfigPanel } from '../views/analytics.js';
import { Settings } from '../views/management.js';
// Lazy panel with stale-chunk recovery: after a new deploy, an open tab's index.html references old
// hashed chunk filenames that are gone from the server, so a dynamic import 404s ("Failed to fetch
// dynamically imported module"). Reload ONCE (throttled) to pull the fresh index.html + chunk map.
const lazyPanel = (importFn) => React.lazy(() => importFn().catch((err) => {
  try {
    const KEY = 'meridian_chunk_reload_at';
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last > 15000) { sessionStorage.setItem(KEY, String(Date.now())); location.reload(); return new Promise(() => {}); }
  } catch {}
  throw err;
}));
const PerformanceReviewsPanel = lazyPanel(() => import('../views/performance-reviews.js').then(m => ({ default: m.PerformanceReviewsPanel })));
const DeliveryMixPanel = lazyPanel(() => import('../views/delivery-mix.js').then(m => ({ default: m.DeliveryMixPanel })));
import { SchedulingPanel } from '../views/scheduling.js';
import { AdminPanel } from '../views/admin.js';
const SMGVoicePanel = lazyPanel(() => import('../views/smg-voice.js').then(m => ({ default: m.SMGVoicePanel })));
const FOBEOMPanel = lazyPanel(() => import('../views/fob-eom.js').then(m => ({ default: m.FOBEOMPanel })));
import { EOMSupervisorPanel } from '../views/eom-supervisor.js';
const EOMDashboardPanel = lazyPanel(() => import('../views/eom-dashboard.js').then(m => ({ default: m.EOMDashboardPanel })));
import { WhatNeedsAttentionPanel } from '../views/attention-now.js';
import { FormsPrintPanel } from '../views/forms-print.js';
const OnePagerPanel = lazyPanel(() => import('../views/one-pager.js').then(m => ({ default: m.OnePagerPanel })));
import { MetricLineagePanel } from '../views/metric-lineage.js';
import { FormsLibraryPanel } from '../views/forms-library.js';
const SignalsPanel = lazyPanel(() => import('../views/signals.js').then(m => ({ default: m.SignalsPanel })));
import { SmartTargetsPanel } from '../views/smart-targets.js';
import { LaborAnalysisPanel } from '../views/labor-analysis.js';
import { PaceToTargetPanel } from '../views/pace-to-target.js';
const YearlyProjectionsPanel = lazyPanel(() => import('../views/yearly-projections.js').then(m => ({ default: m.YearlyProjectionsPanel })));
import { PromoRoiPanel } from '../views/promo-roi.js';
const VisitReadinessPanel = lazyPanel(() => import('../views/visit-readiness.js').then(m => ({ default: m.VisitReadinessPanel })));
import { ScheduleSummaryPanel } from '../views/schedule-summary.js';
import { SkillsMatrixPanel } from '../views/skills-matrix.js';
const SagePanel = lazyPanel(() => import('../views/sage.js').then(m => ({ default: m.SagePanel })));
import { FeatureRequestsPanel } from '../views/feature-requests.js';
import { TaskQueuePanel } from '../views/task-queue.js';
import { DTSpeedOfServicePanel } from '../views/dt-speedofservice.js';
const GradedVisitsPanel = lazyPanel(() => import('../views/graded-visits.js').then(m => ({ default: m.GradedVisitsPanel })));
import { computeInsights } from '../engine/insights.js';
import { computeAllCustomSignals } from '../engine/signal-registry.js';
import { supabase, loadMonthlyTargets, loadAllMonthlyTargets, saveSmgFullscale, loadSmgFullscale, saveVoicePerf, loadVoicePerf, saveLifeLenzSchedule, loadLifeLenzSchedule, loadLifeLenzJobHours, saveLaborRows, loadLaborRows, saveFobRows, loadFobRows, loadQsrFob, saveOpsRows, loadOpsRows, saveCtrlRows, loadCtrlRows, saveDarRows, loadDarRows, savePeaksRows, loadPeaksRows, saveAuditRows, loadAuditRows, uploadReportFile, loadCustomSignals, appendCustomSignalHistory, loadQsrFieldDefs, saveUserSetting, loadUserSetting, loadQsrActSummary, loadEbosDaily, loadRosterStatistics, loadRosterRoleCounts, loadTurnoverMonthly, loadDigitalAppMonthly, loadMcdeliveryMonthly, loadShiftManagerMonthly, loadGlimpse, loadCash, loadSalesLedger, loadOpsCashSheet, loadOpsLaborSummary, loadOpsServiceStats, loadOpsSalesMix, loadOpsPeaksSales, saveStoreLaborConfig, loadStoreLaborConfig, saveLifeLenzLaborWeek, loadLifeLenzLaborWeek, saveEmployeeSkills, loadEmployeeSkills, loadGradedVisits, saveSmgComments, loadSmgComments, saveVoiceDaypart, loadVoiceDaypart, loadOrgEvents, loadOrgSchoolConfig } from '../lib/supabase.js';
import { orgEventsToDayMap } from '../engine/events-import.js';
import { setSupabaseClient, syncReviewsFromSupabase, syncConfigFromSupabase, pushConfigToSupabase, syncTemplatesFromSupabase } from '../engine/review-engine.js';
import { getOrgRoles, syncOrgRolesFromSupabase, hasPermission } from '../engine/permissions.js';
import { SignOutBtn } from '../components/AuthGate.js';
import { RecordDayPanel } from '../views/record-day.js';
import { DatePicker, AppSidebar, AppTopbar } from '../app/shell.js';
import { LocationIntelligence } from '../features/location-intel.js';
import { TH, f$, fPct, fP, fN, grade, gLbl, gCol, gBg, gBdr } from '../utils/fmt.js';
import { MorningBriefPanel, exportBriefHTML, getReportRecipients, storeDistance, regionalRadius, STORE_STAFF, CONTACTS } from '../features/morning-brief.js';
import { loadRecurringRules, saveRecurringRules, expandRecurringRule, getRecurringInstancesNeedingConfirm, searchUpcomingEvents } from '../features/calendar.js';
import { ErrorBoundary, mfExportSession, mfRestoreSession, mfIDBLoad, mfIDBSave, mfIDBClear, _mfOpenDB, _mfSerDS, _mfDeserDS, _mfSessionMeta, SessionBanner } from '../features/session.js';
import { buildDS, mergeDS, buildStore, buildBrief, normalizeScores } from '../engine/pipeline.js';
import { detectType, parseSMGVoicePDF, parseVoiceDaypartPDF, parseSMGFullScale, parseLifeLenzLabor, parseMbiLaborAnalysisWb, parsePeopleSkillsWb, opsReportIsDaily } from '../parsers/index.js';
import { TutorialOverlay, shouldShowTutorial, resetTutorial } from '../views/tutorial.js';
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

// ── Planning hub ─────────────────────────────────────────────────────────────
// Notes 24 IA merge: one nav entry ("Planning") tabbing across the five
// forward-looking, same-mental-model panels (Targets / Monthly / Pace / Yearly /
// Smart Targets) instead of five separate nav items + five modals. Each tab lazily
// mounts its existing, tested panel in `embedded` mode (fills the hub body — no
// second full-screen overlay). Only the active tab mounts, so heavy data loads on
// demand and switching remounts (matches the lazy-tab plan in notes-24).
const PLANNING_TABS = [
  { id: 'targets', label: 'Targets',     icon: '◉' },
  { id: 'monthly', label: 'Monthly',     icon: '📅' },
  { id: 'pace',    label: 'Pace',        icon: '🏁' },
  { id: 'yearly',  label: 'Yearly',      icon: '📆' },
  { id: 'smart',   label: 'Smart',       icon: '🧭' },
];
function PlanningHubPanel({ ds, stores, settings, customSignalDefs, initialTab, onClose }) {
  const [tab, setTab] = useState(initialTab && PLANNING_TABS.some(t => t.id === initialTab) ? initialTab : 'targets');
  const common = { ds, stores, settings, onClose, embedded: true };
  const active =
    tab === 'targets' ? h(UnifiedTargetsPanel, common) :
    tab === 'monthly' ? h(MonthlyProjectionsPanel, { ...common, customSignalDefs }) :
    tab === 'pace'    ? h(PaceToTargetPanel, common) :
    tab === 'yearly'  ? h(YearlyProjectionsPanel, common) :
                        h(SmartTargetsPanel, common);
  return div({ style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 460, display: 'flex', flexDirection: 'column', paddingTop: 16 } },
    div({ style: { flex: '0 0 16px', cursor: 'pointer' }, onClick: onClose }),
    div({ style: { flex: 1, background: 'var(--surf)', maxWidth: 1200, margin: '0 auto', width: 'calc(100% - 24px)', borderRadius: 'var(--rl) var(--rl) 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -8px 40px rgba(0,0,0,.4)' } },
      // Hub header: title + tab strip + single close
      div({ style: { padding: '8px 14px', borderBottom: '.5px solid var(--bdr)', flexShrink: 0, background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        span({ style: { fontSize: 13, fontWeight: 800, color: 'var(--amber)', letterSpacing: '-.2px', flexShrink: 0 } }, 'Planning'),
        div({ style: { display: 'flex', gap: 2, flexWrap: 'wrap', flex: 1, minWidth: 0 } },
          ...PLANNING_TABS.map(t => btn({ key: t.id, onClick: () => setTab(t.id),
            title: t.label,
            style: { display: 'flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 700,
              border: '1px solid ' + (tab === t.id ? 'var(--amber)' : 'var(--bdr)'),
              background: tab === t.id ? 'rgba(245,188,0,.14)' : 'var(--surf)',
              color: tab === t.id ? 'var(--amber)' : 'var(--text2)' } },
            span({ style: { fontSize: 12 } }, t.icon), t.label))),
        btn({ className: 'btn btn-sm', style: { color: 'var(--text3)', flexShrink: 0 }, onClick: onClose }, '✕')),
      // Active tab body (only the active panel mounts)
      div({ style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' } }, active)));
}

// ── Scheduling hub ───────────────────────────────────────────────────────────
// Notes 24 IA merge (companion to the Planning hub): one "Scheduling" entry tabbing
// across the labor/scheduling panels — Labor Analytics, Scheduling, Weekly Schedule
// Summary, Labor Analysis, Employee Skills — each lazily mounted in `embedded` mode.
const SCHED_TABS = [
  { id: 'analytics', label: 'Labor Analytics', icon: '👷', perm: 'analytics.labor' },
  { id: 'scheduling', label: 'Scheduling',     icon: '📋', perm: 'analytics.store' },
  { id: 'summary',   label: 'Schedule Summary', icon: '🗓', perm: 'analytics.store' },
  { id: 'analysis',  label: 'Labor Analysis',  icon: '🧮', perm: 'analytics.store' },
  { id: 'skills',    label: 'Skills',          icon: '🎓', perm: 'analytics.store' },
];
function SchedulingHubPanel({ ds, stores, settings, initialTab, perm, onClose }) {
  const allowed = SCHED_TABS.filter(t => !perm || perm(t.perm));
  const first = (allowed[0] && allowed[0].id) || 'scheduling';
  const [tab, setTab] = useState(initialTab && allowed.some(t => t.id === initialTab) ? initialTab : first);
  const common = { ds, stores, settings, onClose, embedded: true };
  const active =
    tab === 'analytics' ? h(LaborAnalyticsPanel, common) :
    tab === 'scheduling' ? h(SchedulingPanel, common) :
    tab === 'summary'   ? h(ScheduleSummaryPanel, common) :
    tab === 'analysis'  ? h(LaborAnalysisPanel, common) :
                          h(SkillsMatrixPanel, common);
  return div({ style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 460, display: 'flex', flexDirection: 'column', paddingTop: 16 } },
    div({ style: { flex: '0 0 16px', cursor: 'pointer' }, onClick: onClose }),
    div({ style: { flex: 1, background: 'var(--surf)', maxWidth: 1600, margin: '0 auto', width: 'calc(100% - 24px)', borderRadius: 'var(--rl) var(--rl) 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -8px 40px rgba(0,0,0,.4)' } },
      div({ style: { padding: '8px 14px', borderBottom: '.5px solid var(--bdr)', flexShrink: 0, background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        span({ style: { fontSize: 13, fontWeight: 800, color: 'var(--amber)', letterSpacing: '-.2px', flexShrink: 0 } }, 'Labor & Scheduling'),
        div({ style: { display: 'flex', gap: 2, flexWrap: 'wrap', flex: 1, minWidth: 0 } },
          ...allowed.map(t => btn({ key: t.id, onClick: () => setTab(t.id), title: t.label,
            style: { display: 'flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 700,
              border: '1px solid ' + (tab === t.id ? 'var(--amber)' : 'var(--bdr)'),
              background: tab === t.id ? 'rgba(245,188,0,.14)' : 'var(--surf)',
              color: tab === t.id ? 'var(--amber)' : 'var(--text2)' } },
            span({ style: { fontSize: 12 } }, t.icon), t.label))),
        btn({ className: 'btn btn-sm', style: { color: 'var(--text3)', flexShrink: 0 }, onClick: onClose }, '✕')),
      div({ style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' } }, active)));
}

// ── Panel Manager ────────────────────────────────────────────────────────────
// Notes 24 feature-registry: an in-app reference + toggle for the optional/experimental
// panels hidden from the sidebar. Lists each with a blurb; the switch shows/hides its nav
// entry (persisted to localStorage). Nothing is deleted — hidden panels keep their modal
// routing. Also the future basis for per-tenant module flags.
function PanelManagerPanel({ vis, onToggle, onShowAll, onHideAll, perm, onClose }) {
  const shownCount = OPTIONAL_PANELS.filter(p => vis && vis[p.id]).length;
  const cats = [...new Set(OPTIONAL_PANELS.map(p => p.cat))];
  const sw = (on) => div({ style:{ width:34, height:19, borderRadius:99, background:on?'var(--amber)':'rgba(255,255,255,.14)', position:'relative', transition:'background .15s', flexShrink:0 } },
    div({ style:{ position:'absolute', top:2, left:on?17:2, width:15, height:15, borderRadius:'50%', background:'#fff', transition:'left .15s' } }));
  const row = (p) => {
    const on = !!(vis && vis[p.id]);
    const allowed = !p.perm || !perm || perm(p.perm);
    return div({ key:p.id, onClick:()=>allowed&&onToggle(p.id),
      style:{ display:'flex', alignItems:'flex-start', gap:10, padding:'9px 12px', borderRadius:8, cursor:allowed?'pointer':'default', opacity:allowed?1:0.4,
        border:'.5px solid var(--bdr)', background:on?'rgba(245,188,0,.06)':'var(--surf2)' } },
      span({ style:{ fontSize:16, width:20, textAlign:'center', flexShrink:0 } }, p.icon),
      div({ style:{ flex:1, minWidth:0 } },
        div({ style:{ fontSize:12, fontWeight:700, color:'var(--text)' } }, p.label,
          span({ style:{ fontSize:9, color:'var(--text3)', fontWeight:500, marginLeft:6 } }, on?'shown':'hidden')),
        div({ style:{ fontSize:10, color:'var(--text3)', marginTop:2, lineHeight:1.4 } }, p.blurb)),
      allowed ? sw(on) : span({ style:{ fontSize:9, color:'var(--text3)' } }, 'no access'));
  };
  return div({ style:{ position:'fixed', inset:0, background:'rgba(0,0,0,.82)', zIndex:460, display:'flex', flexDirection:'column', paddingTop:20 } },
    div({ style:{ flex:'0 0 20px', cursor:'pointer' }, onClick:onClose }),
    div({ style:{ flex:1, background:'var(--surf)', maxWidth:720, margin:'0 auto', width:'calc(100% - 24px)', borderRadius:'var(--rl) var(--rl) 0 0', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 -8px 40px rgba(0,0,0,.4)' } },
      div({ style:{ padding:'10px 16px', borderBottom:'.5px solid var(--bdr)', flexShrink:0, background:'var(--surf2)', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' } },
        span({ style:{ fontSize:18 } }, '🧩'),
        div({ style:{ flex:1, minWidth:160 } },
          div({ style:{ fontSize:14, fontWeight:800, color:'var(--text)' } }, 'Panel Manager'),
          div({ style:{ fontSize:9, color:'var(--text3)' } }, 'Show or hide optional / experimental panels in the sidebar. '+shownCount+' of '+OPTIONAL_PANELS.length+' shown. Hidden panels are never deleted — toggle any back on anytime.')),
        btn({ className:'btn btn-sm', style:{ fontSize:10 }, onClick:onShowAll }, 'Show all'),
        btn({ className:'btn btn-sm', style:{ fontSize:10 }, onClick:onHideAll }, 'Hide all'),
        btn({ className:'btn btn-sm', style:{ color:'var(--text3)' }, onClick:onClose }, '✕')),
      div({ style:{ flex:1, overflowY:'auto', padding:'12px 16px' } },
        ...cats.map(c => div({ key:c, style:{ marginBottom:14 } },
          div({ style:{ fontSize:9, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 } }, c),
          div({ style:{ display:'flex', flexDirection:'column', gap:6 } },
            ...OPTIONAL_PANELS.filter(p => p.cat === c).map(row)))),
        div({ style:{ fontSize:9, color:'var(--text3)', marginTop:4, lineHeight:1.5, borderTop:'.5px solid var(--bdr)', paddingTop:10 } },
          'These are lower-traffic experiments trimmed from the sidebar to reduce clutter (Notes 24). The forecast / engineered-model diagnostic tools are always shown and are not listed here.')))
  );
}

// ── Meridian version + changelog ─────────────────────────────────────────────
const MERIDIAN_VERSION    = '4.755';
const MERIDIAN_BUILD_DATE = '2026-08-01';
if (typeof window !== 'undefined') window.__MERIDIAN_VERSION__ = MERIDIAN_VERSION;
const MERIDIAN_CHANGELOG  = [
  {version:'4.728', date:'2026-08-01', changes:[
    'Faster load / hard refresh: code-split the 11 heaviest secondary panels (EOM Dashboard, Signals, SAGE, One-Pager, SMG Voice, FOB EOM, Delivery Mix, Yearly Projections, Visit Readiness, Graded Visits, Performance Reviews) into on-demand chunks via React.lazy behind a single Suspense boundary. Initial bundle 4.2MB → 3.34MB (~555KB of panel code now loads only when a panel is opened). The home/At-a-Glance view and the Loaded Data strip (incl. Sales) stay in the eager bundle — high-priority, never deferred.',
    'Ops pull (OT source) robustness: when the Operations Report page doesn\'t fire an api.reports request (so the token listener sees nothing), the Playwright fallback now also visits the Daily Activity page to capture the same X-Auth-Token — the likely reason the pull was returning 0 rows. Refresh QSRSOFT_TOKEN or re-run the pull to repopulate qsr_labor_summary → OT.',
  ]},
  {version:'4.727', date:'2026-08-01', changes:[
    'EOM Supervisor OT: now sourced AUTO-FIRST from the Operations Report labor-summary stream (ds.opsLaborRows → overTimeTotalHours/$), device-independent, no manual upload needed; manual daily-labor upload is the fallback and manual entry still overrides. (The auto stream is currently empty because the Operations Report pull is returning 0 rows on a stale QSRSOFT_TOKEN — refresh the token and OT auto-populates with no further app change.)',
    'FOB Leadership Summary: renamed "laggards/achievers" → "Focus Stores / Top Performers" and softened the language ("ran $X over" not "burned") for an above-store-leader doc.',
  ]},
  {version:'4.725', date:'2026-08-01', changes:[
    'FOB Report FIX: the Avg FOB was averaging averages (a simple mean of per-store %s). Now DOLLAR-WEIGHTED (Σ FOB$ ÷ Σ sales) per the standing rule — small stores no longer over-count.',
    'FOB Report → new "⎙ Leadership Summary" report + an in-modal narrative for above-store leaders: the district dollar-weighted FOB vs target, and the MATH of laggards eroding achievers\' gains — "N stores under target banked $X/mo; M over target burned $Y/mo, erasing $Z of it; net the district is $ over/under target; fixing the top 3 laggards recovers $/mo." Plus laggard (with action) and achiever tables. Existing full Print retained.',
  ]},
  {version:'4.724', date:'2026-08-01', changes:[
    'Fountain-yield look-back baselines (task #52). Each store now carries a 3-month baseline of its fountain-beverage short total (mean + sd). The bib-yield check uses it: at a self-serve-tower store, a short WITHIN the store\'s norm stays an info note (structural free refills, not a loss) — but a short ABNORMALLY beyond the store\'s own baseline (≥2σ or ≥1.6×) escalates to a real flag ("check BIB connections / syrup-to-water ratios", tower or not). Notes now cite the store\'s usual $/mo. Engine src/engine/fountain-yield.js, +tests. Validated on real data (e.g. #5183 ~$1,783/mo, #3708 ~$551/mo).',
  ]},
  {version:'4.723', date:'2026-08-01', changes:[
    'FIX (crash): opening the FOB Report threw "$ is not defined" — the money formatter used by the report modal + print/CSV wasn\'t in scope (it was defined only inside the sibling FOB-Analysis modal). Declared it in the component body so both share it. FOB Report opens again.',
    'EOM "Verify & Clear" pre-close check (task #38, KB-grounded): flags deactivated/obsolete WRINs still holding inventory (submit a zero inventory / waste before close) and the same item carrying inventory under 2+ WRINs (zero the unused one — duplicate WRINs must count down to zero). Matched by DESCRIPTION, not leading digits, so items that merely share a WRIN-family prefix are NOT falsely grouped. Quiet when clean (the usual case) — a pre-close safety net. Engine src/engine/eom-verify-clear.js, +tests.',
  ]},
  {version:'4.722', date:'2026-08-01', changes:[
    'FOB Report now has ⎙ Print (→ PDF) + ⬇ CSV export, so the all-location read can drop straight into a DO/GM review — summary, ranked opportunities with their action, and the market→store tables with top item losers. Honors the standing "print/export on every EOM helper" directive.',
  ]},
  {version:'4.721', date:'2026-08-01', changes:[
    'FOB Report (Inventory Control → 📊 FOB Report) — Notes 42 #1. All-location EOM-lean read, scoped to the current filter (one / all / patch): OK/FL summary tiles, a ranked "Biggest opportunities" list, then a market → patch → store hierarchy. Each store shows FOB% vs target, month-over-month trend (▼ improving / ▲ regressing), its worst FOB components vs target, top item losers, a masking flag (large losses offset by gains — the QSRSoft Variance-Card pattern), and a plain-language action plan of easy real-work steps (e.g. "Variance Stat is the driver — audit portioning + waste-recording on [top losers]"). Engine src/engine/fob-report.js, dollar-weighted throughout, +tests. Reports the latest month with real FOB (early in a month the MTD row is all zeros, so it falls back to last completed EOM — same lesson as the count-timing work).',
  ]},
  {version:'4.720', date:'2026-08-01', changes:[
    'Count-timing artifact detection (baked in as a reusable engine, src/engine/count-timing.js). A variance % can be huge yet meaningless when a count lands early in a period — the sales denominator is tiny AND the count reconciles several days of theoretical-only drift since the item’s last physical count. New EOM-diagnosis context note fires ONLY early in a period (≈ first 10% of the month) with material loss: "counted only through day N of ~M — judge the absolute $ and trend, not the %." Stays quiet at month-end. Proven on Durant #5985: 5.60% Variance Stat = $559 loss over 1 day’s $9,979 sales = 0.086% over a full month. Ledger-verified the point-to-point model (Actual Usage = carried POS-Open beginning inv − ending count) to the unit. Shared piece for the coming all-location FOB report.',
  ]},
  {version:'4.719', date:'2026-08-01', changes:[
    'Change Monitor: new "Month-over-month" baseline toggle. Compares each item’s authoritative period variance this period vs last (QSRSoft Variance Stat), flagging improving (variance shrank toward zero / resolved off the list) vs regressing (grew / newly on the list); stores rank by most regressing → laggard detection. KB-grounded framing: variance is a point-to-point reconciliation (Actual Usage = Starting Inv + Purchases ± Transfers − Waste − Ending Inv), and each period already begins from the prior EOM’s ending count, so this compares two reconciliations rather than re-baselining.',
    'Change Monitor drill-down now shows the point-to-point anchor: a "Period start · beginning inventory (carried from last EOM)" row = the first POS Open reading, so the reconciliation window (beginning inventory → binding count = variance) is visible and verifiable right in the ledger table.',
  ]},
  {version:'4.718', date:'2026-08-01', changes:[
    'Second-Look: new "Count accumulation?" check. When a manager re-enters a full TOTAL on top of an already-submitted count while the device count-timer is still active (the app ADDS unless "Replace Count" is used), the on-hand ~doubles into a large positive overage — a likely driver of FOB worsening after counts post. Fires on a multi-entry session that nets a ≥$150 positive overage (normal area build-up nets ≈ $0, so FRIES-type counts are not flagged). Non-accusatory: recommends verifying the true on-hand and using Replace Count / recounting after the timer resets, and names the honest alternative (an un-approved purchase/transfer also reads as an overage — check receipts). KB-grounded in the Mobile Inventory App counting mechanics.',
  ]},
  {version:'4.717', date:'2026-08-01', changes:[
    'FIX (crash): Inventory Control panel threw "Cannot access before initialization" (temporal-dead-zone) — the FOB Root-Cause (riddle) memo referenced `rows` before it was declared. Moved the memo after `rows`. Panel loads again.',
    'Change Monitor v2 → SESSION model (KB-substantiated). An item is counted BY AREA (fries live in 2–3 places), and the QSRSoft app ADDS each SAVE (only "Replace Count" replaces), so one honest count is several submissions in one session — only the FINAL (BINDING) entry counts ("most recent count overrides all previous"). A "recount" now means a SEPARATE session (another day / large gap). Fixes the FRIES/#3708 case that read as "recount hurt / held worse": a −$1,103 fry-station read then +$1,106 freezer add is normal area build-up, net ≈ $0, official period variance $86 — clean, not harmful.',
    'Progression view rebuilt to read like QSRSoft Raw Item Detail: per item, the authoritative PERIOD variance (qsr_variance_stat) is the headline; expand to a table of every count session · entry (Date·Time · Counter · On-hand entered · $ impact) with the binding final marked, plus a plain-language story. "Recount hurt / held worse" fire ONLY across sessions now.',
    'Recount-swing integrity check is session-aware: a big same-day swing between area entries of ONE session is no longer flagged as padding — only genuine cross-session recounts are. Removes the false positive on normal area-by-area counting.',
  ]},
  {version:'4.716', date:'2026-08-01', changes:[
    'FOB Root-Cause Analysis modal (Inventory Control → 🔬 FOB Analysis) — the recount-impact + consistency study, in-app and scoped to the current filter (one / all / patch). ① Recount Impact ranks stores by whether their recounts move variance TOWARD $0 or AWAY (net-harmful = the coaching opportunities), expandable to the exact items that hurt. ② FOB Consistency ranks stores by month-final FOB% standard deviation (steadiest first). Full methodology shown for trust; same engine as the batch scan so numbers are verifiable to the dollar. First run confirmed #3708 / #29760 / #33704 / #10422 as net-harmful-recount opportunities and #38609 / #34222 / #43380 as the steadiest.',
  ]},
  {version:'4.715', date:'2026-08-01', changes:[
    'Change Monitor v2 — a new "📈 Progression" view (now the default) reads each item\'s variance journey straight from the raw count ledger: base count → each recount as a step (✅ moved toward zero / ⚠️ moved away / • held), the net vs base, a verdict (improved / recount hurt / held), and flags (held-worse, $0-improbable). No lock or baseline needed — works for whatever period is selected, and per-store it tallies improved vs hurt vs recounted. The old snapshot "📸 Baseline diff" stays behind the toggle. Hover any value for who/when.',
  ]},
  {version:'4.714', date:'2026-08-01', changes:[
    'Change Monitor v2 engine (Notes 41): eom-variance-progression.js — per-item variance progression from the raw ledger (base count + recount steps with improved/hurt/held direction, net movement, verdict, and flags: recount-worsened / held-worse / zero-variance). Groundwork for the ledger-derived Change Monitor. +7 tests.',
  ]},
  {version:'4.713', date:'2026-08-01', changes:[
    'Trading-day comparison foundation (P0): a new pure engine (trading-days.js) for fair partial-period comparisons. Because we run on daily pulls and sales swing by weekday, a partial range that is NOT a whole number of weeks must be compared weekday-aligned — the clean trick being a 52-week (364-day) shift that preserves the day-of-week exactly, vs a naive same-calendar-date LY. It reports whether trading-day alignment was required (partial range) or calendar was already fair (whole weeks). +6 tests. Next: wire it through vs-LY, projections pace, and movers.',
  ]},
  {version:'4.712', date:'2026-08-01', changes:[
    'Weekly Count Cadence drill-in: click any store in the cadence monitor to expand its biggest between-count variance windows — for each item, how much it moved and BETWEEN WHICH TWO COUNTS (e.g. "100% PURE BEEF moved -$430 between 07/09 and 07/16"). That brackets WHEN the product shrank/grew to a specific window, so the investigation points at the right days instead of the whole month.',
  ]},
  {version:'4.711', date:'2026-08-01', changes:[
    'Fixed SAGE FOB numbers reading near-zero. SAGE was pulling FOB from the stale/unscaled MANUAL food-cost upload AND averaging percentages; it now reads the authoritative auto qsr_fob stream and dollar-weights everything (district FOB + each component = Σ$ ÷ Σ sales), the same engine the dashboard uses. District FOB, the component breakdown, and the per-store ranking are now real, and SAGE is told these are authoritative over any uploaded file. Client-side (system-prompt context) — no redeploy needed.',
  ]},
  {version:'4.710', date:'2026-08-01', changes:[
    'Weekly Count Cadence monitor — Inventory Control → Count Cycle now surfaces, per store: the detected weekly count day ("counts Wednesdays"), the last full Food+Condiment count + days since, this window\'s weekly-vs-daily-spot session mix, and a status (On track / Overdue ≥8d / No full weekly on record) — overdue stores first. Turns Count Cycle from a progress re-skin into a real year-round count-cadence watch (feeds off the raw item history already loaded). It also denotes each store\'s weekly count day, so setting up the weekly cadence is easier.',
  ]},
  {version:'4.709', date:'2026-07-31', changes:[
    'Second-Look roll-up now condenses "Negative usage" too — it was still repeating the full "impossible… inner bags entered as full cases. Recount {item}" paragraph per item because the item name sat in the tail, breaking the shared-coaching detection. Dropped the redundant item name from the coaching (it\'s already the list label), so 11 items collapse to one coaching line + a compact list.',
  ]},
  {version:'4.708', date:'2026-07-31', changes:[
    'Renamed the EOM Dashboard → "Inventory Control" (nav + panel header). It long outgrew "EOM": it now spans counts across cadences, food-cost/FOB diagnosis, integrity forensics, waste, and shareable reports. Internal id unchanged, so nothing else is affected. Weekly/daily count monitoring plugs in here next.',
  ]},
  {version:'4.707', date:'2026-07-31', changes:[
    'Historical logging (longitudinal spine): the nightly cron now writes an eom_count_status_history row per store/period — % counted, on-time vs late timing, count duration, the COUNTER NAMES (primary + all), granted exceptions (+ who approved), integrity-flag counts + who they attribute to, and the FOB result. eom_integrity_flags also gains a person column. Backbone for recurring-pattern detection, manager accountability, and SAGE trend queries. Run the new SQL block to activate.',
    'EOM Summary header now reads "6 Locations with uncounted Food/Condiment (9 Items Total)" — location count plus the item total, on screen and in print (owner QW).',
  ]},
  {version:'4.706', date:'2026-07-31', changes:[
    'Integrity loop closed: the recount forensic scan now writes implausible padding batches to a new eom_integrity_flags table, and the Needs-Attention panel reads them — so #6838-style "8 corrections in 3 minutes" lands automatically in the one-glance triage feed, no digging. Fail-soft (panel + scan both no-op if the table isn\'t created yet). NOTE: run the eom_integrity_flags block in supabase/schema.sql to activate persistence.',
  ]},
  {version:'4.705', date:'2026-07-31', changes:[
    'Needs-Attention panel gains an Integrity category + FOB-over-target: stores over their OWN FOB target now surface (distinct from the vs-district outlier signal), granted early-count exceptions show as an Integrity awareness item, and there\'s a pass-through pipe for pre-computed integrity flags (e.g. implausible recount-swing batches from the forensic scan) so #6838-style padding signals can land in the one-glance triage feed. The panel now loads eom_count_exceptions + store FOB targets to feed these.',
  ]},
  {version:'4.704', date:'2026-07-31', changes:[
    'Second-Look roll-up is now GENERIC + consequence-aware. (1) Any repeated diagnosis condenses — not just recount swings: negative-on-hand (was 12 identical paragraphs), uom-sanity, etc. now show ONE shared coaching line + a compact item list, via automatic longest-common-coaching detection (no per-check templates). (2) A recount swing OUTSIDE the final EOM count window is labeled mid-cycle — it washes out of THIS period\'s number (opening + final count drive the P&L), so it reads as a weekly-count + process-coaching signal, not a period-binding loss. (3) Forensics scan reports pre/post net variance and flags only the true red-flag direction (a net shortage lifted toward zero to hide a loss) — which fired ZERO times in the July district scan (recounts consistently REVEAL shortages, honest direction).',
  ]},
  {version:'4.703', date:'2026-07-31', changes:[
    'Second-Look Signals roll-up: when many items share the SAME diagnosis (e.g. 14 recount swings with identical coaching), the report now shows ONE coaching block + a compact item list instead of repeating the same paragraph 14 times. Cleaner, shorter, and reads smarter. First applied to recount swings (grouped by counter + day, with the timing verdict once); generalizes to other repeated integrity signals.',
  ]},
  {version:'4.702', date:'2026-07-31', changes:[
    'Recount-swing TIMING forensics (padding detection): a recount swing is healthy when genuine, but when a store is actually short product and the loss is negated by offsetting "corrections," the tell is TIME — you can\'t physically walk the building and recount N scattered items in seconds. The recount-swing check now groups the same-manager offsetting swings per day and tests whether enough time elapsed to have recounted them (floor: ~2 min/item, so ~29 min for 14 items — owner\'s standard). If the corrections landed in a window too short, the batch escalates to HIGH with a non-accusatory note ("the N corrections landed within X min — recounting N items needs ≥ Y min — walk me through these before accepting the count"). Never false-flags a spread-out or gap-then-batch (pen-and-paper) recount. Engine eom-recount-forensics.js + district scan scripts/recount-forensics-scan.mjs.',
  ]},
  {version:'4.701', date:'2026-07-31', changes:[
    'Share links are now LIVE, not frozen: a shared EOM report opens on the as-sent snapshot instantly, then re-pulls the freshest synced data and rebuilds itself — with a 🔄 Refresh button and a "synced through / refreshed at" line. So after a GM corrects counts, they (or anyone with the link) can hit Refresh and watch FOB + the uncounted list update, no re-send. The report is rebuilt client-side with the SAME engine the dashboard uses (new shared builder eom-report-build.js); the eom-share edge function serves live rows strictly scoped to that one store+period; the frozen snapshot remains a safe fallback. Corrections appear after the next sync (noted on the page).',
  ]},
  {version:'4.700', date:'2026-07-31', changes:[
    'EOM count-timing rule (owner): Food/Condiment/Paper should be counted on the 2nd & 3rd day out from EOM — the last day is reserved for Non-Product. The diagnosis now adds a soft "📅 Count timing" coaching note when a store bulk-counted those classes on the last day (still counted, just off the ideal schedule). Completion math is unchanged — this is a coaching signal, not a gap.',
  ]},
  {version:'4.699', date:'2026-07-31', changes:[
    'EOM dashboard now dates each store by when it ACTUALLY counted, not a stray last-touch or the close date. New prog.fullCountDate = the day the bulk of items were counted (the mode); the row shows the approved early-count date (exception) if one was granted, else the bulk-count day. Fixes Ponce de Leon reading "7/31" when the real count was 07/28.',
  ]},
  {version:'4.698', date:'2026-07-31', changes:[
    'EOM diagnosis no longer declares "clean sweep" while a store is OVER its FOB target. Root cause: the Top-5 only inspected item-level Food/Condiment variance, but a FOB overage often lives in the COMPONENTS (raw waste, stat variance, condiments). Now: (1) the FOB headline names the drivers — "Driving the +0.27pp overage: Raw Waste +0.16pp ($1,842) · Stat Variance +0.09pp ($3,313)"; (2) those component levers are folded into the SAME Top-5 ranking (compete by dollars-over-target) so an over-target store always surfaces real actions — "Cut Raw Waste", "Investigate Stat Variance", "Tighten Condiments"; (3) the "🏆 clean sweep" celebration only fires when FOB is genuinely at/under target. Factored the report pipeline into one shared builder (eom-report-build.js) so the dashboard + shared link stay identical.',
  ]},
  {version:'4.697', date:'2026-07-31', changes:[
    'EOM diagnosis now flags a granted count-date exception where it matters: a store with an accepted early count gets a "⚠️ Count-date exception granted" banner near the top (dated + approver) AND the "all counted" line reads "all counted, ⚠️ via an accepted early-count exception — off standard process" instead of the plain "all counted (in the final window)". Keeps the awareness that the count was off-process traveling with the numbers, in both the on-screen report and the store message.',
  ]},
  {version:'4.696', date:'2026-07-31', changes:[
    'SAGE → 📖 Docs: a QSRSoft Help Center viewer built into SAGE. Search the vendor\'s own docs (the same 208-article corpus SAGE cites), expand any article to read it, and hit "🧠 Explain with SAGE" to hand the article to SAGE for a plain-English read against your operation. Closes the KB loop end-to-end: pulled → stored → grounds SAGE → browsable.',
  ]},
  {version:'4.695', date:'2026-07-31', changes:[
    'Waste Analysis drill-in (EOM Dashboard → 🗑 Waste): click any flagged store to expand its underlying waste events — every entry biggest-$ first (date/time, $, type, manager, EDITED flag, reason) — so a flag ("$350 session", "same $20 on 5 days") is one click from the raw evidence. Each store also gets a "🧠 Ask SAGE" button that hands SAGE the store\'s waste picture (flags + $-by-manager + largest events) and asks for non-accusatory coaching questions, weighting Food/Condiment over paper. Verify, don\'t accuse.',
  ]},
  {version:'4.694', date:'2026-07-31', changes:[
    'SAGE now grounds QSRSoft questions in the vendor\'s own docs: a new search_qsr_kb tool queries the 208-article QSRSoft Help Center corpus (auto-pulled into qsrsoft_kb) so "how does QSRSoft calculate stat variance?", "what is OEPE / R2P / KVS?", "how do I run the raw item report?" are answered from the source and cited — instead of guessed. Vendor documentation, kept separate from your live store numbers (SAGE still uses the live data tools for those).',
  ]},
  {version:'4.693', date:'2026-07-31', changes:[
    'EOM count exception now DATES the accepted count: when you grant "accepted early count", Meridian reads the store\'s items to find the day the bulk of the count actually happened (the perceived full-count date, e.g. Ponce\'s 07/28) and stamps the exception with it — the green tag now shows "✓ count accepted 07/28 · {approver}" so the count is attributed to when it really took place, not the close date.',
    'var-0 fix now flows through the Change Monitor BASELINE too: the nightly baseline auto-lock (eom-snapshot cron) reads per-item variance from the raw item ledger (posts the instant a manager submits) instead of the lagging aggregate Variance/Stat report — so both sides of the day-over-day diff use the same immediate as-counted variance the live side already uses. Re-lock a baseline to see it apply.',
  ]},
  {version:'4.689', date:'2026-07-31', changes:[
    'EOM → count-date EXCEPTIONS: accept a store\'s early count as its EOM count when an above-store leader approves it (e.g., a store that counted on the 28th and won\'t recount). "grant count exception" on the store row records who approved it + a reason; the store then reads complete and the recap stops nudging a recount, but every exception is logged + attributed (green "✓ early count accepted · {approver}" tag) so the pattern stays visible.',
    'EOM integrity checks are now named "Second-Look Signals" (non-accusatory), branded on the recap + a dedicated "verify, don\'t accuse" report section. FOB breakdown matrix colors each component vs its OWN target (red = over / green = under) with a sales-weighted Target row. QSRSoft KB pull (#41) built — crawls the help center for grounding SAGE + diagnostics.',
  ]},
  {version:'4.677', date:'2026-07-31', changes:[
    'New integrity check — HIGH-$ WASTE SESSION: flags one manager\'s waste on one day when it totals far above a typical session (distinct from the store-wide daily spike + overall per-manager share checks). Two-path, non-accusatory framing: if it was expired product pulled at once, it\'s real waste → coach ordering-to-on-hands + FIFO rotation; if not, verify it was thrown, not entered to absorb a variance.',
  ]},
  {version:'4.676', date:'2026-07-31', changes:[
    'New integrity check — RECOUNT SWING: catches a large same-day count-to-count change on one item (the "counted 24, recounted 413" overshoot) even when there are only two counts. A swing this big with no delivery between is exactly where a third count by a different manager should be required before saving — framed as "verify which count was right," never an accusation. Feeds the recap\'s soft "worth a look" note.',
    'EOM recap now lands the actual uncounted items (with $ on hand) right under the FOB line — Food/Condiment counted-early + never-counted and Paper never-counted, time/class-aware (Non-Product omitted, not due today).',
  ]},
  {version:'4.674', date:'2026-07-31', changes:[
    'EOM store messages now default to a super-abbreviated RECAP — FOB line first, then the Top-5 do-now, a one-line net-variance, and a punchy "time\'s the lever" close. It scales: a clean store collapses to a FOB line + "🏆 clean sweep — finalize." When an integrity pattern fires (uniform/inflated waste, count churn), it adds a soft, non-accusatory "worth a look together" note with the why — never an accusation. The full report is one click away ("Full report" toggle), and "Message all" copies the recap by default. Same computed numbers as the full report — they can\'t drift.',
  ]},
  {version:'4.673', date:'2026-07-31', changes:[
    'EOM → 🔒 "Lock baseline" + 📸 "Change Monitor" — freeze every store\'s full EOM state (FOB + all 6 components, per-item count qty / on-hand $ / variance / last-counted, per-class completion) into a snapshot, then watch what changes. The Change Monitor diffs the live pull against the locked baseline and, per store AND per item, shows whether a recount HELPED (variance moved toward $0 / FOB down) or HURT (moved away). Includes a district roll-up (improving vs worse, $ moved toward/away from zero) and a per-store secondary-review mark/flag. A nightly Action auto-locks the baseline at ~4:30am CT and checkpoints at 10a/4p CT.',
    'Verified the "Product Net sales off by $2.5M" report was NOT a data bug — Meridian\'s per-store Product Sales matches QSRSoft to the dollar; the gap was a scope mismatch (District EOM Summary on OK vs a QSRSoft report on ALL STORE = the 7 FL stores). Added an explicit scope subtitle to the Prod Sales tile so a scoped figure can\'t be eyeballed against an all-store total.',
  ]},
  {version:'4.660', date:'2026-07-30', changes:[
    'EOM → 📣 "Message all" — generate the EOM follow-up message for every location at once (ordered by who needs it first), each with Copy / Open / Mark-sent. Fire off follow-ups to all stores in one place.',
    'EOM → 🔍 "AI Cross-Check" — paste an external AI\'s FOB analysis (e.g. CoachQ) and Meridian reconciles it against its own real numbers: flags rows the external tool FABRICATED (its own components don\'t sum to its stated FOB$) and rows that diverge >$50 from Meridian. Meridian\'s real data is the ground truth.',
  ]},
  {version:'4.657', date:'2026-07-30', changes:[
    'EOM count timing is now class-aware: Food, Condiment AND Paper are due to 100% by EOD; Non-Product isn\'t counted until tomorrow — so it no longer holds a store below 100%, shows as "N tmrw" (muted) on the chips, and is framed as expected (not a gap) in the diagnosis. Progress %, "believes done", and the scoreboard all reflect TODAY\'s target.',
    'No more "no waste logged / verify waste" flags on Paper / Non-Product — waste is a Food/Condiment concern only. "Counted over N days" now uses each item\'s most-recent count date (a store that re-counted everything today reads 1 day). Obsolete / to-count / early tables now show On-hand qty alongside On-hand $.',
  ]},
  {version:'4.656', date:'2026-07-30', changes:[
    'Food-Cost Diagnosis rewrite — class-aware "Finish today\'s count to 100%" (Food/Condiment = real recovery, Paper = due-today completeness, Non-Product = tomorrow); Top-5 always shows 5 and CELEBRATES a clean sweep when a store has none; counted-early + obsolete items render as tables (WRIN, class, on-hand, last-counted, class-aware action). Store message now renders as an on-screen table with a safe plain-text copy.',
  ]},
  {version:'4.653', date:'2026-07-30', changes:[
    'Inventory-integrity layer complete (11 detectors): count re-entry, bulk-submit (a single dominant timestamp = travel-path skipped), waste-inflation, unrealistic-over (fries), negative-usage, negative-on-hand, UOM-sanity, phantom-transfer timing, RUBBER-BAND (padding→collapse), UNMATCHED transfers (no mirror at the sister store), and a self-serve-tower fountain-yield exemption. All in the editable diagnosis registry, framed as verify-not-accuse.',
    'EOM → 🪃 "Rubber-band" scan (padding that ran OVER for months then snapped to a big short) joins Chronic Offenders + Count Reliability. All three scans now have drill-down facts, CSV/Print, 1–2-month look-back, and a patch/operator filter. FOB % vs target + location numbers added to the dashboard.',
  ]},
  {version:'4.636', date:'2026-07-30', changes:[
    'Inventory-integrity detection (new) — the Food-Cost Diagnosis now flags COUNT MANIPULATION: more than 4 count entries for the same item on one day (2-4 is normal for travel-path counting across multiple storage locations), especially when a later entry walks the variance back toward zero — the tell-tale of a re-count to negate an unfavorable result. When the same negate move shows on 2+ items it escalates to critical (intentional, not a correction). More integrity checks (waste inflation, unrealistic over/gain) to follow.',
    'The "Top 5 — do these now" list is now focused to Food & Condiment items only (the profit-driver classes) per owner; the full all-classes analysis stays below.',
  ]},
  {version:'4.634', date:'2026-07-30', changes:[
    'EOM Dashboard → new "📊 Count Reliability" scan: grades each store (A–F) on how CONSISTENTLY it counts across a past window — a store whose same items swing wildly month-to-month (big over-count→correction reversals) is counting unreliably, which skews its numbers and risks a bad opening for next month. Real losses do NOT count against the grade. Least-reliable stores rank first, with the offending items named. Operationalizes "accuracy + consistency is king."',
  ]},
  {version:'4.633', date:'2026-07-30', changes:[
    'EOM count timing is now the LAST count date only — first→last recorded time that day, shown in H:M:S. And "Earlier-count context" is reframed as an accuracy/consistency signal (mid-cycle counts wash out of the final EOM number, which is anchored only by the opening + this EOM count) rather than recoverable dollars.',
  ]},
  {version:'4.632', date:'2026-07-30', changes:[
    'EOM Food-Cost Diagnosis: new interactive "Verify & clear" panel for obsolete/discontinued/inactive items — each shows class + on-hand $ and one-tap buttons to log the decision (✓ Counted; class-aware ✗ Wrote off for Food/Condiment or ◦ Kept-usable for non-product), tracked "X/Y decided". Persists to Supabase (no QSRSoft write-back).',
  ]},
  {version:'4.631', date:'2026-07-30', changes:[
    'SAGE "where to focus" is now class-weighted — leads with Food + Condiment and won\'t chase paper/non-product waste unless materially out of line.',
  ]},
  {version:'4.630', date:'2026-07-30', changes:[
    'EOM count-timing metric: the Food-Cost Diagnosis modal now shows when each store\'s count began→ended + total duration (from the raw-item count timestamps). Plus a class-focus note on the Reference table (Food+Condiment ~22-29% of revenue is where waste attention pays; Paper ~3-4% rarely is).',
  ]},
  {version:'4.629', date:'2026-07-30', changes:[
    'Food-Cost Diagnostics Reference — full detail now leads with Food + Condiment and breaks Paper/Non-Product into a separate section, with a Class column added. The 3/6/12 look-back selectors are labeled as months.',
  ]},
  {version:'4.628', date:'2026-07-30', changes:[
    'Chronic Offenders: fixed a store-loc format mismatch that returned "no results on any window", and the empty state now explains why (no data / only 1 period / genuinely clean).',
  ]},
  {version:'4.627', date:'2026-07-30', changes:[
    'Controls: Discount % is now cloud-fresh from the Operations Report cash-sheet (discount $ ÷ net sales), no manual upload.',
  ]},
  {version:'4.626', date:'2026-07-30', changes:[
    'EOM Dashboard modals: the close ✕ is now pinned to the top-right corner consistently.',
  ]},
  {version:'4.625', date:'2026-07-30', changes:[
    'Operations Report streams (Controls / Labor-OT / Service / sales-mix / 3 Peaks, all with LY) now load into the app, ready for tile wiring as the pull populates.',
  ]},
  {version:'4.624', date:'2026-07-30', changes:[
    'Yearly-targets file: now captures EVERY target column on the sheet (owner req), not just the speed/labor/FOB ones — Voice OSAT (5★) + Execute-as-Designed + OSAT B2B (1★) + 1-800 Contacts, Digital App % of sales + GC/R/D, McDelivery GC/R/D + wait time + star rating, Crew Staffing / Shift Leader / Manager / Total Headcount targets, and TTM Shift-Leader / 0-90 Crew / YTD Crew turnover targets. All 22 flow to ds.targets for every consumer on re-import. Also made all three pipeline paths (full rebuild + incremental + multi-sheet) use the fixed yearly parser so a re-drop lands regardless of how the file is processed.',
  ]},
  {version:'4.622', date:'2026-07-30', changes:[
    'FIXED the real reason yearly targets weren\'t landing: the yearly-targets file (a "Table 1" layout with an Index row-counter column before the Restaurant column, and a category row above the real header) was parsed as 0 stores — so NONE of the file\'s targets flowed and the app silently fell back to static defaults. The parser now anchors on the Restaurant/Loc/Store column (not the Index counter) and picks the true header row, so every yearly target the file provides — OEPE, KVS time/usage, R2P, TPPH, Labor, FOB, Voice OSAT (5★, from VOICE OSAT PACE) and OSAT B2B (1★, from Overall Satisfaction B2B) — now flows to the reviews and every other target consumer on re-import. Regression test added.',
  ]},
  {version:'4.620', date:'2026-07-30', changes:[
    'EOM Obsolete/Discontinued/Inactive guidance is now class-aware and written in terms managers use: always verify with a physical count first, then — Food/Condiment: if it won\'t be used before expiration, waste to zero to account for the balance, then deactivate the WRIN at a verified zero on-hand; Non-Product (promo / Happy Meal items / paper): count and KEEP it if usable (donation / local giveaway) — do not discard — deactivate only once genuinely used up and verified at zero. SAGE gives the same class-specific direction so it never tells a manager to discard usable non-product.',
  ]},
  {version:'4.619', date:'2026-07-30', changes:[
    'Operations Report auto-pull — groundwork: a new pull (scripts/qsrsoft-ops-pull.mjs + daily workflow) captures the whole QSRSoft Operations Report as store-level daily REST data — Controls (discount, T-Reds before/after, meals, drawer, refunds), Labor (OT hours/$, crew, needed hours), Service (CTP/OEPE/DT/MFY/KVS/RTP), channel sales mix, and the 3 Peaks — all WITH last-year values. Kills the manual Operations/Controls upload dependency. (Ingestion layer; the tile wiring lands next.)',
    'Leadership One-Pager: the OSAT B2B (1★) target now reads the effective/yearly targets (was only reading the static defaults), so the "Overall Satisfaction B2B" target from the yearly-targets file lands.',
    'EOM diagnosis: removed the unverified "QSRSoft force-zeros deactivated items ~30–45 days" phrasing (owner is verifying) — the write-off-before-close guidance stands on its own.',
  ]},
  {version:'4.618', date:'2026-07-30', changes:[
    'Leadership One-Pager (Owner→DO): the Supervisor / Patch Accountability section now pre-fills on the filled form — each supervisor with their patch\'s focus store and biggest gap (the patch\'s largest weekly $ opportunity + sales-vs-LY), leaving Committed action blank for the meeting. Maps by who RUNS the stores (live supervisor assignments — responsibility), not ownership, so a supervisor running stores they don\'t own is credited correctly.',
  ]},
  {version:'4.617', date:'2026-07-30', changes:[
    'Leadership One-Pager: the OSAT B2B (1★) target now auto-fills from the yearly-targets file\'s "Overall Satisfaction B2B" column (re-import the yearly targets to pick it up).',
  ]},
  {version:'4.616', date:'2026-07-30', changes:[
    'EOM Dashboard → new "🔁 Chronic offenders" scan: on demand, across the current location scope and a past window (3/6/12 periods), it surfaces the items that are chronically High-Variance / Loss-Forming / Fluctuating on our own pattern principles — ranked by how many stores carry the problem (a systemic/spec issue outranks a one-store fluke), with per-store drill-down and the month-over-month trail. Reads only when you click Run, scoped to your filter, so it stays light on data usage.',
    'Leadership One-Pager: added one-click "‹ Last week" and "This week" buttons next to the week picker.',
  ]},
  {version:'4.615', date:'2026-07-30', changes:[
    'KVS Time per GC now fills from the auto-pulled DAR — the report has no KVS field, but the KVS stations are the MFY make-lines, so it is computed as total MFY serve time ÷ total MFY transactions (reconciled exactly to QSRSoft\'s KVS Time Per GC column). With KVS Healthy Usage (v4.614), both KVS metrics are now cloud-fresh from the DAR and no longer depend on the manual Ops Report or the emailed Glimpse. KVS Healthy Usage measures whether a store opens the 2nd prep-table side when item volume calls for it (blank is correct when volume doesn\'t call for it — not a penalty).',
  ]},
  {version:'4.614', date:'2026-07-30', changes:[
    'Review scorecards: KVS Healthy Usage now fills from the auto-pulled DAR (healthy ÷ total order-health counts, cloud-fresh) so it no longer depends on the emailed Daily Glimpse — recent weeks populate. Voice metrics rewired per owner: "Voice OSAT" now uses the 5★ share only (rated 5 is all that counts), and "Voice B2B (Accuracy)" becomes "OSAT B2B" using the 1★ (worst-box) share where lower is better. A footnote now clarifies these Voice numbers are the latest full SMG month (monthly), not the review week. (KVS Time per GC still pending its DAR field.)',
  ]},
  {version:'4.613', date:'2026-07-30', changes:[
    'EOM Action Items now show ONE line per item: when a single product trips several checks at once, the most urgent result + action stays on the surface and the other checks, the pattern chip, and the month-over-month history all collapse into the expand — so a manager sees one clear decision per item, not several rows for the same product.',
  ]},
  {version:'4.611', date:'2026-07-30', changes:[
    'EOM Food-Cost Diagnosis now carries a Decision guide (2×2) grounded in verified fact: because QSRSoft anchors variance at the period boundary, a mid-month COUNT ERROR washes out of the monthly figure — so the report/SAGE now separate a locked, verified one-off ("drop it") from a recurring real loss ("can\'t recover this month, but fix the cause — it comes back") from an early count never re-counted at EOM ("still fixable — recount to protect next month\'s opening").',
    'Added a UOM-sanity check: a variance whose quantity is a clean whole-case multiple (the classic "3 cases entered as 3 eaches" blunder) is now flagged as verify-first — a possible units-entry error, not a confirmed loss — before it corrupts the monthly number and next month\'s baseline.',
  ]},
  {version:'4.610', date:'2026-07-30', changes:[
    'EOM Food-Cost Diagnosis Action Items now carry their own provenance: click any item to expand its month-over-month variance history (with the worst month flagged and full-case counts where known), and each item is auto-tagged with a pattern chip — Within Tolerance, High Variance, Fluctuating, Loss Pattern Forming, or Inconsistent Count(s) — so a one-off reads differently from a chronic bleeder, and a real-usage loss reads differently from a count-integrity swing. A Look-back selector (3 / 6 / 12 periods) tunes the window.',
  ]},
  {version:'4.609', date:'2026-07-30', changes:[
    'Fixed the EOM Dashboard header — the Scoreboard / EOM Count / Count Cycle toggle no longer squishes when a sync-status message appears; the controls row wraps instead.',
  ]},
  {version:'4.608', date:'2026-07-30', changes:[
    'EOM now logs each store’s count completion over time: the On-Hand pull appends a timestamped snapshot (overall % + per-class %) once per store per hour, building a trajectory of WHEN each store counts each class through the cycle — useful for coaching pace and spotting padding. A trajectory view is the follow-on.',
  ]},
  {version:'4.607', date:'2026-07-30', changes:[
    'EOM Dashboard now shows completion BY CLASS across the district — Food, Condiment, Paper, Non-Product — with Food + Condiment highlighted as the profit drivers to finish first, and Non-Product treated as a last-day class (a low % early is expected, not behind). Renamed the "Year-Round" view to "Count Cycle".',
  ]},
  {version:'4.606', date:'2026-07-30', changes:[
    'EOM Food-Cost Diagnosis: the FOB Analysis report now sits ABOVE the Action Items (reversed per owner preference — it is where the work happens), and the report now prints an itemized "To-count list" of the never-counted products a store must complete before close (not just a count) — which also flows into SAGE.',
  ]},
  {version:'4.605', date:'2026-07-29', changes:[
    'At-A-Glance Service tile now fills R2P from the auto DAR even when the manual Operations Report is stale (it was hard-wired to manual-only). Service metrics now merge field-by-field so each takes its freshest source (DAR, then Glimpse, then manual Ops). KVS Time/Healthy, DT-Parked, and Controls T-Reds/Cash-O/S still require the Operations Report / Controls upload (stopped Jul 15) — the durable fix is auto-pulling that report.',
  ]},
  {version:'4.604', date:'2026-07-29', changes:[
    'Fixed At-A-Glance Digital Sales showing 0% / "0 of 27 reporting": the tile pulled its channel breakdown (McDelivery / MOP / Kiosk) from a source that has no channel split once manual uploads stop; it now reads from the emailed Sales Ledger (which carries the channels and stays current). (Service R2P and KVS on the AAG tile are a separate known gap being worked next.)',
  ]},
  {version:'4.603', date:'2026-07-29', changes:[
    'EOM diagnosis now prints an "Obsolete / Discontinued / Inactive — verify & clear" list — the stale / likely-deactivated items carrying a residual on-hand, each with its on-hand $, last-count date, and the two-way call: present & usable → count it ($0); obsolete/gone → write off now (−$X) so you time the loss cleanly before the period locks.',
  ]},
  {version:'4.602', date:'2026-07-29', changes:[
    'One-Pager: KVS Time per GC + KVS Healthy Usage now appear on all three review forms (Organization / Patch / Restaurant), not just the store form.',
    'EOM Food-Cost Diagnosis: recount lists + the full item table now show the quantity variance expressed in full CASES (e.g. "~+3.0 cs") next to units — easier for a manager to know what to physically look for on a recount. (Uses the raw-item case size.)',
  ]},
  {version:'4.601', date:'2026-07-29', changes:[
    'EOM Food-Cost Diagnosis now shows actual-vs-standard YIELD (the over-portioning fingerprint) — e.g. "over-portioned 52% of std" — with a "Portioning watch" section listing items running below their recipe yield band, so the fix points at the station\'s portioning, not another recount. Matches the strongest part of QSRSoft CoachQ\'s report. (The variance pull already computed the yield band; it now persists it — the yield_lo/yield_hi columns backfill on the next Variance pull, and need the schema.sql snippet run once.)',
  ]},
  {version:'4.600', date:'2026-07-29', changes:[
    'EOM Food-Cost Diagnosis + SAGE now frame "uncounted" items correctly. The report has a Count-Integrity section that splits them into NEVER counted (true blanks — real recovery, count before close), counted EARLY (already counted; recount only if the count looks wrong — dollars are locked this period), and STALE / obsolete / discontinued / inactive items (verify → count if still usable, or write off before close). SAGE is told to respect this split so it never hands a GM a "go count $X of blanks" instruction unless that money is truly never-counted.',
  ]},
  {version:'4.599', date:'2026-07-29', changes:[
    'EOM uncounted-item diagnosis now explains WHY each item reads uncounted: NEVER counted (a true blank), counted EARLY this period (QSRSoft shows it counted — a cascade discussion, not free money), or STALE / prior-period (likely an obsolete / discontinued / inactive item carrying a residual on-hand). The class-chip hover shows each item\'s state + last-counted date, and the engine now separates true blanks from early/stale so value-at-risk isn\'t overstated. Resolves the "12 uncounted that QSRSoft doesn\'t flag" question.',
  ]},
  {version:'4.598', date:'2026-07-29', changes:[
    'EOM Dashboard: on-demand "↻ On-Hand" and "↻ Variance" buttons pull fresh count-progress / raw-item data right now instead of waiting for the next scheduled run. (Requires the trigger-dar-sync edge function to be redeployed with the new allowlist entries.)',
    'The scheduled intraday On-Hand pull now only runs 8am–6pm Central during the count window (managers count during the day), cutting wasted overnight pulls. A manual pull button overrides this anytime.',
  ]},
  {version:'4.597', date:'2026-07-29', changes:[
    'EOM Item Journeys now show the TIME each entry was logged next to the date (emphasized on count events), and same-day events sort by time. Seeing when a count went in — e.g. right at cutoff or re-entered late — helps spot a count that was padded or "fixed" to improve results.',
  ]},
  {version:'4.596', date:'2026-07-29', changes:[
    'SAGE tables read cleaner: numeric columns (dollars, %, seconds, counts) now right-align with tabular figures instead of everything left-aligned, so columns line up like the rest of the app\'s data tables.',
  ]},
  {version:'4.595', date:'2026-07-29', changes:[
    'EOM count progress: when a class list is ≥90% counted but not finished, hovering its chip (e.g. "F 92% ·4") now lists exactly which items are still uncounted, ranked by dollars at risk — so the store can close the last few instead of guessing. The store message already itemizes the gaps; this puts them one hover away in the dashboard.',
  ]},
  {version:'4.594', date:'2026-07-29', changes:[
    'Faster current-data load: the Daily Glimpse, Cash, Sales Ledger, Labor, Ops and Controls streams now load their pages in parallel (like the DAR summary already does) instead of one after another — the current-day sales/service/controls appear noticeably quicker after login.',
    'Fixed the At-A-Glance "stores at red model health" count mismatch (header said 1, checklist said 2): a store with no model-health score yet was being counted as red in one place; both now ignore null scores.',
  ]},
  {version:'4.593', date:'2026-07-29', changes:[
    'At-A-Glance tiles no longer get stuck "as of" the last manual-upload date. The date-window logic checked only the manual Operations Report to decide whether the selected range had data — so once manual uploads stopped, it silently fell back to a 30-day window ending on the last manual date (e.g. Jul 15), pinning Sales & Guest Counts, Service, Controls and the district morning brief to that old date even though the auto DAR / Daily Glimpse were current. It now recognizes data from the auto streams too and anchors to the freshest date across all of them.',
  ]},
  {version:'4.592', date:'2026-07-29', changes:[
    'One-Pager (Supervisor→GM store review): KVS Time per GC and KVS Healthy Usage now auto-fill from the Daily Glimpse (and manual Ops Report) with their targets, instead of KVS Healthy Usage always being blank.',
  ]},
  {version:'4.591', date:'2026-07-29', changes:[
    'Leadership One-Pager now uses the McDonald\'s work week — WEDNESDAY through Tuesday — for its weekly range and label, honoring the Week Start setting instead of assuming Monday–Sunday. The header reads "Week of {Wed date}" and the window shows the correct Wed–Tue span.',
    'Sped up the current-data load: the QSRSoft daily-activity summary (At-A-Glance + One-Pager sales/speed) now fetches its pages in parallel instead of ~39 sequential round-trips — the "took a while" delay before recent data appeared is largely gone — and tolerates a partial read (keeps the newest days) instead of failing.',
  ]},
  {version:'4.590', date:'2026-07-29', changes:[
    'Fixed the blank vs-LY on the Leadership One-Pager: Guest-Count-vs-LY in the scorecard and the "vs LY" column in District Outliers were empty because the vs-LY helper compared date-typed rows against the form\'s text date range (a type mismatch that silently dropped every day). Both now populate from the auto DAR\'s last-year figures. Added a regression test.',
    'Fixed the "Loaded Data" FOB pill showing "Invalid Date" and a doubled store count — it now parses each stream\'s date format and normalizes store numbers.',
  ]},
  {version:'4.589', date:'2026-07-29', changes:[
    'FIXED the real "data reverts to an old date" bug. At-A-Glance sales used an all-or-nothing rule: if ANY manual Operations-Report day fell in the range, it used ONLY the manual data and ignored the auto QSRSoft sync entirely — so the moment the (older) manual upload finished loading, the tile flipped from current back to the last upload date, and any range spanning that date dropped every newer day. It now merges freshest-per-day: the auto DAR fills every day, a manual upload only overrides the specific day it covers. Sales & Guest Counts, its channel mix, vs-LY, and the "as of" date now stay current.',
    'The "Loaded Data" strip now reflects the freshest date across BOTH manual and auto/emailed streams per category (Sales, Service, Controls, FOB), instead of showing only the manual-upload coverage — so it no longer reads weeks-stale while the app is actually running on current cloud data.',
  ]},
  {version:'4.588', date:'2026-07-29', changes:[
    'Extended the recent-data fix to every large cloud read: the emailed Daily-Glimpse, Cash, Sales-Ledger and the manual Labor streams now also load newest-first, so Service (OEPE/KVS), Controls, and Labor % repopulate for the current window even when a read is throttled. (The emailed pipeline was healthy the whole time — the data was being written; the app just wasn\'t reading the newest rows.)',
    'Added a "⚠ Daily data is N days stale" guard banner to the Leadership One-Pager: if the freshest sales/speed/labor date is more than 2 days behind today, the form warns you (with the newest date) instead of quietly printing incomplete numbers.',
  ]},
  {version:'4.587', date:'2026-07-29', changes:[
    'Data-integrity fix: large cloud reads (starting with the QSRSoft daily-activity summary that feeds At-A-Glance + the One-Pager forms) could silently return only PARTIAL data if a read was cut off mid-way — and because they loaded oldest-first, the missing rows were the most RECENT days, so the app quietly showed data "stuck" a couple weeks back while the live data was actually current. Reads now load newest-first (a truncated read keeps the recent days that matter) and a cut-off read now logs a loud warning instead of pretending it was complete. Note: streams fed by the emailed QSRSoft reports (KVS / cash controls / labor %) can still lag until that email pipeline is caught up — that is a separate data-refresh, not a display bug.',
  ]},
  {version:'4.586', date:'2026-07-29', changes:[
    'EOM Dashboard: counted + actively-counting locations now sort to the top of the store list in every mode (matching the Scoreboard), so the stores in play surface first.',
  ]},
  {version:'4.585', date:'2026-07-29', changes:[
    'EOM Food-Cost Diagnosis report redesigned to be manager-first: it now leads with a "👉 Focus now" short-list of the current count\'s actionable items (each with compact colour chips — SHORT/OVER $, recount-worthy, yield off?, no waste logged — and a one-line action), then a quiet, rolled-up "Earlier-count context" summarizing items whose variance is locked in from earlier counts (present, not lost, but no longer competing for attention), then systemic patterns, with the full item table + tiered breakdown kept below as reference. Same depth, far more readable.',
    'The Diagnosis Print/PDF now renders the formatted report (headings, tables, chips) instead of dumping raw markdown text — it matches the on-screen report.',
  ]},
  {version:'4.584', date:'2026-07-29', changes:[
    'EOM Full report: the Unit/Qty Variance column was showing 0.0 for every item (it read a field that only exists on journey events) — it now shows the real quantity variance from the Variance Stat report alongside the $ variance.',
    'EOM Item Journeys: the report figure is now framed as one "Variance" with clear Qty and $ sub-values, and reconciliation now confirms BOTH — a "✓ Variance matches report" when the ledger $ and quantity both tie out, or a specific "⚠ doesn\'t fully match — $ off by … / qty off by …" when they don\'t. Quantity also shows an approximate full-case count where the case size is known.',
    'EOM "Ask SAGE" now closes the EOM dashboard when it hands off, so SAGE opens in front instead of behind the dashboard (it was opening hidden underneath).',
    'Leadership One-Pager review titles renamed: Owner→DO = Organization Business Review & Checkpoint, DO→Supervisor = Patch Business Review & Checkpoint, Supervisor→GM = Restaurant Business Review & Checkpoint.',
  ]},
  {version:'4.583', date:'2026-07-29', changes:[
    'Labor % is now PUNCHED labor for every location, so Florida and Oklahoma compare like-for-like. Background: "Crew Labor %" includes Salaried Manager Labor $ where a store is configured that way (FL is; OK isn\'t), which made FL read higher than OK for the same real performance. The headline Labor % now always uses Punched Labor %, sourced auto-first from Controls → the cloud-fresh Daily Glimpse → manual labor uploads. Crew Labor % and Total Labor % are still available separately (and the Store Dashboard\'s Crew Labor % tile, which was silently blank, now populates).',
  ]},
  {version:'4.582', date:'2026-07-29', changes:[
    'Fix: the One-Pager "opportunity on the table" $ was wildly inflated (some stores showed millions/week). Root cause — current guest counts were read from a near-empty kitchen signal instead of real transactions, which blew up average check. Guest counts now use real transactions everywhere, and the guest/traffic pillar is reframed as Sales-to-Plan: the $ a store is running behind its own QSRSoft projected product sales — a bounded, sane figure that can\'t explode. Fixes the guest-count-vs-last-year actuals at the same time.',
    'Weekly Business Review form — auto-fill + polish: the Period now shows the exact calendar window (e.g. Jul 21 – Jul 27, 2026); the scorecard pre-fills the group\'s rolled-up Targets and auto-checks On-Track (Yes/No) from actual-vs-target; Guest Count vs LY, Voice OSAT and Voice B2B now populate their Actuals from live data; the signature line is labelled with the recipient\'s job title (DO / Supervisor / GM) instead of a generic "Leader"; a single-store review shows both the restaurant # AND its name; "Net Sales" is renamed "Product Sales" throughout; and a compact Discussion Checklist (People Development/Training, Promotions, Controls/Cash, Cleanliness Walkthrough, Other — each Y/N) was added to every variant. Still prints on one page.',
  ]},
  {version:'4.567', date:'2026-07-29', changes:[
    'Leadership One-Pager — Weekly Business Review: a polished, leader-led review the leader completes before each cascade discussion. It leads with last week\'s Wins, a performance scorecard (Product Sales, GC vs LY, OEPE, R2P, Labor %, FOB %, Voice OSAT + B2B — with blank Target / Actual / On-Track for the leader to fill), and closes with Commitments. The form ADAPTS to the cascade level: Owner→DO shows district outliers + opportunities + supervisor accountability; DO→Supervisor shows store-by-store + GM coaching focus; Supervisor→GM shows the store deep-dive (speed/food/labor) + a 10-line shift-manager tracker. Print to PDF, download as an editable Word (.doc), or a fully-blank fillable version. When not blank, actuals auto-fill from live data and shift-manager names pre-list for the store.',
    'New: Forms Library (🗂) — the leadership review forms catalogued by cascade level (Owner→DO / DO→Supervisor / Supervisor→GM), each with Print-blank and Word-blank actions.',
    'New: Metric Lineage (🔍) — a searchable, 100%-transparent registry of every metric that is calculated from other metrics, showing its exact formula, upstream inputs, and the source report/table so any number can be verified against source. Same registry powers the KPI info tooltip.',
    'Speed metrics decoded from the Daily Activity report and now cloud-fresh for the current day: R2P (Receipt to Print) = (fc_untilserve − fc_untilclosedrawer) ÷ fc_trans_cnt, and OEPE (Order-to-Exit) = (dt_untilserve − dt_untilstore) ÷ dt_trans_cnt — both reconciled exactly to the report, so the One-Pager\'s R2P/OEPE tiles populate intraday instead of waiting on a manual upload.',
    'One-Pager Opportunity $ now paces Guest Count vs the store\'s own QSRSoft projection (not a best-in-class store), so an industry-wide sales dip no longer inflates the guest-count opportunity. Recoverable $ are also shown as a relatable weekly figure. Added a per-location breakdown table + supervisor top/bottom-store highlights (FL→FL, OK→OK).',
    'Performance Reviews: added Department Manager + Shift Manager roles; the manager-attribution dropdown (score a DM/AM/Shift-Manager on their OWN shifts) now populates from the Shift Manager Summary data for the selected store.',
    'Fix: the End-of-Month On-Hand inventory pull was failing every run (stale browser-login path) — it now mints a fresh session each run like the variance pull, so EOM count progress flows automatically through month-end.',
  ]},
  {version:'4.556', date:'2026-07-27', changes:[
    'Precautionary hardening batch: fixed a data-completeness bug where the Daily Glimpse / Cash / Sales-Ledger loaders could silently drop the newest ~3 weeks of data on large date ranges (Supabase 1000-row cap) — At-A-Glance tiles now always see the full window. Fixed the Calendar Manager Florida/Oklahoma pills (FL pill was empty). Refreshed this version/changelog and removed stale debug logging.',
    'EOM: Item Journey visual guide (per-item count-cycle timeline with verified-fact vs likely-inference signals, qty + $ variance, reconciled exactly to the Variance Stat report, click-through flow chips), two modes (EOM count-completion + year-round progress), FOB multi-location variance matrix, and the comms draft now carries the full food-cost action plan.',
    'New: "What Needs My Attention Now" (🎯) — one ranked cross-domain triage fusing FOB outliers, behind-last-year, sync health, drive-thru speed, visit-readiness/food-safety risk, and fading saved signals.',
    'FOB Analysis is now cloud-first (works with no upload). Graded Visits shows a most-likely daypart/channel bar. EOM Supervisor exports OP Supplies per store. Signals Scanner supports multi-select bulk-tracking.',
    'Performance Reviews: named, savable, org-shared templates with hard 100%-weight enforcement, plus template-snapshot isolation so changing a template never re-scores finished reviews. (More coming: drag-reorder + editable job titles.)',
  ]},
  {version:'4.533', date:'2026-07-25', changes:[
    'Signals can now correlate against WEATHER and DAY-OF-WEEK, not just business metrics. The auto-pulled weather (high/low/avg temp, rainfall, wind) is now a metric group in the Scanner and Signal Lab — so "warmer days → more sales?" or "rain → drive-thru mix" surface automatically. Rainfall correctly keeps its dry (zero) days so it correlates real weather, not just rainy ones.',
    'New "Calendar" factors — Weekend, Friday, Monday (0/1 flags per day) — let you correlate the common-sense weekly patterns: does this store actually run hotter on weekends? Is there a Friday lift? (Friday is broken out on purpose as the anchor for the eventual Filet-O-Fish-Fridays product-mix check.) Four new seeded signals ship on: Weekend→Sales, High Temp→Sales, Rainfall→Guests, Friday→Sales.',
    'Under the hood: temperature metrics are concept-grouped (high/low/avg won\'t clutter the scanner by "correlating" with each other), and two calendar factors never pair with each other — every cross-relationship to real business metrics still surfaces, with the same effect-size + false-discovery guardrails as before.',
  ]},
  {version:'4.532', date:'2026-07-25', changes:[
    'Simple Models are now first-class across the whole forecasting engine — not just Smart Targets. The trailing-average family that beat every engineered model on store totals (T3M/T6W/T3W, the "simple wins" finding) is now a selectable forecast model ("✨ Simple") everywhere forecasts are produced: Monthly Projections, the forecast table, Forecast Accuracy, Proj-vs-Actuals, and Model Assignment. Under the hood it reuses the exact same proven math as Smart Targets (one implementation, not a copy).',
    'How it works day-to-day: Simple takes the store\'s robust trailing daily rate (3-month / 6-week / 3-week blend, most weight on recent, outlier days dropped) and shapes it to the weekday — so a single day still respects Saturday-vs-Tuesday, while a full month sums back to the exact trailing method that won. It reads only data BEFORE the day it forecasts (strictly leak-free), so any backtest win is real.',
    'Re-validation built in (per the ripple warning): the Model Assignment backtest now competes Simple head-to-head against DOW / AE / EWMA / DI on each store\'s own held-out actuals — re-run it and Simple gets auto-assigned wherever it actually wins, engineered models stay assigned where they win. Nothing was removed; every existing model is preserved. Forecast Accuracy adds a "Simple" column (+ district card) so you can see Simple vs AI vs LY MAPE side-by-side, and you can hand-pick Simple per store/horizon in Model Assignment.',
  ]},
  {version:'4.531', date:'2026-07-25', changes:[
    'Recent-window metrics fill in from the auto streams: OEPE, KVS, Labor %, TPPH and the loss-prevention numbers were showing "—" (or "-100%") on recent periods when a manual Operations Report / Controls upload hadn\'t landed yet. They now fall back to the emailed Daily Glimpse / auto DAR — so Rankings, Org Summary, and the forecast table populate on the current week instead of going blank.',
    'Under the hood (the part that keeps this from ever creeping back): all of that metric sourcing now runs through ONE shared resolver with a per-metric source-priority list — manual first, then auto — instead of each screen reading the raw data its own way. Paired with the shared vs-LY helper from earlier, this is now the single global system for where operating numbers come from; any future data-source change is one edit and every screen benefits.',
  ]},
  {version:'4.530', date:'2026-07-25', changes:[
    'Fix: the forecast table (District View + Store Analytics) left the current week\'s completed-day Actual and GC columns blank. The forecast engine read actuals from manual Operations Report uploads only, so recent days that had only auto-synced (DAR) data showed nothing. Actuals + guest counts now fall back to the auto DAR when a manual upload isn\'t present — so completed days of the current week fill in (Actual, GC, and the AI-vs-Actual variance) as the daily sync lands. (OEPE / TPPH / Labor% for past days still come from the Ops/Controls uploads.)',
  ]},
  {version:'4.529', date:'2026-07-24', changes:[
    'Under the hood: the "current vs last year" math (auto-first sourcing + matched-day comparison) is now ONE shared helper (engine/vs-ly.js) instead of being re-written separately in each panel — which is exactly why the vs-LY bug kept reappearing in different places. Org Summary and Rankings now call the shared helper; future changes are global. Covered by its own tests.',
  ]},
  {version:'4.528', date:'2026-07-24', changes:[
    'Profile menu now has "↑ Load files" — and the Load button was removed from the top bar to declutter it (Notes 27 #8). Same file-upload flow, just tucked into the avatar menu.',
    'Data Manager: the auto-synced sources (LifeLenz Schedule, QSRSoft FOB / eBOS / Daily Activity) now also carry a one-line description of what they pull and on what cadence — matching the source labels added to the manual/emailed sources (Notes 27 #9).',
  ]},
  {version:'4.527', date:'2026-07-24', changes:[
    'Fix: Visit Readiness couldn\'t see your graded visits — the Graded Visits panel loaded them into its own state, but Visit Readiness reads them from the shared data set, which was never populated. So Model Check said "0 stores with a recent visit" and the Visit Patterns section stayed hidden even though 60 visits were loaded. Graded visits now load into the shared data at startup (same Supabase source), so Visit Readiness sees them — Model Check gets real numbers, the per-store "last visit" shows, and Visit Patterns (day/daypart/channel + cadence) appears.',
  ]},
  {version:'4.526', date:'2026-07-24', changes:[
    'Fix (the real Org Summary this time): the "everyone ~-32% vs LY" was coming from the Org Summary panel\'s OWN sales/LY calc (a different code path than the one patched in v4.522). It summed the full current window for sales but the full last-year window for LY with no day-matching — so when the current period is missing its most recent days (those land in the auto DAR, not a manual Operations Report), last year looks ~30% bigger on every store. Now the current sales pull is auto-first (manual upload OR the auto-synced DAR, so recent days aren\'t missing) and vs-LY is matched-day (a day counts only when BOTH years have real sales). Applies to the Company / Org / Operator / Patch rollups and the per-store rows.',
    'Fix: the same artifact made Rankings show "-100%" on GC vs LY (current guests empty vs a full last-year). Now matched-day + auto-first (reads the DAR guest counts) — shows a true YoY or "—" when there is genuinely no comparable data.',
  ]},
  {version:'4.525', date:'2026-07-24', changes:[
    'Changelog / About footer refreshed to match reality: the architecture and data-source lines were badly out of date (they still said "single-file HTML · React 18 · IndexedDB" and, incorrectly, "all data stored locally · no cloud upload"). They now describe the real stack — Vite + React 19, Supabase cloud-first with row-level security, the auto-pull + emailed data sources — and the "Rows Validated" stat is now a live count of rows actually loaded.',
  ]},
  {version:'4.524', date:'2026-07-24', changes:[
    'Data Manager now shows where each Data Type comes from — a small source line under each row (and a hover tooltip) naming the actual report or feed behind it (e.g. Labor Analysis ← QSRSoft "Labor Analysis"/Operations Report; Daily Glimpse ← emailed QSRSoft Daily Glimpse; Daily Activity ← auto-pulled DAR). Makes it obvious what to run/upload when something is missing.',
  ]},
  {version:'4.523', date:'2026-07-24', changes:[
    'Rankings (renamed from "Store Scorecard") now ranks GROUPS too, not just stores — a new "Rank by" toggle switches between Stores, Patch, Operator, and State. Group rows are computed correctly (member rows pooled and aggregated the same way a single store is — rates as a row-mean, sales and guest counts summed, scores as the member average — never averaging pre-rolled averages), so you can see which patch or operator leads on any KPI.',
  ]},
  {version:'4.522', date:'2026-07-24', changes:[
    'Fix (systematic): the "vs LY" comparison was showing almost every store down ~26–33% — inaccurate. The shared pipeline summed the full current 4-week window for this year but last year only over whatever days happened to be in the data, so any gap in last-year coverage looked like a real ~30% decline. It now uses a matched-day comparison: a day only counts when BOTH this year and last year have real sales for it, so the two sides always span the identical calendar days (apples to apples). This corrects the Org Summary district vs-LY AND every per-store vs-LY at once. Where there genuinely isn\'t comparable last-year data, it now honestly shows "unavailable" instead of a false decline.',
  ]},
  {version:'4.521', date:'2026-07-24', changes:[
    'Visit Readiness — new "📄 Coaching report" button on each expanded store: prints (or saves to PDF) a clean one-pager you can hand or send to that store. It shows the readiness score + band, the plain-language "Why", a ranked "Recommended focus" (the specific gaps to close, biggest-impact first), the score breakdown by area, a full metric-vs-target table, and the last actual visit — in the app\'s workbook style.',
  ]},
  {version:'4.520', date:'2026-07-24', changes:[
    'Visit Readiness — new "Visit Patterns" section (bottom of the panel): a statistic tracker over your ACTUAL graded visits broken down by the known variables — day of week, daypart, weekpart, and channel (each showing count, pass-rate, and average score) — plus a per-store frequency table (how many visits, average days between them, days since the last, and pass rate). Filter by CFV / RGR / all. Surfaces patterns like "Friday lunch visits underperform" or "this store hasn\'t been visited in 90 days."',
  ]},
  {version:'4.519', date:'2026-07-24', changes:[
    'Visit Readiness — explainability & trust: expanding a store now shows a plain-language "Why" line that names the specific gaps driving its score (e.g. "At risk — the biggest gaps are OEPE at 210s vs 165s target and SMG accuracy at 92% vs 95%"). New "Model check" card at the top validates the estimate against your ACTUAL graded-visit scores — a rank-correlation + direction-match hit-rate across the stores that have had a recent CFV/RGR/EcoSure visit — so you can see whether stores rated lower really do score lower in real life (and it says plainly when there aren\'t enough visits yet to trust it).',
  ]},
  {version:'4.518', date:'2026-07-24', changes:[
    'New: Panel Manager (Admin → Panel Manager 🧩) — one place that lists every optional / experimental panel with a short description of what it does, and a switch to show or hide each one in the sidebar. Fourteen lower-traffic experiments (Record Days, Revenue, Inventory, Performance Calc, Metric Correlations, Store Compare, GM Letters, Channel Intel, DAR Analysis, Product Mix, District Lens, Anomaly Scan, Why Engine, Priority Actions) are now hidden by default to declutter the sidebar — flip any back on here anytime (your choices are remembered on this device). Nothing was deleted, and the forecast / diagnostic model tools are untouched. "Show all" / "Hide all" toggles the whole set at once.',
  ]},
  {version:'4.517', date:'2026-07-24', changes:[
    'Test Kitchen tidy-up (reversible): removed two redundant sidebar entries — "Proj Workflow" (an exact duplicate of "Projections") and "Calendar Manager" (its recurring rules already live in Events & Tags). Nothing was deleted — both panels still open and are one uncomment away from returning; the forecast/diagnostic model tools are untouched.',
  ]},
  {version:'4.516', date:'2026-07-24', changes:[
    'New "People / HR" sidebar section that groups the people-facing panels together — Performance Reviews, Visit Readiness, and Graded Visits — instead of scattering them across Performance and Analytics. Same panels, just easier to find as a set (room to grow as coaching tools are added).',
  ]},
  {version:'4.515', date:'2026-07-24', changes:[
    'New: a "Scheduling" hub under a new "Labor & Scheduling" sidebar section, merging five labor panels — Labor Analytics, Scheduling, Weekly Schedule Summary, Labor Analysis, and Employee Skills — into one place with tabs across the top (companion to the Planning hub). Each tab loads on demand, and your role controls which tabs appear. Old links still work — anything that opened e.g. Schedule Summary now opens Scheduling on that tab.',
  ]},
  {version:'4.514', date:'2026-07-24', changes:[
    'SAGE Prompt Library: the ★ Save button is now always clickable — if the box is empty it tells you why instead of looking dead (fixes "Save wasn\'t enabled"). Added a ★ Save prompt button under every SAGE answer that drops the exact question that produced it into the library. And a new "This chat\'s prompts" checklist lets you multi-select the questions you asked in a session and either save each one or combine them into a single saved prompt.',
    'At-A-Glance "Sales & Guest Counts" tile: restored the vs-LY figures that went blank on devices without a manual Operations Report upload. Guest-count vs LY now falls back to the auto DAR last-year transactions (it previously only read manual uploads), and sales vs LY also reads the emailed Sales Ledger\'s last-year column — so the tile shows real year-over-year again from the cloud streams, not just when a spreadsheet was loaded. (Channel Mix still needs the emailed Sales Ledger stream to be flowing — if that section is empty, the Sales Ledger email isn\'t landing.)',
  ]},
  {version:'4.513', date:'2026-07-24', changes:[
    'New: a single "Planning" panel that merges the five forward-looking views — Targets, Monthly Projections, Pace to Target, Yearly Projections, and Smart Targets — into one place with tabs across the top, replacing five separate sidebar entries. Same tools, less sidebar clutter, and related planning work now lives side by side. Each tab loads on demand (so opening Planning is fast and the heavy Smart-Targets backtest only runs when you click its tab). Old links still work — anything that used to jump to e.g. Smart Targets now opens Planning on that tab.',
  ]},
  {version:'4.512', date:'2026-07-24', changes:[
    'New: a profile menu (the round avatar at the top-right) that gathers the account + utility actions that used to crowd the top bar — theme (light/dark), Save session to file, Help & guide, User management, Show/Hide Test Kitchen, Change password, and Sign out — under one tap, with your email and role shown at the top. Several of these were previously unreachable on mobile.',
    'Mobile fix: the All / OK / FL location scope pills are now shown in the top bar on phones (they were desktop-only before), so you can switch state focus without a laptop. Settings (⚙) and Load (↑) stay in the bar; everything else moved into the profile menu to declutter.',
  ]},
  {version:'4.511', date:'2026-07-24', changes:[
    'New: Panel Index in the Knowledge Base (📖) — a live, plain-language map of every panel grouped like the sidebar, so you (or a new user) can see at a glance what each panel does and where a workflow lives. Open Knowledge Base → "App Guide" → Panel Index.',
  ]},
  {version:'4.510', date:'2026-07-24', changes:[
    'Data Manager Sync buttons now confirm which stream actually got triggered. If you click one source (e.g. LifeLenz Schedule) but the server starts a different sync, the toast warns you loudly instead of silently trusting it — the tell-tale sign the sync Edge Function needs a redeploy. Each toast also names the stream it dispatched.',
  ]},
  {version:'4.509', date:'2026-07-24', changes:[
    'Per-station breakdown (v4.507) now uses the verified LifeLenz shift query, so the daily sync can actually pull it. Also excludes rejected/unassigned shifts so a dropped shift no longer adds phantom hours to a station. (No visible change until the data lands after the next LifeLenz sync.)',
  ]},
  {version:'4.508', date:'2026-07-24', changes:[
    'Fix: the At-A-Glance "Sales & Guest Counts" tile showed a wildly inflated "vs LY" (e.g. +330%). Current-period sales were summed over the whole window but last-year sales only over whatever days happened to have data — so when last year covered just a fraction of the current days, the ratio exploded. vs LY (sales, guests, and avg check, district + OK/FL) is now a matched-day comparison: each store contributes only days where BOTH this year and last year have real data, so the percentages are true year-over-year again.',
    'Fix: the At-A-Glance "This Week — District Projection" table left Actual, vs LY, and Acc% blank all week. Actuals were only read from manual labor uploads; the current week\'s live numbers arrive via the auto-synced daily activity (DAR), which the projection wasn\'t reading. It now fills each completed day\'s Actual (and real last-year sales) from the auto-synced stream when a manual upload isn\'t present — so Actual/vs LY/Acc% populate as the week fills in. (Note: the header "vs LY %" can still read ~0% for stores on the adaptive-ensemble model — a separate, deeper item.)',
    'Fix: SAGE\'s 📚 Prompts library felt "dead" — nothing was clickable — whenever the SAGE composer was empty. The Save controls were gated on there being text in the composer, so with an empty composer and no saved prompts yet, everything was disabled. The modal now has its own prompt box (pre-filled from the composer when it has text): type or paste any prompt and save it directly, no composer text required.',
  ]},
  {version:'4.507', date:'2026-07-24', changes:[
    'New: per-station hours & cost breakdown in the Weekly Schedule Summary. Expand any store and, below the daily grid, you now see where its scheduled hours and labor dollars go by LifeLenz station — Drive Thru, Grill, Lobby, Maintenance, Opening, and the rest — each tagged Variable / Floor / Fixed, with shift count, regular vs overtime hours, cost, and $/hr, plus a category summary and a total row. Pulled automatically from LifeLenz (ShiftsForSchedulePeriod) into a new cloud table so it\'s the same on every device; it fills in after the daily LifeLenz sync.',
  ]},
  {version:'4.506', date:'2026-07-24', changes:[
    'Weekly Schedule Summary now shows Fixed Hours and Floor Hours as SEPARATE segments — Fixed %, Floor %, and a combined Fixed+Floor % — instead of one lumped Fixed Labor %. Each is scheduled hours in that segment ÷ total scheduled hours. Color flags apply the standard: each segment should run 10–15% (green in-band, amber outside), and the combined Fixed+Floor must stay at or under 25% of total scheduled hours (green ok, red over the cap). Applies at both the store and district level, rolled up as a true ratio of aggregate hours.',
  ]},
  {version:'4.505', date:'2026-07-24', changes:[
    'Fix: Weekly Schedule Summary labor % was reading far too high (e.g. a store showing 72% instead of ~24%). The daily labor % is an ACTUAL figure — null on future days and temporarily enormous on the current, partial day (labor has accrued but the day’s sales haven’t landed yet, so a mid-day read can be 400%+). That single partial day was dominating the weekly dollar-weighted average. Now the weekly labor % is dollar-weighted over the completed days only; future/partial/garbage days are dropped and show blank in the daily grid.',
  ]},
  {version:'4.504', date:'2026-07-24', changes:[
    'New: Weekly Schedule Summary (Operations → 🗓). The LifeLenz weekly-schedule "top section" — Labor % Sales, Sales & GC Forecast, Scheduled vs Forecast hours with the daily over/unders, Schd TPMH, Fixed Labor % — but across ALL stores at once (LifeLenz only shows one at a time), with a week stepper and per-store daily grid. Derived from the lifelenz_schedule data already synced daily — verified to reconcile to the LifeLenz screen to the penny and the minute. (The per-job hours/cost breakdown is a separate LifeLenz endpoint, not yet pulled.)',
  ]},
  {version:'4.503', date:'2026-07-24', changes:[
    'SAGE is now minimizable. Hit "—" and SAGE collapses to a floating pill (bottom-right) while the session keeps running — so you can pull up other Meridian data at the same time. The pill glows red while SAGE is thinking and green when the answer\'s ready; click it to jump back in. A matching status dot sits in the SAGE header.',
    'SAGE conversation history: every chat is archived when you start a new one, and a 🕘 History button lets you reopen or delete past conversations — so closed sessions and previous searches are always recoverable.',
  ]},
  {version:'4.502', date:'2026-07-24', changes:[
    'Fix: SAGE\'s 📚 Prompts library (and the 🐞 Log modal) opened but ignored all clicks/typing — the modals were trapped inside SAGE\'s stacking context and covered by other app layers. They now render at the top level (portal) above everything, so they\'re fully interactive.',
    'Fix: the 🐞 Log button was capturing the wrong prompt — if you\'d answered a SAGE suggestion with "Yes, please", that thin reply became the logged context. It now walks back to the actual substantive prompt and captures the last few turns of the conversation, so multi-prompt sessions log accurately.',
  ]},
  {version:'4.501', date:'2026-07-24', changes:[
    'New: Visit Readiness (Analytics → 🛡️). Estimates how each store would fare on a 2026 PACE graded visit (Customer First / Running Great Restaurants / EcoSure Food Safety) from the operational metrics you already track — so you coach the at-risk stores before the (mostly unannounced) visit lands. A 0–100 readiness score weighted Speed 35% / Accuracy 30% / Quality 20% / Leadership 15% (each metric scored against that store\'s own target), a separate Food-Safety risk flag from waste/holding proxies, per-store top risk drivers (actual vs target), and last actual visit score when available. Ranked most-at-risk first. Transparent early-warning estimate, not a predicted percentage; Cleanliness is an acknowledged data gap.',
  ]},
  {version:'4.500', date:'2026-07-24', changes:[
    'SAGE can now answer promo/discount ROI questions directly — ask "are our promos paying off?" or "is Durant\'s discounting worth it?" and it runs the same matched-day analysis as the Promo/Discount ROI panel (server-side, RBAC-scoped) and explains the verdict. (Activates after a sage-chat edge-function redeploy.)',
  ]},
  {version:'4.499', date:'2026-07-24', changes:[
    'New: Promo / Discount ROI (Operations → 🎟️). Answers "are our promos and discounts paying for themselves?" with a matched-day analysis — each store\'s promo-heavy days are compared against its promo-light days within the same weekday (controls for the weekly pattern and for running promos on slow days), and the sales/guest lift is weighed against the give-away at a configurable incremental margin. Per-store verdicts (Pays / Costs / Neutral) sorted worst-ROI first, plus a district rollup. Reads the auto-synced Daily Glimpse (promo) and Controls (discount) streams. Directional — a screen for where to dig, not a randomized trial.',
  ]},
  {version:'4.498', date:'2026-07-24', changes:[
    'Fix: the home "Sales vs Last Year" and "Guest Count vs Last Year" figures were wildly inflated (district +532%, FL +2390%) because they averaged each store\'s year-over-year % — so a brand-new store with a near-zero last-year baseline (e.g. Ponce de Leon, opened 03/2026) dominated the average. They\'re now true comp-store comparisons: dollar/guest-weighted (Σ this year − Σ last year) ÷ Σ last year, including only stores with a real prior-year baseline (last year ≥ 20% of current). New/ramping stores still count in the sales totals, just not in the vs-LY comparison. Tiles relabeled "vs LY (comp)". The Today\'s Movers strip got the same guard so a new store can no longer top it with a nonsense "+2390%".',
  ]},
  {version:'4.497', date:'2026-07-24', changes:[
    'Fix: the "This Week — District Projection" table on the home screen had its OK/FL state tags inverted — every Florida store was labeled OK and every Oklahoma store FL. Root cause was a local org-mapping helper that was backwards relative to the rest of the app (canonical: MCDOK = Oklahoma, Emerald Arches = Florida). Labels now match each store\'s real state.',
  ]},
  {version:'4.496', date:'2026-07-24', changes:[
    'Signals Scanner — smarter results: near-identical metric pairs are now suppressed (the same measure pulled from two sources — e.g. manual Sales vs cloud Sales — or the same event as count/$/%). Those always correlate ~1.0 and were crowding out the real discoveries; the scanner now surfaces genuine cross-metric relationships instead.',
  ]},
  {version:'4.495', date:'2026-07-24', changes:[
    'Signals — new 🔎 Scanner tab: auto-correlation engine that cycles every metric pair and surfaces the strongest relationships, ranked by Pearson r with a Spearman cross-check. Guardrails keep it honest — a minimum sample size, an effect-size floor, and a Benjamini–Hochberg false-discovery correction so pairs that only look strong by chance are flagged out. Results are framed as "move together," never cause-and-effect; any discovery can be one-click promoted into Signal Lab. Ships with a set of predefined "obvious" signals so the panel has value before you scan.',
    'Signals — expanded metric library: the Controls family now includes T-Reds Before AND After Total (% and count), regular cash + cashless refunds, the full promo group, discount count/$, POS override $, and cash over/short $ — plus the cryptic "Red B %" is now correctly labeled "T-Reds Before Total %". Food Cost adds Disc Coupon %.',
    'Signals — the correlation engine can now read the daily-synced cloud streams (Daily Glimpse, Cash Sheet, Sales Ledger, DAR summary), not just manual uploads, so signals compute off cloud-fresh data on every device. These appear as new "(Cloud)" metric groups.',
  ]},
  {version:'4.494', date:'2026-07-23', changes:[
    'SAGE is now RBAC-aware: what SAGE can see and recommend is scoped to each user\'s role and accessible stores. A restricted user sees their own store detail plus district totals and their rank — but never another store\'s individual figures. Owner/admin access is unchanged. (Activates after a sage-chat edge-function redeploy.)',
  ]},
  {version:'4.492', date:'2026-07-23', changes:[
    'Yearly Projections: new view that rolls the 12 official monthly sales targets into an annual picture per store — Annual Target, YTD Actual, YTD-vs-plan (current month prorated), Projected Full Year, and FY-vs-target — with OK/FL/grand subtotals and a year stepper. Nav: PLANNING → Yearly Projections.',
  ]},
  {version:'4.491', date:'2026-07-23', changes:[
    'Signals: tracking-to-plan now shows guest-count pace alongside dollar pace, with a traffic-vs-sales divergence flag — guests running ahead of sales warns of a check-average slip before it shows up in the dollars.',
  ]},
  {version:'4.490', date:'2026-07-23', changes:[
    'Pace to Target: new view — current-month MTD actual sales vs the official monthly target, with run-rate pace and % ahead/behind, plus a Store / Patch / Operator toggle. Nav: PLANNING → Pace to Target.',
  ]},
  {version:'4.489', date:'2026-07-23', changes:[
    'Smart Targets: added a FOB % metric (matching the At-A-Glance food-cost formula) and an "Apply as Official" action — per-store or all-shown — that writes the Smart number into the official monthly targets for the upcoming month, feeding Projections.',
  ]},
  {version:'4.488', date:'2026-07-23', changes:[
    'SAGE: saved-prompt library (📚 Prompts) — save, run, and schedule your go-to questions to auto-run daily or weekly, with results surfaced on a new "SAGE Scheduled Runs" At-A-Glance tile.',
  ]},
  {version:'4.487', date:'2026-07-23', changes:[
    'SAGE: every answer now has a 🐞 Log action that turns it into a tracked Task or Feature Request — auto-suggesting the destination, capturing the question + answer, and drafting a ready-to-paste troubleshooting prompt.',
  ]},
  {version:'4.486', date:'2026-07-23', changes:[
    'Smart Targets: per-store known-event adjustments — exclude one-off days (holidays, outages, remodels) from the learning window, and add a signed event delta to the target.',
  ]},
  {version:'4.485', date:'2026-07-23', changes:[
    'Labor Analysis: weekly Fixed-Labor-Hours inputs now derive automatically from the daily LifeLenz schedule (cloud-fresh on every device); a manual MBI upload only gap-fills stores the auto source doesn\'t cover. Added week navigation and an Auto/Manual source chip.',
  ]},
  {version:'4.484', date:'2026-07-23', changes:[
    'Smart Targets: added Labor % (sales-weighted) and DT Speed / OEPE (car-weighted) as target metrics, alongside Sales.',
  ]},
  {version:'4.483', date:'2026-07-23', changes:[
    'Smart Targets model: a 27-store backtest found simple trailing methods beat the engineered models for monthly store sales, so the recommended number is now the median of three simple methods (T3M/T6W/T3W · recent-3wk · 3-mo-avg). The engineered models are preserved as on-demand diagnostics, and the backtest was deepened.',
  ]},
  {version:'4.482', date:'2026-07-22', changes:[
    'New Smart Targets, Labor Analysis (Fixed-Labor-Hours), and Employee Skill Levels panels. The LifeLenz People pull is now token-independent (captures the login session\'s own token), so it no longer breaks on monthly token expiry.',
  ]},
  {version:'4.426', date:'2026-07-20', changes:[
    'Data-Refresh sprint: emailed QSRSoft reports (Sales Ledger, Daily Glimpse, Cash Sheet) now parse server-side into Supabase, so channel mix / 3PO / OEPE / KVS / controls are cloud-fresh on every device. At-A-Glance tiles use freshest-wins (manual upload overrides same-day; auto fills the gap), the FOB tile is dollar-weighted, and there\'s a "movers" strip, in-app Sync buttons, and an intraday DAR pull.',
  ]},
  {version:'4.389', date:'2026-07-09', changes:[
    'Task Queue: mobile-first panel for autonomous + manual work tracking. Two tabs — Queue (add/prioritize/status) and AI Notes (drop session context). Tier 1/2/3 safety classification, priority 🔴🟡🟢, status lifecycle. Fixed ⊕ FAB, bottom-sheet add form. Supabase-backed (tasks + session_notes tables). Nav: ANALYTICS → Task Queue.',
  ]},
  {version:'4.388', date:'2026-07-09', changes:[
    'QSRSoft field definitions: load 412 definitions from Supabase at startup (ds.qsrFieldDefs). FOBAnalysisPanel: hover any food cost category row to see QSRSoft\'s definition. SAGE: field definitions for FOB, DAR, Ops, Cash pages injected into system prompt so SAGE can explain what any metric means.',
  ]},
  {version:'4.316', date:'2026-07-05', changes:[
    'Feature Requests module: Supabase-backed panel for all users to submit ideas and vote. Pre-seeded with roadmap history (13 items). Dev mode: status changes + notes. Nav: ANALYTICS section.',
  ]},
  {version:'4.315', date:'2026-07-05', changes:[
    'Data Manager: cloud-first header, Supabase section now shows Labor/Ops/Controls/FOB/DAR operational coverage.',
  ]},
  {version:'4.314', date:'2026-07-05', changes:[
    'Org Summary: renamed from District Summary, group selector updated to Company / Org / Operator / Patch (replaces Operator / Supervisor / Market).',
  ]},
  {version:'4.313', date:'2026-07-05', changes:[
    'District grid: fix FL chip — use INV_ORG_COORDS[loc].state for FL detection (STORE_COORDS has no state field). Swap colors: FL=gold, OK=blue.',
  ]},
  {version:'4.312', date:'2026-07-05', changes:[
    'District grid: fix FL/OK org chip — now correctly uses store.state==="FL" instead of org field (FL stores defaulted to MCDOK org, causing FL stores to show gold OK chip instead of blue FL chip).',
  ]},
  {version:'4.311', date:'2026-07-05', changes:[
    'District grid StoreCard redesigned (Option A+C): 4px top accent bar (blue=FL, gold=OK), FL/OK state chip, 4-metric rows (Sales with vs-LY%, Labor, OEPE, TPPH all color-coded vs target), model health dot + label + combined score at bottom, critical/watch flag truncated at bottom.',
  ]},
  {version:'4.310', date:'2026-07-05', changes:[
    'District Priority Brief: redesigned to 4-column tile grid (Option A+C). Each store tile now has a 4px top accent bar (blue=FL, gold=OK), FL/OK state chip, 4-metric row (4W Sales, Labor%, OEPE, TPPH) with on/near/over status coloring, Ops Score, and finding sections. Panel widened to 1200px max. SMG VOICE: auto-calibrate smart targets from historical data using p75/p25 percentile engine. LifeLenz: extended schedRows load window from 90 days to 5 years for signal correlation history.',
  ]},
  {version:'4.309', date:'2026-07-04', changes:[
    'Signals: expanded from 11 to 36 correlation signals across 6 domains. New SERVICE signals: Park Rate→OEPE, Park Rate→Sales, DT Mix→OEPE, R2P Pace→Sales, Avg Check→OEPE. New LABOR signals: TPPH→Labor%, Avg Check↔TPPH (speed/ticket tradeoff), Scheduling Gap→OT Hours, Avg Wage Rate→Labor%, Guest Count→Labor% (volume leverage). New FINANCIAL/CONTROLS signals: Discount%→Sales, Drawer Opens→Cash O/S, Manual Refund→Labor%, Waste (Red B)→Food Cost%, POS Overrides→TPPH. New SALES signals: Monthly Sales→Food Cost% (leverage), TPPH→Food Cost%, Avg Check→Daily Sales. New CUSTOMER signals: Park Rate→OSAT, Avg Check→OSAT, Scheduling Gap→OSAT, Discount%→OSAT, Guest Count↔Avg Check (traffic/ticket tradeoff).',
  ]},
  {version:'4.308', date:'2026-07-04', changes:[
    'Signals: New store health exemption — stores with recentOnly flag and no DI calibration return score:null / grade:"New Store" from both modelHealthScore and computeModelHealth. At a Glance counter and red list correctly skip null-score stores.',
  ]},
  {version:'4.306', date:'2026-07-04', changes:[
    'Nav restructure: 4 named sections (DAILY / PERFORMANCE / OPERATIONS / ANALYTICS) replace the flat list. DAILY adds Daily Brief (was Morning Brief). PERFORMANCE: Org Summary (was Org Overview), Store Scorecard (was Store Rankings). OPERATIONS: Labor Analytics (was Labor). ANALYTICS section graduates Signals, SAGE, Forecast Brief (was Intel Brief), Market Intelligence (was Location Intel), District View, Store One-Pager out of Test Kitchen. STORE OPS section removed. Store Notes moved into Settings sidebar (Settings → Store Notes → Open Editor).',
  ]},
  {version:'4.305', date:'2026-07-04', changes:[
    'Signals: major enhancement — 4 new cascade chain signals (OEPE→KVS, OEPE→Sales, KVS→Sales, ScheduleGap→Sales) completing the scheduling→OEPE→KVS→Sales path. Domain tags on all 11 signals (service/labor/sales/food_cost/customer). Domain filter pills to view signals by category. Per-store selector re-runs correlation engine for a single location. Threshold labels replaced with No Effect / Within Tolerance / Out of Range taxonomy. Cascade chain banner appears when 2+ scheduling cascade signals are confirmed. normLoc() exported from insights.js for reuse.',
  ]},
  {version:'4.304', date:'2026-07-04', changes:[
    'Data Manager: added "FOB EOM Troubleshooter (per-store)" section listing the 6 QSRSoft inventory files needed per store (Contributors, On Hand, Summary, Variance Stat, Total P&L, History). Added EOM Supervisor auto-population callout showing which standard Meridian data types feed it (FOB Report → food cost, Operations Report → sales/labor, Controls → cash, Monthly Targets → projections).',
  ]},
  {version:'4.303', date:'2026-07-04', changes:[
    'EOM Supervisor: class filter picker — multi-select pill row (All / Food / Paper / Condiment / etc.) filters all four tabs and the printed report by QSRSoft inventory class. Appears only when loaded data has more than one class. Printed report header shows the active class filter.',
  ]},
  {version:'4.302', date:'2026-07-04', changes:[
    'Monthly Projections patch reports: previous month actuals now populate from the auto-synced LifeLenz schedule data (ds.schedRows) when manual labor uploads are absent — computeMonthActuals supplements laborRows with schedRows for any loc+date not already covered, preventing double-counting.',
    'Supabase persistence for fobRows, opsRows, ctrlRows, darRows: save on upload, load on startup — cloud-first cross-device sync (v4.301 code, version number correction).',
  ]},
  {version:'4.281', date:'2026-07-03', changes:[
    'SAGE AI Assistant: Claude Opus 4.8-powered advisor with access to all Meridian data. Chat with SAGE about district performance, store trends, labor opportunities, food cost, and correlation signals. Opens via 🧠 SAGE in the sidebar. Requires ANTHROPIC_API_KEY set in Supabase Edge Function secrets and deployment of the sage-chat Edge Function.',
  ]},
  {version:'4.279', date:'2026-07-03', changes:[
    'Signals: smarter empty state — when data is loaded but no patterns found, shows "No patterns detected yet" with recompute hint instead of the misleading "Upload data" prompt.',
  ]},
  {version:'4.278', date:'2026-07-03', changes:[
    'Signals: fix loc format mismatch — LifeLenz parser was padding store numbers to 7 digits ("0003708") while all other parsers use short format ("3708"), causing all cross-dataset joins to find zero pairs. Fixed parser + added normLoc() to join helpers for robustness against existing Supabase data.',
    'Signals: added console logging showing pairs/r per signal to aid diagnostics.',
  ]},
  {version:'4.276', date:'2026-07-03', changes:[
    'Service Worker: bumped cache name to mf-share-v4276 — forces all browsers to install the new SW and drop stale JS bundles (fixes Signals nav item not appearing for users on old SW).',
  ]},
  {version:'4.275', date:'2026-07-03', changes:[
    'Signals: now computed on OPFS restore (startup) in addition to file upload — panel shows data immediately after hard refresh without needing to re-upload files.',
  ]},
  {version:'4.274', date:'2026-07-03', changes:[
    'Monthly Targets: startup now loads ALL available periods from Supabase (not just the most recent month) into ds.allMonthlyTargets — persisted in OPFS so available immediately on reload. EOM Supervisor reads the correct period\'s targets directly from this index on every month change.',
    'EOM Supervisor: removed per-period Supabase round-trip on month change; period lookup is instant from allMonthlyTargets.',
  ]},
  {version:'4.273', date:'2026-07-03', changes:[
    'EOM Supervisor: fetch period-specific monthly targets from Supabase when EOM month changes — June targets load for June view even when July is the most recently loaded. All projections are strictly month-specific with no DEFAULT_TARGETS fallback.',
    'EOM Supervisor: actSales uses sum of Labor Analysis daily rows (Operations Report) as primary; FOB fallback only. actLaborPct likewise. Crew Labor % is sales-weighted average of daily rows.',
    'Guest Voice: smgVoicePerf data now persisted in OPFS blob — survives reload without waiting for async Supabase load.',
  ]},
  {version:'4.272', date:'2026-07-03', changes:[
    'EOM Supervisor: actSales and Crew Labor % now use Operations Report (Labor Analysis rows) as primary source — daily rows summed for the month — with FOB as fallback only. Fixes inflated single-day values from FOB partial data.',
  ]},
  {version:'4.271', date:'2026-07-03', changes:[
    'EOM Supervisor: fix actSales to use fobRow.sales (correct field name — prodSales/netSales were wrong); fix OT Hours and OT $ to sum all daily labor rows for the month instead of using peak-day values; fix Crew Labor % to use sales-weighted average from monthly rows when FOB does not supply it.',
    'Weather: fix persistence on reload — OPFS path now falls back to IDB when weather missing from OPFS blob (common after weather fetch predates next file upload); auto-fetch now also saves to OPFS and updates idbCoverage so Data Manager shows fresh dates immediately; removed manual Fetch All Weather button (auto-fetch handles it).',
  ]},
  {version:'4.270', date:'2026-07-03', changes:[
    'Signals: new cross-metric correlation engine. Automatically detects statistical relationships between scheduling gaps, labor, OEPE, OSAT, OT, exceptions, food cost, and DT mix. Signals panel shows r value, strength, direction, and data readiness. Reruns on every upload.',
  ]},
  {version:'4.269', date:'2026-07-02', changes:[
    'DI Calibration persistence: labor rows now saved to Supabase on every upload and merged back on startup — history survives browser cache clears and accumulates across devices. Requires the labor_rows table (run schema.sql block in Supabase SQL editor).',
  ]},
  {version:'4.268', date:'2026-07-02', changes:[
    'Monthly Targets: add 📋 Patch Sheet — vertical-layout group report matching the Excel patch sheet format. Metric rows × columns of (Next Month Target | Action Items | Current Month Actual | vs Projection | Opportunity $). Pick Supervisors or Operators, choose the group, opens printable HTML with group rollup first then individual stores.',
  ]},
  {version:'4.267', date:'2026-07-02', changes:[
    'Monthly Targets: add Flat / Operators / Supervisors group view toggle — grouped mode shows each operator or supervisor section with individual stores, a GROUP TOTAL rollup row (sales-weighted averages), and a DISTRICT TOTAL at the bottom.',
  ]},
  {version:'4.266', date:'2026-07-02', changes:[
    'Labor Analytics: fix Days column showing +1 extra day (Math.round → Math.floor on range end-time fraction).',
    'Monthly Targets: Sales column now shows full dollar amount ($xxx,xxx.xx) instead of abbreviated $xxxK.',
    'Monthly Targets: switching to a period with no Supabase data now correctly shows empty table instead of falling back to the currently-loaded month.',
    'EOM Supervisor: mtOK check now uses row-level _year/_month stamps (set by Supabase load) in addition to monthlyTargetsMeta, so projections populate even when the in-memory data came from Supabase rather than a fresh file upload.',
    'EOM Supervisor: OT Hours target in Projections row now shows "0" (target is always 0).',
    'DI Calibration: error log now shows the first stack frame alongside the error message for easier diagnosis.',
  ]},
  {version:'4.265', date:'2026-07-02', changes:[
    'Remove debug logging from SMG VOICE Performance PDF upload pipeline.',
  ]},
  {version:'4.264', date:'2026-07-02', changes:[
    'Fix: VOICE Performance PDFs dropped/loaded manually now parse and display immediately — previously fell through to "Unrecognized PDF" because only smg-voice type was handled in the PDF upload path.',
  ]},
  {version:'4.263', date:'2026-07-02', changes:[
    'SMG VOICE Performance Reports: full pipeline wired up — Gmail poller detects monthly "Voice Performance Report" emails (SMGMailMgr@whysmg.com), downloads operator PDFs, stores in Supabase. Browser auto-parses PDFs using PDF.js, extracts per-store data (DT Sat, DT Dissat, IR Sat, IR Dissat, Accuracy B2B, Quality B2B, Fries B2B, Snack Wrap B2B) for all 3 report types (Monthly / Trailing 90d / YTD), saves to new smg_voice_performance Supabase table.',
    'SMG VOICE panel: new Performance tab shows all-store ranking table with color-coded metrics, period selector (6 months), and report type toggle (Monthly / T90 / YTD). Metric columns are clickable to re-sort.',
  ]},
  {version:'4.262', date:'2026-07-02', changes:[
    'Data Manager: Daily Glimpse, Cash Sheet, and Labor Exceptions now show file count and date range after page reload — coverage derived from pending_reports table (same approach as Sales Ledger) instead of session-only in-memory rows.',
  ]},
  {version:'4.261', date:'2026-07-02', changes:[
    'Fixed "Manifest: Syntax error" appearing twice on every load — index.html had stale /meridian/ paths for the manifest, favicon, and apple-touch-icon left over from GitHub Pages era. All three now point to / (Netlify root). Deleted stale root-level manifest.webmanifest with old paths.',
    'Fixed Supabase 400 error on pending report download — the Gmail poller pipeline was also picking up manually-uploaded reports (source=manual) and trying to download them from Storage, where they don\'t exist (they\'re stored as base64 in file_data). Filter now excludes source=manual; those are correctly handled by the cross-device sync block.',
  ]},
  {version:'4.260', date:'2026-07-02', changes:[
    'Supabase persistence: user target overrides (mf_targets) now sync across devices via org_config key "app_user_targets" — load on login, push on save. EOM Supervisor manual overrides now sync per-month via org_config key "eom_manual_{y}_{m}" — fetched on month change, pushed on every field edit.',
    'AtAGlance scope fixes: weekly trend sparkline, Sales channel totals, Labor district averages, Service times, Controls percentages, and FOB averages all now correctly aggregate only the stores in the active scope (All / OK / FL) instead of the full unfiltered row set.',
    'Data Manager: SMG VOICE Comments now shows report date range instead of just a count.',
    'Performance Reviews: removed dead ORG_FULL/getOrgFull functions with hardcoded operator names — org name set via Customize → Organization.',
  ]},
  {version:'4.259', date:'2026-07-02', changes:[
    'Nav rename pass: Command Center→Home, Priority Brief→Action Items, Labor Analytics→Labor, FOB Analysis→Food Cost, FOB EOM Check→End of Month, Guest Voice→Voice (SMG), Scheduling Intel→Scheduling, District Summary→Organization Overview, Delivery Mix→3PO Delivery, Morning Brief→Daily Brief, Store KB→Store Notes, Rankings→Rankings and Dashboards, Perf Reviews→Performance Reviews.',
  ]},
  {version:'4.258', date:'2026-07-01', changes:[
    'detectType now recognises QSRSoft underscore-separated filenames (labor_analysis_daily, sales_ledger_daily, cash_sheet_extract_daily, daily_glimpse_daily, labor_exceptions_daily). Previously sales_ledger and daily_glimpse were undetected, cash_sheet fell through to the wrong type (ctrl), and labor_analysis was caught only by a fuzzy low-confidence match.',
  ]},
  {version:'4.257', date:'2026-07-01', changes:[
    'EOM Summary: OT Hours and OT $ now auto-populated from Operations Report period-summary row (manual entry still overrides). projLaborPct now checks tCrewLabor OR tLabor — fixes blank Crew Labor projection when monthly targets were loaded from Supabase (which stored tCrewLabor, not tLabor). Monthly targets + meta now persisted to OPFS alongside row data — survive refresh without Supabase round-trip.',
  ]},
  {version:'4.256', date:'2026-07-01', changes:[
    'EOM Summary data wiring fixes: actSales and actLaborPct now pulled from laborRows (Operations Report Sales sheet) when not present in FOB rows — uses the row with highest sales (period-summary totals >> single-day totals) as the monthly figure. Cash auto-population rounded to 2 decimal places (no more -363.560000000). EditCell initial value displays with 2 decimal places instead of raw float string.',
  ]},
  {version:'4.255', date:'2026-07-01', changes:[
    'Operations Report date parsing hardened: now accepts single-date filenames (was requiring 2+ dates — silently ignored "Operations Report 2026-06-30.xlsx" style names), handles MM/DD/YYYY and MM-DD-YYYY filename formats, adds month-name fallback ("June 2026 Operations Report" → uses last day of June), and validates all extracted dates before using them. Fixes bug where June 30 rows were being assigned June 29 as their date.',
  ]},
  {version:'4.254', date:'2026-07-01', changes:[
    'EOM Supervisor Summary (nav: EOM Summary): new panel that recreates the monthly supervisor patch summary in-app. Auto-populates Net Sales, Total Food Cost %, Food Over Base %, and Crew Labor % from uploaded FOB reports and Monthly Projections (tProdSales, tFOBTotal, tFOBTarget, tLabor, tOpSupply). DEFAULT_TARGETS used as fallback for sales/labor targets when QSRSoft monthly file not loaded. Yellow editable cells for Op Supplies actual, Cash +/−, OT Hours, OT Dollar, labor Transfers and Unclocked Labor — saved to localStorage per month. Filter by Supervisor, Operator, or All Stores. Patch rollup (sales-weighted %) shown at top. Printable (landscape, no chrome). Variance $ amounts calculated as (actual% − proj%) × actual sales. Total shaded boxes = FC$ + FOB$ + Labor New Total$ + OT$.',
  ]},
  {version:'4.253', date:'2026-07-01', changes:[
    'Morning Brief: food cost and SMG OSAT signals added. Brief now shows Base Food % and OSAT in each store\'s metric grid (when FOB/SMG data is loaded). Two new correlation rules — FOOD_COST_HIGH (flags ≥33% red, ≥30% amber) and SMG_OSAT_LOW (flags <65% red, <72% amber) — with full detail and coaching action. Data source coverage pills in panel header show which data types are loaded (Labor / Controls / 3 Peaks / Food Cost / SMG OSAT). Data source line in expanded store card lists FOB month and SMG month when available.',
  ]},
  {version:'4.252', date:'2026-07-01', changes:[
    'Data Manager: staleness indicators — colored dot and "Xd" age suffix on each row (green ≤3d, amber ≤10d, red 11+d). SMG FullScale shown as individual per-period rows (June 2026 · 12 stores, etc.). Delivery Mix coverage row added. Weather Data row added. Upload Files shortcut button closes the panel and opens the file picker. Staleness legend at the bottom.',
  ]},
  {version:'4.251', date:'2026-07-01', changes:[
    'Operator Summary: now driven by settings.operators / settings.supervisorGroups instead of hardcoded INV_ORG_COORDS. FOB food cost columns (Base Food % and Total Food %, sales-weighted rollup) shown when FOB data is loaded. Focus Group dropdown filters to a single operator. Sort, Group, and Focus controls collapsed to two rows.',
  ]},
  {version:'4.250', date:'2026-07-01', changes:[
    'Guest Voice FullScale: fixed three bugs — (1) parser now searches all workbook sheets for the data sheet instead of blindly taking SheetNames[0]; (2) auto-detects OSAT % column instead of hardcoded index; (3) fixed stale selPeriod and tab initialization so scores show immediately after Supabase load without requiring a manual tab click.',
  ]},
  {version:'4.249', date:'2026-07-01', changes:[
    'Scheduling Intel: Get Data panel now detects missing weeks (last 4) and shows one-click quick-select buttons for each gap — click a missing week pill to pre-fill the date range, then copy the terminal command. Red badge on Get Data button shows the count of missing weeks at a glance.',
  ]},
  {version:'4.248', date:'2026-07-01', changes:[
    'Scheduling Intel: panel-level week navigator — prev/next arrows, week pills (up to 8 most recent), date picker jump, data-loaded badge. All tabs (Opportunity, District, Store) now respect the single selected week. OpportunityReport hides its own week picker when panel controls selection.',
  ]},
  {version:'4.247', date:'2026-07-01', changes:[
    'Monthly Targets: 📧 Group Report button opens print/email-ready HTML — one section per operator group with stores, weighted rollup row, and district total. Columns: Sales target vs MTD actual, Crew Labor %, Base Food %, Total Food %, TPPH — each with target and vs-target delta. Data coverage note shows days loaded and through-date.',
    'Guest Voice: SMG FullScale filename detector now matches "Full Scale Report" (with space) in addition to fullscale/full_scale; sheet-name fallback added (Small Graph sheet = FullScale workbook). Run smg_fullscale Supabase table SQL, then re-upload FullScale file.',
  ]},
  {version:'4.246', date:'2026-07-01', changes:[
    'Beta Mode: admins can click "β" in the topbar to collapse the nav to stable-only panels (Rankings, Targets, Monthly Targets, Perf Reviews, Labor Analytics, FOB Analysis, FOB EOM Check, Guest Voice, District Summary, Store KB, Delivery Mix, Scheduling Intel, Morning Brief, Settings, Data Manager). Experimental/forecasting panels are hidden. Toggle persists in localStorage.',
    'SMG VOICE thresholds: configurable via ⚙ Thresholds button — standard, yellow band, per-metric. Color bands (green/yellow/red) applied to all table values.',
    'FOB tolerances: configurable via ⚙ Tolerances button — green = at/under target, yellow = within 0.25% over, red = beyond. Yellow band is customizable.',
  ]},
  {version:'4.245', date:'2026-06-30', changes:[
    'Monthly Projections period switching: flexible filename parsing now detects month/year from underscored names, year-first formats, and numeric patterns (April_2026, 2026-April, 04-2026, etc.) so all uploaded months save correctly to Supabase',
    'Monthly Projections panel: period dropdown now shows for any number of saved periods (was >1 only); manual 📅 picker lets you load any year/month from Supabase regardless of what is in the dropdown',
  ]},
  {version:'4.244', date:'2026-06-30', changes:[
    'Performance Review KPI inputs: OSAT, EPB2B, Labor %, turnover, retention, and food safety pct fields now accept 0–100 values (e.g. type "87.5" for 87.5% OSAT) — auto-fill and storage remain in 0–1 decimal format',
    'Monthly Projections panel (nav: Monthly Targets) — view QSRSoft-uploaded monthly targets for all stores; period selector shows all available Supabase periods; 16 target columns grouped by Sales & Labor, Food Cost, and Other Costs',
  ]},
  {version:'4.237', date:'2026-06-28', changes:[
    'Permission Engine (permissions.js): roles are now fully configurable — create custom roles with any name and level, toggle individual permissions per role, stored in Supabase org_config and synced on login. Admin Panel adds a "Roles & Permissions" tab with an accordion editor (click any role to see and toggle its 19 permission checkboxes grouped by area). Level-1 roles bypass all permission checks. Review Approve/Return/Reopen buttons now gate on the reviews.approve permission (on by default for Area Supervisor, off for Manager). Admin Panel button in topbar gates on users.manage.all permission.',
  ]},
  {version:'4.236', date:'2026-06-28', changes:[
    'Admin Panel (👤 button in topbar): in-app user management for admins — view all users, change roles (Admin/Supervisor/Manager), assign accessible store codes per user, and invite new users via magic-link email. No SQL Editor required. Role is fetched from the Supabase profile on login and threads through to the performance review approval workflow (only admins see Approve/Return buttons).',
  ]},
  {version:'4.235', date:'2026-06-28', changes:[
    'Performance Reviews — Approval Workflow: reviews now have a status lifecycle: Draft → Submitted for Review → Approved (or Returned for Revision). Each review shows a color-coded status badge in the list and in the editor header. Action buttons appear contextually: "Submit for Review" on a Draft, "Approve" and "Return for Revision" for admins reviewing a Submitted review, and "Reopen" on an Approved review. Returning a review prompts for a reason note shown inline. Submitted and Approved reviews are read-only (Save is disabled). Status filter added to review list toolbar. Full status history is stored on each review and synced to Supabase.',
  ]},
  {version:'4.234', date:'2026-06-28', changes:[
    'Performance Reviews — Score Breakdown: click any metric ▶ row to expand a full month-by-month table (Actual · Target · Deviation · Rating) for the half period. Gap hint shows how many avg rating points are needed to reach the next level and the resulting impact on the overall score. Monthly data uses all 6 half-months, showing nulls where data was not entered.',
  ]},
  {version:'4.233', date:'2026-06-28', changes:[
    'Removed all hardcoded "Murphy Family Restaurants" / "MFR" references from the codebase. Competency text now uses generic org language. Login screen subtitle is now dynamic — set your organization name in Customize → Organization. The org name persists in localStorage and appears on the login screen and in print headers.',
  ]},
  {version:'4.232', date:'2026-06-28', changes:[
    'Performance Reviews — Score Breakdown panel added to Summary tab. Expand "SCORE BREAKDOWN" to see the full step-by-step math: each scored metric\'s avg rating, weight, and contribution to its category score; category scores weighted into the Metrics total; Behavioral quarterly averages; and the final formula (Metrics×70% + Behavioral×30% = Overall). Each metric below Exceeds shows exactly how many avg rating points are needed for the next level and the resulting impact on the overall score.',
  ]},
  {version:'4.231', date:'2026-06-27', changes:[
    'Supabase integration (Stack A): added @supabase/supabase-js, AuthGate login screen (magic-link email), Supabase sync layer in review-engine.js, and Sign Out button in topbar. App runs in local-only mode when env vars are absent — no behavior change until Supabase is configured. Schema and RLS policies in supabase/schema.sql.',
  ]},
  {version:'4.230', date:'2026-06-27', changes:[
    'Performance Reviews — Competencies: each item now has an active/inactive toggle (checkbox). Inactive items are hidden from the rating UI and excluded from behavioral scoring, but keep their index so existing ratings stay intact. Also supports custom behavioral categories: use "+ Category" in Customize → Competencies to add your own categories (editable label, deletable).',
    'Performance Reviews — Weights: metric rows now show "Active" instead of "Scored" with a clearer label. Delete button (×) per metric removes it from scoring calculations (KPI data is preserved). Deactivating via checkbox excludes from scoring without removing the metric.',
    'Performance Reviews — Rating Thresholds: "Current Meaning" column now shows actual values with direction context (e.g. "4 ≥+5% · 3 ≥0% · 2 ≥-5% · 1 else") instead of generic t1/t2/t3 placeholders. Updated header explains what raising/lowering each threshold boundary does in plain English.',
    'Behavioral scoring engine updated to respect active/inactive competency flags and include custom categories in calculations.',
  ]},
  {version:'4.229', date:'2026-06-27', changes:[
    'Performance Reviews: 4 demo reviews pre-loaded — Ronald McDonald (GM/3708, Exceeds Expectations ~94%), Grimace (GM/29760, Needs Improvement ~33%), Hamburglar (AM/5985, Meets Expectations ~73%), Mayor McCheese (AS/6178 Chipley FL Emerald Arches, Below Expectations ~52%). Load via "📚 Demo Reviews" button in the review list toolbar. Data persists in localStorage alongside real reviews.',
  ]},
  {version:'4.228', date:'2026-06-27', changes:[
    'Performance Reviews: org auto-detection — stores auto-assign to McDOK (Oklahoma) or Emerald Arches (Florida) based on existing store mapping, shown in review editor header.',
    'Performance Reviews: logo upload — Customize → Logos tab stores one PNG/JPG per org in browser storage; logos embed in Print/PDF output header automatically.',
    'Performance Reviews: Help guide — "? Help" button in panel header opens a full methodology reference covering rating scale, 70/30 scoring formula, category weights, and a metric source guide (QSRSoft/SMG/Altametrics paths for every KPI).',
  ]},
  {version:'4.227', date:'2026-06-27', changes:[
    'Record Day Intelligence expanded: added Guest Count records (day/week/month), Day-of-Week records for sales and GC (best Monday ever, best Tuesday ever, etc.), KVS and R2P speed records alongside OEPE, Breakfast sales records, and Average Check records. Records now accumulate across uploads via localStorage — all-time bests persist even when uploading different date windows. New 6-tab UI: Overview (district heroes), Recent Breaks (filterable by type + window), Sales & Volume, Speed of Service, Day of Week (DOW selector + ranked leaderboard), Top Days. Reset button clears the saved all-time record history.',
  ]},
  {version:'4.225', date:'2026-06-27', changes:[
    'Record Day Intelligence: new panel (nav: Performance → Record Day Intel) that scans all uploaded data to surface all-time records per store — best day, week, and month sales plus best OEPE. Shows district-level champion stats, a chronological "recent record breakers" table (configurable 30/60/90/180-day window) with previous record comparison, a sortable all-time records grid by store, and a district top-15 days leaderboard.',
  ]},
  {version:'4.224', date:'2026-06-27', changes:[
    'Performance Reviews Phase 2: Dev Plan tab with narrative fields + structured action items; Print/PDF export via window.open()/print(); Wage section in Summary tab fully wired and editable.',
  ]},
  {version:'4.223', date:'2026-06-27', changes:[
    'Performance Reviews: full salaried management performance review system — GM, AM, AS, and OM reviews with 70/30 metrics/behavioral split, auto-populate KPIs from uploaded data, behavioral competency ratings (1-4) per quarter, quarterly/half-year score rollup, and Customize panel for editing scoring thresholds, category/metric weights, and all behavioral competency text per role. Accessible via Performance Reviews in the nav under Performance.',
  ]},
  {version:'4.222', date:'2026-06-27', changes:[
    'Channel Intelligence root cause fix: dedup merge now rescues channel sales/pct fields (bfSales, mopSales, kioskSales, delivSales, and their GC/AvgChk/PctTotal counterparts) from discarded rows into the surviving row. This fixes the case where a Labor Analysis file loaded after an Operations Report would silently overwrite the richer channel data with zeros for the same dates, causing Breakfast/MOP/Kiosk/Delivery to show 0% in Channel Intelligence and the DOW Heat-Map even though the Operations Report was present.',
  ]},
  {version:'4.221', date:'2026-06-27', changes:[
    'Location Overview Tab: redesigned as Hybrid Intelligence Panel — Context Strip (KB notes + tags + recent calendar events), Metric Vitals (5 traffic-light KPI tiles: OEPE, Labor%, TPPH, Cash O/S, Ops Score with color-coded status), Priority Findings (top 4 risk/watch items in 2-column grid), Predictive Alerts (trend alerts inline), and Charts Section (collapsed by default with ▼ Show Charts toggle)',
  ]},
  {version:'4.220', date:'2026-06-27', changes:[
    'Channel Intelligence: fixed non-DT channel data (Breakfast, MOP, Kiosk, Delivery) not displaying — added fallback to per-store % fields (bfPctTotal, mopPctTotal, etc.) when dollar-amount columns are not populated in the Operations Report Sales sheet',
    'Channel Intelligence diagnostic: warning banner now lists the exact column names Meridian looks for in the Operations Report, so column name mismatches can be identified and reported',
    'DOW Channel Heat-Map (Shift Analysis): applied same pctKey fallback so Breakfast/MOP/Kiosk/Delivery rows now appear in the heatmap when pctTotal data is available',
    'Shift Analysis guide strip: DOW Ops Metrics, OEPE Revenue Opportunity, 3 Peaks × Labor Gap, and Competitive Impact buttons now scroll to their respective sections on click (previously display-only)',
    'FOB Root-Cause Priority Matrix: swapped display order — Location (store name) now appears before Component label, matching natural priority-coaching order',
    'Base Food KPI card: removed "Theoretical cost — for reference only" label; now shows ▲/✓ vs-target comparison when tFOBBase target is available, or "No target set" when not',
    'Base Food target column: added more fallback patterns to column name matching (Base Food %, Base Food%, BaseFoodPct, Base Food Target)',
    'Channel column fallbacks: expanded patterns for Breakfast (BF Sales), MOP (MOB Sales, Mobile All Net Sales), Kiosk (KSK Sales, SOK Net Sales), Delivery (3PD All Net Sales, 3rd Party Net Sales)',
    'Print / PDF: added 🖨 Print button to Revenue Intelligence Engine, FOB Analysis, and Channel Intelligence panels',
    'Store KB: replaced free-text tag field with clickable Quick Tags organized into Performance / Management / Location / Physical / Context groups — single-click to toggle, auto-updates tag list',
    'Competitive Impact: replaced empty state (null/blank) with explanatory message directing user to Calendar to tag competition events',
  ]},
  {version:'4.219', date:'2026-06-27', changes:[
    'Fixed 3 Peaks × Labor Gap showing nothing — root cause: r.date.toISOString() called on ISO string after IDB round-trip (strings don\'t have .toISOString()). Added _toD()/_toDK() helpers; laborByDate is now built once outside the per-slice loop instead of rebuilt 3 times',
    'Fixed case where all OEPE readings are above target (was returning null for every slice, hiding the section) — now compares worst-half vs best-half OEPE days with a label explaining the split',
    'Fixed DOW Heat-Map .getDay() calls on laborRows — same date-type safety fix applied to the DOW data builder (r.date.getDay() → _toD(r.date).getDay())',
    'Fixed Competitive Impact runtime error: r.date.toISOString() on string dates in the DOW average and row-lookup code — replaced with _toDK() helper',
    'Fixed Weekly Narrative "Unable to generate narrative" — was reading settings.anthropicKey (undefined) instead of localStorage.getItem("mf_anthropic_key")',
    'Fixed FOB Root-Cause Matrix showing rollup rows (fobPct sep:true, pLFoodPct isTotal:true) — added !c.sep&&!c.isTotal filter; Base Food excluded via actionable:false',
    'Fixed District Lens Opportunity Store/Dist Average all showing — computeMetricAverages was comparing r.date (Date) against a string cutDate; fixed to compare Date objects',
    'Fixed District View blank screen — showCohorts&&cohorts?A:B parsed as showCohorts&&(cohorts?A:B); added parentheses to fix operator precedence',
    'Fixed mdToNodes is not defined crash in forecast.js InfoIcon — circular dependency prevented import from store-dash.js; defined mdToNodes inline in forecast.js',
    'Fixed (userEvents||[]).filter is not a function — userEvents is {[loc]:{[dk]:event}} object, not array; flattened with nested Object.entries loops; fixed e.date → e.evDate',
    'Weekly Narrative: added error message propagation — if API returns {error:{...}}, shows error message instead of falling through to "Unable to generate narrative"',
    'Added Predictive Alerts callout at top of Overview tab when TREND ALERT findings exist',
    'Added feature guide strip at top of Shift Analysis tab with DOW Heat-Map / OEPE Opportunity / 3 Peaks / Competitive Impact status pills',
    'Added 3 Peaks × Labor Gap cross-reference note in PeaksTab linking users to the Shift Analysis section',
  ]},
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

// ── Data Policy Banner — shown once per session, dismissed via localStorage ──
const DATA_POLICY_KEY = 'mf_data_policy_v1';
function DataPolicyBanner() {
  const isFirst = !localStorage.getItem(DATA_POLICY_KEY);
  const [show, setShow] = React.useState(isFirst);
  React.useEffect(() => {
    if (!isFirst) return;
    const t = setTimeout(() => { localStorage.setItem(DATA_POLICY_KEY, '1'); setShow(false); }, 8000);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  const dismiss = () => { localStorage.setItem(DATA_POLICY_KEY, '1'); setShow(false); };
  return React.createElement('div', {
    style: {
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 600,
      background: 'rgba(15,17,23,.97)', borderTop: '1px solid var(--bdr2)',
      padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 16,
      backdropFilter: 'blur(6px)',
    }
  },
    React.createElement('span', { style: { fontSize: 11, color: 'var(--text2)', flex: 1, lineHeight: 1.5 } },
      React.createElement('strong', { style: { color: 'var(--text)', marginRight: 4 } }, 'Data Notice:'),
      'This tool processes McDonald\'s operational data (sales, labor, food cost, customer satisfaction). ' +
      'Data is stored in Supabase (PostgreSQL) and accessed only by authorized users. ' +
      'No data is shared with third parties. See Settings → Identity for full details.'
    ),
    React.createElement('button', {
      onClick: dismiss,
      style: {
        flexShrink: 0, padding: '5px 14px', borderRadius: 5, cursor: 'pointer',
        background: 'rgba(255,255,255,.08)', color: 'var(--text2)', border: '.5px solid var(--bdr)',
        fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer',
      }
    }, 'Dismiss')
  );
}

// Content-based upload summary — shows what each batch actually parsed to, keyed
// by report type + the months detected inside the PDFs (filenames are useless
// here: SMG bakes every export as "eu065119 (N).pdf"). Surfaces received-vs-
// errored so same-name collisions (browser delivered fewer files than dropped)
// are obvious.
function UploadSummaryModal({ report, onClose }) {
  const { received, loaded, errored, skipped, lines, saveErrs } = report;
  const collision = received > loaded + (errored?.length || 0) + (skipped?.length || 0);
  const row = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,.08)', fontSize: 12 };
  return h('div', { onClick: e => { if (e.target === e.currentTarget) onClose(); },
    style: { position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 } },
    h('div', { style: { background: 'var(--bg,#0f1117)', border: '1px solid var(--bdr,rgba(255,255,255,.1))', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', padding: 22 } },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } },
        h('div', { style: { fontSize: 15, fontWeight: 800 } }, '📥 Upload summary'),
        h('button', { onClick: onClose, style: { border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', fontSize: 16 } }, '✕')),
      h('div', { style: { fontSize: 12, color: 'var(--text2)', marginBottom: 10 } },
        `Received ${received} file${received === 1 ? '' : 's'} · parsed ${loaded}`,
        errored && errored.length ? ` · ${errored.length} errored` : ''),
      collision && h('div', { style: { fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 8, padding: '8px 10px', marginBottom: 12, lineHeight: 1.5 } },
        `⚠ Fewer files were delivered than you likely selected — the browser collapsed some identically-named "eu065119 (N).pdf" files. Upload one folder (and a few files) at a time so every month lands.`),
      saveErrs && saveErrs.length ? h('div', { style: { fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '8px 10px', marginBottom: 12, lineHeight: 1.5 } },
        h('div', { style: { fontWeight: 700, marginBottom: 2 } }, '⚠ Parsed, but NOT saved to the cloud'),
        `These will vanish on reload / other devices. Cause: ${saveErrs.join('; ')}. `,
        /relation|does not exist|schema cache|find the table/i.test(saveErrs.join(' ')) ? 'Run the smg_voice_daypart SQL block in Supabase, then re-upload.' : '') : null,
      (lines || []).map((l, i) => h('div', { key: i, style: row },
        h('div', { style: { fontWeight: 600 } }, l.label, h('span', { style: { color: 'var(--text3)', fontWeight: 400 } }, `  ·  ${l.files} file${l.files === 1 ? '' : 's'}`)),
        h('div', { style: { color: 'var(--text3)', textAlign: 'right', maxWidth: 220 } }, l.months && l.months.length ? l.months.join(', ') : '—'))),
      skipped && skipped.length ? h('div', { style: { fontSize: 11, color: 'var(--text3)', marginTop: 10 } }, `Skipped ${skipped.length} period-summary file(s).`) : null,
      errored && errored.length ? h('div', { style: { fontSize: 11, color: '#f87171', marginTop: 6, lineHeight: 1.5 } },
        h('div', { style: { fontWeight: 700, marginBottom: 2 } }, `Could not read ${errored.length} file(s):`),
        errored.map((e, i) => h('div', { key: i, style: { marginTop: 4 } },
          `${typeof e === 'string' ? e : e.name}`,
          (e && e.msg) ? h('span', { style: { color: 'var(--text3)' } }, ` — ${e.msg}`) : null,
          (e && e.stack) ? h('div', { style: { color: 'var(--text3)', fontSize: 9, fontFamily: 'monospace', marginTop: 1, wordBreak: 'break-all' } }, e.stack) : null))) : null,
      h('div', { style: { marginTop: 16, textAlign: 'right' } },
        h('button', { onClick: onClose, style: { padding: '7px 16px', borderRadius: 8, border: '1px solid var(--bdr)', background: 'var(--accent,#f5bc00)', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 12 } }, 'Done')),
    ),
  );
}

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
  // Keep the live org singletons (constants.js) in sync with settings so panels that don't
  // receive `settings` (DT Speed, Skills Matrix, Graded Visits) reflect an org edit immediately
  // + cross-device. supervisorGroups() derives from the effective-dated assignments timeline;
  // if none is saved yet, seed it from the flat supervisorGroups map (equivalent, open-start).
  useEffect(()=>{
    setLiveSupervisorGroups(settings?.supervisorGroups);
    const a = (settings?.orgAssignments && settings.orgAssignments.length)
      ? settings.orgAssignments : seedAssignmentsFromGroups(settings?.supervisorGroups);
    setLiveAssignments(a);
  },[settings]);
  // Open SAGE on demand (e.g. the EOM diagnosis "Ask SAGE" button seeds window.__MF_SAGE_SEED__).
  useEffect(()=>{ const h=()=>setShowSage(true); window.addEventListener('mf:open-sage',h); return ()=>window.removeEventListener('mf:open-sage',h); },[]);
  const [userEvents, setUserEvents]= useState(()=>{try{return JSON.parse(localStorage.getItem('mf_events')||'{}');}catch{return {};}});
  const [showSettings, setShowSettings]= useState(false);
  const [showRanking, setShowRanking]  = useState(false);
  const [rankingDefault, setRankingDefault] = useState('score');
  const [showTargets, setShowTargets]  = useState(false);
  const [showUnifiedTargets, setShowUnifiedTargets] = useState(false);
  const [showPlanningHub, setShowPlanningHub] = useState(false);   // Notes 24 Planning hub
  const [planningTab, setPlanningTab] = useState('targets');
  const [showSchedHub, setShowSchedHub] = useState(false);         // Notes 24 Scheduling hub
  const [schedTab, setSchedTab] = useState('scheduling');
  const [showPanelManager, setShowPanelManager] = useState(false); // Notes 24 Panel Manager
  const [panelVis, setPanelVis] = useState(loadPanelVis);          // {id:bool} optional-panel visibility
  const togglePanelVis = (id) => setPanelVis(v => { const n = { ...v, [id]: !v[id] }; savePanelVis(n); return n; });
  const setAllPanelVis = (on) => setPanelVis(() => { const n = {}; OPTIONAL_PANELS.forEach(p => { n[p.id] = on; }); savePanelVis(n); return n; });
  const [showPerfCalc,    setShowPerfCalc]    = useState(false);
  const [showCorrExplorer,setShowCorrExplorer]= useState(false);
  const [showDistrictLens,setShowDistrictLens]= useState(false);
  const [showModelAssign, setShowModelAssign] = useState(false);
  const [showOnePager,    setShowOnePager]    = useState(false);
  const [showGMBrief,     setShowGMBrief]     = useState(false);
  const [idbCoverage,     setIdbCoverage]     = useState(null);
  const [showDataManager,    setShowDataManager]    = useState(false);
  const [showStoreVlhConfig, setShowStoreVlhConfig] = useState(false);
  const [showLFZGap,      setShowLFZGap]      = useState(false);
  const [showDARDaypart,  setShowDARDaypart]  = useState(false);
  const [showPMix,        setShowPMix]        = useState(false);
  const [showEvents, setShowEvents]    = useState(false);
  const [showCalendarManager, setShowCalendarManager] = useState(false);
  const [showWhyEngine, setShowWhyEngine] = useState(false);
  const [showChannelIntel, setShowChannelIntel] = useState(false);
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
  const [showEOMSummary,   setShowEOMSummary]   = useState(false); // EOM Supervisor Summary
  const [showEOMDash,      setShowEOMDash]      = useState(false); // EOM Dashboard (count progress + FOB)
  const [showAbout, setShowAbout] = useState(false); // About/Changelog modal
  const [showPVSA,     setShowPVSA]    = useState(false);
  const [showPace,     setShowPace]    = useState(false); // Pace to Target
  const [showYearly,   setShowYearly]  = useState(false); // Yearly Projections
  const [showPromoRoi, setShowPromoRoi]= useState(false); // Promo / Discount ROI
  const [showVisitReady,setShowVisitReady]=useState(false); // Visit Readiness
  const [showSchedSum,  setShowSchedSum]  =useState(false); // Weekly Schedule Summary
  const [showDICompare,setShowDICompare]= useState(false);
  const [showHelp,     setShowHelp]    = useState(false);
  const [showTutorial, setShowTutorial] = useState(() => shouldShowTutorial());
  const [briefScope,   setBriefScope]  = useState({scope:'district',label:'District'});
  const [lockedProjections, setLockedProjections] = useState(()=>{
    try{return JSON.parse(localStorage.getItem('mf_locked_projections')||'{}');}catch{return {};}
  });
  const saveLockedProjections = useCallback((next)=>{
    setLockedProjections(next);
    try{localStorage.setItem('mf_locked_projections',JSON.stringify(next));}catch{}
    saveUserSetting('locked_projections', next).catch(()=>{});
  },[]);
  const [anomFilter, setAnomFilter]    = useState('all');
  const [showAttention, setShowAttention] = useState(false);
  const [showPriorities, setShowPriorities] = useState(false);
  const [showFormsPrint, setShowFormsPrint] = useState(false);
  const [showLeaderOnePager, setShowLeaderOnePager] = useState(false);
  const [showMetricLineage, setShowMetricLineage] = useState(false);
  const [showFormsLibrary, setShowFormsLibrary] = useState(false);
  const [showKB, setShowKB] = useState(false);
  const [showSmartTargets, setShowSmartTargets] = useState(false);
  const [showLocIntel,     setShowLocIntel]     = useState(false);
  const [showInventory,    setShowInventory]    = useState(false);
  const [showFOB,             setShowFOB]             = useState(false);
  const [showFOBEOM,          setShowFOBEOM]          = useState(false);
  const [showSMGVoice,        setShowSMGVoice]        = useState(false);
  const [showLaborAnalytics,  setShowLaborAnalytics]  = useState(false);
  const [showPerfReviews,     setShowPerfReviews]     = useState(false);
  const [showRecordDay,       setShowRecordDay]       = useState(false);
  const [showAdminPanel,      setShowAdminPanel]      = useState(false);
  const [showDeliveryMix,     setShowDeliveryMix]     = useState(false);
  const [showScheduling,      setShowScheduling]      = useState(false);
  const [userRole,            setUserRole]            = useState('admin');
  const [orgRoles,            setOrgRoles]            = useState(() => getOrgRoles());
  const [betaMode,            setBetaMode]            = useState(()=>{try{return JSON.parse(localStorage.getItem('mf_beta_mode')||'false');}catch{return false;}});
  const toggleBetaMode = React.useCallback(()=>setBetaMode(v=>{const nv=!v;try{localStorage.setItem('mf_beta_mode',JSON.stringify(nv));}catch{}return nv;}),[]);
  const [showOperatorSummary,   setShowOperatorSummary]   = useState(false);
  const [showMonthlyProj,       setShowMonthlyProj]       = useState(false);
  const [showPriorityBrief,   setShowPriorityBrief]   = useState(false);
  const [showSignals,         setShowSignals]         = useState(false);
  const [showSmartTargetsV2,  setShowSmartTargetsV2]  = useState(false);
  const [showLaborAnalysis,   setShowLaborAnalysis]   = useState(false);
  const [showSkillsMatrix,    setShowSkillsMatrix]    = useState(false);
  const [signals,             setSignals]             = useState([]);
  const [darRows,             setDarRows]             = useState([]);
  const darFetchRef = useRef({ date: '', ts: 0 });
  const [customSignalDefs,    setCustomSignalDefs]    = useState([]);
  const [showSage,            setShowSage]            = useState(false);
  const [sageMin,             setSageMin]             = useState(false); // SAGE minimized to a floating pill (session keeps running)
  const [sageBusy,            setSageBusy]            = useState(false); // SAGE is streaming/thinking (drives the pill's red/green light)
  const [showFeatureRequests, setShowFeatureRequests] = useState(false);
  const [showTaskQueue,       setShowTaskQueue]       = useState(false);
  const [showStoreKB,         setShowStoreKB]         = useState(false);
  const [showFcstRef,         setShowFcstRef]         = useState(false);
  const [showFcstAccuracy, setShowFcstAccuracy] = useState(false);
  const [showDtSoS,       setShowDtSoS]       = useState(false);
  const [showGradedVisits, setShowGradedVisits] = useState(false);
  const [userTargets, setUserTargets]  = useState(()=>{try{return JSON.parse(localStorage.getItem('mf_targets')||'{}');}catch{return {};}});
  const [loadMsg, setLoadMsg]          = useState(null);
  const [uploadReport, setUploadReport]= useState(null); // per-batch content summary
  const [isDragging, setIsDragging]    = useState(false);
  const dragCounter                    = useRef(0);
  const [sessionRestoring, setSessionRestoring] = useState(false);

  // Auto-migrate flat targets → v2 on startup

  const performFullIDBRestore = async () => {
    setSessionRestoring(true);
    setLoadMsg('⏳ Loading stored data...');
    try{
      const {labor,ops,ctrl,fob,audit,peaks,dar,weather,pmix,records,glimpse,cash,exceptions,monthlyTargets:_opfsTargets,monthlyTargetsMeta:_opfsTargetsMeta,allMonthlyTargets:_opfsAllTargets,smgVoicePerf:_opfsVoicePerf} = await loadDsFromIDB();
      await new Promise(r=>setTimeout(r,0)); // yield — break IDB message-handler chain
      const total = labor.length+ops.length+ctrl.length;
      if(total>0){
        const bIdx=(rows)=>{const idx={};for(const r of rows){if(!r.loc||!r.date)continue;const k=r.loc+'_'+dKey(r.date);if(!idx[k])idx[k]=[];idx[k].push(r);}return idx;};
        const lastAct={};
        for(const r of labor){if(r.sales>0&&!r.isPeriodSummary){if(!lastAct[r.loc]||r.date>lastAct[r.loc])lastAct[r.loc]=r.date;}}
        // Rebuild the weather date-index from restored weatherRows. This path used
        // to leave wxByDate empty, which silently killed Market Intelligence weather
        // correlations after a cold-start restore (data present, lookup empty).
        const wxIdx={};
        for(const r of (weather||[])){if(!r.date)continue;const _dk=dKey(r.date);
          if(r.loc)wxIdx[String(r.loc)+'_'+_dk]=r; if(!wxIdx[_dk])wxIdx[_dk]=r;}
        const restoredDs={
          laborRows:labor, opsRows:ops, ctrlRows:ctrl,
          fobRows:fob, auditRows:audit,
          peaksSvcRows:peaks.filter(r=>r._peakSvc===true||(r._peakSvc==null&&r.oepe!==undefined)), peaksSalesRows:peaks.filter(r=>r._peakSvc===false||(r._peakSvc==null&&r.netSales!==undefined)),
          darRows:dar,
          pmixData:pmix||{}, weatherRows:weather||[], trendsRows:[], inventoryRows:[], records:records||{},
          glimpseRows:glimpse||[], cashRows:cash||[], exceptionRows:exceptions||[],
          targets:{}, monthlyTargets:_opfsTargets||{}, monthlyTargetsMeta:_opfsTargetsMeta||null, allMonthlyTargets:_opfsAllTargets||{}, smgVoicePerf:_opfsVoicePerf||[], loaded:labor.length>0,
          laborIdx:bIdx(labor), opsIdx:bIdx(ops), ctrlIdx:bIdx(ctrl),
          laborByLoc:bLocIdx(labor), opsByLoc:bLocIdx(ops), ctrlByLoc:bLocIdx(ctrl), darByLoc:bLocIdx(dar),
          weatherIdx:bIdx(weather||[]), wxByDate:wxIdx,
          storeIds:[...new Set(labor.map(r=>r.loc))].sort(),
          lastActual:lastAct,
        };
        if(audit.length>0) try{restoredDs.empRisk=analyzeRegisterAudit(audit);}catch(e){}
        // Compute non-React side-effects synchronously before the transition
        let _taggedEvents=null,_autoTaggedCount=0;
        try{
          const _existingEvents=JSON.parse(localStorage.getItem('mf_events')||'{}');
          ({events:_taggedEvents,tagged:_autoTaggedCount}=autoTagHolidays(restoredDs.laborRows,_existingEvents));
          if(_autoTaggedCount>0) localStorage.setItem('mf_events',JSON.stringify(_taggedEvents));
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
        // Wrap expensive render in startTransition — React 18 time-slices into
        // 5ms chunks so no single message handler exceeds the violation threshold.
        React.startTransition(()=>{
          setDs(restoredDs);
          if(_autoTaggedCount>0) setUserEvents(_taggedEvents);
          try { setSignals(computeInsights(restoredDs)); } catch(e) { console.warn('[insights] restore compute failed:', e); }
        });
      } else {
        // No local IDB data (fresh install / PWA cold start / storage cleared).
        // Initialize ds to an empty shell so the Supabase startup loads below can
        // populate it — without this, every setDs(prev=>{if(!prev)return prev;...})
        // guard silently drops cloud data when prev is null.
        // loaded:false is correct — file-based data gates still show "no data" state.
        setDs({
          laborRows:[], opsRows:[], ctrlRows:[], fobRows:[], auditRows:[],
          peaksSvcRows:[], peaksSalesRows:[], darRows:[],
          pmixData:{}, weatherRows:[], trendsRows:[], inventoryRows:[], records:{},
          glimpseRows:[], cashRows:[], exceptionRows:[],
          targets:{}, monthlyTargets:{}, monthlyTargetsMeta:null, allMonthlyTargets:{},
          smgVoicePerf:[], loaded:false,
          laborIdx:{}, opsIdx:{}, ctrlIdx:{},
          laborByLoc:{}, opsByLoc:{}, ctrlByLoc:{}, darByLoc:{},
          weatherIdx:{}, wxByDate:{}, storeIds:[], lastActual:{},
        });
        setLoadMsg(null);
        console.log('[Meridian] No IDB data — initialized empty ds; Supabase loads will populate');
      }
    }catch(e){
      console.warn('IDB restore failed:',e);
      // Also initialize empty shell on error so Supabase loads can still run.
      setDs({
        laborRows:[], opsRows:[], ctrlRows:[], fobRows:[], auditRows:[],
        peaksSvcRows:[], peaksSalesRows:[], darRows:[],
        pmixData:{}, weatherRows:[], trendsRows:[], inventoryRows:[], records:{},
        glimpseRows:[], cashRows:[], exceptionRows:[],
        targets:{}, monthlyTargets:{}, monthlyTargetsMeta:null, allMonthlyTargets:{},
        smgVoicePerf:[], loaded:false,
        laborIdx:{}, opsIdx:{}, ctrlIdx:{},
        laborByLoc:{}, opsByLoc:{}, ctrlByLoc:{}, darByLoc:{},
        weatherIdx:{}, wxByDate:{}, storeIds:[], lastActual:{},
      });
      setLoadMsg('❌ Auto-restore failed — load data via Upload');
      setTimeout(()=>setLoadMsg(null),8000);
    }
    setSessionRestoring(false);
  };

  React.useEffect(()=>{ performFullIDBRestore(); },[]);

  // ── Daily Activity (qsr_daily_activity) — shared, auto-refreshed ─────────
  // Fetches today's rows once, re-fetches when tab regains focus or user
  // interacts after 30 min of inactivity. All consumers (Morning Brief,
  // Today's Pace card, Live Ops) share this data so one refresh covers all.
  const STALE_MS = 30 * 60 * 1000;
  const refreshDar = useCallback(async (targetDate) => {
    if (!supabase) return;
    const dt = targetDate || new Date().toISOString().slice(0, 10);
    const cache = darFetchRef.current;
    if (cache.date === dt && Date.now() - cache.ts < STALE_MS) return;
    darFetchRef.current = { date: dt, ts: Date.now() }; // claim slot to prevent parallel fetches
    const { data } = await supabase
      .from('qsr_daily_activity')
      .select('loc,dt,hour_slot,product_sales,mean_sales,proj_sales_dollars,ly_product_sales,dt_untilserve,dt_trans_cnt,actual_punched_hours,total_needed_hours,total_scheduled_hours,healthy_count,unhealthy_count')
      .eq('dt', dt)
      .order('loc').order('hour_slot');
    setDarRows(data || []);
  }, []);

  // Fetch on mount + refresh on visibility change + first interaction after stale
  const lastActivityCheckRef = useRef(0);
  React.useEffect(() => {
    if (!supabase) return;
    refreshDar(new Date().toISOString().slice(0, 10));
    const onVisible = () => {
      if (document.visibilityState === 'visible')
        refreshDar(new Date().toISOString().slice(0, 10));
    };
    const onActivity = () => {
      const now = Date.now();
      if (now - lastActivityCheckRef.current < STALE_MS) return;
      lastActivityCheckRef.current = now;
      refreshDar(new Date().toISOString().slice(0, 10));
    };
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('click', onActivity, { passive: true });
    document.addEventListener('keydown', onActivity, { passive: true });
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('click', onActivity);
      document.removeEventListener('keydown', onActivity);
    };
  }, [refreshDar]);

  // ── Supabase: register client + sync on mount ──────────────────────────────
  React.useEffect(()=>{
    if (!supabase) return;
    setSupabaseClient(supabase);
    // Merge labor rows from Supabase so DI calibration history persists across cache clears and devices
    loadLaborRows().then(sbRows=>{
      if(!sbRows?.length) return;
      const _mkIdx=(rows)=>{const idx={};for(const r of rows){if(!r.loc||!r.date)continue;const k=r.loc+'_'+dKey(r.date);if(!idx[k])idx[k]=[];idx[k].push(r);}return idx;};
      setDs(prev=>{
        const existing=new Set((prev?.laborRows||[]).map(r=>r.loc+'|'+(r.date instanceof Date?r.date.toISOString().slice(0,10):String(r.date).slice(0,10))));
        const fresh=sbRows.filter(r=>{
          const k=r.loc+'|'+(r.date instanceof Date?r.date.toISOString().slice(0,10):String(r.date).slice(0,10));
          return !existing.has(k);
        });
        if(!fresh.length) return prev;
        const merged=[...(prev?.laborRows||[]),...fresh].sort((a,b)=>{
          const da=a.date instanceof Date?a.date:new Date(a.date+'T00:00:00');
          const db=b.date instanceof Date?b.date:new Date(b.date+'T00:00:00');
          return da-db;
        });
        console.log(`[labor_rows] merged ${fresh.length} rows from Supabase`);
        return {...prev, laborRows:merged, laborIdx:_mkIdx(merged), laborByLoc:bLocIdx(merged), storeIds:[...new Set(merged.map(r=>r.loc))].sort()};
      });
    }).catch(()=>{});
    syncReviewsFromSupabase(supabase).catch(()=>{});
    syncConfigFromSupabase(supabase).catch(()=>{});
    syncTemplatesFromSupabase(supabase).catch(()=>{});
    // Sync org roles (role definitions + permissions) from Supabase
    syncOrgRolesFromSupabase(supabase).then(roles => { if (roles) setOrgRoles(roles); }).catch(()=>{});
    // Sync app settings from Supabase — Supabase wins over localStorage for any key it has
    supabase.from('org_config').select('data').eq('key','app_settings').maybeSingle()
      .then(({data})=>{
        if(!data?.data) return;
        const remote=data.data;
        setSettings(cur=>{
          const merged={...DEF_SETTINGS,...cur,...remote};
          merged.operators={...DEF_SETTINGS.operators,...(cur.operators||{}),...(remote.operators||{})};
          merged.supervisorGroups={...DEF_SETTINGS.supervisorGroups,...(cur.supervisorGroups||{}),...(remote.supervisorGroups||{})};
          try{localStorage.setItem('mf_settings',JSON.stringify(merged));}catch{}
          return merged;
        });
      }).catch(()=>{});
    // Sync user targets from Supabase — remote wins over localStorage for any key it has
    supabase.from('org_config').select('data').eq('key','app_user_targets').maybeSingle()
      .then(({data})=>{
        if(!data?.data) return;
        const remote=data.data;
        setUserTargets(cur=>{
          const merged={...cur,...remote};
          try{localStorage.setItem('mf_targets',JSON.stringify(merged));}catch{}
          return merged;
        });
      }).catch(()=>{});
    // Fetch the logged-in user's role from their Supabase profile
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
        .then(({ data }) => {
          if (data?.role) {
            setUserRole(data.role);
            // Non-developer roles default to release mode (Test Kitchen hidden)
            // unless the user has already stored an explicit preference
            if (data.role !== 'developer' && localStorage.getItem('mf_beta_mode') === null) {
              setBetaMode(true);
              localStorage.setItem('mf_beta_mode', 'true');
            }
          }
        })
        .catch(() => {});
    });
    // ── Auto-ingest pending QSRSoft reports ───────────────────────────────────
    // Check for files uploaded by the Gmail poller (pending_reports table).
    // Per-device tracking via localStorage: the global 'processed' flag is only
    // set by the first device to see the file, so other devices never re-download.
    // We now use 'mf_email_report_ids' localStorage set so each device independently
    // processes email reports it hasn't yet seen, regardless of the global flag.
    (async()=>{
      try{
        let emailSynced;
        try{emailSynced=new Set(JSON.parse(localStorage.getItem('mf_email_report_ids')||'[]'));}
        catch{emailSynced=new Set();}
        const cutoff=new Date(Date.now()-30*86400000).toISOString();
        const {data:pending,error}=await supabase
          .from('pending_reports')
          .select('id,filename,storage_path,report_type')
          .neq('source','manual')
          .gte('uploaded_at',cutoff)
          .order('uploaded_at',{ascending:true})
          .limit(100);
        if(error||!pending?.length) return;
        const toFetch=pending.filter(r=>!emailSynced.has(String(r.id)));
        if(!toFetch.length) return;
        console.log(`[Meridian] ${toFetch.length} email report(s) not yet on this device`);
        const filesToProcess=[];
        for(const rec of toFetch){
          try{
            const {data:blob,error:dlErr}=await supabase.storage
              .from('qsr-reports')
              .download(rec.storage_path);
            if(dlErr||!blob) continue;
            const arr=await blob.arrayBuffer();
            const mimeType=rec.filename.toLowerCase().endsWith('.csv')
              ?'text/csv'
              :'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            const file=new File([arr],rec.filename,{type:mimeType});
            file._pendingId=rec.id;
            filesToProcess.push(file);
          }catch(e){console.warn('[Meridian] Failed to download',rec.filename,e);}
        }
        if(!filesToProcess.length) return;
        // Reuse existing handleFiles — parses, merges, saves to OPFS
        await handleFiles(filesToProcess);
        // Mark this device as having processed these files
        const newSynced=new Set([...emailSynced,...toFetch.map(r=>String(r.id))]);
        try{localStorage.setItem('mf_email_report_ids',JSON.stringify([...newSynced]));}catch{}
        // Also set global processed flag for any still-unprocessed records
        const globalUnprocessed=toFetch.filter(r=>!r.processed).map(r=>r.id);
        if(globalUnprocessed.length){
          await supabase.from('pending_reports')
            .update({processed:true,processed_at:new Date().toISOString()})
            .in('id',globalUnprocessed);
        }
        console.log(`[Meridian] ✓ Auto-ingested ${filesToProcess.length} QSRSoft email report(s)`);
      }catch(e){console.warn('[Meridian] Pending report check failed:',e);}
    })();
    // ── Auto-ingest VOICE Performance PDFs from Gmail poller ─────────────────
    // Downloads operator performance PDFs from Storage, parses with PDF.js,
    // saves extracted rows to smg_voice_performance Supabase table.
    (async()=>{
      try{
        if(!supabase) return;
        const{data:vpPending,error:vpErr}=await supabase
          .from('pending_reports')
          .select('id,filename,storage_path')
          .eq('processed',false)
          .eq('report_type','voice-performance')
          .order('uploaded_at',{ascending:true})
          .limit(20);
        if(vpErr||!vpPending?.length) return;
        console.log(`[Meridian] ${vpPending.length} VOICE Performance PDF(s) pending`);
        const {parseVoicePerformancePDF}=await import('../parsers/voice-performance.js');
        let totalRows=0;
        const processedIds=[];
        for(const rec of vpPending){
          try{
            const{data:blob,error:dlErr}=await supabase.storage
              .from('qsr-reports')
              .download(rec.storage_path);
            if(dlErr||!blob){console.warn('[voice_perf] DL failed:',rec.filename);continue;}
            const arr=await blob.arrayBuffer();
            const rows=await parseVoicePerformancePDF(arr,rec.filename);
            if(rows.length){
              await saveVoicePerf(rows);
              totalRows+=rows.length;
              setDs(prev=>prev?{...prev,smgVoicePerf:[...(prev.smgVoicePerf||[]),...rows]}:prev);
            }
            processedIds.push(rec.id);
          }catch(e){console.warn('[voice_perf] parse error:',rec.filename,e);}
        }
        if(processedIds.length){
          await supabase.from('pending_reports')
            .update({processed:true,processed_at:new Date().toISOString()})
            .in('id',processedIds);
        }
        console.log(`[Meridian] ✓ VOICE Performance: ${totalRows} rows from ${processedIds.length} PDF(s)`);
      }catch(e){console.warn('[Meridian] VOICE Performance ingest failed:',e);}
    })();
    // ── Cross-device sync — load manual uploads from other devices ───────────
    // Reads file_data (base64) directly from pending_reports — no Storage needed.
    // Skips files this device has already seen (per localStorage).
    (async()=>{
      try{
        if(!supabase) return;
        let synced;
        try{synced=new Set(JSON.parse(localStorage.getItem('mf_synced_report_ids')||'[]'));}
        catch{synced=new Set();}
        const cutoff=new Date(Date.now()-180*86400000).toISOString();
        const{data:manualFiles}=await supabase
          .from('pending_reports')
          .select('id,filename,report_type')
          .eq('source','manual')
          .gte('uploaded_at',cutoff)
          .order('uploaded_at',{ascending:true})
          .limit(50);
        if(!manualFiles?.length) return;
        const toProcess=manualFiles.filter(f=>!synced.has(f.id));
        if(!toProcess.length) return;
        console.log(`[Meridian] ${toProcess.length} manual report(s) to sync from cloud`);
        const filesToSync=[];
        for(const rec of toProcess){
          try{
            // Fetch file_data separately — avoids loading all binary in the listing query
            const{data:row,error:fetchErr}=await supabase
              .from('pending_reports')
              .select('file_data')
              .eq('id',rec.id)
              .single();
            if(fetchErr||!row?.file_data){console.warn('[Meridian] No file_data for',rec.filename);continue;}
            const binary=atob(row.file_data);
            const bytes=new Uint8Array(binary.length);
            for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
            const ext=(rec.filename||'').toLowerCase();
            const mime=ext.endsWith('.csv')?'text/csv':ext.endsWith('.pdf')?'application/pdf'
              :'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            const file=new File([bytes],rec.filename,{type:mime});
            file._manualSyncId=rec.id;
            filesToSync.push(file);
          }catch(e){console.warn('[Meridian] Failed to decode',rec.filename,e);}
        }
        if(!filesToSync.length) return;
        await handleFiles(filesToSync);
        filesToSync.forEach(f=>_markSynced(f._manualSyncId));
        console.log(`[Meridian] ✓ Cloud-synced ${filesToSync.length} report(s)`);
      }catch(e){console.warn('[Meridian] Cross-device sync failed:',e);}
    })();
    // ── Supabase table diagnostic — logs row counts for all key tables ────────
    (async()=>{
      try{
        const tables=['labor_rows','fob_rows','ops_rows','ctrl_rows','dar_rows','peaks_rows','audit_rows','qsr_fob','lifelenz_schedule','smg_fullscale'];
        const counts=await Promise.all(tables.map(t=>supabase.from(t).select('*',{count:'exact',head:true}).then(({count,error})=>({t,count:error?`ERR:${error.message}`:count}))));
        console.log('[Meridian] Supabase table row counts:',Object.fromEntries(counts.map(({t,count})=>[t,count])));
      }catch(e){console.warn('[Meridian] Diagnostic count failed:',e);}
    })();
    // ── Auto-load ALL monthly targets from Supabase ───────────────────────────
    // Loads every available period so EOM can look up any month without
    // additional Supabase calls.
    (async()=>{
      try{
        const all = await loadAllMonthlyTargets();
        const periods = Object.keys(all);
        if(periods.length > 0){
          // Also derive the most recent month for backward-compat monthlyTargets field
          const latestKey = periods.sort().reverse()[0];
          setDs(prev => {
            if(!prev) return prev;
            return {
              ...prev,
              allMonthlyTargets: all,
              monthlyTargets: { ...(all[latestKey]||{}), ...prev.monthlyTargets },
            };
          });
          console.log(`[Meridian] ✓ Loaded monthly targets for ${periods.join(', ')} (${Object.values(all[latestKey]||{}).length} stores/period)`);
        }
      }catch(e){console.warn('[Meridian] Monthly targets load failed:',e);}
      try{
        const fsRows = await loadSmgFullscale();
        if(fsRows.length>0){
          setDs(prev=>{
            if(!prev) return prev;
            return {...prev, smgFullscale: fsRows};
          });
          console.log(`[Meridian] ✓ Loaded ${fsRows.length} SMG FullScale records from Supabase`);
        }
      }catch(e){console.warn('[Meridian] SMG FullScale load failed:',e);}
      try{
        const vpRows = await loadVoicePerf();
        if(vpRows.length>0){
          setDs(prev=>{
            if(!prev) return prev;
            return {...prev, smgVoicePerf: vpRows};
          });
          console.log(`[Meridian] ✓ Loaded ${vpRows.length} VOICE Performance rows from Supabase`);
        }
      }catch(e){console.warn('[Meridian] VOICE Performance load failed:',e);}
      try{
        const dpRows = await loadVoiceDaypart();
        if(dpRows.length>0){
          setDs(prev=>prev?{...prev, voiceDaypart: dpRows}:prev);
          console.log(`[Meridian] ✓ Loaded ${dpRows.length} VOICE Daypart rows from Supabase`);
        }
      }catch(e){console.warn('[Meridian] VOICE Daypart load failed:',e);}
      try{
        // Cloud-persisted SMG comments (v4.546) — previously OPFS-only/device-local.
        const cmts = await loadSmgComments();
        if(cmts.length>0){
          setDs(prev=>{
            if(!prev) return prev;
            const seen=new Set((prev.smgRows||[]).map(r=>`${r.loc}|${r.commentDate instanceof Date?r.commentDate.toISOString().slice(0,10):r.commentDate}|${(r.text||'').slice(0,60)}`));
            const merged=[...(prev.smgRows||[]), ...cmts.filter(r=>!seen.has(`${r.loc}|${r.commentDate instanceof Date?r.commentDate.toISOString().slice(0,10):r.commentDate}|${(r.text||'').slice(0,60)}`))];
            return {...prev, smgRows: merged};
          });
          console.log(`[Meridian] ✓ Loaded ${cmts.length} SMG comments from Supabase`);
        }
      }catch(e){console.warn('[Meridian] SMG comments load failed:',e);}
      try{
        const lfzRows = await loadLifeLenzSchedule();
        if(lfzRows.length>0){
          setDs(prev=>{
            if(!prev) return prev;
            return {...prev, schedRows: lfzRows};
          });
          console.log(`[Meridian] ✓ Loaded ${lfzRows.length} LifeLenz schedule rows from Supabase`);
        }
      }catch(e){console.warn('[Meridian] LifeLenz load failed:',e);}
      try{
        const jobRows = await loadLifeLenzJobHours();
        if(jobRows.length>0){
          setDs(prev=>{
            if(!prev) return prev;
            return {...prev, jobHours: jobRows};
          });
          console.log(`[Meridian] ✓ Loaded ${jobRows.length} LifeLenz per-job rows from Supabase`);
        }
      }catch(e){console.warn('[Meridian] LifeLenz job-hours load failed:',e);}
      try{
        // Graded visits — same Supabase source the Graded Visits panel uses, loaded into
        // ds.gradedVisits so Visit Readiness (Model check, Visit Patterns, last-visit) sees them.
        const gv = await loadGradedVisits();
        if(gv.length>0){
          setDs(prev=>{if(!prev)return prev;return {...prev, gradedVisits: gv};});
          console.log(`[Meridian] ✓ Loaded ${gv.length} graded visits from Supabase`);
        }
      }catch(e){console.warn('[Meridian] Graded visits load failed:',e);}
      // ── FOB / Ops / Controls / DAR ──────────────────────────────────────────
      const _mkIdx2=(rows)=>{const idx={};for(const r of rows){if(!r.loc||!r.date)continue;const k=r.loc+'_'+dKey(r.date);if(!idx[k])idx[k]=[];idx[k].push(r);}return idx;};
      try{
        const fobRows=await loadFobRows();
        if(fobRows.length>0){
          setDs(prev=>{if(!prev)return prev;return {...prev,fobRows};});
          console.log(`[Meridian] ✓ Loaded ${fobRows.length} FOB rows from Supabase`);
        }
      }catch(e){console.warn('[Meridian] FOB rows load failed:',e);}
      try{
        const qsrFobRows=await loadQsrFob();
        if(qsrFobRows.length>0){
          setDs(prev=>{if(!prev)return prev;return {...prev,qsrFobRows};});
          console.log(`[Meridian] ✓ Loaded ${qsrFobRows.length} QSRSoft FOB rows from Supabase`);
        }
      }catch(e){console.warn('[Meridian] QSRSoft FOB load failed:',e);}
      try{
        const sbPeaks=await loadPeaksRows();
        if(sbPeaks.length>0){
          const peaksSvcRows  =sbPeaks.filter(r=>r._peakSvc===true);
          const peaksSalesRows=sbPeaks.filter(r=>r._peakSvc===false);
          setDs(prev=>{if(!prev)return prev;return {...prev,peaksSvcRows,peaksSalesRows};});
          console.log(`[Meridian] ✓ Loaded ${sbPeaks.length} peaks rows from Supabase`);
        }
      }catch(e){console.warn('[Meridian] Peaks rows load failed:',e);}
      try{
        const sbAudit=await loadAuditRows();
        if(sbAudit.length>0){
          setDs(prev=>{if(!prev)return prev;return {...prev,auditRows:sbAudit};});
          console.log(`[Meridian] ✓ Loaded ${sbAudit.length} audit rows from Supabase`);
        }
      }catch(e){console.warn('[Meridian] Audit rows load failed:',e);}
      try{
        const opsRows=await loadOpsRows();
        if(opsRows.length>0){
          setDs(prev=>{if(!prev)return prev;return {...prev,opsRows,opsIdx:_mkIdx2(opsRows),opsByLoc:bLocIdx(opsRows)};});
          console.log(`[Meridian] ✓ Loaded ${opsRows.length} ops rows from Supabase`);
        }
      }catch(e){console.warn('[Meridian] Ops rows load failed:',e);}
      try{
        const ctrlRows=await loadCtrlRows();
        if(ctrlRows.length>0){
          setDs(prev=>{if(!prev)return prev;return {...prev,ctrlRows,ctrlIdx:_mkIdx2(ctrlRows),ctrlByLoc:bLocIdx(ctrlRows)};});
          console.log(`[Meridian] ✓ Loaded ${ctrlRows.length} ctrl rows from Supabase`);
        }
      }catch(e){console.warn('[Meridian] Ctrl rows load failed:',e);}
      try{
        const darRows=await loadDarRows();
        if(darRows.length>0){
          setDs(prev=>{if(!prev)return prev;return {...prev,darRows,darByLoc:bLocIdx(darRows)};});
          console.log(`[Meridian] ✓ Loaded ${darRows.length} DAR rows from Supabase`);
        }
      }catch(e){console.warn('[Meridian] DAR rows load failed:',e);}
      try{
        const customDefs=await loadCustomSignals();
        if(customDefs.length>0){
          setCustomSignalDefs(customDefs);
          console.log(`[Meridian] ✓ Loaded ${customDefs.length} custom signal definitions`);
        }
      }catch(e){console.warn('[Meridian] Custom signals load failed:',e);}
      try{
        const qsrFieldDefs=await loadQsrFieldDefs();
        if(Object.keys(qsrFieldDefs).length>0){
          setDs(prev=>{if(!prev)return prev;return{...prev,qsrFieldDefs};});
          console.log(`[Meridian] ✓ Loaded QSRSoft field definitions`);
        }
      }catch(e){console.warn('[Meridian] QSR field defs load failed:',e);}
      // QSRSoft daily-activity summary: 60-day aggregated daily totals per store
      // (sales, DT, and auto-pulled actual/needed labor hours). Used by AtAGlance
      // as a zero-upload fallback and by the Scheduling QSR columns so actual
      // labor hours are cloud-fresh on every device — back into June, not just
      // the days a manual report happened to cover.
      try{
        const qsrActSummaryRows=await loadQsrActSummary(60);
        if(qsrActSummaryRows.length>0){
          setDs(prev=>{if(!prev)return prev;return{...prev,qsrActSummaryRows};});
          console.log(`[Meridian] ✓ Loaded ${qsrActSummaryRows.length} QSRSoft act summary rows`);
        }
      }catch(e){console.warn('[Meridian] QSRSoft act summary load failed:',e);}
      // eBOS daily op-supplies purchases → ds.ebosRows. Auto-pulled cloud stream that
      // feeds the Perf-Review "Op Supplies vs Budget" actual (Notes 32 #4) — 400-day
      // window so a full review year is covered on any device.
      try{
        const ebosRows=await loadEbosDaily(400);
        if(ebosRows.length>0){
          setDs(prev=>{if(!prev)return prev;return{...prev,ebosRows};});
          console.log(`[Meridian] ✓ Loaded ${ebosRows.length} eBOS op-supplies rows`);
        }
      }catch(e){console.warn('[Meridian] eBOS op-supplies load failed:',e);}
      // QSRSoft People reports (monthly per-loc) → Perf-Review People metrics (Notes 32):
      // Roster Statistics (headcount), Employee Roster role counts (shift-cert), Turnover (0-90).
      try{
        const [rosterStatsRows,rosterRoleCounts,turnoverRows]=await Promise.all([loadRosterStatistics(),loadRosterRoleCounts(),loadTurnoverMonthly()]);
        if(rosterStatsRows.length||rosterRoleCounts.length||turnoverRows.length){
          setDs(prev=>{if(!prev)return prev;return{...prev,rosterStatsRows,rosterRoleCounts,turnoverRows};});
          console.log(`[Meridian] ✓ Loaded People reports — rosterStats ${rosterStatsRows.length}, roleCounts ${rosterRoleCounts.length}, turnover ${turnoverRows.length}`);
        }
      }catch(e){console.warn('[Meridian] People reports load failed:',e);}
      // QSRSoft Digital App + McDelivery 3PO (monthly per-loc) → Perf-Review
      // Digital App GC/R/D + Delivery GC/R/D metrics (Notes 32).
      try{
        const [digitalAppRows,mcdeliveryRows,shiftManagerRows]=await Promise.all([loadDigitalAppMonthly(),loadMcdeliveryMonthly(),loadShiftManagerMonthly()]);
        if(digitalAppRows.length||mcdeliveryRows.length||shiftManagerRows.length){
          setDs(prev=>{if(!prev)return prev;return{...prev,digitalAppRows,mcdeliveryRows,shiftManagerRows};});
          console.log(`[Meridian] ✓ Loaded Digital/Delivery/ShiftMgr — digital ${digitalAppRows.length}, mcdelivery ${mcdeliveryRows.length}, shiftMgr ${shiftManagerRows.length}`);
        }
      }catch(e){console.warn('[Meridian] Digital/Delivery/ShiftMgr load failed:',e);}
      // Server-parsed QSRSoft email reports (Daily Glimpse, Cash Sheet, Sales Ledger).
      // Cloud-first source of truth — override the device-local IDB rows only when
      // the Supabase tables have data, so freshness follows the app on any device.
      try{
        const [glimpse,cash,ledger]=await Promise.all([loadGlimpse(60),loadCash(60),loadSalesLedger(60)]);
        if(glimpse.length||cash.length||ledger.length){
          setDs(prev=>{if(!prev)return prev;return{...prev,
            ...(glimpse.length?{glimpseRows:glimpse}:{}),
            ...(cash.length?{cashRows:cash}:{}),
            ...(ledger.length?{salesLedgerRows:ledger}:{})};});
          console.log(`[Meridian] ✓ Loaded cloud email reports — glimpse:${glimpse.length} cash:${cash.length} ledger:${ledger.length}`);
        }
      }catch(e){console.warn('[Meridian] Cloud email-report load failed:',e);}
      // Operations Report streams (#37) — Controls / Labor(OT) / Service / Sales-mix / 3 Peaks,
      // store-daily with LY, from the qsrsoft-ops-pull. Loaded into ds for the tile-wiring phase
      // (ctrlAuto discount%/T-Reds, OT, service, etc.). Fails soft before the tables exist/populate.
      try{
        const [oCash,oLabor,oSvc,oMix,oPeaks]=await Promise.all([
          loadOpsCashSheet(60),loadOpsLaborSummary(60),loadOpsServiceStats(60),loadOpsSalesMix(60),loadOpsPeaksSales(60)]);
        if(oCash.length||oLabor.length||oSvc.length||oMix.length||oPeaks.length){
          setDs(prev=>{if(!prev)return prev;return{...prev,
            ...(oCash.length?{opsCashRows:oCash}:{}),
            ...(oLabor.length?{opsLaborRows:oLabor}:{}),
            ...(oSvc.length?{opsServiceRows:oSvc}:{}),
            ...(oMix.length?{opsSalesMixRows:oMix}:{}),
            ...(oPeaks.length?{opsPeaksRows:oPeaks}:{})};});
          console.log(`[Meridian] ✓ Ops Report streams — cash:${oCash.length} labor:${oLabor.length} svc:${oSvc.length} mix:${oMix.length} peaks:${oPeaks.length}`);
        }
      }catch(e){console.warn('[Meridian] Ops Report stream load failed:',e);}
      // Load cross-device user settings (locked projections, AE calibration params)
      try{
        const remoteProj=await loadUserSetting('locked_projections');
        if(remoteProj&&typeof remoteProj==='object'&&Object.keys(remoteProj).length>0){
          setLockedProjections(remoteProj);
          try{localStorage.setItem('mf_locked_projections',JSON.stringify(remoteProj));}catch{}
          console.log('[Meridian] ✓ Loaded locked projections from Supabase');
        }
      }catch(e){console.warn('[Meridian] locked projections load failed:',e);}
      try{
        const remoteAE=await loadUserSetting('ae_params');
        if(remoteAE?.params&&typeof remoteAE.params==='object'){
          try{localStorage.setItem('mf_ae_params',JSON.stringify(remoteAE));}catch{}
          console.log('[Meridian] ✓ Loaded AE calibration params from Supabase');
        }
      }catch(e){console.warn('[Meridian] AE params load failed:',e);}
      try{
        // Cloud-persisted model assignments (v4.544): hydrate the device-local
        // cache from Supabase so backtest winners + manual overrides follow the
        // user across devices. Cloud is source of truth; local writes push back
        // (see labor-tools ModelAssignmentPanel). Then invalidate so
        // getModelAssignment re-reads the fresh blob.
        const remoteMA=await loadUserSetting('model_assignments');
        if(remoteMA&&typeof remoteMA==='object'&&Object.keys(remoteMA).length>0){
          try{localStorage.setItem(MODEL_ASSIGNMENT_KEY,JSON.stringify(remoteMA));}catch{}
          _masgnInvalidate();
          console.log('[Meridian] ✓ Loaded model assignments from Supabase');
        }
      }catch(e){console.warn('[Meridian] model assignments load failed:',e);}
      try{
        // Cloud org calendar events (Notes 46): Supabase `org_events` is the source of
        // truth (cross-device). Down-project into the per-day `mf_events` map every
        // existing consumer already reads. NON-DESTRUCTIVE: cloud entries only fill a
        // loc/day that has no local event, and refresh entries previously stamped
        // orgSourced — hand-entered events are never clobbered (owner's "notify before
        // overwrite" rule; genuine conflicts stay local and surface in the import UI).
        const orgEvents=await loadOrgEvents();
        if(orgEvents&&orgEvents.length){
          const iconFor=(t)=>(EVENT_TYPES[t]||EVENT_TYPES.other||{}).icon||'📌';
          const cloudMap=orgEventsToDayMap(orgEvents,iconFor);
          const cur=(()=>{try{return JSON.parse(localStorage.getItem('mf_events')||'{}');}catch{return {};}})();
          let added=0,refreshed=0;
          for(const loc of Object.keys(cloudMap)){
            if(!cur[loc])cur[loc]={};
            for(const dk of Object.keys(cloudMap[loc])){
              const ex=cur[loc][dk];
              if(!ex){cur[loc][dk]=cloudMap[loc][dk];added++;}
              else if(ex.orgSourced){cur[loc][dk]=cloudMap[loc][dk];refreshed++;}
              // else: hand-entered event present → leave it (conflict, not overwritten)
            }
          }
          if(added||refreshed){
            try{localStorage.setItem('mf_events',JSON.stringify(cur));}catch{}
            setUserEvents(cur);
            console.log(`[Meridian] ✓ Hydrated ${orgEvents.length} cloud events (${added} new, ${refreshed} refreshed)`);
          }
        }
      }catch(e){console.warn('[Meridian] org events hydration failed:',e);}
    })();
  },[]);

  // ── Auto-fetch weather on load if empty or stale (>1 day) ────────────────
  // Runs once 5s after mount so the initial IDB restore has time to complete.
  // Saves to IDB + OPFS + updates idbCoverage so Data Manager shows fresh dates.
  React.useEffect(()=>{
    const timer = setTimeout(async ()=>{
      if(!navigator.onLine) return;
      const today = new Date().toISOString().slice(0,10);
      const oneDayAgo = new Date(Date.now()-86400000).toISOString().slice(0,10);
      const wxRows = await idbGetAllRows('weatherRows').catch(()=>[]);
      const lastDate = wxRows.length
        ? wxRows.map(r=>r._d||'').filter(Boolean).sort().at(-1)
        : null;
      if(lastDate && lastDate >= oneDayAgo) return; // still fresh
      console.log('[Meridian] Weather auto-fetch — last date:', lastDate||'none');
      const newRows = await fetchOpenMeteoWeather('2022-01-01', today, ()=>{}).catch(()=>[]);
      if(!newRows.length) return;
      await idbPutRows('weatherRows', newRows).catch(()=>{});
      // fetchOpenMeteoWeather rows carry .date (Date) but not _d; derive dates
      // straight off .date so coverage/staleness don't collapse to '?'.
      const wDates = newRows.map(r=>r.date?dKey(r.date):'').filter(Boolean).sort();
      // Rebuild the weather date-index. Without this, a fresh fetch populated
      // ds.weatherRows but left ds.wxByDate at whatever it was (empty {} on a
      // cold start), so Market Intelligence weather correlations silently stayed
      // hidden — liWeatherCorr reads wxByDate, not weatherRows. Mirror the
      // IDB-restore rebuild so both keys (loc_date and bare date) are present.
      const wxIdx={};
      for(const r of newRows){if(!r.date)continue;const _dk=dKey(r.date);
        if(r.loc)wxIdx[String(r.loc)+'_'+_dk]=r; if(!wxIdx[_dk])wxIdx[_dk]=r;}
      const bWxIdx=(rows)=>{const idx={};for(const r of rows){if(!r.loc||!r.date)continue;const k=r.loc+'_'+dKey(r.date);if(!idx[k])idx[k]=[];idx[k].push(r);}return idx;};
      setDs(prev=>{
        if(!prev) return prev;
        const updated={...prev, weatherRows:newRows, wxByDate:wxIdx, weatherIdx:bWxIdx(newRows)};
        opfsSave(updated).catch(()=>{});  // persist to OPFS so it survives reload
        return updated;
      });
      // Keep the module-level wx cache warm too, so anomaly notes resolve.
      newRows.forEach(r=>{if(!r.loc||!r.date)return;
        const _wk=String(r.loc)+'_'+dKey(r.date);
        _wxCache[_wk]={tmax:r.tmax,tmin:r.tmin,rain:r.rain,wmax:r.wmax||r.wspd||0,source:r.source||'open-meteo'};
      });
      setIdbCoverage(prev=>({
        ...(prev||{}),
        weatherRows:{count:newRows.length, from:wDates[0]||'?', to:wDates[wDates.length-1]||'?'},
      }));
      console.log(`[Meridian] ✓ Weather auto-fetched: ${newRows.length} records`);
    }, 5000);
    return ()=>clearTimeout(timer);
  },[]);

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
  const saveUserTargets= useCallback((next)=>{setUserTargets(next);try{localStorage.setItem('mf_targets',JSON.stringify(next));}catch{}pushConfigToSupabase(supabase,next,'app_user_targets').catch(()=>{});}, []);

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
    pushConfigToSupabase(supabase, next, 'app_settings').catch(()=>{});
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

  const handleClearAll = useCallback(async()=>{
    await Promise.all([idbClearAll(), opfsClear()]);
    setDs(null);
    setLoadMsg('✓ All stored data cleared — reload files to restore');
    setTimeout(()=>setLoadMsg(null),6000);
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
      // Priority: v2 monthly override > user flat override > monthly projections targets > yearly targets > DEFAULT_TARGETS
      merged[loc]={...DEFAULT_TARGETS[loc],...(ds&&ds.targets&&ds.targets[loc]||{}),...(ds&&ds.monthlyTargets&&ds.monthlyTargets[loc]||{}),...(userTargets[loc]||{}),...(v2cur[loc]||{})};
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

  // Track which pending_reports IDs this device has already processed
  // (prevents re-downloading files this device uploaded or already parsed)
  const _markSynced = (id) => {
    if (!id) return;
    try {
      const s = new Set(JSON.parse(localStorage.getItem('mf_synced_report_ids') || '[]'));
      s.add(id);
      localStorage.setItem('mf_synced_report_ids', JSON.stringify([...s]));
    } catch {}
  };

  // One-time backfill (v4.546): pull every SMG comment PDF the Gmail poller
  // already stored in the qsr-reports bucket (keyed by eu###### filename in
  // pending_reports), parse, and cloud-persist — no manual downloading. Idempotent
  // (saveSmgComments upserts by dedup_key). Returns {found, comments, saved}.
  const backfillSmgComments = useCallback(async()=>{
    if(!supabase) return {found:0,comments:0,saved:0};
    const {data:recs,error}=await supabase.from('pending_reports')
      .select('id,filename,storage_path')
      .ilike('filename','eu065%')
      .order('uploaded_at',{ascending:true})
      .limit(3000);
    if(error||!recs?.length) return {found:0,comments:0,saved:0};
    const allRows=[];
    for(const rec of recs){
      try{
        const {data:blob,error:dl}=await supabase.storage.from('qsr-reports').download(rec.storage_path);
        if(dl||!blob) continue;
        const arr=await blob.arrayBuffer();
        const file=new File([arr],rec.filename,{type:'application/pdf'});
        const rows=await parseSMGVoicePDF(file);
        if(rows.length) allRows.push(...rows.map(r=>({...r,sourceFile:rec.filename})));
      }catch(e){ /* skip a file that won't parse */ }
    }
    let saved=0, saveErr=null;
    if(allRows.length){
      const res=await saveSmgComments(allRows);
      saved=res.saved||0; saveErr=res.error||null;
      setDs(prev=>{
        if(!prev) return prev;
        const seen=new Set((prev.smgRows||[]).map(r=>`${r.loc}|${r.commentDate instanceof Date?r.commentDate.toISOString().slice(0,10):r.commentDate}|${(r.text||'').slice(0,60)}`));
        const merged=[...(prev.smgRows||[]),...allRows.filter(r=>!seen.has(`${r.loc}|${r.commentDate instanceof Date?r.commentDate.toISOString().slice(0,10):r.commentDate}|${(r.text||'').slice(0,60)}`))];
        return {...prev,smgRows:merged};
      });
    }
    return {found:recs.length, comments:allRows.length, saved, error:saveErr};
  },[]);

  const handleFiles = useCallback(async(files)=>{
    if(!files||!files.length) return;
    const fileArr=Array.from(files);
    setLoadMsg('⏳ Reading '+fileArr.length+' file'+(fileArr.length>1?'s…':'…'));
    let currentDS=dsRef.current||buildDS([]);
    const loaded=[];
    const _skipped=[]; // period-summary Operations Reports refused (no daily dates)
    const _errored=[]; // files that threw during parse (surfaced in the upload summary)
    const _toDs=r=>r.date instanceof Date?r.date.toISOString().slice(0,10):String(r.date).slice(0,10);
    const _prevDarKeys   =new Set((currentDS.darRows      ||[]).map(r=>r.loc+'|'+_toDs(r)+'|'+(r.hour||'')));
    // Track rows parsed in this upload batch so we always upsert them to Supabase (overwrites stale data for corrected re-uploads)
    const _freshLaborRows=[],_freshFobRows=[],_freshOpsRows=[],_freshCtrlRows=[],_freshPeakSvcRows=[],_freshPeakSalesRows=[],_freshAuditRows=[];
    for(const file of fileArr){
      try{
        setLoadMsg('⏳ Parsing '+file.name+'…');
        // Graded-visit HTML (CFV / RGR / Ecosure) — route to the graded-visit
        // parser and save to Supabase, so a report dropped anywhere lands in the
        // Graded Visits panel.
        if(/\.html?$/i.test(file.name)){
          try{
            const text=await file.text();
            const {parseGradedVisit}=await import('../parsers/graded-visits.js');
            const v=parseGradedVisit(text,{passThreshold:80});
            if(v.store&&v.dateISO){
              const {saveGradedVisits}=await import('../lib/supabase.js');
              await saveGradedVisits([v]);
              loaded.push({name:file.name,type:{type:'graded-visit',label:'Graded Visit · '+(v.reportType||'CFV')}});
              console.log('[Meridian] Graded visit saved:',v.store,v.dateISO,v.reportType);
            } else console.warn('[Meridian] HTML not a visit report:',file.name);
          }catch(e){console.warn('[Meridian] Graded-visit parse failed:',file.name,e);}
          continue;
        }
        const isPDF=file.name.toLowerCase().endsWith('.pdf');
        if(isPDF){
          // PDF files — route to specialized parsers (no XLSX)
          const typeInfo=detectType(file.name,null);
          if(typeInfo.type==='voice-performance'){
            const {parseVoicePerformancePDF}=await import('../parsers/voice-performance.js');
            const arr=await file.arrayBuffer();
            const vpRows=await parseVoicePerformancePDF(arr,file.name);
            if(vpRows.length>0){
              await saveVoicePerf(vpRows);
              currentDS={...currentDS,smgVoicePerf:[...(currentDS.smgVoicePerf||[]),...vpRows]};
              console.log(`[Meridian] VOICE Performance: ${vpRows.length} rows from ${file.name}`);
            }
            loaded.push({name:file.name,type:typeInfo});
          } else if(typeInfo.type==='smg-voice'){
            // eu###### filenames cover THREE reports — customer comments, the
            // operator VOICE Performance table, AND the per-store daypart
            // (Time-of-Day) report — so content decides. Daypart pages are
            // unmistakable ("Time of Day Performance"); try that first.
            let dpRows=[];
            try{ dpRows=await parseVoiceDaypartPDF(file); }catch(e){ dpRows=[]; }
            // A file with a "Time of Day Performance" grid IS a daypart report —
            // route it here and NEVER fall through to the Performance parser,
            // even when 0 rows parse (older 2024–25 metric layout isn't covered
            // yet). Otherwise it lands mislabeled in the Performance tab.
            if(dpRows.isDaypart || dpRows.length>0){
              if(dpRows.length>0){
                const res=await saveVoiceDaypart(dpRows);
                currentDS={...currentDS,voiceDaypart:[...(currentDS.voiceDaypart||[]),...dpRows]};
                const dpPeriods=[...new Set(dpRows.map(r=>r.period).filter(Boolean))].sort();
                const dpStores=new Set(dpRows.map(r=>String(parseInt(r.loc,10)||r.loc))).size;
                console.log(`[Meridian] VOICE Daypart: ${dpRows.length} rows from ${file.name} (saved ${res.saved}${res.error?', err '+res.error:''})`);
                loaded.push({name:file.name,type:{...typeInfo,type:'voice-daypart',label:'SMG VOICE Daypart Report'},periods:dpPeriods,stores:dpStores,saved:res.saved,saveErr:res.error||null});
              } else {
                console.warn(`[Meridian] VOICE Daypart (unsupported metric layout, not saved): ${file.name}`);
                loaded.push({name:file.name,type:{...typeInfo,type:'voice-daypart',label:'SMG VOICE Daypart Report (older format — not yet supported)'}});
              }
              continue;
            }
            // Otherwise try the Performance parser; if it finds no perf rows, it's
            // a comment report and we fall back.
            const {parseVoicePerformancePDF}=await import('../parsers/voice-performance.js');
            let vpRows=[];
            try{ vpRows=await parseVoicePerformancePDF(await file.arrayBuffer(),file.name); }catch(e){ vpRows=[]; }
            if(vpRows.length>0){
              await saveVoicePerf(vpRows);
              currentDS={...currentDS,smgVoicePerf:[...(currentDS.smgVoicePerf||[]),...vpRows]};
              console.log(`[Meridian] VOICE Performance (eu### content match): ${vpRows.length} rows from ${file.name}`);
              loaded.push({name:file.name,type:{...typeInfo,type:'voice-performance',label:'SMG VOICE Performance Report'},periods:[...new Set(vpRows.map(r=>r.period).filter(Boolean))].sort()});
            } else {
              const smgRows=await parseSMGVoicePDF(file);
              if(smgRows.length>0){
                currentDS={...currentDS,smgRows:[...(currentDS.smgRows||[]),...smgRows]};
                console.log(`[Meridian] SMG VOICE: ${smgRows.length} comments from ${file.name}`);
                saveSmgComments(smgRows.map(r=>({...r,sourceFile:file.name}))).catch(()=>{}); // cloud-persist (v4.546)
              }
              loaded.push({name:file.name,type:typeInfo});
              if(supabase&&!file._pendingId&&!file._manualSyncId)
                uploadReportFile(file,'smg-voice').then(rec=>_markSynced(rec?.id)).catch(()=>{});
            }
          } else {
            console.warn('[Meridian] Unrecognized PDF:',file.name);
          }
        } else {
          const ab=await file.arrayBuffer();
          const _isCSV=file.name.toLowerCase().endsWith('.csv');
          const wb=_isCSV
            ?XLSX.read(new TextDecoder().decode(new Uint8Array(ab)),{type:'string',raw:true})
            :XLSX.read(new Uint8Array(ab),{type:'array'});
          const type=detectType(file.name,wb);
          // SMG FullScale gets its own path — stores to DB and ds.smgFullscale
          if(type.type==='smg-fullscale'){
            const fsRows=parseSMGFullScale(wb);
            if(fsRows.length>0){
              currentDS={...currentDS,smgFullscale:[...(currentDS.smgFullscale||[]),...fsRows]};
              console.log(`[Meridian] SMG FullScale: ${fsRows.length} stores from ${file.name}`);
              saveSmgFullscale(fsRows).catch(e=>console.warn('[smg_fullscale] save error:',e));
            }
            loaded.push({name:file.name,type});
          } else if(type.type==='ll-labor'){
            const lfzRows=parseLifeLenzLabor(wb);
            if(lfzRows.length>0){
              currentDS={...currentDS,schedRows:[...(currentDS.schedRows||[]),...lfzRows]};
              console.log(`[Meridian] LifeLenz: ${lfzRows.length} rows from ${file.name}`);
              saveLifeLenzSchedule(lfzRows).catch(e=>console.warn('[lifelenz_schedule] save error:',e));
            }
            loaded.push({name:file.name,type});
          } else if(type.type==='mbi-labor'){
            // MBI weekly Fixed-Labor-Hours worksheet → weekly Band-1 inputs +
            // per-store config (hours-of-op + gathered fixed hours), both to Supabase.
            const mbi=parseMbiLaborAnalysisWb(wb);
            if(mbi.stores.length>0){
              currentDS={...currentDS,laborAnalysis:mbi};
              console.log(`[Meridian] MBI Labor Analysis: ${mbi.stores.length} stores, week ${mbi.weekStart} from ${file.name}`);
              saveLifeLenzLaborWeek(mbi.stores,{weekStart:mbi.weekStart,weekEnd:mbi.weekEnd,monthTag:mbi.monthTag}).catch(e=>console.warn('[lifelenz_labor_week] save error:',e));
              saveStoreLaborConfig(mbi.stores.map(s=>s.config)).catch(e=>console.warn('[store_labor_config] save error:',e));
            }
            loaded.push({name:file.name,type});
          } else if(type.type==='people-skills'){
            // LifeLenz People List (Simple CSV) → crew skills matrix in Supabase.
            // Key by the ROSTER store (from the filename, e.g. people_list_simple_
            // 0018213__LINDSAY…), not each person's home store, and replace that
            // store's rows so the upload is authoritative for it.
            const ppl=parsePeopleSkillsWb(wb);
            const _fm=(file.name||'').match(/people[_ ]list[_ ]simple[_ ]0*(\d{3,7})/i);
            const rosterLoc=_fm?String(parseInt(_fm[1],10)):(ppl.pulledLoc||null);
            if(ppl.employees.length>0){
              currentDS={...currentDS,peopleSkills:ppl};
              console.log(`[Meridian] Crew Skills: ${ppl.employees.length} on roster #${rosterLoc} from ${file.name}`);
              saveEmployeeSkills(ppl.employees,{rosterLoc,replace:!!rosterLoc}).catch(e=>console.warn('[employee_skills] save error:',e));
            }
            loaded.push({name:file.name,type});
          } else {
            // Guard: refuse a period-summary Operations Report (no per-day date
            // column). Daily rows are the source of truth — a period total
            // corrupts daily forecasts and record-day math. Skip it and flag it.
            if((type.type==='ops_report'||type.type==='combined')&&!opsReportIsDaily(wb)){
              _skipped.push(file.name);
              console.warn('[Meridian] Skipped period-summary Operations Report (no daily dates):',file.name);
              continue;
            }
            const _bL=currentDS.laborRows.length,_bF=(currentDS.fobRows||[]).length,_bO=currentDS.opsRows.length,_bC=currentDS.ctrlRows.length,_bPS=(currentDS.peaksSvcRows||[]).length,_bPA=(currentDS.peaksSalesRows||[]).length,_bA=(currentDS.auditRows||[]).length;
            currentDS=mergeDS(currentDS,wb,type,file.name);
            _freshLaborRows.push(...currentDS.laborRows.slice(_bL));
            _freshFobRows.push(...(currentDS.fobRows||[]).slice(_bF));
            _freshOpsRows.push(...currentDS.opsRows.slice(_bO));
            _freshCtrlRows.push(...currentDS.ctrlRows.slice(_bC));
            _freshPeakSvcRows.push(...(currentDS.peaksSvcRows||[]).slice(_bPS));
            _freshPeakSalesRows.push(...(currentDS.peaksSalesRows||[]).slice(_bPA));
            _freshAuditRows.push(...(currentDS.auditRows||[]).slice(_bA));
            loaded.push({name:file.name,type});
            // Cloud sync — upload raw file so other devices can auto-ingest it
            if(supabase&&!file._pendingId&&!file._manualSyncId&&type.type!=='unknown')
              uploadReportFile(file,type.type).then(rec=>_markSynced(rec?.id)).catch(()=>{});
          }
        }
      }catch(e){
        console.error('File parse error:',file.name,e);
        const _st=String((e&&e.stack)||'').split('\n').slice(0,3).map(s=>s.trim().replace(/https?:\/\/[^ )]*\//g,'')).join(' ‹ ').slice(0,240);
        _errored.push({name:file.name, msg:String((e&&(e.message||e.name))||e).slice(0,160), stack:_st});
        setLoadMsg('⚠ Error reading '+file.name);
      }
    }
    // Re-sync userEvents from localStorage before the transition — autoTagHolidays
    // runs inside mergeDS and writes directly to localStorage; read it back now
    // so the transition render gets the correct events on first pass.
    let _uploadEvents=null;
    try{_uploadEvents=JSON.parse(localStorage.getItem('mf_events')||'{}');}catch(e){console.warn('userEvents re-sync after load failed:',e);}
    React.startTransition(()=>{
      setDs(currentDS);
      if(_uploadEvents) setUserEvents(_uploadEvents);
    });
    try { setSignals(computeInsights(currentDS)); } catch(e) { console.warn('[insights] error:', e); }
    // Recompute custom signals and persist history
    if(customSignalDefs.length>0){
      try{
        const activeDefs=customSignalDefs.filter(d=>d.status!=='graveyard');
        const results=computeAllCustomSignals(activeDefs,currentDS);
        const today=new Date().toISOString().slice(0,10);
        for(const def of activeDefs){
          const sig=results[def.id];
          if(sig&&sig.r!=null){
            appendCustomSignalHistory(def.id,sig.r,sig.n,def.history||[]).catch(()=>{});
            setCustomSignalDefs(prev=>prev.map(d=>d.id===def.id?{...d,latest_r:sig.r,latest_n:sig.n,history:[...(d.history||[]),{date:today,r:sig.r,n:sig.n}].slice(-50)}:d));
          }
        }
      }catch(e){console.warn('[custom signals] recompute error:',e);}
    }
    // Persist new rows to Supabase for cross-device sync
    if(supabase){
      const newDarRows=(currentDS.darRows||[]).filter(r=>!_prevDarKeys.has(r.loc+'|'+_toDs(r)+'|'+(r.hour||'')));
      const _freshPeaksAll=[..._freshPeakSvcRows,..._freshPeakSalesRows];
      if(_freshLaborRows .length>0) saveLaborRows (_freshLaborRows ).catch(e=>console.warn('[labor_rows] save error:',e));
      if(_freshFobRows   .length>0) saveFobRows   (_freshFobRows   ).catch(e=>console.warn('[fob_rows] save error:',e));
      if(_freshOpsRows   .length>0) saveOpsRows   (_freshOpsRows   ).catch(e=>console.warn('[ops_rows] save error:',e));
      if(_freshCtrlRows  .length>0) saveCtrlRows  (_freshCtrlRows  ).catch(e=>console.warn('[ctrl_rows] save error:',e));
      if(newDarRows      .length>0) saveDarRows   (newDarRows      ).catch(e=>console.warn('[dar_rows] save error:',e));
      if(_freshPeaksAll  .length>0) savePeaksRows (_freshPeaksAll  ).catch(e=>console.warn('[peaks_rows] save error:',e));
      if(_freshAuditRows .length>0) saveAuditRows (_freshAuditRows ).catch(e=>console.warn('[audit_rows] save error:',e));
    }
    const names=loaded.map(f=>f.name.replace(/\.[^.]+$/,'').split(' ').slice(0,3).join(' ')).join(', ');
    const _skipMsg=_skipped.length?'  ⚠ Skipped '+_skipped.length+' period-summary file'+(_skipped.length>1?'s':'')+' (no daily dates — upload the daily Operations Report instead)':'';
    setLoadMsg((loaded.length?'✓ '+names+' loaded · '+currentDS.storeIds.length+' stores':'⚠ No files loaded')+_skipMsg);
    // ── Content-based upload summary ─────────────────────────────────────────
    // SMG bakes every export as "eu065119 (N).pdf" — the name carries no month
    // or type — so summarize by CONTENT: group by report type, list the distinct
    // months each file resolved to, and flag received-vs-errored so same-name
    // collisions (fewer files delivered than dropped) are visible.
    try{
      const _fmtP=p=>{ if(!p) return '?'; const [y,m]=p.split('-'); return new Date(+y,+m-1).toLocaleDateString('en-US',{month:'short',year:'numeric'}); };
      const groups={};
      for(const f of loaded){
        const label=f.type?.label||f.type?.type||'Other';
        (groups[label]=groups[label]||{files:0,periods:new Set()}).files++;
        for(const p of (f.periods||[])) groups[label].periods.add(p);
      }
      const lines=Object.entries(groups).map(([label,g])=>{
        const months=[...g.periods].sort().map(_fmtP);
        return { label, files:g.files, months };
      });
      // Cloud-save problems (e.g. a missing Supabase table) — parsing succeeds
      // but the data never persists, so the panel only shows the current session.
      const saveErrs=[...new Set(loaded.filter(f=>f.saveErr).map(f=>f.saveErr))];
      setUploadReport({ received:fileArr.length, loaded:loaded.length, errored:_errored.slice(), skipped:_skipped.slice(), lines, saveErrs });
    }catch(e){ console.warn('[upload-summary]',e); }
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
                  const errs=[],wts=[];
                  for(let i=20;i<evalDates.length;i++){
                    if(i>20&&(i-20)%5===0) await new Promise(r=>setTimeout(r,0)); // yield every 5 dates
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
            try{const aeBlob={params:recalib,ts:Date.now()};localStorage.setItem('mf_ae_params',JSON.stringify(aeBlob));saveUserSetting('ae_params',aeBlob).catch(()=>{});}catch{}
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

  // Drag-drop — with visual overlay while a file is held over the window
  useEffect(()=>{
    const prevent   = (e)=>{e.preventDefault();e.stopPropagation();};
    const onEnter   = (e)=>{e.preventDefault();dragCounter.current++;setIsDragging(true);};
    const onLeave   = (e)=>{e.preventDefault();dragCounter.current--;if(dragCounter.current<=0){dragCounter.current=0;setIsDragging(false);}};
    const onDrop    = (e)=>{
      e.preventDefault();e.stopPropagation();
      dragCounter.current=0;setIsDragging(false);
      const files=e.dataTransfer&&e.dataTransfer.files;
      if(files&&files.length)handleFiles(files);
    };
    document.addEventListener('dragover',prevent);
    document.addEventListener('dragenter',onEnter);
    document.addEventListener('dragleave',onLeave);
    document.addEventListener('drop',onDrop);
    return()=>{
      document.removeEventListener('dragover',prevent);
      document.removeEventListener('dragenter',onEnter);
      document.removeEventListener('dragleave',onLeave);
      document.removeEventListener('drop',onDrop);
    };
  },[handleFiles]);

  // Web Share Target — pick up files stashed by the service worker after a mobile share
  useEffect(()=>{
    if(!('caches' in window)) return;
    caches.open('mf-share-v1').then(async cache=>{
      const keys=await cache.keys();
      if(!keys.length) return;
      const files=await Promise.all(keys.map(async req=>{
        const resp=await cache.match(req);
        if(!resp) return null;
        const blob=await resp.blob();
        const name=resp.headers.get('X-File-Name')||'shared-file.xlsx';
        return new File([blob],name,{type:blob.type||'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      }));
      await Promise.all(keys.map(k=>cache.delete(k)));
      const valid=files.filter(Boolean);
      if(valid.length) handleFiles(valid);
    }).catch(()=>{});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Keyboard shortcuts — Cmd/Ctrl+U opens the file upload picker
  useEffect(()=>{
    const onKey=(e)=>{
      if((e.metaKey||e.ctrlKey)&&e.key==='u'){
        e.preventDefault();
        document.getElementById('file-input-main')?.click();
      }
    };
    document.addEventListener('keydown',onKey);
    return()=>document.removeEventListener('keydown',onKey);
  },[]);

  // Permission helper — used by AppSidebar, AppTopbar, and modal gates
  const perm = (key) => hasPermission(userRole, key, orgRoles);

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
    showDICompare||showDataManager||showDev||showDialedIn||showDtSoS||showEvents||showFOB||showFcstAccuracy||
    showGMBrief||showHelp||showInsights||showInventory||showKB||showLFZGap||showLaborAnalytics||
    showLifeLenzBridge||showLocIntel||showModelAssign||
    showMorningBrief||showEOMSummary||showOnePager||showOperatorSummary||showPMix||showPVSA||showPace||showYearly||showPromoRoi||showVisitReady||showSchedSum||
    showPerfCalc||showPriorityBrief||showProj||showProjBriefSA||showRanking||
    showReport||showRevIntel||showSettings||showSmartTargets||showStoreKB||
    showTargets||showUnifiedTargets||showWhyEngine||showChannelIntel||showPerfReviews||showRecordDay||showAdminPanel||showDeliveryMix||showScheduling||showSMGVoice||showMonthlyProj||showSignals||showSage||showFeatureRequests||showGradedVisits||showSmartTargetsV2||showLaborAnalysis||showSkillsMatrix||showPlanningHub||showSchedHub||showPanelManager;

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
      setShowFOB(false);setShowFcstAccuracy(false);setShowDtSoS(false);setShowGradedVisits(false);setShowGMBrief(false);setShowHelp(false);
      setShowInsights(false);setShowInventory(false);setShowKB(false);setShowLFZGap(false);
      setShowLaborAnalytics(false);setShowLifeLenzBridge(false);setShowLocIntel(false);
      setShowModelAssign(false);setShowMorningBrief(false);setShowEOMSummary(false);setShowEOMDash(false);setShowOnePager(false);
      setShowOperatorSummary(false);setShowPMix(false);setShowPVSA(false);setShowPerfCalc(false);
      setShowPriorityBrief(false);setShowProj(false);setShowProjBriefSA(false);setShowRanking(false);
      setShowReport(false);setShowRevIntel(false);setShowSettings(false);setShowSmartTargets(false);
      setShowStoreKB(false);setShowTargets(false);setShowUnifiedTargets(false);setShowWhyEngine(false);setShowFcstRef(false);setShowChannelIntel(false);setShowPerfReviews(false);setShowRecordDay(false);setShowAdminPanel(false);setShowDeliveryMix(false);setShowScheduling(false);setShowSMGVoice(false);setShowMonthlyProj(false);setShowSignals(false);setShowSage(false);setShowPlanningHub(false);setShowSchedHub(false);setShowPanelManager(false);
    };
    document.addEventListener('keydown', onKey);
    return ()=>document.removeEventListener('keydown', onKey);
  },[]);

  return div({className:'mf-app-root',style:{height:'100vh',display:'flex',background:'var(--bg)',color:'var(--text)',fontFamily:'var(--sans)',overflow:'hidden'}},

    // ── Drag-drop overlay ─────────────────────────────────────────
    isDragging&&div({style:{
      position:'fixed',inset:0,zIndex:2000,
      background:'rgba(245,188,0,.06)',
      border:'2px dashed rgba(245,188,0,.5)',
      display:'flex',alignItems:'center',justifyContent:'center',
      pointerEvents:'none',
    }},
      div({style:{
        background:'var(--surf)',border:'1px solid rgba(245,188,0,.3)',
        borderRadius:16,padding:'28px 48px',textAlign:'center',
        boxShadow:'0 20px 60px rgba(0,0,0,.5)',
      }},
        div({style:{fontSize:40,marginBottom:12}},'📂'),
        div({style:{fontSize:18,fontWeight:700,color:'var(--amber)',marginBottom:6}},'Drop to load files'),
        div({style:{fontSize:11,color:'var(--text3)'}},'Operations Report · Labor · Lifelenz · CSV')
      )
    ),

    // ── LEFT SIDEBAR ─────────────────────────────────────────────
    h(AppSidebar,{
      view, setView,
      selStore,
      stores, ds, settings,
      loadMsg,
      perm,
      betaMode,
      panelVis,
      onLoadFiles: () => document.getElementById('file-input-main')&&document.getElementById('file-input-main').click(),
      onSaveSession: handleSaveSession,
      onRestoreSession: handleRestoreSession,
      onOpenModal: (modal) => {
        if(modal==='ranking'||modal.startsWith('ranking:')){
          if(!perm('analytics.store')) return;
          setShowRanking(true);
          setRankingDefault(modal.includes(':')?modal.split(':')[1]:'score');
        }
        if(modal==='aiscan')         perm('analytics.ai')&&setShowAIScan(p=>!p);
        if(modal==='why-engine')     perm('analytics.ai')&&setShowWhyEngine(true);
        // Scheduling hub (Notes 24): one modal, tabs. Legacy per-panel ids deep-link to the right tab.
        if(modal==='sched-hub')       perm('analytics.store')&&(setSchedTab('scheduling'),setShowSchedHub(true));
        if(modal==='labor-analytics') perm('analytics.labor')&&(setSchedTab('analytics'),setShowSchedHub(true));
        if(modal==='delivery-mix')    perm('analytics.store')&&setShowDeliveryMix(true);
        if(modal==='scheduling')      perm('analytics.store')&&(setSchedTab('scheduling'),setShowSchedHub(true));
        if(modal==='morning-brief')  perm('analytics.brief')&&setShowMorningBrief(true);
        if(modal==='eom-summary')    perm('analytics.district')&&setShowEOMSummary(true);
        if(modal==='eom-dashboard')  perm('analytics.district')&&setShowEOMDash(true);
        if(modal==='brief')          perm('analytics.brief')&&(()=>{
          if(selStore) setBriefScope({scope:'store',label:sNameC(selStore),locs:[selStore]});
          else setBriefScope({scope:'district',label:settings.districtNameShort||'District',locs:null});
          setShowBrief(true);
        })();
        if(modal==='priority-brief') perm('analytics.brief')&&setShowPriorityBrief(true);
        if(modal==='operator-summary')  perm('analytics.district')&&setShowOperatorSummary(true);
        // Planning hub (Notes 24): one modal, five tabs. Legacy per-panel ids deep-link to the right tab.
        if(modal==='planning')          perm('analytics.store')&&(setPlanningTab('targets'),setShowPlanningHub(true));
        if(modal==='monthly-proj')      perm('analytics.store')&&(setPlanningTab('monthly'),setShowPlanningHub(true));
        if(modal==='district-lens')  perm('analytics.district')&&setShowDistrictLens(true);
        if(modal==='data-manager')   perm('data.upload')&&setShowDataManager(true);
        if(modal==='settings')       perm('settings.view')&&setShowSettings(true);
        if(modal==='panel-manager')  perm('settings.view')&&setShowPanelManager(true);
        if(modal==='perf-reviews')   perm('reviews.view')&&setShowPerfReviews(true);
        if(modal==='proj')           perm('analytics.forecasting')&&setShowProj(true);
        if(modal==='proj-brief')     perm('analytics.forecasting')&&setShowProjBriefSA(true);
        if(modal==='dialedin')       perm('analytics.forecasting')&&setShowDialedIn(true);
        if(modal==='pvsa')           perm('analytics.forecasting')&&setShowPVSA(true);
        if(modal==='pace-target')    perm('analytics.store')&&(setPlanningTab('pace'),setShowPlanningHub(true));
        if(modal==='yearly-proj')    perm('analytics.store')&&(setPlanningTab('yearly'),setShowPlanningHub(true));
        if(modal==='promo-roi')      perm('analytics.store')&&setShowPromoRoi(true);
        if(modal==='visit-readiness')perm('analytics.store')&&setShowVisitReady(true);
        if(modal==='sched-summary')  perm('analytics.store')&&(setSchedTab('summary'),setShowSchedHub(true));
        if(modal==='dicompare')      perm('analytics.forecasting')&&setShowDICompare(true);
        if(modal==='model-assign')   perm('analytics.forecasting')&&setShowModelAssign(true);
        if(modal==='fcst-accuracy')  perm('analytics.forecasting')&&setShowFcstAccuracy(true);
        if(modal==='dt-sos')         perm('analytics.store')&&setShowDtSoS(true);
        if(modal==='graded-visits')  perm('analytics.store')&&setShowGradedVisits(true);
        if(modal==='lfz-gap')        perm('analytics.forecasting')&&setShowLFZGap(true);
        if(modal==='fcst-ref')       perm('analytics.forecasting')&&setShowFcstRef(true);
        if(modal==='lifelenz-bridge') perm('analytics.forecasting')&&setShowLifeLenzBridge(true);
        if(modal==='revintel')       perm('analytics.store')&&setShowRevIntel(true);
        if(modal==='compare')        perm('analytics.store')&&setShowCompare(true);
        if(modal==='report')         setShowReport(true);
        if(modal==='about')          setShowAbout(true);
        if(modal==='targets')        setShowTargets(true);
        if(modal==='events')         setShowEvents(true);
        if(modal==='help')           setShowHelp(true);
        if(modal==='kb')             setShowKB(true);
        if(modal==='smart-targets')  setShowSmartTargets(true);
        if(modal==='loc-intel')      perm('analytics.store')&&setShowLocIntel(true);
        if(modal==='inventory')      perm('analytics.store')&&setShowInventory(true);
        if(modal==='fob-analysis')   perm('analytics.store')&&setShowFOB(true);
        if(modal==='fob-eom')        perm('analytics.store')&&setShowFOBEOM(true);
        if(modal==='smg-voice')      perm('analytics.store')&&setShowSMGVoice(true);
        if(modal==='store-kb')       perm('analytics.store')&&setShowStoreKB(true);
        if(modal==='one-pager')      perm('analytics.store')&&setShowOnePager(true);
        if(modal==='gm-brief')       perm('analytics.store')&&setShowGMBrief(true);
        if(modal==='calendar-manager') perm('analytics.dashboard')&&setShowCalendarManager(true);
        if(modal==='channel-intel')  perm('analytics.store')&&setShowChannelIntel(true);
        if(modal==='dar-daypart')    perm('analytics.store')&&setShowDARDaypart(true);
        if(modal==='pmix')           perm('analytics.store')&&setShowPMix(true);
        if(modal==='record-day')     perm('analytics.store')&&setShowRecordDay(true);
        if(modal==='perf-calc')      perm('analytics.store')&&setShowPerfCalc(true);
        if(modal==='corr-explorer')  perm('analytics.store')&&setShowCorrExplorer(true);
        if(modal==='unified-targets') perm('analytics.store')&&(setPlanningTab('targets'),setShowPlanningHub(true));
        if(modal==='signals')        perm('analytics.store')&&setShowSignals(true);
        if(modal==='smart-targets-v2')perm('analytics.store')&&(setPlanningTab('smart'),setShowPlanningHub(true));
        if(modal==='labor-analysis')  perm('analytics.store')&&(setSchedTab('analysis'),setShowSchedHub(true));
        if(modal==='skills-matrix')   perm('analytics.store')&&(setSchedTab('skills'),setShowSchedHub(true));
        if(modal==='sage')              setShowSage(true);
        if(modal==='feature-requests')  setShowFeatureRequests(true);
        if(modal==='task-queue')        setShowTaskQueue(true);
        if(modal==='attention')      setShowAttention(true);
        if(modal==='priorities')     setShowPriorities(true);
        if(modal==='forms-print')    setShowFormsPrint(true);
        if(modal==='leader-one-pager') setShowLeaderOnePager(true);
        if(modal==='metric-lineage')   setShowMetricLineage(true);
        if(modal==='forms-library')    setShowFormsLibrary(true);
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
        perm,
        onLoadFiles: () => document.getElementById('file-input-main')&&document.getElementById('file-input-main').click(),
        onSaveSession: handleSaveSession,
        sessionBanner,
        onClearSession: handleClearSession,
        userRole,
        onOpenAdmin: perm('users.manage.all') ? () => setShowAdminPanel(true) : null,
        betaMode,
        onToggleBeta: perm('users.manage.all') ? toggleBetaMode : null,
        onOpenModal: (modal) => {
          if(modal==='settings')   setShowSettings(true);
          if(modal==='help')       setShowHelp(true);
          if(modal==='proj-brief') setShowProjBriefSA(true);
        }
      }),

      // Hidden file input wired to the sidebar Load button
      // accept covers every type handleFiles routes: spreadsheets, SMG/VOICE
      // PDFs (comments / performance / daypart), and graded-visit HTML. iOS's
      // Files picker HARD-restricts to this list (no "All files" override), so
      // omitting .pdf silently greys out every PDF on iPhone.
      h('input',{id:'file-input-main',type:'file',multiple:true,
        accept:'.xlsx,.xlsm,.xls,.csv,.pdf,.html,.htm,application/pdf,text/html',
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
          else if(modal==='eom-dashboard')perm('analytics.district')&&setShowEOMDash(true);
          else if(modal==='fob-analysis')setShowFOB&&setShowFOB(true);
          else if(modal==='labor-analytics'){setSchedTab&&setSchedTab('analytics');setShowSchedHub&&setShowSchedHub(true);}
          else if(modal==='fcst-accuracy')setShowFcstAccuracy&&setShowFcstAccuracy(true);
        }}),
      view==='district'&&!selStore&&h(DistrictGrid,{stores,ds,settings,dateRange,userEvents,onSelectStore:goStore}),
      view==='store'&&selStore&&h(StoreDash,{store:stores.find(s=>s.loc===selStore)||stores[0],ds,settings,allStores:stores,onBack:()=>{setView('district');setSelStore(null);},onNav:goStore,dateRange,userEvents}),
      view==='patch'&&h(OrgView,{stores,settings,onSelectStore:goStore,groupBy:'patch'}),
      view==='org'&&h(OrgView,{stores,settings,onSelectStore:goStore,groupBy:'operator'})
    )  // close main content scroll area
    )  // close right panel flex-col

  , // Modals rendered at root of the flex layout (position:fixed, so location in tree doesn't matter)
    showSettings &&h(Settings, {settings,onUpdate:saveSettings,onClose:()=>setShowSettings(false),userRole,onClearAll:handleClearAll,onOpenStoreNotes:()=>setShowStoreKB(true)}),
    showRanking  &&h(RankingView,{stores,ds,settings,dateRange,onDateChange:setDateRange,defaultMetric:rankingDefault,onSelectStore:s=>{goStore(s);setShowRanking(false);},onClose:()=>setShowRanking(false)}),
    showTargets  &&h(MonthlyTargetManager,{userTargets,mergedTargets,onUpdate:saveUserTargets,onClose:()=>setShowTargets(false),ds}),
    // Planning hub (Notes 24): Targets / Monthly / Pace / Yearly / Smart Targets as lazy tabs
    showPlanningHub&&h(PlanningHubPanel,{ds,stores,settings,customSignalDefs,initialTab:planningTab,onClose:()=>setShowPlanningHub(false)}),
    // Scheduling hub (Notes 24): Labor Analytics / Scheduling / Schedule Summary / Labor Analysis / Skills as lazy tabs
    showSchedHub&&h(SchedulingHubPanel,{ds,stores,settings,perm,initialTab:schedTab,onClose:()=>setShowSchedHub(false)}),
    // Panel Manager (Notes 24): show/hide + reference for optional/experimental panels
    showPanelManager&&h(PanelManagerPanel,{vis:panelVis,perm,onToggle:togglePanelVis,onShowAll:()=>setAllPanelVis(true),onHideAll:()=>setAllPanelVis(false),onClose:()=>setShowPanelManager(false)}),
    showPerfCalc&&h(PerformanceCalculator,{stores,ds,settings,onClose:()=>setShowPerfCalc(false)}),
    showCorrExplorer&&h(MetricCorrelationExplorer,{stores,ds,settings,onClose:()=>setShowCorrExplorer(false)}),
    showDistrictLens&&h(DistrictLensPanel,{stores,ds,settings,onClose:()=>setShowDistrictLens(false)}),
    showModelAssign&&h(ModelAssignmentPanel,{stores,ds,settings,userEvents,onClose:()=>setShowModelAssign(false)}),
    showOnePager&&h(StoreOnePager,{stores,ds,settings,onClose:()=>setShowOnePager(false)}),
    showGMBrief&&h(GMCoachingBrief,{stores,ds,settings,userEvents,onClose:()=>setShowGMBrief(false)}),
    showDARDaypart&&h(DARDaypartPanel,{stores,ds,settings,onClose:()=>setShowDARDaypart(false)}),
    showDataManager&&h(DataManagerPanel,{ds,idbCoverage,onClose:()=>setShowDataManager(false),
      onOpenStoreConfig:()=>{setShowDataManager(false);setShowStoreVlhConfig(true);}}),
    showStoreVlhConfig&&h(StoreVlhConfigPanel,{onClose:()=>setShowStoreVlhConfig(false)}),
    showPromoRoi&&h(PromoRoiPanel,{ds,onClose:()=>setShowPromoRoi(false)}),
    showVisitReady&&h(VisitReadinessPanel,{ds,onClose:()=>setShowVisitReady(false)}),
    showLFZGap&&h(LifelenzGapPanel,{ds,settings,onClose:()=>setShowLFZGap(false)}),
    showPMix&&h(ProductMixPanel,{stores,ds,settings,onClose:()=>setShowPMix(false)}),
    showEvents   &&h(EventCalendar,{userEvents,onUpdate:saveUserEvents,onClose:()=>setShowEvents(false),stores}),
    showCalendarManager&&h(CalendarManagerPanel,{stores,ds,settings,userEvents,onUpdate:saveUserEvents,onClose:()=>setShowCalendarManager(false)}),
    showWhyEngine&&h(WhyEnginePanel,{stores,ds,settings,userEvents,onUpdate:saveUserEvents,onClose:()=>setShowWhyEngine(false)}),
    showChannelIntel&&h(ChannelIntelligencePanel,{stores,ds,onClose:()=>setShowChannelIntel(false)}),
    showPerfReviews&&h(PerformanceReviewsPanel,{stores,ds,settings,userRole,orgRoles,onClose:()=>setShowPerfReviews(false)}),
    showRecordDay&&h(RecordDayPanel,{stores,ds,onClose:()=>setShowRecordDay(false)}),
    showAdminPanel&&h(AdminPanel,{onClose:()=>setShowAdminPanel(false),orgRoles,setOrgRoles}),
    showLifeLenzBridge&&h(LifeLenzBridgePanel,{stores,ds,settings,userEvents,onClose:()=>setShowLifeLenzBridge(false)}),
    showCompare  &&h(MultiStoreComparison,{stores,ds,settings,onSelectStore:s=>{goStore(s);setShowCompare(false);},onClose:()=>setShowCompare(false)}),
    showInsights &&h(AIInsightsLog,{stores,settings,onClose:()=>setShowInsights(false)}),
    showRevIntel &&h(RevenueIntelligence,{stores,ds,settings,userEvents,onSelectStore:s=>{goStore(s);setShowRevIntel(false);},onClose:()=>setShowRevIntel(false)}),
    showDev      &&h(DevDashboard,{ds,settings,stores,userEvents,onClose:()=>setShowDev(false)}),
    showKB&&h(KnowledgeBasePanel,{onClose:()=>setShowKB(false)}),
    uploadReport&&h(UploadSummaryModal,{report:uploadReport,onClose:()=>setUploadReport(null)}),
    showSmartTargets&&h(SmartTargetPanel,{stores,ds,settings,onClose:()=>setShowSmartTargets(false)}),
    showLocIntel&&h(LocationIntelligence,{allStores:stores,ds,settings,scope:'district',onClose:()=>setShowLocIntel(false)}),
    showInventory&&h(InventoryIntelligence,{stores,ds,settings,onClose:()=>setShowInventory(false)}),
    showFOB&&h(FOBAnalysisPanel,{stores,ds,settings,onClose:()=>setShowFOB(false)}),
    showFOBEOM&&h(FOBEOMPanel,{stores,ds,settings,onClose:()=>setShowFOBEOM(false)}),
    showSMGVoice&&h(SMGVoicePanel,{ds,stores,voicePerf:ds?.smgVoicePerf||[],voiceDaypart:ds?.voiceDaypart||[],onBackfillComments:backfillSmgComments,onClose:()=>setShowSMGVoice(false)}),
    showDeliveryMix&&h(DeliveryMixPanel,{ds,onClose:()=>setShowDeliveryMix(false)}),
    showSignals&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.88)',zIndex:360,display:'flex',flexDirection:'column',overflow:'hidden'}},
      div({style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'calc(12px + env(safe-area-inset-top,0px)) 16px 12px',borderBottom:'1px solid rgba(255,255,255,.1)',flexShrink:0}},
        span({style:{fontFamily:"'Syne',sans-serif",fontWeight:900,fontSize:'15px',letterSpacing:'-.02em'}},'📡 Signals'),
        h('button',{onClick:()=>setShowSignals(false),style:{background:'none',border:'none',cursor:'pointer',color:'#9ca3af',fontSize:'26px',lineHeight:1,padding:'4px 8px',margin:'-4px -8px',minWidth:'44px',minHeight:'44px',display:'flex',alignItems:'center',justifyContent:'center'}},'×'),
      ),
      div({style:{flex:1,overflowY:'auto',background:'var(--surf)'}},
        h(SignalsPanel,{ds,signals,customSignalDefs,onCustomDefsChange:setCustomSignalDefs,darRows,refreshDar}),
      ),
    ),
    // SAGE stays MOUNTED while minimized (display toggled) so the session keeps
    // running in the background and you can look at other Meridian data at the
    // same time. The floating pill (below) shows red while thinking, green when ready.
    showSage&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.88)',zIndex:360,display:sageMin?'none':'flex',flexDirection:'column',overflow:'hidden'}},
      div({style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'calc(12px + env(safe-area-inset-top,0px)) 20px 12px',borderBottom:'1px solid rgba(255,255,255,.1)',flexShrink:0}},
        div({style:{display:'flex',alignItems:'center',gap:8}},
          span({style:{width:8,height:8,borderRadius:'50%',background:sageBusy?'#ef4444':'#10b981',boxShadow:'0 0 6px '+(sageBusy?'#ef4444':'#10b981')}}),
          span({style:{fontFamily:"'Syne',sans-serif",fontWeight:900,fontSize:'15px',letterSpacing:'-.02em',color:'var(--text)'}},'🧠 SAGE'),
          sageBusy&&span({style:{fontSize:'10px',color:'#ef4444',fontWeight:700}},'working…')),
        div({style:{display:'flex',alignItems:'center',gap:2}},
          h('button',{onClick:()=>setSageMin(true),title:'Minimize — keep SAGE running while you look at other data',style:{background:'none',border:'none',cursor:'pointer',color:'#9ca3af',fontSize:'22px',lineHeight:1,padding:'4px 8px',minWidth:'44px',minHeight:'44px',display:'flex',alignItems:'center',justifyContent:'center'}},'—'),
          h('button',{onClick:()=>{setShowSage(false);setSageMin(false);setSageBusy(false);},title:'Close',style:{background:'none',border:'none',cursor:'pointer',color:'#9ca3af',fontSize:'26px',lineHeight:1,padding:'4px 8px',margin:'-4px -8px',minWidth:'44px',minHeight:'44px',display:'flex',alignItems:'center',justifyContent:'center'}},'×')),
      ),
      div({style:{flex:1,overflowY:'hidden',background:'var(--bg)',display:'flex',flexDirection:'column'}},
        h(SagePanel,{ds,signals,customSignalDefs,onBusy:setSageBusy}),
      ),
    ),
    // Minimized pill — click to restore. Red dot = thinking, green = ready.
    showSage&&sageMin&&div({onClick:()=>setSageMin(false),style:{position:'fixed',right:16,bottom:'calc(16px + env(safe-area-inset-bottom,0px))',zIndex:361,display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:'999px',background:'var(--surf,#1e293b)',border:'1px solid '+(sageBusy?'rgba(239,68,68,.5)':'rgba(16,185,129,.5)'),boxShadow:'0 8px 30px rgba(0,0,0,.5)',cursor:'pointer'}},
      span({style:{width:9,height:9,borderRadius:'50%',background:sageBusy?'#ef4444':'#10b981',boxShadow:'0 0 8px '+(sageBusy?'#ef4444':'#10b981')}}),
      span({style:{fontFamily:"'Syne',sans-serif",fontWeight:900,fontSize:'13px',color:'var(--text)'}},'🧠 SAGE'),
      span({style:{fontSize:'10px',fontWeight:700,color:sageBusy?'#ef4444':'#10b981'}},sageBusy?'working…':'ready'),
    ),
    showFeatureRequests&&h(FeatureRequestsPanel,{ds,settings,onClose:()=>setShowFeatureRequests(false)}),
    showTaskQueue&&h(TaskQueuePanel,{onClose:()=>setShowTaskQueue(false)}),
    showPriorityBrief&&h(DistrictPriorityBrief,{stores,ds,settings,userEvents,onSelectStore:s=>{goStore(s);setShowPriorityBrief(false);},onClose:()=>setShowPriorityBrief(false)}),
    showOperatorSummary&&h(OperatorSummaryPanel,{stores,ds,settings,onClose:()=>setShowOperatorSummary(false)}),
    showStoreKB&&h(StoreKBEditor,{onClose:()=>setShowStoreKB(false),ds}),
    showFcstRef&&h('div',{style:{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',zIndex:400,display:'flex',flexDirection:'column',padding:'20px'},onClick:e=>{if(e.target===e.currentTarget)setShowFcstRef(false);}},
      h('div',{style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',display:'flex',flexDirection:'column',flex:1,maxWidth:1100,margin:'0 auto',width:'100%',overflow:'hidden'}},
        h('div',{style:{display:'flex',alignItems:'center',gap:12,padding:'12px 18px',borderBottom:'.5px solid var(--bdr)',flexShrink:0}},
          h('span',{style:{fontSize:'14px',fontWeight:700}},'📐 Forecasting Reference'),
          h('span',{style:{fontSize:'10px',color:'var(--text3)',flex:1}},'All calculation formulas, model weights, and calibration parameters'),
          h('button',{onClick:()=>{const f=document.getElementById('fcst-ref-frame');if(f)f.contentWindow.print();},
            style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',padding:'5px 14px',cursor:'pointer',color:'var(--text)',fontSize:'11px',fontWeight:600,marginRight:6}},
            '⬇ Download PDF'),
          h('button',{onClick:()=>window.open('/forecast-reference.html','_blank'),
            style:{background:'var(--surf2)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',padding:'5px 14px',cursor:'pointer',color:'var(--text)',fontSize:'11px',fontWeight:600,marginRight:6}},
            '↗ Open Full Page'),
          h('button',{onClick:()=>setShowFcstRef(false),style:{background:'none',border:'none',color:'var(--text2)',fontSize:20,cursor:'pointer',lineHeight:1}},'×')
        ),
        h('iframe',{id:'fcst-ref-frame',src:'/forecast-reference.html',style:{flex:1,border:'none',background:'#fff'}})
      )
    ),
    showFcstAccuracy&&h(ForecastAccuracyPanel,{stores,ds,settings,userEvents,onClose:()=>setShowFcstAccuracy(false)}),
    showDtSoS&&h(DTSpeedOfServicePanel,{stores,onClose:()=>setShowDtSoS(false)}),
    showGradedVisits&&h(GradedVisitsPanel,{ds,onClose:()=>setShowGradedVisits(false)}),
    showAttention&&h(AttentionPanel,{stores,onSelectStore:s=>{goStore(s);setShowAttention(false);},onClose:()=>setShowAttention(false)}),
    showPriorities&&h(WhatNeedsAttentionPanel,{ds,stores,dateRange,
      onOpenModal:(m)=>{ if(m==='fob-analysis')setShowFOB(true); else if(m==='signals')setShowSignals(true); else if(m==='eom-dashboard')setShowEOMDash(true); },
      onClose:()=>setShowPriorities(false)}),
    showFormsPrint&&h(FormsPrintPanel,{onClose:()=>setShowFormsPrint(false)}),
    showLeaderOnePager&&h(OnePagerPanel,{ds,stores,settings,onClose:()=>setShowLeaderOnePager(false)}),
    showMetricLineage&&h(MetricLineagePanel,{onClose:()=>setShowMetricLineage(false)}),
    showFormsLibrary&&h(FormsLibraryPanel,{onClose:()=>setShowFormsLibrary(false)}),
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
          display:'flex',alignItems:'center',gap:10,flexShrink:0}},
          div({style:{fontSize:'16px',fontWeight:800}},'📖 Meridian — Workflow Guide'),
          btn({
            onClick:()=>{setShowHelp(false);resetTutorial();setShowTutorial(true);},
            style:{marginLeft:'auto',padding:'5px 12px',fontSize:11,fontWeight:700,
              background:'var(--amber)',color:'#000',border:'none',borderRadius:6,cursor:'pointer'}
          },'▶ Start Tour'),
          btn({onClick:()=>setShowHelp(false),style:{background:'none',border:'none',
            color:'var(--text2)',fontSize:22,cursor:'pointer'}},'×')
        ),
        // Help content
        div({style:{overflowY:'auto',padding:'16px 20px',fontSize:'11px',lineHeight:1.7}},
          ...[
            {day:'DAILY (Every day you open the app)',color:'#10b981',items:[
              {t:'1. Load fresh data',d:'Upload the latest QSRSoft Operations Report (Sales + Service + Controls + FOB sheets) and Register Audit. Drag files onto the Data Manager or use the Load button. Target: data no older than 3 days. Also load Labor Analysis for Shift Analysis features.'},
              {t:'2. Check the Home Command Center',d:'Review At-a-Glance signal cards for district-level flags. Check the Projection Pulse for next-7-day forecast vs LY. Click any store showing red to open its dashboard.'},
              {t:'3. Review Priority Brief',d:'Click 🎯 Priority Brief for a tiered AI summary — Critical / Watch / Performance stores with specific coaching directives. Use this as your morning standup guide.'},
              {t:'4. Spot-check a store',d:'Click any store in the district grid → Store Dashboard. Review the Overview tab for OEPE, Labor%, TPPH, Cash O/S. Go to Shift Analysis for day-of-week patterns and channel mix. Open Intelligence Brief for AI-generated coaching letter.'},
            ]},
            {day:'WEEKLY (Every Wednesday — start of work week)',color:'#f59e0b',items:[
              {t:'1. Lock the weekly projection',d:'Open Projections (📋 button). Review all 27 stores with AI-generated forecasts. Check MAPE ±% next to store name — high MAPE = less reliable forecast. Double-click any cell to override. Lock rows when satisfied. Deadline: 10 days before week start.'},
              {t:'2. Run Projection vs Actuals report',d:'📊 Proj vs Act — 2–4 week backtest shows how accurate prior forecasts were. Stores consistently missing by >5% need recalibration in Dialed-In.'},
              {t:'3. Check Dialed-In for drifting stores',d:'Any store dashboard → Dialed-In. ⚠ drift warning = 2W MAPE significantly worse than 6W MAPE. Run ↺ Recalibrate on drifting stores. Run Calibrate All monthly.'},
              {t:'4. Review FOB Analysis',d:'Open FOB Analysis from the toolbar. Root-Cause Priority Matrix shows the highest-dollar coaching opportunities ranked by store + component. Focus on the top 3 items first.'},
              {t:'5. Generate Intelligence Briefs',d:'From any store: Intelligence Brief tab → Generate. For your weekly district review, use GM Coaching Letters to generate store-specific letters for each manager.'},
            ]},
            {day:'MONTHLY (By the 15th of prior month)',color:'#f87171',items:[
              {t:'1. Lock the monthly projection',d:'Open Projections → set Period to Month. Review all stores monthly totals with weekly sub-totals. Approve all stores. Deadline: 15th of the prior month.'},
              {t:'2. Calibrate all forecast models',d:'Dialed-In panel → Calibrate All. Updates every store model with latest 6+ weeks of actuals. Run monthly or whenever a store\'s MAPE is trending up. Takes ~15 seconds for all 27 stores.'},
              {t:'3. Review Channel Intelligence',d:'Open Channel Intel from the toolbar. Review Breakfast, MOP, Kiosk, and Delivery mix per store vs district average. Stores with unusually low digital mix may be missing sales opportunities.'},
              {t:'4. Revenue Intelligence Engine review',d:'Open Revenue Intel from toolbar. District OEPE opportunity shows total monthly revenue gain if all stores hit target. Use this for operator-level discussions about service speed impact.'},
              {t:'5. Operator roll-up briefs',d:'Generate Intelligence Briefs for each operator (Ryan, Gary, Rick/Kathy, Jacob) using the store groups or patch filter. Share with operators at monthly review meeting.'},
            ]},
            {day:'KEY FEATURES — Quick Reference',color:'#818cf8',items:[
              {t:'Store KB (📍)',d:'Per-store operational notes and context tags. Use Quick Tags (single click) for common factors: GM in Training, Capacity Limited, Tourist Area, New Location, etc. Tags inform AI analysis, anomaly thresholds, and forecast warnings.'},
              {t:'Shift Analysis tab',d:'Day-of-week ops metrics, channel mix heatmap, OEPE Revenue Opportunity, 3 Peaks × Labor Gap, and Competitive Impact. Click the nav pills at the top of the tab to scroll to each section. Load a 3 Peaks file to unlock peak-hour labor cross-reference.'},
              {t:'Why Engine',d:'Explains WHY a metric moved. Select a store and metric, and the engine correlates the move against weather, labor, promo, DOW, and competitive signals. Surfaces the most likely root cause with confidence score.'},
              {t:'Channel Intelligence',d:'Requires Operations Report (Sales sheet) to be loaded. Shows DT, Breakfast, MOP, Kiosk, and Delivery as % of total sales per store. Click a channel to see per-store ranking. Date range: 7/14/28/60 days.'},
              {t:'FOB Analysis',d:'Food Over Base analysis with Root-Cause Priority Matrix. Ranked by dollar impact per (store, component) — location appears first, then component. Expand any row for per-store breakdown. Use Print button for PDF export.'},
              {t:'Competitive Impact',d:'Tag competition events in the Calendar (competitor opening, promotion, closure) using the Competition event type. Shift Analysis → Competitive Impact then shows sales impact vs DOW baseline for those dates.'},
            ]},
            {day:'AS NEEDED — Automation Candidates',color:'#94a3b8',items:[
              {t:'Auto-actions currently handled',d:'• Data loading: manual (drag-drop weekly) · • Calibration: auto when 10+ new points · • Signals: refresh on load · • Deadline alerts: live calculated · • Session restore: opt-in banner on return visit'},
              {t:'Data freshness targets',d:'Operations Report: weekly minimum, daily for active projection periods · Labor Analysis: with every Operations Report · Register Audit: weekly · 3 Peaks: monthly · OpsTargets: when targets change'},
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
            [['27','Stores'],['5','Forecast Models'],
             [(['laborRows','qsrActSummaryRows','ctrlRows','opsRows','fobRows','qsrFobRows','glimpseRows','cashRows','salesLedgerRows','schedRows','smgRows','darRows'].reduce((a,k)=>a+((ds&&ds[k]&&ds[k].length)||0),0)).toLocaleString(),'Rows Loaded'],
             ['9','Correlation Rules']]
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
              '⚡ Architecture: Vite + React 19 · Supabase (Postgres + magic-link auth + Deno Edge Functions) · Dexie/OPFS cache · Vercel · Open-Meteo weather API'),
            div({style:{fontSize:'11px',color:'var(--text3)',lineHeight:'1.8',marginTop:'4px'}},
              '📊 Data sources: QSRSoft (auto-pull DAR/eBOS/FOB + emailed Glimpse/Cash/Sales-Ledger) · LifeLenz (auto-sync schedule + per-job) · SMG VOICE · 3 Peaks · Register Audit · manual upload fallback'),
            div({style:{fontSize:'11px',color:'var(--text3)',lineHeight:'1.8',marginTop:'4px'}},
              '🔒 Cloud-first: data saved to Supabase and loaded on any device, row-level-security scoped per role / accessible locations · magic-link sign-in')
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
          h(MorningBriefPanel,{ds,settings,customSignalDefs,darRows,refreshDar}))
      )
    ),
        showEOMSummary&&div({className:'mf-eom-print-modal',style:{position:'fixed',inset:0,background:'rgba(0,0,0,.88)',zIndex:360,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'16px',overflowY:'auto'}},
      div({className:'mf-eom-print-card',style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',width:'100%',maxWidth:1140,position:'relative'}},
        h('div',{className:'mf-eom-modal-chrome',style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 18px',borderBottom:'.5px solid var(--bdr2)',position:'sticky',top:0,background:'var(--surf)',zIndex:10}},
          h('div',null,
            h('div',{style:{fontFamily:"'Syne',sans-serif",fontSize:'16px',fontWeight:800,letterSpacing:'-.02em'}},'📊 EOM Supervisor Summary'),
            h('div',{style:{fontSize:'11px',color:'var(--text3)',marginTop:'2px'}},'Monthly P&L variance by store — filter by supervisor, operator, or all')),
          h('button',{onClick:()=>setShowEOMSummary(false),style:{background:'none',border:'none',color:'var(--text3)',fontSize:'20px',cursor:'pointer',lineHeight:1,padding:'0 4px'}},'✕')),
        div({style:{overflowY:'auto',maxHeight:'88vh'}},
          h(EOMSupervisorPanel,{ds,settings,supabase}))
      )
    ),
        showEOMDash&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.88)',zIndex:360,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'16px',overflowY:'auto'}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',width:'100%',maxWidth:1240,position:'relative'}},
        div({style:{overflowY:'auto',maxHeight:'92vh'}},
          h(EOMDashboardPanel,{stores,ds,settings,onClose:()=>setShowEOMDash(false)}))
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
    ),
    // ── First-run tutorial overlay (zIndex 500 — above everything) ──────────
    showTutorial&&h(TutorialOverlay,{onClose:()=>setShowTutorial(false)}),
    // ── Data policy notice (fixed-bottom, dismissed once per device) ─────────
    h(DataPolicyBanner, null)
  );
}

export default App;
