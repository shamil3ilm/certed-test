import { describe, it, expect } from 'vitest'
import { GENERIC_ERROR_MESSAGE } from '@/lib/api/messages'
import { ERROR_CODES } from '@/lib/api/error-codes'
import { ServiceError, PermissionError, NotFoundError, ValidationError } from '@/lib/errors'
import { apiError } from '@/lib/api/response'
import { toActionError } from '@/lib/api/action-error'

describe('typed service errors', () => {
  it('map to their documented status codes', () => {
    expect(new PermissionError().status).toBe(403)
    expect(new NotFoundError().status).toBe(404)
    expect(new ValidationError().status).toBe(422)
  })

  it('are instances of ServiceError (and Error)', () => {
    expect(new PermissionError()).toBeInstanceOf(ServiceError)
    expect(new PermissionError()).toBeInstanceOf(Error)
  })
})

describe('apiError', () => {
  it('maps a ServiceError to its own status + message', async () => {
    const res = apiError(new NotFoundError('resource not found'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('resource not found')
    expect(body.code).toBe(ERROR_CODES.notFound)
  })

  it('falls through to authFail for the existing coded auth errors', async () => {
    const res = apiError(new Error('forbidden'))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe(ERROR_CODES.forbidden)
  })

  it('never leaks an unknown error message — generic 500', async () => {
    const res = apiError(new Error('duplicate key value violates unique constraint "receipts_number_key"'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe(GENERIC_ERROR_MESSAGE)
    expect(body.code).toBe(ERROR_CODES.internalError)
    expect(body.error).not.toContain('receipts_number_key')
  })
})

describe('toActionError', () => {
  it('surfaces a ServiceError message', () => {
    expect(toActionError(new ValidationError('title is required'))).toEqual({
      ok: false,
      error: 'title is required',
      code: ERROR_CODES.invalidInput,
    })
  })

  it('never leaks an unknown error message', () => {
    const result = toActionError(new Error('pg: relation "foo" does not exist'))
    if (result.ok) throw new Error('expected ok:false')
    expect(result.error).toBe(GENERIC_ERROR_MESSAGE)
    expect(result.error).not.toContain('foo')
  })
})
