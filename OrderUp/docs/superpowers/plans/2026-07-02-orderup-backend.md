# OrderUp Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The TypeScript backend for OrderUp: it receives a spoken-order utterance over HTTP, parses it with Claude, builds a real cart on the user's DoorDash account via Playwright, pushes a review notification via ntfy, and places the order only after an explicit confirm call.

**Architecture:** A single Node package at `OrderUp/backend/`. An `Orchestrator` drives an order state machine (`received → parsing → clarifying|suggesting? → building_cart → awaiting_confirmation → placing → placed|failed|cancelled|expired`). All side-effectful collaborators (Claude parser/ranker, DoorDash automation, ntfy notifier) are injected interfaces so the orchestrator and HTTP server are fully unit-testable with fakes. DoorDash automation is five isolated Playwright steps with centralized selectors; `placeOrder` is the only step that spends money and is gated behind confirm + a dry-run flag.

**Tech Stack:** Node 20+, TypeScript (ESM, NodeNext), Fastify, Playwright, `@anthropic-ai/sdk` (structured outputs via `messages.parse` + `zodOutputFormat`), zod, vitest, tsx.

**Scope note:** This is Plan 1 of 2 for the OrderUp spec (`../specs/2026-07-02-voice-doordash-ordering-design.md`). Plan 2 (native iOS app) is a separate document, written after this backend runs — the app consumes this plan's HTTP API. This backend is independently usable end-to-end via `curl` + ntfy notifications.

**Conventions used throughout:**
- All commands run from `OrderUp/backend/` unless noted.
- TS imports use `.js` extensions (NodeNext ESM).
- Tests are colocated: `src/foo/bar.test.ts` next to `src/foo/bar.ts`.
- Claude model: `claude-opus-4-8` by default (`ANTHROPIC_MODEL` env override; adaptive thinking is default, no sampling params — they 400 on this model).

---

### Task 1: Scaffold the project

**Files:**
- Create: `OrderUp/backend/package.json`
- Create: `OrderUp/backend/tsconfig.json`
- Create: `OrderUp/backend/vitest.config.ts`
- Create: `OrderUp/backend/.gitignore`
- Create: `OrderUp/backend/.env.example`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "orderup-backend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "tsx src/index.ts",
    "login": "tsx scripts/login.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd OrderUp/backend
npm install @anthropic-ai/sdk fastify playwright zod
npm install -D typescript tsx vitest @types/node
npx playwright install chromium
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "scripts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000,
  },
});
```

- [ ] **Step 5: Create `.gitignore`**

```text
node_modules/
.env
.chromium-profile/
screenshots/
orders.json
```

- [ ] **Step 6: Create `.env.example`**

```text
# Required
AUTH_TOKEN=change-me-to-a-long-random-string
ANTHROPIC_API_KEY=sk-ant-...

# Optional (defaults shown)
PORT=4741
BIND_HOST=127.0.0.1
ANTHROPIC_MODEL=claude-opus-4-8
CONFIDENCE_THRESHOLD=0.8
MAX_ORDER_CENTS=5000
DRY_RUN=true
NTFY_URL=http://127.0.0.1:8090
NTFY_TOPIC=orderup
USER_DATA_DIR=./.chromium-profile
SCREENSHOT_DIR=./screenshots
DATA_FILE=./orders.json
EXPIRY_MINUTES=10
HEADLESS=false
```

- [ ] **Step 7: Verify the toolchain runs**

Run: `npm test`
Expected: vitest exits reporting "No test files found" (non-error) or exit code 1 with that message — either is fine; the point is vitest launches.

Run: `npm run typecheck`
Expected: completes with no errors (no source files yet).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore .env.example
git commit -m "chore: scaffold OrderUp backend (TypeScript, vitest, playwright)"
```

---

### Task 2: Config loader

**Files:**
- Create: `src/config.ts`
- Test: `src/config.test.ts`

- [ ] **Step 1: Write the failing test** — `src/config.test.ts`

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config.test.ts`
Expected: FAIL — cannot resolve `./config.js`.

- [ ] **Step 3: Implement** — `src/config.ts`

```ts
import { z } from 'zod';

const booleanString = (defaultValue: string) =>
  z.string().default(defaultValue).transform((value) => value !== 'false');

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: zod-validated environment config"
```

---

### Task 3: Domain types and order state machine

**Files:**
- Create: `src/types.ts`
- Create: `src/orders/machine.ts`
- Test: `src/orders/machine.test.ts`

- [ ] **Step 1: Create the domain types** — `src/types.ts` (types only; no test needed for declarations)

```ts
export type OrderState =
  | 'received'
  | 'parsing'
  | 'clarifying'
  | 'suggesting'
  | 'building_cart'
  | 'awaiting_confirmation'
  | 'placing'
  | 'placed'
  | 'failed'
  | 'cancelled'
  | 'expired';

export const TERMINAL_STATES: readonly OrderState[] = ['placed', 'failed', 'cancelled', 'expired'];

export interface RequestedItem {
  name: string;
  quantity: number;
}

export interface ClarifyChoice {
  id: string;
  label: string;
  refinedUtterance: string;
}

export interface ClarifyQuestion {
  question: string;
  choices: ClarifyChoice[];
}

export interface ParsedRequest {
  mode: 'specific' | 'category';
  items: RequestedItem[];
  restaurant: string | null;
  flavorNotes: string[];
  confidence: number;
  clarify: ClarifyQuestion | null;
}

export interface Candidate {
  id: string;
  itemName: string;
  description: string;
  priceCents: number | null;
  restaurant: string;
  rating: number | null;
  etaMinutes: number | null;
}

export interface RankedSuggestion extends Candidate {
  reason: string;
}

export interface CartLine {
  name: string;
  quantity: number;
  priceCents: number;
}

export interface CartSummary {
  restaurant: string;
  items: CartLine[];
  subtotalCents: number;
  feesCents: number;
  totalCents: number;
}

export interface Order {
  id: string;
  utterance: string;
  state: OrderState;
  createdAt: string;
  updatedAt: string;
  parsed?: ParsedRequest;
  suggestions?: RankedSuggestion[];
  cart?: CartSummary;
  overCap?: boolean;
  error?: string;
  expiresAt?: string;
  dryRun?: boolean;
}
```

- [ ] **Step 2: Write the failing state-machine test** — `src/orders/machine.test.ts`

```ts
import { describe, expect, test } from 'vitest';
import type { Order } from '../types.js';
import { canTransition, transition } from './machine.js';

function order(state: Order['state']): Order {
  const now = new Date().toISOString();
  return { id: 'o1', utterance: 'one mcchicken', state, createdAt: now, updatedAt: now };
}

describe('order state machine', () => {
  test('allows the happy path', () => {
    expect(canTransition('received', 'parsing')).toBe(true);
    expect(canTransition('parsing', 'building_cart')).toBe(true);
    expect(canTransition('building_cart', 'awaiting_confirmation')).toBe(true);
    expect(canTransition('awaiting_confirmation', 'placing')).toBe(true);
    expect(canTransition('placing', 'placed')).toBe(true);
  });

  test('allows clarify and suggest branches', () => {
    expect(canTransition('parsing', 'clarifying')).toBe(true);
    expect(canTransition('clarifying', 'parsing')).toBe(true);
    expect(canTransition('parsing', 'suggesting')).toBe(true);
    expect(canTransition('suggesting', 'building_cart')).toBe(true);
  });

  test('rejects skipping confirmation', () => {
    expect(canTransition('building_cart', 'placing')).toBe(false);
    expect(canTransition('parsing', 'placed')).toBe(false);
  });

  test('terminal states have no exits', () => {
    for (const s of ['placed', 'failed', 'cancelled', 'expired'] as const) {
      expect(canTransition(s, 'parsing')).toBe(false);
    }
  });

  test('transition returns a new object and never mutates', () => {
    const before = order('received');
    const after = transition(before, 'parsing');
    expect(before.state).toBe('received');
    expect(after.state).toBe('parsing');
    expect(after).not.toBe(before);
  });

  test('transition throws on an invalid move', () => {
    expect(() => transition(order('received'), 'placed')).toThrow(/Invalid transition/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/orders/machine.test.ts`
Expected: FAIL — cannot resolve `./machine.js`.

- [ ] **Step 4: Implement** — `src/orders/machine.ts`

```ts
import type { Order, OrderState } from '../types.js';

const ALLOWED: Record<OrderState, OrderState[]> = {
  received: ['parsing'],
  parsing: ['clarifying', 'suggesting', 'building_cart', 'failed'],
  clarifying: ['parsing', 'cancelled', 'expired', 'failed'],
  suggesting: ['building_cart', 'cancelled', 'expired', 'failed'],
  building_cart: ['awaiting_confirmation', 'failed'],
  awaiting_confirmation: ['placing', 'cancelled', 'expired'],
  placing: ['placed', 'failed'],
  placed: [],
  failed: [],
  cancelled: [],
  expired: [],
};

export function canTransition(from: OrderState, to: OrderState): boolean {
  return ALLOWED[from].includes(to);
}

export function transition(order: Order, to: OrderState, patch: Partial<Order> = {}): Order {
  if (!canTransition(order.state, to)) {
    throw new Error(`Invalid transition: ${order.state} -> ${to}`);
  }
  return { ...order, ...patch, state: to, updatedAt: new Date().toISOString() };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/orders/machine.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/orders/machine.ts src/orders/machine.test.ts
git commit -m "feat: domain types and order state machine"
```

---

### Task 4: Text utilities (fuzzy match, money parsing)

**Files:**
- Create: `src/lib/text.ts`
- Test: `src/lib/text.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/text.test.ts`

```ts
import { describe, expect, test } from 'vitest';
import { bestMatch, formatCents, matchScore, normalize, parseMoneyToCents } from './text.js';

describe('normalize', () => {
  test('lowercases and strips punctuation', () => {
    expect(normalize("McChicken® — Hot 'n Spicy!")).toBe('mcchicken hot n spicy');
  });
});

describe('matchScore / bestMatch', () => {
  test('exact name scores 1', () => {
    expect(matchScore('mcchicken', 'McChicken')).toBe(1);
  });

  test('picks the closest menu item', () => {
    const options = ['McChicken', "Hot 'n Spicy McChicken", 'McDouble', 'Big Mac'];
    expect(bestMatch('spicy mcchicken', options, (o) => o)).toBe("Hot 'n Spicy McChicken");
  });

  test('returns undefined when nothing is close', () => {
    expect(bestMatch('pad thai', ['Big Mac', 'McFlurry'], (o) => o)).toBeUndefined();
  });
});

describe('parseMoneyToCents', () => {
  test('parses "$8.42"', () => expect(parseMoneyToCents('$8.42')).toBe(842));
  test('parses "Subtotal: $12.00"', () => expect(parseMoneyToCents('Subtotal: $12.00')).toBe(1200));
  test('parses "$1,024.5" with comma and one decimal', () => expect(parseMoneyToCents('$1,024.5')).toBe(102450));
  test('returns null for no number', () => expect(parseMoneyToCents('Free')).toBeNull());
});

describe('formatCents', () => {
  test('formats 842 as $8.42', () => expect(formatCents(842)).toBe('$8.42'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/text.test.ts`
Expected: FAIL — cannot resolve `./text.js`.

- [ ] **Step 3: Implement** — `src/lib/text.ts`

```ts
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchScore(target: string, candidate: string): number {
  const targetWords = new Set(normalize(target).split(' ').filter(Boolean));
  const candidateWords = new Set(normalize(candidate).split(' ').filter(Boolean));
  if (targetWords.size === 0 || candidateWords.size === 0) return 0;
  let overlap = 0;
  for (const word of targetWords) {
    if (candidateWords.has(word)) overlap += 1;
  }
  return overlap / Math.max(targetWords.size, candidateWords.size);
}

const MATCH_THRESHOLD = 0.3;

export function bestMatch<T>(target: string, options: T[], label: (option: T) => string): T | undefined {
  let best: T | undefined;
  let bestScore = 0;
  for (const option of options) {
    const score = matchScore(target, label(option));
    if (score > bestScore) {
      best = option;
      bestScore = score;
    }
  }
  return bestScore >= MATCH_THRESHOLD ? best : undefined;
}

export function parseMoneyToCents(text: string): number | null {
  const match = text.replace(/,/g, '').match(/\$?\s*(\d+)(?:\.(\d{1,2}))?/);
  if (!match) return null;
  const dollars = Number(match[1]);
  const cents = Number((match[2] ?? '0').padEnd(2, '0'));
  return dollars * 100 + cents;
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/text.test.ts`
Expected: all tests PASS. (If the `spicy mcchicken` case picks the wrong item, the scoring denominator is wrong — it must be `Math.max`, not `Math.min`.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/text.ts src/lib/text.test.ts
git commit -m "feat: text utilities for fuzzy matching and money parsing"
```

---

### Task 5: Order store (in-memory + JSON persistence)

**Files:**
- Create: `src/orders/store.ts`
- Test: `src/orders/store.test.ts`

- [ ] **Step 1: Write the failing test** — `src/orders/store.test.ts`

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { OrderStore } from './store.js';

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('OrderStore', () => {
  test('creates an order in received state', () => {
    const store = new OrderStore();
    const order = store.create('one mcchicken');
    expect(order.state).toBe('received');
    expect(store.get(order.id)?.utterance).toBe('one mcchicken');
  });

  test('rejects a second in-flight order', () => {
    const store = new OrderStore();
    store.create('one mcchicken');
    expect(() => store.create('a big mac')).toThrow(/already in flight/);
  });

  test('allows a new order once the previous one is terminal', () => {
    const store = new OrderStore();
    const first = store.create('one mcchicken');
    store.advance(first.id, 'parsing');
    store.advance(first.id, 'failed', { error: 'boom' });
    expect(() => store.create('a big mac')).not.toThrow();
  });

  test('advance applies a patch and enforces the machine', () => {
    const store = new OrderStore();
    const order = store.create('one mcchicken');
    const next = store.advance(order.id, 'parsing');
    expect(next.state).toBe('parsing');
    expect(() => store.advance(order.id, 'placed')).toThrow(/Invalid transition/);
  });

  test('persists to disk and reloads', () => {
    dir = mkdtempSync(join(tmpdir(), 'orderup-'));
    const file = join(dir, 'orders.json');
    const store = new OrderStore(file);
    const order = store.create('one mcchicken');
    store.advance(order.id, 'parsing');

    const reloaded = new OrderStore(file);
    expect(reloaded.get(order.id)?.state).toBe('parsing');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/orders/store.test.ts`
Expected: FAIL — cannot resolve `./store.js`.

- [ ] **Step 3: Implement** — `src/orders/store.ts`

```ts
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Order, OrderState } from '../types.js';
import { TERMINAL_STATES } from '../types.js';
import { transition } from './machine.js';

export class OrderStore {
  private orders = new Map<string, Order>();

  constructor(private filePath?: string) {
    if (filePath && existsSync(filePath)) {
      const saved = JSON.parse(readFileSync(filePath, 'utf8')) as Order[];
      for (const order of saved) this.orders.set(order.id, order);
    }
  }

  create(utterance: string): Order {
    const active = this.getActive();
    if (active) {
      throw new Error(`An order is already in flight (${active.id}, ${active.state})`);
    }
    const now = new Date().toISOString();
    const order: Order = {
      id: randomUUID(),
      utterance,
      state: 'received',
      createdAt: now,
      updatedAt: now,
    };
    this.orders.set(order.id, order);
    this.persist();
    return order;
  }

  get(id: string): Order | undefined {
    return this.orders.get(id);
  }

  list(): Order[] {
    return [...this.orders.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getActive(): Order | undefined {
    return [...this.orders.values()].find((order) => !TERMINAL_STATES.includes(order.state));
  }

  advance(id: string, to: OrderState, patch: Partial<Order> = {}): Order {
    const order = this.orders.get(id);
    if (!order) throw new Error(`Unknown order: ${id}`);
    const next = transition(order, to, patch);
    this.orders.set(id, next);
    this.persist();
    return next;
  }

  private persist(): void {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.list(), null, 2));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/orders/store.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/orders/store.ts src/orders/store.test.ts
git commit -m "feat: order store with single-in-flight enforcement and JSON persistence"
```

---

### Task 6: Utterance parser (Claude structured output)

**Files:**
- Create: `src/parser/parser.ts`
- Test: `src/parser/parser.test.ts`

The parser wraps one `client.messages.parse()` call. Tests inject a fake Anthropic client — no network, no API key.

- [ ] **Step 1: Write the failing test** — `src/parser/parser.test.ts`

```ts
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
  });

  test('throws when Claude returns no structured output', async () => {
    const { client } = fakeClient(null);
    const parseUtterance = createParser(client, 'claude-opus-4-8');
    await expect(parseUtterance('gibberish')).rejects.toThrow(/no structured output/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/parser/parser.test.ts`
Expected: FAIL — cannot resolve `./parser.js`.

- [ ] **Step 3: Implement** — `src/parser/parser.ts`

```ts
import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { ParsedRequest } from '../types.js';

const parsedRequestSchema = z.object({
  mode: z.enum(['specific', 'category']),
  items: z
    .array(z.object({ name: z.string(), quantity: z.number().int() }))
    .min(1),
  restaurant: z.string().nullable(),
  flavorNotes: z.array(z.string()),
  confidence: z.number(),
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

const SYSTEM_PROMPT = `You parse spoken food-ordering requests for a personal assistant that orders through DoorDash.

Classify the request:
- mode "specific": the user named a concrete menu item and/or restaurant ("one McChicken", "two Big Macs from McDonald's").
- mode "category": the user described a kind of food ("a chicken sandwich", "some spicy ramen").

Rules:
- items: the requested items with quantities (default quantity 1). For category requests, item name is the dish category ("chicken sandwich").
- restaurant: the restaurant if stated or strongly implied (a McChicken implies McDonald's); otherwise null.
- flavorNotes: flavor or style descriptors the user used ("spicy", "crispy", "extra pickles"); otherwise [].
- confidence: 0 to 1 — how sure you are the order can be built with no follow-up question.
- clarify: null when mode is "category" or confidence >= 0.8. When mode is "specific" and confidence < 0.8, provide exactly one question with 2-4 choices; each choice's refinedUtterance must be a fully unambiguous restatement of the order (e.g. "one Hot 'n Spicy McChicken from McDonald's").`;

export type ParseUtterance = (utterance: string) => Promise<ParsedRequest>;

export function createParser(client: Anthropic, model: string): ParseUtterance {
  return async function parseUtterance(utterance: string): Promise<ParsedRequest> {
    const response = await client.messages.parse({
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: utterance }],
      output_config: { format: zodOutputFormat(parsedRequestSchema) },
    });
    if (!response.parsed_output) {
      throw new Error('Parser returned no structured output');
    }
    return response.parsed_output;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/parser/parser.test.ts`
Expected: 2 tests PASS.

Run: `npm run typecheck`
Expected: no errors. (If `zodOutputFormat` fails to resolve, check the installed `@anthropic-ai/sdk` version supports `helpers/zod` and that `zod` is installed.)

- [ ] **Step 5: Commit**

```bash
git add src/parser/parser.ts src/parser/parser.test.ts
git commit -m "feat: Claude utterance parser with structured output"
```

---

### Task 7: Suggestion ranker (Claude structured output)

**Files:**
- Create: `src/ranking/ranker.ts`
- Test: `src/ranking/ranker.test.ts`

The ranker sends the candidate list to Claude and gets back an ordered list of candidate ids + one-line reasons. Code maps ids back to full `Candidate` objects, so the model can never invent data.

- [ ] **Step 1: Write the failing test** — `src/ranking/ranker.test.ts`

```ts
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
  return { messages: { parse } } as unknown as Anthropic;
}

describe('createRanker', () => {
  test('maps ranked ids back to full candidates with reasons', async () => {
    const client = fakeClient({
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
  });

  test('drops ids the model invented', async () => {
    const client = fakeClient({
      ranking: [
        { id: 'c1', reason: 'Good.' },
        { id: 'made-up', reason: 'Hallucinated.' },
      ],
    });
    const rank = createRanker(client, 'claude-opus-4-8');
    const result = await rank('chicken sandwich', [], candidates);
    expect(result.map((r) => r.id)).toEqual(['c1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ranking/ranker.test.ts`
Expected: FAIL — cannot resolve `./ranker.js`.

- [ ] **Step 3: Implement** — `src/ranking/ranker.ts`

```ts
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
    return response.parsed_output.ranking
      .filter((entry) => byId.has(entry.id))
      .map((entry) => ({ ...byId.get(entry.id)!, reason: entry.reason }));
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ranking/ranker.test.ts`
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ranking/ranker.ts src/ranking/ranker.test.ts
git commit -m "feat: Claude suggestion ranker over discovered candidates"
```

---

### Task 8: Notifier interface + ntfy implementation

**Files:**
- Create: `src/notify/notifier.ts`
- Create: `src/notify/ntfy.ts`
- Test: `src/notify/ntfy.test.ts`

- [ ] **Step 1: Create the interface** — `src/notify/notifier.ts`

```ts
export interface OrderNotification {
  title: string;
  body: string;
  deepLink: string;
  priority?: 'default' | 'high';
}

export interface Notifier {
  send(notification: OrderNotification): Promise<void>;
}
```

- [ ] **Step 2: Write the failing test** — `src/notify/ntfy.test.ts`

```ts
import { describe, expect, test, vi } from 'vitest';
import { createNtfyNotifier } from './ntfy.js';

describe('createNtfyNotifier', () => {
  test('POSTs to <baseUrl>/<topic> with title, click and priority headers', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const notifier = createNtfyNotifier('http://127.0.0.1:8090', 'orderup', fetchFn);

    await notifier.send({
      title: 'Review your order — $8.42',
      body: '1× McChicken from McDonald’s',
      deepLink: 'orderup://review/abc',
      priority: 'high',
    });

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8090/orderup');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('1× McChicken from McDonald’s');
    expect(init.headers.Title).toBe('Review your order — $8.42');
    expect(init.headers.Click).toBe('orderup://review/abc');
    expect(init.headers.Priority).toBe('high');
  });

  test('throws on a non-2xx response', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    const notifier = createNtfyNotifier('http://127.0.0.1:8090', 'orderup', fetchFn);
    await expect(
      notifier.send({ title: 't', body: 'b', deepLink: 'orderup://x' }),
    ).rejects.toThrow(/502/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/notify/ntfy.test.ts`
Expected: FAIL — cannot resolve `./ntfy.js`.

- [ ] **Step 4: Implement** — `src/notify/ntfy.ts`

```ts
import type { Notifier, OrderNotification } from './notifier.js';

export function createNtfyNotifier(
  baseUrl: string,
  topic: string,
  fetchFn: typeof fetch = fetch,
): Notifier {
  return {
    async send(notification: OrderNotification): Promise<void> {
      const response = await fetchFn(`${baseUrl}/${topic}`, {
        method: 'POST',
        body: notification.body,
        headers: {
          Title: notification.title,
          Click: notification.deepLink,
          Priority: notification.priority ?? 'default',
          Tags: 'hamburger',
        },
      });
      if (!response.ok) {
        throw new Error(`ntfy send failed with status ${response.status}`);
      }
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/notify/ntfy.test.ts`
Expected: 2 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/notify/notifier.ts src/notify/ntfy.ts src/notify/ntfy.test.ts
git commit -m "feat: swappable notifier interface with ntfy implementation"
```

---

### Task 9: DoorDash browser harness, selectors, and DOM extraction

**Files:**
- Create: `src/doordash/browser.ts`
- Create: `src/doordash/selectors.ts`
- Create: `src/doordash/extract.ts`
- Test: `src/doordash/extract.test.ts`

Selectors are centralized in one file because they *will* rot when DoorDash redesigns. Extraction functions (DOM → domain objects) are tested against fixture HTML via `page.setContent()`, so the parsing logic is verified even though live selectors get confirmed in Task 13.

- [ ] **Step 1: Create the selectors module** — `src/doordash/selectors.ts`

```ts
// Centralized selectors for doordash.com.
// These are the ONLY place DOM coupling lives. The live site changes;
// Task 13 (live verification) confirms and corrects them. When a step
// breaks in the future, fix it here and re-run the dry-run verification.
export const SEL = {
  storeCard: '[data-testid="store-card"], [data-anchor-id="StoreCard"]',
  storeCardName: 'h3, [data-telemetry-id="store.name"]',
  itemSearchCard: '[data-testid="menu-item-search-result"], [data-anchor-id="MenuItem"]',
  itemName: '[data-testid="item-name"], h3',
  itemDescription: '[data-testid="item-description"], p',
  itemPrice: '[data-testid="item-price"]',
  itemStoreName: '[data-testid="item-store-name"]',
  itemStoreRating: '[data-testid="item-store-rating"]',
  itemStoreEta: '[data-testid="item-store-eta"]',
  itemModalQuantityUp: '[data-testid="quantity-stepper-increment"]',
  itemModalAddToCart: '[data-testid="add-to-cart-button"]',
  cartOpenButton: '[data-testid="order-cart-button"]',
  cartLine: '[data-testid="order-cart-item"]',
  cartLineName: '[data-testid="order-cart-item-name"]',
  cartLineQuantity: '[data-testid="order-cart-item-quantity"]',
  cartLinePrice: '[data-testid="order-cart-item-price"]',
  cartStoreName: '[data-testid="cart-store-name"]',
  cartSubtotal: '[data-testid="cart-subtotal"]',
  cartFees: '[data-testid="cart-fees-total"]',
  cartTotal: '[data-testid="cart-total"]',
  checkoutButton: '[data-testid="checkout-button"]',
  placeOrderButton: '[data-testid="place-order-button"]',
} as const;
```

- [ ] **Step 2: Create the browser harness** — `src/doordash/browser.ts`

```ts
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';

export async function launchSession(userDataDir: string, headless: boolean): Promise<BrowserContext> {
  return chromium.launchPersistentContext(userDataDir, {
    headless,
    viewport: { width: 1280, height: 900 },
  });
}

export async function saveScreenshot(page: Page, dir: string, label: string): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = join(dir, `${stamp}-${label}.png`);
  await page.screenshot({ path });
  return path;
}

export class StepError extends Error {
  constructor(
    public step: string,
    message: string,
    public screenshotPath?: string,
  ) {
    super(`${step}: ${message}`);
    this.name = 'StepError';
  }
}
```

- [ ] **Step 3: Write the failing extraction test** — `src/doordash/extract.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { extractCandidates, extractCartSummary } from './extract.js';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});

afterAll(async () => {
  await browser.close();
});

const searchFixture = `
<div>
  <div data-testid="menu-item-search-result">
    <h3 data-testid="item-name">Crispy Chicken Sandwich</h3>
    <p data-testid="item-description">Fried chicken, pickles</p>
    <span data-testid="item-price">$8.99</span>
    <span data-testid="item-store-name">Shake Shack</span>
    <span data-testid="item-store-rating">4.7</span>
    <span data-testid="item-store-eta">20 min</span>
  </div>
  <div data-testid="menu-item-search-result">
    <h3 data-testid="item-name">Spicy Chicken Deluxe</h3>
    <p data-testid="item-description">Spicy, with pickles</p>
    <span data-testid="item-price">$7.49</span>
    <span data-testid="item-store-name">Chick-fil-A</span>
    <span data-testid="item-store-rating">4.8</span>
    <span data-testid="item-store-eta">15 min</span>
  </div>
</div>`;

const cartFixture = `
<div>
  <span data-testid="cart-store-name">McDonald's</span>
  <div data-testid="order-cart-item">
    <span data-testid="order-cart-item-quantity">1</span>
    <span data-testid="order-cart-item-name">McChicken</span>
    <span data-testid="order-cart-item-price">$3.49</span>
  </div>
  <span data-testid="cart-subtotal">$3.49</span>
  <span data-testid="cart-fees-total">$4.93</span>
  <span data-testid="cart-total">$8.42</span>
</div>`;

describe('extractCandidates', () => {
  test('parses search result cards into candidates', async () => {
    await page.setContent(searchFixture);
    const candidates = await extractCandidates(page);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      itemName: 'Crispy Chicken Sandwich',
      restaurant: 'Shake Shack',
      priceCents: 899,
      rating: 4.7,
      etaMinutes: 20,
    });
    expect(candidates[0].id).not.toBe(candidates[1].id);
  });
});

describe('extractCartSummary', () => {
  test('parses the cart into a summary with cents totals', async () => {
    await page.setContent(cartFixture);
    const cart = await extractCartSummary(page);
    expect(cart.restaurant).toBe("McDonald's");
    expect(cart.items).toEqual([{ name: 'McChicken', quantity: 1, priceCents: 349 }]);
    expect(cart.subtotalCents).toBe(349);
    expect(cart.feesCents).toBe(493);
    expect(cart.totalCents).toBe(842);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/doordash/extract.test.ts`
Expected: FAIL — cannot resolve `./extract.js`.

- [ ] **Step 5: Implement** — `src/doordash/extract.ts`

```ts
import type { Page } from 'playwright';
import type { Candidate, CartSummary } from '../types.js';
import { parseMoneyToCents } from '../lib/text.js';
import { SEL } from './selectors.js';

async function textOf(scope: { locator: (sel: string) => { first: () => { textContent: () => Promise<string | null> } } }, selector: string): Promise<string> {
  try {
    return ((await scope.locator(selector).first().textContent()) ?? '').trim();
  } catch {
    return '';
  }
}

export async function extractCandidates(page: Page): Promise<Candidate[]> {
  const cards = await page.locator(SEL.itemSearchCard).all();
  const candidates: Candidate[] = [];
  for (const [index, card] of cards.entries()) {
    const itemName = await textOf(card, SEL.itemName);
    if (!itemName) continue;
    const ratingText = await textOf(card, SEL.itemStoreRating);
    const etaText = await textOf(card, SEL.itemStoreEta);
    const etaMatch = etaText.match(/(\d+)/);
    candidates.push({
      id: `cand-${index}`,
      itemName,
      description: await textOf(card, SEL.itemDescription),
      priceCents: parseMoneyToCents(await textOf(card, SEL.itemPrice)),
      restaurant: await textOf(card, SEL.itemStoreName),
      rating: ratingText ? Number.parseFloat(ratingText) : null,
      etaMinutes: etaMatch ? Number.parseInt(etaMatch[1], 10) : null,
    });
  }
  return candidates;
}

export async function extractCartSummary(page: Page): Promise<CartSummary> {
  const lines = await page.locator(SEL.cartLine).all();
  const items = [];
  for (const line of lines) {
    const priceCents = parseMoneyToCents(await textOf(line, SEL.cartLinePrice));
    items.push({
      name: await textOf(line, SEL.cartLineName),
      quantity: Number.parseInt((await textOf(line, SEL.cartLineQuantity)) || '1', 10),
      priceCents: priceCents ?? 0,
    });
  }
  const subtotalCents = parseMoneyToCents(await textOf(page, SEL.cartSubtotal));
  const feesCents = parseMoneyToCents(await textOf(page, SEL.cartFees));
  const totalCents = parseMoneyToCents(await textOf(page, SEL.cartTotal));
  if (totalCents === null) {
    throw new Error('Could not read the cart total from the page');
  }
  return {
    restaurant: await textOf(page, SEL.cartStoreName),
    items,
    subtotalCents: subtotalCents ?? 0,
    feesCents: feesCents ?? 0,
    totalCents,
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/doordash/extract.test.ts`
Expected: 2 tests PASS (this launches a real headless Chromium; the 30s vitest timeout from Task 1 covers it).

- [ ] **Step 7: Commit**

```bash
git add src/doordash/selectors.ts src/doordash/browser.ts src/doordash/extract.ts src/doordash/extract.test.ts
git commit -m "feat: DoorDash browser harness, centralized selectors, fixture-tested extraction"
```

---

### Task 10: DoorDash automation steps

**Files:**
- Create: `src/doordash/automation.ts`

These are the live-site steps. They compose the tested extraction functions and the `bestMatch` utility; the Playwright click-flow itself cannot be meaningfully unit-tested without the live site, so its correctness is validated in Task 13 (manual dry-run verification) — that task is **mandatory**, not optional. Every step screenshots on failure and wraps errors in `StepError` so the orchestrator can report which step broke.

- [ ] **Step 1: Implement the automation** — `src/doordash/automation.ts`

```ts
import type { BrowserContext, Page } from 'playwright';
import type { Candidate, CartSummary, ParsedRequest } from '../types.js';
import { bestMatch } from '../lib/text.js';
import { saveScreenshot, StepError } from './browser.js';
import { extractCandidates, extractCartSummary } from './extract.js';
import { SEL } from './selectors.js';

export interface DoorDashAutomation {
  buildCartForSpecific(parsed: ParsedRequest): Promise<CartSummary>;
  discover(dish: string): Promise<Candidate[]>;
  buildCartForCandidate(candidate: Candidate, quantity: number): Promise<CartSummary>;
  placeOrder(): Promise<void>;
}

interface AutomationOptions {
  screenshotDir: string;
  navTimeoutMs?: number;
}

const BASE = 'https://www.doordash.com';

export function createDoorDashAutomation(
  context: BrowserContext,
  options: AutomationOptions,
): DoorDashAutomation {
  const navTimeout = options.navTimeoutMs ?? 30_000;
  let page: Page | undefined;

  async function getPage(): Promise<Page> {
    if (!page || page.isClosed()) {
      page = context.pages()[0] ?? (await context.newPage());
      page.setDefaultTimeout(navTimeout);
    }
    return page;
  }

  async function runStep<T>(step: string, fn: (p: Page) => Promise<T>): Promise<T> {
    const p = await getPage();
    try {
      const result = await fn(p);
      await saveScreenshot(p, options.screenshotDir, `${step}-ok`);
      return result;
    } catch (error) {
      const shot = await saveScreenshot(p, options.screenshotDir, `${step}-failed`).catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      throw new StepError(step, message, shot);
    }
  }

  async function searchRestaurant(p: Page, restaurant: string): Promise<void> {
    await p.goto(`${BASE}/search/store/${encodeURIComponent(restaurant)}`, { waitUntil: 'domcontentloaded' });
    const cards = p.locator(SEL.storeCard);
    await cards.first().waitFor();
    const names = await cards.locator(SEL.storeCardName).allTextContents();
    const match = bestMatch(restaurant, names.map((name, index) => ({ name, index })), (o) => o.name);
    if (!match) throw new Error(`No store matching "${restaurant}" in search results`);
    await cards.nth(match.index).click();
    await p.waitForLoadState('domcontentloaded');
  }

  async function addItemToCart(p: Page, itemName: string, quantity: number): Promise<void> {
    const cards = p.locator(SEL.itemSearchCard);
    await cards.first().waitFor();
    const names = await cards.locator(SEL.itemName).allTextContents();
    const match = bestMatch(itemName, names.map((name, index) => ({ name, index })), (o) => o.name);
    if (!match) throw new Error(`No menu item matching "${itemName}"`);
    await cards.nth(match.index).click();
    for (let i = 1; i < quantity; i += 1) {
      await p.locator(SEL.itemModalQuantityUp).click();
    }
    await p.locator(SEL.itemModalAddToCart).click();
  }

  async function readCart(p: Page): Promise<CartSummary> {
    await p.locator(SEL.cartOpenButton).click();
    await p.locator(SEL.cartLine).first().waitFor();
    return extractCartSummary(p);
  }

  return {
    async buildCartForSpecific(parsed: ParsedRequest): Promise<CartSummary> {
      if (!parsed.restaurant) {
        throw new StepError('searchRestaurant', 'Parsed request has no restaurant');
      }
      await runStep('searchRestaurant', (p) => searchRestaurant(p, parsed.restaurant!));
      for (const item of parsed.items) {
        await runStep('matchMenuItem', (p) => addItemToCart(p, item.name, item.quantity));
      }
      return runStep('buildCart', (p) => readCart(p));
    },

    async discover(dish: string): Promise<Candidate[]> {
      return runStep('discoverItems', async (p) => {
        await p.goto(`${BASE}/search/${encodeURIComponent(dish)}`, { waitUntil: 'domcontentloaded' });
        await p.locator(SEL.itemSearchCard).first().waitFor();
        const candidates = await extractCandidates(p);
        return candidates.slice(0, 10);
      });
    },

    async buildCartForCandidate(candidate: Candidate, quantity: number): Promise<CartSummary> {
      await runStep('searchRestaurant', (p) => searchRestaurant(p, candidate.restaurant));
      await runStep('matchMenuItem', (p) => addItemToCart(p, candidate.itemName, quantity));
      return runStep('buildCart', (p) => readCart(p));
    },

    // The ONLY step that spends money. Callers (the orchestrator) gate it
    // behind explicit user confirmation and the DRY_RUN flag.
    async placeOrder(): Promise<void> {
      await runStep('placeOrder', async (p) => {
        await p.locator(SEL.checkoutButton).click();
        await p.locator(SEL.placeOrderButton).waitFor();
        await p.locator(SEL.placeOrderButton).click();
        await p.waitForLoadState('networkidle');
      });
    },
  };
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Run the full suite to confirm nothing regressed**

Run: `npm test`
Expected: all tests from Tasks 2–9 still PASS.

- [ ] **Step 4: Commit**

```bash
git add src/doordash/automation.ts
git commit -m "feat: DoorDash automation steps with screenshots and step-scoped errors"
```

---

### Task 11: Orchestrator

**Files:**
- Create: `src/orchestrator.ts`
- Test: `src/orchestrator.test.ts`

The orchestrator is the heart of the system: it routes parsed requests into the clarify / suggest / build flows, gates checkout behind confirm + dry-run, and expires stale orders. Everything is injected, so tests use fakes and run in milliseconds.

- [ ] **Step 1: Write the failing test** — `src/orchestrator.test.ts`

```ts
import { describe, expect, test, vi } from 'vitest';
import { Orchestrator, type OrchestratorDeps } from './orchestrator.js';
import { OrderStore } from './orders/store.js';
import type { Candidate, CartSummary, ParsedRequest } from './types.js';

const cart: CartSummary = {
  restaurant: "McDonald's",
  items: [{ name: 'McChicken', quantity: 1, priceCents: 349 }],
  subtotalCents: 349,
  feesCents: 493,
  totalCents: 842,
};

const specific = (confidence: number, clarify: ParsedRequest['clarify'] = null): ParsedRequest => ({
  mode: 'specific',
  items: [{ name: 'McChicken', quantity: 1 }],
  restaurant: "McDonald's",
  flavorNotes: [],
  confidence,
  clarify,
});

const category: ParsedRequest = {
  mode: 'category',
  items: [{ name: 'chicken sandwich', quantity: 1 }],
  restaurant: null,
  flavorNotes: ['spicy'],
  confidence: 0.9,
  clarify: null,
};

const candidates: Candidate[] = [
  { id: 'c1', itemName: 'Spicy Chicken Deluxe', description: '', priceCents: 749, restaurant: 'Chick-fil-A', rating: 4.8, etaMinutes: 15 },
];

function makeDeps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    store: new OrderStore(),
    parse: vi.fn().mockResolvedValue(specific(0.95)),
    rank: vi.fn().mockResolvedValue(candidates.map((c) => ({ ...c, reason: 'Best fit.' }))),
    notifier: { send: vi.fn().mockResolvedValue(undefined) },
    automation: {
      buildCartForSpecific: vi.fn().mockResolvedValue(cart),
      discover: vi.fn().mockResolvedValue(candidates),
      buildCartForCandidate: vi.fn().mockResolvedValue(cart),
      placeOrder: vi.fn().mockResolvedValue(undefined),
    },
    config: { CONFIDENCE_THRESHOLD: 0.8, MAX_ORDER_CENTS: 5000, DRY_RUN: true, EXPIRY_MINUTES: 10 },
    ...overrides,
  };
}

describe('Orchestrator', () => {
  test('high-confidence specific request goes straight to awaiting_confirmation with a review notification', async () => {
    const deps = makeDeps();
    const orchestrator = new Orchestrator(deps);
    const order = orchestrator.startOrder('I want one McChicken');
    await orchestrator.settle();

    const final = deps.store.get(order.id)!;
    expect(final.state).toBe('awaiting_confirmation');
    expect(final.cart?.totalCents).toBe(842);
    expect(deps.notifier.send).toHaveBeenCalledWith(
      expect.objectContaining({ deepLink: `orderup://review/${order.id}` }),
    );
  });

  test('low-confidence specific request asks a clarifying question first', async () => {
    const clarify = {
      question: 'Which McChicken?',
      choices: [
        { id: 'a', label: 'Classic', refinedUtterance: 'one classic McChicken from McDonald’s' },
        { id: 'b', label: 'Spicy', refinedUtterance: 'one Hot ’n Spicy McChicken from McDonald’s' },
      ],
    };
    const deps = makeDeps({ parse: vi.fn().mockResolvedValue(specific(0.4, clarify)) });
    const orchestrator = new Orchestrator(deps);
    const order = orchestrator.startOrder('mcchicken');
    await orchestrator.settle();

    expect(deps.store.get(order.id)!.state).toBe('clarifying');
    expect(deps.automation.buildCartForSpecific).not.toHaveBeenCalled();

    // Answering the question re-parses the refined utterance and builds the cart.
    (deps.parse as ReturnType<typeof vi.fn>).mockResolvedValue(specific(0.95));
    await orchestrator.handleChoice(order.id, 'b');
    expect(deps.store.get(order.id)!.state).toBe('awaiting_confirmation');
  });

  test('category request runs discovery and lands in suggesting', async () => {
    const deps = makeDeps({ parse: vi.fn().mockResolvedValue(category) });
    const orchestrator = new Orchestrator(deps);
    const order = orchestrator.startOrder('I want a chicken sandwich');
    await orchestrator.settle();

    const state = deps.store.get(order.id)!;
    expect(state.state).toBe('suggesting');
    expect(state.suggestions).toHaveLength(1);
    expect(deps.rank).toHaveBeenCalledWith('I want a chicken sandwich', ['spicy'], candidates);

    // Picking a suggestion builds the cart for that candidate.
    await orchestrator.handleChoice(order.id, 'c1');
    expect(deps.automation.buildCartForCandidate).toHaveBeenCalled();
    expect(deps.store.get(order.id)!.state).toBe('awaiting_confirmation');
  });

  test('confirm in dry-run mode marks placed without calling placeOrder', async () => {
    const deps = makeDeps();
    const orchestrator = new Orchestrator(deps);
    const order = orchestrator.startOrder('one mcchicken');
    await orchestrator.settle();

    await orchestrator.confirm(order.id);
    expect(deps.automation.placeOrder).not.toHaveBeenCalled();
    expect(deps.store.get(order.id)!.state).toBe('placed');
    expect(deps.store.get(order.id)!.dryRun).toBe(true);
  });

  test('confirm in live mode calls placeOrder', async () => {
    const deps = makeDeps({ config: { CONFIDENCE_THRESHOLD: 0.8, MAX_ORDER_CENTS: 5000, DRY_RUN: false, EXPIRY_MINUTES: 10 } });
    const orchestrator = new Orchestrator(deps);
    const order = orchestrator.startOrder('one mcchicken');
    await orchestrator.settle();

    await orchestrator.confirm(order.id);
    expect(deps.automation.placeOrder).toHaveBeenCalledOnce();
    expect(deps.store.get(order.id)!.state).toBe('placed');
  });

  test('confirm requires acknowledgement when the cart is over the cap', async () => {
    const bigCart = { ...cart, totalCents: 9900 };
    const deps = makeDeps({
      automation: {
        buildCartForSpecific: vi.fn().mockResolvedValue(bigCart),
        discover: vi.fn(),
        buildCartForCandidate: vi.fn(),
        placeOrder: vi.fn(),
      },
    });
    const orchestrator = new Orchestrator(deps);
    const order = orchestrator.startOrder('feast');
    await orchestrator.settle();

    expect(deps.store.get(order.id)!.overCap).toBe(true);
    await expect(orchestrator.confirm(order.id)).rejects.toThrow(/spending cap/);
    await orchestrator.confirm(order.id, true);
    expect(deps.store.get(order.id)!.state).toBe('placed');
  });

  test('automation failure lands in failed with the step error and a notification', async () => {
    const deps = makeDeps({
      automation: {
        buildCartForSpecific: vi.fn().mockRejectedValue(new Error('matchMenuItem: No menu item matching "McChicken"')),
        discover: vi.fn(),
        buildCartForCandidate: vi.fn(),
        placeOrder: vi.fn(),
      },
    });
    const orchestrator = new Orchestrator(deps);
    const order = orchestrator.startOrder('one mcchicken');
    await orchestrator.settle();

    const final = deps.store.get(order.id)!;
    expect(final.state).toBe('failed');
    expect(final.error).toMatch(/matchMenuItem/);
    expect(deps.notifier.send).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/Couldn't complete/) }),
    );
  });

  test('expireStale expires overdue awaiting orders and notifies', async () => {
    const deps = makeDeps({ now: () => new Date(Date.now() + 11 * 60_000) });
    const orchestrator = new Orchestrator(deps);
    const order = orchestrator.startOrder('one mcchicken');
    await orchestrator.settle();

    const expired = await orchestrator.expireStale();
    expect(expired.map((o) => o.id)).toEqual([order.id]);
    expect(deps.store.get(order.id)!.state).toBe('expired');
  });

  test('cancel moves an awaiting order to cancelled', async () => {
    const deps = makeDeps();
    const orchestrator = new Orchestrator(deps);
    const order = orchestrator.startOrder('one mcchicken');
    await orchestrator.settle();

    await orchestrator.cancel(order.id);
    expect(deps.store.get(order.id)!.state).toBe('cancelled');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/orchestrator.test.ts`
Expected: FAIL — cannot resolve `./orchestrator.js`.

- [ ] **Step 3: Implement** — `src/orchestrator.ts`

```ts
import type { DoorDashAutomation } from './doordash/automation.js';
import { formatCents } from './lib/text.js';
import type { Notifier } from './notify/notifier.js';
import type { OrderStore } from './orders/store.js';
import type { Candidate, CartSummary, Order, ParsedRequest, RankedSuggestion } from './types.js';

export interface OrchestratorConfig {
  CONFIDENCE_THRESHOLD: number;
  MAX_ORDER_CENTS: number;
  DRY_RUN: boolean;
  EXPIRY_MINUTES: number;
}

export interface OrchestratorDeps {
  store: OrderStore;
  parse: (utterance: string) => Promise<ParsedRequest>;
  rank: (utterance: string, flavorNotes: string[], candidates: Candidate[]) => Promise<RankedSuggestion[]>;
  notifier: Notifier;
  automation: DoorDashAutomation;
  config: OrchestratorConfig;
  now?: () => Date;
}

const EXPIRABLE_STATES = ['clarifying', 'suggesting', 'awaiting_confirmation'];

export class Orchestrator {
  private inFlight: Promise<unknown> = Promise.resolve();

  constructor(private deps: OrchestratorDeps) {}

  /** Creates the order and kicks off async processing; returns immediately. */
  startOrder(utterance: string): Order {
    const order = this.deps.store.create(utterance);
    this.inFlight = this.processUtterance(order.id, utterance).catch(() => {});
    return order;
  }

  /** Test helper / graceful-shutdown hook: waits for background processing. */
  async settle(): Promise<void> {
    await this.inFlight;
  }

  async processUtterance(orderId: string, utterance: string): Promise<Order> {
    const { store, config } = this.deps;
    try {
      store.advance(orderId, 'parsing');
      const parsed = await this.deps.parse(utterance);
      if (parsed.mode === 'category') {
        return await this.runDiscovery(orderId, utterance, parsed);
      }
      if (parsed.confidence < config.CONFIDENCE_THRESHOLD && parsed.clarify) {
        const order = store.advance(orderId, 'clarifying', { parsed, expiresAt: this.expiry() });
        await this.deps.notifier.send({
          title: 'Quick question about your order',
          body: parsed.clarify.question,
          deepLink: `orderup://clarify/${orderId}`,
          priority: 'high',
        });
        return order;
      }
      return await this.buildCart(orderId, { parsed }, () =>
        this.deps.automation.buildCartForSpecific(parsed),
      );
    } catch (error) {
      return this.fail(orderId, error);
    }
  }

  async handleChoice(orderId: string, choiceId: string): Promise<Order> {
    const { store } = this.deps;
    const order = store.get(orderId);
    if (!order) throw new Error(`Unknown order: ${orderId}`);
    try {
      if (order.state === 'clarifying') {
        const choice = order.parsed?.clarify?.choices.find((c) => c.id === choiceId);
        if (!choice) throw new Error(`Unknown choice: ${choiceId}`);
        store.advance(orderId, 'parsing');
        const parsed = await this.deps.parse(choice.refinedUtterance);
        return await this.buildCart(orderId, { parsed }, () =>
          this.deps.automation.buildCartForSpecific(parsed),
        );
      }
      if (order.state === 'suggesting') {
        const suggestion = order.suggestions?.find((s) => s.id === choiceId);
        if (!suggestion) throw new Error(`Unknown suggestion: ${choiceId}`);
        const quantity = order.parsed?.items[0]?.quantity ?? 1;
        return await this.buildCart(orderId, {}, () =>
          this.deps.automation.buildCartForCandidate(suggestion, quantity),
        );
      }
      throw new Error(`Order is not awaiting a choice (state: ${order.state})`);
    } catch (error) {
      return this.fail(orderId, error);
    }
  }

  async confirm(orderId: string, acknowledgeOverCap = false): Promise<Order> {
    const { store, config } = this.deps;
    const order = store.get(orderId);
    if (!order) throw new Error(`Unknown order: ${orderId}`);
    if (order.state !== 'awaiting_confirmation') {
      throw new Error(`Order is not awaiting confirmation (state: ${order.state})`);
    }
    if (order.overCap && !acknowledgeOverCap) {
      throw new Error('Order exceeds the spending cap; re-confirm with acknowledgeOverCap');
    }
    store.advance(orderId, 'placing');
    try {
      if (!config.DRY_RUN) {
        await this.deps.automation.placeOrder();
      }
      const placed = store.advance(orderId, 'placed', { dryRun: config.DRY_RUN });
      await this.deps.notifier.send({
        title: config.DRY_RUN ? 'Dry run — order NOT placed' : 'Order placed!',
        body: `${order.cart ? formatCents(order.cart.totalCents) : ''} — ${order.cart?.restaurant ?? ''}`,
        deepLink: `orderup://order/${orderId}`,
      });
      return placed;
    } catch (error) {
      return this.fail(orderId, error);
    }
  }

  async cancel(orderId: string): Promise<Order> {
    return this.deps.store.advance(orderId, 'cancelled');
  }

  async expireStale(): Promise<Order[]> {
    const now = (this.deps.now ?? (() => new Date()))();
    const expired: Order[] = [];
    for (const order of this.deps.store.list()) {
      const overdue = order.expiresAt && new Date(order.expiresAt) < now;
      if (overdue && EXPIRABLE_STATES.includes(order.state)) {
        expired.push(this.deps.store.advance(order.id, 'expired'));
      }
    }
    for (const order of expired) {
      await this.deps.notifier.send({
        title: 'Order expired',
        body: `"${order.utterance}" timed out without confirmation.`,
        deepLink: `orderup://order/${order.id}`,
      });
    }
    return expired;
  }

  private async runDiscovery(orderId: string, utterance: string, parsed: ParsedRequest): Promise<Order> {
    const dish = parsed.items[0]?.name ?? utterance;
    const candidates = await this.deps.automation.discover(dish);
    if (candidates.length === 0) throw new Error(`No results found for "${dish}"`);
    const suggestions = await this.deps.rank(utterance, parsed.flavorNotes, candidates);
    const order = this.deps.store.advance(orderId, 'suggesting', {
      parsed,
      suggestions,
      expiresAt: this.expiry(),
    });
    await this.deps.notifier.send({
      title: `Found ${suggestions.length} options for "${dish}"`,
      body: suggestions.map((s) => `${s.itemName} — ${s.restaurant}`).join('\n'),
      deepLink: `orderup://suggest/${orderId}`,
      priority: 'high',
    });
    return order;
  }

  private async buildCart(
    orderId: string,
    patch: Partial<Order>,
    build: () => Promise<CartSummary>,
  ): Promise<Order> {
    this.deps.store.advance(orderId, 'building_cart', patch);
    const cart = await build();
    const overCap = cart.totalCents > this.deps.config.MAX_ORDER_CENTS;
    const order = this.deps.store.advance(orderId, 'awaiting_confirmation', {
      cart,
      overCap,
      expiresAt: this.expiry(),
    });
    const summary = cart.items.map((i) => `${i.quantity}× ${i.name}`).join(', ');
    await this.deps.notifier.send({
      title: `Review your order — ${formatCents(cart.totalCents)}`,
      body: `${summary} from ${cart.restaurant}${overCap ? ' (over your spending cap!)' : ''}`,
      deepLink: `orderup://review/${orderId}`,
      priority: 'high',
    });
    return order;
  }

  private fail(orderId: string, error: unknown): Order {
    const message = error instanceof Error ? error.message : String(error);
    const order = this.deps.store.advance(orderId, 'failed', { error: message });
    void this.deps.notifier
      .send({
        title: "Couldn't complete your order",
        body: message,
        deepLink: `orderup://order/${orderId}`,
      })
      .catch(() => {});
    return order;
  }

  private expiry(): string {
    const now = (this.deps.now ?? (() => new Date()))();
    return new Date(now.getTime() + this.deps.config.EXPIRY_MINUTES * 60_000).toISOString();
  }
}
```

**Note on the expiry test:** `expireStale` uses `deps.now()` for "current time" while `expiry()` also uses `deps.now()` when stamping. To make the test deterministic, `expiry()` must stamp from the *real* order-creation moment. The test injects `now` only for the sweep — so in `expiry()`, use `new Date()` directly instead of `deps.now()`:

```ts
  private expiry(): string {
    return new Date(Date.now() + this.deps.config.EXPIRY_MINUTES * 60_000).toISOString();
  }
```

Use this second version — the injected `now` is only for `expireStale`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/orchestrator.test.ts`
Expected: 9 tests PASS.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: everything PASSES.

- [ ] **Step 6: Commit**

```bash
git add src/orchestrator.ts src/orchestrator.test.ts
git commit -m "feat: orchestrator with clarify/suggest/confirm flows, spending cap, expiry"
```

---

### Task 12: HTTP server

**Files:**
- Create: `src/server.ts`
- Test: `src/server.test.ts`

All mutating routes ACK fast (the cart build takes ~30–60s of Playwright time); the app polls `GET /orders/:id` for progress. Every route requires the bearer token.

- [ ] **Step 1: Write the failing test** — `src/server.test.ts`

```ts
import { describe, expect, test, vi } from 'vitest';
import { buildServer } from './server.js';
import { Orchestrator, type OrchestratorDeps } from './orchestrator.js';
import { OrderStore } from './orders/store.js';
import type { CartSummary, ParsedRequest } from './types.js';

const TOKEN = 'test-token-1234567890';

const cart: CartSummary = {
  restaurant: "McDonald's",
  items: [{ name: 'McChicken', quantity: 1, priceCents: 349 }],
  subtotalCents: 349,
  feesCents: 493,
  totalCents: 842,
};

const parsed: ParsedRequest = {
  mode: 'specific',
  items: [{ name: 'McChicken', quantity: 1 }],
  restaurant: "McDonald's",
  flavorNotes: [],
  confidence: 0.95,
  clarify: null,
};

function makeApp() {
  const store = new OrderStore();
  const deps: OrchestratorDeps = {
    store,
    parse: vi.fn().mockResolvedValue(parsed),
    rank: vi.fn(),
    notifier: { send: vi.fn().mockResolvedValue(undefined) },
    automation: {
      buildCartForSpecific: vi.fn().mockResolvedValue(cart),
      discover: vi.fn(),
      buildCartForCandidate: vi.fn(),
      placeOrder: vi.fn().mockResolvedValue(undefined),
    },
    config: { CONFIDENCE_THRESHOLD: 0.8, MAX_ORDER_CENTS: 5000, DRY_RUN: true, EXPIRY_MINUTES: 10 },
  };
  const orchestrator = new Orchestrator(deps);
  const app = buildServer({ orchestrator, store, authToken: TOKEN });
  return { app, store, orchestrator };
}

const auth = { authorization: `Bearer ${TOKEN}` };

describe('HTTP server', () => {
  test('rejects requests without the bearer token', async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: 'GET', url: '/orders' });
    expect(res.statusCode).toBe(401);
  });

  test('POST /orders creates an order and returns 202 immediately', async () => {
    const { app, store, orchestrator } = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: auth,
      payload: { utterance: 'I want one McChicken' },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.state).toBe('received');

    await orchestrator.settle();
    expect(store.get(body.data.id)!.state).toBe('awaiting_confirmation');
  });

  test('POST /orders with empty utterance is a 400', async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: 'POST', url: '/orders', headers: auth, payload: { utterance: '' } });
    expect(res.statusCode).toBe(400);
  });

  test('POST /orders while one is in flight is a 409', async () => {
    const { app } = makeApp();
    await app.inject({ method: 'POST', url: '/orders', headers: auth, payload: { utterance: 'one mcchicken' } });
    const res = await app.inject({ method: 'POST', url: '/orders', headers: auth, payload: { utterance: 'a big mac' } });
    expect(res.statusCode).toBe(409);
  });

  test('GET /orders/:id returns the order; 404 for unknown', async () => {
    const { app, orchestrator } = makeApp();
    const created = await app.inject({ method: 'POST', url: '/orders', headers: auth, payload: { utterance: 'one mcchicken' } });
    const id = created.json().data.id;
    await orchestrator.settle();

    const res = await app.inject({ method: 'GET', url: `/orders/${id}`, headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.state).toBe('awaiting_confirmation');

    const missing = await app.inject({ method: 'GET', url: '/orders/nope', headers: auth });
    expect(missing.statusCode).toBe(404);
  });

  test('POST /orders/:id/confirm ACKs with 202 and places (dry run)', async () => {
    const { app, store, orchestrator } = makeApp();
    const created = await app.inject({ method: 'POST', url: '/orders', headers: auth, payload: { utterance: 'one mcchicken' } });
    const id = created.json().data.id;
    await orchestrator.settle();

    const res = await app.inject({ method: 'POST', url: `/orders/${id}/confirm`, headers: auth, payload: {} });
    expect(res.statusCode).toBe(202);
    await orchestrator.settle();
    expect(store.get(id)!.state).toBe('placed');
  });

  test('confirm on an over-cap order without acknowledgement is a 400', async () => {
    const { app, store, orchestrator } = makeApp();
    const created = await app.inject({ method: 'POST', url: '/orders', headers: auth, payload: { utterance: 'one mcchicken' } });
    const id = created.json().data.id;
    await orchestrator.settle();
    // Force the over-cap flag for the test.
    const order = store.get(id)!;
    (order as { overCap?: boolean }).overCap = true;

    const res = await app.inject({ method: 'POST', url: `/orders/${id}/confirm`, headers: auth, payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/spending cap/);
  });

  test('POST /orders/:id/cancel cancels an awaiting order', async () => {
    const { app, store, orchestrator } = makeApp();
    const created = await app.inject({ method: 'POST', url: '/orders', headers: auth, payload: { utterance: 'one mcchicken' } });
    const id = created.json().data.id;
    await orchestrator.settle();

    const res = await app.inject({ method: 'POST', url: `/orders/${id}/cancel`, headers: auth });
    expect(res.statusCode).toBe(200);
    expect(store.get(id)!.state).toBe('cancelled');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server.test.ts`
Expected: FAIL — cannot resolve `./server.js`.

- [ ] **Step 3: Implement** — `src/server.ts`

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Orchestrator } from './orchestrator.js';
import type { OrderStore } from './orders/store.js';

interface ServerDeps {
  orchestrator: Orchestrator;
  store: OrderStore;
  authToken: string;
}

const createOrderBody = z.object({ utterance: z.string().trim().min(1) });
const chooseBody = z.object({ choiceId: z.string().min(1) });
const confirmBody = z.object({ acknowledgeOverCap: z.boolean().optional() });

function envelope<T>(data: T) {
  return { success: true, data, error: null };
}

function failure(error: string) {
  return { success: false, data: null, error };
}

export function buildServer({ orchestrator, store, authToken }: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: true });

  app.addHook('onRequest', async (request, reply) => {
    if (request.headers.authorization !== `Bearer ${authToken}`) {
      await reply.code(401).send(failure('unauthorized'));
    }
  });

  app.post('/orders', async (request, reply) => {
    const body = createOrderBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send(failure('utterance is required'));
    try {
      const order = orchestrator.startOrder(body.data.utterance);
      return reply.code(202).send(envelope(order));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(409).send(failure(message));
    }
  });

  app.get('/orders', async () => envelope(store.list()));

  app.get('/orders/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const order = store.get(id);
    if (!order) return reply.code(404).send(failure('order not found'));
    return envelope(order);
  });

  app.post('/orders/:id/choose', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = chooseBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send(failure('choiceId is required'));
    const order = store.get(id);
    if (!order) return reply.code(404).send(failure('order not found'));
    if (order.state !== 'clarifying' && order.state !== 'suggesting') {
      return reply.code(409).send(failure(`order is not awaiting a choice (state: ${order.state})`));
    }
    void orchestrator.handleChoice(id, body.data.choiceId).catch(() => {});
    return reply.code(202).send(envelope(order));
  });

  app.post('/orders/:id/confirm', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = confirmBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(failure('invalid body'));
    const order = store.get(id);
    if (!order) return reply.code(404).send(failure('order not found'));
    if (order.state !== 'awaiting_confirmation') {
      return reply.code(409).send(failure(`order is not awaiting confirmation (state: ${order.state})`));
    }
    if (order.overCap && !body.data.acknowledgeOverCap) {
      return reply.code(400).send(failure('order exceeds the spending cap; re-confirm with acknowledgeOverCap'));
    }
    void orchestrator.confirm(id, body.data.acknowledgeOverCap ?? false).catch(() => {});
    return reply.code(202).send(envelope(order));
  });

  app.post('/orders/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    const order = store.get(id);
    if (!order) return reply.code(404).send(failure('order not found'));
    try {
      const cancelled = await orchestrator.cancel(id);
      return envelope(cancelled);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(409).send(failure(message));
    }
  });

  return app;
}
```

**Note for the `confirm` test to pass:** the server fires `orchestrator.confirm()` without awaiting, but the test calls `orchestrator.settle()` to wait. So `confirm`'s promise must be tracked in `inFlight`. In `src/orchestrator.ts`, the server-facing async entry points need tracking. Add this small method to `Orchestrator` and have the server use it instead of raw `.catch()` calls:

```ts
  /** Fire-and-forget wrapper that keeps settle() accurate. */
  track<T>(promise: Promise<T>): void {
    this.inFlight = promise.catch(() => {});
  }
```

Then in `server.ts` use `orchestrator.track(orchestrator.handleChoice(id, body.data.choiceId));` and `orchestrator.track(orchestrator.confirm(id, body.data.acknowledgeOverCap ?? false));` in place of the `void ... .catch()` lines.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server.test.ts`
Expected: 8 tests PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test && npm run typecheck`
Expected: everything PASSES.

- [ ] **Step 6: Commit**

```bash
git add src/server.ts src/server.test.ts src/orchestrator.ts
git commit -m "feat: authenticated HTTP API with fast-ACK order routes"
```

---

### Task 13: Entrypoint, login script, and expiry sweeper

**Files:**
- Create: `src/index.ts`
- Create: `scripts/login.ts`

- [ ] **Step 1: Create the entrypoint** — `src/index.ts`

```ts
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from './config.js';
import { launchSession } from './doordash/browser.js';
import { createDoorDashAutomation } from './doordash/automation.js';
import { createNtfyNotifier } from './notify/ntfy.js';
import { Orchestrator } from './orchestrator.js';
import { OrderStore } from './orders/store.js';
import { createParser } from './parser/parser.js';
import { createRanker } from './ranking/ranker.js';
import { buildServer } from './server.js';

const SWEEP_INTERVAL_MS = 30_000;

async function main(): Promise<void> {
  const config = loadConfig();
  const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

  const context = await launchSession(config.USER_DATA_DIR, config.HEADLESS);
  const automation = createDoorDashAutomation(context, { screenshotDir: config.SCREENSHOT_DIR });

  const store = new OrderStore(config.DATA_FILE);
  const orchestrator = new Orchestrator({
    store,
    parse: createParser(anthropic, config.ANTHROPIC_MODEL),
    rank: createRanker(anthropic, config.ANTHROPIC_MODEL),
    notifier: createNtfyNotifier(config.NTFY_URL, config.NTFY_TOPIC),
    automation,
    config,
  });

  const sweeper = setInterval(() => {
    orchestrator.expireStale().catch((error) => {
      console.error('expiry sweep failed:', error);
    });
  }, SWEEP_INTERVAL_MS);

  const app = buildServer({ orchestrator, store, authToken: config.AUTH_TOKEN });
  await app.listen({ port: config.PORT, host: config.BIND_HOST });
  console.log(
    `OrderUp backend listening on ${config.BIND_HOST}:${config.PORT} ` +
      `(dry run: ${config.DRY_RUN ? 'ON — no real orders' : 'OFF — REAL ORDERS WILL BE PLACED'})`,
  );

  const shutdown = async () => {
    clearInterval(sweeper);
    await app.close();
    await context.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Fatal:', error);
  process.exit(1);
});
```

- [ ] **Step 2: Create the one-time login script** — `scripts/login.ts`

```ts
import { loadConfig } from '../src/config.js';
import { launchSession } from '../src/doordash/browser.js';

const config = loadConfig();
const context = await launchSession(config.USER_DATA_DIR, false);
const page = context.pages()[0] ?? (await context.newPage());
await page.goto('https://www.doordash.com/');

console.log('');
console.log('A browser window is open. Log in to DoorDash, verify your saved');
console.log(`address and payment method, then press Ctrl+C here. The session`);
console.log(`persists in ${config.USER_DATA_DIR} and the backend will reuse it.`);
```

- [ ] **Step 3: Verify it boots**

Create a local `.env` from `.env.example` (fill in `AUTH_TOKEN` and `ANTHROPIC_API_KEY`), then:

Run: `set -a && source .env && set +a && npm run dev`
Expected: Chromium opens, the server logs `OrderUp backend listening on 127.0.0.1:4741 (dry run: ON — no real orders)`. Ctrl+C exits cleanly.

Then verify the API answers:

Run: `curl -s -H "Authorization: Bearer $AUTH_TOKEN" http://127.0.0.1:4741/orders`
Expected: `{"success":true,"data":[],"error":null}`

- [ ] **Step 4: Run the full suite one more time**

Run: `npm test && npm run typecheck`
Expected: everything PASSES.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts scripts/login.ts
git commit -m "feat: entrypoint wiring, expiry sweeper, and DoorDash login script"
```

---

### Task 14: Live verification (MANDATORY — requires a human)

**Files:**
- Modify: `src/doordash/selectors.ts` (selector corrections against the live site)
- Create: `README.md`

This task validates the Playwright steps against the real doordash.com and fixes selector guesses from Task 9. **It never spends money** — `DRY_RUN=true` throughout, and `placeOrder` is not exercised beyond reaching the checkout page. The human (Aryan) must be present.

- [ ] **Step 1: Install and start ntfy locally**

```bash
brew install ntfy
ntfy serve --listen-http :8090 &
```

Subscribe to the `orderup` topic in the ntfy iOS app (server `http://<mac-tailscale-ip>:8090`) or watch `curl -s http://127.0.0.1:8090/orderup/json` in a terminal.

- [ ] **Step 2: Log in to DoorDash once**

Run: `set -a && source .env && set +a && npm run login`
Human logs in, confirms saved address + payment, Ctrl-C.

- [ ] **Step 3: Dry-run a specific order end-to-end**

With the backend running (`npm run dev`, `DRY_RUN=true`, `HEADLESS=false` so the human can watch):

```bash
curl -s -X POST http://127.0.0.1:4741/orders \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"utterance": "I want one McChicken"}'
```

Watch the browser drive DoorDash. Expected outcome: order reaches `awaiting_confirmation` (check `GET /orders/:id`), a review notification arrives via ntfy with the real cart total.

**When a step fails** (very likely on first run — the Task 9 selectors are best guesses): read the `StepError` in the failure notification and server log, open the matching screenshot in `./screenshots/`, inspect the live DOM in the headed browser (DevTools), correct the selector in `src/doordash/selectors.ts` only, and repeat this step. Commit each working selector set as you go:

```bash
git add src/doordash/selectors.ts
git commit -m "fix: verify DoorDash selectors against live site (search/menu/cart)"
```

- [ ] **Step 4: Dry-run the confirm flow**

```bash
curl -s -X POST http://127.0.0.1:4741/orders/<ORDER_ID>/confirm \
  -H "Authorization: Bearer $AUTH_TOKEN" -H "Content-Type: application/json" -d '{}'
```

Expected: order state becomes `placed` with `"dryRun": true`, ntfy says "Dry run — order NOT placed", and **no money was spent**.

- [ ] **Step 5: Dry-run a category order**

```bash
curl -s -X POST http://127.0.0.1:4741/orders \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"utterance": "I want a spicy chicken sandwich"}'
```

Expected: order reaches `suggesting`; the notification lists up to 5 ranked options. Then pick one:

```bash
curl -s -X POST http://127.0.0.1:4741/orders/<ORDER_ID>/choose \
  -H "Authorization: Bearer $AUTH_TOKEN" -H "Content-Type: application/json" \
  -d '{"choiceId": "cand-0"}'
```

Expected: cart builds for the chosen candidate → `awaiting_confirmation`. Fix `discoverItems` selectors as in Step 3 if needed.

- [ ] **Step 6: First real order (human decision — money is spent)**

Only after Steps 3–5 pass cleanly, and only if Aryan explicitly wants to: set `DRY_RUN=false` in `.env`, restart, order something cheap, review the total in the notification, confirm, and verify the real DoorDash order appears in the DoorDash app. Then set `DRY_RUN=true` back for day-to-day development.

- [ ] **Step 7: Write `README.md`**

```markdown
# OrderUp Backend

Voice-to-DoorDash ordering backend. Say it → parse (Claude) → cart (Playwright
on your logged-in DoorDash session) → ntfy notification → you confirm → placed.

Spec: `../docs/superpowers/specs/2026-07-02-voice-doordash-ordering-design.md`

## Setup

1. `npm install && npx playwright install chromium`
2. `cp .env.example .env` — set `AUTH_TOKEN` (long random string) and `ANTHROPIC_API_KEY`
3. `brew install ntfy && ntfy serve --listen-http :8090` (subscribe to topic `orderup` in the ntfy app over Tailscale)
4. `npm run login` — log in to DoorDash once; the browser profile persists
5. `npm run dev`

## Safety

- `DRY_RUN=true` (the default) never checks out. Real ordering is opt-in.
- Checkout only happens on `POST /orders/:id/confirm`.
- `MAX_ORDER_CENTS` (default $50) requires `acknowledgeOverCap: true` above the cap.
- Every automation step saves a screenshot to `./screenshots/`.

## API (all routes require `Authorization: Bearer $AUTH_TOKEN`)

| Route | Effect |
|---|---|
| `POST /orders {utterance}` | Start an order (202; one in flight at a time) |
| `GET /orders` / `GET /orders/:id` | History / status polling |
| `POST /orders/:id/choose {choiceId}` | Answer a clarify question or pick a suggestion |
| `POST /orders/:id/confirm {acknowledgeOverCap?}` | Place the order (dry-run aware) |
| `POST /orders/:id/cancel` | Cancel |

## When DoorDash changes their site

Selectors live only in `src/doordash/selectors.ts`. Read the failure
notification (it names the step), open the screenshot, fix the selector,
re-run the Task 14 dry-run flow.
```

- [ ] **Step 8: Final full-suite run and commit**

```bash
npm test && npm run typecheck
git add README.md src/doordash/selectors.ts
git commit -m "docs: backend README; chore: final live-verified selectors"
```

---

## Spec coverage map

| Spec requirement | Task(s) |
|---|---|
| Parser (specific/category, flavorNotes, confidence 0.8, clarify) | 6 |
| Discovery + ranking (rating/ETA/flavor, top 5, reasons) | 7, 9, 10 |
| State machine incl. one-in-flight + 10-min expiry | 3, 5, 11, 13 |
| Playwright steps, isolated, screenshots, dry-run default | 9, 10, 11, 14 |
| ntfy notifier, swappable (APNs later) via `Notifier` interface | 8 |
| Spending cap w/ extra confirmation | 11, 12 |
| Never checkout without explicit confirm | 11 (state machine forbids `building_cart → placing`), 12, 14 |
| Bearer-token auth, Tailscale-only bind (`BIND_HOST`) | 2, 12, 13 |
| Error handling: step failures → `failed` + notification, never silent | 10, 11 |
| Deep links `orderup://…` for the future iOS app | 8, 11 |
```
