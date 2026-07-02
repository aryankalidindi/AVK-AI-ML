import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

  test('fails loudly on a corrupted order file', () => {
    dir = mkdtempSync(join(tmpdir(), 'orderup-'));
    const file = join(dir, 'orders.json');
    writeFileSync(file, '{not json');
    expect(() => new OrderStore(file)).toThrow(/corrupted/);
  });
});
