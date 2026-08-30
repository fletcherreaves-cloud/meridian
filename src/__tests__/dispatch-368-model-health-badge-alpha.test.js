// @vitest-environment happy-dom
// @ts-nocheck
// Issue #368 — the same var()+hexSuffix bug #351 fixed in patch-heatmap.js was also live in
// model-health-badge.js: `health.gradeColor+'22'` / `+'66'` only produces valid CSS when
// gradeColor is a hex literal. computeModelHealth's own gradeColor formula (forecast.js) returns
// 'var(--warn)'/'var(--crit)' for any grade below "excellent" — so any store graded yellow or
// red silently lost its score-pill background tint and border, with no console error. Fixed by
// routing through withAlpha (moved to utils/fmt.js under this same dispatch, re-exported
// unchanged from patch-heatmap.js for its own existing importers).
//
// Per this repo's "would this verification still pass if the change were reverted" rule, this
// renders the REAL ModelHealthBadge component against a REAL red-graded fixture (not a mocked
// gradeColor) and reads the actual DOM style — a revert to the old `+'22'`/`+'66'` concatenation
// would make these assertions fail, since the resulting string would no longer contain
// "color-mix(", it would be the raw (invalid) concatenated string instead.
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import ReactDOMServer from 'react-dom/server';
import { ModelHealthBadge } from '../views/model-health-badge.js';
import { withAlpha } from '../utils/fmt.js';

const LOC = '3708'; // Ardmore-Broadway — real DEFAULT_TARGETS entry, not a recentOnly store

function makeDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0);
  return d;
}

// Same "never run Dialed-In" fixture shape as model-health-reconcile.test.js's
// buildNeverCalibratedDs/neverCalibratedSettings — Calibration AND Accuracy are both true-zero
// by definition (di doesn't exist for this store), which both this repo's Model Health
// implementations already agree grades red/critical -- i.e. gradeColor === 'var(--crit)', a
// real, reproducible non-hex-literal case, not a synthetic one.
function buildDs(loc = LOC) {
  const laborRows = [];
  const dowMult = [0.8, 1.0, 1.0, 1.05, 1.1, 1.3, 1.2];
  for (let i = 500; i >= 1; i--) {
    const d = makeDate(i);
    const sales = Math.round(10000 * dowMult[d.getDay()] * (0.95 + Math.random() * 0.1));
    laborRows.push({ loc, date: d, sales, gc: Math.round(sales / 7), laborPct: 0.28 });
  }
  return {
    loaded: true, laborRows, opsRows: [], ctrlRows: [], weatherRows: [],
    targets: {}, lastActual: { [loc]: makeDate(1) }, storeIds: [loc],
  };
}
const settings = { weekStartDay: 3, dialedInEnabled: true, dialedInSkipped: [], dialedIn: {} };

describe('withAlpha (moved to utils/fmt.js under #368)', () => {
  it('a hex literal keeps the original suffix-concat behavior unchanged', () => {
    expect(withAlpha('#10b981', '22')).toBe('#10b98122');
  });
  it('a var() reference produces valid color-mix() CSS, not the invalid concatenated string', () => {
    const result = withAlpha('var(--crit)', '22');
    expect(result).not.toContain('var(--crit)22');
    expect(result).toBe('color-mix(in srgb, var(--crit) 13%, transparent)');
  });
});

describe('ModelHealthBadge real-consumer behavior (issue #368)', () => {
  // Server-rendered, not DOM-rendered: happy-dom's CSSStyleDeclaration doesn't recognize
  // `color-mix()` as a valid value and silently drops it on assignment too (confirmed directly —
  // `element.style.background` read back empty for BOTH the old broken string and the new fixed
  // one), so reading a mounted element's `.style` can't distinguish fixed from broken here.
  // ReactDOMServer.renderToStaticMarkup serializes the style OBJECT straight into the `style="…"`
  // HTML attribute string via React's own serializer, with no browser CSSOM validation in the
  // path — the literal value (broken concatenation or valid color-mix()) survives intact either
  // way, so a revert of the fix is directly visible in the output string.
  it('a red-graded store (gradeColor = var(--crit)) renders a valid color-mix() tint, not the broken concatenated string', () => {
    const ds = buildDs();
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ModelHealthBadge, { loc: LOC, settings, ds, showDetail: false })
    );
    // Locate the score pill's own style attribute: the div carrying the grade dot + total +
    // label, identified by its unique border-radius:10px among this component's divs.
    const pillIdx = html.indexOf('border-radius:10px');
    expect(pillIdx, 'could not find the score pill (border-radius:10px) in the rendered HTML').toBeGreaterThan(-1);
    const tagStart = html.lastIndexOf('<div', pillIdx);
    const tagEnd = html.indexOf('>', tagStart);
    const pillTag = html.slice(tagStart, tagEnd + 1);
    expect(pillTag).toContain('background:color-mix(in srgb, var(--crit) 13%, transparent)');
    expect(pillTag).toContain('color-mix(in srgb, var(--crit) 40%, transparent)'); // border, 0x66=102/255≈40%
    expect(pillTag).not.toContain('var(--crit)22');
    expect(pillTag).not.toContain('var(--crit)66');
  });
});
