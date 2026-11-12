// @ts-nocheck
// Tests of squadle-pull.mjs's exported pure helpers (task #105). The two real traps that
// blocked this pull for a while -- the realtime-permission-session step and the email-key
// encoding -- plus the multi-frame RTDB response reassembly (not independently exported;
// exercised by the live dispatch validation instead) are all documented in this script's own
// header and memory/finding-hme-squadle-integration-2026-11-06.md. These unit tests cover the
// pure helpers that don't need a live connection.
import { describe, it, expect } from 'vitest';
import { emailChannelKey, storeNumberFromTags, padLoc, shardName } from '../../scripts/squadle-pull.mjs';

describe('emailChannelKey (squadle-pull.mjs)', () => {
  it('matches the exact transform confirmed live against hq.squadle.com\'s own compiled bundle', () => {
    // encodeURIComponent(email).replace(/\./g,'%2E') -- confirmed live 2026-11-12 to resolve
    // the real /channels/email/<key> lookup to the real userId (-P5m_zSDuPJHXVGrcz4y).
    expect(emailChannelKey('fletcher@mcdok.com')).toBe('fletcher%40mcdok%2Ecom');
  });
  it('substitutes every literal period, not just the first', () => {
    expect(emailChannelKey('a.b.c@d.com')).toBe('a%2Eb%2Ec%40d%2Ecom');
  });
});

describe('storeNumberFromTags (squadle-pull.mjs)', () => {
  it('finds the literal store number among a real record\'s tags, regardless of position', () => {
    // Real shape confirmed live: {"0":{"text":"rfp-2"},"1":{"text":"6972"}}
    expect(storeNumberFromTags({ 0: { text: 'rfp-2' }, 1: { text: '6972' } })).toBe('6972');
    expect(storeNumberFromTags({ 0: { text: '6972' }, 1: { text: 'rfp-2' } })).toBe('6972');
  });
  it('ignores non-numeric tags and tags outside the real 4-7 digit store-number range', () => {
    expect(storeNumberFromTags({ 0: { text: 'eq-walk-in-cooler-1' }, 1: { text: 'xyz' } })).toBeNull();
    expect(storeNumberFromTags({ 0: { text: '123' } })).toBeNull(); // too short to be a real store number
  });
  it('returns null for missing/empty tags', () => {
    expect(storeNumberFromTags(null)).toBeNull();
    expect(storeNumberFromTags({})).toBeNull();
  });
});

describe('padLoc (squadle-pull.mjs)', () => {
  it('zero-pads a real store number to Meridian\'s 7-char loc convention', () => {
    expect(padLoc('6972')).toBe('0006972');
  });
  it('returns null for missing input', () => {
    expect(padLoc(null)).toBeNull();
  });
});

describe('shardName (squadle-pull.mjs)', () => {
  it('matches the real sqdl-prod-cd-NNN naming confirmed live (23 shards, 2026-11-12)', () => {
    expect(shardName(1)).toBe('sqdl-prod-cd-001');
    expect(shardName(12)).toBe('sqdl-prod-cd-012'); // the shard confirmed live to host real data
    expect(shardName(23)).toBe('sqdl-prod-cd-023');
  });
});
