/// <reference lib="webworker" />
// Runs Whisper speech-to-text fully in the browser (WASM) — no network calls to
// Google/Apple. The model weights are fetched once from the Hugging Face CDN and
// cached by the browser. All subsequent transcription is on-device.
import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false

const MODEL = 'Xenova/whisper-tiny' // multilingual, ~40MB

type InMessage =
  | { type: 'load' }
  | { type: 'transcribe'; audio: Float32Array; language: string }

type AsrOutput = { text?: string } | Array<{ text?: string }>
type Recognizer = (audio: Float32Array, opts: Record<string, unknown>) => Promise<AsrOutput>

let recognizerPromise: Promise<Recognizer> | null = null

function getRecognizer(): Promise<Recognizer> {
  if (!recognizerPromise) {
    recognizerPromise = pipeline('automatic-speech-recognition', MODEL, {
      progress_callback: (p: unknown) => postMessage({ type: 'progress', data: p }),
    }) as unknown as Promise<Recognizer>
  }
  return recognizerPromise
}

self.onmessage = async (e: MessageEvent<InMessage>) => {
  const msg = e.data
  try {
    if (msg.type === 'load') {
      await getRecognizer()
      postMessage({ type: 'ready' })
      return
    }
    if (msg.type === 'transcribe') {
      const recognizer = await getRecognizer()
      const output = await recognizer(msg.audio, {
        language: msg.language,
        task: 'transcribe',
        chunk_length_s: 30,
      })
      const text = Array.isArray(output) ? '' : (output.text ?? '')
      postMessage({ type: 'result', text: text.trim() })
      return
    }
  } catch (err) {
    postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
