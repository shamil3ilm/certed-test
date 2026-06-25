export type HostKind = 'app' | 'marketing'

/** Decides whether a request belongs to the app subdomain or the marketing site. */
export function resolveHost(hostHeader: string | null | undefined): HostKind {
  const host = (hostHeader ?? '').toLowerCase().split(':')[0]
  if (host.startsWith('app.')) return 'app'
  if (host === 'localhost' || host === '127.0.0.1') return 'app' // dev default
  return 'marketing'
}
