import { useCallback, useEffect, useRef, useState } from 'react'
import type { Role, RideDetails, RidePhase, RideView, PartnerView, ServerMessage } from '@rst/core'
import { translateMessage } from '../lib/translation'
import { speechCode } from '../lib/languages'
import { WebSpeechSynthesizer } from '../adapters/web-speech'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'ws://localhost:8787'

export type RideState =
  | 'idle' | 'booking' | 'searching' | 'online' | 'offered'
  | 'in-ride' | 'completed' | 'cancelled' | 'ended'

export interface ChatLine {
  id: number
  original: string
  translated: string
  fromRole: Role
  mine: boolean
  ts: number
}
export interface Offer { details: RideDetails; rider: PartnerView }

export interface RideApi {
  state: RideState
  role: Role | null
  lang: string
  ride: RideView | null
  offer: Offer | null
  messages: ChatLine[]
  endedReason: string | null
  chooseRole: (role: Role, lang: string) => void
  requestRide: (details: RideDetails) => void
  accept: () => void
  decline: () => void
  advance: (phase: RidePhase) => void
  cancel: () => void
  sendChat: (text: string) => void
  reset: () => void
}

export function useRide(): RideApi {
  const ws = useRef<WebSocket | null>(null)
  const nextId = useRef(0)
  const roleRef = useRef<Role | null>(null)
  const langRef = useRef<string>('en')
  const synth = useRef(
    typeof window !== 'undefined' && 'speechSynthesis' in window ? new WebSpeechSynthesizer() : null,
  )
  const historyRef = useRef<{ role: Role; text: string }[]>([])
  const [state, setState] = useState<RideState>('idle')
  const [role, setRole] = useState<Role | null>(null)
  const [lang, setLang] = useState('en')
  const [ride, setRide] = useState<RideView | null>(null)
  const [offer, setOffer] = useState<Offer | null>(null)
  const [messages, setMessages] = useState<ChatLine[]>([])
  const [endedReason, setEndedReason] = useState<string | null>(null)

  const closeSocket = useCallback(() => { ws.current?.close(); ws.current = null }, [])

  const pushHistory = (r: Role, text: string) => {
    historyRef.current = [...historyRef.current, { role: r, text }].slice(-6)
  }

  const receiveChat = useCallback((text: string, sourceLang: string, fromRole: Role) => {
    const id = nextId.current++
    const context = historyRef.current.slice(-6) // turns before this one, for disambiguation
    // Show the original immediately, then refine with the translation.
    setMessages((prev) => [...prev, { id, original: text, translated: text, fromRole, mine: false, ts: Date.now() }])
    void translateMessage(text, sourceLang, langRef.current, context).then((translated) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, translated } : m)))
      void synth.current?.speak(translated, speechCode(langRef.current)).catch(() => {})
    })
    pushHistory(fromRole, text)
  }, [])

  const handle = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'waiting': setState('searching'); break
      case 'offer': setOffer({ details: msg.details, rider: msg.rider }); setState('offered'); break
      case 'offer-withdrawn': setOffer(null); setState('online'); break
      case 'matched': setOffer(null); setRide(msg.ride); setState('in-ride'); break
      case 'phase':
        setRide((prev) => (prev ? { ...prev, phase: msg.phase } : prev))
        if (msg.phase === 'completed') setState('completed')
        else if (msg.phase === 'cancelled') setState('cancelled')
        break
      case 'chat': receiveChat(msg.text, msg.sourceLang, msg.fromRole); break
      case 'ride-ended': setEndedReason(msg.reason); setState('ended'); break
    }
  }, [receiveChat])

  const connect = useCallback((onOpen: () => void) => {
    const socket = new WebSocket(RELAY_URL)
    ws.current = socket
    socket.onmessage = (e) => handle(JSON.parse(e.data) as ServerMessage)
    socket.onclose = () => setState((s) => (s === 'in-ride' ? 'ended' : s))
    socket.onopen = onOpen
  }, [handle])

  const chooseRole = useCallback((selected: Role, selectedLang: string) => {
    setRole(selected)
    roleRef.current = selected
    setLang(selectedLang)
    langRef.current = selectedLang
    setMessages([])
    historyRef.current = []
    setEndedReason(null)
    if (selected === 'driver') {
      setState('online')
      connect(() => ws.current?.send(JSON.stringify({ type: 'go-online' })))
    } else {
      setState('booking')
    }
  }, [connect])

  const requestRide = useCallback((details: RideDetails) => {
    setState('searching')
    connect(() => ws.current?.send(JSON.stringify({ type: 'request', details })))
  }, [connect])

  const send = (data: unknown) => ws.current?.send(JSON.stringify(data))

  const accept = useCallback(() => send({ type: 'accept' }), [])
  const decline = useCallback(() => { send({ type: 'decline' }); setOffer(null); setState('online') }, [])
  const advance = useCallback((phase: RidePhase) => {
    send({ type: 'advance', phase })
    setRide((prev) => (prev ? { ...prev, phase } : prev))
    if (phase === 'completed') setState('completed')
  }, [])
  const cancel = useCallback(() => { send({ type: 'cancel' }); setState('cancelled') }, [])

  const sendChat = useCallback((text: string) => {
    const trimmed = text.trim(); const myRole = roleRef.current
    if (!trimmed || !myRole) return
    send({ type: 'chat', text: trimmed, lang: langRef.current })
    setMessages((prev) => [...prev, { id: nextId.current++, original: trimmed, translated: trimmed, fromRole: myRole, mine: true, ts: Date.now() }])
    pushHistory(myRole, trimmed)
  }, [])

  const reset = useCallback(() => {
    closeSocket(); setState('idle'); setRole(null); roleRef.current = null
    setRide(null); setOffer(null); setMessages([]); historyRef.current = []; setEndedReason(null)
  }, [closeSocket])

  useEffect(() => () => { ws.current?.close() }, [])

  return { state, role, lang, ride, offer, messages, endedReason, chooseRole, requestRide, accept, decline, advance, cancel, sendChat, reset }
}
