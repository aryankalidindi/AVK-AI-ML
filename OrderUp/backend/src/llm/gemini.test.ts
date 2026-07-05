import { describe, expect, test, vi } from 'vitest';
import type { Candidate } from '../types.js';
import { createGeminiJson, createGeminiParser, createGeminiRanker } from './gemini.js';

function fakeFetch(payloadText: string | undefined, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      candidates: payloadText === undefined ? [] : [{ content: { parts: [{ text: payloadText }] } }],
    }),
  });
}

describe('createGeminiJson', () => {
  test('POSTs system + user text and returns parsed JSON', async () => {
    const fetchFn = fakeFetch('{"answer": 42}');
    const generate = createGeminiJson('AIza-test', 'gemini-2.5-flash', fetchFn);

    const result = await generate('You are a parser.', 'one mcchicken');
    expect(result).toEqual({ answer: 42 });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain('gemini-2.5-flash:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('AIza-test');
    const body = JSON.parse(init.body);
    expect(body.system_instruction.parts[0].text).toBe('You are a parser.');
    expect(body.contents[0].parts[0].text).toBe('one mcchicken');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  test('strips markdown code fences before parsing', async () => {
    const fetchFn = fakeFetch('```json\n{"a": 1}\n```');
    const generate = createGeminiJson('AIza-test', 'gemini-2.5-flash', fetchFn);
    expect(await generate('s', 'u')).toEqual({ a: 1 });
  });

  test('throws with status on a non-2xx response', async () => {
    const fetchFn = fakeFetch('{}', 429);
    const generate = createGeminiJson('AIza-test', 'gemini-2.5-flash', fetchFn);
    await expect(generate('s', 'u')).rejects.toThrow(/429/);
  });

  test('throws when the response has no candidates', async () => {
    const fetchFn = fakeFetch(undefined);
    const generate = createGeminiJson('AIza-test', 'gemini-2.5-flash', fetchFn);
    await expect(generate('s', 'u')).rejects.toThrow(/no structured output/);
  });
});

describe('createGeminiParser', () => {
  test('validates and returns a ParsedRequest', async () => {
    const parsed = {
      mode: 'specific',
      items: [{ name: 'McChicken', quantity: 1 }],
      restaurant: "McDonald's",
      flavorNotes: [],
      confidence: 0.95,
      clarify: null,
    };
    const generate = vi.fn().mockResolvedValue(parsed);
    const parse = createGeminiParser(generate);
    const result = await parse('I want one McChicken');
    expect(result.items[0].name).toBe('McChicken');
    expect(generate).toHaveBeenCalledWith(
      expect.stringContaining('spoken food-ordering requests'),
      'I want one McChicken',
    );
  });

  test('rejects schema-invalid output', async () => {
    const generate = vi.fn().mockResolvedValue({ mode: 'weird' });
    const parse = createGeminiParser(generate);
    await expect(parse('one mcchicken')).rejects.toThrow(/no structured output/);
  });
});

describe('createGeminiRanker', () => {
  const candidates: Candidate[] = [
    {
      id: 'c1',
      itemName: 'Spicy Chicken Deluxe',
      description: '',
      priceCents: 749,
      restaurant: 'Chick-fil-A',
      rating: 4.8,
      etaMinutes: 15,
    },
  ];

  test('maps ranked ids back to candidates and drops invented ids', async () => {
    const generate = vi.fn().mockResolvedValue({
      ranking: [
        { id: 'c1', reason: 'Best fit.' },
        { id: 'made-up', reason: 'Hallucinated.' },
      ],
    });
    const rank = createGeminiRanker(generate);
    const result = await rank('spicy chicken sandwich', ['spicy'], candidates);
    expect(result.map((r) => r.id)).toEqual(['c1']);
    expect(result[0].reason).toBe('Best fit.');
    expect(generate).toHaveBeenCalledWith(
      expect.stringContaining('rank food candidates'),
      expect.stringContaining('spicy chicken sandwich'),
    );
  });
});
