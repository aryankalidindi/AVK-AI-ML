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
