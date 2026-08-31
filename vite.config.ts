import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false, // fall back to next available if 5173 is taken
  },
  build: {
    rollupOptions: {
      output: {
        // xlsx (SheetJS, ~424 KB / ~142 KB gzip) is statically imported by App.js AND
        // dynamically imported elsewhere (calendar.js). Rollup's automatic chunking normally
        // keeps that split out of the entry chunk, but the split is an emergent side effect
        // of the exact set of dynamic-import boundaries elsewhere in the app — adding an
        // unrelated lazy panel (issue #124) flipped the heuristic and silently inlined all
        // ~142 KB gzip of xlsx into the entry, blowing well past the 850 KB gzip budget with
        // no change to xlsx itself. Pin it to its own chunk explicitly so the entry-chunk
        // budget doesn't depend on Rollup's automatic grouping being lucky.
        manualChunks(id) {
          if (id.includes('node_modules/xlsx')) return 'xlsx';
        },
      },
    },
  },
  test: {
    environment: 'node',
    globals: true,
    // .claude/worktrees/** holds per-agent git worktrees (each a full checkout, left in place
    // after the agent finishes so its branch stays inspectable) -- vitest's default exclude list
    // doesn't know about them, so every `npx vitest run` in the main checkout was ALSO discovering
    // and re-running every test file inside every leftover worktree, several dozen full copies of
    // the suite stacked on top of the real one (found 2026-08-31 diagnosing why a routine full-
    // suite run was taking 10x longer than expected and surfacing "ratchet" failures that turned
    // out to be stale worktree snapshots, not the current tree). Vitest's `exclude` OVERRIDES its
    // own defaults rather than extending them, so this list carries vitest's real defaults
    // (https://vitest.dev/config/#exclude) plus the one addition.
    exclude: [
      '**/node_modules/**', '**/dist/**', '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '**/.claude/worktrees/**',
    ],
  },
})
