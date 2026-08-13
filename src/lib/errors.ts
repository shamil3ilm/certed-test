/**
 * Typed errors a service function throws instead of silently returning
 * null/undefined. Callers (Server Actions / Route Handlers) map these to a
 * response via `apiError`/`toActionError` (src/lib/api/*). Coexists with the
 * existing coded auth errors ('no-access' | 'revoked' | 'forbidden') thrown
 * by requireRole/requireRoleApi - this does not replace those.
 */
export class ServiceError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ServiceError'
    this.status = status
  }
}

export class PermissionError extends ServiceError {
  constructor(message = 'Not authorized for this action.') {
    super(message, 403)
    this.name = 'PermissionError'
  }
}

export class NotFoundError extends ServiceError {
  constructor(message = 'Not found.') {
    super(message, 404)
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends ServiceError {
  constructor(message = 'Invalid input.') {
    super(message, 422)
    this.name = 'ValidationError'
  }
}

export class RateLimitError extends ServiceError {
  constructor(message = 'Too many requests. Please slow down and try again.') {
    super(message, 429)
    this.name = 'RateLimitError'
  }
}

/**
 * A dependency needed for this action is not provisioned yet (e.g. custodial file
 * storage before its GOOGLE_DRIVE_* credentials or migrations are in place). 503,
 * so a caller gets a friendly "try again later" rather than a raw 500 that reads
 * like a code bug.
 */
export class StorageUnavailableError extends ServiceError {
  constructor(message = 'File storage is not available right now. Please try again later.') {
    super(message, 503)
    this.name = 'StorageUnavailableError'
  }
}
