# AVK-AI-ML workspace

Workspace root for several projects. The active project is **OrderUp** (voice-to-DoorDash ordering backend). Other directories (`RideShareTranslationService/`, dated journal dirs) are separate concerns.

## OrderUp backend

Single Node package at `OrderUp/backend/`. TypeScript ESM (NodeNext), Fastify, Playwright, vitest.

### Commands (run from `OrderUp/backend/`)

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start server (uses `tsx`, auto-loads `.env`) |
| `npm test` | Run all vitest tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run login` | Open headed DoorDash browser for one-time auth |
| `npm run inspect -- "Store" "Item"` | DOM inspector for correcting selectors |
| `npx vitest run src/foo/bar.test.ts` | Run a single test file |

No build step — `tsx` runs TS directly.

### Must-know quirks

- **ESM imports**: All relative imports MUST use `.js` extensions (`'./foo.js'` not `'./foo'`). NodeNext.
- **Tests colocated**: `src/foo/bar.test.ts` next to `src/foo/bar.ts`.
- **`.env` is gitignored** — copy `.env.example`. Server always needs `AUTH_TOKEN` + an LLM API key.

### Two LLM providers

Controlled by `LLM_PROVIDER=gemini|anthropic` (default `anthropic`). Config uses `superRefine` for conditional API key requirements.

- **Anthropic**: uses `@anthropic-ai/sdk` `messages.parse()` with `zodOutputFormat` — schema enforced server-side.
- **Gemini** (`src/llm/gemini.ts`): REST API, no server-side schema enforcement. Needs explicit shape hints in system prompt + client-side zod fallback. Gemini sometimes wraps JSON in markdown fences despite `responseMimeType: 'application/json'` — the adapter strips them.

### Cart mode

`CART_MODE=manual` (default): opens the store in Playwright, user taps items themselves in the browser, then calls `POST /orders/:id/cart-ready`. This works today.

`CART_MODE=auto`: fully scripted add-to-cart. `buildCartForSpecific` / `buildCartForCandidate` in `automation.ts`. Selectors for menu items + cart panel are still being solved against the live site.

### DoorDash live-site gotchas

- **Store card clicks are intercepted by Turnstile** — automation navigates by reading the store card's `href` attribute and calling `page.goto()` instead of `.click()`.
- **Selectors** centralized in `src/doordash/selectors.ts`. When DoorDash redesigns, fix selectors there and re-run dry-run flow (plan Task 14).
- **`scripts/inspect.ts`** dumps DOM structure for the live site and prints the testid/anchor-id attributes DoorDash actually uses. Stop `dev` first (browser profile lock), then run `npm run inspect -- "McDonald's" "McChicken"`.
- **`nameRegex()`** matches store names with loose punctuation tolerance ("McDonald's", "Chick-fil-A") via `join('.{0,3}')`.

### ntfy headers

Title goes in an HTTP header, which must be Latin-1. `createNtfyNotifier` sanitizes via `headerSafe()` — maps em-dash→hyphen, ×→x, curly quotes→straight, drops chars > U+00FF. The body keeps full UTF-8.

### State machine

`received → parsing → (clarifying | suggesting)? → building_cart → awaiting_confirmation → placing → placed | failed | cancelled | expired`

One in-flight order at a time (enforced by `OrderStore`). 10-minute expiry on `clarifying`/`suggesting`/`building_cart`/`awaiting_confirmation`. `DRY_RUN=true` (default) skips `placeOrder`.

### Testing quirks

- Extraction tests (`extract.test.ts`) launch a real headless Chromium and use `page.setContent()` with fixture HTML — no live site dependency.
- Orchestrator tests inject fakes for everything (LLM, Playwright, notifier). Run in milliseconds.
- 30s vitest timeout in `vitest.config.ts`.

### Other gotchas

- `orders.json` contains historical order data (utterances etc.) — it's gitignored and runtime-generated.
- `.chromium-profile/` and `screenshots/` are gitignored, auto-created on first run.
- `npm run dev` exits on fatal error; failure messages come via ntfy notification first.
