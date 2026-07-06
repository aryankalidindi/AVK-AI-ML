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
const MAX_CANDIDATES = 10;

/** Case-insensitive matcher tolerant of the punctuation in names like "McDonald's" / "Chick-fil-A". */
function nameRegex(name: string): RegExp {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(words.join('.{0,3}'), 'i');
}

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
      const shot = await saveScreenshot(p, options.screenshotDir, `${step}-failed`).catch(
        () => undefined,
      );
      const message = error instanceof Error ? error.message : String(error);
      throw new StepError(step, message, shot);
    }
  }

  async function searchRestaurant(p: Page, restaurant: string): Promise<void> {
    await p.goto(`${BASE}/search/store/${encodeURIComponent(restaurant)}`, {
      waitUntil: 'domcontentloaded',
    });
    // Match the store card by its visible text — store names have no stable
    // attribute. nameRegex tolerates apostrophes/hyphens ("McDonald's").
    const card = p.locator(SEL.storeCard).filter({ hasText: nameRegex(restaurant) }).first();
    await card.waitFor();
    await card.click();
    await p.waitForLoadState('domcontentloaded');
  }

  async function addItemToCart(p: Page, itemName: string, quantity: number): Promise<void> {
    const cards = p.locator(SEL.itemSearchCard);
    await cards.first().waitFor();
    const names = await cards.locator(SEL.itemName).allTextContents();
    const match = bestMatch(
      itemName,
      names.map((name, index) => ({ name, index })),
      (option) => option.name,
    );
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
        await p.goto(`${BASE}/search/${encodeURIComponent(dish)}`, {
          waitUntil: 'domcontentloaded',
        });
        await p.locator(SEL.itemSearchCard).first().waitFor();
        const candidates = await extractCandidates(p);
        return candidates.slice(0, MAX_CANDIDATES);
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
