import type { Role, Language, SessionMessage } from './types'

export interface NewMessageInput {
  sessionId: string
  senderRole: Role
  sourceLang: Language
  text: string
}

export type Clock = () => number

export function createSessionMessage(
  input: NewMessageInput,
  clock: Clock = Date.now,
): SessionMessage {
  const text = input.text.trim()
  if (text.length === 0) throw new Error('text must not be empty')
  return {
    sessionId: input.sessionId,
    senderRole: input.senderRole,
    sourceLang: input.sourceLang,
    text,
    timestamp: clock(),
  }
}
