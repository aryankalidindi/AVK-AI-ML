import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { Candidate, RankedSuggestion } from '../types.js';

const rankingSchema = z.object({
  ranking: z
    .array(z.object({ id: z.string(), reason: z.string() }))
    .min(1)
    .max(5),
});

const SYSTEM_PROMPT = `You rank food candidates for a user's spoken request. Balance three factors: store rating, delivery speed (etaMinutes, lower is better), and how well the item's name and description fit the request and its flavor notes. Return the best candidates first, at most 5. Each reason is one short sentence a phone notification can show. Only use ids that appear in the provided candidates.`;

export type RankCandidates = (
  utterance: string,
  flavorNotes: string[],
  candidates: Candidate[],
) => Promise<RankedSuggestion[]>;

export function createRanker(client: Anthropic, model: string): RankCandidates {
  return async function rankCandidates(utterance, flavorNotes, candidates) {
    const response = await client.messages.parse({
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: JSON.stringify({ utterance, flavorNotes, candidates }) },
      ],
      output_config: { format: zodOutputFormat(rankingSchema) },
    });
    if (!response.parsed_output) {
      throw new Error('Ranker returned no structured output');
    }
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const seen = new Set<string>();
    return response.parsed_output.ranking
      .filter((entry) => {
        if (!byId.has(entry.id) || seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
      })
      .map((entry) => ({ ...byId.get(entry.id)!, reason: entry.reason }));
  };
}
