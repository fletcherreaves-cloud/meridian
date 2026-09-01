// @ts-nocheck
export default {version:'5.314', date:'2026-09-01', changes:[
  'Digital Checklists -- a fillable, cloud-saved version of the QSRSoft Printable Forms Library. ' +
  'Owner: pull every form and build "an actual in-app fillable checklist panel (replaces paper ' +
  'pre-shift/cleanliness checklists with a real Meridian workflow, saved to Supabase)" -- distinct ' +
  'from the existing print-only blanks in the Printable Forms panel, which is unchanged.',
  'scripts/qsrsoft-forms-pull.mjs\'s default target widened from an 8-form Pre-Shift/Travel-Path ' +
  'regex to every published, non-deleted form in the library -- confirmed against a live ~50-form ' +
  'catalog the owner pasted mid-session (Shift Management, EA Forms, 2026/2025 Operations Forms, ' +
  'People Development, Legacy). FORMS_IDS/FORMS_MATCH still narrow a run when only one form needs ' +
  're-pulling after an edit.',
  'One generic renderer (src/views/checklist-fill.js) drives every form via the existing ' +
  'normalizeForm() item shape (check/field/text) -- zero per-form UI, same "app-wide, zero ' +
  'per-consumer wiring" design as the v5.313 screenshot Share button. New Supabase table ' +
  'qsr_checklist_submissions (one row per store/form/business-date, tenant_id + RLS from day ' +
  'one). Registered route:true from day one (33 of 94 panels now URL-addressable) and lazy-loaded.',
]};
