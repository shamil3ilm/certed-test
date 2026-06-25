import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // The real `server-only` throws when imported outside RSC; stub it in tests.
      'server-only': path.resolve(__dirname, './tests/stubs/server-only.ts'),
    },
  },
})
