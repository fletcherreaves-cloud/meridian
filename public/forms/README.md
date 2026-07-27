# Printable form templates

Blank, fill-by-hand QSRSoft Shift-Management forms rendered by the **Printable
Forms** panel (`src/views/forms-print.js`). These are reusable templates — **no
live/store data**.

Populate/refresh them with the one-time pull (run locally, where QSRSoft egress is
open — the hosted agent environment can't reach `myqsrsoft.com`):

```bash
QSRSOFT_USERNAME=… QSRSOFT_PASSWORD=… node scripts/qsrsoft-forms-pull.mjs
# or, with a pre-captured x-auth-token:
QSRSOFT_FORMS_TOKEN=… node scripts/qsrsoft-forms-pull.mjs
```

It writes one `<slug>.json` per form plus `index.json` (the manifest the panel
loads). Default target set: the 6 daypart Pre-Shift Checklists (with + without
Playland) and the 2 Travel Path checklists. Override with `FORMS_IDS` or
`FORMS_MATCH`. Commit the regenerated JSON when a form changes in QSRSoft.
