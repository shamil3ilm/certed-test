import {
  NotFoundError,
  PermissionError,
  RateLimitError,
  type ServiceError,
  ValidationError,
} from '@/lib/errors'

export const ERROR_CODES = {
  unauthorized: 'UNAUTHORIZED',
  forbidden: 'FORBIDDEN',
  revoked: 'ACCESS_REVOKED',
  noAccess: 'NO_ACCESS',
  notFound: 'NOT_FOUND',
  invalidRequest: 'INVALID_REQUEST',
  invalidInput: 'INVALID_INPUT',
  rateLimited: 'RATE_LIMITED',
  internalError: 'INTERNAL_ERROR',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export function codeForAuthMessage(message: string): ErrorCode {
  if (message === 'forbidden') return ERROR_CODES.forbidden
  if (message === 'revoked') return ERROR_CODES.revoked
  if (message === 'no-access') return ERROR_CODES.noAccess
  return ERROR_CODES.unauthorized
}

export function codeForServiceError(error: ServiceError): ErrorCode {
  if (error instanceof ValidationError) return ERROR_CODES.invalidInput
  if (error instanceof PermissionError) return ERROR_CODES.forbidden
  if (error instanceof NotFoundError) return ERROR_CODES.notFound
  if (error instanceof RateLimitError) return ERROR_CODES.rateLimited
  return ERROR_CODES.internalError
}
