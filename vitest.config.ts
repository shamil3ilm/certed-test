import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    passWithNoTests: true,
    // Playwright e2e specs live under tests/e2e and run via `*.pw.ts`; keep them
    // out of the vitest run so a stray *.spec.ts there can't fail the unit suite.
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // The real `server-only` throws when imported outside RSC; stub it in tests.
      'server-only': path.resolve(__dirname, './tests/stubs/server-only.ts'),
    },
  },
})
