import { loadConfig } from '../src/config.js';
import { launchSession } from '../src/doordash/browser.js';

const config = loadConfig();
const context = await launchSession(config.USER_DATA_DIR, false);
const page = context.pages()[0] ?? (await context.newPage());
await page.goto('https://www.doordash.com/');

console.log('');
console.log('A browser window is open. Log in to DoorDash, verify your saved');
console.log('address and payment method, then press Ctrl+C here. The session');
console.log(`persists in ${config.USER_DATA_DIR} and the backend will reuse it.`);
