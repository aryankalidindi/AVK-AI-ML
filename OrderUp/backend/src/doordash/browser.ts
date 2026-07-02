import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';

export async function launchSession(userDataDir: string, headless: boolean): Promise<BrowserContext> {
  return chromium.launchPersistentContext(userDataDir, {
    headless,
    viewport: { width: 1280, height: 900 },
  });
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
