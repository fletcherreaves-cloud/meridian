// @ts-nocheck
// ── Graded-Visit parser (Customer First Visit / CFV) ─────────────────────────
// Parses a McDonald's "Comprehensive Visit Report" HTML export into structured
// data. Text-based (no DOMParser) so it runs identically in the browser and in
// Node tests. RGR / Ecosure use a different layout — add adapters later and
// dispatch on the report title.
//
// Omnichannel model (owner's definition): the visit's channel = its primary
// scored module — Drive Thru, Curbside (=Mobile/MOP), Front Counter, or Delivery
// — always paired with "Behind the Counter". App vs traditional:
//   • Curbside/Mobile module     → mobile-app transaction by nature
//   • Drive Thru + DT app Q "Yes" → app used at DT; "No" → traditional

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

// Did the shopper use the McDonald's app? Look for the app question and its Yes/No.
function appUsed(L) {
  for (let i = 0; i < L.length; i++) {
    const l = L[i].toLowerCase();
    if (l.includes('mcdonald') && l.includes('app')) {
      for (let j = i + 1; j < Math.min(i + 6, L.length); j++) {
        if (L[j] === 'Yes') return true;
        if (L[j] === 'No') return false;
      }
    }
  }
  return null; // question not present (e.g. a Curbside-only module)
}

const CHANNEL_MODULES = {
  'drive thru': 'Drive Thru',
  'curbside': 'Curbside',
  'front counter': 'Front Counter',
  'behind the counter': 'Counter',
  'delivery': 'Delivery',
  'mobile': 'Mobile',
};

// Primary channel = the non-"Counter" module (DT / Curbside / Delivery / FC).
function channelOf(modules) {
  const names = Object.keys(modules).map(n => n.toLowerCase());
  const primary = names.find(n => n !== 'behind the counter' && CHANNEL_MODULES[n]);
  if (primary) return CHANNEL_MODULES[primary];
  const counter = names.find(n => CHANNEL_MODULES[n]);
  return counter ? CHANNEL_MODULES[counter] : null;
}

export function parseGradedVisit(htmlText, { passThreshold = 80 } = {}) {
  const L = htmlToLines(htmlText);
  const title = L.find(l => /customer first visit/i.test(l)) || '';
  const scoreRaw = _after(L, 'Score(%)');
  const score = scoreRaw != null ? parseFloat(String(scoreRaw).replace('%', '')) : null;
  const modules = parseModules(L);
  const channel = channelOf(modules);
  const app = appUsed(L);
  // Curbside/Mobile visits are app transactions by definition.
  const mobileApp = channel === 'Curbside' || channel === 'Mobile' ? true : app;
  return {
    reportType: 'CFV',
    title,
    store: _after(L, 'Restaurant number'),
    name: (() => { const i = L.indexOf('Visit detail'); return i >= 0 ? (L[i + 2] || null) : null; })(),
    date: _after(L, 'Date'),
    dateISO: parseVisitDate(_after(L, 'Date')),
    daypart: _after(L, 'Day parts'),
    weekpart: _after(L, 'Weekpart'),
    owner: _after(L, 'Owner/Operator'),
    manager: _after(L, 'Restaurant manager'),
    visitBy: _after(L, 'Visit done by'),
    completionTime: _after(L, 'Visit Completion Time'),
    score,
    pass: score != null ? score >= passThreshold : null,
    channel,
    mobileApp,                 // true = app/mobile order, false = traditional, null = unknown
    modules,                   // { 'Drive Thru': {pct, ach, pos}, 'Behind the Counter': {...} }
  };
}
