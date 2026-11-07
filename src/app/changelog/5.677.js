// @ts-nocheck
export default {version:'5.677', date:'2026-11-07', changes:[
  '**KB: wired 4 more dangling InfoIcon articles into their real panels (task #75, "judgment-call ' +
  'tier").** Labor Analysis, Forms Library, DAR Daypart Analytics and Product Mix Dashboard all had ' +
  'a real `KB_ARTICLES` entry (`labor_analysis_guide`/`forms_library_guide`/`dar_daypart_guide`/ ' +
  '`product_mix_dashboard_guide`) that no panel actually linked to — the exact dangling-reference ' +
  'bug `launch_planner_guide` had (v5.675), just not yet caught for these four. Also wired ' +
  '`signals_guide` into the Signals panel’s own header, which has a single clean title block ' +
  'despite its many tabs. All five used the same hand-rolled-header workaround Data Manager ' +
  'established in Phase 1 (the icon sits next to the panel’s own title div, since none of these ' +
  'use `RoutePanelShell`).',
]};
