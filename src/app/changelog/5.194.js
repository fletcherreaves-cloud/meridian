// @ts-nocheck
export default {version:'5.194', date:'2026-08-26', changes:[
  'Fixed a second real bug found live right after v5.193: `area_supervisor` already existed in '
  + 'the org-configured role list from before dispatch #148 (at its pre-ladder Level 3), so '
  + '`mergeMissingDefaultRoles()` correctly left it alone -- it wasn\'t missing -- but #148 had '
  + 're-leveled it to 5 as part of the real ladder, so the stale Level 3 silently survived and '
  + 'made Area Supervisor outrank OM (Level 4) in the Roles & Permissions panel -- backwards from '
  + 'the intended AS -> OM -> DO -> VP -> Owner reporting chain. New `reconcileLadderLevels()` '
  + 'corrects just the `level` field for the 7 official ladder role ids to their canonical '
  + '`DEFAULT_ROLES` value (label/color/permissions and any real customization on them are left '
  + 'untouched); `admin`/`manager` are excluded by design, matching dispatch #148\'s explicit '
  + '"kept exactly as it was" decision for those two utility roles.',
]};
