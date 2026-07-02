import { useEffect, useRef, useState } from 'react'
import type { ChatLine } from '../transport/useRide'
import { WhisperRecognizer, type WhisperState } from '../adapters/whisper-recognizer'

interface ChatProps {
  messages: ChatLine[]
  lang: string
  onSend: (text: string) => void
}

export function Chat({ messages, lang, onSend }: ChatProps) {
  const [draft, setDraft] = useState('')
  const [micState, setMicState] = useState<WhisperState>('idle')
  const [modelPct, setModelPct] = useState<number | null>(null)
  const [micError, setMicError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())

  const toggleOriginal = (id: number) => {
    setRevealed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const recognizer = useRef<WhisperRecognizer | null>(null)
  const onSendRef = useRef(onSend)
  onSendRef.current = onSend

  // Create the recognizer once and warm the model in the background so it's ready
  // by the time the rider taps the mic (transcription is then just inference).
  useEffect(() => {
    const rec = new WhisperRecognizer(lang, {
      onState: (s) => setMicState(s),
      onProgress: (p) => setModelPct(p >= 100 ? null : p),
      onError: (m) => { setMicError(m); setMicState('idle') },
      onResult: (text) => {
        const t = text.trim()
        if (t.length > 0) { onSendRef.current(t); setDraft('') }
      },
    })
    rec.warm()
    recognizer.current = rec
    return () => { rec.dispose(); recognizer.current = null }
  }, [lang])

  const submit = (text: string) => {
    onSend(text)
    setDraft('')
  }

  const toggleMic = () => {
    setMicError(null)
    const rec = recognizer.current
    if (!rec) return
    if (micState === 'listening') rec.stopRecording()
    else if (micState === 'idle') void rec.startRecording()
    // ignore taps while 'transcribing'
  }

  return (
    <div className="chat">
      <ol className="chat__list" aria-live="polite">
        {messages.length === 0 && <li className="chat__empty">Speak or type — it's translated live.</li>}
        {messages.map((m) => {
          const differs = m.original !== m.translated
          const showing = revealed.has(m.id)
          return (
            <li key={m.id} className={m.mine ? 'bubble bubble--mine' : 'bubble bubble--theirs'}>
              <span className="bubble__text">{m.translated}</span>
              {differs && showing && <span className="bubble__original">{m.original}</span>}
              {differs && (
                <button
                  type="button"
                  className="bubble__toggle"
                  aria-expanded={showing}
                  onClick={() => toggleOriginal(m.id)}
                >
                  {showing ? 'Hide original' : 'Show original'}
                </button>
              )}
            </li>
          )
        })}
      </ol>

      {micState === 'listening' && <p className="mic-note" role="status">Listening… tap the mic again to translate.</p>}
      {micState === 'transcribing' && <p className="mic-note" role="status">Transcribing…</p>}
      {modelPct !== null && micState !== 'listening' && (
        <p className="mic-note mic-note--load" role="status">Preparing voice model… {modelPct}%</p>
      )}
      {micError && <p className="mic-error" role="alert">{micError}</p>}

      <form className="chat__composer" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) submit(draft) }}>
        <button
          type="button"
          className={micState === 'listening' ? 'mic-btn mic-btn--on' : 'mic-btn'}
          aria-pressed={micState === 'listening'}
          aria-label={micState === 'listening' ? 'Stop and translate' : 'Speak'}
          onClick={toggleMic}
          disabled={micState === 'transcribing'}
        >
          {micState === 'listening' ? '■' : micState === 'transcribing' ? '…' : '🎙'}
        </button>
        <input
          className="chat__input"
          aria-label="Message"
          placeholder="Message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn btn--primary btn--sm" disabled={draft.trim().length === 0}>Send</button>
      </form>
    </div>
  )
}
