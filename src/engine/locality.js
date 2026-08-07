// @ts-nocheck
// ── Store → locality registry ────────────────────────────────────────────────
// Notes 59. Everything that searches the outside world for mentions of our stores —
// local news RSS, X, YouTube, review-site matching — needs to turn a store number into
// search terms. That turns out to be the hard part of the whole module, not API access.
//
// Three traps this exists to handle:
//
// 1. STORE NAME ≠ TOWN. Mossy Head (37566) has a DeFuniak Springs mailing address, the
//    same town as store 6838. Searching "Mossy Head" finds the locality; searching the
//    address town finds BOTH stores and cannot tell them apart. Recorded explicitly
//    rather than discovered later as a mis-attribution bug.
//
// 2. TOWN NAMES ARE AMBIGUOUS, and several are badly so:
//      Ada        → also an accessibility acronym (ADA) and Ada Lovelace
//      Sulphur    → also a chemical element
//      Harrah     → also the casino brand (Harrah's)
//      Marietta   → overwhelmingly Marietta, GEORGIA
//      Durant     → overwhelmingly Kevin Durant
//      Freeport   → Bahamas, Illinois, Texas, Maine, NY
//      Elgin      → Illinois, Texas · Seminole → Florida, Texas
//      Tishomingo → also Tishomingo County, MISSISSIPPI (GDELT returned exactly this)
//      Ponce de Leon → the explorer, and Puerto Rico
//    `risk` drives how tightly a query must be pinned. High-risk towns need the state
//    AND "McDonald's" AND negative terms; low-risk ones can run loose.
//
// 3. TWO STORES, ONE TOWN. Ardmore has two (3708, 24471) and so does DeFuniak Springs
//    (6838, 37566). A town-level mention cannot be attributed to one store without more
//    evidence — `shared: true` marks that, so consumers surface it against both and
//    never claim false precision.
//
// Addresses confirmed by the owner where noted; the rest derive from STORE_NAMES.

// Terms that must NEVER be treated as one of our towns. Kept explicit so the reason
// survives — each one was a real observed false positive or an obvious trap.
export const NEGATIVE_TERMS = {
  durant: ['Kevin Durant', 'NBA', 'basketball', 'All-American'],
  ada:    ['Americans with Disabilities', 'ADA compliant', 'Ada Lovelace'],
  harrah: ["Harrah's", 'casino', 'Caesars'],
  sulphur: ['sulphur dioxide', 'sulfur dioxide', 'sulphuric'],
  marietta: ['Georgia', 'Cobb County', 'Marietta GA'],
  tishomingo: ['Mississippi', 'Tishomingo County'],
  freeport: ['Bahamas', 'Grand Bahama', 'Freeport IL', 'Freeport TX'],
  elgin: ['Illinois', 'Elgin IL', 'Elgin TX'],
  seminole: ['Seminole County', 'Florida State', 'Seminoles'],
  'ponce de leon': ['Puerto Rico', 'explorer', 'fountain of youth'],
};

// risk: how aggressively a query must be constrained.
//   high   — the bare town name is dominated by something else entirely
//   medium — a real place elsewhere, but ours is a plausible hit
//   low    — distinctive enough to search loosely
export const LOCALITIES = [
  { loc: '3708',  town: 'Ardmore',           state: 'OK', risk: 'medium', shared: true  },
  { loc: '24471', town: 'Ardmore',           state: 'OK', risk: 'medium', shared: true  },
  { loc: '5183',  town: 'Chickasha',         state: 'OK', risk: 'low'    },
  { loc: '5985',  town: 'Durant',            state: 'OK', risk: 'high'   },
  { loc: '6178',  town: 'Chipley',           state: 'FL', risk: 'medium' },
  // Owner-confirmed: 2370 US Highway 331 S, DeFuniak Springs FL 32435
  { loc: '6838',  town: 'DeFuniak Springs',  state: 'FL', risk: 'low', shared: true,
    aliases: ['De Funiak Springs'], highway: 'US 331' },
  { loc: '6972',  town: 'Ada',               state: 'OK', risk: 'high'   },
  { loc: '10034', town: 'Bonifay',           state: 'FL', risk: 'low'    },
  { loc: '10422', town: 'Atoka',             state: 'OK', risk: 'medium' },
  { loc: '10915', town: 'Seminole',          state: 'OK', risk: 'high'   },
  { loc: '11657', town: 'Purcell',           state: 'OK', risk: 'medium' },
  { loc: '13113', town: 'Madill',            state: 'OK', risk: 'low'    },
  { loc: '18213', town: 'Lindsay',           state: 'OK', risk: 'medium' },
  { loc: '20475', town: 'Oklahoma City',     state: 'OK', risk: 'medium' },
  { loc: '29760', town: 'Duncan',            state: 'OK', risk: 'medium' },
  { loc: '31357', town: 'Pauls Valley',      state: 'OK', risk: 'low'    },
  { loc: '32525', town: 'Sulphur',           state: 'OK', risk: 'high'   },
  { loc: '33109', town: 'Marietta',          state: 'OK', risk: 'high'   },
  { loc: '33222', town: 'Elgin',             state: 'OK', risk: 'high'   },
  { loc: '33704', town: 'Tecumseh',          state: 'OK', risk: 'medium' },
  { loc: '34222', town: 'Harrah',            state: 'OK', risk: 'high'   },
  { loc: '35064', town: 'Holdenville',       state: 'OK', risk: 'low'    },
  { loc: '35242', town: 'Cottondale',        state: 'FL', risk: 'medium' },
  // Owner-confirmed: 17750 State Highway 285 Dr S, DeFuniak Springs FL 32435.
  // The STORE is Mossy Head; the ADDRESS town is DeFuniak Springs, shared with 6838.
  { loc: '37566', town: 'Mossy Head',        state: 'FL', risk: 'low',
    addressTown: 'DeFuniak Springs', highway: 'SR 285' },
  { loc: '38609', town: 'Freeport',          state: 'FL', risk: 'high'   },
  { loc: '43380', town: 'Tishomingo',        state: 'OK', risk: 'high'   },
  { loc: '43701', town: 'Ponce de Leon',     state: 'FL', risk: 'high'   },
];

export const LOCALITY_BY_LOC = Object.fromEntries(LOCALITIES.map(l => [l.loc, l]));

const unpad = (l) => String(l || '').replace(/^0+/, '') || String(l || '');
export const localityOf = (loc) => LOCALITY_BY_LOC[unpad(loc)] || null;

/** Every store that could match a given town name — including by address town. */
export function locsForTown(town) {
  const t = String(town || '').toLowerCase();
  return LOCALITIES.filter(l =>
    l.town.toLowerCase() === t ||
    (l.addressTown || '').toLowerCase() === t ||
    (l.aliases || []).some(a => a.toLowerCase() === t)
  ).map(l => l.loc);
}

/** Towns that map to more than one store — a mention there can't be pinned to one. */
export function ambiguousTowns() {
  const seen = {};
  for (const l of LOCALITIES) {
    for (const t of [l.town, l.addressTown].filter(Boolean)) {
      (seen[t] = seen[t] || []).push(l.loc);
    }
  }
  return Object.fromEntries(Object.entries(seen).filter(([, v]) => v.length > 1));
}

const STATE_NAME = { OK: 'Oklahoma', FL: 'Florida' };

/**
 * Build a search query for one store, tightened according to its ambiguity risk.
 * `style`: 'plain' (RSS q= params — no quotes, they break TownNews feeds)
 *          'boolean' (X / YouTube — supports quoted phrases and negation)
 */
export function searchQuery(loc, { style = 'boolean', brand = "McDonald's" } = {}) {
  const l = localityOf(loc);
  if (!l) return null;

  if (style === 'plain') {
    // TownNews RSS q= takes ONE unquoted term; quoted phrases break the endpoint.
    // Use the most distinctive single word available.
    return l.town.split(' ').sort((a, b) => b.length - a.length)[0];
  }

  const parts = [`"${brand}"`, `"${l.town}"`];
  if (l.risk !== 'low') parts.push(`"${STATE_NAME[l.state] || l.state}"`);
  const neg = NEGATIVE_TERMS[l.town.toLowerCase()] || [];
  const negatives = l.risk === 'high' ? neg.map(n => `-"${n}"`) : [];
  return [...parts, ...negatives].join(' ');
}

/**
 * Attribute a piece of text to stores. Deliberately conservative: returns every
 * plausible store and flags when it cannot narrow to one, rather than guessing.
 */
export function attribute(text) {
  const s = String(text || '').toLowerCase();
  const hits = new Set();
  for (const l of LOCALITIES) {
    const names = [l.town, l.addressTown, ...(l.aliases || [])].filter(Boolean);
    if (names.some(n => s.includes(n.toLowerCase()))) hits.add(l.loc);
  }
  // A highway mention separates the two DeFuniak-address stores.
  if (hits.has('6838') && hits.has('37566')) {
    if (/\b331\b/.test(s)) hits.delete('37566');
    else if (/\b285\b/.test(s)) hits.delete('6838');
  }
  const locs = [...hits];
  return { locs, ambiguous: locs.length > 1, confident: locs.length === 1 };
}

/** Does this text look like a false positive for the given store? */
export function looksLikeNoise(loc, text) {
  const l = localityOf(loc);
  if (!l) return false;
  const neg = NEGATIVE_TERMS[l.town.toLowerCase()] || [];
  const s = String(text || '').toLowerCase();
  return neg.some(n => s.includes(n.toLowerCase()));
}
