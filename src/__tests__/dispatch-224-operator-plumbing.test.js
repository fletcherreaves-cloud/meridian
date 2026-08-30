// @ts-nocheck
// Dispatch #224 Task 1 — operatorGroups()/setLiveOperators()/operatorOf() live plumbing for the
// EOM Digest's new Operator rollup tier. Mirrors the FLAT-MAP half of supervisorGroups()/
// setLiveSupervisorGroups() (constants.js) — deliberately NOT the fuller whoRan()/groupsAt()
// effective-dated timeline supervisorOf() itself is built on, since the confirmed live Supabase
// shape (org_config.app_settings.operators) has no per-operator start-dating at all (see Task 1's
// own doc comment in constants.js). So these tests are the simpler shape too: live-set/reset,
// fallback resolution, and the seed itself — no reassignment-over-time scenarios (there is no
// timeline to reassign against).
import { describe, it, expect, afterEach } from 'vitest';
import { DEF_SETTINGS, operatorGroups, operatorOf, setLiveOperators } from '../constants.js';

afterEach(() => {
  // Reset to the seed so other test files (and later tests in this one) see DEF_SETTINGS.operators
  // again — setLiveOperators() only overrides when handed a non-empty object, so this genuinely
  // clears any prior test's live override rather than leaving it in place.
  setLiveOperators(DEF_SETTINGS.operators);
});

describe('#224 operatorGroups() — seed default', () => {
  it('returns DEF_SETTINGS.operators before any live value is set', () => {
    setLiveOperators(null); // no-op per setLiveOperators' own guard (falsy input never overrides)
    // operatorGroups() falls back to the seed whenever _liveOperatorGroups is unset — reset by a
    // prior test's afterEach already landed us there, this just asserts the resting state.
    expect(operatorGroups()).toBe(DEF_SETTINGS.operators);
  });

  it('the seed covers all 27 real stores across exactly 4 operators, no gaps, no overlap', () => {
    const groups = DEF_SETTINGS.operators;
    expect(Object.keys(groups).sort()).toEqual(['Gary Mornhinweg', 'Jacob Thorley', 'Rick/Kathy Thorley', 'Ryan Thorley'].sort());
    const allLocs = Object.values(groups).flat();
    expect(allLocs.length).toBe(27); // no overlap — a duplicated loc would inflate this past 27
    expect(new Set(allLocs).size).toBe(27); // no loc listed under two operators
  });
});

describe('#224 setLiveOperators() — live override', () => {
  it('a live value replaces the seed entirely', () => {
    setLiveOperators({ 'Test Op': ['9999'] });
    expect(operatorGroups()).toEqual({ 'Test Op': ['9999'] });
  });

  it('an empty object does NOT override (same guard as setLiveSupervisorGroups)', () => {
    setLiveOperators({});
    expect(operatorGroups()).toBe(DEF_SETTINGS.operators);
  });

  it('null/undefined does NOT override', () => {
    setLiveOperators({ 'Test Op': ['9999'] });
    setLiveOperators(null);
    expect(operatorGroups()).toEqual({ 'Test Op': ['9999'] }); // still the previous live value, not reset
  });
});

describe('#224 operatorOf() — linear-scan-for-loc lookup', () => {
  it('resolves the operator owning a real seeded store', () => {
    expect(operatorOf('3708')).toBe('Ryan Thorley'); // Ardmore-Broadway, MCDOK
    expect(operatorOf('6178')).toBe('Jacob Thorley'); // Chipley, Emerald Arches
  });

  it('normalizes zero-padded locs the same way supervisorOf()/unpadLoc() do', () => {
    expect(operatorOf('0003708')).toBe('Ryan Thorley');
  });

  it('Ryan Thorley resolves for his cross-org Florida stores too (dual-org operator, not a tree)', () => {
    expect(operatorOf('10034')).toBe('Ryan Thorley'); // Bonifay FL — Ryan, not Jacob
    expect(operatorOf('37566')).toBe('Ryan Thorley'); // Mossy Head FL — Ryan, not Jacob
  });

  it('returns the given fallback for a loc no group lists', () => {
    expect(operatorOf('999999', 'Nobody')).toBe('Nobody');
  });

  it('returns null (the default fallback) when no fallback arg is given', () => {
    expect(operatorOf('999999')).toBeNull();
  });

  it('reflects a live override immediately', () => {
    setLiveOperators({ 'New Operator': ['3708'] });
    expect(operatorOf('3708')).toBe('New Operator');
    expect(operatorOf('6178')).toBeNull(); // no longer in ANY group under the live override
  });
});
