import { createServer, ServerResponse } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { randomUUID } from 'node:crypto'
import type { ClientMessage, ServerMessage } from '@rst/core'
import { Dispatcher } from './dispatcher.ts'
import {
  createClaudeTranslate,
  createAnthropicClient,
  type TranslateFn,
  type ContextMessage,
  type GlossaryPair,
} from './claude-translator.ts'

const PORT = Number(process.env.PORT ?? 8787)
const apiKey = process.env.ANTHROPIC_API_KEY
const model = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5'

let translate: TranslateFn | null = null
if (apiKey) {
  translate = createClaudeTranslate(createAnthropicClient(apiKey), model)
  console.log(`translation: Claude context-aware (${model})`)
} else {
  console.log('translation: none server-side — clients use the free fallback')
}

function cors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
}

interface TranslateBody {
  text: string
  sourceLang: string
  targetLang: string
  context?: ContextMessage[]
  glossary?: GlossaryPair[]
}
function isBody(v: unknown): v is TranslateBody {
  const o = v as Record<string, unknown>
  return (
    !!o &&
    typeof o.text === 'string' &&
    typeof o.sourceLang === 'string' &&
    typeof o.targetLang === 'string'
  )
}

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    cors(res)
    res.writeHead(204)
    res.end()
    return
  }
  if (req.method === 'POST' && req.url === '/translate') {
    cors(res)
    if (!translate) {
      res.writeHead(503, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'no translator' }))
      return
    }
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', async () => {
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid json' }))
        return
      }
      if (!isBody(parsed)) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'bad body' }))
        return
      }
      try {
        const text = await translate!(parsed)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ text }))
      } catch (err) {
        console.error('translate failed:', err)
        res.writeHead(502, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'translate failed' }))
      }
    })
    return
  }
  cors(res)
  res.writeHead(404)
  res.end()
})

// --- WS dispatcher (unchanged behavior) sharing the same HTTP server ---
const dispatcher = new Dispatcher()
const sockets = new Map<string, WebSocket>()
const wss = new WebSocketServer({ server })

function send(clientId: string, msg: ServerMessage): void {
  const ws = sockets.get(clientId)
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
}
function offerTo(driverId: string, riderId: string): void {
  const v = dispatcher.viewForOffer(riderId, driverId)
  if (v) send(driverId, { type: 'offer', details: v.details, rider: v.rider })
}

wss.on('connection', (ws) => {
  const clientId = randomUUID()
  sockets.set(clientId, ws)

  ws.on('message', (rawMsg) => {
    let msg: ClientMessage
    try {
      msg = JSON.parse(rawMsg.toString())
    } catch {
      return
    }

    if (msg.type === 'go-online') {
      const r = dispatcher.goOnline(clientId)
      if (r.offeredTo && r.riderId) offerTo(r.offeredTo, r.riderId)
    } else if (msg.type === 'request') {
      const r = dispatcher.request(clientId, msg.details)
      send(clientId, { type: 'waiting' })
      if (r.offeredDriverId) offerTo(r.offeredDriverId, clientId)
    } else if (msg.type === 'accept') {
      const r = dispatcher.accept(clientId)
      if (r.matched && r.riderId && r.driverId) {
        const rv = dispatcher.viewFor(r.riderId)
        const dv = dispatcher.viewFor(r.driverId)
        if (rv) send(r.riderId, { type: 'matched', ride: rv })
        if (dv) send(r.driverId, { type: 'matched', ride: dv })
      }
    } else if (msg.type === 'decline') {
      const r = dispatcher.decline(clientId)
      if (r.reofferedTo && r.riderId) offerTo(r.reofferedTo, r.riderId)
    } else if (msg.type === 'advance') {
      const r = dispatcher.advance(clientId, msg.phase)
      if (r.phase) {
        send(clientId, { type: 'phase', phase: r.phase })
        if (r.partnerId) send(r.partnerId, { type: 'phase', phase: r.phase })
      }
    } else if (msg.type === 'cancel') {
      const r = dispatcher.cancel(clientId)
      if (r.partnerId) send(r.partnerId, { type: 'phase', phase: 'cancelled' })
      if (r.withdrawnDriverId) send(r.withdrawnDriverId, { type: 'offer-withdrawn' })
    } else if (msg.type === 'chat') {
      const view = dispatcher.viewFor(clientId)
      const partnerId = dispatcher.partnerOf(clientId)
      if (view && partnerId) {
        send(partnerId, { type: 'chat', text: msg.text, fromRole: view.you, ts: Date.now(), sourceLang: msg.lang })
      }
    }
  })

  ws.on('close', () => {
    const r = dispatcher.leave(clientId)
    sockets.delete(clientId)
    if (r.partnerId) send(r.partnerId, { type: 'ride-ended', reason: 'partner-left' })
    if (r.withdrawnDriverId) send(r.withdrawnDriverId, { type: 'offer-withdrawn' })
  })
})

server.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT} (ws dispatch + POST /translate)`)
})
