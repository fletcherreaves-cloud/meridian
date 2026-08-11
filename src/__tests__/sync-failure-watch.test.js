// @ts-nocheck
// Guards .github/workflows/sync-failure-watch.yml against going stale.
//
// WHY: the LifeLenz Daily Sync failed for six straight days (2026-08-06 → 08-11) with
// nothing surfacing it, because no scheduled workflow had failure handling. #170 added a
// watcher — but a watcher with a HAND-MAINTAINED list of workflow names is the same class
// of thing as the loader field map that "went stale four times in one day" (CLAUDE.md).
// Add a new auto-pull, forget to list it, and it is unwatched forever. Silently.
//
// So the list is asserted against reality in both directions:
//   • every scheduled workflow is watched   → a new pull can't ship unwatched
//   • every watched name is a real workflow → a typo or a rename can't watch nothing
//
// The second half matters as much as the first: `workflow_run` matches on the workflow's
// `name:` string, so a single mistyped character means that workflow is silently not
// watched, with no error anywhere. That is the original bug wearing a fix.
//
// To deliberately leave a scheduled workflow unwatched, add it to EXEMPT below WITH a
// reason. That keeps the exclusion a visible decision rather than an omission.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DIR = '.github/workflows';
const WATCHER = 'sync-failure-watch.yml';

/** Scheduled workflows intentionally not watched. Key = workflow `name:`, value = why. */
const EXEMPT = {
  // (none today — every scheduled workflow is watched)
};

const read = f => readFileSync(join(DIR, f), 'utf8');
const nameOf = txt => (txt.match(/^name:\s*(.+)$/m)?.[1] || '').trim().replace(/^["']|["']$/g, '');

/** Workflow names listed under the watcher's `workflow_run: workflows:` block. */
function watchedNames() {
  const txt = read(WATCHER);
  // Slice the sequence between `workflows:` and the following `types:` key.
  const block = txt.match(/^\s*workflows:\s*\n([\s\S]*?)^\s*types:/m)?.[1];
  if (!block) throw new Error('could not locate the workflows: list in ' + WATCHER);
  return block
    .split('\n')
    .map(l => l.match(/^\s*-\s*(.+?)\s*$/)?.[1])
    .filter(Boolean)
    .map(s => s.replace(/^["']|["']$/g, ''));
}

/** Every workflow file that runs on a cron, as { file, name }. */
function scheduledWorkflows() {
  return readdirSync(DIR)
    .filter(f => /\.ya?ml$/.test(f) && f !== WATCHER)
    .map(f => ({ file: f, txt: read(f) }))
    .filter(({ txt }) => /^\s*-?\s*cron:/m.test(txt))
    .map(({ file, txt }) => ({ file, name: nameOf(txt) }));
}

describe('sync-failure-watch.yml stays in step with the workflows it watches', () => {
  it('watches every scheduled workflow', () => {
    const watched = new Set(watchedNames());
    const missing = scheduledWorkflows()
      .filter(w => !watched.has(w.name) && !(w.name in EXEMPT))
      .map(w => `${w.file} ("${w.name}")`);

    expect(missing,
      'Scheduled workflow(s) not watched for failure. Add the exact `name:` value to the ' +
      '`workflows:` list in .github/workflows/sync-failure-watch.yml — or to EXEMPT in this ' +
      'test with a reason. An unwatched pull can fail for days with nothing surfacing it.',
    ).toEqual([]);
  });

  it('lists no workflow that does not exist', () => {
    const real = new Set(scheduledWorkflows().map(w => w.name));
    const phantom = watchedNames().filter(n => !real.has(n));

    expect(phantom,
      'sync-failure-watch.yml watches (a) name(s) matching no scheduled workflow. ' +
      '`workflow_run` matches on the exact `name:` string, so this watches nothing and ' +
      'reports nothing. Fix the spelling, or drop the entry if the workflow was removed.',
    ).toEqual([]);
  });

  it('every scheduled workflow declares a name (workflow_run has nothing to match otherwise)', () => {
    const unnamed = scheduledWorkflows().filter(w => !w.name).map(w => w.file);
    expect(unnamed).toEqual([]);
  });

  it('finds a non-trivial number of workflows — guards the parsing itself', () => {
    // If the regexes silently stopped matching, every other assertion here would pass
    // vacuously against two empty lists. Anchor them to a real floor.
    expect(scheduledWorkflows().length).toBeGreaterThanOrEqual(20);
    expect(watchedNames().length).toBeGreaterThanOrEqual(20);
  });
});
