// @ts-nocheck
// ── News relevance classification ────────────────────────────────────────────
// Notes 59. Matching a town name is necessary but nowhere near sufficient. Measured
// against the live feeds on 2026-08-07:
//
//   Duncan Banner, q=Tishomingo → 50 items, essentially ALL high-school sports:
//     "Comanche's RJ Roberts selected as Small School Golfer of the Year"
//     "Golf roundup: Velma claims team title at home tournament"
//     "Comanche Indians named to all-district team"
//   The town name is genuinely present (it's an opponent on a schedule), so this is not
//   a false match — it is a whole CONTENT TYPE that will never be relevant. Small-town
//   papers are dominated by prep sports and obituaries.
//
//   KFOR local feed matched two stores:
//     "I-35 closed near Purcell due to a crash"           → genuinely relevant: a
//        highway closure beside a store is a real traffic-and-sales event
//     "COTPA adopts resolution offering free fares on OKC Streetcar"  → noise
//
// So the useful distinction is not match/no-match, it's WHY it matched. Three tiers:
//   brand  — names McDonald's or our restaurant directly. Always surface.
//   local  — no brand, but a locally consequential event near a store (roads, crime,
//            closures, new business, weather). This is the category the owner asked for
//            when they said "aggregate any news relating to each location."
//   noise  — sports, obituaries, real-estate listicles, schedules. Suppress.
//
// Keyword classification is crude and will misfile things. It is deliberately biased
// toward keeping items (unknown → 'local', not 'noise'), because a missed local story is
// worse than one extra row in a feed the owner scans.

export const BRAND_TERMS = ["mcdonald's", 'mcdonalds', 'mcdonald’s', 'golden arches'];

export const NOISE_PATTERNS = [
  // prep sports — the dominant category in these feeds
  /\b(golf|softball|baseball|football|basketball|volleyball|wrestling|track|soccer|tennis)\b/i,
  /\b(roundup|all-district|all-state|all-conference|tournament|playoff|scrimmage|kickoff)\b/i,
  /\b(coach|quarterback|touchdown|innings?|homer|rushing yards)\b/i,
  /\bschedules?\b.*\b(20\d\d|season)\b/i,
  // obituaries and notices
  /\b(obituar|funeral|memorial service|passed away|survived by|visitation)\b/i,
  // syndicated listicle filler (Stacker et al. — heavy in TownNews feeds)
  /\b(cities|counties|states|towns) with the (fastest|highest|lowest|best|worst)\b/i,
  /\b(best|worst|top \d+) (places|cities|towns|counties)\b/i,
  /\bhoroscope|crossword|sudoku\b/i,
];

// Locally consequential, in rough priority order. Roads first — a closure beside a
// store is the clearest example of news that moves a store's numbers.
export const LOCAL_SIGNALS = [
  { key: 'roads',     re: /\b(highway|hwy|interstate|i-\d+|us-?\d+|road|street|bridge|detour|closed|closure|construction|crash|wreck|traffic)\b/i },
  { key: 'crime',     re: /\b(robb|theft|shooting|assault|arrest|burglar|vandal|police|shoplift)\b/i },
  { key: 'business',  re: /\b(opens?|opening|closes?|closing|closure|new (store|restaurant|business)|grand opening|hiring|layoff|expansion)\b/i },
  { key: 'weather',   re: /\b(tornado|flood|storm|hurricane|ice storm|snow|power outage|evacuat)\b/i },
  { key: 'health',    re: /\b(health (department|inspection)|food safety|foodborne|inspection score|violation)\b/i },
  { key: 'community', re: /\b(school|council|festival|fair|parade|event|fundrais)\b/i },
];

const txt = (item) => `${item?.title || ''} ${item?.summary || ''}`;

/** True if this is a content type that will never be operationally relevant. */
export function isNoise(item) {
  const s = txt(item);
  if (!s.trim()) return true;
  if (BRAND_TERMS.some(b => s.toLowerCase().includes(b))) return false;  // brand always wins
  return NOISE_PATTERNS.some(re => re.test(s));
}

export function mentionsBrand(item) {
  const s = txt(item).toLowerCase();
  return BRAND_TERMS.some(b => s.includes(b));
}

/**
 * Classify one feed item.
 * Returns { tier: 'brand'|'local'|'noise', signals: string[], score }
 * `score` orders the feed: brand beats local, and more signals beat fewer.
 */
export function classify(item) {
  const s = txt(item);
  if (!s.trim()) return { tier: 'noise', signals: [], score: 0 };

  const brand = mentionsBrand(item);
  if (!brand && NOISE_PATTERNS.some(re => re.test(s))) {
    return { tier: 'noise', signals: [], score: 0 };
  }

  const signals = LOCAL_SIGNALS.filter(g => g.re.test(s)).map(g => g.key);
  if (brand) return { tier: 'brand', signals, score: 100 + signals.length };

  // Bias toward keeping: an unrecognised local story is still local context.
  return { tier: 'local', signals, score: 10 + signals.length * 5 };
}

/**
 * Rank and filter a batch of classified items. Noise is dropped, brand mentions lead,
 * then local stories by signal strength, then recency.
 */
export function rankNews(items = [], { includeLocal = true, max = 50 } = {}) {
  return (items || [])
    .map(i => ({ ...i, ...classify(i) }))
    .filter(i => i.tier !== 'noise' && (includeLocal || i.tier === 'brand'))
    .sort((a, b) => (b.score - a.score) ||
                    ((b.published?.getTime() || 0) - (a.published?.getTime() || 0)))
    .slice(0, max);
}
