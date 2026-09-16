---
name: project-printable-forms-expansion
description: "Printable Forms — scored-option badges + self-serve form-pull request (Task #59)"
metadata:
  node_type: memory
  type: project
---

## Printable Forms expansion (v5.449)

Backlog item (`memory/backlog-open-2026-09-06.md` §Printable Forms): *"extend from 8 pinned
forms to the full ~60-form QSRSoft library (pull-filter widen + scored-form field renderers +
self-serve 'add form' button)."* Three sub-items — status before this dispatch, per a live
background audit (2026-09-16):

1. **Pull-filter widen — ALREADY DONE, before this task.** `scripts/qsrsoft-forms-pull.mjs`'s own
   header: *"Owner-requested 2026-09-01: widened from the original 8-form Pre-Shift/Travel-Path-
   only default to the FULL published library."* `public/forms/` already held 53 captured forms
   across many categories (not just Pre-Shift/Travel Path) before this dispatch touched anything.
   `src/views/forms-print.js` already rendered whatever's in `public/forms/index.json` generically.
   **Do not re-do this** — only the other two sub-items were genuinely open.

2. **Scored-form field renderers — shipped this dispatch.** The audit found real point-weighted
   and percentage-banded rubric options across 28 of 53 forms (e.g.
   `general-manager-weekly-scorecard.json`, `peak-shift-performance-verification-tool.json`,
   `cash-audit.json`) — option text like `'135" or less - 8 pts'` or
   `'OUTSTANDING  21-30 POINTS / 70% - 100%'` — that rendered as a plain, unweighted circle-and-
   label row, indistinguishable from a bare Yes/No option.
   - `src/engine/forms-model.js`'s `parseOptionBadge(text)` — pure regex extraction of an embedded
     point value/range (`8 pts`, `21-30 points`, `23+ points`) and/or percent value/range
     (`70%`, `70%-100%`) from an option's raw text. `formatOptionBadge(badge)` renders it as a
     short string (`'21-30 pts · 70-100%'`).
   - **Deliberately does NOT classify an option as good/bad/pass/fail, or compute a total score.**
     Inferring which named tier in a multi-band scale (is "GOOD" the 3rd-best of 4 bands, or a
     simple positive?) is a judgment call this function has no reliable way to make from text
     alone, and a wrong good/bad color on a form a manager relies on would be worse than showing
     nothing. It only echoes the numeric value QSRSoft's own option text already states.
   - Wired into all 4 render surfaces that show `check`-kind options: `forms-model.js`'s
     `styledItem`/`renderItemRow` (the two print-HTML builders — colored QSRSoft-style and
     compact black-on-white), `forms-print.js`'s `PreviewItem` (on-screen preview), and
     `checklist-fill.js`'s `FillItem` (the digital-fill workflow).
   - 10 tests (`src/__tests__/forms-model-option-badge.test.js`) against the exact real option
     strings the audit found, plus confirming the badge reaches the actual `buildFormPrintHTML`
     output (both style variants), not just the pure parser.

3. **Self-serve "add form" button — shipped this dispatch.** The audit confirmed no in-app
   affordance existed anywhere — adding/refreshing a form required running
   `scripts/qsrsoft-forms-pull.mjs` locally (QSRSoft credentials + Playwright) and committing
   `public/forms/*.json` by hand.
   - Reused the **existing** on-demand-sync mechanism (`supabase.js`'s `triggerSync`, backed by
     the `trigger-dar-sync` Edge Function) that Data Manager's DAR/eBOS/FOB/LifeLenz sync buttons
     already use — not a new mechanism. `.github/workflows/qsrsoft-forms-pull.yml` already
     supported `workflow_dispatch` with a `forms_match` title-regex input; it just had no
     Edge-Function entry.
   - `supabase/functions/trigger-dar-sync/index.ts`: added a `forms` entry to the `WORKFLOWS`
     allowlist (`file: 'qsrsoft-forms-pull.yml'`, inputs `forms_ids`/`forms_match`/`debug`
     matching the workflow's own declared inputs exactly).
   - `src/views/forms-print.js`'s `FormsPrintPanel`: added a title search box (also a genuine UX
     win on its own — filters the 53-form list) and a **"🔄 Request pull"** button that calls
     `triggerSync('forms', { forms_match: <escaped query> })` (or `{}` for "every form" when the
     search box is empty). Shows the dispatch result (success message or error) inline. Also
     converted the panel's hand-rolled backdrop to `ModalShell` while already deep in this file
     (panel-contract opportunistic check, CLAUDE.md's Dev Rules).
   - **✅ Deployed (owner-confirmed 2026-09-16) — `supabase functions deploy trigger-dar-sync`
     has been run.** "Request pull" is live; do not re-raise this as a blocker.
   - 7 tests (`src/__tests__/forms-print-self-serve.test.js`) rendering the real `FormsPrintPanel`
     consumer: search filtering, the no-match → request-pull prompt, the actual `triggerSync`
     call shape (including regex-escaping the query), success/error message display, and the
     empty-query "all forms" default.

**What's still genuinely open, not attempted here:** a numeric score TOTAL/rollup computation
(deliberately out of scope — see point 2 above on why); an exact-`formId` request path (the
`forms_ids` input is wired server-side but the UI only offers a title-match search, which is
what a self-serve user would actually have); admin-visible history of past pull requests.
