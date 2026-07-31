import { describe, it, expect } from 'vitest'
import { validateUuidField } from '@/lib/validation/id'
import { ValidationError } from '@/lib/errors'

const UUID = '550e8400-e29b-41d4-a716-446655440000'

describe('validateUuidField', () => {
  it('returns a valid uuid, trimming surrounding whitespace', () => {
    expect(validateUuidField(UUID, 'bad')).toBe(UUID)
    expect(validateUuidField(`  ${UUID}  `, 'bad')).toBe(UUID)
  })

  it('throws ValidationError(message) for missing or malformed input', () => {
    expect(() => validateUuidField(undefined, 'Missing id')).toThrow(ValidationError)
    expect(() => validateUuidField(null, 'Missing id')).toThrow(ValidationError)
    expect(() => validateUuidField('', 'Missing id')).toThrow('Missing id')
    expect(() => validateUuidField('not-a-uuid', 'Bad id')).toThrow('Bad id')
  })
})
