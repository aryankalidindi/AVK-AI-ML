export type Role = 'driver' | 'rider'

/** BCP-47-ish language code, e.g. 'en', 'id'. */
export type Language = string

export interface Participant {
  readonly role: Role
  readonly language: Language
}

/** A recognized utterance, sent over the wire in the SENDER's language. */
export interface SessionMessage {
  readonly sessionId: string
  readonly senderRole: Role
  readonly sourceLang: Language
  readonly text: string
  readonly timestamp: number
}
