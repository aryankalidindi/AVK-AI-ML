import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { extractCandidates, extractCartSummary } from './extract.js';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});

afterAll(async () => {
  await browser.close();
});

const searchFixture = `
<div>
  <div data-testid="menu-item-search-result">
    <h3 data-testid="item-name">Crispy Chicken Sandwich</h3>
    <p data-testid="item-description">Fried chicken, pickles</p>
    <span data-testid="item-price">$8.99</span>
    <span data-testid="item-store-name">Shake Shack</span>
    <span data-testid="item-store-rating">4.7</span>
    <span data-testid="item-store-eta">20 min</span>
  </div>
  <div data-testid="menu-item-search-result">
    <h3 data-testid="item-name">Spicy Chicken Deluxe</h3>
    <p data-testid="item-description">Spicy, with pickles</p>
    <span data-testid="item-price">$7.49</span>
    <span data-testid="item-store-name">Chick-fil-A</span>
    <span data-testid="item-store-rating">4.8</span>
    <span data-testid="item-store-eta">15 min</span>
  </div>
</div>`;

const cartFixture = `
<div>
  <span data-testid="cart-store-name">McDonald's</span>
  <div data-testid="order-cart-item">
    <span data-testid="order-cart-item-quantity">1</span>
    <span data-testid="order-cart-item-name">McChicken</span>
    <span data-testid="order-cart-item-price">$3.49</span>
  </div>
  <span data-testid="cart-subtotal">$3.49</span>
  <span data-testid="cart-fees-total">$4.93</span>
  <span data-testid="cart-total">$8.42</span>
</div>`;

describe('extractCandidates', () => {
  test('parses search result cards into candidates', async () => {
    await page.setContent(searchFixture);
    const candidates = await extractCandidates(page);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      itemName: 'Crispy Chicken Sandwich',
      restaurant: 'Shake Shack',
      priceCents: 899,
      rating: 4.7,
      etaMinutes: 20,
    });
    expect(candidates[0].id).not.toBe(candidates[1].id);
  });
});

describe('extractCartSummary', () => {
  test('parses the cart into a summary with cents totals', async () => {
    await page.setContent(cartFixture);
    const cart = await extractCartSummary(page);
    expect(cart.restaurant).toBe("McDonald's");
    expect(cart.items).toEqual([{ name: 'McChicken', quantity: 1, priceCents: 349 }]);
    expect(cart.subtotalCents).toBe(349);
    expect(cart.feesCents).toBe(493);
    expect(cart.totalCents).toBe(842);
  });
});
