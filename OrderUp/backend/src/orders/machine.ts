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
