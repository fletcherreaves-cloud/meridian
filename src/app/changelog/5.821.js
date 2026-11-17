// @ts-nocheck
export default {version:'5.821', date:'2026-11-17', changes:[
  '**Added "Rooftop" as a floor-plan area** (owner request) — rooftop equipment (remote ' +
  'condensers, exhaust fans, HVAC units, already real catalog types) had nowhere to be logically ' +
  'placed among the interior floor areas. Added to `PLACEMENTS` ' +
  '(`src/engine/equipment-survey.js`, the single source of truth for both the crew walkthrough ' +
  'form\'s dropdown and the Layout Planner\'s floor-plan grid) and to the Layout Planner\'s own ' +
  'zone grid as a full-width row below the interior floor plan.',
]};
