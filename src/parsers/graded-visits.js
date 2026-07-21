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
