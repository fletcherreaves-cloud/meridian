---
name: feedback-verification-in-sandbox
description: "What CAN and CANNOT be verified from a Claude Code sandbox session — the working Playwright/Chromium recipe, the CORS hard stop, and the merge-resolution class the test suite does not catch. Read before claiming a UI change is verified, or before reporting that browser verification is impossible."
metadata:
  node_type: memory
  type: feedback
---

# What can actually be verified from a sandbox session

Written 2026-08-10 after a full day of PR review, because two claims made that day were
wrong in opposite directions: one session reported browser verification as impossible when
it was only half-impossible, and the PM reported a merge as clean when the test suite was
passing over resurrected code.

## Browser verification — the working recipe

**"Browser verification is impossible in this sandbox" is FALSE.** The app boots and renders
its full nav in the sandbox's Chromium. Two separate obstacles get conflated:

### 1. Playwright build mismatch — fixable, not a blocker

The repo's Playwright wants a browser build the sandbox doesn't ship (2026-08-10: repo wanted
`1228`, sandbox had `1194`). A default `chromium.launch()` fails with *"Executable doesn't
exist at /opt/pw-browsers/chromium_headless_shell-1228/…"* and a "run npx playwright install"
banner. **Do not run `npx playwright install`** — pass the path instead:

```js
import { chromium } from 'playwright';
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',  // check the real dir
  args: ['--no-sandbox', '--no-proxy-server', '--ignore-certificate-errors'],
});
const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1500, height: 950 } });
```

`ls /opt/pw-browsers` to get the actual build number — don't hard-code `1194`.
`--ignore-certificate-errors` / `ignoreHTTPSErrors` clears the `ERR_CERT_AUTHORITY_INVALID`
flood from the agent proxy's CA; without it the console fills with noise that looks like an
app failure and isn't.

**The script must live in the repo root**, not the scratchpad — `playwright` resolves from
`node_modules` and an ESM import from `/tmp` fails with `ERR_MODULE_NOT_FOUND`.

Serve the build and drive it:
```
npm run build && npx --yes serve -s dist -l 4173
# then page.goto('http://localhost:4173/')
```

### 1b. Serve `dist`. NEVER the dev server. (2026-08-15)

This line of the recipe is not a stylistic preference and skipping it produces a **false
negative that looks exactly like a sandbox limitation.** Three PR bodies (#295/#298, #301)
independently reported that "`meridian.css` never attaches as a real stylesheet, so every CSS
custom property reads empty regardless of theme" and downgraded their verification to a
token-mechanism argument on the strength of it. That limitation does not exist. All three used
`npm run dev`, where Vite injects CSS through JS — so `document.styleSheets` has no
`meridian.css` entry and every `getPropertyValue('--bdr')` returns `''`.

Against the built `dist`, measured the same day: **one stylesheet, 241 rules**, `href`
`/assets/index-*.css`, every `html[data-theme][data-mode]` block present, and all of
`--bdr`/`--bdr2`/`--surf2` resolving to real values in all 4 theme families × 2 modes. The
built `index.html` carries a genuine `<link rel="stylesheet">`; the dev server does not.

If you find yourself about to write "CSS custom properties can't be verified here," you are on
the dev server. Rebuild and re-serve before believing it.

### 1c. Resolve colours through canvas pixels, not string parsing

Theme tokens are a mix of hex (`#c8d8e8`) and `oklch()` (the `command` dark family), and
`getComputedStyle` hands each back in its authored notation. A regex that scrapes digits out of
those strings silently returns garbage for both — `#ddd0a0` yields `[0, 0]` and every derived
contrast ratio comes out `NaN`. Paint the colour instead and read the pixel back; the browser
does the conversion and every format measures identically:

```js
const cv = document.createElement('canvas'); cv.width = cv.height = 4;
const g = cv.getContext('2d', { willReadFrequently: true });
const px = (color, backdrop) => {            // backdrop set first => alpha composites for real
  g.clearRect(0, 0, 4, 4);
  if (backdrop) { g.fillStyle = backdrop; g.fillRect(0, 0, 4, 4); }
  g.fillStyle = color; g.fillRect(0, 0, 4, 4);
  const d = g.getImageData(2, 2, 1, 1).data;
  return [d[0], d[1], d[2]];
};
```

Painting an `rgba()` over its real backdrop is also what turns "this looks low-contrast" into a
number: it is how #295's ring guides were shown to composite to **exactly `(255,255,255)` on
`(255,255,255)`** — contrast 1.000, the same pixel — in the `command` and `dualbrand` light
themes, rather than merely being hard to see. Read the token through a real element
(`el.style.stroke = 'var(--bdr)'`) so the CSSOM path React uses is the one under test.

### 2. CORS — a genuine hard stop

Every Supabase call from `http://localhost:4173` fails preflight; the origin is not
allowlisted. **No browser flag fixes this.** No session, no data, so anything behind a nav
click or an auth gate cannot be opened.

### So the honest split

| Verification | Possible? |
|---|---|
| App boots, module graph resolves, no render-time crash | ✅ yes |
| Nav renders, static chrome renders | ✅ yes |
| A panel opened by clicking, with real data | ❌ no (needs auth) |
| Visual/interaction fidelity of a migrated panel | ❌ no — needs the owner |

**Do the boot-and-render pass anyway on UI changes.** It catches module-level and
render-time crashes, which is the failure mode that would otherwise reach production. Then
name the specific thing the owner must click, rather than saying "unverified."

## Merge resolution — the class the test suite does not catch

On 2026-08-10 two PRs each deleted a different orphaned panel out of the same lists
(`ORPHANS`, an `export {…}` line, `App.js`, a memory doc). Resolving keep-both on the export
line produced duplicate exports **and resurrected the entire 61-line component one PR existed
to delete**.

**1148 then 1165 tests passed the whole time. The build failed with 7 duplicate-export
errors.** For deletion-heavy merges the build is the gate, not the suite — a test suite that
never imported the dead component cannot notice it came back.

Rules that follow:

- **`npm run build` is mandatory on any merge resolution**, even when the suite is green.
  `npm run build` swallows the detail — run `npx vite build` to see the actual errors.
- **Keep-both is wrong for export lists, import lists, and any enumerated set.** Those need
  the *union of the deletions*, not the union of the lines.
- **Audit both directions before committing a resolution:**
  ```
  git diff --cached origin/main --stat        # should equal exactly the incoming PR's file set
  git diff --cached origin/<pr-branch> --stat # should equal exactly what main added since
  ```
  Anything outside those two sets is something you invented or destroyed.
- Grep for the thing that was supposed to disappear (`grep -c "<DeletedComponent>"`). Zero is
  the expected answer, and it takes one command.

## Two more traps from the same day

- **A passing verify query is not evidence a thing is needed.** A superseded rollup view
  returned correct numbers on a single-day verify while being unusable at the 60-day window it
  existed to serve. Full write-up in `rls-table-audit-119.md`.
- **Before fixing a thing, confirm the thing is still used.** `grep -rn "<name>" src/ scripts/`
  is cheaper than any fix and would have ended that same investigation in seconds.
