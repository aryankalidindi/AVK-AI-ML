import { z } from 'zod';

const FALSE_STRINGS = new Set(['false', '0', 'no', 'off']);

const booleanString = (defaultValue: string) =>
  z.string().default(defaultValue).transform((value) => !FALSE_STRINGS.has(value.toLowerCase()));

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4741),
  BIND_HOST: z.string().default('127.0.0.1'),
  AUTH_TOKEN: z.string().min(16, 'AUTH_TOKEN must be at least 16 characters'),
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default('claude-opus-4-8'),
  CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8),
  MAX_ORDER_CENTS: z.coerce.number().int().positive().default(5000),
  DRY_RUN: booleanString('true'),
  NTFY_URL: z.string().url().default('http://127.0.0.1:8090'),
  NTFY_TOPIC: z.string().default('orderup'),
  USER_DATA_DIR: z.string().default('./.chromium-profile'),
  SCREENSHOT_DIR: z.string().default('./screenshots'),
  DATA_FILE: z.string().default('./orders.json'),
  EXPIRY_MINUTES: z.coerce.number().positive().default(10),
  HEADLESS: booleanString('false'),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid configuration — ${details}`);
  }
  return result.data;
}
