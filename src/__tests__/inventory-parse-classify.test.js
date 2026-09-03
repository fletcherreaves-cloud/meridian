// @ts-nocheck
// parsers/inventory-parse.js's classifyInvArea/parseInvUOM had zero test coverage despite being
// live-consumed by views/inventory.js (area tagging + case-size/unit-type display, both driving
// real UI columns). classifyInvArea: INV_MASTER lookup first (only 'Service'/'Production' short-
// circuit — 'Promotional' and other master areas fall through to the keyword fallback), then
// keyword-list matching, else 'Other'. parseInvUOM: extracts case size + unit type from a
// "UNIT/CASESIZE"-shaped string (e.g. "LB/12"), matching the display format views/inventory.js
// itself reconstructs as `unitType + '/' + caseSize`.
import { describe, it, expect } from 'vitest';
import { classifyInvArea, parseInvUOM, INV_MASTER } from '../parsers/inventory-parse.js';

describe('classifyInvArea', () => {
  it('returns the INV_MASTER area directly for a known Production wrin', () => {
    expect(INV_MASTER['00001-705'].area).toBe('Production');
    expect(classifyInvArea('00001-705', 'anything')).toBe('Production');
  });

  it('returns the INV_MASTER area directly for a known Service wrin', () => {
    expect(INV_MASTER['00023-117'].area).toBe('Service');
    expect(classifyInvArea('00023-117', 'anything')).toBe('Service');
  });

  it('falls through to keyword matching for a master area other than Service/Production (e.g. Promotional)', () => {
    expect(INV_MASTER['00634-128'].area).toBe('Promotional');
    // Description carries a Production keyword ('wrap') -- since Promotional isn't
    // short-circuited, the fallback keyword match decides instead of the master's own area.
    expect(classifyInvArea('00634-128', 'Sandwich Wrap')).toBe('Production');
  });

  it('classifies an unknown wrin as Production via a description keyword', () => {
    expect(classifyInvArea('99999-999', 'Fry Box Carton')).toBe('Production');
  });

  it('classifies an unknown wrin as Service via a description keyword', () => {
    expect(classifyInvArea('99999-999', 'Paper Straw')).toBe('Service');
  });

  it('is case-insensitive on the description keyword match', () => {
    expect(classifyInvArea('99999-999', 'PAPER STRAW')).toBe('Service');
  });

  it('classifies an unknown wrin with no matching keyword as Other', () => {
    expect(classifyInvArea('99999-999', 'Mystery Widget')).toBe('Other');
  });

  it('classifies as Other when both wrin and description are missing', () => {
    expect(classifyInvArea(undefined, undefined)).toBe('Other');
  });
});

describe('parseInvUOM', () => {
  it('extracts case size and unit type from a "UNIT/CASESIZE" string', () => {
    expect(parseInvUOM('LB/12')).toEqual({ caseSize: 12, unitType: 'LB' });
    expect(parseInvUOM('EA/1')).toEqual({ caseSize: 1, unitType: 'EA' });
  });

  it('defaults caseSize to 1 when there is no slash at all', () => {
    expect(parseInvUOM('EA')).toEqual({ caseSize: 1, unitType: 'EA' });
  });

  it('trims whitespace around the slash', () => {
    expect(parseInvUOM('LB / 12')).toEqual({ caseSize: 12, unitType: 'LB' });
  });

  it('handles missing/empty input without throwing', () => {
    expect(parseInvUOM(undefined)).toEqual({ caseSize: 1, unitType: '' });
    expect(parseInvUOM('')).toEqual({ caseSize: 1, unitType: '' });
  });
});
