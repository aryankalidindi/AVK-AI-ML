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
  rank: (
    utterance: string,
    flavorNotes: string[],
    candidates: Candidate[],
  ) => Promise<RankedSuggestion[]>;
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
    this.track(this.processUtterance(order.id, utterance));
    return order;
  }

  /** Fire-and-forget wrapper that keeps settle() accurate for tests/shutdown. */
  track<T>(promise: Promise<T>): void {
    this.inFlight = promise.catch(() => {});
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
      if (parsed.items.length === 0) {
        throw new Error(
          'That didn\'t sound like a food order — try something like "one McChicken".',
        );
      }
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

  private async runDiscovery(
    orderId: string,
    utterance: string,
    parsed: ParsedRequest,
  ): Promise<Order> {
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

  /**
   * Expiry stamps always use wall-clock time; the injectable `now` is only for
   * the expiry SWEEP so tests can time-travel past a real stamp.
   */
  private expiry(): string {
    return new Date(Date.now() + this.deps.config.EXPIRY_MINUTES * 60_000).toISOString();
  }
}
