// @ts-nocheck
// Equipment Results Panel (owner request 2026-11-02: "add a link to the equipment survey as well
// as build out a landing panel for the results in the app"). Like equipment-layout.js/
// equipment-survey-view.js's own precedent, EquipmentResultsPanel loads live from Supabase on
// mount (loadEquipmentCatalogDirect/loadAllEquipmentEntriesDirect/loadEquipmentSurveyLinks), so
// per this repo's established pattern for that shape of panel, tests cover the pure exported
// logic directly rather than rendering the network-loading component. The cross-store rollup
// logic itself (buildEquipmentStoreSummary) is tested in equipment-survey.test.js, alongside the
// rest of the engine it lives in.
import { describe, it, expect } from 'vitest';
import { equipmentSurveyUrl } from '../views/equipment-results.js';

describe('equipmentSurveyUrl', () => {
  it('builds a URL carrying the token as the ?equip= query param', () => {
    expect(equipmentSurveyUrl('abc123')).toMatch(/\?equip=abc123$/);
  });

  it('differs for different tokens', () => {
    expect(equipmentSurveyUrl('a')).not.toBe(equipmentSurveyUrl('b'));
  });
});
