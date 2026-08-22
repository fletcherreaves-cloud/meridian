// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #74 -- imported memory/data/cfv-history-2023-2026.json (217 real CFV visits,
// 2023-01-18 -> 2026-08-18, all 27 stores) into Supabase graded_visits. ds.gradedVisits was
// previously fed only by manually-dropped PDFs; this is the first time the full series is
// visible in the app.
//
// Per the dispatch's own verification bar: "assert against the panel, not the loader. A test
// that only checks saveGradedVisits was called cannot tell 'imported' from 'imported and
// displayed'." So this renders the ACTUAL VisitPatterns consumer (src/views/visit-readiness.js)
// with the REAL 2026 subset of the committed seed file -- not a synthetic fixture -- and asserts
// the panel's own header text, matching the same end-to-end figure the dispatch validated against
// Propel's published Customer First card (55.3% meeting 80% / 44.7% below).
//
// The panel's own pr() formats to 2 decimals ((v*100).toFixed(2)+'%'), so the exact rendered
// string is '55.32%' (26/47), not the 1-decimal '55.3%' the dispatch's prose uses -- measured
// from the seed file itself, not assumed from the dispatch's rounding.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { VisitPatterns } from '../views/visit-readiness.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(path.join(__dirname, '../../memory/data/cfv-history-2023-2026.json'), 'utf8'));

// Same shape the import script's buildRow() produces and loadGradedVisits() returns: store /
// dateISO / score / pass / reportType. pass is the same derivation the script uses
// (score >= 80) -- not re-imported from the script, so this test can't be fooled by a bug that
// lives inside buildRow() itself.
const cfv2026 = seed.visits
  .filter(v => v.visitDate >= '2026-01-01')
  .map(v => ({
    store: String(v.loc).padStart(5, '0'),
    dateISO: v.visitDate,
    score: v.overallPct,
    pass: v.overallPct >= 80,
    reportType: v.reportType,
  }));

describe('CFV history import lands in the Visit Patterns panel (dispatch #74)', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('seed sanity: 47 real 2026 CFV visits, 26 meeting 80%', () => {
    expect(cfv2026).toHaveLength(47);
    expect(cfv2026.filter(v => v.pass)).toHaveLength(26);
  });

  it("shows the real imported 2026 CFV figures in the panel's own header, not a loader mock", () => {
    const ds = { gradedVisits: cfv2026 };
    act(() => {
      root.render(React.createElement(VisitPatterns, { ds, locs: null }));
    });
    const header = container.textContent;
    expect(header).toContain('47 actual visits');
    expect(header).toContain('55.32% pass');
  });

  it('a broken/empty import renders nothing to compare against (sanity on the sanity check)', () => {
    const ds = { gradedVisits: [] };
    act(() => {
      root.render(React.createElement(VisitPatterns, { ds, locs: null }));
    });
    expect(container.textContent).toBe('');
  });
});
