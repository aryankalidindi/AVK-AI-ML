import { describe, expect, test, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { createParser } from './parser.js';

function fakeClient(parsedOutput: unknown) {
  const parse = vi.fn().mockResolvedValue({ parsed_output: parsedOutput });
  const client = { messages: { parse } } as unknown as Anthropic;
  return { client, parse };
}

const specificParse = {
  mode: 'specific',
  items: [{ name: 'McChicken', quantity: 1 }],
  restaurant: "McDonald's",
  flavorNotes: [],
  confidence: 0.95,
  clarify: null,
};

describe('createParser', () => {
  test('returns the parsed request from Claude', async () => {
    const { client, parse } = fakeClient(specificParse);
    const parseUtterance = createParser(client, 'claude-opus-4-8');
    const result = await parseUtterance('I want one McChicken');
    expect(result.mode).toBe('specific');
    expect(result.items[0]).toEqual({ name: 'McChicken', quantity: 1 });
    expect(parse).toHaveBeenCalledOnce();
    const args = parse.mock.calls[0][0];
    expect(args.model).toBe('claude-opus-4-8');
    expect(args.messages[0].content).toBe('I want one McChicken');
    expect(args.system).toContain('spoken food-ordering requests');
    expect(args.output_config).toBeDefined();
  });

  test('passes through a non-food parse with empty items', async () => {
    const nonFoodParse = {
      mode: 'specific',
      items: [],
      restaurant: null,
      flavorNotes: [],
      confidence: 0,
      clarify: null,
    };
    const { client } = fakeClient(nonFoodParse);
    const parseUtterance = createParser(client, 'claude-opus-4-8');
    const result = await parseUtterance('never mind');
    expect(result.items).toEqual([]);
    expect(result.confidence).toBe(0);
    expect(result.clarify).toBeNull();
  });

  test('throws when Claude returns no structured output', async () => {
    const { client } = fakeClient(null);
    const parseUtterance = createParser(client, 'claude-opus-4-8');
    await expect(parseUtterance('gibberish')).rejects.toThrow(/no structured output/);
  });
});
