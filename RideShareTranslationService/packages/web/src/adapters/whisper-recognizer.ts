// Captures microphone audio, resamples it to 16 kHz mono, and hands it to the
// Whisper worker for fully on-device transcription (no external speech service).
import { whisperLang } from '../lib/languages'

export type WhisperState = 'idle' | 'listening' | 'transcribing'

interface WhisperCallbacks {
  onState: (state: WhisperState) => void
  onResult: (text: string) => void
  onError: (message: string) => void
  /** Model download progress, 0–100. Called during background warm-up. */
  onProgress?: (pct: number) => void
}

interface ProgressData {
  status?: string
  file?: string
  loaded?: number
  total?: number
}

type WorkerMessage =
  | { type: 'ready' }
  | { type: 'progress'; data: ProgressData }
  | { type: 'result'; text: string }
  | { type: 'error'; message: string }

function makeAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  return new Ctor()
}

export class WhisperRecognizer {
  private worker: Worker
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private files = new Map<string, { loaded: number; total: number }>()
  private readonly lang: string
  private readonly cb: WhisperCallbacks

  constructor(lang: string, cb: WhisperCallbacks) {
    this.lang = lang
    this.cb = cb
    this.worker = new Worker(new URL('./whisper-worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (e: MessageEvent<WorkerMessage>) => this.handle(e.data)
  }

  /** Begin downloading/initialising the model in the background. */
  warm(): void {
    this.worker.postMessage({ type: 'load' })
  }

  async startRecording(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      this.cb.onError('Microphone blocked. Allow mic access for this site, then try again.')
      return
    }
    this.chunks = []
    this.recorder = new MediaRecorder(this.stream)
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.recorder.onstop = () => void this.transcribe()
    this.recorder.start()
    this.cb.onState('listening')
  }

  stopRecording(): void {
    this.recorder?.stop()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.cb.onState('transcribing')
  }

  dispose(): void {
    this.recorder?.stop()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.worker.terminate()
  }

  private async transcribe(): Promise<void> {
    try {
      const blob = new Blob(this.chunks, { type: this.chunks[0]?.type || 'audio/webm' })
      if (blob.size === 0) {
        this.cb.onState('idle')
        return
      }
      const audio = await this.decodeTo16kMono(blob)
      this.worker.postMessage({ type: 'transcribe', audio, language: whisperLang(this.lang) }, [audio.buffer])
    } catch {
      this.cb.onError('Could not process the audio. Try again.')
      this.cb.onState('idle')
    }
  }

  private async decodeTo16kMono(blob: Blob): Promise<Float32Array> {
    const buf = await blob.arrayBuffer()
    const ctx = makeAudioContext()
    const decoded = await ctx.decodeAudioData(buf)
    await ctx.close()
    const frames = Math.max(1, Math.ceil(decoded.duration * 16000))
    const offline = new OfflineAudioContext(1, frames, 16000)
    const src = offline.createBufferSource()
    src.buffer = decoded
    src.connect(offline.destination)
    src.start()
    const rendered = await offline.startRendering()
    return rendered.getChannelData(0)
  }

  private handle(msg: WorkerMessage): void {
    switch (msg.type) {
      case 'progress': {
        const d = msg.data
        if (d.status === 'progress' && d.file && typeof d.total === 'number' && d.total > 0) {
          this.files.set(d.file, { loaded: d.loaded ?? 0, total: d.total })
          let loaded = 0
          let total = 0
          for (const f of this.files.values()) {
            loaded += f.loaded
            total += f.total
          }
          if (total > 0) this.cb.onProgress?.(Math.min(99, Math.round((loaded / total) * 100)))
        }
        break
      }
      case 'ready':
        this.cb.onProgress?.(100)
        break
      case 'result':
        this.cb.onResult(msg.text)
        this.cb.onState('idle')
        break
      case 'error':
        this.cb.onError('Transcription failed. Try again.')
        this.cb.onState('idle')
        break
    }
  }
}
