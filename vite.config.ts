import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false, // fall back to next available if 5173 is taken
  },
  test: {
    environment: 'node',
    globals: true,
  },
})
