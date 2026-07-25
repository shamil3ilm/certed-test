'use client'
import { useEffect } from 'react'
import { markReadAction } from './actions'

/** Marks the conversation read for the caller when the thread opens. */
export function MarkRead({ conversationId }: { conversationId: string }) {
  useEffect(() => {
    void markReadAction(conversationId)
  }, [conversationId])
  return null
}
