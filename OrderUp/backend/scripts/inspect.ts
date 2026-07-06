/**
 * One-off DOM inspector for correcting DoorDash selectors (plan Task 14).
 * Stop `npm run dev` first (it holds the browser-profile lock), then:
 *   npm run inspect -- "McDonald's"
 * Prints the attribute names DoorDash actually uses for store cards + titles.
 */
import { loadConfig } from '../src/config.js';
import { launchSession } from '../src/doordash/browser.js';

const term = process.argv[2] ?? "McDonald's";
const config = loadConfig();
const context = await launchSession(config.USER_DATA_DIR, false);
const page = context.pages()[0] ?? (await context.newPage());

await page.goto(`https://www.doordash.com/search/store/${encodeURIComponent(term)}`, {
  waitUntil: 'domcontentloaded',
});
// Give Cloudflare + hydration time to settle.
await page.waitForTimeout(6000);

const report = await page.evaluate((searchTerm: string) => {
  const out: Record<string, unknown> = {};

  // 1. Every data-testid / data-anchor-id value present, with counts.
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
  out.attrCounts = attrCounts;

  // 2. Find the element whose text is exactly the store name, walk up 6 levels,
  //    and report the attributes at each ancestor — that chain reveals the card.
  const wanted = searchTerm.toLowerCase();
  const titleEl = Array.from(document.querySelectorAll('h1,h2,h3,h4,span,div,a,p')).find(
    (el) => (el.textContent ?? '').trim().toLowerCase() === wanted,
  );
  if (titleEl) {
    out.titleTag = titleEl.tagName.toLowerCase();
    out.titleAttrs = Array.from(titleEl.attributes).map((a) => `${a.name}=${a.value}`);
    const chain: Array<Record<string, string>> = [];
    let node: Element | null = titleEl;
    for (let i = 0; i < 6 && node; i += 1) {
      const attrs: Record<string, string> = { tag: node.tagName.toLowerCase() };
      for (const a of Array.from(node.attributes)) {
        if (a.name.startsWith('data-') || a.name === 'role' || a.name === 'aria-label') {
          attrs[a.name] = a.value;
        }
      }
      chain.push(attrs);
      node = node.parentElement;
    }
    out.ancestorChain = chain;
  } else {
    out.titleNotFound = `No element with exact text "${searchTerm}"`;
  }
  return out;
}, term);

console.log(JSON.stringify(report, null, 2));
await context.close();
