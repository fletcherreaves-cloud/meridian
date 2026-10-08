// @ts-nocheck
export default {version:'5.505', date:'2026-10-08', changes:[
  'Fixed the in-app version being stuck at v5.500 despite v5.501-v5.504 having already merged ' +
  '(owner-reported). Root cause: MERIDIAN_VERSION is derived from changelog-latest.js, generated ' +
  'from the highest-numbered file under src/app/changelog/ -- four PRs in a row used v5.50X in ' +
  'their commit message/PR title but never added the matching src/app/changelog/5.50X.js entry ' +
  'file or ran the regen script, so the real versioning mechanism never moved. Added the 4 ' +
  'missing entries and regenerated changelog-latest.js.',
]};
