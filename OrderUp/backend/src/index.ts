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

  const shutdown = async (): Promise<void> => {
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
