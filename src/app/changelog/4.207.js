// @ts-nocheck
export default {version:'4.207', date:'2026-06-19', changes:[
  'Fixed runtime crash: GM Coaching Letters threw "userEvents is not defined" — Why Engine cross-wiring (v4.203) referenced userEvents inside buildContext but never added it to the component\'s props or the call site',
  'GMCoachingBrief now correctly receives userEvents — isolated to this one component; DistrictPriorityBrief and LifeLenzBridgePanel were already wired correctly from their original construction',
  'Swept the rest of the codebase for the same pattern (referencing a variable without receiving it as a prop) — no other instances found',
]};
