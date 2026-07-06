import { PARSER_SYSTEM_PROMPT, parsedRequestSchema, type ParseUtterance } from '../parser/parser.js';
import {
  mapRankingToSuggestions,
  RANKER_SYSTEM_PROMPT,
  rankingSchema,
  type RankCandidates,
} from '../ranking/ranker.js';

/** Sends a system + user prompt to Gemini and returns the response parsed as JSON. */
export type GenerateJson = (system: string, user: string) => Promise<unknown>;

// Unlike Anthropic structured outputs, Gemini does not enforce our schema
// server-side — without an explicit shape, it drifts (e.g. "item" vs "name").
const PARSER_SHAPE_HINT = `

Return ONLY a JSON object with EXACTLY these keys and no others:
{"mode": "specific" or "category", "items": [{"name": "<item name>", "quantity": <positive integer>}], "restaurant": "<name>" or null, "flavorNotes": ["<descriptor>", ...], "confidence": <number 0 to 1>, "clarify": null or {"question": "<text>", "choices": [{"id": "<short id>", "label": "<text>", "refinedUtterance": "<text>"}]}}
The key inside items MUST be "name" (never "item").`;

const RANKER_SHAPE_HINT = `

Return ONLY a JSON object with EXACTLY this shape:
{"ranking": [{"id": "<candidate id>", "reason": "<one short sentence>"}]}`;

function firstIssue(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join('.')}: ${issue.message}` : 'schema mismatch';
}

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

export function createGeminiJson(
  apiKey: string,
  model: string,
  fetchFn: typeof fetch = fetch,
): GenerateJson {
  return async function generate(system: string, user: string): Promise<unknown> {
    const response = await fetchFn(`${BASE_URL}/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });
    if (!response.ok) {
      throw new Error(`Gemini request failed with status ${response.status}`);
    }
    const payload = (await response.json()) as GeminiResponse;
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini returned no structured output');
    }
    // Some models wrap JSON in markdown fences despite responseMimeType.
    const cleaned = text.replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, '');
    try {
      return JSON.parse(cleaned);
    } catch {
      throw new Error('Gemini returned no structured output (invalid JSON)');
    }
  };
}

export function createGeminiParser(generate: GenerateJson): ParseUtterance {
  return async function parseUtterance(utterance) {
    const raw = await generate(PARSER_SYSTEM_PROMPT + PARSER_SHAPE_HINT, utterance);
    const result = parsedRequestSchema.safeParse(raw);
    if (!result.success) {
      throw new Error(`Parser returned no structured output (${firstIssue(result.error)})`);
    }
    return result.data;
  };
}

export function createGeminiRanker(generate: GenerateJson): RankCandidates {
  return async function rankCandidates(utterance, flavorNotes, candidates) {
    const raw = await generate(
      RANKER_SYSTEM_PROMPT + RANKER_SHAPE_HINT,
      JSON.stringify({ utterance, flavorNotes, candidates }),
    );
    const result = rankingSchema.safeParse(raw);
    if (!result.success) {
      throw new Error(`Ranker returned no structured output (${firstIssue(result.error)})`);
    }
    return mapRankingToSuggestions(candidates, result.data.ranking);
  };
}
