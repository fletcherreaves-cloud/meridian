// @ts-nocheck
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import * as XLSX from 'xlsx'
import { Chart } from 'chart.js/auto'
import '../meridian.css'

const ReactDOM = { createRoot }

import { addD, addDR, dKey, nDK, dowOf, sodOf, eodOf, setWeekStartDay, mwStart, nwStart, fmtDI, fmtRng, nDays, rngMode, dFmt, dFmtShort, dFmtDow, thisWeek } from '../utils/date.js';
import { isHoliday, getHolidayAdj, autoTagHolidays, buildHolidays, HOLIDAY_MAP } from '../utils/holidays.js';
import { DEFAULT_TARGETS, DEFAULT_MODEL_ASSIGNMENTS, MODEL_ASSIGNMENT_KEY, DEF_SETTINGS, AE_DI_PARAMS, MODEL_CODE_LABELS, STORE_COORDS, STORE_NAMES, sName, sNameC, DOW_BASE, STORE_KB, STORE_KB_EDIT_KEY, getKBEdits, saveKBEdits, getKB, EVENT_TYPES, EVENT_TYPE_GROUPS, INV_ORG_COORDS, fetchOpenMeteoWeather } from '../constants.js';
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
import { AIInsightsTab, MetricCorrelationExplorer, DistrictLensPanel, WhyEnginePanel, FOBAnalysisPanel, ForecastAccuracyPanel, AIBacktestScanner, DialedInPanel, DateRangeReport, ForecastAudit, LocationBrief, ProjectionVsActualsReport, DialedInComparisonReport, DistrictPriorityBrief, AttentionPanel, AtAGlance, DataManagerPanel, StoreOnePager, ChannelIntelligencePanel, MonthlyProjectionsPanel } from '../views/analytics.js';
import { Settings } from '../views/management.js';
import { PerformanceReviewsPanel } from '../views/performance-reviews.js';
import { DeliveryMixPanel } from '../views/delivery-mix.js';
import { SchedulingPanel } from '../views/scheduling.js';
import { AdminPanel } from '../views/admin.js';
import { SMGVoicePanel } from '../views/smg-voice.js';
import { FOBEOMPanel } from '../views/fob-eom.js';
import { EOMSupervisorPanel } from '../views/eom-supervisor.js';
import { SignalsPanel } from '../views/signals.js';
import { SagePanel } from '../views/sage.js';
import { computeInsights } from '../engine/insights.js';
import { supabase, loadMonthlyTargets, loadAllMonthlyTargets, saveSmgFullscale, loadSmgFullscale, saveVoicePerf, loadVoicePerf, saveLifeLenzSchedule, loadLifeLenzSchedule, saveLaborRows, loadLaborRows, saveFobRows, loadFobRows, saveOpsRows, loadOpsRows, saveCtrlRows, loadCtrlRows, saveDarRows, loadDarRows, uploadReportFile } from '../lib/supabase.js';
import { setSupabaseClient, syncReviewsFromSupabase, syncConfigFromSupabase, pushConfigToSupabase } from '../engine/review-engine.js';
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
import { detectType, parseSMGVoicePDF, parseSMGFullScale, parseLifeLenzLabor } from '../parsers/index.js';
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

// ── Meridian version + changelog ─────────────────────────────────────────────
const MERIDIAN_VERSION    = '4.281';
const MERIDIAN_BUILD_DATE = '2026-07-03';
const MERIDIAN_CHANGELOG  = [
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
  const [showDistrictLens,setShowDistrictLens]= useState(false);
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
  const [showAbout, setShowAbout] = useState(false); // About/Changelog modal
  const [showPVSA,     setShowPVSA]    = useState(false);
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
  },[]);
  const [anomFilter, setAnomFilter]    = useState('all');
  const [showAttention, setShowAttention] = useState(false);
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
  const [signals,             setSignals]             = useState([]);
  const [showSage,            setShowSage]            = useState(false);
  const [showStoreKB,         setShowStoreKB]         = useState(false);
  const [showFcstRef,         setShowFcstRef]         = useState(false);
  const [showFcstAccuracy, setShowFcstAccuracy] = useState(false);
  const [userTargets, setUserTargets]  = useState(()=>{try{return JSON.parse(localStorage.getItem('mf_targets')||'{}');}catch{return {};}});
  const [loadMsg, setLoadMsg]          = useState(null);
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
        for(const r of labor){if(r.sales>0){if(!lastAct[r.loc]||r.date>lastAct[r.loc])lastAct[r.loc]=r.date;}}
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
          weatherIdx:{}, wxByDate:{},
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

  // ── Supabase: register client + sync on mount ──────────────────────────────
  React.useEffect(()=>{
    if (!supabase) return;
    setSupabaseClient(supabase);
    // Merge labor rows from Supabase so DI calibration history persists across cache clears and devices
    loadLaborRows().then(sbRows=>{
      if(!sbRows?.length) return;
      const _mkIdx=(rows)=>{const idx={};for(const r of rows){if(!r.loc||!r.date)continue;const k=r.loc+'_'+dKey(r.date);if(!idx[k])idx[k]=[];idx[k].push(r);}return idx;};
      setDs(prev=>{
        const existing=new Set((prev.laborRows||[]).map(r=>r.loc+'|'+(r.date instanceof Date?r.date.toISOString().slice(0,10):String(r.date).slice(0,10))));
        const fresh=sbRows.filter(r=>{
          const k=r.loc+'|'+(r.date instanceof Date?r.date.toISOString().slice(0,10):String(r.date).slice(0,10));
          return !existing.has(k);
        });
        if(!fresh.length) return prev;
        const merged=[...(prev.laborRows||[]),...fresh].sort((a,b)=>{
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
        .then(({ data }) => { if (data?.role) setUserRole(data.role); })
        .catch(() => {});
    });
    // ── Auto-ingest pending QSRSoft reports ───────────────────────────────────
    // Check for files uploaded by the Gmail poller (pending_reports table).
    // Download each unprocessed file from Storage, parse with existing parsers,
    // merge into the DS, then mark as processed.
    (async()=>{
      try{
        const {data:pending,error}=await supabase
          .from('pending_reports')
          .select('id,filename,storage_path,report_type')
          .eq('processed',false)
          .neq('source','manual')
          .order('uploaded_at',{ascending:true})
          .limit(50);
        if(error||!pending?.length) return;
        console.log(`[Meridian] ${pending.length} pending QSRSoft report(s) found`);
        const filesToProcess=[];
        for(const rec of pending){
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
        // Mark all as processed
        const ids=pending.map(r=>r.id);
        await supabase.from('pending_reports')
          .update({processed:true,processed_at:new Date().toISOString()})
          .in('id',ids);
        console.log(`[Meridian] ✓ Auto-ingested ${filesToProcess.length} QSRSoft report(s)`);
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
        const cutoff=new Date(Date.now()-30*86400000).toISOString();
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
        const lfzRows = await loadLifeLenzSchedule();
        if(lfzRows.length>0){
          setDs(prev=>{
            if(!prev) return prev;
            return {...prev, schedRows: lfzRows};
          });
          console.log(`[Meridian] ✓ Loaded ${lfzRows.length} LifeLenz schedule rows from Supabase`);
        }
      }catch(e){console.warn('[Meridian] LifeLenz load failed:',e);}
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
      const wDates = newRows.map(r=>r._d||'').filter(Boolean).sort();
      setDs(prev=>{
        if(!prev) return prev;
        const updated={...prev, weatherRows:newRows};
        opfsSave(updated).catch(()=>{});  // persist to OPFS so it survives reload
        return updated;
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

  const handleFiles = useCallback(async(files)=>{
    if(!files||!files.length) return;
    const fileArr=Array.from(files);
    setLoadMsg('⏳ Reading '+fileArr.length+' file'+(fileArr.length>1?'s…':'…'));
    let currentDS=dsRef.current||buildDS([]);
    const loaded=[];
    const _toDs=r=>r.date instanceof Date?r.date.toISOString().slice(0,10):String(r.date).slice(0,10);
    const _prevLaborKeys=new Set((currentDS.laborRows||[]).map(r=>r.loc+'|'+_toDs(r)));
    const _prevFobKeys  =new Set((currentDS.fobRows ||[]).map(r=>r.loc+'|'+_toDs(r)));
    const _prevOpsKeys  =new Set((currentDS.opsRows  ||[]).map(r=>r.loc+'|'+_toDs(r)));
    const _prevCtrlKeys =new Set((currentDS.ctrlRows ||[]).map(r=>r.loc+'|'+_toDs(r)));
    const _prevDarKeys  =new Set((currentDS.darRows  ||[]).map(r=>r.loc+'|'+_toDs(r)+'|'+(r.hour||'')));
    for(const file of fileArr){
      try{
        setLoadMsg('⏳ Parsing '+file.name+'…');
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
            const smgRows=await parseSMGVoicePDF(file);
            if(smgRows.length>0){
              currentDS={...currentDS,smgRows:[...(currentDS.smgRows||[]),...smgRows]};
              console.log(`[Meridian] SMG VOICE: ${smgRows.length} comments from ${file.name}`);
            }
            loaded.push({name:file.name,type:typeInfo});
            if(supabase&&!file._pendingId&&!file._manualSyncId)
              uploadReportFile(file,'smg-voice').then(rec=>_markSynced(rec?.id)).catch(()=>{});
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
          } else {
            currentDS=mergeDS(currentDS,wb,type,file.name);
            loaded.push({name:file.name,type});
            // Cloud sync — upload raw file so other devices can auto-ingest it
            if(supabase&&!file._pendingId&&!file._manualSyncId&&type.type!=='unknown')
              uploadReportFile(file,type.type).then(rec=>_markSynced(rec?.id)).catch(()=>{});
          }
        }
      }catch(e){
        console.error('File parse error:',file.name,e);
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
    // Persist new rows to Supabase for cross-device sync
    if(supabase){
      const newLaborRows=(currentDS.laborRows||[]).filter(r=>!_prevLaborKeys.has(r.loc+'|'+_toDs(r)));
      const newFobRows  =(currentDS.fobRows  ||[]).filter(r=>!_prevFobKeys  .has(r.loc+'|'+_toDs(r)));
      const newOpsRows  =(currentDS.opsRows  ||[]).filter(r=>!_prevOpsKeys  .has(r.loc+'|'+_toDs(r)));
      const newCtrlRows =(currentDS.ctrlRows ||[]).filter(r=>!_prevCtrlKeys .has(r.loc+'|'+_toDs(r)));
      const newDarRows  =(currentDS.darRows  ||[]).filter(r=>!_prevDarKeys  .has(r.loc+'|'+_toDs(r)+'|'+(r.hour||'')));
      if(newLaborRows.length>0) saveLaborRows(newLaborRows).catch(e=>console.warn('[labor_rows] save error:',e));
      if(newFobRows  .length>0) saveFobRows  (newFobRows  ).catch(e=>console.warn('[fob_rows] save error:',e));
      if(newOpsRows  .length>0) saveOpsRows  (newOpsRows  ).catch(e=>console.warn('[ops_rows] save error:',e));
      if(newCtrlRows .length>0) saveCtrlRows (newCtrlRows ).catch(e=>console.warn('[ctrl_rows] save error:',e));
      if(newDarRows  .length>0) saveDarRows  (newDarRows  ).catch(e=>console.warn('[dar_rows] save error:',e));
    }
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
    showDICompare||showDataManager||showDev||showDialedIn||showEvents||showFOB||showFcstAccuracy||
    showGMBrief||showHelp||showInsights||showInventory||showKB||showLFZGap||showLaborAnalytics||
    showLifeLenzBridge||showLocIntel||showModelAssign||
    showMorningBrief||showEOMSummary||showOnePager||showOperatorSummary||showPMix||showPVSA||
    showPerfCalc||showPriorityBrief||showProj||showProjBriefSA||showRanking||
    showReport||showRevIntel||showSettings||showSmartTargets||showStoreKB||
    showTargets||showUnifiedTargets||showWhyEngine||showChannelIntel||showPerfReviews||showRecordDay||showAdminPanel||showDeliveryMix||showScheduling||showSMGVoice||showMonthlyProj||showSignals||showSage;

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
      setShowModelAssign(false);setShowMorningBrief(false);setShowEOMSummary(false);setShowOnePager(false);
      setShowOperatorSummary(false);setShowPMix(false);setShowPVSA(false);setShowPerfCalc(false);
      setShowPriorityBrief(false);setShowProj(false);setShowProjBriefSA(false);setShowRanking(false);
      setShowReport(false);setShowRevIntel(false);setShowSettings(false);setShowSmartTargets(false);
      setShowStoreKB(false);setShowTargets(false);setShowUnifiedTargets(false);setShowWhyEngine(false);setShowFcstRef(false);setShowChannelIntel(false);setShowPerfReviews(false);setShowRecordDay(false);setShowAdminPanel(false);setShowDeliveryMix(false);setShowScheduling(false);setShowSMGVoice(false);setShowMonthlyProj(false);setShowSignals(false);setShowSage(false);
    };
    document.addEventListener('keydown', onKey);
    return ()=>document.removeEventListener('keydown', onKey);
  },[]);

  return div({style:{height:'100vh',display:'flex',background:'var(--bg)',color:'var(--text)',fontFamily:'var(--sans)',overflow:'hidden'}},

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
        if(modal==='labor-analytics') perm('analytics.labor')&&setShowLaborAnalytics(true);
        if(modal==='delivery-mix')    perm('analytics.store')&&setShowDeliveryMix(true);
        if(modal==='scheduling')      perm('analytics.store')&&setShowScheduling(true);
        if(modal==='morning-brief')  perm('analytics.brief')&&setShowMorningBrief(true);
        if(modal==='eom-summary')    perm('analytics.district')&&setShowEOMSummary(true);
        if(modal==='brief')          perm('analytics.brief')&&(()=>{
          if(selStore) setBriefScope({scope:'store',label:sNameC(selStore),locs:[selStore]});
          else setBriefScope({scope:'district',label:settings.districtNameShort||'District',locs:null});
          setShowBrief(true);
        })();
        if(modal==='priority-brief') perm('analytics.brief')&&setShowPriorityBrief(true);
        if(modal==='operator-summary')  perm('analytics.district')&&setShowOperatorSummary(true);
        if(modal==='monthly-proj')      perm('analytics.store')&&setShowMonthlyProj(true);
        if(modal==='district-lens')  perm('analytics.district')&&setShowDistrictLens(true);
        if(modal==='data-manager')   perm('data.upload')&&setShowDataManager(true);
        if(modal==='settings')       perm('settings.view')&&setShowSettings(true);
        if(modal==='perf-reviews')   perm('reviews.view')&&setShowPerfReviews(true);
        if(modal==='proj')           perm('analytics.forecasting')&&setShowProj(true);
        if(modal==='proj-brief')     perm('analytics.forecasting')&&setShowProjBriefSA(true);
        if(modal==='dialedin')       perm('analytics.forecasting')&&setShowDialedIn(true);
        if(modal==='pvsa')           perm('analytics.forecasting')&&setShowPVSA(true);
        if(modal==='dicompare')      perm('analytics.forecasting')&&setShowDICompare(true);
        if(modal==='model-assign')   perm('analytics.forecasting')&&setShowModelAssign(true);
        if(modal==='fcst-accuracy')  perm('analytics.forecasting')&&setShowFcstAccuracy(true);
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
        if(modal==='unified-targets') perm('analytics.store')&&setShowUnifiedTargets(true);
        if(modal==='signals')        perm('analytics.store')&&setShowSignals(true);
        if(modal==='sage')           setShowSage(true);
        if(modal==='attention')      setShowAttention(true);
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
    showSettings &&h(Settings, {settings,onUpdate:saveSettings,onClose:()=>setShowSettings(false),userRole,onClearAll:handleClearAll}),
    showRanking  &&h(RankingView,{stores,ds,settings,dateRange,onDateChange:setDateRange,defaultMetric:rankingDefault,onSelectStore:s=>{goStore(s);setShowRanking(false);},onClose:()=>setShowRanking(false)}),
    showTargets  &&h(MonthlyTargetManager,{userTargets,mergedTargets,onUpdate:saveUserTargets,onClose:()=>setShowTargets(false),ds}),
    showUnifiedTargets&&h(UnifiedTargetsPanel,{stores,ds,settings,onClose:()=>setShowUnifiedTargets(false)}),
    showPerfCalc&&h(PerformanceCalculator,{stores,ds,settings,onClose:()=>setShowPerfCalc(false)}),
    showCorrExplorer&&h(MetricCorrelationExplorer,{stores,ds,settings,onClose:()=>setShowCorrExplorer(false)}),
    showDistrictLens&&h(DistrictLensPanel,{stores,ds,settings,onClose:()=>setShowDistrictLens(false)}),
    showModelAssign&&h(ModelAssignmentPanel,{stores,ds,settings,userEvents,onClose:()=>setShowModelAssign(false)}),
    showOnePager&&h(StoreOnePager,{stores,ds,settings,onClose:()=>setShowOnePager(false)}),
    showGMBrief&&h(GMCoachingBrief,{stores,ds,settings,userEvents,onClose:()=>setShowGMBrief(false)}),
    showDARDaypart&&h(DARDaypartPanel,{stores,ds,settings,onClose:()=>setShowDARDaypart(false)}),
    showDataManager&&h(DataManagerPanel,{ds,idbCoverage,onClose:()=>setShowDataManager(false)}),
    showMonthlyProj&&h(MonthlyProjectionsPanel,{ds,stores,settings,onClose:()=>setShowMonthlyProj(false)}),
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
    showSmartTargets&&h(SmartTargetPanel,{stores,ds,settings,onClose:()=>setShowSmartTargets(false)}),
    showLocIntel&&h(LocationIntelligence,{allStores:stores,ds,settings,scope:'district',onClose:()=>setShowLocIntel(false)}),
    showInventory&&h(InventoryIntelligence,{stores,ds,settings,onClose:()=>setShowInventory(false)}),
    showFOB&&h(FOBAnalysisPanel,{stores,ds,settings,onClose:()=>setShowFOB(false)}),
    showFOBEOM&&h(FOBEOMPanel,{stores,ds,settings,onClose:()=>setShowFOBEOM(false)}),
    showSMGVoice&&h(SMGVoicePanel,{ds,stores,voicePerf:ds?.smgVoicePerf||[],onClose:()=>setShowSMGVoice(false)}),
    showLaborAnalytics&&h(LaborAnalyticsPanel,{stores,ds,settings,onClose:()=>setShowLaborAnalytics(false)}),
    showDeliveryMix&&h(DeliveryMixPanel,{ds,onClose:()=>setShowDeliveryMix(false)}),
    showScheduling&&h(SchedulingPanel,{ds,settings,onClose:()=>setShowScheduling(false)}),
    showSignals&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.88)',zIndex:360,display:'flex',flexDirection:'column',overflow:'hidden'}},
      div({style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderBottom:'1px solid rgba(255,255,255,.1)',flexShrink:0}},
        span({style:{fontFamily:"'Syne',sans-serif",fontWeight:900,fontSize:'15px',letterSpacing:'-.02em'}},'📡 Signals'),
        h('button',{onClick:()=>setShowSignals(false),style:{background:'none',border:'none',cursor:'pointer',color:'#6b7280',fontSize:'20px',lineHeight:1}},'×'),
      ),
      div({style:{flex:1,overflowY:'auto',background:'var(--surf)'}},
        h(SignalsPanel,{ds,signals}),
      ),
    ),
    showSage&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.88)',zIndex:360,display:'flex',flexDirection:'column',overflow:'hidden'}},
      div({style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 20px',borderBottom:'1px solid rgba(255,255,255,.1)',flexShrink:0}},
        span({style:{fontFamily:"'Syne',sans-serif",fontWeight:900,fontSize:'15px',letterSpacing:'-.02em',color:'var(--text)'}},'🧠 SAGE'),
        h('button',{onClick:()=>setShowSage(false),style:{background:'none',border:'none',cursor:'pointer',color:'#6b7280',fontSize:'20px',lineHeight:1}},'×'),
      ),
      div({style:{flex:1,overflowY:'hidden',background:'var(--bg)',display:'flex',flexDirection:'column'}},
        h(SagePanel,{ds,signals}),
      ),
    ),
    showPriorityBrief&&h(DistrictPriorityBrief,{stores,ds,settings,userEvents,onSelectStore:s=>{goStore(s);setShowPriorityBrief(false);},onClose:()=>setShowPriorityBrief(false)}),
    showOperatorSummary&&h(OperatorSummaryPanel,{stores,ds,settings,onClose:()=>setShowOperatorSummary(false)}),
    showStoreKB&&h(StoreKBEditor,{onClose:()=>setShowStoreKB(false)}),
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
        showEOMSummary&&div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.88)',zIndex:360,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'16px',overflowY:'auto'}},
      div({style:{background:'var(--surf)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr2)',width:'100%',maxWidth:1140,position:'relative'}},
        h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 18px',borderBottom:'.5px solid var(--bdr2)',position:'sticky',top:0,background:'var(--surf)',zIndex:10}},
          h('div',null,
            h('div',{style:{fontFamily:"'Syne',sans-serif",fontSize:'16px',fontWeight:800,letterSpacing:'-.02em'}},'📊 EOM Supervisor Summary'),
            h('div',{style:{fontSize:'11px',color:'var(--text3)',marginTop:'2px'}},'Monthly P&L variance by store — filter by supervisor, operator, or all')),
          h('button',{onClick:()=>setShowEOMSummary(false),style:{background:'none',border:'none',color:'var(--text3)',fontSize:'20px',cursor:'pointer',lineHeight:1,padding:'0 4px'}},'✕')),
        div({style:{overflowY:'auto',maxHeight:'88vh'}},
          h(EOMSupervisorPanel,{ds,settings,supabase}))
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
    showTutorial&&h(TutorialOverlay,{onClose:()=>setShowTutorial(false)})
  );
}

export default App;
