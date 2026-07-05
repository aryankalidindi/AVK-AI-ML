import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { ParsedRequest } from '../types.js';

export const parsedRequestSchema = z.object({
  mode: z.enum(['specific', 'category']),
  items: z.array(z.object({ name: z.string(), quantity: z.number().int().positive() })),
  restaurant: z.string().nullable(),
  flavorNotes: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  clarify: z
    .object({
      question: z.string(),
      choices: z
        .array(z.object({ id: z.string(), label: z.string(), refinedUtterance: z.string() }))
        .min(2)
        .max(4),
    })
    .nullable(),
});

export const PARSER_SYSTEM_PROMPT = `You parse spoken food-ordering requests for a personal assistant that orders through DoorDash.

Classify the request:
- mode "specific": the user named a concrete menu item and/or restaurant ("one McChicken", "two Big Macs from McDonald's").
- mode "category": the user described a kind of food ("a chicken sandwich", "some spicy ramen").

Rules:
- items: the requested items with quantities (default quantity 1). For category requests, item name is the dish category ("chicken sandwich").
- restaurant: the restaurant if stated or strongly implied (a McChicken implies McDonald's); otherwise null.
- flavorNotes: flavor or style descriptors the user used ("spicy", "crispy", "extra pickles"); otherwise [].
- confidence: 0 to 1 — how sure you are the order can be built with no follow-up question.
- clarify: null when mode is "category" or confidence >= 0.8. When mode is "specific" and confidence < 0.8, provide exactly one question with 2-4 choices; each choice's refinedUtterance must be a fully unambiguous restatement of the order (e.g. "one Hot 'n Spicy McChicken from McDonald's").
- If the utterance is not a food-ordering request at all ("never mind", "cancel that", small talk, nonsense), return mode "specific", items [], restaurant null, flavorNotes [], confidence 0, clarify null. Never invent an item.`;

export type ParseUtterance = (utterance: string) => Promise<ParsedRequest>;

export function createParser(client: Anthropic, model: string): ParseUtterance {
  return async function parseUtterance(utterance: string): Promise<ParsedRequest> {
    const response = await client.messages.parse({
      model,
      max_tokens: 2048,
      system: PARSER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: utterance }],
      output_config: { format: zodOutputFormat(parsedRequestSchema) },
    });
    if (!response.parsed_output) {
      throw new Error('Parser returned no structured output');
    }
    return response.parsed_output;
  };
}
