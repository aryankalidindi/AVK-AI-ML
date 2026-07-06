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
      openStoreForSpecific: vi.fn().mockResolvedValue(undefined),
      openStoreForCandidate: vi.fn().mockResolvedValue(undefined),
      readCart: vi.fn().mockResolvedValue(cart),
      buildCartForSpecific: vi.fn().mockResolvedValue(cart),
      discover: vi.fn(),
      buildCartForCandidate: vi.fn(),
      placeOrder: vi.fn().mockResolvedValue(undefined),
    },
    config: {
      CART_MODE: 'auto',
      CONFIDENCE_THRESHOLD: 0.8,
      MAX_ORDER_CENTS: 5000,
      DRY_RUN: true,
      EXPIRY_MINUTES: 10,
    },
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
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: auth,
      payload: { utterance: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  test('POST /orders while one is in flight is a 409', async () => {
    const { app } = makeApp();
    await app.inject({
      method: 'POST',
      url: '/orders',
      headers: auth,
      payload: { utterance: 'one mcchicken' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: auth,
      payload: { utterance: 'a big mac' },
    });
    expect(res.statusCode).toBe(409);
  });

  test('GET /orders/:id returns the order; 404 for unknown', async () => {
    const { app, orchestrator } = makeApp();
    const created = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: auth,
      payload: { utterance: 'one mcchicken' },
    });
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
    const created = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: auth,
      payload: { utterance: 'one mcchicken' },
    });
    const id = created.json().data.id;
    await orchestrator.settle();

    const res = await app.inject({
      method: 'POST',
      url: `/orders/${id}/confirm`,
      headers: auth,
      payload: {},
    });
    expect(res.statusCode).toBe(202);
    await orchestrator.settle();
    expect(store.get(id)!.state).toBe('placed');
  });

  test('confirm on an over-cap order without acknowledgement is a 400', async () => {
    const { app, store, orchestrator } = makeApp();
    const created = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: auth,
      payload: { utterance: 'one mcchicken' },
    });
    const id = created.json().data.id;
    await orchestrator.settle();
    // Force the over-cap flag for the test.
    const order = store.get(id)!;
    (order as { overCap?: boolean }).overCap = true;

    const res = await app.inject({
      method: 'POST',
      url: `/orders/${id}/confirm`,
      headers: auth,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/spending cap/);
  });

  test('POST /orders/:id/cart-ready is 409 unless the order is building_cart', async () => {
    const { app, orchestrator } = makeApp();
    const created = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: auth,
      payload: { utterance: 'one mcchicken' },
    });
    const id = created.json().data.id;
    await orchestrator.settle();
    // In auto mode the order is already awaiting_confirmation, not building_cart.
    const res = await app.inject({ method: 'POST', url: `/orders/${id}/cart-ready`, headers: auth });
    expect(res.statusCode).toBe(409);
  });

  test('POST /orders/:id/cancel cancels an awaiting order', async () => {
    const { app, store, orchestrator } = makeApp();
    const created = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: auth,
      payload: { utterance: 'one mcchicken' },
    });
    const id = created.json().data.id;
    await orchestrator.settle();

    const res = await app.inject({ method: 'POST', url: `/orders/${id}/cancel`, headers: auth });
    expect(res.statusCode).toBe(200);
    expect(store.get(id)!.state).toBe('cancelled');
  });
});
