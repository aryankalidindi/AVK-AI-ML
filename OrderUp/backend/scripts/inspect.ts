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

  // Report any search inputs on the store page (a store search box is the
  // cleanest way to reach one item on a virtualized menu).
  const inputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input')).map((el) => ({
      testid: el.getAttribute('data-testid') ?? '',
      placeholder: el.getAttribute('placeholder') ?? '',
      ariaLabel: el.getAttribute('aria-label') ?? '',
    })),
  );
  console.error('[inspect] inputs on store page:', JSON.stringify(inputs));

  // Scroll the virtualized menu until the item renders, then stop there.
  let found = false;
  for (let i = 0; i < 25 && !found; i += 1) {
    found = await page.evaluate(
      (t: string) =>
        Array.from(document.querySelectorAll('*')).some(
          (el) => (el.textContent ?? '').toLowerCase().includes(t.toLowerCase()),
        ),
      item,
    );
    if (!found) {
      await page.mouse.wheel(0, 1400);
      await page.waitForTimeout(500);
    }
  }
  console.error(`[inspect] item "${item}" rendered after scrolling: ${found}`);
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

  // Elements whose text contains the target word — report their tag + attrs + a clickable ancestor.
  const matches = Array.from(document.querySelectorAll('h1,h2,h3,h4,span,div,a,button,p'))
    .filter((el) => (el.textContent ?? '').toLowerCase().includes(searchStr.toLowerCase()))
    .slice(0, 4)
    .map((el) => {
      const self: Record<string, string> = { tag: el.tagName.toLowerCase() };
      for (const a of Array.from(el.attributes)) {
        if (a.name.startsWith('data-') || a.name === 'role' || a.name === 'aria-label') {
          self[a.name] = a.value;
        }
      }
      const chain: Array<Record<string, string>> = [];
      let node: Element | null = el;
      for (let i = 0; i < 8 && node; i += 1) {
        const at: Record<string, string> = { tag: node.tagName.toLowerCase() };
        for (const a of Array.from(node.attributes)) {
          if (a.name.startsWith('data-') || a.name === 'role' || a.name === 'aria-label') {
            at[a.name] = a.value;
          }
        }
        chain.push(at);
        node = node.parentElement;
      }
      return { text: (el.textContent ?? '').trim().slice(0, 60), self, ancestors: chain };
    });
  out.matches = matches.length ? matches : `No element text contains "${searchStr}"`;
  return out;
}, searchTarget);

console.log(JSON.stringify(report, null, 2));
await context.close();
