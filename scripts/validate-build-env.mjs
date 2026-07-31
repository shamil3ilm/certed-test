const requiredWhenNotMock = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']

function isTruthy(value) {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized !== '0' && normalized !== 'false' && normalized !== 'off'
}

const mockMode = isTruthy(process.env.MOCK_MODE)
const enforceBuildEnv = isTruthy(process.env.VERCEL) || isTruthy(process.env.CI)
const missing = requiredWhenNotMock.filter((name) => !(process.env[name] ?? '').trim())

if (enforceBuildEnv && !mockMode && missing.length > 0) {
  throw new Error(
    `Build blocked: missing required public environment variable${missing.length > 1 ? 's' : ''} ` +
      `${missing.join(', ')}. These NEXT_PUBLIC_* values must be present at build time before deploying.`,
  )
}
