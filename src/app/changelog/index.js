// @ts-nocheck
// R6 (dispatch16, 2026-08-17) — one file per version. The old single changelog-data.js array was
// append-only, but every open PR still appended to the SAME tail position, so any one PR merging
// conflicted every other open PR on that file — five PRs in one morning meant five sequential
// rebases (dispatch15/16). Landing a new version is now "add one new file under this directory",
// never an edit to a line another PR might also be editing — two agents, or two engineers, never
// touch the same lines again.
//
// import.meta.glob({eager:true}) discovers every version file automatically at build time — no
// index to hand-maintain, so there is no shared list to conflict on either. This module has
// exactly ONE importer, changelog-panel.js, itself only reached via lazyPanel()'s dynamic import —
// App.js does NOT import this file (see changelog-latest.js for the small piece it needs
// synchronously). A module reached by both a static and a dynamic import path gets pulled into
// the eager entry chunk regardless of which export is used — same hazard #230 fixed originally.
const modules = import.meta.glob('./[0-9]*.js', { eager: true });

export const MERIDIAN_CHANGELOG = Object.values(modules).map(m => m.default);
