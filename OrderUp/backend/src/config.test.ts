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

  test('coerces numeric strings', () => {
    const config = loadConfig({ ...validEnv, PORT: '9000', MAX_ORDER_CENTS: '2500' });
    expect(config.PORT).toBe(9000);
    expect(config.MAX_ORDER_CENTS).toBe(2500);
  });
});
