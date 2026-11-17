// @ts-nocheck
// Guards App.js's ?quickupload=1 wiring (the pinned, low-chrome mobile upload screen — see
// src/views/quick-upload-view.js's own header). App.js is far too large/dependency-heavy to
// mount in full for a behavioral test here (AuthGate, Supabase, dozens of lazy panels), so this
// checks the real source for the three facts that make the feature work: the query param is
// actually read, handleFiles/loadMsg are actually threaded into the view (not a stub), and the
// early return happens before the main dashboard tree renders (so quick-upload mode really
// replaces the dashboard rather than rendering alongside it).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const src = fs.readFileSync('src/app/App.js', 'utf8');

describe('App.js ?quickupload=1 wiring', () => {
  it('imports QuickUploadView', () => {
    expect(src).toMatch(/import\s*\{\s*QuickUploadView\s*\}\s*from\s*['"]\.\.\/views\/quick-upload-view\.js['"]/);
  });

  it('reads the quickupload query param', () => {
    expect(src).toMatch(/get\(['"]quickupload['"]\)\s*===\s*['"]1['"]/);
  });

  it('passes the real handleFiles + loadMsg into QuickUploadView, not stubs', () => {
    const block = src.match(/if \(quickUploadMode\) \{[\s\S]*?\n {2}\}/)?.[0];
    expect(block, 'could not find the quickUploadMode early-return block').toBeTruthy();
    expect(block).toMatch(/onFiles:\s*handleFiles/);
    expect(block).toMatch(/loadMsg,/);
    expect(block).toMatch(/UploadSummaryModal/);
  });

  it('the quickUploadMode early return comes before the main dashboard return', () => {
    const earlyReturnIdx = src.indexOf('if (quickUploadMode) {');
    const mainReturnIdx = src.indexOf("return div({className:'mf-app-root'");
    expect(earlyReturnIdx).toBeGreaterThan(-1);
    expect(mainReturnIdx).toBeGreaterThan(-1);
    expect(earlyReturnIdx).toBeLessThan(mainReturnIdx);
  });
});
