export interface Language {
  /** ISO 639-1 code used for text translation (MyMemory). */
  code: string
  label: string
  /** BCP-47 code used for browser speech recognition + synthesis. */
  speech: string
}

export const LANGUAGES: Language[] = [
  { code: 'en', label: 'English', speech: 'en-US' },
  { code: 'id', label: 'Bahasa Indonesia', speech: 'id-ID' },
  { code: 'es', label: 'Español', speech: 'es-ES' },
  { code: 'fr', label: 'Français', speech: 'fr-FR' },
  { code: 'ja', label: '日本語', speech: 'ja-JP' },
]

export function speechCode(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.speech ?? code
}

export function langLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code
}

// Whisper expects full English language names.
const WHISPER_NAMES: Record<string, string> = {
  en: 'english',
  id: 'indonesian',
  es: 'spanish',
  fr: 'french',
  ja: 'japanese',
}

export function whisperLang(code: string): string {
  return WHISPER_NAMES[code] ?? 'english'
}
