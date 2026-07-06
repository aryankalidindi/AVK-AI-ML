import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';

export async function launchSession(userDataDir: string, headless: boolean): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext(userDataDir, {
    // Use the real installed Chrome, not Playwright's bundled Chromium — its
    // fingerprint is far less likely to be flagged by Cloudflare bot detection.
    channel: 'chrome',
    headless,
    viewport: { width: 1280, height: 900 },
    // Drop the "controlled by automated test software" banner and the
    // AutomationControlled blink feature that sets navigator.webdriver = true.
    // Without this, a Cloudflare challenge re-loops even after a manual solve.
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars'],
    ignoreDefaultArgs: ['--enable-automation'],
  });
  // Belt-and-suspenders: hide the webdriver flag in every page/frame.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  return context;
}

export async function saveScreenshot(page: Page, dir: string, label: string): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = join(dir, `${stamp}-${label}.png`);
  await page.screenshot({ path });
  return path;
}

export class StepError extends Error {
  constructor(
    public step: string,
    message: string,
    public screenshotPath?: string,
  ) {
    super(`${step}: ${message}`);
    this.name = 'StepError';
  }
}
