import { describe, expect, test } from 'vitest';
import { loadConfig } from './config.js';

const validEnv = {
  AUTH_TOKEN: 'a-very-long-random-token',
  ANTHROPIC_API_KEY: 'sk-ant-test',
};

describe('loadConfig', () => {
  test('applies defaults for optional values', () => {
    const config = loadConfig(validEnv);
    expect(config.PORT).toBe(4741);
    expect(config.CONFIDENCE_THRESHOLD).toBe(0.8);
    expect(config.MAX_ORDER_CENTS).toBe(5000);
    expect(config.DRY_RUN).toBe(true);
    expect(config.ANTHROPIC_MODEL).toBe('claude-opus-4-8');
  });

  test('throws a clear error when AUTH_TOKEN is missing', () => {
    expect(() => loadConfig({ ANTHROPIC_API_KEY: 'sk-ant-test' })).toThrow(/AUTH_TOKEN/);
  });

  test('parses DRY_RUN=false as boolean false', () => {
    const config = loadConfig({ ...validEnv, DRY_RUN: 'false' });
    expect(config.DRY_RUN).toBe(false);
  });

  test('parses common false spellings as boolean false', () => {
    expect(loadConfig({ ...validEnv, DRY_RUN: '0' }).DRY_RUN).toBe(false);
    expect(loadConfig({ ...validEnv, DRY_RUN: 'FALSE' }).DRY_RUN).toBe(false);
    expect(loadConfig({ ...validEnv, HEADLESS: '0' }).HEADLESS).toBe(false);
  });

  test('throws when CONFIDENCE_THRESHOLD is out of range', () => {
    expect(() => loadConfig({ ...validEnv, CONFIDENCE_THRESHOLD: '1.5' })).toThrow(
      /CONFIDENCE_THRESHOLD/,
    );
  });

  test('throws a clear error when ANTHROPIC_API_KEY is missing', () => {
    expect(() => loadConfig({ AUTH_TOKEN: 'a-very-long-random-token' })).toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  test('coerces numeric strings', () => {
    const config = loadConfig({ ...validEnv, PORT: '9000', MAX_ORDER_CENTS: '2500' });
    expect(config.PORT).toBe(9000);
    expect(config.MAX_ORDER_CENTS).toBe(2500);
  });

  test('gemini provider requires GEMINI_API_KEY but not ANTHROPIC_API_KEY', () => {
    expect(() =>
      loadConfig({ AUTH_TOKEN: 'a-very-long-random-token', LLM_PROVIDER: 'gemini' }),
    ).toThrow(/GEMINI_API_KEY/);

    const config = loadConfig({
      AUTH_TOKEN: 'a-very-long-random-token',
      LLM_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'AIza-test',
    });
    expect(config.LLM_PROVIDER).toBe('gemini');
    expect(config.GEMINI_MODEL).toBe('gemini-2.5-flash');
    expect(config.ANTHROPIC_API_KEY).toBeUndefined();
  });

  test('rejects an unknown LLM_PROVIDER', () => {
    expect(() => loadConfig({ ...validEnv, LLM_PROVIDER: 'openai' })).toThrow(/LLM_PROVIDER/);
  });
});
