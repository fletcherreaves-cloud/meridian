// @ts-nocheck
// Guards against #296's regression class re-growing: a hardcoded rgba(255,255,255,X) border,
// stroke, background, or color bypasses meridian.css's --bdr/--bdr2/--surf/--surf2/--surf3
// tokens (defined in every one of the 8 [data-theme][data-mode] blocks). Every one of the 427
// sites #296 measured renders wrong in the light themes -- some invisible (border/stroke, the
// #295 bug class), the rest low-contrast. 1135+ sites already use the token system correctly;
// these are stragglers that predate or bypassed it. Without a ratcheting ceiling this regrows
// silently -- the Bullseye tile (#274/#282) was written well AFTER the tokens existed and AFTER
// 1135 sites had already adopted them, and still shipped three invisible rings (#295).
//
// #296 step 1 (this commit) converts the border/stroke-role sites -- the ones that vanish
// rather than merely low-contrast -- from 202 down to (mostly) zero; step 2 will do the
// remaining background/color sites. The ceiling below is the MEASURED count immediately after
// step 1 landed, not a round number -- ratchet it down again when step 2 ships, per CLAUDE.md's
// "measure it, don't reason about it" rule. Never raise it without a real reason recorded here.
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

// Measured immediately after #296 step 1 (2026-08-15): 269 remaining rgba(255,255,255,X)
// occurrences in src/**/*.js -- almost entirely background/color-role (step 2's scope) plus a
// handful of standalone-HTML-export sites that must stay literal (see header). Any number
// ABOVE this means something new landed without going through the token system.
//
// Excludes __tests__ (this file's own descriptive prose would otherwise match its own guard)
// and the two changelog files (changelog-data.js / changelog-latest.js -- their entries
// describe fixes like this one in prose, which legitimately contains the literal string being
// grepped for; historical/descriptive text, not live style code -- same reasoning #286 used to
// exclude changelog mentions from its own hex-token sweep).
const CEILING = 269;

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
