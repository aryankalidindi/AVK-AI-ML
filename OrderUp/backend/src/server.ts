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
      return await reply.code(202).send(envelope(order));
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
    orchestrator.track(orchestrator.handleChoice(id, body.data.choiceId));
    return reply.code(202).send(envelope(order));
  });

  app.post('/orders/:id/cart-ready', async (request, reply) => {
    const { id } = request.params as { id: string };
    const order = store.get(id);
    if (!order) return reply.code(404).send(failure('order not found'));
    if (order.state !== 'building_cart') {
      return reply.code(409).send(failure(`order is not building a cart (state: ${order.state})`));
    }
    orchestrator.track(orchestrator.markCartReady(id));
    return reply.code(202).send(envelope(order));
  });

  app.post('/orders/:id/confirm', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = confirmBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(failure('invalid body'));
    const order = store.get(id);
    if (!order) return reply.code(404).send(failure('order not found'));
    if (order.state !== 'awaiting_confirmation') {
      return reply
        .code(409)
        .send(failure(`order is not awaiting confirmation (state: ${order.state})`));
    }
    if (order.overCap && !body.data.acknowledgeOverCap) {
      return reply
        .code(400)
        .send(failure('order exceeds the spending cap; re-confirm with acknowledgeOverCap'));
    }
    orchestrator.track(orchestrator.confirm(id, body.data.acknowledgeOverCap ?? false));
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
