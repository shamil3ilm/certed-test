import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const workspaceRoot = process.cwd()

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: [path.join(workspaceRoot, 'vitest.setup.ts')],
    globals: true,
    passWithNoTests: true,
    // Playwright e2e specs live under tests/e2e and run via `*.pw.ts`; keep them
    // out of the vitest run so a stray *.spec.ts there can't fail the unit suite.
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'html'],
      // Measure the layer unit tests own: business logic under src/lib. React
      // components/pages are exercised by the Playwright e2e suite, not vitest,
      // so including them would measure the wrong thing and mask the lib number.
      include: ['src/lib/**/*.ts'],
      exclude: [
        'src/lib/mock/**', // dev-only fake Supabase, never in production
        'src/**/*.d.ts',
        'src/lib/**/*.test.ts',
      ],
      // Regression ratchet: set ~1-2 points below the current measured level
      // (lines 77.7 / stmts 74.0 / funcs 73.1 / branches 63.8) so the gate holds a
      // real buffer rather than repairing a 1-point margin every feature window.
      // Target is 80% - raise these as coverage grows.
      thresholds: { lines: 76, functions: 72, branches: 62, statements: 73 },
    },
  },
  resolve: {
    alias: {
      '@': path.join(workspaceRoot, 'src'),
      // The real `server-only` throws when imported outside RSC; stub it in tests.
      'server-only': path.join(workspaceRoot, 'tests/stubs/server-only.ts'),
    },
  },
})
