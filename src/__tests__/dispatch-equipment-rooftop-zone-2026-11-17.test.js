// @ts-nocheck
// Owner request 2026-11-17: add "Rooftop" as a floor-plan area. Rooftop equipment (remote
// condensers, exhaust fans, HVAC units — already real catalog TYPES in equipment-layout.js's
// CATALOG_TYPE_GROUPS) had nowhere to be logically placed among the interior floor areas.
// PLACEMENTS (src/engine/equipment-survey.js) is the single source of truth for both the crew
// walkthrough form's dropdown and the Layout Planner's floor-plan grid — this guards that the
// Layout Planner's own ZONE_GRID_AREA map never drifts out of step with it (same lockstep
// pattern scheduled-pull-registry.test.js already uses for its own two-file pair).
import { describe, it, expect } from 'vitest';
import { PLACEMENTS, placementLabel } from '../engine/equipment-survey.js';
import fs from 'node:fs';

describe('Rooftop floor-plan zone (task 2026-11-17)', () => {
  it('PLACEMENTS carries a rooftop entry with the expected label', () => {
    expect(PLACEMENTS.find(p => p.value === 'rooftop')).toEqual({ value: 'rooftop', label: 'Rooftop' });
    expect(placementLabel('rooftop')).toBe('Rooftop');
  });

  it('equipment-layout.js\'s ZONE_GRID_AREA has an entry for every PLACEMENTS value, including rooftop', () => {
    const src = fs.readFileSync('src/views/equipment-layout.js', 'utf8');
    const block = src.match(/const ZONE_GRID_AREA = \{[\s\S]*?\n\};/)?.[0];
    expect(block, 'could not find ZONE_GRID_AREA block').toBeTruthy();
    for (const p of PLACEMENTS) {
      expect(block, `ZONE_GRID_AREA is missing a '${p.value}' entry`).toMatch(new RegExp(`\\b${p.value}:\\s*'`));
    }
  });
});
