// Performance Review Engine — config, storage, and scoring

const REVIEW_CONFIG_KEY = 'mf_review_config_v1';
const PERF_REVIEWS_KEY  = 'mf_perf_reviews_v1';

export const CAT_KEYS   = ['rgr','sales','profit','people'];
export const CAT_LABELS = { rgr:'Running Great Restaurants', sales:'Sales Drivers', profit:'Profitability', people:'People Staffing & Retention', admin:'Administration' };
export const ROLE_KEYS  = ['GM','AM','AS','OM'];
export const ROLE_LABELS= { GM:'General Manager', AM:'Assistant Manager', AS:'Area Supervisor', OM:'Operations Manager' };

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
      { key:'osat',       label:'Voice OSAT',                 weight:0.10, better:'higher', unit:'pct', scored:true,  t:[0.05,0,-0.05],    src:'manual',                    note:'Target = store-specific' },
      { key:'epb2b',      label:'EPB2B (Pace Portal, %)',     weight:0.10, better:'lower',  unit:'pct', scored:true,  t:[-0.02,0.02,0.04], src:'manual',                    note:'Lower EPB2B = better' },
      { key:'r2p',        label:'R2P Front Counter (sec)',    weight:0.10, better:'lower',  unit:'abs', scored:true,  t:[-5,5,10],         src:'auto', field:'r2p',        note:'Target = store R2P target (sec)' },
      { key:'delivWait',  label:'Delivery Wait (sec)',        weight:0.10, better:'lower',  unit:'abs', scored:true,  t:[-30,0,120],       src:'manual',                    note:'Target = 240 sec (4 min)' },
      { key:'kvs',        label:'KVS Time (sec)',             weight:0.10, better:'lower',  unit:'abs', scored:true,  t:[-3,3,6],          src:'auto', field:'kvst',       note:'Target = store KVS target (sec)' },
      { key:'secondSide', label:'2nd Side Healthy Usage (%)', weight:0.05, better:'higher', unit:'pct', scored:false, t:[0.05,-0.05,-0.10],src:'manual',                    note:'Not scored — reference only' },
      { key:'complaints', label:'Complaint Contacts/100K',    weight:0.05, better:'lower',  unit:'abs', scored:true,  t:[-2,2,4],          src:'manual',                    note:'Absolute count vs target' },
      { key:'fsAudits',   label:'FS Audits Completed',        weight:0.05, better:'higher', unit:'pct', scored:true,  t:[0,-0.10,-0.20],   src:'manual',                    note:'% of target audits completed' },
      { key:'fsEcoSure',  label:'Food Safety EcoSure (%)',    weight:0.10, better:'higher', unit:'pct', scored:true,  t:[0,-0.10,-0.20],   src:'manual',                    note:'% score vs target' },
      { key:'fsTablet',   label:'FS Completion T-60 (%)',     weight:0.05, better:'higher', unit:'pct', scored:true,  t:[0,-0.10,-0.20],   src:'manual',                    note:'Tablet completion %' },
    ],
    sales: [
      { key:'salesVsTgt', label:'Sales vs. Monthly Target',   weight:0.70, better:'higher', unit:'pct', scored:true,  t:[0.05,0,-0.05],    src:'auto', field:'sales', tgtField:'salesTgt', note:'Auto from Labor Analysis' },
      { key:'digitalGC',  label:'Digital App GC/Rest/Day',    weight:0.15, better:'higher', unit:'pct', scored:true,  t:[0.05,0,-0.05],    src:'manual',                    note:'% vs store target' },
      { key:'delivGC',    label:'Delivery GC/Rest/Day',       weight:0.15, better:'higher', unit:'pct', scored:true,  t:[0.05,0,-0.05],    src:'manual',                    note:'% vs store target' },
    ],
    profit: [
      { key:'foodOB',     label:'Food Over Base $ vs Target', weight:0.35, better:'lower',  unit:'pct', scored:true,  t:[-0.05,0.05,0.10], src:'auto', field:'fobDollar', note:'Auto from FOB report' },
      { key:'labor',      label:'Labor % vs Target',          weight:0.35, better:'lower',  unit:'pct', scored:true,  t:[-0.05,0.05,0.10], src:'auto', field:'laborPct', tgtField:'laborTgt', note:'Auto from Labor Analysis' },
      { key:'opSupplies', label:'Op Supplies vs Budget ($)',  weight:0.15, better:'lower',  unit:'pct', scored:true,  t:[-0.05,0.05,0.10], src:'manual',                    note:'$ vs budget target' },
      { key:'totalProfit',label:'Total Profit vs Target ($)', weight:0.15, better:'higher', unit:'pct', scored:true,  t:[0.05,0,-0.05],    src:'manual',                    note:'$ vs target' },
    ],
    people: [
      { key:'shiftCert',  label:'# Shift Certified Managers', weight:0.25, better:'higher', unit:'pct', scored:true,  t:[0,-0.10,-0.20],   src:'manual',                    note:'Count vs target' },
      { key:'shiftVerif', label:'# Shift Verifications by GM',weight:0.15, better:'higher', unit:'pct', scored:true,  t:[0,-0.10,-0.20],   src:'manual',                    note:'Count vs target' },
      { key:'headcount',  label:'Total Headcount vs Target',  weight:0.30, better:'higher', unit:'pct', scored:true,  t:[0,-0.10,-0.20],   src:'manual',                    note:'EOM headcount vs target' },
      { key:'turnover90', label:'0-90 Day Crew Turnover (%)', weight:0.20, better:'lower',  unit:'pct', scored:true,  t:[-0.05,0.05,0.10], src:'manual',                    note:'Lower turnover % = better' },
      { key:'retention',  label:'Execution of Retention Prg.',weight:0.10, better:'higher', unit:'pct', scored:true,  t:[0,-0.10,-0.20],   src:'manual',                    note:'% completion vs target' },
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
        'Executes MFR store marketing plans and creates local marketing action plans',
        'Implementation of new products and procedures (Day 1 ready)',
        'Execution of POP elements (Up on time, down on time, replaced when damaged)',
        'Restaurant runs consistent and solid operations to build customer counts',
      ],
      profit: [
        'Responsible for holding controllable P&L line items within targets',
        'Checks all weekly & monthly reports for accuracy and submits timely',
        'Execution of Murphy Family Restaurants profit routines and systems',
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
        'Knowledgeable of MFR\'s policies and fairly & consistently enforces them',
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
        'Consistent execution of Murphy Family Restaurant General Manager Routines',
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
        'Knowledgeable of MFR\'s policies and fairly & consistently enforces them',
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
        'Consistent execution of Murphy Family Restaurant\'s Assistant Manager Routines',
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
        'Executes MFR store marketing plans and creates local marketing action plans',
        'Implementation of new products and procedures (Day 1 ready) in all locations',
        'Ensures the execution of POP elements in restaurants (up on time, down on time)',
        'Restaurants run consistent and solid operations to build customer counts',
      ],
      profit: [
        'Responsible for holding controllable P&L line items within targets across all restaurants',
        'Checks all weekly & monthly reports for accuracy and submits timely',
        'Execution of Murphy Family Restaurants profit routines and systems',
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
        'Knowledgeable of MFR\'s policies and fairly and consistently enforces them',
        'Utilizes Listening Surveys and McHire Employee Assistant data for action',
      ],
      admin: [
        'Verifies that all deposits have been received by the bank for all restaurants',
        'Completes & submits Supervisor Calendar on time (25th of the prior month)',
        'Reviews and approves Monthly Managers schedules for each restaurant',
        'Ensures each restaurant has a current PACE Action Plan',
        'Verifies that all restaurants\' petty cash receipts are accounted for',
        'Execution of Murphy Family Restaurants Supervisor Routines',
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
        'Executes MFR store marketing plans and creates local marketing action plans',
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
        'Knowledgeable of MFR\'s policies and fairly and consistently enforces them',
        'Ensures timely execution of retention programs such as People Celebrations',
        'Ongoing development of salaried and high potential swings through training',
        'Utilizes Listening Surveys and McHire Employee Assistant data for action',
      ],
      admin: [
        'Reviews, approves, & submits monthly Manager Schedules and Supervisor Calendars',
        'Ensures restaurants have current PACE Action Plans',
        'Execution of Murphy Family Restaurants Ops Manager & Supervisor Routines',
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
export function reviewId(name, year, half) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g,'_') + '_' + year + '_' + half;
}
export function upsertReview(review) {
  const reviews = getReviews();
  const id = review.id || reviewId(review.name, review.year, review.half);
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

async function _pushReview(sb, review) {
  try {
    const { error } = await sb.from('reviews').upsert({
      id:            review.id,
      data:          review,
      reviewee_name: review.name,
      reviewee_loc:  review.loc,
      review_year:   review.year,
      review_half:   review.half,
      status:        review.status || 'draft',
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

// ── Blank review builder ───────────────────────────────────────────────────────
export function blankMonthKPIs(year, month) {
  return {
    year, month,
    oepe:null,oepeTgt:null, osat:null,osatTgt:null, epb2b:null,epb2bTgt:null,
    r2p:null,r2pTgt:null, delivWait:null,delivWaitTgt:null, kvs:null,kvsTgt:null,
    secondSide:null,secondSideTgt:null, complaints:null,complaintsTgt:null,
    fsAudits:null,fsAuditsTgt:null, fsEcoSure:null,fsEcoSureTgt:null, fsTablet:null,fsTabletTgt:null,
    salesVsTgt:null,salesVsTgtTgt:null, digitalGC:null,digitalGCTgt:null, delivGC:null,delivGCTgt:null,
    foodOB:null,foodOBTgt:null, labor:null,laborTgt:null,
    opSupplies:null,opSuppliesTgt:null, totalProfit:null,totalProfitTgt:null,
    shiftCert:null,shiftCertTgt:null, shiftVerif:null,shiftVerifTgt:null,
    headcount:null,headcountTgt:null, turnover90:null,turnover90Tgt:null, retention:null,retentionTgt:null,
  };
}

export function blankReview(name, role, loc, year, half, cfg) {
  const [mStart, mEnd] = half === 'H1' ? [1,6] : [7,12];
  const months = {};
  for (let m = mStart; m <= mEnd; m++) months[m] = blankMonthKPIs(year, m);
  const makeRatings = () => {
    const out = {};
    const _cfg = cfg || DEFAULT_REVIEW_CONFIG;
    const comp = _cfg.competencies[role] || {};
    const extras = (_cfg.extraCategories || []).map(c => c.key);
    for (const cat of [...CAT_KEYS, ...extras, 'admin']) out[cat] = (comp[cat] || []).map(() => null);
    return out;
  };
  const qKeys = half === 'H1' ? ['q1','q2'] : ['q3','q4'];
  const behavioralRatings = {};
  for (const q of qKeys) behavioralRatings[q] = makeRatings();
  return {
    id: reviewId(name, year, half),
    name, role, loc, year, half,
    status: 'draft',
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

// ── Scoring ────────────────────────────────────────────────────────────────────
export function rateMetric(actual, target, metricCfg) {
  if (actual == null || target == null) return null;
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
  return r===4?'#16a34a':r===3?'#22c55e':r===2?'#f87171':r===1?'#dc2626':'var(--text3)';
}
export function ratingBg(r) {
  return r===4?'rgba(22,163,74,.13)':r===3?'rgba(34,197,94,.10)':r===2?'rgba(248,113,113,.11)':r===1?'rgba(220,38,38,.12)':'transparent';
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

export function computeScores(review, cfg) {
  const months = review.kpis?.months || {};
  const half = review.half;
  const qMap = half==='H1' ? {q1:[1,2,3],q2:[4,5,6]} : {q3:[7,8,9],q4:[10,11,12]};

  const mArr = nums => nums.map(n=>months[n]).filter(Boolean);

  function metricsScore(mArr_) {
    let wS=0,wT=0;
    for (const [cat,cw] of Object.entries(cfg.categoryWeights)) {
      const s = scoreMetricCategory(mArr_, cat, cfg);
      if (s==null) continue;
      wS+=s*cw.weight; wT+=cw.weight;
    }
    return wT>0 ? wS/wT : null;
  }

  function behavScore(qKey) {
    const rats = review.behavioralRatings?.[qKey] || {};
    const extras = (cfg.extraCategories || []).map(c => c.key);
    const allRatings = [...CAT_KEYS, ...extras, 'admin'].flatMap(cat => {
      const items = cfg?.competencies?.[review.role]?.[cat] || [];
      return (rats[cat] || []).filter((_, i) => {
        const item = items[i];
        return typeof item === 'string' || item == null || item.active !== false;
      });
    }).filter(x => x != null);
    return allRatings.length ? allRatings.reduce((a,b)=>a+b,0)/allRatings.length : null;
  }

  const out = {};
  for (const [qKey,qMonths] of Object.entries(qMap)) {
    const ms = metricsScore(mArr(qMonths));
    const bs = behavScore(qKey);
    out[qKey] = {
      metrics:ms, behavioral:bs,
      overall: ms!=null&&bs!=null ? ms*cfg.overall.metrics+bs*cfg.overall.behavioral : null,
    };
  }

  const allMonths = Object.values(months);
  const ms_half = metricsScore(allMonths);
  const qKeys = Object.keys(qMap);
  const bScores = qKeys.map(q=>out[q].behavioral).filter(x=>x!=null);
  const bs_half = bScores.length ? bScores.reduce((a,b)=>a+b,0)/bScores.length : null;
  out.half = {
    metrics:ms_half, behavioral:bs_half,
    overall: ms_half!=null&&bs_half!=null ? ms_half*cfg.overall.metrics+bs_half*cfg.overall.behavioral : null,
  };

  return out;
}

// ── Auto-populate KPIs from ds ─────────────────────────────────────────────────
export function autoPopulateKPIs(review, ds) {
  if (!ds?.loaded) return review;
  const loc = review.loc;
  const months = JSON.parse(JSON.stringify(review.kpis.months));

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
  const opsM   = byMonth(ds.opsRows);
  const fobM   = byMonth(ds.fobRows);

  for (const [mn, mo] of Object.entries(months)) {
    const m = parseInt(mn);
    const lr = laborM[m]||[];
    const or = opsM[m]||[];
    const fr = fobM[m]||[];

    if (lr.length) {
      const s  = sum(lr,'sales');
      const st = sum(lr,'salesTgt')||sum(lr,'tSales');
      const lp = avg(lr,'laborPct');
      const lt = avg(lr,'laborTgt')||avg(lr,'tLabor')||avg(lr,'tCombLabor');
      if (s !=null) mo.salesVsTgt    = s;
      if (st!=null) mo.salesVsTgtTgt = st;
      if (lp!=null) mo.labor    = lp;
      if (lt!=null) mo.laborTgt = lt;
    }
    if (or.length) {
      const oepe = avg(or,'oepe'), r2p=avg(or,'r2p'), kvs=avg(or,'kvst');
      if (oepe!=null) mo.oepe = oepe;
      if (r2p !=null) mo.r2p  = r2p;
      if (kvs !=null) mo.kvs  = kvs;
    }
    if (fr.length) {
      const fd = sum(fr,'fobDollar');
      if (fd!=null) mo.foodOB = fd;
    }
  }

  return { ...review, kpis:{ ...review.kpis, months } };
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
