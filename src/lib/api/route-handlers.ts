import type { Profile } from '@/lib/auth/profile'
import type { Capability } from '@/lib/capabilities'
import { requireCapabilityApi } from '@/lib/auth/require-role'
import { ok, created, invalidJson, apiError, authFail } from '@/lib/api/response'

/**
 * Generic REST route-handler factories: a capability-gated CRUD route file becomes
 * a set of one-line bindings, and the auth / JSON-parse / error-envelope
 * boilerplate lives in exactly one place - the same shape finance/handlers.ts uses
 * for its per-kind factories. Every factory gates on `capability` (authFail on
 * rejection); the body factories parse JSON (invalidJson on malformed); and every
 * service call is wrapped so a thrown ServiceError maps through apiError.
 */

/** GET a collection. `list` reads whatever it needs off the request (query params). */
export function listHandler<T>(capability: Capability, list: (request: Request) => Promise<T>) {
  return async function GET(request: Request): Promise<Response> {
    try {
      await requireCapabilityApi(capability)
    } catch (error) {
      return authFail(error)
    }
    try {
      return ok(await list(request))
    } catch (error) {
      return apiError(error)
    }
  }
}

/** POST a new item from a JSON body. Returns 201. */
export function createHandler<T>(capability: Capability, create: (actor: Profile, raw: unknown) => Promise<T>) {
  return async function POST(request: Request): Promise<Response> {
    let actor: Profile
    try {
      actor = await requireCapabilityApi(capability)
    } catch (error) {
      return authFail(error)
    }
    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      return invalidJson()
    }
    try {
      return created(await create(actor, raw))
    } catch (error) {
      return apiError(error)
    }
  }
}

/** PATCH an item by id from a JSON body. Returns 200. */
export function updateHandler<T>(
  capability: Capability,
  update: (actor: Profile, id: string, raw: unknown) => Promise<T>,
) {
  return async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
    let actor: Profile
    try {
      actor = await requireCapabilityApi(capability)
    } catch (error) {
      return authFail(error)
    }
    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      return invalidJson()
    }
    try {
      const { id } = await params
      return ok(await update(actor, id, raw))
    } catch (error) {
      return apiError(error)
    }
  }
}

/** DELETE an item by id. `respond` shapes the 200 body (default `{ id }`); a route
 *  that soft-deletes and wants to return the updated row passes its own shaper. */
export function deleteHandler<T>(
  capability: Capability,
  remove: (actor: Profile, id: string) => Promise<T>,
  respond: (id: string, result: T) => unknown = (id) => ({ id }),
) {
  return async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
    let actor: Profile
    try {
      actor = await requireCapabilityApi(capability)
    } catch (error) {
      return authFail(error)
    }
    try {
      const { id } = await params
      const result = await remove(actor, id)
      return ok(respond(id, result))
    } catch (error) {
      return apiError(error)
    }
  }
}
