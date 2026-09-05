// @ts-nocheck
// SAGE's system prompt used to drop its entire QSRSoft field-definitions section whenever
// ds.qsrFieldDefs was falsy (buildFieldDefsSection returned '' outright) — which is the common
// case, since that live table is populated by an owner-run Playwright scrape, not guaranteed
// loaded in every environment. This left SAGE with zero field definitions to answer "what is
// OEPE" with, even though the same real QSRSoft definitions already exist as static dictionaries
// in src/constants.js (QSR_DAR_FIELDS/QSR_FOB_FIELDS/QSR_EBOS_FIELDS, part of the "field
// dictionary" backlog item). This test locks in the fix: the static dictionaries are always
// merged in as a fallback, and live-scraped definitions (when present) win on overlapping labels.
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../views/sage.js';

const baseDs = { storeIds: [] };

describe('SAGE system prompt: QSRSoft field-definitions fallback', () => {
  it('includes real field definitions even when ds.qsrFieldDefs is entirely absent', () => {
    const prompt = buildSystemPrompt(baseDs, [], []);
    expect(prompt).toContain('QSRSOFT FIELD DEFINITIONS');
    // A real DAR metric (OEPE-adjacent) and a real FOB metric, from the static dictionaries.
    expect(prompt).toContain('DT Until Serve');
    expect(prompt).toContain('Comp Waste $');
  });

  it('merges the live (scraped) table over the static fallback, live wins on overlap', () => {
    const ds = { ...baseDs, qsrFieldDefs: { dar: { 'DT Until Serve': 'LIVE override description' } } };
    const prompt = buildSystemPrompt(ds, [], []);
    expect(prompt).toContain('LIVE override description');
    // A label only the live table carries (not in our static DAR dict) still surfaces.
    expect(prompt).toContain('DT Until Serve: LIVE override description');
  });

  it('a live page with new labels not in the static dict still merges in (fields are additive, not replaced wholesale)', () => {
    const ds = { ...baseDs, qsrFieldDefs: { dar: { 'Some Brand New Field': 'a field only the live scrape knows about' } } };
    const prompt = buildSystemPrompt(ds, [], []);
    expect(prompt).toContain('Some Brand New Field: a field only the live scrape knows about');
    // Static DAR entries are still present alongside it.
    expect(prompt).toContain('DT Until Serve');
  });
});
