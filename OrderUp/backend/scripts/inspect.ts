/**
 * One-off DOM inspector for correcting DoorDash selectors (plan Task 14).
 * Stop `npm run dev` first (it holds the browser-profile lock), then:
 *   npm run inspect -- "McDonald's"              # inspect the store search page
 *   npm run inspect -- "McDonald's" "McChicken"  # click into store, inspect the menu
 * Prints the attribute names DoorDash actually uses.
 */
import { loadConfig } from '../src/config.js';
import { launchSession } from '../src/doordash/browser.js';
import { SEL } from '../src/doordash/selectors.js';

function nameRegex(name: string): RegExp {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(words.join('.{0,3}'), 'i');
}

const restaurant = process.argv[2] ?? "McDonald's";
const item = process.argv[3]; // optional — if given, click into the store and inspect the menu
const config = loadConfig();
const context = await launchSession(config.USER_DATA_DIR, false);
const page = context.pages()[0] ?? (await context.newPage());

await page.goto(`https://www.doordash.com/search/store/${encodeURIComponent(restaurant)}`, {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(6000);

let searchTarget = restaurant;
if (item) {
  // Reproduce searchRestaurant's click, then inspect the menu for the item.
  const link = page.locator(SEL.storeCard).filter({ hasText: nameRegex(restaurant) }).first();
  await link.waitFor();
  const href = await link.getAttribute('href');
  console.error(`[inspect] navigating to store href=${href}`);
  await page.goto(new URL(href!, 'https://www.doordash.com').toString(), {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(6000);
  searchTarget = item;
  console.error(`[inspect] landed on: ${page.url()}`);

  // Use the store's item-search box. There are duplicate inputs (sticky/mobile),
  // so pick the visible one; type with real keys + Enter to execute the search.
  const search = page.locator('input[aria-label="Item Search"]:visible').first();
  await search.click();
  await search.type(item, { delay: 40 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);
  const chickenCount = await page.evaluate(() =>
    Array.from(document.querySelectorAll('span,div,h3,p,a')).filter((el) =>
      (el.textContent ?? '').toLowerCase().includes('chicken'),
    ).length,
  );
  console.error(
    `[inspect] searched "${item}"; url=${page.url()}; elements mentioning "chicken"=${chickenCount}`,
  );

  // Add the best-matching item card via its quick-add button, then open the cart
  // and dump its structure — this captures the remaining cart selectors.
  const card = page.locator('[data-testid="MenuItem"]').filter({ hasText: nameRegex(item) }).first();
  await card.waitFor({ timeout: 15000 });
  console.error(`[inspect] matched menu item card text: ${(await card.innerText()).slice(0, 60)}`);
  const quickAdd = card.locator('[data-testid="quick-add-button"], button[aria-label="Add item to cart"]').first();
  await quickAdd.click();
  await page.waitForTimeout(3000);
  await page.locator('[data-testid="OrderCartIconButton"]').first().click();
  await page.waitForTimeout(4000);

  await page.evaluate('globalThis.__name = globalThis.__name || function (f) { return f; };');
  const cart = await page.evaluate(() => {
    const testids: Record<string, number> = {};
    for (const el of Array.from(document.querySelectorAll('[data-testid]'))) {
      const v = el.getAttribute('data-testid') ?? '';
      // Keep cart/checkout/order/subtotal/total-ish testids.
      if (/cart|order|subtotal|total|fee|checkout|line|quantity|price/i.test(v)) {
        testids[v] = (testids[v] ?? 0) + 1;
      }
    }
    // Any element whose text is a $ amount, with its testid, to locate totals.
    const money = Array.from(document.querySelectorAll('span,div,p'))
      .filter((el) => /^\$\d+\.\d{2}$/.test((el.textContent ?? '').trim()) && el.children.length === 0)
      .slice(0, 20)
      .map((el) => ({
        text: (el.textContent ?? '').trim(),
        testid: el.getAttribute('data-testid') ?? '',
        parentTestid: el.parentElement?.getAttribute('data-testid') ?? '',
      }));
    return { cartTestids: testids, moneyNodes: money };
  });
  console.log(JSON.stringify({ cart }, null, 2));
  await context.close();
  process.exit(0);
}

// tsx/esbuild wraps functions with a __name helper that doesn't exist in the
// browser; define it as a no-op before evaluating any transformed function.
await page.evaluate('globalThis.__name = globalThis.__name || function (f) { return f; };');

const report = await page.evaluate((searchStr: string) => {
  const out: Record<string, unknown> = {};

  const attrCounts: Record<string, Record<string, number>> = {
    'data-testid': {},
    'data-anchor-id': {},
  };
  for (const attr of Object.keys(attrCounts)) {
    for (const el of Array.from(document.querySelectorAll(`[${attr}]`))) {
      const v = el.getAttribute(attr) ?? '';
      attrCounts[attr][v] = (attrCounts[attr][v] ?? 0) + 1;
    }
  }
  // Trim noise: only keep attr values that look structural or mention the target.
  const wanted = searchStr.toLowerCase().split(/\s+/)[0];
  const filterAttrs = (m: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(m).filter(
        ([k]) => k === '' || !/\$|\d{2}/.test(k) || k.toLowerCase().includes(wanted),
      ),
    );
  out.testids = filterAttrs(attrCounts['data-testid']);
  out.anchorIds = filterAttrs(attrCounts['data-anchor-id']);

  const attrsOf = (el: Element): Record<string, string> => {
    const at: Record<string, string> = { tag: el.tagName.toLowerCase() };
    for (const a of Array.from(el.attributes)) {
      if (a.name.startsWith('data-') || a.name === 'role' || a.name === 'aria-label') {
        at[a.name] = a.value;
      }
    }
    return at;
  };

  // Find leaf-ish elements whose OWN text is the item name (short, no big card),
  // then walk up to the item card and report any add-button inside that card.
  const target = searchStr.toLowerCase();
  const nameNodes = Array.from(document.querySelectorAll('h1,h2,h3,h4,span,div,a,p')).filter(
    (el) => {
      const txt = (el.textContent ?? '').trim().toLowerCase();
      return txt.includes(target) && txt.length < 60 && el.children.length <= 2;
    },
  );

  const cards = nameNodes.slice(0, 3).map((nameEl) => {
    // Walk up to the nearest ancestor that carries a data-testid (the item card).
    let card: Element | null = nameEl;
    const chain: Array<Record<string, string>> = [];
    for (let i = 0; i < 8 && card; i += 1) {
      chain.push(attrsOf(card));
      if (card.getAttribute('data-testid')) break;
      card = card.parentElement;
    }
    // Buttons inside that card (quick-add etc.) and any $ price text within it.
    const scope = card ?? nameEl;
    const buttons = Array.from(scope.querySelectorAll('button')).map((b) => ({
      testid: b.getAttribute('data-testid') ?? '',
      ariaLabel: b.getAttribute('aria-label') ?? '',
      text: (b.textContent ?? '').trim().slice(0, 30),
    }));
    const priceText = ((scope.textContent ?? '').match(/\$\d+(?:\.\d{2})?/) ?? [])[0] ?? null;
    return {
      name: (nameEl.textContent ?? '').trim(),
      cardTestid: card?.getAttribute('data-testid') ?? '(none up 8 levels)',
      ancestorChain: chain,
      buttonsInCard: buttons,
      priceInCard: priceText,
    };
  });
  out.itemCards = cards.length ? cards : `No leaf node text matches "${searchStr}"`;
  return out;
}, searchTarget);

console.log(JSON.stringify(report, null, 2));
await context.close();
