import { describe, it, expect } from 'vitest';
import { LOCALITIES, localityOf, locsForTown, ambiguousTowns, searchQuery,
         attribute, looksLikeNoise, NEGATIVE_TERMS } from '../engine/locality.js';
import { STORE_NAMES } from '../constants.js';

describe('registry covers the real store list', () => {
  it('has an entry for every store in STORE_NAMES', () => {
    const missing = Object.keys(STORE_NAMES).filter(l => !localityOf(l));
    expect(missing, `stores with no locality: ${missing.join(', ')}`).toEqual([]);
  });

  it('has no entry for a store that does not exist', () => {
    const extra = LOCALITIES.filter(l => !STORE_NAMES[l.loc]).map(l => l.loc);
    expect(extra).toEqual([]);
  });

  it('tolerates zero-padded loc numbers, as the DAR tables use', () => {
    expect(localityOf('0010422').town).toBe('Atoka');
    expect(localityOf('10422').town).toBe('Atoka');
  });
});

describe('the DeFuniak Springs problem', () => {
  // Owner-confirmed: 6838 is on US-331, 37566 (Mossy Head) is on SR-285, and BOTH
  // carry a DeFuniak Springs mailing address. The two TripAdvisor listings are two
  // real stores, not a duplicate.
  it('both stores answer to the DeFuniak Springs address town', () => {
    expect(locsForTown('DeFuniak Springs').sort()).toEqual(['37566', '6838']);
  });

  it('Mossy Head is still findable by its own name', () => {
    expect(locsForTown('Mossy Head')).toEqual(['37566']);
  });

  it('a bare DeFuniak mention is reported as ambiguous, not guessed', () => {
    const r = attribute('Long wait at the McDonald\'s in DeFuniak Springs');
    expect(r.locs.sort()).toEqual(['37566', '6838']);
    expect(r.ambiguous).toBe(true);
    expect(r.confident).toBe(false);
  });

  it('the highway number separates them', () => {
    expect(attribute('McDonald\'s on US Highway 331 in DeFuniak Springs').locs).toEqual(['6838']);
    expect(attribute('McDonald\'s on State Highway 285, DeFuniak Springs').locs).toEqual(['37566']);
  });

  it('lists both multi-store towns', () => {
    const amb = ambiguousTowns();
    expect(amb['Ardmore'].sort()).toEqual(['24471', '3708']);
    expect(amb['DeFuniak Springs'].sort()).toEqual(['37566', '6838']);
  });
});

describe('query construction guards the ambiguous towns', () => {
  it('pins high-risk towns with the state and negative terms', () => {
    const q = searchQuery('5985');            // Durant
    expect(q).toContain('"Durant"');
    expect(q).toContain('"Oklahoma"');
    expect(q).toContain('-"Kevin Durant"');   // the observed false positive
  });

  it('excludes Marietta, Georgia', () => {
    expect(searchQuery('33109')).toContain('-"Georgia"');
  });

  it('excludes Tishomingo County, Mississippi', () => {
    // GDELT returned exactly this false positive during research.
    expect(searchQuery('43380')).toContain('-"Mississippi"');
  });

  it('excludes the ADA acronym and the casino', () => {
    expect(searchQuery('6972')).toContain('-"Americans with Disabilities"');
    expect(searchQuery('34222')).toContain('-"Harrah\'s"');
  });

  it('leaves low-risk towns unconstrained', () => {
    const q = searchQuery('35064');           // Holdenville
    expect(q).toContain('"Holdenville"');
    expect(q).not.toContain('-');
    expect(q).not.toContain('Oklahoma');
  });

  it('plain style emits ONE unquoted term — quoted phrases break TownNews RSS', () => {
    const q = searchQuery('31357', { style: 'plain' });   // Pauls Valley
    expect(q).not.toContain('"');
    expect(q.split(' ')).toHaveLength(1);
    expect(q).toBe('Valley');                 // longest, most distinctive word
  });

  it('returns null for an unknown store rather than a broken query', () => {
    expect(searchQuery('99999')).toBeNull();
  });

  it('builds a usable query for all 27 stores', () => {
    for (const l of LOCALITIES) {
      const q = searchQuery(l.loc);
      expect(q, l.loc).toBeTruthy();
      expect(q, l.loc).toContain(l.town);
    }
  });
});

describe('noise detection', () => {
  it('flags a basketball story as noise for Durant', () => {
    expect(looksLikeNoise('5985', 'Kevin Durant scores 40 in win')).toBe(true);
  });

  it('does not flag a genuine local story', () => {
    expect(looksLikeNoise('5985', 'Durant city council approves new water main')).toBe(false);
  });

  it('flags ADA-compliance copy for Ada', () => {
    expect(looksLikeNoise('6972', 'New ADA compliant ramp installed')).toBe(true);
  });

  it('every negative-term key matches a real town in the registry', () => {
    const towns = new Set(LOCALITIES.map(l => l.town.toLowerCase()));
    const orphan = Object.keys(NEGATIVE_TERMS).filter(k => !towns.has(k));
    expect(orphan, `negative terms for unknown towns: ${orphan.join(', ')}`).toEqual([]);
  });

  it('every high-risk town has negative terms defined', () => {
    const missing = LOCALITIES.filter(l => l.risk === 'high')
      .filter(l => !NEGATIVE_TERMS[l.town.toLowerCase()]).map(l => l.town);
    expect(missing, `high-risk with no guards: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('attribution is conservative', () => {
  it('attributes a distinctive town confidently', () => {
    const r = attribute('The McDonald\'s in Chickasha was closed');
    expect(r.locs).toEqual(['5183']);
    expect(r.confident).toBe(true);
  });

  it('returns nothing rather than guessing when no town appears', () => {
    const r = attribute('McDonald\'s is testing a new burger');
    expect(r.locs).toEqual([]);
    expect(r.confident).toBe(false);
  });

  it('flags both Ardmore stores as ambiguous', () => {
    const r = attribute('Ardmore drive-thru backed up onto the road');
    expect(r.locs.sort()).toEqual(['24471', '3708']);
    expect(r.ambiguous).toBe(true);
  });

  it('is safe on empty input', () => {
    expect(attribute('').locs).toEqual([]);
    expect(attribute(undefined).locs).toEqual([]);
  });
});
