import type { Locator, Page } from 'playwright';
import type { Candidate, CartSummary } from '../types.js';
import { parseMoneyToCents } from '../lib/text.js';
import { SEL } from './selectors.js';

async function textOf(scope: Page | Locator, selector: string): Promise<string> {
  const target = scope.locator(selector).first();
  if ((await target.count()) === 0) return '';
  return ((await target.textContent()) ?? '').trim();
}

export async function extractCandidates(page: Page): Promise<Candidate[]> {
  const cards = await page.locator(SEL.itemSearchCard).all();
  const candidates: Candidate[] = [];
  for (const [index, card] of cards.entries()) {
    const itemName = await textOf(card, SEL.itemName);
    if (!itemName) continue;
    const ratingText = await textOf(card, SEL.itemStoreRating);
    const etaText = await textOf(card, SEL.itemStoreEta);
    const etaMatch = etaText.match(/(\d+)/);
    candidates.push({
      id: `cand-${index}`,
      itemName,
      description: await textOf(card, SEL.itemDescription),
      priceCents: parseMoneyToCents(await textOf(card, SEL.itemPrice)),
      restaurant: await textOf(card, SEL.itemStoreName),
      rating: ratingText ? Number.parseFloat(ratingText) : null,
      etaMinutes: etaMatch ? Number.parseInt(etaMatch[1], 10) : null,
    });
  }
  return candidates;
}

export async function extractCartSummary(page: Page): Promise<CartSummary> {
  const lines = await page.locator(SEL.cartLine).all();
  const items = [];
  for (const line of lines) {
    const priceCents = parseMoneyToCents(await textOf(line, SEL.cartLinePrice));
    items.push({
      name: await textOf(line, SEL.cartLineName),
      quantity: Number.parseInt((await textOf(line, SEL.cartLineQuantity)) || '1', 10),
      priceCents: priceCents ?? 0,
    });
  }
  const subtotalCents = parseMoneyToCents(await textOf(page, SEL.cartSubtotal));
  const feesCents = parseMoneyToCents(await textOf(page, SEL.cartFees));
  const totalCents = parseMoneyToCents(await textOf(page, SEL.cartTotal));
  if (totalCents === null) {
    throw new Error('Could not read the cart total from the page');
  }
  return {
    restaurant: await textOf(page, SEL.cartStoreName),
    items,
    subtotalCents: subtotalCents ?? 0,
    feesCents: feesCents ?? 0,
    totalCents,
  };
}
