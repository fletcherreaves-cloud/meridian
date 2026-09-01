# Printable form templates

Blank QSRSoft form templates — the full published Printable Forms Library (Shift
Management, EA Forms, 2026/2025 Operations Forms, People Development, Legacy,
etc.), not just Pre-Shift/Travel Path. Rendered fill-by-hand by the **Printable
Forms** panel (`src/views/forms-print.js`) and interactively, saved to Supabase,
by the **Digital Checklists** panel (`src/views/checklist-fill.js`). These are
reusable templates — **no live/store data**.

Populate/refresh them with the one-time pull (run locally, where QSRSoft egress is
open — the hosted agent environment can't reach `myqsrsoft.com`):

```bash
QSRSOFT_USERNAME=… QSRSOFT_PASSWORD=… node scripts/qsrsoft-forms-pull.mjs
# or, with a pre-captured x-auth-token:
QSRSOFT_FORMS_TOKEN=… node scripts/qsrsoft-forms-pull.mjs
```

It writes one `<slug>.json` per form plus `index.json` (the manifest both panels
load). Default target set (2026-09-01): **every published, non-deleted form** in
the org's library. Narrow a run with `FORMS_IDS` (exact formIds) or `FORMS_MATCH`
(title regex) — e.g. to re-pull just one form after editing it in QSRSoft. Commit
the regenerated JSON when a form changes.
