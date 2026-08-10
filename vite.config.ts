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
  },
})
