// @ts-nocheck
// CSAT Comment Opportunity Ranking
// ---------------------------------------------------------------------------
// Turns the raw SMG VOICE comment stream (ds.smgRows) into an ACTIONABLE,
// ranked list of "biggest opportunities" by store: where the most guests are
// unhappy, how concentrated the problem is, and WHAT they're unhappy about
// (theme clustering from the comment text).
//
// Honesty guardrails baked in:
//  • Primary rank = absolute number of detractors (real guests to win back),
//    not raw rate — a 1-of-1 store should never outrank a 30-of-120 store.
//  • Rate is reported alongside with a small-sample flag (n < MIN_N) so a
//    thin store's scary-looking rate is visibly caveated, not trusted blindly.
//  • Themes are counted from NEGATIVE comments only (dissatisfied + highly
//    dissatisfied) so "top themes" describe the problem, not the praise.
//
// Row shape (from parsers/index.js parseSMGVoicePDF):
//   { loc, storeName, commentDate, visitDate, nsn, text, satisfactionLabel, score }

const NEG_LABELS = new Set(['dissatisfied', 'highly dissatisfied']);
const POS_LABELS = new Set(['satisfied', 'highly satisfied']);
export const MIN_N = 8; // below this a per-store rate is flagged as thin

// ── Theme lexicon ──────────────────────────────────────────────────────────
// Each theme = a set of lowercase keywords / phrases. A comment "hits" a theme
// if any term is present (word-ish boundary). Ordered by ops priority; a
// comment can hit multiple themes. Tuned for McDonald's guest language.
export const THEME_LEXICON = [
  { key: 'speed',       label: 'Speed / Wait',      terms: ['slow','wait','waited','waiting','long line','long wait','took forever','forever','too long','backed up','15 min','20 min','10 min','minutes','never came','still waiting'] },
  { key: 'accuracy',    label: 'Order Accuracy',    terms: ['wrong','missing','forgot','forgotten','incorrect','left out','didn\'t get','did not get','no straw','no sauce','no napkin','messed up','mixed up','not what i ordered','wrong order'] },
  { key: 'foodtemp',    label: 'Food Temp / Fresh', terms: ['cold','old','stale','hard','dry','burnt','burned','soggy','not fresh','not hot','lukewarm','warm fries','room temp'] },
  { key: 'foodquality', label: 'Food Quality',      terms: ['gross','disgusting','nasty','undercooked','raw','overcooked','quality','tasted bad','disgusting','inedible','sloppy','thrown together'] },
  { key: 'service',     label: 'Friendliness',      terms: ['rude','attitude','unfriendly','ignored','unprofessional','disrespect','yelled','mean','snapped','argued','hateful','short with','no greeting','didn\'t say','rolled her eyes','rolled his eyes'] },
  { key: 'cleanliness', label: 'Cleanliness',       terms: ['dirty','filthy','trash','bathroom','restroom','messy','sticky','not clean','unclean','gross tables','floor was'] },
  { key: 'price',       label: 'Price / Value',     terms: ['expensive','overpriced','pricey','too much','price went up','cost too','charged me','high price'] },
  { key: 'drivethru',   label: 'Drive-Thru',        terms: ['drive thru','drive-thru','drive through','window','speaker','order screen','second window','first window'] },
  { key: 'mobile',      label: 'Mobile / App',      terms: ['mobile order','app','curbside','mobile app','through the app','code wouldn\'t','deal wouldn\'t','points'] },
  { key: 'availability',label: 'Out of Item',       terms: ['out of','ran out','not available','machine was down','ice cream machine','shake machine','no ice cream','unavailable','sold out'] },
];

const _norm = loc => String(parseInt(loc, 10) || loc);
const _lc   = s => (s || '').toString().toLowerCase();

// Return the theme keys a comment text hits.
export function classifyThemes(text) {
  const t = _lc(text);
  if (!t) return [];
  const hits = [];
  for (const theme of THEME_LEXICON) {
    if (theme.terms.some(term => t.includes(term))) hits.push(theme.key);
  }
  return hits;
}

const _themeLabel = key => (THEME_LEXICON.find(x => x.key === key) || {}).label || key;

// Wilson lower bound (95%) for a negative rate — a confidence-adjusted rate
// that pulls thin samples toward 0 so they don't dominate a rate sort.
function wilsonLower(neg, n) {
  if (!n) return 0;
  const z = 1.96, p = neg / n;
  const denom = 1 + z * z / n;
  const centre = p + z * z / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n);
  return Math.max(0, (centre - margin) / denom);
}

// ── Main: rank stores by comment opportunity ────────────────────────────────
// opts.storeName(loc) — optional resolver for a friendly store name.
// Returns { stores:[...], district:{...}, totalComments }.
export function rankCommentOpportunities(rows, opts = {}) {
  const nameOf = opts.storeName || (loc => loc);
  const all = Array.isArray(rows) ? rows.filter(r => r && r.loc) : [];
  const byLoc = new Map();

  for (const r of all) {
    const loc = _norm(r.loc);
    if (!byLoc.has(loc)) byLoc.set(loc, {
      loc, name: nameOf(loc) || r.storeName || loc,
      total: 0, neg: 0, pos: 0, neu: 0,
      scoreSum: 0, scoreN: 0,
      themeCounts: {},               // theme key → # of negative comments hitting it
      themeExamples: {},             // theme key → a representative negative snippet
    });
    const s = byLoc.get(loc);
    s.total++;
    const label = _lc(r.satisfactionLabel);
    if (Number.isFinite(r.score)) { s.scoreSum += r.score; s.scoreN++; }
    if (NEG_LABELS.has(label)) {
      s.neg++;
      for (const key of classifyThemes(r.text)) {
        s.themeCounts[key] = (s.themeCounts[key] || 0) + 1;
        if (!s.themeExamples[key] && r.text) s.themeExamples[key] = r.text.slice(0, 160);
      }
    } else if (POS_LABELS.has(label)) s.pos++;
    else s.neu++;
  }

  const stores = [...byLoc.values()].map(s => {
    const negRate = s.total ? s.neg / s.total : 0;
    const topThemes = Object.entries(s.themeCounts)
      .map(([key, count]) => ({ key, label: _themeLabel(key), count, example: s.themeExamples[key] || null }))
      .sort((a, b) => b.count - a.count);
    return {
      loc: s.loc, name: s.name,
      total: s.total, neg: s.neg, pos: s.pos, neu: s.neu,
      negRate,
      negRateAdj: wilsonLower(s.neg, s.total),   // confidence-adjusted
      avgScore: s.scoreN ? s.scoreSum / s.scoreN : null,
      thin: s.total < MIN_N,
      // Opportunity = absolute detractors (real guests to recover). Ties broken
      // by the confidence-adjusted rate so a concentrated problem edges ahead.
      opportunity: s.neg,
      topThemes,
    };
  }).sort((a, b) => (b.opportunity - a.opportunity) || (b.negRateAdj - a.negRateAdj));

  // District-wide theme rollup — the systemic #1 issue across all stores.
  const distThemes = {};
  let distNeg = 0, distTotal = 0;
  for (const s of byLoc.values()) {
    distTotal += s.total; distNeg += s.neg;
    for (const [key, count] of Object.entries(s.themeCounts)) distThemes[key] = (distThemes[key] || 0) + count;
  }
  const districtThemes = Object.entries(distThemes)
    .map(([key, count]) => ({ key, label: _themeLabel(key), count }))
    .sort((a, b) => b.count - a.count);

  return {
    stores,
    totalComments: all.length,
    district: {
      total: distTotal, neg: distNeg,
      negRate: distTotal ? distNeg / distTotal : 0,
      themes: districtThemes,
    },
  };
}
