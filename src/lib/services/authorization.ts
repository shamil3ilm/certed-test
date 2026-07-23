import 'server-only'
import { resolveCapabilities, type Capability, type ResolvedCapabilitySet } from '@/lib/capabilities'
import { loadActivePersonas } from '@/lib/permission/personas'
import { getCapabilityOverrides } from '@/lib/services/capability-overrides'
import { PermissionError } from '@/lib/errors'

/**
 * Capability checks for a profile INSIDE a service, honouring admin overrides.
 *
 * requireCapability/requireCapabilityApi (lib/auth/require-role) are transport
 * guards: they read the current request's actor context and redirect or throw a
 * coded error. A domain function needs the same decision without that coupling -
 * hence this, which resolves persona baseline + overrides for a given profile.
 *
 * Lives in services (not lib/permission) because it depends on the
 * capability-override service, which itself depends on lib/permission - putting it
 * there would create an import cycle.
 */
export async function resolveActorCapabilities(profileId: string): Promise<ResolvedCapabilitySet> {
  const [personas, overrides] = await Promise.all([loadActivePersonas(profileId), getCapabilityOverrides(profileId)])
  return resolveCapabilities({ personas, overrides })
}

export async function actorHasCapability(profileId: string, capability: Capability): Promise<boolean> {
  return (await resolveActorCapabilities(profileId)).allowed.has(capability)
}

/** Throw unless the profile holds the capability (baseline or override-granted). */
export async function requireActorCapability(
  profileId: string,
  capability: Capability,
  message?: string,
): Promise<void> {
  if (!(await actorHasCapability(profileId, capability))) {
    throw new PermissionError(message ?? 'You are not allowed to do that.')
  }
}
