import path from 'node:path';
import { expect, test } from '@playwright/test';

const ARTIFACT_DIR =
  '/home/bryant/.gemini/antigravity/brain/5a83f2eb-cb6e-4e91-a634-167ac9bff772/media';

test('mobile tasting experience with uncluttered cards, auto-scroll, progress bar, and dark mode', async ({
  browser,
}) => {
  test.setTimeout(120000);

  // 390x844 (iPhone 14/15) with touch enabled
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    recordVideo: {
      dir: './test-results/mobile-videos',
      size: { width: 390, height: 844 },
    },
  });
  const page = await context.newPage();

  // 1. Visit Home on Mobile (with retry for dev server cold start)
  for (let i = 0; i < 10; i++) {
    try {
      const res = await page.goto('/', { timeout: 15000 });
      if (
        res?.ok() &&
        (await page
          .getByRole('heading', { name: /Find common ground on uncommon flavors/i })
          .isVisible({ timeout: 4000 }))
      ) {
        break;
      }
    } catch {
      // ignore
    }
    await page.waitForTimeout(2000);
  }
  await expect(
    page.getByRole('heading', { name: /Find common ground on uncommon flavors/i }),
  ).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: `${ARTIFACT_DIR}/mobile-01-home.png`,
    fullPage: false,
  });

  // 2. Create Mobile Tasting Session
  await page.locator('#session-title').fill('Hot Sauce Tasting Night');
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /Create Tasting Room/i }).click();

  await page.waitForURL(/\/session\/[a-zA-Z0-9_-]+/);
  await expect(page.getByText('Hot Sauce Tasting Night')).toBeVisible();
  await page.waitForTimeout(1000);

  // Set User Name
  const nameInput = page.locator('input[placeholder*="Alex, Sam"]');
  if (!(await nameInput.isVisible())) {
    await page.getByRole('button', { name: /Tasting as:/i }).click();
  }
  await page.waitForTimeout(300);
  await nameInput.fill('Alex');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Join Tasting|Save Name/i }).click();
  await page.waitForTimeout(800);

  // 3. Add 4 Tasting Items with photos
  const fixturesDir = path.resolve('e2e/fixtures');
  const itemsToAdd = [
    {
      file: path.join(fixturesDir, 'item1.png'),
      name: 'Habanero Mango Hot Sauce',
      notes: 'Tropical sweet upfront, scorching kick',
    },
    {
      file: path.join(fixturesDir, 'item2.png'),
      name: 'Smoky Garlic Reaper',
      notes: 'Deep roasted aroma with carolina reaper punch',
    },
    {
      file: path.join(fixturesDir, 'item3.png'),
      name: 'Tangy Jalapeño Salsa Verde',
      notes: 'Fresh cilantro, lime, and mild zing',
    },
    {
      file: path.join(fixturesDir, 'item4.png'),
      name: 'Truffle Ghost Pepper',
      notes: 'Rich umami truffle infused slow burner',
    },
  ];

  for (const item of itemsToAdd) {
    await page.getByRole('button', { name: /Add Item/i }).click();
    await page.waitForTimeout(400);
    await page.locator('input[type="file"]').setInputFiles(item.file);
    await page.locator('#item-name').fill(item.name);
    await page.locator('#item-notes').fill(item.notes);
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Add to Tasting' }).click();
    await expect(page.locator('input[placeholder*="Chunky Garlic Dip"]')).not.toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(item.name)).toBeVisible({
      timeout: 10000,
    });
    await page.waitForTimeout(700);
  }

  // 4. Screenshot: Mobile Unranked Pool with chunky buttons & floating pill
  await page.locator('[data-dropzone-tier="__unranked__"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: `${ARTIFACT_DIR}/mobile-04-unranked-pool.png`,
    fullPage: false,
  });

  // 4a. Verify Item Detail Modal: tap picture of unranked item without long press
  const item1Card = page
    .locator('div[role="listitem"]')
    .filter({ hasText: 'Habanero Mango Hot Sauce' });
  await item1Card.click({ position: { x: 50, y: 50 } });
  const modal = page.getByRole('dialog', { name: /Item Details/i });
  await expect(modal).toBeVisible({ timeout: 5000 });
  await expect(modal.getByText('Tropical sweet upfront, scorching kick')).toBeVisible();
  await expect(modal.getByText('Unranked')).toBeVisible();

  // Screenshot of Item Detail Modal
  await page.screenshot({
    path: `${ARTIFACT_DIR}/mobile-07-item-detail-modal.png`,
    fullPage: false,
  });

  // Assign S tier directly from within the Item Detail Modal
  await modal.getByRole('button', { name: /^S$/ }).click();
  await expect(modal.getByText('Tier S')).toBeVisible();

  // Close modal with Done
  await modal.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog', { name: /Item Details/i })).not.toBeVisible();

  // Verify optimistic update: Habanero Mango Hot Sauce is immediately visible in Tier S
  const tierSRow = page.locator('[data-dropzone-tier="S"]');
  await expect(tierSRow.getByText('Habanero Mango Hot Sauce')).toBeVisible();

  // Also verify tapping a placed card opens the detail modal with current tier selected
  await tierSRow.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const placedCard = tierSRow
    .locator('div[role="listitem"]')
    .filter({ hasText: 'Habanero Mango Hot Sauce' });
  await placedCard.click({ position: { x: 45, y: 60 } });
  await expect(page.getByRole('dialog', { name: /Item Details/i })).toBeVisible({ timeout: 5000 });
  await expect(modal.getByText('Tier S')).toBeVisible();
  await modal.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog', { name: /Item Details/i })).not.toBeVisible();

  // 5. Rank remaining 2 items to show clean placed cards & progress bar
  // Item 2 -> A Tier
  const item2 = page.locator('div[role="listitem"]').filter({ hasText: 'Smoky Garlic Reaper' });
  await item2.getByRole('button', { name: /Move .* to A tier|^A$/i }).click();
  await page.waitForTimeout(1000);

  // Item 3 -> B Tier
  const item3 = page
    .locator('div[role="listitem"]')
    .filter({ hasText: 'Tangy Jalapeño Salsa Verde' });
  await item3.getByRole('button', { name: /Move .* to B tier|^B$/i }).click();
  await page.waitForTimeout(1200);

  // Scroll back to top to showcase tier board & progress bar
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(1500);

  // Screenshot: Clean Tier Board (NO buttons on cards, compact badges, progress bar 75%)
  await page.screenshot({
    path: `${ARTIFACT_DIR}/mobile-02-session-ranking.png`,
    fullPage: false,
  });

  // Screenshot: Tasting Progress & Party Readiness Card
  const progressCard = page.locator('div.rounded-2xl').filter({ hasText: 'Tasting Progress' });
  await progressCard.screenshot({
    path: `${ARTIFACT_DIR}/mobile-03-tasters-progress.png`,
  });

  // Test Dark/Light Mode Toggle
  const themeToggle = page.locator('button[aria-label="Toggle dark/light theme"]');
  await themeToggle.click();
  await page.waitForTimeout(1500);

  await page.screenshot({
    path: `${ARTIFACT_DIR}/mobile-06-theme-toggle.png`,
    fullPage: false,
  });

  // Switch back to preferred dark mode
  await themeToggle.click();
  await page.waitForTimeout(1200);

  // Rank 4th item to complete board
  const item4 = page.locator('div[role="listitem"]').filter({ hasText: 'Truffle Ghost Pepper' });
  await item4.getByRole('button', { name: /Move .* to D tier|^D$/i }).click();
  await page.waitForTimeout(1200);

  // Mark Ready (using first button)
  await page
    .locator('button')
    .filter({ hasText: /Mark as Ready/i })
    .first()
    .click();
  await page.waitForTimeout(1200);

  // Reveal Consensus
  await page.getByRole('button', { name: /Reveal Consensus/i }).click();
  await page.waitForTimeout(1500);

  // Screenshot: Mobile Consensus & Superlatives
  await page.screenshot({
    path: `${ARTIFACT_DIR}/mobile-05-consensus-superlatives.png`,
    fullPage: false,
  });

  // Gentle scroll down to show the superlatives and details
  await page.evaluate(() => window.scrollBy({ top: 350, behavior: 'smooth' }));
  await page.waitForTimeout(2000);

  await page.close();
  await context.close();
});
