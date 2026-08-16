// @ts-nocheck
// Guards against #296's regression class re-growing: a hardcoded rgba(255,255,255,X) border,
// stroke, background, or color bypasses meridian.css's --bdr/--bdr2/--surf/--surf2/--surf3
// tokens (defined in every one of the 8 [data-theme][data-mode] blocks). Every one renders
// wrong in the light themes -- some invisible (border/stroke, the #295 bug class), the rest
// low-contrast. 1135+ sites already use the token system correctly; these are stragglers that
// predate or bypassed it. Without a ratcheting ceiling this regrows silently -- the Bullseye
// tile (#274/#282) was written well AFTER the tokens existed and AFTER 1135 sites had already
// adopted them, and still shipped three invisible rings (#295).
//
// The issue's own filing measured 427 sites; a fresh count against this PR's actual base
// (f330c17, immediately before #295 merged) measured 471 -- the codebase moved between the
// issue being filed and this PR being built, and 471 is the number this file's own math is
// built on: 471 total, 202 border/stroke converted here, 269 remaining. #295 then merged
// first and removed 3 more (Bullseye's own ring sites, deliberately excluded from THIS PR's
// conversion -- see below), so after rebasing onto post-#295 main the true remaining count is
// 266, which is what CEILING is set to. Stating the real counts measured against the actual
// base at each point, not repeating the issue's now-stale 427, per PM review on this PR
// (2026-08-15) flagging the mismatch.
//
// #296 step 1 converted the border/stroke-role sites -- the ones that vanish rather than
// merely low-contrast -- from 202 down to (mostly) zero. #296 step 2 (this commit) converts
// the highest-priority background/color sites: the ones a user reads as "no data" rather than
// a rendering fault -- invisible greeting text, comment text, source-badge labels, table/SVG
// muted numerics, and the labor Act-vs-Need figure (shared root cause with #303's data-sourcing
// fix on the same line). The remaining ~197 sites are pure `background:`/`boxShadow:` role --
// lower-urgency (low-contrast, not invisible) and left for a follow-up sweep. The ceiling below
// is the MEASURED count immediately after step 2 landed, not a round number -- ratchet it down
// again when the background sweep ships, per CLAUDE.md's "measure it, don't reason about it"
// rule. Never raise it without a real reason recorded here.
//
// Sites that are DELIBERATELY excluded from conversion, and therefore counted in the ceiling
// rather than converted, each for a different reason:
//   - Standalone HTML-export generators (analytics.js's Anomaly Report, inventory.js's
//     District Inventory Report, scheduling-deck.js's slide deck, morning-brief.js's emailed
//     brief, etc.) build a COMPLETE, self-contained `<!DOCTYPE html>` document as a string,
//     with its own literal-hex mini stylesheet. var(--bdr) would not resolve there -- these
//     documents never load meridian.css -- so converting them would trade an invisible-in-
//     light-mode bug for a broken-everywhere bug. Left untouched on purpose.
//   - Background/color-role sites (`background:`, `color:`, `fill:`, `boxShadow:` etc) -- out
//     of step 1's scope per the issue's own two-step split (#276's precedent: a single ~430-
//     site diff hides the handful of lines that need real judgment). These degrade to
//     low-contrast, not invisible, so they're the lower-urgency half.
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

// Measured immediately after #296 step 2 landed (2026-08-15): 241 remaining
// rgba(255,255,255,X) occurrences in src/**/*.js -- 25 fewer than step 1's 266, from
// converting 19 text/color-role sites (skills-matrix.js, store-dash.js, analytics.js,
// at-a-glance.js) plus 6 already-caught during classification (a step-1 miss + duplicates
// in the same style objects). What remains is almost entirely background/boxShadow-role
// (deferred to a follow-up sweep) plus the same handful of standalone-HTML-export and
// Chart.js-canvas-config sites that must stay literal (see header). Lowered to match
// immediately, per this guard's own ratchet discipline: don't leave slack once a real drop
// is measured. Any number ABOVE this means something new landed without going through the
// token system.
//
// Excludes __tests__ (this file's own descriptive prose would otherwise match its own guard)
// and the two changelog files (changelog-data.js / changelog-latest.js -- their entries
// describe fixes like this one in prose, which legitimately contains the literal string being
// grepped for; historical/descriptive text, not live style code -- same reasoning #286 used to
// exclude changelog mentions from its own hex-token sweep).
const CEILING = 241;

describe('#296: no new hardcoded rgba(255,255,255,X) in src/**/*.js', () => {
  it('stays at or below the post-step-1 ceiling', () => {
    const out = execSync(
      `grep -rEo "rgba\\(255,\\s*255,\\s*255" src --include="*.js" --exclude-dir=__tests__ ` +
      `--exclude=changelog-data.js --exclude=changelog-latest.js | wc -l`,
      { cwd: process.cwd(), encoding: 'utf8' }
    );
    const count = parseInt(out.trim(), 10);
    expect(count).toBeLessThanOrEqual(CEILING);
    // This only fails on a RISE above CEILING (a new hardcoded site). It does NOT notice a
    // drop below it (step 2 landing, or a stray site getting cleaned up) -- that's a manual
    // step: when the real count drops, lower CEILING to match rather than leaving slack for
    // the class of bug to regrow into. The whole point of a ratchet is that it only tightens.
  });
});
