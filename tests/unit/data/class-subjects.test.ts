import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { callCreateStudentSubjectClass, callSetClassSubjectWhenUnset } from '@/lib/data/class-subjects'

/**
 * Giving a class a subject is ONE transaction in Postgres (0107): the duplicate check, the
 * writes, and the lock that serialises them for a student. These callers own the only thing
 * left in TypeScript - turning the function's refusals into typed results, so a service never
 * string-matches a database message and an unexpected failure still throws.
 */

function rpcReturns(result: { data: unknown; error: { message: string } | null }) {
  const client = makeClient({ data: null, error: null }, result as never)
  vi.mocked(createAdminClient).mockReturnValue(client as never)
  return client
}

beforeEach(() => vi.resetAllMocks())

describe('callCreateStudentSubjectClass', () => {
  it('creates the class and enrolment in one call, and returns the class', async () => {
    const created = { id: 'c-new', name: 'Sara Student - Physics', status: 'active', subject_id: 'sub-1' }
    const client = rpcReturns({ data: created, error: null })

    const result = await callCreateStudentSubjectClass('stu-1', 'sub-1', 'Sara Student - Physics')

    expect(result).toEqual({ ok: true, class: created })
    expect(client.rpc).toHaveBeenCalledWith('create_student_subject_class', {
      p_student_id: 'stu-1',
      p_subject_id: 'sub-1',
      p_name: 'Sara Student - Physics',
    })
  })

  it('turns the duplicate refusal into a typed result rather than an error', async () => {
    rpcReturns({ data: null, error: { message: 'subject_already_taken' } })
    expect(await callCreateStudentSubjectClass('stu-1', 'sub-1', 'x')).toEqual({
      ok: false,
      reason: 'subject_already_taken',
    })
  })

  it('throws any other failure, namespaced, instead of reporting it as a refusal', async () => {
    rpcReturns({ data: null, error: { message: 'connection reset' } })
    await expect(callCreateStudentSubjectClass('stu-1', 'sub-1', 'x')).rejects.toThrow(
      /classSubjects.createStudentClass: connection reset/,
    )
  })
})

describe('callSetClassSubjectWhenUnset', () => {
  it('returns how many sessions it labelled in the same transaction', async () => {
    const client = rpcReturns({ data: 3, error: null })

    expect(await callSetClassSubjectWhenUnset('class-1', 'sub-1')).toEqual({ ok: true, sessionsLabelled: 3 })
    expect(client.rpc).toHaveBeenCalledWith('set_class_subject_when_unset', {
      p_class_id: 'class-1',
      p_subject_id: 'sub-1',
    })
  })

  it.each(['subject_already_set', 'subject_already_taken'] as const)(
    'reports the %s refusal as a typed result',
    async (reason) => {
      rpcReturns({ data: null, error: { message: reason } })
      expect(await callSetClassSubjectWhenUnset('class-1', 'sub-1')).toEqual({ ok: false, reason })
    },
  )

  it('throws any other failure', async () => {
    rpcReturns({ data: null, error: { message: 'deadlock detected' } })
    await expect(callSetClassSubjectWhenUnset('class-1', 'sub-1')).rejects.toThrow(
      /classSubjects.setWhenUnset: deadlock detected/,
    )
  })
})
