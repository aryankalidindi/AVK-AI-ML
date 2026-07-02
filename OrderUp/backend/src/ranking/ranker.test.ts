import { describe, expect, test, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type { Candidate } from '../types.js';
import { createRanker } from './ranker.js';

const candidates: Candidate[] = [
  { id: 'c1', itemName: 'Crispy Chicken Sandwich', description: 'Crispy fried chicken', priceCents: 899, restaurant: 'Shake Shack', rating: 4.7, etaMinutes: 20 },
  { id: 'c2', itemName: 'Spicy Chicken Deluxe', description: 'Spicy with pickles', priceCents: 749, restaurant: "Chick-fil-A", rating: 4.8, etaMinutes: 15 },
  { id: 'c3', itemName: 'Grilled Chicken Wrap', description: 'Light grilled option', priceCents: 650, restaurant: 'Local Deli', rating: 4.1, etaMinutes: 35 },
];

function fakeClient(ranking: unknown) {
  const parse = vi.fn().mockResolvedValue({ parsed_output: ranking });
  return { client: { messages: { parse } } as unknown as Anthropic, parse };
}

describe('createRanker', () => {
  test('maps ranked ids back to full candidates with reasons', async () => {
    const { client, parse } = fakeClient({
      ranking: [
        { id: 'c2', reason: 'Spicy match, highest rating, fastest.' },
        { id: 'c1', reason: 'Classic crispy option nearby.' },
      ],
    });
    const rank = createRanker(client, 'claude-opus-4-8');
    const result = await rank('a spicy chicken sandwich', ['spicy'], candidates);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('c2');
    expect(result[0].restaurant).toBe("Chick-fil-A");
    expect(result[0].reason).toMatch(/Spicy/);

    const args = parse.mock.calls[0][0];
    expect(args.model).toBe('claude-opus-4-8');
    expect(args.system).toContain('rank food candidates');
    expect(args.output_config).toBeDefined();
    expect(args.messages[0].content).toContain('spicy chicken sandwich');
  });

  test('drops ids the model invented', async () => {
    const { client } = fakeClient({
      ranking: [
        { id: 'c1', reason: 'Good.' },
        { id: 'made-up', reason: 'Hallucinated.' },
      ],
    });
    const rank = createRanker(client, 'claude-opus-4-8');
    const result = await rank('chicken sandwich', [], candidates);
    expect(result.map((r) => r.id)).toEqual(['c1']);
  });

  test('throws when Claude returns no structured output', async () => {
    const { client } = fakeClient(null);
    const rank = createRanker(client, 'claude-opus-4-8');
    await expect(rank('chicken sandwich', [], candidates)).rejects.toThrow(/no structured output/);
  });
});
