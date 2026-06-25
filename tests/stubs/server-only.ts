// Test-only stub: the real `server-only` package throws when imported outside a
// React Server Component. In unit tests we import server modules directly, so we
// alias `server-only` to this no-op (see vitest.config.ts). Production is unaffected.
export {}
