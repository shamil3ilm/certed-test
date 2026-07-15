import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// React 18.2.0 (the real installed version) doesn't export `cache` — it's a
// Next.js-bundler-only shim, resolved for real under `next dev`/`next build`
// but not under plain Vitest. Stub it globally as an identity wrapper so any
// module using `cache()` (e.g. src/lib/permission/*, src/lib/auth/profile.ts,
// src/lib/repos/classes.ts) is safely importable in tests.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, cache: (fn: unknown) => fn }
})
