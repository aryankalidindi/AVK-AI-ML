import type { Participant } from '../session/types'

export interface PipelineContext {
  /** The local participant receiving/translating the message. */
  recipient: Participant
}

export interface Transform {
  apply(text: string, ctx: PipelineContext): Promise<string>
}
