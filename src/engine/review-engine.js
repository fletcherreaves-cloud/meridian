// Performance Review Engine — config, storage, and scoring
import { DEFAULT_TARGETS } from '../constants.js';
import { metricAvg, metricRate, metricSeries } from './metric-source.js';
import { applyTargetOverrides } from './target-overrides.js';
// Dispatch #161 — mo.foodOB (the review's FOB $ actual) is sourced through fobByRange(),
// the SAME canonical qsr_fob dollar-aggregator every other FOB view in the app already uses
// (both One-Pagers, fixed v5.203) — not a hand-rolled sum over the manual ds.fobRows array.
import { fobByRange } from './one-pager-data.js';
// Dispatch #154 (Performance Review continuity, Phase 5a) — promotion/transfer segmented
// scoring. assignment-graph.js owns ALL reports-to-graph resolution logic (dispatch #150's own
// "keep resolution logic in ONE place" rule); this file only turns that resolved data into
// review SCORES, so it imports the timeline function rather than re-deriving it.
import { personAssignmentTimeline } from './assignment-graph.js';

const REVIEW_CONFIG_KEY    = 'mf_review_config_v1';
const PERF_REVIEWS_KEY     = 'mf_perf_reviews_v1';
const REVIEW_TEMPLATES_KEY = 'mf_review_templates_v1';

export const CAT_KEYS   = ['rgr','sales','profit','people'];
export const CAT_LABELS = { rgr:'Running Great Restaurants', sales:'Sales Drivers', profit:'Profitability', people:'People Staffing & Retention', admin:'Administration' };
export const ROLE_KEYS  = ['GM','AM','DM','SM','AS','OM'];
export const ROLE_LABELS= { GM:'General Manager', AM:'Assistant Manager', DM:'Department Manager', SM:'Shift Manager', AS:'Area Supervisor', OM:'Operations Manager' };
// Store-level manager roles whose review can be attributed to their OWN shifts
// (Shift Manager Summary data). GM = whole store; AS/OM are above-store → store-total.
export const SHIFT_ATTRIBUTABLE_ROLES = ['AM','DM','SM'];

export const DEFAULT_REVIEW_CONFIG = {
  version: 1,
  // Overall split: 70% metrics, 30% behavioral
  overall: { metrics: 0.70, behavioral: 0.30 },
  // Category weights within Results Achieved
  categoryWeights: {
    rgr:    { label:'Running Great Restaurants',   weight: 0.325 },
    sales:  { label:'Sales Drivers',               weight: 0.100 },
    profit: { label:'Profitability',               weight: 0.325 },
    people: { label:'People Staffing & Retention', weight: 0.250 },
  },
  // Metrics per category
  // unit:'pct'  → deviation = (actual-target)/|target|; t values are fractions (0.05 = 5%)
  // unit:'abs'  → deviation = actual-target in raw units; t values are raw
  // better:'higher' → 4 if deviation >= t[0], 3 >= t[1], 2 >= t[2], else 1
  // better:'lower'  → 4 if deviation <= t[0], 3 <= t[1], 2 <= t[2], else 1
  // src:'auto' → autoPopulate can fill actual from ds (field specified); src:'manual' → user-entered only
  metrics: {
    rgr: [
      { key:'oepe',       label:'OEPE (Peaks, sec)',          weight:0.20, better:'lower',  unit:'abs', scored:true,  t:[-5,5,10],         src:'auto', field:'oepe',       note:'Target = store OEPE target (sec)' },
      { key:'osat',       label:'Voice OSAT',                 weight:0.10, better:'higher', unit:'pct', scored:true,  t:[0.05,0,-0.05],    src:'auto', field:'osat',  pctInput:true, note:'Auto from SMG FullScale (5★ %)' },
      { key:'epb2b',      label:'EPB2B (Pace Portal, %)',     weight:0.10, better:'lower',  unit:'pct', scored:true,  t:[-0.02,0.02,0.04], src:'manual',              pctInput:true, note:'Lower EPB2B = better' },
      { key:'r2p',        label:'R2P Front Counter (sec)',    weight:0.10, better:'lower',  unit:'abs', scored:true,  t:[-5,5,10],         src:'auto', field:'r2p',        note:'Target = store R2P target (sec)' },
      { key:'delivWait',  label:'Delivery Wait (sec)',        weight:0.10, better:'lower',  unit:'abs', scored:true,  t:[-30,0,120],       src:'auto', field:'restaurantTimeSec', note:'Auto: McDelivery 3PO Restaurant Time (cloud) vs store target' },
      // McDelivery Star Rating (owner, 2026-08-26: "let's wire in Star Rating as well"). No
      // ACTUAL-data source exists anywhere in the app (no parser/cloud stream emits a star-
      // rating field) — same state EAD/EPB2B are already in, so this follows their exact
      // precedent: target real and auto (yearly workbook's "McDelivery Star Rating" column ->
      // tMcdStars, wired below), actual manual until a real source shows up. scored:false
      // (reference-only) rather than guessing a weight/threshold allocation with zero live data
      // to calibrate against — same reasoning secondSide above already used; flip to scored:true
      // once real actuals exist to validate a threshold band against.
      { key:'mcdStars',   label:'McDelivery Star Rating',      weight:0.05, better:'higher', unit:'abs', scored:false, t:[0,-0.2,-0.4],     src:'manual',              note:'Not scored — reference only. Target auto from yearly workbook (McDelivery Star Rating); no actual-data source exists yet, enter manually' },
      { key:'kvs',        label:'KVS Time (sec)',             weight:0.10, better:'lower',  unit:'abs', scored:true,  t:[-3,3,6],          src:'auto', field:'kvst',       note:'Target = store KVS target (sec)' },
      { key:'secondSide', label:'2nd Side Healthy Usage (%)', weight:0.05, better:'higher', unit:'pct', scored:false, t:[0.05,-0.05,-0.10],src:'auto', field:'kvsHealthy', pctInput:true, note:'Not scored — reference only. Auto from KVS Healthy Usage (cloud-first, manual Ops upload fallback); target from yearly workbook "Healthy Use 2nd Side"' },
      // Dispatch #132 item 2, investigated (NOT wired to t1800Contacts): the yearly workbook's
      // "1-800 Contacts" column is a raw per-store COUNT target, not a /100K rate — confirmed by
      // reading parseYearlyTargets() (src/parsers/index.js), which parses it with a plain
      // parseFloat, no guest-count normalization anywhere near it. This metric is also a rate
      // ("/100K"), and no guest-count-normalized ACTUAL is captured anywhere in the app either,
      // so `src` stays 'manual' for the actual. The TARGET side can now resolve from a Targets-
      // editor override (tComplaintsTarget, REVIEW_METRIC_TARGET_FIELD) once the owner sets one —
      // see target-overrides.js's TARGET_OVERRIDE_FIELDS note on this exact field.
      { key:'complaints', label:'Complaint Contacts/100K',    weight:0.05, better:'lower',  unit:'abs', scored:true,  t:[-2,2,4],          src:'manual',                    note:'Absolute count vs target (not auto-sourced — see the mapping investigation above this entry)' },
      { key:'fsAudits',   label:'FS Audits Completed',        weight:0.05, better:'higher', unit:'pct', scored:true,  t:[0,-0.10,-0.20],   src:'manual',              pctInput:true, note:'% of target audits completed' },
      { key:'fsEcoSure',  label:'Food Safety EcoSure (%)',    weight:0.10, better:'higher', unit:'pct', scored:true,  t:[0,-0.10,-0.20],   src:'manual',              pctInput:true, note:'% score vs target' },
      { key:'fsTablet',   label:'FS Completion T-60 (%)',     weight:0.05, better:'higher', unit:'pct', scored:true,  t:[0,-0.10,-0.20],   src:'manual',              pctInput:true, note:'Tablet completion %' },
      // Dispatch #145 — EAP and EAD. OSAT B2B and EPB2B are BOTH deliberately excluded from
      // this pass (owner-held pending his own investigation into osat_b2b_pct — see
      // memory/dispatch-145.md); epb2b above is untouched.
      //
      // Weight math (stated explicitly per the dispatch's own instruction not to silently
      // change the category balance): the 10 existing scored RGR metrics above already sum to
      // 0.95, not 1.00 (measured: .20+.10+.10+.10+.10+.10+.05+.05+.10+.05 — secondSide is
      // scored:false and excluded), a pre-existing gap unrelated to this dispatch. Rather than
      // rescaling all 10 unrelated weights (a much bigger, unrequested judgment call) or
      // silently leaving the category further off, eap+ead are sized to exactly close that
      // 0.05 gap (0.03+0.02) — no existing metric's weight changes, and RGR's scored total
      // lands at exactly 1.00. Both are scored:true, not scored:false/reference-only like
      // secondSide: missingReviewTargets() (below) only flags scored metrics, and this
      // dispatch's own verification bar requires EAP to be flagged there when no override
      // target is set — scored:false would silently defeat that.
      //
      // EAP (Experienced A Problem — overall, SMG FullScale): a problem-RATE (lower = better),
      // same family as the existing epb2b metric just above (both derive from the same
      // FullScale "Experienced a Problem" question; EAP is the overall section, epb2b the B2B
      // one) — NOT the same shape as osat (a higher-is-better satisfaction %). The dispatch
      // suggested matching osat's thresholds "same 0-1 problem-rate family," but osat itself is
      // not a problem rate; epb2b is the closer real analog in this same category, so EAP's
      // t-band is modeled on epb2b's (t:[-0.02,0.02,0.04]) rather than osat's (t:[0.05,0,-0.05],
      // wrong direction for this metric). No live EAP target data exists yet to calibrate a
      // different band against, so epb2b's existing, already-shipped band is the most defensible
      // starting point. Target: override-only (no yearly-workbook column) — see
      // target-overrides.js's tEAPTarget entry.
      { key:'eap', label:'EAP — Experienced A Problem (%)', weight:0.03, better:'lower', unit:'pct', scored:true, t:[-0.02,0.02,0.04], src:'auto', field:'overallProblem', pctInput:true, note:'Auto from SMG FullScale (Overall section — "Experienced a Problem" %). Lower = better. Target is override-only; no yearly-workbook column exists for this (dispatch #145)' },
      // EAD (Voice Execute As Designed): target is real, already parsed (parseYearlyTargets →
      // t.tVoiceEAD → yearly_targets.voice_ead_pct), wired below via REVIEW_METRIC_TARGET_FIELD.
      // Actual has NO data source anywhere in the codebase — confirmed by
      // kpi-registry.test.js's existing guard ("deliberately excludes the yearly-workbook-only
      // fields with no actual source"), which already covers voiceEAD; re-verified here, not
      // re-derived. performance-reviews.js's own SRC note says the actual would come from Pace
      // Portal (not yet ingested) — same manual/override-only state epb2b is already in.
      // Conservative t-band: reused verbatim from fsAudits/fsEcoSure/fsTablet just above
      // (t:[0,-0.10,-0.20], higher=better) — the established shape this category already uses
      // for a %-completion metric with no live actual to calibrate against, rather than
      // inventing new numbers with nothing to validate them.
      { key:'ead', label:'Voice EAD — Execute As Designed (%)', weight:0.02, better:'higher', unit:'pct', scored:true, t:[0,-0.10,-0.20], src:'manual', pctInput:true, note:'Target auto from yearly workbook (Voice EAD). Actual has no data source anywhere in the app (would come from Pace Portal, not yet ingested) — enter manually, same state as EPB2B (dispatch #145)' },
    ],
    sales: [
      { key:'salesVsTgt', label:'Sales vs. Monthly Target',   weight:0.70, better:'higher', unit:'pct', scored:true,  t:[0.05,0,-0.05],    src:'auto', field:'sales', tgtField:'salesTgt', dollar:true, note:'Auto from Labor Analysis' },
      { key:'digitalGC',  label:'Digital App GC/Rest/Day',    weight:0.15, better:'higher', unit:'pct', scored:true,  t:[0.05,0,-0.05],    src:'auto', field:'digitalGC', note:'Auto: Digital App GC/R/D (cloud) vs store target' },
      { key:'delivGC',    label:'Delivery GC/Rest/Day',       weight:0.15, better:'higher', unit:'pct', scored:true,  t:[0.05,0,-0.05],    src:'auto', field:'delivGC',  note:'Auto: 3PO Delivery GC/R/D (cloud) vs store target' },
    ],
    profit: [
      { key:'foodOB',     label:'Food Over Base $ vs Target', weight:0.35, better:'lower',  unit:'pct', scored:true,  t:[-0.05,0.05,0.10], src:'auto', field:'fobDollar', dollar:true, note:'Auto from FOB report; target = workbook FOB% (monthly-preferred) × the month\'s sales — dispatch #132 item 5' },
      { key:'labor',      label:'Labor % vs Target',          weight:0.35, better:'lower',  unit:'pct', scored:true,  t:[-0.05,0.05,0.10], src:'auto', field:'laborPct', tgtField:'laborTgt', pctInput:true, note:'Auto from Labor Analysis' },
      // Was src:'manual' with no field — a stale label, not the real behavior: autoPopulateKPIs
      // (below, "Op Supplies actual = Σ the month's daily op-supplies purchases") already
      // unconditionally fills mo.opSupplies from the real auto-pulled eBOS stream
      // (qsr_ebos_daily.ops_purchases, dispatch #99), so a manual entry here was always being
      // silently overwritten — the UI's "★auto" indicator (performance-reviews.js) just wasn't
      // showing it, misleading a manager into thinking their manual entry mattered. Owner
      // confirmed 2026-08-26: "Op supplies we actually already have through the ebos pull."
      { key:'opSupplies', label:'Op Supplies vs Budget ($)',  weight:0.15, better:'lower',  unit:'pct', scored:true,  t:[-0.05,0.05,0.10], src:'auto', field:'opSupplies', dollar:true, note:'Auto: eBOS Op Supplies purchases (cloud) vs workbook budget target' },
      // positiveOnly (dispatch #132 item 6, owner-stated interim rule): "should be set to
      // anything positive (for now)". No workbook column feeds a real dollar target for this,
      // so until one is set via the Targets editor (tTotalProfitTarget override, any scope),
      // rateMetric() scores purely on sign — see that function's positiveOnly branch. A real
      // override target, once set, is used normally (deviation-based, same as every other
      // metric) — the interim rule is a fallback default, not a permanent replacement.
      { key:'totalProfit',label:'Total Profit vs Target ($)', weight:0.15, better:'higher', unit:'pct', scored:true,  t:[0.05,0,-0.05],    src:'auto', dollar:true, positiveOnly:true, note:'Auto: Σ(target−actual) across FOB%/Labor%/Op-Supplies, this category\'s own 3 controllables. No real target exists yet — scores positive=passing until one is set in the Targets editor.' },
    ],
    people: [
      { key:'shiftCert',  label:'# Shift Certified Managers', weight:0.25, better:'higher', unit:'pct', scored:true,  t:[0,-0.10,-0.20],   src:'auto',                    note:'Auto: Roster role counts (Shift Mgr bucket) vs store target' },
      { key:'shiftVerif', label:'# Shift Verifications by GM',weight:0.15, better:'higher', unit:'pct', scored:true,  t:[0,-0.10,-0.20],   src:'manual',                    note:'Count vs target' },
      { key:'headcount',  label:'Total Headcount vs Target',  weight:0.30, better:'higher', unit:'pct', scored:true,  t:[0,-0.10,-0.20],   src:'auto',                    note:'Auto: Roster Statistics (Roster Active) vs store target' },
      { key:'turnover90', label:'0-90 Day Crew Turnover (%)', weight:0.20, better:'lower',  unit:'pct', scored:true,  t:[-0.05,0.05,0.10], src:'auto',              pctInput:true, note:'Auto: Turnover Monthly (0-90 day) vs store target' },
      { key:'retention',  label:'Execution of Retention Prg.',weight:0.10, better:'higher', unit:'pct', scored:true,  t:[0,-0.10,-0.20],   src:'manual',              pctInput:true, note:'% completion vs target' },
    ],
  },
  // Behavioral competency items per role per category (editable in Customize panel)
  competencies: {
    GM: {
      rgr: [
        'Creates and modifies PACE portal action plan to improve restaurant performance',
        'Restaurant meets Food Safety guidelines and action taken on any cited issues',
        'Overall Drive-Thru performance culture; building the business through speed of service',
        'Shift Management principles executed in the restaurant at all times',
        'Restaurant maintains acceptable cleanliness through effective systems and routines',
        'Ensures restaurant is prepared through cleanliness, training, and staffing',
      ],
      sales: [
        'Executes store marketing plans and creates local marketing action plans',
        'Implementation of new products and procedures (Day 1 ready)',
        'Execution of POP elements (Up on time, down on time, replaced when damaged)',
        'Restaurant runs consistent and solid operations to build customer counts',
      ],
      profit: [
        'Responsible for holding controllable P&L line items within targets',
        'Checks all weekly & monthly reports for accuracy and submits timely',
        'Execution of company profit routines and systems',
        'Restaurant security procedures are followed (opening/closing/cash handling)',
        'Cash controls systems in place and managed (cash +/-, overrings, voids)',
      ],
      people: [
        'Staffs based on business needs',
        'Develops additional sources of applications as necessary to support staffing',
        'Executes Best Onboarding practices (onboarding forms, I-9s, orientation)',
        'Retention of crew and swing management (not running people off)',
        'Execution of Restaurant Management Development Program',
        'Identifies qualified crew and management for promotion',
        'All performance reviews are written and submitted on time',
        'Ongoing development of maintenance personnel through training',
        'Knowledgeable of company policies and fairly & consistently enforces them',
        'Suspends, terminates crew according to personnel procedures, documenting properly',
        'Conducts routine restaurant management meetings (minimum of 1 per month)',
        'Execution of development of Swing Managers and Manager Trainees',
        'Timely execution of retention programs such as People Celebrations',
        'Utilizes Listening Surveys and McHire Employee Assistant data for action',
      ],
      admin: [
        'Verifies that all deposits have been received by the bank / resolves discrepancies',
        'All petty cash receipts are accounted for and petty cash reconciled',
        'Keeps all systems (eRestaurant, CIT) cleaned (terminated employees removed)',
        'Completes Managers Schedule that meets the business needs on time',
        'Consistent execution of General Manager Routines',
        'Scans all mail received at the restaurant directly to the Main Office',
      ],
    },
    AM: {
      rgr: [
        'Overall drive-thru performance culture; building the business through speed of service',
        'Assist in maintaining equipment (PM calendar) & ensuring repairs made promptly',
        'Maintains critical standards: holding times, E-Production, temperature checks',
        'Shift Management principles executed in the restaurant at all times',
        'Handles customer complaints effectively',
        'Restaurant meets Food Safety guidelines and action taken on any cited issues',
        'Ensures restaurant is prepared through cleanliness, training, and staffing',
      ],
      sales: [
        'Implementation of new products and procedures (Day 1 ready)',
        'Execution of POP elements (Up on time, down on time, replaced when damaged)',
        'Restaurant runs consistent and solid operations to build customer counts',
      ],
      profit: [
        'Assist General Manager in holding controllable P&L line items within targets',
        'Controls assigned P&L line item (Food, Labor, etc.) based on assignment',
        'Restaurant\'s security procedures are followed (opening/closing/cash handling)',
        'Cash controls systems in place and managed (cash +/-, overrings, voids)',
      ],
      people: [
        'Assists in staffing based on business needs',
        'Assists in developing additional sources of applications as necessary',
        'Executes Best Onboarding practices (onboarding forms, I-9s, orientation)',
        'Retention of crew and swing management (not running people off)',
        'Assists in execution of Restaurant Management Development Program',
        'Assists in identifying qualified crew and management for promotion',
        'Assists in ensuring that all performance reviews are written and submitted on time',
        'Knowledgeable of company policies and fairly & consistently enforces them',
        'Assists in timely execution of retention programs such as People Celebrations',
        'Assists in conducting routine restaurant management meetings',
        'Actively assists in Listening Survey completion and executes action items',
      ],
      admin: [
        'Completes and posts crew schedule on time and within financial targets',
        'Assists with daily, weekly and monthly restaurant reports (labor, food, etc.)',
        'Completes food orders on time and maintains proper build to order levels',
        'Completes daily, weekly, monthly inventories (if applicable)',
        'Assists in tracking customer complaints',
        'Consistent execution of Assistant Manager Routines',
        'Scans all mail received at the restaurant directly to the Main Office',
      ],
    },
    AS: {
      rgr: [
        'Creates and modifies short & long-term action plans to improve restaurant performance',
        'Restaurants meet Food Safety guidelines and action taken on any cited issues',
        'Restaurants model a Drive-Thru Performance culture; building business through speed of service',
        'Ensures management teams execute Shift Management principles at all times',
        'Restaurants are maintained at an acceptable cleanliness level through effective systems',
        'Ensures restaurants are prepared through cleanliness, training, and staffing',
      ],
      sales: [
        'Identifies sales opportunities and creates action plans to improve',
        'Executes store marketing plans and creates local marketing action plans',
        'Implementation of new products and procedures (Day 1 ready) in all locations',
        'Ensures the execution of POP elements in restaurants (up on time, down on time)',
        'Restaurants run consistent and solid operations to build customer counts',
      ],
      profit: [
        'Responsible for holding controllable P&L line items within targets across all restaurants',
        'Checks all weekly & monthly reports for accuracy and submits timely',
        'Execution of company profit routines and systems',
        'Ensures all restaurants\' security procedures are followed',
        'Ensures all restaurants\' cash controls are in place and managed',
      ],
      people: [
        'Ensures and verifies assigned restaurants are staffing based on business needs',
        'Develops additional sources of applications as necessary to support staffing',
        'Ensures assigned restaurants execute Best Onboarding practices',
        'Recruits and evaluates potential external manager trainee candidates',
        'Identifies qualified crew and management for promotion',
        'Ensures execution of retention of crew and management within restaurants',
        'Execution of Restaurant Management Development Program',
        'Ensures crew and swing manager performance reviews are written and submitted on time',
        'Completes Salaried Management reviews and submits to Operations Manager on time',
        'Ensures that restaurant management meetings occur at minimum 1 per month',
        'Conducts monthly Communication Days with Salaried Management Team',
        'Knowledgeable of company policies and fairly and consistently enforces them',
        'Utilizes Listening Surveys and McHire Employee Assistant data for action',
      ],
      admin: [
        'Verifies that all deposits have been received by the bank for all restaurants',
        'Completes & submits Supervisor Calendar on time (25th of the prior month)',
        'Reviews and approves Monthly Managers schedules for each restaurant',
        'Ensures each restaurant has a current PACE Action Plan',
        'Verifies that all restaurants\' petty cash receipts are accounted for',
        'Execution of Supervisor Routines',
      ],
    },
    OM: {
      rgr: [
        'Creates and modifies short & long-term action plans for assigned market performance',
        'Restaurants within market meet Food Safety guidelines and action taken on cited issues',
        'Market exhibits and models Drive-Thru Performance culture across all locations',
        'Ensures management teams execute Shift Management principles at all times',
        'Restaurants are maintained at an acceptable cleanliness level',
        'Ensures restaurants are prepared through cleanliness, training, and staffing',
      ],
      sales: [
        'Identifies sales opportunities and creates action plans to improve performance',
        'Executes store marketing plans and creates local marketing action plans',
        'Implementation of new products and procedures (Day 1 ready) across market',
        'Ensures the execution of POP elements across restaurants',
        'Restaurants run consistent and solid operations to build customer counts',
      ],
      profit: [
        'Responsible for holding controllable P&L line items within targets market-wide',
        'Ensures Supervisor / GM profit routines are in place and followed',
        'Restaurant security procedures are in place and followed across market',
        'Cash controls in place and managed — action taken on opportunities',
      ],
      people: [
        'Ensures and verifies assigned market is staffed based on business needs',
        'Develops additional sources of applications as necessary to support staffing',
        'Ensures market executes Best Onboarding practices',
        'Recruits and evaluates potential external manager trainee candidates',
        'Ensures execution of retention of crew and management within the market',
        'Execution of Restaurant Management Development Program',
        'Ensures crew and swing manager performance reviews are written and submitted on time',
        'Completes Salaried Management reviews and submits to HR on time',
        'Ensures that restaurant management meetings occur at minimum 1 per month',
        'Conducts monthly Communication Days with Area Supervisors',
        'Knowledgeable of company policies and fairly and consistently enforces them',
        'Ensures timely execution of retention programs such as People Celebrations',
        'Ongoing development of salaried and high potential swings through training',
        'Utilizes Listening Surveys and McHire Employee Assistant data for action',
      ],
      admin: [
        'Reviews, approves, & submits monthly Manager Schedules and Supervisor Calendars',
        'Ensures restaurants have current PACE Action Plans',
        'Execution of Operations Manager & Supervisor Routines',
      ],
    },
  },
  // Custom behavioral-only categories added by the user
  extraCategories: [],  // [{key, label}]
};

// ── Config helpers ─────────────────────────────────────────────────────────────
export function getReviewConfig() {
  try {
    const s = JSON.parse(localStorage.getItem(REVIEW_CONFIG_KEY) || 'null');
    if (!s || s.version !== DEFAULT_REVIEW_CONFIG.version) return deepCopy(DEFAULT_REVIEW_CONFIG);
    // Merge top-level defaults so new fields (e.g. extraCategories) survive old saved configs
    return { ...deepCopy(DEFAULT_REVIEW_CONFIG), ...s };
  } catch { return deepCopy(DEFAULT_REVIEW_CONFIG); }
}
export function saveReviewConfig(cfg) {
  try { localStorage.setItem(REVIEW_CONFIG_KEY, JSON.stringify(cfg)); } catch {}
}
export function resetReviewConfig() {
  try { localStorage.removeItem(REVIEW_CONFIG_KEY); } catch {}
}

// ── Review CRUD (localStorage) ────────────────────────────────────────────────
export function getReviews() {
  try { return JSON.parse(localStorage.getItem(PERF_REVIEWS_KEY) || '{}'); } catch { return {}; }
}
export function saveReviews(reviews) {
  try { localStorage.setItem(PERF_REVIEWS_KEY, JSON.stringify(reviews)); } catch {}
}
// Dispatch #152 (Performance Review continuity, Phase 4a) -- id is now YEAR-ONLY (no half
// suffix): a review record is one-per-person-per-year now, not one-per-half. See blankReview's
// own header comment for the person-identity design decision this function's `person` argument
// implements -- in short, `person` is whatever identity string the caller has (today: still the
// reviewee's plain display name, since no UI wires a real geid/person picker yet -- that's
// Phase 4b's job), slugified exactly like the old name-based id already was.
export function reviewId(person, year) {
  return String(person).toLowerCase().replace(/[^a-z0-9]+/g,'_') + '_' + year;
}
export function upsertReview(review) {
  const reviews = getReviews();
  const id = review.id || reviewId(review.person || review.name, review.year);
  reviews[id] = { ...review, id, updatedAt: new Date().toISOString().slice(0,10) };
  saveReviews(reviews);
  // Fire-and-forget Supabase push if a client has been registered
  if (_sb) _pushReview(_sb, reviews[id]);
  return id;
}
export function deleteReview(id) {
  const reviews = getReviews();
  delete reviews[id];
  saveReviews(reviews);
  if (_sb) _deleteReview(_sb, id);
}

// ── Supabase sync ─────────────────────────────────────────────────────────────
// Call setSupabaseClient(supabaseClient) once on app mount (from App.js).
// After that, upsertReview / deleteReview / saveReviewConfig automatically
// mirror writes to the database. syncFromSupabase() pulls the server state
// into localStorage on login.

let _sb = null;
export function setSupabaseClient(client) { _sb = client; }

// Dispatch #152: `review_half` is dropped -- a review row is a full YEAR now, not a half, so
// there is no single half value left to mirror into that scalar column (see schema.sql's own
// comment on the column drop). `status` similarly has no single year-level value anymore --
// approval is tracked per-half in `review.periods.h1/h2` (see blankReview/transitionReview) --
// but the scalar `status` column stays (nothing asked to drop it, and some callers may still
// filter/sort on it), populated by reviewSummaryStatus() below: an INFORMATIONAL "furthest along
// of h1/h2" summary for coarse filtering only. The authoritative per-half statuses always live in
// `data.periods.h1.status`/`data.periods.h2.status` -- never resolve real workflow logic from
// this scalar column.
// Dispatch #162 — auto_finalized ranks alongside approved (both are "as far along as this half
// gets without being reopened"); a tie between the two on h1 vs h2 falls to h2 via this function's
// own >= comparison below, matching the pre-existing tie behavior between two equal ranks.
const _STATUS_RANK = { draft: 0, returned: 1, submitted: 2, approved: 3, auto_finalized: 3 };
export function reviewSummaryStatus(review) {
  const h1 = review?.periods?.h1?.status || 'draft';
  const h2 = review?.periods?.h2?.status || 'draft';
  return (_STATUS_RANK[h2] ?? 0) >= (_STATUS_RANK[h1] ?? 0) ? h2 : h1;
}

async function _pushReview(sb, review) {
  try {
    const { error } = await sb.from('reviews').upsert({
      id:            review.id,
      data:          review,
      reviewee_name: review.name,
      reviewee_loc:  review.loc,
      review_year:   review.year,
      status:        reviewSummaryStatus(review),
      org:           review.org || null,
      updated_at:    new Date().toISOString(),
    });
    if (error) console.error('Meridian: Supabase review push error', error.message);
  } catch (e) {
    console.error('Meridian: Supabase review push failed', e);
  }
}

async function _deleteReview(sb, id) {
  try {
    const { error } = await sb.from('reviews').delete().eq('id', id);
    if (error) console.error('Meridian: Supabase review delete error', error.message);
  } catch (e) {
    console.error('Meridian: Supabase review delete failed', e);
  }
}

// Pull all reviews the current user can access into localStorage.
// Called once after login.
export async function syncReviewsFromSupabase(sb) {
  if (!sb) return;
  try {
    const { data, error } = await sb.from('reviews').select('id, data');
    if (error) { console.error('Meridian: Supabase sync error', error.message); return; }
    if (!data?.length) return;
    const merged = { ...getReviews() };
    data.forEach(row => { if (row.data) merged[row.id] = row.data; });
    saveReviews(merged);
  } catch (e) {
    console.error('Meridian: Supabase sync failed', e);
  }
}

// ── Locked-actual overrides (dispatch #149) ────────────────────────────────────
// The bug this fixes: autoPopulateKPIs (above) unconditionally overwrites every src:'auto'
// KPI actual on every run -- and that is now CORRECT, deliberate behavior (always show the
// freshest cloud data), not a bug, per the plan doc's "Recommended data-shape approach"
// section. What WAS a bug is that a manual correction had nowhere else to live except that
// same field, so it got silently destroyed the next re-run. The fix: a manual correction is
// captured as a separate, append-only OVERRIDE RECORD (this section) instead of being written
// into kpis.months directly -- it can never be clobbered by autoPopulateKPIs re-running,
// because that function never touches this storage. The effective actual for display AND
// scoring = the latest override for that (review, month, metric) if one exists, else whatever
// autoPopulateKPIs last wrote -- resolved ONCE via applyReviewOverrides() below, so every
// downstream consumer (KPIGrid, computeScores, computeScoreBreakdown, rateMetric, the print
// exports) sees the resolved value automatically without its own override-awareness.
//
// Authorization for WHO may create an override record lives in permissions.js
// (canOverrideLockedActual / REVIEW_ROLE_TO_LADDER) and, for real enforcement, in
// supabase/schema.sql's review_overrides RLS insert policy -- this module only stores/resolves
// records; it does not itself gate who may call addReviewOverride (the UI and the database both
// gate that, independently).
const REVIEW_OVERRIDES_KEY = 'mf_review_overrides_v1'; // { [reviewId]: OverrideRecord[] }

// Exactly the 3 options the owner specified, in his own words (plan doc decision #4): "a
// dropdown for Inaccurate Data, Incomplete Data, or Something Else (Explanation required)."
export const OVERRIDE_REASONS = [
  { value: 'inaccurate_data', label: 'Inaccurate Data' },
  { value: 'incomplete_data', label: 'Incomplete Data' },
  { value: 'something_else',  label: 'Something Else' },
];
export const OVERRIDE_REASON_LABEL = Object.fromEntries(OVERRIDE_REASONS.map(r => [r.value, r.label]));

// Client-side mirror of schema.sql's review_overrides check constraint (reason must be one of
// the 3 values; note required when reason is 'something_else') -- validated in both places,
// neither trusts the other alone (the DB constraint is the real backstop; this is fast UI
// feedback before a round trip).
export function validateOverrideInput({ reason, note } = {}) {
  if (!OVERRIDE_REASONS.some(r => r.value === reason)) return { ok: false, error: 'Select a reason.' };
  if (reason === 'something_else' && !(note && String(note).trim())) {
    return { ok: false, error: 'An explanation is required for "Something Else".' };
  }
  return { ok: true };
}

function _allOverrides() {
  try {
    const a = JSON.parse(localStorage.getItem(REVIEW_OVERRIDES_KEY) || '{}');
    return a && typeof a === 'object' && !Array.isArray(a) ? a : {};
  } catch { return {}; }
}
function _saveAllOverrides(all) {
  try { localStorage.setItem(REVIEW_OVERRIDES_KEY, JSON.stringify(all)); } catch {}
}

export function getReviewOverrides(reviewId) {
  return _allOverrides()[reviewId] || [];
}

// Appends one override record (an audit-trail entry, never mutated once written) for
// (reviewId, month, metricKey). Throws on invalid input (reason/note) -- callers (the UI form)
// should validate first via validateOverrideInput for a better error message, but this is the
// hard backstop so a bad record can never be constructed by any caller, tested or not.
// previousValue is captured purely for the audit trail (what the resolved cell showed just
// before this override) -- resolution itself (effectiveOverrideFor) never reads it back, it
// always uses the LATEST record for a cell.
export function addReviewOverride(reviewId, { month, metricKey, value, reason, note, previousValue, overriddenByRole } = {}) {
  const check = validateOverrideInput({ reason, note });
  if (!check.ok) throw new Error(check.error);
  if (value == null || !isFinite(value)) throw new Error('Enter a numeric value.');
  const record = {
    id: `ov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    reviewId, month: Number(month), metricKey, value: Number(value),
    previousValue: previousValue == null ? null : Number(previousValue),
    reason, note: note ? String(note).trim() : '',
    overriddenByRole: overriddenByRole || null,
    overriddenAt: new Date().toISOString(),
  };
  const all = _allOverrides();
  all[reviewId] = [...(all[reviewId] || []), record];
  _saveAllOverrides(all);
  if (_sb) _pushOverride(_sb, record);
  return record;
}

async function _pushOverride(sb, record) {
  try {
    const { error } = await sb.from('review_overrides').insert({
      review_id: record.reviewId, month: record.month, metric_key: record.metricKey,
      value: record.value, previous_value: record.previousValue,
      reason: record.reason, note: record.note || null,
    });
    if (error) console.error('Meridian: Supabase override push error', error.message);
  } catch (e) {
    console.error('Meridian: Supabase override push failed', e);
  }
}

// Pulls every override row the current user's RLS grants them for ONE review into localStorage
// (scoped per-review, not a global sync — matches how a review is opened one at a time).
// Defaults to the module-registered client (set via setSupabaseClient), same pattern as the
// rest of this file's Supabase helpers, but accepts an explicit client for testing.
export async function syncReviewOverridesFromSupabase(reviewId, sb = _sb) {
  if (!sb || !reviewId) return getReviewOverrides(reviewId);
  try {
    const { data, error } = await sb.from('review_overrides').select('*')
      .eq('review_id', reviewId).order('overridden_at', { ascending: true });
    if (error) { console.error('Meridian: Supabase override sync error', error.message); return getReviewOverrides(reviewId); }
    const mapped = (data || []).map(r => ({
      id: r.id, reviewId: r.review_id, month: r.month, metricKey: r.metric_key,
      value: r.value, previousValue: r.previous_value, reason: r.reason, note: r.note || '',
      overriddenByRole: r.overridden_by_role, overriddenAt: r.overridden_at,
    }));
    const all = _allOverrides();
    all[reviewId] = mapped;
    _saveAllOverrides(all);
    return mapped;
  } catch (e) {
    console.error('Meridian: Supabase override sync failed', e);
    return getReviewOverrides(reviewId);
  }
}

// The single ACTIVE override for (month, metricKey) — the latest record by overriddenAt.
// Append-only audit trail: earlier records for the same cell are history, not competing state,
// so "effective" is always just "most recent."
export function effectiveOverrideFor(overrides, month, metricKey) {
  const matches = (overrides || []).filter(o => o.month === month && o.metricKey === metricKey);
  if (!matches.length) return null;
  return matches.reduce((latest, o) => (new Date(o.overriddenAt) > new Date(latest.overriddenAt) ? o : latest));
}

// Resolves the EFFECTIVE review: every (month, metricKey) with an active override has its
// kpis.months value replaced by the override's value. Call this ONCE per render/score pass and
// hand the result to every consumer instead of the raw review — this is what closes scope item
// 3 ("check every call site, don't just fix the input cell") without needing computeScores,
// computeScoreBreakdown, rateMetric, or the print exports to know overrides exist at all.
// Never mutates the input; returns the SAME review object (not a copy) when there is nothing to
// resolve, so callers can cheaply no-op on identity when appropriate.
export function applyReviewOverrides(review, overrides) {
  if (!review?.kpis?.months || !overrides || !overrides.length) return review;
  const latestByCell = {};
  for (const o of overrides) {
    const k = o.month + ':' + o.metricKey;
    if (!latestByCell[k] || new Date(o.overriddenAt) > new Date(latestByCell[k].overriddenAt)) latestByCell[k] = o;
  }
  if (!Object.keys(latestByCell).length) return review;
  const months = JSON.parse(JSON.stringify(review.kpis.months));
  for (const o of Object.values(latestByCell)) {
    const mo = months[o.month];
    if (mo) mo[o.metricKey] = o.value;
  }
  return { ...review, kpis: { ...review.kpis, months } };
}

// Pull org config from Supabase and merge it into localStorage.
export async function syncConfigFromSupabase(sb, key = 'review_config') {
  if (!sb) return;
  try {
    const { data, error } = await sb.from('org_config').select('data').eq('key', key).maybeSingle();
    if (error || !data) return;
    try { localStorage.setItem(REVIEW_CONFIG_KEY, JSON.stringify(data.data)); } catch {}
  } catch {}
}

// Push current org config to Supabase.
export async function pushConfigToSupabase(sb, cfg, key = 'review_config') {
  if (!sb) return;
  try {
    await sb.from('org_config').upsert({ key, data: cfg, updated_at: new Date().toISOString() });
  } catch (e) {
    console.error('Meridian: config push failed', e);
  }
}

// ── Named templates (Phase B) ─────────────────────────────────────────────────
// A named, savable collection of review configs. Stored org-shared in org_config
// (key 'review_templates') + mirrored to localStorage. Each template =
// { id, name, config, updatedAt }. Pure list helpers below are unit-tested; the
// get/save wrappers add persistence + Supabase mirroring.
const _today = () => new Date().toISOString().slice(0, 10);

export function makeTemplateId(name, existing = []) {
  const base = ('tpl_' + String(name || 'template').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')) || 'tpl';
  const ids = new Set((existing || []).map(t => t.id));
  if (!ids.has(base)) return base;
  let i = 2; while (ids.has(base + '_' + i)) i++;
  return base + '_' + i;
}

// Pure: add or update a template in a list by id (assigns a slug id + timestamp).
export function upsertTemplateInList(list, tpl) {
  const id = tpl.id || makeTemplateId(tpl.name, list);
  const t = { ...tpl, id, updatedAt: _today() };
  const next = (list || []).filter(x => x.id !== id);
  next.push(t);
  return { list: next, id };
}
export function removeTemplateFromList(list, id) { return (list || []).filter(x => x.id !== id); }
export function duplicateTemplateInList(list, id, newName) {
  const src = (list || []).find(x => x.id === id);
  if (!src) return { list: list || [], id: null };
  return upsertTemplateInList(list, { name: newName || (src.name + ' copy'), config: deepCopy(src.config) });
}

// Hard-enforce 100%: every weight group must sum to 1.0 (± tol). Returns
// { ok, errors:[{scope, sum}] }. The Customize UI blocks save when !ok.
export function validateTemplateWeights(cfg, tol = 0.001) {
  const errors = [];
  const near1 = (x) => Math.abs(x - 1) <= tol;
  const ov = (cfg?.overall?.metrics || 0) + (cfg?.overall?.behavioral || 0);
  if (!near1(ov)) errors.push({ scope: 'overall', sum: ov });
  const cw = Object.values(cfg?.categoryWeights || {}).reduce((a, c) => a + (c.weight || 0), 0);
  if (!near1(cw)) errors.push({ scope: 'categoryWeights', sum: cw });
  for (const [cat, metrics] of Object.entries(cfg?.metrics || {})) {
    const scored = (metrics || []).filter(m => m.scored);
    if (!scored.length) continue;
    const sum = scored.reduce((a, m) => a + (m.weight || 0), 0);
    if (!near1(sum)) errors.push({ scope: 'metrics.' + cat, sum });
  }
  return { ok: errors.length === 0, errors };
}

export function getTemplates() {
  try { const a = JSON.parse(localStorage.getItem(REVIEW_TEMPLATES_KEY) || 'null'); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
export function saveTemplates(list) {
  try { localStorage.setItem(REVIEW_TEMPLATES_KEY, JSON.stringify(list || [])); } catch {}
  if (_sb) pushTemplatesToSupabase(_sb, list || []);
}
export async function syncTemplatesFromSupabase(sb, key = 'review_templates') {
  if (!sb) return;
  try {
    const { data, error } = await sb.from('org_config').select('data').eq('key', key).maybeSingle();
    if (error || !data || !Array.isArray(data.data)) return;
    try { localStorage.setItem(REVIEW_TEMPLATES_KEY, JSON.stringify(data.data)); } catch {}
  } catch {}
}
export async function pushTemplatesToSupabase(sb, list, key = 'review_templates') {
  if (!sb) return;
  try { await sb.from('org_config').upsert({ key, data: list || [], updated_at: new Date().toISOString() }); }
  catch (e) { console.error('Meridian: templates push failed', e); }
}

// ── Blank review builder ───────────────────────────────────────────────────────
export function blankMonthKPIs(year, month) {
  return {
    year, month,
    oepe:null,oepeTgt:null, osat:null,osatTgt:null, epb2b:null,epb2bTgt:null,
    r2p:null,r2pTgt:null, delivWait:null,delivWaitTgt:null, kvs:null,kvsTgt:null,
    secondSide:null,secondSideTgt:null, complaints:null,complaintsTgt:null,
    fsAudits:null,fsAuditsTgt:null, fsEcoSure:null,fsEcoSureTgt:null, fsTablet:null,fsTabletTgt:null,
    eap:null,eapTgt:null, ead:null,eadTgt:null, mcdStars:null,mcdStarsTgt:null,
    salesVsTgt:null,salesVsTgtTgt:null, digitalGC:null,digitalGCTgt:null, delivGC:null,delivGCTgt:null,
    foodOB:null,foodOBTgt:null, labor:null,laborTgt:null,
    opSupplies:null,opSuppliesTgt:null, totalProfit:null,totalProfitTgt:null,
    shiftCert:null,shiftCertTgt:null, shiftVerif:null,shiftVerifTgt:null,
    headcount:null,headcountTgt:null, turnover90:null,turnover90Tgt:null, retention:null,retentionTgt:null,
  };
}

// ── Dispatch #152 (Performance Review continuity, Phase 4a) ────────────────────────────────────
// One record per (person, year) now, not per (person, year, half) -- see
// memory/plan-performance-review-continuity-2026-08-26.md decision #1 (owner's own words, quoted
// in memory/dispatch-152.md) and memory/dispatch-152.md's full scope. `half` is DROPPED as a
// parameter and as a top-level field: `kpis.months` now holds all 12 months, `behavioralRatings`
// now holds all four `q1..q4` keys, and approval status moves to `periods.h1`/`periods.h2` (see
// below) since a year isn't approved as one atomic event -- its two halves are, at different
// points in the year (scope item 3).
//
// DESIGN DECISION (dispatch-152.md scope item 1, "make the call explicitly and document it") --
// the review's person-identity field UNIFIES with the SAME identity space dispatch #150/#151
// already built for `staff_assignments.person`/`profiles.person` (a geid for a roster-sourced
// GM/AM/DM/SM role, or a plain supervisor name string for AS/OM/DO). New `person` field, nullable,
// stored alongside the existing `name` (human display name) and `geid` (unchanged, narrow
// shift-attribution field -- explicitly NOT repurposed, per the dispatch's own warning) fields.
// Reasoning:
//   - It directly serves plan-doc decision #2 ("the review follows the PERSON, not the store") --
//     a future dispatch resolving "whose review is this" against the assignment graph needs a
//     field to resolve FROM, and building it now (even unpopulated) means that future dispatch is
//     a consumer, not another schema change.
//   - It costs nothing today: this dispatch does NOT build a person-picker UI (that's Phase 4b/
//     decision #5's job-code config table, item #8) or any auto-derivation (dispatch #151 kept
//     `profiles.person` manual/admin-set for the identical reason -- "there is no reliable
//     automatic link... today"). `person` defaults to `null` here exactly like `profiles.person`
//     does, and `reviewId()` falls back to the reviewee's plain `name` when it's absent -- so
//     every existing call site (NewReviewForm, still passing only a name -- Phase 4b's job to
//     change) keeps working unchanged, byte-for-byte, in the common case.
//   - The alternative (stay a freeform slugified name, decoupled from the assignment graph) would
//     mean a SECOND future migration once Phase 4b/#5 need real identity resolution -- unifying
//     now costs one nullable field; deferring costs a second data-model dispatch later for the
//     exact reason this one exists.
// Do NOT repurpose `geid` for this -- it's null for GM/AS/OM and means something else entirely
// (shift-summary attribution for SHIFT_ATTRIBUTABLE_ROLES only, read by autoPopulateKPIs).
export function blankReview(name, role, loc, year, cfg, person = null) {
  const months = {};
  for (let m = 1; m <= 12; m++) months[m] = blankMonthKPIs(year, m);
  const makeRatings = () => {
    const out = {};
    const _cfg = cfg || DEFAULT_REVIEW_CONFIG;
    const comp = _cfg.competencies[role] || {};
    const extras = (_cfg.extraCategories || []).map(c => c.key);
    for (const cat of [...CAT_KEYS, ...extras, 'admin']) out[cat] = (comp[cat] || []).map(() => null);
    return out;
  };
  const behavioralRatings = {};
  for (const q of ['q1','q2','q3','q4']) behavioralRatings[q] = makeRatings();
  const personKey = (person != null && String(person).trim() !== '') ? person : name;
  return {
    id: reviewId(personKey, year),
    name, role, loc, year,
    // Unified identity-space field (see header comment above) -- null until a real geid/person
    // picker exists (Phase 4b). NOT the same field as `geid` below.
    person: person != null && String(person).trim() !== '' ? String(person) : null,
    geid: null,   // manager id for DM/shift attribution (Notes 33 A#3); set via the form dropdown
    // Per-half approval workflow (scope item 3): a year record's two real-world review
    // conversations (mid-year, end-of-year) keep their own independent status/audit trail.
    // transitionReview(id, half, newStatus, notes) is the only writer of these.
    periods: {
      h1: { status: 'draft', statusHistory: [], statusNotes: '' },
      h2: { status: 'draft', statusHistory: [], statusNotes: '' },
    },
    // Snapshot the template this review is built against (Phase A) so later template
    // edits never silently re-score it. Refreshed via an explicit "apply template".
    templateSnapshot: deepCopy(cfg || DEFAULT_REVIEW_CONFIG),
    kpis: { months },
    behavioralRatings,
    comments: {
      q1:{rgr:'',sales:'',profit:'',people:'',admin:''},
      q2:{rgr:'',sales:'',profit:'',people:'',admin:''},
      q3:{rgr:'',sales:'',profit:'',people:'',admin:''},
      q4:{rgr:'',sales:'',profit:'',people:'',admin:''},
      midYear:{ summary:'', devPlan:'' },
      eoy:{ summary:'', achievements:'', nextYear:'' },
    },
    devPlan: [],
    wage:{ current:null, recommended:null, approved:null, effectiveDate:'', notes:'' },
    createdAt: new Date().toISOString().slice(0,10),
    updatedAt: new Date().toISOString().slice(0,10),
  };
}

// ── Template snapshot (Phase A) ──────────────────────────────────────────────
// A review carries the resolved template it was built against in `templateSnapshot`
// so that editing the live template NEVER silently re-scores historical reviews
// (owner-approved). Scoring resolves the effective config to the review's snapshot
// when present, else the passed-in live config (back-compat for pre-snapshot reviews).
export function resolveReviewConfig(review, cfg) {
  return (review && review.templateSnapshot) || cfg;
}

// ── Scoring ────────────────────────────────────────────────────────────────────
export function rateMetric(actual, target, metricCfg) {
  if (actual == null) return null;
  // Interim scoring rule (dispatch #132 item 6 — Total Profit): a metric flagged positiveOnly
  // has no resolvable real target yet (target is null, or the derived 0-placeholder
  // autoPopulateKPIs fills in when nothing else set it — see that function). Score on SIGN
  // only: passing (4) if actual is positive, else failing (1). The moment a real, non-zero
  // target IS resolved (a Targets-editor override was set, any scope), this branch is skipped
  // and scoring falls through to the normal deviation-based rating below — the interim rule is
  // only ever a fallback default, never a permanent replacement for a real target.
  if (metricCfg.positiveOnly && (target == null || target === 0)) return actual > 0 ? 4 : 1;
  if (target == null) return null;
  if (metricCfg.unit === 'pct' && target === 0) return null;
  const dev = metricCfg.unit === 'pct'
    ? (actual - target) / Math.abs(target)
    : (actual - target);
  const [t4, t3, t2] = metricCfg.t;
  if (metricCfg.better === 'higher') return dev >= t4 ? 4 : dev >= t3 ? 3 : dev >= t2 ? 2 : 1;
  return dev <= t4 ? 4 : dev <= t3 ? 3 : dev <= t2 ? 2 : 1;
}

export const RATING_LABELS = { 4:'Exceeds', 3:'On Target', 2:'Below', 1:'Needs Improvement' };
export function ratingColor(r) {
  return r===4?'#16a34a':r===3?'#22c55e':r===2?'var(--crit)':r===1?'#dc2626':'var(--text3)';
}
export function ratingBg(r) {
  return r===4?'rgba(22,163,74,.13)':r===3?'rgba(34,197,94,.10)':r===2?'rgba(244,63,94,.11)':r===1?'rgba(220,38,38,.12)':'transparent';
}

function avgRating(arr) {
  const v = arr.filter(x=>x!=null);
  return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null;
}

function scoreMetricCategory(monthArr, catKey, cfg) {
  const metrics = (cfg.metrics[catKey] || []).filter(m => m.scored);
  let wS=0, wT=0;
  for (const m of metrics) {
    const rats = monthArr.map(mo => rateMetric(mo[m.key], mo[m.key+'Tgt'], m)).filter(r=>r!=null);
    if (!rats.length) continue;
    wS += (rats.reduce((a,b)=>a+b,0)/rats.length) * m.weight;
    wT += m.weight;
  }
  return wT > 0 ? wS/wT : null;
}

function scoreBehavCategory(ratingArr) {
  return avgRating(ratingArr||[]);
}

// Dispatch #154 (Performance Review continuity, Phase 5a) — extracted verbatim from what used to
// be computeScores()'s own internal closures (metricsScore/behavScore/avgOf), to MODULE level,
// so computeSegmentScores() (below, near autoPopulateKPIs) can reuse the IDENTICAL scoring math
// instead of reinventing it — per this dispatch's own scope note ("reuses the SAME
// scoreMetricCategory/behavScore/combine machinery computeScores already has... don't reinvent
// scoring math a second time"). Pure extraction, zero behavior change — computeScores itself is
// rewritten just below to call these instead of its old inline closures.
function _metricsScoreAcross(mArr, cfg) {
  let wS = 0, wT = 0;
  for (const [cat, cw] of Object.entries(cfg.categoryWeights)) {
    const s = scoreMetricCategory(mArr, cat, cfg);
    if (s == null) continue;
    wS += s * cw.weight; wT += cw.weight;
  }
  return wT > 0 ? wS / wT : null;
}
// `roleOverride` (new, optional): when omitted, behaves exactly as before (review.role's own
// competencies) — computeScores() below never passes it. computeSegmentScores() passes a
// segment-specific role so a promoted/transferred segment scores against ITS OWN competency
// framework, not the review's single top-level role.
function _behavQuarterScore(review, cfg, qKey, roleOverride) {
  const role = roleOverride || review.role;
  const rats = review.behavioralRatings?.[qKey] || {};
  const extras = (cfg.extraCategories || []).map(c => c.key);
  const allRatings = [...CAT_KEYS, ...extras, 'admin'].flatMap(cat => {
    const items = cfg?.competencies?.[role]?.[cat] || [];
    return (rats[cat] || []).filter((_, i) => {
      const item = items[i];
      return typeof item === 'string' || item == null || item.active !== false;
    });
  }).filter(x => x != null);
  return allRatings.length ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length : null;
}
function _avgOfVals(vals) {
  const v = (vals || []).filter(x => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

// Every quarter's month numbers -- the ONE place this mapping is defined; h1/h2/year below all
// derive from it rather than re-listing month ranges, so the rollups can never drift out of sync
// with the per-quarter definitions.
export const QUARTER_MONTHS = { q1:[1,2,3], q2:[4,5,6], q3:[7,8,9], q4:[10,11,12] };

// Dispatch #152 (Performance Review continuity, Phase 4a): a review record now spans the whole
// year, so this returns ALL of q1/q2/q3/q4 + h1/h2 + year from one call (scope item 4) --
// previously this computed only the review's own `half` (its ceiling), since a record was one
// half. Every level's `overall` is computed the SAME way (metrics*mw + behavioral*bw) -- the
// levels differ only in which months/quarters feed metrics/behavioral, never in the combining
// formula itself.
//   - metrics: recomputed FRESH over the union of that level's months (scoreMetricCategory
//     weighted-average across every month in scope) -- q1 = its 3 months, h1 = the SAME function
//     run over all 6 h1 months (not an average of q1.metrics/q2.metrics), year = the same function
//     run over all 12 -- this is exactly how "half" already worked before this dispatch, just
//     generalized to run at 3 granularities instead of 1.
//   - behavioral: averaged from the sub-period scores already computed (q1+q2 -> h1, q3+q4 -> h2,
//     h1+h2 -> year) via ONE shared helper (`avgOf`) -- so the year rollup is PROVEN to reuse the
//     identical combining step h1 already used for q1+q2, not a reinvented formula (verified by a
//     concrete numeric example in review-engine-year-rollup.test.js).
export function computeScores(review, cfg) {
  cfg = resolveReviewConfig(review, cfg); // score against the review's template snapshot when present
  const months = review.kpis?.months || {};
  const mArr = nums => nums.map(n=>months[n]).filter(Boolean);

  // The ONE combining step every rollup level (h1, h2, year) reuses -- metrics recomputed fresh
  // over `monthNums`, behavioral averaged from `subBehavioral` (already-computed sub-period
  // scores), overall = the same metrics*mw + behavioral*bw formula every level uses. Dispatch
  // #154: metricsScore/behavScore/avgOf are now the module-level _metricsScoreAcross/
  // _behavQuarterScore/_avgOfVals (above) instead of closures defined inline here — pure
  // extraction so computeSegmentScores() can reuse the identical math, zero behavior change.
  const combine = (monthNums, subBehavioral) => {
    const ms = _metricsScoreAcross(mArr(monthNums), cfg);
    const bs = _avgOfVals(subBehavioral);
    return { metrics: ms, behavioral: bs, overall: (ms!=null&&bs!=null) ? ms*cfg.overall.metrics+bs*cfg.overall.behavioral : null };
  };

  const out = {};
  for (const [qKey,qMonths] of Object.entries(QUARTER_MONTHS)) {
    out[qKey] = combine(qMonths, [_behavQuarterScore(review, cfg, qKey)]);
  }

  out.h1 = combine([...QUARTER_MONTHS.q1, ...QUARTER_MONTHS.q2], [out.q1.behavioral, out.q2.behavioral]);
  out.h2 = combine([...QUARTER_MONTHS.q3, ...QUARTER_MONTHS.q4], [out.q3.behavioral, out.q4.behavioral]);
  // Year = h1+h2 combined via the IDENTICAL `combine()` call h1 itself used for q1+q2 -- not a
  // new formula (see header comment + the numeric proof test).
  out.year = combine(Object.values(QUARTER_MONTHS).flat(), [out.h1.behavioral, out.h2.behavioral]);

  return out;
}

// Dispatch #152 (Performance Review continuity, Phase 4a): returns a full step-by-step breakdown
// for EVERY period in one call -- q1, q2, q3, q4, h1, h2, year (scope item 4) -- keyed the same
// way computeScores() keys its own return object, each value the same flat shape this function
// has always returned for "the" period (categories/metricsScore/behavQScores/behavioralScore/
// overall/mw/bw/qKeys). Previously this computed only review.half's own breakdown, since a record
// was one half; a record is a full year now, so there is no single period to default to.
export function computeScoreBreakdown(review, cfg) {
  cfg = resolveReviewConfig(review, cfg); // match computeScores — use the review's snapshot
  const months = review.kpis?.months || {};
  const mw = cfg.overall?.metrics ?? 0.70;
  const bw = cfg.overall?.behavioral ?? 0.30;

  // Category/metric breakdown for an arbitrary set of month numbers -- the SAME per-metric
  // rating/contribution/impact math this function has always used, now parameterized by which
  // months feed it (a quarter's 3, a half's 6, or the full year's 12) instead of hard-coded to
  // review.half's 6.
  function categoriesFor(monthNums) {
    const moArr = monthNums.map(n => months[n]).filter(Boolean);
    let metricsWS = 0, metricsWT = 0;
    const categories = Object.entries(cfg.categoryWeights).map(([catKey, cw]) => {
      const scoredMetrics = (cfg.metrics[catKey] || []).filter(m => m.scored);
      const catTotalWeight = scoredMetrics.reduce((s, m) => s + m.weight, 0) || 1;
      let catWS = 0, catWT = 0;

      const metricRows = scoredMetrics.map(m => {
        // Include ALL of this period's months (with nulls for missing) so the UI can show a
        // complete table.
        const monthlyData = monthNums.map(n => {
          const mo = months[n];
          if (!mo) return { month: n, actual: null, target: null, dev: null, rating: null };
          const actual = mo[m.key] ?? null;
          const target = mo[m.key + 'Tgt'] ?? null;
          const rating = rateMetric(actual, target, m);
          let dev = null;
          if (actual != null && target != null && !(m.unit === 'pct' && target === 0))
            dev = m.unit === 'pct' ? (actual - target) / Math.abs(target) : (actual - target);
          return { month: n, actual, target, dev, rating };
        });

        const ratedData = monthlyData.filter(d => d.rating != null);
        const avgRating = ratedData.length
          ? ratedData.reduce((a, b) => a + b.rating, 0) / ratedData.length : null;
        const contribution = avgRating != null ? avgRating * m.weight : null;
        if (avgRating != null) { catWS += avgRating * m.weight; catWT += m.weight; }

        // Impact of +1 full rating point on this metric → overall score change
        const impactPerPoint = (m.weight / catTotalWeight) * cw.weight * mw;

        let nextRating = null, gapToNext = null;
        if (avgRating != null && avgRating < 4) {
          nextRating = Math.min(4, Math.ceil(avgRating + 0.0001));
          gapToNext = nextRating - avgRating;
        }

        return {
          key: m.key, label: m.label, weight: m.weight, unit: m.unit, better: m.better,
          monthlyData, avgRating, contribution,
          ratedCount: ratedData.length, totalMonths: moArr.length,
          impactPerPoint, nextRating, gapToNext,
        };
      });

      const categoryScore = catWT > 0 ? catWS / catWT : null;
      const categoryContrib = categoryScore != null ? categoryScore * cw.weight : null;
      if (categoryScore != null) { metricsWS += categoryScore * cw.weight; metricsWT += cw.weight; }

      return { key: catKey, label: cw.label || catKey, categoryWeight: cw.weight, metrics: metricRows, categoryScore, categoryContrib };
    });

    const metricsScore = metricsWT > 0 ? metricsWS / metricsWT : null;
    return { categories, metricsScore };
  }

  // Raw per-quarter behavioral score (average of every active competency rating in that quarter)
  // -- computed once per quarter, reused unchanged by every period below.
  function quarterBehavioral(qKey) {
    const rats = review.behavioralRatings?.[qKey] || {};
    const extras = (cfg.extraCategories || []).map(c => c.key);
    const allRatings = [...CAT_KEYS, ...extras, 'admin'].flatMap(cat => {
      const items = cfg?.competencies?.[review.role]?.[cat] || [];
      return (rats[cat] || []).filter((_, i) => {
        const item = items[i];
        return typeof item === 'string' || item == null || item.active !== false;
      });
    }).filter(x => x != null);
    return allRatings.length ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length : null;
  }

  const avgOf = vals => {
    const v = vals.filter(x => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  const out = {};
  for (const [qKey, qMonths] of Object.entries(QUARTER_MONTHS)) {
    const { categories, metricsScore } = categoriesFor(qMonths);
    const behavioralScore = quarterBehavioral(qKey);
    const overall = metricsScore != null && behavioralScore != null ? metricsScore * mw + behavioralScore * bw : null;
    out[qKey] = { categories, metricsScore, behavQScores: { [qKey]: behavioralScore }, behavioralScore, overall, mw, bw, qKeys: [qKey] };
  }

  // h1/h2/year rollups: metrics recomputed fresh over the union of months (categoriesFor, same
  // function every quarter already used), behavioral = avgOf the sub-period scores ALREADY
  // computed above. Year uses this SAME rollup() call with h1/h2 as its "sub-periods", proving
  // it's structurally identical to how h1 itself combines q1+q2 -- not a reinvented formula.
  function rollup(monthNums, subKeys, subBehavioral) {
    const { categories, metricsScore } = categoriesFor(monthNums);
    const behavioralScore = avgOf(subBehavioral);
    const overall = metricsScore != null && behavioralScore != null ? metricsScore * mw + behavioralScore * bw : null;
    const behavQScores = Object.fromEntries(subKeys.map((k, i) => [k, subBehavioral[i]]));
    return { categories, metricsScore, behavQScores, behavioralScore, overall, mw, bw, qKeys: subKeys };
  }

  out.h1 = rollup([...QUARTER_MONTHS.q1, ...QUARTER_MONTHS.q2], ['q1','q2'], [out.q1.behavioralScore, out.q2.behavioralScore]);
  out.h2 = rollup([...QUARTER_MONTHS.q3, ...QUARTER_MONTHS.q4], ['q3','q4'], [out.q3.behavioralScore, out.q4.behavioralScore]);
  out.year = rollup(Object.values(QUARTER_MONTHS).flat(), ['h1','h2'], [out.h1.behavioralScore, out.h2.behavioralScore]);

  return out;
}

// ── Auto-populate KPIs from ds ─────────────────────────────────────────────────
// Review metric key → the target field in the official-targets namespace
// (DEFAULT_TARGETS / yearly / monthly). Only metrics whose ACTUAL is on the SAME scale as
// the target are listed, so we never fill e.g. a % target against a $ actual. FOB is
// intentionally omitted until the banked FOB metric-definition fix (score on FOB% not
// fob$) lands. Metrics with NO entry here are the "no configured target → prompt the user
// (optionally seed from Smart Targets)" cases surfaced by missingReviewTargets().
export const REVIEW_METRIC_TARGET_FIELD = {
  oepe: 'tOepe', r2p: 'tR2p', kvs: 'tKvst',
  // secondSide: real, already-parsed yearly-workbook target (parseYearlyTargets's kvsu ->
  // t.tKvsu -> yearly_targets.kvs_usage_pct, "Healthy Use 2nd Side" / "KVS Usage" column) —
  // owner-confirmed 2026-08-26 ("Target available in yearly targets under Healthy Use 2nd
  // Side"). Metric stays scored:false; this only lets the target auto-fill.
  secondSide: 'tKvsu',
  // mcdStars: real, already-parsed yearly-workbook target (parseYearlyTargets's mcdStars ->
  // t.tMcdStars -> yearly_targets.mcd_star_rating), just never wired to a review metric.
  mcdStars: 'tMcdStars',
  // labor: was 'tLabor' — the field labor-basis.js's own LABOR_BASIS_FIELDS comment names
  // as "legacy... static only, no monthly path — the field the bug graded on" (issue #153).
  // #153 already moved every OTHER labor-target consumer onto resolveLaborTarget()'s
  // DEFAULT_LABOR_BASIS ('tCrewLabor', the field actually "sent to operators mid-month for
  // approval" and the one monthly_targets.crew_labor_pct actually persists) — this Performance
  // Review mapping was never updated to follow, so a monthly-uploaded labor target could never
  // reach it (dispatch #142 items 2/3: "Labor should reflect monthly target when present").
  // tLabor's own yearly-tier persistence (yearly_targets.labor_pct) also round-trips, but
  // tCrewLabor didn't exist as a yearly-tier column at all until this dispatch — see
  // supabase/schema-dispatch-142-sales-labor-targets.sql + saveYearlyTargets/loadYearlyTargets.
  labor: 'tCrewLabor',
  // osat: was UNMAPPED — dispatch #142 item 5. parseYearlyTargets() already parses Voice OSAT
  // PACE into tOsat (real column, real data, round-trips via yearly_targets.voice_osat_pct),
  // and the actual side (mo.osat = SMG FullScale osat5, dispatch #109) is already the same
  // 0-1 fraction scale (parsePct()'s convention) — confirmed before wiring, not assumed.
  osat: 'tOsat',
  salesVsTgt: 'tProdSales', opSupplies: 'tOpSupply', tpph: 'tTpph',
  // Dispatch #109 — the yearly workbook (dispatch #107) added these fields to ds.targets;
  // the actuals were already auto-sourced (digitalGC/delivGC, item #2) or just got wired
  // (delivWait, item #1; shiftCert/headcount/turnover90, item #6) but had no target mapping.
  delivWait: 'tMcdWait', digitalGC: 'tDigAppGCRD', delivGC: 'tMcdGCRD',
  // shiftCert ('# Shift Certified Managers') ↔ tShiftLeaders ('Shift Leader Target' column
  // in the yearly workbook) — not a perfect name match, wired as the closest real target
  // (both describe the store's target count of managers certified/authorized to run a shift
  // alone; "Shift Leader" and "Shift Manager" are used interchangeably across the org's own
  // source docs — see performance-reviews.js's SRC line for this metric, which itself cites
  // Altametrics' "Cert. Swing Mgr" label as a third name for the same role level). Flagged
  // here rather than silently assumed identical — revisit if the owner corrects it.
  shiftCert: 'tShiftLeaders', headcount: 'tHeadcount', turnover90: 'tToCrew090',
  // Dispatch #109 item #8 — target mapping for the 4 new EXTRA_KPIS candidates
  // (kpi-registry.js), matching the existing tpph precedent: the target auto-fills here
  // even though autoPopulateKPIs has not been taught to read the ACTUAL side for these yet.
  avgCheck: 'tAvgCheck', tRedBPct: 'tRedBPct', posOverAmt: 'tPosOverAmt', cashOSAmt: 'tCashOSAmt',
  // Dispatch #132 items 2/6, RE-VERIFIED by dispatch #135 item 2 (owner explicitly disputed the
  // "no workbook source" finding) — still resolve ONLY from a Targets-editor override
  // (target-overrides.js), at whichever scope (company/state/patch/store) the owner sets one.
  // totalProfit: confirmed again, no column anywhere in yearly_targets/monthly_targets (parser +
  // live production Supabase schema+data, 2026-08-25). complaints: the workbook DOES have a real
  // "1-800 Contacts" column (t1800Contacts) but it's a raw COUNT, not the /100K RATE this metric
  // needs — see target-overrides.js's TARGET_OVERRIDE_FIELDS note on tComplaintsTarget for the
  // full evidence. Absent any override, mergedTargetsForLoc simply never carries these keys —
  // totalProfit falls back to its positiveOnly interim rule (rateMetric), and complaints stays
  // unscored-by-target (missingReviewTargets flags it) until one is set.
  totalProfit: 'tTotalProfitTarget', complaints: 'tComplaintsTarget',
  // Dispatch #135 item 1 — the rest of DEFAULT_REVIEW_CONFIG's src:'manual' metrics, now
  // explicitly requested. All six investigated the same way (parser re-read in full, no column
  // found for any); see target-overrides.js's TARGET_OVERRIDE_FIELDS entries for each one's
  // specific evidence (real actual-data source found, just not a workbook TARGET).
  epb2b: 'tEPB2BTarget', fsAudits: 'tFSAuditsTarget', fsEcoSure: 'tFSEcoSureTarget',
  fsTablet: 'tFSTabletTarget', shiftVerif: 'tShiftVerifTarget', retention: 'tRetentionTarget',
  // Dispatch #145 — ead: real, already-parsed yearly-workbook target (parseYearlyTargets's
  // voiceEAD → t.tVoiceEAD → yearly_targets.voice_ead_pct).
  ead: 'tVoiceEAD',
  // eap: the dispatch's own text says "eap gets NO entry here (no workbook target)" — but
  // that's not what totalProfit/complaints (the exact pattern it points at, just above) do:
  // both map here to their OWN override-field name, not a workbook column, and
  // target-overrides.test.js enforces every TARGET_OVERRIDE_FIELDS row (bar foodOB) has a
  // matching entry here. Without one, an eap override could never auto-fill mo.eapTgt at all
  // (the loop below only walks THIS map) — the override option would exist in the Targets
  // editor and do nothing. Verified against the real code/test rather than the dispatch text
  // (CLAUDE.md "measure it, don't reason about it"); followed the actual totalProfit/complaints
  // pattern instead, which is what "follow the exact pattern" already meant.
  eap: 'tEAPTarget',
};

// Merged official targets for a loc: DEFAULT_TARGETS < yearly (ds.targets) < monthly
// (ds.monthlyTargets) < Targets-editor override (ds.targetOverrides — company/state/patch/store
// cascade, dispatch #132 item 3; see target-overrides.js) — the established precedence
// (monthly wins over yearly, matching store-dash/analytics), now extended one tier further: an
// explicit override is a human intentionally setting/correcting a number right now, so it wins
// over whatever the last workbook upload said, same reasoning as monthly already winning over
// yearly. ds.targetOverrides is the pre-indexed shape indexTargetOverrides() produces (App.js
// builds it once at startup from loadTargetOverrides()), not raw rows.
export function mergedTargetsForLoc(ds, loc) {
  const L = String(loc);
  const base = {
    ...(DEFAULT_TARGETS[L] || {}),
    ...((ds && ds.targets && ds.targets[L]) || {}),
    ...((ds && ds.monthlyTargets && ds.monthlyTargets[L]) || {}),
  };
  return applyTargetOverrides(base, ds && ds.targetOverrides, L);
}

// Month-aware official targets for a loc (dispatch #109 item #4). mergedTargetsForLoc above
// is a SINGLE snapshot — its monthly tier is `ds.monthlyTargets`, which App.js derives from
// whichever period was uploaded/loaded MOST RECENTLY (the "current" snapshot), not the
// review's own month. autoPopulateKPIs used to compute that snapshot ONCE, outside its
// per-month loop, and apply it to every month in the review's half — so a store's April
// target could silently apply to January too. This version keys the monthly tier by the
// SPECIFIC year+month requested, from `ds.allMonthlyTargets` (the full per-period index
// App.js already loads — 'YYYY-M', non-padded month, same convention as pipeline.js's own
// key construction and Planning > Yearly's `all[year + '-' + m]` lookup, yearly-projections.js).
// `ds.monthlyTargets` is layered ONLY on top of a matching period (guarded by its own
// _year/_month stamp, mirroring eom-supervisor.js's `mtOK` check) so a locally-parsed upload
// not yet round-tripped through allMonthlyTargets still wins for ITS OWN month, but can never
// leak into a different one — the exact cross-month contamination this fix exists to close.
export function mergedTargetsForLocMonth(ds, loc, year, month) {
  const L = String(loc);
  const periodKey = `${year}-${month}`;
  const fromAll = (ds && ds.allMonthlyTargets && ds.allMonthlyTargets[periodKey] && ds.allMonthlyTargets[periodKey][L]) || null;
  const snap = (ds && ds.monthlyTargets && ds.monthlyTargets[L]) || null;
  const snapOK = snap && (snap._year == null || (snap._year === year && snap._month === month));
  const base = {
    ...(DEFAULT_TARGETS[L] || {}),
    ...((ds && ds.targets && ds.targets[L]) || {}),
    ...(fromAll || {}),
    ...(snapOK ? snap : {}),
  };
  // Targets-editor override wins over this month's resolved workbook value too — same
  // precedence tier as mergedTargetsForLoc above (dispatch #132 item 3).
  return applyTargetOverrides(base, ds && ds.targetOverrides, L);
}

// Scored metrics (across the review's config categories) that have NO resolvable target —
// neither already entered on any month nor available from the official-targets namespace.
// Feeds a UI prompt: "set a target for X" (and a Smart-Targets seed where one exists).
export function missingReviewTargets(review, cfg, ds) {
  cfg = resolveReviewConfig(review, cfg);
  const tgts = mergedTargetsForLoc(ds || {}, review.loc);
  const months = review.kpis?.months || {};
  const out = [];
  for (const mets of Object.values(cfg.metrics || {})) {
    for (const m of mets) {
      if (!m.scored) continue;
      const tf = REVIEW_METRIC_TARGET_FIELD[m.key];
      const fromNamespace = tf != null && tgts[tf] != null;
      const anyMonthHasTgt = Object.values(months).some(mo => mo && mo[m.key + 'Tgt'] != null);
      if (!fromNamespace && !anyMonthHasTgt) out.push({ key: m.key, label: m.label });
    }
  }
  return out;
}

// ── Dispatch #154 (Performance Review continuity, Phase 5a) — promotion/transfer segmented ─────
// scoring. Full spec: memory/plan-performance-review-continuity-2026-08-26.md decision #3,
// memory/dispatch-154.md. A manager who transfers stores or gets promoted mid-year must have
// each period scored against the role/store that was ACTUALLY true then, not blended into one
// number. Timeline reconstruction (personAssignmentTimeline) lives in assignment-graph.js — see
// that file's own header for why (pure reports-to-graph data, no review concept involved). Every
// function below turns that timeline into review SCORES, so it lives here, next to
// computeScores/autoPopulateKPIs/mergedTargetsForLocMonth it depends on and reuses.

// Calendar-month [start,end] for a given year+month — extracted verbatim from what used to be
// autoPopulateKPIs's own private `monthRange` closure (below), so computeSegmentedReview can
// reuse the identical date math for month-boundary attribution instead of re-deriving it. Pure
// extraction; autoPopulateKPIs's own monthRange is now a one-line wrapper around this.
export function calendarMonthRange(year, month) {
  const s = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const e = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { s, e };
}

// staff_assignments.role stores a DEFAULT_ROLES LADDER id (dispatch #150's own design decision —
// see that table's schema comment), but cfg.competencies (this file) is keyed by ROLE_KEYS
// (GM/AM/DM/SM/AS/OM). permissions.js's REVIEW_ROLE_TO_LADDER is MANY-TO-ONE — AM, DM, and SM all
// collapse onto the single 'sm_am_dm' rung — so a bare ladder-id assignment row genuinely CANNOT
// distinguish which of the three a person actually held. That finer distinction exists ONLY as
// free text in the 2026 backfill script's own `notes` field (dispatch #150's
// rosterRowToAssignment: "-> suggested review role SM.") — not a structured, reliable signal a
// future manually-created assignment row is guaranteed to carry at all. Building a real fix (a
// structured job-code config table) is plan-doc item #8, explicitly out of scope here.
//
// Real-world impact, stated plainly rather than glossed over: 'gm' / 'area_supervisor' / 'om'
// resolve UNAMBIGUOUSLY — a genuine promotion into or out of one of those rungs (the plan doc's
// own motivating "Nick Rice" SM→GM example) scores against the RIGHT competency framework for
// whichever segment resolves to gm/area_supervisor/om. Only a segment landing ON the 'sm_am_dm'
// rung is imprecise. This picks 'AM' as the documented canonical stand-in — not an arbitrary
// choice: DEFAULT_REVIEW_CONFIG.competencies (top of this file) defines real content for GM/AM/
// AS/OM only — DM and SM have NO default competency block at all (confirmed by reading that
// object directly) — so 'AM' is the only one of {AM,DM,SM} that is actually informative, and the
// owner's own words already treat AM and DM as functionally interchangeable ("I would view them
// similar, if not the same" — plan doc decision #5).
export const LADDER_ROLE_TO_REVIEW_ROLE = { gm: 'GM', area_supervisor: 'AS', om: 'OM', sm_am_dm: 'AM' };

// `ladderRole == null` is the sentinel personAssignmentTimeline's caller (computeSegmentedReview)
// uses for "no real assignment row — this is the implicit whole-period segment" — in that case
// the review's OWN role is authoritative (there is no assignment data to override it with).
function resolveSegmentReviewRole(ladderRole, fallbackRole) {
  if (ladderRole == null) return fallbackRole;
  return LADDER_ROLE_TO_REVIEW_ROLE[ladderRole] || fallbackRole;
}

// Majority-of-month attribution (decision #3-A, owner's own words: "it was always awarded based
// on the store data in which the manager worked the majority of the month"). Pure function:
// given a period's [start,end] and an ordered list of candidate segments ({start,end,...}),
// returns whichever segment covers the MOST DAYS of that period. Ties broken by earliest
// segment start (deterministic; expected to be vanishingly rare in real data — two segments
// covering the exact same day-count of one period requires a transfer landing on an exact
// midpoint).
//
// Generalized beyond "a month" (the dispatch's own literal wording) on purpose: this file's data
// model resolves at TWO different granularities that both need this exact rule. Metrics are
// monthly (kpis.months); behavioralRatings has NO month-level resolution at all, only quarterly
// (q1..q4) — a segment boundary falling mid-quarter can't be split at the behavioral layer the
// way it can at the metrics layer. So quarter-level attribution reuses this SAME function at the
// quarter grain (a quarter's own [start,end], below) rather than inventing a second rule — the
// two granularities can legitimately disagree at a shared boundary month (e.g. a transfer early
// in a quarter's last month can majority-attribute that MONTH to the new store while the
// QUARTER as a whole still majority-attributes to the old one) — that is a deliberate, documented
// consequence of the schema's own monthly/quarterly split, not a bug.
export function resolvePeriodAttribution(periodStart, periodEnd, segments) {
  const ps = String(periodStart), pe = String(periodEnd);
  let best = null, bestDays = -1;
  for (const seg of (segments || [])) {
    const os = seg.start > ps ? seg.start : ps;
    const oe = seg.end < pe ? seg.end : pe;
    if (os > oe) continue; // no overlap with this period at all
    const days = _daysInclusive(os, oe);
    if (days > bestDays || (days === bestDays && best && seg.start < best.start)) { best = seg; bestDays = days; }
  }
  return best;
}
function _daysInclusive(a, b) {
  const da = new Date(a + 'T00:00:00Z'), db = new Date(b + 'T00:00:00Z');
  return Math.round((db - da) / 86400000) + 1;
}

// Scores ONE segment — a specific role + store + month/quarter subset — against ITS OWN role's
// competency framework and ITS OWN store's targets, reusing the IDENTICAL
// scoreMetricCategory/_metricsScoreAcross/_behavQuarterScore machinery computeScores() itself
// uses (extracted to module level specifically so this doesn't reinvent scoring math a second
// time, per this dispatch's own scope note).
//
// `segment` = { role: an ALREADY-RESOLVED ROLE_KEYS value (via resolveSegmentReviewRole — NOT a
// raw staff_assignments ladder id), loc, months: [1..12 subset], qKeys: ['q1'..] subset }.
//
// TARGETS: when `ds` is supplied and segment.loc differs from review.loc, this re-resolves each
// of the segment's months' targets FRESH against the segment's OWN store
// (mergedTargetsForLocMonth) — review.kpis.months[m][key+'Tgt'] was populated by
// autoPopulateKPIs against review.loc for the WHOLE year (see that function's own header comment,
// below), so trusting it as-is would silently compare a transferred segment's actuals against
// the WRONG store's targets. When segment.loc === review.loc (the common case — no transfer),
// the already-populated targets are reused unchanged: cheap, and provably identical to a fresh
// resolve since both would call the exact same function against the exact same store.
//
// ACTUALS: read from kpis.months[m][key] AS-IS, for every segment, including a transferred one.
// This is a KNOWN, DOCUMENTED LIMITATION, not an oversight — see autoPopulateKPIs's own header
// comment (below) and this dispatch's PR body for the full finding. Making autoPopulateKPIs
// itself segment-aware is real, nontrivial follow-on work, explicitly NOT one of this dispatch's
// 4 scope items.
export function computeSegmentScores(review, cfg, segment, ds) {
  cfg = resolveReviewConfig(review, cfg);
  const months = review.kpis?.months || {};
  const segLoc = segment.loc;
  const refreshTargets = !!(ds && segLoc != null && String(segLoc) !== String(review.loc));
  const mArr = (segment.months || []).map(m => {
    const mo = months[m];
    if (!mo) return null;
    if (!refreshTargets) return mo;
    const tgts = mergedTargetsForLocMonth(ds, segLoc, review.year, m);
    const patched = { ...mo };
    for (const [mk, tf] of Object.entries(REVIEW_METRIC_TARGET_FIELD)) {
      if (tgts[tf] != null) patched[mk + 'Tgt'] = tgts[tf];
    }
    return patched;
  }).filter(Boolean);

  const metrics = _metricsScoreAcross(mArr, cfg);
  const behavioral = _avgOfVals((segment.qKeys || []).map(qKey => _behavQuarterScore(review, cfg, qKey, segment.role)));
  const overall = (metrics != null && behavioral != null)
    ? metrics * cfg.overall.metrics + behavioral * cfg.overall.behavioral : null;
  return {
    role: segment.role, loc: segment.loc, start: segment.start, end: segment.end,
    months: segment.months || [], qKeys: segment.qKeys || [],
    metrics, behavioral, overall,
  };
}

// Provisional weighted rollup (scope item 4) — segment-length (MONTH COUNT) weighted average of
// each segment's `overall` score, as a STARTING POINT a reviewer can adjust with commentary, NOT
// a rigid formula — per the plan doc decision #3's own HR-research conclusion: "the overall
// rating... does not need to be an average." Weighted by MONTHS, not days: the whole attribution
// pipeline above already resolves at monthly resolution for metrics (majority-of-month) and
// quarterly resolution for behavioral — introducing day-level weighting here would fabricate a
// precision the rest of this dispatch deliberately doesn't have (day-weighted apportionment is
// the plan doc's own explicitly-deferred v2, not built here). A segment with a null `overall`
// (e.g. no scored data at all for its months) contributes ZERO WEIGHT, not a zero score —
// matching how every other rollup in this file (`combine`, `rollup`) already treats a missing
// leg as "excluded", never "scored zero".
export function provisionalSegmentRollup(segments) {
  let wS = 0, wT = 0;
  for (const seg of (segments || [])) {
    const overall = seg.overall;
    const weight = (seg.months || []).length;
    if (overall == null || !weight) continue;
    wS += overall * weight; wT += weight;
  }
  return {
    value: wT > 0 ? wS / wT : null,
    provisional: true,
    note: 'Provisional weighted rollup (segment length in months x segment score) — a starting point for the reviewer to adjust with commentary, not a final number.',
    segmentCount: (segments || []).length,
  };
}

// Ties personAssignmentTimeline (assignment-graph.js) + resolvePeriodAttribution +
// computeSegmentScores into the full pipeline: reconstruct the person's own assignment history
// for the period, majority-attribute every month (metrics) and quarter (behavioral) to its
// winning segment, group into distinct role+loc segments, score each one, and produce a
// provisional weighted rollup.
//
// Defaults to the review's own full year; a caller can narrow to a sub-range via
// opts.periodStart/periodEnd (same month-set the existing periods.h1/h2 status already
// partitions on) for Phase 5b's eventual per-half segment display — NOT built or exercised here
// (this dispatch's own tests only use the full-year default); flagged so a future caller knows
// the hook exists rather than rebuilding this function.
//
// THE COMMON CASE (no promotion/transfer — most reviews): personAssignmentTimeline returns []
// (no staff_assignments rows for this person at all) OR exactly one segment spanning the whole
// period. Either way this collapses to exactly ONE segment using the review's OWN role/loc —
// `hasTransitions` is false, and `rollup.value` is provably identical to computeScores(review,
// cfg).year.overall for that case (see review-engine-segmented-scoring.test.js's own equivalence
// test) — callers can use the flag to skip segment UI entirely and use the existing
// computeScores()/computeScoreBreakdown() as today (Phase 5b's call to make, not built here).
export function computeSegmentedReview(review, cfg, ds, assignmentRows, opts = {}) {
  cfg = resolveReviewConfig(review, cfg);
  const year = review.year || new Date().getFullYear();
  const periodStart = opts.periodStart || `${year}-01-01`;
  const periodEnd = opts.periodEnd || `${year}-12-31`;
  const person = review.person || review.name;

  const timeline = personAssignmentTimeline(person, periodStart, periodEnd, assignmentRows || []);
  // No assignment data at all -> one implicit whole-period segment, review's own role/loc
  // (role:null is the sentinel resolveSegmentReviewRole reads as "use review.role verbatim").
  const effective = timeline.length ? timeline : [{ role: null, loc: review.loc, start: periodStart, end: periodEnd }];

  const winnerFor = (s, e) => resolvePeriodAttribution(s, e, effective) || effective[0];
  const segKey = w => `${w.role || ''}::${w.loc || ''}`;
  const groups = {};
  const addTo = (w, kind, val) => {
    const k = segKey(w);
    if (!groups[k]) groups[k] = { role: w.role, loc: w.loc, start: w.start, end: w.end, months: [], qKeys: [] };
    groups[k][kind].push(val);
  };

  for (let m = 1; m <= 12; m++) {
    const { s, e } = calendarMonthRange(year, m);
    addTo(winnerFor(s, e), 'months', m);
  }
  for (const [qKey, qMonths] of Object.entries(QUARTER_MONTHS)) {
    const s = calendarMonthRange(year, qMonths[0]).s;
    const e = calendarMonthRange(year, qMonths[qMonths.length - 1]).e;
    addTo(winnerFor(s, e), 'qKeys', qKey);
  }

  const segments = Object.values(groups).map(g => {
    const reviewRole = resolveSegmentReviewRole(g.role, review.role);
    return computeSegmentScores(review, cfg, { ...g, role: reviewRole }, ds);
  });

  return {
    segments,
    hasTransitions: timeline.length > 1 && segments.length > 1,
    rollup: provisionalSegmentRollup(segments),
  };
}

// Dispatch #149: this function unconditionally overwrites every src:'auto' metric's mo[key] on
// every run, by design — see the "Locked-actual overrides" section above (near
// applyReviewOverrides) for the full rationale. A manual correction NEVER goes into mo[key]
// anymore (KPIGrid makes src:'auto' actual cells read-only); it lives in a separate override
// record, so this function re-running freely can never destroy one. Do not add a null-check
// guard here to "fix" the overwrite — that would make the review show stale cloud data instead
// of the current one, which is the opposite of correct.
//
// ⚠️ Dispatch #154 finding (Performance Review continuity, Phase 5a — investigated, NOT fixed
// here, per that dispatch's own explicit scope): this function is NOT segment-aware. `loc` (just
// below) is resolved ONCE from `review.loc` and used for EVERY one of the 12 months' worth of
// data lookups in this function — metricAvg() calls, mergedTargetsForLocMonth(), every
// byMonth()/byLocMonth() row filter (labor/FOB/eBOS/roster/turnover/digital/delivery/SMG
// FullScale), and the SHIFT_ATTRIBUTABLE_ROLES check. So for a person who transferred stores
// mid-year, EVERY auto-sourced actual for EVERY month — including months before the transfer —
// is sourced from review.loc (typically the person's CURRENT store, since that is what an admin
// sets a review's own `loc` to), never from an earlier segment's own, different store. Making
// this segment-aware would mean threading a per-month-resolved loc through roughly 15 distinct
// per-month lookups here — real, nontrivial follow-on work, and NOT one of dispatch #154's 4
// listed scope items, so it is documented here rather than attempted. Practical consequence:
// computeSegmentScores (above) can and does correctly re-resolve a transferred segment's own
// TARGETS (mergedTargetsForLocMonth is already loc-parameterized per call, so that half of the
// fix costs nothing extra); it CANNOT correct that segment's ACTUALS, which still reflect
// whatever this function most recently populated against review.loc. A same-store ROLE-ONLY
// promotion is entirely unaffected by this gap (loc never changes, so every month's actuals are
// already correct regardless of segment).
export function autoPopulateKPIs(review, ds) {
  if (!ds?.loaded) return review;
  const loc = review.loc;
  const months = JSON.parse(JSON.stringify(review.kpis.months));
  // Dispatch #109 item #4 — targets are resolved PER MONTH below (mergedTargetsForLocMonth),
  // not once here for the whole review period. See that function's own comment for why: the
  // old single mergedTargetsForLoc() snapshot let one month's uploaded target silently apply
  // to every other month in the review's half.

  const byMonth = (rows, locF='loc') => {
    const map={};
    for (const r of (rows||[])) {
      if (r[locF] !== loc) continue;
      const d = r.date;
      if (!d) continue;
      const m = d instanceof Date ? d.getMonth()+1 : parseInt(String(d).slice(5,7));
      if (!map[m]) map[m]=[];
      map[m].push(r);
    }
    return map;
  };

  const avg = (arr,k) => { const v=arr.map(r=>r[k]).filter(x=>x!=null&&x!==0); return v.length?v.reduce((a,b)=>a+b,0)/v.length:null; };
  const sum = (arr,k) => { const v=arr.map(r=>r[k]).filter(x=>x!=null); return v.length?v.reduce((a,b)=>a+b,0):null; };

  const laborM = byMonth(ds.laborRows);
  // fobM/fr still backs the manual-fallback path for mo.foodOB below AND the fobPct leg of
  // the (out-of-scope, dispatch #161 explicitly excludes it) totalProfit derivation further
  // down — left reading ds.fobRows exactly as before. Only foodOB's own actual-fill switched
  // to the auto qsr_fob source (qsrFobRowsForLoc/fobByRange, just below).
  const fobM   = byMonth(ds.fobRows);
  const ebosM  = byMonth(ds.ebosRows); // eBOS daily op-supplies purchases (Notes 32 #4)
  // Dispatch #161 — ds.qsrFobRows (auto-pulled qsr_fob stream), pre-filtered to this
  // review's own loc so fobByRange (which has no locs param — v5.203's own fix note) only
  // ever scans/aggregates this store's rows, called once per month inside the loop below.
  const _unpadLoc = l => String(l == null ? '' : l).replace(/^0+/, '') || String(l == null ? '' : l);
  const qsrFobRowsForLoc = (ds.qsrFobRows || []).filter(r => _unpadLoc(r.loc) === _unpadLoc(loc));

  // People reports are monthly per-loc, keyed by 'YYYY-MM' — index by month number
  // for this store/year (Notes 32 #1/#2/#3). Headcount ← Roster Statistics (authoritative
  // active count), Shift-Cert ← Roster role counts (shiftMgr bucket), 0-90 ← Turnover.
  const _ry = review.year || new Date().getFullYear();
  const monthNum = pm => parseInt(String(pm || '').slice(5, 7));
  // Calendar-month date range for metric-source.js's metricAvg (dispatch #109 item #3) —
  // OEPE/R2P/KVS/Labor% below are resolved through the app's own auto-first resolver
  // instead of hand-filtering ds.opsRows/ds.laborRows, so a month range in the shape it
  // expects ({s,e}, either Date or 'YYYY-MM-DD' — see metricSeries) is built once per month.
  // Dispatch #154: extracted to the module-level calendarMonthRange() export above, reused here
  // unchanged rather than duplicated — computeSegmentedReview needs the identical date math.
  const monthRange = (m) => calendarMonthRange(_ry, m);
  const byLocMonth = (rows) => {
    const m = {};
    for (const r of (rows || [])) {
      if (String(r.loc) !== String(loc) || !r.month) continue;
      if (parseInt(String(r.month).slice(0, 4)) !== _ry) continue;
      m[monthNum(r.month)] = r;
    }
    return m;
  };
  const rosterStatM = byLocMonth(ds.rosterStatsRows);
  const roleCountM  = byLocMonth(ds.rosterRoleCounts);
  const turnoverM   = byLocMonth(ds.turnoverRows);
  const digitalM    = byLocMonth(ds.digitalAppRows);   // Digital App GC/R/D (Notes 32)
  const deliveryM   = byLocMonth(ds.mcdeliveryRows);   // Delivery GC/R/D (Notes 32)
  // Shift-manager attribution (Notes 33 A#3): when a review is linked to a manager
  // (review.geid) and the reviewee is NOT a GM, the operational metrics score on that
  // manager's OWN shifts (Shift Manager Summary), not the store total. Everything else
  // stays store-total. GMs own the whole store, so they always use store-total.
  const mgrGeid = review.geid != null && review.geid !== '' ? Number(review.geid) : null;
  // Only the store-level shift roles attribute to a manager's own shifts (GM = whole
  // store; AS/OM are above-store). Padding-agnostic loc match (ds.storeIds vs
  // shift_manager_monthly.loc can differ in zero-padding).
  const _normLoc = v => String(v == null ? '' : v).replace(/^0+/, '') || String(v == null ? '' : v);
  const canAttribute = SHIFT_ATTRIBUTABLE_ROLES.includes(String(review.role || ''));
  const shiftMgrM = {};
  if (mgrGeid && canAttribute) {
    const wantLoc = _normLoc(loc);
    for (const r of (ds.shiftManagerRows || [])) {
      if (_normLoc(r.loc) !== wantLoc || Number(r.geid) !== mgrGeid || !r.month) continue;
      if (parseInt(String(r.month).slice(0, 4)) !== _ry) continue;
      shiftMgrM[monthNum(r.month)] = r;
    }
  }

  // SMG FullScale: index by year+month for this store to avoid cross-year collision
  const reviewYear = review.year || new Date().getFullYear();
  const smgFSByMonth = {};
  for (const r of (ds.smgFullscale||[])) {
    if (String(r.loc) !== String(loc)) continue;
    if (r.year !== reviewYear) continue;
    smgFSByMonth[r.month] = r;
  }

  for (const [mn, mo] of Object.entries(months)) {
    const m = parseInt(mn);
    const lr = laborM[m]||[];
    const fr = fobM[m]||[];
    const er = ebosM[m]||[];
    const sr = smgFSByMonth[m];
    // Dispatch #109 item #4 — resolved for THIS month specifically (DEFAULT < yearly <
    // this month's allMonthlyTargets entry), not the single review-wide snapshot the old
    // code used. See mergedTargetsForLocMonth's own comment for the full rationale.
    const officialTgts = mergedTargetsForLocMonth(ds, loc, _ry, m);

    // Dispatch #174 — mo.salesVsTgt (Sales actual) used to be set HERE, unconditionally, from
    // sum(lr,'sales') — hand-filtering ONLY the manual ds.laborRows stream, with zero auto/cloud
    // fallback (the exact bypass CLAUDE.md's auto-first rule exists to prevent: the live
    // `labor_rows` table's most recent upload is 2026-07-23, so this silently blanked Sales
    // actual — and everything derived from it, incl. mo.foodOBTgt below — for every month after
    // it). It now resolves through metric-source.js's already-registered 'sales' chain
    // (auto-first: qsrActSummaryRows sales/allNetSales, THEN ds.laborRows last) right after
    // `range` is computed below — same auto-then-manual precedence, and same code shape, as
    // foodOB a few lines further down. See that block for the actual assignment.
    // Dispatch #142 items 1-3: salesVsTgtTgt/laborTgt used to be set HERE, from
    // sum(lr,'salesTgt')/avg(lr,'laborTgt') — a manual-upload field that unconditionally
    // overwrote whatever the officialTgts cascade (yearly/monthly workbook, computed just
    // above) would have supplied, completely bypassing DEFAULT < yearly < monthly
    // precedence for these two metrics only. Verified against the actual data model before
    // removing, not just assumed: parseLaborData() (src/parsers/index.js) never emits a
    // salesTgt/tSales/laborTgt/tCombLabor field on a labor row, saveLaborRows()/
    // loadLaborRows() (src/lib/supabase.js) never round-trip one either, and the live
    // production `labor_rows` table has no such column — so this bypass was already fully
    // dead code today, not the active cause of the wrong numbers. It's still removed per
    // the dispatch, both because it's misleading dead code and because an unconditional
    // overwrite here would silently reintroduce the bypass the moment any future labor-row
    // format ever added a same-named field. These two metrics now fall through to the SAME
    // generic auto-fill loop every other metric already uses (below) — with the old lr
    // fields kept ONLY as an explicit fallback AFTER officialTgts, never instead of it (see
    // that block, right after the generic loop).
    // OEPE / R2P / KVS / Labor % actuals (dispatch #109 item #3) — routed through
    // metric-source.js's metricAvg (glimpse/DAR/controls auto-first, manual upload last)
    // instead of hand-filtering ds.opsRows/ds.laborRows directly, closing the exact bypass
    // CLAUDE.md's auto-first rule exists to prevent (a stale manual upload winning over a
    // current cloud stream on the same day). Strictly a superset of the old ds.opsRows /
    // ds.laborRows-only fallback — both are still in the resolver's own chains.
    const range = monthRange(m);
    // OEPE/R2P via metricRate, not metricAvg (dispatch #155). `months` iterates all 12
    // calendar months of the review year (blankMonthKPIs, this function's own `months`
    // build-up above) and monthRange(m) always returns the FULL calendar month — it does
    // NOT clip to "so far" for the current month. autoPopulateKPIs can genuinely be called
    // for a review of the current, still-in-progress month (a review actively being built
    // mid-period), so `range` here CAN include today's still-open business day — the exact
    // shape metricRate exists for. kvst joined oepe/r2p/tpph under dispatch #221 (now
    // `kind:'ratio'` with kvstNumSec/kvstTransCnt legs), so kvsAvg is on metricRate too now.
    // laborAvg stays on metricAvg: laborPct is not a `kind:'ratio'` metric (no declared
    // numerator/denominator pair in METRIC_SOURCES), so metricSumRatio can't compute a
    // Sum/Sum for it regardless — out of scope here.
    const oepeAvg  = metricRate(ds, loc, range, 'oepe');
    const r2pAvg   = metricRate(ds, loc, range, 'r2p');
    const kvsAvg   = metricRate(ds, loc, range, 'kvst');
    const laborAvg = metricAvg(ds, loc, range, 'laborPct');
    // 2nd Side Healthy Usage (owner, 2026-08-26: "we need to populate it as well") — same
    // metricAvg auto-first pattern as kvsAvg just above, reading the already-registered
    // 'kvsHealthy' source (metric-source.js: glimpse/opsService/qsrActSummary cloud streams,
    // manual ds.opsRows.kvsu last). Left scored:false per the owner's own note; this only
    // populates the Act/Tgt values, doesn't turn scoring on.
    const secondSideAvg = metricAvg(ds, loc, range, 'kvsHealthy');
    if (oepeAvg  != null) mo.oepe  = oepeAvg;
    if (r2pAvg   != null) mo.r2p   = r2pAvg;
    if (kvsAvg   != null) mo.kvs   = kvsAvg;
    if (laborAvg != null) mo.labor = laborAvg;
    if (secondSideAvg != null) mo.secondSide = secondSideAvg;
    // Dispatch #174 — Sales actual (mo.salesVsTgt): auto-first via metric-source.js's already-
    // registered 'sales' chain (qsrActSummaryRows sales/allNetSales, THEN ds.laborRows last),
    // summed over this month's calendar range (`range`, resolved just above) — same
    // Object.values(metricSeries(...)).reduce(...) pattern already used elsewhere in this
    // codebase (src/views/sage.js, src/views/store-analytics.js), not a new aggregation helper.
    // Falls back to the manual `lr`-based sum ONLY when the auto path has nothing for this
    // month (empty series — e.g. a genuinely manual-only store/month, or one predating any
    // cloud stream), same auto-then-manual precedence direction as foodOB right below.
    const salesAutoVals = Object.values(metricSeries(ds, loc, range, 'sales'));
    if (salesAutoVals.length) {
      mo.salesVsTgt = salesAutoVals.reduce((a, b) => a + b, 0);
    } else if (lr.length) {
      const s = sum(lr, 'sales');
      if (s != null) mo.salesVsTgt = s;
    }
    // Dispatch #161 — auto-first: fobByRange() over this month's calendar range (`range`,
    // just resolved above), reading the qsr_fob dollar shape (prodSalesAmt/compWasteAmt/…),
    // NOT fobM's manual ds.fobRows shape (fobPct/fobDollar, no *Amt — passing that shape to
    // fobByRange silently skips every row, same trap v5.203 fixed for the One-Pagers).
    // Reconciled against ds.fobRows for 6 real store-months (loc 3708 Dec'25–May'26, loc
    // 5183 May'26) via a live service-role Supabase measurement before this switch — both
    // sources matched to the penny (see this dispatch's PR body). prodSales>0 gates "the
    // auto source actually has this month" (fobByRange's own convention — a component-only/
    // pre-settle result reads back as all-zero, not absent) so an unsettled or missing month
    // falls through to the manual ds.fobRows figure instead of silently reading $0.
    const autoFob = fobByRange(qsrFobRowsForLoc, range)[_unpadLoc(loc)];
    if (autoFob && autoFob.prodSales > 0) {
      mo.foodOB = autoFob['fob$'];
    } else if (fr.length) {
      const fd = sum(fr,'fobDollar');
      if (fd!=null) mo.foodOB = fd;
    }
    if (er.length) {
      // Op Supplies actual = Σ the month's daily op-supplies purchases (auto-pulled eBOS).
      const op = sum(er,'opsPurchases');
      if (op!=null) mo.opSupplies = op;
    }
    // People metrics (monthly per-loc, auto-first): Headcount ← Roster Statistics
    // (Roster Active = all active hourly), Shift-Cert ← role counts, 0-90 ← Turnover.
    const rst = rosterStatM[m];
    if (rst && rst.rosterActive != null) mo.headcount = rst.rosterActive;
    const rcc = roleCountM[m];
    if (rcc && rcc.shiftMgr != null) mo.shiftCert = rcc.shiftMgr;
    const tvr = turnoverM[m];
    if (tvr && tvr.turnover090Pct != null) mo.turnover90 = tvr.turnover090Pct;
    // Digital/Delivery GC/R/D (auto-first; only used if the review includes the metric)
    // Sales Drivers: Digital App GC/R/D + Delivery GC/R/D (the review's own metric keys).
    const dig = digitalM[m];
    if (dig && dig.appGcRd != null) mo.digitalGC = dig.appGcRd;
    const dlv = deliveryM[m];
    if (dlv && dlv.deliveryGcRd != null) mo.delivGC = dlv.deliveryGcRd;
    // Delivery Wait Time actual (dispatch #109 item #1) — "Restaurant Time" is the
    // in-store/restaurant-side wait leg, confirmed against people-reports.js's own field
    // comments AND the yearly workbook's "McDelivery Restaurant Wait Time" column (which
    // tMcdWait, this metric's target below, is filled from) — NOT mcDeliveryTimeSec, the
    // courier/total-delivery-side leg.
    if (dlv && dlv.restaurantTimeSec != null) mo.delivWait = dlv.restaurantTimeSec;
    // Manager-attributed OVERRIDE (after the store fills): a DM/shift review's
    // operational metrics use this manager's own shifts. Only the rate/time metrics
    // that compare fairly to the store target (OEPE/R2P/KVS/Labor%); volume metrics
    // (sales, digital, delivery) stay store-total (a shift lead isn't graded on the
    // store's monthly sales target). See notes-33-queue A#3.
    const smg = shiftMgrM[m];
    if (smg) {
      if (smg.oepe != null) mo.oepe = smg.oepe;
      if (smg.r2p != null) mo.r2p = smg.r2p;
      if (smg.kvs != null) mo.kvs = smg.kvs;
      if (smg.laborPct != null) mo.labor = smg.laborPct;
    }
    if (sr) {
      // osat5 = 5-star only; McDonald's counts only 5 as a pass (1-4 = fail)
      if (sr.osat5 != null) mo.osat = sr.osat5;
      // Dispatch #145 — EAP actual. overallProblem is the in-app field name parseSMGFullScale
      // emits (raw Supabase column: overall_problem); confirmed via src/lib/supabase.js's
      // loadSmgFullscale() mapping, not assumed from the raw column name. EAD gets no actual
      // wiring here — none exists (see the metric's own comment above).
      if (sr.overallProblem != null) mo.eap = sr.overallProblem;
    }

    // Target auto-fill from the official targets (Notes 32 A) — fill each mapped metric's
    // target slot from DEFAULT < yearly < monthly (monthly wins) when the row-based fill
    // above didn't already set it. Never overrides an existing target.
    for (const [mk, tf] of Object.entries(REVIEW_METRIC_TARGET_FIELD)) {
      const slot = mk + 'Tgt';
      if (mo[slot] == null && officialTgts[tf] != null) mo[slot] = officialTgts[tf];
    }

    // Dispatch #142 items 1-3 — legacy manual-upload fallback for Sales/Labor targets,
    // AFTER officialTgts (never instead of it, same precedence direction as everywhere
    // else). Investigated whether any legitimate case still needs this: no current parser
    // or Supabase table populates salesTgt/tSales/laborTgt/tCombLabor on a labor row (see
    // the comment above where these used to be read unconditionally), so this is a no-op
    // today, kept only as a safety net in case a future/legacy upload format ever carries
    // a real per-row target and officialTgts genuinely has nothing for that month.
    if (mo.salesVsTgtTgt == null) {
      const st = sum(lr,'salesTgt') ?? sum(lr,'tSales');
      if (st != null) mo.salesVsTgtTgt = st;
    }
    if (mo.laborTgt == null) {
      const lt = avg(lr,'laborTgt') ?? avg(lr,'tLabor') ?? avg(lr,'tCombLabor');
      if (lt != null) mo.laborTgt = lt;
    }

    // FOB $ target (dispatch #132 item 5 — "FOB target is a monthly target"). foodOB scores
    // in DOLLARS (fobDollar, above) but the workbook's tFOBTarget is a PERCENTAGE — that scale
    // mismatch is exactly why foodOB was excluded from REVIEW_METRIC_TARGET_FIELD entirely (see
    // that map's own comment); it never got an auto target at all before this. Convert using
    // this SAME month's sales (mo.salesVsTgt, same reuse pattern as the Total Profit derivation
    // below). officialTgts.tFOBTarget already resolves DEFAULT < yearly < monthly < override
    // (mergedTargetsForLocMonth, above), so "prefer monthly over yearly" — the owner's explicit
    // ask — falls out of that existing precedence for free; nothing month-specific to add here.
    if (mo.foodOBTgt == null && officialTgts.tFOBTarget != null && mo.salesVsTgt != null) {
      mo.foodOBTgt = officialTgts.tFOBTarget * mo.salesVsTgt;
    }

    // Total Profit vs Target (dispatch #109 item #5) — derive from THIS SAME month's
    // already-resolved Labor%/Op-Supplies values (set above) plus FOB%, no separate pull.
    // The review's own `foodOB` metric scores in DOLLARS (fobDollar, above), so it can't
    // feed deriveTotalProfitVsTarget directly — that function needs the FOB *percentage*
    // legs, read straight off the same `fr` FOB rows (fobPct, sibling field to fobDollar)
    // and the same officialTgts.tFOBTarget already resolved in scope here — not a new pull.
    if (mo.totalProfit == null) {
      const fobPctActual = avg(fr, 'fobPct');
      const fobPctTarget = officialTgts.tFOBTarget ?? null;
      const sales = mo.salesVsTgt; // no separate net/prod-sales split available here; one figure feeds both legs
      const { total$ } = deriveTotalProfitVsTarget({
        fobPctActual, fobPctTarget,
        laborPctActual: mo.labor, laborPctTarget: mo.laborTgt,
        opSuppliesActual: mo.opSupplies, opSuppliesTarget: mo.opSuppliesTgt,
        netSales: sales, prodSales: sales,
      });
      if (total$ != null) {
        mo.totalProfit = total$;
        if (mo.totalProfitTgt == null) mo.totalProfitTgt = 0;
      }
    }
  }

  return { ...review, kpis:{ ...review.kpis, months } };
}

// ── Total Profit vs Target (derived — Notes 32 #5) ────────────────────────────
// "Total Profit" for the review is derived from the Profitability category's OWN
// controllables (no separate pull): how many DOLLARS the store beat/missed its targets
// on FOB %, Labor %, and Op-Supplies $. Favorable (beat target) = positive.
//   fob$     = (fobPctTarget  − fobPctActual)  × prodSales     (lower FOB%  than tgt ⇒ +)
//   labor$   = (laborPctTarget − laborPctActual) × netSales    (lower labor% than tgt ⇒ +)
//   opSupply$= (opSuppliesTarget − opSuppliesActual)           (under budget ⇒ +)
//   total$   = Σ available components (a missing input drops only its own component)
// Scored as a variance-to-target: month.totalProfit = total$, month.totalProfitTgt = 0,
// better:'higher'. The target % / $ are the store's own official targets (auto-filled),
// so the "target" side is built from the same pattern as the actuals.
const _n = v => (typeof v === 'number' && isFinite(v)) ? v : null;
export function deriveTotalProfitVsTarget({
  fobPctActual, fobPctTarget, laborPctActual, laborPctTarget,
  opSuppliesActual, opSuppliesTarget, netSales, prodSales,
} = {}) {
  const ns = _n(netSales);
  const ps = _n(prodSales) ?? ns;
  const fA = _n(fobPctActual), fT = _n(fobPctTarget);
  const lA = _n(laborPctActual), lT = _n(laborPctTarget);
  const oA = _n(opSuppliesActual), oT = _n(opSuppliesTarget);
  const fob$      = (fA != null && fT != null && ps != null) ? (fT - fA) * ps : null;
  const labor$    = (lA != null && lT != null && ns != null) ? (lT - lA) * ns : null;
  const opSupply$ = (oA != null && oT != null)               ? (oT - oA)      : null;
  const parts = [fob$, labor$, opSupply$].filter(v => v != null);
  const total$ = parts.length ? parts.reduce((a, b) => a + b, 0) : null;
  return { fob$, labor$, opSupply$, total$, components: parts.length };
}

// ── Util ───────────────────────────────────────────────────────────────────────
function deepCopy(obj) { return JSON.parse(JSON.stringify(obj)); }

export const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const H1_MONTHS = [1,2,3,4,5,6];
export const H2_MONTHS = [7,8,9,10,11,12];
export function halfMonths(half) { return half==='H1' ? H1_MONTHS : H2_MONTHS; }
export function halfQKeys(half)  { return half==='H1' ? ['q1','q2'] : ['q3','q4']; }
export function qLabel(q) { return {q1:'Q1',q2:'Q2',q3:'Q3',q4:'Q4'}[q]||q; }
export function qMonths(q) { return {q1:[1,2,3],q2:[4,5,6],q3:[7,8,9],q4:[10,11,12]}[q]||[]; }

// ── Review Status Workflow ─────────────────────────────────────────────────────
// Dispatch #162 (Performance Review continuity, build item #6) — `auto_finalized` is a NEW status
// value, never written by a human clicking Submit/Approve/Return/Reopen (StatusActionBar,
// performance-reviews.js). It is written ONLY by departure.js's applyDepartureAutoFinalize(), via
// this same transitionReview() below, when a departure is detected for a person with an open
// review. Kept a distinct value (rather than reusing 'approved' + a statusHistory note) so the
// distinction is visible everywhere REVIEW_STATUSES already drives UI (StatusBadge, ReviewList's
// HalfStatusSummary) with zero extra plumbing, not just in a statusHistory entry a reader has to
// go looking for — plan doc's own requirement: "visibly different in the UI, not just in the
// data." A distinct color (purple) that isn't used by any other status keeps it unmistakable.
export const REVIEW_STATUSES = {
  draft:          { label: 'Draft',                          color: '#64748b' },
  submitted:      { label: 'Submitted for Review',            color: '#f59e0b' },
  approved:       { label: 'Approved',                        color: '#16a34a' },
  returned:       { label: 'Returned for Revision',           color: '#ef4444' },
  auto_finalized: { label: 'Auto-Finalized — Departure',      color: '#a855f7' },
};

// Dispatch #152 (Performance Review continuity, Phase 4a) — new `half` parameter ('h1' | 'h2').
// A year record's two real-world review conversations (mid-year, end-of-year) keep their OWN
// independent status/audit trail — the owner's own words: "I'd still wanna see... a six month
// half first half year review and a second six month second half year review" — so a year is not
// approved as one atomic event; its two halves are, at different points in the year. This is the
// same {from,to,notes,at} audit-trail shape the old top-level statusHistory always used, just
// nested under `periods[half]` instead of the review root — transitioning one half NEVER touches
// the other half's own statusHistory (each half's array is only ever spread from itself).
export function transitionReview(id, half, newStatus, notes = '') {
  const reviews = getReviews();
  const review = reviews[id];
  if (!review) return null;
  const periods = review.periods || {};
  const cur = periods[half] || { status: 'draft', statusHistory: [], statusNotes: '' };
  const updatedPeriod = {
    ...cur,
    status: newStatus,
    statusHistory: [
      ...(cur.statusHistory || []),
      { from: cur.status || 'draft', to: newStatus, notes, at: new Date().toISOString() },
    ],
    statusNotes: notes || '',
  };
  const updated = {
    ...review,
    periods: { ...periods, [half]: updatedPeriod },
    updatedAt: new Date().toISOString().slice(0, 10),
  };
  upsertReview(updated);
  return updated;
}
