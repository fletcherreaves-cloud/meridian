---
name: project-security-notes
description: "Known security findings in Meridian's dependencies — accepted risk vs needs-fix tracker"
metadata: 
  node_type: memory
  type: project
  originSessionId: 03a011ad-03b5-43f0-a9e8-74a7adf2a7b5
---

## xlsx (SheetJS) — high severity, no fix available (found 2026-07-07)

`npm audit` flags `xlsx` with two high-severity advisories:
- Prototype Pollution — [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)
- ReDoS — [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)

No patched version exists from SheetJS maintainers; `npm audit fix` cannot resolve it.

**Why accepted as low risk for now:** Both advisories require parsing an attacker-crafted spreadsheet. Meridian's xlsx parsing (LifeLenz, QSRSoft, FOB, SMG FullScale, monthly projections) only ever ingests files the user uploads themselves — not files from untrusted third parties.

**How to apply:** Do not spend time chasing this while uploads stay self-service/trusted-user-only. Revisit if Meridian ever accepts file uploads from other people (e.g. other operators, external partners, public-facing upload) — see [[project-backlog]] Beta/Release Mode section, since that's the scenario most likely to introduce untrusted uploads. At that point, either sandbox the parse step or evaluate swapping SheetJS for an alternative library.
