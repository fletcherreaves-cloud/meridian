// @ts-nocheck
// ── Graded-Visit parser (Customer First Visit / CFV) ─────────────────────────
// Parses a McDonald's "Comprehensive Visit Report" HTML export into structured
// data. Text-based (no DOMParser) so it runs identically in the browser and in
// Node tests. RGR / Ecosure use a different layout — add adapters later and
// dispatch on the report title.
//
// Omnichannel model (owner's definition): the visit's channel = its primary
// scored module — Drive Thru, Curbside (=Mobile/MOP), Front Counter/In-Store, or
// Delivery — always paired with "Behind the Counter". The channel IS the order
// method; we do not infer app-vs-traditional (the DT "did the order taker ask
// about the app" question only records whether the employee asked, not whether
// the shopper actually used the app, so it's not a reliable usage signal).

// HTML → clean, ordered list of visible text lines.
export function htmlToLines(htmlText) {
  let t = String(htmlText || '');
  t = t.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  t = t.replace(/<[^>]+>/g, '\n');
  t = t.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
       .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&rsquo;/gi, "'");
  return t.split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

const _MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
// "28-Jan-2026" / "07-July-2026" → "2026-01-28" (reports mix abbreviated + full
// month names). Returns null if unparseable.
export function parseVisitDate(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})[-\/\s]+([A-Za-z]+)[-\/\s]+(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10), mon = _MONTHS[m[2].slice(0, 3).toLowerCase()], yr = parseInt(m[3], 10);
  if (!mon) return null;
  return `${yr}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const _after = (L, label, n = 1) => {
  const want = label.toLowerCase();
  for (let i = 0; i < L.length; i++) {
    if (L[i].replace(/:$/, '').trim().toLowerCase() === want) return L[i + n] != null ? L[i + n] : null;
  }
  return null;
};

// Module score table: rows of (name, percent, achieved, possible) between the
// "Adjusted Points Possible" header and "Sub total".
function parseModules(L) {
  const out = {};
  const k = L.findIndex(x => x.toLowerCase() === 'adjusted points possible');
  if (k < 0) return out;
  let i = k + 1;
  while (i + 3 < L.length) {
    const name = L[i];
    if (/^sub total/i.test(name) || name === 'Visit comments') break;
    const pct = parseFloat(L[i + 1]), ach = parseFloat(L[i + 2]), pos = parseFloat(L[i + 3]);
    if (!isNaN(pct) && !isNaN(ach) && !isNaN(pos)) { out[name] = { pct, ach, pos }; i += 4; }
    else i += 1;
  }
  return out;
}

// Channel / order method = the FIRST module listed under the Score Calculator,
// verbatim (e.g. "Drive Thru", "Curbside", "Front Counter", "Delivery"). This is
// the report's own order-method label — we don't remap it, so any variant shows
// exactly. "Behind the Counter" is the always-present companion module, not the
// order method, so it's only used as a last-resort fallback.
function channelOf(modules) {
  const keys = Object.keys(modules);
  const primary = keys.find(k => k.toLowerCase() !== 'behind the counter');
  return primary || keys[0] || null;
}

// Shared header fields common to both report layouts.
function header(L) {
  return {
    store: _after(L, 'Restaurant number'),
    name: (() => { const i = L.indexOf('Visit detail'); return i >= 0 ? (L[i + 2] || null) : null; })(),
    date: _after(L, 'Date'),
    dateISO: parseVisitDate(_after(L, 'Date')),
    daypart: _after(L, 'Day parts'),
    weekpart: _after(L, 'Weekpart'),
    owner: _after(L, 'Owner/Operator'),
    manager: _after(L, 'Restaurant manager'),
    supervisor: _after(L, 'Supervisor'),
    visitBy: _after(L, 'Visit done by'),
  };
}

// ── CFV (Customer First Visit) — single-channel transaction ─────────────────
function parseCFV(L, passThreshold) {
  const scoreRaw = _after(L, 'Score(%)');
  const score = scoreRaw != null ? parseFloat(String(scoreRaw).replace('%', '')) : null;
  const modules = parseModules(L);
  const channel = channelOf(modules);
  // Order method = the channel itself (Drive Thru / Curbside / Delivery / In-Store).
  // We do NOT infer app-vs-traditional: the DT "did the order taker ask about the
  // app" question only records whether the employee asked, not whether the shopper
  // used the app, so it's not a reliable usage signal.
  const mobileApp = null;
  return {
    reportType: 'CFV',
    title: L.find(l => /customer first visit/i.test(l)) || '',
    ...header(L),
    completionTime: _after(L, 'Visit Completion Time'),
    score,
    pass: score != null ? score >= passThreshold : null,
    status: null,
    channel,
    mobileApp,                 // always null — channel is the order method; app usage isn't reliably reported
    modules,                   // { 'Drive Thru': {pct,ach,pos}, 'Behind the Counter': {...} }
  };
}

// ── RGR (Running Great Restaurants) — whole-restaurant review ───────────────
// Pass rule (stated in the report): overall >= threshold, no critical question
// missed, and no more than ONE component below 80%.
function parseRGR(L, passThreshold) {
  const status = (() => { const i = L.indexOf('Comprehensive Visit Report'); return i >= 0 ? (L[i + 1] || null) : null; })();
  const announced = L.some(l => /^announced$/i.test(l));
  // Component scores from the "Score(%):" block (Overall + the components).
  const si = L.findIndex(l => /^score\(%\):?$/i.test(l));
  const components = {}; let overall = null;
  if (si >= 0) {
    for (let i = si + 1; i < L.length; i++) {
      if (/to meet standards/i.test(L[i])) break;
      const m = L[i].match(/^(.+?):$/);
      const nv = L[i + 1] && L[i + 1].match(/^([\d.]+)%?$/);
      if (m && nv) {
        const label = m[1].trim(), val = parseFloat(nv[1]);
        if (/^overall$/i.test(label)) overall = val; else components[label] = { pct: val };
        i++;
      }
    }
  }
  // Critical-question gates (Health & Safety, US Food Safety).
  const crit = (label) => {
    for (let i = 0; i < L.length; i++) {
      if (L[i] === label || L[i] === label + ':') {
        const nx = (L[i + 1] || '').toLowerCase();
        if (nx.includes('critical questions passed')) return true;
        if (nx.includes('critical')) return false;
      }
    }
    return null;
  };
  const criticalOk = crit('Health & Safety') !== false && crit('US Food Safety') !== false;
  const belowCount = Object.values(components).filter(c => c.pct < 80).length;
  const pass = overall != null ? (overall >= passThreshold && criticalOk && belowCount <= 1) : null;
  return {
    reportType: 'RGR',
    title: L.find(l => /running great restaurants/i.test(l)) || '',
    ...header(L),
    score: overall,
    pass,
    status,                    // e.g. "Acceptable" / "Outstanding"
    announced,
    criticalPassed: criticalOk,
    channel: null,             // RGR is whole-restaurant, not a single channel
    mobileApp: null,
    modules: components,       // { Quality:{pct}, Service:{pct}, Cleanliness:{pct}, ... }
  };
}

// Dispatch on report title. CFV and RGR share the graded_visits schema; add
// Ecosure the same way once its format is known.
export function parseGradedVisit(htmlText, { passThreshold = 80 } = {}) {
  const L = htmlToLines(htmlText);
  return L.some(l => /running great restaurants/i.test(l)) ? parseRGR(L, passThreshold) : parseCFV(L, passThreshold);
}

// ── EcoSure (3rd-party food safety) ──────────────────────────────────────────
// Format IS now known (memory/finding-ecosure-propel-api-2026-08-22.md, owner-captured
// 2026-08-22 from propel.mcd.com's getThirdPartyFoodSafetyVisitReport). Input is the raw JSON
// response body for ONE visit -- a single GET returns a single visitId's report, unlike CFV/RGR's
// HTML export. Accepts either a parsed object or a JSON string (the latter for a straight
// file.text() call, matching how CFV/RGR read their files).
//
// Deliberately does NOT try to re-derive `pass` from the score or from criticalFlag/result --
// visitMeetsTargetFlag is the report's OWN pass/fail determination (its exact target formula is
// not documented anywhere captured), so this trusts it rather than inventing a threshold rule this
// repo's own "measure it, don't reason about it" standing rule would flag as an unverified guess.
// What IS computed here -- criticalFailCount, citedItems -- is arithmetic on values present in the
// payload, not an inference about how they combine into pass/fail.
const _ecoSectionOf = q => String(q?.questionSection ?? '').trim();
const _ecoCodeOf = q => String(q?.questionCode ?? '').trim(); // trailing-space codes ("FS-A-US ") -- trim on ingest, per the finding
const _ecoIsCritical = q => q?.criticalFlag === 1 || q?.criticalFlag === true || q?.criticalFlag === '1';
const _ecoIsCited = q => Number(q?.result) === 1;               // 0 = pass, 1 = cited/fail, -1 = N/A
const _ecoIsNA = q => Number(q?.result) === -1;

// A wire date's raw format varies by API action (EcoSure's getThirdPartyFoodSafetyVisitReport,
// RGR/EcoSure's getBrandProtectionVisits, CFV's getCfvHistory all use slightly different shapes) --
// try ISO first, then the CFV/RGR "DD-Mon-YYYY" shape (parseVisitDate above) in case an action uses
// the same convention as the exported reports, then a plain Date parse as a last resort (covers
// getBrandProtectionVisits' "2026-08-10T00:00:00" and Date-parseable variants alike). Returns null
// (never throws) if none match, matching every other date field in this file -- an unparseable date
// is a skip, not a guess. Exported (renamed from the EcoSure-only parseEcoSureDate) since the same
// chain is reused by the RGR and CFV bulk-JSON parsers below.
export function parseApiVisitDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  const iso = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const viaCfvFormat = parseVisitDate(str);
  if (viaCfvFormat) return viaCfvFormat;
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export function parseEcoSureVisit(input) {
  const parsed = typeof input === 'string' ? JSON.parse(input) : (input || {});
  // The live getThirdPartyFoodSafetyVisitReport endpoint wraps the actual report in a `results`
  // envelope ({results: {restaurantName, restaurantNumber, ...}}) -- confirmed 2026-09-04 against
  // a real captured response (a HAR from an authenticated Propel session), which this function had
  // never been checked against before (the shipped fixture was hand-built flat, without the
  // wrapper, and passed unit tests while being unrepresentative of the real wire shape). Unwrap it
  // when present so both the true API response and an already-flat object (existing fixtures, any
  // pre-unwrapped caller) parse the same way.
  const v = (parsed && typeof parsed === 'object' && parsed.results && typeof parsed.results === 'object')
    ? parsed.results
    : parsed;
  const questions = Array.isArray(v.questions) ? v.questions : [];

  const citedItems = questions.filter(_ecoIsCited).map(q => ({
    code: _ecoCodeOf(q),
    section: _ecoSectionOf(q),
    critical: _ecoIsCritical(q),
    pointsLost: (Number(q?.pointsPossible) || 0) - (Number(q?.pointsReceived) || 0),
    reasons: Array.isArray(q?.reasons) ? q.reasons.map(r => ({ code: r?.reasonCode ?? null, text: r?.reasonText ?? null })) : [],
  }));
  const criticalFailCount = citedItems.filter(c => c.critical).length;

  const sections = {};
  for (const q of questions) {
    const sec = _ecoSectionOf(q);
    if (!sec) continue;
    const s = sections[sec] || (sections[sec] = { questionCount: 0, citedCount: 0, naCount: 0 });
    s.questionCount++;
    if (_ecoIsCited(q)) s.citedCount++;
    if (_ecoIsNA(q)) s.naCount++;
  }

  const scoreRaw = v.overallScorePercentage;
  const score = scoreRaw == null ? null : parseFloat(String(scoreRaw).replace('%', ''));

  return {
    reportType: 'EcoSure',
    title: 'EcoSure Food Safety Visit',
    store: v.restaurantNumber != null ? String(v.restaurantNumber) : null,
    name: v.restaurantName ?? null,
    date: v.visitDate ?? null,
    dateISO: parseApiVisitDate(v.visitDate),
    daypart: null,
    weekpart: null,
    owner: null,
    manager: null,
    // Tokenized at save time (saveGradedVisits, src/lib/supabase.js), never persisted as
    // plaintext -- reviewedWithName is a real employee name (memory finding's own PII note).
    reviewerName: v.reviewedWithName ?? null,
    completionTime: null,
    score,
    pass: v.visitMeetsTargetFlag === 1 || v.visitMeetsTargetFlag === true,
    status: null,
    channel: null,
    mobileApp: null,
    modules: {
      pointsReceived: v.pointsReceived ?? null,
      pointsPossible: v.pointsPossible ?? null,
      questionCount: questions.length,
      citedCount: citedItems.length,
      criticalFailCount,
      sections,
      citedItems,
      comments: v.visitComments ?? null,
    },
  };
}

// ── RGR / RGR Health & Safety bulk JSON path -- from Propel's getBrandProtectionVisits ─────────
// Unlike EcoSure, the getBrandProtectionVisits LIST row itself already carries every component
// percentage parseRGR() extracts from the HTML export (Quality/Service/Cleanliness/Shift
// Leadership/Food Safety) -- no per-visit detail call needed. visitTypeId 105 = RGR, 111 = RGR
// Health & Safety, a separate program with its own visit dates (measured live: distinct dates, not
// overlapping instances of the same visit) -- given its own report_type so an RGR row and an
// RGR-Health&Safety row for the same store+date, if that ever happens, never collide on the
// (loc, visit_date, report_type) key. Trusts visitMeetsTargetFlag for pass, same reasoning as
// parseEcoSureVisit(): the report's own pass rule (parseRGR()'s HTML-derived "no critical missed,
// no more than one component below 80%") isn't re-derivable from a summary row with no
// critical-gate detail, so this doesn't try to reinvent it.
// `storeMeta` ({store, name}) is required -- getBrandProtectionVisits is called per LOCATION
// (locationId=<node>), so the visit row itself carries no store identity of its own.
const _rgrPct = s => (s == null ? null : parseFloat(String(s)));
export function parseRGRBulkVisit(v, storeMeta = {}) {
  const isHealthSafety = v?.visitTypeDescription === 'visits.rgrHealthAndSafety';
  const modules = {};
  const put = (label, pct) => { if (pct != null && !isNaN(pct)) modules[label] = { pct }; };
  put('Quality', _rgrPct(v?.qualityPercentage));
  put('Service', _rgrPct(v?.servicePercentage));
  put('Cleanliness', _rgrPct(v?.cleanlinessPercentage));
  put('Shift Leadership', _rgrPct(v?.shiftLeadershipPercentage));
  put('Food Safety', _rgrPct(v?.foodSafetyPercentage));
  put('People', _rgrPct(v?.peoplePercentage));
  put('Health & Safety', _rgrPct(v?.healthSafetyPercentage));
  return {
    reportType: isHealthSafety ? 'RGR-HealthSafety' : 'RGR',
    title: isHealthSafety ? 'RGR Health & Safety' : 'Running Great Restaurants',
    store: storeMeta.store != null ? String(storeMeta.store) : null,
    name: storeMeta.name ?? null,
    date: v?.visitDate ?? null,
    dateISO: parseApiVisitDate(v?.visitDate),
    daypart: null,
    weekpart: null,
    owner: null,
    manager: null,
    visitBy: null,
    completionTime: null,
    score: _rgrPct(v?.overallPercentage),
    pass: v?.visitMeetsTargetFlag === 1 || v?.visitMeetsTargetFlag === true,
    status: v?.foodSafetyResult ?? null,
    channel: null,
    mobileApp: null,
    modules,
  };
}

// ── CFV bulk JSON path -- from Propel's getCfvHistory ────────────────────────────────────────
// Same "the list row already has everything" property as RGR above -- getCfvHistory's per-visit
// row carries overallPercentage plus one non-null channel-specific percentage field
// (driveThruPercentage/curbsidePercentage/inRestaurantPercentage/deliveryPercentage) and
// behindTheCounterPercentage, matching exactly what the HTML-based parseCFV()'s own `channel` +
// `modules` fields represent -- just without the raw ach/pos point counts the HTML export carries
// (a summary row only has percentages), so those two fields are simply absent here rather than
// fabricated. Pass is NOT returned by this action (no visitMeetsTargetFlag equivalent) -- derived
// via the same score >= 80 threshold scripts/import-cfv-history.mjs's own CFV_PASS_THRESHOLD
// already established and verified against Propel's own published CFV card (dispatch #74). Kept as
// a SEPARATE constant here rather than importing that Node script's export into this browser-
// bundled file -- same value (80), duplicated deliberately rather than crossing that module
// boundary; if either ever needs to change, change both.
export const CFV_BULK_PASS_THRESHOLD = 80;
const _CFV_CHANNEL_FIELDS = [
  ['driveThruPercentage', 'Drive Thru'],
  ['curbsidePercentage', 'Curbside'],
  ['inRestaurantPercentage', 'In Restaurant'],
  ['deliveryPercentage', 'Delivery'],
];
export function parseCfvBulkVisit(v, storeMeta = {}) {
  let channel = null, channelPct = null;
  for (const [field, label] of _CFV_CHANNEL_FIELDS) {
    if (v?.[field] != null) { channel = label; channelPct = _rgrPct(v[field]); break; }
  }
  const score = _rgrPct(v?.overallPercentage);
  const behindTheCounterPct = _rgrPct(v?.behindTheCounterPercentage);
  const modules = {};
  if (channel != null && channelPct != null && !isNaN(channelPct)) modules[channel] = { pct: channelPct };
  if (behindTheCounterPct != null && !isNaN(behindTheCounterPct)) modules['Behind the Counter'] = { pct: behindTheCounterPct };
  return {
    reportType: 'CFV',
    title: 'Customer First Visit',
    store: storeMeta.store != null ? String(storeMeta.store) : null,
    name: storeMeta.name ?? null,
    date: v?.visitDate ?? null,
    dateISO: parseApiVisitDate(v?.visitDate),
    daypart: null,
    weekpart: null,
    owner: null,
    manager: null,
    visitBy: null,
    completionTime: null,
    score,
    pass: score != null ? score >= CFV_BULK_PASS_THRESHOLD : null,
    status: null,
    channel,
    mobileApp: null,
    modules,
  };
}
