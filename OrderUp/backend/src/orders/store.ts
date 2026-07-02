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
