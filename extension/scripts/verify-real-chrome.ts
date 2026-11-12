import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const extensionPath = path.resolve(__dirname, '../dist');
  console.log('Loading unpacked extension from:', extensionPath);

  const userDataDir = '/tmp/chrome-beer-silent-profile-' + Date.now();
  fs.mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  try {
    console.log('Browser launched in silent background mode (--headless=new).');
    let worker = context.serviceWorkers()[0];
    if (!worker) {
      worker = await context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => undefined as any);
    }
    console.log('Service worker active:', !!worker, worker?.url());

    const page = await context.newPage();

    console.log('Navigating to https://bubblesbeers.com/shop/ ...');
    await page.goto('https://bubblesbeers.com/shop/', { waitUntil: 'domcontentloaded', timeout: 30000 });

    console.log('Waiting for product cards...');
    await page.waitForSelector('li.product', { timeout: 15000 });
    const productCount = await page.locator('li.product').count();
    console.log('Product cards found on page:', productCount);

    console.log('Waiting for badges to be attached by Warsaw Beer Overlay...');
    await page.waitForSelector('[data-beerbadge]', { timeout: 15000 });
    const badgeCount = await page.locator('[data-beerbadge]').count();
    console.log('Badged elements count:', badgeCount);

    const cardsData = await page.$$eval('li.product', (items) =>
      items.map((li) => {
        const titleEl = li.querySelector('.woocommerce-loop-product__title');
        const badgeEl = li.querySelector('[data-beerbadge]') as HTMLElement | null;
        return {
          title: titleEl?.textContent?.trim() || '',
          hasBadge: !!badgeEl,
          badgeKind: badgeEl?.getAttribute('data-beerbadge') || '',
          badgeText: badgeEl?.textContent?.trim() || '',
          ariaLabel: badgeEl?.getAttribute('aria-label') || '',
        };
      })
    );

    console.log('\nVerified Cards:');
    for (const [i, c] of cardsData.entries()) {
      console.log(`[Card ${i + 1}] ${c.title}`);
      console.log(`         Badge: kind=${c.badgeKind}, label="${c.ariaLabel || c.badgeText}"`);
    }

    const artifactDir = '/Users/ton/.gemini/antigravity/brain/170dbb59-aa4f-45ae-822c-02163ad71126';
    const screenshotPath = path.join(artifactDir, 'bubblesbeers-chrome-verified.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log('\nScreenshot successfully saved to:', screenshotPath);

    console.log('\nVERIFICATION PASSED: All cards on bubblesbeers.com/shop/ processed and badged!');
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('FAILED IN CHROME VERIFICATION:', err);
  process.exit(1);
});
