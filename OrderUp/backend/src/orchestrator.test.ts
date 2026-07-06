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

const nonFood: ParsedRequest = {
  mode: 'specific',
  items: [],
  restaurant: null,
  flavorNotes: [],
  confidence: 0,
  clarify: null,
};

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

function autoConfig(over: Partial<OrchestratorDeps['config']> = {}): OrchestratorDeps['config'] {
  return {
    CART_MODE: 'auto',
    CONFIDENCE_THRESHOLD: 0.8,
    MAX_ORDER_CENTS: 5000,
    DRY_RUN: true,
    EXPIRY_MINUTES: 10,
    ...over,
  };
}

function makeAutomation(over: Partial<OrchestratorDeps['automation']> = {}): OrchestratorDeps['automation'] {
  return {
    openStoreForSpecific: vi.fn().mockResolvedValue(undefined),
    openStoreForCandidate: vi.fn().mockResolvedValue(undefined),
    readCart: vi.fn().mockResolvedValue(cart),
    buildCartForSpecific: vi.fn().mockResolvedValue(cart),
    discover: vi.fn().mockResolvedValue(candidates),
    buildCartForCandidate: vi.fn().mockResolvedValue(cart),
    placeOrder: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

function makeDeps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    store: new OrderStore(),
    parse: vi.fn().mockResolvedValue(specific(0.95)),
    rank: vi.fn().mockResolvedValue(candidates.map((c) => ({ ...c, reason: 'Best fit.' }))),
    notifier: { send: vi.fn().mockResolvedValue(undefined) },
    automation: makeAutomation(),
    config: autoConfig(),
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

    await orchestrator.handleChoice(order.id, 'c1');
    expect(deps.automation.buildCartForCandidate).toHaveBeenCalled();
    expect(deps.store.get(order.id)!.state).toBe('awaiting_confirmation');
  });

  test('non-food utterance (empty items) fails with a clear message', async () => {
    const deps = makeDeps({ parse: vi.fn().mockResolvedValue(nonFood) });
    const orchestrator = new Orchestrator(deps);
    const order = orchestrator.startOrder('never mind');
    await orchestrator.settle();

    const final = deps.store.get(order.id)!;
    expect(final.state).toBe('failed');
    expect(final.error).toMatch(/didn't sound like a food order/);
    expect(deps.automation.buildCartForSpecific).not.toHaveBeenCalled();
    expect(deps.automation.discover).not.toHaveBeenCalled();
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
    const deps = makeDeps({ config: autoConfig({ DRY_RUN: false }) });
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
      automation: makeAutomation({ buildCartForSpecific: vi.fn().mockResolvedValue(bigCart) }),
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
        buildCartForSpecific: vi
          .fn()
          .mockRejectedValue(new Error('matchMenuItem: No menu item matching "McChicken"')),
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
